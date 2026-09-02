import React, { useState, useMemo } from 'react';
import { 
  Receipt, 
  Plus, 
  DollarSign, 
  Calendar, 
  AlertCircle, 
  CheckCircle2, 
  PauseCircle, 
  Trash2,
  Edit3,
  RotateCcw,
  FileText,
  Printer
} from 'lucide-react';
import { Company, Employee, LoanSchedule, PenaltyRecord, TemporaryEarningRecord, PayrollRun, UserRole } from '../types';
import { formatSAR } from '../utils/payrollEngine';
import { SearchableEmployeeSelect } from './SearchableEmployeeSelect';
import { useLanguage } from '../i18n/LanguageContext';
import { TemporaryEarningsPanel } from './TemporaryEarningsPanel';
import { printLoanAcknowledgement, printPenaltyAcknowledgement } from '../utils/employeeActionForms';

interface LoansPenaltiesViewProps {
  company: Company;
  employees: Employee[];
  loans: LoanSchedule[];
  penalties: PenaltyRecord[];
  temporaryEarnings: TemporaryEarningRecord[];
  payrollRuns: PayrollRun[];
  activeRole: UserRole;
  onSaveLoan: (loan: LoanSchedule) => void;
  onUpdateLoanStatus: (loanId: string, status: LoanSchedule['status']) => void;
  onDeleteLoan: (loanId: string) => void;
  onAdjustLoan: (loanId: string, amount: number, reason: string, date: string) => void;
  onSavePenalty: (penalty: PenaltyRecord) => void;
  onCancelPenalty: (penaltyId: string) => void;
  onDeletePenalty: (penaltyId: string) => void;
  onSaveTemporaryEarning: (earning: TemporaryEarningRecord) => void;
  onCancelTemporaryEarning: (earningId: string) => void;
  onDeleteTemporaryEarning: (earningId: string) => void;
}

export const LoansPenaltiesView: React.FC<LoansPenaltiesViewProps> = ({
  company,
  employees,
  loans,
  penalties,
  temporaryEarnings,
  payrollRuns,
  activeRole,
  onSaveLoan,
  onUpdateLoanStatus,
  onDeleteLoan,
  onAdjustLoan,
  onSavePenalty,
  onCancelPenalty,
  onDeletePenalty,
  onSaveTemporaryEarning,
  onCancelTemporaryEarning,
  onDeleteTemporaryEarning,
}) => {
  const { language } = useLanguage();
  const tr = (ar: string, en: string) => language === 'ar' ? ar : en;
  const today = new Date().toISOString().slice(0, 10);
  const currentPeriod = today.slice(0, 7);
  const [activeTab, setActiveTab] = useState<'loans' | 'penalties' | 'earnings'>('loans');
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [isPenaltyModalOpen, setIsPenaltyModalOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<LoanSchedule | null>(null);
  const [editingPenalty, setEditingPenalty] = useState<PenaltyRecord | null>(null);
  const [penaltyPeriodFrom, setPenaltyPeriodFrom] = useState(currentPeriod);
  const [penaltyPeriodTo, setPenaltyPeriodTo] = useState(currentPeriod);

  const companyEmployees = useMemo(() => {
    return employees.filter(e => e.companyId === company.id);
  }, [employees, company.id]);

  const companyLoans = useMemo(() => {
    const rows = loans
      .filter(loan => loan.companyId === company.id)
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
    const balances = new Map<string, number>(rows.map(loan => [loan.id, Math.max(0, Number(loan.remainingAmount) || 0)]));
    payrollRuns
      .filter(run => run.companyId === company.id && ['APPROVED', 'POSTED'].includes(run.status))
      .sort((a, b) => a.periodMonth.localeCompare(b.periodMonth))
      .forEach(run => {
        const deductions = new Map<string, number>(run.items.map(item => [item.employeeId, Math.max(0, Number(item.loanDeduction) || 0)]));
        for (const loan of rows) {
          if (loan.startDate > run.periodMonth) continue;
          const paid = deductions.get(loan.employeeId) || 0;
          if (paid <= 0) continue;
          const balance = balances.get(loan.id) || 0;
          const applied = Math.min(balance, paid);
          balances.set(loan.id, Number((balance - applied).toFixed(2)));
          deductions.set(loan.employeeId, Number((paid - applied).toFixed(2)));
        }
      });
    return rows.map(loan => {
      const remainingAmount = balances.get(loan.id) || 0;
      return {
        ...loan,
        remainingAmount,
        remainingInstallments: remainingAmount === 0
          ? 0
          : loan.monthlyInstallment > 0 ? Math.ceil(remainingAmount / loan.monthlyInstallment) : loan.remainingInstallments,
        status: remainingAmount === 0 ? 'COMPLETED' as const : loan.status,
      };
    });
  }, [loans, payrollRuns, company.id]);

  const companyPenalties = useMemo(() => {
    return penalties.filter(p => p.companyId === company.id);
  }, [penalties, company.id]);

  const filteredPenalties = useMemo(() => companyPenalties.filter(penalty =>
    penalty.periodMonth >= penaltyPeriodFrom && penalty.periodMonth <= penaltyPeriodTo
  ), [companyPenalties, penaltyPeriodFrom, penaltyPeriodTo]);

  // New Loan Form
  const [loanForm, setLoanForm] = useState({
    employeeId: companyEmployees[0]?.id || '',
    totalAmount: 10000,
    monthlyInstallment: 1000,
    totalInstallments: 10,
    startDate: currentPeriod,
    reason: '',
  });

  // New Penalty Form
  const [penaltyForm, setPenaltyForm] = useState({
    employeeId: companyEmployees[0]?.id || '',
    periodMonth: currentPeriod,
    date: today,
    reason: '',
    amount: 200,
  });

  const handleSaveLoan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanForm.employeeId) return;

    const newLoan: LoanSchedule = {
      id: editingLoan?.id || `loan-${Date.now()}`,
      companyId: company.id,
      employeeId: loanForm.employeeId,
      totalAmount: loanForm.totalAmount,
      monthlyInstallment: loanForm.monthlyInstallment,
      totalInstallments: loanForm.totalInstallments,
      remainingInstallments: editingLoan
        ? Math.max(0, loanForm.totalInstallments - (editingLoan.totalInstallments - editingLoan.remainingInstallments))
        : loanForm.totalInstallments,
      remainingAmount: editingLoan
        ? Math.max(0, loanForm.totalAmount - (editingLoan.totalAmount - editingLoan.remainingAmount))
        : loanForm.totalAmount,
      startDate: loanForm.startDate,
      status: editingLoan?.status || 'ACTIVE',
      reason: loanForm.reason,
    };

    onSaveLoan(newLoan);
    setIsLoanModalOpen(false);
    setEditingLoan(null);
  };

  const handleSavePenalty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!penaltyForm.employeeId) return;

    const newPenalty: PenaltyRecord = {
      id: editingPenalty?.id || `pen-${Date.now()}`,
      companyId: company.id,
      employeeId: penaltyForm.employeeId,
      periodMonth: penaltyForm.periodMonth,
      date: penaltyForm.date,
      reason: penaltyForm.reason,
      amount: penaltyForm.amount,
      appliedInPayroll: editingPenalty?.appliedInPayroll ?? true,
    };

    onSavePenalty(newPenalty);
    setIsPenaltyModalOpen(false);
    setEditingPenalty(null);
  };

  const openEditLoan = (loan: LoanSchedule) => {
    setEditingLoan(loan);
    setLoanForm({
      employeeId: loan.employeeId, totalAmount: loan.totalAmount, monthlyInstallment: loan.monthlyInstallment,
      totalInstallments: loan.totalInstallments, startDate: loan.startDate, reason: loan.reason,
    });
    setIsLoanModalOpen(true);
  };

  const openEditPenalty = (penalty: PenaltyRecord) => {
    setEditingPenalty(penalty);
    setPenaltyForm({
      employeeId: penalty.employeeId, periodMonth: penalty.periodMonth, date: penalty.date,
      reason: penalty.reason, amount: penalty.amount,
    });
    setIsPenaltyModalOpen(true);
  };

  // Metrics
  const totalActiveLoansAmount = companyLoans
    .filter(l => l.status === 'ACTIVE')
    .reduce((sum, l) => sum + l.remainingAmount, 0);

  const totalMonthlyDeductionExpected = companyLoans
    .filter(l => l.status === 'ACTIVE')
    .reduce((sum, l) => sum + l.monthlyInstallment, 0);

  return (
    <div data-no-translate className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="w-6 h-6 text-emerald-600" />
            <span>{tr('السلف والجزاءات والإضافات المؤقتة', 'Loans, Penalties & Temporary Earnings')}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {tr('إدارة السلف والخصومات والعمولات والمكافآت غير الدورية وربطها تلقائيًا بالمسير', 'Manage loans, deductions, commissions and one-time bonuses with automatic payroll integration')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'loans' ? (
            <button
              onClick={() => { setEditingLoan(null); setIsLoanModalOpen(true); }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{tr('إضافة سلفة جديدة', 'Add loan')}</span>
            </button>
          ) : activeTab === 'penalties' ? (
            <button
              onClick={() => { setEditingPenalty(null); setIsPenaltyModalOpen(true); }}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{tr('تسجيل جزاء / خصم إداري', 'Add penalty / deduction')}</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-500 font-semibold">{tr('إجمالي أرصدة السلف القائمة', 'Total outstanding loan balances')}</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{formatSAR(totalActiveLoansAmount)}</div>
          <div className="text-[10px] text-slate-400">{tr('ذمم مدينة لموظفي المنشأة', 'Employee receivables')}</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-500 font-semibold">{tr('استقطاع الأقساط الشهري المتوقع', 'Expected monthly installment deductions')}</div>
          <div className="text-xl font-bold text-emerald-700 mt-1">{formatSAR(totalMonthlyDeductionExpected)}</div>
          <div className="text-[10px] text-slate-400">{tr('يُخصم شهرياً عبر مسير الرواتب', 'Deducted through monthly payroll')}</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-500 font-semibold">{tr('عدد الموظفين المستفيدين من السلف', 'Employees with active loans')}</div>
          <div className="text-xl font-bold text-blue-700 mt-1">
            {companyLoans.filter(l => l.status === 'ACTIVE').length} {tr('موظف', 'employees')}
          </div>
          <div className="text-[10px] text-slate-400">{tr('سلف سارية المفعول', 'Active loan schedules')}</div>
        </div>
      </div>

      {/* Tab Selector */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('loans')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'loans'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {tr('جدول سلف وأقساط الموظفين', 'Employee loans & installments')} ({companyLoans.length})
        </button>

        <button
          onClick={() => setActiveTab('penalties')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'penalties'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {tr('سجل الجزاءات والخصومات', 'Penalties & deductions')} ({companyPenalties.length})
        </button>

        <button
          onClick={() => setActiveTab('earnings')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'earnings' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          {tr('العمولات والمكافآت المؤقتة', 'Temporary earnings')} ({temporaryEarnings.filter(item => item.companyId === company.id).length})
        </button>
      </div>

      {/* Loans Table */}
      {activeTab === 'loans' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <th className="py-3 px-4">{tr('الموظف', 'Employee')}</th>
                  <th className="py-3 px-4">{tr('مبلغ السلفة الإجمالي', 'Total loan amount')}</th>
                  <th className="py-3 px-4">{tr('القسط الشهري', 'Monthly installment')}</th>
                  <th className="py-3 px-4">{tr('الأقساط (المتبقي / الإجمالي)', 'Installments (remaining / total)')}</th>
                  <th className="py-3 px-4">{tr('الرصيد المتبقي', 'Remaining balance')}</th>
                  <th className="py-3 px-4">{tr('تاريخ البداية', 'Start period')}</th>
                  <th className="py-3 px-4">{tr('السبب', 'Reason')}</th>
                  <th className="py-3 px-4">{tr('الحالة', 'Status')}</th>
                  <th className="py-3 px-4 text-center">{tr('الإجراء', 'Action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {companyLoans.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      {tr('لا توجد سلف مسجلة حالياً', 'No loans recorded')}
                    </td>
                  </tr>
                ) : (
                  companyLoans.map((loan) => {
                    const emp = companyEmployees.find(e => e.id === loan.employeeId);
                    return (
                      <tr key={loan.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{emp ? (language === 'en' && (emp.firstNameEn || emp.lastNameEn) ? `${emp.firstNameEn || ''} ${emp.lastNameEn || ''}`.trim() : `${emp.firstNameAr} ${emp.lastNameAr}`) : tr('موظف', 'Employee')}</div>
                          <div className="text-[10px] text-slate-400">{emp?.employeeNo} - {emp?.department}</div>
                        </td>

                        <td className="py-3 px-4 font-bold text-slate-900">
                          {formatSAR(loan.totalAmount + (loan.adjustments || []).reduce((sum, item) => sum + item.amount, 0))}
                          {(loan.adjustments || []).length > 0 && <div className="text-[10px] font-medium text-slate-400">{tr('الأصل', 'Original')}: {formatSAR(loan.totalAmount)} · {tr('تسويات', 'Adjustments')}: {(loan.adjustments || []).length}</div>}
                        </td>
                        <td className="py-3 px-4 font-semibold text-rose-700">{formatSAR(loan.monthlyInstallment)}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-700">{loan.remainingInstallments} {tr('من', 'of')} {loan.totalInstallments}</td>
                        <td className="py-3 px-4 font-extrabold text-amber-800 font-mono">{formatSAR(loan.remainingAmount)}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{loan.startDate}</td>
                        <td className="py-3 px-4 text-slate-600">{loan.reason}</td>

                        <td className="py-3 px-4">
                          {loan.status === 'ACTIVE' ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                              {tr('سارية الخصم', 'Active')}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                              {tr('موقوفة / مسددة', 'Paused / settled')}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                          <button disabled={!emp} onClick={() => emp && !printLoanAcknowledgement(company, emp, loan) && alert(tr('يرجى السماح بالنوافذ المنبثقة لطباعة النموذج.', 'Please allow pop-ups to print the form.'))} className="text-emerald-700 disabled:text-slate-300" title={tr('طباعة إقرار السلفة PDF', 'Print loan acknowledgment PDF')}><Printer className="w-4 h-4" /></button>
                          <button onClick={() => {
                            const raw = prompt(tr('أدخل مبلغ التسوية: قيمة سالبة لتخفيض السلفة أو موجبة لزيادتها', 'Enter adjustment amount: negative to reduce the loan or positive to increase it'));
                            if (raw == null) return;
                            const amount = Number(raw);
                            if (!Number.isFinite(amount) || amount === 0) return alert(tr('مبلغ التسوية غير صحيح.', 'Invalid adjustment amount.'));
                            const reason = prompt(tr('سبب التسوية *', 'Adjustment reason *')) || '';
                            if (!reason.trim()) return alert(tr('سبب التسوية مطلوب.', 'Adjustment reason is required.'));
                            const date = prompt(tr('تاريخ التسوية YYYY-MM-DD', 'Adjustment date YYYY-MM-DD'), new Date().toISOString().slice(0,10)) || '';
                            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return alert(tr('تاريخ التسوية غير صحيح.', 'Invalid adjustment date.'));
                            onAdjustLoan(loan.id, amount, reason, date);
                          }} className="text-violet-700" title={tr('تسوية السلفة', 'Adjust loan balance')}><DollarSign className="w-4 h-4" /></button>
                          <button onClick={() => openEditLoan(loan)} className="text-blue-700" title={tr('تعديل السلفة', 'Edit loan')}><Edit3 className="w-4 h-4" /></button>
                          <button onClick={() => { if (confirm(tr('حذف السلفة نهائيًا وإزالة أقساطها من المسير القادم؟', 'Permanently delete this loan and remove its installments from future payroll?'))) onDeleteLoan(loan.id); }} className="text-rose-700" title={tr('حذف السلفة', 'Delete loan')}><Trash2 className="w-4 h-4" /></button>
                          {loan.status === 'ACTIVE' ? (
                            <button
                              onClick={() => onUpdateLoanStatus(loan.id, 'PAUSED')}
                              className="text-[11px] font-semibold text-amber-700 hover:text-amber-800"
                            >
                              {tr('إيقاف مؤقت', 'Pause')}
                            </button>
                          ) : (
                            <button
                              onClick={() => onUpdateLoanStatus(loan.id, 'ACTIVE')}
                              className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
                            >
                              {tr('تفعيل الخصم', 'Resume deductions')}
                            </button>
                          )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'penalties' ? (
        /* Penalties Table */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div data-penalty-period-filter className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-slate-50/70 p-4">
            <div><label className="mb-1 block text-[11px] font-bold text-slate-600">{tr('من شهر', 'From month')}</label><input type="month" value={penaltyPeriodFrom} onChange={event => setPenaltyPeriodFrom(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs" /></div>
            <div><label className="mb-1 block text-[11px] font-bold text-slate-600">{tr('إلى شهر', 'To month')}</label><input type="month" value={penaltyPeriodTo} min={penaltyPeriodFrom} onChange={event => setPenaltyPeriodTo(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs" /></div>
            <button type="button" onClick={() => { setPenaltyPeriodFrom(currentPeriod); setPenaltyPeriodTo(currentPeriod); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">{tr('الشهر الحالي', 'Current month')}</button>
            <span className="text-[11px] text-slate-500">{tr('النتائج', 'Results')}: {filteredPenalties.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <th className="py-3 px-4">{tr('الموظف', 'Employee')}</th>
                  <th className="py-3 px-4">{tr('فترة الراتب', 'Payroll period')}</th>
                  <th className="py-3 px-4">{tr('تاريخ الواقعة', 'Incident date')}</th>
                  <th className="py-3 px-4">{tr('سبب الجزاء / المخالفة', 'Penalty / violation reason')}</th>
                  <th className="py-3 px-4">{tr('مبلغ الخصم', 'Deduction amount')}</th>
                  <th className="py-3 px-4">{tr('التطبيق في المسير', 'Payroll application')}</th>
                  <th className="py-3 px-4 text-center">{tr('الإجراء', 'Action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPenalties.map((pen) => {
                  const emp = companyEmployees.find(e => e.id === pen.employeeId);
                  return (
                    <tr key={pen.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{emp ? (language === 'en' && (emp.firstNameEn || emp.lastNameEn) ? `${emp.firstNameEn || ''} ${emp.lastNameEn || ''}`.trim() : `${emp.firstNameAr} ${emp.lastNameAr}`) : tr('موظف', 'Employee')}</div>
                        <div className="text-[10px] text-slate-400">{emp?.jobTitle}</div>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold">{pen.periodMonth}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{pen.date}</td>
                      <td className="py-3 px-4 text-slate-700">{pen.reason}</td>
                      <td className="py-3 px-4 font-bold text-rose-700">{formatSAR(pen.amount)}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] border ${pen.appliedInPayroll ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {pen.appliedInPayroll ? tr('مطبق بالمسير', 'Applied') : tr('ملغى', 'Cancelled')}
                        </span>
                      </td>
                      <td className="py-3 px-4"><div className="flex justify-center gap-2">
                        <button disabled={!emp} onClick={() => emp && !printPenaltyAcknowledgement(company, emp, pen) && alert(tr('يرجى السماح بالنوافذ المنبثقة لطباعة النموذج.', 'Please allow pop-ups to print the form.'))} className="text-emerald-700 disabled:text-slate-300" title={tr('طباعة إشعار الخصم PDF', 'Print deduction notice PDF')}><Printer className="w-4 h-4" /></button>
                        <button onClick={() => openEditPenalty(pen)} className="text-blue-700" title={tr('تعديل الخصم', 'Edit deduction')}><Edit3 className="w-4 h-4" /></button>
                        {pen.appliedInPayroll && <button onClick={() => { if (confirm(tr('إلغاء هذا الخصم وإزالة أثره من المسير؟', 'Cancel this deduction and remove its payroll impact?'))) onCancelPenalty(pen.id); }} className="text-amber-700" title={tr('التراجع عن الخصم', 'Undo deduction')}><RotateCcw className="w-4 h-4" /></button>}
                        <button onClick={() => { if (confirm(tr('حذف الجزاء/الخصم نهائيًا؟', 'Permanently delete this penalty / deduction?'))) onDeletePenalty(pen.id); }} className="text-rose-700" title={tr('حذف نهائي', 'Delete permanently')}><Trash2 className="w-4 h-4" /></button>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <TemporaryEarningsPanel
          companyId={company.id}
          employees={employees}
          earnings={temporaryEarnings}
          onSave={onSaveTemporaryEarning}
          onCancel={onCancelTemporaryEarning}
          onDelete={onDeleteTemporaryEarning}
        />
      )}

      {/* Add Loan Modal */}
      {isLoanModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div data-no-translate className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">{editingLoan ? tr('تعديل السلفة وجدول الأقساط', 'Edit Loan & Installments') : tr('إضافة سلفة جديدة لموظف', 'Add Employee Loan')}</h3>

            <form onSubmit={handleSaveLoan} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">{tr('الموظف المستفيد *', 'Employee *')}</label>
                <SearchableEmployeeSelect
                  required
                  employees={companyEmployees}
                  value={loanForm.employeeId}
                  onChange={(employeeId) => setLoanForm({ ...loanForm, employeeId })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{tr('إجمالي مبلغ السلفة (SR) *', 'Total loan amount (SR) *')}</label>
                  <input
                    type="number"
                    required
                    min="100"
                    step="0.01"
                    value={loanForm.totalAmount}
                    onChange={(e) => {
                      const total = parseFloat(e.target.value) || 0;
                      setLoanForm({ 
                        ...loanForm, 
                        totalAmount: total,
                        monthlyInstallment: Math.round((total / (loanForm.totalInstallments || 1)) * 100) / 100
                      });
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{tr('عدد أشهر السداد *', 'Repayment months *')}</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="60"
                    value={loanForm.totalInstallments}
                    onChange={(e) => {
                      const inst = parseInt(e.target.value) || 1;
                      setLoanForm({ 
                        ...loanForm, 
                        totalInstallments: inst,
                        monthlyInstallment: Math.round((loanForm.totalAmount / inst) * 100) / 100
                      });
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                <span className="font-semibold text-emerald-900">{tr('القسط الشهري المحسوب:', 'Calculated monthly installment:')}</span>
                <span className="font-bold text-emerald-800 text-sm">{formatSAR(loanForm.monthlyInstallment)}</span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">{tr('سبب السلفة', 'Loan reason')}</label>
                <input
                  type="text"
                  required
                  value={loanForm.reason}
                  onChange={(e) => setLoanForm({ ...loanForm, reason: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setIsLoanModalOpen(false); setEditingLoan(null); }}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  {tr('إلغاء', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold"
                >
                  {editingLoan ? tr('حفظ تعديلات السلفة', 'Save loan changes') : tr('اعتماد وجدولة السلفة', 'Create loan schedule')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Penalty Modal */}
      {isPenaltyModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div data-no-translate className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">{editingPenalty ? tr('تعديل الجزاء / الخصم', 'Edit Penalty / Deduction') : tr('تسجيل جزاء إداري على موظف', 'Add Employee Penalty')}</h3>

            <form onSubmit={handleSavePenalty} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">{tr('الموظف *', 'Employee *')}</label>
                <SearchableEmployeeSelect
                  required
                  employees={companyEmployees}
                  value={penaltyForm.employeeId}
                  onChange={(employeeId) => setPenaltyForm({ ...penaltyForm, employeeId })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{tr('مبلغ الخصم (SR) *', 'Deduction amount (SR) *')}</label>
                  <input
                    type="number"
                    required
                    min="10"
                    step="0.01"
                    value={penaltyForm.amount}
                    onChange={(e) => setPenaltyForm({ ...penaltyForm, amount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-rose-700"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{tr('تاريخ المخالفة', 'Incident date')}</label>
                  <input
                    type="date"
                    value={penaltyForm.date}
                    onChange={(e) => setPenaltyForm({ ...penaltyForm, date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">{tr('فترة الراتب التي يطبق عليها الخصم *', 'Payroll period for this deduction *')}</label>
                <input
                  type="month"
                  required
                  value={penaltyForm.periodMonth}
                  onChange={(e) => setPenaltyForm({ ...penaltyForm, periodMonth: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  {tr('يمكن اختيار شهر سابق مثل 2026-07؛ سيُطبق الخصم على رصيد هذا الشهر عند إعادة الاحتساب طالما الموظف لم يتم تحويل راتبه.', 'You can select a prior month such as 2026-07; the deduction will affect that period on recalculation as long as the employee has not been transferred.')}
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">{tr('سبب الجزاء الإداري *', 'Penalty reason *')}</label>
                <input
                  type="text"
                  required
                  placeholder={tr('مخالفة لائحة الدوام / تلف ممتلكات...', 'Attendance violation / property damage...')}
                  value={penaltyForm.reason}
                  onChange={(e) => setPenaltyForm({ ...penaltyForm, reason: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setIsPenaltyModalOpen(false); setEditingPenalty(null); }}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  {tr('إلغاء', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold"
                >
                  {editingPenalty ? tr('حفظ تعديلات الخصم', 'Save deduction changes') : tr('تطبيق الجزاء في المسير', 'Apply penalty to payroll')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
