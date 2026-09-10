import React, { useMemo, useState } from 'react';
import { Edit, Layers, Plus, Trash2, X } from 'lucide-react';
import type { Company, CostCenter, Employee } from '../../types';

interface CompanyCostCentersTabProps {
  company: Company;
  employees: Employee[];
  language: 'ar' | 'en';
  setCompany: React.Dispatch<React.SetStateAction<Company>>;
  onUpdateCompany: (company: Company) => Promise<boolean | void> | boolean | void;
  tr: (ar: string, en: string) => string;
}

export const CompanyCostCentersTab = React.memo<CompanyCostCentersTabProps>(({
  company,
  employees,
  language,
  setCompany,
  onUpdateCompany,
  tr,
}) => {
  const [isCostCenterModalOpen, setIsCostCenterModalOpen] = useState(false);
  const [editingCostCenter, setEditingCostCenter] = useState<CostCenter | null>(null);
  const [costCenterFormData, setCostCenterFormData] = useState<Partial<CostCenter>>({ code: '', nameAr: '', nameEn: '' });
  const costCenterEmployeeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    employees.forEach(employee => {
      if (employee.costCenterId) counts.set(employee.costCenterId, (counts.get(employee.costCenterId) || 0) + 1);
    });
    return counts;
  }, [employees]);

  const handleOpenAddCostCenter = () => {
    setEditingCostCenter(null);
    setCostCenterFormData({
      code: `CC-${String((company.costCenters?.length || 0) + 1).padStart(2, '0')}`,
      nameAr: '',
      nameEn: '',
    });
    setIsCostCenterModalOpen(true);
  };
  const handleOpenEditCostCenter = (costCenter: CostCenter) => {
    setEditingCostCenter(costCenter);
    setCostCenterFormData({ ...costCenter });
    setIsCostCenterModalOpen(true);
  };
  const handleSaveCostCenterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!costCenterFormData.nameAr?.trim() || !costCenterFormData.code?.trim()) {
      alert(tr('يرجى إدخال رمز واسم مركز التكلفة', 'Enter the cost center code and name.'));
      return;
    }
    const updatedCostCenters = editingCostCenter
      ? (company.costCenters || []).map(item => item.id === editingCostCenter.id ? ({ ...item, ...costCenterFormData } as CostCenter) : item)
      : [...(company.costCenters || []), {
          id: `cc-${Date.now()}`,
          code: costCenterFormData.code.trim().toUpperCase(),
          nameAr: costCenterFormData.nameAr.trim(),
          nameEn: costCenterFormData.nameEn?.trim() || costCenterFormData.nameAr.trim(),
        }];
    const updatedCompany = { ...company, costCenters: updatedCostCenters };
    setCompany(updatedCompany);
    onUpdateCompany(updatedCompany);
    setIsCostCenterModalOpen(false);
  };
  const handleDeleteCostCenter = (costCenter: CostCenter) => {
    const assignedCount = employees.filter(employee => employee.costCenterId === costCenter.id).length;
    const message = assignedCount > 0
      ? tr(`يوجد ${assignedCount} موظفاً مسجلين على مركز التكلفة (${costCenter.nameAr}). هل تريد بالتأكيد حذفه؟`, `${assignedCount} employees are assigned to cost center (${costCenter.nameEn || costCenter.nameAr}). Delete it?`)
      : tr(`هل أنت متأكد من حذف مركز التكلفة (${costCenter.nameAr})؟`, `Delete cost center (${costCenter.nameEn || costCenter.nameAr})?`);
    if (!confirm(message)) return;
    const updatedCompany = { ...company, costCenters: (company.costCenters || []).filter(item => item.id !== costCenter.id) };
    setCompany(updatedCompany);
    onUpdateCompany(updatedCompany);
  };

  return (
    <>
<div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
    <div>
      <h3 className="text-sm font-bold text-slate-900">{tr('مراكز التكلفة المحاسبية (Cost Centers)', 'Accounting Cost Centers')}</h3>
      <p className="text-xs text-slate-500">{tr('توزيع مصاريف الرواتب والمخصصات على مراكز التكلفة المختلفة لترحيل القيود بدقة', 'Allocate payroll expenses and provisions to cost centers for accurate journal posting')}</p>
    </div>
    <button
      type="button"
      onClick={handleOpenAddCostCenter}
      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm self-start"
    >
      <Plus className="w-4 h-4" />
      <span>{tr('إضافة مركز تكلفة جديد', 'Add cost center')}</span>
    </button>
  </div>

  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {(company.costCenters || []).map((cc) => {
      const assignedEmpCount = costCenterEmployeeCounts.get(cc.id) || 0;

      return (
        <div key={cc.id} className="p-4 rounded-2xl border border-slate-200/80 bg-white hover:shadow-md transition-all">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-mono text-[10px] font-bold border border-emerald-200">
                {cc.code}
              </span>
              <h4 className="text-sm font-bold text-slate-900 mt-1">{language === 'ar' ? cc.nameAr : (cc.nameEn || cc.nameAr)}</h4>
              {(language === 'ar' ? cc.nameEn : cc.nameAr) && <p className="text-[11px] text-slate-400 font-medium" dir={language === 'ar' ? 'ltr' : 'rtl'}>{language === 'ar' ? cc.nameEn : cc.nameAr}</p>}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleOpenEditCostCenter(cc)}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
                title={tr('تعديل مركز التكلفة', 'Edit cost center')}
              >
                <Edit className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleDeleteCostCenter(cc)}
                className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
                title={tr('حذف مركز التكلفة', 'Delete cost center')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-400">{tr('الموظفين المنسوبين للمركز:', 'Employees assigned to center:')}</span>
            <span className="font-bold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-lg text-[11px]">
              {assignedEmpCount} {tr('موظف', 'employees')}
            </span>
          </div>
        </div>
      );
    })}
  </div>
</div>
{isCostCenterModalOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
    <div data-no-translate className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-scaleUp">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {editingCostCenter ? tr('تعديل مركز التكلفة', 'Edit Cost Center') : tr('إضافة مركز تكلفة جديد', 'Add Cost Center')}
            </h3>
            <p className="text-xs text-slate-500">{tr('منشأة', 'Company')}: {language === 'ar' ? company.nameAr : (company.nameEn || company.nameAr)}</p>
          </div>
        </div>
        <button 
          onClick={() => setIsCostCenterModalOpen(false)}
          className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSaveCostCenterSubmit} className="space-y-3.5">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">{tr('رمز مركز التكلفة (Code) *', 'Cost center code *')}</label>
          <input
            type="text"
            required
            value={costCenterFormData.code || ''}
            onChange={(e) => setCostCenterFormData({ ...costCenterFormData, code: e.target.value.toUpperCase() })}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold"
            placeholder="CC-100 / CC-SALES"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">{tr('اسم مركز التكلفة بالعربية *', 'Cost center name in Arabic *')}</label>
          <input
            type="text"
            required
            value={costCenterFormData.nameAr || ''}
            onChange={(e) => setCostCenterFormData({ ...costCenterFormData, nameAr: e.target.value })}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-semibold"
            placeholder={tr('المبيعات والتسويق', 'المبيعات والتسويق')}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">{tr('الاسم بالإنجليزية', 'Name in English')}</label>
          <input
            type="text"
            value={costCenterFormData.nameEn || ''}
            onChange={(e) => setCostCenterFormData({ ...costCenterFormData, nameEn: e.target.value })}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
            placeholder="Sales & Marketing"
            dir="ltr"
          />
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => setIsCostCenterModalOpen(false)}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
          >
            {tr('إلغاء', 'Cancel')}
          </button>
          <button
            type="submit"
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
          >
            {editingCostCenter ? tr('حفظ التعديلات', 'Save changes') : tr('إضافة المركز', 'Add cost center')}
          </button>
        </div>
      </form>
    </div>
  </div>
)}
    </>
  );
});

