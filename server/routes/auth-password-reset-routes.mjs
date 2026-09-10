import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';

export function createAuthPasswordResetRouter({
  loginLimiter,
  pool,
  q,
  sha256,
  isStrongPassword,
  resendApiKey,
  verificationEmailFrom,
}) {
  const router = express.Router();

  router.post('/password-reset/request', loginLimiter, async (req, res, next) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const accepted = () => res.json({ ok:true, message:'PASSWORD_RESET_REQUEST_ACCEPTED' });
      if (!email || !email.includes('@')) return accepted();
      const result = await pool.query(`SELECT id,email,name FROM ${q('users')} WHERE lower(email)=lower($1) AND is_active=true LIMIT 1`, [email]);
      if (!result.rowCount) return accepted();
      const user = result.rows[0];
      const token = crypto.randomBytes(32).toString('base64url');
      const tokenHash = sha256(token);
      await pool.query(`DELETE FROM ${q('password_reset_tokens')} WHERE user_id=$1 OR expires_at <= now() OR used_at IS NOT NULL`, [user.id]);
      await pool.query(`INSERT INTO ${q('password_reset_tokens')} (id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,now()+interval '30 minutes')`, [`reset-${crypto.randomUUID()}`, user.id, tokenHash]);
      const origin = String(process.env.APP_ORIGIN || '').replace(/\/$/, '');
      const resetUrl = `${origin}/?reset_token=${encodeURIComponent(token)}`;
      if (resendApiKey && verificationEmailFrom && origin) {
        try {
          await fetch('https://api.resend.com/emails', {
            method:'POST',
            headers:{ Authorization:`Bearer ${resendApiKey}`, 'Content-Type':'application/json' },
            body:JSON.stringify({
              from:verificationEmailFrom,
              to:[user.email],
              subject:'Masar Payroll - Password reset',
              html:`<p>مرحبًا ${String(user.name || '').replace(/[<>&"']/g,'')}</p><p>تم طلب إعادة تعيين كلمة المرور لحسابك في مسار.</p><p><a href="${resetUrl}">إعادة تعيين كلمة المرور</a></p><p>الرابط صالح لمدة 30 دقيقة ولمرة واحدة فقط.</p>`,
            }),
          });
        } catch {}
      }
      return accepted();
    } catch (error) {
      next(error);
    }
  });

  router.post('/password-reset/confirm', loginLimiter, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const token = String(req.body?.token || '');
      const password = String(req.body?.password || '');
      if (!token || !isStrongPassword(password)) return res.status(400).json({ error:'INVALID_PASSWORD_RESET' });
      await client.query('BEGIN');
      const result = await client.query(`SELECT id,user_id FROM ${q('password_reset_tokens')} WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`, [sha256(token)]);
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error:'PASSWORD_RESET_TOKEN_INVALID_OR_EXPIRED' });
      }
      const row = result.rows[0];
      const passwordHash = await bcrypt.hash(password, 12);
      await client.query(`UPDATE ${q('users')} SET password_hash=$1,updated_at=now() WHERE id=$2`, [passwordHash,row.user_id]);
      await client.query(`UPDATE ${q('password_reset_tokens')} SET used_at=now() WHERE id=$1`, [row.id]);
      await client.query(`DELETE FROM ${q('sessions')} WHERE user_id=$1`, [row.user_id]);
      await client.query('COMMIT');
      res.json({ ok:true });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      next(error);
    } finally {
      client.release();
    }
  });

  return router;
}
