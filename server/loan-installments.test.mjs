import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import {wholeRiyalLoanPlan,loanInstallmentAmount,remainingLoanInstallments,validateLoanInstallmentPlan} from './loan-installments.mjs';
import {effectiveEmployeeSalaryLoans} from './payroll-ledger.mjs';
test('1000 over six months keeps all riyals and puts remainder in June across a year boundary',()=>{
 const plan=wholeRiyalLoanPlan(1000,6,'2026-11');
 assert.deepEqual(plan.schedule.map(row=>row.amount),[166,166,166,166,166,170]);
 assert.deepEqual(plan.schedule.map(row=>row.periodMonth),['2026-11','2026-12','2027-01','2027-02','2027-03','2027-04']);
 for(let total=1;total<2000;total+=17)for(let months=1;months<=Math.min(total,60);months++){
  const amounts=wholeRiyalLoanPlan(total,months,'2026-01').schedule.map(row=>row.amount);
  assert.equal(amounts.reduce((a,b)=>a+b,0),total);assert.ok(amounts.every(Number.isInteger));assert.equal(amounts.length,months);
 }
});
test('approved payroll consumes five 166 payments then exactly 170 and restores last installment on reversal',async()=>{
 const loan={id:'l',employeeId:'e',companyId:'c',totalAmount:1000,totalInstallments:6,monthlyInstallment:166,remainingAmount:1000,remainingInstallments:6,startDate:'2026-01',status:'ACTIVE',installmentRounding:'WHOLE_SAR_LAST'};
 const bundle=await build({entryPoints:['src/utils/payrollEngine.ts'],bundle:true,platform:'node',format:'esm',write:false});
 const engine=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
 const company={id:'c',workDaysPerMonth:30,dailyWorkHours:8,calculationRules:{roundingDecimals:2}};
 const employee={id:'e',companyId:'c',status:'ACTIVE',nationality:'NON_SAUDI',hireDate:'2026-01-01',salaryPackage:{baseSalary:3000,housingAllowance:0,transportAllowance:0,otherFixedAllowances:0}};
 const runs=[];
 for(let i=0;i<6;i++){
  const periodMonth=`2026-0${i+1}`;
  const effective=effectiveEmployeeSalaryLoans([loan],runs,'c','e')[0];
  assert.equal(effective.remainingInstallments,6-i);
  const item=engine.calculateEmployeePayrollItem({employee,company,periodMonth,attendanceRecords:[],activeLoans:[{...effective,remainingAmount:effective.effectiveRemaining}],penalties:[]});
  assert.equal(item.loanDeduction,i===5?170:166);
  runs.push({id:String(i),companyId:'c',periodMonth,status:'APPROVED',items:[item]});
 }
 assert.equal(effectiveEmployeeSalaryLoans([loan],runs,'c','e')[0].effectiveRemaining,0);
 runs.at(-1).status='UNDER_REVIEW';
 assert.equal(effectiveEmployeeSalaryLoans([loan],runs,'c','e')[0].effectiveRemaining,170);
 assert.equal(effectiveEmployeeSalaryLoans([loan],runs,'c','e')[0].remainingInstallments,1);
});
test('legacy fractional installments preserve recorded principal while whole plans reject invalid amounts and zero installments',()=>{
 assert.equal(loanInstallmentAmount({monthlyInstallment:166.67,remainingAmount:166.65}),166.65);
 for(const [total,months] of [[1000.5,6],[10,11],[1000,0],[1000,61]])assert.throws(()=>wholeRiyalLoanPlan(total,months,'2026-01'));
 assert.throws(()=>validateLoanInstallmentPlan({totalAmount:1000,totalInstallments:6,startDate:'2026-01',monthlyInstallment:167,installmentRounding:'WHOLE_SAR_LAST'}));
 assert.equal(remainingLoanInstallments({totalAmount:1000,totalInstallments:6,monthlyInstallment:166,installmentRounding:'WHOLE_SAR_LAST'},170),1);
});
