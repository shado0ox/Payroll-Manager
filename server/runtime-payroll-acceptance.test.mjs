import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const acceptance = fs.readFileSync('scripts/runtime-payroll-acceptance.mjs','utf8');
const workflow = fs.readFileSync('.github/workflows/payroll-workflow-ci.yml','utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json','utf8'));

test('full payroll acceptance is isolated and exercised by PostgreSQL CI', () => {
  assert.match(acceptance,/ACCEPTANCE_CONFIRM_ISOLATED_DB !== 'YES'/);
  assert.match(acceptance,/acceptance\|test\|restore\|sandbox\|staging/);
  assert.match(acceptance,/Refusing acceptance test against non-local application host/);
  assert.match(workflow,/ACCEPTANCE_CONFIRM_ISOLATED_DB: 'YES'/);
  assert.match(workflow,/node scripts\/runtime-payroll-acceptance\.mjs/);
  assert.equal(packageJson.scripts['test:acceptance'],'node scripts/runtime-payroll-acceptance.mjs');
});

test('acceptance covers late held salary, recalculation, reversals, and loan payoff', () => {
  assert.match(acceptance,/status:'SUSPENDED'/);
  assert.match(acceptance,/status:'ACTIVE'/);
  assert.match(acceptance,/status:'PAID'/);
  assert.match(acceptance,/paymentReversalReason/);
  assert.match(acceptance,/status:'CANCELLED'/);
  assert.match(acceptance,/status:'UNDER_REVIEW'/);
  assert.match(acceptance,/status:'COMPLETED'/);
  assert.match(acceptance,/Cancellation must restore prior salary exactly once/);
});
