import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_CODE_TTL_MINUTES = 10;
const EMAIL_CODE_MAX_ATTEMPTS = 5;

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, character => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[character]);
const createEmailCode = () => crypto.randomInt(100000,1000000).toString();
const emailCodeHash = (sha256,requestId,code) => sha256(`${requestId}:${code}`);
const matchesEmailCode = (sha256,requestId,code,storedHash) => {
  const submitted = Buffer.from(emailCodeHash(sha256,requestId,code),'hex');
  const stored = Buffer.from(String(storedHash || ''),'hex');
  return submitted.length === stored.length && crypto.timingSafeEqual(submitted,stored);
};

export function createAuthPasswordResetRouter({
  loginLimiter,pool,q,sha256,isStrongPassword,permissionsFor,resendApiKey,verificationEmailFrom,
}) {
  const router = express.Router();

  const sendAccountEmail = async ({ to,subject,html }) => {
    if (!resendApiKey || !verificationEmailFrom) return false;
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method:'POST',
        headers:{ Authorization:`Bearer ${resendApiKey}`, 'Content-Type':'application/json' },
        body:JSON.stringify({ from:verificationEmailFrom,to:[to],subject,html }),
      });
      if (!response.ok) {
        console.error('Account recovery email failed',response.status,await response.text().catch(() => ''));
        return false;
      }
      return true;
    } catch (error) {
      console.error('Account recovery email failed',error?.message || error);
      return false;
    }
  };

  const codeEmail = ({ name,code,language,purpose }) => {
    const isArabic = language !== 'en';
    const passwordReset = purpose === 'PASSWORD_RESET';
    return {
      subject:isArabic
        ? (passwordReset ? 'مسار - رمز إعادة تعيين كلمة المرور' : 'مسار - رمز الدخول السريع')
        : (passwordReset ? 'Masar - Password reset code' : 'Masar - Quick sign-in code'),
      html:`<div dir="${isArabic ? 'rtl' : 'ltr'}" style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px">
        <h2>${isArabic ? `مرحبًا ${escapeHtml(name)}` : `Hello ${escapeHtml(name)}`}</h2>
        <p>${isArabic
          ? (passwordReset ? 'استخدم الرمز التالي لإعادة تعيين كلمة المرور داخل شاشة الدخول.' : 'استخدم الرمز التالي للدخول السريع إلى مسار.')
          : (passwordReset ? 'Use this code to reset your password on the sign-in screen.' : 'Use this code to sign in quickly to Masar.')}</p>
        <div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#ecfdf5;padding:18px;text-align:center;border-radius:12px">${code}</div>
        <p style="color:#64748b;font-size:12px">${isArabic
          ? `الرمز صالح لمدة ${EMAIL_CODE_TTL_MINUTES} دقائق ولمرة واحدة فقط. لا تشاركه مع أي شخص.`
          : `The code expires in ${EMAIL_CODE_TTL_MINUTES} minutes, can be used once, and must not be shared.`}</p>
      </div>`,
    };
  };

  const createChallenge = async ({ user,companyId = null,purpose,language }) => {
    const requestId = `email-code-${crypto.randomUUID()}`;
    const code = createEmailCode();
    await pool.query(`DELETE FROM ${q('auth_email_codes')} WHERE user_id=$1 AND purpose=$2 AND used_at IS NULL`, [user.id,purpose]);
    await pool.query(`INSERT INTO ${q('auth_email_codes')}
      (id,user_id,company_id,purpose,code_hash,expires_at)
      VALUES ($1,$2,$3,$4,$5,now()+interval '${EMAIL_CODE_TTL_MINUTES} minutes')`,
    [requestId,user.id,companyId,purpose,emailCodeHash(sha256,requestId,code)]);
    const email = codeEmail({ name:user.name,code,language,purpose });
    const sent = await sendAccountEmail({ to:user.email,...email });
    if (!sent) await pool.query(`DELETE FROM ${q('auth_email_codes')} WHERE id=$1`, [requestId]);
    return requestId;
  };

  router.post('/password-reset/request',loginLimiter,async (req,res,next) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const language = req.body?.language === 'en' ? 'en' : 'ar';
      let requestId = `email-code-${crypto.randomUUID()}`;
      if (emailPattern.test(email)) {
        const result = await pool.query(`SELECT id,email,name FROM ${q('users')} WHERE lower(email)=lower($1) AND is_active=true LIMIT 1`, [email]);
        if (result.rowCount) requestId = await createChallenge({ user:result.rows[0],purpose:'PASSWORD_RESET',language });
      }
      res.json({ ok:true,message:'PASSWORD_RESET_REQUEST_ACCEPTED',requestId });
    } catch (error) { next(error); }
  });

  router.post('/password-reset/verify',loginLimiter,async (req,res,next) => {
    const client = await pool.connect();
    try {
      const requestId = String(req.body?.requestId || '');
      const code = String(req.body?.code || '').trim();
      if (!requestId || !/^\d{6}$/.test(code)) return res.status(400).json({ error:'PASSWORD_RESET_CODE_INVALID_OR_EXPIRED' });
      await client.query('BEGIN');
      const result = await client.query(`SELECT id,user_id,code_hash,attempts FROM ${q('auth_email_codes')}
        WHERE id=$1 AND purpose='PASSWORD_RESET' AND used_at IS NULL AND expires_at > now() FOR UPDATE`, [requestId]);
      const challenge = result.rows[0];
      if (!challenge || challenge.attempts >= EMAIL_CODE_MAX_ATTEMPTS || !matchesEmailCode(sha256,requestId,code,challenge.code_hash)) {
        if (challenge) await client.query(`UPDATE ${q('auth_email_codes')} SET attempts=LEAST(attempts+1,$2) WHERE id=$1`, [requestId,EMAIL_CODE_MAX_ATTEMPTS]);
        await client.query('COMMIT');
        return res.status(400).json({ error:'PASSWORD_RESET_CODE_INVALID_OR_EXPIRED' });
      }
      const token = crypto.randomBytes(32).toString('base64url');
      await client.query(`UPDATE ${q('auth_email_codes')} SET used_at=now() WHERE id=$1`, [requestId]);
      await client.query(`DELETE FROM ${q('password_reset_tokens')} WHERE user_id=$1 OR expires_at <= now() OR used_at IS NOT NULL`, [challenge.user_id]);
      await client.query(`INSERT INTO ${q('password_reset_tokens')} (id,user_id,token_hash,expires_at)
        VALUES ($1,$2,$3,now()+interval '15 minutes')`, [`reset-${crypto.randomUUID()}`,challenge.user_id,sha256(token)]);
      await client.query('COMMIT');
      res.json({ ok:true,resetToken:token });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      next(error);
    } finally { client.release(); }
  });

  router.post('/email-login/request',loginLimiter,async (req,res,next) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const companyCode = String(req.body?.companyCode || '').trim();
      const language = req.body?.language === 'en' ? 'en' : 'ar';
      let requestId = `email-code-${crypto.randomUUID()}`;
      if (emailPattern.test(email) && companyCode) {
        const result = await pool.query(`SELECT u.id,u.email,u.name,c.id company_id FROM ${q('users')} u
          JOIN ${q('companies')} c ON c.company_code=$2 AND c.is_archived=false
          WHERE lower(u.email)=lower($1) AND u.is_active=true AND u.company_ids ? c.id LIMIT 1`, [email,companyCode]);
        if (result.rowCount) requestId = await createChallenge({ user:result.rows[0],companyId:result.rows[0].company_id,purpose:'EMAIL_LOGIN',language });
      }
      res.json({ ok:true,message:'EMAIL_LOGIN_REQUEST_ACCEPTED',requestId });
    } catch (error) { next(error); }
  });

  router.post('/email-login/verify',loginLimiter,async (req,res,next) => {
    const client = await pool.connect();
    try {
      const requestId = String(req.body?.requestId || '');
      const code = String(req.body?.code || '').trim();
      if (!requestId || !/^\d{6}$/.test(code)) return res.status(401).json({ error:'EMAIL_LOGIN_CODE_INVALID_OR_EXPIRED' });
      await client.query('BEGIN');
      const result = await client.query(`SELECT ec.id,ec.code_hash,ec.attempts,u.*,c.id company_id
        FROM ${q('auth_email_codes')} ec
        JOIN ${q('users')} u ON u.id=ec.user_id AND u.is_active=true
        JOIN ${q('companies')} c ON c.id=ec.company_id AND c.is_archived=false
        WHERE ec.id=$1 AND ec.purpose='EMAIL_LOGIN' AND ec.used_at IS NULL AND ec.expires_at > now()
          AND u.company_ids ? c.id FOR UPDATE`, [requestId]);
      const user = result.rows[0];
      if (!user || user.attempts >= EMAIL_CODE_MAX_ATTEMPTS || !matchesEmailCode(sha256,requestId,code,user.code_hash)) {
        if (user) await client.query(`UPDATE ${q('auth_email_codes')} SET attempts=LEAST(attempts+1,$2) WHERE id=$1`, [requestId,EMAIL_CODE_MAX_ATTEMPTS]);
        await client.query('COMMIT');
        return res.status(401).json({ error:'EMAIL_LOGIN_CODE_INVALID_OR_EXPIRED' });
      }
      const token = crypto.randomBytes(32).toString('base64url');
      await client.query(`UPDATE ${q('auth_email_codes')} SET used_at=now() WHERE id=$1`, [requestId]);
      await client.query(`DELETE FROM ${q('sessions')} WHERE expires_at <= now()`);
      await client.query(`INSERT INTO ${q('sessions')} (token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')`, [sha256(token),user.id]);
      await client.query(`UPDATE ${q('users')} SET last_login=now() WHERE id=$1`, [user.id]);
      await client.query(`INSERT INTO ${q('audit_log')} (user_id,action,ip) VALUES ($1,'LOGIN_EMAIL_CODE',$2)`, [user.id,req.ip]);
      await client.query('COMMIT');
      res.setHeader('Set-Cookie',`masar_session=${token}; Path=/; HttpOnly; SameSite=Strict${process.env.COOKIE_SECURE === 'false' ? '' : '; Secure'}`);
      res.json({
        user:{ id:user.id,username:user.username,name:user.name,email:user.email,phone:user.phone,role:user.role,
          companyIds:user.company_ids,permissions:permissionsFor(user),isActive:true,createdAt:user.created_at,lastLogin:new Date().toISOString() },
        companyId:user.company_id,
      });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      next(error);
    } finally { client.release(); }
  });

  router.post('/username-recovery/request',loginLimiter,async (req,res,next) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const language = req.body?.language === 'en' ? 'en' : 'ar';
      const accepted = () => res.json({ ok:true,message:'USERNAME_RECOVERY_REQUEST_ACCEPTED' });
      if (!emailPattern.test(email)) return accepted();
      const result = await pool.query(`SELECT username,email,name FROM ${q('users')} WHERE lower(email)=lower($1) AND is_active=true LIMIT 1`, [email]);
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
    } catch (error) { next(error); }
  });

  router.post('/company-code-recovery/request',loginLimiter,async (req,res,next) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const language = req.body?.language === 'en' ? 'en' : 'ar';
      const accepted = () => res.json({ ok:true,message:'COMPANY_CODE_RECOVERY_REQUEST_ACCEPTED' });
      if (!emailPattern.test(email)) return accepted();
      const result = await pool.query(`SELECT u.email,u.name,c.company_code,c.name_ar,c.name_en FROM ${q('users')} u
        JOIN ${q('companies')} c ON u.company_ids ? c.id
        WHERE lower(u.email)=lower($1) AND u.is_active=true AND c.is_archived=false ORDER BY c.company_code`, [email]);
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
    } catch (error) { next(error); }
  });

  router.post('/password-reset/confirm',loginLimiter,async (req,res,next) => {
    const client = await pool.connect();
    try {
      const token = String(req.body?.token || '');
      const password = String(req.body?.password || '');
      if (!token || !isStrongPassword(password)) return res.status(400).json({ error:'INVALID_PASSWORD_RESET' });
      await client.query('BEGIN');
      const result = await client.query(`SELECT id,user_id FROM ${q('password_reset_tokens')}
        WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`, [sha256(token)]);
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error:'PASSWORD_RESET_TOKEN_INVALID_OR_EXPIRED' });
      }
      const row = result.rows[0];
      const passwordHash = await bcrypt.hash(password,12);
      await client.query(`UPDATE ${q('users')} SET password_hash=$1,updated_at=now() WHERE id=$2`, [passwordHash,row.user_id]);
      await client.query(`UPDATE ${q('password_reset_tokens')} SET used_at=now() WHERE id=$1`, [row.id]);
      await client.query(`DELETE FROM ${q('sessions')} WHERE user_id=$1`, [row.user_id]);
      await client.query(`INSERT INTO ${q('audit_log')} (user_id,action,ip) VALUES ($1,'PASSWORD_RESET',$2)`, [row.user_id,req.ip]);
      await client.query('COMMIT');
      res.json({ ok:true });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      next(error);
    } finally { client.release(); }
  });

  return router;
}
