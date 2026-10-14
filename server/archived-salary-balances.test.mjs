import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {archivedSalaryBalanceEmployees,unpaidSalaryDetails} from './payroll-ledger.mjs';
const statuses=['ABSCONDED','TERMINATED','TERMINATED'];
const archived=statuses.map((status,index)=>({id:`e${index}`,companyId:'c',isArchived:true,status,employmentEndReason:['ABSCONDED','FINAL_EXIT','SPONSOR_TRANSFER'][index]}));
const target={companyId:'c',periodMonth:'2026-06'};
const source={id:'jan',companyId:'c',periodMonth:'2026-01',status:'APPROVED',items:archived.map(employee=>({id:`i-${employee.id}`,employeeId:employee.id,totalGrossSalary:1000,totalDeductions:0,netSalary:1000,entitlementStatus:'PAYABLE'})),paymentBatches:[{id:'partial',status:'PAID',employeeIds:archived.map(e=>e.id),totalAmount:1200,allocations:archived.map(employee=>({employeeId:employee.id,periodMonth:'2026-01',sourcePayrollRunId:'jan',sourcePayrollItemId:`i-${employee.id}`,amount:400}))}]};
test('absconded, final-exit and transferred employees retain only their unpaid approved source balances',()=>{
 assert.deepEqual(archivedSalaryBalanceEmployees([...archived,{...archived[0],id:'other',companyId:'other'}],[source],target).map(e=>e.id),['e0','e1','e2']);
 for(const employee of archived)assert.equal(unpaidSalaryDetails([source],target,employee.id)[0].net,600);
 const complete=structuredClone(source);complete.paymentBatches[0].allocations.forEach(a=>a.amount=1000);
 assert.deepEqual(archivedSalaryBalanceEmployees(archived,[complete],target),[]);
 assert.deepEqual(archivedSalaryBalanceEmployees(archived,[{...source,status:'DRAFT'}],target),[]);
 assert.deepEqual(archivedSalaryBalanceEmployees(archived,[source],{...target,periodMonth:'2026-01'}),[]);
});
test('archived carry creates no current salary, GOSI, installments or deductions even when the archived profile has a salary',async()=>{
 const bundle=await build({entryPoints:['src/utils/payrollEngine.ts'],bundle:true,platform:'node',format:'esm',write:false});
 const engine=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
 for(const employee of archived){
  const item=engine.calculateArchivedSalaryBalanceItem({...employee,salaryPackage:{baseSalary:5000,housingAllowance:1000},nationality:'SAUDI',gosiEnabled:true,hireDate:'2020-01-01',terminationDate:'2026-01-31'}, {id:'c',calculationRules:{roundingDecimals:2,netSalaryRounding:'CEIL_SAR'}},target.periodMonth);
  for(const field of ['baseSalary','housingAllowance','totalGrossSalary','netSalary','loanDeduction','gosiEmployeeShare','gosiEmployerShare','totalDeductions','totalCompanyBurden'])assert.equal(item[field],0,`${employee.employmentEndReason}: ${field}`);
  assert.equal(item.isSuspended,employee.status==='ABSCONDED');
 }
});
