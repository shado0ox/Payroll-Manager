import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const server = fs.readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../src/utils/api.ts', import.meta.url), 'utf8');
const runtimeSmoke = fs.readFileSync(new URL('../scripts/runtime-payroll-smoke.mjs', import.meta.url), 'utf8');

test('generic state patch cannot be restored as an application write path', () => {
  assert.doesNotMatch(server, /app\.patch\('\/api\/state\/patch'/);
  assert.doesNotMatch(server, /PATCHABLE_COLLECTIONS|applyRecordPatch|INVALID_STATE_PATCH/);
  assert.doesNotMatch(api, /\/api\/state\/patch/);
  assert.doesNotMatch(runtimeSmoke, /\/api\/state\/patch|patchCollections/);
});

test('runtime payroll smoke covers dedicated record and workflow endpoints', () => {
  assert.match(runtimeSmoke, /\/api\/employees\/\$\{employeeId\}/);
  assert.match(runtimeSmoke, /\/api\/payroll-runs\/\$\{runId\}/);
  assert.match(runtimeSmoke, /\/api\/payroll-runs\/\$\{runId\}\/status/);
  assert.match(runtimeSmoke, /\/api\/payroll-runs\/\$\{runId\}\/payment-batches/);
  assert.match(runtimeSmoke, /\/api\/payroll-runs\/\$\{runId\}\/payment-batches\/\$\{batchId\}\/status/);
});
