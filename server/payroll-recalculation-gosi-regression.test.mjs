import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const payrollView = fs.readFileSync(new URL('../src/components/PayrollRunsView.tsx', import.meta.url), 'utf8');
const employeesView = fs.readFileSync(new URL('../src/components/EmployeesView.tsx', import.meta.url), 'utf8');
const payrollEngine = fs.readFileSync(new URL('../src/utils/payrollEngine.ts', import.meta.url), 'utf8');
const heldEntitlementsTransform = fs.readFileSync(new URL('../scripts/apply-held-payroll-entitlements.mjs', import.meta.url), 'utf8');

test('recalculation never reuses a payroll run from a different period', () => {
  assert.match(payrollView, /return companyRuns\.find\(r => r\.periodMonth === selectedPeriod\);/);
  assert.doesNotMatch(payrollView, /periodMonth === selectedPeriod\) \|\| companyRuns\[0\]/);
  assert.match(heldEntitlementsTransform, /source\.replace\([\s\S]*periodMonth === selectedPeriod\) \|\| companyRuns\[0\]/);
  assert.match(heldEntitlementsTransform, /source\.includes\(`return companyRuns\.find/);
});

test('non-Saudi GOSI remains employer-only and is visible in employee and payroll views', () => {
  assert.match(payrollEngine, /employee\.nationality === 'NON_SAUDI' && gosiEnabled/);
  assert.match(payrollEngine, /gosiEmployeeShare = 0;/);
  assert.match(payrollEngine, /nonSaudiGosiEmployerHazardRate \|\| 0\.02/);
  assert.match(employeesView, /تطبيق تأمين المخاطر المهنية/);
  assert.match(payrollView, /على الشركة فقط/);
});
