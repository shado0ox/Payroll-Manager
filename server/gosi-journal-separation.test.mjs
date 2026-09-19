import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { snapshotPayrollGosiBranches } from './gosi-payroll-snapshot.mjs';

const engine=fs.readFileSync('src/utils/accountingEngine.ts','utf8');
const view=fs.readFileSync('src/components/AccountingJournalsView.tsx','utf8');
const schema=fs.readFileSync('server/database-schema.mjs','utf8');
const journalRoutes=fs.readFileSync('server/routes/journal-qoyod-routes.mjs','utf8');
const payrollRoutes=fs.readFileSync('server/routes/payroll-routes.mjs','utf8');

test('payroll persistence snapshots effective employee and department GOSI branches',async()=>{
  const responses=[
    { rows:[
      {id:'branch-main',registration_number:'602442241',name:'فرع رئيسي',branch_name:'رئيسي',branch_code:'MAIN',gosi_establishment_number:'602442241',gosi_employer_expense_account:'510601',gosi_payable_account:'210201',is_default:true},
      {id:'branch-sub',registration_number:'635921234',name:'فرع فرعي',branch_name:'فرعي',branch_code:'SUB',gosi_establishment_number:'635921234',gosi_employer_expense_account:'510602',gosi_payable_account:'210202',is_default:false},
    ]},
    { rows:[{employee_id:'employee-2',account_id:'branch-sub'}] },
    { rows:[{department_name:'الموارد البشرية',account_id:'branch-main'}] },
  ];
  const calls=[];
  const client={query:async(sql,params)=>{calls.push({sql,params});return responses.shift();}};
  const record=await snapshotPayrollGosiBranches(client,name=>`"${name}"`,{companyId:'comp-1',periodMonth:'2026-08',items:[
    {id:'item-1',employeeId:'employee-1',department:'الموارد البشرية'},
    {id:'item-2',employeeId:'employee-2',department:'تقنية المعلومات'},
  ]});
  assert.equal(calls.length,3,'PoolClient queries must remain sequential');
  assert.deepEqual(record.items.map(item=>[item.gosiBranchId,item.gosiBranchCode,item.gosiEmployerExpenseAccount,item.gosiPayableAccount]),[
    ['branch-main','MAIN','510601','210201'],['branch-sub','SUB','510602','210202'],
  ]);
});

test('accounting engine separates payroll and branch GOSI journals from run item snapshots',()=>{
  const payrollStart=engine.indexOf('export function generatePayrollJournalBatch');
  const gosiStart=engine.indexOf('function collectGosiBranches');
  const payrollBlock=engine.slice(payrollStart,gosiStart);
  assert.ok(payrollStart>=0&&gosiStart>payrollStart);
  assert.doesNotMatch(payrollBlock,/gosiPayableAccount|مصروف التأمينات الاجتماعية/);
  assert.match(engine,/JV-GOSI-\$\{code\}-\$\{payrollRun\.periodMonth\.replace\('-',''\)\}/);
  assert.match(engine,/item\.gosiBranchId\|\|'UNASSIGNED'/);
  assert.match(engine,/accountCode:'9999'/);
  assert.match(engine,/date:monthEnd\(payrollRun\.periodMonth\)/);
});

test('existing journals tab exposes four journal selectors and branch selection without a new navigation tab',()=>{
  for(const type of ['PAYROLL_ACCRUAL','GOSI_ACCRUAL','PAYROLL_PAYMENT','GOSI_PAYMENT']) assert.match(view,new RegExp(type));
  assert.match(view,/فرع التأمينات/);
  assert.match(view,/mergeFreshJournalWithDraft/);
  assert.match(view,/سبب التعديل \(إلزامي\)/);
});

test('GOSI branch accounts and journal change audit are normalized in PostgreSQL',()=>{
  for(const column of ['branch_code','gosi_establishment_number','gosi_employer_expense_account','gosi_payable_account']) assert.match(schema,new RegExp(column));
  assert.match(schema,/journal_change_logs/);
  for(const field of ['journal_batch_id','change_type','changed_at','changed_by','reason','previous_snapshot','new_snapshot','affected_branches']) assert.match(schema,new RegExp(field));
  assert.match(journalRoutes,/JOURNAL_CHANGE_REASON_REQUIRED/);
  assert.match(journalRoutes,/qoyodSyncStatus\?\.synced/);
  assert.match(journalRoutes,/record\.qoyodSnapshot/);
  assert.match(payrollRoutes,/snapshotPayrollGosiBranches\(client,q,record\)/);
});
