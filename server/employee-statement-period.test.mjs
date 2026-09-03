import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('src/App.tsx','utf8');
const dashboard = fs.readFileSync('src/components/DashboardView.tsx','utf8');
const payroll = fs.readFileSync('src/components/PayrollRunsView.tsx','utf8');
const statement = fs.readFileSync('src/components/EmployeeStatementModal.tsx','utf8');
const period = fs.readFileSync('src/utils/period.ts','utf8');

test('employee and dashboard statements open on the current company period', () => {
  assert.match(app,/periodMonth:periodMonth \|\| getCurrentPeriod\(activeCompany\.timezone/);
  assert.match(dashboard,/onViewEmployeeStatement\(emp, currentPeriod\)/);
  assert.match(period,/timeZone[\s\S]*formatToParts\(now\)/);
});

test('payroll payslip opens on the period selected in the payroll screen', () => {
  assert.match(payroll,/onViewEmployeeStatement=\{employee => onViewEmployeeStatement\(employee, selectedPeriod\)\}/);
  assert.match(statement,/history\.run\.periodMonth === periodMonth/);
});

test('payslip never falls back to the first historical payroll run', () => {
  assert.doesNotMatch(statement,/employeeHistory\[0\]/);
  assert.match(statement,/No payslip exists for this employee in the selected month/);
  assert.match(statement,/\{periodMonth\}/);
});
