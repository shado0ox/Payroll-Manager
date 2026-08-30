const normalizeCompanyIds = (companyIds) => [...new Set(
  (Array.isArray(companyIds) ? companyIds : []).filter(id => typeof id === 'string' && id.trim())
)];

export async function appendStateAudit(client, q, { companyIds, user, action, version }) {
  const scopedCompanyIds = normalizeCompanyIds(companyIds);
  if (!scopedCompanyIds.length) return;

  const occurredAt = new Date().toISOString();
  const userId = String(user?.id || '');
  const userName = String(user?.name || user?.username || '');
  const userRole = String(user?.role || 'OPERATIONS_MANAGER');
  const safeAction = action === 'STATE_PATCH' ? 'STATE_PATCH' : 'STATE_REPLACE';
  const safeVersion = Number.isFinite(Number(version)) ? Number(version) : null;

  for (const companyId of scopedCompanyIds) {
    const id = `audit-${crypto.randomUUID()}`;
    const details = safeVersion == null ? '' : `State version ${safeVersion}`;
    const payload = {
      id,
      companyId,
      userId,
      userName,
      userRole,
      action:safeAction,
      entityType:'APP_STATE',
      entityId:'state',
      timestamp:occurredAt,
      details,
    };

    await client.query(`INSERT INTO ${q('application_audit_logs')} (
      id,company_id,user_id,user_name,user_role,action,entity_type,entity_id,occurred_at,details,payload,sort_order
    ) VALUES ($1,$2,$3,$4,$5,$6,'APP_STATE','state',$7,$8,$9::jsonb,0)`, [
      id, companyId, userId || null, userName, userRole, safeAction, occurredAt, details || null, JSON.stringify(payload),
    ]);
  }
}
