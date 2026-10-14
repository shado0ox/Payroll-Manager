import test from 'node:test';
import assert from 'node:assert/strict';
import {createPortalRegistrationApprovalRouter} from './routes/portal-registration-approval-routes.mjs';
const response=()=>({statusCode:200,status(n){this.statusCode=n;return this},json(v){this.body=v;return this}});
function fixture(row,allowed=true){
 const calls=[];let broadcasts=0;
 const client={query:async(sql,args)=>{calls.push({sql,args});if(sql.startsWith('SELECT p.*'))return {rows:row?[row]:[]};return {rows:[],rowCount:1}},release(){}};
 const router=createPortalRegistrationApprovalRouter({auth:(_q,_s,n)=>n(),writeLimiter:(_q,_s,n)=>n(),pool:{connect:async()=>client,query:client.query},q:n=>`qa.${n}`,can:()=>allowed,bumpStateVersion:async()=>({rows:[{version:2}]}),appendStateAudit:async()=>{},broadcastStateUpdate:()=>{broadcasts++}});
 const review=router.stack.find(x=>x.route?.path.endsWith('/review')).route.stack.at(-1).handle;
 return {calls,review,broadcasts:()=>broadcasts};
}
const row={id:'p1',company_id:'c1',employee_id:'e1',email:'verified@example.test',approval_status:'PENDING',employee_status:'ACTIVE',is_archived:false};
const req=decision=>({user:{id:'u1',company_ids:['c1']},params:{id:'p1'},body:{decision,reason:'Verified identity'}});
test('approval activates only the tenant employee and publishes after commit',async()=>{
 const f=fixture(row),res=response();await f.review(req('APPROVED'),res,e=>{throw e});
 assert.equal(res.statusCode,200);assert.equal(res.body.approvalStatus,'APPROVED');
 assert.ok(f.calls.some(c=>c.sql.startsWith('UPDATE qa.employee_portal_accounts')&&c.args[2]===true));
 assert.ok(f.calls.some(c=>c.sql.startsWith('UPDATE qa.employees')&&c.args[2]==='c1'));
 assert.equal(f.calls.at(-1).sql,'COMMIT');assert.equal(f.broadcasts(),1);
});
test('rejection does not overwrite employee email or activate the account',async()=>{
 const f=fixture(row),res=response();await f.review(req('REJECTED'),res,e=>{throw e});
 assert.equal(res.body.approvalStatus,'REJECTED');assert.ok(!f.calls.some(c=>c.sql.startsWith('UPDATE qa.employees')));
 assert.ok(f.calls.some(c=>c.sql.startsWith('UPDATE qa.employee_portal_accounts')&&c.args[2]===false));
});
test('cross-company review and missing permission never write or broadcast',async()=>{
 for(const f of [fixture({...row,company_id:'c2'}),fixture(row,false)]){
  const res=response();await f.review(req('APPROVED'),res,e=>{throw e});assert.equal(res.statusCode,403);
  assert.ok(!f.calls.some(c=>c.sql.startsWith('UPDATE')));assert.equal(f.broadcasts(),0);
 }
});
test('already reviewed and archived employees cannot be approved',async()=>{
 for(const changed of [{approval_status:'APPROVED'},{is_archived:true}]){
  const f=fixture({...row,...changed}),res=response();await f.review(req('APPROVED'),res,e=>{throw e});
  assert.equal(res.statusCode,409);assert.equal(f.broadcasts(),0);
 }
});
