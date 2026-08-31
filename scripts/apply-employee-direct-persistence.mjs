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
    const route = fs.readFileSync(new URL('./employee-direct-route.snippet.txt', import.meta.url), 'utf8');
    source = source.slice(0, idx) + route + source.slice(idx);
  }

  const deleteAuditNeedle = "    await client.query(`INSERT INTO ${q('audit_log')} (user_id,action,ip) VALUES ($1,$2,$3)`,\n      [req.user.id,`${archived ? 'ARCHIVE' : 'DELETE'}_EMPLOYEE:${req.params.id}`,req.ip]);\n    await client.query('COMMIT');";
  if (source.includes(deleteAuditNeedle) && !source.includes("const deleteAuditId = 'employee-delete-' + crypto.randomUUID();")) {
    const deleteAuditReplacement = "    await client.query(`INSERT INTO ${q('audit_log')} (user_id,action,ip) VALUES ($1,$2,$3)`,\n      [req.user.id,`${archived ? 'ARCHIVE' : 'DELETE'}_EMPLOYEE:${req.params.id}`,req.ip]);\n    const deleteAuditId = 'employee-delete-' + crypto.randomUUID();\n    await client.query(`INSERT INTO ${q('application_audit_logs')}\n      (id,company_id,user_id,user_name,user_role,action,entity_type,entity_id,occurred_at,details,payload,sort_order)\n      VALUES ($1,$2,$3,$4,$5,$6,'EMPLOYEE',$7,now(),$8,$9::jsonb,\n        COALESCE((SELECT max(sort_order)+1 FROM ${q('application_audit_logs')}),0))`, [\n      deleteAuditId, employee.rows[0].company_id, req.user.id, req.user.name || req.user.username || '', req.user.role,\n      archived ? 'أرشفة موظف' : 'حذف موظف', req.params.id,\n      archived ? 'تمت أرشفة الموظف لوجود حركات مرتبطة' : 'تم حذف الموظف نهائيًا',\n      JSON.stringify({ id:deleteAuditId, companyId:employee.rows[0].company_id, userId:req.user.id, userName:req.user.name || req.user.username || '', userRole:req.user.role, action:archived ? 'أرشفة موظف' : 'حذف موظف', entityType:'EMPLOYEE', entityId:req.params.id, timestamp:new Date().toISOString(), details:archived ? 'تمت أرشفة الموظف لوجود حركات مرتبطة' : 'تم حذف الموظف نهائيًا' })\n    ]);\n    await client.query('COMMIT');";
    source = source.replace(deleteAuditNeedle, deleteAuditReplacement);
  }

  if (!source.includes("app.put('/api/employees/:id'")) throw new Error('Direct employee save route missing');
  if (!source.includes("const deleteAuditId = 'employee-delete-' + crypto.randomUUID();")) throw new Error('Employee delete audit hardening missing');
  return source;
});

console.log('Direct PostgreSQL employee save/delete persistence applied.');
