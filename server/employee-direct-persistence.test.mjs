import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const serverSource = fs.readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const apiSource = fs.readFileSync(new URL('../src/utils/api.ts', import.meta.url), 'utf8');
const employeesViewSource = fs.readFileSync(new URL('../src/components/EmployeesView.tsx', import.meta.url), 'utf8');

function routeBlock(method, route, nextRouteMarker) {
  const startMarker = `app.${method}('${route}'`;
  const start = serverSource.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing route ${method.toUpperCase()} ${route}`);
  const end = serverSource.indexOf(nextRouteMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing route boundary after ${route}`);
  return serverSource.slice(start, end);
}

test('employee save uses a dedicated server endpoint and committed response', () => {
  assert.match(apiSource, /saveEmployee:\s*async\s*\(employee:any\).*\/api\/employees\/\$\{encodeURIComponent\(employee\.id\)\}.*method:'PUT'/s);
  assert.match(apiSource, /stateVersion = result\.version/);
  assert.match(appSource, /await api\.saveEmployee\(employee\)/);
  assert.match(appSource, /EMPLOYEE_DIRECT_SAVE_FAILED/);
  assert.match(employeesViewSource, /await onSaveEmployee\(/);
});

test('employee PUT writes normalized employee and compatibility state in one transaction', () => {
  const block = routeBlock('put', '/api/employees/:id', "app.delete('/api/employees/:id'");
  assert.match(block, /await client\.query\('BEGIN'\)/);
  assert.match(block, /INSERT INTO .*employees/s);
  assert.match(block, /ON CONFLICT \(id\) DO UPDATE SET/s);
  assert.match(block, /SELECT state FROM .*app_state.*FOR UPDATE/s);
  assert.match(block, /compatibilityState\.employees/);
  assert.match(block, /UPDATE .*app_state.*version=version\+1/s);
  assert.match(block, /INSERT INTO .*application_audit_logs/s);
  assert.match(block, /await client\.query\('COMMIT'\)/);
});

test('employee DELETE mutates PostgreSQL and compatibility state transactionally', () => {
  const block = routeBlock('delete', '/api/employees/:id', "app.put('/api/users/:id'");
  assert.match(block, /SELECT id,company_id FROM .*employees.*FOR UPDATE/s);
  assert.match(block, /DELETE FROM .*employees.*WHERE id=\$1/s);
  assert.match(block, /UPDATE .*employees.*SET is_archived=true/s);
  assert.match(block, /compatibilityState\.employees = .*filter/s);
  assert.match(block, /UPDATE .*app_state.*version=version\+1/s);
  assert.match(block, /INSERT INTO .*application_audit_logs/s);
  assert.match(block, /await client\.query\('COMMIT'\)/);
});

test('frontend confirms deletion by reloading server state', () => {
  assert.match(appSource, /await api\.deleteEmployee\(empId\)/);
  assert.match(appSource, /await api\.getState\(\)/);
  assert.match(appSource, /EMPLOYEE_DELETE_NOT_CONFIRMED/);
});
