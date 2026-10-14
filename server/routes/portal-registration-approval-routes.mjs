import express from 'express';

export function createPortalRegistrationApprovalRouter({auth,writeLimiter,pool,q,can,bumpStateVersion,appendStateAudit,broadcastStateUpdate}) {
  const router=express.Router();
  router.get('/employee-registration-requests',auth,async(req,res,next)=>{
    try {
      if(!can(req.user,'MANAGE_EMPLOYEES'))return res.status(403).json({error:'FORBIDDEN'});
      const companyId=String(req.query.companyId||'');
      if(!req.user.company_ids.includes(companyId))return res.status(403).json({error:'FORBIDDEN'});
      const result=await pool.query(`SELECT p.id,p.employee_id,p.company_id,p.username,p.email,p.created_at,
        e.employee_no,concat_ws(' ',e.first_name_ar,e.last_name_ar) employee_name
        FROM ${q('employee_portal_accounts')} p JOIN ${q('employees')} e ON e.id=p.employee_id
        WHERE p.company_id=$1 AND p.approval_status='PENDING' ORDER BY p.created_at,p.id`,[companyId]);
      res.json({requests:result.rows});
    }catch(error){next(error);}
  });
  router.post('/employee-registration-requests/:id/review',auth,writeLimiter,async(req,res,next)=>{
    let client;
    try {
      if(!can(req.user,'MANAGE_EMPLOYEES'))return res.status(403).json({error:'FORBIDDEN'});
      const decision=req.body?.decision, reason=String(req.body?.reason||'').trim();
      if(!['APPROVED','REJECTED'].includes(decision)||reason.length>2000||(decision==='REJECTED'&&!reason))return res.status(400).json({error:'INVALID_REGISTRATION_REVIEW'});
      client=await pool.connect();await client.query('BEGIN');
      const result=await client.query(`SELECT p.*,e.is_archived,e.status employee_status FROM ${q('employee_portal_accounts')} p
        JOIN ${q('employees')} e ON e.id=p.employee_id WHERE p.id=$1 FOR UPDATE OF p,e`,[req.params.id]);
      const row=result.rows[0];
      if(!row||!req.user.company_ids.includes(row.company_id)){await client.query('ROLLBACK');return res.status(403).json({error:'FORBIDDEN'});}
      if(row.approval_status!=='PENDING'){await client.query('ROLLBACK');return res.status(409).json({error:'REGISTRATION_ALREADY_REVIEWED'});}
      if(decision==='APPROVED'&&(row.is_archived||!['ACTIVE','SUSPENDED','ON_LEAVE'].includes(row.employee_status))){await client.query('ROLLBACK');return res.status(409).json({error:'EMPLOYEE_ACCOUNT_NOT_ELIGIBLE'});}
      await client.query(`UPDATE ${q('employee_portal_accounts')} SET approval_status=$2,is_active=$3,reviewed_by=$4,reviewed_at=now(),review_reason=$5,updated_at=now() WHERE id=$1`,[row.id,decision,decision==='APPROVED',req.user.id,reason]);
      if(decision==='APPROVED')await client.query(`UPDATE ${q('employees')} SET payload=jsonb_set(payload,'{email}',to_jsonb($1::text),true),updated_at=now() WHERE id=$2 AND company_id=$3`,[row.email,row.employee_id,row.company_id]);
      await client.query(`DELETE FROM ${q('sessions')} WHERE portal_account_id=$1`,[row.id]);
      await client.query(`INSERT INTO ${q('audit_log')}(user_id,action,ip) VALUES($1,$2,$3)`,[req.user.id,`EMPLOYEE_REGISTRATION_${decision}:${row.id}:${reason}`,req.ip||null]);
      const updated=await bumpStateVersion(client,req.user.id);
      await appendStateAudit(client,q,{companyIds:[row.company_id],user:req.user,action:`EMPLOYEE_REGISTRATION_${decision}`,version:updated.rows[0].version});
      await client.query('COMMIT');
      broadcastStateUpdate({version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,companyIds:[row.company_id]});
      res.json({reviewed:true,approvalStatus:decision});
    }catch(error){if(client)try{await client.query('ROLLBACK');}catch{} next(error);}finally{client?.release();}
  });
  return router;
}
