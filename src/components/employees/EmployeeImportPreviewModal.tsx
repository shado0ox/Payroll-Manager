import React from 'react';
import { FileSpreadsheet, X } from 'lucide-react';
import { Employee } from '../../types';
import { EmployeeImportField, ParsedEmployeeSheet } from '../../utils/employeeImport';

interface EmployeeImportPreview {
  valid: Employee[];
  errors: string[];
  duplicates: number;
  adjusted: number;
  ignored: number;
  incomplete: number;
}

interface EmployeeImportPreviewModalProps {
  language: 'ar' | 'en';
  importSheet: ParsedEmployeeSheet;
  importMapping: Record<number, EmployeeImportField | ''>;
  importFieldLabels: Record<EmployeeImportField, string>;
  importPreview: EmployeeImportPreview;
  isImportingEmployees: boolean;
  onMappingChange: React.Dispatch<React.SetStateAction<Record<number, EmployeeImportField | ''>>>;
  onClose: () => void;
  onConfirm: () => void;
}

export const EmployeeImportPreviewModal = React.memo<EmployeeImportPreviewModalProps>(({
  language,
  importSheet,
  importMapping,
  importFieldLabels,
  importPreview,
  isImportingEmployees,
  onMappingChange,
  onClose,
  onConfirm,
}) => (
  <div data-no-translate className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
    <div className="bg-white rounded-3xl max-w-6xl w-full max-h-[92vh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
      <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl"><FileSpreadsheet className="w-5 h-5" /></div>
          <div>
            <h3 className="font-bold">{language === 'ar' ? 'معاينة استيراد الموظفين' : 'Employee Import Preview'}</h3>
            <p className="text-xs text-slate-400">{importSheet.fileName} — {language === 'ar' ? 'صف العناوين' : 'header row'} {importSheet.headerRow}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl cursor-pointer"><X className="w-5 h-5" /></button>
      </div>

      <div className="p-5 overflow-y-auto space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-emerald-800"><b>{importPreview.valid.length}</b> {language === 'ar' ? 'صف صالح للاستيراد' : 'valid rows'}</div>
          <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 text-sky-800"><b>{importPreview.adjusted}</b> {language === 'ar' ? 'رقم مكرر تم تصحيحه' : 'duplicate numbers corrected'}</div>
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-amber-800"><b>{importPreview.incomplete}</b> {language === 'ar' ? 'موظف يحتاج استكمال بيانات' : 'employees need data completion'}</div>
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-slate-700"><b>{importPreview.ignored}</b> {language === 'ar' ? 'صف غير موظف تم تجاهله' : 'non-employee rows ignored'}</div>
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-rose-800"><b>{importPreview.errors.length}</b> {language === 'ar' ? 'صف به أخطاء' : 'rows with errors'}</div>
        </div>

        {importPreview.duplicates > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            {language === 'ar' ? `تم تجاهل ${importPreview.duplicates} موظف موجود مسبقًا بنفس الإقامة أو IBAN.` : `${importPreview.duplicates} existing employees with the same Iqama or IBAN were skipped.`}
          </div>
        )}

        <div>
          <h4 className="font-bold text-sm text-slate-900 mb-2">{language === 'ar' ? 'مطابقة أعمدة الشيت' : 'Map Spreadsheet Columns'}</h4>
          <p className="text-xs text-slate-500 mb-3">{language === 'ar' ? 'راجع المطابقة التلقائية. في نموذجك يتم اقتراح cards كاسم البنك وCASH كرمز SWIFT.' : 'Review the automatic mapping. In your template, cards is suggested as bank name and CASH as SWIFT code.'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {importSheet.columns.map(column => (
              <label key={column.index} className="rounded-xl border border-slate-200 p-2 bg-slate-50">
                <span className="block text-[11px] font-semibold text-slate-600 truncate mb-1" title={column.header}>{column.header}</span>
                <select
                  value={importMapping[column.index] || ''}
                  onChange={(event) => onMappingChange(prev => ({ ...prev, [column.index]: event.target.value as EmployeeImportField | '' }))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                >
                  <option value="">{language === 'ar' ? 'تجاهل العمود' : 'Ignore column'}</option>
                  {Object.entries(importFieldLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="min-w-full text-xs text-right">
            <thead className="bg-slate-100 text-slate-600"><tr>
              <th className="p-2">#</th>
              {importSheet.columns.map(column => <th key={column.index} className="p-2 whitespace-nowrap">{column.header}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {importSheet.rows.slice(0, 8).map((row, rowIndex) => <tr key={rowIndex}>
                <td className="p-2 text-slate-400">{importSheet.headerRow + rowIndex + 1}</td>
                {importSheet.columns.map(column => <td key={column.index} className="p-2 whitespace-nowrap max-w-48 truncate" title={row[column.index]}>{row[column.index] || '—'}</td>)}
              </tr>)}
            </tbody>
          </table>
        </div>

        {importPreview.errors.length > 0 && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
            <b>{language === 'ar' ? 'أول الأخطاء:' : 'First errors:'}</b> {importPreview.errors.slice(0, 5).join(' • ')}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold cursor-pointer">{language === 'ar' ? 'إلغاء' : 'Cancel'}</button>
        <button
          onClick={onConfirm}
          disabled={!importPreview.valid.length || isImportingEmployees}
          className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isImportingEmployees
            ? (language === 'ar' ? 'جاري الحفظ...' : 'Saving...')
            : (language === 'ar' ? `استيراد ${importPreview.valid.length} موظف` : `Import ${importPreview.valid.length} employees`)}
        </button>
      </div>
    </div>
  </div>
));

EmployeeImportPreviewModal.displayName = 'EmployeeImportPreviewModal';
