import React, { type RefObject } from 'react';
import { AlertCircle, CheckCircle2, Image as ImageIcon, Save, Trash2, Upload } from 'lucide-react';
import type { Company } from '../../types';
import { validateSaudiCR, validateSaudiTaxNumber } from '../../utils/security';

interface CompanyDetailsTabProps {
  formData: Company;
  fileInputRef: RefObject<HTMLInputElement | null>;
  setFormData: React.Dispatch<React.SetStateAction<Company>>;
  onSave: () => void;
  tr: (ar: string, en: string) => string;
}

export const CompanyDetailsTab = React.memo<CompanyDetailsTabProps>(({
  formData,
  fileInputRef,
  setFormData,
  onSave,
  tr,
}) => (
<div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
    <div>
      <h3 className="text-sm font-bold text-slate-900">{tr('بيانات التسجيل الحكومي والمنشأة', 'Company and government registration')}</h3>
      <p className="text-xs text-slate-500">{tr('تعديل بيانات السجل التجاري، الرقم الضريبي، واشتراك التأمينات الاجتماعية', 'Manage commercial registration, VAT and GOSI registration details')}</p>
    </div>
    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
      {tr('متوافق مع وزارة الموارد البشرية وهيئة الزكاة والضريبة والجمارك (ZATCA)', 'MHRSD and ZATCA compliant')}
    </span>
  </div>

  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
    {/* Arabic Name */}
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">{tr('اسم المنشأة الرسمي بالعربية *', 'Official company name in Arabic *')}</label>
      <input
        type="text"
        required
        value={formData.nameAr}
        onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
        className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 font-semibold text-slate-900"
        placeholder={tr('مثال: شركة التقنية المتقدمة المحدودة', 'Example: شركة التقنية المتقدمة المحدودة')}
      />
    </div>

    {/* English Name */}
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">{tr('اسم المنشأة بالإنجليزية (English Name)', 'Company name in English')}</label>
      <input
        type="text"
        value={formData.nameEn || ''}
        onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
        className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 text-slate-900 font-medium"
        placeholder="Advanced Tech Digital Solutions Ltd."
        dir="ltr"
      />
    </div>

    {/* Company Code */}
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">{tr('رمز المنشأة الداخلي (Company Code) *', 'Internal company code *')}</label>
      <input
        type="text"
        required
        value={formData.companyCode}
        onChange={(e) => setFormData({ ...formData, companyCode: e.target.value })}
        className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
        placeholder="101"
      />
    </div>

    {/* Commercial Registration (CR) */}
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-bold text-slate-700">{tr('رقم السجل التجاري (C.R. Number) *', 'Commercial registration number *')}</label>
        {formData.crNumber && (
          validateSaudiCR(formData.crNumber) ? (
            <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
              <CheckCircle2 className="w-3 h-3" /> {tr('سجل صحيح (10 أرقام)', 'Valid CR (10 digits)')}
            </span>
          ) : (
            <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-0.5">
              <AlertCircle className="w-3 h-3" /> {tr('10 أرقام', '10 digits')}
            </span>
          )
        )}
      </div>
      <input
        type="text"
        required
        value={formData.crNumber}
        onChange={(e) => setFormData({ ...formData, crNumber: e.target.value.replace(/[^0-9]/g, '') })}
        className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
        placeholder="1010XXXXXX"
        maxLength={10}
      />
    </div>

    {/* Tax Number (VAT) */}
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-bold text-slate-700">{tr('الرقم الضريبي (VAT / Tax No) *', 'VAT number *')}</label>
        {formData.taxNumber && (
          validateSaudiTaxNumber(formData.taxNumber) ? (
            <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
              <CheckCircle2 className="w-3 h-3" /> {tr('رقم ضريبي صحيح', 'Valid VAT number')}
            </span>
          ) : (
            <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-0.5">
              <AlertCircle className="w-3 h-3" /> {tr('15 رقماً يبدأ وينتهي بـ 3', '15 digits, starting and ending with 3')}
            </span>
          )
        )}
      </div>
      <input
        type="text"
        required
        value={formData.taxNumber}
        onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value.replace(/[^0-9]/g, '') })}
        className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
        placeholder="300XXXXXXXXXXX3"
        maxLength={15}
      />
    </div>

    {/* GOSI Establishment Number */}
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">{tr('رقم اشتراك التأمينات الاجتماعية (GOSI No) *', 'GOSI establishment number *')}</label>
      <input
        type="text"
        required
        value={formData.gosiEstablishmentNo}
        onChange={(e) => setFormData({ ...formData, gosiEstablishmentNo: e.target.value.replace(/[^0-9]/g, '') })}
        className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold text-slate-900"
        placeholder="900XXXXX"
      />
    </div>

    {/* Currency */}
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">{tr('العملة الأساسية', 'Base currency')}</label>
      <select
        value={formData.currency}
        onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
        className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-semibold text-slate-900"
      >
        <option value="SAR">{tr('ريال سعودي (SR)', 'Saudi Riyal (SR)')}</option>
        <option value="USD">{tr('دولار أمريكي (USD - $)', 'US Dollar (USD)')}</option>
        <option value="AED">{tr('درهم إماراتي (AED)', 'UAE Dirham (AED)')}</option>
      </select>
    </div>

    {/* Timezone */}
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">{tr('المنطقة الزمنية', 'Time zone')}</label>
      <input
        type="text"
        value={formData.timezone}
        onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
        className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono text-slate-900"
      />
    </div>

    {/* Fiscal Year Start */}
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1">{tr('شهر بداية السنة المالية', 'Fiscal year starting month')}</label>
      <select
        value={formData.fiscalYearStartMonth}
        onChange={(e) => setFormData({ ...formData, fiscalYearStartMonth: parseInt(e.target.value, 10) || 1 })}
        className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-semibold text-slate-900"
      >
        <option value={1}>{tr('يناير', 'January')} (01)</option>
        <option value={4}>{tr('أبريل', 'April')} (04)</option>
        <option value={7}>{tr('يوليو', 'July')} (07)</option>
        <option value={10}>{tr('أكتوبر', 'October')} (10)</option>
      </select>
    </div>
  </div>

  {/* Logo Customizer */}
  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div className="flex items-center gap-3">
      <div className="w-12 h-12 rounded-xl bg-white border border-slate-300 p-1 flex items-center justify-center shrink-0">
        {formData.logo ? (
          <img src={formData.logo} alt="Logo" className="w-full h-full object-contain" />
        ) : (
          <ImageIcon className="w-6 h-6 text-slate-400" />
        )}
      </div>
      <div>
        <h4 className="text-xs font-bold text-slate-800">{tr('شعار المنشأة المعتمد (Company Logo)', 'Approved company logo')}</h4>
        <p className="text-[11px] text-slate-500">{tr('يظهر في التقارير الرسمية، قسائم الرواتب، وكشوفات حماية الأجور', 'Displayed on official reports, payslips and WPS files')}</p>
      </div>
    </div>

    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
      >
        <Upload className="w-3.5 h-3.5" />
        <span>{tr('رفع شعار جديد', 'Upload new logo')}</span>
      </button>
      {formData.logo && (
        <button
          type="button"
          onClick={() => setFormData({ ...formData, logo: undefined })}
          className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>{tr('إزالة', 'Remove')}</span>
        </button>
      )}
    </div>
  </div>

  <div className="flex justify-end pt-3">
    <button
      type="button"
      onClick={onSave}
      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-2"
    >
      <Save className="w-4 h-4" />
      <span>{tr('حفظ البيانات الأساسية', 'Save basic details')}</span>
    </button>
  </div>
</div>
));
