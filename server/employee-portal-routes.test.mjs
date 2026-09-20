import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createEmployeePortalRouter } from './routes/employee-portal-routes.mjs';

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
