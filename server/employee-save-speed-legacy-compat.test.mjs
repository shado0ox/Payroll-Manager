import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const serverSource = fs.readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');
const apiSource = fs.readFileSync(new URL('../src/utils/api.ts', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const employeesSource = fs.readFileSync(new URL('../src/components/EmployeesView.tsx', import.meta.url), 'utf8');

test('employee save returns committed version without forcing full state reload', () => {
  assert.match(serverSource, /res\.json\(\{ employee, created:!existing\.rowCount, version:Number\(updated\.rows\[0\]\?\.version \|\| 0\)/);
  assert.match(apiSource, /saveEmployee: async/);
  assert.match(apiSource, /stateVersion = result\.version/);
  const start = appSource.indexOf('const handleSaveEmployee = async');
  const end = appSource.indexOf('const handleBulkImportEmployees', start);
  const block = appSource.slice(start, end);
  assert.match(block, /await api\.saveEmployee\(employee\)/);
  assert.doesNotMatch(block, /api\.getState\(\)/);
});

test('legacy non-Saudi identity is treated as existing iqama, not new arrival', () => {
  assert.match(employeesSource, /const legacyIdentity = String\(empCopy\.nationalIdOrIqama/);
  assert.match(employeesSource, /empCopy\.iqamaNumber = legacyIdentity/);
  assert.match(employeesSource, /empCopy\.iqamaIssueStatus = 'ISSUED'/);
  assert.match(employeesSource, /IQAMA_HOLDER/);
});

test('startup normalizes only legacy non-Saudi records with stored identity and no entry number', () => {
  assert.match(serverSource, /LEGACY_EMPLOYEE_IDENTITY_COMPAT/);
  assert.match(serverSource, /payload->>'nationality'='NON_SAUDI'/);
  assert.match(serverSource, /COALESCE\(payload->>'entryNumber',''\)=''/);
  assert.match(serverSource, /'\{iqamaNumber\}'/);
  assert.match(serverSource, /'\"ISSUED\"'::jsonb/);
});
