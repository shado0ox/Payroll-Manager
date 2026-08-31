import fs from 'node:fs';

function patchFile(path, transform) {
  const source = fs.readFileSync(path, 'utf8');
  const next = transform(source);
  if (next !== source) fs.writeFileSync(path, next);
}

patchFile('src/utils/api.ts', (initial) => {
  let source = initial;
  if (!source.includes('saveEmployee:')) {
    source = source.replace(
      "  deleteEmployee: (employeeId:string) => request<{deleted:boolean;archived:boolean}>(`/api/employees/${encodeURIComponent(employeeId)}`, { method:'DELETE' }),",
      "  saveEmployee: (employee:any) => request<{employee:any;created:boolean}>(`/api/employees/${encodeURIComponent(employee.id)}`, { method:'PUT', body:JSON.stringify(employee) }),\n  deleteEmployee: (employeeId:string) => request<{deleted:boolean;archived:boolean}>(`/api/employees/${encodeURIComponent(employeeId)}`, { method:'DELETE' }),"
    );
  }
  if (!source.includes('saveEmployee:')) throw new Error('Could not add direct employee save API');
  return source;
});

patchFile('src/App.tsx', (initial) => {
  let source = initial;

  const start = source.indexOf('  const handleSaveEmployee = async (employee: Employee) => {');
  const endMarker = '\n\n  const handleBulkImportEmployees =';
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error('Confirmed employee save handler not found');

  const replacement = `  const handleSaveEmployee = async (employee: Employee) => {\n    const operation = persistenceQueueRef.current.catch(() => undefined).then(async () => {\n      const result = await api.saveEmployee(employee);\n      if (!result?.employee || result.employee.id !== employee.id) throw new Error('EMPLOYEE_DIRECT_SAVE_FAILED');\n      const confirmed = await api.getState();\n      if (!confirmed.state) throw new Error('STATE_RELOAD_FAILED');\n      const persisted = (confirmed.state.employees || []).find(candidate => candidate.id === employee.id);\n      if (!persisted) throw new Error('EMPLOYEE_SAVE_NOT_CONFIRMED');\n      return confirmed.state;\n    });\n\n    persistenceQueueRef.current = operation.then(() => undefined, () => undefined);\n\n    try {\n      const confirmedState = await operation;\n      setState(prev => {\n        const base = { ...prev, ...confirmedState } as MasarAppState;\n        const next: MasarAppState = {\n          ...base,\n          currentUser: prev.currentUser,\n          activeRole: prev.currentUser?.role || prev.activeRole,\n          activeCompanyId: prev.activeCompanyId,\n          employees: synchronizeEmployeeBankDetails(base.companies || [], base.employees || []),\n        };\n        remoteStateSnapshotRef.current = next;\n        return next;\n      });\n      setDbStatus(prev => ({ ...prev, isCloudConnected: true, isChecking: false, lastError: null, lastSavedAt: new Date().toISOString() }));\n    } catch (error: any) {\n      setDbStatus(prev => ({ ...prev, isChecking: false, lastError: \`\${tr('تعذر حفظ الموظف:', 'Could not save employee:')} \${error?.message || 'UNKNOWN_ERROR'}\` }));\n      throw error;\n    }\n  };`;
  source = source.slice(0, start) + replacement + source.slice(end);

  const deleteNeedle = "      const remote = await api.getState();\n      if (!remote.state) throw new Error('STATE_RELOAD_FAILED');\n      return { result, remote };";
  if (source.includes(deleteNeedle)) {
    source = source.replace(deleteNeedle,
      "      const remote = await api.getState();\n      if (!remote.state) throw new Error('STATE_RELOAD_FAILED');\n      if ((remote.state.employees || []).some(employee => employee.id === empId)) throw new Error('EMPLOYEE_DELETE_NOT_CONFIRMED');\n      return { result, remote };"
    );
  }
  if (!source.includes('EMPLOYEE_DELETE_NOT_CONFIRMED')) throw new Error('Could not add employee delete confirmation');

  return source;
});

patchFile('server/index.mjs', (initial) => {
  let source = initial;
  if (!source.includes("app.put('/api/employees/:id'")) {
    const marker = "app.delete('/api/employees/:id', auth, writeLimiter, async (req, res, next) => {";
    const idx = source.indexOf(marker);
    if (idx < 0) throw new Error('Employee delete route marker not found');

    const route = String.raw`app.put('/api/employees/:id', auth, writeLimiter, async (req, res, next) => {
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

    const stateRow = await client.query(`SELECT state FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
    const compatibilityState = clone(stateRow.rows[0]?.state || {});
    const employees = asArray(compatibilityState.employees);
    const employeeIndex = employees.findIndex(item => item?.id === employee.id);
    if (employeeIndex >= 0) employees[employeeIndex] = clone(employee); else employees.push(clone(employee));
    compatibilityState.employees = employees;
    const updated = await client.query(`UPDATE ${q('app_state')} SET state=$1::jsonb,version=version+1,updated_by=$2,updated_at=now()
      WHERE id=1 RETURNING version,updated_at`, [JSON.stringify(compatibilityState),req.user.id]);

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
    if (updated.rowCount) broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
    res.json({ employee, created:!existing.rowCount });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (e?.code === '23505') return res.status(409).json({ error:'EMPLOYEE_NUMBER_EXISTS' });
    next(e);
  } finally { client.release(); }
});

`;
    source = source.slice(0, idx) + route + source.slice(idx);
  }

  const deleteAuditNeedle = "    await client.query(`INSERT INTO ${q('audit_log')} (user_id,action,ip) VALUES ($1,$2,$3)`,\n      [req.user.id,`${archived ? 'ARCHIVE' : 'DELETE'}_EMPLOYEE:${req.params.id}`,req.ip]);\n    await client.query('COMMIT');";
  if (source.includes(deleteAuditNeedle) && !source.includes("'employee-delete-' + crypto.randomUUID()")) {
    source = source.replace(deleteAuditNeedle,
      "    await client.query(`INSERT INTO ${q('audit_log')} (user_id,action,ip) VALUES ($1,$2,$3)`,\n      [req.user.id,`${archived ? 'ARCHIVE' : 'DELETE'}_EMPLOYEE:${req.params.id}`,req.ip]);\n    const deleteAuditId = 'employee-delete-' + crypto.randomUUID();\n    await client.query(`INSERT INTO ${q('application_audit_logs')}\n      (id,company_id,user_id,user_name,user_role,action,entity_type,entity_id,occurred_at,details,payload,sort_order)\n      VALUES ($1,$2,$3,$4,$5,$6,'EMPLOYEE',$7,now(),$8,$9::jsonb,\n        COALESCE((SELECT max(sort_order)+1 FROM ${q('application_audit_logs')}),0))`, [\n      deleteAuditId, employee.rows[0].company_id, req.user.id, req.user.name || req.user.username || '', req.user.role,\n      archived ? 'أرشفة موظف' : 'حذف موظف', req.params.id,\n      archived ? 'تمت أرشفة الموظف لوجود حركات مرتبطة' : 'تم حذف الموظف نهائيًا',\n      JSON.stringify({ id:deleteAuditId, companyId:employee.rows[0].company_id, userId:req.user.id, userName:req.user.name || req.user.username || '', userRole:req.user.role, action:archived ? 'أرشفة موظف' : 'حذف موظف', entityType:'EMPLOYEE', entityId:req.params.id, timestamp:new Date().toISOString(), details:archived ? 'تمت أرشفة الموظف لوجود حركات مرتبطة' : 'تم حذف الموظف نهائيًا' })\n    ]);\n    await client.query('COMMIT');"
    );
  }

  if (!source.includes("app.put('/api/employees/:id'")) throw new Error('Direct employee save route missing');
  if (!source.includes("'employee-delete-' + crypto.randomUUID()")) throw new Error('Employee delete audit hardening missing');
  return source;
});

console.log('Direct PostgreSQL employee save/delete persistence applied.');
