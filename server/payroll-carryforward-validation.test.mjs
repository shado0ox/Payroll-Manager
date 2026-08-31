import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePayrollCarryForwardState } from './payroll-carryforward-validation.mjs';

const heldItem = {
  id: 'item-aug-1', employeeId: 'emp-1', employeeNo: 'E001', employeeName: 'Employee One',
  entitlementStatus: 'HELD', entitlementReason: 'MISSING_BANK_ACCOUNT', netSalary: 500,
};
const currentItem = {
  id: 'item-sep-1', employeeId: 'emp-1', employeeNo: 'E001', employeeName: 'Employee One',
  entitlementStatus: 'PAYABLE', netSalary: 4500,
};
const priorRef = {
  sourcePayrollRunId: 'run-aug', sourcePayrollItemId: 'item-aug-1', sourcePeriodMonth: '2026-08',
  employeeId: 'emp-1', employeeNo: 'E001', employeeName: 'Employee One', amount: 500,
};
const makeRuns = (batchOverrides = {}) => [
  { id: 'run-aug', companyId: 'comp-1', periodMonth: '2026-08', items: [heldItem], paymentBatches: [] },
  {
    id: 'run-sep', companyId: 'comp-1', periodMonth: '2026-09', items: [currentItem],
    paymentBatches: [{ id: 'batch-1', status: 'SCHEDULED', employeeIds: ['emp-1'], totalAmount: 5000, priorEntitlements: [priorRef], ...batchOverrides }],
  },
];

const expectCode = (fn, code) => assert.throws(fn, error => error?.message === code && error?.status === 409);

test('accepts 500 prior held plus 4500 current as a 5000 payment batch', () => {
  assert.doesNotThrow(() => validatePayrollCarryForwardState([], makeRuns()));
});

test('rejects tampered prior entitlement amount', () => {
  const runs = makeRuns({ priorEntitlements: [{ ...priorRef, amount: 550 }], totalAmount: 5050 });
  expectCode(() => validatePayrollCarryForwardState([], runs), 'PRIOR_ENTITLEMENT_AMOUNT_MISMATCH');
});

test('rejects wrong employee/source reference', () => {
  const runs = makeRuns({ priorEntitlements: [{ ...priorRef, employeeId: 'emp-2' }] });
  expectCode(() => validatePayrollCarryForwardState([], runs), 'PRIOR_ENTITLEMENT_EMPLOYEE_MISMATCH');
});

test('rejects a source item that is not held for missing bank account', () => {
  const runs = makeRuns();
  runs[0].items[0] = { ...heldItem, entitlementStatus: 'PAYABLE', entitlementReason: undefined };
  expectCode(() => validatePayrollCarryForwardState([], runs), 'PRIOR_ENTITLEMENT_SOURCE_NOT_HELD_FOR_BANK');
});

test('rejects same-period or future-period carry-forward', () => {
  const runs = makeRuns();
  runs[0].periodMonth = '2026-09';
  expectCode(() => validatePayrollCarryForwardState([], runs), 'PRIOR_ENTITLEMENT_PERIOD_INVALID');
});

test('rejects duplicate reservation of the same held entitlement', () => {
  const runs = makeRuns();
  runs[1].paymentBatches.push({ id: 'batch-2', status: 'SCHEDULED', employeeIds: ['emp-1'], totalAmount: 5000, priorEntitlements: [priorRef] });
  expectCode(() => validatePayrollCarryForwardState([], runs), 'PRIOR_ENTITLEMENT_ALREADY_RESERVED');
});

test('rejects a batch total that does not equal current plus prior entitlement', () => {
  const runs = makeRuns({ totalAmount: 4500 });
  expectCode(() => validatePayrollCarryForwardState([], runs), 'PAYMENT_BATCH_TOTAL_MISMATCH');
});

test('keeps an active stored reservation owned by the same batch', () => {
  const stored = makeRuns();
  const incoming = makeRuns({ status: 'PAID' });
  assert.doesNotThrow(() => validatePayrollCarryForwardState(stored, incoming));
});
