import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const transform = fs.readFileSync('scripts/apply-payroll-settlements-ledger.mjs', 'utf8');
const component = fs.readFileSync('src/components/PayrollSettlementsView.tsx', 'utf8');
const featureHardening = fs.readFileSync('scripts/apply-feature-hardening.mjs', 'utf8');

test('PR21 transform is applied last and exposes settlements as a payroll-scoped collection', () => {
  assert.match(featureHardening.trimEnd(), /apply-payroll-settlements-ledger\.mjs';$/);
  assert.match(transform, /payrollSettlements:'MANAGE_PAYROLL'/);
  assert.match(transform, /DUPLICATE_PAYROLL_SETTLEMENT/);
  assert.match(transform, /PAID_SETTLEMENT_LOCKED/);
});

test('employee number remains auto-suggested but editable before save', () => {
  assert.match(transform, /onChange=\{e => setFormData\(\{ \.\.\.formData, employeeNo: e\.target\.value\.toUpperCase\(\) \}\)\}/);
  assert.match(transform, /EMPLOYEE_NUMBER_LOCAL_DUPLICATE/);
  assert.match(transform, /Suggested automatically; you may replace it with your own employee code before saving/);
});

test('sidebar puts employees after dashboard and settlements before company profile', () => {
  const dashboard = transform.indexOf("id: 'dashboard'");
  const employees = transform.indexOf("id: 'employees'");
  const payroll = transform.indexOf("id: 'payroll_runs'");
  const loans = transform.indexOf("id: 'loans_penalties'");
  const settlements = transform.indexOf("id: 'settlements'");
  const company = transform.indexOf("id: 'company_profile'");
  assert.ok(dashboard >= 0 && dashboard < employees && employees < payroll && payroll < loans && loans < settlements && settlements < company);
});

test('settlement candidates cover held payroll and retroactive employees without reopening paid employees', () => {
  assert.match(component, /reason: 'HELD_PAYROLL'/);
  assert.match(component, /reason: 'RETROACTIVE_EMPLOYEE'/);
  assert.match(component, /\['SCHEDULED', 'PAID'\]\.includes\(batch\.status\)/);
  assert.match(component, /if \(run\.items\.some\(item => item\.employeeId === employee\.id\)\) continue/);
  assert.match(component, /calculateEmployeePayrollItem/);
});

test('settlement payment stores period separately from payment date and method', () => {
  assert.match(component, /periodMonth: selected\.periodMonth/);
  assert.match(component, /paymentMethod: method/);
  assert.match(component, /paymentDate/);
  assert.match(component, /paymentReference/);
  assert.match(component, /entitlementStatus: 'SETTLED'/);
});
