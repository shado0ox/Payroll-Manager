import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlySalaryAccountReport } from './payroll-ledger.mjs';
const sep={id:'sep',companyId:'c',periodMonth:'2026-09',endDate:'2026-09-30',status:'APPROVED',items:[{id:'i',employeeId:'archived',employeeNo:'1',employeeName:'مؤرشف',netSalary:50000}],paymentBatches:[]};
const allocation=amount=>({employeeId:'archived',periodMonth:'2026-09',sourcePayrollRunId:'sep',sourcePayrollItemId:'i',amount});
const oct={id:'oct',companyId:'c',periodMonth:'2026-10',endDate:'2026-10-31',status:'APPROVED',items:[{id:'carry',employeeId:'archived',employeeNo:'1',netSalary:50000,priorPeriodNet:50000}],paymentBatches:[{id:'p',status:'PAID',totalAmount:40000,paymentDate:'2026-10-03',allocations:[allocation(40000)]},{id:'s',status:'SCHEDULED',allocations:[allocation(10000)]}]};
test('monthly account carries source wages forward and records later payment by actual date, without counting carry or scheduled cash',()=>{
 const runs=[sep,oct,{...sep,companyId:'other'},{...sep,id:'draft',periodMonth:'2026-11',status:'DRAFT'}];
 const september=monthlySalaryAccountReport(runs,'c','2026-09')[0];assert.equal(september.opening,0);assert.equal(september.credit,50000);assert.equal(september.debit,0);assert.equal(september.closing,50000);
 const october=monthlySalaryAccountReport(runs,'c','2026-10')[0];assert.equal(october.opening,50000);assert.equal(october.wages,0);assert.equal(october.paid,40000);assert.equal(october.closing,10000);
 const march=monthlySalaryAccountReport(runs,'c','2027-03')[0];assert.equal(march.opening,10000);assert.equal(march.debit,0);assert.equal(march.closing,10000);
 assert.equal(monthlySalaryAccountReport(runs,'c','2026-08').length,0);
});
test('offsets and reversal affect their event month and every closing equals the next opening',()=>{
 const source={...sep,entitlementOffsets:[{id:'x',sourcePayrollItemId:'i',employeeId:'archived',amount:10000,date:'2026-11-02',documentRef:'x'},{id:'r',sourcePayrollItemId:'i',employeeId:'archived',amount:-10000,date:'2026-12-02',documentRef:'r'}]};
 const november=monthlySalaryAccountReport([source,oct],'c','2026-11')[0];assert.equal(november.opening,10000);assert.equal(november.offsets,10000);assert.equal(november.closing,0);
 const december=monthlySalaryAccountReport([source,oct],'c','2026-12')[0];assert.equal(december.opening,november.closing);assert.equal(december.reversals,10000);assert.equal(december.closing,10000);
});
