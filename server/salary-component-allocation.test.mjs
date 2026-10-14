import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
import {allocateSalaryComponents} from './salary-component-allocation.mjs';
test('component allocation preserves recorded entitlement and distributes sub-halala fractions deterministically',()=>{
 const components=allocateSalaryComponents([1000/30,1000/30,0,0,0,0],66.67);assert.deepEqual(components,[33.34,33.33,0,0,0,0]);
 assert.deepEqual(allocateSalaryComponents([100,200,0,0,0,0],300),[100,200,0,0,0,0]);
 assert.equal(allocateSalaryComponents([100,200],500).reduce((sum,value)=>sum+value,0),300); // actual discrepancy is not concealed
});
test('six partial salaries reproduce a two-halala aggregation difference and journal honors the original saved gross and net',async()=>{
 const bundle=await build({entryPoints:['src/utils/accountingEngine.ts'],bundle:true,platform:'node',format:'esm',write:false});const engine=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
 const item=(id,base,gross)=>({id,employeeId:id,baseSalary:base,totalGrossSalary:gross,totalDeductions:0,netSalary:gross,entitlementStatus:'PAYABLE'});
 const items=[item('full',376117.17,376117.17),...Array.from({length:6},(_,i)=>item('partial-'+i,1000/30,33.33))];
 const original=structuredClone(items);const raw=Math.round(items.reduce((sum,row)=>sum+row.baseSalary,0)*100)/100;assert.equal(raw,376317.17);
 const journal=engine.generatePayrollJournalBatch({id:'c',chartOfAccounts:{}},{id:'r',companyId:'c',periodMonth:'2026-10',status:'APPROVED',items});
 assert.equal(journal.totalDebit,376317.15);assert.equal(journal.totalCredit,376317.15);assert.ok(!journal.lines.some(line=>line.id==='line-balance-adjustment'));assert.deepEqual(items,original);assert.ok(!journal.balanceDiagnostics.some(row=>row.severity==='ERROR'));
});
