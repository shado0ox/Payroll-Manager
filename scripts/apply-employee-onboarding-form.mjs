import fs from 'node:fs';

const path = 'src/components/EmployeesView.tsx';
let source = fs.readFileSync(path, 'utf8');

// Never prefill production employee records with fabricated identity/contact/bank data.
source = source.replace("    bankName: 'مصرف الراجحي',\n    bankIban: 'SA',\n    bankSwiftCode: 'RJHISARI',", "    bankName: '',\n    bankIban: '',\n    bankSwiftCode: '',");

const addFnAnchor = `  const handleOpenAdd = () => {\n    const nextNum = companyEmployees.length + 1;`;
if (!source.includes(addFnAnchor) && !source.includes('const today = new Date().toISOString().slice(0, 10);')) {
  throw new Error('Employee add function anchor not found');
}
source = source.replace(addFnAnchor, `  const handleOpenAdd = () => {\n    const nextNum = companyEmployees.length + 1;\n    const today = new Date().toISOString().slice(0, 10);`);

source = source.replace("      nationalIdOrIqama: '10' + Math.floor(10000000 + Math.random() * 90000000),", "      nationalIdOrIqama: '',");
source = source.replace("      email: `emp${nextNum}@advtech.sa`,", "      email: '',");
source = source.replace("      phone: '05' + Math.floor(10000000 + Math.random() * 90000000),", "      phone: '',");
source = source.replace("      hireDate: '2026-01-01',\n      salaryStartDate: '2026-01-01',", "      hireDate: today,\n      salaryStartDate: today,");
source = source.replace("      bankName: 'مصرف الراجحي',\n      bankIban: 'SA4480000' + Math.floor(100000000000 + Math.random() * 900000000000),\n      bankSwiftCode: 'RJHISARI',", "      bankName: '',\n      bankIban: '',\n      bankSwiftCode: '',");

// The previous lifecycle transform inserts this line. Treat only a valid Saudi IBAN as bank-ready.
const weakBankCheck = `    const hasBankAccount = Boolean((formData.bankIban || '').replace(/\\s/g, ''));`;
const strongBankCheck = `    const hasBankAccount = validateSaudiIBAN(String(formData.bankIban || '').replace(/\\s/g, '').toUpperCase());`;
if (!source.includes(weakBankCheck) && !source.includes(strongBankCheck)) throw new Error('Lifecycle bank readiness anchor not found');
source = source.replace(weakBankCheck, strongBankCheck);

source = source.replace(
  `      status: derivedOnboardingStatus === 'WAITING_IQAMA' ? 'ONBOARDING' as const : (formData.status || 'ACTIVE'),`,
  `      nationalIdOrIqama: formData.nationality === 'NON_SAUDI' && formData.iqamaNumber?.trim() ? formData.iqamaNumber.trim() : (formData.nationalIdOrIqama || ''),\n      status: derivedOnboardingStatus !== 'COMPLETE' ? 'ONBOARDING' as const : (formData.status === 'ONBOARDING' ? 'ACTIVE' as const : (formData.status || 'ACTIVE')),`
);

const ibanAnchor = `                  {/* IBAN */}`;
if (!source.includes(ibanAnchor) && !source.includes('Employee lifecycle & onboarding')) throw new Error('Employee form IBAN anchor not found');
if (!source.includes('Employee lifecycle & onboarding')) {
  const lifecycleFields = `                  {/* Employee lifecycle & onboarding */}\n                  <div className="sm:col-span-2 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">\n                    <div className="flex items-center justify-between gap-3">\n                      <div>\n                        <div className="text-xs font-black text-slate-900">{language === 'ar' ? 'متابعة الموظف والمستندات' : 'Employee lifecycle & onboarding'}</div>\n                        <div className="text-[10px] text-slate-500 mt-0.5">{language === 'ar' ? 'الإقامة، القادمين الجدد، عقود السعوديين وجاهزية الحساب البنكي' : 'Iqama, new arrivals, Saudi contracts and bank readiness'}</div>\n                      </div>\n                      <span className="px-2 py-1 rounded-lg border border-amber-200 bg-white text-[10px] font-bold text-amber-800">\n                        {formData.onboardingStatus === 'WAITING_IQAMA' ? (language === 'ar' ? 'بانتظار الإقامة' : 'Waiting for iqama') : formData.onboardingStatus === 'WAITING_BANK' ? (language === 'ar' ? 'بانتظار البنك' : 'Waiting for bank') : (language === 'ar' ? 'مكتمل' : 'Complete')}\n                      </span>\n                    </div>\n\n                    {formData.nationality === 'NON_SAUDI' ? (\n                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">\n                        <div><label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'تاريخ الدخول' : 'Entry date'}</label><input type="date" value={formData.entryDate || ''} onChange={e => setFormData({ ...formData, entryDate: e.target.value })} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs" /></div>\n                        <div><label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'رقم الدخول' : 'Entry number'}</label><input value={formData.entryNumber || ''} onChange={e => setFormData({ ...formData, entryNumber: e.target.value })} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs" /></div>\n                        <div><label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'رقم الإقامة' : 'Iqama number'}</label><input value={formData.iqamaNumber || ''} onChange={e => setFormData({ ...formData, iqamaNumber: e.target.value, nationalIdOrIqama: e.target.value || formData.nationalIdOrIqama })} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs" /></div>\n                        <div><label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'تاريخ انتهاء الإقامة' : 'Iqama expiry date'}</label><input type="date" value={formData.iqamaExpiryDate || ''} onChange={e => setFormData({ ...formData, iqamaExpiryDate: e.target.value, iqamaIssueStatus: e.target.value ? 'ISSUED' : 'PENDING' })} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs" /></div>\n                      </div>\n                    ) : (\n                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">\n                        <div><label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'بداية عقد السعودي' : 'Saudi contract start'}</label><input type="date" value={formData.contractStartDate || ''} onChange={e => setFormData({ ...formData, contractStartDate: e.target.value })} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs" /></div>\n                        <div><label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'نهاية عقد السعودي *' : 'Saudi contract end *'}</label><input type="date" value={formData.contractEndDate || ''} onChange={e => setFormData({ ...formData, contractEndDate: e.target.value })} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs" /></div>\n                      </div>\n                    )}\n\n                    <div className="flex flex-wrap items-center gap-2 text-[10px]">\n                      <span className={\`px-2 py-1 rounded-lg border font-bold ${validateSaudiIBAN(String(formData.bankIban || '').replace(/\\s/g, '').toUpperCase()) ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}\`}>\n                        {validateSaudiIBAN(String(formData.bankIban || '').replace(/\\s/g, '').toUpperCase()) ? (language === 'ar' ? 'الحساب البنكي جاهز' : 'Bank account ready') : (language === 'ar' ? 'الراتب سيظل مستحقًا ومعلقًا حتى اكتمال IBAN' : 'Salary remains accrued and held until IBAN is ready')}\n                      </span>\n                    </div>\n                  </div>\n\n`;
  source = source.replace(ibanAnchor, lifecycleFields + ibanAnchor);
}

fs.writeFileSync(path, source);
console.log('Employee onboarding form and safe real-data defaults applied.');
