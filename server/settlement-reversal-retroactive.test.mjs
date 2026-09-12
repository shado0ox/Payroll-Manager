import test from 'node:test';
import { serverSource as server } from './test-server-source.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const view = fs.readFileSync('src/components/PayrollSettlementsView.tsx', 'utf8');
const payrollRoutes = fs.readFileSync('server/routes/payroll-routes.mjs', 'utf8');

test('retroactive settlement scans every elapsed month from salary start date', () => {
  assert.match(view, /enumerateMonths\(salaryStartMonth, lastClosedMonth\)/);
  assert.match(view, /const lastClosedMonth = previousCalendarMonth\(\)/);
  assert.match(view, /const key = `RETRO:\$\{employee\.id\}:\$\{periodMonth\}`/);
  assert.doesNotMatch(view, /for \(const employee of companyEmployees\)[\s\S]{0,250}companyRuns\.filter\(item => \['APPROVED', 'POSTED'\]/);
});

test('retroactive first month uses actual salary start date with daily proration', () => {
  assert.match(view, /periodMonth === salaryStartMonth[\s\S]*prorateFirstMonth: true/);
  assert.match(view, /periodStart: periodMonth === salaryStartMonth \? salaryStartDate/);
});

test('settlement reversal is soft-delete with mandatory audit reason', () => {
  assert.match(view, /status: 'REVERSED'/);
  assert.match(view, /reversalReason: reason/);
  assert.match(view, /reason\.length < 5/);
  assert.match(server, /settlementSourceRun\(stored,record,'HELD','SETTLEMENT_REVERSED'\)/);
  assert.match(payrollRoutes, /SETTLEMENT_REVERSAL_REASON_REQUIRED/);
  assert.match(payrollRoutes, /REVERSED_SETTLEMENT_LOCKED/);
});

test('settlement reversal is transactionally persisted and audited', () => {
  assert.match(payrollRoutes, /SELECT company_id,status,payload[\s\S]*FOR UPDATE/);
  assert.match(payrollRoutes, /action:'REVERSE_PAYROLL_SETTLEMENT'/);
  assert.match(payrollRoutes, /await client\.query\('COMMIT'\)[\s\S]*broadcastStateUpdate/);
});
