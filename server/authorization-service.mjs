export function subscriptionState(company, now = Date.now()) {
  const status = String(company?.subscription_status || 'ACTIVE');
  const trialEndsAt = company?.trial_ends_at ? new Date(company.trial_ends_at) : null;
  const subscriptionEndsAt = company?.subscription_ends_at ? new Date(company.subscription_ends_at) : null;
  const suspendedAt = company?.subscription_suspended_at ? new Date(company.subscription_suspended_at) : null;
  const deletionScheduledAt = company?.deletion_scheduled_at ? new Date(company.deletion_scheduled_at) : null;
  const expired = status === 'EXPIRED' || status === 'SUSPENDED'
    || (status === 'TRIAL' && trialEndsAt && trialEndsAt.getTime() <= now)
    || (status === 'ACTIVE' && subscriptionEndsAt && subscriptionEndsAt.getTime() <= now);
  return {
    status: expired ? 'SUSPENDED' : status,
    trialEndsAt: trialEndsAt?.toISOString() || null,
    subscriptionEndsAt: subscriptionEndsAt?.toISOString() || null,
    suspendedAt:suspendedAt?.toISOString() || null,
    deletionScheduledAt:deletionScheduledAt?.toISOString() || null,
    expired,
    readOnly:expired,
    deletionDue:Boolean(expired && deletionScheduledAt && deletionScheduledAt.getTime() <= now),
  };
}

export function createAuthorizationService({ pool,q,cookieValue,sha256,developerContactPhone }) {
  async function auth(req, res, next) {
    try {
      const token = cookieValue(req, 'masar_session');
      if (!token) return res.status(401).json({ error:'AUTH_REQUIRED' });
      const tokenHash = sha256(token);
      const result = await pool.query(`SELECT u.id,u.username,u.name,u.email,u.phone,u.role,u.company_ids,u.permissions,u.employee_id,u.is_active FROM (SELECT
          COALESCE(admin_user.id,p.id) id,COALESCE(admin_user.username,p.username) username,
          COALESCE(admin_user.name,concat_ws(' ',e.first_name_ar,e.last_name_ar)) name,
          COALESCE(admin_user.email,p.email) email,COALESCE(admin_user.phone,'') phone,
          CASE WHEN p.id IS NOT NULL THEN 'EMPLOYEE' ELSE admin_user.role END role,
          CASE WHEN p.id IS NOT NULL THEN jsonb_build_array(p.company_id) ELSE admin_user.company_ids END company_ids,
          CASE WHEN p.id IS NOT NULL THEN '[]'::jsonb ELSE admin_user.permissions END permissions,
          COALESCE(p.employee_id,admin_user.employee_id) employee_id,COALESCE(p.is_active,admin_user.is_active) is_active
        FROM ${q('sessions')} s
        LEFT JOIN ${q('users')} admin_user ON admin_user.id=s.user_id
        LEFT JOIN ${q('employee_portal_accounts')} p ON p.id=s.portal_account_id
        LEFT JOIN ${q('employees')} e ON e.id=p.employee_id
        WHERE s.token_hash=$1 AND s.expires_at > now() AND COALESCE(p.is_active,admin_user.is_active)=true) u`, [tokenHash]);
      if (!result.rowCount) return res.status(401).json({ error:'SESSION_EXPIRED' });
      await pool.query(`UPDATE ${q('sessions')} SET expires_at=now()+interval '1 hour' WHERE token_hash=$1`, [tokenHash]);
      req.user = result.rows[0];
      const requestPath = String(req.originalUrl || req.path || '').split('?')[0];
      const employeePortalPath = requestPath === '/api/employee-portal/me'
        || requestPath === '/api/employee-portal/payslips'
        || requestPath === '/api/employee-portal/attendance'
        || requestPath === '/api/employee-portal/leaves'
        || requestPath === '/api/employee-portal/bank-change-requests'
        || /^\/api\/employee-portal\/leaves\/[^/]+$/.test(requestPath)
        || /^\/api\/employee-portal\/payslips\/[^/]+\/\d{4}-(0[1-9]|1[0-2])$/.test(requestPath);
      if (req.user.role === 'EMPLOYEE'
        && !requestPath.startsWith('/api/auth/')
        && !employeePortalPath) {
        return res.status(403).json({ error:'EMPLOYEE_PORTAL_ONLY' });
      }
      if (req.user.role !== 'ADMIN') {
        const company = await pool.query(`SELECT subscription_status,trial_ends_at,subscription_ends_at,
          subscription_suspended_at,deletion_scheduled_at
          FROM ${q('companies')} WHERE id=ANY($1::text[]) AND is_archived=false
          ORDER BY created_at LIMIT 1`, [req.user.company_ids]);
        const subscription = subscriptionState(company.rows[0]);
        req.subscription = subscription;
        const readOnlyMethod = ['GET','HEAD','OPTIONS'].includes(String(req.method || 'GET').toUpperCase());
        const allowedWhileExpired = readOnlyMethod || requestPath === '/api/auth/logout';
        if (subscription.expired && !allowedWhileExpired) {
          return res.status(402).json({ error:'SUBSCRIPTION_READ_ONLY', subscription, developerContactPhone });
        }
      }
      next();
    } catch (error) { next(error); }
  }

  return { auth };
}
