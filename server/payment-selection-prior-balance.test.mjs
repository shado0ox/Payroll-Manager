import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const payroll = fs.readFileSync('src/components/PayrollRunsView.tsx', 'utf8');
const hardening = fs.readFileSync('scripts/apply-feature-hardening.mjs', 'utf8');

test('payment batch selection is limited to currently eligible selected employees', () => {
  assert.match(payroll, /selectedPaymentEmployeeIds\.includes\(item\.employeeId\)/);
  assert.match(payroll, /\(item\.entitlementStatus \|\| 'PAYABLE'\) === 'PAYABLE'/);
  assert.match(payroll, /!committedEmployeeIds\.has\(item\.employeeId\)/);
  assert.match(payroll, /const stillEligible = selectedPaymentItems/);
  assert.match(payroll, /\(\{selectedPaymentItems\.length\}\)/);
});

test('prior-period balance is shown in additions detail instead of employee warning text', () => {
  assert.match(payroll, /tr\('رصيد سابق', 'Prior balance'\)/);
  assert.match(payroll, /item\.priorPeriodDetails/);
  assert.match(payroll, /warningFlags: calculated\.warningFlags/);
  assert.doesNotMatch(payroll, /رصيد فترات سابقة غير محول/);
});

test('payment selection hardening runs after editable deduction period transform', () => {
  const period = hardening.indexOf("apply-editable-deduction-period.mjs");
  const selection = hardening.indexOf("apply-payment-selection-prior-balance.mjs");
  assert.ok(period >= 0 && selection > period);
});
