import React from 'react';
import { Save } from 'lucide-react';
import type { Company } from '../../types';

interface CompanyPayrollPoliciesTabProps {
  formData: Company;
  setFormData: React.Dispatch<React.SetStateAction<Company>>;
  onSave: () => void;
  tr: (ar: string, en: string) => string;
}

export const CompanyPayrollPoliciesTab = React.memo<CompanyPayrollPoliciesTabProps>(({
  formData,
  setFormData,
  onSave,
  tr,
}) => (
<div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
    <div>
      <h3 className="text-sm font-bold text-slate-900">{tr('قواعد احتساب الرواتب ونسب التأمينات الاجتماعية (GOSI)', 'Payroll Calculation Rules and GOSI Rates')}</h3>
      <p className="text-xs text-slate-500">{tr('ضبط معادلات الخصومات، البدلات، الإضافي، وسقف اشتراك التأمينات للمواطنين والمقيمين', 'Configure deductions, allowances, overtime and GOSI contribution limits')}</p>
    </div>
    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
      {tr('متوافق مع التعديلات المعتمدة للمؤسسة العامة للتأمينات الاجتماعية', 'Supports current GOSI contribution settings')}
    </span>
  </div>

  <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
    <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] items-center gap-4">
      <div>
        <h4 className="text-sm font-black text-slate-900">{tr('الميزانية الشهرية المتوقعة للرواتب', 'Expected Monthly Payroll Budget')}</h4>
        <p className="text-[11px] text-slate-600 mt-1">{tr('تُستخدم في لوحة التحكم لمقارنة الميزانية المحددة بالمسير الفعلي لأحدث فترة. اتركها صفراً إذا لم تعتمد ميزانية بعد.', 'Used by the dashboard to compare the configured budget with the latest actual payroll. Leave it at zero if no budget has been approved.')}</p>
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">{tr('سقف الميزانية الشهرية (SR)', 'Monthly budget limit (SR)')}</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={formData.monthlyBudgetCap ?? 0}
          onChange={(e) => setFormData({ ...formData, monthlyBudgetCap: Math.max(0, Number(e.target.value) || 0) })}
          className="w-full px-3.5 py-2.5 text-sm bg-white border border-indigo-200 rounded-xl focus:border-indigo-500 font-mono font-bold text-slate-900"
          dir="ltr"
        />
      </div>
    </div>
  </div>

  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
    {/* Daily Rate Formula */}
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">{tr('أساس حساب أجر اليوم والغياب', 'Daily wage and absence calculation basis')}</label>
      <select
        value={formData.calculationRules?.dailyRateFormula || 'BASE_PLUS_FIXED'}
        onChange={(e) => setFormData({
          ...formData,
          calculationRules: {
            ...formData.calculationRules!,
            dailyRateFormula: e.target.value as any
          }
        })}
        className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-semibold text-slate-900"
      >
        <option value="BASE_PLUS_FIXED">{tr('الراتب الأساسي + البدلات الثابتة (شائع في نظام العمل)', 'Basic salary + fixed allowances')}</option>
        <option value="BASE_PLUS_HOUSING">{tr('الراتب الأساسي + بدل السكن فقط', 'Basic salary + housing allowance only')}</option>
        <option value="BASE_ONLY">{tr('الراتب الأساسي فقط', 'Basic salary only')}</option>
      </select>
    </div>

    {/* Monthly Working Days */}
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">{tr('أيام العمل الشهرية المعتمدة للحساب', 'Monthly workdays used in calculations')}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="1"
          min="20"
          max="31"
          value={formData.workDaysPerMonth || 30}
          onChange={(e) => setFormData({
            ...formData,
            workDaysPerMonth: parseInt(e.target.value) || 30,
            calculationRules: {
              ...formData.calculationRules!,
              workDaysDivisor: parseInt(e.target.value) || 30
            }
          })}
          className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
        />
        <span className="text-xs font-bold text-slate-600">{tr('يوم / شهر', 'days / month')}</span>
      </div>
    </div>

    {/* Daily Working Hours */}
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">{tr('ساعات العمل اليومية الرسمية', 'Official daily working hours')}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.5"
          min="4"
          max="12"
          value={formData.workHoursPerDay || 8}
          onChange={(e) => setFormData({
            ...formData,
            workHoursPerDay: parseFloat(e.target.value) || 8,
            calculationRules: {
              ...formData.calculationRules!,
              hourlyRateDivisor: parseFloat(e.target.value) || 8
            }
          })}
          className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
        />
        <span className="text-xs font-bold text-slate-600">{tr('ساعة / يوم', 'hours / day')}</span>
      </div>
    </div>

    {/* Delay Grace Period */}
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">{tr('فترة السماح للتأخير قبل بدء الخصم', 'Late-arrival grace period before deduction')}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="1"
          min="0"
          max="60"
          value={formData.calculationRules?.delayGracePeriodMinutes ?? 15}
          onChange={(e) => setFormData({
            ...formData,
            calculationRules: {
              ...formData.calculationRules!,
              delayGracePeriodMinutes: parseInt(e.target.value) || 0
            }
          })}
          className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
        />
        <span className="text-xs font-bold text-slate-600">{tr('دقيقة', 'minutes')}</span>
      </div>
    </div>

    {/* Absence Day Multiplier */}
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">{tr('مضاعف خصم يوم الغياب بدون إذن', 'Unauthorized absence deduction multiplier')}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.25"
          min="1"
          max="3"
          value={formData.calculationRules?.absenceDayMultiplier || 1.0}
          onChange={(e) => setFormData({
            ...formData,
            calculationRules: {
              ...formData.calculationRules!,
              absenceDayMultiplier: parseFloat(e.target.value) || 1.0
            }
          })}
          className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
        />
        <span className="text-xs font-bold text-slate-600">{tr('يوم (1x أو 2x)', 'day (1x or 2x)')}</span>
      </div>
    </div>

    {/* Standard Overtime Rate */}
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">{tr('مضاعف العمل الإضافي بالأيام العادية', 'Regular-day overtime multiplier')}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.1"
          min="1"
          max="3"
          value={formData.calculationRules?.overtimeStandardRate || 1.5}
          onChange={(e) => setFormData({
            ...formData,
            calculationRules: {
              ...formData.calculationRules!,
              overtimeStandardRate: parseFloat(e.target.value) || 1.5
            }
          })}
          className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
        />
        <span className="text-xs font-bold text-slate-600">{tr('ضعف', 'multiplier')} (1.5x)</span>
      </div>
    </div>

    {/* Weekend Overtime Rate */}
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">{tr('مضاعف العمل الإضافي في العطلات والأعياد', 'Weekend and holiday overtime multiplier')}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.1"
          min="1"
          max="3"
          value={formData.calculationRules?.overtimeWeekendRate || 2.0}
          onChange={(e) => setFormData({
            ...formData,
            calculationRules: {
              ...formData.calculationRules!,
              overtimeWeekendRate: parseFloat(e.target.value) || 2.0
            }
          })}
          className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
        />
        <span className="text-xs font-bold text-slate-600">{tr('ضعف', 'multiplier')} (2.0x)</span>
      </div>
    </div>

    {/* Saudi Employee GOSI */}
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">{tr('نسبة استقطاع التأمينات من الموظف السعودي', 'Saudi employee GOSI contribution rate')}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.0025"
          value={Number(((formData.calculationRules?.saudiGosiEmployeeRate || 0.0975) * 100).toFixed(3))}
          onChange={(e) => setFormData({
            ...formData,
            calculationRules: {
              ...formData.calculationRules!,
              saudiGosiEmployeeRate: parseFloat(e.target.value) / 100 || 0.0975
            }
          })}
          className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
        />
        <span className="text-xs font-bold text-slate-600">% (9.75%)</span>
      </div>
    </div>

    {/* Saudi Employer GOSI */}
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">{tr('نسبة مساهمة المنشأة في تأمينات الموظف السعودي', 'Saudi employer GOSI contribution rate')}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.0025"
          value={Number(((formData.calculationRules?.saudiGosiEmployerRate || 0.1175) * 100).toFixed(3))}
          onChange={(e) => setFormData({
            ...formData,
            calculationRules: {
              ...formData.calculationRules!,
              saudiGosiEmployerRate: parseFloat(e.target.value) / 100 || 0.1175
            }
          })}
          className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
        />
        <span className="text-xs font-bold text-slate-600">% (11.75%)</span>
      </div>
    </div>

    {/* GOSI Max Cap */}
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">{tr('الحد الأقصى للراتب الخاضع للتأمينات (Max Cap)', 'Maximum GOSI contributory salary')}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.01"
          value={formData.calculationRules?.saudiGosiMaxCap || 45000}
          onChange={(e) => setFormData({
            ...formData,
            calculationRules: {
              ...formData.calculationRules!,
              saudiGosiMaxCap: parseFloat(e.target.value) || 45000
            }
          })}
          className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
        />
        <span className="text-xs font-bold text-slate-600">SR</span>
      </div>
    </div>

    {/* Non-Saudi Hazard Rate */}
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">{tr('نسبة الأخطار المهنية للموظف غير السعودي', 'Non-Saudi occupational hazards rate')}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.005"
          value={Number(((formData.calculationRules?.nonSaudiGosiEmployerHazardRate || 0.02) * 100).toFixed(2))}
          onChange={(e) => setFormData({
            ...formData,
            calculationRules: {
              ...formData.calculationRules!,
              nonSaudiGosiEmployerHazardRate: parseFloat(e.target.value) / 100 || 0.02
            }
          })}
          className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
        />
        <span className="text-xs font-bold text-slate-600">% (2%)</span>
      </div>
    </div>

    {/* Rounding Decimals */}
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">{tr('دقة التقريب العشري للمبالغ المالية', 'Financial amount decimal precision')}</label>
      <select
        value={formData.calculationRules?.roundingDecimals ?? 2}
        onChange={(e) => setFormData({
          ...formData,
          calculationRules: {
            ...formData.calculationRules!,
            roundingDecimals: parseInt(e.target.value) || 2
          }
        })}
        className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-semibold text-slate-900"
      >
        <option value="2">{tr('منزلتين عشريتين (هللات - 0.00)', 'Two decimal places (halalas - 0.00)')}</option>
        <option value="0">{tr('أقرب رقم صحيح (بدون كسور)', 'Nearest whole number (no decimals)')}</option>
        <option value="3">{tr('ثلاث منازل عشرية (0.000)', 'Three decimal places (0.000)')}</option>
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
      <span>{tr('حفظ سياسات الرواتب والتأمينات', 'Save payroll and GOSI policies')}</span>
    </button>
  </div>
</div>
));
