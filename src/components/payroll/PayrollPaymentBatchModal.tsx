import React from 'react';
import { CircleDollarSign, X } from 'lucide-react';
import type { PaymentMethod } from '../../types';
import { formatSAR } from '../../utils/payrollEngine';

export interface PayrollPaymentBatchForm {
  method: PaymentMethod;
  scheduledDate: string;
  reference: string;
  notes: string;
}

interface Props {
  form: PayrollPaymentBatchForm;
  selectedCount: number;
  total: number;
  onChange: React.Dispatch<React.SetStateAction<PayrollPaymentBatchForm>>;
  onClose: () => void;
  onSubmit: () => void;
  tr: (ar: string, en: string) => string;
}

export const PayrollPaymentBatchModal = React.memo(function PayrollPaymentBatchModal({ form, selectedCount, total, onChange, onClose, onSubmit, tr }: Props) {
  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-4">
      <div data-no-translate className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3"><CircleDollarSign className="w-6 h-6 text-emerald-400" /><div><h3 className="font-black">{tr('إنشاء دفعة تحويل رواتب', 'Create Payroll Payment Batch')}</h3><p className="text-xs text-slate-400">{selectedCount} {tr('موظف', 'employees')} • {formatSAR(total)}</p></div></div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4 text-xs">
          <div><label className="block font-bold text-slate-700 mb-1">{tr('طريقة التحويل *', 'Payment method *')}</label><select value={form.method} onChange={event => onChange({ ...form, method: event.target.value as PaymentMethod })} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"><option value="WPS">{tr('حماية الأجور WPS', 'WPS')}</option><option value="BANK_TRANSFER">{tr('تحويل بنكي', 'Bank transfer')}</option><option value="CASH">{tr('دفع نقدي', 'Cash')}</option></select></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block font-bold text-slate-700 mb-1">{tr('تاريخ التحويل المجدول *', 'Scheduled payment date *')}</label><input type="date" required value={form.scheduledDate} onChange={event => onChange({ ...form, scheduledDate: event.target.value })} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl" /></div>
            <div><label className="block font-bold text-slate-700 mb-1">{tr('مرجع التحويل', 'Payment reference')}</label><input value={form.reference} onChange={event => onChange({ ...form, reference: event.target.value })} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl" placeholder={tr('رقم ملف البنك أو الحوالة', 'Bank file or transfer reference')} /></div>
          </div>
          <div><label className="block font-bold text-slate-700 mb-1">{tr('ملاحظات', 'Notes')}</label><textarea rows={2} value={form.notes} onChange={event => onChange({ ...form, notes: event.target.value })} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl resize-none" placeholder={tr('مثال: الدفعة الأولى من رواتب الشهر', 'Example: first payroll batch of the month')} /></div>
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-center justify-between"><span className="font-bold text-emerald-900">{tr('إجمالي الدفعة', 'Batch total')}</span><span className="font-black text-emerald-800 text-base">{formatSAR(total)}</span></div>
        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold">{tr('إلغاء', 'Cancel')}</button><button type="button" onClick={onSubmit} disabled={!form.scheduledDate || !selectedCount} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black disabled:opacity-40">{tr('إنشاء وجدولة الدفعة', 'Create and schedule batch')}</button></div>
      </div>
    </div>
  );
});
