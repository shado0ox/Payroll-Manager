import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const verifier = fs.readFileSync('scripts/verify-feature-hardening.mjs', 'utf8');
// The .github directory is commonly excluded from Docker build contexts via
// .dockerignore, since workflow files are never needed at runtime. Skip the
// workflow-file assertion there instead of failing the whole test suite, but
// still enforce it whenever the file is present (e.g. actual GitHub Actions runs).
const workflowPath = '.github/workflows/payroll-workflow-ci.yml';
const payrollWorkflow = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : null;

test('build preparation validates source without applying mutation scripts', () => {
  assert.equal(packageJson.scripts['prepare:security'], 'node scripts/verify-feature-hardening.mjs');
  if (payrollWorkflow !== null) {
    assert.doesNotMatch(payrollWorkflow, /node scripts\/apply-feature-hardening\.mjs/);
  }
  assert.doesNotMatch(verifier, /writeFileSync|appendFileSync|renameSync|rmSync/);
});
