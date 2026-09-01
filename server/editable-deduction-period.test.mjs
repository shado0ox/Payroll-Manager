import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const component = fs.readFileSync('src/components/LoansPenaltiesView.tsx', 'utf8');
const payroll = fs.readFileSync('src/components/PayrollRunsView.tsx', 'utf8');

test('deduction payroll period is explicitly editable', () => {
  assert.match(component, /type="month"/);
  assert.match(component, /value=\{penaltyForm\.periodMonth\}/);
  assert.match(component, /periodMonth: e\.target\.value/);
  assert.match(component, /فترة الراتب التي يطبق عليها الخصم/);
});

test('selected prior deduction period is consumed by prior-period recalculation', () => {
  assert.match(payroll, /penalties\.filter\(p => p\.employeeId === emp\.id && p\.periodMonth === cursor/);
});
