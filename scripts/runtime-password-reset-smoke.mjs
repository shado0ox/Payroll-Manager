import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;
const baseUrl = process.env.CI_BASE_URL || 'http://127.0.0.1:3034';
const username = process.env.ADMIN_USERNAME || 'admin';
const oldPassword = process.env.ADMIN_PASSWORD || 'TestAdmin1!';
const adminEmail = process.env.ADMIN_EMAIL || 'ci-admin@example.test';
const companyCode = process.env.COMPANY_CODE || '101';
const companyId = process.env.COMPANY_ID || 'comp-1';
const schema = process.env.DB_SCHEMA || 'masar_payroll';
const newPassword = 'ResetAdmin2!';
const resetCode = '482731';

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const codeHash = (requestId,code) => sha256(`${requestId}:${code}`);

if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('DB_SCHEMA is invalid');

async function jsonRequest(path, options = {}, cookie = '') {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

const loginOld = await jsonRequest('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ companyCode, username, password: oldPassword }),
});
assert.equal(loginOld.response.status, 200, 'Old password must work before reset');
const oldCookie = (loginOld.response.headers.get('set-cookie') || '').split(';')[0];
assert.match(oldCookie, /^masar_session=/);

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
try {
  const admin = await pool.query(`SELECT id FROM "${schema}".users WHERE lower(email)=lower($1) LIMIT 1`, [adminEmail]);
  assert.equal(admin.rowCount, 1, 'Admin email must resolve to one account');
  const userId = admin.rows[0].id;

  await pool.query(`DELETE FROM "${schema}".password_reset_tokens WHERE user_id=$1`, [userId]);

  const emailLoginRequestId = 'ci-email-login-code';
  await pool.query(`INSERT INTO "${schema}".auth_email_codes
    (id,user_id,company_id,purpose,code_hash,expires_at) VALUES ($1,$2,$3,'EMAIL_LOGIN',$4,now()+interval '10 minutes')`,
  [emailLoginRequestId,userId,companyId,codeHash(emailLoginRequestId,resetCode)]);
  const emailLogin = await jsonRequest('/api/auth/email-login/verify', {
    method:'POST',body:JSON.stringify({ requestId:emailLoginRequestId,code:resetCode }),
  });
  assert.equal(emailLogin.response.status,200,'A valid company-scoped email code must create a session');
  assert.match((emailLogin.response.headers.get('set-cookie') || '').split(';')[0],/^masar_session=/);

  const duplicateUser = await jsonRequest('/api/users/ci-duplicate-email-user', {
    method: 'PUT',
    body: JSON.stringify({
      id: 'ci-duplicate-email-user',
      username: 'ci-duplicate-email-user',
      password: 'TempUser1!',
      name: 'Duplicate Email Test',
      email: adminEmail.toUpperCase(),
      phone: '',
      role: 'OPERATIONS_MANAGER',
      companyIds:[companyId],
      permissions: ['VIEW_DASHBOARD'],
      isActive: true,
    }),
  }, oldCookie);
  assert.equal(duplicateUser.response.status, 409, 'Duplicate email must be rejected');
  assert.equal(duplicateUser.body?.error, 'USER_EMAIL_EXISTS');

  const suspendedManagerEmail = 'ci-suspended-manager@example.test';
  const suspendedManager = await jsonRequest('/api/users/ci-suspended-manager', {
    method: 'PUT',
    body: JSON.stringify({
      id:'ci-suspended-manager',
      username:'ci-suspended-manager',
      password:'SuspendedUser1!',
      name:'Suspended Company Manager',
      email:suspendedManagerEmail,
      phone:'',
      role:'COMPANY_MANAGER',
      companyIds:[companyId],
      permissions:['VIEW_DASHBOARD','VIEW_REPORTS'],
      isActive:true,
    }),
  }, oldCookie);
  assert.ok([200,201].includes(suspendedManager.response.status), 'Suspended-company manager fixture must be created');
  try {
    await pool.query(`UPDATE "${schema}".companies SET subscription_status='SUSPENDED',
      subscription_suspended_at=now(),deletion_scheduled_at=now()+interval '3 months'
      WHERE id=$1`, [companyId]);
    const suspendedReset = await jsonRequest('/api/auth/password-reset/request', {
      method:'POST',
      body:JSON.stringify({ email:suspendedManagerEmail }),
    });
    assert.equal(suspendedReset.response.status, 200, 'Expired-company password reset request must remain available');
    const suspendedRequestId = 'ci-suspended-password-code';
    await pool.query(`INSERT INTO "${schema}".auth_email_codes
      (id,user_id,purpose,code_hash,expires_at) VALUES ($1,'ci-suspended-manager','PASSWORD_RESET',$2,now()+interval '10 minutes')`,
    [suspendedRequestId,codeHash(suspendedRequestId,resetCode)]);
    const suspendedVerify = await jsonRequest('/api/auth/password-reset/verify', {
      method:'POST',body:JSON.stringify({ requestId:suspendedRequestId,code:resetCode }),
    });
    assert.equal(suspendedVerify.response.status,200,'Expired-company manager must be allowed to verify the reset code');
    const suspendedToken = await pool.query(`SELECT count(*)::integer AS count FROM "${schema}".password_reset_tokens
      WHERE user_id='ci-suspended-manager' AND used_at IS NULL AND expires_at > now()`);
    assert.equal(suspendedToken.rows[0].count, 1, 'Expired-company manager must receive a reset token');
  } finally {
    await pool.query(`UPDATE "${schema}".companies SET subscription_status='ACTIVE',
      subscription_suspended_at=NULL,deletion_scheduled_at=NULL WHERE id=$1`, [companyId]);
    await pool.query(`DELETE FROM "${schema}".users WHERE id='ci-suspended-manager'`);
  }

  const resetRequestId = 'ci-admin-password-code';
  await pool.query(`INSERT INTO "${schema}".auth_email_codes
    (id,user_id,purpose,code_hash,expires_at) VALUES ($1,$2,'PASSWORD_RESET',$3,now()+interval '10 minutes')`,
  [resetRequestId,userId,codeHash(resetRequestId,resetCode)]);
  const verified = await jsonRequest('/api/auth/password-reset/verify', {
    method:'POST',body:JSON.stringify({ requestId:resetRequestId,code:resetCode }),
  });
  assert.equal(verified.response.status,200,'Valid reset code must issue a short-lived reset grant');
  assert.equal(typeof verified.body?.resetToken,'string');

  const confirmed = await jsonRequest('/api/auth/password-reset/confirm', {
    method: 'POST',
    body:JSON.stringify({ token:verified.body.resetToken,password:newPassword }),
  });
  assert.equal(confirmed.response.status, 200, 'Valid reset token must change password');
  assert.equal(confirmed.body?.ok, true);

  const oldSession = await jsonRequest('/api/auth/session', { method: 'GET' }, oldCookie);
  assert.equal(oldSession.response.status, 401, 'Existing sessions must be revoked after reset');

  const consumedToken = await pool.query(`SELECT used_at FROM "${schema}".password_reset_tokens
    WHERE token_hash=$1`, [sha256(verified.body.resetToken)]);
  assert.ok(consumedToken.rows[0]?.used_at,'Reset grant must be marked as used after changing the password');

  const changedPassword = await pool.query(`SELECT password_hash FROM "${schema}".users WHERE id=$1`, [userId]);
  assert.equal(await bcrypt.compare(oldPassword,changedPassword.rows[0].password_hash),false,'Old password must stop working after reset');

  const newLogin = await jsonRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ companyCode, username, password: newPassword }),
  });
  assert.equal(newLogin.response.status, 200, 'New password must work after reset');

  const expiredToken = 'ci-expired-password-reset-token';
  const expiredHash = sha256(expiredToken);
  await pool.query(`INSERT INTO "${schema}".password_reset_tokens (id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,now()-interval '1 minute')`, ['ci-expired-token', userId, expiredHash]);
  const expired = await jsonRequest('/api/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ token: expiredToken, password: 'ExpiredPass4!' }),
  });
  assert.equal(expired.response.status, 400, 'Expired reset token must be rejected');
  assert.equal(expired.body?.error, 'PASSWORD_RESET_TOKEN_INVALID_OR_EXPIRED');
} finally {
  await pool.end();
}

console.log('Runtime password reset smoke test passed: quick email login, suspended-company code verification, duplicate-email guard, reset, session revocation, single use, expiry, and new login.');
