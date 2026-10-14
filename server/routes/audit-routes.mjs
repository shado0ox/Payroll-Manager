import express from 'express';

import {redactAuditValue} from '../audit-log-service.mjs';
export {redactAuditValue} from '../audit-log-service.mjs';
export function auditQueryOptions(query,user){
 const companyId=String(query.companyId||'');
 if(!companyId||!Array.isArray(user.company_ids)||!user.company_ids.includes(companyId))throw Object.assign(new Error('FORBIDDEN'),{status:403});
 const page=Number(query.page||1),limit=Number(query.limit||25),order=String(query.order||'desc');
 const search=String(query.search||'').trim(),action=String(query.action||''),entity=String(query.entity||''),userId=String(query.userId||'');
 const from=String(query.from||''),to=String(query.to||''),timeZone=String(query.timeZone||'Asia/Riyadh');
 const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 try{new Intl.DateTimeFormat('en-US',{timeZone}).format();}catch{throw Object.assign(new Error('INVALID_AUDIT_FILTER'),{status:400});}
 if(!Number.isInteger(page)||page<1||page>100000||!Number.isInteger(limit)||limit<1||limit>100||!['asc','desc'].includes(order)||search.length>200||[action,entity,userId].some(value=>value.length>200)||(from&&!validDate(from))||(to&&!validDate(to))||(from&&to&&from>to))throw Object.assign(new Error('INVALID_AUDIT_FILTER'),{status:400});
 return {companyId,page,limit,order,search,action,entity,userId,from,to,timeZone};
}
export function createAuditRouter({auth,pool,q,can}){
 const router=express.Router();
 router.get('/audit-logs',auth,async(req,res,next)=>{
  try{
   if(!can(req.user,'VIEW_AUDIT_LOGS'))return res.status(403).json({error:'FORBIDDEN'});
   const options=auditQueryOptions(req.query,req.user),params=[options.companyId],where=['company_id=$1'];
   const bind=value=>{params.push(value);return '$'+params.length;};
   if(options.search){const search=bind('%'+options.search+'%');where.push(`(action ILIKE ${search} OR user_name ILIKE ${search} OR COALESCE(details,'') ILIKE ${search} OR entity_id ILIKE ${search})`);}
   if(options.action)where.push(`action=${bind(options.action)}`);
   if(options.entity)where.push(`entity_type=${bind(options.entity)}`);
   if(options.userId)where.push(`user_id=${bind(options.userId)}`);
   if(options.from)where.push(`occurred_at>=(${bind(options.from)}::date::timestamp AT TIME ZONE ${bind(options.timeZone)})`);
   if(options.to)where.push(`occurred_at<((${bind(options.to)}::date+1)::timestamp AT TIME ZONE ${bind(options.timeZone)})`);
   const condition=where.join(' AND ');
   const result=await pool.query(`SELECT payload,id,company_id,user_id,user_name,user_role,action,entity_type,entity_id,occurred_at,details FROM ${q('application_audit_logs')} WHERE ${condition} ORDER BY occurred_at ${options.order},id ${options.order} LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,options.limit,(options.page-1)*options.limit]);
   const summary=await pool.query(`SELECT count(*) AS total,count(DISTINCT user_id) AS users,count(DISTINCT action) AS actions,max(occurred_at) AS latest FROM ${q('application_audit_logs')} WHERE ${condition}`,params);
   const facets=await pool.query(`SELECT DISTINCT action,entity_type,user_id,user_name FROM ${q('application_audit_logs')} WHERE company_id=$1 ORDER BY action,user_name`,[options.companyId]);
   const logs=result.rows.map(row=>redactAuditValue({...row.payload,id:row.id,companyId:row.company_id,userId:row.user_id,userName:row.user_name,userRole:row.user_role,action:row.action,entityType:row.entity_type,entityId:row.entity_id,timestamp:new Date(row.occurred_at).toISOString(),details:row.details||row.payload?.details||row.payload?.descriptionAr||''}));
   res.setHeader('Cache-Control','no-store');res.json({logs,page:options.page,limit:options.limit,total:Number(summary.rows[0].total),summary:{users:Number(summary.rows[0].users),actions:Number(summary.rows[0].actions),latest:summary.rows[0].latest},facets:{actions:[...new Set(facets.rows.map(row=>row.action).filter(Boolean))],entities:[...new Set(facets.rows.map(row=>row.entity_type).filter(Boolean))],users:[...new Map(facets.rows.filter(row=>row.user_id).map(row=>[row.user_id,{id:row.user_id,name:row.user_name}])).values()]}});
  }catch(error){if(error.status)return res.status(error.status).json({error:error.message});next(error);}
 });return router;
}
