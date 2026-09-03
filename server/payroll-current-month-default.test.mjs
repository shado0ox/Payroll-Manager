import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const payroll = fs.readFileSync('src/components/PayrollRunsView.tsx', 'utf8');
const period = fs.readFileSync('src/utils/period.ts', 'utf8');

test('payroll screen defaults to the current operating month', () => {
  assert.match(payroll, /useState<string>\(currentPeriod\)/);
});

test('switching company resets payroll to current month', () => {
  assert.match(payroll, /setSelectedPeriod\(currentPeriod\)/);
  assert.match(payroll, /\[company\.id, currentPeriod\]/);
});

test('current payroll month uses the company timezone', () => {
  assert.match(payroll, /getCurrentPeriod\(company\.timezone \|\| 'Asia\/Riyadh'\)/);
  assert.match(period, /Intl\.DateTimeFormat\('en-US'/);
  assert.match(period, /timeZone/);
});
