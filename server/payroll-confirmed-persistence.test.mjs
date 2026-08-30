import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const payroll = fs.readFileSync(new URL('../src/components/PayrollRunsView.tsx', import.meta.url), 'utf8');

test('payroll screen uses server-confirmed persistence handler', () => {
  assert.match(app, /handleSavePayrollRunConfirmed/);
  assert.match(app, /await persistenceQueueRef\.current/);
  assert.match(app, /await api\.saveState\(nextState\)/);
  assert.match(app, /remoteStateSnapshotRef\.current = nextState/);
  assert.match(app, /onSavePayrollRun=\{handleSavePayrollRunConfirmed\}/);
});

test('payroll callback contract is asynchronous and reports persistence success', () => {
  assert.match(payroll, /onSavePayrollRun: \(run: PayrollRun\) => Promise<boolean>/);
});
