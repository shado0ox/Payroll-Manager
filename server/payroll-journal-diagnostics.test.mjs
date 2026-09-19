import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle=await build({entryPoints:['src/utils/accountingEngine.ts'],bundle:true,format:'esm',platform:'node',write:false});
const accounting=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const company={
  id:'company-1',crNumber:'1234',nameAr:'شركة اختبار',nameEn:'Test Company',
  chartOfAccounts:{salariesExpenseAccount:'5101',salariesPayableAccount:'2101',employeeAdvancesAccount:'1105',penaltiesPayableAccount:'2105'},
  costCenters:[{id:'cc-1',code:'CC-1',nameAr:'الإدارة',nameEn:'Administration'}],
};
const baseItem={
  id:'item-1',employeeId:'employee-1',employeeNo:'E001',employeeName:'أحمد محمد',costCenterId:'cc-1',
  baseSalary:1000,housingAllowance:0,transportAllowance:0,otherAllowances:0,overtimeAmount:0,bonuses:0,
  totalGrossSalary:1000,delayDeduction:0,absenceDeduction:0,unpaidLeaveDeduction:0,gosiEmployeeShare:0,
  loanDeduction:100,penaltiesDeduction:0,otherDeductions:0,totalDeductions:100,netSalary:1400,
  priorPeriodNet:500,priorPeriodDetails:[{periodMonth:'2026-07',gross:600,deductions:100,net:500}],
};
const run=item=>({id:'run-1',companyId:'company-1',periodMonth:'2026-08',status:'DRAFT',items:[item]});

test('payroll accrual excludes carried salary already accrued in its source month',()=>{
  const batch=accounting.generatePayrollJournalBatch(company,run(baseItem));
  assert.equal(batch.totalDebit,1000);
  assert.equal(batch.totalCredit,1000);
  assert.equal(batch.lines.some(line=>line.accountCode==='9999'),false);
  const payable=batch.lines.find(line=>line.id==='line-cred-salaries-payable');
  assert.equal(payable.credit,900);
  assert.deepEqual(batch.balanceDiagnostics.filter(detail=>detail.code==='PRIOR_PERIOD_BALANCE_EXCLUDED').map(detail=>detail.recorded),[500]);
});

test('an invalid payroll stays visibly unbalanced and is diagnosed instead of hidden in 9999',()=>{
  const malformed={...baseItem,loanDeduction:1200,totalDeductions:1200,netSalary:500};
  const batch=accounting.generatePayrollJournalBatch(company,run(malformed));
  assert.equal(batch.totalDebit,1000);
  assert.equal(batch.totalCredit,1200);
  assert.equal(batch.lines.some(line=>line.accountCode==='9999'),false);
  assert.ok(batch.balanceDiagnostics.some(detail=>detail.code==='DEDUCTIONS_EXCEED_GROSS'&&detail.difference===-200));
});
