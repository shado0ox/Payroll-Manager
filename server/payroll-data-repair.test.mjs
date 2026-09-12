import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPayrollRepairPlan } from './payroll-data-repair.mjs';

const employee = { id:'employee-1',companyId:'company-1',status:'ACTIVE',bankIban:'SA0380000000608010167519',bankAccountStatus:'ACTIVE' };
const item = (id,overrides = {}) => ({ id,employeeId:'employee-1',totalGrossSalary:1000,totalDeductions:100,netSalary:900,
  totalCompanyBurden:920,priorPeriodGross:0,priorPeriodDeductions:0,priorPeriodNet:0,priorPeriodDetails:[],
  entitlementStatus:'PAYABLE',...overrides });
const run = (id,periodMonth,status,runItem,overrides = {}) => ({ id,companyId:'company-1',periodMonth,status,items:[runItem],paymentBatches:[],
  employeesCount:1,totalGrossSalaries:1000,totalDeductions:100,totalNetSalaries:900,totalCompanyCost:920,...overrides });

test('scan proposes one safe repair for stale carry, totals, and automatic hold', () => {
  const august = run('august','2026-08','POSTED',item('august-item'),{
    paymentBatches:[{ id:'paid',status:'PAID',employeeIds:['employee-1'] }],
  });
  const september = run('september','2026-09','DRAFT',item('september-item',{
    priorPeriodGross:1000,priorPeriodDeductions:100,priorPeriodNet:900,
    priorPeriodDetails:[{ periodMonth:'2026-08',gross:1000,deductions:100,net:900 }],
    netSalary:1800,totalCompanyBurden:1820,entitlementStatus:'HELD',entitlementReason:'MISSING_BANK_ACCOUNT',
  }),{ totalGrossSalaries:2000,totalDeductions:200,totalNetSalaries:1800,totalCompanyCost:1820 });
  const plan = buildPayrollRepairPlan({ employees:[employee],payrollRuns:[august,september] },['company-1']);
  assert.equal(plan.issues.length,1);
  assert.deepEqual(plan.issues[0].findings,['CARRY_FORWARD_MISMATCH','AUTOMATIC_HOLD_STALE','RUN_TOTAL_MISMATCH']);
  const repaired = plan.proposedRuns.get('payroll-run:september');
  assert.equal(repaired.items[0].priorPeriodNet,0);
  assert.equal(repaired.items[0].netSalary,900);
  assert.equal(repaired.items[0].entitlementStatus,'PAYABLE');
  assert.equal(repaired.totalNetSalaries,900);
});

test('unpaid salary missing from a later draft is restored without rewriting a closed run', () => {
  const august = run('august','2026-08','POSTED',item('august-item'));
  const september = run('september','2026-09','DRAFT',item('september-item'));
  const october = run('october','2026-10','APPROVED',item('october-item'));
  const plan = buildPayrollRepairPlan({ employees:[employee],payrollRuns:[august,september,october] },['company-1']);
  assert.equal(plan.proposedRuns.get('payroll-run:september').items[0].priorPeriodNet,900);
  assert.equal(plan.issues.find(issue => issue.runId === 'october'),undefined);
});

test('closed historical carry remains valid after the source salary is paid in a later month', () => {
  const june = run('june','2026-06','POSTED',item('june-item'));
  const july = run('july','2026-07','POSTED',item('july-item',{
    priorPeriodGross:1000,priorPeriodDeductions:100,priorPeriodNet:900,
    priorPeriodDetails:[{ periodMonth:'2026-06',gross:1000,deductions:100,net:900 }],
    netSalary:1800,totalCompanyBurden:1820,
  }),{
    totalGrossSalaries:2000,totalDeductions:200,totalNetSalaries:1800,totalCompanyCost:1820,
  });
  const august = run('august','2026-08','POSTED',item('august-item'),{
    paymentBatches:[{ id:'paid-june-later',status:'PAID',employeeIds:['employee-1'],priorEntitlements:[{
      sourcePayrollRunId:'june',sourcePayrollItemId:'june-item',employeeId:'employee-1',amount:900,
    }]}],
  });
  const plan = buildPayrollRepairPlan({ employees:[employee],payrollRuns:[june,july,august] },['company-1']);
  assert.equal(plan.issues.find(issue => issue.runId === 'july'),undefined);
});

test('closed runs still report internally inconsistent stored totals without proposing repair', () => {
  const july = run('july','2026-07','POSTED',item('july-item'),{ totalNetSalaries:1 });
  const plan = buildPayrollRepairPlan({ employees:[employee],payrollRuns:[july] },['company-1']);
  const issue = plan.issues.find(candidate => candidate.runId === 'july');
  assert.deepEqual(issue?.findings,['RUN_TOTAL_MISMATCH']);
  assert.equal(issue?.repairable,false);
  assert.equal(issue?.blockedReason,'LOCKED_PAYROLL_RUN');
  assert.equal(plan.proposedRuns.has('payroll-run:july'),false);
});

test('active prior-entitlement reservation prevents a false missing-carry repair', () => {
  const august = run('august','2026-08','POSTED',item('august-item',{ entitlementStatus:'HELD',entitlementReason:'MISSING_BANK_ACCOUNT' }));
  const september = run('september','2026-09','DRAFT',item('september-item'),{
    paymentBatches:[{ id:'scheduled',status:'SCHEDULED',employeeIds:['employee-1'],priorEntitlements:[{
      sourcePayrollRunId:'august',sourcePayrollItemId:'august-item',employeeId:'employee-1',amount:900,
    }]}],
  });
  const bankPendingEmployee = { ...employee,bankIban:'',bankAccountStatus:'PENDING' };
  assert.equal(buildPayrollRepairPlan({ employees:[bankPendingEmployee],payrollRuns:[august,september] },['company-1']).issues.length,0);
});

test('a cumulative later payment prevents false carry and totals findings after recalculation', () => {
  const may = run('may','2026-05','POSTED',item('may-item'));
  const august = run('august','2026-08','POSTED',item('august-item',{
    priorPeriodGross:1000,priorPeriodDeductions:100,priorPeriodNet:900,
    priorPeriodDetails:[{ periodMonth:'2026-05',gross:1000,deductions:100,net:900 }],
    netSalary:1800,totalCompanyBurden:1820,
  }),{
    totalGrossSalaries:2000,totalDeductions:200,totalNetSalaries:1800,totalCompanyCost:1820,
    paymentBatches:[{ id:'paid-cumulative',status:'PAID',employeeIds:['employee-1'],totalAmount:1800 }],
  });
  const september = run('september','2026-09','DRAFT',item('september-item'));
  const plan = buildPayrollRepairPlan({ employees:[employee],payrollRuns:[may,august,september] },['company-1']);
  assert.equal(plan.issues.length,0);
});

test('a cancelled cumulative payment does not hide an unpaid source month from repair', () => {
  const may = run('may','2026-05','POSTED',item('may-item'));
  const august = run('august','2026-08','POSTED',item('august-item',{
    priorPeriodGross:1000,priorPeriodDeductions:100,priorPeriodNet:900,
    priorPeriodDetails:[{ periodMonth:'2026-05',gross:1000,deductions:100,net:900 }],
    netSalary:1800,totalCompanyBurden:1820,
  }),{
    totalGrossSalaries:2000,totalDeductions:200,totalNetSalaries:1800,totalCompanyCost:1820,
    paymentBatches:[{ id:'cancelled-cumulative',status:'CANCELLED',employeeIds:['employee-1'],totalAmount:1800 }],
  });
  const september = run('september','2026-09','DRAFT',item('september-item'));
  const plan = buildPayrollRepairPlan({ employees:[employee],payrollRuns:[may,august,september] },['company-1']);
  const repaired = plan.proposedRuns.get('payroll-run:september');
  assert.deepEqual(repaired.priorPeriodDetails,undefined);
  assert.deepEqual(repaired.items[0].priorPeriodDetails.map(detail => detail.periodMonth),['2026-05','2026-08']);
});

test('company scope excludes unassigned tenant payroll', () => {
  const foreign = { ...run('foreign','2026-09','DRAFT',item('foreign-item'),{ totalNetSalaries:1 }),companyId:'company-2' };
  assert.equal(buildPayrollRepairPlan({ employees:[employee],payrollRuns:[foreign] },['company-1']).issues.length,0);
});

test('scan repairs a legacy released suspension hold by matching its reason', () => {
  const releasedEmployee = { ...employee,status:'ACTIVE',suspensionReason:'تعليق قديم' };
  const september = run('september','2026-09','DRAFT',item('september-item',{
    entitlementStatus:'HELD',entitlementReason:'تعليق قديم',isSuspended:false,
  }));
  const plan = buildPayrollRepairPlan({ employees:[releasedEmployee],payrollRuns:[september] },['company-1']);
  const repaired = plan.proposedRuns.get('payroll-run:september');
  assert.deepEqual(plan.issues[0].findings,['AUTOMATIC_HOLD_STALE']);
  assert.equal(repaired.items[0].entitlementStatus,'PAYABLE');
});

test('selected repair releases an unmarked legacy hold after an earlier salary was paid', () => {
  const august = run('august','2026-08','POSTED',item('august-item'),{
    paymentBatches:[{ id:'paid-august',status:'PAID',employeeIds:['employee-1'] }],
  });
  const september = run('september','2026-09','DRAFT',item('september-item',{
    entitlementStatus:'HELD',entitlementReason:'تعليق قديم غير مصنف',isSuspended:false,
  }));
  const plan = buildPayrollRepairPlan({ employees:[employee],payrollRuns:[august,september] },['company-1']);
  const repaired = plan.proposedRuns.get('payroll-run:september');
  assert.ok(plan.issues.find(issue => issue.runId === 'september')?.findings.includes('AUTOMATIC_HOLD_STALE'));
  assert.equal(repaired.items[0].entitlementStatus,'PAYABLE');
});
