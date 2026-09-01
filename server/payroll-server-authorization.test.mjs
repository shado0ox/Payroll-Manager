import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');

test('payroll status transitions are authorized on the server', () => {
  assert.match(server, /validatePayrollWorkflowChanges/);
  assert.match(server, /UNDER_REVIEW->APPROVED/);
  assert.match(server, /APPROVE_PAYROLL_REQUIRED/);
  assert.match(server, /APPROVED->POSTED/);
  assert.match(server, /POST_PAYROLL_REQUIRED/);
});

test('approved payroll locks transferred employees and paid payment batches, not the whole month', () => {
  assert.match(server, /TRANSFERRED_EMPLOYEE_PAYROLL_IMMUTABLE/);
  assert.match(server, /lockedEmployeeIds/);
  assert.match(server, /\['SCHEDULED','PAID'\]\.includes\(batch\.status\)/);
  assert.match(server, /PAID_PAYROLL_CANNOT_REOPEN/);
  assert.match(server, /PAID_BATCH_IMMUTABLE/);
  assert.match(server, /PAYMENT_BATCH_CANNOT_BE_DELETED/);
  assert.doesNotMatch(server, /APPROVED_PAYROLL_IMMUTABLE/);
});

test('payroll source inputs lock only for employees reserved or paid in a transfer batch', () => {
  assert.match(server, /employeePaymentLocked/);
  assert.match(server, /asArray\(batch\.employeeIds\)\.includes\(record\.employeeId\)/);
  assert.match(server, /if \(!employeePaymentLocked\) return false/);
  assert.match(server, /PAYROLL_SOURCE_ENTRY_LOCKED/);
});

test('payment execution requires an explicit scheduled-to-paid transition', () => {
  assert.match(server, /SCHEDULED->PAID/);
  assert.match(server, /NEW_PAYMENT_BATCH_MUST_BE_SCHEDULED/);
  assert.match(server, /PAYMENT_BATCH_SCOPE_CHANGED/);
  assert.match(server, /SCHEDULED_BATCH_IMMUTABLE/);
});

test('workflow authorization errors are returned as client errors', () => {
  assert.match(server, /Number\.isInteger\(e\?\.status\).*res\.status\(e\.status\)/s);
});
