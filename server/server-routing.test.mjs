import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const server = fs.readFileSync('server/index.mjs', 'utf8');
const systemRoutes = fs.readFileSync('server/routes/system-routes.mjs', 'utf8');

test('public system endpoints are delegated to an isolated router', () => {
  assert.match(server, /createSystemRouter/);
  assert.match(server, /app\.use\('\/api', createSystemRouter/);
  assert.doesNotMatch(server, /app\.get\('\/api\/(?:health|version|public\/config)'/);
  assert.match(systemRoutes, /router\.get\('\/health'/);
  assert.match(systemRoutes, /router\.get\('\/version'/);
  assert.match(systemRoutes, /router\.get\('\/public\/config'/);
});

test('health checks PostgreSQL and public config remains environment-driven', () => {
  assert.match(systemRoutes, /await pool\.query\('SELECT 1'\)/);
  assert.match(systemRoutes, /registrationEnabled:publicRegistrationEnabled && Boolean\(resendApiKey && verificationEmailFrom\)/);
  assert.match(systemRoutes, /res\.json\(\{ status:'ok', buildId \}\)/);
});
