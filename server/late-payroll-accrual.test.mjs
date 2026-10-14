import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
import {createPayrollWorkflowGuards} from './payroll-workflow-guards.mjs';
const bundle=await build({entryPoints:['src/utils/accountingEngine.ts'],bundle:true,platform:'node',format:'esm',write:false});
const engine=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const company={id:'c',crNumber:'1234',chartOfAccounts:{},costCenters:[]};
const item=(id,amount)=>({id,employeeId:id,baseSalary:amount,housingAllowance:0,transportAllowance:0,otherAllowances:0,bonuses:0,overtimeAmount:0,totalGrossSalary:amount,totalDeductions:0,netSalary:amount,gosiEmployeeShare:0,gosiEmployerShare:amount*.02,loanDeduction:0,entitlementStatus:'PAYABLE'});
const run={id:'r',companyId:'c',periodMonth:'2026-01',status:'POSTED',items:[item('old',1000)],paymentBatches:[]};
const sync=batch=>({...batch,qoyodSyncStatus:{synced:true,qoyodJournalId:`q-${batch.id}`},qoyodSnapshot:structuredClone(batch)});
test('late employee receives independent balanced salary and GOSI accruals without changing the posted journal',()=>{
 const old=sync(engine.generatePayrollJournalBatch(company,run));const changed={...run,items:[...run.items,item('late',600)]};
 const original=structuredClone(old);let plan=engine.buildAccrualJournalPlan(engine.generatePayrollJournalBatch(company,changed),[old],'2026-06-01');
 assert.equal(plan.blocked,false);assert.equal(plan.batches.length,2);assert.equal(plan.batches[0].totalDebit,1000);assert.equal(plan.batches[1].totalDebit,600);assert.equal(plan.batches[1].totalCredit,600);
 assert.equal(plan.batches[1].date,'2026-06-01');assert.equal(plan.batches[1].periodMonth,'2026-01');assert.deepEqual(old,original);
 const supplement=sync(plan.batches[1]);
 plan=engine.buildAccrualJournalPlan(engine.generatePayrollJournalBatch(company,changed),[old,supplement]);assert.equal(plan.batches.length,2);
 const third={...changed,items:[...changed.items,item('third',200)]};
 plan=engine.buildAccrualJournalPlan(engine.generatePayrollJournalBatch(company,third),[old,supplement]);assert.equal(plan.batches.at(-1).totalDebit,200);assert.notEqual(plan.batches.at(-1).id,supplement.id);
 const gosiOld=sync(engine.generateGosiAccrualJournalBatches(company,run)[0]);
 const gosi=engine.buildAccrualJournalPlan(engine.generateGosiAccrualJournalBatches(company,changed)[0],[gosiOld]);
 assert.equal(gosi.batches.at(-1).totalDebit,12);assert.equal(gosi.batches.at(-1).totalCredit,12);
});
test('hand-edited historical accrual requires reconciliation instead of an invented automatic adjustment',()=>{
 const old=sync({...engine.generatePayrollJournalBatch(company,run),manualLineOverrides:{custom:{debit:1}}});
 const plan=engine.buildAccrualJournalPlan(engine.generatePayrollJournalBatch(company,{...run,items:[...run.items,item('late',600)]}),[old]);
 assert.equal(plan.blocked,true);assert.equal(plan.batches.length,1);
});
test('late additions to closed payroll require approval and posting permissions; manage permission alone cannot bypass approval',()=>{
 const guards=createPayrollWorkflowGuards({can:(user,key)=>user.permissions.includes(key),asArray:value=>Array.isArray(value)?value:[],sameJson:(a,b)=>JSON.stringify(a)===JSON.stringify(b),workflowError:(status,message)=>Object.assign(new Error(message),{status})});
 const next={...run,items:[...run.items,item('late',600)]};
 assert.throws(()=>guards.validatePayrollWorkflowChanges([run],[next],{permissions:['MANAGE_PAYROLL']}),/APPROVE_PAYROLL_REQUIRED/);
 assert.throws(()=>guards.validatePayrollWorkflowChanges([run],[next],{permissions:['MANAGE_PAYROLL','APPROVE_PAYROLL']}),/POST_PAYROLL_REQUIRED/);
 assert.doesNotThrow(()=>guards.validatePayrollWorkflowChanges([run],[next],{permissions:['MANAGE_PAYROLL','APPROVE_PAYROLL','POST_PAYROLL']}));
});

test('September held salary is not October expense and paying October alone leaves September intact',async()=>{
 const {availableSalaryAllocations,salaryAllocationsForPaymentScope,allocateSalaryAmount,salarySourceSummary}=await import('./payroll-ledger.mjs');
 const sep={...run,id:'sep',periodMonth:'2026-09',items:[{...item('e',1000),id:'sep-e',entitlementStatus:'HELD',entitlementReason:'مراجعة',entitlementHoldSource:'MANUAL'}]};
 const oct={...run,id:'oct',periodMonth:'2026-10',items:[{...item('e',700),id:'oct-e',netSalary:1700,priorPeriodNet:1000,priorPeriodGross:1000,priorPeriodDeductions:0,priorPeriodDetails:[{periodMonth:'2026-09',gross:1000,deductions:0,net:1000}]}]};
 const accrual=engine.generatePayrollJournalBatch(company,oct);assert.equal(accrual.totalDebit,700);assert.equal(accrual.totalCredit,700);assert.ok(!accrual.balanceDiagnostics.some(d=>d.severity==='ERROR'));
 const allocations=allocateSalaryAmount(salaryAllocationsForPaymentScope(availableSalaryAllocations([sep,oct],oct,'e'),oct.periodMonth,'CURRENT_MONTH'),700);
 assert.deepEqual(allocations.map(row=>[row.periodMonth,row.amount]),[['2026-10',700]]);
 const payment={id:'oct-paid',status:'PAID',employeeIds:['e'],totalAmount:700,paymentDate:'2026-11-03',allocations};oct.paymentBatches=[payment];
 const journal=engine.generatePaymentJournalBatch(company,oct,payment);assert.equal(journal.totalDebit,700);assert.equal(journal.totalCredit,700);
 assert.equal(salarySourceSummary([sep,oct],sep,sep.items[0]).outstanding,1000);assert.equal(salarySourceSummary([sep,oct],oct,oct.items[0]).outstanding,0);
 sep.items[0].entitlementStatus='PAYABLE';
 assert.deepEqual(salaryAllocationsForPaymentScope(availableSalaryAllocations([sep,{...oct,paymentBatches:[]}],oct,'e'),oct.periodMonth,'CURRENT_MONTH').map(row=>row.periodMonth),['2026-10']);
});

test('supplemental posting date uses the company day across the Riyadh midnight month boundary',async()=>{
 const bundle=await build({entryPoints:['src/utils/period.ts'],bundle:true,platform:'node',format:'esm',write:false});const period=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
 assert.equal(period.getCurrentDate('Asia/Riyadh',new Date('2026-09-30T22:00:00Z')),'2026-10-01');
 const old=sync(engine.generatePayrollJournalBatch(company,run));const plan=engine.buildAccrualJournalPlan(engine.generatePayrollJournalBatch(company,{...run,items:[...run.items,item('late',600)]}),[old],period.getCurrentDate('Asia/Riyadh',new Date('2026-09-30T22:00:00Z')));
 assert.equal(plan.batches.at(-1).date,'2026-10-01');assert.equal(plan.batches.at(-1).periodMonth,'2026-01');
});
