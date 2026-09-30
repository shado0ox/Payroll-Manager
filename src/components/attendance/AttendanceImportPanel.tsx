import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, MessageCircle, Printer, RefreshCw, Share2, Trash2, Upload, UserPlus } from 'lucide-react';
import { AttendanceRecord, Company, Employee, LeaveRequest } from '../../types';
import { DailySchedule, DayScheduleOverride, parseMoqootAttendanceFile } from '../../utils/moqootAttendanceImport';
import { SearchableEmployeeSelect } from '../SearchableEmployeeSelect';
import { useLanguage } from '../../i18n/LanguageContext';
import { api } from '../../utils/api';

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
const attendanceDayName=(date:string,ar:boolean)=>new Intl.DateTimeFormat(ar?'ar-SA':'en-US',{weekday:'long',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
const normalizeWhatsAppPhone=(value:string)=>{let digits=value.replace(/\D/g,'');if(digits.startsWith('00'))digits=digits.slice(2);if(digits.length===10&&digits.startsWith('0'))digits=`966${digits.slice(1)}`;else if(digits.length===9&&digits.startsWith('5'))digits=`966${digits}`;return /^\d{8,15}$/.test(digits)?digits:'';};

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
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<AttendanceRecord[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [shareUrl,setShareUrl]=useState(''),[shareHistory,setShareHistory]=useState<any[]>([]);
  const [reportInstructions,setReportInstructions]=useState(''),[whatsAppPhone,setWhatsAppPhone]=useState('');
  const [totals,setTotals]=useState({absenceDays:0,delayMinutes:0,overtimeHours:0,notes:''});

  const selectedEmployee = employees.find(item => item.id === employeeId);
  const externalId = externalName.trim() ? attendanceOnlyKey(company.id, externalName, externalNo) : '';
  const activeWorkerId = workerMode === 'REGISTERED' ? employeeId : externalId;
  const importedMonth = useMemo(() => attendance.filter(item => item.companyId === company.id && item.employeeId === activeWorkerId && item.periodMonth === selectedPeriod && item.sourceType === 'MOQOOT_IMPORT'), [attendance, company.id, activeWorkerId, selectedPeriod]);
  const savedScheduleOverrides=useMemo<DayScheduleOverride[]>(()=>attendance.filter(item=>item.companyId===company.id&&item.employeeId===activeWorkerId&&item.periodMonth===selectedPeriod&&item.id===`schedule-${company.id}-${activeWorkerId}-${item.date}`).map(item=>({date:item.date,mode:item.workday===false?'OFF':'WORKDAY',start:item.scheduledStart,end:item.scheduledEnd})),[attendance,company.id,activeWorkerId,selectedPeriod]);
  const effectiveDayOverrides=useMemo<DayScheduleOverride[]>(()=>savedScheduleOverrides,[savedScheduleOverrides]);
  const reportRows = preview.length ? preview : importedMonth;
  const postedTotal=attendance.find(item=>item.id===`attendance-total-${company.id}-${activeWorkerId}-${selectedPeriod}`);

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
    setPreview([]);
    setShareUrl('');setShareHistory([]);setTotals({absenceDays:0,delayMinutes:0,overtimeHours:0,notes:''});
    setReviewConfirmed(false);
  }, [selectedPeriod]);

  useEffect(()=>{setWhatsAppPhone(selectedEmployee?.phone||'');},[selectedEmployee?.phone]);

  const updatePreviewRow = (id:string,patch:Partial<AttendanceRecord>)=>{
    setPreview(current=>current.map(row=>row.id===id?{...row,...patch}:row));
    setReviewConfirmed(false);
  };
  const recalculateRow=(id:string)=>setPreview(current=>current.map(row=>{
    if(row.id!==id)return row;
    const minutes=(value?:string)=>{const match=value?.match(/^(\d{2}):(\d{2})$/);return match?Number(match[1])*60+Number(match[2]):null;};
    if(['OFF','LEAVE','HOLIDAY','MISSION','IGNORED'].includes(row.attendanceStatus||''))return {...row,calculatedDelayMinutes:0,overtimeHours:0};
    const actualIn=minutes(row.actualCheckIn),rawOut=minutes(row.actualCheckOut),plannedStart=minutes(row.scheduledStart),rawEnd=minutes(row.scheduledEnd);
    if(actualIn===null&&rawOut===null)return {...row,attendanceStatus:'ABSENT',calculatedDelayMinutes:0,overtimeHours:0,notes:row.notes||tr('لا توجد بصمات في يوم عمل','No punches on a workday')};
    if(actualIn===null)return {...row,attendanceStatus:'MISSING_IN',calculatedDelayMinutes:0,overtimeHours:0};
    if(rawOut===null)return {...row,attendanceStatus:'MISSING_OUT',calculatedDelayMinutes:0,overtimeHours:0};
    let plannedEnd=rawEnd??rawOut,actualOut=rawOut;
    if(plannedStart!==null&&plannedEnd<=plannedStart)plannedEnd+=1440;
    if(plannedStart!==null&&actualOut<plannedStart&&plannedEnd>1440)actualOut+=1440;
    const delay=plannedStart===null?0:Math.max(0,actualIn-plannedStart-(row.graceMinutes||0));
    const overtime=Math.max(0,Math.round(((actualOut-plannedEnd)/60)*100)/100);
    return {...row,calculatedDelayMinutes:delay,overtimeHours:overtime,attendanceStatus:delay>0?'LATE':'PRESENT'};
  }));

  const readPreview = async () => {
    setError('');
    if (!file) return setError(tr('اختر ملف Excel أو CSV أولاً.', 'Choose an Excel or CSV file first.'));
    if (workerMode === 'REGISTERED' && !employeeId) return setError(tr('اختر الموظف.', 'Choose an employee.'));
    if (workerMode === 'ATTENDANCE_ONLY' && !externalName.trim()) return setError(tr('اكتب اسم موظف الحضور.', 'Enter the attendance-only worker name.'));
    try {
      const records = await parseMoqootAttendanceFile(file, {
        companyId: company.id,
        employeeId: workerMode === 'REGISTERED' ? employeeId : externalId,
        employeeName: workerMode === 'ATTENDANCE_ONLY' ? externalName.trim() : undefined,
        employeeNo: workerMode === 'ATTENDANCE_ONLY' ? externalNo.trim() : undefined,
        attendanceOnlyWorker: workerMode === 'ATTENDANCE_ONLY',
        periodMonth: selectedPeriod,
        graceMinutes,
        schedule,
        dayOverrides:effectiveDayOverrides,
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
        : tr('تعذر قراءة الملف. تأكد أنه ملف موقوت Excel أو CSV بالأعمدة: يوم، حضور، انصراف.', 'Could not read the file. Verify the Moqoot Excel or CSV columns.'));
    }
  };

  const saveDraft = async () => {
    if (!preview.length || !reviewConfirmed) return;
    setSaving(true);
    const records=preview.map(row=>({...row,payrollApproved:false,delayMinutes:0,absence:false,unpaidLeave:false,overtimeHours:Number(row.overtimeHours||0)}));
    try { const ok = await onImport(records); if (ok !== false) setPreview([]); } finally { setSaving(false); }
  };
  const loadShares=async()=>{if(workerMode!=='REGISTERED'||!employeeId)return;setSaving(true);try{const result=await api.attendanceReportShares(company.id,employeeId,selectedPeriod);setShareHistory(result.shares);}finally{setSaving(false);}};
  const createShare=async()=>{if(workerMode!=='REGISTERED'||!employeeId||!importedMonth.length)return;setSaving(true);try{const result=await api.createAttendanceReportShare(company.id,employeeId,selectedPeriod,7,reportInstructions);setShareUrl(result.url);const history=await api.attendanceReportShares(company.id,employeeId,selectedPeriod);setShareHistory(history.shares);}finally{setSaving(false);}};
  const deleteShare=async(id:string)=>{if(!window.confirm(tr('حذف هذا الرابط نهائيًا؟ لن يستطيع الموظف فتحه بعد الحذف.','Delete this link permanently? The employee will no longer be able to open it.')))return;setSaving(true);try{await api.deleteAttendanceReportShare(id);setShareHistory(current=>current.filter(item=>item.id!==id));}finally{setSaving(false);}};
  const shareWhatsApp=()=>{if(!shareUrl)return;const phone=normalizeWhatsAppPhone(whatsAppPhone);if(!phone){setError(tr('أدخل رقم جوال صحيحًا مع مفتاح الدولة.','Enter a valid mobile number with country code.'));return;}const name=selectedEmployee?`${selectedEmployee.firstNameAr} ${selectedEmployee.lastNameAr}`.trim():'';const message=tr(`السلام عليكم ${name}\nيرجى مراجعة كشف الحضور والانصراف للفترة ${selectedPeriod}.\n\nالمطلوب:\n1- فتح الرابط ومراجعة جميع الأيام.\n2- كتابة ملاحظتك أمام أي يوم يحتاج توضيحًا.\n3- كتابة الاسم ورسم التوقيع الإلكتروني.\n4- الضغط على حفظ وإرسال الإقرار.\n\n${reportInstructions?`تعليمات إضافية: ${reportInstructions}\n\n`:''}الرابط صالح لمدة 7 أيام:\n${shareUrl}`,`Hello ${name}\nPlease review your attendance report for ${selectedPeriod}.\n1- Open the link and review all days.\n2- Add comments where needed.\n3- Enter your name and electronic signature.\n4- Save and submit the acknowledgement.\n\n${reportInstructions?`Additional instructions: ${reportInstructions}\n\n`:''}The link is valid for 7 days:\n${shareUrl}`);window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,'_blank','noopener,noreferrer');};
  const printShare = (item: any) => {
    const response = item.response || {},
      comments = response.comments || {},
      report = item.report || {},
      rows = (item.report?.records || [])
        .map(
          (row: any) =>
            `<tr><td><b>${escapeHtml(attendanceDayName(row.date,true))}</b><br>${escapeHtml(row.date)}</td><td>${escapeHtml(row.scheduledStart || "-")} - ${escapeHtml(row.scheduledEnd || "-")}</td><td>${escapeHtml(row.actualCheckIn || "-")}</td><td>${escapeHtml(row.actualCheckOut || "-")}</td><td>${escapeHtml(statusLabel(row.status, true))}</td><td>${Number(row.delayMinutes || 0)}</td><td>${escapeHtml(row.notes || "-")}</td><td>${escapeHtml(comments[row.id] || "")}</td></tr>`,
        )
        .join(""),
      logo = report.company?.logo || company.logo || "",
      companyName =
        report.company?.nameAr || company.nameAr || company.nameEn || "المنشأة",
      popup = window.open("", "_blank", "width=1100,height=850");
    if (!popup) return;
    popup.document.write(
      `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>تقرير الحضور الموقّع</title><style>@page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,Tahoma,sans-serif;color:#172033;font-size:9px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{width:auto;min-height:190mm;overflow:visible;padding:0}.banner{height:24mm;background:linear-gradient(90deg,#047857,#0f766e);color:#fff;display:flex;align-items:center;justify-content:space-between;padding:3mm 5mm}.brand{display:flex;align-items:center;gap:4mm}.logo{width:17mm;height:17mm;object-fit:contain;background:#fff;border-radius:2mm;padding:1mm}.fallback{width:15mm;height:15mm;border-radius:2mm;background:#ffffff33;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:bold}.banner h1{font-size:15px;margin:0 0 1mm}.banner p{margin:0;font-size:10px}.meta{display:grid;grid-template-columns:2fr 1fr 1fr;gap:2mm;border:1px solid #cbd5e1;padding:2mm 3mm;margin:2mm 0;font-size:9px}.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:1mm;margin:2mm 0}.summary div{border:1px solid #cbd5e1;background:#f8fafc;padding:1.5mm .8mm;text-align:center}.summary span{display:block;color:#64748b;margin-bottom:.5mm}table{width:100%;border-collapse:collapse;font-size:8.5px;table-layout:fixed}th,td{border:1px solid #cbd5e1;padding:1.25mm 1mm;text-align:center;line-height:1.15;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th{background:#e2e8f0;color:#0f172a;font-size:10px}.sign{min-height:25mm;margin-top:4mm;break-inside:avoid;page-break-inside:avoid;border:1px solid #94a3b8;background:#f8fafc;padding:2.5mm;display:grid;grid-template-columns:1fr 1fr;align-items:center;font-size:9px}.sign p{margin:1mm 0}.sign img{display:block;height:16mm;max-width:65mm;object-fit:contain;margin:auto}.status{color:#047857;font-weight:bold}</style></head><body><div class="page"><header class="banner"><div class="brand">${logo ? `<img class="logo" src="${escapeHtml(logo)}" alt="الشعار">` : '<div class="fallback">م</div>'}<div><h1>${escapeHtml(companyName)}</h1><p>كشف الحضور والانصراف الموقّع</p></div></div><div><p>الفترة</p><b>${escapeHtml(report.periodMonth)}</b></div></header><div class="meta"><span>الموظف: <b>${escapeHtml(report.employee?.nameAr || report.employee?.nameEn)}</b></span><span>الرقم: <b>${escapeHtml(report.employee?.employeeNo)}</b></span><span>القسم: <b>${escapeHtml(report.employee?.department || "-")}</b></span></div><div class="summary"><div><span>أيام الغياب</span><b>${Number(report.summary?.absenceDays||0)}</b></div><div><span>أيام التأخير</span><b>${Number(report.summary?.lateDays||0)}</b></div><div><span>إجمالي التأخير</span><b>${Number(report.summary?.totalDelayMinutes||0)} دقيقة</b></div><div><span>السماح</span><b>${Number(report.records?.[0]?.graceMinutes||0)} دقيقة</b></div><div><span>البصمة الناقصة</span><b>${Number(report.summary?.missingPunchDays||0)}</b></div></div>${report.instructions?`<div style="border:1px solid #bfdbfe;background:#eff6ff;padding:2mm 3mm;margin:2mm 0"><b>تعليمات للموظف:</b> ${escapeHtml(report.instructions)}</div>`:''}<table><thead><tr><th>اليوم والتاريخ</th><th>الدوام</th><th>الدخول</th><th>الخروج</th><th>الحالة</th><th>التأخير</th><th>ملاحظات الإدارة</th><th>ملاحظات الموظف</th></tr></thead><tbody>${rows}</tbody></table><div class="sign"><div><p class="status">${item.signedAt ? "تم التوقيع إلكترونيًا" : "نسخة للمراجعة — لم يتم التوقيع"}</p><p>اسم الموقّع: <b>${escapeHtml(response.signatureName || "لم يوقع")}</b></p><p>وقت التوقيع: ${item.signedAt ? new Date(item.signedAt).toLocaleString("ar-SA") : "—"}</p></div>${response.signatureData ? `<img src="${response.signatureData}" alt="توقيع الموظف">` : ""}</div></div><script>window.onload=()=>window.print()</script></body></html>`,
    );
    popup.document.close();
  };
  const postTotals=async()=>{if(!activeWorkerId||postedTotal)return;setSaving(true);try{const record:AttendanceRecord={id:`attendance-total-${company.id}-${activeWorkerId}-${selectedPeriod}`,companyId:company.id,employeeId:activeWorkerId,periodMonth:selectedPeriod,date:`${selectedPeriod}-01`,daysCount:Math.max(0,Math.floor(totals.absenceDays)),delayMinutes:Math.max(0,Math.floor(totals.delayMinutes)),absence:totals.absenceDays>0,unpaidLeave:false,overtimeHours:Math.max(0,Number(totals.overtimeHours)||0),overtimeType:'STANDARD',notes:totals.notes||tr('إجمالي معتمد من تقرير الحضور','Approved attendance report totals'),sourceType:'MANUAL',attendanceStatus:'REVIEW',payrollApproved:true,aggregateAttendance:true};await onImport([record]);}finally{setSaving(false);}};

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
    const rows = reportRows.map(row => `<tr><td><b>${escapeHtml(attendanceDayName(row.date,true))}</b><br>${escapeHtml(row.date)}</td><td>${escapeHtml(row.scheduledStart || '-')}</td><td>${escapeHtml(row.scheduledEnd || '-')}</td><td>${escapeHtml(row.actualCheckIn || '-')}</td><td>${escapeHtml(row.actualCheckOut || '-')}</td><td>${row.calculatedDelayMinutes || 0}</td><td>${escapeHtml(statusLabel(row.attendanceStatus, true))}</td><td>${escapeHtml(row.notes || '')}</td></tr>`).join('');
    const popup = window.open('', '_blank', 'width=1100,height=800');
    if (!popup) return;
    popup.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير الحضور - ${escapeHtml(name)}</title><style>@page{size:A4 landscape;margin:8mm}body{font-family:Arial,sans-serif;color:#172033;padding:0}h1,h2{text-align:center}.meta,.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}.box{border:1px solid #ccd3df;border-radius:8px;padding:10px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #bbc4d2;padding:7px;text-align:center}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th{background:#edf2f7}.signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:50px;margin-top:60px;text-align:center}.line{border-top:1px solid #333;padding-top:8px}@media print{button{display:none}.signatures{break-inside:avoid;page-break-inside:avoid}}</style></head><body><h1>${escapeHtml(company.nameAr || company.nameEn || 'المنشأة')}</h1><h2>تقرير الحضور والانصراف</h2><div class="meta"><div class="box">الموظف: <b>${escapeHtml(name)}</b></div><div class="box">الرقم: <b>${escapeHtml(employeeNo)}</b></div><div class="box">الشهر: <b>${escapeHtml(selectedPeriod)}</b></div><div class="box">السماح: <b>${first.graceMinutes || 0} دقيقة</b></div></div><div class="summary"><div class="box">أيام الغياب: <b>${absences}</b></div><div class="box">أيام التأخير: <b>${lateDays}</b></div><div class="box">إجمالي التأخير: <b>${Math.floor(lateTotal / 60)}:${String(lateTotal % 60).padStart(2, '0')}</b></div><div class="box">البصمات الناقصة: <b>${missing}</b></div></div><table><thead><tr><th>التاريخ</th><th>الدوام من</th><th>الدوام إلى</th><th>الحضور</th><th>الانصراف</th><th>التأخير بالدقائق</th><th>الحالة</th><th>الملاحظات</th></tr></thead><tbody>${rows}</tbody></table><div class="signatures"><div class="line">توقيع الموظف</div><div class="line">المدير المباشر</div><div class="line">الموارد البشرية</div></div><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  };

  return <div className="space-y-5">
    <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-emerald-600"/><h2 className="font-bold">{tr('استيراد وتحليل ملف موقوت Excel / CSV', 'Import and analyze Moqoot Excel / CSV')}</h2></div>
      <div className="grid md:grid-cols-2 gap-3">
        <label className="border rounded-xl p-3 flex items-center gap-2"><input type="radio" checked={workerMode === 'REGISTERED'} onChange={() => setWorkerMode('REGISTERED')}/>{tr('موظف مسجل', 'Registered employee')}</label>
        <label className="border rounded-xl p-3 flex items-center gap-2"><input type="radio" checked={workerMode === 'ATTENDANCE_ONLY'} onChange={() => setWorkerMode('ATTENDANCE_ONLY')}/><UserPlus className="w-4 h-4"/>{tr('موظف حضور فقط', 'Attendance-only worker')}</label>
      </div>
      {workerMode === 'REGISTERED' ? <SearchableEmployeeSelect employees={employees} value={employeeId} onChange={setEmployeeId}/>
        : <div className="grid md:grid-cols-2 gap-3"><input className="px-3 py-2 border rounded-xl" placeholder={tr('اسم الموظف *', 'Worker name *')} value={externalName} onChange={event => setExternalName(event.target.value)}/><input className="px-3 py-2 border rounded-xl" placeholder={tr('رقم حضور اختياري', 'Optional attendance number')} value={externalNo} onChange={event => setExternalNo(event.target.value)}/></div>}
      <div><label className="block text-xs font-bold mb-1">{tr('مدة السماح قبل التأخير (دقيقة)', 'Grace period before lateness (minutes)')}</label><input type="number" min="0" max="240" className="w-40 px-3 py-2 border rounded-xl" value={graceMinutes} onChange={event => setGraceMinutes(Math.max(0, Number(event.target.value) || 0))}/></div>
      {savedScheduleOverrides.length>0?<p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-bold text-blue-800">{tr(`تم ربط قواعد دوام الموظف المحفوظة تلقائيًا (${savedScheduleOverrides.length} يومًا). يمكنك تعديل وقت الدوام لأي يوم داخل نتيجة التحليل ثم الضغط على إعادة الحساب.`,`Saved employee work rules were linked automatically (${savedScheduleOverrides.length} days). You can edit each day's schedule in the analysis result, then recalculate.`)}</p>:<p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">{tr('لا توجد قاعدة دوام محفوظة لهذا الموظف في الشهر المختار؛ سيُستخدم الدوام الافتراضي من الأحد إلى الخميس 09:00–17:00.','No saved work rule exists for this employee in the selected month; the default Sunday–Thursday 09:00–17:00 schedule will be used.')}</p>}
      <div className="flex flex-wrap gap-3 items-center"><input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={event => { setFile(event.target.files?.[0] || null); setPreview([]); }} className="text-xs"/><button onClick={readPreview} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold inline-flex gap-2"><Upload className="w-4 h-4"/>{tr('تحليل ومعاينة', 'Analyze and preview')}</button></div>
      {error && <p className="text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs font-bold">{error}</p>}
    </section>
    {reportRows.length > 0 && <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="p-4 flex flex-wrap justify-between gap-3"><div><h3 className="font-bold">{preview.length ? tr('مراجعة النتيجة وحفظ التقرير كمسودة', 'Review and save report as draft') : tr('تقرير الحضور المحفوظ', 'Saved attendance report')}</h3><p className="text-xs text-slate-500">{tr('احفظ التحليل أولًا، ثم شاركه مع الموظف وتابع توقيعه، وبعد المراجعة رحّل الإجمالي الذي تحدده أنت.', 'Save analysis first, share it with the employee and track signing, then post only the totals you decide.')}</p></div><div className="flex flex-wrap items-center gap-2">{preview.length > 0 && <label className="inline-flex items-center gap-2 text-xs font-bold border rounded-xl px-3 py-2"><input type="checkbox" checked={reviewConfirmed} onChange={event => setReviewConfirmed(event.target.checked)}/>{tr('راجعت المسودة', 'Draft reviewed')}</label>}{preview.length > 0 && <button disabled={saving || !reviewConfirmed} onClick={saveDraft} className="px-4 py-2 bg-blue-700 disabled:bg-slate-300 text-white rounded-xl font-bold inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4"/>{saving ? tr('جارٍ الحفظ...', 'Saving...') : tr('حفظ التقرير كمسودة', 'Save report draft')}</button>}<button disabled={preview.length > 0 && !reviewConfirmed} onClick={printReport} className="px-4 py-2 border disabled:text-slate-300 rounded-xl font-bold inline-flex gap-2"><Printer className="w-4 h-4"/>{tr('طباعة التقرير', 'Print report')}</button></div></div>
      <div className="overflow-x-auto"><table className="w-full text-xs min-w-[1100px]"><thead><tr className="bg-slate-50"><th className="p-2">{tr('اليوم والتاريخ', 'Day and date')}</th><th>{tr('الدوام', 'Schedule')}</th><th>{tr('الحضور', 'Check-in')}</th><th>{tr('الانصراف', 'Check-out')}</th><th>{tr('التأخير', 'Late')}</th><th>{tr('الإضافي', 'Overtime')}</th><th>{tr('الحالة', 'Status')}</th><th>{tr('ملاحظات', 'Notes')}</th>{preview.length>0&&<th>{tr('إعادة حساب','Recalculate')}</th>}</tr></thead><tbody>{reportRows.map(row => {
        const editable = preview.length > 0;
        return <tr key={row.id} className="border-t"><td className="p-2 text-center"><b>{attendanceDayName(row.date,ar)}</b><br/><span className="font-mono">{row.date}</span></td><td className="p-1 text-center">{editable?<div className="flex min-w-32 items-center justify-center gap-1"><input type="time" value={row.scheduledStart||''} onChange={event=>updatePreviewRow(row.id,{scheduledStart:event.target.value||undefined})} className="w-16 rounded-lg border p-1"/><span>-</span><input type="time" value={row.scheduledEnd||''} onChange={event=>updatePreviewRow(row.id,{scheduledEnd:event.target.value||undefined})} className="w-16 rounded-lg border p-1"/></div>:<>{row.scheduledStart || '-'} - {row.scheduledEnd || '-'}</>}</td><td className="p-1 text-center">{editable?<input type="time" value={row.actualCheckIn||''} onChange={event=>updatePreviewRow(row.id,{actualCheckIn:event.target.value||undefined})} className="rounded-lg border p-1"/>:row.actualCheckIn||'-'}</td><td className="p-1 text-center">{editable?<input type="time" value={row.actualCheckOut||''} onChange={event=>updatePreviewRow(row.id,{actualCheckOut:event.target.value||undefined})} className="rounded-lg border p-1"/>:row.actualCheckOut||'-'}</td><td className="p-1 text-center">{row.calculatedDelayMinutes||0}</td><td className="p-1 text-center">{Number(row.overtimeHours||0).toFixed(2)}</td><td className="p-1 text-center">{editable?<select value={row.attendanceStatus||'REVIEW'} onChange={event=>updatePreviewRow(row.id,{attendanceStatus:event.target.value as AttendanceRecord['attendanceStatus']})} className="rounded-lg border p-1.5"><option value="PRESENT">{tr('حاضر','Present')}</option><option value="LATE">{tr('متأخر','Late')}</option><option value="ABSENT">{tr('غياب','Absent')}</option><option value="LEAVE">{tr('إجازة','Leave')}</option><option value="OFF">{tr('راحة','Off')}</option><option value="HOLIDAY">{tr('عطلة رسمية','Public holiday')}</option><option value="MISSION">{tr('مهمة عمل','Business mission')}</option><option value="IGNORED">{tr('مستبعد','Ignored')}</option><option value="MISSING_IN">{tr('دخول ناقص','Missing check-in')}</option><option value="MISSING_OUT">{tr('خروج ناقص','Missing check-out')}</option><option value="REVIEW">{tr('مراجعة','Review')}</option></select>:<span className="font-bold">{statusLabel(row.attendanceStatus,ar)}</span>}</td><td className="p-1">{editable?<input value={row.notes||''} onChange={event=>updatePreviewRow(row.id,{notes:event.target.value})} className="w-full min-w-48 rounded-lg border p-1.5"/>:row.notes||'-'}</td>{editable&&<td className="text-center"><button type="button" onClick={()=>{recalculateRow(row.id);setReviewConfirmed(false);}} className="rounded-lg border p-2 text-blue-700" title={tr('إعادة حساب التأخير والإضافي والحالة','Recalculate lateness, overtime, and status')}><RefreshCw className="h-4 w-4"/></button></td>}</tr>;
      })}</tbody></table></div>
      {!preview.length&&workerMode==='REGISTERED'&&<div className="space-y-4 border-t bg-slate-50 p-4"><div className="rounded-2xl border bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-black">{tr('مشاركة التقرير ومتابعة الموظف','Share report and track employee')}</h4><p className="text-xs text-slate-500">{tr('نفس التقرير المحفوظ هو الذي يصل للموظف للتعليق والتوقيع.','The same saved report is sent to the employee for comments and signature.')}</p></div><div className="flex gap-2"><button disabled={saving} onClick={loadShares} className="rounded-xl border px-3 py-2 text-xs font-bold"><RefreshCw className="me-1 inline h-4 w-4"/>{tr('تحديث الحالة','Refresh')}</button><button disabled={saving} onClick={createShare} className="rounded-xl bg-violet-700 px-4 py-2 text-xs font-bold text-white"><Share2 className="me-1 inline h-4 w-4"/>{tr('إنشاء رابط للتوقيع','Create signing link')}</button></div></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">{tr('تعليمات للموظف','Instructions for employee')}<textarea maxLength={1500} value={reportInstructions} onChange={e=>setReportInstructions(e.target.value)} placeholder={tr('مثال: راجع أيام الغياب والتأخير واكتب ملاحظتك قبل التوقيع','Example: Review absence and delay days and add comments before signing')} className="mt-1 min-h-20 w-full rounded-xl border p-2 font-normal"/></label><label className="text-xs font-bold">{tr('رقم واتساب الموظف','Employee WhatsApp number')}<input dir="ltr" value={whatsAppPhone} onChange={e=>setWhatsAppPhone(e.target.value)} placeholder="05xxxxxxxx أو 9665xxxxxxxx" className="mt-1 w-full rounded-xl border p-2 font-normal"/><span className="mt-1 block text-[11px] font-normal text-slate-500">{tr('يتم تعبئته تلقائيًا من بيانات الموظف ويمكن تعديله قبل الإرسال.','Filled from employee data and can be edited before sending.')}</span></label></div>{shareUrl&&<div className="mt-3 rounded-xl bg-emerald-50 p-3"><input readOnly value={shareUrl} className="w-full bg-transparent text-xs"/><button onClick={shareWhatsApp} className="mt-2 w-full rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white"><MessageCircle className="me-1 inline h-4 w-4"/>{tr('إرسال عبر واتساب','Send via WhatsApp')}</button></div>}<div className="mt-3 space-y-2">{shareHistory.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-xs"><span className="font-bold">{item.signedAt?tr('تم توقيع الموظف','Employee signed'):item.viewedAt?tr('فتح التقرير ولم يوقّع','Opened, not signed'):tr('لم يفتح التقرير','Not opened')}</span><span className="text-slate-500">{new Date(item.createdAt).toLocaleString(ar?'ar-SA':'en-US')}</span><button onClick={()=>printShare(item)} className="rounded-lg bg-slate-900 px-3 py-2 font-bold text-white">{item.signedAt?tr('طباعة الموقّع','Print signed'):tr('طباعة للمراجعة','Print review')}</button><button disabled={saving} onClick={()=>deleteShare(item.id)} className="rounded-lg border border-rose-200 px-3 py-2 font-bold text-rose-700"><Trash2 className="me-1 inline h-4 w-4"/>{tr('حذف الرابط','Delete link')}</button></div>)}</div></div><div className="rounded-2xl border border-emerald-200 bg-white p-4"><h4 className="font-black">{tr('الاعتماد النهائي وترحيل الإجمالي','Final approval and total posting')}</h4><p className="mt-1 text-xs text-slate-500">{tr('حدد الإجمالي النهائي بعد مراجعة التقرير ورد الموظف. هذه القيم فقط هي التي تؤثر على المسير.','Enter final totals after reviewing the report and employee response. Only these values affect payroll.')}</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-xs font-bold">{tr('إجمالي أيام الغياب','Total absence days')}<input type="number" min="0" value={totals.absenceDays} onChange={e=>setTotals({...totals,absenceDays:Math.max(0,Number(e.target.value)||0)})} className="mt-1 w-full rounded-xl border p-2"/></label><label className="text-xs font-bold">{tr('إجمالي دقائق التأخير','Total delay minutes')}<input type="number" min="0" value={totals.delayMinutes} onChange={e=>setTotals({...totals,delayMinutes:Math.max(0,Number(e.target.value)||0)})} className="mt-1 w-full rounded-xl border p-2"/></label><label className="text-xs font-bold">{tr('إجمالي ساعات الإضافي','Total overtime hours')}<input type="number" min="0" step="0.25" value={totals.overtimeHours} onChange={e=>setTotals({...totals,overtimeHours:Math.max(0,Number(e.target.value)||0)})} className="mt-1 w-full rounded-xl border p-2"/></label></div><input value={totals.notes} onChange={e=>setTotals({...totals,notes:e.target.value})} placeholder={tr('ملاحظة الاعتماد النهائي','Final approval note')} className="mt-3 w-full rounded-xl border p-2 text-xs"/><div className="mt-3 flex justify-end">{postedTotal?<span className="rounded-xl bg-emerald-100 px-4 py-2 text-xs font-black text-emerald-800">{tr('تم ترحيل الإجمالي للمسير','Totals posted to payroll')}</span>:<button disabled={saving} onClick={postTotals} className="rounded-xl bg-emerald-700 px-5 py-2 font-black text-white">{tr('اعتماد وترحيل الإجمالي','Approve and post totals')}</button>}</div></div></div>}
    </section>}
  </div>;
};
