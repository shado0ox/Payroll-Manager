import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/payroll-workflow-ci.yml','utf8');
const smoke = fs.readFileSync('scripts/runtime-legacy-migration-smoke.mjs','utf8');

test('CI executes legacy migrations against an isolated PostgreSQL service twice', () => {
  assert.match(workflow,/legacy-migration-postgres:/);
  assert.match(workflow,/POSTGRES_DB: masar_legacy_migration_test/);
  assert.match(workflow,/runtime-legacy-migration-smoke\.mjs seed/);
  assert.equal((workflow.match(/runtime-legacy-migration-smoke\.mjs verify/g) || []).length,2);
  assert.match(workflow,/Verify migrations are restart-safe/);
});

test('legacy migration fixture contains no production connection or personal data', () => {
  assert.match(smoke,/ci-legacy-employee-1/);
  assert.match(smoke,/ci-legacy-settlement-1/);
  assert.match(smoke,/LEGACY:\$\{settlementId\}/);
  assert.doesNotMatch(smoke,/payroll\.xshadox\.com|masar_payroll_db|masar_payroll_user/);
});
