import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const bootstrap = fs.readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');
const bootstrapLines = bootstrap.split('\n');

test('server bootstrap stays within the agreed assembly-only size boundary', () => {
  assert.ok(
    bootstrapLines.length <= 500,
    `server/index.mjs grew to ${bootstrapLines.length} lines; extract the new responsibility instead of expanding the bootstrap`,
  );
});

test('API endpoints remain delegated to isolated routers', () => {
  assert.doesNotMatch(bootstrap, /app\.(?:get|post|put|patch|delete)\(\s*['"]\/api/);
  for (const factory of [
    'createSystemRouter',
    'createAuthRegistrationRouter',
    'createAuthPasswordResetRouter',
    'createAuthLoginRouter',
    'createAuthSessionRouter',
    'createGosiRouter',
    'createAdminDatabaseRouter',
    'createStateRouter',
    'createCompanyRouter',
    'createAttendanceLeaveRouter',
    'createLoanPenaltyRouter',
    'createPayrollRouter',
    'createJournalQoyodRouter',
    'createEmployeeRouter',
    'createUserRouter',
  ]) {
    assert.match(bootstrap, new RegExp(`app\\.use\\([\\s\\S]{0,80}${factory}\\(`), `${factory} must stay mounted by the bootstrap`);
  }
});

test('database definitions and normalized state readers stay outside the bootstrap', () => {
  assert.doesNotMatch(bootstrap, /CREATE TABLE|ALTER TABLE|DROP CONSTRAINT|jsonb_array_elements/);
  assert.doesNotMatch(bootstrap, /async function readNormalizedApplicationState/);
  assert.match(bootstrap, /createDatabaseMigrator/);
  assert.match(bootstrap, /createNormalizedStateStore/);
});
