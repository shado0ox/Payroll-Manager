import React from 'react';
import {
  AlertCircle,
  Building2,
  Briefcase,
  CheckCircle,
  CreditCard,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { Company, Employee, EmploymentStatus } from '../../types';
import { formatSAR } from '../../utils/payrollEngine';
import {
  detectBankFromIBAN,
  getBankDefinitions,
  getSwiftCodeFromBankName,
  validateSaudiIBAN,
  validateSwiftCode,
} from '../../utils/security';

type NonSaudiEntryMode = 'NEW_ARRIVAL' | 'IQAMA_HOLDER' | '';

interface EmployeeFormModalProps {
  language: 'ar' | 'en';
  company: Company;
  isOpen: boolean;
  editingEmployee: Employee | null;
  isCompletingOnboarding: boolean;
  formData: Partial<Employee>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<Employee>>>;
  nonSaudiEntryMode: NonSaudiEntryMode;
  setNonSaudiEntryMode: React.Dispatch<React.SetStateAction<NonSaudiEntryMode>>;
  onSubmit: (event: React.FormEvent) => void;
  onClose: () => void;
}

export const EmployeeFormModal = React.memo<EmployeeFormModalProps>(({
  language,
  company,
  isOpen: isModalOpen,
  editingEmployee,
  isCompletingOnboarding,
  formData,
  setFormData,
  nonSaudiEntryMode,
  setNonSaudiEntryMode,
  onSubmit: handleFormSubmit,
  onClose,
}) => (
  <>
      {/* Add / Edit Employee Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div data-no-translate className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">
                    {editingEmployee
                      ? (language === 'ar' ? 'تعديل بيانات الموظف وسلم الراتب' : 'Edit employee and salary package')
                      : (language === 'ar' ? 'إضافة موظف جديد للمنشأة' : 'Add a new employee')}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {language === 'ar' ? 'المنشأة' : 'Company'}: {language === 'ar' ? company.nameAr : (company.nameEn || company.nameAr)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => onClose()}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleFormSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              
              {!editingEmployee && (
                <div data-employee-type-wizard className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div>
                    <div className="text-xs font-black text-slate-900">{language === 'ar' ? '1. حدد نوع الموظف' : '1. Choose employee type'}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{language === 'ar' ? 'سيتم إظهار الحقول المطلوبة فقط حسب الاختيار.' : 'Only the fields required for the selected path will be shown.'}</div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button type="button" onClick={() => { setNonSaudiEntryMode(''); setFormData({ ...formData, nationality: 'SAUDI', country: '', gosiEnabled: true, entryDate: '', entryNumber: '', iqamaNumber: '', iqamaExpiryDate: '', iqamaIssueStatus: 'PENDING', nationalIdOrIqama: '' }); }} className={`p-4 rounded-xl border text-start transition-all ${formData.nationality === 'SAUDI' ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/10' : 'border-slate-200 bg-white hover:border-emerald-300'}`}>
                      <div className="font-black text-sm text-slate-900">{language === 'ar' ? 'موظف سعودي' : 'Saudi employee'}</div>
                      <div className="text-[10px] text-slate-500 mt-1">{language === 'ar' ? 'هوية وطنية + بيانات العقد والتأمينات' : 'National ID + contract and GOSI details'}</div>
                    </button>
                    <button type="button" onClick={() => { setFormData({ ...formData, nationality: 'NON_SAUDI', country: '', gosiEnabled: false, contractStartDate: '', contractEndDate: '', nationalIdOrIqama: '' }); setNonSaudiEntryMode(''); }} className={`p-4 rounded-xl border text-start transition-all ${formData.nationality === 'NON_SAUDI' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/10' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
                      <div className="font-black text-sm text-slate-900">{language === 'ar' ? 'موظف غير سعودي' : 'Non-Saudi employee'}</div>
                      <div className="text-[10px] text-slate-500 mt-1">{language === 'ar' ? 'قادم جديد أو موظف لديه إقامة' : 'New arrival or existing iqama holder'}</div>
                    </button>
                  </div>
                  {formData.nationality === 'NON_SAUDI' && (
                    <div className="pt-3 border-t border-slate-200">
                      <div className="text-xs font-black text-slate-900 mb-2">{language === 'ar' ? '2. حالة الموظف غير السعودي' : '2. Non-Saudi status'}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button type="button" onClick={() => { setNonSaudiEntryMode('NEW_ARRIVAL'); setFormData({ ...formData, nationality: 'NON_SAUDI', iqamaNumber: '', iqamaExpiryDate: '', iqamaIssueStatus: 'PENDING', nationalIdOrIqama: String(formData.entryNumber || '') }); }} className={`p-3 rounded-xl border text-start ${nonSaudiEntryMode === 'NEW_ARRIVAL' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                          <div className="font-bold text-xs">{language === 'ar' ? 'قادم جديد برقم الدخول / الحدود' : 'New arrival with entry / border number'}</div>
                          <div className="text-[10px] text-slate-500 mt-1">{language === 'ar' ? 'لم تصدر له الإقامة بعد' : 'Iqama has not been issued yet'}</div>
                        </button>
                        <button type="button" onClick={() => { setNonSaudiEntryMode('IQAMA_HOLDER'); setFormData({ ...formData, nationality: 'NON_SAUDI', entryDate: '', entryNumber: '', iqamaIssueStatus: 'ISSUED', nationalIdOrIqama: String(formData.iqamaNumber || '') }); }} className={`p-3 rounded-xl border text-start ${nonSaudiEntryMode === 'IQAMA_HOLDER' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                          <div className="font-bold text-xs">{language === 'ar' ? 'لديه إقامة' : 'Iqama holder'}</div>
                          <div className="text-[10px] text-slate-500 mt-1">{language === 'ar' ? 'نسجل رقم الإقامة وتاريخ انتهائها' : 'Record iqama number and expiry date'}</div>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isCompletingOnboarding && (
                <div data-onboarding-activation className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
                  <div className="flex items-center gap-2 font-black"><UserCheck className="h-4 w-4" />{language === 'ar' ? 'استكمال بيانات الإقامة وتفعيل الموظف' : 'Complete Iqama details and activate employee'}</div>
                  <p className="mt-1 text-[11px]">{language === 'ar' ? 'أدخل رقم الإقامة الجديد والآيبان السعودي الصحيح. عند الحفظ ستتغير الحالة تلقائيًا إلى نشط.' : 'Enter the new Iqama number and a valid Saudi IBAN. Saving will automatically set the employee to Active.'}</p>
                </div>
              )}
              
              {/* Section 1: Basic Identity */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>{language === 'ar' ? 'البيانات الشخصية والهوية' : 'Personal details and identity'}</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'الرقم الوظيفي' : 'Employee number'}</label>
                    <input type="text" required value={formData.employeeNo || ''} onChange={e => setFormData({ ...formData, employeeNo: e.target.value.toUpperCase() })} className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900" />
                    <div className="text-[9px] text-slate-400 mt-1">{language === 'ar' ? 'يُقترح تلقائيًا ويمكنك استبداله برمز وظيفي خاص قبل الحفظ' : 'Suggested automatically; you may replace it with your own employee code before saving'}</div>
                  </div>

                  {formData.nationality === 'SAUDI' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'رقم الهوية الوطنية *' : 'National ID *'}</label>
                      <input type="text" required value={formData.nationalIdOrIqama || ''} onChange={e => setFormData({ ...formData, nationalIdOrIqama: e.target.value })} className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20" />
                    </div>
                  )}
                  {formData.nationality === 'NON_SAUDI' && nonSaudiEntryMode === 'NEW_ARRIVAL' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'رقم الدخول / الحدود *' : 'Entry / border number *'}</label>
                      <input type="text" required value={formData.entryNumber || ''} onChange={e => setFormData({ ...formData, entryNumber: e.target.value, nationalIdOrIqama: e.target.value })} className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-500/20" />
                    </div>
                  )}
                  {formData.nationality === 'NON_SAUDI' && nonSaudiEntryMode === 'IQAMA_HOLDER' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'رقم الإقامة *' : 'Iqama number *'}</label>
                      <input type="text" required value={formData.iqamaNumber || ''} onChange={e => setFormData({ ...formData, iqamaNumber: e.target.value, nationalIdOrIqama: e.target.value, iqamaIssueStatus: 'ISSUED' })} className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20" />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'الاسم الأول  *' : 'First name  *'}</label>
                    <input
                      type="text"
                      required
                      value={formData.firstNameAr || ''}
                      onChange={(e) => setFormData({ ...formData, firstNameAr: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'اسم العائلة  *' : 'Last name  *'}</label>
                    <input
                      type="text"
                      required
                      value={formData.lastNameAr || ''}
                      onChange={(e) => setFormData({ ...formData, lastNameAr: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  {formData.nationality === 'SAUDI' && (
                    <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 rounded-2xl bg-emerald-50/60 border border-emerald-200">
                      <label className="sm:col-span-4 flex items-center gap-2 font-bold text-emerald-900">
                        <input type="checkbox" checked={formData.gosiEnabled !== false} onChange={(e) => setFormData({ ...formData, gosiEnabled: e.target.checked })} />
                        {language === 'ar' ? 'تطبيق التأمينات الاجتماعية على الموظف' : 'Apply GOSI to this employee'}
                      </label>
                      <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'طريقة تحمل اشتراك GOSI' : 'GOSI payment method'}</label>
                      <select
                        disabled={formData.gosiEnabled === false}
                        value={formData.saudiGosiPaymentMode || 'SHARED'}
                        onChange={(e) => setFormData({ ...formData, saudiGosiPaymentMode: e.target.value as 'SHARED' | 'COMPANY_FULL' })}
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                      >
                        <option value="SHARED">{language === 'ar' ? 'عادي: حصة على الموظف وحصة على الشركة' : 'Shared: employee and employer contributions'}</option>
                        <option value="COMPANY_FULL">{language === 'ar' ? 'الشركة تتحمل الاشتراك كاملًا دون خصم الموظف' : 'Company pays the full contribution'}</option>
                      </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'نسبة الموظف %' : 'Employee rate %'}</label>
                        <input type="number" min="0" max="100" step="0.01" disabled={formData.gosiEnabled === false} value={((formData.gosiEmployeeRate ?? company.calculationRules?.saudiGosiEmployeeRate ?? 0.0975) * 100)} onChange={(e) => setFormData({ ...formData, gosiEmployeeRate: Math.max(0, Number(e.target.value) || 0) / 100 })} className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'نسبة الشركة %' : 'Employer rate %'}</label>
                        <input type="number" min="0" max="100" step="0.01" disabled={formData.gosiEnabled === false} value={((formData.gosiEmployerRate ?? company.calculationRules?.saudiGosiEmployerRate ?? 0.1175) * 100)} onChange={(e) => setFormData({ ...formData, gosiEmployerRate: Math.max(0, Number(e.target.value) || 0) / 100 })} className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-mono" />
                      </div>
                      <div className="text-[11px] text-emerald-800 self-end pb-2">{language === 'ar' ? 'تُطبق النسب على الأساسي + بدل السكن حتى الحد الأعلى للمنشأة.' : 'Rates apply to basic salary + housing allowance up to the company ceiling.'}</div>
                    </div>
                  )}

                  {formData.nationality === 'NON_SAUDI' && (
                    <div className="sm:col-span-2 p-3 rounded-2xl bg-purple-50/60 border border-purple-200">
                      <label className="flex items-center gap-2 font-bold text-purple-900">
                        <input type="checkbox" checked={formData.gosiEnabled !== false} onChange={(e) => setFormData({ ...formData, gosiEnabled: e.target.checked })} />
                        {language === 'ar' ? 'تطبيق تأمين المخاطر المهنية' : 'Apply occupational hazards insurance'}
                      </label>
                      <p className="mt-1 text-[11px] text-purple-800">
                        {language === 'ar'
                          ? `لا يُخصم اشتراك من راتب الموظف غير السعودي؛ تتحمل المنشأة فقط نسبة ${(Number(company.calculationRules?.nonSaudiGosiEmployerHazardRate ?? 0.02) * 100).toFixed(2)}% من الأساسي + بدل السكن.`
                          : `No contribution is deducted from a non-Saudi employee. The employer pays ${(Number(company.calculationRules?.nonSaudiGosiEmployerHazardRate ?? 0.02) * 100).toFixed(2)}% of basic salary + housing for occupational hazards.`}
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'الدولة' : 'Country'}</label>
                    <input
                      type="text"
                      value={formData.country || ''}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Job & Department */}
              <div className="pt-3 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>{language === 'ar' ? 'بيانات الوظيفة والتعيين' : 'Employment details'}</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'القسم *' : 'Department *'}</label>
                    <input
                      type="text"
                      list="company-departments-list"
                      required
                      placeholder={language === 'ar' ? 'اختر أو اكتب اسم القسم...' : 'Select or enter a department...'}
                      value={formData.department || ''}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                    <datalist id="company-departments-list">
                      {(company.departments || []).map((d, idx) => (
                        <option key={`${d.id || 'd'}-${idx}`} value={d.nameAr}>
                          {d.nameAr} ({d.code})
                        </option>
                      ))}
                      {/* Standard fallbacks if none defined yet */}
                      {(!company.departments || company.departments.length === 0) && (
                        <>
                          <option value="الإدارة العامة" />
                          <option value="تقنية المعلومات" />
                          <option value="المالية والمحاسبة" />
                          <option value="المبيعات والتسويق" />
                          <option value="الموارد البشرية" />
                          <option value="العمليات والتشغيل" />
                        </>
                      )}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'المسمى الوظيفي *' : 'Job title *'}</label>
                    <input
                      type="text"
                      required
                      value={formData.jobTitle || ''}
                      onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'مركز التكلفة *' : 'Cost center *'}</label>
                    <select
                      value={formData.costCenterId || ''}
                      onChange={(e) => setFormData({ ...formData, costCenterId: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    >
                      {company.costCenters.map(cc => (
                        <option key={cc.id} value={cc.id}>{cc.code} - {language === 'ar' ? cc.nameAr : (cc.nameEn || cc.nameAr)}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'تاريخ التعيين' : 'Hire date'}</label>
                    <input
                      type="date"
                      value={formData.hireDate || ''}
                      onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'بداية استحقاق الراتب' : 'Salary eligibility start'}</label>
                    <input
                      type="date"
                      value={formData.salaryStartDate || ''}
                      onChange={(e) => setFormData({ ...formData, salaryStartDate: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>

                  <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.prorateFirstMonth === true}
                        onChange={(e) => setFormData({ ...formData, prorateFirstMonth: e.target.checked })}
                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>
                        <span className="block text-xs font-bold text-slate-800">{language === 'ar' ? 'احتساب أول شهر باليوم' : 'Prorate the first month by day'}</span>
                        <span className="block text-[10px] text-slate-500 mt-0.5">{language === 'ar' ? 'غير مفعّل افتراضيًا؛ عند تفعيله يُحسب الراتب من تاريخ بداية الاستحقاق حتى نهاية الشهر.' : 'Off by default. When enabled, salary is calculated from the eligibility date through month end.'}</span>
                      </span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'الحالة الوظيفية' : 'Employment status'}</label>
                    <select
                      value={formData.status || 'ACTIVE'}
                      onChange={(e) => {
                        const status = e.target.value as EmploymentStatus;
                        setFormData({
                          ...formData,
                          status,
                          employmentEndReason: status === 'ABSCONDED' ? 'ABSCONDED' : (status === 'TERMINATED' ? formData.employmentEndReason : undefined),
                          terminationDate: status === 'TERMINATED' || status === 'ABSCONDED' ? formData.terminationDate : undefined,
                        });
                      }}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    >
                      <option value="ONBOARDING">{language === 'ar' ? 'تحت الاستكمال — رقم حدود' : 'Onboarding — border number'}</option>
                      <option value="ACTIVE">{language === 'ar' ? 'على رأس العمل' : 'Active'}</option>
                      <option value="SUSPENDED">{language === 'ar' ? 'تعليق الصرف مع استمرار الاستحقاق' : 'Payment held — entitlement continues'}</option>
                      <option value="ON_LEAVE">{language === 'ar' ? 'إجازة' : 'On leave'}</option>
                      <option value="TERMINATED">{language === 'ar' ? 'منتهي الخدمة' : 'Terminated'}</option>
                      <option value="ABSCONDED">{language === 'ar' ? 'هروب — تعليق واستبعاد الراتب' : 'Absconded — payroll suspended'}</option>
                    </select>
                  </div>
                </div>

                {/* Suspension Details if Suspended */}
                {formData.status === 'SUSPENDED' && (
                  <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-amber-900 mb-1">{language === 'ar' ? 'سبب تعليق صرف الراتب' : 'Salary payment hold reason'}</label>
                      <input
                        type="text"
                        value={formData.suspensionReason || ''}
                        onChange={(e) => setFormData({ ...formData, suspensionReason: e.target.value })}
                        placeholder={language === 'ar' ? 'مثال: إجازة استثنائية بدون راتب، تحقيق إداري...' : 'Example: unpaid leave, internal investigation...'}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-amber-300 rounded-lg"
                      />
                    </div>
                  </div>
                )}

                {formData.status === 'TERMINATED' && (
                  <div className="mt-3 p-3 bg-blue-50 rounded-xl border border-blue-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-blue-900 mb-1">{language === 'ar' ? 'سبب تصفية الراتب *' : 'Final settlement reason *'}</label>
                      <select required value={formData.employmentEndReason || ''} onChange={(e) => setFormData({ ...formData, employmentEndReason: e.target.value as Employee['employmentEndReason'] })} className="w-full px-3 py-2 text-xs bg-white border border-blue-300 rounded-lg">
                        <option value="">{language === 'ar' ? '-- اختر السبب --' : '-- Select reason --'}</option>
                        <option value="SPONSOR_TRANSFER">{language === 'ar' ? 'نقل كفالة' : 'Sponsorship transfer'}</option>
                        <option value="FINAL_EXIT">{language === 'ar' ? 'خروج نهائي' : 'Final exit'}</option>
                        <option value="OTHER">{language === 'ar' ? 'انتهاء خدمة آخر' : 'Other termination'}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-blue-900 mb-1">{language === 'ar' ? 'تاريخ النقل / الخروج النهائي *' : 'Transfer / final-exit date *'}</label>
                      <input type="date" required value={formData.terminationDate || ''} onChange={(e) => setFormData({ ...formData, terminationDate: e.target.value })} className="w-full px-3 py-2 text-xs bg-white border border-blue-300 rounded-lg" />
                    </div>
                    <p className="sm:col-span-2 text-[11px] text-blue-800">{language === 'ar' ? 'سيحسب المسير الراتب حتى هذا التاريخ شاملًا، ويستبعد الموظف من المسيرات التالية.' : 'Payroll will include salary through this date, then exclude the employee from subsequent runs.'}</p>
                  </div>
                )}

                {formData.status === 'ABSCONDED' && (
                  <div className="mt-3 p-3 bg-rose-50 rounded-xl border border-rose-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-rose-900 mb-1">{language === 'ar' ? 'تاريخ تسجيل الهروب *' : 'Absconding report date *'}</label>
                      <input type="date" required value={formData.terminationDate || ''} onChange={(e) => setFormData({ ...formData, terminationDate: e.target.value, employmentEndReason: 'ABSCONDED', suspensionReason: 'هروب' })} className="w-full px-3 py-2 text-xs bg-white border border-rose-300 rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-rose-900 mb-1">{language === 'ar' ? 'ملاحظات / مرجع البلاغ' : 'Notes / report reference'}</label>
                      <input type="text" value={formData.suspensionReason || ''} onChange={(e) => setFormData({ ...formData, suspensionReason: e.target.value })} className="w-full px-3 py-2 text-xs bg-white border border-rose-300 rounded-lg" />
                    </div>
                    <p className="sm:col-span-2 text-[11px] text-rose-800">{language === 'ar' ? 'سيُنقل الموظف إلى قائمة العمالة الهاربة ويُستبعد راتبه بالكامل من أي مسير جديد.' : 'The employee will move to the absconded list and be fully excluded from new payroll runs.'}</p>
                  </div>
                )}
              </div>

              {/* Section 3: Bank, IBAN & SWIFT Code */}
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>{language === 'ar' ? 'الحساب البنكي وحماية الأجور (WPS) وبيانات السويفت (SWIFT/BIC)' : 'Bank account, WPS and SWIFT/BIC details'}</span>
                  </h4>
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-semibold">
                    {language === 'ar' ? 'مطابق لمعايير البنك المركزي السعودي (SAMA)' : 'SAMA compliant'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  
                  {/* Bank Name */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">{language === 'ar' ? 'اسم البنك *' : 'Bank name *'}</label>
                      <span className="text-[10px] text-slate-400">{language === 'ar' ? 'البنوك المعتمدة' : 'Approved banks'}</span>
                    </div>
                    <select
                      value={formData.bankCode || detectBankFromIBAN(formData.bankIban, company.bankDefinitions)?.code || getBankDefinitions(company.bankDefinitions).find(bank => bank.nameAr === formData.bankName || bank.nameEn === formData.bankName)?.ibanBankCode || ''}
                      onChange={(e) => {
                        const selectedBank = getBankDefinitions(company.bankDefinitions).find(bank => bank.ibanBankCode === e.target.value);
                        setFormData({ 
                          ...formData, 
                          bankCode: selectedBank?.ibanBankCode || '',
                          bankName: selectedBank?.nameAr || '',
                          bankSwiftCode: selectedBank?.swiftCode || formData.bankSwiftCode || ''
                        });
                      }}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                    >
                      <option value="">{language === 'ar' ? '-- اختر البنك --' : '-- Select bank --'}</option>
                      {getBankDefinitions(company.bankDefinitions).filter(b => b.isActive !== false).map(b => (
                        <option key={b.ibanBankCode} value={b.ibanBankCode}>
                          {language === 'en' ? b.nameEn || b.nameAr : b.nameAr} ({b.swiftCode})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Guided lifecycle fields */}
                  {formData.nationality && (
                    <div className="sm:col-span-2 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-black text-slate-900">{language === 'ar' ? 'بيانات المستندات والمتابعة' : 'Documents and onboarding'}</div>
                        <span className="px-2 py-1 rounded-lg border border-amber-200 bg-white text-[10px] font-bold text-amber-800">
                          {validateSaudiIBAN(String(formData.bankIban || '').replace(/\s/g, '').toUpperCase()) ? (language === 'ar' ? 'IBAN جاهز للتحويل' : 'IBAN ready for transfer') : (language === 'ar' ? 'IBAN غير مطلوب عند التسجيل' : 'IBAN not required at registration')}
                        </span>
                      </div>
                      {formData.nationality === 'SAUDI' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div><label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'بداية العقد' : 'Contract start'}</label><input type="date" value={formData.contractStartDate || ''} onChange={e => setFormData({ ...formData, contractStartDate: e.target.value })} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs" /></div>
                          <div><label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'نهاية العقد *' : 'Contract end *'}</label><input type="date" required value={formData.contractEndDate || ''} onChange={e => setFormData({ ...formData, contractEndDate: e.target.value })} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs" /></div>
                        </div>
                      )}
                      {formData.nationality === 'NON_SAUDI' && nonSaudiEntryMode === 'NEW_ARRIVAL' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div><label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'تاريخ الدخول للمملكة *' : 'Entry date *'}</label><input type="date" required value={formData.entryDate || ''} onChange={e => setFormData({ ...formData, entryDate: e.target.value })} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs" /></div>
                          <div className="rounded-xl bg-white border border-amber-200 p-3 text-[10px] text-amber-800">{language === 'ar' ? 'سيظل الموظف تحت متابعة إصدار الإقامة. يمكن تسجيل الراتب الآن، أما التحويل البنكي فيتطلب IBAN صحيحًا.' : 'The employee remains under iqama onboarding. Salary may be recorded now; bank transfer requires a valid IBAN.'}</div>
                        </div>
                      )}
                      {formData.nationality === 'NON_SAUDI' && nonSaudiEntryMode === 'IQAMA_HOLDER' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div><label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'تاريخ انتهاء الإقامة *' : 'Iqama expiry date *'}</label><input type="date" required value={formData.iqamaExpiryDate || ''} onChange={e => setFormData({ ...formData, iqamaExpiryDate: e.target.value, iqamaIssueStatus: 'ISSUED' })} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs" /></div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* IBAN */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">{language === 'ar' ? 'رقم الآيبان (IBAN) — اختياري عند التسجيل' : 'IBAN — optional at registration'}</label>
                      {formData.bankIban && (
                        validateSaudiIBAN(formData.bankIban) ? (
                          <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                            <CheckCircle className="w-3 h-3" /> {language === 'ar' ? 'آيبان صحيح' : 'Valid IBAN'}
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-0.5">
                            <AlertCircle className="w-3 h-3" /> {language === 'ar' ? 'آيبان غير مكتمل' : 'Incomplete IBAN'}
                          </span>
                        )
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="SAXXXXXXXXXXXXXXXXXXXXXXXX"
                      value={formData.bankIban || ''}
                      onChange={(e) => {
                        const cleanIban = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                        const detected = detectBankFromIBAN(cleanIban, company.bankDefinitions);
                        setFormData({ 
                          ...formData, 
                          bankIban: cleanIban,
                          bankCode: detected?.code || formData.bankCode,
                          bankName: detected ? detected.nameAr : formData.bankName,
                          bankSwiftCode: detected ? detected.swiftCode : formData.bankSwiftCode
                        });
                      }}
                      className={`w-full px-3 py-2 text-xs bg-slate-50 border rounded-xl focus:bg-white font-mono tracking-wider transition-all ${
                        formData.bankIban && validateSaudiIBAN(formData.bankIban)
                          ? 'border-emerald-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                          : 'border-slate-200 focus:border-blue-500'
                      }`}
                      dir="ltr"
                    />
                  </div>

                  {/* SWIFT / BIC Code */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">{language === 'ar' ? 'رمز السويفت (SWIFT / BIC)' : 'SWIFT / BIC code'}</label>
                      <button
                        type="button"
                        onClick={() => {
                          let code = '';
                          if (formData.bankIban) {
                            const det = detectBankFromIBAN(formData.bankIban, company.bankDefinitions);
                            if (det) code = det.swiftCode;
                          }
                          if (!code && formData.bankName) {
                            code = getSwiftCodeFromBankName(formData.bankName, company.bankDefinitions);
                          }
                          if (code) {
                            setFormData({ ...formData, bankSwiftCode: code });
                          } else {
                            alert(language === 'ar' ? 'يرجى تحديد اسم البنك أو إدخال رقم آيبان سعودي صالح ليتم التوليد التلقائي لرمز السويفت' : 'Select a bank or enter a valid Saudi IBAN to generate the SWIFT code.');
                          }
                        }}
                        className="text-[10px] text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-0.5 cursor-pointer"
                        title={language === 'ar' ? 'توليد وتحديث رمز السويفت تلقائياً بناءً على البنك أو الآيبان' : 'Generate or update SWIFT from the bank or IBAN'}
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>{language === 'ar' ? 'توليد تلقائي' : 'Auto-generate'}</span>
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        placeholder={language === 'ar' ? 'مثال: RJHISARI أو NCBKSARI' : 'Example: RJHISARI or NCBKSARI'}
                        value={formData.bankSwiftCode || ''}
                        onChange={(e) => {
                          const swiftVal = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                          setFormData({ ...formData, bankSwiftCode: swiftVal });
                        }}
                        className={`w-full px-3 py-2 text-xs bg-slate-50 border rounded-xl focus:bg-white font-mono tracking-wider transition-all uppercase ${
                          formData.bankSwiftCode && validateSwiftCode(formData.bankSwiftCode)
                            ? 'border-emerald-400 bg-emerald-50/20 text-emerald-900 focus:ring-2 focus:ring-emerald-500/20'
                            : formData.bankSwiftCode
                            ? 'border-amber-300 bg-amber-50/20 text-amber-900 focus:ring-2 focus:ring-amber-500/20'
                            : 'border-slate-200 focus:border-emerald-500'
                        }`}
                        dir="ltr"
                        maxLength={11}
                      />
                    </div>

                    {/* SWIFT Validation Badge / Help text */}
                    <div className="mt-1 flex items-center justify-between text-[10px]">
                      {formData.bankSwiftCode ? (
                        validateSwiftCode(formData.bankSwiftCode) ? (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            <CheckCircle className="w-2.5 h-2.5" /> {language === 'ar' ? 'رمز سويفت قياسي معتمد (ISO 9362)' : 'Valid ISO 9362 SWIFT code'}
                          </span>
                        ) : (
                          <span className="text-amber-600 font-semibold flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5" /> {language === 'ar' ? 'الصيغة القياسية: 8 أو 11 حرفاً ورقم' : 'Standard format: 8 or 11 letters/digits'}
                          </span>
                        )
                      ) : (
                        <span className="text-slate-400">
                          {language === 'ar' ? 'يتولد تلقائياً من رقم الآيبان والبنك' : 'Generated automatically from IBAN and bank'}
                        </span>
                      )}
                      <span className="text-slate-400 font-mono">
                        {(formData.bankSwiftCode || '').length}/11
                      </span>
                    </div>
                  </div>

                </div>
              </div>

              {/* Section 4: Salary Package */}
              <div className="pt-3 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span>{language === 'ar' ? 'سلم الرواتب والبدلات الثابتة (SR)' : 'Salary and fixed allowances (SR)'}</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'الراتب الأساسي *' : 'Basic salary *'}</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={formData.salaryPackage?.baseSalary ?? 0}
                      onChange={(e) => setFormData({
                        ...formData,
                        salaryPackage: {
                          ...formData.salaryPackage!,
                          baseSalary: parseFloat(e.target.value) || 0
                        }
                      })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'بدل السكن' : 'Housing allowance'}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.salaryPackage?.housingAllowance ?? 0}
                      onChange={(e) => setFormData({
                        ...formData,
                        salaryPackage: {
                          ...formData.salaryPackage!,
                          housingAllowance: parseFloat(e.target.value) || 0
                        }
                      })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'بدل النقل' : 'Transport allowance'}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.salaryPackage?.transportAllowance ?? 0}
                      onChange={(e) => setFormData({
                        ...formData,
                        salaryPackage: {
                          ...formData.salaryPackage!,
                          transportAllowance: parseFloat(e.target.value) || 0
                        }
                      })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'بدلات أخرى ثابتة' : 'Other fixed allowances'}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.salaryPackage?.otherFixedAllowances ?? 0}
                      onChange={(e) => setFormData({
                        ...formData,
                        salaryPackage: {
                          ...formData.salaryPackage!,
                          otherFixedAllowances: parseFloat(e.target.value) || 0
                        }
                      })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{language === 'ar' ? 'بدلات أخرى غير خاضعة لـ GOSI' : 'Other non-GOSI allowances'}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.salaryPackage?.nonGosiOtherAllowances ?? 0}
                      onChange={(e) => setFormData({
                        ...formData,
                        salaryPackage: {
                          ...formData.salaryPackage!,
                          nonGosiOtherAllowances: parseFloat(e.target.value) || 0
                        }
                      })}
                      className="w-full px-3 py-2 text-xs bg-amber-50 border border-amber-200 rounded-xl focus:bg-white"
                    />
                  </div>
                </div>

                {/* Total Gross Display */}
                <div className="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900">{language === 'ar' ? 'إجمالي الراتب الشهري الثابت:' : 'Total fixed monthly salary:'}</span>
                  <span className="text-sm font-extrabold text-emerald-800 font-mono">
                    {formatSAR(
                      (formData.salaryPackage?.baseSalary || 0) +
                      (formData.salaryPackage?.housingAllowance || 0) +
                      (formData.salaryPackage?.transportAllowance || 0) +
                      (formData.salaryPackage?.otherFixedAllowances || 0) +
                      (formData.salaryPackage?.nonGosiOtherAllowances || 0)
                    )}
                  </span>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => onClose()}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
                >
                  {isCompletingOnboarding
                    ? (language === 'ar' ? 'حفظ وتفعيل الموظف' : 'Save and activate employee')
                    : editingEmployee
                      ? (language === 'ar' ? 'حفظ التعديلات' : 'Save changes')
                      : (language === 'ar' ? 'إضافة الموظف الآن' : 'Add employee')}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
  </>
));

EmployeeFormModal.displayName = 'EmployeeFormModal';
