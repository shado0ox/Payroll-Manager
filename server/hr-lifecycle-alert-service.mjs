const HR_DAY_MS = 86400000;

const dateOnly = value => {
  if (!value) return null;
  const date = new Date(String(value) + 'T00:00:00Z');
  return Number.isNaN(date.getTime()) ? null : date;
};

const daysUntil = (value, now = new Date()) => {
  const due = dateOnly(value);
  if (!due) return null;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.ceil((due.getTime() - today.getTime()) / HR_DAY_MS);
};

const addDays = (value, days) => {
  const date = dateOnly(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&':'&amp;',
  '<':'&lt;',
  '>':'&gt;',
  '"':'&quot;',
  "'":'&#39;',
}[character]));

export const hrRecipientHasPermission = user => {
  if (!user || user.role === 'ADMIN' || !user.is_active || !String(user.email || '').trim()) return false;
  if (Array.isArray(user.permissions)) return user.permissions.includes('RECEIVE_HR_EXPIRY_EMAILS');
  return user.role === 'COMPANY_MANAGER';
};

export const buildHrLifecycleAlerts = (employees, now = new Date()) => {
  const alerts = [];
  for (const employee of Array.isArray(employees) ? employees : []) {
    if (!employee?.id || !employee?.companyId || employee.status === 'TERMINATED' || employee.status === 'ABSCONDED') continue;
    const common = {
      companyId:employee.companyId,
      employeeId:employee.id,
      employeeNo:employee.employeeNo || '',
      employeeName:(employee.firstNameAr + ' ' + employee.lastNameAr).trim(),
    };
    if (employee.nationality === 'NON_SAUDI') {
      if (employee.iqamaExpiryDate) {
        const remainingDays = daysUntil(employee.iqamaExpiryDate, now);
        if (remainingDays !== null && remainingDays <= 30) {
          alerts.push({ ...common, type:'IQAMA_EXPIRY', dueDate:employee.iqamaExpiryDate, daysRemaining:remainingDays });
        }
      } else if (employee.entryDate && employee.iqamaIssueStatus !== 'ISSUED') {
        const dueDate = addDays(employee.entryDate, 90);
        const remainingDays = dueDate ? daysUntil(dueDate, now) : null;
        if (dueDate && remainingDays !== null && remainingDays <= 30) {
          alerts.push({ ...common, type:'NEW_HIRE_ENTRY_DEADLINE', dueDate, daysRemaining:remainingDays });
        }
      }
    }
    if (employee.nationality === 'SAUDI' && employee.contractEndDate) {
      const remainingDays = daysUntil(employee.contractEndDate, now);
      if (remainingDays !== null && remainingDays <= 60) {
        alerts.push({ ...common, type:'SAUDI_CONTRACT_EXPIRY', dueDate:employee.contractEndDate, daysRemaining:remainingDays });
      }
    }
    if (!String(employee.bankIban || '').replace(/\s/g, '') || employee.bankAccountStatus === 'PENDING') {
      alerts.push({ ...common, type:'MISSING_BANK_ACCOUNT', dueDate:null, daysRemaining:null });
    }
  }
  return alerts;
};

const alertEventKey = alert => [
  alert.companyId,
  alert.type,
  alert.employeeId,
  alert.dueDate || 'NO-DATE',
].join(':');

export function createHrLifecycleAlertService({
  pool,
  q,
  readNormalizedApplicationState,
  resendApiKey,
  emailFrom,
  fetchImpl = fetch,
  logger = console,
}) {
  let runInProgress = false;

  const sendDigest = async (to, company, alerts) => {
    if (!resendApiKey || !emailFrom || !to.length || !alerts.length) return false;
    const label = alert => alert.type === 'IQAMA_EXPIRY' ? 'انتهاء الإقامة'
      : alert.type === 'SAUDI_CONTRACT_EXPIRY' ? 'انتهاء عقد موظف سعودي'
      : alert.type === 'NEW_HIRE_ENTRY_DEADLINE' ? 'مهلة القادم الجديد'
      : 'الحساب البنكي غير مكتمل';
    const rows = alerts.map(alert => '<tr>'
      + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">' + escapeHtml(alert.employeeNo) + '</td>'
      + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">' + escapeHtml(alert.employeeName) + '</td>'
      + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">' + escapeHtml(label(alert)) + '</td>'
      + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">' + escapeHtml(alert.dueDate || '-') + '</td>'
      + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">' + escapeHtml(alert.daysRemaining ?? '-') + '</td>'
      + '</tr>').join('');
    const response = await fetchImpl('https://api.resend.com/emails', {
      method:'POST',
      headers:{ Authorization:'Bearer ' + resendApiKey, 'Content-Type':'application/json' },
      body:JSON.stringify({
        from:emailFrom,
        to,
        subject:'مسار - تنبيهات الموارد البشرية - ' + (company?.nameAr || company?.nameEn || company?.id || ''),
        html:'<div dir="rtl" style="font-family:Arial,sans-serif;max-width:760px;margin:auto;padding:24px">'
          + '<h2 style="margin:0 0 12px">تنبيهات الموارد البشرية</h2>'
          + '<p>هذه الرسالة أُرسلت للمستخدمين المصرح لهم باستقبال تنبيهات انتهاء الوثائق والقادمين الجدد.</p>'
          + '<table style="width:100%;border-collapse:collapse"><thead><tr><th>الرقم</th><th>الموظف</th><th>التنبيه</th><th>التاريخ</th><th>الأيام المتبقية</th></tr></thead><tbody>' + rows + '</tbody></table>'
          + '</div>',
      }),
    });
    if (!response.ok) throw new Error('HR_ALERT_EMAIL_FAILED_' + response.status);
    return true;
  };

  const run = async () => {
    if (runInProgress || !resendApiKey || !emailFrom) return;
    runInProgress = true;
    try {
      const usersResult = await pool.query(`SELECT id,name,email,role,company_ids,permissions,is_active FROM ${q('users')} WHERE is_active=true AND email<>''`);
      const hydrated = await readNormalizedApplicationState(pool);
      const alerts = buildHrLifecycleAlerts(hydrated?.employees || []);
      if (!alerts.length) return;
      const existing = await pool.query(
        `SELECT event_key FROM ${q('hr_lifecycle_alert_deliveries')} WHERE event_key = ANY($1::text[])`,
        [alerts.map(alertEventKey)],
      );
      const alreadySent = new Set(existing.rows.map(row => row.event_key));
      const unsent = alerts.filter(alert => !alreadySent.has(alertEventKey(alert)));
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
        await sendDigest(uniqueRecipients, companies.get(companyId), companyAlerts);
        for (const alert of companyAlerts) {
          await pool.query(
            `INSERT INTO ${q('hr_lifecycle_alert_deliveries')} (event_key,company_id,employee_id,alert_type,due_date,recipients)
              VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT (event_key) DO NOTHING`,
            [alertEventKey(alert), alert.companyId, alert.employeeId, alert.type, alert.dueDate, JSON.stringify(uniqueRecipients)],
          );
        }
      }
    } catch (error) {
      logger.error('HR lifecycle alert scheduler failed', error?.message || error);
    } finally {
      runInProgress = false;
    }
  };

  return { run };
}
