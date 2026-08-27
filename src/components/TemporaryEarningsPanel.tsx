import React, { useMemo, useState } from 'react';
import { Edit3, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { Employee, TemporaryEarningRecord, TemporaryEarningType } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { formatSAR } from '../utils/payrollEngine';
import { SearchableEmployeeSelect } from './SearchableEmployeeSelect';

interface TemporaryEarningsPanelProps {
  companyId: string;
  employees: Employee[];
  earnings: TemporaryEarningRecord[];
  onSave: (earning: TemporaryEarningRecord) => void;
  onCancel: (earningId: string) => void;
  onDelete: (earningId: string) => void;
}

const TYPE_LABELS: Record<TemporaryEarningType, { ar: string; en: string }> = {
  COMMISSION: { ar: 'عمولة', en: 'Commission' },
  BONUS: { ar: 'مكافأة', en: 'Bonus' },
  INCENTIVE: { ar: 'حافز', en: 'Incentive' },
  OTHER: { ar: 'إضافة أخرى', en: 'Other earning' },
};

export const TemporaryEarningsPanel: React.FC<TemporaryEarningsPanelProps> = ({ companyId, employees, earnings, onSave, onCancel, onDelete }) => {
  const { language } = useLanguage();
  const tr = (ar: string, en: string) => language === 'ar' ? ar : en;
  const today = new Date().toISOString().slice(0, 10);
  const currentPeriod = today.slice(0, 7);
  const companyEmployees = useMemo(() => employees.filter(employee => employee.companyId === companyId), [employees, companyId]);
  const companyEarnings = useMemo(() => earnings.filter(earning => earning.companyId === companyId), [earnings, companyId]);
  const [editing, setEditing] = useState<TemporaryEarningRecord | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: '', periodMonth: currentPeriod, date: today, type: 'COMMISSION' as TemporaryEarningType, amount: 0, reason: '' });

  const openNew = () => {
    setEditing(null);
    setForm({ employeeId: companyEmployees[0]?.id || '', periodMonth: currentPeriod, date: today, type: 'COMMISSION', amount: 0, reason: '' });
    setIsOpen(true);
  };

  const openEdit = (earning: TemporaryEarningRecord) => {
    setEditing(earning);
    setForm({ employeeId: earning.employeeId, periodMonth: earning.periodMonth, date: earning.date, type: earning.type, amount: earning.amount, reason: earning.reason });
    setIsOpen(true);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.employeeId || form.amount <= 0 || !form.reason.trim()) return;
    onSave({
      id: editing?.id || `earning-${Date.now()}`,
      companyId,
      employeeId: form.employeeId,
      periodMonth: form.periodMonth,
      date: form.date,
      type: form.type,
      amount: Math.round(form.amount * 100) / 100,
      reason: form.reason.trim(),
      appliedInPayroll: editing?.appliedInPayroll ?? true,
    });
    setIsOpen(false);
    setEditing(null);
  };

  const totalActive = companyEarnings.filter(item => item.appliedInPayroll).reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-bold text-emerald-950">{tr('إجمالي الإضافات المؤقتة النشطة', 'Active temporary earnings')}</div>
          <div className="mt-1 text-xl font-black text-emerald-700">{formatSAR(totalActive)}</div>
          <div className="mt-1 text-[10px] text-emerald-800/70">{tr('تُضاف مرة واحدة فقط إلى مسير الفترة المحددة', 'Added once to the selected payroll period only')}</div>
        </div>
        <button onClick={openNew} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700">
          <Plus className="h-4 w-4" />{tr('إضافة عمولة أو مكافأة', 'Add commission or bonus')}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead><tr className="border-b border-slate-200 bg-slate-50 font-bold text-slate-500">
              <th className="px-4 py-3">{tr('الموظف', 'Employee')}</th><th className="px-4 py-3">{tr('النوع', 'Type')}</th><th className="px-4 py-3">{tr('فترة المسير', 'Payroll period')}</th><th className="px-4 py-3">{tr('التاريخ', 'Date')}</th><th className="px-4 py-3">{tr('البيان / السبب', 'Description / reason')}</th><th className="px-4 py-3">{tr('المبلغ', 'Amount')}</th><th className="px-4 py-3">{tr('الحالة', 'Status')}</th><th className="px-4 py-3 text-center">{tr('الإجراء', 'Action')}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {companyEarnings.length === 0 ? <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">{tr('لا توجد إضافات مؤقتة مسجلة', 'No temporary earnings recorded')}</td></tr> : companyEarnings.map(earning => {
                const employee = companyEmployees.find(item => item.id === earning.employeeId);
                const employeeName = employee ? (language === 'en' && (employee.firstNameEn || employee.lastNameEn) ? `${employee.firstNameEn || ''} ${employee.lastNameEn || ''}`.trim() : `${employee.firstNameAr} ${employee.lastNameAr}`) : tr('موظف', 'Employee');
                return <tr key={earning.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3"><div className="font-bold text-slate-900">{employeeName}</div><div className="text-[10px] text-slate-400">{employee?.employeeNo}</div></td>
                  <td className="px-4 py-3"><span className="rounded-lg bg-blue-50 px-2 py-1 font-bold text-blue-700">{tr(TYPE_LABELS[earning.type].ar, TYPE_LABELS[earning.type].en)}</span></td>
                  <td className="px-4 py-3 font-mono font-bold">{earning.periodMonth}</td><td className="px-4 py-3 font-mono text-slate-600">{earning.date}</td><td className="max-w-[240px] px-4 py-3 text-slate-700">{earning.reason}</td><td className="px-4 py-3 font-black text-emerald-700">+{formatSAR(earning.amount)}</td>
                  <td className="px-4 py-3"><span className={`rounded-md border px-2 py-1 text-[10px] font-bold ${earning.appliedInPayroll ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>{earning.appliedInPayroll ? tr('جاهزة للمسير', 'Ready for payroll') : tr('ملغاة', 'Cancelled')}</span></td>
                  <td className="px-4 py-3"><div className="flex justify-center gap-2"><button onClick={() => openEdit(earning)} className="text-blue-700" title={tr('تعديل', 'Edit')}><Edit3 className="h-4 w-4" /></button>{earning.appliedInPayroll && <button onClick={() => confirm(tr('إلغاء هذه الإضافة وإزالة أثرها من إعادة احتساب المسير؟', 'Cancel this earning and remove it when payroll is recalculated?')) && onCancel(earning.id)} className="text-amber-700" title={tr('إلغاء الإضافة', 'Cancel earning')}><RotateCcw className="h-4 w-4" /></button>}<button onClick={() => confirm(tr('حذف هذه الإضافة نهائيًا؟', 'Permanently delete this earning?')) && onDelete(earning.id)} className="text-rose-700" title={tr('حذف نهائي', 'Delete permanently')}><Trash2 className="h-4 w-4" /></button></div></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
        <div data-no-translate className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
          <div className="mb-5 flex items-center justify-between"><div><h3 className="font-bold text-slate-900">{editing ? tr('تعديل الإضافة المؤقتة', 'Edit temporary earning') : tr('إضافة مستحق مؤقت للموظف', 'Add temporary employee earning')}</h3><p className="mt-1 text-[11px] text-slate-500">{tr('لن تتكرر هذه الإضافة خارج فترة المسير المحددة', 'This earning will not repeat outside the selected payroll period')}</p></div><button type="button" onClick={() => setIsOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
          <form onSubmit={submit} className="space-y-4 text-xs">
            <div><label className="mb-1 block font-semibold text-slate-700">{tr('الموظف *', 'Employee *')}</label><SearchableEmployeeSelect required employees={companyEmployees} value={form.employeeId} onChange={employeeId => setForm({ ...form, employeeId })} /></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="mb-1 block font-semibold text-slate-700">{tr('نوع الإضافة *', 'Earning type *')}</label><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as TemporaryEarningType })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">{Object.entries(TYPE_LABELS).map(([type, label]) => <option key={type} value={type}>{tr(label.ar, label.en)}</option>)}</select></div><div><label className="mb-1 block font-semibold text-slate-700">{tr('المبلغ (SR) *', 'Amount (SR) *')}</label><input required min="0.01" step="0.01" type="number" value={form.amount || ''} onChange={e => setForm({ ...form, amount: Number(e.target.value) || 0 })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-bold text-emerald-700" /></div></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="mb-1 block font-semibold text-slate-700">{tr('فترة المسير *', 'Payroll period *')}</label><input required type="month" value={form.periodMonth} onChange={e => setForm({ ...form, periodMonth: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" /></div><div><label className="mb-1 block font-semibold text-slate-700">{tr('تاريخ الاستحقاق', 'Earning date')}</label><input required type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" /></div></div>
            <div><label className="mb-1 block font-semibold text-slate-700">{tr('البيان أو سبب الإضافة *', 'Description or reason *')}</label><input required value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder={tr('مثال: عمولة مبيعات شهر أغسطس', 'Example: August sales commission')} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" /></div>
            <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setIsOpen(false)} className="rounded-xl px-4 py-2 text-slate-600 hover:bg-slate-100">{tr('إلغاء', 'Cancel')}</button><button type="submit" className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-700">{editing ? tr('حفظ التعديل', 'Save changes') : tr('إضافة إلى المسير', 'Add to payroll')}</button></div>
          </form>
        </div>
      </div>}
    </div>
  );
};
