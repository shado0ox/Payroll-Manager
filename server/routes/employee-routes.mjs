import crypto from 'node:crypto';
import express from 'express';

export function createEmployeeRouter({
  auth,
  writeLimiter,
  pool,
  q,
  can,
  validIsoDate,
  workflowError,
  bumpStateVersion,
  appendStateAudit,
  broadcastStateUpdate,
}) {
  const router = express.Router();

function validImportedEmployee(employee, user) {
  const salary = employee?.salaryPackage || {};
  const dates = ['hireDate','salaryStartDate','terminationDate','suspensionStartDate','suspensionEndDate'];
  return employee && typeof employee === 'object' && typeof employee.id === 'string' && Boolean(employee.id)
    && typeof employee.companyId === 'string' && user.company_ids.includes(employee.companyId)
    && typeof employee.employeeNo === 'string' && Boolean(employee.employeeNo.trim())
    && typeof employee.firstNameAr === 'string' && Boolean(employee.firstNameAr.trim())
    && typeof employee.lastNameAr === 'string' && Boolean(employee.lastNameAr.trim())
    && ['ACTIVE','SUSPENDED','ON_LEAVE','TERMINATED','ABSCONDED','ONBOARDING'].includes(employee.status || 'ACTIVE')
    && dates.every(key => !employee[key] || validIsoDate(employee[key]))
    && ['baseSalary','housingAllowance','transportAllowance','otherFixedAllowances']
      .every(key => Number.isFinite(Number(salary[key] || 0)) && Number(salary[key] || 0) >= 0);
}

router.post('/employees/import', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_EMPLOYEES')) return res.status(403).json({ error:'FORBIDDEN' });
    const employees = req.body?.employees;
    if (!Array.isArray(employees) || !employees.length || employees.length > 2500
      || employees.some(employee => !validImportedEmployee(employee,req.user))) {
      return res.status(400).json({ error:'INVALID_EMPLOYEE_IMPORT' });
    }
    const ids = employees.map(employee => employee.id);
    const employeeNumbers = employees.map(employee => employee.employeeNo.trim());
    const companyIds = new Set(employees.map(employee => employee.companyId));
    if (new Set(ids).size !== ids.length || new Set(employeeNumbers).size !== employeeNumbers.length || companyIds.size !== 1) {
      return res.status(400).json({ error:'INVALID_EMPLOYEE_IMPORT' });
    }
    const companyId = employees[0].companyId;
    await client.query('BEGIN');
    const existing = await client.query(`SELECT id,company_id FROM ${q('employees')} WHERE id=ANY($1::text[]) FOR UPDATE`, [ids]);
    if (existing.rows.some(row => row.company_id !== companyId)) throw workflowError(409,'EMPLOYEE_COMPANY_IMMUTABLE');
    const startOrder = Number((await client.query(`SELECT COALESCE(max(sort_order),-1)+1 AS sort_order FROM ${q('employees')} WHERE company_id=$1`, [companyId])).rows[0]?.sort_order || 0);
    await client.query(`INSERT INTO ${q('employees')} (
        id,company_id,employee_no,national_id_or_iqama,status,first_name_ar,last_name_ar,first_name_en,last_name_en,
        department,job_title,hire_date,salary_start_date,termination_date,suspension_start_date,suspension_end_date,
        base_salary,housing_allowance,transport_allowance,other_fixed_allowances,bank_iban,payload,sort_order,is_archived,updated_at
      ) SELECT employee->>'id',employee->>'companyId',employee->>'employeeNo',COALESCE(employee->>'nationalIdOrIqama',''),
        COALESCE(NULLIF(employee->>'status',''),'ACTIVE'),employee->>'firstNameAr',employee->>'lastNameAr',
        COALESCE(employee->>'firstNameEn',''),COALESCE(employee->>'lastNameEn',''),COALESCE(employee->>'department',''),
        COALESCE(employee->>'jobTitle',''),NULLIF(employee->>'hireDate','')::date,NULLIF(employee->>'salaryStartDate','')::date,
        NULLIF(employee->>'terminationDate','')::date,NULLIF(employee->>'suspensionStartDate','')::date,NULLIF(employee->>'suspensionEndDate','')::date,
        COALESCE(NULLIF(employee->'salaryPackage'->>'baseSalary','')::numeric,0),
        COALESCE(NULLIF(employee->'salaryPackage'->>'housingAllowance','')::numeric,0),
        COALESCE(NULLIF(employee->'salaryPackage'->>'transportAllowance','')::numeric,0),
        COALESCE(NULLIF(employee->'salaryPackage'->>'otherFixedAllowances','')::numeric,0),COALESCE(employee->>'bankIban',''),
        employee,$2+(ordinality-1)::integer,false,now()
      FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(employee,ordinality)
      ON CONFLICT (id) DO UPDATE SET employee_no=EXCLUDED.employee_no,national_id_or_iqama=EXCLUDED.national_id_or_iqama,
        status=EXCLUDED.status,first_name_ar=EXCLUDED.first_name_ar,last_name_ar=EXCLUDED.last_name_ar,
        first_name_en=EXCLUDED.first_name_en,last_name_en=EXCLUDED.last_name_en,department=EXCLUDED.department,
        job_title=EXCLUDED.job_title,hire_date=EXCLUDED.hire_date,salary_start_date=EXCLUDED.salary_start_date,
        termination_date=EXCLUDED.termination_date,suspension_start_date=EXCLUDED.suspension_start_date,
        suspension_end_date=EXCLUDED.suspension_end_date,base_salary=EXCLUDED.base_salary,housing_allowance=EXCLUDED.housing_allowance,
        transport_allowance=EXCLUDED.transport_allowance,other_fixed_allowances=EXCLUDED.other_fixed_allowances,
        bank_iban=EXCLUDED.bank_iban,payload=EXCLUDED.payload,is_archived=false,updated_at=now()`, [JSON.stringify(employees),startOrder]);
    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:[companyId],user:req.user,action:`IMPORT_EMPLOYEES:${employees.length}`,version:updated.rows[0].version });
    await client.query(`INSERT INTO ${q('audit_log')} (user_id,action,ip) VALUES ($1,$2,$3)`, [req.user.id,`IMPORT_EMPLOYEES:${employees.length}`,req.ip]);
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[companyId],changes:[{ collection:'employees',operation:'upsert',records:employees }] });
    res.status(201).json({ employees,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    if (e?.code === '23505') return res.status(409).json({ error:'EMPLOYEE_NUMBER_EXISTS' });
    next(e);
  } finally { client.release(); }
});

router.put('/employees/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_EMPLOYEES')) return res.status(403).json({ error:'FORBIDDEN' });
    const employee = req.body || {};
    if (!employee || typeof employee !== 'object' || employee.id !== req.params.id
      || typeof employee.companyId !== 'string' || !req.user.company_ids.includes(employee.companyId)
      || typeof employee.employeeNo !== 'string' || !employee.employeeNo.trim()
      || typeof employee.firstNameAr !== 'string' || !employee.firstNameAr.trim()
      || typeof employee.lastNameAr !== 'string' || !employee.lastNameAr.trim()) {
      return res.status(400).json({ error:'INVALID_EMPLOYEE' });
    }
    const allowedStatuses = new Set(['ACTIVE','SUSPENDED','ON_LEAVE','TERMINATED','ABSCONDED','ONBOARDING']);
    if (!allowedStatuses.has(employee.status || 'ACTIVE')) return res.status(400).json({ error:'INVALID_EMPLOYEE_STATUS' });

    await client.query('BEGIN');
    const existing = await client.query(`SELECT id,company_id,sort_order FROM ${q('employees')} WHERE id=$1 FOR UPDATE`, [employee.id]);
    if (existing.rowCount && existing.rows[0].company_id !== employee.companyId) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error:'EMPLOYEE_COMPANY_IMMUTABLE' });
    }
    const orderResult = existing.rowCount
      ? { rows:[{ sort_order:existing.rows[0].sort_order }] }
      : await client.query(`SELECT COALESCE(max(sort_order),-1)+1 AS sort_order FROM ${q('employees')} WHERE company_id=$1`, [employee.companyId]);
    const sortOrder = Number(orderResult.rows[0]?.sort_order || 0);
    const salary = employee.salaryPackage || {};

    await client.query(`INSERT INTO ${q('employees')} (
      id,company_id,employee_no,national_id_or_iqama,status,first_name_ar,last_name_ar,first_name_en,last_name_en,
      department,job_title,hire_date,salary_start_date,termination_date,suspension_start_date,suspension_end_date,
      base_salary,housing_allowance,transport_allowance,other_fixed_allowances,bank_iban,payload,sort_order,is_archived,updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULLIF($12,'')::date,NULLIF($13,'')::date,NULLIF($14,'')::date,
      NULLIF($15,'')::date,NULLIF($16,'')::date,$17,$18,$19,$20,$21,$22::jsonb,$23,false,now()
    ) ON CONFLICT (id) DO UPDATE SET
      employee_no=EXCLUDED.employee_no,national_id_or_iqama=EXCLUDED.national_id_or_iqama,status=EXCLUDED.status,
      first_name_ar=EXCLUDED.first_name_ar,last_name_ar=EXCLUDED.last_name_ar,first_name_en=EXCLUDED.first_name_en,last_name_en=EXCLUDED.last_name_en,
      department=EXCLUDED.department,job_title=EXCLUDED.job_title,hire_date=EXCLUDED.hire_date,salary_start_date=EXCLUDED.salary_start_date,
      termination_date=EXCLUDED.termination_date,suspension_start_date=EXCLUDED.suspension_start_date,suspension_end_date=EXCLUDED.suspension_end_date,
      base_salary=EXCLUDED.base_salary,housing_allowance=EXCLUDED.housing_allowance,transport_allowance=EXCLUDED.transport_allowance,
      other_fixed_allowances=EXCLUDED.other_fixed_allowances,bank_iban=EXCLUDED.bank_iban,payload=EXCLUDED.payload,is_archived=false,updated_at=now()`, [
      employee.id, employee.companyId, employee.employeeNo.trim(), employee.nationalIdOrIqama || '', employee.status || 'ACTIVE',
      employee.firstNameAr.trim(), employee.lastNameAr.trim(), employee.firstNameEn || '', employee.lastNameEn || '',
      employee.department || '', employee.jobTitle || '', employee.hireDate || '', employee.salaryStartDate || '', employee.terminationDate || '',
      employee.suspensionStartDate || '', employee.suspensionEndDate || '', Number(salary.baseSalary || 0), Number(salary.housingAllowance || 0),
      Number(salary.transportAllowance || 0), Number(salary.otherFixedAllowances || 0), employee.bankIban || '', JSON.stringify(employee), sortOrder
    ]);

    const updated = await bumpStateVersion(client,req.user.id);

    const auditId = 'employee-save-' + crypto.randomUUID();
    const action = existing.rowCount ? 'UPDATE_EMPLOYEE' : 'CREATE_EMPLOYEE';
    await client.query(`INSERT INTO ${q('audit_log')} (user_id,action,ip) VALUES ($1,$2,$3)`, [req.user.id, action + ':' + employee.id, req.ip]);
    await client.query(`INSERT INTO ${q('application_audit_logs')}
      (id,company_id,user_id,user_name,user_role,action,entity_type,entity_id,occurred_at,details,payload,sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,'EMPLOYEE',$7,now(),$8,$9::jsonb,
        COALESCE((SELECT max(sort_order)+1 FROM ${q('application_audit_logs')}),0))`, [
      auditId, employee.companyId, req.user.id, req.user.name || req.user.username || '', req.user.role,
      existing.rowCount ? 'تعديل بيانات موظف' : 'إضافة موظف جديد', employee.id,
      `${employee.firstNameAr} ${employee.lastNameAr} (${employee.employeeNo})`, JSON.stringify({ id:auditId, companyId:employee.companyId, userId:req.user.id, userName:req.user.name || req.user.username || '', userRole:req.user.role, action:existing.rowCount ? 'تعديل بيانات موظف' : 'إضافة موظف جديد', entityType:'EMPLOYEE', entityId:employee.id, timestamp:new Date().toISOString(), details:`${employee.firstNameAr} ${employee.lastNameAr} (${employee.employeeNo})` })
    ]);

    await client.query('COMMIT');
    if (updated.rowCount) broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[employee.companyId],changes:[{ collection:'employees',operation:'upsert',records:[employee] }] });
    res.json({ employee, created:!existing.rowCount, version:Number(updated.rows[0]?.version || 0), updated_at:updated.rows[0]?.updated_at || new Date().toISOString() });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (e?.code === '23505') return res.status(409).json({ error:'EMPLOYEE_NUMBER_EXISTS' });
    next(e);
  } finally { client.release(); }
});

router.delete('/employees/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_EMPLOYEES')) return res.status(403).json({ error:'FORBIDDEN' });
    await client.query('BEGIN');
    const employee = await client.query(`SELECT id,company_id FROM ${q('employees')} WHERE id=$1 AND is_archived=false FOR UPDATE`, [req.params.id]);
    if (!employee.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error:'EMPLOYEE_NOT_FOUND' });
    }
    if (!req.user.company_ids.includes(employee.rows[0].company_id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error:'FORBIDDEN' });
    }
    const references = await client.query(`SELECT
      (SELECT count(*) FROM ${q('attendance_records')} WHERE employee_id=$1)
      +(SELECT count(*) FROM ${q('leave_requests')} WHERE employee_id=$1)
      +(SELECT count(*) FROM ${q('loans')} WHERE employee_id=$1)
      +(SELECT count(*) FROM ${q('penalties')} WHERE employee_id=$1)
      +(SELECT count(*) FROM ${q('temporary_earnings')} WHERE employee_id=$1)
      +(SELECT count(*) FROM ${q('payroll_settlements')} WHERE employee_id=$1)
      +(SELECT count(*) FROM ${q('payroll_run_items')} WHERE employee_id=$1) AS count`, [req.params.id]);
    const archived = Number(references.rows[0]?.count || 0) > 0;
    if (archived) {
      await client.query(`UPDATE ${q('employees')} SET is_archived=true,updated_at=now() WHERE id=$1`, [req.params.id]);
    } else {
      await client.query(`DELETE FROM ${q('employees')} WHERE id=$1`, [req.params.id]);
    }
    const updated = await bumpStateVersion(client,req.user.id);
    await client.query(`INSERT INTO ${q('audit_log')} (user_id,action,ip) VALUES ($1,$2,$3)`,
      [req.user.id,`${archived ? 'ARCHIVE' : 'DELETE'}_EMPLOYEE:${req.params.id}`,req.ip]);
    const deleteAuditId = 'employee-delete-' + crypto.randomUUID();
    await client.query(`INSERT INTO ${q('application_audit_logs')}
      (id,company_id,user_id,user_name,user_role,action,entity_type,entity_id,occurred_at,details,payload,sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,'EMPLOYEE',$7,now(),$8,$9::jsonb,
        COALESCE((SELECT max(sort_order)+1 FROM ${q('application_audit_logs')}),0))`, [
      deleteAuditId, employee.rows[0].company_id, req.user.id, req.user.name || req.user.username || '', req.user.role,
      archived ? 'أرشفة موظف' : 'حذف موظف', req.params.id,
      archived ? 'تمت أرشفة الموظف لوجود حركات مرتبطة' : 'تم حذف الموظف نهائيًا',
      JSON.stringify({ id:deleteAuditId, companyId:employee.rows[0].company_id, userId:req.user.id, userName:req.user.name || req.user.username || '', userRole:req.user.role, action:archived ? 'أرشفة موظف' : 'حذف موظف', entityType:'EMPLOYEE', entityId:req.params.id, timestamp:new Date().toISOString(), details:archived ? 'تمت أرشفة الموظف لوجود حركات مرتبطة' : 'تم حذف الموظف نهائيًا' })
    ]);
    await client.query('COMMIT');
    if (updated.rowCount) broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[employee.rows[0].company_id],changes:[{ collection:'employees',operation:'delete',ids:[req.params.id] }] });
    res.json({ deleted:!archived,archived });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    next(e);
  } finally { client.release(); }
});

router.post('/companies/:id/employees/archive', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_EMPLOYEES') || !req.user.company_ids.includes(req.params.id)) {
      return res.status(403).json({ error:'FORBIDDEN' });
    }
    await client.query('BEGIN');
    const company = await client.query(`SELECT id FROM ${q('companies')} WHERE id=$1 AND is_archived=false FOR UPDATE`, [req.params.id]);
    if (!company.rowCount) throw workflowError(404,'COMPANY_NOT_FOUND');
    const employees = await client.query(`SELECT id FROM ${q('employees')} WHERE company_id=$1 AND is_archived=false FOR UPDATE`, [req.params.id]);
    const employeeIds = employees.rows.map(row => row.id);
    if (!employeeIds.length) {
      const current = await client.query(`SELECT version,updated_at FROM ${q('app_state')} WHERE id=1`);
      await client.query('COMMIT');
      return res.json({ employeeIds:[],archivedCount:0,version:Number(current.rows[0]?.version || 0),updated_at:current.rows[0]?.updated_at || new Date().toISOString() });
    }
    await client.query(`UPDATE ${q('employees')} SET is_archived=true,updated_at=now()
      WHERE company_id=$1 AND id=ANY($2::text[])`, [req.params.id,employeeIds]);
    const updated = await bumpStateVersion(client,req.user.id);
    await appendStateAudit(client,q,{ companyIds:[req.params.id],user:req.user,action:`ARCHIVE_COMPANY_EMPLOYEES:${employeeIds.length}`,version:updated.rows[0].version });
    await client.query(`INSERT INTO ${q('audit_log')} (user_id,action,ip) VALUES ($1,$2,$3)`, [req.user.id,`ARCHIVE_COMPANY_EMPLOYEES:${employeeIds.length}`,req.ip]);
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at,
      companyIds:[req.params.id],changes:[{ collection:'employees',operation:'delete',ids:employeeIds }] });
    res.json({ employeeIds,archivedCount:employeeIds.length,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});


  return router;
}

