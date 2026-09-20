import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const employeeRoutes=fs.readFileSync(new URL('./routes/employee-routes.mjs',import.meta.url),'utf8');
const gosiRoutes=fs.readFileSync(new URL('./routes/gosi-routes.mjs',import.meta.url),'utf8');
const employeeView=fs.readFileSync(new URL('../src/components/EmployeesView.tsx',import.meta.url),'utf8');
const gosiView=fs.readFileSync(new URL('../src/components/GosiReconciliationView.tsx',import.meta.url),'utf8');

test('terminal employee reasons archive records and expose a reversible archive list',()=>{
  assert.match(employeeRoutes,/SPONSOR_TRANSFER','FINAL_EXIT/);
  assert.match(employeeRoutes,/status === 'ABSCONDED'/);
  assert.match(employeeRoutes,/router\.get\('\/employees\/archived'/);
  assert.match(employeeRoutes,/router\.post\('\/employees\/:id\/restore'/);
  assert.match(employeeRoutes,/status='SUSPENDED',is_archived=false/);
  assert.match(employeeView,/مؤرشفون/);
  assert.match(employeeView,/restoreArchivedEmployee/);
});

test('GOSI comparison flags archived identities without adding them as payroll-only employees',()=>{
  assert.match(gosiRoutes,/employee\.is_archived\) status='ARCHIVED_EMPLOYEE'/);
  assert.match(gosiRoutes,/if\(employee\.is_archived\)continue/);
  assert.match(gosiView,/ARCHIVED_EMPLOYEE:\['موظف مؤرشف'/);
  assert.match(gosiView,/ظهر.*موظف مؤرشف في فاتورة التأمينات/);
});
