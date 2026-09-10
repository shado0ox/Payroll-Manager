import React from 'react';
import { AlertCircle, CheckCircle2, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import type { Company, CompanyBankDefinition } from '../../types';
import {
  detectBankFromIBAN,
  getBankDefinitions,
  getSwiftCodeFromBankName,
  validateSaudiIBAN,
  validateSwiftCode,
} from '../../utils/security';

interface CompanyBankingTabProps {
  formData: Company;
  activeBankDefinitions: CompanyBankDefinition[];
  language: 'ar' | 'en';
  setFormData: React.Dispatch<React.SetStateAction<Company>>;
  onSave: () => void;
  tr: (ar: string, en: string) => string;
}

export const CompanyBankingTab = React.memo<CompanyBankingTabProps>(({
  formData,
  activeBankDefinitions,
  language,
  setFormData,
  onSave,
  tr,
}) => (
<div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
    <div>
      <h3 className="text-sm font-bold text-slate-900">{tr('الحساب البنكي وبيانات نظام حماية الأجور (WPS)', 'Bank account and Wage Protection System (WPS)')}</h3>
      <p className="text-xs text-slate-500">{tr('الحساب البنكي المعتمد لصرف رواتب المنشأة ورموز السويفت (SWIFT/BIC)', 'Approved payroll account and SWIFT/BIC settings')}</p>
    </div>
    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
      {tr('معتمد من البنك المركزي السعودي (SAMA)', 'SAMA compliant')}
    </span>
  </div>

  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 overflow-hidden">
    <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-200">
      <div><h4 className="text-sm font-black text-slate-900">{tr('تعريفات البنوك وSWIFT للموظفين', 'Employee bank and SWIFT definitions')}</h4><p className="text-[11px] text-slate-600 mt-1">{tr('يُحدد البنك تلقائيًا من الرقمين الخامس والسادس في IBAN ويُطبّق SWIFT هنا على كل موظفي البنك.', 'The bank is detected from IBAN digits 5–6, and its SWIFT code is applied to every employee using that bank.')}</p></div>
      <button type="button" onClick={() => setFormData({ ...formData, bankDefinitions: [...(formData.bankDefinitions || []), { ibanBankCode: '', nameAr: '', nameEn: '', swiftCode: '', isActive: true }] })} className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> {tr('إضافة بنك', 'Add bank')}</button>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-xs">
        <thead className="bg-white/80 text-slate-600"><tr><th className="p-2 text-start">{tr('كود IBAN', 'IBAN code')}</th><th className="p-2 text-start">{tr('اسم البنك بالعربي', 'Arabic bank name')}</th><th className="p-2 text-start">{tr('الاسم بالإنجليزي', 'English name')}</th><th className="p-2 text-start">SWIFT / BIC</th><th className="p-2 text-center">{tr('نشط', 'Active')}</th><th className="p-2"></th></tr></thead>
        <tbody className="divide-y divide-emerald-100">
          {(formData.bankDefinitions || []).map((bank, index) => {
            const updateBank = (changes: Partial<CompanyBankDefinition>) => setFormData({ ...formData, bankDefinitions: (formData.bankDefinitions || []).map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item) });
            return <tr key={`${bank.ibanBankCode}-${index}`} className="bg-white/60">
              <td className="p-2"><input value={bank.ibanBankCode} onChange={event => updateBank({ ibanBankCode: event.target.value.replace(/\D/g, '').slice(0, 2) })} className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg font-mono text-center" placeholder="80" /></td>
              <td className="p-2"><input value={bank.nameAr} onChange={event => updateBank({ nameAr: event.target.value })} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg" /></td>
              <td className="p-2"><input value={bank.nameEn} onChange={event => updateBank({ nameEn: event.target.value })} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg" dir="ltr" /></td>
              <td className="p-2"><input value={bank.swiftCode} onChange={event => updateBank({ swiftCode: event.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 11) })} className="w-36 px-2 py-1.5 border border-slate-200 rounded-lg font-mono" dir="ltr" /></td>
              <td className="p-2 text-center"><input type="checkbox" checked={bank.isActive !== false} onChange={event => updateBank({ isActive: event.target.checked })} className="accent-emerald-600" /></td>
              <td className="p-2 text-center"><button type="button" onClick={() => setFormData({ ...formData, bankDefinitions: (formData.bankDefinitions || []).filter((_, itemIndex) => itemIndex !== index) })} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title={tr('حذف تعريف البنك', 'Delete bank definition')}><Trash2 className="w-4 h-4" /></button></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </div>

  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
    {/* Bank Name */}
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-bold text-slate-700">{tr('بنك صرف الرواتب للمنشأة *', 'Company payroll bank *')}</label>
        <span className="text-[10px] text-slate-400">{tr('قائمة البنوك السعودية', 'Saudi banks')}</span>
      </div>
      <select
        value={formData.bankCode || detectBankFromIBAN(formData.bankIban || '', formData.bankDefinitions)?.code || getBankDefinitions(formData.bankDefinitions).find(bank => bank.nameAr === formData.bankName || bank.nameEn === formData.bankName)?.ibanBankCode || ''}
        onChange={(e) => {
          const selectedBank = getBankDefinitions(formData.bankDefinitions).find(bank => bank.ibanBankCode === e.target.value);
          setFormData({ 
            ...formData, 
            bankCode: selectedBank?.ibanBankCode || '',
            bankName: selectedBank?.nameAr || '',
            bankSwiftCode: selectedBank?.swiftCode || formData.bankSwiftCode || ''
          });
        }}
        className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 font-semibold text-slate-900"
      >
        <option value="">{tr('-- اختر البنك --', '-- Select bank --')}</option>
        {activeBankDefinitions.map(b => (
          <option key={b.ibanBankCode} value={b.ibanBankCode}>
            {language === 'en' ? b.nameEn || b.nameAr : b.nameAr} ({b.swiftCode})
          </option>
        ))}
      </select>
    </div>

    {/* IBAN */}
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-bold text-slate-700">{tr('رقم الآيبان البنكي للمنشأة (IBAN) *', 'Company IBAN *')}</label>
        {formData.bankIban && (
          validateSaudiIBAN(formData.bankIban) ? (
            <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
              <CheckCircle2 className="w-3 h-3" /> {tr('آيبان صحيح', 'Valid IBAN')}
            </span>
          ) : (
            <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-0.5">
              <AlertCircle className="w-3 h-3" /> {tr('24 خانة تبدأ بـ SA', '24 characters starting with SA')}
            </span>
          )
        )}
      </div>
      <input
        type="text"
        required
        value={formData.bankIban || ''}
        onChange={(e) => {
          const cleanIban = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
          const detected = detectBankFromIBAN(cleanIban, formData.bankDefinitions);
          setFormData({ 
            ...formData, 
            bankIban: cleanIban,
            bankCode: detected?.code || formData.bankCode,
            bankName: detected ? detected.nameAr : formData.bankName,
            bankSwiftCode: detected ? detected.swiftCode : formData.bankSwiftCode
          });
        }}
        className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900 tracking-wider"
        placeholder="SA4480000XXXXXXXXXXXXXXXX"
        dir="ltr"
      />
    </div>

    {/* SWIFT / BIC */}
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-bold text-slate-700">{tr('رمز السويفت (SWIFT / BIC Code)', 'SWIFT / BIC code')}</label>
        <button
          type="button"
          onClick={() => {
            let code = '';
            if (formData.bankIban) {
              const det = detectBankFromIBAN(formData.bankIban, formData.bankDefinitions);
              if (det) code = det.swiftCode;
            }
            if (!code && formData.bankName) {
              code = getSwiftCodeFromBankName(formData.bankName, formData.bankDefinitions);
            }
            if (code) {
              setFormData({ ...formData, bankSwiftCode: code });
            } else {
              alert(tr('يرجى تحديد البنك أو إدخال رقم الآيبان لتوليد رمز السويفت', 'Select a bank or enter an IBAN to generate the SWIFT code.'));
            }
          }}
          className="text-[10px] text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-0.5 cursor-pointer"
        >
          <Sparkles className="w-2.5 h-2.5" />
          <span>{tr('توليد تلقائي', 'Auto-generate')}</span>
        </button>
      </div>
      <input
        type="text"
        value={formData.bankSwiftCode || ''}
        onChange={(e) => setFormData({ ...formData, bankSwiftCode: e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() })}
        className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900 uppercase"
        placeholder="RJHISARI"
        dir="ltr"
        maxLength={11}
      />
      <div className="mt-1 flex items-center justify-between text-[10px]">
        {formData.bankSwiftCode ? (
          validateSwiftCode(formData.bankSwiftCode) ? (
            <span className="text-emerald-700 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5" /> {tr('معتمد قياسياً (ISO 9362)', 'Valid ISO 9362 code')}
            </span>
          ) : (
            <span className="text-amber-600 font-semibold flex items-center gap-1">
              <AlertCircle className="w-2.5 h-2.5" /> {tr('التنسيق القياسي: 8 إلى 11 حرفاً', 'Standard format: 8–11 characters')}
            </span>
          )
        ) : (
          <span className="text-slate-400">{tr('يتولد تلقائياً من رقم الآيبان', 'Generated automatically from the IBAN')}</span>
        )}
        <span className="text-slate-400 font-mono">{(formData.bankSwiftCode || '').length}/11</span>
      </div>
    </div>

    {[
      ['bankCustomerCode', tr('اسم العميل / كود العميل لدى البنك', 'Bank customer name / code'), tr('مثال: P0030694', 'Example: P0030694')],
      ['bankAgreementCode', tr('رمز اتفاقية الرواتب', 'Payroll agreement code'), tr('مثال: P0030694', 'Example: P0030694')],
      ['bankFundingAccount', tr('حساب التمويل', 'Funding account'), tr('رقم حساب تمويل الرواتب', 'Payroll funding account number')],
      ['bankBranchCode', tr('رقم فرع البنك', 'Bank branch number'), tr('مثال: 326', 'Example: 326')],
      ['laborOfficeEstablishmentNo', tr('رقم المنشأة في مكتب العمل', 'Labor Office establishment number'), tr('مثال: 4-2005115', 'Example: 4-2005115')],
      ['chamberOfCommerceNo', tr('رقم المنشأة في الغرفة التجارية', 'Chamber of Commerce number'), tr('رقم العضوية/المنشأة', 'Membership / establishment number')],
      ['bankPayrollCode', tr('رمز البنك المختصر في ملف الرواتب', 'Payroll file bank code'), tr('مثال: RIBL', 'Example: RIBL')],
    ].map(([field, label, placeholder]) => (
      <div key={field}>
        <label className="block text-xs font-bold text-slate-700 mb-1">{label}</label>
        <input
          type="text"
          value={(formData[field as keyof Company] as string) || ''}
          onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
          className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono"
          placeholder={placeholder}
          dir="ltr"
        />
      </div>
    ))}

    {/* Payroll Cut-off Day */}
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">{tr('يوم إقفال مسير الرواتب الشهري (Cut-off Day)', 'Monthly payroll cut-off day')}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={31}
          value={formData.payrollCutoffDay}
          onChange={(e) => setFormData({ ...formData, payrollCutoffDay: parseInt(e.target.value, 10) || 25 })}
          className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
        />
        <span className="text-xs text-slate-500 font-medium whitespace-nowrap">{tr('من كل شهر ميلادي', 'of each month')}</span>
      </div>
    </div>

    {/* Payroll Payment Day */}
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">{tr('يوم تحويل وصرف الرواتب (Payment Day)', 'Payroll payment day')}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={31}
          value={formData.payrollPaymentDay}
          onChange={(e) => setFormData({ ...formData, payrollPaymentDay: parseInt(e.target.value, 10) || 27 })}
          className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
        />
        <span className="text-xs text-slate-500 font-medium whitespace-nowrap">{tr('من كل شهر ميلادي', 'of each month')}</span>
      </div>
    </div>

    {/* Work days per month */}
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">{tr('أيام العمل المعيارية شهرياً لحساب أجر اليوم', 'Standard monthly workdays for daily-rate calculation')}</label>
      <select
        value={formData.workDaysPerMonth}
        onChange={(e) => setFormData({ ...formData, workDaysPerMonth: parseInt(e.target.value, 10) || 30 })}
        className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-semibold text-slate-900"
      >
        <option value={30}>{tr('30 يوماً (المعيار الشائع لنظام العمل السعودي)', '30 days (common Saudi Labor Law basis)')}</option>
        <option value={26}>{tr('26 يوماً (خصم يوم الراحة الأسبوعية)', '26 days (excluding weekly rest days)')}</option>
        <option value={22}>{tr('22 يوماً (الدوام 5 أيام أسبوعياً)', '22 days (five-day workweek)')}</option>
      </select>
    </div>
  </div>

  <div className="flex justify-end pt-3">
    <button
      type="button"
      onClick={onSave}
      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-2"
    >
      <Save className="w-4 h-4" />
      <span>{tr('حفظ الإعدادات البنكية ومسيرات الرواتب', 'Save banking and payroll settings')}</span>
    </button>
  </div>
</div>
));
