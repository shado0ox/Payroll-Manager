import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');

function routeBlock(method, route, nextRouteMarker) {
  const startMarker = `app.${method}('${route}'`;
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing route ${method.toUpperCase()} ${route}`);
  const end = source.indexOf(nextRouteMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing route boundary after ${route}`);
  return source.slice(start, end);
}

test('runtime state writers are tenant scoped', () => {
  assert.match(source, /createTenantScopedClient, scopeStateForCompanies/);

  const putBlock = routeBlock('put', '/api/state', "app.patch('/api/state/patch'");
  const patchBlock = routeBlock('patch', '/api/state/patch', "app.delete('/api/employees/:id'");

  for (const block of [putBlock, patchBlock]) {
    assert.match(block, /createTenantScopedClient\(client, q, tenantCompanyIds\)/);
    assert.match(block, /scopeStateForCompanies\(state, tenantCompanyIds\)/);
    assert.doesNotMatch(block, /replaceNormalizedPayrollData\(client, state\)/);
    assert.doesNotMatch(block, /replaceNormalizedOperationsData\(client, state\)/);
    assert.doesNotMatch(block, /replaceNormalizedCoreData\(client, state\)/);
  }
});

test('application audit history cannot be patched by clients', () => {
  const patchableLine = source.match(/const PATCHABLE_COLLECTIONS[^\n]+/)?.[0] || '';
  assert.ok(patchableLine);
  assert.doesNotMatch(patchableLine, /auditLogs/);
  assert.match(source, /next\.auditLogs = stored\?\.auditLogs \|\| \[\];/);
});

test('admin state user listing is self-only', () => {
  const stateBlock = routeBlock('get', '/api/state', "app.put('/api/state'");
  assert.match(stateBlock, /req\.user\.role === 'ADMIN'/);
  assert.match(stateBlock, /user\.id === req\.user\.id/);
});

test('user update checks existing target tenant scope', () => {
  assert.match(source, /SELECT id,password_hash,company_ids,role FROM/);
  assert.match(source, /targetOutsideScope/);
});
