import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const payroll = fs.readFileSync(new URL('../src/components/PayrollRunsView.tsx', import.meta.url), 'utf8');

test('payroll screen uses server-confirmed persistence handler', () => {
  assert.match(app, /handleSavePayrollRunConfirmed/);
  assert.match(app, /persistenceQueueRef\.current\.catch\(\(\) => undefined\)\.then\(\(\) => api\.savePayrollRun\(run\)\)/);
  assert.match(app, /onSavePayrollRun=\{handleSavePayrollRunConfirmed\}/);
  assert.doesNotMatch(app, /await api\.saveState\(nextState\)/);
});

test('payroll callback contract is asynchronous and reports persistence success', () => {
  assert.match(payroll, /onSavePayrollRun: \(run: PayrollRun\) => Promise<boolean>/);
});
