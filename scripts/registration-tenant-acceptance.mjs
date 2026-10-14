import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import {initializeDatabaseSchema} from '../server/database-schema.mjs';
import {createAuthRegistrationRouter} from '../server/routes/auth-registration-routes.mjs';
import {createAuthLoginRouter} from '../server/routes/auth-login-routes.mjs';
import {createPortalRegistrationApprovalRouter} from '../server/routes/portal-registration-approval-routes.mjs';

export async function verifyRegistrationAndTenants(pool,schema) {
  if(!/^[a-z_][a-z0-9_]*$/.test(schema))throw new Error('Invalid isolated QA schema');
  const q=n=>`"${schema}".${n}`,sha256=x=>crypto.createHash('sha256').update(x).digest('hex');
  await initializeDatabaseSchema({pool,q,schema,bcrypt});
  const companyId=process.env.COMPANY_ID;
  await pool.query(`INSERT INTO ${q('companies')}(id,company_code,name_ar) VALUES('qa-company-2','qa102','Second')`);
  const insertUser=async(id,company,username='shared',email='shared@example.test')=>pool.query(`INSERT INTO ${q('users')}(id,username,email,password_hash,name,role,company_ids) VALUES($1,$2,$3,'hash','name','OPERATIONS_MANAGER',$4::jsonb)`,[id,username,email,JSON.stringify([company])]);
  await insertUser('qa-u1',companyId);await insertUser('qa-u2','qa-company-2');
  await assert.rejects(insertUser('qa-u3',companyId),e=>e.code==='23505');
  await assert.rejects(insertUser('qa-u3','qa-company-2','SHARED','other@example.test'),e=>e.code==='23505');
  await assert.rejects(insertUser('qa-u3',companyId,'shared@example.test','other@example.test'),e=>e.code==='23505');
  const race=await Promise.allSettled([insertUser('qa-race1',companyId,'race','race1@example.test'),insertUser('qa-race2',companyId,'race','race2@example.test')]);
  assert.equal(race.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(race.filter(result=>result.status==='rejected'&&result.reason.code==='23505').length,1);
  await initializeDatabaseSchema({pool,q,schema,bcrypt});
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ${q('users')} WHERE username='shared'`)).rows[0].n,2);
  const makeEmployee=async(id,no,company=companyId)=>pool.query(`INSERT INTO ${q('employees')}(id,company_id,employee_no,national_id_or_iqama,status,payload) VALUES($1,$2,$3,$3,'ACTIVE','{"email":"original@example.test"}')`,[id,company,no]);
  await makeEmployee('qa-e1','1234567890');
  let emailCode;
  const noop=(_req,_res,next)=>next();
  const registration=createAuthRegistrationRouter({registrationLimiter:noop,publicRegistrationEnabled:false,pool,q,sha256,isStrongPassword:()=>true,sendVerificationEmail:async(_email,code)=>{emailCode=code;}});
  const handler=(router,path)=>router.stack.find(x=>x.route?.path===path).route.stack.at(-1).handle;
  const call=async(fn,req)=>{
    const res={code:200,headers:{},status(n){this.code=n;return this},json(value){this.body=value;return this},setHeader(k,v){this.headers[k]=v}};
    await fn({get:()=>'',ip:'127.0.0.1',...req},res,error=>{throw error});return res;
  };
  const body={companyCode:process.env.COMPANY_CODE,identityNumber:'1234567890',email:'new-employee@example.test',username:'qa-employee',password:'Test1!password',privacyAccepted:true,privacyVersion:'1.0',termsVersion:'1.0'};
  const submit=async()=>{
    const start=await call(handler(registration,'/employee-register/start'),{body});assert.equal(start.code,202);
    const verified=await call(handler(registration,'/employee-register/verify'),{body:{requestId:start.body.requestId,code:emailCode}});assert.equal(verified.code,201);assert.equal(verified.body.approvalStatus,'PENDING');
    return (await pool.query(`SELECT * FROM ${q('employee_portal_accounts')} WHERE employee_id='qa-e1'`)).rows[0];
  };
  let account=await submit();assert.equal(account.is_active,false);
  assert.equal((await pool.query(`SELECT payload->>'email' email FROM ${q('employees')} WHERE id='qa-e1'`)).rows[0].email,'original@example.test');
  const login=handler(createAuthLoginRouter({loginLimiter:noop,pool,q,sha256,permissionsFor:()=>[]}),'/login');
  const loginRequest={body:{companyCode:process.env.COMPANY_CODE,username:body.username,password:body.password}};
  assert.equal((await call(login,loginRequest)).code,401);
  const reviewRouter=createPortalRegistrationApprovalRouter({auth:noop,writeLimiter:noop,pool,q,can:()=>true,bumpStateVersion:async()=>({rows:[{version:1}]}),appendStateAudit:async()=>{},broadcastStateUpdate:()=>{}});
  const review=handler(reviewRouter,'/employee-registration-requests/:id/review');
  const reviewRequest=decision=>({user:{id:'user-admin',company_ids:[companyId]},params:{id:account.id},body:{decision,reason:'Checked employee identity'}});
  const outsider=reviewRequest('APPROVED');outsider.user.company_ids=['qa-company-2'];assert.equal((await call(review,outsider)).code,403);
  assert.equal((await call(review,reviewRequest('REJECTED'))).code,200);
  assert.equal((await call(login,loginRequest)).code,401);
  account=await submit();assert.equal((await call(review,reviewRequest('APPROVED'))).code,200);
  assert.equal((await call(login,loginRequest)).code,200);
  assert.equal((await call(review,reviewRequest('APPROVED'))).code,409);
  assert.equal((await pool.query(`SELECT payload->>'email' email FROM ${q('employees')} WHERE id='qa-e1'`)).rows[0].email,body.email);
  // Preserve an administrative account and a portal belonging to the same employee.
  await makeEmployee('qa-hybrid','1234567891');
  await pool.query(`INSERT INTO ${q('users')}(id,username,email,password_hash,name,role,company_ids,employee_id) VALUES('qa-hybrid-user','hybrid','hybrid@example.test','hash','name','OPERATIONS_MANAGER',$1::jsonb,'qa-hybrid')`,[JSON.stringify([companyId])]);
  await pool.query(`INSERT INTO ${q('employee_portal_accounts')}(id,employee_id,company_id,username,password_hash,email) VALUES('qa-hybrid-portal','qa-hybrid',$1,'hybrid','hash','hybrid@example.test')`,[companyId]);
  await initializeDatabaseSchema({pool,q,schema,bcrypt});
  await pool.query(`DELETE FROM ${q('employee_portal_accounts')} WHERE id='qa-hybrid-portal'`);
  await assert.rejects(insertUser('qa-collision',companyId,'hybrid','other@example.test'),e=>e.code==='23505');
  await pool.query(`DELETE FROM ${q('users')} WHERE id='qa-hybrid-user'`);await insertUser('qa-reused',companyId,'hybrid','hybrid@example.test');
  await pool.query(`DELETE FROM ${q('users')} WHERE id='qa-u1'`);await insertUser('qa-u3',companyId);
  await assert.rejects(pool.query(`UPDATE ${q('users')} SET company_ids=$1::jsonb WHERE id='qa-u3'`,[JSON.stringify([companyId,'qa-company-2'])]),e=>e.code==='23505');
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ${q('tenant_credential_memberships')} WHERE account_id='qa-u3'`)).rows[0].n,2);
  console.log('Registration/tenant acceptance passed: pending login blocked, rejection/reapply, approval, tenant isolation, case-insensitive uniqueness, restart, mirrored accounts, deletion and rollback.');
}
if(process.argv[1]?.endsWith('/registration-tenant-acceptance.mjs')) {
  if(process.env.ACCEPTANCE_CONFIRM_ISOLATED_DB!=='YES')throw new Error('Use an isolated test database and set ACCEPTANCE_CONFIRM_ISOLATED_DB=YES');
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
  const schema=`registration_qa_${crypto.randomBytes(4).toString('hex')}`;
  try{await verifyRegistrationAndTenants(pool,schema);}finally{await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await pool.end();}
}
