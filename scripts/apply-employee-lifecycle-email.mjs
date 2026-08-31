import fs from 'node:fs';

function patchFile(path, transform) {
  const source = fs.readFileSync(path, 'utf8');
  const next = transform(source);
  if (next !== source) fs.writeFileSync(path, next);
}

patchFile('server/index.mjs', (initial) => {
  let source = initial;

  const appStateAnchor = `  await pool.query(\`CREATE TABLE IF NOT EXISTS \${q('app_state')} (`;
  if (!source.includes(appStateAnchor)) throw new Error('HR lifecycle delivery table anchor not found');
  source = source.replace(appStateAnchor, `  await pool.query(\`CREATE TABLE IF NOT EXISTS \${q('hr_lifecycle_alert_deliveries')} (\n    event_key text PRIMARY KEY, company_id text NOT NULL, employee_id text NOT NULL, alert_type text NOT NULL,\n    due_date date, recipients jsonb NOT NULL DEFAULT '[]', sent_at timestamptz NOT NULL DEFAULT now()\n  )\`);\n  await pool.query(\`CREATE INDEX IF NOT EXISTS hr_lifecycle_alert_deliveries_company_idx\n    ON \${q('hr_lifecycle_alert_deliveries')}(company_id,sent_at DESC)\`);\n\n${appStateAnchor}`);

  const verificationAnchor = `async function sendVerificationEmail(email, code, language = 'ar') {`;
  if (!source.includes(verificationAnchor)) throw new Error('HR lifecycle email helper anchor not found');
  const helpers = String.raw`
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
    const [stateResult, usersResult] = await Promise.all([
      pool.query(\`SELECT state FROM \${q('app_state')} WHERE id=1\`),
      pool.query(\`SELECT id,name,email,role,company_ids,permissions,is_active FROM \${q('users')} WHERE is_active=true AND email<>''\`),
    ]);
    if (!stateResult.rowCount) return;
    const hydrated = await hydrateNormalizedStateData(pool, stateResult.rows[0].state);
    const alerts = buildHrLifecycleAlerts(hydrated?.employees || []);
    if (!alerts.length) return;
    const existing = await pool.query(\`SELECT event_key FROM \${q('hr_lifecycle_alert_deliveries')} WHERE event_key = ANY($1::text[])\`, [alerts.map(hrAlertEventKey)]);
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
        await pool.query(\`INSERT INTO \${q('hr_lifecycle_alert_deliveries')} (event_key,company_id,employee_id,alert_type,due_date,recipients)
          VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT (event_key) DO NOTHING\`,
          [hrAlertEventKey(alert), alert.companyId, alert.employeeId, alert.type, alert.dueDate, JSON.stringify(uniqueRecipients)]);
      }
    }
  } catch (error) {
    console.error('HR lifecycle alert scheduler failed', error?.message || error);
  } finally {
    hrAlertRunInProgress = false;
  }
}
`;
  source = source.replace(verificationAnchor, helpers + '\n' + verificationAnchor);

  const listenAnchor = `await migrate();\nconst server = app.listen(port, '0.0.0.0', () => console.log(\`Masar Payroll listening on \${port}\`));\nconst shutdown = async () => { server.close(); await pool.end(); process.exit(0); };`;
  if (!source.includes(listenAnchor)) throw new Error('HR lifecycle scheduler startup anchor not found');
  source = source.replace(listenAnchor, `await migrate();\nconst hrAlertTimer = setInterval(() => { void runHrLifecycleAlerts(); }, 6 * 60 * 60 * 1000);\nsetTimeout(() => { void runHrLifecycleAlerts(); }, 60 * 1000);\nconst server = app.listen(port, '0.0.0.0', () => console.log(\`Masar Payroll listening on \${port}\`));\nconst shutdown = async () => { clearInterval(hrAlertTimer); server.close(); await pool.end(); process.exit(0); };`);

  return source;
});

console.log('Server-side employee lifecycle email alerts applied.');
