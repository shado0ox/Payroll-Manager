import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync('server/index.mjs','utf8');
const api = fs.readFileSync('src/utils/api.ts','utf8');
const modal = fs.readFileSync('src/components/DatabaseStatusModal.tsx','utf8');

test('payroll repair endpoints are developer-only and tenant scoped', () => {
  const start = server.indexOf("app.get('/api/admin/payroll-data-repair/scan'");
  const end = server.indexOf("app.put('/api/admin/companies",start);
  const routes = server.slice(start,end);
  assert.ok(start >= 0 && end > start);
  assert.match(routes,/isDeveloperUser\(req\.user\)/);
  assert.match(routes,/buildPayrollRepairPlan\(stored,req\.user\.company_ids\)/);
  assert.doesNotMatch(routes,/req\.body\?\.companyIds/);
});

test('selected repairs are revalidated and committed atomically with audit and incremental events', () => {
  const start = server.indexOf("app.post('/api/admin/payroll-data-repair/repair'");
  const end = server.indexOf("app.put('/api/admin/companies",start);
  const route = server.slice(start,end);
  assert.match(route,/await client\.query\('BEGIN'\)/);
  assert.match(route,/readLockedNormalizedState\(client\)/);
  assert.match(route,/REPAIR_SELECTION_STALE_OR_LOCKED/);
  assert.match(route,/appendPayrollFinancialAudit/);
  assert.match(route,/action:'REPAIR_PAYROLL_DATA'/);
  assert.match(route,/await client\.query\('COMMIT'\)/);
  assert.match(route,/collection:'payrollRuns',operation:'upsert'/);
});

test('database tools expose scan, explicit selection, and server-confirmed repair', () => {
  assert.match(api,/scanPayrollData:/);
  assert.match(api,/repairPayrollData:/);
  assert.match(api,/updateSyncedCollection\('payrollRuns',run\)/);
  assert.match(modal,/data-payroll-repair-panel/);
  assert.match(modal,/selectedRepairIds/);
  assert.match(modal,/api\.repairPayrollData\(selectedRepairIds\)/);
  assert.match(modal,/issue\.repairable/);
});
