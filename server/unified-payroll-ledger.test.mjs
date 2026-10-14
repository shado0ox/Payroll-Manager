import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const payroll = fs.readFileSync('src/components/PayrollRunsView.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const server = fs.readFileSync('server/payroll-workflow-guards.mjs', 'utf8');
const sidebar = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
const types = fs.readFileSync('src/types/index.ts', 'utf8');
const paymentCoverage = fs.readFileSync('src/utils/payrollPaymentCoverage.ts', 'utf8');
const payrollItemsTable = fs.readFileSync('src/components/payroll/PayrollRunItemsTable.tsx', 'utf8');

test('recalculation preserves employees already in active or paid transfer batches', () => {
  assert.match(payroll, /if \(previousItem && committedEmployeeIds\.has\(emp\.id\)\) return previousItem/);
  assert.match(payroll, /if \(committedEmployeeIds\.has\(emp\.id\) && previousItemsByEmployeeId\.has\(emp\.id\)\) return true;[\s\S]{0,300}emp\.salaryStartDate/);
  assert.match(payroll, /const lockedHistoricalItems = previousItems\.filter\(item =>[\s\S]{0,200}!companyEmployeeIds\.has\(item\.employeeId\)/);
  assert.match(payroll, /const runItems: PayrollRunItem\[\] = \[\.\.\.lockedHistoricalItems, \.\.\.recalculatedItems\]/);
  assert.doesNotMatch(payroll, /An approved or posted payroll cannot be recalculated/);
  assert.doesNotMatch(payroll, /Payroll cannot be recalculated while a scheduled or paid payment batch exists/);
  assert.match(server, /TRANSFERRED_EMPLOYEE_PAYROLL_IMMUTABLE/);
});

test('a later salary-start or lifecycle change cannot remove a historically transferred employee', () => {
  const preserve = payroll.indexOf('if (committedEmployeeIds.has(emp.id) && previousItemsByEmployeeId.has(emp.id)) return true;');
  const abscondedFilter = payroll.indexOf("if (emp.status === 'ABSCONDED') return false;", preserve);
  const salaryStartFilter = payroll.indexOf('if (emp.salaryStartDate && emp.salaryStartDate.slice(0, 7) > selectedPeriod) return false;', preserve);
  const terminationFilter = payroll.indexOf("if (emp.status === 'TERMINATED')", preserve);
  assert.ok(preserve >= 0 && abscondedFilter > preserve && salaryStartFilter > preserve && terminationFilter > preserve);
});

test('current inputs use the engine while carry reads saved salary snapshots', () => {
  assert.match(payroll, /calculateEmployeePayrollItem/);
  assert.match(payroll, /unpaidSalaryDetails/);
  assert.doesNotMatch(payroll, /let cursor = salaryStartMonth/);
  assert.match(payroll, /candidate\.periodMonth < periodMonth/);
  assert.match(types, /priorPeriodNet\?: number/);
  assert.match(paymentCoverage, /salaryBatchAllocations/);
});

test('a cumulative later payment is visible and locked in every covered source month', () => {
  assert.match(payroll, /externalCoverages = paymentCoverages\.filter/);
  assert.match(payroll, /externalCoverages\.map\(coverage => coverage\.employeeId\)/);
  assert.match(payroll, /coverage\.sourcePeriodMonth === selectedPeriod/);
  assert.match(payrollItemsTable, /paymentBatch\.batchNumber/);
  assert.match(payrollItemsTable, /paymentBatch\.periodMonth/);
});

test('period-specific deductions remain editable until that employee enters a transfer batch', () => {
  assert.match(app, /const employeePaymentLocked = payrollRuns/);
  assert.match(app, /if \(!employeePaymentLocked\) return false/);
  assert.match(server, /const employeePaymentLocked = asArray\(stored\.payrollRuns\)/);
  assert.match(server, /if \(!employeePaymentLocked\) return false/);
});

test('manual payroll adjustment only locks the employee included in a transfer batch', () => {
  assert.match(payroll, /const employeeBatch = getEmployeePaymentBatch\(adjustmentItem\.employeeId\)/);
  assert.doesNotMatch(payroll, /Payroll amounts cannot be edited while an active transfer batch exists/);
});

test('settlements tab is removed from navigation while old settlement history may remain stored', () => {
  assert.doesNotMatch(sidebar, /id: 'settlements'/);
});
