import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const payroll = fs.readFileSync('src/components/PayrollRunsView.tsx', 'utf8');
const server = fs.readFileSync('server/index.mjs', 'utf8');
const sidebar = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
const types = fs.readFileSync('src/types/index.ts', 'utf8');

test('recalculation preserves employees already in active or paid transfer batches', () => {
  assert.match(payroll, /if \(previousItem && committedEmployeeIds\.has\(emp\.id\)\) return previousItem/);
  assert.doesNotMatch(payroll, /Payroll cannot be recalculated after a paid batch/);
  assert.match(server, /TRANSFERRED_EMPLOYEE_PAYROLL_IMMUTABLE/);
});

test('new and unpaid employees use the full payroll engine including prior period inputs', () => {
  assert.match(payroll, /priorPeriodDetails/);
  assert.match(payroll, /penalties\.filter\(p => p\.employeeId === emp\.id && p\.periodMonth === cursor/);
  assert.match(payroll, /activeLoans: loans\.filter\(l => l\.employeeId === emp\.id\)/);
  assert.match(payroll, /calculateEmployeePayrollItem/);
  assert.match(types, /priorPeriodNet\?: number/);
});

test('prior unpaid periods are carried into the current payable balance once and paid periods are skipped', () => {
  assert.match(payroll, /alreadyTransferred/);
  assert.match(payroll, /\['SCHEDULED', 'PAID'\]\.includes\(batch\.status\)/);
  assert.match(payroll, /netSalary: roundAmount\(calculated\.netSalary \+ priorPeriodNet\)/);
});

test('manual payroll adjustment only locks the employee included in a transfer batch', () => {
  assert.match(payroll, /const employeeBatch = getEmployeePaymentBatch\(adjustmentItem\.employeeId\)/);
  assert.doesNotMatch(payroll, /Payroll amounts cannot be edited while an active transfer batch exists/);
});

test('settlements tab is removed from navigation while old settlement history may remain stored', () => {
  assert.doesNotMatch(sidebar, /id: 'settlements'/);
});
