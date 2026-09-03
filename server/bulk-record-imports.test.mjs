import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const server = fs.readFileSync(new URL('./index.mjs',import.meta.url),'utf8');
const api = fs.readFileSync(new URL('../src/utils/api.ts',import.meta.url),'utf8');
const app = fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const employeesView = fs.readFileSync(new URL('../src/components/EmployeesView.tsx',import.meta.url),'utf8');

function route(startMarker,endMarker) {
  const start = server.indexOf(startMarker);
  const end = server.indexOf(endMarker,start);
  assert.ok(start >= 0 && end > start,`${startMarker} route must exist`);
  return server.slice(start,end);
}

test('employee spreadsheet import is one atomic record-level transaction', () => {
  const source = route("app.post('/api/employees/import'","app.put('/api/employees/:id'");
  assert.match(source,/employees\.length > 2500/);
  assert.match(source,/jsonb_array_elements\(\$1::jsonb\).*WITH ORDINALITY/s);
  assert.match(source,/ON CONFLICT \(id\) DO UPDATE/);
  assert.match(source,/updateCompatibilityCollectionRecords\(client,'employees',employees/);
  assert.match(source,/IMPORT_EMPLOYEES/);
  assert.doesNotMatch(source,/replaceNormalized|DELETE FROM.*employees/s);
});

test('attendance import validates payroll locks and upserts one batch', () => {
  const source = route("app.post('/api/attendance/import'","app.delete('/api/attendance/:id'");
  assert.match(source,/records\.length > 2500/);
  assert.match(source,/payrollSourceLocked/);
  assert.match(source,/jsonb_array_elements\(\$1::jsonb\).*WITH ORDINALITY/s);
  assert.match(source,/ON CONFLICT \(id\) DO UPDATE/);
  assert.match(source,/updateCompatibilityCollectionRecords\(client,'attendance',records/);
  assert.doesNotMatch(source,/replaceNormalized|DELETE FROM.*attendance_records/s);
});

test('bulk import UI waits for server-committed records without full-state saves', () => {
  assert.match(api,/importEmployees: async/);
  assert.match(api,/importAttendanceRecords: async/);
  const employeeHandler = app.slice(app.indexOf('const handleBulkImportEmployees'),app.indexOf('const handleDeleteAllCompanyEmployees'));
  const attendanceHandler = app.slice(app.indexOf('const handleBulkImportAttendance'),app.indexOf('const handleDeleteAttendance'));
  assert.match(employeeHandler,/api\.importEmployees\(importedEmployees\)/);
  assert.match(attendanceHandler,/api\.importAttendanceRecords\(records\)/);
  assert.doesNotMatch(employeeHandler,/saveEmployees|saveState/);
  assert.doesNotMatch(attendanceHandler,/saveAttendance|saveState/);
  assert.match(employeesView,/const saved = await onBulkImportEmployees\(importPreview\.valid\)/);
  assert.match(employeesView,/isImportingEmployees/);
});
