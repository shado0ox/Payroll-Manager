import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const transform = fs.readFileSync('scripts/apply-payroll-settlements-ledger.mjs', 'utf8');
const component = fs.readFileSync('src/components/PayrollSettlementsView.tsx', 'utf8');
const featureHardening = fs.readFileSync('scripts/apply-feature-hardening.mjs', 'utf8');

test('PR21 transform runs after its compatibility shims and restores server-owned audit protection afterwards', () => {
  const compat = featureHardening.indexOf("apply-pr21-patchable-anchor-compat.mjs");
  const statementCompat = featureHardening.indexOf("apply-pr21-statement-import-compat.mjs");
  const ledger = featureHardening.indexOf("apply-payroll-settlements-ledger.mjs");
  const restore = featureHardening.indexOf("apply-pr21-patchable-anchor-restore.mjs");
  assert.ok(compat >= 0 && compat < ledger);
  assert.ok(statementCompat >= 0 && statementCompat < ledger);
  assert.ok(ledger >= 0 && ledger < restore);
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
  const navStart = transform.indexOf('const nav = `');
  const navEnd = transform.indexOf('`;\n    source = source.slice', navStart);
  assert.ok(navStart >= 0 && navEnd > navStart);
  const nav = transform.slice(navStart, navEnd);
  const dashboard = nav.indexOf("id: 'dashboard'");
  const employees = nav.indexOf("id: 'employees'");
  const payroll = nav.indexOf("id: 'payroll_runs'");
  const attendance = nav.indexOf("id: 'attendance'");
  const loans = nav.indexOf("id: 'loans_penalties'");
  const settlements = nav.indexOf("id: 'settlements'");
  const company = nav.indexOf("id: 'company_profile'");
  assert.ok(dashboard >= 0 && dashboard < employees && employees < payroll && payroll < attendance && attendance < loans && loans < settlements && settlements < company);
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
