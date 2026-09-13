import express from 'express';
import bcrypt from 'bcryptjs';

export function createUserRouter({ auth,writeLimiter,pool,q,can,allowedRoles,allPermissions,defaultPermissions,permissionsFor,isStrongPassword,workflowError,appendStateAudit,broadcastStateUpdate,disconnectStateEventClients }) {
  const router = express.Router();

  router.put('/users/:id', auth, writeLimiter, async (req, res, next) => {
    let client;
    try {
      if (!can(req.user, 'MANAGE_USERS')) return res.status(403).json({ error:'FORBIDDEN' });
      if (req.params.id === 'user-admin') return res.status(403).json({ error:'SYSTEM_ADMIN_IMMUTABLE' });
      const u = req.body || {};
      if (!u.username || !u.name || !u.role || !Array.isArray(u.companyIds)) return res.status(400).json({ error:'INVALID_USER' });
      if (!allowedRoles.has(u.role) || u.role === 'ADMIN') return res.status(400).json({ error:'INVALID_ROLE' });
      if (req.user.role === 'ADMIN' && u.companyIds.some(id => !req.user.company_ids.includes(id))) return res.status(403).json({ error:'TENANT_DATA_IS_PRIVATE' });
      const permissions = Array.isArray(u.permissions) ? [...new Set(u.permissions)].filter(value => allPermissions.has(value) && value !== 'MANAGE_COMPANIES') : defaultPermissions[u.role];
      if (req.user.role !== 'ADMIN' && (u.role !== 'OPERATIONS_MANAGER' || u.companyIds.some(id => !req.user.company_ids.includes(id)))) return res.status(403).json({ error:'FORBIDDEN' });
      if (req.user.role !== 'ADMIN' && permissions.some(permission => !permissionsFor(req.user).includes(permission))) return res.status(403).json({ error:'CANNOT_GRANT_UNOWNED_PERMISSION' });
      const normalizedEmail = String(u.email || '').trim().toLowerCase();
      client = await pool.connect();
      await client.query('BEGIN');
      if (normalizedEmail) {
        const duplicateEmail = await client.query(`SELECT id FROM ${q('users')} WHERE lower(email)=lower($1) AND id<>$2 LIMIT 1`, [normalizedEmail, req.params.id]);
        if (duplicateEmail.rowCount) throw workflowError(409,'USER_EMAIL_EXISTS');
      }
      const existing = await client.query(`SELECT id,password_hash,company_ids,role FROM ${q('users')} WHERE id=$1 FOR UPDATE`, [req.params.id]);
      if (existing.rowCount) {
        const existingCompanyIds = Array.isArray(existing.rows[0].company_ids) ? existing.rows[0].company_ids : [];
        const targetOutsideScope = existingCompanyIds.some(id => !req.user.company_ids.includes(id));
        if (targetOutsideScope || (req.user.role !== 'ADMIN' && existing.rows[0].role !== 'OPERATIONS_MANAGER')) throw workflowError(403,'FORBIDDEN');
      }
      if ((!existing.rowCount || u.password) && !isStrongPassword(u.password)) throw workflowError(400,'PASSWORD_POLICY_FAILED');
      const passwordHash = u.password ? await bcrypt.hash(u.password, 12) : existing.rows[0]?.password_hash;
      const r = await client.query(`INSERT INTO ${q('users')} (id,username,password_hash,name,email,phone,role,company_ids,permissions,is_active)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10)
        ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username,password_hash=EXCLUDED.password_hash,name=EXCLUDED.name,
        email=EXCLUDED.email,phone=EXCLUDED.phone,role=EXCLUDED.role,company_ids=EXCLUDED.company_ids,permissions=EXCLUDED.permissions,is_active=EXCLUDED.is_active,updated_at=now()
        RETURNING id,username,name,email,phone,role,company_ids,permissions,is_active,created_at,last_login`, [
        req.params.id, String(u.username).toLowerCase(), passwordHash, u.name, normalizedEmail, u.phone || '', u.role, JSON.stringify(u.companyIds), JSON.stringify(permissions), u.isActive !== false
      ]);
      const row = r.rows[0];
      const record = { id:row.id,username:row.username,name:row.name,email:row.email,phone:row.phone,role:row.role,companyIds:row.company_ids,permissions:row.permissions,isActive:row.is_active,createdAt:row.created_at,lastLogin:row.last_login };
      const updated = await client.query(`UPDATE ${q('app_state')} SET version=version+1,updated_by=$1,updated_at=now() WHERE id=1 RETURNING version,updated_at`, [req.user.id]);
      if (!updated.rowCount) throw workflowError(409,'STATE_NOT_INITIALIZED');
      await appendStateAudit(client,q,{ companyIds:record.companyIds,user:req.user,action:'STATE_PATCH',version:updated.rows[0].version });
      await client.query(`INSERT INTO ${q('audit_log')} (user_id,action,ip) VALUES ($1,$2,$3)`, [req.user.id,`${existing.rowCount ? 'UPDATE_USER' : 'CREATE_USER'}:${record.id}`,req.ip]);
      await client.query('COMMIT');
      broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
      disconnectStateEventClients(record.id);
      res.json({ record,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
    } catch (e) {
      if (client) { try { await client.query('ROLLBACK'); } catch {} }
      if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
      if (e?.code === '23505') return res.status(409).json({ error:String(e.constraint || '').includes('email') ? 'USER_EMAIL_EXISTS' : 'USERNAME_EXISTS' });
      next(e);
    } finally { client?.release(); }
  });

  router.delete('/users/:id', auth, writeLimiter, async (req, res, next) => {
    let client;
    try {
      if (!can(req.user, 'MANAGE_USERS')) return res.status(403).json({ error:'FORBIDDEN' });
      if (req.params.id === 'user-admin') return res.status(403).json({ error:'SYSTEM_ADMIN_IMMUTABLE' });
      if (req.user.id === req.params.id) return res.status(400).json({ error:'CANNOT_DELETE_SELF' });
      const params = [req.params.id,JSON.stringify(req.user.company_ids)];
      const scope = ` AND company_ids <@ $2::jsonb${req.user.role !== 'ADMIN' ? " AND role='OPERATIONS_MANAGER'" : ''}`;
      client = await pool.connect();
      await client.query('BEGIN');
      const deleted = await client.query(`DELETE FROM ${q('users')} WHERE id=$1${scope} RETURNING id,name,company_ids`, params);
      if (!deleted.rowCount) throw workflowError(404,'USER_NOT_FOUND');
      const row = deleted.rows[0];
      const updated = await client.query(`UPDATE ${q('app_state')} SET version=version+1,updated_by=$1,updated_at=now() WHERE id=1 RETURNING version,updated_at`, [req.user.id]);
      if (!updated.rowCount) throw workflowError(409,'STATE_NOT_INITIALIZED');
      await appendStateAudit(client,q,{ companyIds:row.company_ids,user:req.user,action:'STATE_PATCH',version:updated.rows[0].version });
      await client.query(`INSERT INTO ${q('audit_log')} (user_id,action,ip) VALUES ($1,$2,$3)`, [req.user.id,`DELETE_USER:${row.id}`,req.ip]);
      await client.query('COMMIT');
      broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
      disconnectStateEventClients(row.id);
      res.json({ deleted:true,id:row.id,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
    } catch (e) {
      if (client) { try { await client.query('ROLLBACK'); } catch {} }
      if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
      next(e);
    } finally { client?.release(); }
  });

  return router;
}
