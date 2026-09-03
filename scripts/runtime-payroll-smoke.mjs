import assert from 'node:assert/strict';
import pg from 'pg';

const { Pool } = pg;
const baseUrl = process.env.CI_BASE_URL || 'http://127.0.0.1:3034';
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'TestAdmin1!';
const companyCode = process.env.COMPANY_CODE || '101';
const companyId = process.env.COMPANY_ID || 'comp-1';
const schema = process.env.DB_SCHEMA || 'masar_payroll';

if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('DB_SCHEMA is invalid');

let cookie = '';

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
  return body.state;
}

async function initializeCompatibilityStateIfMissing() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  try {
    const existing = await pool.query(`SELECT 1 FROM "${schema}".app_state WHERE id=1`);
    if (!existing.rowCount) {
      await pool.query(
        `INSERT INTO "${schema}".app_state (id,state,version) VALUES (1,$1::jsonb,0)`,
        [JSON.stringify({ companies: [], employees: [], payrollRuns: [], attendance: [], leaves: [], loans: [], penalties: [], temporaryEarnings: [], journals: [], auditLogs: [] })],
      );
    }
  } finally {
    await pool.end();
  }
}

function findRun(state, id) {
  return (state?.payrollRuns || []).find(run => run.id === id);
}

await waitForHealth();
await initializeCompatibilityStateIfMissing();

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

await request(`/api/employees/${employeeId}`, {
  method: 'PUT',
  body: JSON.stringify(employee),
});
await request(`/api/payroll-runs/${runId}`, {
  method: 'PUT',
  body: JSON.stringify(baseRun),
});
let state = await loadState();
assert.equal(findRun(state, runId)?.status, 'UNDER_REVIEW');

await request(`/api/payroll-runs/${runId}/status`, {
  method: 'POST',
  body: JSON.stringify({ status: 'APPROVED' }),
});
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
await request(`/api/payroll-runs/${runId}/payment-batches`, {
  method: 'POST',
  body: JSON.stringify(scheduledBatch),
});
state = await loadState();
persisted = findRun(state, runId);
assert.equal(persisted?.paymentBatches?.[0]?.status, 'SCHEDULED', 'Scheduled bank batch must persist');

await request(`/api/payroll-runs/${runId}/payment-batches/${batchId}/status`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'PAID', paymentDate: '2026-08-30' }),
});
state = await loadState();
persisted = findRun(state, runId);
assert.equal(persisted?.status, 'APPROVED');
assert.equal(persisted?.paymentBatches?.[0]?.status, 'PAID', 'Paid confirmation must persist after reload');
assert.equal(persisted?.paymentBatches?.[0]?.totalAmount, 1000);
assert.deepEqual(persisted?.paymentBatches?.[0]?.employeeIds, [employeeId]);

const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
try {
  const [runRow, itemRow, batchRow, batchItemRow] = await Promise.all([
    db.query(`SELECT status,total_net_salaries::text,approved_at FROM "${schema}".payroll_runs WHERE id=$1`, [runId]),
    db.query(`SELECT net_salary::text,entitlement_status FROM "${schema}".payroll_run_items WHERE payroll_run_id=$1 AND id=$2`, [runId, itemId]),
    db.query(`SELECT status,total_amount::text,payment_date FROM "${schema}".payroll_payment_batches WHERE id=$1`, [batchId]),
    db.query(`SELECT employee_id FROM "${schema}".payroll_payment_batch_items WHERE payment_batch_id=$1`, [batchId]),
  ]);
  assert.equal(runRow.rows[0]?.status, 'APPROVED', 'Normalized payroll run must remain approved');
  assert.equal(Number(runRow.rows[0]?.total_net_salaries), 1000, 'Normalized payroll run total must match');
  assert.ok(runRow.rows[0]?.approved_at, 'Normalized approval timestamp must persist');
  assert.equal(Number(itemRow.rows[0]?.net_salary), 1000, 'Normalized payroll item net salary must match');
  assert.equal(itemRow.rows[0]?.entitlement_status, 'PAYABLE');
  assert.equal(batchRow.rows[0]?.status, 'PAID', 'Normalized payment batch must be paid');
  assert.equal(Number(batchRow.rows[0]?.total_amount), 1000, 'Normalized payment amount must match');
  assert.ok(batchRow.rows[0]?.payment_date, 'Normalized payment date must persist');
  assert.deepEqual(batchItemRow.rows.map(row => row.employee_id), [employeeId], 'Normalized payment batch employees must match');
} finally {
  await db.end();
}

console.log('Runtime payroll smoke test passed through dedicated employee and payroll endpoints: approval -> reload -> scheduled batch -> paid -> reload + normalized PostgreSQL verification.');
