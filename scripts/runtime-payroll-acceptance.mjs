import assert from 'node:assert/strict';
import pg from 'pg';

const { Pool } = pg;
const baseUrl = process.env.CI_BASE_URL || 'http://127.0.0.1:3034';
const databaseUrl = process.env.DATABASE_URL || '';
const schema = process.env.DB_SCHEMA || 'masar_payroll';
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'TestAdmin1!';
const companyCode = process.env.COMPANY_CODE || '101';
const companyId = process.env.COMPANY_ID || 'comp-1';
const priorPeriod = process.env.ACCEPTANCE_PRIOR_PERIOD || '2090-01';
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(priorPeriod)) throw new Error('ACCEPTANCE_PRIOR_PERIOD must use YYYY-MM');
const [priorYear,priorMonthNumber] = priorPeriod.split('-').map(Number);
const currentPeriodDate = new Date(Date.UTC(priorYear,priorMonthNumber,1));
const currentPeriod = currentPeriodDate.toISOString().slice(0,7);
const periodEnd = period => {
  const [year,month] = period.split('-').map(Number);
  return new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
};

if (process.env.ACCEPTANCE_CONFIRM_ISOLATED_DB !== 'YES') {
  throw new Error('Set ACCEPTANCE_CONFIRM_ISOLATED_DB=YES only after targeting a disposable restored database.');
}
const parsedDatabaseUrl = new URL(databaseUrl);
const databaseName = parsedDatabaseUrl.pathname.replace(/^\//, '');
if (!/(acceptance|test|restore|sandbox|staging)/i.test(databaseName)) {
  throw new Error(`Refusing acceptance test against database without an isolated name: ${databaseName}`);
}
const parsedBaseUrl = new URL(baseUrl);
if (!['127.0.0.1','localhost','::1'].includes(parsedBaseUrl.hostname)) {
  throw new Error(`Refusing acceptance test against non-local application host: ${parsedBaseUrl.hostname}`);
}
if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('DB_SCHEMA is invalid');

let cookie = '';
const key = String(process.env.ACCEPTANCE_RUN_KEY || Date.now()).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
const ids = {
  employee:`acceptance-employee-${key}`,
  loan:`acceptance-loan-${key}`,
  augustRun:`acceptance-payroll-${priorPeriod}-${key}`,
  augustItem:`acceptance-item-${priorPeriod}-${key}`,
  septemberRun:`acceptance-payroll-${currentPeriod}-${key}`,
  septemberItem:`acceptance-item-${currentPeriod}-${key}`,
  batch:`acceptance-payment-${key}`,
  adjustment:`acceptance-loan-adjustment-${key}`,
};

async function request(path, options = {}) {
  const headers = { 'Content-Type':'application/json',...(options.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`,{ ...options,headers });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return { response,body };
}

async function waitForHealth() {
  let lastError;
  for (let attempt=0; attempt<60; attempt += 1) {
    try {
      const { body } = await request('/api/health');
      if (body?.status === 'ok') return;
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve,1000));
  }
  throw lastError || new Error('Server did not become healthy');
}

const loadState = async () => (await request('/api/state')).body.state;
const findRun = (state,id) => (state.payrollRuns || []).find(run => run.id === id);
const findLoan = (state,id) => (state.loans || []).find(loan => loan.id === id);

function payrollItem({ id,runId,entitlementStatus,entitlementReason,isSuspended,prior=false }) {
  return {
    id,payrollRunId:runId,employeeId:ids.employee,employeeNo:`ACC${key.slice(-12)}`,
    employeeName:'Acceptance Employee',department:'Acceptance',costCenterId:'',nationality:'NON_SAUDI',
    bankIban:'SA0380000000608010167519',bankName:'Acceptance Bank',baseSalary:1000,
    housingAllowance:0,transportAllowance:0,otherAllowances:0,overtimeAmount:0,overtimeHours:0,bonuses:0,
    totalGrossSalary:1000,delayMinutes:0,delayDeduction:0,absenceDays:0,absenceDeduction:0,
    unpaidLeaveDays:0,unpaidLeaveDeduction:0,gosiEmployeeShare:0,loanDeduction:prior ? 0 : 100,
    penaltiesDeduction:0,otherDeductions:0,totalDeductions:prior ? 0 : 100,
    netSalary:prior ? 1900 : 900,gosiEmployerShare:0,totalCompanyBurden:prior ? 1900 : 900,
    entitlementStatus,entitlementReason,entitlementHoldSource:'EMPLOYEE_SUSPENSION',isSuspended,
    priorPeriodGross:prior ? 1000 : 0,priorPeriodDeductions:prior ? 100 : 0,priorPeriodNet:prior ? 900 : 0,
    priorPeriodDetails:prior ? [{ periodMonth:priorPeriod,gross:1000,deductions:100,net:900 }] : [],
    warningFlags:[],
  };
}

function payrollRun({ id,periodMonth,status,item,totalGrossSalaries,totalDeductions,totalNetSalaries }) {
  const now = new Date().toISOString();
  return {
    id,companyId,periodMonth,startDate:`${periodMonth}-01`,endDate:periodEnd(periodMonth),
    status,createdAt:now,calculatedAt:now,employeesCount:1,totalBaseSalaries:1000,totalAllowances:0,totalOvertime:0,
    totalGrossSalaries,totalAbsenceDeductions:0,totalDelayDeductions:0,totalGosiEmployee:0,totalGosiEmployer:0,
    totalLoanDeductions:periodMonth === priorPeriod ? 100 : 0,totalPenalties:0,totalDeductions,totalNetSalaries,
    totalCompanyCost:totalNetSalaries,items:[item],paymentBatches:[],
  };
}

await waitForHealth();
const login = await request('/api/auth/login',{
  method:'POST',body:JSON.stringify({ companyCode,username:adminUsername,password:adminPassword }),
});
cookie = (login.response.headers.get('set-cookie') || '').split(';')[0];
assert.match(cookie,/^masar_session=/,'Login must issue a session cookie');

const suspendedEmployee = {
  id:ids.employee,companyId,employeeNo:`ACC${key.slice(-12)}`,firstNameAr:'اختبار',lastNameAr:'قبول',
  firstNameEn:'Acceptance',lastNameEn:'Employee',nationalIdOrIqama:`ACC-${key}`,nationality:'NON_SAUDI',country:'TEST',
  email:`acceptance-${key}@example.test`,phone:'0500000000',department:'Acceptance',jobTitle:'Payroll Tester',costCenterId:'',
  hireDate:`${priorPeriod}-01`,salaryStartDate:`${priorPeriod}-01`,status:'SUSPENDED',suspensionStartDate:`${priorPeriod}-15`,
  suspensionReason:'اختبار تعليق الموظف',bankName:'Acceptance Bank',bankIban:'SA0380000000608010167519',bankAccountStatus:'ACTIVE',
  salaryPackage:{ baseSalary:1000,housingAllowance:0,transportAllowance:0,otherFixedAllowances:0,customAllowances:[],customDeductions:[] },
};
await request(`/api/employees/${ids.employee}`,{ method:'PUT',body:JSON.stringify(suspendedEmployee) });

const loan = {
  id:ids.loan,companyId,employeeId:ids.employee,totalAmount:100,monthlyInstallment:100,totalInstallments:1,
  remainingInstallments:1,remainingAmount:100,startDate:priorPeriod,status:'ACTIVE',reason:'اختبار سداد سلفة',adjustments:[],
};
await request(`/api/loans/${ids.loan}`,{ method:'PUT',body:JSON.stringify(loan) });

const augustItem = payrollItem({ id:ids.augustItem,runId:ids.augustRun,entitlementStatus:'HELD',entitlementReason:suspendedEmployee.suspensionReason,isSuspended:true });
const augustRun = payrollRun({ id:ids.augustRun,periodMonth:priorPeriod,status:'UNDER_REVIEW',item:augustItem,totalGrossSalaries:1000,totalDeductions:100,totalNetSalaries:900 });
await request(`/api/payroll-runs/${ids.augustRun}`,{ method:'PUT',body:JSON.stringify(augustRun) });
await request(`/api/payroll-runs/${ids.augustRun}/status`,{ method:'POST',body:JSON.stringify({ status:'APPROVED' }) });
await request(`/api/payroll-runs/${ids.augustRun}/status`,{ method:'POST',body:JSON.stringify({ status:'POSTED' }) });

const septemberItem = payrollItem({ id:ids.septemberItem,runId:ids.septemberRun,entitlementStatus:'HELD',entitlementReason:suspendedEmployee.suspensionReason,isSuspended:true,prior:true });
const septemberRun = payrollRun({ id:ids.septemberRun,periodMonth:currentPeriod,status:'DRAFT',item:septemberItem,totalGrossSalaries:2000,totalDeductions:100,totalNetSalaries:1900 });
await request(`/api/payroll-runs/${ids.septemberRun}`,{ method:'PUT',body:JSON.stringify(septemberRun) });

const activeEmployee = { ...suspendedEmployee,status:'ACTIVE',suspensionStartDate:'',suspensionEndDate:'',suspensionReason:'' };
await request(`/api/employees/${ids.employee}`,{ method:'PUT',body:JSON.stringify(activeEmployee) });
let state = await loadState();
assert.equal(state.employees.find(employee => employee.id === ids.employee)?.status,'ACTIVE','Employee suspension must be released');

let source = findRun(state,ids.augustRun);
const payableSourceItem = { ...source.items[0],entitlementStatus:'PAYABLE',isSuspended:false,entitlementReason:undefined,entitlementHoldSource:undefined };
source = { ...source,items:[payableSourceItem],calculatedAt:new Date().toISOString() };
await request(`/api/payroll-runs/${ids.augustRun}`,{ method:'PUT',body:JSON.stringify(source) });

const batch = {
  id:ids.batch,batchNumber:`ACC-${priorPeriod}-${key}`,payrollRunId:ids.augustRun,companyId,periodMonth:priorPeriod,
  employeeIds:[ids.employee],employeesCount:1,totalAmount:900,method:'BANK_TRANSFER',status:'SCHEDULED',
  scheduledDate:`${currentPeriod}-10`,reference:'ACCEPTANCE-LATE-PAYMENT',notes:'Isolated acceptance test',createdAt:new Date().toISOString(),
};
await request(`/api/payroll-runs/${ids.augustRun}/payment-batches`,{ method:'POST',body:JSON.stringify(batch) });
await request(`/api/payroll-runs/${ids.augustRun}/payment-batches/${ids.batch}/status`,{
  method:'PATCH',body:JSON.stringify({ status:'PAID',paymentDate:`${currentPeriod}-10` }),
});
state = await loadState();
let september = findRun(state,ids.septemberRun);
assert.equal(september.items[0].entitlementStatus,'PAYABLE','Current month must be released after paying the prior held salary');
assert.equal(september.items[0].isSuspended,false);
assert.deepEqual(september.items[0].priorPeriodDetails,[],'Paid prior month must be removed from current carry-forward');
assert.equal(september.totalNetSalaries,1000);

const recalculatedItem = { ...september.items[0],manualAddition:25,totalGrossSalary:1025,netSalary:1025,totalCompanyBurden:1025 };
september = { ...september,items:[recalculatedItem],totalGrossSalaries:1025,totalNetSalaries:1025,totalCompanyCost:1025,calculatedAt:new Date().toISOString() };
await request(`/api/payroll-runs/${ids.septemberRun}`,{ method:'PUT',body:JSON.stringify(september) });
state = await loadState();
assert.equal(findRun(state,ids.septemberRun)?.totalNetSalaries,1025,'Recalculation must persist after reload');

await request(`/api/payroll-runs/${ids.augustRun}/payment-batches/${ids.batch}/status`,{
  method:'PATCH',body:JSON.stringify({ status:'SCHEDULED',paymentReversalReason:'اختبار إلغاء تأكيد الدفع' }),
});
await request(`/api/payroll-runs/${ids.augustRun}/payment-batches/${ids.batch}/status`,{
  method:'PATCH',body:JSON.stringify({ status:'CANCELLED' }),
});
state = await loadState();
source = findRun(state,ids.augustRun);
september = findRun(state,ids.septemberRun);
assert.equal(source.paymentBatches[0].status,'CANCELLED','Cancelled payment must persist');
assert.deepEqual(september.items[0].priorPeriodDetails,[{ periodMonth:priorPeriod,gross:1000,deductions:100,net:900 }]);
assert.equal(september.totalNetSalaries,1925,'Cancellation must restore prior salary exactly once');

await request(`/api/payroll-runs/${ids.augustRun}/status`,{ method:'POST',body:JSON.stringify({ status:'APPROVED' }) });
await request(`/api/payroll-runs/${ids.augustRun}/status`,{ method:'POST',body:JSON.stringify({ status:'UNDER_REVIEW' }) });
state = await loadState();
source = findRun(state,ids.augustRun);
assert.equal(source.status,'UNDER_REVIEW','Posting and approval reversal must persist');
assert.equal(source.postedAt,undefined);
assert.equal(source.approvedAt,undefined);

const settledLoan = {
  ...findLoan(state,ids.loan),remainingAmount:0,remainingInstallments:0,status:'COMPLETED',
  adjustments:[{ id:ids.adjustment,amount:-100,date:`${currentPeriod}-10`,reason:'سداد كامل السلفة' }],
};
await request(`/api/loans/${ids.loan}`,{ method:'PUT',body:JSON.stringify(settledLoan) });
state = await loadState();
assert.equal(findLoan(state,ids.loan)?.status,'COMPLETED','Loan payoff must close the schedule');
assert.equal(findLoan(state,ids.loan)?.remainingAmount,0);

const db = new Pool({ connectionString:databaseUrl,ssl:false });
try {
  const [runRow,batchRow,loanRow,auditRows] = await Promise.all([
    db.query(`SELECT status,approved_at,posted_at FROM "${schema}".payroll_runs WHERE id=$1`,[ids.augustRun]),
    db.query(`SELECT status FROM "${schema}".payroll_payment_batches WHERE id=$1`,[ids.batch]),
    db.query(`SELECT status,remaining_amount::text,remaining_installments FROM "${schema}".loans WHERE id=$1`,[ids.loan]),
    db.query(`SELECT action FROM "${schema}".application_audit_logs WHERE company_id=$1 AND entity_id=$2`,[companyId,ids.employee]),
  ]);
  assert.deepEqual(runRow.rows[0],{ status:'UNDER_REVIEW',approved_at:null,posted_at:null });
  assert.equal(batchRow.rows[0]?.status,'CANCELLED');
  assert.equal(loanRow.rows[0]?.status,'COMPLETED');
  assert.equal(Number(loanRow.rows[0]?.remaining_amount),0);
  assert.equal(loanRow.rows[0]?.remaining_installments,0);
  assert.ok(auditRows.rowCount >= 2,'Employee create and release actions must remain auditable');
} finally {
  await db.end();
}

console.log('Payroll acceptance passed on an isolated database: create -> suspend/release -> late prior payment -> recalculate -> reverse/cancel payment -> reverse posting -> settle loan.');
