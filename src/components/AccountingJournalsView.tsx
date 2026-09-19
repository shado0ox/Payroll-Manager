import React, { useState, useMemo } from 'react';
import { 
  Layers, 
  FileSpreadsheet, 
  Download, 
  CheckCircle2, 
  Calendar, 
  Send, 
  Sparkles, 
  Settings, 
  DollarSign,
  AlertCircle,
  Building2,
  Pencil,
  Save,
  X
} from 'lucide-react';
import { Company, PayrollRun, JournalBatch, JournalLine, UserRole } from '../types';
import { formatSAR, formatNumber, roundAmount } from '../utils/payrollEngine';
import { buildJournalDraft, generateGosiAccrualJournalBatches, generateGosiPaymentJournalBatches, generatePayrollJournalBatch, generatePaymentJournalBatch, mergeFreshJournalWithDraft } from '../utils/accountingEngine';
import { exportQoyodJournalCsv } from '../utils/exportUtils';
import { useLanguage } from '../i18n/LanguageContext';

interface AccountingJournalsViewProps {
  company: Company;
  payrollRuns: PayrollRun[];
  journals: JournalBatch[];
  activeRole: UserRole;
  onUpdateCompany: (company: Company) => void;
  onSaveJournal: (journal: JournalBatch) => Promise<void>;
  onOpenQoyodModal: (batch: JournalBatch) => void;
}

export const AccountingJournalsView: React.FC<AccountingJournalsViewProps> = ({
  company,
  payrollRuns,
  journals,
  activeRole,
  onUpdateCompany,
  onSaveJournal,
  onOpenQoyodModal,
}) => {
  const { language } = useLanguage();
  const ui = (ar: string, en: string) => language === 'ar' ? ar : en;
  const companyRuns = useMemo(() => {
    return payrollRuns.filter(r => r.companyId === company.id);
  }, [payrollRuns, company.id]);

  const [selectedPeriod, setSelectedPeriod] = useState<string>(
    companyRuns[0]?.periodMonth || new Date().toISOString().slice(0, 7)
  );

  const [journalType, setJournalType] = useState<'PAYROLL_ACCRUAL' | 'GOSI_ACCRUAL' | 'PAYROLL_PAYMENT' | 'GOSI_PAYMENT'>('PAYROLL_ACCRUAL');
  const [selectedGosiBranchId,setSelectedGosiBranchId]=useState('');
  const [editingLines,setEditingLines]=useState<JournalLine[]|null>(null);
  const [changeReason,setChangeReason]=useState('');
  const [saving,setSaving]=useState(false);
  const [isAccountsMapModalOpen, setIsAccountsMapModalOpen] = useState(false);

  const currentRun = useMemo(() => {
    return companyRuns.find(r => r.periodMonth === selectedPeriod) || companyRuns[0];
  }, [companyRuns, selectedPeriod]);

  const gosiAccrualBatches=useMemo(()=>currentRun?generateGosiAccrualJournalBatches(company,currentRun):[],[company,currentRun]);
  const gosiPaymentBatches=useMemo(()=>currentRun?generateGosiPaymentJournalBatches(company,currentRun):[],[company,currentRun]);
  const branchBatches=journalType==='GOSI_PAYMENT'?gosiPaymentBatches:gosiAccrualBatches;
  const effectiveBranchId=branchBatches.some(batch=>batch.gosiBranchId===selectedGosiBranchId)?selectedGosiBranchId:(branchBatches[0]?.gosiBranchId||'');

  const freshBatch: JournalBatch | null = useMemo(() => {
    if (!currentRun) return null;
    if(journalType==='PAYROLL_ACCRUAL')return generatePayrollJournalBatch(company,currentRun);
    if(journalType==='PAYROLL_PAYMENT')return generatePaymentJournalBatch(company,currentRun);
    return branchBatches.find(batch=>batch.gosiBranchId===effectiveBranchId)||null;
  },[company,currentRun,journalType,branchBatches,effectiveBranchId]);
  const persistedBatch = useMemo(
    () => freshBatch ? journals.find(journal => journal.id === freshBatch.id) : undefined,
    [freshBatch,journals]
  );
  const activeBatch=useMemo(()=>freshBatch?mergeFreshJournalWithDraft(freshBatch,persistedBatch):null,[freshBatch,persistedBatch]);
  const displayedLines=editingLines||activeBatch?.lines||[];
  const displayedTotalDebit=roundAmount(displayedLines.reduce((sum,line)=>sum+Number(line.debit||0),0));
  const displayedTotalCredit=roundAmount(displayedLines.reduce((sum,line)=>sum+Number(line.credit||0),0));
  const isLocked=Boolean(persistedBatch?.qoyodSyncStatus?.synced);
  const isBalanced=activeBatch?Math.abs(displayedTotalDebit-displayedTotalCredit)<0.01:false;

  const saveDraft=async()=>{if(!freshBatch||!editingLines||!changeReason.trim()||!isBalanced)return;setSaving(true);try{await onSaveJournal(buildJournalDraft(freshBatch,editingLines,changeReason.trim()));setEditingLines(null);setChangeReason('');}finally{setSaving(false);}};
  const diagnosticLabel=(code:NonNullable<JournalBatch['balanceDiagnostics']>[number]['code'])=>({
    PRIOR_PERIOD_BALANCE_EXCLUDED:ui('رصيد سابق مستبعد من استحقاق الشهر الحالي','Prior balance excluded from current accrual'),
    GROSS_COMPONENT_MISMATCH:ui('اختلاف مكونات الاستحقاقات','Gross component mismatch'),
    DEDUCTION_COMPONENT_MISMATCH:ui('اختلاف مكونات الخصومات','Deduction component mismatch'),
    CURRENT_NET_MISMATCH:ui('اختلاف صافي الشهر الحالي','Current-period net mismatch'),
    DEDUCTIONS_EXCEED_GROSS:ui('الخصومات تتجاوز استحقاق الشهر','Deductions exceed current gross'),
  })[code];

  // Chart of accounts form state
  const [accountsForm, setAccountsForm] = useState(company.chartOfAccounts);

  const handleSaveAccounts = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateCompany({
      ...company,
      chartOfAccounts: accountsForm,
    });
    setIsAccountsMapModalOpen(false);
    alert(ui('تم تحديث خريطة الحسابات بنجاح ومطابقتها مع دليل حسابات قيود!', 'The account mapping was saved and aligned with the Qoyod chart of accounts.'));
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-6 h-6 text-emerald-600" />
            <span>{ui('القيود المحاسبية وتكامل برنامج قيود', 'Accounting Journals & Qoyod Integration')}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {ui('توليد قيود اليومية المزدوجة المتوازنة آلياً حسب مراكز التكلفة والتصدير بصيغة قيود المحاسبي', 'Generate balanced double-entry journals by cost center and export them in Qoyod format.')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Period Selector */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
            <Calendar className="w-4 h-4 text-slate-500" />
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 border-none focus:ring-0 cursor-pointer"
            >
              {companyRuns.map(r => (
                <option key={r.id} value={r.periodMonth}>{ui('فترة', 'Period')} {r.periodMonth}</option>
              ))}
            </select>
          </div>

          {/* Accounts Mapping Config */}
          <button
            onClick={() => {
              setAccountsForm(company.chartOfAccounts);
              setIsAccountsMapModalOpen(true);
            }}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Settings className="w-4 h-4 text-slate-600" />
            <span>{ui('خريطة الحسابات (قيود)', 'Account Mapping (Qoyod)')}</span>
          </button>

          {/* Qoyod Direct API & CSV Export */}
          {activeBatch && (
            <>
              <button
                disabled={Boolean(editingLines)||!isBalanced}
                onClick={() => onOpenQoyodModal(activeBatch)}
                className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>{ui('ترحيل لقيود (API 2.0)', 'Post to Qoyod (API 2.0)')}</span>
              </button>

              <button
                disabled={Boolean(editingLines)||!isBalanced}
                onClick={() => exportQoyodJournalCsv(activeBatch, company)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>{ui('تصدير CSV لقيود', 'Export Qoyod CSV')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xs sm:grid-cols-2 lg:grid-cols-4">
        {([
          ['PAYROLL_ACCRUAL',ui('استحقاق الرواتب','Payroll accrual')],
          ['GOSI_ACCRUAL',ui('استحقاق التأمينات','GOSI accrual')],
          ['PAYROLL_PAYMENT',ui('صرف الرواتب','Payroll payment')],
          ['GOSI_PAYMENT',ui('صرف التأمينات','GOSI payment')],
        ] as const).map(([type,label])=><button key={type} onClick={()=>{setJournalType(type);setEditingLines(null);setChangeReason('');}} className={`rounded-xl py-2 text-xs font-bold transition-all ${journalType===type?'bg-emerald-600 text-white shadow-xs':'text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}
      </div>
      {(journalType==='GOSI_ACCRUAL'||journalType==='GOSI_PAYMENT')&&<div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs"><label className="text-xs font-bold text-slate-600">{ui('فرع التأمينات','GOSI branch')}<select className="ms-2 rounded-xl border border-slate-200 px-3 py-2" value={effectiveBranchId} onChange={event=>{setSelectedGosiBranchId(event.target.value);setEditingLines(null);setChangeReason('');}}>{branchBatches.map(batch=><option key={batch.id} value={batch.gosiBranchId}>{batch.gosiBranchName} · {batch.gosiBranchCode}</option>)}</select></label>{!branchBatches.length&&<span className="ms-3 text-xs text-amber-700">{ui('لا توجد مبالغ تأمينات مرتبطة بفروع داخل عناصر المسير.','No payroll GOSI amounts are assigned to a branch.')}</span>}</div>}

      {/* Batch Header Information Card */}
      {activeBatch && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-md bg-slate-900 text-white">
                {activeBatch.batchNumber}
              </span>
              <span className="text-xs text-slate-500 font-medium">
                {ui('تاريخ القيد', 'Journal date')}: {activeBatch.date}
              </span>
              {isLocked && (
                <span className="text-[11px] font-bold px-2 py-1 rounded-md bg-sky-50 text-sky-700 border border-sky-200">
                  {ui('مرحّل إلى قيود', 'Posted to Qoyod')} #{persistedBatch.qoyodSyncStatus?.qoyodJournalId || ''}
                </span>
              )}
            </div>
            <h3 className="font-bold text-sm text-slate-900">{language === 'en' ? activeBatch.descriptionEn || activeBatch.description : activeBatch.description}</h3>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {!isLocked&&!editingLines&&<button onClick={()=>{setEditingLines(activeBatch.lines.map(line=>({...line})));setChangeReason('');}} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"><Pencil className="h-3.5 w-3.5"/>{ui('تعديل القيد','Edit journal')}</button>}
              {editingLines&&<><input value={changeReason} onChange={event=>setChangeReason(event.target.value)} placeholder={ui('سبب التعديل (إلزامي)','Change reason (required)')} className="min-w-64 rounded-lg border border-slate-200 px-3 py-1.5 text-xs"/><button disabled={saving||!changeReason.trim()||!isBalanced} onClick={saveDraft} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"><Save className="h-3.5 w-3.5"/>{ui('حفظ التعديل','Save changes')}</button><button onClick={()=>{setEditingLines(null);setChangeReason('');}} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs"><X className="h-3.5 w-3.5"/>{ui('إلغاء','Cancel')}</button></>}
              {isLocked&&<span className="text-[11px] text-slate-500">{ui('القيد مقفول ويُعرض من لقطة الترحيل إلى قيود.','Locked and displayed from the Qoyod snapshot.')}</span>}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[11px] text-slate-500">{ui('إجمالي المدين', 'Total debit')} (Debit)</div>
              <div className="text-base font-extrabold text-slate-900 font-mono">
                {formatSAR(displayedTotalDebit)}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] text-slate-500">{ui('إجمالي الدائن', 'Total credit')} (Credit)</div>
              <div className="text-base font-extrabold text-slate-900 font-mono">
                {formatSAR(displayedTotalCredit)}
              </div>
            </div>

            <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold ${isBalanced?'bg-emerald-50 text-emerald-800 border-emerald-200':'bg-amber-50 text-amber-800 border-amber-200'}`}>
              {isBalanced?<CheckCircle2 className="w-4 h-4 text-emerald-600" />:<AlertCircle className="w-4 h-4"/>}
              <span>{isBalanced?ui('القيد متوازن تماماً','Journal is balanced'):ui(`القيد غير متوازن — فرق ${formatSAR(Math.abs(displayedTotalDebit-displayedTotalCredit))}`,'Journal is unbalanced — difference '+formatSAR(Math.abs(displayedTotalDebit-displayedTotalCredit)))}</span>
            </div>
          </div>
        </div>
      )}

      {activeBatch?.balanceDiagnostics?.length ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-xs">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"/>
          <div>
            <div className="text-xs font-black text-amber-950">{ui('تحليل فروقات قيد الرواتب','Payroll journal diagnostics')}</div>
            <p className="mt-1 text-[11px] leading-5 text-amber-800">{ui('الأرصدة المرحلة تظهر للتفسير فقط ولا يعاد إثباتها كمصروف في الشهر الحالي. أخطاء الحساب تمنع الحفظ والتصدير والترحيل حتى تصحيح المسير.','Carried balances are shown for explanation only and are not accrued again in the current month. Calculation errors block saving, export, and posting until payroll is corrected.')}</p>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto rounded-xl border border-amber-200 bg-white">
          <table className="w-full min-w-[760px] text-[10px]">
            <thead className="bg-amber-100/70 text-amber-950"><tr><th className="px-3 py-2 text-start">{ui('الموظف','Employee')}</th><th className="px-3 py-2 text-start">{ui('الرقم','Number')}</th><th className="px-3 py-2 text-start">{ui('سبب الملاحظة','Reason')}</th><th className="px-3 py-2 text-start">{ui('الشهر المصدر','Source month')}</th><th className="px-3 py-2 text-end">{ui('المسجل','Recorded')}</th><th className="px-3 py-2 text-end">{ui('المتوقع','Expected')}</th><th className="px-3 py-2 text-end">{ui('الفرق','Difference')}</th></tr></thead>
            <tbody>{activeBatch.balanceDiagnostics.map((detail,index)=><tr key={`${detail.employeeId}-${detail.code}-${index}`} className="border-t border-amber-100 text-slate-700">
              <td className="px-3 py-2 font-bold">{detail.employeeName||ui('غير مسجل','Not recorded')}</td><td className="px-3 py-2 font-mono">{detail.employeeNo||'—'}</td>
              <td className={`px-3 py-2 font-bold ${detail.severity==='ERROR'?'text-rose-700':'text-sky-700'}`}>{diagnosticLabel(detail.code)}</td><td className="px-3 py-2 font-mono">{detail.sourcePeriods?.join('، ')||'—'}</td>
              <td className="px-3 py-2 text-end">{formatSAR(detail.recorded)}</td><td className="px-3 py-2 text-end">{formatSAR(detail.expected)}</td><td className={`px-3 py-2 text-end font-black ${detail.difference<0?'text-rose-700':'text-emerald-700'}`}>{formatSAR(detail.difference)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>:null}

      {/* Double-Entry Journal Lines Table */}
      {activeBatch && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-800 text-white font-bold border-b border-slate-700">
                  <th className="py-3 px-4">{ui('رمز الحساب (قيود)', 'Account Code (Qoyod)')}</th>
                  <th className="py-3 px-4">{ui('اسم الحساب في الدليل', 'Account Name')}</th>
                  <th className="py-3 px-4">{ui('مركز التكلفة', 'Cost Center')}</th>
                  <th className="py-3 px-4">{ui('البيان والشرح', 'Description')}</th>
                  <th className="py-3 px-4 text-emerald-300 font-extrabold">{ui('مدين', 'Debit')}</th>
                  <th className="py-3 px-4 text-sky-300 font-extrabold">{ui('دائن', 'Credit')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {displayedLines.map((line) => (
                  <tr key={line.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-bold text-slate-800">{editingLines?<input className="w-28 rounded border px-2 py-1" value={line.accountCode} onChange={event=>setEditingLines(rows=>rows!.map(row=>row.id===line.id?{...row,accountCode:event.target.value}:row))}/>:line.accountCode}</td>
                    <td className="py-3 px-4 font-sans font-semibold text-slate-900">{editingLines?<input className="min-w-44 rounded border px-2 py-1" value={line.accountNameAr} onChange={event=>setEditingLines(rows=>rows!.map(row=>row.id===line.id?{...row,accountNameAr:event.target.value}:row))}/>:language === 'en' ? line.accountNameEn || line.accountNameAr : line.accountNameAr}</td>
                    <td className="py-3 px-4 font-sans text-slate-600">
                      {line.costCenterName ? (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold">
                          {line.costCenterCode} - {language === 'en' ? line.costCenterNameEn || line.costCenterName : line.costCenterName}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-600">{editingLines?<input className="min-w-64 rounded border px-2 py-1" value={line.descriptionAr} onChange={event=>setEditingLines(rows=>rows!.map(row=>row.id===line.id?{...row,descriptionAr:event.target.value}:row))}/>:language === 'en' ? line.descriptionEn || line.descriptionAr : line.descriptionAr}</td>
                    <td className="py-3 px-4 font-extrabold text-emerald-700">
                      {editingLines?<input type="number" min="0" step="0.01" className="w-28 rounded border px-2 py-1" value={line.debit} onChange={event=>setEditingLines(rows=>rows!.map(row=>row.id===line.id?{...row,debit:Number(event.target.value),credit:Number(event.target.value)>0?0:row.credit}:row))}/>:line.debit > 0 ? formatSAR(line.debit) : '-'}
                    </td>
                    <td className="py-3 px-4 font-extrabold text-sky-700">
                      {editingLines?<input type="number" min="0" step="0.01" className="w-28 rounded border px-2 py-1" value={line.credit} onChange={event=>setEditingLines(rows=>rows!.map(row=>row.id===line.id?{...row,credit:Number(event.target.value),debit:Number(event.target.value)>0?0:row.debit}:row))}/>:line.credit > 0 ? formatSAR(line.credit) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-300 font-bold text-slate-900">
                  <td colSpan={4} className="py-3 px-4 text-left font-sans">{ui('الإجمالي العام المتوازن:', 'Balanced total:')}</td>
                  <td className="py-3 px-4 text-emerald-800 text-sm font-extrabold font-mono">{formatSAR(displayedTotalDebit)}</td>
                  <td className="py-3 px-4 text-sky-800 text-sm font-extrabold font-mono">{formatSAR(displayedTotalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Accounts Mapping Modal */}
      {isAccountsMapModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{ui('خريطة الحسابات المحاسبية (دليل قيود)', 'Accounting Mapping (Qoyod Chart of Accounts)')}</h3>
                <p className="text-xs text-slate-500">{ui('تخصيص رموز وأرقام الحسابات للمنشأة:', 'Configure account codes for:')} {language === 'en' ? company.nameEn || company.nameAr : company.nameAr}</p>
              </div>
              <button
                onClick={() => setIsAccountsMapModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAccounts} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{ui('ح/ مصروف الرواتب الأساسية', 'Basic salary expense account')}</label>
                  <input
                    type="text"
                    value={accountsForm.salariesExpenseAccount}
                    onChange={(e) => setAccountsForm({ ...accountsForm, salariesExpenseAccount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{ui('ح/ مصروف بدل السكن', 'Housing allowance expense account')}</label>
                  <input
                    type="text"
                    value={accountsForm.housingAllowanceAccount}
                    onChange={(e) => setAccountsForm({ ...accountsForm, housingAllowanceAccount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{ui('ح/ مصروف بدل النقل', 'Transport allowance expense account')}</label>
                  <input
                    type="text"
                    value={accountsForm.transportAllowanceAccount}
                    onChange={(e) => setAccountsForm({ ...accountsForm, transportAllowanceAccount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{ui('ح/ مصروف العمل الإضافي', 'Overtime expense account')}</label>
                  <input
                    type="text"
                    value={accountsForm.overtimeExpenseAccount}
                    onChange={(e) => setAccountsForm({ ...accountsForm, overtimeExpenseAccount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{ui('ح/ مصروف التأمينات - حصة المنشأة', 'Employer GOSI expense account')}</label>
                  <input
                    type="text"
                    value={accountsForm.gosiEmployerExpenseAccount}
                    onChange={(e) => setAccountsForm({ ...accountsForm, gosiEmployerExpenseAccount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{ui('ح/ مستحقات الرواتب والأجور (دائن)', 'Salaries and wages payable account')}</label>
                  <input
                    type="text"
                    value={accountsForm.salariesPayableAccount}
                    onChange={(e) => setAccountsForm({ ...accountsForm, salariesPayableAccount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{ui('ح/ مستحقات التأمينات GOSI (دائن)', 'GOSI payable account')}</label>
                  <input
                    type="text"
                    value={accountsForm.gosiPayableAccount}
                    onChange={(e) => setAccountsForm({ ...accountsForm, gosiPayableAccount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{ui('ح/ سلف وذمم الموظفين (دائن)', 'Employee loans and advances account')}</label>
                  <input
                    type="text"
                    value={accountsForm.employeeAdvancesAccount}
                    onChange={(e) => setAccountsForm({ ...accountsForm, employeeAdvancesAccount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{ui('ح/ البنك الجاري (حساب الصرف)', 'Current bank payment account')}</label>
                  <input
                    type="text"
                    value={accountsForm.bankAccount}
                    onChange={(e) => setAccountsForm({ ...accountsForm, bankAccount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAccountsMapModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  {ui('إلغاء', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold"
                >
                  {ui('حفظ الخريطة', 'Save mapping')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
