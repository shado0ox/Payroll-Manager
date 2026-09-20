import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildEmployeePaidPayslips,createEmployeePortalRouter } from './routes/employee-portal-routes.mjs';

const response = () => ({
  statusCode:200,body:null,
  status(code) { this.statusCode=code; return this; },
  json(body) { this.body=body; return this; },
});
const handlerFor = router => router.stack.find(layer => layer.route?.path === '/employee-portal/me').route.stack.at(-1).handle;

test('employee portal identity is stored as a unique employee foreign key', () => {
  const schema = fs.readFileSync(new URL('./database-schema.mjs',import.meta.url),'utf8');
  assert.match(schema,/ADD COLUMN IF NOT EXISTS employee_id text/);
  assert.match(schema,/FOREIGN KEY \(employee_id\) REFERENCES \$\{q\('employees'\)\}\(id\) ON DELETE SET NULL/);
  assert.match(schema,/users_employee_unique_idx/);
});

test('employee portal profile is resolved exclusively from the authenticated employee id', async () => {
  const queries = [];
  const router = createEmployeePortalRouter({
    auth:(_req,_res,next) => next(),q:name => name,
    pool:{ query:async (sql,params) => {
      queries.push({ sql,params });
      return { rowCount:1,rows:[{
        id:'employee-a',company_id:'company-a',employee_no:'E-1',first_name_ar:'أحمد',last_name_ar:'علي',
        first_name_en:'Ahmed',last_name_en:'Ali',department:'المالية',job_title:'محاسب',hire_date:'2026-01-01',status:'ACTIVE',
        payload:{ email:'employee@example.com',baseSalary:99999 },company_code:'101',company_name_ar:'شركة',company_name_en:'Company',company_payload:{ taxNumber:'secret' },
      }] };
    } },
  });
  const req = { user:{ id:'user-a',role:'EMPLOYEE',employee_id:'employee-a',company_ids:['company-a'],email:'employee@example.com' },query:{ employeeId:'employee-b' } };
  const res = response();
  await handlerFor(router)(req,res,error => { if (error) throw error; });
  assert.deepEqual(queries[0].params,['employee-a',['company-a']]);
  assert.equal(res.body.profile.id,'employee-a');
  assert.equal('baseSalary' in res.body.profile,false);
  assert.equal('taxNumber' in res.body.company,false);
});

test('employee portal rejects unlinked and administrative accounts', async () => {
  const router = createEmployeePortalRouter({ auth:(_req,_res,next) => next(),q:name => name,pool:{ query:async () => assert.fail('database must not be queried') } });
  const handler = handlerFor(router);
  const staff = response();
  await handler({ user:{ role:'COMPANY_MANAGER' } },staff,() => {});
  assert.equal(staff.statusCode,403);
  const unlinked = response();
  await handler({ user:{ role:'EMPLOYEE' } },unlinked,() => {});
  assert.equal(unlinked.statusCode,409);
});

test('paid payslips split the current salary from carried prior months without exposing private payroll fields', () => {
  const batchRows = [{
    id:'batch-1',payroll_run_id:'run-aug',batch_number:'PAY-202608-001',method:'WPS',payment_date:'2026-08-31',
    payment_period_month:'2026-08',employee_ids:['employee-a'],batch_payload:{ reference:'BANK-1' },
  }];
  const itemRows = [{
    payroll_run_id:'run-aug',id:'item-a',period_month:'2026-08',employee_no:'E-1',employee_name:'أحمد',
    base_salary:'5000',total_gross_salary:'5500',total_deductions:'500',net_salary:'9000',
    payload:{ employeeId:'employee-a',bankIban:'SA0000000000000000000000',department:'المالية',baseSalary:5000,
      totalGrossSalary:5500,totalDeductions:500,netSalary:9000,priorPeriodDetails:[{ periodMonth:'2026-07',gross:4500,deductions:500,net:4000 }] },
  }];
  const payslips = buildEmployeePaidPayslips(batchRows,itemRows,'employee-a');
  assert.deepEqual(payslips.map(item => [item.periodMonth,item.paidAmount]),[['2026-08',5000],['2026-07',4000]]);
  assert.deepEqual(payslips.map(item => item.snapshot.netSalary),[5000,4000]);
  assert.equal(payslips[0].snapshot.employeeName,'أحمد');
  assert.equal('bankIban' in payslips[0].snapshot,false);
  assert.equal('employeeId' in payslips[0].snapshot,false);
});

test('paid payslips include an explicitly referenced prior entitlement once', () => {
  const batchRows = [{
    id:'batch-2',payroll_run_id:'run-aug',batch_number:'PAY-2',method:'BANK_TRANSFER',payment_date:'2026-09-01',
    payment_period_month:'2026-08',employee_ids:['employee-a'],batch_payload:{ priorEntitlements:[
      { employeeId:'employee-a',sourcePayrollRunId:'run-jul',sourcePeriodMonth:'2026-07',amount:3900 },
      { employeeId:'employee-b',sourcePayrollRunId:'run-jul',sourcePeriodMonth:'2026-07',amount:6000 },
    ] },
  }];
  const item = (run,period,net) => ({ payroll_run_id:run,id:`item-${period}`,period_month:period,employee_no:'E-1',employee_name:'أحمد',base_salary:'4000',total_gross_salary:'4000',total_deductions:String(4000-net),net_salary:String(net),payload:{} });
  const payslips = buildEmployeePaidPayslips(batchRows,[item('run-aug','2026-08',4000),item('run-jul','2026-07',3900)],'employee-a');
  assert.deepEqual(payslips.map(entry => [entry.periodMonth,entry.paidAmount]),[['2026-08',4000],['2026-07',3900]]);
});

test('payslip list is restricted to paid batches and the authenticated employee in SQL', async () => {
  const queries = [];
  const router = createEmployeePortalRouter({ auth:(_req,_res,next) => next(),q:name => name,pool:{ query:async (sql,params) => {
    queries.push({ sql,params });
    return { rowCount:0,rows:[] };
  } } });
  const layer = router.stack.find(candidate => candidate.route?.path === '/employee-portal/payslips');
  const res = response();
  await layer.route.stack.at(-1).handle({ user:{ role:'EMPLOYEE',employee_id:'employee-a',company_ids:['company-a'] } },res,error => { if (error) throw error; });
  assert.deepEqual(queries.map(query => query.params),[['employee-a',['company-a']],['employee-a',['company-a']]]);
  assert.match(queries[0].sql,/b\.status='PAID'/);
  assert.match(queries[0].sql,/direct_item\.employee_id=\$1/);
  assert.match(queries[1].sql,/i\.employee_id=\$1/);
  assert.deepEqual(res.body,{ payslips:[] });
});
