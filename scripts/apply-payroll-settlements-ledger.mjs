import fs from 'node:fs';

function patch(path, transform) {
  const source = fs.readFileSync(path, 'utf8');
  const next = transform(source);
  if (next !== source) fs.writeFileSync(path, next);
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Missing PR21 transform anchor: ${label}`);
  return source.replace(before, after);
}

patch('src/types/index.ts', source => {
  if (!source.includes("export type PayrollSettlementStatus")) {
    const anchor = `export type PaymentBatchStatus = 'SCHEDULED' | 'PAID' | 'FAILED' | 'CANCELLED';`;
    const addition = `export type PayrollSettlementStatus = 'PENDING' | 'PAID' | 'REVERSED';\nexport type PayrollSettlementReason = 'HELD_PAYROLL' | 'RETROACTIVE_EMPLOYEE' | 'PAYROLL_DIFFERENCE';\n\nexport interface PayrollSettlement {\n  id: string;\n  companyId: string;\n  employeeId: string;\n  employeeNo: string;\n  employeeName: string;\n  periodMonth: string;\n  periodStart: string;\n  periodEnd: string;\n  amount: number;\n  reason: PayrollSettlementReason;\n  sourcePayrollRunId?: string;\n  sourcePayrollItemId?: string;\n  dedupeKey: string;\n  status: PayrollSettlementStatus;\n  paymentMethod?: PaymentMethod;\n  paymentDate?: string;\n  paymentReference?: string;\n  notes?: string;\n  createdAt: string;\n  paidAt?: string;\n  reversedAt?: string;\n}\n\n`;
    source = replaceOnce(source, anchor, `${addition}${anchor}`, 'settlement types');
  }
  if (!source.includes("  | 'settlements'")) {
    source = replaceOnce(source, `  | 'payroll_runs' \n  | 'attendance'`, `  | 'payroll_runs' \n  | 'settlements'\n  | 'attendance'`, 'settlement navigation type');
  }
  return source;
});

patch('src/utils/storage.ts', source => {
  if (!source.includes('PayrollSettlement,')) {
    source = replaceOnce(source, `  PayrollRun, \n  JournalBatch,`, `  PayrollRun, \n  PayrollSettlement,\n  JournalBatch,`, 'storage settlement import');
  }
  if (!source.includes('payrollSettlements: PayrollSettlement[];')) {
    source = replaceOnce(source, `  payrollRuns: PayrollRun[];\n  journals: JournalBatch[];`, `  payrollRuns: PayrollRun[];\n  payrollSettlements: PayrollSettlement[];\n  journals: JournalBatch[];`, 'AppState settlements');
  }
  source = source.replace(`      const payrollRuns: PayrollRun[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.PAYROLL_RUNS) || '[]');\n      const journals: JournalBatch[]`, `      const payrollRuns: PayrollRun[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.PAYROLL_RUNS) || '[]');\n      const payrollSettlements: PayrollSettlement[] = [];\n      const journals: JournalBatch[]`);
  source = source.replace(`        payrollRuns,\n        journals,`, `        payrollRuns,\n        payrollSettlements,\n        journals,`);
  source = source.replace(`  const payrollRuns: PayrollRun[] = [];\n  const journals: JournalBatch[] = [];`, `  const payrollRuns: PayrollRun[] = [];\n  const payrollSettlements: PayrollSettlement[] = [];\n  const journals: JournalBatch[] = [];`);
  source = source.replace(`    payrollRuns,\n    journals,`, `    payrollRuns,\n    payrollSettlements,\n    journals,`);
  return source;
});

patch('src/utils/api.ts', source => {
  if (!source.includes("'payrollSettlements'")) {
    source = replaceOnce(source,
      `const MUTABLE_COLLECTIONS = ['companies', 'employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns', 'journals'] as const;`,
      `const MUTABLE_COLLECTIONS = ['companies', 'employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns', 'payrollSettlements', 'journals'] as const;`,
      'api mutable settlement collection');
  }
  return source;
});

patch('server/index.mjs', source => {
  if (!source.includes("'payrollSettlements'")) {
    source = replaceOnce(source,
      `const COMPANY_SCOPED_KEYS = ['employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns', 'journals'];`,
      `const COMPANY_SCOPED_KEYS = ['employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns', 'payrollSettlements', 'journals'];`,
      'server company scoped settlements');
    source = replaceOnce(source,
      `const OPERATIONS_MUTABLE_KEYS = new Set(['employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns']);`,
      `const OPERATIONS_MUTABLE_KEYS = new Set(['employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns', 'payrollSettlements']);`,
      'server mutable settlements');
    source = replaceOnce(source,
      `const PATCHABLE_COLLECTIONS = new Set(['companies', 'employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns', 'journals', 'auditLogs']);`,
      `const PATCHABLE_COLLECTIONS = new Set(['companies', 'employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns', 'payrollSettlements', 'journals', 'auditLogs']);`,
      'server patchable settlements');
    source = replaceOnce(source,
      `    loans:'MANAGE_LOANS_PENALTIES', penalties:'MANAGE_LOANS_PENALTIES', temporaryEarnings:'MANAGE_LOANS_PENALTIES', payrollRuns:'MANAGE_PAYROLL', journals:'MANAGE_JOURNALS',`,
      `    loans:'MANAGE_LOANS_PENALTIES', penalties:'MANAGE_LOANS_PENALTIES', temporaryEarnings:'MANAGE_LOANS_PENALTIES', payrollRuns:'MANAGE_PAYROLL', payrollSettlements:'MANAGE_PAYROLL', journals:'MANAGE_JOURNALS',`,
      'server settlement permission');
  }

  if (!source.includes('function validatePayrollSettlementChanges')) {
    const anchor = `function mergeStateForUser(stored, incoming, user) {`;
    const helper = `function validatePayrollSettlementChanges(storedSettlements, incomingSettlements) {\n  const before = asArray(storedSettlements);\n  const after = asArray(incomingSettlements);\n  const beforeById = new Map(before.map(item => [item.id, item]));\n  const seenDedupe = new Set();\n  for (const settlement of after) {\n    if (!settlement || typeof settlement.id !== 'string' || !settlement.id || typeof settlement.companyId !== 'string' || !settlement.companyId\n      || typeof settlement.employeeId !== 'string' || !settlement.employeeId || typeof settlement.dedupeKey !== 'string' || !settlement.dedupeKey\n      || !/^\\d{4}-\\d{2}$/.test(String(settlement.periodMonth || '')) || !(Number(settlement.amount) > 0)) {\n      throw workflowError(400, 'INVALID_PAYROLL_SETTLEMENT');\n    }\n    if (settlement.status !== 'REVERSED') {\n      const key = settlement.companyId + ':' + settlement.dedupeKey;\n      if (seenDedupe.has(key)) throw workflowError(409, 'DUPLICATE_PAYROLL_SETTLEMENT');\n      seenDedupe.add(key);\n    }\n    const previous = beforeById.get(settlement.id);\n    if (previous?.status === 'PAID' && settlement.status === 'PAID' && !sameJson(previous, settlement)) {\n      throw workflowError(409, 'PAID_SETTLEMENT_LOCKED');\n    }\n    if (previous?.status === 'PAID' && settlement.status === 'REVERSED' && !settlement.reversedAt) {\n      throw workflowError(400, 'SETTLEMENT_REVERSAL_DATE_REQUIRED');\n    }\n  }\n}\n\n${anchor}`;
    source = replaceOnce(source, anchor, helper, 'settlement server validation helper');
    const mergeCallAnchor = `function mergeStateForUser(stored, incoming, user) {`;
    source = replaceOnce(source, mergeCallAnchor, `function mergeStateForUser(stored, incoming, user) {\n  if (Object.prototype.hasOwnProperty.call(incoming || {}, 'payrollSettlements')) validatePayrollSettlementChanges(stored?.payrollSettlements, incoming?.payrollSettlements);`, 'settlement validation call');
  }
  return source;
});

patch('src/utils/permissions.ts', source => {
  if (!source.includes("settlements: 'MANAGE_PAYROLL'")) {
    source = replaceOnce(source,
      `  payroll_runs: 'MANAGE_PAYROLL', attendance: 'MANAGE_ATTENDANCE', loans_penalties: 'MANAGE_LOANS_PENALTIES',`,
      `  payroll_runs: 'MANAGE_PAYROLL', settlements: 'MANAGE_PAYROLL', attendance: 'MANAGE_ATTENDANCE', loans_penalties: 'MANAGE_LOANS_PENALTIES',`,
      'settlement tab permission');
  }
  return source;
});

patch('src/components/Sidebar.tsx', source => {
  if (!source.includes("id: 'settlements'")) {
    const start = source.indexOf(`  const navItems:`);
    const end = source.indexOf(`\n\n  const visibleNavItems`, start);
    if (start < 0 || end < 0) throw new Error('Missing PR21 Sidebar nav block');
    const nav = `  const navItems: { id: NavigationTab; label: string; icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean; managementOnly?: boolean }[] = [\n    { id: 'dashboard', label: t('dashboard'), icon: LayoutDashboard },\n    { id: 'employees', label: \`\${t('employees')} (\${employeesCount})\`, icon: Users },\n    { id: 'payroll_runs', label: t('payrollRuns'), icon: Banknote },\n    { id: 'attendance', label: t('attendance'), icon: Clock },\n    { id: 'loans_penalties', label: t('loans'), icon: Receipt },\n    { id: 'settlements', label: language === 'ar' ? 'التسويات' : 'Settlements', icon: Banknote },\n    { id: 'company_profile', label: t('companyProfile'), icon: Building2, managementOnly: true },\n    { id: 'journals', label: t('journals'), icon: Layers, managementOnly: true },\n    { id: 'reports', label: t('reports'), icon: BarChart3 },\n    { id: 'users', label: t('users'), icon: UserCheck, adminOnly: true },\n    { id: 'settings', label: t('settings'), icon: Settings, adminOnly: true },\n    { id: 'audit_logs', label: t('audit'), icon: ShieldAlert, adminOnly: true },\n  ];`;
    source = source.slice(0, start) + nav + source.slice(end);
  }
  return source;
});

patch('src/components/EmployeesView.tsx', source => {
  const readonly = `<input type="text" readOnly value={formData.employeeNo || ''} className="w-full px-3 py-2 text-xs bg-slate-100 border border-slate-200 rounded-xl font-mono font-bold text-slate-700" />`;
  const editable = `<input type="text" required value={formData.employeeNo || ''} onChange={e => setFormData({ ...formData, employeeNo: e.target.value.toUpperCase() })} className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900" />`;
  if (source.includes(readonly)) source = source.replace(readonly, editable);
  source = source.replace(`{language === 'ar' ? 'يُنشأ تلقائيًا من آخر رقم وظيفي مستخدم' : 'Generated automatically from the highest used employee number'}`, `{language === 'ar' ? 'يُقترح تلقائيًا ويمكنك استبداله برمز وظيفي خاص قبل الحفظ' : 'Suggested automatically; you may replace it with your own employee code before saving'}`);
  if (!source.includes('EMPLOYEE_NUMBER_LOCAL_DUPLICATE')) {
    const anchor = `    if (!formData.firstNameAr || !formData.lastNameAr || !formData.employeeNo) {`;
    const check = `    const normalizedEmployeeNo = String(formData.employeeNo || '').trim().toUpperCase();\n    if (employees.some(emp => emp.companyId === company.id && emp.id !== editingEmployee?.id && String(emp.employeeNo || '').trim().toUpperCase() === normalizedEmployeeNo)) {\n      alert(language === 'ar' ? 'الرقم الوظيفي مستخدم لموظف آخر' : 'Employee number is already used by another employee');\n      return; // EMPLOYEE_NUMBER_LOCAL_DUPLICATE\n    }\n`;
    source = replaceOnce(source, anchor, check + anchor, 'employee number duplicate check');
  }
  return source;
});

patch('src/App.tsx', source => {
  if (!source.includes('PayrollSettlement,')) {
    source = replaceOnce(source, `  PayrollRun, \n  AttendanceRecord,`, `  PayrollRun, \n  PayrollSettlement,\n  AttendanceRecord,`, 'App settlement type import');
  }
  if (!source.includes(`import { PayrollSettlementsView }`)) {
    source = replaceOnce(source, `import { PayrollRunsView } from './components/PayrollRunsView';`, `import { PayrollRunsView } from './components/PayrollRunsView';\nimport { PayrollSettlementsView } from './components/PayrollSettlementsView';`, 'App settlement view import');
  }
  if (!source.includes('const handleSavePayrollSettlement')) {
    const anchor = `  const handleAddAttendance = (record: AttendanceRecord) => {`;
    const handler = `  const handleSavePayrollSettlement = async (settlement: PayrollSettlement) => {\n    let duplicate = false;\n    setState(prev => {\n      duplicate = prev.payrollSettlements.some(item => item.companyId === settlement.companyId && item.dedupeKey === settlement.dedupeKey && item.status !== 'REVERSED' && item.id !== settlement.id);\n      if (duplicate) return prev;\n      const payrollSettlements = prev.payrollSettlements.some(item => item.id === settlement.id)\n        ? prev.payrollSettlements.map(item => item.id === settlement.id ? settlement : item)\n        : [settlement, ...prev.payrollSettlements];\n      return { ...prev, payrollSettlements };\n    });\n    if (duplicate) throw new Error('DUPLICATE_PAYROLL_SETTLEMENT');\n  };\n\n`;
    source = replaceOnce(source, anchor, handler + anchor, 'App settlement save handler');
  }
  if (!source.includes("activeTab === 'settlements'")) {
    const anchor = `            {activeTab === 'journals' && hasPermission(state.currentUser, 'MANAGE_JOURNALS') && (`;
    const block = `            {activeTab === 'settlements' && hasPermission(state.currentUser, 'MANAGE_PAYROLL') && (\n              <PayrollSettlementsView\n                company={activeCompany}\n                employees={state.employees}\n                payrollRuns={state.payrollRuns}\n                settlements={state.payrollSettlements}\n                attendance={state.attendance}\n                loans={state.loans}\n                penalties={state.penalties}\n                temporaryEarnings={state.temporaryEarnings}\n                activeRole={state.activeRole}\n                onSaveSettlement={handleSavePayrollSettlement}\n                onSavePayrollRun={handleSavePayrollRun}\n              />\n            )}\n\n`;
    source = replaceOnce(source, anchor, block + anchor, 'App settlement route');
  }
  source = source.replace(`        payrollRuns={state.payrollRuns}\n        loans={state.loans}\n        onClose={() => setStatementEmployee(null)}`, `        payrollRuns={state.payrollRuns}\n        settlements={state.payrollSettlements}\n        loans={state.loans}\n        onClose={() => setStatementEmployee(null)}`);
  return source;
});

patch('src/components/EmployeeStatementModal.tsx', source => {
  if (!source.includes('settlements?: PayrollSettlement[];')) {
    source = replaceOnce(source, `import { Company, Employee, PayrollRun, LoanSchedule } from '../types';`, `import { Company, Employee, PayrollRun, PayrollSettlement, LoanSchedule } from '../types';`, 'statement settlement import');
    source = replaceOnce(source, `  payrollRuns: PayrollRun[];\n  loans: LoanSchedule[];`, `  payrollRuns: PayrollRun[];\n  settlements?: PayrollSettlement[];\n  loans: LoanSchedule[];`, 'statement settlement prop');
    source = source.replace(`  payrollRuns,\n  loans,`, `  payrollRuns,\n  settlements = [],\n  loans,`);
  }
  if (!source.includes('employeePaidSettlements')) {
    const anchor = `  const latestItem = employeeHistory[0]?.item;`;
    const calc = `  const employeePaidSettlements = settlements.filter(item => item.employeeId === employee.id && item.status === 'PAID');\n  const employeePaidSettlementTotal = roundAmount(employeePaidSettlements.reduce((sum, item) => sum + Number(item.amount || 0), 0));\n`;
    source = replaceOnce(source, anchor, calc + anchor, 'statement settlement calculation');
    const panelAnchor = `          {/* Current Month Itemized Breakdown: Earnings vs Deductions */}`;
    const panel = `          {employeePaidSettlements.length > 0 && (\n            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">\n              <div className="flex items-center justify-between gap-3 mb-2"><div><div className="text-xs font-black text-emerald-900">{tr('تسويات رواتب مسددة', 'Paid payroll settlements')}</div><div className="text-[10px] text-emerald-700">{tr('تاريخ الاستحقاق منفصل عن تاريخ السداد الفعلي.', 'Entitlement period is kept separate from the actual payment date.')}</div></div><strong>{formatSAR(employeePaidSettlementTotal)}</strong></div>\n              <div className="space-y-1">{employeePaidSettlements.map(item => <div key={item.id} className="flex items-center justify-between border-t border-emerald-200/70 pt-1.5 text-[11px]"><span>{item.periodMonth} • {item.paymentDate || '-'} • {item.paymentMethod || '-'}</span><strong>{formatSAR(item.amount)}</strong></div>)}</div>\n            </div>\n          )}\n\n`;
    source = replaceOnce(source, panelAnchor, panel + panelAnchor, 'statement settlement panel');
  }
  return source;
});

console.log('PR21 payroll settlements ledger, editable employee number, and sidebar order applied.');
