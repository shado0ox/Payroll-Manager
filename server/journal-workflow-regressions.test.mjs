import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {journalMatchesPayrollPeriod} from './routes/journal-qoyod-routes.mjs';
import {validateBalancedJournal} from './journal-validation.mjs';
const batch={id:'b',totalDebit:10.5,totalCredit:10.5,lines:[{id:'d',accountCode:'5101',debit:10.5,credit:0},{id:'c',accountCode:'2101',debit:0,credit:10.5}]};
test('cash and offset journals may be saved in a later month, accrual still belongs to its source month',()=>{
 for(const journalType of ['PAYROLL_PAYMENT','PAYROLL_SETTLEMENT'])assert.equal(journalMatchesPayrollPeriod({journalType,periodMonth:'2026-10',date:'2026-10-03'},'2026-09'),true);
 assert.equal(journalMatchesPayrollPeriod({journalType:'PAYROLL_PAYMENT',periodMonth:'2026-09',date:'2026-10-03'},'2026-09'),false);
 assert.equal(journalMatchesPayrollPeriod({journalType:'PAYROLL_ACCRUAL',periodMonth:'2026-09',date:'2026-10-03'},'2026-09'),true);
 assert.equal(journalMatchesPayrollPeriod({journalType:'PAYROLL_ACCRUAL',periodMonth:'2026-10',date:'2026-10-03'},'2026-09'),false);
});
test('one halala differences, invalid lines, inconsistent totals and empty journals are rejected without balance adjustment',()=>{
 assert.equal(validateBalancedJournal(batch).valid,true);
 for(const invalid of [{...batch,totalCredit:10.49},{...batch,lines:[batch.lines[0],{...batch.lines[1],credit:10.49}]},{...batch,lines:[]},{...batch,lines:batch.lines.map(line=>({...line,accountCode:''}))},{...batch,lines:[{...batch.lines[0],debit:10.501},batch.lines[1]]},{...batch,lines:[{...batch.lines[0],credit:10.5},batch.lines[1]]}])assert.equal(validateBalancedJournal(invalid).valid,false);
});
test('Qoyod request rejects imbalance before any network call and displays structured upstream errors',async()=>{
 const bundle=await build({entryPoints:['src/utils/qoyodApi.ts'],bundle:true,platform:'node',format:'esm',write:false});const api=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
 const original=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({errors:{account_id:['غير موجود']}}),{status:422});};
  assert.equal((await api.sendJournalEntryToQoyod({...batch,totalCredit:0},{id:'c'},{})).success,false);assert.equal(calls,0);
  const failed=await api.sendJournalEntryToQoyod(batch,{id:'c'},{});assert.equal(failed.success,false);assert.match(failed.message,/account_id/);assert.match(failed.message,/غير موجود/);
  globalThis.fetch=async()=>new Response(JSON.stringify({journal_entry:{id:123}}),{status:201});assert.equal((await api.sendJournalEntryToQoyod(batch,{id:'c'},{})).responseData.id,123);
 }finally{globalThis.fetch=original;}
});
test('journal date choices include future months, older recorded periods and are sorted uniquely',async()=>{
 const bundle=await build({entryPoints:['src/utils/period.ts'],bundle:true,platform:'node',format:'esm',write:false});const period=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
 const choices=period.getJournalPeriods(['2010-01','2026-10','invalid'],'2026-10');assert.ok(choices.includes('2031-12'));assert.ok(choices.includes('2026-11'));assert.ok(choices.includes('2010-01'));assert.equal(choices.length,new Set(choices).size);assert.deepEqual(choices,[...choices].sort().reverse());
});
