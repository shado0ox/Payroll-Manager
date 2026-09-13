import express from 'express';

const text = (value, max = 250) => String(value ?? '').trim().slice(0,max);
const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const validMonth = value => /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const identityKey = value => String(value || '').replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
  .replace(/[۰-۹]/g,digit=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[^0-9A-Za-z]/g,'').toUpperCase();
const monthStart = month => `${month}-01`;
const monthEnd = month => {
  const [year,monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year,monthNumber,0)).toISOString().slice(0,10);
};

export function createGosiRouter({ auth,writeLimiter,pool,q,can,workflowError,bumpStateVersion,appendStateAudit,broadcastStateUpdate }) {
  const router = express.Router();
  const requireAccess = (req, companyId) => {
    if (!can(req.user,'MANAGE_GOSI')) throw workflowError(403,'FORBIDDEN');
    if (!companyId || !req.user.company_ids.includes(companyId)) throw workflowError(403,'FORBIDDEN');
  };
  const finishWrite = async (client, req, companyId, action) => {
    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:[companyId],user:req.user,action,version:updated.rows[0].version });
    return updated.rows[0];
  };

  router.get('/gosi/accounts',auth,async (req,res,next) => {
    try {
      const companyId=text(req.query.companyId,100); requireAccess(req,companyId);
      const result=await pool.query(`SELECT id,company_id,registration_number,name,branch_name,is_default,is_active,created_at,updated_at
        FROM ${q('gosi_accounts')} WHERE company_id=$1 AND is_active=true ORDER BY is_default DESC,name,id`,[companyId]);
      res.json({ records:result.rows.map(row => ({ id:row.id,companyId:row.company_id,registrationNumber:row.registration_number,
        name:row.name,branchName:row.branch_name || '',isDefault:row.is_default,isActive:row.is_active,
        createdAt:row.created_at,updatedAt:row.updated_at })) });
    } catch (e) { next(e); }
  });

  router.put('/gosi/accounts/:id',auth,writeLimiter,async (req,res,next) => {
    const client=await pool.connect();
    try {
      const record=req.body || {}; requireAccess(req,record.companyId);
      if (record.id !== req.params.id || !text(record.name) || !text(record.registrationNumber,100)) throw workflowError(400,'INVALID_GOSI_ACCOUNT');
      await client.query('BEGIN');
      if (record.isDefault) await client.query(`UPDATE ${q('gosi_accounts')} SET is_default=false WHERE company_id=$1`,[record.companyId]);
      const result=await client.query(`INSERT INTO ${q('gosi_accounts')}
        (id,company_id,registration_number,name,branch_name,is_default,is_active,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,true,now()) ON CONFLICT (id) DO UPDATE SET
        registration_number=EXCLUDED.registration_number,name=EXCLUDED.name,branch_name=EXCLUDED.branch_name,
        is_default=EXCLUDED.is_default,is_active=true,updated_at=now()
        WHERE ${q('gosi_accounts')}.company_id=EXCLUDED.company_id RETURNING *`,[
        record.id,record.companyId,text(record.registrationNumber,100),text(record.name),text(record.branchName),Boolean(record.isDefault)]);
      if (!result.rowCount) throw workflowError(409,'GOSI_ACCOUNT_COMPANY_IMMUTABLE');
      const updated=await finishWrite(client,req,record.companyId,'UPSERT_GOSI_ACCOUNT');
      await client.query('COMMIT');
      broadcastStateUpdate({ version:updated.version,updatedBy:req.user.id,updatedAt:updated.updated_at,companyIds:[record.companyId],changes:[] });
      res.json({ record,version:Number(updated.version),updated_at:updated.updated_at });
    } catch(e) { try { await client.query('ROLLBACK'); } catch {} if(e?.code==='23505') return res.status(409).json({error:'DUPLICATE_GOSI_REGISTRATION'}); next(e); }
    finally { client.release(); }
  });

  router.delete('/gosi/accounts/:id',auth,writeLimiter,async (req,res,next) => {
    const client=await pool.connect();
    try {
      const companyId=text(req.query.companyId,100); requireAccess(req,companyId); await client.query('BEGIN');
      const used=await client.query(`SELECT 1 FROM ${q('gosi_invoices')} WHERE account_id=$1 LIMIT 1`,[req.params.id]);
      if (used.rowCount) throw workflowError(409,'GOSI_ACCOUNT_HAS_INVOICES');
      const result=await client.query(`UPDATE ${q('gosi_accounts')} SET is_active=false,is_default=false,updated_at=now()
        WHERE id=$1 AND company_id=$2 AND is_active=true RETURNING id`,[req.params.id,companyId]);
      if (!result.rowCount) throw workflowError(404,'GOSI_ACCOUNT_NOT_FOUND');
      const updated=await finishWrite(client,req,companyId,'ARCHIVE_GOSI_ACCOUNT'); await client.query('COMMIT');
      broadcastStateUpdate({ version:updated.version,updatedBy:req.user.id,updatedAt:updated.updated_at,companyIds:[companyId],changes:[] });
      res.json({ archived:true,version:Number(updated.version),updated_at:updated.updated_at });
    } catch(e) { try { await client.query('ROLLBACK'); } catch {} next(e); } finally { client.release(); }
  });

  router.get('/gosi/assignments',auth,async (req,res,next) => {
    try {
      const companyId=text(req.query.companyId,100); requireAccess(req,companyId);
      const result=await pool.query(`SELECT a.id,a.employee_id,a.account_id,a.effective_from,a.effective_to
        FROM ${q('gosi_employee_assignments')} a JOIN ${q('gosi_accounts')} g ON g.id=a.account_id
        WHERE g.company_id=$1 ORDER BY a.effective_from DESC,a.id`,[companyId]);
      res.json({ records:result.rows.map(row=>({ id:row.id,employeeId:row.employee_id,accountId:row.account_id,
        effectiveFrom:String(row.effective_from).slice(0,10),effectiveTo:row.effective_to ? String(row.effective_to).slice(0,10) : null })) });
    } catch(e) { next(e); }
  });

  router.put('/gosi/assignments/:id',auth,writeLimiter,async (req,res,next) => {
    const client=await pool.connect();
    try {
      const record=req.body || {}; requireAccess(req,record.companyId);
      if (record.id!==req.params.id || !record.employeeId || !record.accountId || !validDate(record.effectiveFrom)
        || (record.effectiveTo && (!validDate(record.effectiveTo) || record.effectiveTo < record.effectiveFrom))) throw workflowError(400,'INVALID_GOSI_ASSIGNMENT');
      await client.query('BEGIN');
      const scope=await client.query(`SELECT e.company_id employee_company,g.company_id account_company FROM ${q('employees')} e
        JOIN ${q('gosi_accounts')} g ON g.id=$2 AND g.is_active=true WHERE e.id=$1 AND e.is_archived=false`,[record.employeeId,record.accountId]);
      if (!scope.rowCount || scope.rows[0].employee_company!==record.companyId || scope.rows[0].account_company!==record.companyId) throw workflowError(400,'INVALID_GOSI_ASSIGNMENT_SCOPE');
      const overlap=await client.query(`SELECT id,effective_from,effective_to FROM ${q('gosi_employee_assignments')} WHERE employee_id=$1 AND id<>$2
        AND daterange(effective_from,COALESCE(effective_to,'infinity'::date),'[]') && daterange($3::date,COALESCE(NULLIF($4,'')::date,'infinity'::date),'[]') LIMIT 1`,
        [record.employeeId,record.id,record.effectiveFrom,record.effectiveTo || '']);
      if (overlap.rowCount) {
        const previous=overlap.rows[0];
        if (previous.effective_to==null && String(previous.effective_from).slice(0,10)<record.effectiveFrom) {
          await client.query(`UPDATE ${q('gosi_employee_assignments')} SET effective_to=$2::date-1,updated_at=now() WHERE id=$1`,[previous.id,record.effectiveFrom]);
        } else throw workflowError(409,'GOSI_ASSIGNMENT_OVERLAP');
      }
      await client.query(`INSERT INTO ${q('gosi_employee_assignments')} (id,employee_id,account_id,effective_from,effective_to,updated_at)
        VALUES ($1,$2,$3,$4::date,NULLIF($5,'')::date,now()) ON CONFLICT(id) DO UPDATE SET employee_id=EXCLUDED.employee_id,
        account_id=EXCLUDED.account_id,effective_from=EXCLUDED.effective_from,effective_to=EXCLUDED.effective_to,updated_at=now()`,
        [record.id,record.employeeId,record.accountId,record.effectiveFrom,record.effectiveTo || '']);
      const updated=await finishWrite(client,req,record.companyId,'UPSERT_GOSI_ASSIGNMENT'); await client.query('COMMIT');
      broadcastStateUpdate({ version:updated.version,updatedBy:req.user.id,updatedAt:updated.updated_at,companyIds:[record.companyId],changes:[] });
      res.json({ record,version:Number(updated.version),updated_at:updated.updated_at });
    } catch(e) { try { await client.query('ROLLBACK'); } catch {} next(e); } finally { client.release(); }
  });

  router.delete('/gosi/assignments/:id',auth,writeLimiter,async(req,res,next)=>{
    const client=await pool.connect();
    try{const companyId=text(req.query.companyId,100);requireAccess(req,companyId);await client.query('BEGIN');
      const deleted=await client.query(`DELETE FROM ${q('gosi_employee_assignments')} a USING ${q('employees')} e
        WHERE a.id=$1 AND a.employee_id=e.id AND e.company_id=$2 RETURNING a.id`,[req.params.id,companyId]);
      if(!deleted.rowCount)throw workflowError(404,'GOSI_ASSIGNMENT_NOT_FOUND');const updated=await finishWrite(client,req,companyId,'DELETE_GOSI_EMPLOYEE_OVERRIDE');await client.query('COMMIT');
      broadcastStateUpdate({version:updated.version,updatedBy:req.user.id,updatedAt:updated.updated_at,companyIds:[companyId],changes:[]});res.json({deleted:true,version:Number(updated.version)});
    }catch(e){try{await client.query('ROLLBACK');}catch{}next(e);}finally{client.release();}
  });

  router.get('/gosi/department-assignments',auth,async(req,res,next)=>{
    try { const companyId=text(req.query.companyId,100); requireAccess(req,companyId);
      const result=await pool.query(`SELECT id,department_name,account_id,effective_from,effective_to FROM ${q('gosi_department_assignments')}
        WHERE company_id=$1 ORDER BY effective_from DESC,id`,[companyId]);
      res.json({records:result.rows.map(row=>({id:row.id,departmentName:row.department_name,accountId:row.account_id,effectiveFrom:String(row.effective_from).slice(0,10),effectiveTo:row.effective_to?String(row.effective_to).slice(0,10):null}))});
    } catch(e){next(e);}
  });

  router.put('/gosi/department-assignments/:id',auth,writeLimiter,async(req,res,next)=>{
    const client=await pool.connect();
    try { const record=req.body||{};requireAccess(req,record.companyId);
      if(record.id!==req.params.id||!text(record.departmentName)||!record.accountId||!validDate(record.effectiveFrom)
        ||(record.effectiveTo&&(!validDate(record.effectiveTo)||record.effectiveTo<record.effectiveFrom))) throw workflowError(400,'INVALID_GOSI_DEPARTMENT_ASSIGNMENT');
      await client.query('BEGIN');
      const account=await client.query(`SELECT 1 FROM ${q('gosi_accounts')} WHERE id=$1 AND company_id=$2 AND is_active=true`,[record.accountId,record.companyId]);
      if(!account.rowCount) throw workflowError(400,'INVALID_GOSI_ACCOUNT');
      const overlap=await client.query(`SELECT id,effective_from,effective_to FROM ${q('gosi_department_assignments')} WHERE company_id=$1 AND department_name=$2 AND id<>$3
        AND daterange(effective_from,COALESCE(effective_to,'infinity'::date),'[]') && daterange($4::date,COALESCE(NULLIF($5,'')::date,'infinity'::date),'[]') LIMIT 1`,[record.companyId,text(record.departmentName),record.id,record.effectiveFrom,record.effectiveTo||'']);
      if(overlap.rowCount){const previous=overlap.rows[0];if(previous.effective_to==null&&String(previous.effective_from).slice(0,10)<record.effectiveFrom) await client.query(`UPDATE ${q('gosi_department_assignments')} SET effective_to=$2::date-1,updated_at=now() WHERE id=$1`,[previous.id,record.effectiveFrom]);else throw workflowError(409,'GOSI_DEPARTMENT_ASSIGNMENT_OVERLAP');}
      await client.query(`INSERT INTO ${q('gosi_department_assignments')} (id,company_id,department_name,account_id,effective_from,effective_to,updated_at)
        VALUES($1,$2,$3,$4,$5::date,NULLIF($6,'')::date,now()) ON CONFLICT(id) DO UPDATE SET department_name=EXCLUDED.department_name,
        account_id=EXCLUDED.account_id,effective_from=EXCLUDED.effective_from,effective_to=EXCLUDED.effective_to,updated_at=now()
        WHERE ${q('gosi_department_assignments')}.company_id=EXCLUDED.company_id`,[record.id,record.companyId,text(record.departmentName),record.accountId,record.effectiveFrom,record.effectiveTo||'']);
      const updated=await finishWrite(client,req,record.companyId,'UPSERT_GOSI_DEPARTMENT_ASSIGNMENT');await client.query('COMMIT');
      broadcastStateUpdate({version:updated.version,updatedBy:req.user.id,updatedAt:updated.updated_at,companyIds:[record.companyId],changes:[]});
      res.json({record,version:Number(updated.version),updated_at:updated.updated_at});
    }catch(e){try{await client.query('ROLLBACK');}catch{}next(e);}finally{client.release();}
  });

  router.post('/gosi/invoices',auth,writeLimiter,async (req,res,next) => {
    const client=await pool.connect();
    try {
      const body=req.body || {}; requireAccess(req,body.companyId);
      if (!body.id || !body.accountId || !validMonth(body.invoiceMonth) || !validMonth(body.payrollMonth)
        || !Array.isArray(body.rows) || !body.rows.length || body.rows.length>2500 || text(body.sourceFileName,200).length<1) throw workflowError(400,'INVALID_GOSI_INVOICE');
      const normalized=body.rows.map((row,index)=>({ id:text(row.id || `${body.id}-${index+1}`,150),identity:identityKey(row.identity),
        subscriberName:text(row.subscriberName),nationality:text(row.nationality,100),subjectWage:money(row.subjectWage),
        employerShare:money(row.employerShare),employeeShare:money(row.employeeShare),total:money(row.total) }));
      if (normalized.some(row=>!row.id || !row.identity || !row.subscriberName || row.subjectWage<0 || row.employerShare<0 || row.employeeShare<0 || row.total<0
        || Math.abs(row.total-row.employerShare-row.employeeShare)>0.02) || new Set(normalized.map(row=>row.identity)).size!==normalized.length) throw workflowError(400,'INVALID_GOSI_INVOICE_ROWS');
      await client.query('BEGIN');
      const account=await client.query(`SELECT 1 FROM ${q('gosi_accounts')} WHERE id=$1 AND company_id=$2 AND is_active=true FOR UPDATE`,[body.accountId,body.companyId]);
      if (!account.rowCount) throw workflowError(400,'INVALID_GOSI_ACCOUNT');
      const totals=normalized.reduce((sum,row)=>({ subjectWage:money(sum.subjectWage+row.subjectWage),employerShare:money(sum.employerShare+row.employerShare),employeeShare:money(sum.employeeShare+row.employeeShare),total:money(sum.total+row.total) }),{subjectWage:0,employerShare:0,employeeShare:0,total:0});
      await client.query(`INSERT INTO ${q('gosi_invoices')} (id,company_id,account_id,invoice_month,payroll_month,source_file_name,detected_month,items_count,total_subject_wage,total_employer_share,total_employee_share,total_amount,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[body.id,body.companyId,body.accountId,body.invoiceMonth,body.payrollMonth,text(body.sourceFileName,200),validMonth(body.detectedMonth)?body.detectedMonth:null,normalized.length,totals.subjectWage,totals.employerShare,totals.employeeShare,totals.total,req.user.id]);
      await client.query(`INSERT INTO ${q('gosi_invoice_items')} (invoice_id,id,identity_number,subscriber_name,nationality,subject_wage,employer_share,employee_share,total_amount,sort_order)
        SELECT $1,item->>'id',item->>'identity',item->>'subscriberName',item->>'nationality',(item->>'subjectWage')::numeric,(item->>'employerShare')::numeric,(item->>'employeeShare')::numeric,(item->>'total')::numeric,(ordinality-1)::integer
        FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY source(item,ordinality)`,[body.id,JSON.stringify(normalized)]);
      const updated=await finishWrite(client,req,body.companyId,'IMPORT_GOSI_INVOICE'); await client.query('COMMIT');
      broadcastStateUpdate({ version:updated.version,updatedBy:req.user.id,updatedAt:updated.updated_at,companyIds:[body.companyId],changes:[] });
      res.status(201).json({ invoiceId:body.id,totals,itemsCount:normalized.length,version:Number(updated.version),updated_at:updated.updated_at });
    } catch(e) { try { await client.query('ROLLBACK'); } catch {} if(e?.code==='23505') return res.status(409).json({error:'DUPLICATE_GOSI_INVOICE'}); next(e); } finally { client.release(); }
  });

  router.get('/gosi/invoices',auth,async(req,res,next)=>{
    try { const companyId=text(req.query.companyId,100); requireAccess(req,companyId);
      const result=await pool.query(`SELECT i.*,g.name account_name,g.registration_number FROM ${q('gosi_invoices')} i JOIN ${q('gosi_accounts')} g ON g.id=i.account_id
        WHERE i.company_id=$1 ORDER BY i.created_at DESC`,[companyId]);
      res.json({ records:result.rows.map(row=>({ id:row.id,companyId:row.company_id,accountId:row.account_id,accountName:row.account_name,registrationNumber:row.registration_number,
        invoiceMonth:row.invoice_month,payrollMonth:row.payroll_month,detectedMonth:row.detected_month,sourceFileName:row.source_file_name,itemsCount:row.items_count,
        totalSubjectWage:Number(row.total_subject_wage),totalEmployerShare:Number(row.total_employer_share),totalEmployeeShare:Number(row.total_employee_share),totalAmount:Number(row.total_amount),createdAt:row.created_at })) });
    } catch(e){ next(e); }
  });

  router.get('/gosi/invoices/:id/comparison',auth,async(req,res,next)=>{
    try {
      const invoiceResult=await pool.query(`SELECT i.*,g.name account_name,g.registration_number FROM ${q('gosi_invoices')} i JOIN ${q('gosi_accounts')} g ON g.id=i.account_id WHERE i.id=$1`,[req.params.id]);
      if(!invoiceResult.rowCount) throw workflowError(404,'GOSI_INVOICE_NOT_FOUND');
      const invoice=invoiceResult.rows[0]; requireAccess(req,invoice.company_id);
      const payrollMonth=validMonth(req.query.payrollMonth) ? String(req.query.payrollMonth) : invoice.payroll_month;
      const [itemsResult,employeesResult,runResult,assignmentsResult,departmentAssignmentsResult]=await Promise.all([
        pool.query(`SELECT * FROM ${q('gosi_invoice_items')} WHERE invoice_id=$1 ORDER BY sort_order,id`,[invoice.id]),
        pool.query(`SELECT id,employee_no,payload FROM ${q('employees')} WHERE company_id=$1 AND is_archived=false`,[invoice.company_id]),
        pool.query(`SELECT id,status FROM ${q('payroll_runs')} WHERE company_id=$1 AND period_month=$2`,[invoice.company_id,payrollMonth]),
        pool.query(`SELECT employee_id,account_id FROM ${q('gosi_employee_assignments')} a JOIN ${q('gosi_accounts')} g ON g.id=a.account_id
          WHERE g.company_id=$1 AND a.effective_from<=$2::date AND (a.effective_to IS NULL OR a.effective_to>=$3::date)`,[invoice.company_id,monthEnd(invoice.invoice_month),monthStart(invoice.invoice_month)]),
        pool.query(`SELECT department_name,account_id FROM ${q('gosi_department_assignments')} WHERE company_id=$1
          AND effective_from<=$2::date AND (effective_to IS NULL OR effective_to>=$3::date)`,[invoice.company_id,monthEnd(invoice.invoice_month),monthStart(invoice.invoice_month)])
      ]);
      const employees=employeesResult.rows; const byIdentity=new Map();
      for(const employee of employees){ const p=employee.payload || {}; for(const value of [p.nationalIdOrIqama,p.iqamaNumber,p.entryNumber]){ const key=identityKey(value); if(key && !byIdentity.has(key)) byIdentity.set(key,employee); } }
      const assignmentByEmployee=new Map(assignmentsResult.rows.map(row=>[row.employee_id,row.account_id]));
      const assignmentByDepartment=new Map(departmentAssignmentsResult.rows.map(row=>[row.department_name,row.account_id]));
      let payrollItems=[]; if(runResult.rowCount) payrollItems=(await pool.query(`SELECT employee_id,payload FROM ${q('payroll_run_items')} WHERE payroll_run_id=$1`,[runResult.rows[0].id])).rows;
      const payrollByEmployee=new Map(payrollItems.map(row=>[row.employee_id,row.payload || {}])); const invoiceEmployeeIds=new Set();
      const comparisons=itemsResult.rows.map(item=>{
        const employee=byIdentity.get(identityKey(item.identity_number)); const payrollItem=employee ? payrollByEmployee.get(employee.id) : null;
        if(employee) invoiceEmployeeIds.add(employee.id); const employeeOverride=employee ? assignmentByEmployee.get(employee.id) : null;
        const assignedAccountId=employee ? (employeeOverride || assignmentByDepartment.get(payrollItem?.department || employee.payload?.department)) : null;
        const actual={ subjectWage:Number(item.subject_wage),employerShare:Number(item.employer_share),employeeShare:Number(item.employee_share),total:Number(item.total_amount) };
        const expected={ subjectWage:money(payrollItem?.gosiSubjectAmount || 0),employerShare:money(payrollItem?.gosiEmployerShare || 0),employeeShare:money(payrollItem?.gosiEmployeeShare || 0),total:money((payrollItem?.gosiEmployerShare || 0)+(payrollItem?.gosiEmployeeShare || 0)) };
        let status='MATCHED'; if(!employee) status='INVOICE_ONLY'; else if(!assignedAccountId) status='UNASSIGNED_ACCOUNT'; else if(assignedAccountId!==invoice.account_id) status='WRONG_ACCOUNT'; else if(!payrollItem) status='MISSING_IN_PAYROLL'; else if(Object.keys(actual).some(key=>Math.abs(actual[key]-expected[key])>0.01)) status='DIFFERENT';
        return { identity:item.identity_number,subscriberName:item.subscriber_name,nationality:item.nationality,employeeId:employee?.id || null,employeeNo:employee?.employee_no || '',employeeName:employee ? text(`${employee.payload?.firstNameAr || ''} ${employee.payload?.lastNameAr || ''}`) : '',department:employee ? text(payrollItem?.department || employee.payload?.department) : '',assignedAccountId:assignedAccountId || null,assignmentSource:employeeOverride?'EMPLOYEE':(assignedAccountId?'DEPARTMENT':null),status,actual,expected,
          difference:{ subjectWage:money(actual.subjectWage-expected.subjectWage),employerShare:money(actual.employerShare-expected.employerShare),employeeShare:money(actual.employeeShare-expected.employeeShare),total:money(actual.total-expected.total) } };
      });
      for(const employee of employees){const employeeId=employee.id,payrollItem=payrollByEmployee.get(employeeId),employeeOverride=assignmentByEmployee.get(employeeId),accountId=employeeOverride||assignmentByDepartment.get(payrollItem?.department||employee.payload?.department);if(accountId!==invoice.account_id||invoiceEmployeeIds.has(employeeId)||!payrollItem)continue;
        const expected={subjectWage:money(payrollItem.gosiSubjectAmount||0),employerShare:money(payrollItem.gosiEmployerShare||0),employeeShare:money(payrollItem.gosiEmployeeShare||0),total:money((payrollItem.gosiEmployerShare||0)+(payrollItem.gosiEmployeeShare||0))};
        comparisons.push({identity:employee.payload?.nationalIdOrIqama || employee.payload?.iqamaNumber || employee.payload?.entryNumber || '',subscriberName:'',nationality:employee.payload?.country || '',employeeId,employeeNo:employee.employee_no,employeeName:text(`${employee.payload?.firstNameAr||''} ${employee.payload?.lastNameAr||''}`),department:text(payrollItem?.department||employee.payload?.department),assignedAccountId:accountId,assignmentSource:employeeOverride?'EMPLOYEE':'DEPARTMENT',status:'PAYROLL_ONLY',actual:{subjectWage:0,employerShare:0,employeeShare:0,total:0},expected,difference:{subjectWage:-expected.subjectWage,employerShare:-expected.employerShare,employeeShare:-expected.employeeShare,total:-expected.total}});
      }
      const summary=comparisons.reduce((s,row)=>{ s[row.status]=(s[row.status]||0)+1; for(const key of ['subjectWage','employerShare','employeeShare','total']){s.actual[key]=money(s.actual[key]+row.actual[key]);s.expected[key]=money(s.expected[key]+row.expected[key]);s.difference[key]=money(s.actual[key]-s.expected[key]);} return s; },{actual:{subjectWage:0,employerShare:0,employeeShare:0,total:0},expected:{subjectWage:0,employerShare:0,employeeShare:0,total:0},difference:{subjectWage:0,employerShare:0,employeeShare:0,total:0}});
      res.json({ invoice:{ id:invoice.id,companyId:invoice.company_id,accountId:invoice.account_id,accountName:invoice.account_name,registrationNumber:invoice.registration_number,invoiceMonth:invoice.invoice_month,payrollMonth,detectedMonth:invoice.detected_month,sourceFileName:invoice.source_file_name },payrollRun:runResult.rows[0] || null,monthMismatch:invoice.invoice_month!==payrollMonth,summary,comparisons });
    } catch(e){ next(e); }
  });

  return router;
}
