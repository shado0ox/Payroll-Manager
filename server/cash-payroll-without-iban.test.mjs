import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const payrollView=fs.readFileSync('src/components/PayrollRunsView.tsx','utf8');
const banking=fs.readFileSync('src/components/company/CompanyBankingTab.tsx','utf8');
const routes=fs.readFileSync('server/routes/payroll-routes.mjs','utf8');
const server=fs.readFileSync('server/index.mjs','utf8');

test('cash payroll without IBAN is an opt-in company setting',()=>{
  assert.match(server,/allowCashPayrollWithoutIban:false/);
  assert.match(banking,/allowCashPayrollWithoutIban/);
  assert.match(banking,/دفعة كاش فقط/);
});

test('enabled cash payroll releases only the automatic missing-bank hold',()=>{
  assert.match(payrollView,/cashWithoutIbanAllowed = company\.allowCashPayrollWithoutIban === true/);
  assert.match(payrollView,/\(hasReadyBankAccount \|\| cashWithoutIbanAllowed\)/);
  assert.match(payrollView,/!hasReadyBankAccount && !cashWithoutIbanAllowed/);
});

test('payment batches enforce cash-only handling for employees without IBAN',()=>{
  assert.match(routes,/batch\.method !== 'CASH'.*PAYMENT_BATCH_IBAN_REQUIRED/);
  assert.match(routes,/batch\.method === 'CASH'.*company\?\.allowCashPayrollWithoutIban !== true/);
  assert.match(routes,/CASH_WITHOUT_IBAN_NOT_ALLOWED/);
  assert.match(payrollView,/paymentBatchForm\.method === 'CASH'.*!company\.allowCashPayrollWithoutIban/);
});
