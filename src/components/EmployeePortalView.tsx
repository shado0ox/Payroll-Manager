import React, { useEffect, useState } from 'react';
import { CalendarDays, Clock3, FileText, Landmark, LogOut, Printer, RefreshCw, ShieldCheck, UserRound, X } from 'lucide-react';
import { api, type EmployeeAttendanceReport, type EmployeeBankChangeRequest, type EmployeeLeave, type EmployeeLeaveReport, type EmployeePayslipDetail, type EmployeePayslipSummary, type EmployeePortalProfile } from '../utils/api';
import { useLanguage } from '../i18n/LanguageContext';

type Props = { onLogout:() => void };

export const EmployeePortalView: React.FC<Props> = ({ onLogout }) => {
  const { language } = useLanguage();
  const [data,setData] = useState<EmployeePortalProfile | null>(null);
  const [payslips,setPayslips] = useState<EmployeePayslipSummary[]>([]);
  const [selectedPayslip,setSelectedPayslip] = useState<EmployeePayslipDetail | null>(null);
  const [payslipsLoading,setPayslipsLoading] = useState(false);
  const [attendancePeriod,setAttendancePeriod] = useState(() => new Date().toLocaleDateString('en-CA',{ timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit' }).slice(0,7));
  const [attendance,setAttendance] = useState<EmployeeAttendanceReport | null>(null);
  const [attendanceLoading,setAttendanceLoading] = useState(false);
  const [leaveYear,setLeaveYear] = useState(() => Number(new Date().toLocaleDateString('en-CA',{ timeZone:'Asia/Riyadh',year:'numeric' })));
  const [leaveReport,setLeaveReport] = useState<EmployeeLeaveReport | null>(null);
  const [leaveLoading,setLeaveLoading] = useState(false);
  const [leaveError,setLeaveError] = useState('');
  const [leaveForm,setLeaveForm] = useState<{type:EmployeeLeave['type'];startDate:string;endDate:string;reason:string}>({ type:'ANNUAL',startDate:'',endDate:'',reason:'' });
  const [bankRequests,setBankRequests] = useState<EmployeeBankChangeRequest[]>([]);
  const [bankForm,setBankForm] = useState({ iban:'',reason:'' });
  const [bankLoading,setBankLoading] = useState(false);
  const [bankError,setBankError] = useState('');
  const [error,setError] = useState('');

  const load = () => {
    setError('');
    api.employeePortalMe().then(setData).catch((reason:any) => setError(String(reason?.message || 'EMPLOYEE_PORTAL_LOAD_FAILED')));
  };
  useEffect(load,[]);

  const loadPayslips = async () => {
    setPayslipsLoading(true);
    try { setPayslips((await api.employeePortalPayslips()).payslips); }
    catch (reason:any) { setError(String(reason?.message || 'EMPLOYEE_PAYSLIPS_LOAD_FAILED')); }
    finally { setPayslipsLoading(false); }
  };
  useEffect(() => { if (data) void loadPayslips(); },[data]);
  const loadAttendance = async (periodMonth = attendancePeriod) => {
    setAttendanceLoading(true);
    try { setAttendance(await api.employeePortalAttendance(periodMonth)); }
    catch (reason:any) { setError(String(reason?.message || 'EMPLOYEE_ATTENDANCE_LOAD_FAILED')); }
    finally { setAttendanceLoading(false); }
  };
  useEffect(() => { if (data) void loadAttendance(attendancePeriod); },[data,attendancePeriod]);
  const loadLeaves = async (year = leaveYear) => {
    setLeaveLoading(true); setLeaveError('');
    try { setLeaveReport(await api.employeePortalLeaves(year)); }
    catch (reason:any) { setLeaveError(String(reason?.message || 'EMPLOYEE_LEAVES_LOAD_FAILED')); }
    finally { setLeaveLoading(false); }
  };
  useEffect(() => { if (data) void loadLeaves(leaveYear); },[data,leaveYear]);
  const loadBankRequests = async () => {
    setBankLoading(true); setBankError('');
    try { setBankRequests((await api.employeePortalBankChangeRequests()).requests); }
    catch (reason:any) { setBankError(String(reason?.message || 'BANK_CHANGE_REQUESTS_LOAD_FAILED')); }
    finally { setBankLoading(false); }
  };
  useEffect(() => { if (data) void loadBankRequests(); },[data]);
  const submitBankChange = async (event:React.FormEvent) => {
    event.preventDefault(); setBankLoading(true); setBankError('');
    try { await api.createEmployeePortalBankChangeRequest(bankForm.iban,bankForm.reason); setBankForm({ iban:'',reason:'' }); await loadBankRequests(); }
    catch (reason:any) { setBankError(String(reason?.message || 'BANK_CHANGE_REQUEST_FAILED')); setBankLoading(false); }
  };
  const submitLeave = async (event:React.FormEvent) => {
    event.preventDefault(); setLeaveLoading(true); setLeaveError('');
    try { await api.createEmployeePortalLeave(leaveForm); setLeaveForm({ type:'ANNUAL',startDate:'',endDate:'',reason:'' }); await loadLeaves(); }
    catch (reason:any) { setLeaveError(String(reason?.message || 'EMPLOYEE_LEAVE_CREATE_FAILED')); setLeaveLoading(false); }
  };
  const cancelLeave = async (id:string) => {
    if (!window.confirm(language === 'ar' ? 'هل تريد إلغاء طلب الإجازة المعلق؟' : 'Cancel this pending leave request?')) return;
    setLeaveLoading(true); setLeaveError('');
    try { await api.cancelEmployeePortalLeave(id); await loadLeaves(); }
    catch (reason:any) { setLeaveError(String(reason?.message || 'EMPLOYEE_LEAVE_CANCEL_FAILED')); setLeaveLoading(false); }
  };
  const openPayslip = async (item:EmployeePayslipSummary) => {
    setPayslipsLoading(true);
    try { setSelectedPayslip((await api.employeePortalPayslip(item.payment.batchId,item.periodMonth)).payslip); }
    catch (reason:any) { setError(String(reason?.message || 'EMPLOYEE_PAYSLIP_LOAD_FAILED')); }
    finally { setPayslipsLoading(false); }
  };

  if (!data) return <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
    <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl">
      {error ? <>
        <ShieldCheck className="mx-auto h-10 w-10 text-rose-400" />
        <h1 className="mt-4 text-lg font-black">{language === 'ar' ? 'تعذر فتح بوابة الموظف' : 'Employee portal unavailable'}</h1>
        <p className="mt-2 text-sm text-slate-400">{error}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={load} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold"><RefreshCw className="me-2 inline h-4 w-4" />{language === 'ar' ? 'إعادة المحاولة' : 'Retry'}</button>
          <button onClick={onLogout} className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold">{language === 'ar' ? 'تسجيل الخروج' : 'Sign out'}</button>
        </div>
      </> : <div className="flex items-center justify-center gap-3 text-sm font-bold"><RefreshCw className="h-5 w-5 animate-spin text-emerald-400" />{language === 'ar' ? 'جارٍ تحميل بياناتك الآمنة...' : 'Loading your secure profile...'}</div>}
    </div>
  </div>;

  const { profile,company,subscription } = data;
  const name = language === 'ar'
    ? `${profile.firstNameAr} ${profile.lastNameAr}`.trim()
    : (`${profile.firstNameEn} ${profile.lastNameEn}`.trim() || `${profile.firstNameAr} ${profile.lastNameAr}`.trim());
  const money = (value:number) => new Intl.NumberFormat(language === 'ar' ? 'ar-SA' : 'en-US',{ minimumFractionDigits:2,maximumFractionDigits:2 }).format(value);
  const monthName = (period:string) => {
    const [year,month] = period.split('-').map(Number);
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-US',{ month:'long',year:'numeric',timeZone:'UTC' }).format(new Date(Date.UTC(year,month - 1,1)));
  };
  const cards = [
    { icon:FileText,titleAr:'الرواتب المدفوعة',titleEn:'Paid salaries',textAr:`${payslips.length} قسيمة مؤكدة الدفع`,textEn:`${payslips.length} confirmed payslips`,ready:true },
    { icon:Clock3,titleAr:'الحضور والغياب',titleEn:'Attendance',textAr:attendance ? `${attendance.summary.lateDays} أيام تأخير · ${attendance.summary.absenceDays} أيام غياب` : 'الحضور والتأخير والغياب المسجل',textEn:attendance ? `${attendance.summary.lateDays} late days · ${attendance.summary.absenceDays} absent days` : 'Recorded attendance, delay, and absence',ready:true },
    { icon:CalendarDays,titleAr:'الإجازات',titleEn:'Leave',textAr:leaveReport ? `${leaveReport.annualBalance.remainingDays} يوم سنوي متبقي` : 'الرصيد والطلبات وسجل الإجازات',textEn:leaveReport ? `${leaveReport.annualBalance.remainingDays} annual days remaining` : 'Balance, requests, and leave history',ready:true },
  ];

  return <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-slate-100 text-slate-900">
    <header className="border-b border-slate-800 bg-slate-950 text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-emerald-500/15 text-emerald-400">
            {company.logo ? <img src={company.logo} alt="" className="h-full w-full object-contain" /> : <ShieldCheck className="h-6 w-6" />}
          </div>
          <div><div className="text-sm font-black">{language === 'ar' ? company.nameAr : company.nameEn || company.nameAr}</div><div className="text-xs text-slate-400">{language === 'ar' ? 'بوابة الموظف' : 'Employee Portal'}</div></div>
        </div>
        <button onClick={onLogout} className="flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold hover:bg-slate-800"><LogOut className="h-4 w-4" />{language === 'ar' ? 'خروج' : 'Sign out'}</button>
      </div>
    </header>

    <main className="mx-auto max-w-6xl space-y-6 px-5 py-8">
      {subscription?.expired && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-900">
        {language === 'ar' ? 'اشتراك المنشأة معلّق. يمكنك الاطلاع على بياناتك الحالية فقط.' : 'The company subscription is suspended. Existing information remains read-only.'}
        {subscription.deletionScheduledAt && <span> {language === 'ar' ? 'تاريخ الحذف المجدول:' : 'Scheduled deletion:'} <span dir="ltr">{new Date(subscription.deletionScheduledAt).toLocaleDateString('en-GB')}</span></span>}
      </div>}

      <section className="overflow-hidden rounded-3xl bg-gradient-to-l from-emerald-700 to-slate-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div><p className="text-sm text-emerald-200">{language === 'ar' ? 'مرحبًا بك' : 'Welcome'}</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">{name}</h1><p className="mt-2 text-sm text-slate-300">{profile.jobTitle || '—'} · {profile.department || '—'}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-4 backdrop-blur"><div className="text-xs text-slate-300">{language === 'ar' ? 'الرقم الوظيفي' : 'Employee No.'}</div><div className="mt-1 font-mono text-xl font-black" dir="ltr">{profile.employeeNo}</div></div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {cards.map(({ icon:Icon,...card }) => <article key={card.titleEn} className={`rounded-2xl border bg-white p-5 shadow-sm ${card.ready ? 'border-emerald-300' : 'border-slate-200'}`}>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Icon className="h-5 w-5" /></div>
          <h2 className="mt-4 font-black">{language === 'ar' ? card.titleAr : card.titleEn}</h2><p className="mt-2 text-xs leading-6 text-slate-500">{language === 'ar' ? card.textAr : card.textEn}</p>
          <span className={`mt-4 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${card.ready ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'}`}>{card.ready ? (language === 'ar' ? 'متاح الآن' : 'Available now') : (language === 'ar' ? 'قيد الإضافة في المرحلة التالية' : 'Coming in the next phase')}</span>
        </article>)}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-emerald-700" /><h2 className="font-black">{language === 'ar' ? 'الإجازات والطلبات' : 'Leave and requests'}</h2></div><div className="flex items-center gap-2"><select value={leaveYear} onChange={event => setLeaveYear(Number(event.target.value))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">{[leaveYear - 1,leaveYear,leaveYear + 1].map(year => <option key={year} value={year}>{year}</option>)}</select><button onClick={() => void loadLeaves()} disabled={leaveLoading} className="rounded-xl border border-slate-200 p-2 text-slate-500"><RefreshCw className={`h-4 w-4 ${leaveLoading ? 'animate-spin' : ''}`} /></button></div></div>
        {leaveReport && <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"><AttendanceSummary label={language === 'ar' ? 'الاستحقاق السنوي' : 'Annual entitlement'} value={leaveReport.annualBalance.entitlementDays} tone="sky" /><AttendanceSummary label={language === 'ar' ? 'افتتاحي/مرحّل' : 'Opening/carried'} value={leaveReport.annualBalance.openingBalanceDays} tone="sky" /><AttendanceSummary label={language === 'ar' ? 'مستلم سابقًا' : 'Previously taken'} value={leaveReport.annualBalance.priorUsedDays} tone="amber" /><AttendanceSummary label={language === 'ar' ? 'المعتمد' : 'Approved'} value={leaveReport.annualBalance.approvedDays} tone="emerald" /><AttendanceSummary label={language === 'ar' ? 'قيد المراجعة' : 'Pending'} value={leaveReport.annualBalance.pendingDays} tone="amber" /><AttendanceSummary label={language === 'ar' ? 'المتبقي' : 'Remaining'} value={leaveReport.annualBalance.remainingDays} tone={leaveReport.annualBalance.remainingDays < 0 ? 'rose' : 'emerald'} /></div>}
        <form onSubmit={submitLeave} className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div><label className="mb-1 block text-xs font-bold text-slate-600">{language === 'ar' ? 'نوع الإجازة' : 'Leave type'}</label><select value={leaveForm.type} onChange={event => setLeaveForm(current => ({ ...current,type:event.target.value as EmployeeLeave['type'] }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="ANNUAL">{language === 'ar' ? 'سنوية' : 'Annual'}</option><option value="SICK">{language === 'ar' ? 'مرضية' : 'Sick'}</option><option value="EMERGENCY">{language === 'ar' ? 'طارئة' : 'Emergency'}</option><option value="UNPAID">{language === 'ar' ? 'بدون راتب' : 'Unpaid'}</option><option value="MATERNITY">{language === 'ar' ? 'أمومة' : 'Maternity'}</option></select></div>
          <div><label className="mb-1 block text-xs font-bold text-slate-600">{language === 'ar' ? 'من تاريخ' : 'From'}</label><input required type="date" value={leaveForm.startDate} onChange={event => setLeaveForm(current => ({ ...current,startDate:event.target.value,endDate:current.endDate < event.target.value ? event.target.value : current.endDate }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" /></div>
          <div><label className="mb-1 block text-xs font-bold text-slate-600">{language === 'ar' ? 'إلى تاريخ' : 'To'}</label><input required type="date" min={leaveForm.startDate} value={leaveForm.endDate} onChange={event => setLeaveForm(current => ({ ...current,endDate:event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" /></div>
          <div><label className="mb-1 block text-xs font-bold text-slate-600">{language === 'ar' ? 'السبب/الملاحظة' : 'Reason / note'}</label><input maxLength={500} value={leaveForm.reason} onChange={event => setLeaveForm(current => ({ ...current,reason:event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" /></div>
          <div className="flex items-end"><button disabled={leaveLoading} className="w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white disabled:bg-slate-300">{language === 'ar' ? 'تقديم الطلب' : 'Submit request'}</button></div>
        </form>
        {leaveError && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">{leaveMessage(leaveError,language)}</div>}
        {leaveReport?.leaves.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b bg-slate-50 text-slate-500"><th className="p-3 text-start">{language === 'ar' ? 'النوع' : 'Type'}</th><th className="p-3 text-start">{language === 'ar' ? 'الفترة' : 'Period'}</th><th className="p-3 text-center">{language === 'ar' ? 'الأيام' : 'Days'}</th><th className="p-3 text-start">{language === 'ar' ? 'الحالة' : 'Status'}</th><th className="p-3 text-start">{language === 'ar' ? 'الملاحظة' : 'Note'}</th><th className="p-3"></th></tr></thead><tbody>{leaveReport.leaves.map(leave => <tr key={leave.id} className="border-b last:border-0"><td className="p-3 font-bold">{leaveTypeLabel(leave.type,language)}</td><td className="p-3" dir="ltr">{leave.startDate} — {leave.endDate}</td><td className="p-3 text-center font-bold">{leave.daysCount}</td><td className="p-3"><LeaveStatus status={leave.status} language={language} /></td><td className="max-w-64 p-3 text-xs text-slate-500">{leave.reason || '—'}</td><td className="p-3 text-end">{leave.status === 'PENDING' && <button onClick={() => void cancelLeave(leave.id)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700">{language === 'ar' ? 'إلغاء' : 'Cancel'}</button>}</td></tr>)}</tbody></table></div> : <div className="mt-5 rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">{language === 'ar' ? 'لا توجد طلبات إجازة مسجلة.' : 'No leave requests recorded.'}</div>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-emerald-700" /><h2 className="font-black">{language === 'ar' ? 'سجل الحضور والغياب' : 'Attendance record'}</h2></div><div className="flex items-center gap-2"><input type="month" value={attendancePeriod} onChange={event => setAttendancePeriod(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" /><button onClick={() => void loadAttendance()} disabled={attendanceLoading} className="rounded-xl border border-slate-200 p-2 text-slate-500"><RefreshCw className={`h-4 w-4 ${attendanceLoading ? 'animate-spin' : ''}`} /></button></div></div>
        {attendance && <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <AttendanceSummary label={language === 'ar' ? 'أيام الحضور' : 'Present days'} value={attendance.summary.presentDays} tone="emerald" />
            <AttendanceSummary label={language === 'ar' ? 'أيام التأخير' : 'Late days'} value={attendance.summary.lateDays} tone="amber" />
            <AttendanceSummary label={language === 'ar' ? 'إجمالي التأخير' : 'Total delay'} value={`${Math.floor(attendance.summary.totalDelayMinutes / 60)}:${String(attendance.summary.totalDelayMinutes % 60).padStart(2,'0')}`} tone="amber" />
            <AttendanceSummary label={language === 'ar' ? 'أيام الغياب' : 'Absent days'} value={attendance.summary.absenceDays} tone="rose" />
            <AttendanceSummary label={language === 'ar' ? 'أيام الإجازة' : 'Leave days'} value={attendance.summary.leaveDays} tone="sky" />
            <AttendanceSummary label={language === 'ar' ? 'بصمات ناقصة' : 'Missing punches'} value={attendance.summary.missingPunchDays} tone="rose" />
          </div>
          {attendance.records.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b bg-slate-50 text-slate-500"><th className="p-3 text-start">{language === 'ar' ? 'التاريخ' : 'Date'}</th><th className="p-3 text-start">{language === 'ar' ? 'الدوام' : 'Schedule'}</th><th className="p-3 text-start">{language === 'ar' ? 'الحضور' : 'Check-in'}</th><th className="p-3 text-start">{language === 'ar' ? 'الانصراف' : 'Check-out'}</th><th className="p-3 text-end">{language === 'ar' ? 'التأخير' : 'Delay'}</th><th className="p-3 text-start">{language === 'ar' ? 'الحالة' : 'Status'}</th><th className="p-3 text-start">{language === 'ar' ? 'ملاحظات' : 'Notes'}</th></tr></thead><tbody>{attendance.records.map(record => <tr key={record.id} className="border-b last:border-0"><td className="p-3 font-bold" dir="ltr">{record.date}{record.endDate && record.endDate !== record.date ? ` — ${record.endDate}` : ''}</td><td className="p-3" dir="ltr">{record.scheduledStart && record.scheduledEnd ? `${record.scheduledStart} — ${record.scheduledEnd}` : '—'}</td><td className="p-3" dir="ltr">{record.actualCheckIn || '—'}</td><td className="p-3" dir="ltr">{record.actualCheckOut || '—'}</td><td className="p-3 text-end font-bold" dir="ltr">{record.delayMinutes ? `${record.delayMinutes} min` : '—'}</td><td className="p-3"><AttendanceStatus status={record.status} language={language} /></td><td className="max-w-64 p-3 text-xs text-slate-500">{record.notes || '—'}</td></tr>)}</tbody></table></div> : <div className="mt-5 rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">{attendanceLoading ? (language === 'ar' ? 'جارٍ تحميل السجل...' : 'Loading attendance...') : (language === 'ar' ? 'لا توجد سجلات في الشهر المحدد.' : 'No records for the selected month.')}</div>}
        </>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><FileText className="h-5 w-5 text-emerald-700" /><h2 className="font-black">{language === 'ar' ? 'قسائم الرواتب المدفوعة' : 'Paid payslips'}</h2></div><button onClick={loadPayslips} disabled={payslipsLoading} className="rounded-xl border border-slate-200 p-2 text-slate-500"><RefreshCw className={`h-4 w-4 ${payslipsLoading ? 'animate-spin' : ''}`} /></button></div>
        {payslips.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b bg-slate-50 text-slate-500"><th className="p-3 text-start">{language === 'ar' ? 'الشهر' : 'Month'}</th><th className="p-3 text-end">{language === 'ar' ? 'الإجمالي' : 'Gross'}</th><th className="p-3 text-end">{language === 'ar' ? 'الخصومات' : 'Deductions'}</th><th className="p-3 text-end">{language === 'ar' ? 'المبلغ المدفوع' : 'Paid amount'}</th><th className="p-3 text-start">{language === 'ar' ? 'تاريخ الدفع' : 'Payment date'}</th><th className="p-3"></th></tr></thead><tbody>{payslips.map(item => <tr key={item.id} className="border-b last:border-0"><td className="p-3 font-bold">{monthName(item.periodMonth)}</td><td className="p-3 text-end" dir="ltr">{money(item.grossSalary)} SR</td><td className="p-3 text-end text-rose-700" dir="ltr">{money(item.totalDeductions)} SR</td><td className="p-3 text-end font-black text-emerald-700" dir="ltr">{money(item.paidAmount)} SR</td><td className="p-3" dir="ltr">{item.payment.paymentDate || '—'}</td><td className="p-3 text-end"><button onClick={() => void openPayslip(item)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">{language === 'ar' ? 'عرض' : 'View'}</button></td></tr>)}</tbody></table></div> : <div className="mt-5 rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">{payslipsLoading ? (language === 'ar' ? 'جارٍ تحميل القسائم...' : 'Loading payslips...') : (language === 'ar' ? 'لا توجد دفعات مؤكدة حتى الآن.' : 'No confirmed payments yet.')}</div>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><UserRound className="h-5 w-5 text-emerald-700" /><h2 className="font-black">{language === 'ar' ? 'بياناتي الوظيفية' : 'My employment profile'}</h2></div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs text-slate-500">{language === 'ar' ? 'القسم' : 'Department'}</dt><dd className="mt-1 font-bold">{profile.department || '—'}</dd></div>
          <div><dt className="text-xs text-slate-500">{language === 'ar' ? 'المسمى الوظيفي' : 'Job title'}</dt><dd className="mt-1 font-bold">{profile.jobTitle || '—'}</dd></div>
          <div><dt className="text-xs text-slate-500">{language === 'ar' ? 'تاريخ التعيين' : 'Hire date'}</dt><dd className="mt-1 font-bold" dir="ltr">{profile.hireDate || '—'}</dd></div>
          <div><dt className="text-xs text-slate-500">{language === 'ar' ? 'الحالة' : 'Status'}</dt><dd className="mt-1 font-bold text-emerald-700">{profile.status}</dd></div>
          <div><dt className="text-xs text-slate-500">{language === 'ar' ? (profile.nationality === 'SAUDI' ? 'انتهاء العقد' : 'انتهاء الإقامة') : (profile.nationality === 'SAUDI' ? 'Contract expiry' : 'Iqama expiry')}</dt><dd className="mt-1 font-bold" dir="ltr">{profile.nationality === 'SAUDI' ? (profile.contractEndDate || '—') : (profile.iqamaExpiryDate || '—')}</dd></div>
          <div><dt className="text-xs text-slate-500">{language === 'ar' ? 'البنك' : 'Bank'}</dt><dd className="mt-1 font-bold">{profile.bankName || '—'}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-slate-500">IBAN</dt><dd className="mt-1 break-all font-mono font-bold" dir="ltr">{profile.bankIban || '—'}</dd></div>
          <div><dt className="text-xs text-slate-500">SWIFT / BIC</dt><dd className="mt-1 font-mono font-bold" dir="ltr">{profile.bankSwiftCode || '—'}</dd></div>
        </dl>
        <div className="mt-6 border-t pt-5">
          <div className="flex items-center gap-2"><Landmark className="h-5 w-5 text-sky-700" /><h3 className="font-black">{language === 'ar' ? 'طلب تعديل بيانات البنك' : 'Bank details change request'}</h3></div>
          <p className="mt-1 text-xs text-slate-500">{language === 'ar' ? 'لن تتغير بيانات الصرف حتى تعتمد الإدارة الطلب.' : 'Payroll bank details remain unchanged until management approves the request.'}</p>
          {!bankRequests.some(request => request.status === 'PENDING') && !subscription?.readOnly && <form onSubmit={submitBankChange} className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2"><label className="mb-1 block text-xs font-bold text-slate-600">IBAN</label><input required value={bankForm.iban} onChange={event => setBankForm(current => ({ ...current,iban:event.target.value.toUpperCase() }))} placeholder="SA00 0000 0000 0000 0000 0000" dir="ltr" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm" /></div>
            <div><label className="mb-1 block text-xs font-bold text-slate-600">{language === 'ar' ? 'سبب التعديل (اختياري)' : 'Reason (optional)'}</label><input maxLength={500} value={bankForm.reason} onChange={event => setBankForm(current => ({ ...current,reason:event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" /></div>
            <div className="flex items-end"><button disabled={bankLoading} className="w-full rounded-xl bg-sky-700 px-4 py-2 text-sm font-black text-white disabled:bg-slate-300">{bankLoading ? '...' : (language === 'ar' ? 'إرسال للمراجعة' : 'Submit for review')}</button></div>
          </form>}
          {bankError && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">{bankMessage(bankError,language)}</div>}
          {bankRequests.length > 0 && <div className="mt-4 space-y-2">{bankRequests.map(request => <div key={request.id} className="rounded-xl border border-slate-200 p-3 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><strong dir="ltr">{request.requestedIban}</strong><BankRequestStatus status={request.status} language={language} /></div><div className="mt-1 text-slate-500">{request.requestedBankName} · {request.requestedAt ? new Date(request.requestedAt).toLocaleDateString('en-GB') : '—'}</div>{request.reviewReason && <div className="mt-2 text-slate-700">{language === 'ar' ? 'ملاحظة الإدارة:' : 'Management note:'} {request.reviewReason}</div>}</div>)}</div>}
        </div>
      </section>
    </main>

    {selectedPayslip && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 p-4 print:static print:bg-white print:p-0"><div className="mx-auto my-8 max-w-4xl rounded-3xl bg-white p-6 shadow-2xl print:my-0 print:max-w-none print:rounded-none print:shadow-none sm:p-8">
      <div className="flex items-center justify-between gap-3 print:hidden"><h2 className="text-xl font-black">{language === 'ar' ? 'قسيمة راتب' : 'Payslip'}</h2><div className="flex gap-2"><button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white"><Printer className="h-4 w-4" />{language === 'ar' ? 'طباعة' : 'Print'}</button><button onClick={() => setSelectedPayslip(null)} className="rounded-xl border p-2"><X className="h-5 w-5" /></button></div></div>
      <PayslipDocument payslip={selectedPayslip} company={company} language={language} money={money} monthName={monthName} />
    </div></div>}
  </div>;
};

const PayslipDocument = ({ payslip,company,language,money,monthName }:{payslip:EmployeePayslipDetail;company:EmployeePortalProfile['company'];language:string;money:(value:number)=>string;monthName:(period:string)=>string}) => {
  const { snapshot,payment } = payslip;
  const earningRows = [
    ['الراتب الأساسي','Base salary',snapshot.earnings.baseSalary],['بدل السكن','Housing allowance',snapshot.earnings.housingAllowance],
    ['بدل النقل','Transport allowance',snapshot.earnings.transportAllowance],['بدلات أخرى','Other allowances',snapshot.earnings.otherAllowances + snapshot.earnings.nonGosiAllowances],
    ['العمل الإضافي','Overtime',snapshot.earnings.overtimeAmount],['المكافآت والإضافات','Bonuses and additions',snapshot.earnings.bonuses + snapshot.earnings.manualAddition],
  ].filter(row => Number(row[2]) !== 0);
  const deductionRows = [
    ['التأخير','Delay',snapshot.deductions.delayDeduction],['الغياب','Absence',snapshot.deductions.absenceDeduction],['إجازة بدون راتب','Unpaid leave',snapshot.deductions.unpaidLeaveDeduction],
    ['التأمينات الاجتماعية','GOSI',snapshot.deductions.gosiEmployeeShare],['السلف','Loans',snapshot.deductions.loanDeduction],['الجزاءات','Penalties',snapshot.deductions.penaltiesDeduction],
    ['خصومات أخرى','Other deductions',snapshot.deductions.otherDeductions + snapshot.deductions.manualDeduction],
  ].filter(row => Number(row[2]) !== 0);
  return <div className="mt-6 border border-slate-200 p-6 print:mt-0 print:border-slate-400">
    <div className="flex items-start justify-between gap-5 border-b pb-5"> <div>{company.logo && <img src={company.logo} alt="" className="mb-3 h-14 max-w-40 object-contain" />}<h1 className="text-xl font-black">{language === 'ar' ? company.nameAr : company.nameEn || company.nameAr}</h1><p className="text-sm text-slate-500">{language === 'ar' ? 'قسيمة راتب مدفوع' : 'Paid salary payslip'}</p></div><div className="text-end"><div className="text-lg font-black">{monthName(payslip.periodMonth)}</div><div className="mt-1 text-xs text-slate-500" dir="ltr">{payment.batchNumber}</div></div></div>
    <dl className="grid grid-cols-2 gap-4 border-b py-5 text-sm sm:grid-cols-4"><div><dt className="text-slate-500">{language === 'ar' ? 'الموظف' : 'Employee'}</dt><dd className="font-bold">{snapshot.employeeName}</dd></div><div><dt className="text-slate-500">{language === 'ar' ? 'الرقم الوظيفي' : 'Employee No.'}</dt><dd className="font-bold" dir="ltr">{snapshot.employeeNo}</dd></div><div><dt className="text-slate-500">{language === 'ar' ? 'القسم' : 'Department'}</dt><dd className="font-bold">{snapshot.department || '—'}</dd></div><div><dt className="text-slate-500">{language === 'ar' ? 'تاريخ الدفع' : 'Payment date'}</dt><dd className="font-bold" dir="ltr">{payment.paymentDate || '—'}</dd></div></dl>
    <div className="grid gap-6 py-5 sm:grid-cols-2"><PayslipRows title={language === 'ar' ? 'الاستحقاقات' : 'Earnings'} rows={earningRows} language={language} money={money} /><PayslipRows title={language === 'ar' ? 'الخصومات' : 'Deductions'} rows={deductionRows} language={language} money={money} /></div>
    <div className="grid gap-3 border-y bg-slate-50 p-4 text-sm sm:grid-cols-3"><div>{language === 'ar' ? 'إجمالي الاستحقاقات' : 'Gross earnings'}<strong className="block text-lg" dir="ltr">{money(snapshot.earnings.totalGrossSalary)} SR</strong></div><div>{language === 'ar' ? 'إجمالي الخصومات' : 'Total deductions'}<strong className="block text-lg text-rose-700" dir="ltr">{money(snapshot.deductions.totalDeductions)} SR</strong></div><div>{language === 'ar' ? 'المبلغ المحول' : 'Transferred amount'}<strong className="block text-xl text-emerald-700" dir="ltr">{money(payslip.paidAmount)} SR</strong></div></div>
    <div className="mt-5 flex justify-between gap-5 text-xs text-slate-500"><span>{language === 'ar' ? 'مرجع الدفع:' : 'Payment reference:'} {payment.reference || '—'}</span><span>{language === 'ar' ? 'طريقة الدفع:' : 'Payment method:'} {payment.method}</span></div>
    <div className="mt-16 grid grid-cols-2 gap-16 text-center text-sm"><div className="border-t pt-2">{language === 'ar' ? 'توقيع الموظف' : 'Employee signature'}</div><div className="border-t pt-2">{language === 'ar' ? 'اعتماد المنشأة' : 'Company approval'}</div></div>
  </div>;
};

const PayslipRows = ({title,rows,language,money}:{title:string;rows:(string|number)[][];language:string;money:(value:number)=>string}) => <div><h3 className="mb-3 font-black">{title}</h3><div className="space-y-2 text-sm">{rows.length ? rows.map((row,index) => <div key={index} className="flex justify-between gap-3 border-b border-dashed pb-2"><span>{language === 'ar' ? row[0] : row[1]}</span><strong dir="ltr">{money(Number(row[2]))} SR</strong></div>) : <div className="text-slate-400">—</div>}</div></div>;

const AttendanceSummary = ({label,value,tone}:{label:string;value:string|number;tone:'emerald'|'amber'|'rose'|'sky'}) => {
  const colors = { emerald:'bg-emerald-50 text-emerald-800',amber:'bg-amber-50 text-amber-800',rose:'bg-rose-50 text-rose-800',sky:'bg-sky-50 text-sky-800' };
  return <div className={`rounded-2xl p-4 ${colors[tone]}`}><div className="text-xs opacity-75">{label}</div><div className="mt-1 text-xl font-black" dir="ltr">{value}</div></div>;
};

const AttendanceStatus = ({status,language}:{status:string;language:string}) => {
  const labels:Record<string,[string,string]> = { PRESENT:['حاضر','Present'],LATE:['متأخر','Late'],ABSENT:['غائب','Absent'],LEAVE:['إجازة','Leave'],OFF:['راحة','Off'],HOLIDAY:['عطلة','Holiday'],MISSION:['مهمة','Mission'],IGNORED:['مستبعد','Ignored'],MISSING_IN:['بصمة دخول ناقصة','Missing check-in'],MISSING_OUT:['بصمة خروج ناقصة','Missing check-out'],REVIEW:['للمراجعة','Review'] };
  const label = labels[status] || [status,status];
  const danger = ['ABSENT','MISSING_IN','MISSING_OUT','REVIEW'].includes(status);
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${danger ? 'bg-rose-50 text-rose-700' : status === 'LATE' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{language === 'ar' ? label[0] : label[1]}</span>;
};

const leaveTypeLabel = (type:EmployeeLeave['type'],language:string) => ({ ANNUAL:['سنوية','Annual'],SICK:['مرضية','Sick'],UNPAID:['بدون راتب','Unpaid'],EMERGENCY:['طارئة','Emergency'],MATERNITY:['أمومة','Maternity'] }[type][language === 'ar' ? 0 : 1]);
const LeaveStatus = ({status,language}:{status:EmployeeLeave['status'];language:string}) => {
  const labels = { PENDING:['قيد المراجعة','Pending'],APPROVED:['معتمدة','Approved'],REJECTED:['مرفوضة','Rejected'] } as const;
  const classes = status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : status === 'REJECTED' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${classes}`}>{labels[status][language === 'ar' ? 0 : 1]}</span>;
};
const leaveMessage = (code:string,language:string) => {
  const messages:Record<string,[string,string]> = {
    EMPLOYEE_LEAVE_OVERLAP:['يوجد طلب إجازة آخر متداخل مع هذه الفترة.','Another leave request overlaps this period.'],
    ANNUAL_LEAVE_BALANCE_EXCEEDED:['مدة الطلب تتجاوز رصيد الإجازة السنوية المتاح.','The request exceeds the available annual leave balance.'],
    ANNUAL_LEAVE_SINGLE_YEAR_REQUIRED:['يجب أن يكون طلب الإجازة السنوية داخل سنة واحدة.','Annual leave must fall within one calendar year.'],
    EMPLOYEE_LEAVE_CANCELLATION_LOCKED:['لا يمكن إلغاء الطلب بعد اعتماده أو رفضه.','Approved or rejected requests cannot be cancelled.'],
  };
  const message = messages[code] || [code,code]; return message[language === 'ar' ? 0 : 1];
};
const BankRequestStatus = ({status,language}:{status:EmployeeBankChangeRequest['status'];language:string}) => {
  const labels = { PENDING:['قيد المراجعة','Pending'],APPROVED:['معتمد','Approved'],REJECTED:['مرفوض','Rejected'] } as const;
  const color = status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : status === 'REJECTED' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700';
  return <span className={`rounded-full px-2.5 py-1 font-bold ${color}`}>{labels[status][language === 'ar' ? 0 : 1]}</span>;
};
const bankMessage = (code:string,language:string) => {
  const messages:Record<string,[string,string]> = {
    INVALID_SAUDI_IBAN:['رقم الآيبان السعودي غير صحيح.','The Saudi IBAN is invalid.'],
    BANK_CHANGE_REQUEST_PENDING:['يوجد طلب تعديل بنكي قيد المراجعة بالفعل.','A bank change request is already pending.'],
    IBAN_BANK_NOT_CONFIGURED:['البنك غير معرّف في ملف المنشأة. اطلب من الإدارة إضافته أولًا.','This bank is not configured in the company profile. Ask management to add it first.'],
  };
  const message = messages[code] || [code,code]; return message[language === 'ar' ? 0 : 1];
};
