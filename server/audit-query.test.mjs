import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';
import {auditQueryOptions,createAuditRouter,redactAuditValue} from './routes/audit-routes.mjs';
const user={id:'u',role:'ADMIN',company_ids:['c']};
test('audit query enforces assigned company even for administrator and rejects invalid dates, pages and sort injection',()=>{
 assert.throws(()=>auditQueryOptions({companyId:'other'},user),e=>e.status===403);
 for(const options of [{page:'0'},{limit:'101'},{order:'desc; DROP TABLE users'},{from:'2026-02-30'},{from:'2026-10-15',to:'2026-10-01'},{timeZone:'invalid'}])assert.throws(()=>auditQueryOptions({companyId:'c',...options},user),e=>e.status===400);
 assert.equal(auditQueryOptions({companyId:'c',from:'2026-10-01',to:'2026-10-15'},user).timeZone,'Asia/Riyadh');
});
test('audit redaction masks nested credentials without removing recorded financial amounts',()=>{
 const clean=redactAuditValue({apiKey:'s',diff:{before:{password_hash:'x',remainingAmount:10},after:{token:'t',remainingAmount:0}}});assert.equal(clean.apiKey,'[redacted]');assert.equal(clean.diff.before.password_hash,'[redacted]');assert.equal(clean.diff.after.token,'[redacted]');assert.equal(clean.diff.before.remainingAmount,10);
});
test('read-only audit endpoint parameterizes filters, paginates in time order and never queries forbidden scopes',async t=>{
 const calls=[];let permitted=true;const pool={query:async(sql,params)=>{calls.push({sql,params});if(sql.includes('count(*)'))return {rows:[{total:1,users:1,actions:1,latest:'2026-10-15T00:00:00Z'}]};if(sql.includes('SELECT DISTINCT'))return {rows:[{action:'UPDATE_LOAN',entity_type:'LOAN',user_id:'u',user_name:'مدير'}]};return {rows:[{id:'a',company_id:'c',user_id:'u',user_name:'مدير',user_role:'ADMIN',action:'UPDATE_LOAN',entity_type:'LOAN',entity_id:'l',occurred_at:'2026-10-15T00:00:00Z',details:null,payload:{secretValue:'s',diff:{before:{remainingAmount:100},after:{remainingAmount:0}}}}]};}};
 const app=express();app.use(createAuditRouter({auth:(req,_res,next)=>{req.user=user;next();},pool,q:name=>name,can:()=>permitted}));const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});t.after(()=>new Promise(resolve=>server.close(resolve)));const url=`http://127.0.0.1:${server.address().port}/audit-logs`;
 const response=await fetch(url+'?companyId=c&page=2&limit=25&from=2026-10-01&to=2026-10-15&search=%27');assert.equal(response.status,200);const data=await response.json();assert.equal(data.logs[0].secretValue,'[redacted]');assert.equal(data.logs[0].details,'');assert.equal(data.total,1);assert.equal(data.facets.users[0].name,'مدير');
 assert.ok(calls.every(call=>call.params[0]==='c'));assert.match(calls[0].sql,/ORDER BY occurred_at desc,id desc LIMIT/);assert.ok(calls[0].params.includes('%\'%'));assert.equal(calls[0].params.at(-1),25);assert.ok(calls[0].params.includes('Asia/Riyadh'));
 calls.length=0;assert.equal((await fetch(url+'?companyId=other')).status,403);assert.equal(calls.length,0);permitted=false;assert.equal((await fetch(url+'?companyId=c')).status,403);assert.equal(calls.length,0);
});

test('general state endpoint also hides audit without permission and redacts permitted tenant records',async()=>{
 const {createStateAccessService}=await import('./state-access.mjs');
 const factory=allowed=>createStateAccessService({clone:structuredClone,can:()=>allowed,allowedCompanyIds:user=>new Set(user.company_ids),companyScopedKeys:[],itemCompanyId:item=>item.companyId});
 const raw={companies:[],auditLogs:[{id:'a',companyId:'c',apiKey:'secret'},{id:'b',companyId:'other'}]};
 assert.deepEqual(factory(false).publicStateForUser(raw,user).auditLogs,[]);
 const readable=factory(true).publicStateForUser(raw,user).auditLogs;assert.equal(readable.length,1);assert.equal(readable[0].apiKey,'[redacted]');assert.equal(raw.auditLogs[0].apiKey,'secret');
});
