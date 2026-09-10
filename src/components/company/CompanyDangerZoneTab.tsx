import React, { useState } from 'react';
import { AlertCircle, Trash2, X } from 'lucide-react';
import type { Company } from '../../types';

interface CompanyDangerZoneTabProps {
  company: Company;
  employeesCount: number;
  language: 'ar' | 'en';
  onArchiveEmployees?: (companyId: string) => Promise<boolean | void> | boolean | void;
  onSuccess: (message: string) => void;
  tr: (ar: string, en: string) => string;
}

export const CompanyDangerZoneTab = React.memo<CompanyDangerZoneTabProps>(({
  company,
  employeesCount,
  language,
  onArchiveEmployees,
  onSuccess,
  tr,
}) => {
  const [isDeleteEmployeesModalOpen, setIsDeleteEmployeesModalOpen] = useState(false);
  const [deleteEmployeesConfirmation, setDeleteEmployeesConfirmation] = useState('');
  const [isArchivingEmployees, setIsArchivingEmployees] = useState(false);
  const deleteEmployeesConfirmationValid = ['أرشفة جميع الموظفين', 'ARCHIVE ALL EMPLOYEES']
    .includes(deleteEmployeesConfirmation.trim().toUpperCase());

  return (
    <>
<div className="bg-white rounded-2xl p-6 border border-rose-200 shadow-sm space-y-5">
  <div className="flex items-start gap-3 border-b border-rose-100 pb-4">
    <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
      <AlertCircle className="w-5 h-5" />
    </div>
    <div>
      <h3 className="text-sm font-bold text-rose-900">{tr('منطقة الخطر وإدارة البيانات الحساسة', 'Danger Zone and Sensitive Data')}</h3>
      <p className="text-xs text-rose-700 mt-1">{tr('العمليات في هذا القسم حساسة وتؤثر على بيانات المنشأة الحالية فقط.', 'Actions in this section are sensitive and affect the current company only.')}</p>
    </div>
  </div>

  <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
    <div>
      <h4 className="text-sm font-black text-slate-900">{tr('أرشفة جميع موظفي المنشأة', 'Archive All Company Employees')}</h4>
      <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-6">
        {tr(`سيتم إخفاء ${employeesCount} موظفًا من القوائم والمسيرات الجديدة، مع الاحتفاظ بسجلات الحضور والإجازات والسلف والجزاءات ومسيرات الرواتب والقيود السابقة للمراجعة.`, `${employeesCount} employees will be hidden from active lists and new payroll runs while attendance, leave, loan, penalty, payroll and journal history remains preserved.`)}
      </p>
    </div>
    <button
      type="button"
      disabled={!employeesCount || !onArchiveEmployees}
      onClick={() => { setDeleteEmployeesConfirmation(''); setIsDeleteEmployeesModalOpen(true); }}
      className="px-5 py-2.5 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
    >
      <Trash2 className="w-4 h-4" />
      {tr('أرشفة جميع الموظفين', 'Archive all employees')} ({employeesCount})
    </button>
  </div>
</div>
{isDeleteEmployeesModalOpen && (
  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
    <div data-no-translate className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-rose-200 overflow-hidden">
      <div className="bg-rose-700 text-white p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6" />
          <div>
            <h3 className="font-black">{tr('تأكيد أرشفة جميع الموظفين', 'Confirm Employee Archival')}</h3>
            <p className="text-xs text-rose-100">{tr('سيتم إخفاء الموظفين دون حذف التاريخ المالي', 'Employees will be hidden without deleting financial history')}</p>
          </div>
        </div>
        <button type="button" onClick={() => setIsDeleteEmployeesModalOpen(false)} className="p-1.5 hover:bg-white/10 rounded-lg cursor-pointer"><X className="w-5 h-5" /></button>
      </div>

      <div className="p-6 space-y-4">
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-900 leading-6">
          {tr('سيتم أرشفة', 'This will archive')} <b>{employeesCount} {tr('موظفًا', 'employees')}</b> {tr('في منشأة', 'in')} <b>{language === 'ar' ? company.nameAr : (company.nameEn || company.nameAr)}</b>. {tr('ستظل كل المعاملات والمسيرات السابقة محفوظة للمراجعة ولن يدخل الموظفون المؤرشفون في أي مسير جديد.', 'All prior transactions and payroll runs remain available for audit, and archived employees will not enter new payroll runs.')}
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">{tr('اكتب «أرشفة جميع الموظفين» للتأكيد:', 'Type “ARCHIVE ALL EMPLOYEES” to confirm:')}</label>
          <input
            autoFocus
            value={deleteEmployeesConfirmation}
            onChange={event => setDeleteEmployeesConfirmation(event.target.value)}
            className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-bold focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15"
            placeholder={tr('أرشفة جميع الموظفين', 'ARCHIVE ALL EMPLOYEES')}
          />
        </div>
      </div>

      <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
        <button type="button" onClick={() => setIsDeleteEmployeesModalOpen(false)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold cursor-pointer">{tr('إلغاء', 'Cancel')}</button>
        <button
          type="button"
          disabled={!deleteEmployeesConfirmationValid || isArchivingEmployees}
          onClick={async () => {
            if (!deleteEmployeesConfirmationValid) return;
            setIsArchivingEmployees(true);
            try {
              const archived = await onArchiveEmployees?.(company.id);
              if (archived === false) return;
              setIsDeleteEmployeesModalOpen(false);
              setDeleteEmployeesConfirmation('');
              onSuccess(tr(`تمت أرشفة جميع موظفي المنشأة (${employeesCount}) مع الاحتفاظ بالتاريخ`, `All company employees (${employeesCount}) were archived with history preserved.`));
            } finally {
              setIsArchivingEmployees(false);
            }
          }}
          className="px-5 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-black cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isArchivingEmployees ? tr('جاري الأرشفة...', 'Archiving...') : tr('تأكيد الأرشفة', 'Confirm archive')}
        </button>
      </div>
    </div>
  </div>
)}
    </>
  );
});

