import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const payroll = fs.readFileSync(new URL('../src/components/PayrollRunsView.tsx', import.meta.url), 'utf8');

test('approved and posted payroll cannot be recalculated directly', () => {
  assert.match(payroll, /\['APPROVED', 'POSTED'\]\.includes\(currentRun\.status\)/);
});

test('scheduled and paid batches block recalculation', () => {
  assert.match(payroll, /\['SCHEDULED', 'PAID'\]\.includes\(batch\.status\)/);
});

test('bank export remains separate from paid confirmation', () => {
  assert.match(payroll, /status:\s*'SCHEDULED'/);
  assert.match(payroll, /handlePaymentBatchStatus\(batch\.id, 'PAID'\)/);
});
