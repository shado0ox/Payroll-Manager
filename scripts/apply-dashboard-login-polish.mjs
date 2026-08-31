import fs from 'node:fs';

function patchFile(path, transform) {
  const source = fs.readFileSync(path, 'utf8');
  const next = transform(source);
  if (next !== source) fs.writeFileSync(path, next);
}

patchFile('src/components/DashboardView.tsx', (initial) => {
  let source = initial;

  source = source.replace(
    '    <div className="space-y-8 pb-10">',
    '    <div className="space-y-6 pb-10">'
  );

  const topAlertsAnchor = `  const topLifecycleAlerts = lifecycleAlerts\n    .slice()\n    .sort((a, b) => {\n      const rank = { EXPIRED: 0, URGENT: 1, WARNING: 2, INFO: 3 } as const;\n      const severityDiff = rank[a.severity] - rank[b.severity];\n      if (severityDiff !== 0) return severityDiff;\n      return String(a.dueDate || '9999-12-31').localeCompare(String(b.dueDate || '9999-12-31'));\n    })\n    .slice(0, 8);`;

  if (!source.includes(topAlertsAnchor) && !source.includes('const onboardingEmployees = companyEmployees')) {
    throw new Error('Dashboard top lifecycle alerts anchor not found');
  }

  if (!source.includes('const onboardingEmployees = companyEmployees')) {
    source = source.replace(topAlertsAnchor, `${topAlertsAnchor}\n  const onboardingEmployees = companyEmployees\n    .filter(employee => employee.status === 'ONBOARDING' || employee.onboardingStatus === 'NEW_ARRIVAL' || employee.onboardingStatus === 'WAITING_IQAMA' || employee.onboardingStatus === 'WAITING_BANK')\n    .sort((a, b) => String(b.entryDate || b.hireDate || '').localeCompare(String(a.entryDate || a.hireDate || '')))\n    .slice(0, 4);`);
  }

  const lifecycleCardsStart = source.indexOf(`      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">\n        {[\n          { value: iqamaAlerts`);
  const mainKpiMarker = `      {/* 1. Top 4 KPI Cards - Professional Polish */}`;
  const mainKpiIndex = source.indexOf(mainKpiMarker, lifecycleCardsStart >= 0 ? lifecycleCardsStart : 0);

  if (lifecycleCardsStart < 0 || mainKpiIndex < 0) {
    if (!source.includes('data-dashboard-hr-focus')) throw new Error('Dashboard lifecycle summary block boundaries not found');
    return source;
  }

  const compactBlock = `      {(lifecycleAlerts.length > 0 || onboardingEmployees.length > 0) && (\n        <section data-dashboard-hr-focus className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">\n          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">\n            <div>\n              <h3 className="text-sm font-black text-slate-900">{tr('متابعة الموارد البشرية', 'HR attention')}</h3>\n              <p className="mt-0.5 text-[11px] text-slate-500">{tr('ملخص هادئ للحالات التي تحتاج استكمال أو متابعة قريبة', 'A concise view of records needing completion or near-term follow-up')}</p>\n            </div>\n            <button type="button" onClick={() => onNavigate('employees')} className="rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50">{tr('فتح الموظفين', 'Open employees')}</button>\n          </div>\n\n          <div className="grid gap-0 lg:grid-cols-[auto_1fr]">\n            <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-4 sm:grid-cols-4 lg:w-[430px] lg:grid-cols-2 lg:border-b-0 lg:border-e">\n              {[\n                { value: iqamaAlerts, ar: 'إقامات', en: 'Iqamas' },\n                { value: contractAlerts, ar: 'عقود سعوديين', en: 'Saudi contracts' },\n                { value: arrivalAlerts, ar: 'قادمون جدد', en: 'New arrivals' },\n                { value: missingBankAlerts, ar: 'بدون IBAN', en: 'Missing IBAN' },\n              ].map(card => (\n                <button key={card.en} type="button" onClick={() => onNavigate('employees')} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-start transition hover:border-amber-200 hover:bg-amber-50/40">\n                  <span className="text-[11px] font-semibold text-slate-600">{tr(card.ar, card.en)}</span>\n                  <span className={\`min-w-7 rounded-lg px-2 py-1 text-center text-xs font-black \${card.value > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}\`}>{formatNumber(card.value)}</span>\n                </button>\n              ))}\n            </div>\n\n            <div className="grid min-w-0 md:grid-cols-2">\n              <div className="min-w-0 p-4 md:border-e">\n                <div className="mb-2 flex items-center justify-between gap-2">\n                  <span className="text-[11px] font-black text-slate-700">{tr('الأكثر إلحاحًا', 'Highest priority')}</span>\n                  <span className="text-[10px] text-slate-400">{Math.min(topLifecycleAlerts.length, 4)}</span>\n                </div>\n                <div className="space-y-1.5">\n                  {topLifecycleAlerts.slice(0, 4).map(alert => {\n                    const emp = companyEmployees.find(employee => employee.id === alert.employeeId);\n                    const label = alert.type === 'IQAMA_EXPIRY' ? tr('إقامة', 'Iqama') : alert.type === 'SAUDI_CONTRACT_EXPIRY' ? tr('عقد', 'Contract') : alert.type === 'NEW_HIRE_ENTRY_DEADLINE' ? tr('مهلة دخول', 'Entry deadline') : tr('IBAN', 'IBAN');\n                    return (\n                      <button key={alert.type + '-' + alert.employeeId + '-' + (alert.dueDate || 'none')} type="button" onClick={() => emp && onViewEmployeeStatement ? onViewEmployeeStatement(emp) : onNavigate('employees')} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-start hover:bg-slate-50">\n                        <span className="min-w-0 truncate text-[11px] font-semibold text-slate-700">{emp ? (emp.firstNameAr + ' ' + emp.lastNameAr) : alert.employeeName}</span>\n                        <span className="shrink-0 text-[10px] font-bold text-amber-700">{label}{typeof alert.daysRemaining === 'number' ? ' · ' + alert.daysRemaining : ''}</span>\n                      </button>\n                    );\n                  })}\n                  {topLifecycleAlerts.length === 0 && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">{tr('لا توجد تنبيهات عاجلة', 'No urgent alerts')}</div>}\n                </div>\n              </div>\n\n              <div className="min-w-0 border-t border-slate-100 p-4 md:border-t-0">\n                <div className="mb-2 flex items-center justify-between gap-2">\n                  <span className="text-[11px] font-black text-slate-700">{tr('موظفون تحت الاستكمال', 'Onboarding')}</span>\n                  <span className="text-[10px] text-slate-400">{onboardingEmployees.length}</span>\n                </div>\n                <div className="space-y-1.5">\n                  {onboardingEmployees.map(emp => {\n                    const state = emp.onboardingStatus === 'WAITING_IQAMA' || emp.onboardingStatus === 'NEW_ARRIVAL' ? tr('بانتظار الإقامة', 'Waiting for iqama') : emp.onboardingStatus === 'WAITING_BANK' ? tr('بانتظار IBAN', 'Waiting for IBAN') : tr('تحت الاستكمال', 'In progress');\n                    return (\n                      <button key={emp.id} type="button" onClick={() => onViewEmployeeStatement ? onViewEmployeeStatement(emp) : onNavigate('employees')} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-start hover:bg-slate-50">\n                        <span className="min-w-0 truncate text-[11px] font-semibold text-slate-700">{emp.firstNameAr + ' ' + emp.lastNameAr}</span>\n                        <span className="shrink-0 text-[10px] font-bold text-sky-700">{state}</span>\n                      </button>\n                    );\n                  })}\n                  {onboardingEmployees.length === 0 && <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">{tr('لا توجد ملفات جديدة تحت الاستكمال', 'No onboarding records pending')}</div>}\n                </div>\n              </div>\n            </div>\n          </div>\n        </section>\n      )}\n\n`;

  source = source.slice(0, lifecycleCardsStart) + compactBlock + source.slice(mainKpiIndex);
  source = source.replace('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6', 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4');

  return source;
});

patchFile('src/components/LoginView.tsx', (initial) => {
  let source = initial;

  source = source.replace(
    '<main className="masar-login min-h-screen w-full text-slate-100 relative overflow-hidden"',
    '<main className="masar-login min-h-[100dvh] w-full text-slate-100 relative overflow-x-hidden overflow-y-auto"'
  );
  source = source.replace(
    '<div className="relative z-10 mx-auto grid min-h-screen max-w-[1440px] lg:grid-cols-[1.08fr_.92fr]">',
    '<div className="relative z-10 mx-auto grid min-h-[100dvh] w-full max-w-[1440px] lg:grid-cols-[1.08fr_.92fr]">'
  );
  source = source.replace(
    '<section className="relative hidden overflow-hidden border-e border-white/5 px-10 py-12 lg:flex xl:px-20 xl:py-16">',
    '<section className="relative hidden min-w-0 overflow-hidden border-e border-white/5 px-8 py-8 lg:flex xl:px-14 xl:py-12 2xl:px-20 2xl:py-16">'
  );
  source = source.replace(
    '<div className="my-auto max-w-xl py-16">',
    '<div className="my-auto max-w-xl py-8 xl:py-12 2xl:py-16">'
  );
  source = source.replace(
    '<section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-8 lg:px-12 xl:px-20">',
    '<section className="flex min-h-[100dvh] min-w-0 items-center justify-center px-4 py-6 sm:px-8 lg:px-10 xl:px-16 2xl:px-20">'
  );
  source = source.replace(
    '<div className="w-full max-w-[460px]">',
    '<div className="w-full min-w-0 max-w-[460px] py-2 sm:py-4">'
  );
  source = source.replace(
    'className="masar-login-card rounded-[2rem] border border-white/10 bg-slate-900/60 p-6 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:p-9"',
    'className="masar-login-card w-full min-w-0 rounded-[2rem] border border-white/10 bg-slate-900/60 p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:p-8 xl:p-9"'
  );

  return source;
});

patchFile('src/index.css', (initial) => {
  let source = initial;
  const anchor = `.masar-login {\n  min-height: 100dvh;`;
  if (!source.includes(anchor)) throw new Error('Login CSS anchor not found');

  source = source.replace(anchor, `.masar-login {\n  min-height: 100dvh;\n  height: auto;\n  max-width: 100vw;\n  overflow-x: hidden;\n  overflow-y: auto;\n  overscroll-behavior-y: contain;`);

  if (!source.includes('@media (max-height: 760px) and (min-width: 1024px)')) {
    source += `\n\n/* Keep login usable at browser zoom and on short desktop viewports. */\n@media (max-height: 760px) and (min-width: 1024px) {\n  .masar-login .masar-login-card {\n    margin-block: 1rem;\n  }\n  .masar-login .masar-currency-stage {\n    opacity: .58;\n  }\n}\n\n@media (max-height: 620px) {\n  .masar-login {\n    align-items: flex-start;\n  }\n}\n`;
  }
  return source;
});

console.log('Dashboard density and responsive login layout applied.');
