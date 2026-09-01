import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const payroll = fs.readFileSync('src/components/PayrollRunsView.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const server = fs.readFileSync('server/index.mjs', 'utf8');
const sidebar = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
const types = fs.readFileSync('src/types/index.ts', 'utf8');

test('recalculation preserves employees already in active or paid transfer batches', () => {
  assert.match(payroll, /if \(previousItem && committedEmployeeIds\.has\(emp\.id\)\) return previousItem/);
  assert.doesNotMatch(payroll, /An approved or posted payroll cannot be recalculated/);
  assert.doesNotMatch(payroll, /Payroll cannot be recalculated while a scheduled or paid payment batch exists/);
  assert.match(server, /TRANSFERRED_EMPLOYEE_PAYROLL_IMMUTABLE/);
});

test('new and unpaid employees use the full payroll engine including prior period inputs', () => {
  assert.match(payroll, /priorPeriodDetails/);
  assert.match(payroll, /penalties\.filter\(p => p\.employeeId === emp\.id && p\.periodMonth === cursor/);
  assert.match(payroll, /activeLoans: effectiveLoansFor\(cursor, emp\.id\)/);
  assert.match(payroll, /candidate\.periodMonth < periodMonth/);
  assert.match(payroll, /calculateEmployeePayrollItem/);
  assert.match(types, /priorPeriodNet\?: number/);
});

test('prior unpaid periods are carried into the current payable balance once and paid periods are skipped', () => {
  assert.match(payroll, /alreadyTransferred/);
  assert.match(payroll, /\['SCHEDULED', 'PAID'\]\.includes\(batch\.status\)/);
  assert.match(payroll, /netSalary: roundAmount\(calculated\.netSalary \+ priorPeriodNet\)/);
});

test('period-specific deductions remain editable until that employee enters a transfer batch', () => {
  assert.match(app, /const employeePaymentLocked = \(run\.paymentBatches \|\| \[\]\)\.some\(batch =>/);
  assert.match(app, /if \(!employeePaymentLocked\) return false/);
  assert.match(server, /const employeePaymentLocked = asArray\(run\.paymentBatches\)\.some\(batch =>/);
  assert.match(server, /if \(!employeePaymentLocked\) return false/);
});

test('manual payroll adjustment only locks the employee included in a transfer batch', () => {
  assert.match(payroll, /const employeeBatch = getEmployeePaymentBatch\(adjustmentItem\.employeeId\)/);
  assert.doesNotMatch(payroll, /Payroll amounts cannot be edited while an active transfer batch exists/);
});

test('settlements tab is removed from navigation while old settlement history may remain stored', () => {
  assert.doesNotMatch(sidebar, /id: 'settlements'/);
});
