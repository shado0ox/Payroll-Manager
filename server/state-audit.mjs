import crypto from 'node:crypto';

const normalizeCompanyIds = (companyIds) => [...new Set(
  (Array.isArray(companyIds) ? companyIds : []).filter(id => typeof id === 'string' && id.trim())
)];

const auditActions=new Set(['UPSERT_GOSI_ACCOUNT','ARCHIVE_GOSI_ACCOUNT','CLEAR_GOSI_EMPLOYEE_OVERRIDES','UPSERT_GOSI_ASSIGNMENT','DELETE_GOSI_EMPLOYEE_OVERRIDE','UPSERT_GOSI_DEPARTMENT_ASSIGNMENT','END_GOSI_DEPARTMENT_ASSIGNMENT','IMPORT_GOSI_INVOICE','DELETE_GOSI_INVOICE','STATE_PATCH','STATE_REPLACE','CREATE_PAYROLL_RUN','UPDATE_PAYROLL_RUN','PAYROLL_STATUS_TRANSITION','CREATE_PAYMENT_BATCH','PAYMENT_BATCH_STATUS_TRANSITION','PAYROLL_ENTITLEMENT_OFFSET','CREATE_PAYROLL_SETTLEMENT','REVERSE_PAYROLL_SETTLEMENT','UPDATE_COMPANY','CREATE_COMPANY','ARCHIVE_COMPANY','CREATE_JOURNAL','UPDATE_JOURNAL','DELETE_JOURNAL','UPDATE_QOYOD_CONFIG','CREATE_PENALTY','UPDATE_PENALTY','DELETE_PENALTY','CREATE_LOAN','UPDATE_LOAN','DELETE_LOAN','ADJUST_LOAN','CREATE_TEMPORARY_EARNING','UPDATE_TEMPORARY_EARNING','DELETE_TEMPORARY_EARNING','CREATE_ATTENDANCE','UPDATE_ATTENDANCE','DELETE_ATTENDANCE','IMPORT_ATTENDANCE','CREATE_LEAVE','UPDATE_LEAVE','LEAVE_STATUS_TRANSITION','EMPLOYEE_LEAVE_REQUEST','EMPLOYEE_LEAVE_CANCEL','EMPLOYEE_BANK_CHANGE_REQUEST','EMPLOYEE_REGISTRATION_APPROVED','EMPLOYEE_REGISTRATION_REJECTED','IMPORT_EMPLOYEES','BULK_ANNUAL_LEAVE_SETTINGS','ARCHIVE_COMPANY_EMPLOYEES','REPAIR_PAYROLL_DATA','RESOLVE_LEGACY_JOURNAL_ADJUSTMENT','CREATE_USER','UPDATE_USER','DELETE_USER','GOSI_ACCOUNT_CREATED','GOSI_ACCOUNT_UPDATED','GOSI_ACCOUNT_DELETED','GOSI_MAPPING_UPDATED','GOSI_INVOICE_IMPORTED','GOSI_INVOICE_DELETED']);

export async function appendStateAudit(client, q, { companyIds, user, action, version, entityType='APP_STATE', entityId='state', details:description='', diff }) {
  const scopedCompanyIds = normalizeCompanyIds(companyIds);
  if (!scopedCompanyIds.length) return;

  const occurredAt = new Date().toISOString();
  const userId = String(user?.id || '');
  const userName = String(user?.name || user?.username || '');
  const userRole = String(user?.role || 'OPERATIONS_MANAGER');
  const actionCode=String(action||'').split(':')[0];
  const safeAction=auditActions.has(actionCode)?actionCode:'STATE_REPLACE';
  const safeVersion = Number.isFinite(Number(version)) ? Number(version) : null;

  for (const companyId of scopedCompanyIds) {
    const id = `audit-${crypto.randomUUID()}`;
    const details = description || (safeVersion == null ? '' : `State version ${safeVersion}`);
    const payload = {
      id,
      companyId,
      userId,
      userName,
      userRole,
      action:safeAction,
      entityType,
      entityId,
      ...(diff?{diff}:{}),
      timestamp:occurredAt,
      details,
    };

    await client.query(`INSERT INTO ${q('application_audit_logs')} (
      id,company_id,user_id,user_name,user_role,action,entity_type,entity_id,occurred_at,details,payload,sort_order
    ) VALUES ($1,$2,$3,$4,$5,$6,$10,$11,$7,$8,$9::jsonb,0)`, [
      id, companyId, userId || null, userName, userRole, safeAction, occurredAt, details || null, JSON.stringify(payload), entityType, entityId,
    ]);
  }
}
