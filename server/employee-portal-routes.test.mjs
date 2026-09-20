import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildEmployeeAttendanceReport,buildEmployeeLeaveReport,buildEmployeePaidPayslips,createEmployeePortalRouter } from './routes/employee-portal-routes.mjs';

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
        bank_iban:'SA123',payload:{ email:'employee@example.com',baseSalary:99999,nationality:'SAUDI',contractEndDate:'2027-01-31',bankName:'البنك',bankSwiftCode:'TESTSARI' },company_code:'101',company_name_ar:'شركة',company_name_en:'Company',company_payload:{ taxNumber:'secret' },
      }] };
    } },
  });
  const req = { user:{ id:'user-a',role:'EMPLOYEE',employee_id:'employee-a',company_ids:['company-a'],email:'employee@example.com' },query:{ employeeId:'employee-b' } };
  const res = response();
  await handlerFor(router)(req,res,error => { if (error) throw error; });
  assert.deepEqual(queries[0].params,['employee-a',['company-a']]);
  assert.equal(res.body.profile.id,'employee-a');
  assert.equal('baseSalary' in res.body.profile,false);
  assert.equal(res.body.profile.contractEndDate,'2027-01-31');
  assert.equal(res.body.profile.iqamaExpiryDate,'');
  assert.equal(res.body.profile.bankIban,'SA123');
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

test('attendance report summarizes delays, absences, leave, and missing punches from stored records', () => {
  const report = buildEmployeeAttendanceReport([
    { id:'1',record_date:'2026-09-01',days_count:1,delay_minutes:0,absence:false,unpaid_leave:false,overtime_hours:'1.5',payload:{ attendanceStatus:'LATE',calculatedDelayMinutes:25,scheduledStart:'09:00',actualCheckIn:'09:25' } },
    { id:'2',record_date:'2026-09-02',days_count:2,delay_minutes:0,absence:true,unpaid_leave:false,overtime_hours:0,payload:{ attendanceStatus:'ABSENT' } },
    { id:'3',record_date:'2026-09-04',days_count:1,delay_minutes:0,absence:false,unpaid_leave:true,overtime_hours:0,payload:{ attendanceStatus:'LEAVE' } },
    { id:'4',record_date:'2026-09-05',days_count:1,delay_minutes:0,absence:false,unpaid_leave:false,overtime_hours:0,notes:'بصمة خروج ناقصة',payload:{ attendanceStatus:'MISSING_OUT' } },
  ],'2026-09');
  assert.deepEqual(report.summary,{ presentDays:1,lateDays:1,totalDelayMinutes:25,absenceDays:2,leaveDays:1,missingPunchDays:1,overtimeHours:1.5 });
  assert.equal(report.records[0].actualCheckIn,'09:25');
  assert.equal('sourceFileName' in report.records[0],false);
});

test('attendance endpoint validates the month and scopes both queries to the session employee', async () => {
  const queries = [];
  const router = createEmployeePortalRouter({ auth:(_req,_res,next) => next(),q:name => name,pool:{ query:async (sql,params) => {
    queries.push({ sql,params }); return { rows:[],rowCount:0 };
  } } });
  const layer = router.stack.find(candidate => candidate.route?.path === '/employee-portal/attendance');
  const invalid = response();
  await layer.route.stack.at(-1).handle({ user:{ role:'EMPLOYEE',employee_id:'employee-a',company_ids:['company-a'] },query:{ periodMonth:'September' } },invalid,error => { if (error) throw error; });
  assert.equal(invalid.statusCode,400);
  assert.equal(queries.length,0);
  const valid = response();
  await layer.route.stack.at(-1).handle({ user:{ role:'EMPLOYEE',employee_id:'employee-a',company_ids:['company-a'] },query:{ periodMonth:'2026-09',employeeId:'employee-b' } },valid,error => { if (error) throw error; });
  assert.deepEqual(queries.map(query => query.params),[['employee-a',['company-a'],'2026-09'],['employee-a',['company-a']]]);
  assert.match(queries[0].sql,/employee_id=\$1/);
  assert.deepEqual(valid.body.availableMonths,[]);
});

test('leave report calculates selected-year annual balance without counting pending requests as used', () => {
  const report = buildEmployeeLeaveReport([
    { id:'approved',leave_type:'ANNUAL',start_date:'2026-12-28',end_date:'2027-01-03',days_count:7,status:'APPROVED',is_paid:true,reason:'' },
    { id:'pending',leave_type:'ANNUAL',start_date:'2026-08-01',end_date:'2026-08-03',days_count:3,status:'PENDING',is_paid:true,reason:'' },
    { id:'sick',leave_type:'SICK',start_date:'2026-05-01',end_date:'2026-05-02',days_count:2,status:'APPROVED',is_paid:true,reason:'' },
  ],21,2026);
  assert.deepEqual(report.annualBalance,{ entitlementDays:21,approvedDays:4,pendingDays:3,remainingDays:17 });
  assert.equal('employee_id' in report.leaves[0],false);
});

test('employee leave API owns identity, status, pay type, day count, overlap, and audit fields on the server', () => {
  const source = fs.readFileSync(new URL('./routes/employee-portal-routes.mjs',import.meta.url),'utf8');
  assert.match(source,/employeeId:req\.user\.employee_id/);
  assert.match(source,/status:'PENDING'/);
  assert.match(source,/isPaid:type !== 'UNPAID'/);
  assert.match(source,/const requestedDays = leaveDays\(startDate,endDate\)/);
  assert.match(source,/status IN \('PENDING','APPROVED'\)[\s\S]*start_date <= \$4::date/);
  assert.match(source,/action:'EMPLOYEE_LEAVE_REQUEST'/);
  assert.match(source,/existing\.rows\[0\]\.status !== 'PENDING'/);
});

test('bank changes stay pending until management approval and derive bank identity from company definitions', () => {
  const portal = fs.readFileSync(new URL('./routes/employee-portal-routes.mjs',import.meta.url),'utf8');
  const employees = fs.readFileSync(new URL('./routes/employee-routes.mjs',import.meta.url),'utf8');
  const schema = fs.readFileSync(new URL('./database-schema.mjs',import.meta.url),'utf8');
  assert.match(schema,/CREATE TABLE IF NOT EXISTS \$\{q\('employee_bank_change_requests'\)\}/);
  assert.match(schema,/employee_bank_change_one_pending_idx/);
  assert.match(portal,/validSaudiIban\(requestedIban\)/);
  assert.match(portal,/iban_bank_code=\$2 AND is_active=true/);
  assert.match(portal,/status='PENDING'/);
  assert.doesNotMatch(portal,/UPDATE \$\{q\('employees'\)\} SET bank_iban/);
  assert.match(employees,/decision === 'APPROVED'/);
  assert.match(employees,/SET bank_iban=\$2,payload=\$3::jsonb/);
  assert.match(employees,/previousSnapshot/);
  assert.match(employees,/newSnapshot/);
});

test('employee role is preserved by legacy role normalization', () => {
  const schema = fs.readFileSync(new URL('./database-schema.mjs',import.meta.url),'utf8');
  assert.match(schema,/role IN \('HR_MANAGER','PAYROLL_SPECIALIST','AUDITOR'\)/);
  assert.doesNotMatch(schema,/role IN \('HR_MANAGER','PAYROLL_SPECIALIST','AUDITOR','EMPLOYEE'\)/);
  assert.match(schema,/SET role='EMPLOYEE',permissions='\[\]'::jsonb[\s\S]*employee_id IS NOT NULL/);
});
