import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const payroll = fs.readFileSync('src/components/PayrollRunsView.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const hardening = fs.readFileSync('scripts/apply-feature-hardening.mjs', 'utf8');
const paymentHardening = fs.readFileSync('scripts/apply-payment-selection-prior-balance.mjs', 'utf8');

// Regression coverage for production carry-forward and posting refresh behavior.
test('paid historical payroll periods are removed from carried balance before payment', () => {
  assert.match(payroll, /const priorPeriodTransferred = \(employeeId: string, periodMonth: string\)/);
  assert.match(payroll, /run\.periodMonth === periodMonth/);
  assert.match(payroll, /\['SCHEDULED', 'PAID'\]\.includes\(batch\.status\)/);
  assert.match(payroll, /const activeDetails = details\.filter\(row => !priorPeriodTransferred\(item\.employeeId, row\.periodMonth\)\)/);
  assert.match(payroll, /\.map\(normalizeCarriedBalance\)/);
});

test('payment batch persists normalized payroll items and totals', () => {
  assert.match(payroll, /const normalizedRun = normalizeRunCarriedBalances\(currentRun\)/);
  assert.match(payroll, /const updatedRun = \{ \.\.\.normalizedRun, paymentBatches:/);
  assert.match(payroll, /totalNetSalaries: sum\(item => Number\(item\.netSalary \|\| 0\)\)/);
});

test('posting waits for preceding persistence and normalizes stale carry forward', () => {
  assert.match(payroll, /const handleStatusChange = async/);
  assert.match(payroll, /if \(newStatus === 'POSTED' && onFlushPersistence\) await onFlushPersistence\(\)/);
  assert.match(payroll, /const postingBase = newStatus === 'POSTED' \? normalizeRunCarriedBalances\(currentRun\) : currentRun/);
  assert.match(app, /onFlushPersistence=\{async \(\) => \{ await persistenceQueueRef\.current\.catch\(\(\) => undefined\); \}\}/);
});

test('stale carry cleanup is integrated into the existing final payment hardening transform', () => {
  assert.match(hardening, /apply-payment-selection-prior-balance\.mjs/);
  assert.doesNotMatch(hardening, /apply-stale-prior-balance-posting-refresh\.mjs/);
  assert.match(paymentHardening, /normalizeCarriedBalance/);
  assert.match(paymentHardening, /onFlushPersistence/);
});
