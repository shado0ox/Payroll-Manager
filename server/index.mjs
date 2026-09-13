import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { validatePayrollCarryForwardState } from './payroll-carryforward-validation.mjs';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { createTenantScopedClient, scopeStateForCompanies } from './tenant-storage.mjs';
import { appendStateAudit } from './state-audit.mjs';
import { appendPayrollFinancialAudit } from './payroll-financial-audit.mjs';
import { reconcilePaidPayrollCarryForward, reconcileReleasedPayrollCarryForward } from './payroll-paid-carryforward.mjs';
import { createSystemRouter } from './routes/system-routes.mjs';
import { createAuthSessionRouter } from './routes/auth-session-routes.mjs';
import { createAuthLoginRouter } from './routes/auth-login-routes.mjs';
import { createAuthRegistrationRouter } from './routes/auth-registration-routes.mjs';
import { createAuthPasswordResetRouter } from './routes/auth-password-reset-routes.mjs';
import { createAdminDatabaseRouter } from './routes/admin-database-routes.mjs';
import { createEmployeeRouter } from './routes/employee-routes.mjs';
import { createAttendanceLeaveRouter } from './routes/attendance-leave-routes.mjs';
import { createLoanPenaltyRouter } from './routes/loan-penalty-routes.mjs';
import { createPayrollRouter } from './routes/payroll-routes.mjs';
import { createJournalQoyodRouter } from './routes/journal-qoyod-routes.mjs';
import { createGosiRouter } from './routes/gosi-routes.mjs';
import { createCompanyRouter } from './routes/company-routes.mjs';
import { createUserRouter } from './routes/user-routes.mjs';
import { createStateRouter } from './routes/state-routes.mjs';
import { createOperationalAlertSender, createOperationalLogger, requestContextMiddleware, startDatabaseHealthMonitor } from './operational-monitoring.mjs';
import { ALLOWED_ROLES, ALL_PERMISSIONS, DEFAULT_PERMISSIONS, allowedCompanyIds, itemCompanyId, permissionsFor, can, isDeveloperUser } from './access-control.mjs';
import { createNormalizedStateStore } from './normalized-state-store.mjs';
import { createDatabaseMigrator } from './database-migrator.mjs';
import { createPayrollWorkflowGuards } from './payroll-workflow-guards.mjs';
import { createStateAccessService } from './state-access.mjs';
import { createStateRuntime } from './state-runtime.mjs';

const { Pool } = pg;
const port = Number(process.env.PORT || 3000);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const buildId = (() => {
  try {
    const metadata = JSON.parse(fs.readFileSync(path.join(root, 'build-meta.json'), 'utf8'));
    if (metadata?.buildId) return String(metadata.buildId);
  } catch {}
  return String(process.env.APP_BUILD_ID || 'development');
})();
const schema = process.env.DB_SCHEMA || 'masar_payroll';
if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('DB_SCHEMA is invalid');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const trialDays = Math.max(1, Math.min(90, Number(process.env.TRIAL_DAYS || 14)));
const publicRegistrationEnabled = process.env.ALLOW_PUBLIC_REGISTRATION === 'true';
const developerContactPhone = String(process.env.DEVELOPER_CONTACT_PHONE || '').trim();
const resendApiKey = String(process.env.RESEND_API_KEY || '').trim();
const verificationEmailFrom = String(process.env.EMAIL_FROM || '').trim();
const operationalLogger = createOperationalLogger({ buildId });
const sendOperationalAlert = createOperationalAlertSender({
  logger:operationalLogger,
  resendApiKey,
  emailFrom:verificationEmailFrom,
  recipients:String(process.env.OPS_ALERT_EMAILS || '').split(','),
  webhookUrl:String(process.env.OPS_ALERT_WEBHOOK_URL || '').trim(),
});
const isStrongPassword = (value) => typeof value === 'string' && value.length >= 8 && value.length <= 128
  && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
if (!isStrongPassword(process.env.ADMIN_PASSWORD)) {
  throw new Error('ADMIN_PASSWORD must be 8-128 characters and include uppercase, lowercase, number, and symbol');
}
for (const key of ['ADMIN_USERNAME', 'ADMIN_NAME', 'COMPANY_ID', 'COMPANY_CODE', 'COMPANY_NAME_AR', 'COMPANY_NAME_EN']) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
});

const q = (name) => `"${schema}".${name}`;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const cookieValue = (req, key) => (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${key}=`))?.slice(key.length + 1);
const COMPANY_SCOPED_KEYS = ['employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns', 'payrollSettlements', 'journals'];
const OPERATIONS_MUTABLE_KEYS = new Set(['employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns', 'payrollSettlements']);
const clone = (value) => value == null ? value : structuredClone(value);

const workflowError = (status, code) => Object.assign(new Error(code), { status });

const asArray = value => Array.isArray(value) ? value : [];
const { sameJson,isAppendOnlyLoanAdjustment,payrollSourceLocked,validateClosedPayrollInputs,validatePayrollWorkflowChanges } = createPayrollWorkflowGuards({ can,asArray,workflowError });
const { publicStateForUser,mergeStateForUser } = createStateAccessService({
  clone,can,allowedCompanyIds,itemCompanyId,companyScopedKeys:COMPANY_SCOPED_KEYS,operationsMutableKeys:OPERATIONS_MUTABLE_KEYS,
  validateClosedPayrollInputs,validatePayrollWorkflowChanges,workflowError,
});

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'"] } } }));
app.use(express.json({ limit: '5mb' }));
app.use(requestContextMiddleware(operationalLogger));
app.use((req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    const expectedOrigin = process.env.APP_ORIGIN || `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}`;
    if (req.headers['sec-fetch-site'] === 'cross-site' || (origin && origin !== expectedOrigin)) {
      return res.status(403).json({ error: 'CROSS_SITE_REQUEST_BLOCKED' });
    }
  }
  next();
});

const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });
const registrationLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false });

const subscriptionState = (company) => {
  const now = Date.now();
  const status = String(company?.subscription_status || 'ACTIVE');
  const trialEndsAt = company?.trial_ends_at ? new Date(company.trial_ends_at) : null;
  const subscriptionEndsAt = company?.subscription_ends_at ? new Date(company.subscription_ends_at) : null;
  const expired = status === 'EXPIRED' || status === 'SUSPENDED'
    || (status === 'TRIAL' && trialEndsAt && trialEndsAt.getTime() <= now)
    || (status === 'ACTIVE' && subscriptionEndsAt && subscriptionEndsAt.getTime() <= now);
  return {
    status: expired ? 'EXPIRED' : status,
    trialEndsAt: trialEndsAt?.toISOString() || null,
    subscriptionEndsAt: subscriptionEndsAt?.toISOString() || null,
    expired,
  };
};

const {
  persistReconciledPayrollRun,
  replaceNormalizedPayrollData,
  replaceNormalizedOperationsData,
  replaceNormalizedCoreData,
  readNormalizedApplicationState,
} = createNormalizedStateStore({ q,clone,subscriptionState });
const migrate = createDatabaseMigrator({
  pool,q,schema,bcrypt,replaceNormalizedPayrollData,replaceNormalizedOperationsData,replaceNormalizedCoreData,
});
const { addStateEventClient,disconnectStateEventClients,broadcastStateUpdate,bumpStateVersion,readLockedNormalizedState } = createStateRuntime({
  q,buildId,workflowError,readNormalizedApplicationState,
});

const HR_DAY_MS = 86400000;
const hrDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(String(value) + 'T00:00:00Z');
  return Number.isNaN(date.getTime()) ? null : date;
};
const hrDaysUntil = (value, now = new Date()) => {
  const due = hrDateOnly(value);
  if (!due) return null;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.ceil((due.getTime() - today.getTime()) / HR_DAY_MS);
};
const hrAddDays = (value, days) => {
  const date = hrDateOnly(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0,10);
};
const hrEscape = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
const hrRecipientHasPermission = (user) => {
  if (!user || user.role === 'ADMIN' || !user.is_active || !String(user.email || '').trim()) return false;
  if (Array.isArray(user.permissions)) return user.permissions.includes('RECEIVE_HR_EXPIRY_EMAILS');
  return user.role === 'COMPANY_MANAGER';
};
const buildHrLifecycleAlerts = (employees, now = new Date()) => {
  const alerts = [];
  for (const employee of Array.isArray(employees) ? employees : []) {
    if (!employee?.id || !employee?.companyId || employee.status === 'TERMINATED' || employee.status === 'ABSCONDED') continue;
    const common = { companyId:employee.companyId, employeeId:employee.id, employeeNo:employee.employeeNo || '', employeeName:(employee.firstNameAr + ' ' + employee.lastNameAr).trim() };
    if (employee.nationality === 'NON_SAUDI') {
      if (employee.iqamaExpiryDate) {
        const days = hrDaysUntil(employee.iqamaExpiryDate, now);
        if (days !== null && days <= 30) alerts.push({ ...common, type:'IQAMA_EXPIRY', dueDate:employee.iqamaExpiryDate, daysRemaining:days });
      } else if (employee.entryDate && employee.iqamaIssueStatus !== 'ISSUED') {
        const dueDate = hrAddDays(employee.entryDate, 90);
        const days = dueDate ? hrDaysUntil(dueDate, now) : null;
        if (dueDate && days !== null && days <= 30) alerts.push({ ...common, type:'NEW_HIRE_ENTRY_DEADLINE', dueDate, daysRemaining:days });
      }
    }
    if (employee.nationality === 'SAUDI' && employee.contractEndDate) {
      const days = hrDaysUntil(employee.contractEndDate, now);
      if (days !== null && days <= 60) alerts.push({ ...common, type:'SAUDI_CONTRACT_EXPIRY', dueDate:employee.contractEndDate, daysRemaining:days });
    }
    if (!String(employee.bankIban || '').replace(/\s/g,'') || employee.bankAccountStatus === 'PENDING') {
      alerts.push({ ...common, type:'MISSING_BANK_ACCOUNT', dueDate:null, daysRemaining:null });
    }
  }
  return alerts;
};
const hrAlertEventKey = (alert) => [alert.companyId, alert.type, alert.employeeId, alert.dueDate || 'NO-DATE'].join(':');
let hrAlertRunInProgress = false;
async function sendHrLifecycleDigest(to, company, alerts) {
  if (!resendApiKey || !verificationEmailFrom || !to.length || !alerts.length) return false;
  const label = (alert) => alert.type === 'IQAMA_EXPIRY' ? 'انتهاء الإقامة'
    : alert.type === 'SAUDI_CONTRACT_EXPIRY' ? 'انتهاء عقد موظف سعودي'
    : alert.type === 'NEW_HIRE_ENTRY_DEADLINE' ? 'مهلة القادم الجديد'
    : 'الحساب البنكي غير مكتمل';
  const rows = alerts.map(alert => '<tr>'
    + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">' + hrEscape(alert.employeeNo) + '</td>'
    + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">' + hrEscape(alert.employeeName) + '</td>'
    + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">' + hrEscape(label(alert)) + '</td>'
    + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">' + hrEscape(alert.dueDate || '-') + '</td>'
    + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">' + hrEscape(alert.daysRemaining ?? '-') + '</td>'
    + '</tr>').join('');
  const response = await fetch('https://api.resend.com/emails', {
    method:'POST',
    headers:{ Authorization:'Bearer ' + resendApiKey, 'Content-Type':'application/json' },
    body:JSON.stringify({
      from:verificationEmailFrom,
      to,
      subject:'مسار - تنبيهات الموارد البشرية - ' + (company?.nameAr || company?.nameEn || company?.id || ''),
      html:'<div dir="rtl" style="font-family:Arial,sans-serif;max-width:760px;margin:auto;padding:24px">'
        + '<h2 style="margin:0 0 12px">تنبيهات الموارد البشرية</h2>'
        + '<p>هذه الرسالة أُرسلت للمستخدمين المصرح لهم باستقبال تنبيهات انتهاء الوثائق والقادمين الجدد.</p>'
        + '<table style="width:100%;border-collapse:collapse"><thead><tr><th>الرقم</th><th>الموظف</th><th>التنبيه</th><th>التاريخ</th><th>الأيام المتبقية</th></tr></thead><tbody>' + rows + '</tbody></table>'
        + '</div>'
    })
  });
  if (!response.ok) throw new Error('HR_ALERT_EMAIL_FAILED_' + response.status);
  return true;
}
async function runHrLifecycleAlerts() {
  if (hrAlertRunInProgress || !resendApiKey || !verificationEmailFrom) return;
  hrAlertRunInProgress = true;
  try {
    const usersResult = await pool.query(`SELECT id,name,email,role,company_ids,permissions,is_active FROM ${q('users')} WHERE is_active=true AND email<>''`);
    const hydrated = await readNormalizedApplicationState(pool);
    const alerts = buildHrLifecycleAlerts(hydrated?.employees || []);
    if (!alerts.length) return;
    const existing = await pool.query(`SELECT event_key FROM ${q('hr_lifecycle_alert_deliveries')} WHERE event_key = ANY($1::text[])`, [alerts.map(hrAlertEventKey)]);
    const alreadySent = new Set(existing.rows.map(row => row.event_key));
    const unsent = alerts.filter(alert => !alreadySent.has(hrAlertEventKey(alert)));
    if (!unsent.length) return;
    const companies = new Map((hydrated?.companies || []).map(company => [company.id, company]));
    const grouped = new Map();
    for (const alert of unsent) {
      if (!grouped.has(alert.companyId)) grouped.set(alert.companyId, []);
      grouped.get(alert.companyId).push(alert);
    }
    for (const [companyId, companyAlerts] of grouped) {
      const recipients = usersResult.rows
        .filter(user => hrRecipientHasPermission(user) && Array.isArray(user.company_ids) && user.company_ids.includes(companyId))
        .map(user => String(user.email).trim().toLowerCase());
      const uniqueRecipients = [...new Set(recipients)];
      if (!uniqueRecipients.length) continue;
      await sendHrLifecycleDigest(uniqueRecipients, companies.get(companyId), companyAlerts);
      for (const alert of companyAlerts) {
        await pool.query(`INSERT INTO ${q('hr_lifecycle_alert_deliveries')} (event_key,company_id,employee_id,alert_type,due_date,recipients)
          VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT (event_key) DO NOTHING`,
          [hrAlertEventKey(alert), alert.companyId, alert.employeeId, alert.type, alert.dueDate, JSON.stringify(uniqueRecipients)]);
      }
    }
  } catch (error) {
    console.error('HR lifecycle alert scheduler failed', error?.message || error);
  } finally {
    hrAlertRunInProgress = false;
  }
}

async function sendVerificationEmail(email, code, language = 'ar') {
  if (!resendApiKey || !verificationEmailFrom) throw Object.assign(new Error('EMAIL_SERVICE_NOT_CONFIGURED'), { status:503 });
  const isArabic = language !== 'en';
  const response = await fetch('https://api.resend.com/emails', {
    method:'POST',
    headers:{ Authorization:`Bearer ${resendApiKey}`, 'Content-Type':'application/json' },
    body:JSON.stringify({
      from:verificationEmailFrom,
      to:[email],
      subject:isArabic ? 'رمز التحقق لتجربة مسار' : 'Masar trial verification code',
      html:`<div dir="${isArabic ? 'rtl' : 'ltr'}" style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px">
        <h2>${isArabic ? 'تأكيد البريد الإلكتروني' : 'Verify your email'}</h2>
        <p>${isArabic ? 'استخدم الرمز التالي لإكمال إنشاء شركتك في مسار. الرمز صالح لمدة 15 دقيقة.' : 'Use this code to finish creating your Masar company. It expires in 15 minutes.'}</p>
        <div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#ecfdf5;padding:18px;text-align:center;border-radius:12px">${code}</div>
        <p style="color:#64748b;font-size:12px">${isArabic ? 'إذا لم تطلب التسجيل فتجاهل الرسالة.' : 'If you did not request this, ignore this email.'}</p>
      </div>`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('Resend verification email failed', response.status, detail.slice(0, 500));
    throw Object.assign(new Error('EMAIL_SEND_FAILED'), { status:502 });
  }
}

function newCompanyPayload({ id, companyCode, companyNameAr, companyNameEn, crNumber, taxNumber, phone, email, trialEndsAt }) {
  return {
    id, companyCode, nameAr:companyNameAr, nameEn:companyNameEn || companyNameAr,
    crNumber:crNumber || '', taxNumber:taxNumber || '', gosiEstablishmentNo:'',
    phone:phone || '', email, currency:'SAR', timezone:'Asia/Riyadh',
    fiscalYearStartMonth:1, payrollCutoffDay:25, payrollPaymentDay:27,
    workDaysPerMonth:30, dailyWorkHours:8, departments:[], costCenters:[], bankDefinitions:[],
    subscriptionStatus:'TRIAL', trialEndsAt,
    calculationRules:{
      dailyRateFormula:'BASE_PLUS_FIXED', hourlyRateDivisor:8, delayGracePeriodMinutes:15,
      delayCalculationMethod:'EXACT_MINUTES', absenceDayMultiplier:1, unpaidLeaveMultiplier:1,
      saudiGosiEmployeeRate:0.0975, saudiGosiEmployerRate:0.1175, saudiGosiMaxCap:45000,
      saudiGosiBaseComponents:['BASE','HOUSING'], nonSaudiGosiEmployerHazardRate:0.02,
      overtimeStandardRate:1.5, overtimeWeekendRate:2, roundingDecimals:2,
    },
    chartOfAccounts:{
      salariesExpenseAccount:'510101', housingAllowanceAccount:'510102', transportAllowanceAccount:'510103',
      overtimeExpenseAccount:'510104', otherAllowancesExpenseAccount:'510105', gosiEmployerExpenseAccount:'510106',
      salariesPayableAccount:'210101', gosiPayableAccount:'210201', employeeAdvancesAccount:'110501',
      penaltiesPayableAccount:'210501', bankAccount:'101001',
    },
  };
}

async function auth(req, res, next) {
  try {
    const token = cookieValue(req, 'masar_session');
    if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    const result = await pool.query(`SELECT u.id,u.username,u.name,u.email,u.phone,u.role,u.company_ids,u.permissions,u.is_active
      FROM ${q('sessions')} s JOIN ${q('users')} u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at > now() AND u.is_active=true`, [sha256(token)]);
    if (!result.rowCount) return res.status(401).json({ error: 'SESSION_EXPIRED' });
    await pool.query(`UPDATE ${q('sessions')} SET expires_at=now()+interval '1 hour' WHERE token_hash=$1`, [sha256(token)]);
    req.user = result.rows[0];
    if (req.user.role !== 'ADMIN') {
      const company = await pool.query(`SELECT subscription_status,trial_ends_at,subscription_ends_at
        FROM ${q('companies')} WHERE id=ANY($1::text[]) AND is_archived=false
        ORDER BY created_at LIMIT 1`, [req.user.company_ids]);
      const subscription = subscriptionState(company.rows[0]);
      req.subscription = subscription;
      const allowedWhileExpired = req.path === '/api/state' || req.path === '/api/auth/session'
        || req.path === '/api/auth/logout' || req.path === '/api/subscription/status';
      if (subscription.expired && !allowedWhileExpired) {
        return res.status(402).json({ error:'SUBSCRIPTION_EXPIRED', subscription, developerContactPhone });
      }
    }
    next();
  } catch (error) { next(error); }
}

app.use('/api', createSystemRouter({
  pool,
  buildId,
  publicRegistrationEnabled,
  resendApiKey,
  verificationEmailFrom,
  trialDays,
  developerContactPhone,
}));

app.use('/api/auth', createAuthRegistrationRouter({
  registrationLimiter,
  publicRegistrationEnabled,
  pool,
  q,
  sha256,
  isStrongPassword,
  sendVerificationEmail,
  trialDays,
  newCompanyPayload,
  companyManagerPermissions:DEFAULT_PERMISSIONS.COMPANY_MANAGER,
}));

app.use('/api/auth', createAuthPasswordResetRouter({
  loginLimiter,
  pool,
  q,
  sha256,
  isStrongPassword,
  resendApiKey,
  verificationEmailFrom,
}));

app.use('/api/auth', createAuthLoginRouter({ loginLimiter, pool, q, sha256, permissionsFor }));
app.use('/api/auth', createAuthSessionRouter({ auth, pool, q, cookieValue, sha256, permissionsFor }));

app.use('/api',createGosiRouter({ auth,writeLimiter,pool,q,can,workflowError,bumpStateVersion,appendStateAudit,broadcastStateUpdate }));

app.use('/api/admin', createAdminDatabaseRouter({
  auth,
  writeLimiter,
  pool,
  q,
  isDeveloperUser,
  asArray,
  readNormalizedApplicationState,
  readLockedNormalizedState,
  validatePayrollWorkflowChanges,
  workflowError,
  persistReconciledPayrollRun,
  appendPayrollFinancialAudit,
  bumpStateVersion,
  appendStateAudit,
  broadcastStateUpdate,
}));

const validPeriodMonth = value => typeof value === 'string' && /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(value);
const validIsoDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
};

app.use('/api', createStateRouter({
  auth,writeLimiter,pool,q,buildId,clone,permissionsFor,publicStateForUser,readNormalizedApplicationState,mergeStateForUser,
  scopeStateForCompanies,createTenantScopedClient,replaceNormalizedPayrollData,replaceNormalizedOperationsData,replaceNormalizedCoreData,
  appendPayrollFinancialAudit,appendStateAudit,broadcastStateUpdate,addStateEventClient,
}));

app.use('/api', createCompanyRouter({
  auth,writeLimiter,pool,q,can,workflowError,asArray,clone,subscriptionState,bumpStateVersion,appendStateAudit,broadcastStateUpdate,
}));

app.use('/api', createAttendanceLeaveRouter({
  auth,
  writeLimiter,
  pool,
  q,
  can,
  validPeriodMonth,
  validIsoDate,
  readLockedNormalizedState,
  asArray,
  payrollSourceLocked,
  workflowError,
  bumpStateVersion,
  appendStateAudit,
  broadcastStateUpdate,
}));


app.use('/api', createLoanPenaltyRouter({
  auth,
  writeLimiter,
  pool,
  q,
  can,
  validPeriodMonth,
  validIsoDate,
  readLockedNormalizedState,
  asArray,
  payrollSourceLocked,
  isAppendOnlyLoanAdjustment,
  workflowError,
  bumpStateVersion,
  appendStateAudit,
  broadcastStateUpdate,
}));


app.use('/api', createPayrollRouter({
  auth,
  writeLimiter,
  pool,
  q,
  can,
  asArray,
  clone,
  sameJson,
  validPeriodMonth,
  validIsoDate,
  workflowError,
  readLockedNormalizedState,
  readNormalizedApplicationState,
  validatePayrollWorkflowChanges,
  validatePayrollCarryForwardState,
  appendPayrollFinancialAudit,
  reconcilePaidPayrollCarryForward,
  reconcileReleasedPayrollCarryForward,
  bumpStateVersion,
  appendStateAudit,
  broadcastStateUpdate,
  persistReconciledPayrollRun,
}));


app.use('/api', createJournalQoyodRouter({
  auth,
  writeLimiter,
  pool,
  q,
  can,
  validPeriodMonth,
  validIsoDate,
  workflowError,
  sameJson,
  clone,
  bumpStateVersion,
  appendStateAudit,
  broadcastStateUpdate,
}));


app.use('/api', createEmployeeRouter({
  auth,
  writeLimiter,
  pool,
  q,
  can,
  validIsoDate,
  workflowError,
  bumpStateVersion,
  appendStateAudit,
  broadcastStateUpdate,
}));


app.use('/api', createUserRouter({
  auth,writeLimiter,pool,q,can,allowedRoles:ALLOWED_ROLES,allPermissions:ALL_PERMISSIONS,defaultPermissions:DEFAULT_PERMISSIONS,
  permissionsFor,isStrongPassword,workflowError,appendStateAudit,broadcastStateUpdate,disconnectStateEventClients,
}));

app.use(express.static(root, { index: false, maxAge: '1h', immutable: false }));
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(root, 'index.html'));
});
app.use((error, req, res, _next) => {
  operationalLogger('error', 'request_failed', { requestId:req.requestId,method:req.method,path:req.originalUrl?.split('?')[0],userId:req.user?.id,error });
  res.status(Number(error?.status) || 500).json({ error:Number(error?.status) < 500 ? error.message : 'INTERNAL_ERROR' });
});

await migrate();
const databaseHealthMonitor = startDatabaseHealthMonitor({
  pool,
  logger:operationalLogger,
  sendAlert:sendOperationalAlert,
  intervalMs:Number(process.env.DB_HEALTH_INTERVAL_MS || 60_000),
  failureThreshold:Number(process.env.DB_HEALTH_FAILURE_THRESHOLD || 3),
});
const hrAlertTimer = setInterval(() => { void runHrLifecycleAlerts(); }, 6 * 60 * 60 * 1000);
setTimeout(() => { void runHrLifecycleAlerts(); }, 60 * 1000);
const server = app.listen(port, '0.0.0.0', () => operationalLogger('info', 'server_started', { port }));
const shutdown = async signal => {
  operationalLogger('info', 'server_shutdown', { signal });
  databaseHealthMonitor.stop();
  clearInterval(hrAlertTimer);
  server.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
