import React from 'react';
import { Save } from 'lucide-react';
import type { Company } from '../../types';

interface CompanyAccountsTabProps {
  formData: Company;
  setFormData: React.Dispatch<React.SetStateAction<Company>>;
  onSave: () => void;
  tr: (ar: string, en: string) => string;
}

export const CompanyAccountsTab = React.memo<CompanyAccountsTabProps>(({ formData, setFormData, onSave, tr }) => (
<div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
    <div>
      <h3 className="text-sm font-bold text-slate-900">{tr('ربط شجرة الحسابات المحاسبية لقيود الرواتب', 'Payroll Chart of Accounts Mapping')}</h3>
      <p className="text-xs text-slate-500">{tr('أرقام الحسابات في النظام المحاسبي (تكامل برنامج قيود والأنظمة المحاسبية)', 'Map payroll accounts for Qoyod and other accounting integrations')}</p>
    </div>
    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
      {tr('متوافق مع معايير المحاسبة الدولية IFRS', 'IFRS-ready mapping')}
    </span>
  </div>

  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {Object.entries({
      salariesExpenseAccount: tr('حساب مصروف الرواتب الأساسية', 'Basic salaries expense account'),
      housingAllowanceAccount: tr('حساب مصروف بدل السكن', 'Housing allowance expense account'),
      transportAllowanceAccount: tr('حساب مصروف بدل النقل', 'Transport allowance expense account'),
      overtimeExpenseAccount: tr('حساب مصروف العمل الإضافي', 'Overtime expense account'),
      otherAllowancesExpenseAccount: tr('حساب مصروف البدلات الأخرى', 'Other allowances expense account'),
      gosiEmployerExpenseAccount: tr('حساب مصروف مساهمة المنشأة في التأمينات', 'Employer GOSI expense account'),
      salariesPayableAccount: tr('حساب الرواتب المستحقة (التزامات)', 'Salaries payable account'),
      gosiPayableAccount: tr('حساب التأمينات الاجتماعية المستحقة', 'GOSI payable account'),
      employeeAdvancesAccount: tr('حساب سلف الموظفين (أصول متداولة)', 'Employee advances account'),
      penaltiesPayableAccount: tr('حساب الجزاءات والخصومات', 'Penalties and deductions account'),
      bankAccount: tr('حساب البنك / النقدية للصرف', 'Payroll bank / cash account'),
    }).map(([key, label]) => (
      <div key={key}>
        <label className="block text-xs font-bold text-slate-700 mb-1">{label}</label>
        <input
          type="text"
          value={(formData.chartOfAccounts as any)?.[key] || ''}
          onChange={(e) => setFormData({
            ...formData,
            chartOfAccounts: {
              ...formData.chartOfAccounts!,
              [key]: e.target.value
            }
          })}
          className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
        />
      </div>
    ))}
  </div>

  <div className="flex justify-end pt-3">
    <button
      type="button"
      onClick={onSave}
      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-2"
    >
      <Save className="w-4 h-4" />
      <span>{tr('حفظ دليل الحسابات', 'Save account mapping')}</span>
    </button>
  </div>
</div>
));

