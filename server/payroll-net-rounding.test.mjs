import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['src/utils/payrollEngine.ts','src/utils/accountingEngine.ts'],bundle:true,format:'esm',platform:'node',write:false,outdir:'out'});
const modules=await Promise.all(bundle.outputFiles.map(file=>import(`data:text/javascript;base64,${Buffer.from(file.text).toString('base64')}`)));
const {applyPayrollNetRounding}=modules.find(m=>m.applyPayrollNetRounding);
const {generatePayrollJournalBatch}=modules.find(m=>m.generatePayrollJournalBatch);
const item={id:'i1',employeeId:'e1',employeeNo:'1',employeeName:'QA',baseSalary:6500.50,housingAllowance:0,transportAllowance:0,otherAllowances:0,overtimeAmount:0,bonuses:0,totalGrossSalary:6500.50,totalDeductions:0,netSalary:6500.50,gosiEmployerShare:130.01,gosiEmployeeShare:0,loanDeduction:0,penaltiesDeduction:0,otherDeductions:0,delayDeduction:0,absenceDeduction:0,unpaidLeaveDeduction:0,totalCompanyBurden:6630.51};
test('upward rounding funds 50 halalas without altering basic pay or GOSI',()=>{
 const rounded=applyPayrollNetRounding(item,'CEIL_SAR');
 assert.equal(rounded.netSalary,6501);assert.equal(rounded.roundingAdjustment,.50);assert.equal(rounded.bonuses,.50);
 assert.equal(rounded.baseSalary,6500.50);assert.equal(rounded.gosiEmployerShare,130.01);
 assert.equal(rounded.totalGrossSalary-rounded.totalDeductions,rounded.netSalary);
 assert.deepEqual(applyPayrollNetRounding(rounded,'CEIL_SAR'),rounded);
 assert.equal(applyPayrollNetRounding(rounded,'NONE').netSalary,6500.50);
});
test('all fractions round up and integer and zero amounts stay unchanged',()=>{
 for(const [net,expected] of [[.01,1],[.49,1],[.50,1],[.99,1],[1,1],[0,0],[6500.01,6501]]){
  const result=applyPayrollNetRounding({...item,baseSalary:net,totalGrossSalary:net,netSalary:net},'CEIL_SAR');
  assert.equal(result.netSalary,expected);assert.ok(result.roundingAdjustment>=0&&result.roundingAdjustment<1);
 }
});
test('rounding retains prior balances and updates correctly after a manual deduction',()=>{
 const rounded=applyPayrollNetRounding({...item,priorPeriodNet:100.25},'CEIL_SAR');
 assert.equal(rounded.netSalary,6601);assert.equal(rounded.roundingAdjustment,.25);
 const changed=applyPayrollNetRounding({...rounded,totalDeductions:.40},'CEIL_SAR');
 assert.equal(changed.netSalary,6601);assert.equal(changed.roundingAdjustment,.65);
 assert.equal(changed.priorPeriodNet,100.25);assert.equal(changed.totalGrossSalary-changed.totalDeductions+changed.priorPeriodNet,changed.netSalary);
});
test('rounded payroll produces a balanced accrual and manual bonuses are not counted twice',()=>{
 const rounded=applyPayrollNetRounding({...item,baseSalary:6400.50,bonuses:100,manualAddition:100},'CEIL_SAR');
 const company={id:'c1',nameAr:'شركة',crNumber:'1234',chartOfAccounts:{},costCenters:[]};
 const journal=generatePayrollJournalBatch(company,{id:'r1',companyId:'c1',periodMonth:'2026-10',items:[rounded]});
 assert.equal(journal.totalDebit,journal.totalCredit);
 assert.ok(!journal.balanceDiagnostics?.some(d=>d.severity==='ERROR'));
});
