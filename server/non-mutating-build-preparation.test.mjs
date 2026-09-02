import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const payrollWorkflow = fs.readFileSync('.github/workflows/payroll-workflow-ci.yml', 'utf8');
const verifier = fs.readFileSync('scripts/verify-feature-hardening.mjs', 'utf8');

test('build preparation validates source without applying mutation scripts', () => {
  assert.equal(packageJson.scripts['prepare:security'], 'node scripts/verify-feature-hardening.mjs');
  assert.doesNotMatch(payrollWorkflow, /node scripts\/apply-feature-hardening\.mjs/);
  assert.doesNotMatch(verifier, /writeFileSync|appendFileSync|renameSync|rmSync/);
});
