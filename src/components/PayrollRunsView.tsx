import React, { useState, useMemo, useEffect } from 'react';
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
  TemporaryEarningRecord,
  UserRole,
  UserPermission,
  PayrollPaymentBatch,
  PayrollPriorEntitlement,
  PaymentMethod,
  PaymentBatchStatus,
  PayrollEntitlementStatus,
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
import { hasPermission } from '../utils/permissions';
import { useLanguage } from '../i18n/LanguageContext';
import { PayrollRunItemsTable } from './payroll/PayrollRunItemsTable';
import { PayrollPaymentBatchModal } from './payroll/PayrollPaymentBatchModal';

interface PayrollRunsViewProps {
  company: Company;
  employees: Employee[];
  payrollRuns: PayrollRun[];
  attendance: AttendanceRecord[];
  loans: LoanSchedule[];
  penalties: PenaltyRecord[];
  temporaryEarnings: TemporaryEarningRecord[];
  activeRole: UserRole;
  permissions?: UserPermission[];
  onSavePayrollRun: (run: PayrollRun) => Promise<boolean>;
  onViewEmployeeStatement: (emp: Employee) => void;
  onOpenQoyodModal: () => void;
}

const STATUS_CONFIG: Record<PayrollRunStatus, { labelAr: string; labelEn: string; bg: string; text: string; border: string }> = {
  DRAFT: { labelAr: 'مسودة', labelEn: 'Draft', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  UNDER_REVIEW: { labelAr: 'قيد المراجعة والتدقيق', labelEn: 'Under Review', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  APPROVED: { labelAr: 'معتمد من الإدارة', labelEn: 'Approved', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  POSTED: { labelAr: 'مرحل ومقفل محاسبياً', labelEn: 'Posted & Locked', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
};

const PAYMENT_STATUS_CONFIG: Record<PaymentBatchStatus, { labelAr: string; labelEn: string; classes: string }> = {
  SCHEDULED: { labelAr: 'مجدولة للتحويل', labelEn: 'Scheduled', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
  PAID: { labelAr: 'تم التحويل', labelEn: 'Paid', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  FAILED: { labelAr: 'فشل التحويل', labelEn: 'Failed', classes: 'bg-rose-50 text-rose-700 border-rose-200' },
  CANCELLED: { labelAr: 'ملغاة', labelEn: 'Cancelled', classes: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const ENTITLEMENT_CONFIG: Record<PayrollEntitlementStatus, { labelAr: string; labelEn: string; classes: string }> = {
  PAYABLE: { labelAr: 'مستحق للدفع', labelEn: 'Payable', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  HELD: { labelAr: 'راتب معلق', labelEn: 'Held', classes: 'bg-amber-50 text-amber-800 border-amber-200' },
  UNDER_SETTLEMENT: { labelAr: 'تحت التسوية', labelEn: 'Under Settlement', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
  SETTLED: { labelAr: 'مسوى نهائيًا', labelEn: 'Settled', classes: 'bg-purple-50 text-purple-700 border-purple-200' },
  CANCELLED_WITH_DOCUMENT: { labelAr: 'ملغى بمستند', labelEn: 'Cancelled with Document', classes: 'bg-slate-100 text-slate-700 border-slate-200' },
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, { ar: string; en: string }> = {
  WPS: { ar: 'حماية الأجور WPS', en: 'WPS' },
  BANK_TRANSFER: { ar: 'تحويل بنكي', en: 'Bank Transfer' },
  CASH: { ar: 'دفع نقدي', en: 'Cash' },
};

export const PayrollRunsView: React.FC<PayrollRunsViewProps> = ({
  company,
  employees,
  payrollRuns,
  attendance,
  loans,
  penalties,
  temporaryEarnings,
  activeRole,
  permissions,
  onSavePayrollRun,
  onViewEmployeeStatement,
  onOpenQoyodModal,
}) => {
  const { language } = useLanguage();
  const tr = (ar: string, en: string) => language === 'ar' ? ar : en;
  const currentDate = new Date();
  const currentPeriod = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
  const companyRuns = useMemo(() => {
    return payrollRuns.filter(r => r.companyId === company.id);
  }, [payrollRuns, company.id]);

  const [selectedPeriod, setSelectedPeriod] = useState<string>(currentPeriod);

  // Open payroll on the operating month, not the first historical run.
  // Reset to the operating month when switching companies; historical periods
  // remain available in the period selector.
  useEffect(() => {
    setSelectedPeriod(currentPeriod);
  }, [company.id, currentPeriod]);

  const [selectedYear, setSelectedYear] = useState<number>(() =>
    Number((companyRuns[0]?.periodMonth || currentPeriod).slice(0, 4))
  );

  const availableYears = useMemo(() => {
    const currentYear = Number(currentPeriod.slice(0, 4));
    const years = new Set<number>([currentYear - 1, currentYear, currentYear + 1, selectedYear]);
    companyRuns.forEach(run => years.add(Number(run.periodMonth.slice(0, 4))));
    return Array.from(years).filter(Number.isFinite).sort((a, b) => b - a);
  }, [companyRuns, currentPeriod, selectedYear]);

  const yearPeriods = useMemo(() =>
    Array.from({ length: 12 }, (_, index) => `${selectedYear}-${String(index + 1).padStart(2, '0')}`),
    [selectedYear]
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
    // A missing period is a new run. Reusing a different period's id makes the
    // normalized database reject the resulting duplicate company/month state.
    return companyRuns.find(r => r.periodMonth === selectedPeriod);
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

  const paymentBatches = useMemo(() => currentRun?.paymentBatches || [], [currentRun?.paymentBatches]);
  const paymentSummary = useMemo(() => {
    const committedPaymentBatches = paymentBatches.filter(batch => ['SCHEDULED', 'PAID'].includes(batch.status));
    const committedEmployeeIds = new Set(committedPaymentBatches.flatMap(batch => batch.employeeIds));
    const paidAmount = paymentBatches.filter(batch => batch.status === 'PAID').reduce((sum, batch) => sum + batch.totalAmount, 0);
    const scheduledAmount = paymentBatches.filter(batch => batch.status === 'SCHEDULED').reduce((sum, batch) => sum + batch.totalAmount, 0);
    const entitlementTotals = (currentRun?.items || []).reduce<Record<PayrollEntitlementStatus, number>>((totals, item) => {
      const status = item.entitlementStatus || 'PAYABLE';
      totals[status] += item.netSalary;
      return totals;
    }, { PAYABLE: 0, HELD: 0, UNDER_SETTLEMENT: 0, SETTLED: 0, CANCELLED_WITH_DOCUMENT: 0 });
    const exceptionalProcessedAmount = entitlementTotals.HELD + entitlementTotals.SETTLED + entitlementTotals.CANCELLED_WITH_DOCUMENT;
    return {
      committedEmployeeIds,
      paidAmount,
      scheduledAmount,
      heldAmount: entitlementTotals.HELD,
      underSettlementAmount: entitlementTotals.UNDER_SETTLEMENT,
      settledAmount: entitlementTotals.SETTLED,
      cancelledByDocumentAmount: entitlementTotals.CANCELLED_WITH_DOCUMENT,
      remainingToSchedule: Math.max(0, entitlementTotals.PAYABLE - paidAmount - scheduledAmount),
      unpaidAmount: Math.max(0, (currentRun?.totalNetSalaries || 0) - paidAmount - exceptionalProcessedAmount),
      closeOutstandingAmount: Math.max(0, (currentRun?.totalNetSalaries || 0) - paidAmount - exceptionalProcessedAmount),
    };
  }, [paymentBatches, currentRun?.items, currentRun?.totalNetSalaries]);
  const { committedEmployeeIds, paidAmount, scheduledAmount, heldAmount, underSettlementAmount, settledAmount, cancelledByDocumentAmount, remainingToSchedule, unpaidAmount, closeOutstandingAmount } = paymentSummary;

  const getEmployeePaymentBatch = (employeeId: string) => {
    return [...paymentBatches].reverse().find(batch => batch.employeeIds.includes(employeeId) && ['SCHEDULED', 'PAID'].includes(batch.status));
  };

  const eligibleFilteredItems = useMemo(() => filteredItems.filter(item =>
    (item.entitlementStatus || 'PAYABLE') === 'PAYABLE' && item.netSalary > 0 && !committedEmployeeIds.has(item.employeeId)
  ), [filteredItems, committedEmployeeIds]);
  const selectedPaymentItems = useMemo(() => currentRun?.items.filter(item => selectedPaymentEmployeeIds.includes(item.employeeId)) || [], [currentRun?.items, selectedPaymentEmployeeIds]);
  const referencedPriorEntitlementKeys = useMemo(() => {
    const keys = new Set<string>();
    companyRuns.forEach(run => (run.paymentBatches || []).filter(batch => ['SCHEDULED', 'PAID'].includes(batch.status)).forEach(batch => {
      (batch.priorEntitlements || []).forEach(ref => keys.add(`${ref.sourcePayrollRunId}:${ref.sourcePayrollItemId}`));
    }));
    return keys;
  }, [companyRuns]);
  const availablePriorEntitlementsByEmployee = useMemo(() => {
    const byEmployee = new Map<string, PayrollPriorEntitlement[]>();
    companyRuns.filter(run => run.periodMonth < selectedPeriod).forEach(run => run.items
      .filter(item => item.employeeId
        && (item.entitlementStatus || 'PAYABLE') === 'HELD'
        && item.entitlementReason === 'MISSING_BANK_ACCOUNT'
        && item.netSalary > 0
        && !referencedPriorEntitlementKeys.has(`${run.id}:${item.id}`))
      .forEach(item => {
        const entitlement = {
        sourcePayrollRunId: run.id,
        sourcePayrollItemId: item.id,
        sourcePeriodMonth: run.periodMonth,
        employeeId: item.employeeId,
        employeeNo: item.employeeNo,
        employeeName: item.employeeName,
        amount: roundAmount(item.netSalary),
        };
        byEmployee.set(item.employeeId, [...(byEmployee.get(item.employeeId) || []), entitlement]);
      }));
    return byEmployee;
  }, [companyRuns, selectedPeriod, referencedPriorEntitlementKeys]);
  const getAvailablePriorEntitlements = (employeeId: string) => availablePriorEntitlementsByEmployee.get(employeeId) || [];
  const { selectedPriorEntitlements, selectedPaymentTotal } = useMemo(() => {
    const selectedPriorEntitlements = selectedPaymentItems.flatMap(item => availablePriorEntitlementsByEmployee.get(item.employeeId) || []);
    const currentTotal = selectedPaymentItems.reduce((sum, item) => sum + item.netSalary, 0);
    const priorTotal = selectedPriorEntitlements.reduce((sum, ref) => sum + ref.amount, 0);
    return { selectedPriorEntitlements, selectedPaymentTotal: roundAmount(currentTotal + priorTotal) };
  }, [selectedPaymentItems, availablePriorEntitlementsByEmployee]);

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

  const handleCreatePaymentBatch = async () => {
    if (!currentRun || !selectedPaymentItems.length || !['APPROVED', 'POSTED'].includes(currentRun.status)) return;
    const stillEligible = selectedPaymentItems;
    if (!stillEligible.length) return;
    const priorEntitlements = stillEligible.flatMap(item => getAvailablePriorEntitlements(item.employeeId));
    const priorEntitlementsTotal = roundAmount(priorEntitlements.reduce((sum, ref) => sum + ref.amount, 0));
    const invalidBankItems = stillEligible.filter(item => {
      const employee = companyEmployees.find(emp => emp.id === item.employeeId);
      const iban = String(employee?.bankIban || item.bankIban || '').replace(/\s/g, '').toUpperCase();
      return !/^SA\d{22}$/.test(iban) || employee?.bankAccountStatus === 'PENDING';
    });
    if (paymentBatchForm.method !== 'CASH' && invalidBankItems.length) {
      alert(tr('لا يمكن إنشاء دفعة بنكية: يوجد موظفون بدون IBAN سعودي مكتمل أو حساب بنكي جاهز.', 'Bank batch cannot be created: some employees do not have a valid Saudi IBAN or a ready bank account.'));
      return;
    }
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
      totalAmount: roundAmount(stillEligible.reduce((sum, item) => sum + item.netSalary, 0) + priorEntitlementsTotal),
      method: paymentBatchForm.method,
      status: 'SCHEDULED',
      scheduledDate: paymentBatchForm.scheduledDate,
      reference: paymentBatchForm.reference.trim() || batchNumber,
      notes: `${currentRun.status === 'POSTED' ? 'دفعة متأخرة مرتبطة بالمسير الأصلي. ' : ''}${priorEntitlements.length ? `تتضمن ${priorEntitlements.length} مستحق سابق بإجمالي ${priorEntitlementsTotal.toFixed(2)} SR. ` : ''}${paymentBatchForm.notes.trim()}`.trim(),
      priorEntitlements,
      createdAt: new Date().toISOString(),
    };
    const updatedRun = { ...currentRun, paymentBatches: [...(currentRun.paymentBatches || []), batch] };
    const saved = await onSavePayrollRun(updatedRun);
    if (!saved) return;
    if (batch.method !== 'CASH') exportBankPayrollXlsx(updatedRun, company, batch, employees);
    setSelectedPaymentEmployeeIds([]);
    setIsPaymentBatchModalOpen(false);
    setPaymentBatchForm({ method: 'WPS', scheduledDate: new Date().toISOString().slice(0, 10), reference: '', notes: '' });
  };

  const handleEntitlementStatusChange = (item: PayrollRunItem, status: PayrollEntitlementStatus) => {
    if (!currentRun) return;
    if (status === 'PAYABLE' && item.entitlementReason === 'MISSING_BANK_ACCOUNT') {
      const employee = companyEmployees.find(emp => emp.id === item.employeeId);
      const normalizedIban = String(employee?.bankIban || '').replace(/\s/g, '').toUpperCase();
      const bankReady = /^SA\d{22}$/.test(normalizedIban) && employee?.bankAccountStatus !== 'PENDING';
      if (!bankReady) {
        alert(tr('لا يمكن تحرير الراتب المعلق قبل اكتمال IBAN السعودي وتأكيد جاهزية الحساب البنكي في ملف الموظف.', 'The held salary cannot be released until a valid Saudi IBAN is saved and the bank account is marked ready.'));
        return;
      }
    }
    const batch = getEmployeePaymentBatch(item.employeeId);
    if (batch && ['SCHEDULED', 'PAID'].includes(batch.status)) {
      alert(tr('لا يمكن تغيير حالة الاستحقاق بعد جدولة أو دفع راتب الموظف. ألغِ الدفعة المجدولة أولًا، أما المدفوعة فتحتاج تسوية عكسية مستقلة.', 'Entitlement status cannot change after salary scheduling or payment. Cancel a scheduled batch first; paid salaries require a separate reversal settlement.'));
      return;
    }
    let reason = '';
    let documentRef = '';
    if (status !== 'PAYABLE') {
      reason = window.prompt(tr('اكتب سبب التعليق أو التسوية (إلزامي):', 'Enter the hold or settlement reason (required):'), item.entitlementReason || '')?.trim() || '';
      if (!reason) return;
    }
    if (['SETTLED', 'CANCELLED_WITH_DOCUMENT'].includes(status)) {
      documentRef = window.prompt(tr('رقم مستند/مرجع التسوية (إلزامي):', 'Settlement document/reference number (required):'), item.entitlementDocumentRef || '')?.trim() || '';
      if (!documentRef) return;
    }
    const items = currentRun.items.map(current => current.id === item.id ? {
      ...current,
      entitlementStatus: status,
      entitlementReason: status === 'PAYABLE' ? undefined : reason,
      entitlementDocumentRef: ['SETTLED', 'CANCELLED_WITH_DOCUMENT'].includes(status) ? documentRef : undefined,
      entitlementUpdatedAt: new Date().toISOString(),
    } : current);
    setSelectedPaymentEmployeeIds(selected => selected.filter(id => id !== item.employeeId));
    onSavePayrollRun({ ...currentRun, items });
  };

  const handlePaymentBatchStatus = (batchId: string, status: PaymentBatchStatus) => {
    if (!currentRun) return;
    if (status === 'PAID' && !hasPermission({ role: activeRole, permissions } as any, 'CONFIRM_PAYROLL_PAYMENT')) {
      alert(tr('ليس لديك صلاحية تأكيد تنفيذ دفعة الرواتب.', 'You do not have permission to confirm payroll payment.'));
      return;
    }
    const paymentBatches = (currentRun.paymentBatches || []).map(batch => batch.id === batchId ? {
      ...batch,
      status,
      paymentDate: status === 'PAID' ? new Date().toISOString().slice(0, 10) : batch.paymentDate,
    } : batch);
    onSavePayrollRun({ ...currentRun, paymentBatches });
  };

  const handleReversePayment = (batchId: string) => {
    if (!currentRun || !hasPermission({ role: activeRole, permissions } as any, 'REVERSE_PAYROLL_PAYMENT')) return;
    const batch = (currentRun.paymentBatches || []).find(item => item.id === batchId);
    if (!batch || batch.status !== 'PAID') return;
    const reason = window.prompt(tr('اكتب سبب إلغاء إثبات الدفع (إلزامي):', 'Enter the payment reversal reason (required):'))?.trim() || '';
    if (!reason) return;
    if (!window.confirm(tr('سيتم إرجاع الدفعة إلى مجدولة بدون فتح المسير أو تعديل استحقاقاته. متابعة؟', 'The batch will return to Scheduled without reopening payroll or changing payroll calculations. Continue?'))) return;
    const paymentBatches = (currentRun.paymentBatches || []).map(item => item.id === batchId ? {
      ...item,
      status: 'SCHEDULED' as const,
      reversedPaymentDate: item.paymentDate,
      paymentDate: undefined,
      paymentReversalReason: reason,
      paymentReversedAt: new Date().toISOString(),
    } : item);
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
    const employeeBatch = getEmployeePaymentBatch(adjustmentItem.employeeId);
    if (employeeBatch && ['SCHEDULED', 'PAID'].includes(employeeBatch.status)) {
      alert(tr('لا يمكن تعديل موظف تم إدراجه في أمر تحويل نشط أو تم تحويل راتبه بالفعل.', 'A payroll item cannot be edited after the employee is included in an active or paid transfer batch.'));
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
      totalAllowances: sum(item => item.housingAllowance + item.transportAllowance + item.otherAllowances + item.bonuses),
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
    // Recalculate only unpaid/new employees. Employees already reserved or paid are preserved below.
    setIsCalculating(true);
    const startTime = performance.now();

    setTimeout(() => {
      const previousItems: PayrollRunItem[] = currentRun?.items || [];
      const previousItemsByEmployeeId = new Map<string, PayrollRunItem>(previousItems.map(item => [item.employeeId, item]));
      const previousItemsByEmployeeNo = new Map<string, PayrollRunItem>();
      const duplicateEmployeeNumbers = new Set<string>();

      previousItems.forEach(item => {
        const employeeNo = item.employeeNo?.trim().toUpperCase();
        if (!employeeNo) return;
        if (previousItemsByEmployeeNo.has(employeeNo)) {
          duplicateEmployeeNumbers.add(employeeNo);
          previousItemsByEmployeeNo.delete(employeeNo);
          return;
        }
        if (!duplicateEmployeeNumbers.has(employeeNo)) previousItemsByEmployeeNo.set(employeeNo, item);
      });

      const runItems: PayrollRunItem[] = companyEmployees
        .filter(emp => {
          if (emp.status === 'ABSCONDED') return false;
          if (emp.salaryStartDate && emp.salaryStartDate.slice(0, 7) > selectedPeriod) return false;
          if (emp.status === 'TERMINATED') return Boolean(emp.terminationDate && selectedPeriod <= emp.terminationDate.slice(0, 7));
          return true;
        })
        .map(emp => {
        const monthStart = `${selectedPeriod}-01`;
        const [year, month] = selectedPeriod.split('-').map(Number);
        const monthEnd = `${selectedPeriod}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
        const empAtt = attendance.filter(a => a.employeeId === emp.id && a.date <= monthEnd && (a.endDate || a.date) >= monthStart);
        const effectiveLoansFor = (periodMonth: string, employeeId: string) => {
          const employeeLoanRows = loans
            .filter(l => l.employeeId === employeeId && String(l.startDate || '').slice(0, 7) <= periodMonth)
            .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
        const loanBalances = new Map<string, number>(employeeLoanRows.map(loan => [loan.id, Math.max(0, Number(loan.remainingAmount) || 0)]));
        payrollRuns
          .filter(candidate => candidate.companyId === company.id
            && candidate.periodMonth < periodMonth
            && ['APPROVED', 'POSTED'].includes(candidate.status))
          .sort((a, b) => a.periodMonth.localeCompare(b.periodMonth))
          .forEach(candidate => {
            let paid = Math.max(0, Number(candidate.items.find(item => item.employeeId === emp.id)?.loanDeduction) || 0);
            for (const loan of employeeLoanRows) {
              if (paid <= 0 || loan.startDate > candidate.periodMonth) continue;
              const balance = loanBalances.get(loan.id) || 0;
              const applied = Math.min(balance, paid);
              loanBalances.set(loan.id, Number((balance - applied).toFixed(2)));
              paid = Number((paid - applied).toFixed(2));
            }
          });
          return employeeLoanRows.map(loan => {
          const remainingAmount = loanBalances.get(loan.id) || 0;
          return {
            ...loan,
            remainingAmount,
            remainingInstallments: remainingAmount === 0
              ? 0
              : loan.monthlyInstallment > 0 ? Math.ceil(remainingAmount / loan.monthlyInstallment) : loan.remainingInstallments,
            status: remainingAmount === 0 ? 'COMPLETED' as const : loan.status,
          };
          });
        };
        const empLoans = effectiveLoansFor(selectedPeriod, emp.id);
        const empPens = penalties.filter(p => p.employeeId === emp.id && p.periodMonth === selectedPeriod && p.appliedInPayroll !== false);
        const empEarnings = temporaryEarnings.filter(e => e.employeeId === emp.id && e.periodMonth === selectedPeriod && e.appliedInPayroll !== false);

        let calculated = calculateEmployeePayrollItem({
          employee: emp,
          company,
          periodMonth: selectedPeriod,
          attendanceRecords: empAtt,
          activeLoans: empLoans,
          penalties: empPens,
          temporaryEarnings: empEarnings,
        });

        // Carry every unpaid prior salary period into the current run exactly once.
        // Unpaid prior periods are recalculated from their own period inputs, so a July deduction
        // added later for an unpaid employee immediately changes the July carried balance.
        const priorPeriodDetails: Array<{ periodMonth: string; gross: number; deductions: number; net: number }> = [];
        const salaryStartDate = String(emp.salaryStartDate || emp.hireDate || '');
        const salaryStartMonth = /^\d{4}-\d{2}-\d{2}$/.test(salaryStartDate) ? salaryStartDate.slice(0, 7) : selectedPeriod;
        let cursor = salaryStartMonth;
        while (cursor < selectedPeriod && priorPeriodDetails.length < 240) {
          const historicalRun = companyRuns.find(run => run.periodMonth === cursor);
          const alreadyTransferred = Boolean(historicalRun?.paymentBatches?.some(batch =>
            ['SCHEDULED', 'PAID'].includes(batch.status) && (batch.employeeIds || []).includes(emp.id)
          ));
          if (!alreadyTransferred) {
            const [priorYear, priorMonthNo] = cursor.split('-').map(Number);
            const priorEnd = `${cursor}-${String(new Date(Date.UTC(priorYear, priorMonthNo, 0)).getUTCDate()).padStart(2, '0')}`;
            const priorStart = `${cursor}-01`;
            const priorEmployee = cursor === salaryStartMonth ? { ...emp, prorateFirstMonth: true } : emp;
            const priorItem = calculateEmployeePayrollItem({
              employee: priorEmployee,
              company,
              periodMonth: cursor,
              attendanceRecords: attendance.filter(a => a.employeeId === emp.id && a.date <= priorEnd && (a.endDate || a.date) >= priorStart),
              activeLoans: effectiveLoansFor(cursor, emp.id),
              penalties: penalties.filter(p => p.employeeId === emp.id && p.periodMonth === cursor && p.appliedInPayroll !== false),
              temporaryEarnings: temporaryEarnings.filter(e => e.employeeId === emp.id && e.periodMonth === cursor && e.appliedInPayroll !== false),
            });
            if (Number(priorItem?.netSalary || 0) > 0) {
              priorPeriodDetails.push({
                periodMonth: cursor,
                gross: Number(priorItem?.totalGrossSalary || 0),
                deductions: Number(priorItem?.totalDeductions || 0),
                net: Number(priorItem?.netSalary || 0),
              });
            }
          }
          const [cursorYear, cursorMonth] = cursor.split('-').map(Number);
          const next = new Date(Date.UTC(cursorYear, cursorMonth, 1));
          cursor = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
        }
        const priorPeriodGross = roundAmount(priorPeriodDetails.reduce((sum, row) => sum + row.gross, 0));
        const priorPeriodDeductions = roundAmount(priorPeriodDetails.reduce((sum, row) => sum + row.deductions, 0));
        const priorPeriodNet = roundAmount(priorPeriodDetails.reduce((sum, row) => sum + row.net, 0));
        if (priorPeriodNet > 0) {
          calculated = {
            ...calculated,
            priorPeriodGross,
            priorPeriodDeductions,
            priorPeriodNet,
            priorPeriodDetails,
            netSalary: roundAmount(calculated.netSalary + priorPeriodNet),
            totalCompanyBurden: roundAmount(calculated.totalCompanyBurden + priorPeriodNet),
            warningFlags: calculated.warningFlags,
          };
        }
        const employeeNo = emp.employeeNo?.trim().toUpperCase();
        const previousItem = previousItemsByEmployeeId.get(emp.id)
          || (employeeNo && !duplicateEmployeeNumbers.has(employeeNo)
            ? previousItemsByEmployeeNo.get(employeeNo)
            : undefined);
        // Employees already included in an active/paid transfer batch are immutable.
        if (previousItem && committedEmployeeIds.has(emp.id)) return previousItem;
        const previousEntitlementStatus = previousItem?.entitlementStatus || 'PAYABLE';
        const normalizedIban = String(emp.bankIban || '').replace(/\s/g, '').toUpperCase();
        const hasReadyBankAccount = /^SA\d{22}$/.test(normalizedIban) && emp.bankAccountStatus !== 'PENDING';
        const missingBankHold = !hasReadyBankAccount && previousEntitlementStatus === 'PAYABLE';
        const suspensionHold = calculated.isSuspended && previousEntitlementStatus === 'PAYABLE';
        const shouldApplyAutomaticHold = missingBankHold || suspensionHold;
        const automaticHoldReason = missingBankHold
          ? 'MISSING_BANK_ACCOUNT'
          : (emp.suspensionReason?.trim() || tr('تعليق تلقائي من ملف الموظف', 'Automatically held from employee profile'));
        return previousItem ? {
          ...calculated,
          entitlementStatus: shouldApplyAutomaticHold ? 'HELD' : previousItem.entitlementStatus,
          entitlementReason: shouldApplyAutomaticHold
            ? automaticHoldReason
            : previousItem.entitlementReason,
          entitlementDocumentRef: previousItem.entitlementDocumentRef,
          entitlementUpdatedAt: shouldApplyAutomaticHold ? new Date().toISOString() : previousItem.entitlementUpdatedAt,
        } : (!hasReadyBankAccount || calculated.isSuspended) ? {
          ...calculated,
          entitlementStatus: 'HELD',
          entitlementReason: !hasReadyBankAccount
            ? 'MISSING_BANK_ACCOUNT'
            : (emp.suspensionReason?.trim() || tr('تعليق تلقائي من ملف الموظف', 'Automatically held from employee profile')),
          entitlementUpdatedAt: new Date().toISOString(),
        } : calculated;
      });

      const decimals = company.calculationRules?.roundingDecimals ?? 2;
      const totalBaseSalaries = roundAmount(runItems.reduce((s, i) => s + i.baseSalary, 0), decimals);
      const totalAllowances = roundAmount(runItems.reduce((s, i) => s + i.housingAllowance + i.transportAllowance + i.otherAllowances + i.bonuses, 0), decimals);
      const totalOvertime = roundAmount(runItems.reduce((s, i) => s + i.overtimeAmount, 0), decimals);
      const totalGrossSalaries = roundAmount(runItems.reduce((s, i) => s + i.totalGrossSalary + Number(i.priorPeriodGross || 0), 0), decimals);
      const totalAbsenceDeductions = roundAmount(runItems.reduce((s, i) => s + i.absenceDeduction + i.unpaidLeaveDeduction, 0), decimals);
      const totalDelayDeductions = roundAmount(runItems.reduce((s, i) => s + i.delayDeduction, 0), decimals);
      const totalGosiEmployee = roundAmount(runItems.reduce((s, i) => s + i.gosiEmployeeShare, 0), decimals);
      const totalGosiEmployer = roundAmount(runItems.reduce((s, i) => s + i.gosiEmployerShare, 0), decimals);
      const totalLoanDeductions = roundAmount(runItems.reduce((s, i) => s + i.loanDeduction, 0), decimals);
      const totalPenalties = roundAmount(runItems.reduce((s, i) => s + i.penaltiesDeduction + i.otherDeductions, 0), decimals);
      const totalDeductions = roundAmount(runItems.reduce((s, i) => s + i.totalDeductions + Number(i.priorPeriodDeductions || 0), 0), decimals);
      const totalNetSalaries = roundAmount(runItems.reduce((s, i) => s + i.netSalary, 0), decimals);
      const totalCompanyCost = roundAmount(runItems.reduce((s, i) => s + i.totalCompanyBurden, 0), decimals);

      const runId = currentRun?.id || `run-${company.id}-${selectedPeriod}`;
      const updatedRun: PayrollRun = {
        id: runId,
        companyId: company.id,
        periodMonth: selectedPeriod,
        startDate: `${selectedPeriod}-01`,
        endDate: `${selectedPeriod}-${String(new Date(Date.UTC(Number(selectedPeriod.slice(0, 4)), Number(selectedPeriod.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`,
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
    const transition = currentRun.status + '->' + newStatus;
    const permission: UserPermission = transition === 'UNDER_REVIEW->APPROVED'
      ? 'APPROVE_PAYROLL'
      : transition === 'APPROVED->UNDER_REVIEW' || transition === 'POSTED->APPROVED'
        ? 'REVERSE_PAYROLL_APPROVAL'
        : transition === 'APPROVED->POSTED'
          ? 'POST_PAYROLL'
          : 'MANAGE_PAYROLL';
    if (!hasPermission({ role: activeRole, permissions } as any, permission)) {
      alert(tr('ليس لديك الصلاحية المطلوبة لتنفيذ هذه المرحلة.', 'You do not have permission to perform this action.'));
      return;
    }
    const updated: PayrollRun = {
      ...currentRun,
      status: newStatus,
      approvedAt: newStatus === 'APPROVED' ? new Date().toISOString() : currentRun.approvedAt,
      approvedBy: newStatus === 'APPROVED' ? tr('المدير العام', 'General Manager') : currentRun.approvedBy,
      postedAt: newStatus === 'POSTED' ? new Date().toISOString() : currentRun.postedAt,
      postedBy: newStatus === 'POSTED' ? tr('المدير المالي', 'Finance Manager') : currentRun.postedBy,
    };
    onSavePayrollRun(updated);
  };

  const canReversePosting = hasPermission({ role: activeRole, permissions } as any, 'REVERSE_PAYROLL_APPROVAL');
  const handleReverseApproval = () => {
    if (!currentRun || currentRun.status !== 'APPROVED' || !canReversePosting) return;
    if (currentRun.paymentBatches?.some(batch => batch.status === 'PAID')) {
      alert(tr('لا يمكن فتح المسير بعد تسجيل دفعة مدفوعة. ألغِ إثبات السداد أولًا.', 'Payroll cannot be reopened after a paid batch. Reverse the payment first.'));
      return;
    }
    if (!window.confirm(tr('هل تريد التراجع عن اعتماد المسير وفتحه للتعديل؟', 'Reverse payroll approval and reopen it for editing?'))) return;
    onSavePayrollRun({ ...currentRun, status: 'UNDER_REVIEW', approvedAt: undefined, approvedBy: undefined });
  };
  const handleReversePosting = () => {
    if (!currentRun || currentRun.status !== 'POSTED' || !canReversePosting) return;
    if (currentRun.paymentBatches?.some(batch => batch.status === 'PAID')) {
      alert(tr('لا يمكن التراجع عن الترحيل بعد تسجيل دفعة محولة. يجب عمل تسوية أو إلغاء إثبات السداد أولًا.', 'Posting cannot be reversed after a paid batch. Create a settlement or reverse the payment first.'));
      return;
    }
    if (!window.confirm(tr('هل تريد التراجع عن ترحيل المسير وفتحه للتعديل؟', 'Reverse payroll posting and reopen it for editing?'))) return;
    onSavePayrollRun({ ...currentRun, status: 'APPROVED', postedAt: undefined, postedBy: undefined });
  };

  // Warning metrics
  const totalWarnings = useMemo(() => currentRun?.items.reduce((s, i) => s + i.warningFlags.length, 0) || 0, [currentRun?.items]);
  const priorBalancesTotal = useMemo(() => (currentRun?.items || []).reduce((sum, item) => sum + Number(item.priorPeriodNet || 0), 0), [currentRun?.items]);
  const exportablePaymentEmployeeIds = useMemo(() => (currentRun?.items || [])
    .filter(item => (item.entitlementStatus || 'PAYABLE') === 'PAYABLE' && !committedEmployeeIds.has(item.employeeId))
    .map(item => item.employeeId), [currentRun?.items, committedEmployeeIds]);

  return (
    <div data-no-translate className="space-y-6">
      
      {/* Top Header & Period Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Banknote className="w-6 h-6 text-emerald-600" />
              <span>{tr('دورة الرواتب الشهرية والمسيرات', 'Monthly Payroll Runs')}</span>
            </h1>
            {currentRun && (
              <span className={`text-xs px-3 py-1 rounded-full font-bold border ${STATUS_CONFIG[currentRun.status].bg} ${STATUS_CONFIG[currentRun.status].text} ${STATUS_CONFIG[currentRun.status].border}`}>
                {language === 'ar' ? STATUS_CONFIG[currentRun.status].labelAr : STATUS_CONFIG[currentRun.status].labelEn}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {tr('احتساب الاستحقاقات، التأمينات (GOSI)، خصومات الحضور، الأقساط، والاعتماد الإداري والمحاسبي', 'Calculate earnings, GOSI, attendance deductions, installments, approval and accounting posting')}
          </p>
        </div>

        {/* Right Toolbar: Period Switcher & Calculate Button */}
        <div className="flex flex-wrap items-center gap-2.5">
          
          {/* Period Selector */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
            <Calendar className="w-4 h-4 text-slate-500" />
            <select
              aria-label={tr('السنة', 'Year')}
              value={selectedYear}
              onChange={(e) => {
                const year = Number(e.target.value);
                setSelectedYear(year);
                const month = selectedPeriod.slice(5, 7) || currentPeriod.slice(5, 7);
                setSelectedPeriod(`${year}-${month}`);
                setSelectedPaymentEmployeeIds([]);
              }}
              className="bg-transparent text-xs font-bold text-slate-800 border-none focus:ring-0 cursor-pointer"
            >
              {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
            </select>
            <span className="text-slate-300">/</span>
            <select
              aria-label={tr('شهر المسير', 'Payroll month')}
              value={selectedPeriod}
              onChange={(e) => { setSelectedPeriod(e.target.value); setSelectedPaymentEmployeeIds([]); }}
              className="bg-transparent text-xs font-bold text-slate-800 border-none focus:ring-0 cursor-pointer"
            >
              {yearPeriods.map(period => (
                <option key={period} value={period}>{new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-US', { month: 'long' }).format(new Date(`${period}-01T12:00:00`))}</option>
              ))}
            </select>
          </div>

          {/* Recalculate Button */}
          <button
            onClick={handleRecalculate}
            disabled={isCalculating}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <Play className={`w-3.5 h-3.5 ${isCalculating ? 'animate-spin' : ''}`} />
            <span>{isCalculating ? tr('جاري الحساب...', 'Calculating...') : tr('إعادة احتساب المسير آلياً', 'Recalculate payroll')}</span>
          </button>

          {/* Performance Benchmark Tag */}
          {calcSpeedMs !== null && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              <Zap className="w-3 h-3 text-emerald-600" />
              <span>{tr('تم في', 'Completed in')} {calcSpeedMs} ms ({companyEmployees.length} {tr('موظف', 'employees')})</span>
            </span>
          )}
        </div>
      </div>

      {/* Summary Totals Cards Bar */}
      {currentRun && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500">{tr('إجمالي الرواتب الأساسية', 'Total basic salaries')}</div>
            <div className="text-sm sm:text-base font-extrabold text-slate-900 mt-0.5">
              {formatSAR(currentRun.totalBaseSalaries)}
            </div>
            <div className="text-[10px] text-slate-400">{currentRun.employeesCount} {tr('موظف', 'employees')}</div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500">{tr('إجمالي البدلات والإضافي', 'Total allowances & overtime')}</div>
            <div className="text-sm sm:text-base font-extrabold text-slate-900 mt-0.5">
              {formatSAR(currentRun.totalAllowances + currentRun.totalOvertime)}
            </div>
            <div className="text-[10px] text-slate-400">{tr('سكن، نقل، عمل إضافي', 'Housing, transport, overtime')}</div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500">{tr('إجمالي المستحق (Gross)', 'Total gross pay')}</div>
            <div className="text-sm sm:text-base font-extrabold text-slate-900 mt-0.5">
              {formatSAR(currentRun.totalGrossSalaries)}
            </div>
            <div className="text-[10px] text-slate-400">{tr('قبل الاستقطاعات', 'Before deductions')}</div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500">{tr('إجمالي الاستقطاعات', 'Total deductions')}</div>
            <div className="text-sm sm:text-base font-extrabold text-rose-700 mt-0.5">
              {formatSAR(currentRun.totalDeductions)}
            </div>
            <div className="text-[10px] text-slate-400">{tr('تأمينات، سلف، غياب، تأخير', 'GOSI, loans, absence, lateness')}</div>
          </div>

          <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200 shadow-xs">
            <div className="text-[11px] font-bold text-emerald-900">{tr('صافي المستحق (Net)', 'Net pay')}</div>
            <div className="text-sm sm:text-base font-black text-emerald-800 mt-0.5 font-mono">
              {formatSAR(currentRun.totalNetSalaries)}
            </div>
            <div className="text-[10px] text-emerald-700">{tr('لتحويل البنك (WPS)', 'For bank transfer (WPS)')}</div>
          </div>

          <div className="bg-purple-50/70 p-3.5 rounded-2xl border border-purple-200 shadow-xs">
            <div className="text-[11px] font-bold text-purple-900">{tr('إجمالي تكلفة المنشأة', 'Total company cost')}</div>
            <div className="text-sm sm:text-base font-black text-purple-800 mt-0.5 font-mono">
              {formatSAR(currentRun.totalCompanyCost)}
            </div>
            <div className="text-[10px] text-purple-700">{tr('تتضمن حصة التأمينات', 'Including employer GOSI')}</div>
          </div>

        </div>
      )}

      {currentRun && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div><h3 className="text-sm font-black text-slate-900">{tr('ملخص الإضافات والخصومات قبل الاعتماد', 'Pre-approval Earnings & Deductions')}</h3><p className="text-[11px] text-slate-500">{tr('يتحدث تلقائيًا بعد إعادة احتساب المسير أو تعديل موظف.', 'Updates automatically after recalculation or employee adjustment.')}</p></div>
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${currentRun.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{currentRun.status === 'APPROVED' ? tr('معتمد — جاهز للدفع', 'Approved — ready for payment') : tr('غير معتمد', 'Not approved')}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-center">
            {[
              [tr('إجمالي الإضافات', 'Total additions'), currentRun.totalGrossSalaries - currentRun.totalBaseSalaries, 'text-emerald-700'],
              [tr('غياب/إجازة', 'Absence / leave'), currentRun.totalAbsenceDeductions, 'text-rose-700'],
              [tr('تأخير', 'Lateness'), currentRun.totalDelayDeductions, 'text-rose-700'],
              [tr('تأمينات الموظف', 'Employee GOSI'), currentRun.totalGosiEmployee, 'text-rose-700'],
              [tr('أقساط السلف', 'Loan installments'), currentRun.totalLoanDeductions, 'text-rose-700'],
              [tr('جزاءات وخصومات', 'Penalties & deductions'), currentRun.totalPenalties, 'text-rose-700'],
              [tr('خصومات أخرى', 'Other deductions'), Math.max(0, currentRun.totalDeductions - currentRun.totalAbsenceDeductions - currentRun.totalDelayDeductions - currentRun.totalGosiEmployee - currentRun.totalLoanDeductions - currentRun.totalPenalties), 'text-rose-700'],
              [tr('أرصدة سابقة', 'Prior balances'), priorBalancesTotal, 'text-blue-700'],
              [tr('صافي الرواتب', 'Net salaries'), currentRun.totalNetSalaries, 'text-emerald-800'],
            ].map(([label, amount, color]) => <div key={String(label)} className="rounded-xl bg-slate-50 border border-slate-100 p-2"><div className="text-[10px] text-slate-500">{label}</div><div className={`text-xs font-black mt-1 ${color}`}>{formatSAR(Number(amount))}</div></div>)}
          </div>
        </div>
      )}

      {/* Workflow & Export Action Ribbon */}
      {currentRun && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          
          {/* Approval Workflow Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-700 ml-2">{tr('مراحل الاعتماد:', 'Approval workflow:')}</span>

            {currentRun.status === 'DRAFT' && (
              <button
                onClick={() => handleStatusChange('UNDER_REVIEW')}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{tr('إرسال للمراجعة والتدقيق', 'Submit for review')}</span>
              </button>
            )}

            {currentRun.status === 'UNDER_REVIEW' && (
              <button
                onClick={() => handleStatusChange('APPROVED')}
                disabled={!hasPermission({ role: activeRole, permissions } as any, 'APPROVE_PAYROLL')}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{tr('اعتماد المدير العام', 'General manager approval')}</span>
              </button>
            )}

            {currentRun.status === 'APPROVED' && (
              <><button
                onClick={() => handleStatusChange('POSTED')}
                disabled={!hasPermission({ role: activeRole, permissions } as any, 'POST_PAYROLL') || closeOutstandingAmount > 0 || underSettlementAmount > 0}
                className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{closeOutstandingAmount > 0 || underSettlementAmount > 0 ? tr('عالِج المدفوع والمعلق والتسويات قبل الإقفال', 'Resolve payments, holds and settlements before posting') : tr('إقفال وترحيل المسير بعد المعالجة', 'Close and post payroll')}</span>
              </button>
              {canReversePosting && <button type="button" onClick={handleReverseApproval} className="px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold flex items-center gap-1.5"><RotateCcw className="w-3.5 h-3.5" /> {tr('التراجع عن الاعتماد والتعديل', 'Reverse approval and edit')}</button>}
              </>
            )}

            {currentRun.status === 'POSTED' && (
              <>
                <div className="flex items-center gap-2 text-xs font-bold text-purple-800 bg-purple-50 px-3 py-1.5 rounded-xl border border-purple-200">
                  <CheckCircle2 className="w-4 h-4 text-purple-600" />
                  <span>{tr('تم إقفال وترحيل مسير هذا الشهر بنجاح', 'This payroll has been closed and posted')}</span>
                </div>
                {canReversePosting && (
                  <button type="button" onClick={handleReversePosting} className="px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" /> {tr('التراجع عن الترحيل', 'Reverse posting')}
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
              title={tr('تصدير مسير الرواتب المفصل بصيغة Excel', 'Export detailed payroll in Excel format')}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>{tr('مسير الرواتب Excel', 'Payroll Excel')}</span>
            </button>

            <button
              onClick={() => {
                const batch = generatePayrollJournalBatch(company, currentRun);
                exportQoyodJournalCsv(batch, company);
              }}
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
              title={tr('تصدير ملف قيد اليومية المتوافق مع نموذج استيراد قيود', 'Export journal file compatible with Qoyod import')}
            >
              <Layers className="w-3.5 h-3.5 text-sky-600" />
              <span>{tr('قيد قيود CSV', 'Qoyod Journal CSV')}</span>
            </button>

            <button
              onClick={() => exportWpsBankCsv(currentRun, company, exportablePaymentEmployeeIds)}
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
              title={tr('تصدير المستحقين غير المعلقين وغير المدرجين في دفعة فقط', 'Export only payable employees not already included in a batch')}
            >
              <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
              <span>{tr('ملف حماية الأجور (WPS)', 'WPS File')}</span>
            </button>

            <button
              onClick={() => exportGosiReportCsv(currentRun, company)}
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
              title={tr('تصدير جدول اشتراكات التأمينات الاجتماعية GOSI', 'Export GOSI contributions report')}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>{tr('تقرير التأمينات (GOSI)', 'GOSI Report')}</span>
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
                <WalletCards className="w-5 h-5 text-emerald-600" /> {tr('دفعات تحويل الرواتب', 'Payroll Payment Batches')}
              </h3>
              <p className="text-xs text-slate-500 mt-1">{tr('حوّل لمجموعة أو لموظف واحد مع إبقاء مسير الشهر موحدًا.', 'Pay a group or one employee while keeping a single monthly payroll run.')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleAllEligibleEmployees}
                disabled={!eligibleFilteredItems.length}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer disabled:opacity-40"
              >
                {tr('تحديد المتاح', 'Select eligible')} ({eligibleFilteredItems.length})
              </button>
              <button
                type="button"
                onClick={() => setIsPaymentBatchModalOpen(true)}
                disabled={!selectedPaymentItems.length || !['APPROVED', 'POSTED'].includes(currentRun.status)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" /> {currentRun.status === 'POSTED' ? tr('إنشاء دفعة متأخرة', 'Create late payment batch') : tr('إنشاء دفعة للمحددين', 'Create selected batch')} ({selectedPaymentItems.length})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3 p-4 bg-slate-50/70">
            <div className="p-3 rounded-xl bg-white border border-slate-200"><div className="text-[10px] text-slate-500">{tr('إجمالي المسير', 'Payroll total')}</div><div className="font-black text-slate-900">{formatSAR(currentRun.totalNetSalaries)}</div></div>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200"><div className="text-[10px] text-emerald-700">{tr('تم تحويله', 'Paid')}</div><div className="font-black text-emerald-800">{formatSAR(paidAmount)}</div></div>
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200"><div className="text-[10px] text-blue-700">{tr('مجدول للتحويل', 'Scheduled')}</div><div className="font-black text-blue-800">{formatSAR(scheduledAmount)}</div></div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200"><div className="text-[10px] text-amber-700">{tr('رواتب معلقة', 'Held salaries')}</div><div className="font-black text-amber-800">{formatSAR(heldAmount)}</div></div>
            <div className="p-3 rounded-xl bg-sky-50 border border-sky-200"><div className="text-[10px] text-sky-700">{tr('تحت التسوية', 'Under settlement')}</div><div className="font-black text-sky-800">{formatSAR(underSettlementAmount)}</div></div>
            <div className="p-3 rounded-xl bg-purple-50 border border-purple-200"><div className="text-[10px] text-purple-700">{tr('مسوى/ملغى بمستند', 'Settled / documented cancellation')}</div><div className="font-black text-purple-800">{formatSAR(settledAmount + cancelledByDocumentAmount)}</div></div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200"><div className="text-[10px] text-amber-700">{tr('غير محوّل', 'Unpaid')}</div><div className="font-black text-amber-800">{formatSAR(unpaidAmount)}</div></div>
            <div className="p-3 rounded-xl bg-white border border-slate-200"><div className="text-[10px] text-slate-500">{tr('متاح لدفعة جديدة', 'Available for new batch')}</div><div className="font-black text-slate-900">{formatSAR(remainingToSchedule)}</div></div>
          </div>

          {paymentBatches.length > 0 && (
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-50 text-slate-600"><tr>
                  <th className="p-3">{tr('رقم الدفعة', 'Batch number')}</th><th className="p-3">{tr('الموظفون', 'Employees')}</th><th className="p-3">{tr('المبلغ', 'Amount')}</th><th className="p-3">{tr('الطريقة والتاريخ', 'Method & date')}</th><th className="p-3">{tr('الحالة', 'Status')}</th><th className="p-3 text-center">{tr('الإجراءات', 'Actions')}</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {[...paymentBatches].reverse().map(batch => (
                    <tr key={batch.id} className="hover:bg-slate-50/70">
                      <td className="p-3"><div className="font-black font-mono text-slate-900">{batch.batchNumber}</div><div className="text-[10px] text-slate-400">{batch.reference}</div></td>
                      <td className="p-3 font-bold">{batch.employeesCount} {tr('موظف', 'employees')}</td>
                      <td className="p-3 font-black text-emerald-800">{formatSAR(batch.totalAmount)}</td>
                      <td className="p-3"><div className="font-semibold">{PAYMENT_METHOD_LABELS[batch.method][language]}</div><div className="text-[10px] text-slate-400">{batch.paymentDate || batch.scheduledDate}</div></td>
                      <td className="p-3"><span className={`px-2 py-1 rounded-lg border text-[10px] font-bold ${PAYMENT_STATUS_CONFIG[batch.status].classes}`}>{language === 'ar' ? PAYMENT_STATUS_CONFIG[batch.status].labelAr : PAYMENT_STATUS_CONFIG[batch.status].labelEn}</span></td>
                      <td className="p-3"><div className="flex flex-wrap justify-center gap-1.5">
                        <button type="button" onClick={() => exportWpsBankCsv(currentRun, company, batch.employeeIds, batch.reference || batch.batchNumber)} className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold">WPS</button>
                        {['SCHEDULED', 'PAID'].includes(batch.status) && (
                          <button type="button" onClick={() => exportBankPayrollXlsx(currentRun, company, batch, employees)} className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">{tr('ملف البنك Excel', 'Bank Excel')}</button>
                        )}
                        {batch.status === 'SCHEDULED' && <>
                          <button type="button" disabled={!hasPermission({ role: activeRole, permissions } as any, 'CONFIRM_PAYROLL_PAYMENT')} onClick={() => handlePaymentBatchStatus(batch.id, 'PAID')} className="px-2 py-1 rounded-lg bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold">{tr('تم التحويل', 'Mark paid')}</button>
                          <button type="button" onClick={() => handlePaymentBatchStatus(batch.id, 'FAILED')} className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold">{tr('فشل', 'Failed')}</button>
                          <button type="button" onClick={() => handlePaymentBatchStatus(batch.id, 'CANCELLED')} className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 font-bold">{tr('إلغاء', 'Cancel')}</button>
                        </>}
                        {batch.status === 'PAID' && (<>
                          <button type="button" onClick={() => exportQoyodJournalCsv(generatePaymentJournalBatch(company, currentRun, batch), company)} className="px-2 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 font-bold">{tr('قيد السداد', 'Payment journal')}</button>
                          {hasPermission({ role: activeRole, permissions } as any, 'REVERSE_PAYROLL_PAYMENT') && <button type="button" onClick={() => handleReversePayment(batch.id)} className="px-2 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 font-bold">{tr('إلغاء إثبات الدفع', 'Reverse payment')}</button>}
                        </>)}
                        {['FAILED', 'CANCELLED'].includes(batch.status) && <span className="text-[10px] text-slate-400 self-center">{tr('الموظفون متاحون لدفعة جديدة', 'Employees are available for a new batch')}</span>}
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!['APPROVED', 'POSTED'].includes(currentRun.status) && (
            <div className="px-4 py-3 border-t border-amber-200 bg-amber-50 text-xs text-amber-800 font-semibold">{tr('يجب اعتماد المسير أولًا قبل إنشاء دفعات التحويل.', 'Payroll must be approved before creating payment batches.')}</div>
          )}
          {currentRun.status === 'POSTED' && <div className="px-4 py-3 border-t border-blue-200 bg-blue-50 text-xs text-blue-800 font-semibold">{tr('يمكن إنشاء دفعة متأخرة للرواتب التي أُعيدت إلى «مستحق للدفع»، وستظل الدفعة مرتبطة بمسير', 'A late batch can be created for salaries returned to Payable; it remains linked to payroll')} {currentRun.periodMonth}.</div>}
        </div>
      )}

      {/* Filter and Search Bar for Table */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[240px] max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              placeholder={tr('بحث بالاسم، الرقم الوظيفي، الآيبان...', 'Search by name, employee number, or IBAN...')}
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
            <option value="ALL">{tr('جميع الأقسام', 'All departments')}</option>
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
            <span>{tr('عرض التنبيهات فقط', 'Warnings only')} ({totalWarnings})</span>
          </button>
        </div>
      </div>

      <PayrollRunItemsTable
        currentRun={currentRun}
        filteredItems={filteredItems}
        eligibleFilteredItems={eligibleFilteredItems}
        selectedPaymentEmployeeIds={selectedPaymentEmployeeIds}
        employees={employees}
        committedEmployeeIds={committedEmployeeIds}
        language={language}
        onToggleAllEligible={toggleAllEligibleEmployees}
        onTogglePaymentEmployee={togglePaymentEmployee}
        getEmployeePaymentBatch={getEmployeePaymentBatch}
        onEntitlementStatusChange={handleEntitlementStatusChange}
        onOpenAdjustment={openAdjustmentModal}
        onViewEmployeeStatement={onViewEmployeeStatement}
        tr={tr}
      />

      {isPaymentBatchModalOpen && currentRun && (
        <PayrollPaymentBatchModal
          form={paymentBatchForm}
          selectedCount={selectedPaymentItems.length}
          total={selectedPaymentTotal}
          onChange={setPaymentBatchForm}
          onClose={() => setIsPaymentBatchModalOpen(false)}
          onSubmit={handleCreatePaymentBatch}
          tr={tr}
        />
      )}

      {adjustmentItem && currentRun && (
        <div className="fixed inset-0 z-[110] bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div data-no-translate className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div><h3 className="font-black">{tr('تعديل إضافات وخصومات المسير', 'Edit Payroll Additions & Deductions')}</h3><p className="text-xs text-slate-400 mt-1">{adjustmentItem.employeeName} • {adjustmentItem.employeeNo}</p></div>
              <button type="button" onClick={() => setAdjustmentItem(null)} className="p-1.5 hover:bg-white/10 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="block font-bold text-emerald-800 mb-1">{tr('إضافة على الراتب', 'Salary addition')}</label><input type="number" min="0" step="0.01" value={adjustmentForm.addition} onChange={event => setAdjustmentForm({ ...adjustmentForm, addition: Math.max(0, Number(event.target.value) || 0) })} className="w-full px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl font-mono" /></div>
                <div><label className="block font-bold text-rose-800 mb-1">{tr('خصم إضافي', 'Additional deduction')}</label><input type="number" min="0" step="0.01" value={adjustmentForm.deduction} onChange={event => setAdjustmentForm({ ...adjustmentForm, deduction: Math.max(0, Number(event.target.value) || 0) })} className="w-full px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-xl font-mono" /></div>
              </div>
              <div><label className="block font-bold text-slate-700 mb-1">{tr('سبب التعديل / المرجع', 'Adjustment reason / reference')}</label><textarea rows={3} value={adjustmentForm.notes} onChange={event => setAdjustmentForm({ ...adjustmentForm, notes: event.target.value })} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl resize-none" placeholder={tr('مثال: مكافأة أداء أو خصم عهدة بموافقة الإدارة', 'Example: performance bonus or approved custody deduction')} /></div>
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-blue-900">{tr('سيُعاد احتساب إجمالي المستحق والخصومات والصافي وإجماليات المسير تلقائيًا.', 'Gross pay, deductions, net pay and payroll totals will be recalculated automatically.')}</div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2"><button type="button" onClick={() => setAdjustmentItem(null)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold">{tr('إلغاء', 'Cancel')}</button><button type="button" onClick={savePayrollAdjustment} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black">{tr('حفظ وإعادة الاحتساب', 'Save and recalculate')}</button></div>
          </div>
        </div>
      )}

    </div>
  );
};
