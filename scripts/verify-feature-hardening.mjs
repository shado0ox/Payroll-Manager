import fs from 'node:fs';

const requirements = {
  'server/index.mjs': [
    "app.put('/api/employees/:id'",
    "app.put('/api/payroll-runs/:id'",
    'LEGACY_EMPLOYEE_IDENTITY_COMPAT',
    'attendance_company_period_idx',
    'penalties_company_period_idx',
    'earnings_company_period_idx',
  ],
  'src/App.tsx': ['await api.saveEmployee(employee)', 'subscribeStateEvents'],
  'src/components/PayrollRunsView.tsx': [
    "from './payroll/PayrollRunItemsTable'",
    "from './payroll/PayrollPaymentBatchModal'",
    'const paymentSummary = useMemo',
    "getCurrentPeriod(company.timezone || 'Asia/Riyadh')",
    'priorPeriodNet',
  ],
  'src/components/EmployeesView.tsx': ['IQAMA_HOLDER', 'onboardingStatus'],
  'src/components/LoansPenaltiesView.tsx': ['penaltyPeriodFrom', 'penaltyPeriodTo'],
  'src/components/payroll/PayrollRunItemsTable.tsx': ['React.memo', 'priorPeriodNet'],
  'src/components/payroll/PayrollPaymentBatchModal.tsx': ['React.memo'],
  'src/components/company/CompanyProfileTabs.tsx': ['React.memo'],
};

const missing = [];
for (const [path, markers] of Object.entries(requirements)) {
  if (!fs.existsSync(path)) {
    missing.push(`${path}: file missing`);
    continue;
  }
  const source = fs.readFileSync(path, 'utf8');
  for (const marker of markers) {
    if (!source.includes(marker)) missing.push(`${path}: ${marker}`);
  }
}

if (missing.length) {
  console.error('Feature source verification failed:\n' + missing.map(item => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log('Feature source verification passed; no files were modified.');
