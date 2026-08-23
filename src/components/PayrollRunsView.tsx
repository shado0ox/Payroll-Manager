import React, { useState, useMemo } from 'react';
import { 
  Banknote, 
  Calendar, 
  Play, 
  CheckCircle2, 
  FileSpreadsheet, 
  Download, 
  AlertTriangle, 
  Search, 
  Filter, 
  Layers, 
  ShieldCheck, 
  Clock, 
  UserCheck, 
  DollarSign, 
  FileText, 
  ArrowRight,
  Send,
  Lock,
  Sparkles,
  Zap,
  WalletCards,
  X,
  CircleDollarSign,
  RotateCcw,
  PencilLine
} from 'lucide-react';
import { 
  Company, 
  Employee, 
  PayrollRun, 
  PayrollRunItem, 
  PayrollRunStatus, 
  AttendanceRecord, 
  LoanSchedule, 
  PenaltyRecord, 
  UserRole,
  PayrollPaymentBatch,
  PaymentMethod,
  PaymentBatchStatus,
} from '../types';
import { 
  calculateEmployeePayrollItem, 
  formatSAR, 
  formatNumber, 
  roundAmount 
} from '../utils/payrollEngine';
import { 
  exportPayrollSheetCsv, 
  exportQoyodJournalCsv, 
  exportWpsBankCsv, 
  exportGosiReportCsv 
} from '../utils/exportUtils';
import { generatePayrollJournalBatch, generatePaymentJournalBatch } from '../utils/accountingEngine';
import { exportBankPayrollXlsx } from '../utils/bankExcelExport';

interface PayrollRunsViewProps {
  company: Company;
  employees: Employee[];
  payrollRuns: PayrollRun[];
  attendance: AttendanceRecord[];
  loans: LoanSchedule[];
  penalties: PenaltyRecord[];
  activeRole: UserRole;
  onSavePayrollRun: (run: PayrollRun) => void;
  onViewEmployeeStatement: (emp: Employee) => void;
  onOpenQoyodModal: () => void;
}

const STATUS_CONFIG: Record<PayrollRunStatus, { label: string; bg: string; text: string; border: string }> = {
  DRAFT: { label: 'مسودة (Draft)', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  UNDER_REVIEW: { label: 'قيد المراجعة والتدقيق', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  APPROVED: { label: 'معتمد من الإدارة (Approved)', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  POSTED: { label: 'مرحل ومقفل محاسبياً (Posted)', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
};

const PAYMENT_STATUS_CONFIG: Record<PaymentBatchStatus, { label: string; classes: string }> = {
  SCHEDULED: { label: 'مجدولة للتحويل', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
  PAID: { label: 'تم التحويل', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  FAILED: { label: 'فشل التحويل', classes: 'bg-rose-50 text-rose-700 border-rose-200' },
  CANCELLED: { label: 'ملغاة', classes: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  WPS: 'حماية الأجور WPS',
  BANK_TRANSFER: 'تحويل بنكي',
  CASH: 'دفع نقدي',
};

export const PayrollRunsView: React.FC<PayrollRunsViewProps> = ({
  company,
  employees,
  payrollRuns,
  attendance,
  loans,
  penalties,
  activeRole,
  onSavePayrollRun,
  onViewEmployeeStatement,
  onOpenQoyodModal,
}) => {
  const companyRuns = useMemo(() => {
    return payrollRuns.filter(r => r.companyId === company.id);
  }, [payrollRuns, company.id]);

  const [selectedPeriod, setSelectedPeriod] = useState<string>(
    companyRuns[0]?.periodMonth || '2026-08'
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [filterWarningOnly, setFilterWarningOnly] = useState(false);
  const [filterDept, setFilterDept] = useState('ALL');
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcSpeedMs, setCalcSpeedMs] = useState<number | null>(null);
  const [selectedPaymentEmployeeIds, setSelectedPaymentEmployeeIds] = useState<string[]>([]);
  const [isPaymentBatchModalOpen, setIsPaymentBatchModalOpen] = useState(false);
  const [adjustmentItem, setAdjustmentItem] = useState<PayrollRunItem | null>(null);
  const [adjustmentForm, setAdjustmentForm] = useState({ addition: 0, deduction: 0, notes: '' });
  const [paymentBatchForm, setPaymentBatchForm] = useState({
    method: 'WPS' as PaymentMethod,
    scheduledDate: new Date().toISOString().slice(0, 10),
    reference: '',
    notes: '',
  });

  // Active selected run
  const currentRun = useMemo(() => {
    return companyRuns.find(r => r.periodMonth === selectedPeriod) || companyRuns[0];
  }, [companyRuns, selectedPeriod]);

  const companyEmployees = useMemo(() => {
    return employees.filter(e => e.companyId === company.id);
  }, [employees, company.id]);

  // Departments for filtering
  const departments = useMemo(() => {
    if (!currentRun) return [];
    return Array.from(new Set(currentRun.items.map(i => i.department)));
  }, [currentRun]);

  // Filtered items in active run
  const filteredItems = useMemo(() => {
    if (!currentRun) return [];
    return currentRun.items.filter(item => {
      const matchesSearch = 
        item.employeeNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.employeeName.includes(searchTerm) ||
        item.bankIban.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesWarning = filterWarningOnly ? item.warningFlags.length > 0 : true;
      const matchesDept = filterDept === 'ALL' || item.department === filterDept;

      return matchesSearch && matchesWarning && matchesDept;
    });
  }, [currentRun, searchTerm, filterWarningOnly, filterDept]);

  const paymentBatches = currentRun?.paymentBatches || [];
  const committedPaymentBatches = paymentBatches.filter(batch => ['SCHEDULED', 'PAID'].includes(batch.status));
  const committedEmployeeIds = useMemo(
    () => new Set(committedPaymentBatches.flatMap(batch => batch.employeeIds)),
    [currentRun?.paymentBatches]
  );
  const paidAmount = paymentBatches.filter(batch => batch.status === 'PAID').reduce((sum, batch) => sum + batch.totalAmount, 0);
  const scheduledAmount = paymentBatches.filter(batch => batch.status === 'SCHEDULED').reduce((sum, batch) => sum + batch.totalAmount, 0);
  const remainingToSchedule = Math.max(0, (currentRun?.totalNetSalaries || 0) - paidAmount - scheduledAmount);
  const unpaidAmount = Math.max(0, (currentRun?.totalNetSalaries || 0) - paidAmount);

  const getEmployeePaymentBatch = (employeeId: string) => {
    return [...paymentBatches].reverse().find(batch => batch.employeeIds.includes(employeeId) && batch.status !== 'CANCELLED');
  };

  const eligibleFilteredItems = filteredItems.filter(item =>
    !item.isSuspended && item.netSalary > 0 && !committedEmployeeIds.has(item.employeeId)
  );
  const selectedPaymentItems = currentRun?.items.filter(item => selectedPaymentEmployeeIds.includes(item.employeeId)) || [];
  const selectedPaymentTotal = selectedPaymentItems.reduce((sum, item) => sum + item.netSalary, 0);

  const togglePaymentEmployee = (employeeId: string) => {
    setSelectedPaymentEmployeeIds(current => current.includes(employeeId)
      ? current.filter(id => id !== employeeId)
      : [...current, employeeId]);
  };

  const toggleAllEligibleEmployees = () => {
    const eligibleIds = eligibleFilteredItems.map(item => item.employeeId);
    const allSelected = eligibleIds.length > 0 && eligibleIds.every(id => selectedPaymentEmployeeIds.includes(id));
    setSelectedPaymentEmployeeIds(current => allSelected
      ? current.filter(id => !eligibleIds.includes(id))
      : Array.from(new Set([...current, ...eligibleIds])));
  };

  const handleCreatePaymentBatch = () => {
    if (!currentRun || !selectedPaymentItems.length || currentRun.status !== 'APPROVED') return;
    const stillEligible = selectedPaymentItems.filter(item => !item.isSuspended && item.netSalary > 0 && !committedEmployeeIds.has(item.employeeId));
    if (!stillEligible.length) return;
    const sequence = (currentRun.paymentBatches?.length || 0) + 1;
    const batchNumber = `PAY-${currentRun.periodMonth.replace('-', '')}-${String(sequence).padStart(3, '0')}`;
    const batch: PayrollPaymentBatch = {
      id: `payment-${currentRun.id}-${Date.now()}`,
      batchNumber,
      payrollRunId: currentRun.id,
      companyId: company.id,
      periodMonth: currentRun.periodMonth,
      employeeIds: stillEligible.map(item => item.employeeId),
      employeesCount: stillEligible.length,
      totalAmount: roundAmount(stillEligible.reduce((sum, item) => sum + item.netSalary, 0)),
      method: paymentBatchForm.method,
      status: 'SCHEDULED',
      scheduledDate: paymentBatchForm.scheduledDate,
      reference: paymentBatchForm.reference.trim() || batchNumber,
      notes: paymentBatchForm.notes.trim(),
      createdAt: new Date().toISOString(),
    };
    const updatedRun = { ...currentRun, paymentBatches: [...(currentRun.paymentBatches || []), batch] };
    onSavePayrollRun(updatedRun);
    if (batch.method !== 'CASH') exportBankPayrollXlsx(updatedRun, company, batch, employees);
    setSelectedPaymentEmployeeIds([]);
    setIsPaymentBatchModalOpen(false);
    setPaymentBatchForm({ method: 'WPS', scheduledDate: new Date().toISOString().slice(0, 10), reference: '', notes: '' });
  };

  const handlePaymentBatchStatus = (batchId: string, status: PaymentBatchStatus) => {
    if (!currentRun) return;
    const paymentBatches = (currentRun.paymentBatches || []).map(batch => batch.id === batchId ? {
      ...batch,
      status,
      paymentDate: status === 'PAID' ? new Date().toISOString().slice(0, 10) : batch.paymentDate,
    } : batch);
    onSavePayrollRun({ ...currentRun, paymentBatches });
  };

  const openAdjustmentModal = (item: PayrollRunItem) => {
    setAdjustmentItem(item);
    setAdjustmentForm({
      addition: item.manualAddition || 0,
      deduction: item.manualDeduction || 0,
      notes: item.adjustmentNotes || '',
    });
  };

  const savePayrollAdjustment = () => {
    if (!currentRun || !adjustmentItem || !['UNDER_REVIEW', 'APPROVED'].includes(currentRun.status)) return;
    if (currentRun.paymentBatches?.some(batch => ['SCHEDULED', 'PAID'].includes(batch.status))) {
      alert('لا يمكن تعديل مبالغ المسير بعد إنشاء دفعة تحويل نشطة. ألغِ الدفعة أولًا.');
      return;
    }
    const previousAddition = adjustmentItem.manualAddition || 0;
    const previousDeduction = adjustmentItem.manualDeduction || 0;
    const bonuses = roundAmount(adjustmentItem.bonuses - previousAddition + adjustmentForm.addition);
    const otherDeductions = roundAmount(adjustmentItem.otherDeductions - previousDeduction + adjustmentForm.deduction);
    const totalGrossSalary = roundAmount(
      adjustmentItem.baseSalary + adjustmentItem.housingAllowance + adjustmentItem.transportAllowance +
      adjustmentItem.otherAllowances + adjustmentItem.overtimeAmount + bonuses
    );
    const totalDeductions = roundAmount(
      adjustmentItem.delayDeduction + adjustmentItem.absenceDeduction + adjustmentItem.unpaidLeaveDeduction +
      adjustmentItem.gosiEmployeeShare + adjustmentItem.loanDeduction + adjustmentItem.penaltiesDeduction + otherDeductions
    );
    const updatedItem: PayrollRunItem = {
      ...adjustmentItem,
      bonuses,
      otherDeductions,
      manualAddition: roundAmount(adjustmentForm.addition),
      manualDeduction: roundAmount(adjustmentForm.deduction),
      adjustmentNotes: adjustmentForm.notes.trim(),
      totalGrossSalary,
      totalDeductions,
      netSalary: roundAmount(Math.max(0, totalGrossSalary - totalDeductions)),
      totalCompanyBurden: roundAmount(totalGrossSalary + adjustmentItem.gosiEmployerShare),
    };
    const items = currentRun.items.map(item => item.id === updatedItem.id ? updatedItem : item);
    const sum = (selector: (item: PayrollRunItem) => number) => roundAmount(items.reduce((total, item) => total + selector(item), 0));
    onSavePayrollRun({
      ...currentRun,
      items,
      totalBaseSalaries: sum(item => item.baseSalary),
      totalAllowances: sum(item => item.housingAllowance + item.transportAllowance + item.otherAllowances),
      totalOvertime: sum(item => item.overtimeAmount),
      totalGrossSalaries: sum(item => item.totalGrossSalary),
      totalAbsenceDeductions: sum(item => item.absenceDeduction),
      totalDelayDeductions: sum(item => item.delayDeduction),
      totalGosiEmployee: sum(item => item.gosiEmployeeShare),
      totalGosiEmployer: sum(item => item.gosiEmployerShare),
      totalLoanDeductions: sum(item => item.loanDeduction),
      totalPenalties: sum(item => item.penaltiesDeduction),
      totalDeductions: sum(item => item.totalDeductions),
      totalNetSalaries: sum(item => item.netSalary),
      totalCompanyCost: sum(item => item.totalCompanyBurden),
    });
    setAdjustmentItem(null);
  };

  // Execute full payroll calculation engine
  const handleRecalculate = () => {
    if (currentRun?.paymentBatches?.some(batch => batch.status === 'PAID')) {
      alert('لا يمكن إعادة احتساب المسير بعد تسجيل دفعة محولة. ألغِ حالة التحويل أو أنشئ تسوية مستقلة.');
      return;
    }
    setIsCalculating(true);
    const startTime = performance.now();

    setTimeout(() => {
      const runItems: PayrollRunItem[] = companyEmployees.map(emp => {
        const empAtt = attendance.filter(a => a.employeeId === emp.id && a.periodMonth === selectedPeriod);
        const empLoans = loans.filter(l => l.employeeId === emp.id);
        const empPens = penalties.filter(p => p.employeeId === emp.id && p.periodMonth === selectedPeriod && p.appliedInPayroll !== false);

        return calculateEmployeePayrollItem({
          employee: emp,
          company,
          periodMonth: selectedPeriod,
          attendanceRecords: empAtt,
          activeLoans: empLoans,
          penalties: empPens,
        });
      });

      const decimals = company.calculationRules?.roundingDecimals ?? 2;
      const totalBaseSalaries = roundAmount(runItems.reduce((s, i) => s + i.baseSalary, 0), decimals);
      const totalAllowances = roundAmount(runItems.reduce((s, i) => s + i.housingAllowance + i.transportAllowance + i.otherAllowances, 0), decimals);
      const totalOvertime = roundAmount(runItems.reduce((s, i) => s + i.overtimeAmount, 0), decimals);
      const totalGrossSalaries = roundAmount(runItems.reduce((s, i) => s + i.totalGrossSalary, 0), decimals);
      const totalAbsenceDeductions = roundAmount(runItems.reduce((s, i) => s + i.absenceDeduction + i.unpaidLeaveDeduction, 0), decimals);
      const totalDelayDeductions = roundAmount(runItems.reduce((s, i) => s + i.delayDeduction, 0), decimals);
      const totalGosiEmployee = roundAmount(runItems.reduce((s, i) => s + i.gosiEmployeeShare, 0), decimals);
      const totalGosiEmployer = roundAmount(runItems.reduce((s, i) => s + i.gosiEmployerShare, 0), decimals);
      const totalLoanDeductions = roundAmount(runItems.reduce((s, i) => s + i.loanDeduction, 0), decimals);
      const totalPenalties = roundAmount(runItems.reduce((s, i) => s + i.penaltiesDeduction + i.otherDeductions, 0), decimals);
      const totalDeductions = roundAmount(runItems.reduce((s, i) => s + i.totalDeductions, 0), decimals);
      const totalNetSalaries = roundAmount(runItems.reduce((s, i) => s + i.netSalary, 0), decimals);
      const totalCompanyCost = roundAmount(runItems.reduce((s, i) => s + i.totalCompanyBurden, 0), decimals);

      const runId = currentRun?.id || `run-${company.id}-${selectedPeriod}`;
      const updatedRun: PayrollRun = {
        id: runId,
        companyId: company.id,
        periodMonth: selectedPeriod,
        startDate: `${selectedPeriod}-01`,
        endDate: `${selectedPeriod}-30`,
        status: currentRun?.status || 'DRAFT',
        createdAt: currentRun?.createdAt || new Date().toISOString(),
        calculatedAt: new Date().toISOString(),
        employeesCount: runItems.length,
        totalBaseSalaries,
        totalAllowances,
        totalOvertime,
        totalGrossSalaries,
        totalAbsenceDeductions,
        totalDelayDeductions,
        totalGosiEmployee,
        totalGosiEmployer,
        totalLoanDeductions,
        totalPenalties,
        totalDeductions,
        totalNetSalaries,
        totalCompanyCost,
        items: runItems,
        journalBatchId: `batch-${runId}`,
        paymentBatches: currentRun?.paymentBatches || [],
      };

      runItems.forEach(i => i.payrollRunId = runId);

      const endTime = performance.now();
      setCalcSpeedMs(Math.round(endTime - startTime));
      setIsCalculating(false);
      onSavePayrollRun(updatedRun);
    }, 120);
  };

  // Workflow status transitions
  const handleStatusChange = (newStatus: PayrollRunStatus) => {
    if (!currentRun) return;
    const canApprove = activeRole === 'ADMIN' || activeRole === 'COMPANY_MANAGER';
    if (['APPROVED', 'POSTED'].includes(newStatus) && !canApprove) {
      alert('اعتماد الرواتب وترحيلها متاح للمدير العام أو مدير النظام فقط.');
      return;
    }
    const updated: PayrollRun = {
      ...currentRun,
      status: newStatus,
      approvedAt: newStatus === 'APPROVED' ? new Date().toISOString() : currentRun.approvedAt,
      approvedBy: newStatus === 'APPROVED' ? 'المدير العام' : currentRun.approvedBy,
      postedAt: newStatus === 'POSTED' ? new Date().toISOString() : currentRun.postedAt,
      postedBy: newStatus === 'POSTED' ? 'عبدالله الغامدي (المدير المالي)' : currentRun.postedBy,
    };
    onSavePayrollRun(updated);
  };

  const canReversePosting = activeRole === 'ADMIN' || activeRole === 'COMPANY_MANAGER';
  const handleReverseApproval = () => {
    if (!currentRun || currentRun.status !== 'APPROVED' || !canReversePosting) return;
    if (currentRun.paymentBatches?.some(batch => batch.status === 'PAID')) {
      alert('لا يمكن فتح المسير بعد تسجيل دفعة مدفوعة. ألغِ إثبات السداد أولًا.');
      return;
    }
    if (!window.confirm('هل تريد التراجع عن اعتماد المسير وفتحه للتعديل؟')) return;
    onSavePayrollRun({ ...currentRun, status: 'UNDER_REVIEW', approvedAt: undefined, approvedBy: undefined });
  };
  const handleReversePosting = () => {
    if (!currentRun || currentRun.status !== 'POSTED' || !canReversePosting) return;
    if (currentRun.paymentBatches?.some(batch => batch.status === 'PAID')) {
      alert('لا يمكن التراجع عن الترحيل بعد تسجيل دفعة محولة. يجب عمل تسوية أو إلغاء إثبات السداد أولًا.');
      return;
    }
    if (!window.confirm('هل تريد التراجع عن ترحيل المسير وفتحه للتعديل؟')) return;
    onSavePayrollRun({ ...currentRun, status: 'UNDER_REVIEW', approvedAt: undefined, approvedBy: undefined, postedAt: undefined, postedBy: undefined });
  };

  // Warning metrics
  const totalWarnings = currentRun?.items.reduce((s, i) => s + i.warningFlags.length, 0) || 0;

  return (
    <div className="space-y-6">
      
      {/* Top Header & Period Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Banknote className="w-6 h-6 text-emerald-600" />
              <span>دورة الرواتب الشهرية والمسيرات</span>
            </h1>
            {currentRun && (
              <span className={`text-xs px-3 py-1 rounded-full font-bold border ${STATUS_CONFIG[currentRun.status].bg} ${STATUS_CONFIG[currentRun.status].text} ${STATUS_CONFIG[currentRun.status].border}`}>
                {STATUS_CONFIG[currentRun.status].label}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            احتساب الاستحقاقات، التأمينات (GOSI)، خصومات الحضور، الأقساط، والاعتماد الإداري والمحاسبي
          </p>
        </div>

        {/* Right Toolbar: Period Switcher & Calculate Button */}
        <div className="flex flex-wrap items-center gap-2.5">
          
          {/* Period Selector */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
            <Calendar className="w-4 h-4 text-slate-500" />
            <select
              value={selectedPeriod}
              onChange={(e) => { setSelectedPeriod(e.target.value); setSelectedPaymentEmployeeIds([]); }}
              className="bg-transparent text-xs font-bold text-slate-800 border-none focus:ring-0 cursor-pointer"
            >
              <option value="2026-08">أغسطس 2026 (الشهر الحالي)</option>
              <option value="2026-07">يوليو 2026 (الشهر السابق)</option>
              <option value="2026-06">يونيو 2026</option>
              <option value="2026-09">سبتمبر 2026 (فترة جديدة)</option>
            </select>
          </div>

          {/* Recalculate Button */}
          <button
            onClick={handleRecalculate}
            disabled={isCalculating}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <Play className={`w-3.5 h-3.5 ${isCalculating ? 'animate-spin' : ''}`} />
            <span>{isCalculating ? 'جاري الحساب...' : 'إعادة احتساب المسير آلياً'}</span>
          </button>

          {/* Performance Benchmark Tag */}
          {calcSpeedMs !== null && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              <Zap className="w-3 h-3 text-emerald-600" />
              <span>تم في {calcSpeedMs} مللي ثانية ({companyEmployees.length} موظف)</span>
            </span>
          )}
        </div>
      </div>

      {/* Summary Totals Cards Bar */}
      {currentRun && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500">إجمالي الرواتب الأساسية</div>
            <div className="text-sm sm:text-base font-extrabold text-slate-900 mt-0.5">
              {formatSAR(currentRun.totalBaseSalaries)}
            </div>
            <div className="text-[10px] text-slate-400">لـ {currentRun.employeesCount} موظف</div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500">إجمالي البدلات والإضافي</div>
            <div className="text-sm sm:text-base font-extrabold text-slate-900 mt-0.5">
              {formatSAR(currentRun.totalAllowances + currentRun.totalOvertime)}
            </div>
            <div className="text-[10px] text-slate-400">سكن، نقل، عمل إضافي</div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500">إجمالي المستحق (Gross)</div>
            <div className="text-sm sm:text-base font-extrabold text-slate-900 mt-0.5">
              {formatSAR(currentRun.totalGrossSalaries)}
            </div>
            <div className="text-[10px] text-slate-400">قبل الاستقطاعات</div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500">إجمالي الاستقطاعات</div>
            <div className="text-sm sm:text-base font-extrabold text-rose-700 mt-0.5">
              {formatSAR(currentRun.totalDeductions)}
            </div>
            <div className="text-[10px] text-slate-400">تأمينات، سلف، غياب، تأخير</div>
          </div>

          <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200 shadow-xs">
            <div className="text-[11px] font-bold text-emerald-900">صافي المستحق (Net)</div>
            <div className="text-sm sm:text-base font-black text-emerald-800 mt-0.5 font-mono">
              {formatSAR(currentRun.totalNetSalaries)}
            </div>
            <div className="text-[10px] text-emerald-700">لتحويل البنك (WPS)</div>
          </div>

          <div className="bg-purple-50/70 p-3.5 rounded-2xl border border-purple-200 shadow-xs">
            <div className="text-[11px] font-bold text-purple-900">إجمالي تكلفة المنشأة</div>
            <div className="text-sm sm:text-base font-black text-purple-800 mt-0.5 font-mono">
              {formatSAR(currentRun.totalCompanyCost)}
            </div>
            <div className="text-[10px] text-purple-700">تتضمن حصة التأمينات</div>
          </div>

        </div>
      )}

      {currentRun && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div><h3 className="text-sm font-black text-slate-900">ملخص الإضافات والخصومات قبل الاعتماد</h3><p className="text-[11px] text-slate-500">يتحدث تلقائيًا بعد إعادة احتساب المسير أو تعديل موظف.</p></div>
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${currentRun.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{currentRun.status === 'APPROVED' ? 'معتمد — جاهز للدفع' : 'غير معتمد'}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-center">
            {[
              ['إجمالي الإضافات', currentRun.totalGrossSalaries - currentRun.totalBaseSalaries, 'text-emerald-700'],
              ['غياب/إجازة', currentRun.totalAbsenceDeductions, 'text-rose-700'],
              ['تأخير', currentRun.totalDelayDeductions, 'text-rose-700'],
              ['تأمينات الموظف', currentRun.totalGosiEmployee, 'text-rose-700'],
              ['أقساط السلف', currentRun.totalLoanDeductions, 'text-rose-700'],
              ['جزاءات وخصومات', currentRun.totalPenalties, 'text-rose-700'],
              ['خصومات أخرى', Math.max(0, currentRun.totalDeductions - currentRun.totalAbsenceDeductions - currentRun.totalDelayDeductions - currentRun.totalGosiEmployee - currentRun.totalLoanDeductions - currentRun.totalPenalties), 'text-rose-700'],
              ['صافي الرواتب', currentRun.totalNetSalaries, 'text-emerald-800'],
            ].map(([label, amount, color]) => <div key={String(label)} className="rounded-xl bg-slate-50 border border-slate-100 p-2"><div className="text-[10px] text-slate-500">{label}</div><div className={`text-xs font-black mt-1 ${color}`}>{formatSAR(Number(amount))}</div></div>)}
          </div>
        </div>
      )}

      {/* Workflow & Export Action Ribbon */}
      {currentRun && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          
          {/* Approval Workflow Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-700 ml-2">مراحل الاعتماد:</span>

            {currentRun.status === 'DRAFT' && (
              <button
                onClick={() => handleStatusChange('UNDER_REVIEW')}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>إرسال للمراجعة والتدقيق</span>
              </button>
            )}

            {currentRun.status === 'UNDER_REVIEW' && (
              <button
                onClick={() => handleStatusChange('APPROVED')}
                disabled={!['ADMIN', 'COMPANY_MANAGER'].includes(activeRole)}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>اعتماد المدير العام</span>
              </button>
            )}

            {currentRun.status === 'APPROVED' && (
              <><button
                onClick={() => handleStatusChange('POSTED')}
                disabled={!['ADMIN', 'COMPANY_MANAGER'].includes(activeRole) || paidAmount < currentRun.totalNetSalaries}
                className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{paidAmount < currentRun.totalNetSalaries ? 'الاعتماد تم — أكمل دفع الرواتب أولًا' : 'إقفال وترحيل المسير بعد الدفع'}</span>
              </button>
              {canReversePosting && <button type="button" onClick={handleReverseApproval} className="px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold flex items-center gap-1.5"><RotateCcw className="w-3.5 h-3.5" /> التراجع عن الاعتماد والتعديل</button>}
              </>
            )}

            {currentRun.status === 'POSTED' && (
              <>
                <div className="flex items-center gap-2 text-xs font-bold text-purple-800 bg-purple-50 px-3 py-1.5 rounded-xl border border-purple-200">
                  <CheckCircle2 className="w-4 h-4 text-purple-600" />
                  <span>تم إقفال وترحيل مسير هذا الشهر بنجاح</span>
                </div>
                {canReversePosting && (
                  <button type="button" onClick={handleReversePosting} className="px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" /> التراجع عن الترحيل
                  </button>
                )}
              </>
            )}
          </div>

          {/* Export Hub Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => exportPayrollSheetCsv(currentRun, company)}
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
              title="تصدير مسير الرواتب المفصل بصيغة Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>مسير الرواتب Excel</span>
            </button>

            <button
              onClick={() => {
                const batch = generatePayrollJournalBatch(company, currentRun);
                exportQoyodJournalCsv(batch, company);
              }}
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
              title="تصدير ملف قيد اليومية المتوافق مع نموذج استيراد قيود"
            >
              <Layers className="w-3.5 h-3.5 text-sky-600" />
              <span>قيد قيود CSV</span>
            </button>

            <button
              onClick={() => exportWpsBankCsv(currentRun, company)}
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
              title="تصدير ملف حماية الأجور المعتمد للبنوك ومنصة مُدد"
            >
              <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
              <span>ملف حماية الأجور (WPS)</span>
            </button>

            <button
              onClick={() => exportGosiReportCsv(currentRun, company)}
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
              title="تصدير جدول اشتراكات التأمينات الاجتماعية GOSI"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>تقرير التأمينات (GOSI)</span>
            </button>
          </div>

        </div>
      )}

      {/* Partial salary payment batches */}
      {currentRun && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <WalletCards className="w-5 h-5 text-emerald-600" /> دفعات تحويل الرواتب
              </h3>
              <p className="text-xs text-slate-500 mt-1">حوّل لمجموعة أو لموظف واحد مع إبقاء مسير الشهر موحدًا.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleAllEligibleEmployees}
                disabled={!eligibleFilteredItems.length}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer disabled:opacity-40"
              >
                تحديد المتاح ({eligibleFilteredItems.length})
              </button>
              <button
                type="button"
                onClick={() => setIsPaymentBatchModalOpen(true)}
                disabled={!selectedPaymentEmployeeIds.length || currentRun.status !== 'APPROVED'}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" /> إنشاء دفعة للمحددين ({selectedPaymentEmployeeIds.length})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-4 bg-slate-50/70">
            <div className="p-3 rounded-xl bg-white border border-slate-200"><div className="text-[10px] text-slate-500">إجمالي المسير</div><div className="font-black text-slate-900">{formatSAR(currentRun.totalNetSalaries)}</div></div>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200"><div className="text-[10px] text-emerald-700">تم تحويله</div><div className="font-black text-emerald-800">{formatSAR(paidAmount)}</div></div>
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200"><div className="text-[10px] text-blue-700">مجدول للتحويل</div><div className="font-black text-blue-800">{formatSAR(scheduledAmount)}</div></div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200"><div className="text-[10px] text-amber-700">غير محوّل</div><div className="font-black text-amber-800">{formatSAR(unpaidAmount)}</div></div>
            <div className="p-3 rounded-xl bg-white border border-slate-200"><div className="text-[10px] text-slate-500">متاح لدفعة جديدة</div><div className="font-black text-slate-900">{formatSAR(remainingToSchedule)}</div></div>
          </div>

          {paymentBatches.length > 0 && (
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-50 text-slate-600"><tr>
                  <th className="p-3">رقم الدفعة</th><th className="p-3">الموظفون</th><th className="p-3">المبلغ</th><th className="p-3">الطريقة والتاريخ</th><th className="p-3">الحالة</th><th className="p-3 text-center">الإجراءات</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {[...paymentBatches].reverse().map(batch => (
                    <tr key={batch.id} className="hover:bg-slate-50/70">
                      <td className="p-3"><div className="font-black font-mono text-slate-900">{batch.batchNumber}</div><div className="text-[10px] text-slate-400">{batch.reference}</div></td>
                      <td className="p-3 font-bold">{batch.employeesCount} موظف</td>
                      <td className="p-3 font-black text-emerald-800">{formatSAR(batch.totalAmount)}</td>
                      <td className="p-3"><div className="font-semibold">{PAYMENT_METHOD_LABELS[batch.method]}</div><div className="text-[10px] text-slate-400">{batch.paymentDate || batch.scheduledDate}</div></td>
                      <td className="p-3"><span className={`px-2 py-1 rounded-lg border text-[10px] font-bold ${PAYMENT_STATUS_CONFIG[batch.status].classes}`}>{PAYMENT_STATUS_CONFIG[batch.status].label}</span></td>
                      <td className="p-3"><div className="flex flex-wrap justify-center gap-1.5">
                        <button type="button" onClick={() => exportWpsBankCsv(currentRun, company, batch.employeeIds, batch.reference || batch.batchNumber)} className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold">WPS</button>
                        {['SCHEDULED', 'PAID'].includes(batch.status) && (
                          <button type="button" onClick={() => exportBankPayrollXlsx(currentRun, company, batch, employees)} className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">ملف البنك Excel</button>
                        )}
                        {batch.status === 'SCHEDULED' && <>
                          <button type="button" onClick={() => handlePaymentBatchStatus(batch.id, 'PAID')} className="px-2 py-1 rounded-lg bg-emerald-600 text-white font-bold">تم التحويل</button>
                          <button type="button" onClick={() => handlePaymentBatchStatus(batch.id, 'FAILED')} className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold">فشل</button>
                          <button type="button" onClick={() => handlePaymentBatchStatus(batch.id, 'CANCELLED')} className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 font-bold">إلغاء</button>
                        </>}
                        {batch.status === 'PAID' && (
                          <button type="button" onClick={() => exportQoyodJournalCsv(generatePaymentJournalBatch(company, currentRun, batch), company)} className="px-2 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 font-bold">قيد السداد</button>
                        )}
                        {['FAILED', 'CANCELLED'].includes(batch.status) && <span className="text-[10px] text-slate-400 self-center">الموظفون متاحون لدفعة جديدة</span>}
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!['APPROVED', 'POSTED'].includes(currentRun.status) && (
            <div className="px-4 py-3 border-t border-amber-200 bg-amber-50 text-xs text-amber-800 font-semibold">يجب اعتماد المسير أولًا قبل إنشاء دفعات التحويل.</div>
          )}
        </div>
      )}

      {/* Filter and Search Bar for Table */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[240px] max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              placeholder="بحث بالاسم، الرقم الوظيفي، الآيبان..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pr-9 pl-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Dept Filter */}
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl"
          >
            <option value="ALL">جميع الأقسام</option>
            {departments.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {/* Warning Toggle */}
          <button
            onClick={() => setFilterWarningOnly(!filterWarningOnly)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
              filterWarningOnly 
                ? 'bg-amber-100 border-amber-300 text-amber-900' 
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>عرض التنبيهات فقط ({totalWarnings})</span>
          </button>
        </div>
      </div>

      {/* Itemized Payroll Run Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden w-full">
        <table className="w-full text-right text-xs table-fixed divide-y divide-slate-100">
          <thead>
            <tr className="bg-slate-800 text-white font-bold border-b border-slate-700 text-[11px]">
              <th className="py-2.5 px-2 w-[15%] text-right font-bold">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={eligibleFilteredItems.length > 0 && eligibleFilteredItems.every(item => selectedPaymentEmployeeIds.includes(item.employeeId))} onChange={toggleAllEligibleEmployees} className="accent-emerald-500" />
                  <span>الموظف والرقم</span>
                </div>
              </th>
              <th className="py-2.5 px-1.5 w-[8%] text-right font-bold">القسم</th>
              <th className="py-2.5 px-1.5 w-[7%] text-right font-bold">الأساسي</th>
              <th className="py-2.5 px-1.5 w-[8%] text-right font-bold">البدلات</th>
              <th className="py-2.5 px-1.5 w-[6%] text-right font-bold">الإضافي</th>
              <th className="py-2.5 px-1.5 w-[9%] text-right font-bold">المستحق (Gross)</th>
              <th className="py-2.5 px-1.5 w-[7%] text-right font-bold text-rose-300">الغياب/التأخير</th>
              <th className="py-2.5 px-1.5 w-[7%] text-right font-bold text-rose-300">تأمينات</th>
              <th className="py-2.5 px-1.5 w-[6%] text-right font-bold text-rose-300">السلف</th>
              <th className="py-2.5 px-1.5 w-[8%] text-right font-bold text-rose-300">الخصم</th>
              <th className="py-2.5 px-1.5 w-[10%] text-right font-bold text-emerald-300">صافي الراتب</th>
              <th className="py-2.5 px-1.5 w-[6%] text-right font-bold text-purple-300">المنشأة</th>
              <th className="py-2.5 px-1 w-[3%] text-center font-bold">قسيمة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {!currentRun || filteredItems.length === 0 ? (
              <tr>
                <td colSpan={13} className="py-12 text-center text-slate-400">
                  لا توجد بنود رواتب مطابقة للبحث أو الفترة
                </td>
              </tr>
            ) : (
              filteredItems.map((item, idx) => {
                const emp = employees.find(e => e.id === item.employeeId);
                const hasWarning = item.warningFlags.length > 0;
                const paymentBatch = getEmployeePaymentBatch(item.employeeId);
                const canSelectForPayment = !item.isSuspended && item.netSalary > 0 && !committedEmployeeIds.has(item.employeeId);

                return (
                  <tr 
                    key={`${item.id || 'item'}-${idx}`} 
                    className={`hover:bg-slate-50 transition-colors text-[11px] ${
                      item.isSuspended ? 'bg-amber-50/40' : (hasWarning ? 'bg-amber-50/20' : '')
                    }`}
                  >
                    {/* Name & Flags */}
                    <td className="py-2.5 px-2 truncate">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          disabled={!canSelectForPayment}
                          checked={selectedPaymentEmployeeIds.includes(item.employeeId)}
                          onChange={() => togglePaymentEmployee(item.employeeId)}
                          className="mt-0.5 accent-emerald-600 disabled:opacity-30"
                          title={canSelectForPayment ? 'تحديد لدفعة تحويل' : 'الموظف مرتبط بدفعة أو غير قابل للتحويل'}
                        />
                        <div className="min-w-0 grow">
                          <div className="font-bold text-slate-900 flex items-center gap-1 truncate">
                            <span className="truncate">{item.employeeName}</span>
                            {item.nationality === 'SAUDI' && (
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.gosiEnabled === false ? 'bg-slate-300' : 'bg-emerald-500'}`} title={item.gosiEnabled === false ? 'سعودي غير خاضع للتأمينات' : `GOSI موظف ${((item.gosiEmployeeRate || 0) * 100).toFixed(2)}% / شركة ${((item.gosiEmployerRate || 0) * 100).toFixed(2)}%`} />
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">{item.employeeNo}</div>
                          {paymentBatch ? (
                            <div className={`inline-flex mt-0.5 px-1.5 py-0.5 rounded border text-[9px] font-bold ${PAYMENT_STATUS_CONFIG[paymentBatch.status].classes}`} title={paymentBatch.batchNumber}>
                              {PAYMENT_STATUS_CONFIG[paymentBatch.status].label} • {paymentBatch.batchNumber}
                            </div>
                          ) : <div className="text-[9px] text-amber-600 font-semibold mt-0.5">بانتظار إدراجه في دفعة</div>}
                          {['UNDER_REVIEW', 'APPROVED'].includes(currentRun.status) && (
                            <button type="button" onClick={() => openAdjustmentModal(item)} className="mt-1 text-[9px] font-bold text-blue-700 hover:text-blue-900 inline-flex items-center gap-1">
                              <PencilLine className="w-3 h-3" /> تعديل إضافة أو خصم
                            </button>
                          )}
                        </div>
                      </div>
                      {hasWarning && (
                        <div className="text-[9px] text-amber-700 font-semibold truncate mt-0.5" title={item.warningFlags.join(' • ')}>
                          ⚠️ {item.warningFlags[0]}
                        </div>
                      )}
                    </td>

                    {/* Department */}
                    <td className="py-2.5 px-1.5 text-slate-600 truncate font-medium">
                      {item.department}
                    </td>

                    {/* Base Salary */}
                    <td className="py-2.5 px-1.5 font-semibold text-slate-800 whitespace-nowrap">
                      {formatSAR(item.baseSalary)}
                    </td>

                    {/* Housing & Transport */}
                    <td className="py-2.5 px-1.5 text-slate-600 whitespace-nowrap">
                      {formatSAR(item.housingAllowance + item.transportAllowance + item.otherAllowances)}
                    </td>

                    {/* Overtime */}
                    <td className="py-2.5 px-1.5 whitespace-nowrap">
                      {item.overtimeAmount > 0 ? (
                        <div>
                          <span className="font-bold text-emerald-700">{formatSAR(item.overtimeAmount)}</span>
                          <div className="text-[9px] text-slate-400">({item.overtimeHours}س)</div>
                        </div>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>

                    {/* Gross */}
                    <td className="py-2.5 px-1.5 font-bold text-slate-900 whitespace-nowrap">
                      {formatSAR(item.totalGrossSalary)}
                    </td>

                    {/* Absence & Delay */}
                    <td className="py-2.5 px-1.5 text-rose-600 whitespace-nowrap">
                      {(item.delayDeduction + item.absenceDeduction + item.unpaidLeaveDeduction) > 0 ? (
                        formatSAR(item.delayDeduction + item.absenceDeduction + item.unpaidLeaveDeduction)
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>

                    {/* GOSI Employee */}
                    <td className="py-2.5 px-1.5 text-slate-700 font-medium whitespace-nowrap">
                      {item.gosiEmployeeShare > 0 ? (
                        formatSAR(item.gosiEmployeeShare)
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>

                    {/* Loan Deduction */}
                    <td className="py-2.5 px-1.5 text-slate-700 whitespace-nowrap">
                      {item.loanDeduction > 0 ? (
                        formatSAR(item.loanDeduction)
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>

                    {/* Total Deductions */}
                    <td className="py-2.5 px-1.5 font-bold text-rose-700 whitespace-nowrap">
                      {formatSAR(item.totalDeductions)}
                    </td>

                    {/* Net Salary */}
                    <td className="py-2.5 px-1.5 font-extrabold text-emerald-800 font-mono bg-emerald-50/40 whitespace-nowrap">
                      {formatSAR(item.netSalary)}
                    </td>

                    {/* GOSI Employer Share */}
                    <td className="py-2.5 px-1.5 text-purple-700 font-medium whitespace-nowrap">
                      {formatSAR(item.gosiEmployerShare)}
                    </td>

                    {/* Payslip Modal Trigger */}
                    <td className="py-2.5 px-1 text-center">
                      <button
                        onClick={() => {
                          if (emp) onViewEmployeeStatement(emp);
                        }}
                        title="عرض وطباعة قسيمة الراتب"
                        className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                    </td>

                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {isPaymentBatchModalOpen && currentRun && (
        <div className="fixed inset-0 z-[100] bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3"><CircleDollarSign className="w-6 h-6 text-emerald-400" /><div><h3 className="font-black">إنشاء دفعة تحويل رواتب</h3><p className="text-xs text-slate-400">{selectedPaymentItems.length} موظف • {formatSAR(selectedPaymentTotal)}</p></div></div>
              <button type="button" onClick={() => setIsPaymentBatchModalOpen(false)} className="p-1.5 hover:bg-white/10 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">طريقة التحويل *</label>
                <select value={paymentBatchForm.method} onChange={event => setPaymentBatchForm({ ...paymentBatchForm, method: event.target.value as PaymentMethod })} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold">
                  <option value="WPS">حماية الأجور WPS</option><option value="BANK_TRANSFER">تحويل بنكي</option><option value="CASH">دفع نقدي</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block font-bold text-slate-700 mb-1">تاريخ التحويل المجدول *</label><input type="date" required value={paymentBatchForm.scheduledDate} onChange={event => setPaymentBatchForm({ ...paymentBatchForm, scheduledDate: event.target.value })} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl" /></div>
                <div><label className="block font-bold text-slate-700 mb-1">مرجع التحويل</label><input value={paymentBatchForm.reference} onChange={event => setPaymentBatchForm({ ...paymentBatchForm, reference: event.target.value })} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl" placeholder="رقم ملف البنك أو الحوالة" /></div>
              </div>
              <div><label className="block font-bold text-slate-700 mb-1">ملاحظات</label><textarea rows={2} value={paymentBatchForm.notes} onChange={event => setPaymentBatchForm({ ...paymentBatchForm, notes: event.target.value })} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl resize-none" placeholder="مثال: الدفعة الأولى من رواتب الشهر" /></div>
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-center justify-between"><span className="font-bold text-emerald-900">إجمالي الدفعة</span><span className="font-black text-emerald-800 text-base">{formatSAR(selectedPaymentTotal)}</span></div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button type="button" onClick={() => setIsPaymentBatchModalOpen(false)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold">إلغاء</button>
              <button type="button" onClick={handleCreatePaymentBatch} disabled={!paymentBatchForm.scheduledDate || !selectedPaymentItems.length} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black disabled:opacity-40">إنشاء وجدولة الدفعة</button>
            </div>
          </div>
        </div>
      )}

      {adjustmentItem && currentRun && (
        <div className="fixed inset-0 z-[110] bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div><h3 className="font-black">تعديل إضافات وخصومات المسير</h3><p className="text-xs text-slate-400 mt-1">{adjustmentItem.employeeName} • {adjustmentItem.employeeNo}</p></div>
              <button type="button" onClick={() => setAdjustmentItem(null)} className="p-1.5 hover:bg-white/10 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block font-bold text-emerald-800 mb-1">إضافة على الراتب</label><input type="number" min="0" step="0.01" value={adjustmentForm.addition} onChange={event => setAdjustmentForm({ ...adjustmentForm, addition: Math.max(0, Number(event.target.value) || 0) })} className="w-full px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl font-mono" /></div>
                <div><label className="block font-bold text-rose-800 mb-1">خصم إضافي</label><input type="number" min="0" step="0.01" value={adjustmentForm.deduction} onChange={event => setAdjustmentForm({ ...adjustmentForm, deduction: Math.max(0, Number(event.target.value) || 0) })} className="w-full px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-xl font-mono" /></div>
              </div>
              <div><label className="block font-bold text-slate-700 mb-1">سبب التعديل / المرجع</label><textarea rows={3} value={adjustmentForm.notes} onChange={event => setAdjustmentForm({ ...adjustmentForm, notes: event.target.value })} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl resize-none" placeholder="مثال: مكافأة أداء أو خصم عهدة بموافقة الإدارة" /></div>
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-blue-900">سيُعاد احتساب إجمالي المستحق والخصومات والصافي وإجماليات المسير تلقائيًا.</div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2"><button type="button" onClick={() => setAdjustmentItem(null)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold">إلغاء</button><button type="button" onClick={savePayrollAdjustment} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black">حفظ وإعادة الاحتساب</button></div>
          </div>
        </div>
      )}

    </div>
  );
};
