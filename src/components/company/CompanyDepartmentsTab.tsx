import React, { useMemo, useState } from 'react';
import { Edit, FolderTree, Plus, Trash2, Users, X } from 'lucide-react';
import type { Company, DepartmentInfo, Employee } from '../../types';

interface CompanyDepartmentsTabProps {
  company: Company;
  employees: Employee[];
  departments: DepartmentInfo[];
  language: 'ar' | 'en';
  setCompany: React.Dispatch<React.SetStateAction<Company>>;
  onUpdateCompany: (company: Company) => Promise<boolean | void> | boolean | void;
  tr: (ar: string, en: string) => string;
}

export const CompanyDepartmentsTab = React.memo<CompanyDepartmentsTabProps>(({
  company,
  employees,
  departments,
  language,
  setCompany,
  onUpdateCompany,
  tr,
}) => {
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentInfo | null>(null);
  const [deptFormData, setDeptFormData] = useState<Partial<DepartmentInfo>>({
    code: '',
    nameAr: '',
    nameEn: '',
    headName: '',
    description: '',
  });
  const departmentEmployeesByName = useMemo(() => {
    const grouped = new Map<string, Employee[]>();
    employees.forEach(employee => grouped.set(employee.department, [...(grouped.get(employee.department) || []), employee]));
    return grouped;
  }, [employees]);

  const handleOpenAddDept = () => {
    setEditingDept(null);
    setDeptFormData({
      code: `DEP-${String(departments.length + 1).padStart(2, '0')}`,
      nameAr: '',
      nameEn: '',
      headName: '',
      description: '',
    });
    setIsDeptModalOpen(true);
  };
  const handleOpenEditDept = (dept: DepartmentInfo) => {
    setEditingDept(dept);
    setDeptFormData({ ...dept });
    setIsDeptModalOpen(true);
  };
  const handleSaveDeptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptFormData.nameAr?.trim()) {
      alert(tr('يرجى إدخال اسم القسم بالعربية', 'Enter the department name in Arabic.'));
      return;
    }
    let updatedDepts: DepartmentInfo[];
    if (editingDept) {
      updatedDepts = departments.map(dept => dept.id === editingDept.id ? ({ ...dept, ...deptFormData } as DepartmentInfo) : dept);
    } else {
      updatedDepts = [...departments, {
        id: `dept-${Date.now()}`,
        code: deptFormData.code?.trim() || `DEP-${String(departments.length + 1).padStart(2, '0')}`,
        nameAr: deptFormData.nameAr.trim(),
        nameEn: deptFormData.nameEn?.trim() || '',
        headName: deptFormData.headName?.trim() || '',
        description: deptFormData.description?.trim() || '',
      }];
    }
    const updatedCompany = { ...company, departments: updatedDepts };
    setCompany(updatedCompany);
    onUpdateCompany(updatedCompany);
    setIsDeptModalOpen(false);
  };
  const handleDeleteDept = (dept: DepartmentInfo) => {
    const assignedCount = employees.filter(employee => employee.department === dept.nameAr).length;
    const message = assignedCount > 0
      ? tr(`يوجد ${assignedCount} موظفاً مرتبطين بهذا القسم (${dept.nameAr}). هل أنت متأكد من حذف القسم من ملف المنشأة؟`, `${assignedCount} employees are assigned to this department (${dept.nameEn || dept.nameAr}). Delete it from the Company Profile?`)
      : tr(`هل أنت متأكد من حذف القسم (${dept.nameAr})؟`, `Delete department (${dept.nameEn || dept.nameAr})?`);
    if (!confirm(message)) return;
    const updatedCompany = { ...company, departments: departments.filter(item => item.id !== dept.id) };
    setCompany(updatedCompany);
    onUpdateCompany(updatedCompany);
  };

  return (
    <>
<div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
    <div>
      <h3 className="text-sm font-bold text-slate-900">{tr('الهيكل الإداري والأقسام لمنشأة', 'Departments and organizational structure for')} {language === 'ar' ? company.nameAr : (company.nameEn || company.nameAr)}</h3>
      <p className="text-xs text-slate-500">{tr('إضافة وتعديل الأقسام وتعيين مدراء الإدارات وربط الموظفين', 'Add and edit departments, assign department heads, and view linked employees')}</p>
    </div>
    <button
      type="button"
      onClick={handleOpenAddDept}
      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm self-start"
    >
      <Plus className="w-4 h-4" />
      <span>{tr('إضافة قسم جديد', 'Add department')}</span>
    </button>
  </div>

  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {departments.map((dept) => {
      const assignedEmployees = departmentEmployeesByName.get(dept.nameAr) || [];

      return (
        <div key={dept.id} className="p-4 rounded-2xl border border-slate-200/80 bg-white hover:shadow-md transition-all">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-bold">
                {dept.code}
              </span>
              <h4 className="text-sm font-bold text-slate-900 mt-1">{language === 'ar' ? dept.nameAr : (dept.nameEn || dept.nameAr)}</h4>
              {(language === 'ar' ? dept.nameEn : dept.nameAr) && <p className="text-[11px] text-slate-400 font-medium" dir={language === 'ar' ? 'ltr' : 'rtl'}>{language === 'ar' ? dept.nameEn : dept.nameAr}</p>}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleOpenEditDept(dept)}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
                title={tr('تعديل القسم', 'Edit department')}
              >
                <Edit className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleDeleteDept(dept)}
                className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
                title={tr('حذف القسم', 'Delete department')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 line-clamp-2 mb-3 min-h-[32px]">
            {dept.description || tr('لا يوجد وصف إضافي للقسم', 'No department description')}
          </p>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <div className="text-slate-600">
              <span className="text-[11px] text-slate-400 block">{tr('مدير / رئيس القسم:', 'Department head:')}</span>
              <span className="font-bold text-[11px] text-slate-800">{dept.headName || tr('غير محدد', 'Not assigned')}</span>
            </div>

            <div className="text-left">
              <span className="text-[11px] text-slate-400 block">{tr('الموظفين:', 'Employees:')}</span>
              <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md text-[11px]">
                <Users className="w-3 h-3" />
                {assignedEmployees.length} {tr('موظف', 'employees')}
              </span>
            </div>
          </div>
        </div>
      );
    })}
  </div>
</div>
{isDeptModalOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
    <div data-no-translate className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-scaleUp">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
            <FolderTree className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {editingDept ? tr('تعديل بيانات القسم', 'Edit Department') : tr('إضافة قسم إداري جديد', 'Add Department')}
            </h3>
            <p className="text-xs text-slate-500">{tr('منشأة', 'Company')}: {language === 'ar' ? company.nameAr : (company.nameEn || company.nameAr)}</p>
          </div>
        </div>
        <button 
          onClick={() => setIsDeptModalOpen(false)}
          className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSaveDeptSubmit} className="space-y-3.5">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">{tr('رمز القسم (Code) *', 'Department code *')}</label>
          <input
            type="text"
            required
            value={deptFormData.code || ''}
            onChange={(e) => setDeptFormData({ ...deptFormData, code: e.target.value.toUpperCase() })}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold"
            placeholder="DEP-IT"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">{tr('اسم القسم بالعربية *', 'Department name in Arabic *')}</label>
          <input
            type="text"
            required
            value={deptFormData.nameAr || ''}
            onChange={(e) => setDeptFormData({ ...deptFormData, nameAr: e.target.value })}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-semibold"
            placeholder={tr('تقنية المعلومات والتطوير', 'تقنية المعلومات والتطوير')}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">{tr('اسم القسم بالإنجليزية', 'Department name in English')}</label>
          <input
            type="text"
            value={deptFormData.nameEn || ''}
            onChange={(e) => setDeptFormData({ ...deptFormData, nameEn: e.target.value })}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
            placeholder="Information Technology"
            dir="ltr"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">{tr('اسم مدير / رئيس القسم', 'Department head name')}</label>
          <input
            type="text"
            value={deptFormData.headName || ''}
            onChange={(e) => setDeptFormData({ ...deptFormData, headName: e.target.value })}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
            placeholder={tr('المهندس / خالد أحمد', 'Department head')}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">{tr('وصف واختصاصات القسم', 'Department description and responsibilities')}</label>
          <textarea
            rows={2}
            value={deptFormData.description || ''}
            onChange={(e) => setDeptFormData({ ...deptFormData, description: e.target.value })}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white resize-none"
            placeholder={tr('مهام ومسؤوليات هذا القسم...', 'Department duties and responsibilities...')}
          />
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => setIsDeptModalOpen(false)}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
          >
            {tr('إلغاء', 'Cancel')}
          </button>
          <button
            type="submit"
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
          >
            {editingDept ? tr('حفظ التعديلات', 'Save changes') : tr('إضافة القسم', 'Add department')}
          </button>
        </div>
      </form>
    </div>
  </div>
)}
    </>
  );
});
