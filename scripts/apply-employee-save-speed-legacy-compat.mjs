import fs from 'node:fs';

function patchFile(path, transform) {
  const source = fs.readFileSync(path, 'utf8');
  const next = transform(source);
  if (next !== source) fs.writeFileSync(path, next);
}

patchFile('src/utils/api.ts', (initial) => {
  let source = initial;
  const oldSave = "  saveEmployee: (employee:any) => request<{employee:any;created:boolean}>(`/api/employees/${encodeURIComponent(employee.id)}`, { method:'PUT', body:JSON.stringify(employee) }),";
  const newSave = `  saveEmployee: async (employee:any) => {\n    const result = await request<{employee:any;created:boolean;version:number;updated_at:string}>(\`/api/employees/\${encodeURIComponent(employee.id)}\`, { method:'PUT', body:JSON.stringify(employee) });\n    stateVersion = result.version;\n    if (syncedState) {\n      const employees = Array.isArray(syncedState.employees) ? [...syncedState.employees] : [];\n      const index = employees.findIndex((item:any) => item?.id === result.employee.id);\n      if (index >= 0) employees[index] = cloneState(result.employee);\n      else employees.push(cloneState(result.employee));\n      syncedState = { ...syncedState, employees };\n    }\n    return result;\n  },`;
  if (source.includes(oldSave)) source = source.replace(oldSave, newSave);
  if (!source.includes('stateVersion = result.version') || !source.includes('saveEmployee: async')) {
    throw new Error('Optimized direct employee save API anchor not found');
  }
  return source;
});

patchFile('src/App.tsx', (initial) => {
  let source = initial;
  const start = source.indexOf('  const handleSaveEmployee = async (employee: Employee) => {');
  const endMarker = '\n\n  const handleBulkImportEmployees =';
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error('Employee save handler boundaries not found');

  const replacement = `  const handleSaveEmployee = async (employee: Employee) => {\n    const operation = persistenceQueueRef.current.catch(() => undefined).then(async () => {\n      const result = await api.saveEmployee(employee);\n      if (!result?.employee || result.employee.id !== employee.id || !result.version) {\n        throw new Error('EMPLOYEE_DIRECT_SAVE_FAILED');\n      }\n      return result;\n    });\n\n    persistenceQueueRef.current = operation.then(() => undefined, () => undefined);\n\n    try {\n      const result = await operation;\n      setState(prev => {\n        const exists = (prev.employees || []).some(candidate => candidate.id === result.employee.id);\n        const employees = exists\n          ? (prev.employees || []).map(candidate => candidate.id === result.employee.id ? result.employee as Employee : candidate)\n          : [result.employee as Employee, ...(prev.employees || [])];\n        const next: MasarAppState = {\n          ...prev,\n          employees: synchronizeEmployeeBankDetails(prev.companies || [], employees),\n        };\n        remoteStateSnapshotRef.current = next;\n        return next;\n      });\n      setDbStatus(prev => ({ ...prev, isCloudConnected: true, isChecking: false, lastError: null, lastSavedAt: result.updated_at || new Date().toISOString() }));\n    } catch (error: any) {\n      setDbStatus(prev => ({ ...prev, isChecking: false, lastError: \`\${tr('تعذر حفظ الموظف:', 'Could not save employee:')} \${error?.message || 'UNKNOWN_ERROR'}\` }));\n      throw error;\n    }\n  };`;
  source = source.slice(0, start) + replacement + source.slice(end);
  if (source.slice(start, start + replacement.length + 200).includes('await api.getState()')) {
    throw new Error('Employee save still performs full state reload');
  }
  return source;
});

patchFile('src/components/EmployeesView.tsx', (initial) => {
  let source = initial;
  const oldInference = "    setNonSaudiEntryMode(empCopy.nationality === 'NON_SAUDI' ? (empCopy.iqamaExpiryDate || empCopy.iqamaNumber ? 'IQAMA_HOLDER' : 'NEW_ARRIVAL') : '');";
  const newInference = `    const legacyIdentity = String(empCopy.nationalIdOrIqama || '').trim();\n    const explicitNewArrival = empCopy.nationality === 'NON_SAUDI' && Boolean(empCopy.entryNumber) && empCopy.iqamaIssueStatus !== 'ISSUED';\n    if (empCopy.nationality === 'NON_SAUDI' && legacyIdentity && !explicitNewArrival) {\n      // Employees imported before lifecycle/onboarding fields already store the iqama\n      // in nationalIdOrIqama. Preserve that identity and treat them as iqama holders.\n      if (!empCopy.iqamaNumber) empCopy.iqamaNumber = legacyIdentity;\n      if (!empCopy.iqamaIssueStatus || empCopy.iqamaIssueStatus === 'PENDING') empCopy.iqamaIssueStatus = 'ISSUED';\n      if (!empCopy.onboardingStatus || empCopy.onboardingStatus === 'NEW_ARRIVAL' || empCopy.onboardingStatus === 'WAITING_IQAMA') {\n        empCopy.onboardingStatus = empCopy.bankIban ? 'COMPLETE' : 'WAITING_BANK';\n      }\n    }\n    // Saudi legacy employees keep their existing nationalIdOrIqama unchanged.\n    setNonSaudiEntryMode(empCopy.nationality === 'NON_SAUDI' ? (explicitNewArrival ? 'NEW_ARRIVAL' : (empCopy.iqamaNumber || legacyIdentity ? 'IQAMA_HOLDER' : 'NEW_ARRIVAL')) : '');`;
  if (source.includes(oldInference)) source = source.replace(oldInference, newInference);
  if (!source.includes('const legacyIdentity = String(empCopy.nationalIdOrIqama')) {
    throw new Error('Legacy employee edit compatibility anchor not found');
  }
  return source;
});

patchFile('server/index.mjs', (initial) => {
  let source = initial;

  const oldResponse = "    res.json({ employee, created:!existing.rowCount });";
  const newResponse = "    res.json({ employee, created:!existing.rowCount, version:Number(updated.rows[0]?.version || 0), updated_at:updated.rows[0]?.updated_at || new Date().toISOString() });";
  if (source.includes(oldResponse)) source = source.replace(oldResponse, newResponse);
  if (!source.includes('created:!existing.rowCount, version:Number(updated.rows[0]?.version || 0)')) {
    throw new Error('Direct employee response version anchor not found');
  }

  const migrationAnchor = "  await pool.query(`ALTER TABLE ${q('employees')} ADD CONSTRAINT employees_status_check CHECK (status IN ('ONBOARDING','ACTIVE','SUSPENDED','ON_LEAVE','TERMINATED','ABSCONDED'))`);";
  if (!source.includes(migrationAnchor)) throw new Error('Employee status constraint migration anchor not found');
  if (!source.includes('LEGACY_EMPLOYEE_IDENTITY_COMPAT')) {
    const migration = `${migrationAnchor}\n\n  // LEGACY_EMPLOYEE_IDENTITY_COMPAT: records created before the lifecycle wizard already\n  // have a valid national ID/iqama. Never reinterpret them as new arrivals solely because\n  // lifecycle fields did not exist at the time. No expiry date is invented.\n  await pool.query(\`UPDATE \${q('employees')}\n    SET payload = jsonb_set(\n      jsonb_set(\n        jsonb_set(payload, '{iqamaNumber}', to_jsonb(national_id_or_iqama), true),\n        '{iqamaIssueStatus}', '\"ISSUED\"'::jsonb, true\n      ),\n      '{onboardingStatus}', to_jsonb(CASE WHEN COALESCE(bank_iban,'') <> '' THEN 'COMPLETE' ELSE 'WAITING_BANK' END::text), true\n    ), updated_at=now()\n    WHERE is_archived=false\n      AND payload->>'nationality'='NON_SAUDI'\n      AND COALESCE(national_id_or_iqama,'') <> ''\n      AND COALESCE(payload->>'iqamaNumber','')=''\n      AND COALESCE(payload->>'entryNumber','')=''\`);`;
    source = source.replace(migrationAnchor, migration);
  }
  return source;
});

console.log('Employee save speed and legacy identity compatibility applied.');
