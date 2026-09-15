import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, character => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[character]);

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

  const sendAccountEmail = async ({ to, subject, html }) => {
    if (!resendApiKey || !verificationEmailFrom) return;
    try {
      await fetch('https://api.resend.com/emails', {
        method:'POST',
        headers:{ Authorization:`Bearer ${resendApiKey}`, 'Content-Type':'application/json' },
        body:JSON.stringify({ from:verificationEmailFrom,to:[to],subject,html }),
      });
    } catch {}
  };

  router.post('/password-reset/request', loginLimiter, async (req, res, next) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const accepted = () => res.json({ ok:true, message:'PASSWORD_RESET_REQUEST_ACCEPTED' });
      if (!emailPattern.test(email)) return accepted();
      const result = await pool.query(`SELECT id,email,name FROM ${q('users')} WHERE lower(email)=lower($1) AND is_active=true LIMIT 1`, [email]);
      if (!result.rowCount) return accepted();
      const user = result.rows[0];
      const token = crypto.randomBytes(32).toString('base64url');
      const tokenHash = sha256(token);
      await pool.query(`DELETE FROM ${q('password_reset_tokens')} WHERE user_id=$1 OR expires_at <= now() OR used_at IS NOT NULL`, [user.id]);
      await pool.query(`INSERT INTO ${q('password_reset_tokens')} (id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,now()+interval '30 minutes')`, [`reset-${crypto.randomUUID()}`, user.id, tokenHash]);
      const origin = String(process.env.APP_ORIGIN || '').replace(/\/$/, '');
      const resetUrl = `${origin}/?reset_token=${encodeURIComponent(token)}`;
      if (origin) {
        await sendAccountEmail({
          to:user.email,
          subject:'Masar Payroll - Password reset',
          html:`<p>مرحبًا ${escapeHtml(user.name)}</p><p>تم طلب إعادة تعيين كلمة المرور لحسابك في مسار.</p><p><a href="${resetUrl}">إعادة تعيين كلمة المرور</a></p><p>الرابط صالح لمدة 30 دقيقة ولمرة واحدة فقط.</p>`,
        });
      }
      return accepted();
    } catch (error) {
      next(error);
    }
  });

  router.post('/username-recovery/request', loginLimiter, async (req, res, next) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const language = req.body?.language === 'en' ? 'en' : 'ar';
      const accepted = () => res.json({ ok:true, message:'USERNAME_RECOVERY_REQUEST_ACCEPTED' });
      if (!emailPattern.test(email)) return accepted();
      const result = await pool.query(`SELECT username,email,name FROM ${q('users')}
        WHERE lower(email)=lower($1) AND is_active=true LIMIT 1`, [email]);
      if (!result.rowCount) return accepted();
      const user = result.rows[0];
      await sendAccountEmail({
        to:user.email,
        subject:language === 'ar' ? 'مسار - استرجاع اسم المستخدم' : 'Masar - Username recovery',
        html:language === 'ar'
          ? `<p>مرحبًا ${escapeHtml(user.name)}</p><p>اسم المستخدم الخاص بك هو:</p><p><strong>${escapeHtml(user.username)}</strong></p>`
          : `<p>Hello ${escapeHtml(user.name)}</p><p>Your username is:</p><p><strong>${escapeHtml(user.username)}</strong></p>`,
      });
      return accepted();
    } catch (error) {
      next(error);
    }
  });

  router.post('/company-code-recovery/request', loginLimiter, async (req, res, next) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const language = req.body?.language === 'en' ? 'en' : 'ar';
      const accepted = () => res.json({ ok:true, message:'COMPANY_CODE_RECOVERY_REQUEST_ACCEPTED' });
      if (!emailPattern.test(email)) return accepted();
      const result = await pool.query(`SELECT u.email,u.name,c.company_code,c.name_ar,c.name_en FROM ${q('users')} u
        JOIN ${q('companies')} c ON u.company_ids ? c.id
        WHERE lower(u.email)=lower($1) AND u.is_active=true AND c.is_archived=false
        ORDER BY c.company_code`, [email]);
      if (!result.rowCount) return accepted();
      const user = result.rows[0];
      const companyItems = result.rows.map(company => {
        const companyName = language === 'ar' ? (company.name_ar || company.name_en) : (company.name_en || company.name_ar);
        return `<li><strong>${escapeHtml(company.company_code)}</strong>${companyName ? ` — ${escapeHtml(companyName)}` : ''}</li>`;
      }).join('');
      await sendAccountEmail({
        to:user.email,
        subject:language === 'ar' ? 'مسار - استرجاع رمز المنشأة' : 'Masar - Company code recovery',
        html:language === 'ar'
          ? `<p>مرحبًا ${escapeHtml(user.name)}</p><p>رموز المنشآت المتاحة لحسابك:</p><ul>${companyItems}</ul>`
          : `<p>Hello ${escapeHtml(user.name)}</p><p>Company codes available to your account:</p><ul>${companyItems}</ul>`,
      });
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
