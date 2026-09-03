import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const server = fs.readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');

test('tenant-period tables have company-leading indexes', () => {
  assert.match(server, /attendance_company_period_idx.*attendance_records.*\(company_id,period_month\)/);
  assert.match(server, /penalties_company_period_idx.*penalties.*\(company_id,period_month\)/);
  assert.match(server, /earnings_company_period_idx.*temporary_earnings.*\(company_id,period_month\)/);
  assert.match(server, /payroll_runs_company_period_idx.*payroll_runs.*\(company_id,period_month DESC\)/);
  assert.match(server, /payroll_settlements_company_period_idx.*payroll_settlements.*\(company_id,period_month DESC\)/);
  assert.match(server, /journal_batches_company_period_idx.*journal_batches.*\(company_id,period_month\)/);
});

test('tenant-only operational tables have company indexes', () => {
  assert.match(server, /leaves_company_idx.*leave_requests.*\(company_id\)/);
  assert.match(server, /loans_company_idx.*loans.*\(company_id\)/);
  assert.match(server, /employees_company_idx.*employees.*\(company_id,status\)/);
});
