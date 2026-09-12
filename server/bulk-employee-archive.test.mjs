import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { serverSource as server } from './test-server-source.mjs';

const api = fs.readFileSync(new URL('../src/utils/api.ts',import.meta.url),'utf8');
const app = fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const profile = fs.readFileSync(new URL('../src/components/CompanyProfileView.tsx',import.meta.url),'utf8');
const dangerZone = fs.readFileSync(new URL('../src/components/company/CompanyDangerZoneTab.tsx',import.meta.url),'utf8');

test('bulk employee action archives active rows and preserves company history', () => {
  const start = server.indexOf("app.post('/api/companies/:id/employees/archive'");
  const end = server.indexOf("app.put('/api/users/:id'",start);
  assert.ok(start >= 0 && end > start,'bulk employee archive route must exist');
  const route = server.slice(start,end);
  assert.match(route,/can\(req\.user,'MANAGE_EMPLOYEES'\)/);
  assert.match(route,/UPDATE.*employees.*SET is_archived=true/s);
  assert.match(route,/bumpStateVersion\(client,req\.user\.id\)/);
  assert.doesNotMatch(route,/SELECT state FROM|state\.employees|SET state=/);
  assert.match(route,/ARCHIVE_COMPANY_EMPLOYEES/);
  assert.doesNotMatch(route,/DELETE FROM.*employees|DELETE FROM.*payroll|DELETE FROM.*attendance|DELETE FROM.*journal/s);
});

test('bulk employee archive UI waits for the committed server response', () => {
  assert.match(api,/archiveCompanyEmployees: async/);
  assert.match(api,/\/api\/companies\/\$\{encodeURIComponent\(companyId\)\}\/employees\/archive/);
  const handler = app.slice(app.indexOf('const handleDeleteAllCompanyEmployees'),app.indexOf('const handleSavePayrollRunConfirmed'));
  assert.match(handler,/api\.archiveCompanyEmployees\(companyId\)/);
  assert.doesNotMatch(handler,/saveEmployees|saveAttendance|savePayrollRuns|saveJournals|saveState/);
  assert.match(profile,/onArchiveEmployees={onDeleteAllCompanyEmployees}/);
  assert.match(dangerZone,/const archived = await onArchiveEmployees\?\.\(company\.id\)/);
  assert.match(dangerZone,/أرشفة جميع الموظفين/);
  assert.match(dangerZone,/الاحتفاظ بالتاريخ/);
  assert.doesNotMatch(dangerZone,/حذف نهائي/);
});
