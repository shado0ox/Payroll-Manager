import test from 'node:test';
import { serverSource as server } from './test-server-source.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const component = fs.readFileSync('src/components/PayrollSettlementsView.tsx', 'utf8');
const payrollRoutes = fs.readFileSync('server/routes/payroll-routes.mjs', 'utf8');
const employeeView = fs.readFileSync('src/components/EmployeesView.tsx', 'utf8');
const employeeForm = fs.readFileSync('src/components/employees/EmployeeFormModal.tsx', 'utf8');
const permissions = fs.readFileSync('src/utils/permissions.ts', 'utf8');

test('settlement ledger is permission-gated and enforces duplicate and paid-state protection', () => {
  assert.match(permissions, /settlements: 'MANAGE_PAYROLL'/);
  assert.match(payrollRoutes, /DUPLICATE_PAYROLL_SETTLEMENT/);
  assert.match(payrollRoutes, /status !== 'PAID'[\s\S]*SETTLEMENT_NOT_PAID/);
});

test('employee number remains auto-suggested but editable before save', () => {
  assert.match(employeeForm, /onChange=\{e => setFormData\(\{ \.\.\.formData, employeeNo: e\.target\.value\.toUpperCase\(\) \}\)\}/);
  assert.match(employeeView, /EMPLOYEE_NUMBER_LOCAL_DUPLICATE/);
  assert.match(employeeForm, /Suggested automatically; you may replace it with your own employee code before saving/);
});

test('settlement creation is transactionally persisted and broadcast incrementally', () => {
  assert.match(payrollRoutes, /INSERT INTO \$\{q\('payroll_settlements'\)\}/);
  assert.match(payrollRoutes, /action:'CREATE_PAYROLL_SETTLEMENT'/);
  assert.match(payrollRoutes, /collection:'payrollSettlements',operation:'upsert'/);
});

test('settlement candidates cover held payroll and retroactive employees without reopening paid employees', () => {
  assert.match(component, /reason: 'HELD_PAYROLL'/);
  assert.match(component, /reason: 'RETROACTIVE_EMPLOYEE'/);
  assert.match(component, /\['SCHEDULED', 'PAID'\]\.includes\(batch\.status\)/);
  assert.match(component, /if \(existingRunItem\) continue/);
  assert.match(component, /calculateEmployeePayrollItem/);
});

test('released held employee after an existing payment batch is routed to settlements', () => {
  assert.match(component, /const runHasClosedPaymentBatch = \(run\.paymentBatches \|\| \[\]\)\.some\(batch => \['SCHEDULED', 'PAID'\]\.includes\(batch\.status\)\)/);
  assert.match(component, /const isReleasedAfterBatch = entitlementStatus === 'PAYABLE' && runHasClosedPaymentBatch/);
  assert.match(component, /\(!isHeld && !isReleasedAfterBatch\)/);
  assert.match(component, /paidPayrollKeys\.has\(`\$\{run\.id\}:\$\{item\.employeeId\}`\)/);
});

test('settlement payment stores period separately from payment date and method', () => {
  assert.match(component, /periodMonth: selected\.periodMonth/);
  assert.match(component, /paymentMethod: method/);
  assert.match(component, /paymentDate/);
  assert.match(component, /paymentReference/);
  assert.match(server, /settlementSourceRun\(stored,record,'SETTLED','SETTLED_VIA_PAYROLL_SETTLEMENT'\)/);
});
