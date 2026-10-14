import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
import {salaryAccountStatement,salarySourceSummary} from './payroll-ledger.mjs';
const source={id:'sep',companyId:'c',periodMonth:'2026-09',status:'APPROVED',endDate:'2026-09-30',items:[{id:'e-sep',employeeId:'e',netSalary:50000,totalGrossSalary:50000,totalDeductions:0,entitlementStatus:'PAYABLE'}],paymentBatches:[{id:'paid',status:'PAID',employeeIds:['e'],totalAmount:40000,paymentDate:'2026-10-01',allocations:[{employeeId:'e',periodMonth:'2026-09',sourcePayrollRunId:'sep',sourcePayrollItemId:'e-sep',amount:40000}]}],entitlementOffsets:[{id:'offset',employeeId:'e',sourcePayrollItemId:'e-sep',amount:10000,date:'2026-10-02',documentRef:'DOC'},{id:'reversal',employeeId:'e',sourcePayrollItemId:'e-sep',amount:-10000,date:'2026-10-03',documentRef:'DOC-R',reversesOffsetId:'offset'}]};
test('salary statement credits source wages once, debits actual payment and offsets, credits reversal and excludes scheduled payments',()=>{
 const carry={id:'oct',companyId:'c',periodMonth:'2026-10',status:'APPROVED',items:[{id:'e-oct',employeeId:'e',netSalary:10000,priorPeriodNet:10000,totalGrossSalary:0}],paymentBatches:[{id:'reserved',status:'SCHEDULED',totalAmount:5000,employeeIds:['e'],allocations:[{employeeId:'e',periodMonth:'2026-09',sourcePayrollRunId:'sep',sourcePayrollItemId:'e-sep',amount:5000}]}]};
 const statement=salaryAccountStatement([source,carry,{...source,companyId:'other'}],'c','e');
 assert.deepEqual(statement.entries.map(row=>[row.kind,row.debit,row.credit,row.balance]),[['WAGE',0,50000,50000],['PAYMENT',40000,0,10000],['OFFSET',10000,0,0],['OFFSET_REVERSAL',0,10000,10000]]);
 assert.equal(statement.balance,10000);assert.equal(statement.reserved,5000);assert.equal(statement.totalCredit-statement.totalDebit,statement.balance);
 assert.equal(statement.balance,salarySourceSummary([source,carry],source,source.items[0]).outstanding);
});
test('legacy terminal settlement closes only unpaid remainder; known legacy cash is a payment rather than a second offset',()=>{
 const terminal={...source,items:[{...source.items[0],entitlementStatus:'SETTLED',entitlementSettlementDate:'2026-10-02'}],entitlementOffsets:[]};
 const statement=salaryAccountStatement([terminal],'c','e');assert.equal(statement.balance,0);assert.equal(statement.entries.find(row=>row.kind==='OFFSET').debit,10000);
 const legacy={...source,id:'old',items:[{...source.items[0],id:'old-e',netSalary:1000,entitlementStatus:'SETTLED'}],paymentBatches:[],entitlementOffsets:[]};
 const cash={id:'cash',companyId:'c',employeeId:'e',sourcePayrollRunId:'old',sourcePayrollItemId:'old-e',periodMonth:'2026-09',paymentDate:'2026-10-01',status:'PAID',amount:1000};
 const statement2=salaryAccountStatement([legacy],'c','e',[cash]);assert.equal(statement2.balance,0);assert.deepEqual(statement2.entries.map(row=>row.kind),['WAGE','PAYMENT']);
});
test('administrative and worker salary costs use separate configured expenses with a shared payable and legacy accounts unchanged',async()=>{
 const bundle=await build({entryPoints:['src/utils/accountingEngine.ts'],bundle:true,platform:'node',format:'esm',write:false});const engine=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
 const item=(id,category)=>({id,employeeId:id,employeeNo:id,employeeName:id,payrollCategory:category,baseSalary:1000,housingAllowance:200,transportAllowance:0,otherAllowances:0,bonuses:0,overtimeAmount:0,totalGrossSalary:1200,totalDeductions:0,netSalary:1200,gosiEmployeeShare:0,loanDeduction:0});
 const company={id:'c',chartOfAccounts:{administrativeSalariesExpenseAccount:'510110',workerWagesExpenseAccount:'610110',salariesPayableAccount:'2101'}};
 const run={id:'r',companyId:'c',periodMonth:'2026-10',status:'APPROVED',items:[item('a','ADMINISTRATIVE'),item('w','WORKER'),item('old',undefined)]};
 const journal=engine.generatePayrollJournalBatch(company,run);
 for(const account of ['510110','610110'])assert.equal(journal.lines.filter(row=>row.accountCode===account).reduce((sum,row)=>sum+row.debit,0),1200);
 assert.equal(journal.lines.find(row=>row.id==='line-cred-salaries-payable').credit,3600);assert.equal(journal.totalDebit,journal.totalCredit);assert.ok(journal.lines.some(row=>row.accountCode==='5101'));
 assert.ok(!journal.balanceDiagnostics.some(row=>row.severity==='ERROR'));
 const missing=engine.generatePayrollJournalBatch({...company,chartOfAccounts:{}},run);assert.equal(missing.balanceDiagnostics.filter(row=>row.code==='SALARY_CATEGORY_ACCOUNT_MISSING').length,2);
});
