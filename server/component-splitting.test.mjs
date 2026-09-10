import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const payroll = fs.readFileSync('src/components/PayrollRunsView.tsx', 'utf8');
const company = fs.readFileSync('src/components/CompanyProfileView.tsx', 'utf8');
const payrollTable = fs.readFileSync('src/components/payroll/PayrollRunItemsTable.tsx', 'utf8');
const paymentModal = fs.readFileSync('src/components/payroll/PayrollPaymentBatchModal.tsx', 'utf8');
const companyTabs = fs.readFileSync('src/components/company/CompanyProfileTabs.tsx', 'utf8');
const companyDetails = fs.readFileSync('src/components/company/CompanyDetailsTab.tsx', 'utf8');
const companyBanking = fs.readFileSync('src/components/company/CompanyBankingTab.tsx', 'utf8');
const companyQoyod = fs.readFileSync('src/components/company/CompanyQoyodTab.tsx', 'utf8');
const companyUsers = fs.readFileSync('src/components/company/CompanyUsersTab.tsx', 'utf8');
const companyDepartments = fs.readFileSync('src/components/company/CompanyDepartmentsTab.tsx', 'utf8');
const companyCostCenters = fs.readFileSync('src/components/company/CompanyCostCentersTab.tsx', 'utf8');
const companyPolicies = fs.readFileSync('src/components/company/CompanyPayrollPoliciesTab.tsx', 'utf8');
const companyAccounts = fs.readFileSync('src/components/company/CompanyAccountsTab.tsx', 'utf8');
const companyDangerZone = fs.readFileSync('src/components/company/CompanyDangerZoneTab.tsx', 'utf8');
const employeeImportPreview = fs.readFileSync('src/components/employees/EmployeeImportPreviewModal.tsx', 'utf8');
const employeesTable = fs.readFileSync('src/components/employees/EmployeesTable.tsx', 'utf8');
const employeeFormModal = fs.readFileSync('src/components/employees/EmployeeFormModal.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');

test('large views delegate stable sections to memoized child components', () => {
  assert.match(payroll, /<PayrollRunItemsTable/);
  assert.match(payroll, /<PayrollPaymentBatchModal/);
  assert.match(company, /<CompanyProfileTabs/);
  assert.match(company, /<CompanyDetailsTab/);
  assert.match(company, /<CompanyBankingTab/);
  assert.match(company, /<CompanyQoyodTab/);
  assert.match(company, /<CompanyUsersTab/);
  assert.match(company, /<CompanyDepartmentsTab/);
  assert.match(company, /<CompanyCostCentersTab/);
  assert.match(company, /<CompanyPayrollPoliciesTab/);
  assert.match(company, /<CompanyAccountsTab/);
  assert.match(company, /<CompanyDangerZoneTab/);
  assert.match(fs.readFileSync('src/components/EmployeesView.tsx', 'utf8'), /<EmployeeImportPreviewModal/);
  assert.match(fs.readFileSync('src/components/EmployeesView.tsx', 'utf8'), /<EmployeesTable/);
  assert.match(fs.readFileSync('src/components/EmployeesView.tsx', 'utf8'), /<EmployeeFormModal/);
  assert.match(payrollTable, /React\.memo/);
  assert.match(paymentModal, /React\.memo/);
  assert.match(companyTabs, /React\.memo/);
  assert.match(companyDetails, /React\.memo/);
  assert.match(companyBanking, /React\.memo/);
  assert.match(companyQoyod, /React\.memo/);
  assert.match(companyUsers, /React\.memo/);
  assert.match(companyDepartments, /React\.memo/);
  assert.match(companyCostCenters, /React\.memo/);
  assert.match(companyPolicies, /React\.memo/);
  assert.match(companyAccounts, /React\.memo/);
  assert.match(companyDangerZone, /React\.memo/);
  assert.match(employeeImportPreview, /React\.memo/);
  assert.match(employeesTable, /React\.memo/);
  assert.match(employeeFormModal, /React\.memo/);
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
  assert.match(companyDepartments, /const departmentEmployeesByName = useMemo/);
  assert.match(companyCostCenters, /const costCenterEmployeeCounts = useMemo/);
  assert.match(company, /const activeBankDefinitions = useMemo/);
  assert.match(companyUsers, /const assignableRoles = useMemo/);
});

test('authenticated views and closed modals are loaded only when requested', () => {
  for (const component of [
    'DashboardView','CompanyProfileView','EmployeesView','PayrollRunsView','PayrollSettlementsView',
    'AttendanceLeavesView','LoansPenaltiesView','AccountingJournalsView','ReportsView','UserManagementView',
    'SettingsView','AuditLogsView','EmployeeStatementModal','QoyodIntegrationModal','DatabaseStatusModal',
  ]) {
    assert.match(app, new RegExp(`const ${component} = lazy\\(\\(\\) => import\\('\\./components/${component}'\\)`));
    assert.doesNotMatch(app, new RegExp(`import \\{ ${component} \\} from`));
  }
  assert.match(app, /<Suspense fallback={<ViewLoadingFallback language={language} \/>}>/);
  assert.match(app, /statementSelection && \(\s*<Suspense fallback={null}>/);
  assert.match(app, /canViewDatabaseTools && isDbModalOpen && \(/);
});
