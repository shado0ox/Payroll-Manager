import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, FileSpreadsheet, Printer, RefreshCw, Upload, UserPlus } from 'lucide-react';
import { AttendanceRecord, Company, Employee, LeaveRequest } from '../../types';
import { DailySchedule, DayOverrideMode, DayScheduleOverride, parseMoqootAttendance } from '../../utils/moqootAttendanceImport';
import { SearchableEmployeeSelect } from '../SearchableEmployeeSelect';
import { useLanguage } from '../../i18n/LanguageContext';

interface Props {
  company: Company;
  employees: Employee[];
  attendance: AttendanceRecord[];
  leaves: LeaveRequest[];
  selectedPeriod: string;
  onImport: (records: AttendanceRecord[]) => Promise<boolean | void> | boolean | void;
}

const weekdaysAr = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const weekdaysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const defaultSchedule = (): DailySchedule[] => weekdaysAr.map((_, weekday) => ({
  weekday,
  enabled: weekday !== 5 && weekday !== 6,
  start: '09:00',
  end: '17:00',
}));
const attendanceOnlyKey = (companyId: string, name: string, number: string) => {
  const source = `${number.trim()}|${name.trim().toLocaleLowerCase()}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return `attendance-only-${companyId}-${(hash >>> 0).toString(36)}`;
};
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[character] || character));

const statusLabel = (status: AttendanceRecord['attendanceStatus'], ar: boolean) => ({
  PRESENT: ar ? 'حاضر' : 'Present', LATE: ar ? 'متأخر' : 'Late', ABSENT: ar ? 'غياب مبدئي' : 'Potential absence',
  LEAVE: ar ? 'إجازة' : 'Leave', OFF: ar ? 'راحة' : 'Off', HOLIDAY: ar ? 'عطلة رسمية' : 'Public holiday',
  MISSION: ar ? 'مهمة عمل' : 'Business mission', IGNORED: ar ? 'مستبعد' : 'Ignored', MISSING_IN: ar ? 'دخول ناقص' : 'Missing check-in',
  MISSING_OUT: ar ? 'خروج ناقص' : 'Missing check-out', REVIEW: ar ? 'مراجعة' : 'Review',
}[status || 'REVIEW']);

export const AttendanceImportPanel: React.FC<Props> = ({ company, employees, attendance, leaves, selectedPeriod, onImport }) => {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const tr = (a: string, e: string) => ar ? a : e;
  const [workerMode, setWorkerMode] = useState<'REGISTERED' | 'ATTENDANCE_ONLY'>('REGISTERED');
  const [employeeId, setEmployeeId] = useState(employees[0]?.id || '');
  const [externalName, setExternalName] = useState('');
  const [externalNo, setExternalNo] = useState('');
  const [graceMinutes, setGraceMinutes] = useState(15);
  const [schedule, setSchedule] = useState<DailySchedule[]>(defaultSchedule);
  const [dayOverrides, setDayOverrides] = useState<DayScheduleOverride[]>([]);
  const [showMonthDays, setShowMonthDays] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<AttendanceRecord[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);

  const selectedEmployee = employees.find(item => item.id === employeeId);
  const externalId = externalName.trim() ? attendanceOnlyKey(company.id, externalName, externalNo) : '';
  const activeWorkerId = workerMode === 'REGISTERED' ? employeeId : externalId;
  const importedMonth = useMemo(() => attendance.filter(item => item.companyId === company.id && item.employeeId === activeWorkerId && item.periodMonth === selectedPeriod && item.sourceType === 'MOQOOT_IMPORT'), [attendance, company.id, activeWorkerId, selectedPeriod]);
  const reportRows = preview.length ? preview : importedMonth;
  const monthDays = useMemo(() => {
    const [year, month] = selectedPeriod.split('-').map(Number);
    const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return Array.from({ length:count }, (_, index) => {
      const date = `${selectedPeriod}-${String(index + 1).padStart(2, '0')}`;
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const weekly = schedule.find(day => day.weekday === weekday) || defaultSchedule()[weekday];
      const override = dayOverrides.find(item => item.date === date);
      return { date,weekday,weekly,override };
    });
  }, [selectedPeriod, schedule, dayOverrides]);

  useEffect(() => {
    if (!activeWorkerId) return;
    const history = attendance.filter(item => item.companyId === company.id && item.employeeId === activeWorkerId && item.sourceType === 'MOQOOT_IMPORT');
    if (!history.length) return;
    const latest = [...history].sort((a, b) => `${b.date}-${b.importedAt || ''}`.localeCompare(`${a.date}-${a.importedAt || ''}`));
    setGraceMinutes(latest[0].graceMinutes ?? 15);
    setSchedule(current => current.map(day => {
      const saved = latest.find(record => new Date(`${record.date}T12:00:00Z`).getUTCDay() === day.weekday);
      return saved ? { ...day, enabled:saved.workday !== false, start:saved.scheduledStart || day.start, end:saved.scheduledEnd || day.end } : day;
    }));
  }, [activeWorkerId, attendance, company.id]);

  useEffect(() => {
    setDayOverrides([]);
    setPreview([]);
    setReviewConfirmed(false);
  }, [selectedPeriod]);

  const updateSchedule = (weekday: number, patch: Partial<DailySchedule>) => {
    setSchedule(current => current.map(day => day.weekday === weekday ? { ...day, ...patch } : day));
    setPreview([]);
    setReviewConfirmed(false);
  };
  const updateDayOverride = (date: string, patch: Partial<DayScheduleOverride>) => {
    setDayOverrides(current => {
      const existing = current.find(item => item.date === date);
      const next = { date,mode:'DEFAULT' as DayOverrideMode,...existing,...patch };
      return [...current.filter(item => item.date !== date),next];
    });
    setPreview([]);
    setReviewConfirmed(false);
  };
  const updatePreviewRow = (id: string, patch: Partial<AttendanceRecord>) => {
    setPreview(current => current.map(row => row.id === id ? { ...row,...patch } : row));
    setReviewConfirmed(false);
  };
  const recalculateRow = (id: string) => setPreview(current => current.map(row => {
    if (row.id !== id) return row;
    const toMinutes = (time?: string) => {
      const match = time?.match(/^(\d{2}):(\d{2})$/);
      return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    };
    if (['OFF','LEAVE','HOLIDAY','MISSION','IGNORED'].includes(row.attendanceStatus || '')) return { ...row,calculatedDelayMinutes:0 };
    const actualIn = toMinutes(row.actualCheckIn), actualOut = toMinutes(row.actualCheckOut), planned = toMinutes(row.scheduledStart);
    if (actualIn === null && actualOut === null) return { ...row,attendanceStatus:'ABSENT',calculatedDelayMinutes:0,notes:row.notes || tr('لا توجد بصمات في يوم عمل', 'No punches on a workday') };
    if (actualIn === null) return { ...row,attendanceStatus:'MISSING_IN',calculatedDelayMinutes:0 };
    if (actualOut === null) return { ...row,attendanceStatus:'MISSING_OUT',calculatedDelayMinutes:0 };
    const delay = planned === null ? 0 : Math.max(0,actualIn - planned - (row.graceMinutes || 0));
    return { ...row,calculatedDelayMinutes:delay,attendanceStatus:delay > 0 ? 'LATE' : 'PRESENT' };
  }));

  const readPreview = async () => {
    setError('');
    if (!file) return setError(tr('اختر ملف CSV أولاً.', 'Choose a CSV file first.'));
    if (workerMode === 'REGISTERED' && !employeeId) return setError(tr('اختر الموظف.', 'Choose an employee.'));
    if (workerMode === 'ATTENDANCE_ONLY' && !externalName.trim()) return setError(tr('اكتب اسم موظف الحضور.', 'Enter the attendance-only worker name.'));
    try {
      const text = await file.text();
      const records = parseMoqootAttendance(text, {
        companyId: company.id,
        employeeId: workerMode === 'REGISTERED' ? employeeId : externalId,
        employeeName: workerMode === 'ATTENDANCE_ONLY' ? externalName.trim() : undefined,
        employeeNo: workerMode === 'ATTENDANCE_ONLY' ? externalNo.trim() : undefined,
        attendanceOnlyWorker: workerMode === 'ATTENDANCE_ONLY',
        periodMonth: selectedPeriod,
        graceMinutes,
        schedule,
        dayOverrides,
        sourceFileName: file.name,
        leaves,
      });
      if (!records.length) throw new Error('NO_ROWS_FOR_SELECTED_MONTH');
      setPreview(records);
      setReviewConfirmed(false);
    } catch (cause: any) {
      setPreview([]);
      setError(cause?.message === 'NO_ROWS_FOR_SELECTED_MONTH'
        ? tr('لا توجد صفوف للشهر المختار داخل الملف.', 'No rows for the selected month were found.')
        : tr('تعذر قراءة الملف. تأكد أنه ملف موقوت CSV بالأعمدة: يوم، حضور، انصراف.', 'Could not read the file. Verify the Moqoot CSV columns.'));
    }
  };

  const save = async () => {
    if (!preview.length || !reviewConfirmed) return;
    setSaving(true);
    try { const ok = await onImport(preview); if (ok !== false) setPreview([]); } finally { setSaving(false); }
  };

  const printReport = () => {
    if (!reportRows.length) return;
    const first = reportRows[0];
    const employee = employees.find(item => item.id === first.employeeId);
    const name = first.attendanceOnlyName || (employee ? `${employee.firstNameAr} ${employee.lastNameAr}` : tr('موظف حضور', 'Attendance worker'));
    const employeeNo = first.attendanceOnlyNo || employee?.employeeNo || '-';
    const absences = reportRows.filter(row => row.attendanceStatus === 'ABSENT').length;
    const lateDays = reportRows.filter(row => (row.calculatedDelayMinutes || 0) > 0).length;
    const lateTotal = reportRows.reduce((sum, row) => sum + (row.calculatedDelayMinutes || 0), 0);
    const missing = reportRows.filter(row => row.attendanceStatus === 'MISSING_IN' || row.attendanceStatus === 'MISSING_OUT').length;
    const rows = reportRows.map(row => `<tr><td>${escapeHtml(row.date)}</td><td>${escapeHtml(row.scheduledStart || '-')}</td><td>${escapeHtml(row.scheduledEnd || '-')}</td><td>${escapeHtml(row.actualCheckIn || '-')}</td><td>${escapeHtml(row.actualCheckOut || '-')}</td><td>${row.calculatedDelayMinutes || 0}</td><td>${escapeHtml(statusLabel(row.attendanceStatus, true))}</td><td>${escapeHtml(row.notes || '')}</td></tr>`).join('');
    const popup = window.open('', '_blank', 'width=1100,height=800');
    if (!popup) return;
    popup.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير الحضور - ${escapeHtml(name)}</title><style>body{font-family:Arial,sans-serif;color:#172033;padding:28px}h1,h2{text-align:center}.meta,.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}.box{border:1px solid #ccd3df;border-radius:8px;padding:10px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #bbc4d2;padding:7px;text-align:center}th{background:#edf2f7}.signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:50px;margin-top:60px;text-align:center}.line{border-top:1px solid #333;padding-top:8px}@media print{button{display:none}body{padding:0}}</style></head><body><h1>${escapeHtml(company.nameAr || company.nameEn || 'المنشأة')}</h1><h2>تقرير الحضور والانصراف</h2><div class="meta"><div class="box">الموظف: <b>${escapeHtml(name)}</b></div><div class="box">الرقم: <b>${escapeHtml(employeeNo)}</b></div><div class="box">الشهر: <b>${escapeHtml(selectedPeriod)}</b></div><div class="box">السماح: <b>${first.graceMinutes || 0} دقيقة</b></div></div><div class="summary"><div class="box">أيام الغياب: <b>${absences}</b></div><div class="box">أيام التأخير: <b>${lateDays}</b></div><div class="box">إجمالي التأخير: <b>${Math.floor(lateTotal / 60)}:${String(lateTotal % 60).padStart(2, '0')}</b></div><div class="box">البصمات الناقصة: <b>${missing}</b></div></div><table><thead><tr><th>التاريخ</th><th>الدوام من</th><th>الدوام إلى</th><th>الحضور</th><th>الانصراف</th><th>التأخير بالدقائق</th><th>الحالة</th><th>الملاحظات</th></tr></thead><tbody>${rows}</tbody></table><div class="signatures"><div class="line">توقيع الموظف</div><div class="line">المدير المباشر</div><div class="line">الموارد البشرية</div></div><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  };

  return <div className="space-y-5">
    <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-emerald-600"/><h2 className="font-bold">{tr('استيراد وتحليل ملف موقوت', 'Import and analyze Moqoot file')}</h2></div>
      <div className="grid md:grid-cols-2 gap-3">
        <label className="border rounded-xl p-3 flex items-center gap-2"><input type="radio" checked={workerMode === 'REGISTERED'} onChange={() => setWorkerMode('REGISTERED')}/>{tr('موظف مسجل', 'Registered employee')}</label>
        <label className="border rounded-xl p-3 flex items-center gap-2"><input type="radio" checked={workerMode === 'ATTENDANCE_ONLY'} onChange={() => setWorkerMode('ATTENDANCE_ONLY')}/><UserPlus className="w-4 h-4"/>{tr('موظف حضور فقط', 'Attendance-only worker')}</label>
      </div>
      {workerMode === 'REGISTERED' ? <SearchableEmployeeSelect employees={employees} value={employeeId} onChange={setEmployeeId}/>
        : <div className="grid md:grid-cols-2 gap-3"><input className="px-3 py-2 border rounded-xl" placeholder={tr('اسم الموظف *', 'Worker name *')} value={externalName} onChange={event => setExternalName(event.target.value)}/><input className="px-3 py-2 border rounded-xl" placeholder={tr('رقم حضور اختياري', 'Optional attendance number')} value={externalNo} onChange={event => setExternalNo(event.target.value)}/></div>}
      <div><label className="block text-xs font-bold mb-1">{tr('مدة السماح قبل التأخير (دقيقة)', 'Grace period before lateness (minutes)')}</label><input type="number" min="0" max="240" className="w-40 px-3 py-2 border rounded-xl" value={graceMinutes} onChange={event => setGraceMinutes(Math.max(0, Number(event.target.value) || 0))}/></div>
      <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="bg-slate-50"><th className="p-2 text-start">{tr('اليوم', 'Day')}</th><th>{tr('يوم عمل', 'Workday')}</th><th>{tr('من', 'From')}</th><th>{tr('إلى', 'To')}</th></tr></thead><tbody>{schedule.map(day => <tr key={day.weekday} className="border-t"><td className="p-2 font-bold">{ar ? weekdaysAr[day.weekday] : weekdaysEn[day.weekday]}</td><td className="text-center"><input type="checkbox" checked={day.enabled} onChange={event => updateSchedule(day.weekday, { enabled:event.target.checked })}/></td><td className="text-center"><input type="time" disabled={!day.enabled} value={day.start} onChange={event => updateSchedule(day.weekday, { start:event.target.value })} className="border rounded-lg p-1"/></td><td className="text-center"><input type="time" disabled={!day.enabled} value={day.end} onChange={event => updateSchedule(day.weekday, { end:event.target.value })} className="border rounded-lg p-1"/></td></tr>)}</tbody></table></div>
      <div className="border border-slate-200 rounded-2xl overflow-hidden">
        <button type="button" onClick={() => setShowMonthDays(value => !value)} className="w-full p-3 flex items-center justify-between bg-slate-50 font-bold text-xs">
          <span className="inline-flex items-center gap-2"><CalendarDays className="w-4 h-4 text-blue-600"/>{tr(`عرض وتعديل أيام شهر ${selectedPeriod}`, `View and edit days in ${selectedPeriod}`)}</span>
          <span>{showMonthDays ? tr('إخفاء', 'Hide') : tr('عرض', 'Show')}</span>
        </button>
        {showMonthDays && <div className="max-h-96 overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-white"><tr><th className="p-2">{tr('التاريخ', 'Date')}</th><th>{tr('اليوم', 'Day')}</th><th>{tr('نوع اليوم', 'Day type')}</th><th>{tr('من', 'From')}</th><th>{tr('إلى', 'To')}</th></tr></thead><tbody>{monthDays.map(day => {
          const mode = day.override?.mode || 'DEFAULT';
          const isWorkday = mode === 'WORKDAY' || (mode === 'DEFAULT' && day.weekly.enabled);
          return <tr key={day.date} className="border-t"><td className="p-2 text-center font-mono">{day.date}</td><td className="text-center font-bold">{ar ? weekdaysAr[day.weekday] : weekdaysEn[day.weekday]}</td><td className="p-1"><select value={mode} onChange={event => updateDayOverride(day.date,{ mode:event.target.value as DayOverrideMode })} className="w-full border rounded-lg p-1.5"><option value="DEFAULT">{tr(day.weekly.enabled ? 'حسب الأسبوع: عمل' : 'حسب الأسبوع: راحة', day.weekly.enabled ? 'Weekly: workday' : 'Weekly: off')}</option><option value="WORKDAY">{tr('يوم عمل', 'Workday')}</option><option value="OFF">{tr('راحة', 'Off')}</option><option value="LEAVE">{tr('إجازة', 'Leave')}</option><option value="HOLIDAY">{tr('عطلة رسمية', 'Public holiday')}</option><option value="MISSION">{tr('مهمة عمل', 'Business mission')}</option><option value="IGNORE">{tr('استبعاد من الفحص', 'Ignore')}</option></select></td><td className="text-center"><input type="time" disabled={!isWorkday} value={day.override?.start || day.weekly.start} onChange={event => updateDayOverride(day.date,{ mode:mode === 'DEFAULT' ? 'WORKDAY' : mode,start:event.target.value })} className="border rounded-lg p-1 disabled:bg-slate-100"/></td><td className="text-center"><input type="time" disabled={!isWorkday} value={day.override?.end || day.weekly.end} onChange={event => updateDayOverride(day.date,{ mode:mode === 'DEFAULT' ? 'WORKDAY' : mode,end:event.target.value })} className="border rounded-lg p-1 disabled:bg-slate-100"/></td></tr>;
        })}</tbody></table></div>}
      </div>
      <div className="flex flex-wrap gap-3 items-center"><input type="file" accept=".csv,text/csv" onChange={event => { setFile(event.target.files?.[0] || null); setPreview([]); }} className="text-xs"/><button onClick={readPreview} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold inline-flex gap-2"><Upload className="w-4 h-4"/>{tr('تحليل ومعاينة', 'Analyze and preview')}</button></div>
      {error && <p className="text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs font-bold">{error}</p>}
    </section>
    {reportRows.length > 0 && <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="p-4 flex flex-wrap justify-between gap-3"><div><h3 className="font-bold">{preview.length ? tr('مراجعة وتعديل النتيجة قبل الحفظ', 'Review and edit before saving') : tr('نتائج الشهر المحفوظة', 'Saved monthly results')}</h3><p className="text-xs text-slate-500">{tr('عدّل الوقت أو الحالة أو التأخير والملاحظة. النتائج لا تُنشئ خصمًا في المسير تلقائيًا.', 'Edit times, status, lateness, or notes. Results do not create payroll deductions automatically.')}</p></div><div className="flex flex-wrap items-center gap-2">{preview.length > 0 && <label className="inline-flex items-center gap-2 text-xs font-bold border rounded-xl px-3 py-2"><input type="checkbox" checked={reviewConfirmed} onChange={event => setReviewConfirmed(event.target.checked)}/>{tr('راجعت النتائج', 'Results reviewed')}</label>}{preview.length > 0 && <button disabled={saving || !reviewConfirmed} onClick={save} className="px-4 py-2 bg-emerald-600 disabled:bg-slate-300 text-white rounded-xl font-bold">{saving ? tr('جارٍ الحفظ...', 'Saving...') : tr('حفظ النتيجة', 'Save results')}</button>}<button disabled={preview.length > 0 && !reviewConfirmed} onClick={printReport} className="px-4 py-2 border disabled:text-slate-300 rounded-xl font-bold inline-flex gap-2"><Printer className="w-4 h-4"/>{tr('إصدار التقرير', 'Issue report')}</button></div></div>
      <div className="overflow-x-auto"><table className="w-full text-xs min-w-[1050px]"><thead><tr className="bg-slate-50"><th className="p-2">{tr('التاريخ', 'Date')}</th><th>{tr('الدوام', 'Schedule')}</th><th>{tr('الحضور', 'Check-in')}</th><th>{tr('الانصراف', 'Check-out')}</th><th>{tr('التأخير', 'Late')}</th><th>{tr('الحالة', 'Status')}</th><th>{tr('ملاحظات', 'Notes')}</th><th>{tr('حساب', 'Calculate')}</th></tr></thead><tbody>{reportRows.map(row => {
        const editable = preview.length > 0;
        return <tr key={row.id} className="border-t"><td className="p-2 text-center font-mono">{row.date}</td><td className="text-center">{row.scheduledStart || '-'} - {row.scheduledEnd || '-'}</td><td className="p-1 text-center">{editable ? <input type="time" value={row.actualCheckIn || ''} onChange={event => updatePreviewRow(row.id,{ actualCheckIn:event.target.value || undefined })} className="border rounded-lg p-1"/> : row.actualCheckIn || '-'}</td><td className="p-1 text-center">{editable ? <input type="time" value={row.actualCheckOut || ''} onChange={event => updatePreviewRow(row.id,{ actualCheckOut:event.target.value || undefined })} className="border rounded-lg p-1"/> : row.actualCheckOut || '-'}</td><td className="p-1 text-center">{editable ? <input type="number" min="0" value={row.calculatedDelayMinutes || 0} onChange={event => updatePreviewRow(row.id,{ calculatedDelayMinutes:Math.max(0,Number(event.target.value) || 0) })} className="w-20 border rounded-lg p-1 text-center"/> : row.calculatedDelayMinutes || 0}</td><td className="p-1 text-center">{editable ? <select value={row.attendanceStatus || 'REVIEW'} onChange={event => updatePreviewRow(row.id,{ attendanceStatus:event.target.value as AttendanceRecord['attendanceStatus'] })} className="border rounded-lg p-1"><option value="PRESENT">{tr('حاضر', 'Present')}</option><option value="LATE">{tr('متأخر', 'Late')}</option><option value="ABSENT">{tr('غياب', 'Absent')}</option><option value="LEAVE">{tr('إجازة', 'Leave')}</option><option value="OFF">{tr('راحة', 'Off')}</option><option value="HOLIDAY">{tr('عطلة رسمية', 'Public holiday')}</option><option value="MISSION">{tr('مهمة عمل', 'Business mission')}</option><option value="IGNORED">{tr('مستبعد', 'Ignored')}</option><option value="MISSING_IN">{tr('دخول ناقص', 'Missing check-in')}</option><option value="MISSING_OUT">{tr('خروج ناقص', 'Missing check-out')}</option><option value="REVIEW">{tr('مراجعة', 'Review')}</option></select> : <span className="font-bold">{statusLabel(row.attendanceStatus, ar)}</span>}</td><td className="p-1">{editable ? <input value={row.notes || ''} onChange={event => updatePreviewRow(row.id,{ notes:event.target.value })} className="w-full min-w-48 border rounded-lg p-1.5"/> : row.notes || '-'}</td><td className="text-center">{editable ? <button type="button" onClick={() => { recalculateRow(row.id); setReviewConfirmed(false); }} className="p-2 border rounded-lg text-blue-700" title={tr('إعادة حساب اليوم', 'Recalculate day')}><RefreshCw className="w-4 h-4"/></button> : '-'}</td></tr>;
      })}</tbody></table></div>
    </section>}
  </div>;
};
