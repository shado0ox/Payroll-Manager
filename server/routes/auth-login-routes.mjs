import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';

export function createAuthLoginRouter({ loginLimiter, pool, q, sha256, permissionsFor }) {
  const router = express.Router();

  router.post('/login', loginLimiter, async (req, res, next) => {
    try {
      const identifier = String(req.body?.username || req.body?.identifier || '').trim().toLowerCase();
      const companyCode = String(req.body?.companyCode || '').trim();
      const password = String(req.body?.password || '');
      let result = await pool.query(`SELECT u.*, c.id company_id,false is_portal_account FROM ${q('users')} u
        JOIN ${q('companies')} c ON c.company_code=$2 AND c.is_archived=false
        WHERE (lower(u.username)=$1 OR lower(u.email)=$1)`, [identifier, companyCode]);
      if (!result.rowCount) result = await pool.query(`SELECT p.id,p.username,p.password_hash,
        concat_ws(' ',e.first_name_ar,e.last_name_ar) name,p.email,'' phone,'EMPLOYEE' role,
        jsonb_build_array(p.company_id) company_ids,'[]'::jsonb permissions,p.employee_id,p.is_active,
        p.created_at,p.last_login,p.company_id,true is_portal_account
        FROM ${q('employee_portal_accounts')} p JOIN ${q('employees')} e ON e.id=p.employee_id
        JOIN ${q('companies')} c ON c.id=p.company_id AND c.company_code=$2 AND c.is_archived=false
        WHERE (lower(p.username)=$1 OR lower(p.email)=$1) AND e.is_archived=false`,[identifier,companyCode]);
      const user = result.rows[0];
      const valid = user && user.is_active && await bcrypt.compare(password, user.password_hash);
      const companyAllowed = valid && user.company_ids.includes(user.company_id);
      if (!companyAllowed) return res.status(401).json({ error:'INVALID_CREDENTIALS' });

      const token = crypto.randomBytes(32).toString('base64url');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM ${q('sessions')} WHERE expires_at <= now()`);
        await client.query(`INSERT INTO ${q('sessions')} (token_hash,user_id,portal_account_id,expires_at)
          VALUES ($1,$2,$3,now()+interval '1 hour')`, [sha256(token),user.is_portal_account ? null : user.id,user.is_portal_account ? user.id : null]);
        await client.query(`UPDATE ${q(user.is_portal_account ? 'employee_portal_accounts' : 'users')} SET last_login=now() WHERE id=$1`, [user.id]);
        await client.query(`INSERT INTO ${q('audit_log')} (user_id,action,ip) VALUES ($1,'LOGIN',$2)`, [user.id, req.ip]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

      res.setHeader('Set-Cookie', `masar_session=${token}; Path=/; HttpOnly; SameSite=Strict${process.env.COOKIE_SECURE === 'false' ? '' : '; Secure'}`);
      res.json({
        user: {
          id:user.id,
          username:user.username,
          name:user.name,
          email:user.email,
          phone:user.phone,
          role:user.role,
          companyIds:user.company_ids,
          employeeId:user.employee_id || undefined,
          permissions:permissionsFor(user),
          isActive:true,
          createdAt:user.created_at,
          lastLogin:new Date().toISOString(),
        },
        companyId:user.company_id,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
