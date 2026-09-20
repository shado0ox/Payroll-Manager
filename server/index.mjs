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
import { createEmployeePortalRouter } from './routes/employee-portal-routes.mjs';
import { createStateRouter } from './routes/state-routes.mjs';
import { createOperationalAlertSender, createOperationalLogger, requestContextMiddleware, startDatabaseHealthMonitor } from './operational-monitoring.mjs';
import { ALLOWED_ROLES, ALL_PERMISSIONS, DEFAULT_PERMISSIONS, allowedCompanyIds, itemCompanyId, permissionsFor, can, isDeveloperUser } from './access-control.mjs';
import { createNormalizedStateStore } from './normalized-state-store.mjs';
import { createDatabaseMigrator } from './database-migrator.mjs';
import { createPayrollWorkflowGuards } from './payroll-workflow-guards.mjs';
import { createStateAccessService } from './state-access.mjs';
import { createStateRuntime } from './state-runtime.mjs';
import { createAuthorizationService, subscriptionState } from './authorization-service.mjs';
import { createHrLifecycleAlertService } from './hr-lifecycle-alert-service.mjs';
import { createSubscriptionLifecycleService } from './subscription-lifecycle-service.mjs';

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
  asArray,sameJson,validateClosedPayrollInputs,validatePayrollWorkflowChanges,validatePayrollCarryForwardState,workflowError,
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
const { run:runHrLifecycleAlerts } = createHrLifecycleAlertService({
  pool,q,readNormalizedApplicationState,resendApiKey,emailFrom:verificationEmailFrom,
});
const { run:runSubscriptionLifecycle } = createSubscriptionLifecycleService({
  pool,q,resendApiKey,emailFrom:verificationEmailFrom,developerContactPhone,
  onStateChanged:async () => {
    const updated = await bumpStateVersion(pool, null);
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:null,updatedAt:updated.rows[0].updated_at });
  },
});

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

const { auth } = createAuthorizationService({ pool,q,cookieValue,sha256,developerContactPhone });

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
  permissionsFor,
  resendApiKey,
  verificationEmailFrom,
}));

app.use('/api/auth', createAuthLoginRouter({ loginLimiter, pool, q, sha256, permissionsFor }));
app.use('/api/auth', createAuthSessionRouter({ auth, pool, q, cookieValue, sha256, permissionsFor }));

app.use('/api', createEmployeePortalRouter({ auth,writeLimiter,pool,q,bumpStateVersion,appendStateAudit,broadcastStateUpdate }));

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
const subscriptionLifecycleTimer = setInterval(() => { void runSubscriptionLifecycle(); }, 6 * 60 * 60 * 1000);
setTimeout(() => { void runSubscriptionLifecycle(); }, 10 * 1000);
const server = app.listen(port, '0.0.0.0', () => operationalLogger('info', 'server_started', { port }));
const shutdown = async signal => {
  operationalLogger('info', 'server_shutdown', { signal });
  databaseHealthMonitor.stop();
  clearInterval(hrAlertTimer);
  clearInterval(subscriptionLifecycleTimer);
  server.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
