import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');

test('runtime state writers are tenant scoped', () => {
  assert.match(source, /createTenantScopedClient, scopeStateForCompanies/);
  const guardedWriterCount = (source.match(/createTenantScopedClient\(client, q, tenantCompanyIds\)/g) || []).length;
  assert.equal(guardedWriterCount, 2, 'PUT and PATCH must both use the tenant-scoped DB client');
  assert.equal((source.match(/replaceNormalizedPayrollData\(client, state\)/g) || []).length, 0);
  assert.equal((source.match(/replaceNormalizedOperationsData\(client, state\)/g) || []).length, 0);
  assert.equal((source.match(/replaceNormalizedCoreData\(client, state\)/g) || []).length, 0);
});

test('application audit history cannot be patched by clients', () => {
  const patchableLine = source.match(/const PATCHABLE_COLLECTIONS[^\n]+/)?.[0] || '';
  assert.ok(patchableLine);
  assert.doesNotMatch(patchableLine, /auditLogs/);
  assert.match(source, /next\.auditLogs = stored\?\.auditLogs \|\| \[\];/);
});

test('user update checks existing target tenant scope', () => {
  assert.match(source, /SELECT id,password_hash,company_ids,role FROM/);
  assert.match(source, /targetOutsideScope/);
});
