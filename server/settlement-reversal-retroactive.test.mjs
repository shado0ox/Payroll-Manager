import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const view = fs.readFileSync('src/components/PayrollSettlementsView.tsx', 'utf8');
const server = fs.readFileSync('server/index.mjs','utf8');
const hardening = fs.readFileSync('scripts/apply-feature-hardening.mjs', 'utf8');
const reversalTransform = fs.readFileSync('scripts/apply-settlement-reversal-audit.mjs', 'utf8');

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
  assert.match(reversalTransform, /SETTLEMENT_REVERSAL_REASON_REQUIRED/);
  assert.match(reversalTransform, /REVERSED_SETTLEMENT_LOCKED/);
});

test('settlement reversal hardening runs after PR21 settlement transforms', () => {
  const ledger = hardening.indexOf("./apply-payroll-settlements-ledger.mjs");
  const restore = hardening.indexOf("./apply-pr21-patchable-anchor-restore.mjs");
  const reversal = hardening.indexOf("./apply-settlement-reversal-audit.mjs");
  assert.ok(ledger >= 0 && restore > ledger && reversal > restore);
});
