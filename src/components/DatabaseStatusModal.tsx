import React, { useState } from 'react';
import { 
  Database, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  RefreshCw, 
  Download, 
  Upload, 
  Server, 
  ShieldCheck, 
  WifiOff, 
  Layers,
  Activity
} from 'lucide-react';
import { Wrench } from 'lucide-react';
import { AppState } from '../utils/storage';
import { DatabaseStatus, pingDatabase, exportDatabaseBackup } from '../utils/databaseService';
import { useLanguage } from '../i18n/LanguageContext';
import { api, PayrollRepairIssue } from '../utils/api';
import { PayrollRun } from '../types';

interface DatabaseStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  dbStatus: DatabaseStatus;
  onRestoreState: (restoredState: AppState) => Promise<boolean>;
  onPayrollRunsRepaired: (runs:PayrollRun[]) => void;
}

export const DatabaseStatusModal: React.FC<DatabaseStatusModalProps> = ({
  isOpen,
  onClose,
  state,
  dbStatus,
  onRestoreState,
  onPayrollRunsRepaired,
}) => {
  const { language } = useLanguage();
  const tr = (ar: string, en: string) => language === 'ar' ? ar : en;
  const [isPinging, setIsPinging] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [pingResult, setPingResult] = useState<{ status: 'HEALTHY' | 'ERROR'; latencyMs: number; message: string } | null>(null);
  const [repairIssues,setRepairIssues] = useState<PayrollRepairIssue[] | null>(null);
  const [selectedRepairIds,setSelectedRepairIds] = useState<string[]>([]);
  const [isScanningRepair,setIsScanningRepair] = useState(false);
  const [isRepairing,setIsRepairing] = useState(false);
  const [resolvingAdjustment,setResolvingAdjustment] = useState<string | null>(null);
  
  if (!isOpen) return null;

  const handlePing = async () => {
    setIsPinging(true);
    setPingResult(null);
    try {
      const res = await pingDatabase();
      setPingResult(res);
    } finally {
      setIsPinging(false);
    }
  };

  const handleExportBackup = () => {
    exportDatabaseBackup(state);
  };

  const scanPayrollData = async () => {
    setIsScanningRepair(true);
    try {
      const result = await api.scanPayrollData();
      setRepairIssues(result.issues);
      setSelectedRepairIds(result.issues.filter(issue => issue.repairable).map(issue => issue.id));
    } catch (error:any) {
      alert(`${tr('تعذر فحص بيانات الرواتب:', 'Could not scan payroll data:')} ${error?.message || 'UNKNOWN_ERROR'}`);
    } finally { setIsScanningRepair(false); }
  };

  const repairSelectedPayrollData = async () => {
    if (!selectedRepairIds.length || !confirm(tr(`سيتم إصلاح ${selectedRepairIds.length} مسير قابل للتعديل مع تسجيل العملية. متابعة؟`, `Repair ${selectedRepairIds.length} editable payroll run(s) and audit the operation?`))) return;
    setIsRepairing(true);
    try {
      const result = await api.repairPayrollData(selectedRepairIds);
      onPayrollRunsRepaired(result.repairedRuns);
      setRepairIssues(result.remainingIssues);
      setSelectedRepairIds([]);
      alert(tr('تم إصلاح البيانات المحددة وتسجيل العملية بنجاح.', 'Selected data was repaired and audited successfully.'));
    } catch (error:any) {
      alert(`${tr('تعذر تنفيذ الإصلاح:', 'Repair failed:')} ${error?.message || 'UNKNOWN_ERROR'}`);
    } finally { setIsRepairing(false); }
  };

  const resolveLegacyAdjustment=async(journalBatchId:string,lineId:string)=>{
    if(!confirm(tr('تأكيد أن تسوية 9999 تاريخية وتمت مراجعتها؟ سيبقى القيد كما هو وسيُسجل الإغلاق في سجل المراجعة.','Confirm this is a reviewed historical 9999 adjustment? The journal will remain unchanged and the resolution will be audited.')))return;
    setResolvingAdjustment(`${journalBatchId}:${lineId}`);
    try{await api.resolveLegacyJournalAdjustment(journalBatchId,lineId);await scanPayrollData();}
    catch(error:any){alert(`${tr('تعذر إغلاق التنبيه:','Could not resolve the alert:')} ${error?.message||'UNKNOWN_ERROR'}`);}
    finally{setResolvingAdjustment(null);}
  };

  const repairFindingLabel = (finding:PayrollRepairIssue['findings'][number]) => ({
    CARRY_FORWARD_MISMATCH:tr('اختلاف في الرصيد المرحّل', 'Carry-forward mismatch'),
    AUTOMATIC_HOLD_STALE:tr('تعليق آلي منتهي السبب', 'Stale automatic hold'),
    ITEM_CALCULATION_MISMATCH:tr('اختلاف حساب موظف', 'Employee calculation mismatch'),
    DEDUCTION_EXCEEDS_GROSS:tr('خصومات تتجاوز الاستحقاق', 'Deductions exceed gross'),
    NEGATIVE_PAYROLL_AMOUNT:tr('قيمة مالية سالبة', 'Negative payroll amount'),
    EMPLOYEE_REFERENCE_MISMATCH:tr('خلل في مرجع الموظف', 'Employee reference mismatch'),
    GOSI_BRANCH_MISSING:tr('فرع التأمينات غير محفوظ', 'Missing GOSI branch snapshot'),
    PAYMENT_BATCH_MISMATCH:tr('اختلاف في دفعة الرواتب', 'Payment batch mismatch'),
    JOURNAL_BALANCE_ADJUSTMENT:tr('تسوية آلية في القيد 9999', 'Automatic journal adjustment 9999'),
    RUN_TOTAL_MISMATCH:tr('اختلاف في إجماليات المسير', 'Payroll total mismatch'),
  })[finding];

  const repairTotalLabel = (metric:PayrollRepairIssue['details']['totalMismatches'][number]['metric']) => ({
    employeesCount:tr('عدد الموظفين', 'Employees count'),
    totalGrossSalaries:tr('إجمالي الاستحقاقات', 'Gross salaries'),
    totalAbsenceDeductions:tr('خصومات الغياب والإجازة', 'Absence and leave deductions'),
    totalDelayDeductions:tr('خصومات التأخير', 'Delay deductions'),
    totalGosiEmployee:tr('حصة الموظفين في التأمينات', 'Employee GOSI'),
    totalGosiEmployer:tr('حصة المنشأة في التأمينات', 'Employer GOSI'),
    totalLoanDeductions:tr('استقطاعات السلف', 'Loan deductions'),
    totalPenalties:tr('الجزاءات والخصومات الأخرى', 'Penalties and other deductions'),
    totalDeductions:tr('إجمالي الاستقطاعات', 'Deductions'),
    totalNetSalaries:tr('صافي الرواتب', 'Net salaries'),
    totalCompanyCost:tr('إجمالي تكلفة المنشأة', 'Company cost'),
  })[metric];

  const repairItemMetricLabel = (metric:PayrollRepairIssue['details']['itemCalculationMismatches'][number]['metric']) => ({
    totalGrossSalary:tr('إجمالي استحقاق الموظف','Employee gross'),
    totalDeductions:tr('إجمالي خصومات الموظف','Employee deductions'),
    netSalary:tr('صافي الموظف','Employee net'),
    totalCompanyBurden:tr('تكلفة المنشأة للموظف','Employee company cost'),
  })[metric];

  const formatRepairAmount = (value:number,metric?:PayrollRepairIssue['details']['totalMismatches'][number]['metric']) =>
    metric === 'employeesCount'
      ? new Intl.NumberFormat('en-US',{ maximumFractionDigits:0 }).format(value)
      : `${new Intl.NumberFormat('en-US',{ minimumFractionDigits:2,maximumFractionDigits:2 }).format(value)} ${tr('ر.س', 'SAR')}`;

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const input = e.currentTarget;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (parsed.state && parsed.state.companies && parsed.state.employees) {
          if (!confirm(tr('سيتم استبدال بيانات المنشآت المصرح بها بمحتوى النسخة. هل تريد المتابعة؟', 'Authorized company data will be replaced with this backup. Continue?'))) return;
          setIsRestoring(true);
          if (await onRestoreState(parsed.state)) {
            alert(tr('تم استعادة نسخة قاعدة البيانات بنجاح!', 'Database backup restored successfully.'));
            onClose();
          }
        } else {
          alert(tr('ملف النسخة الاحتياطية غير متوافق أو تالف.', 'The backup file is incompatible or corrupted.'));
        }
      } catch (err: any) {
        alert(`${tr('فشل استيراد النسخة الاحتياطية:', 'Backup import failed:')} ${err?.message || tr('خطأ في قراءة الملف', 'Could not read the file')}`);
      } finally {
        setIsRestoring(false);
        input.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-100 animate-scaleUp overflow-y-auto max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shadow-xs">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <span>{tr('حالة قاعدة بيانات PostgreSQL', 'PostgreSQL Database Status')}</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                  v2.0 Active
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {tr('فحص مباشر للخادم وحالة آخر مزامنة ونسخ البيانات الاحتياطي', 'Live server health, last synchronization, and database backup status.')}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Database Status Warning / Alert Banner */}
        {!dbStatus.isChecking && !dbStatus.isCloudConnected && (
          <div className="mb-5 p-4 bg-amber-50/90 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-900 shadow-xs">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700 shrink-0 mt-0.5">
              <WifiOff className="w-5 h-5" />
            </div>
            <div className="text-xs space-y-1">
              <div className="font-bold flex items-center gap-2">
                <span>{tr('تعذر الوصول إلى قاعدة بيانات PostgreSQL', 'PostgreSQL is unreachable')}</span>
                <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded-md font-mono text-[10px]">{tr('غير متصل', 'Disconnected')}</span>
              </div>
              <p className="text-amber-800 leading-relaxed font-medium">
                {tr('لن تُحفظ التعديلات الجديدة حتى عودة الاتصال. لا توجد نسخة محلية من بيانات الرواتب، والبيانات الموجودة على الخادم لم تُحذف.', 'New changes will not be saved until the connection returns. Payroll data is not stored locally, and existing server data has not been deleted.')}
              </p>
            </div>
          </div>
        )}

        {/* Real-time Connection Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-5">
          
          {/* PostgreSQL connection */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-slate-800">PostgreSQL</span>
              </div>
              <span className={`flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-md ${dbStatus.isChecking ? 'text-slate-600 bg-slate-200' : dbStatus.isCloudConnected ? 'text-emerald-700 bg-emerald-100/80' : 'text-rose-700 bg-rose-100'}`}>
                <span className={`w-2 h-2 rounded-full ${dbStatus.isChecking ? 'bg-slate-400 animate-pulse' : dbStatus.isCloudConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                <span>{dbStatus.isChecking ? tr('جاري الفحص', 'Checking') : dbStatus.isCloudConnected ? tr('متصلة ونشطة', 'Connected') : tr('غير متصلة', 'Disconnected')}</span>
              </span>
            </div>
            <div className="space-y-1 text-[11px] text-slate-600 font-medium">
              <div>{tr('المحرك:', 'Engine:')} <strong className="text-slate-900 font-mono">{dbStatus.engine}</strong></div>
              <div>{tr('واجهة الاتصال:', 'Endpoint:')} <strong className="text-slate-900 font-mono">{dbStatus.cloudEndpoint || '/api/state'}</strong></div>
              <div>{tr('آخر حفظ ناجح:', 'Last successful save:')} <strong className="text-slate-900 font-mono">{dbStatus.lastSavedAt || tr('لم يُسجل بعد', 'Not recorded yet')}</strong></div>
            </div>
          </div>

          {/* Persistence details */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-slate-800">{tr('سياسة حفظ البيانات', 'Data Storage Policy')}</span>
              </div>
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                <span>{tr('مركزي وآمن', 'Centralized & Secure')}</span>
              </span>
            </div>
            <div className="space-y-1 text-[11px] text-slate-600 font-medium">
              <div>{tr('المصدر الأساسي:', 'Primary source:')} <strong className="text-slate-900">{tr('قاعدة بيانات الخادم', 'Server database')}</strong></div>
              <div>{tr('التخزين داخل المتصفح:', 'Browser storage:')} <strong className="text-emerald-700">{tr('معطل للبيانات الحساسة', 'Disabled for sensitive data')}</strong></div>
              <div>{tr('آخر خطأ:', 'Last error:')} <strong className={dbStatus.lastError ? 'text-rose-700' : 'text-emerald-700'}>{dbStatus.lastError || tr('لا يوجد', 'None')}</strong></div>
            </div>
          </div>

        </div>

        {/* Database Records Summary */}
        <div className="mb-5 p-4 rounded-2xl bg-slate-50 border border-slate-200">
          <h4 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-600" />
            <span>{tr('إحصائيات السجلات المحفوظة في قاعدة البيانات', 'Database Record Statistics')}</span>
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
            <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-base font-black text-slate-900 font-mono">{state.companies.length}</div>
              <div className="text-[10px] font-bold text-slate-500">{tr('شركات مسجلة', 'Companies')}</div>
            </div>
            <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-base font-black text-slate-900 font-mono">{state.employees.length}</div>
              <div className="text-[10px] font-bold text-slate-500">{tr('سجلات موظفين', 'Employee Records')}</div>
            </div>
            <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-base font-black text-slate-900 font-mono">{state.payrollRuns.length}</div>
              <div className="text-[10px] font-bold text-slate-500">{tr('مسيرات رواتب', 'Payroll Runs')}</div>
            </div>
            <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-base font-black text-slate-900 font-mono">{state.attendance.length}</div>
              <div className="text-[10px] font-bold text-slate-500">{tr('حركات حضور', 'Attendance Records')}</div>
            </div>
          </div>
        </div>

        {/* Action Buttons: Ping & Backup */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <button
            type="button"
            onClick={handlePing}
            disabled={isPinging}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
          >
            <Activity className={`w-4 h-4 ${isPinging ? 'animate-spin' : 'text-emerald-400'}`} />
            <span>{isPinging ? tr('جاري فحص الاستجابة...', 'Checking response...') : tr('فحص استجابة قاعدة البيانات (Ping)', 'Ping Database')}</span>
          </button>

          <button
            type="button"
            onClick={handleExportBackup}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>{tr('تصدير نسخة احتياطية (JSON)', 'Export Backup (JSON)')}</span>
          </button>

          <label className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border border-slate-200 ${isRestoring ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'cursor-pointer bg-slate-100 text-slate-800 hover:bg-slate-200'}`}>
            <Upload className="w-4 h-4" />
            <span>{isRestoring ? tr('جاري الاستعادة...', 'Restoring...') : tr('استعادة نسخة', 'Restore Backup')}</span>
            <input type="file" accept=".json" onChange={handleImportBackup} disabled={isRestoring} className="hidden" />
          </label>
        </div>

        <div data-payroll-repair-panel className="mb-5 rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="flex items-center gap-2 text-xs font-black text-violet-900"><Wrench className="w-4 h-4" />{tr('فحص وإصلاح بيانات الرواتب', 'Payroll data scan and repair')}</h4>
              <p className="mt-1 text-[10px] leading-relaxed text-violet-700">{tr('الفحص لا يغيّر البيانات. الإصلاح متاح للمسيرات القابلة للتعديل فقط ويُسجل في سجل المراجعة.', 'Scanning never changes data. Repair is limited to editable payroll runs and is audit logged.')}</p>
            </div>
            <button type="button" disabled={isScanningRepair || isRepairing} onClick={scanPayrollData} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-xs font-bold text-white disabled:bg-slate-300">
              <RefreshCw className={`w-4 h-4 ${isScanningRepair ? 'animate-spin' : ''}`} />
              {isScanningRepair ? tr('جاري الفحص...', 'Scanning...') : tr('فحص الآن', 'Scan now')}
            </button>
          </div>
          {repairIssues && <div className="mt-4 space-y-2">
            {repairIssues.length === 0 ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">{tr('لم يتم اكتشاف اختلافات في المسيرات.', 'No payroll inconsistencies were found.')}</div> : repairIssues.map(issue => (
              <label key={issue.id} className={`flex items-start gap-3 rounded-xl border p-3 ${issue.repairable ? 'cursor-pointer border-violet-200 bg-white' : 'border-amber-200 bg-amber-50'}`}>
                <input type="checkbox" disabled={!issue.repairable || isRepairing} checked={selectedRepairIds.includes(issue.id)} onChange={event => setSelectedRepairIds(current => event.target.checked ? [...current,issue.id] : current.filter(id => id !== issue.id))} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-black text-slate-900">{tr('مسير', 'Payroll')} {issue.periodMonth} · {issue.runId}</div>
                  <div className="mt-1 flex flex-wrap gap-1">{issue.findings.map(finding => <span key={finding} className="rounded-md bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800">{repairFindingLabel(finding)}</span>)}</div>
                  {issue.details?.carryMismatches?.length > 0 && <div className="mt-3 overflow-x-auto rounded-lg border border-violet-100 bg-white">
                    <div className="border-b border-violet-100 px-3 py-2 text-[10px] font-black text-violet-900">{tr('تفاصيل اختلاف الرصيد المرحّل', 'Carry-forward difference details')}</div>
                    <table className="w-full min-w-[620px] text-[10px]">
                      <thead className="bg-slate-50 text-slate-500"><tr>
                        <th className="px-2 py-2 text-start">{tr('الموظف', 'Employee')}</th><th className="px-2 py-2 text-start">{tr('الرقم', 'Number')}</th><th className="px-2 py-2 text-start">{tr('الشهر المصدر', 'Source month')}</th><th className="px-2 py-2 text-end">{tr('المسجل', 'Recorded')}</th><th className="px-2 py-2 text-end">{tr('المتوقع', 'Expected')}</th><th className="px-2 py-2 text-end">{tr('الفرق', 'Difference')}</th>
                      </tr></thead>
                      <tbody>{issue.details.carryMismatches.map((detail,index) => <tr key={`${detail.employeeId}-${detail.sourcePeriodMonth}-${index}`} className="border-t border-slate-100 text-slate-700">
                        <td className="px-2 py-2 font-bold">{detail.employeeName || tr('غير مسجل', 'Not recorded')}</td><td className="px-2 py-2 font-mono">{detail.employeeNo || '—'}</td><td className="px-2 py-2 font-mono">{detail.sourcePeriodMonth}</td><td className="px-2 py-2 text-end">{formatRepairAmount(detail.recordedNet)}</td><td className="px-2 py-2 text-end">{formatRepairAmount(detail.expectedNet)}</td><td className={`px-2 py-2 text-end font-black ${detail.difference < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{formatRepairAmount(detail.difference)}</td>
                      </tr>)}</tbody>
                    </table>
                  </div>}
                  {issue.details?.itemCalculationMismatches?.length > 0 && <div className="mt-3 overflow-x-auto rounded-lg border border-rose-100 bg-white">
                    <div className="border-b border-rose-100 px-3 py-2 text-[10px] font-black text-rose-900">{tr('تفاصيل اختلاف حساب الموظفين', 'Employee calculation differences')}</div>
                    <table className="w-full min-w-[680px] text-[10px]">
                      <thead className="bg-rose-50 text-slate-500"><tr><th className="px-2 py-2 text-start">{tr('الموظف','Employee')}</th><th className="px-2 py-2 text-start">{tr('الرقم','Number')}</th><th className="px-2 py-2 text-start">{tr('البند','Metric')}</th><th className="px-2 py-2 text-end">{tr('المسجل','Recorded')}</th><th className="px-2 py-2 text-end">{tr('المتوقع','Expected')}</th><th className="px-2 py-2 text-end">{tr('الفرق','Difference')}</th></tr></thead>
                      <tbody>{issue.details.itemCalculationMismatches.map((detail,index)=><tr key={`${detail.employeeId}-${detail.metric}-${index}`} className="border-t border-slate-100 text-slate-700">
                        <td className="px-2 py-2 font-bold">{detail.employeeName||tr('غير مسجل','Not recorded')}{detail.locked?<span className="ms-1 text-amber-700">({tr('مقفول','Locked')})</span>:null}</td><td className="px-2 py-2 font-mono">{detail.employeeNo||'—'}</td><td className="px-2 py-2">{repairItemMetricLabel(detail.metric)}</td><td className="px-2 py-2 text-end">{formatRepairAmount(detail.recorded)}</td><td className="px-2 py-2 text-end">{formatRepairAmount(detail.expected)}</td><td className={`px-2 py-2 text-end font-black ${detail.difference<0?'text-rose-700':'text-emerald-700'}`}>{formatRepairAmount(detail.difference)}</td>
                      </tr>)}</tbody>
                    </table>
                  </div>}
                  {issue.details?.deductionExcesses?.length > 0 && <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] text-rose-900">
                    <div className="font-black">{tr('خصومات تتجاوز استحقاق الموظف — تحتاج مراجعة مصدر الخصم:', 'Deductions exceed employee gross — deduction source requires review:')}</div>
                    {issue.details.deductionExcesses.map(detail=><div key={detail.employeeId} className="mt-1">{detail.employeeName} ({detail.employeeNo||'—'}): {tr('الاستحقاق','Gross')} {formatRepairAmount(detail.gross)} · {tr('الخصومات','Deductions')} {formatRepairAmount(detail.deductions)} · {tr('التجاوز','Excess')} {formatRepairAmount(detail.excess)}</div>)}
                  </div>}
                  {issue.details?.negativeAmounts?.length > 0 && <div className="mt-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-[10px] text-rose-800">
                    <span className="font-black">{tr('قيم سالبة:', 'Negative values:')}</span>{' '}
                    {issue.details.negativeAmounts.map(detail=>`${detail.employeeName} (${detail.field}: ${formatRepairAmount(detail.amount)})`).join('، ')}
                  </div>}
                  {(issue.details?.missingEmployees?.length>0||issue.details?.duplicateEmployeeIds?.length>0)&&<div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-900">
                    {issue.details.missingEmployees.length>0&&<div><span className="font-black">{tr('موظفون غير موجودين في ملف الموظفين:','Employees missing from employee master:')}</span> {issue.details.missingEmployees.map(detail=>`${detail.employeeName||'—'} (${detail.employeeNo||detail.employeeId})`).join('، ')}</div>}
                    {issue.details.duplicateEmployeeIds.length>0&&<div><span className="font-black">{tr('مراجع موظفين مكررة داخل المسير:','Duplicate employee references in payroll:')}</span> {issue.details.duplicateEmployeeIds.join('، ')}</div>}
                  </div>}
                  {issue.details?.missingGosiBranches?.length>0&&<div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-900"><span className="font-black">{tr('مبالغ تأمينات بدون لقطة فرع:','GOSI amounts without a branch snapshot:')}</span>{' '}{issue.details.missingGosiBranches.map(detail=>`${detail.employeeName} (${detail.employeeNo||'—'})`).join('، ')}</div>}
                  {issue.details?.paymentBatchMismatches?.length>0&&<div className="mt-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-[10px] text-rose-800">
                    <div className="font-black">{tr('اختلافات دفعات الرواتب:', 'Payment batch differences:')}</div>
                    {issue.details.paymentBatchMismatches.map(detail=><div key={detail.batchId} className="mt-1">{detail.batchNumber||detail.batchId}: {tr('المسجل','Recorded')} {formatRepairAmount(detail.recordedTotal)} · {tr('المتوقع','Expected')} {formatRepairAmount(detail.expectedTotal)} · {tr('الفرق','Difference')} {formatRepairAmount(detail.difference)}{detail.duplicateEmployeeIds.length? ` · ${tr('موظفون مكررون','Duplicates')}: ${detail.duplicateEmployeeIds.join(', ')}`:''}{detail.missingEmployeeIds.length? ` · ${tr('مراجع مفقودة','Missing')}: ${detail.missingEmployeeIds.join(', ')}`:''}</div>)}
                  </div>}
                  {issue.details?.journalAdjustments?.length>0&&<div className="mt-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-[10px] text-orange-900">
                    <div className="font-black">{tr('قيود تحتوي تسوية 9999 ويجب تحليلها قبل الترحيل:', 'Journals containing account 9999 must be reviewed before posting:')}</div>
                    {issue.details.journalAdjustments.map(detail=><div key={`${detail.journalBatchId}:${detail.lineId}`} className="mt-1 flex flex-wrap items-center gap-2"><span>{detail.batchNumber||detail.journalBatchId}: {formatRepairAmount(detail.amount)}{detail.qoyodSynced?` · ${tr('مرحّل إلى قيود — للمراجعة فقط','Posted to Qoyod — review only')}`:''}</span><button type="button" disabled={Boolean(resolvingAdjustment)} onClick={()=>resolveLegacyAdjustment(detail.journalBatchId,detail.lineId)} className="rounded-md border border-orange-300 bg-white px-2 py-1 font-bold disabled:opacity-50">{resolvingAdjustment===`${detail.journalBatchId}:${detail.lineId}`?tr('جاري الإغلاق…','Resolving…'):tr('تمت المراجعة وإغلاق التنبيه','Reviewed — close alert')}</button></div>)}
                  </div>}
                  {issue.details?.holdMismatches?.length > 0 && <div className="mt-2 rounded-lg border border-violet-100 bg-white px-3 py-2 text-[10px] text-slate-700">
                    <span className="font-black text-violet-900">{tr('الموظفون ذوو التعليق الآلي المنتهي:', 'Employees with stale automatic hold:')}</span>{' '}
                    {issue.details.holdMismatches.map(employee => `${employee.employeeName || tr('غير مسجل', 'Not recorded')} (${employee.employeeNo || '—'})`).join('، ')}
                  </div>}
                  {issue.details?.totalMismatches?.length > 0 && <div className="mt-3 overflow-x-auto rounded-lg border border-violet-100 bg-white">
                    <div className="border-b border-violet-100 px-3 py-2 text-[10px] font-black text-violet-900">{tr('تفاصيل اختلاف إجماليات المسير', 'Payroll total difference details')}</div>
                    <table className="w-full min-w-[500px] text-[10px]">
                      <thead className="bg-slate-50 text-slate-500"><tr><th className="px-2 py-2 text-start">{tr('الإجمالي', 'Total')}</th><th className="px-2 py-2 text-end">{tr('المسجل', 'Stored')}</th><th className="px-2 py-2 text-end">{tr('المحسوب من الموظفين', 'Computed from employees')}</th><th className="px-2 py-2 text-end">{tr('الفرق', 'Difference')}</th></tr></thead>
                      <tbody>{issue.details.totalMismatches.map(detail => <tr key={detail.metric} className="border-t border-slate-100 text-slate-700"><td className="px-2 py-2 font-bold">{repairTotalLabel(detail.metric)}</td><td className="px-2 py-2 text-end">{formatRepairAmount(detail.stored,detail.metric)}</td><td className="px-2 py-2 text-end">{formatRepairAmount(detail.computed,detail.metric)}</td><td className={`px-2 py-2 text-end font-black ${detail.difference < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{formatRepairAmount(detail.difference,detail.metric)}</td></tr>)}</tbody>
                    </table>
                    {issue.details.carryMismatches.length === 0 && <div className="border-t border-slate-100 px-3 py-2 text-[10px] text-slate-500">{tr('هذا اختلاف في إجمالي المسير المخزن مقابل مجموع بنود الموظفين، ولا يمكن نسبته إلى موظف واحد.', 'This is a stored run-total difference versus the sum of employee items and cannot be attributed to one employee.')}</div>}
                  </div>}
                  {!issue.repairable && <div className="mt-1 text-[10px] font-bold text-amber-800">{issue.blockedReason==='LOCKED_PAYROLL_RUN'
                    ? tr('للمراجعة فقط: المسير معتمد أو مرحّل ولا يتم تعديله آليًا.','Review only: approved or posted payroll is never auto-modified.')
                    : tr('تحتاج مراجعة يدوية: لا يوجد إصلاح آلي آمن لهذه الملاحظة.','Manual review required: there is no safe automatic repair for this finding.')}</div>}
                </div>
              </label>
            ))}
            {repairIssues.some(issue => issue.repairable) && <button type="button" disabled={!selectedRepairIds.length || isRepairing} onClick={repairSelectedPayrollData} className="mt-2 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white disabled:bg-slate-300">
              {isRepairing ? tr('جاري الإصلاح...', 'Repairing...') : tr(`إصلاح المحدد (${selectedRepairIds.length})`, `Repair selected (${selectedRepairIds.length})`)}
            </button>}
          </div>}
        </div>

        {/* Ping Result Display */}
        {pingResult && (
          <div className={`mb-5 p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
            pingResult.status === 'HEALTHY' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            {pingResult.status === 'HEALTHY' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{pingResult.message}</span>
          </div>
        )}

      </div>
    </div>
  );
};
