import fs from 'node:fs';

function patchFile(path, transform) {
  const source = fs.readFileSync(path, 'utf8');
  const next = transform(source);
  if (next !== source) fs.writeFileSync(path, next);
}

patchFile('src/components/EmployeesView.tsx', (initial) => {
  let source = initial;

  source = source.replace(
    '  onSaveEmployee?: (emp: Employee) => void;',
    '  onSaveEmployee?: (emp: Employee) => Promise<void> | void;'
  );

  source = source.replace(
    '  const handleFormSubmit = (e: React.FormEvent) => {',
    '  const handleFormSubmit = async (e: React.FormEvent) => {'
  );

  const saveBlock = /    if \(editingEmployee\) \{\n      const updated = processedForm as Employee;\n      if \(onSaveEmployee\) onSaveEmployee\(updated\);\n      else if \(onUpdateEmployee\) onUpdateEmployee\(updated\);\n    \} else \{\n      const newEmp: Employee = \{\n        \.\.\.processedForm as Employee,\n        id: `emp-\$\{company\.id\}-\$\{Date\.now\(\)\}`,\n      \};\n      if \(onSaveEmployee\) onSaveEmployee\(newEmp\);\n      else if \(onAddEmployee\) onAddEmployee\(newEmp\);\n    \}\n    setIsModalOpen\(false\);/;

  if (!saveBlock.test(source) && !source.includes('EMPLOYEE_SAVE_NOT_CONFIRMED')) {
    throw new Error('Employee save submit block not found');
  }

  source = source.replace(saveBlock, `    try {\n      if (editingEmployee) {\n        const updated = processedForm as Employee;\n        if (onSaveEmployee) await onSaveEmployee(updated);\n        else if (onUpdateEmployee) await Promise.resolve(onUpdateEmployee(updated));\n      } else {\n        const newEmp: Employee = {\n          ...processedForm as Employee,\n          id: \`emp-\${company.id}-\${Date.now()}\`,\n        };\n        if (onSaveEmployee) await onSaveEmployee(newEmp);\n        else if (onAddEmployee) await Promise.resolve(onAddEmployee(newEmp));\n      }\n      setIsModalOpen(false);\n    } catch (error) {\n      const code = error instanceof Error ? error.message : 'EMPLOYEE_SAVE_FAILED';\n      alert(language === 'ar'\n        ? 'تعذر حفظ الموظف في قاعدة البيانات. لم يتم إغلاق النموذج حتى لا تفقد البيانات. (' + code + ')'\n        : 'Employee could not be saved to the database. The form remains open so the data is not lost. (' + code + ')');\n    }`);

  return source;
});

patchFile('src/App.tsx', (initial) => {
  let source = initial;

  const start = source.indexOf('  const handleSaveEmployee = (employee: Employee) => {');
  const endMarker = '\n\n  const handleBulkImportEmployees =';
  const end = source.indexOf(endMarker, start);
  if ((start < 0 || end < 0) && !source.includes('EMPLOYEE_SAVE_NOT_CONFIRMED')) {
    throw new Error('App employee save handler boundaries not found');
  }

  if (start >= 0 && end >= 0) {
    const replacement = `  const handleSaveEmployee = async (employee: Employee) => {\n    const operation = persistenceQueueRef.current.catch(() => undefined).then(async () => {\n      const remote = await api.getState();\n      if (!remote.state) throw new Error('STATE_RELOAD_FAILED');\n\n      const base = { ...state, ...remote.state } as MasarAppState;\n      const exists = (base.employees || []).some(e => e.id === employee.id);\n      const employees = exists\n        ? (base.employees || []).map(e => e.id === employee.id ? employee : e)\n        : [employee, ...(base.employees || [])];\n\n      const log: AuditLog = {\n        id: \`log-\${Date.now()}\`,\n        timestamp: new Date().toISOString(),\n        userName: state.currentUser?.name || 'المدير العام',\n        userRole: state.activeRole,\n        action: exists ? tr('تعديل بيانات موظف', 'Updated employee details') : tr('إضافة موظف جديد', 'Added employee'),\n        entityType: 'EMPLOYEE',\n        entityId: employee.id,\n        details: \`\${tr('الموظف:', 'Employee:')} \${language === 'ar' ? \`\${employee.firstNameAr} \${employee.lastNameAr}\` : \`\${employee.firstNameEn || employee.firstNameAr} \${employee.lastNameEn || employee.lastNameAr}\`} (\${employee.employeeNo})\`,\n      };\n\n      const next: MasarAppState = {\n        ...base,\n        currentUser: state.currentUser,\n        activeRole: state.currentUser?.role || state.activeRole,\n        activeCompanyId: state.activeCompanyId,\n        employees,\n        auditLogs: [log, ...(base.auditLogs || [])],\n      };\n\n      await api.saveState(next);\n      const confirmed = await api.getState();\n      if (!confirmed.state) throw new Error('STATE_RELOAD_FAILED');\n      if (!(confirmed.state.employees || []).some(candidate => candidate.id === employee.id)) {\n        throw new Error('EMPLOYEE_SAVE_NOT_CONFIRMED');\n      }\n      return confirmed.state;\n    });\n\n    persistenceQueueRef.current = operation.then(() => undefined, () => undefined);\n\n    try {\n      const confirmedState = await operation;\n      setState(prev => {\n        const base = { ...prev, ...confirmedState } as MasarAppState;\n        const next: MasarAppState = {\n          ...base,\n          currentUser: prev.currentUser,\n          activeRole: prev.currentUser?.role || prev.activeRole,\n          activeCompanyId: prev.activeCompanyId,\n          employees: synchronizeEmployeeBankDetails(base.companies || [], base.employees || []),\n        };\n        remoteStateSnapshotRef.current = next;\n        return next;\n      });\n      setDbStatus(prev => ({ ...prev, isCloudConnected: true, isChecking: false, lastError: null, lastSavedAt: new Date().toISOString() }));\n    } catch (error: any) {\n      setDbStatus(prev => ({ ...prev, isChecking: false, lastError: \`\${tr('تعذر حفظ الموظف:', 'Could not save employee:')} \${error?.message || 'UNKNOWN_ERROR'}\` }));\n      throw error;\n    }\n  };`;
    source = source.slice(0, start) + replacement + source.slice(end);
  }

  return source;
});

patchFile('src/components/DashboardView.tsx', (initial) => {
  let source = initial;

  source = source.replace(
    '    <div className="space-y-6 pb-10">',
    '    <div className="space-y-5 pb-8">'
  );

  source = source.replace(
    '      {(lifecycleAlerts.length > 0 || onboardingEmployees.length > 0) && (',
    '      {('
  );

  source = source.replace(
    "{tr('ملخص هادئ للحالات التي تحتاج استكمال أو متابعة قريبة', 'A concise view of records needing completion or near-term follow-up')}",
    "{tr('ملخص تنفيذي ثابت للحالات التي تحتاج استكمال أو متابعة، حتى عندما تكون الأعداد صفرًا', 'A persistent executive summary for records needing completion or follow-up, including zero-state visibility')}"
  );

  return source;
});

console.log('Confirmed employee persistence and persistent compact HR dashboard applied.');
