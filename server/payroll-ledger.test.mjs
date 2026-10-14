import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { salaryBatchAllocations, unpaidSalaryDetails, availableSalaryAllocations, allocateSalaryAmount } from './payroll-ledger.mjs';
import { validatePayrollCarryForwardState } from './payroll-carryforward-validation.mjs';
import { createPayrollWorkflowGuards } from './payroll-workflow-guards.mjs';
import { reconcilePaidPayrollCarryForward, reconcileReleasedPayrollCarryForward } from './payroll-paid-carryforward.mjs';
import { buildEmployeePaidPayslips } from './routes/employee-portal-routes.mjs';
import { validateApprovedPayrollLoans } from './payroll-loan-validation.mjs';
import { unzipSync, strFromU8 } from 'fflate';

const source = () => ({id:'jan',companyId:'c',periodMonth:'2026-01',status:'APPROVED',endDate:'2026-01-31',items:[{
  id:'jan-e',employeeId:'e',entitlementStatus:'PAYABLE',totalGrossSalary:50000,totalDeductions:0,netSalary:50000,
  priorPeriodNet:0,loanDeduction:70,totalCompanyBurden:50000,
}],paymentBatches:[]});
const target = (status='APPROVED') => ({id:'jun',companyId:'c',periodMonth:'2026-06',status,items:[{
  id:'jun-e',employeeId:'e',entitlementStatus:'PAYABLE',totalGrossSalary:1000,totalDeductions:0,netSalary:51000,
  priorPeriodNet:50000,priorPeriodGross:50000,priorPeriodDeductions:0,
  priorPeriodDetails:[{periodMonth:'2026-01',gross:50000,deductions:0,net:50000}],totalCompanyBurden:51000,
}],paymentBatches:[],totalGrossSalaries:51000,totalDeductions:0,totalNetSalaries:51000,totalCompanyCost:51000});
const allocation = amount => ({employeeId:'e',periodMonth:'2026-01',sourcePayrollRunId:'jan',sourcePayrollItemId:'jan-e',amount});
const batch = (amount,status='PAID',id='b') => ({id,status,employeeIds:['e'],totalAmount:amount,allocations:[allocation(amount)]});
const guards = createPayrollWorkflowGuards({can:()=>true,asArray:value=>Array.isArray(value)?value:[],workflowError:(_status,code)=>new Error(code)});
const code = (fn,expected) => assert.throws(fn,error=>error.message===expected);

test('50000 entitlement minus 40000 payment leaves 10000 in its original month after five months',()=>{
  const jan=source(), jun=target();jan.paymentBatches=[batch(40000)];
  assert.doesNotThrow(()=>validatePayrollCarryForwardState([], [jan,jun]));
  assert.deepEqual(unpaidSalaryDetails([jan,jun],jun,'e'),[{periodMonth:'2026-01',gross:10000,deductions:0,net:10000}]);
  const available=availableSalaryAllocations([jan,jun],jun,'e');
  assert.deepEqual(available.map(row=>[row.periodMonth,row.amount]),[['2026-01',10000],['2026-06',1000]]);
  assert.deepEqual(allocateSalaryAmount(available,10000),[allocation(10000)]);
  jun.paymentBatches=[batch(10000,'PAID','later')];
  assert.doesNotThrow(()=>validatePayrollCarryForwardState([], [jan,jun]));
  assert.deepEqual(unpaidSalaryDetails([jan,jun],jun,'e'),[]);
  assert.equal(jan.items[0].netSalary,50000);
});

test('scheduled amount reserves only that portion; reversal keeps reservation until cancellation',()=>{
  const jan=source(),jun=target();jan.paymentBatches=[batch(40000,'SCHEDULED')];
  assert.equal(availableSalaryAllocations([jan,jun],jun,'e')[0].amount,10000);
  jan.paymentBatches[0].status='CANCELLED';
  assert.equal(availableSalaryAllocations([jan,jun],jun,'e')[0].amount,50000);
});

test('multiple partial batches share a source up to its exact halala balance',()=>{
  const jan=source();jan.paymentBatches=[batch(20000,'PAID','one'),batch(29999.5,'SCHEDULED','two')];
  assert.doesNotThrow(()=>validatePayrollCarryForwardState([], [jan]));
  assert.equal(availableSalaryAllocations([jan],jan,'e')[0].amount,.5);
  jan.paymentBatches.push(batch(1,'SCHEDULED','three'));
  code(()=>validatePayrollCarryForwardState([], [jan]),'PAYROLL_ENTITLEMENT_OVERPAID');
});

test('rejects tampered source, tenant, period, precision, total and duplicate allocations',()=>{
  for (const [patch,expected] of [
    [{sourcePayrollItemId:'wrong'},'PAYMENT_ALLOCATION_SOURCE_INVALID'],
    [{periodMonth:'2026-02'},'PAYMENT_ALLOCATION_SOURCE_INVALID'],
    [{amount:NaN},'PAYMENT_ALLOCATION_AMOUNT_INVALID'],
    [{amount:1.001},'PAYMENT_ALLOCATION_AMOUNT_INVALID'],
  ]) {const jan=source();jan.paymentBatches=[batch(1)];Object.assign(jan.paymentBatches[0].allocations[0],patch);code(()=>validatePayrollCarryForwardState([], [jan]),expected);}
  const jan=source(),jun=target();jun.companyId='another';jun.paymentBatches=[batch(1)];
  code(()=>validatePayrollCarryForwardState([], [jan,jun]),'PAYMENT_ALLOCATION_SOURCE_INVALID');
  jan.paymentBatches=[batch(1)];jan.paymentBatches[0].totalAmount=2;
  code(()=>validatePayrollCarryForwardState([], [jan]),'PAYMENT_BATCH_TOTAL_MISMATCH');
  jan.paymentBatches[0].allocations.push(allocation(1));
  code(()=>validatePayrollCarryForwardState([], [jan]),'PAYMENT_ALLOCATION_DUPLICATE_SOURCE');
});

test('saved manual bonuses survive carry; missing and draft months never invent opening debts',()=>{
  const jan=source();jan.items[0].netSalary=50100;jan.items[0].totalGrossSalary=50100;jan.items[0].manualAddition=100;
  assert.equal(unpaidSalaryDetails([jan],target(),'e')[0].net,50100);
  assert.deepEqual(unpaidSalaryDetails([],target(),'e'),[]);
  jan.status='DRAFT';assert.deepEqual(unpaidSalaryDetails([jan],target(),'e'),[]);
});

test('settled and documented cancellation exclude debt; a manual hold cannot be paid via a later month',()=>{
  for(const status of ['SETTLED','CANCELLED_WITH_DOCUMENT','UNDER_SETTLEMENT']){
    const jan=source();jan.items[0].entitlementStatus=status;
    assert.deepEqual(unpaidSalaryDetails([jan],target(),'e'),[]);
  }
  const jan=source(),jun=target();jan.items[0].entitlementStatus='HELD';jan.items[0].entitlementReason='MANUAL';
  jun.paymentBatches=[batch(1)];code(()=>validatePayrollCarryForwardState([], [jan,jun]),'PAYMENT_ALLOCATION_SOURCE_HELD');
});

test('rejects embedded carry plus an explicit reference to the same salary inside a legacy batch',()=>{
  const jan=source(),jun=target();jan.items[0].entitlementStatus='HELD';jan.items[0].entitlementReason='MISSING_BANK_ACCOUNT';
  jun.paymentBatches=[{id:'duplicate',status:'SCHEDULED',employeeIds:['e'],totalAmount:101000,priorEntitlements:[{
    ...allocation(50000),sourcePeriodMonth:'2026-01',
  }]}];
  code(()=>validatePayrollCarryForwardState([], [jan,jun]),'PAYROLL_ENTITLEMENT_DUPLICATE_IN_BATCH');
  assert.equal(salaryBatchAllocations(jun,jun.paymentBatches[0]).reduce((sum,row)=>sum+row.amount,0),51000);
});

test('partial payment reconciles editable and approved carry, preserves posted snapshots, cancellation restores once',()=>{
  const jan=source(),jun=target();jan.paymentBatches=[batch(40000)];
  const [updated]=reconcilePaidPayrollCarryForward({runs:[jan,jun],sourceRun:jan,paidBatch:jan.paymentBatches[0]});
  assert.equal(updated.items[0].priorPeriodNet,10000);assert.equal(updated.totalNetSalaries,11000);
  assert.equal(updated.items[0].totalGrossSalary,1000);
  assert.deepEqual(reconcilePaidPayrollCarryForward({runs:[jan,target('POSTED')],sourceRun:jan,paidBatch:jan.paymentBatches[0]}),[]);
  jan.paymentBatches[0].status='CANCELLED';
  const [restored]=reconcileReleasedPayrollCarryForward({runs:[jan,updated],sourceRun:jan,releasedBatch:jan.paymentBatches[0]});
  assert.equal(restored.items[0].priorPeriodNet,50000);
  assert.deepEqual(reconcileReleasedPayrollCarryForward({runs:[jan,restored],sourceRun:jan,releasedBatch:jan.paymentBatches[0]}),[]);
});

test('a later partial payment locks original salary inputs and snapshot; documented status changes require evidence',()=>{
  const jan=source(),jun=target();jun.paymentBatches=[batch(1000)];
  const stored={payrollRuns:[jan,jun],loans:[{id:'l',companyId:'c',employeeId:'e',startDate:'2026-01',remainingAmount:100}]};
  code(()=>guards.validateClosedPayrollInputs(stored,{loans:[{...stored.loans[0],remainingAmount:90}]},{id:'u'}),'PAYROLL_SOURCE_ENTRY_LOCKED');
  const changed=structuredClone(jan);changed.items[0].netSalary++;
  code(()=>guards.validatePayrollWorkflowChanges([jan,jun],[changed,jun],{id:'u'}),'TRANSFERRED_EMPLOYEE_PAYROLL_IMMUTABLE');
  const unsettled=source(),settled=source();settled.items[0].entitlementStatus='SETTLED';
  code(()=>guards.validatePayrollWorkflowChanges([unsettled],[settled],{id:'u'}),'ENTITLEMENT_SETTLEMENT_DOCUMENT_REQUIRED');
});

test('portal payslip assigns the actual partial amount to its original month',()=>{
  const jan=source();
  const payslips=buildEmployeePaidPayslips([{id:'b',payroll_run_id:'jun',payment_period_month:'2026-06',employee_ids:['e'],batch_payload:batch(40000)}],
    [{id:'jan-e',payroll_run_id:'jan',period_month:'2026-01',net_salary:50000,total_gross_salary:50000,payload:jan.items[0]}],'e');
  assert.equal(payslips.length,1);assert.equal(payslips[0].periodMonth,'2026-01');assert.equal(payslips[0].paidAmount,40000);
});

test('payment journals use confirmed payments, not unpaid entitlement or scheduled transfers',async()=>{
  const bundle=await build({entryPoints:['src/utils/accountingEngine.ts'],bundle:true,platform:'node',format:'esm',write:false});
  const engine=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  const company={id:'c',crNumber:'1234',chartOfAccounts:{}};const jan=source();jan.totalNetSalaries=50000;
  assert.equal(engine.generatePaymentJournalBatch(company,jan).totalDebit,0);
  jan.paymentBatches=[batch(40000,'SCHEDULED')];assert.equal(engine.generatePaymentJournalBatch(company,jan).totalDebit,0);
  jan.paymentBatches[0].status='PAID';assert.equal(engine.generatePaymentJournalBatch(company,jan).totalDebit,40000);
});

test('two months drafted from the same 100 loan cannot approve 70 plus 70',()=>{
  const jan=source(),jun=target();jun.items[0].loanDeduction=70;
  const stored={loans:[{companyId:'c',employeeId:'e',startDate:'2026-01',remainingAmount:100}],payrollRuns:[jan,{...jun,status:'DRAFT'}]};
  code(()=>validateApprovedPayrollLoans(stored,[jan,jun]),'PAYROLL_LOAN_BALANCE_EXCEEDED');
  jun.items[0].loanDeduction=30;
  assert.doesNotThrow(()=>validateApprovedPayrollLoans(stored,[jan,jun]));
});

test('a two-day attendance range crossing months contributes its hours and delay once',async()=>{
  const bundle=await build({entryPoints:['src/utils/payrollEngine.ts'],bundle:true,platform:'node',format:'esm',write:false});
  const engine=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  const employee={id:'e',companyId:'c',employeeNo:'E',firstNameAr:'اختبار',lastNameAr:'',nationality:'NON_SAUDI',hireDate:'2025-01-01',salaryStartDate:'2025-01-01',status:'ACTIVE',bankIban:'SA0380000000608010167519',salaryPackage:{baseSalary:3000,housingAllowance:0,transportAllowance:0,otherFixedAllowances:0,customAllowances:[],customDeductions:[]}};
  const company={id:'c',bankDefinitions:[],calculationRules:{workDaysDivisor:30,hourlyRateDivisor:8,dailyRateFormula:'BASE_ONLY',roundingDecimals:2,delayGracePeriodMinutes:0,delayDeductionMultiplier:1,overtimeStandardRate:1.5}};
  const input={employee,company,activeLoans:[],penalties:[],temporaryEarnings:[],leaveRequests:[],attendanceRecords:[{date:'2026-07-31',endDate:'2026-08-01',delayMinutes:60,overtimeHours:2}]};
  const july=engine.calculateEmployeePayrollItem({...input,periodMonth:'2026-07'}),august=engine.calculateEmployeePayrollItem({...input,periodMonth:'2026-08'});
  assert.equal(july.overtimeHours+august.overtimeHours,2);
  assert.equal(july.delayMinutes+august.delayMinutes,60);
});

test('bank export uses actual 40000 allocated amount and frozen source salary components',async()=>{
  const bundle=await build({entryPoints:['src/utils/bankExcelExport.ts'],bundle:true,platform:'node',format:'esm',write:false});
  const engine=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  const jan=source();Object.assign(jan.items[0],{baseSalary:50000,housingAllowance:0,employeeName:'Test',nationalIdOrIqama:'1234567890',bankIban:'SA0380000000608010167519',bankName:'Al Rajhi',bankSwiftCode:'RJHISARI'});
  const payment={...batch(40000,'SCHEDULED'),batchNumber:'PAY-1',scheduledDate:'2026-06-01'};
  payment.allocations[0].salarySnapshot={baseSalary:50000,housingAllowance:0,totalDeductions:0,netSalary:50000};
  const bytes=engine.buildBankPayrollXlsx(jan,{id:'c',companyCode:'101',nameAr:'Test',crNumber:'1234',bankDefinitions:[]},payment);
  const xml=strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']);
  assert.match(xml,/<c r="F4"[^>]*><v>40000<\/v>/);
  assert.match(xml,/<c r="G4"[^>]*><v>40000<\/v>/);
});

test('late payment and each documented settlement have independent journals on their actual dates',async()=>{
  const bundle=await build({entryPoints:['src/utils/accountingEngine.ts'],bundle:true,platform:'node',format:'esm',write:false});
  const engine=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  const company={id:'c',crNumber:'1234',chartOfAccounts:{salariesPayableAccount:'2101'}};
  const jan=source();const payment={...batch(40000),batchNumber:'P-1',paymentDate:'2026-06-10'};
  const journal=engine.generatePaymentJournalBatch(company,jan,payment);
  assert.equal(journal.periodMonth,'2026-06');assert.equal(journal.date,'2026-06-10');assert.equal(journal.totalDebit,40000);
  jan.items[0]={...jan.items[0],entitlementStatus:'SETTLED',entitlementDocumentRef:'DOC-1',entitlementReason:'Documented offset',entitlementSettlementAccount:'1105',entitlementSettlementDate:'2026-06-11'};
  const second=structuredClone(jan.items[0]);second.id='jan-e2';jan.items.push(second);
  const offsets=engine.generateEntitlementSettlementJournals(company,[jan]);
  assert.equal(offsets.length,2);assert.notEqual(offsets[0].id,offsets[1].id);
  assert.equal(offsets[0].date,'2026-06-11');assert.equal(offsets[0].periodMonth,'2026-06');
  assert.equal(offsets[0].totalDebit,50000);assert.equal(offsets[0].totalCredit,50000);
  assert.equal(offsets[0].lines[1].accountCode,'1105');
});
