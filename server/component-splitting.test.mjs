import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const payroll = fs.readFileSync('src/components/PayrollRunsView.tsx', 'utf8');
const company = fs.readFileSync('src/components/CompanyProfileView.tsx', 'utf8');
const payrollTable = fs.readFileSync('src/components/payroll/PayrollRunItemsTable.tsx', 'utf8');
const paymentModal = fs.readFileSync('src/components/payroll/PayrollPaymentBatchModal.tsx', 'utf8');
const companyTabs = fs.readFileSync('src/components/company/CompanyProfileTabs.tsx', 'utf8');

test('large views delegate stable sections to memoized child components', () => {
  assert.match(payroll, /<PayrollRunItemsTable/);
  assert.match(payroll, /<PayrollPaymentBatchModal/);
  assert.match(company, /<CompanyProfileTabs/);
  assert.match(payrollTable, /React\.memo/);
  assert.match(paymentModal, /React\.memo/);
  assert.match(companyTabs, /React\.memo/);
});

test('prior balance remains owned by the payroll item table after compact mobile rendering', () => {
  assert.match(payrollTable, /priorPeriodNet/);
  assert.match(payrollTable, /item\.overtimeAmount \+ item\.bonuses \+ Number\(item\.priorPeriodNet \|\| 0\)/);
});

test('large-view render filters and reductions are memoized', () => {
  assert.match(payroll, /const paymentSummary = useMemo/);
  assert.match(payroll, /const eligibleFilteredItems = useMemo/);
  assert.match(payroll, /const selectedPaymentItems = useMemo/);
  assert.match(payroll, /const totalWarnings = useMemo/);
  assert.match(company, /const departmentEmployeesByName = useMemo/);
  assert.match(company, /const costCenterEmployeeCounts = useMemo/);
  assert.match(company, /const activeBankDefinitions = useMemo/);
  assert.match(company, /const assignableRoles = useMemo/);
});
