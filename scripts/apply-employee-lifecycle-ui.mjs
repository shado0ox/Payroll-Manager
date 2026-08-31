import fs from 'node:fs';

function patchFile(path, transform) {
  const source = fs.readFileSync(path, 'utf8');
  const next = transform(source);
  if (next !== source) fs.writeFileSync(path, next);
}

patchFile('src/components/EmployeesView.tsx', (initial) => {
  let source = initial;

  source = source.replace(
    `    prorateFirstMonth: false,\n    status: 'ACTIVE',\n    bankName: 'مصرف الراجحي',`,
    `    prorateFirstMonth: false,\n    entryDate: '',\n    entryNumber: '',\n    iqamaNumber: '',\n    iqamaIssueStatus: 'PENDING',\n    iqamaExpiryDate: '',\n    contractStartDate: '',\n    contractEndDate: '',\n    bankAccountStatus: 'PENDING',\n    onboardingStatus: 'COMPLETE',\n    status: 'ACTIVE',\n    bankName: 'مصرف الراجحي',`
  );

  const secondAnchor = `      prorateFirstMonth: false,\n      status: 'ACTIVE',\n      bankName: 'مصرف الراجحي',`;
  if (!source.includes(secondAnchor)) throw new Error('Employee add defaults anchor not found');
  source = source.replace(secondAnchor,
    `      prorateFirstMonth: false,\n      entryDate: '',\n      entryNumber: '',\n      iqamaNumber: '',\n      iqamaIssueStatus: 'PENDING',\n      iqamaExpiryDate: '',\n      contractStartDate: '',\n      contractEndDate: '',\n      bankAccountStatus: 'PENDING',\n      onboardingStatus: 'COMPLETE',\n      status: 'ACTIVE',\n      bankName: 'مصرف الراجحي',`
  );

  const submitAnchor = `    // Standardize SWIFT code uppercase\n    const processedForm = {`;
  if (!source.includes(submitAnchor)) throw new Error('Employee submit anchor not found');
  source = source.replace(submitAnchor, `    if (formData.nationality === 'NON_SAUDI') {\n      if (!formData.iqamaExpiryDate && !formData.entryDate) {\n        alert(language === 'ar' ? 'أدخل تاريخ انتهاء الإقامة أو تاريخ الدخول للقادم الجديد' : 'Enter the iqama expiry date or the new arrival entry date');\n        return;\n      }\n      if (!formData.iqamaExpiryDate && !formData.entryNumber) {\n        alert(language === 'ar' ? 'رقم الدخول مطلوب للقادم الجديد قبل إصدار الإقامة' : 'Entry number is required before iqama issuance');\n        return;\n      }\n    }\n    if (formData.nationality === 'SAUDI' && !formData.contractEndDate) {\n      alert(language === 'ar' ? 'تاريخ انتهاء العقد مطلوب للموظف السعودي' : 'Contract end date is required for Saudi employees');\n      return;\n    }\n\n    const hasBankAccount = Boolean((formData.bankIban || '').replace(/\\s/g, ''));\n    const hasIqama = formData.nationality !== 'NON_SAUDI' || Boolean(formData.iqamaExpiryDate);\n    const derivedOnboardingStatus = formData.nationality === 'NON_SAUDI' && !hasIqama\n      ? 'WAITING_IQAMA' as const\n      : !hasBankAccount ? 'WAITING_BANK' as const : 'COMPLETE' as const;\n\n    // Standardize SWIFT code uppercase\n    const processedForm = {`);

  const processedAnchor = `      ...formData,\n      employmentEndReason:`;
  if (!source.includes(processedAnchor)) throw new Error('Processed form anchor not found');
  source = source.replace(processedAnchor, `      ...formData,\n      iqamaIssueStatus: formData.nationality === 'NON_SAUDI' && hasIqama ? 'ISSUED' as const : 'PENDING' as const,\n      bankAccountStatus: hasBankAccount ? 'READY' as const : 'PENDING' as const,\n      onboardingStatus: derivedOnboardingStatus,\n      status: derivedOnboardingStatus === 'WAITING_IQAMA' ? 'ONBOARDING' as const : (formData.status || 'ACTIVE'),\n      employmentEndReason:`);

  const formMarker = `              {/* Salary Start Date */}`;
  if (!source.includes(formMarker)) throw new Error('Employee form lifecycle insertion anchor not found');
  source = source.replace(formMarker, `              <div className="md:col-span-2 rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-4">\n                <div>\n                  <h4 className="font-bold text-slate-800">{language === 'ar' ? 'متابعة العقد والإقامة والقادمين الجدد' : 'Contract, iqama & new-arrival tracking'}</h4>\n                  <p className="text-xs text-slate-500 mt-1">{language === 'ar' ? 'القادم الجديد يمكن تسجيله قبل إصدار الإقامة أو الحساب البنكي، ويبدأ استحقاق الراتب من تاريخ بداية الراتب.' : 'A new arrival can be registered before iqama or bank issuance; salary accrual starts from the salary start date.'}</p>\n                </div>\n                {formData.nationality === 'NON_SAUDI' ? (\n                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">\n                    <div><label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'تاريخ الدخول للمملكة' : 'Entry date'}</label><input type="date" value={formData.entryDate || ''} onChange={e => setFormData({...formData, entryDate: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>\n                    <div><label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'رقم الدخول / الحدود' : 'Entry / border number'}</label><input value={formData.entryNumber || ''} onChange={e => setFormData({...formData, entryNumber: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>\n                    <div><label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'رقم الإقامة' : 'Iqama number'}</label><input value={formData.iqamaNumber || ''} onChange={e => setFormData({...formData, iqamaNumber: e.target.value, nationalIdOrIqama: e.target.value || formData.nationalIdOrIqama})} className="w-full px-3 py-2 border rounded-lg" /></div>\n                    <div><label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'تاريخ انتهاء الإقامة' : 'Iqama expiry date'}</label><input type="date" value={formData.iqamaExpiryDate || ''} onChange={e => setFormData({...formData, iqamaExpiryDate: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>\n                  </div>\n                ) : (\n                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">\n                    <div><label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'تاريخ بداية العقد' : 'Contract start date'}</label><input type="date" value={formData.contractStartDate || ''} onChange={e => setFormData({...formData, contractStartDate: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>\n                    <div><label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'تاريخ انتهاء العقد' : 'Contract end date'}</label><input type="date" value={formData.contractEndDate || ''} onChange={e => setFormData({...formData, contractEndDate: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>\n                  </div>\n                )}\n                <div className="flex flex-wrap gap-2 text-xs">\n                  {formData.nationality === 'NON_SAUDI' && !formData.iqamaExpiryDate && <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-800">{language === 'ar' ? 'بانتظار الإقامة' : 'Waiting for iqama'}</span>}\n                  {!formData.bankIban && <span className="px-2 py-1 rounded-full bg-sky-100 text-sky-800">{language === 'ar' ? 'بانتظار الحساب البنكي' : 'Waiting for bank account'}</span>}\n                </div>\n              </div>\n\n              {/* Salary Start Date */}`);

  return source;
});

patchFile('src/components/DashboardView.tsx', (initial) => {
  let source = initial;
  const importAnchor = `import { useLanguage } from '../i18n/LanguageContext';`;
  if (!source.includes(importAnchor)) throw new Error('Dashboard import anchor not found');
  source = source.replace(importAnchor, `${importAnchor}\nimport { getEmployeeLifecycleAlerts } from '../utils/employeeLifecycle';`);

  const employeeAnchor = `  const companyEmployees = employees.filter(e => e.companyId === company.id);`;
  if (!source.includes(employeeAnchor)) throw new Error('Dashboard employees anchor not found');
  source = source.replace(employeeAnchor, `${employeeAnchor}\n  const lifecycleAlerts = useMemo(() => getEmployeeLifecycleAlerts(companyEmployees), [companyEmployees]);\n  const iqamaAlerts = lifecycleAlerts.filter(a => a.type === 'IQAMA_EXPIRY').length;\n  const contractAlerts = lifecycleAlerts.filter(a => a.type === 'SAUDI_CONTRACT_EXPIRY').length;\n  const arrivalAlerts = lifecycleAlerts.filter(a => a.type === 'NEW_HIRE_ENTRY_DEADLINE').length;\n  const missingBankAlerts = lifecycleAlerts.filter(a => a.type === 'MISSING_BANK_ACCOUNT').length;`);

  const kpiAnchor = `      {/* 1. Top 4 KPI Cards - Professional Polish */}`;
  if (!source.includes(kpiAnchor)) throw new Error('Dashboard KPI anchor not found');
  source = source.replace(kpiAnchor, `      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">\n        {[\n          { value: iqamaAlerts, ar: 'إقامات ≤ 30 يوم', en: 'Iqamas ≤ 30 days' },\n          { value: contractAlerts, ar: 'عقود سعوديين ≤ 60 يوم', en: 'Saudi contracts ≤ 60 days' },\n          { value: arrivalAlerts, ar: 'قادمون جدد - تنبيه المهلة', en: 'New arrivals - deadline alert' },\n          { value: missingBankAlerts, ar: 'بدون حساب بنكي', en: 'Missing bank account' },\n        ].map(card => (\n          <button key={card.en} type="button" onClick={() => onNavigate('employees')} className="text-start bg-white p-4 rounded-xl border border-amber-200 shadow-xs hover:border-amber-400 transition-all">\n            <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-slate-600">{tr(card.ar, card.en)}</span><AlertTriangle className="w-4 h-4 text-amber-500" /></div>\n            <div className="text-2xl font-black text-slate-900 mt-2">{formatNumber(card.value)}</div>\n          </button>\n        ))}\n      </section>\n\n      {/* 1. Top 4 KPI Cards - Professional Polish */}`);
  return source;
});

console.log('Employee lifecycle UI and dashboard counters applied.');
