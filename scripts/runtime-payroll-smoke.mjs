import assert from 'node:assert/strict';

const baseUrl = process.env.CI_BASE_URL || 'http://127.0.0.1:3034';
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'TestAdmin1!';
const companyCode = process.env.COMPANY_CODE || '101';
const companyId = process.env.COMPANY_ID || 'comp-1';

let cookie = '';
let version = 0;

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return { response, body };
}

async function waitForHealth() {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const { body } = await request('/api/health');
      if (body?.status === 'ok') return;
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw lastError || new Error('Server did not become healthy');
}

async function loadState() {
  const { body } = await request('/api/state');
  version = Number(body.version || 0);
  return body.state;
}

async function patchCollections(collections) {
  const { body } = await request('/api/state/patch', {
    method: 'PATCH',
    body: JSON.stringify({ patch: { collections, objects: {} }, version }),
  });
  version = Number(body.version || version);
}

function findRun(state, id) {
  return (state?.payrollRuns || []).find(run => run.id === id);
}

await waitForHealth();

const login = await request('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ companyCode, username: adminUsername, password: adminPassword }),
});
const setCookie = login.response.headers.get('set-cookie') || '';
cookie = setCookie.split(';')[0];
assert.match(cookie, /^masar_session=/, 'Login must issue a Masar session cookie');

await loadState();

const employeeId = 'ci-runtime-employee-1';
const runId = 'ci-runtime-payroll-2026-08';
const itemId = 'ci-runtime-item-1';
const batchId = 'ci-runtime-payment-1';
const now = new Date().toISOString();

const employee = {
  id: employeeId,
  companyId,
  employeeNo: 'CI001',
  firstNameAr: 'اختبار',
  lastNameAr: 'تشغيلي',
  firstNameEn: 'Runtime',
  lastNameEn: 'Test',
  nationalIdOrIqama: 'CI-RUNTIME-001',
  nationality: 'NON_SAUDI',
  country: 'TEST',
  email: 'runtime.employee@example.test',
  phone: '0000000000',
  department: 'CI',
  jobTitle: 'Runtime Tester',
  costCenterId: '',
  hireDate: '2026-08-01',
  salaryStartDate: '2026-08-01',
  status: 'ACTIVE',
  bankName: 'CI Bank',
  bankIban: 'SA0000000000000000000000',
  salaryPackage: {
    baseSalary: 1000,
    housingAllowance: 0,
    transportAllowance: 0,
    otherFixedAllowances: 0,
    customAllowances: [],
    customDeductions: [],
  },
};

const item = {
  id: itemId,
  payrollRunId: runId,
  employeeId,
  employeeNo: 'CI001',
  employeeName: 'Runtime Test',
  department: 'CI',
  costCenterId: '',
  nationality: 'NON_SAUDI',
  bankIban: employee.bankIban,
  bankName: employee.bankName,
  baseSalary: 1000,
  housingAllowance: 0,
  transportAllowance: 0,
  otherAllowances: 0,
  overtimeAmount: 0,
  overtimeHours: 0,
  bonuses: 0,
  totalGrossSalary: 1000,
  delayMinutes: 0,
  delayDeduction: 0,
  absenceDays: 0,
  absenceDeduction: 0,
  unpaidLeaveDays: 0,
  unpaidLeaveDeduction: 0,
  gosiEmployeeShare: 0,
  loanDeduction: 0,
  penaltiesDeduction: 0,
  otherDeductions: 0,
  totalDeductions: 0,
  netSalary: 1000,
  gosiEmployerShare: 0,
  totalCompanyBurden: 1000,
  entitlementStatus: 'PAYABLE',
  isSuspended: false,
  warningFlags: [],
};

const baseRun = {
  id: runId,
  companyId,
  periodMonth: '2026-08',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
  status: 'UNDER_REVIEW',
  createdAt: now,
  calculatedAt: now,
  employeesCount: 1,
  totalBaseSalaries: 1000,
  totalAllowances: 0,
  totalOvertime: 0,
  totalGrossSalaries: 1000,
  totalAbsenceDeductions: 0,
  totalDelayDeductions: 0,
  totalGosiEmployee: 0,
  totalGosiEmployer: 0,
  totalLoanDeductions: 0,
  totalPenalties: 0,
  totalDeductions: 0,
  totalNetSalaries: 1000,
  totalCompanyCost: 1000,
  items: [item],
  paymentBatches: [],
};

await patchCollections({
  employees: { upsert: [employee], deleteIds: [] },
  payrollRuns: { upsert: [baseRun], deleteIds: [] },
});
let state = await loadState();
assert.equal(findRun(state, runId)?.status, 'UNDER_REVIEW');

const approvedAt = new Date().toISOString();
const approvedRun = { ...baseRun, status: 'APPROVED', approvedAt, approvedBy: 'CI Admin' };
await patchCollections({ payrollRuns: { upsert: [approvedRun], deleteIds: [] } });
state = await loadState();
let persisted = findRun(state, runId);
assert.equal(persisted?.status, 'APPROVED', 'Approval must persist after a fresh GET /api/state');
assert.ok(persisted?.approvedAt, 'Approved timestamp must persist');

const scheduledBatch = {
  id: batchId,
  batchNumber: 'PAY-202608-CI001',
  payrollRunId: runId,
  companyId,
  periodMonth: '2026-08',
  employeeIds: [employeeId],
  employeesCount: 1,
  totalAmount: 1000,
  method: 'BANK_TRANSFER',
  status: 'SCHEDULED',
  scheduledDate: '2026-08-30',
  reference: 'CI-RUNTIME',
  notes: 'Automated runtime smoke test',
  createdAt: new Date().toISOString(),
};
const scheduledRun = { ...approvedRun, paymentBatches: [scheduledBatch] };
await patchCollections({ payrollRuns: { upsert: [scheduledRun], deleteIds: [] } });
state = await loadState();
persisted = findRun(state, runId);
assert.equal(persisted?.paymentBatches?.[0]?.status, 'SCHEDULED', 'Scheduled bank batch must persist');

const paidRun = {
  ...scheduledRun,
  paymentBatches: [{ ...scheduledBatch, status: 'PAID', paymentDate: '2026-08-30' }],
};
await patchCollections({ payrollRuns: { upsert: [paidRun], deleteIds: [] } });
state = await loadState();
persisted = findRun(state, runId);
assert.equal(persisted?.status, 'APPROVED');
assert.equal(persisted?.paymentBatches?.[0]?.status, 'PAID', 'Paid confirmation must persist after reload');
assert.equal(persisted?.paymentBatches?.[0]?.totalAmount, 1000);
assert.deepEqual(persisted?.paymentBatches?.[0]?.employeeIds, [employeeId]);

const normalization = await request('/api/admin/database/normalization-status');
assert.equal(normalization.body?.status?.counts_match, true, 'Normalized PostgreSQL tables must match compatibility state');

console.log('Runtime payroll smoke test passed: approval -> reload -> scheduled batch -> paid -> reload.');
