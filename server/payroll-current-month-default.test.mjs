import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const payroll = fs.readFileSync('src/components/PayrollRunsView.tsx', 'utf8');

test('payroll screen defaults to the current operating month', () => {
  assert.match(payroll, /useState<string>\(currentPeriod\)/);
});

test('switching company resets payroll to current month', () => {
  assert.match(payroll, /setSelectedPeriod\(currentPeriod\)/);
  assert.match(payroll, /\[company\.id, currentPeriod\]/);
});

test('current payroll month uses browser local date', () => {
  assert.match(payroll, /currentDate\.getFullYear\(\)/);
  assert.match(payroll, /currentDate\.getMonth\(\) \+ 1/);
});
