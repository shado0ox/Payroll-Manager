import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const server = fs.readFileSync('server/index.mjs','utf8');
const tenantStorage = fs.readFileSync('server/tenant-storage.mjs','utf8');
const api = fs.readFileSync('src/utils/api.ts','utf8');
const app = fs.readFileSync('src/App.tsx','utf8');
const view = fs.readFileSync('src/components/PayrollSettlementsView.tsx','utf8');

function routeBlock(method,path,nextMarker) {
  const start = server.indexOf(`app.${method}('${path}'`);
  const end = server.indexOf(nextMarker,start + 1);
  assert.ok(start >= 0,`${method.toUpperCase()} ${path} route must exist`);
  assert.ok(end > start,`${method.toUpperCase()} ${path} route must have a boundary`);
  return server.slice(start,end);
}

test('settlements have normalized tenant-scoped storage and indexes', () => {
  assert.match(server,/CREATE TABLE IF NOT EXISTS.*payroll_settlements/);
  assert.match(server,/payroll_settlements_company_period_idx/);
  assert.match(server,/payroll_settlements_active_dedupe_idx/);
  assert.match(server,/005_normalized_settlements/);
  assert.match(tenantStorage,/payrollSettlements/);
  assert.match(tenantStorage,/DELETE FROM.*payroll_settlements/);
});

test('settlement creation is one atomic command with its source entitlement', () => {
  const create = routeBlock('post','/api/payroll-settlements',"app.post('/api/payroll-settlements/:id/reverse'");
  assert.match(create,/INSERT INTO.*payroll_settlements/);
  assert.match(create,/UPDATE.*payroll_run_items/);
  assert.match(create,/commitSettlementCompatibility/);
  assert.match(create,/DUPLICATE_PAYROLL_SETTLEMENT/);
  assert.doesNotMatch(create,/replaceNormalized(?:Operations|Core|Payroll)Data/);
});

test('settlement reversal is server-stamped and reopens its source atomically', () => {
  const reverse = routeBlock('post','/api/payroll-settlements/:id/reverse',"app.put('/api/journals/:id'");
  assert.match(reverse,/reversedAt:new Date\(\)\.toISOString\(\)/);
  assert.match(reverse,/SETTLEMENT_REVERSED/);
  assert.match(reverse,/REVERSED_SETTLEMENT_LOCKED/);
  assert.match(reverse,/UPDATE.*payroll_settlements.*SET status='REVERSED'/);
  assert.match(reverse,/UPDATE.*payroll_run_items/);
});

test('settlement UI uses committed command responses without a second payroll save', () => {
  assert.match(api,/createPayrollSettlement: async/);
  assert.match(api,/reversePayrollSettlement: async/);
  assert.match(app,/api\.createPayrollSettlement\(settlement\)/);
  assert.match(app,/api\.reversePayrollSettlement\(settlement\.id/);
  assert.doesNotMatch(view,/onSavePayrollRun/);
  assert.match(app,/remoteStateSnapshotRef\.current = next/);
});
