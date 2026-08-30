import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const baseUrl = process.env.CI_BASE_URL || 'http://127.0.0.1:3034';
const username = process.env.ADMIN_USERNAME || 'admin';
const oldPassword = process.env.ADMIN_PASSWORD || 'TestAdmin1!';
const adminEmail = process.env.ADMIN_EMAIL || 'ci-admin@example.test';
const companyCode = process.env.COMPANY_CODE || '101';
const schema = process.env.DB_SCHEMA || 'masar_payroll';
const newPassword = 'ResetAdmin2!';
const knownToken = 'ci-known-password-reset-token';

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

const unknown = await jsonRequest('/api/auth/password-reset/request', {
  method: 'POST',
  body: JSON.stringify({ email: 'missing-user@example.test' }),
});
assert.equal(unknown.response.status, 200);
assert.equal(unknown.body?.message, 'PASSWORD_RESET_REQUEST_ACCEPTED');

const known = await jsonRequest('/api/auth/password-reset/request', {
  method: 'POST',
  body: JSON.stringify({ email: adminEmail }),
});
assert.equal(known.response.status, 200);
assert.equal(known.body?.message, 'PASSWORD_RESET_REQUEST_ACCEPTED');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
try {
  const admin = await pool.query(`SELECT id FROM "${schema}".users WHERE lower(email)=lower($1) LIMIT 1`, [adminEmail]);
  assert.equal(admin.rowCount, 1, 'Admin email must resolve to one account');
  const userId = admin.rows[0].id;

  const generated = await pool.query(`SELECT count(*)::integer AS count FROM "${schema}".password_reset_tokens WHERE user_id=$1 AND used_at IS NULL AND expires_at > now()`, [userId]);
  assert.equal(generated.rows[0].count, 1, 'Reset request must create one active token');

  await pool.query(`DELETE FROM "${schema}".password_reset_tokens WHERE user_id=$1`, [userId]);
  const hash = crypto.createHash('sha256').update(knownToken).digest('hex');
  await pool.query(`INSERT INTO "${schema}".password_reset_tokens (id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,now()+interval '30 minutes')`, ['ci-reset-token', userId, hash]);

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
      companyIds: [process.env.COMPANY_ID || 'comp-1'],
      permissions: ['VIEW_DASHBOARD'],
      isActive: true,
    }),
  }, oldCookie);
  assert.equal(duplicateUser.response.status, 409, 'Duplicate email must be rejected');
  assert.equal(duplicateUser.body?.error, 'USER_EMAIL_EXISTS');

  const confirmed = await jsonRequest('/api/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ token: knownToken, password: newPassword }),
  });
  assert.equal(confirmed.response.status, 200, 'Valid reset token must change password');
  assert.equal(confirmed.body?.ok, true);

  const oldSession = await jsonRequest('/api/auth/session', { method: 'GET' }, oldCookie);
  assert.equal(oldSession.response.status, 401, 'Existing sessions must be revoked after reset');

  const reused = await jsonRequest('/api/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ token: knownToken, password: 'AnotherPass3!' }),
  });
  assert.equal(reused.response.status, 400, 'Reset token must be single-use');
  assert.equal(reused.body?.error, 'PASSWORD_RESET_TOKEN_INVALID_OR_EXPIRED');

  const oldLoginAfterReset = await jsonRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ companyCode, username, password: oldPassword }),
  });
  assert.equal(oldLoginAfterReset.response.status, 401, 'Old password must stop working after reset');

  const newLogin = await jsonRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ companyCode, username, password: newPassword }),
  });
  assert.equal(newLogin.response.status, 200, 'New password must work after reset');

  const expiredToken = 'ci-expired-password-reset-token';
  const expiredHash = crypto.createHash('sha256').update(expiredToken).digest('hex');
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

console.log('Runtime password reset smoke test passed: generic request, token creation, duplicate-email guard, reset, session revocation, single use, expiry, and new login.');
