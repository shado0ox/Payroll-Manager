import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const server = fs.readFileSync('server/index.mjs', 'utf8');
const systemRoutes = fs.readFileSync('server/routes/system-routes.mjs', 'utf8');
const authSessionRoutes = fs.readFileSync('server/routes/auth-session-routes.mjs', 'utf8');
const authLoginRoutes = fs.readFileSync('server/routes/auth-login-routes.mjs', 'utf8');
const authRegistrationRoutes = fs.readFileSync('server/routes/auth-registration-routes.mjs', 'utf8');

test('public system endpoints are delegated to an isolated router', () => {
  assert.match(server, /createSystemRouter/);
  assert.match(server, /app\.use\('\/api', createSystemRouter/);
  assert.doesNotMatch(server, /app\.get\('\/api\/(?:health|version|public\/config)'/);
  assert.match(systemRoutes, /router\.get\('\/health'/);
  assert.match(systemRoutes, /router\.get\('\/version'/);
  assert.match(systemRoutes, /router\.get\('\/public\/config'/);
});

test('registration start and verification are delegated as one bounded workflow', () => {
  assert.match(server, /app\.use\('\/api\/auth', createAuthRegistrationRouter/);
  assert.doesNotMatch(server, /app\.post\('\/api\/auth\/register\/(?:start|verify)'/);
  assert.match(authRegistrationRoutes, /router\.post\('\/register\/start', registrationLimiter/);
  assert.match(authRegistrationRoutes, /router\.post\('\/register\/verify', registrationLimiter/);
  assert.match(authRegistrationRoutes, /now\(\)\+interval '15 minutes'/);
  assert.match(authRegistrationRoutes, /row\.attempts >= 5/);
  assert.match(authRegistrationRoutes, /await client\.query\('BEGIN'\)/);
  assert.match(authRegistrationRoutes, /'COMPANY_MANAGER'/);
  assert.match(authRegistrationRoutes, /await client\.query\('COMMIT'\)/);
});

test('login is delegated with rate limiting, transaction, and secure cookie behavior', () => {
  assert.match(server, /app\.use\('\/api\/auth', createAuthLoginRouter/);
  assert.doesNotMatch(server, /app\.post\('\/api\/auth\/login'/);
  assert.match(authLoginRoutes, /router\.post\('\/login', loginLimiter/);
  assert.match(authLoginRoutes, /bcrypt\.compare\(password, user\.password_hash\)/);
  assert.match(authLoginRoutes, /INSERT INTO \$\{q\('sessions'\)\}/);
  assert.match(authLoginRoutes, /INSERT INTO \$\{q\('audit_log'\)\} \(user_id,action,ip\) VALUES \(\$1,'LOGIN',\$2\)/);
  assert.match(authLoginRoutes, /SameSite=Strict\$\{process\.env\.COOKIE_SECURE/);
});

test('session lookup and logout are delegated to an authenticated router', () => {
  assert.match(server, /app\.use\('\/api\/auth', createAuthSessionRouter/);
  assert.doesNotMatch(server, /app\.(?:get|post)\('\/api\/auth\/(?:session|logout)'/);
  assert.match(authSessionRoutes, /router\.get\('\/session', auth/);
  assert.match(authSessionRoutes, /router\.post\('\/logout', auth/);
  assert.match(authSessionRoutes, /DELETE FROM \$\{q\('sessions'\)\} WHERE token_hash=\$1/);
  assert.match(authSessionRoutes, /masar_session=; Path=\/; HttpOnly; SameSite=Strict; Max-Age=0/);
});

test('health checks PostgreSQL and public config remains environment-driven', () => {
  assert.match(systemRoutes, /await pool\.query\('SELECT 1'\)/);
  assert.match(systemRoutes, /registrationEnabled:publicRegistrationEnabled && Boolean\(resendApiKey && verificationEmailFrom\)/);
  assert.match(systemRoutes, /res\.json\(\{ status:'ok', buildId \}\)/);
});
