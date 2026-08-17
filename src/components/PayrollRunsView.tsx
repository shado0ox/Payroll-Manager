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
  Zap
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
  UserRole 
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
import { generatePayrollJournalBatch } from '../utils/accountingEngine';

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

  // Execute full payroll calculation engine
  const handleRecalculate = () => {
    setIsCalculating(true);
    const startTime = performance.now();

    setTimeout(() => {
      const runItems: PayrollRunItem[] = companyEmployees.map(emp => {
        const empAtt = attendance.filter(a => a.employeeId === emp.id && a.periodMonth === selectedPeriod);
        const empLoans = loans.filter(l => l.employeeId === emp.id);
        const empPens = penalties.filter(p => p.employeeId === emp.id && p.periodMonth === selectedPeriod);

        return calculateEmployeePayrollItem({
          employee: emp,
          company,
          periodMonth: selectedPeriod,
          attendanceRecords: empAtt,
          activeLoans: empLoans,
          penalties: empPens,
        });
      });

      const totalBaseSalaries = roundAmount(runItems.reduce((s, i) => s + i.baseSalary, 0));
      const totalAllowances = roundAmount(runItems.reduce((s, i) => s + i.housingAllowance + i.transportAllowance + i.otherAllowances, 0));
      const totalOvertime = roundAmount(runItems.reduce((s, i) => s + i.overtimeAmount, 0));
      const totalGrossSalaries = roundAmount(runItems.reduce((s, i) => s + i.totalGrossSalary, 0));
      const totalAbsenceDeductions = roundAmount(runItems.reduce((s, i) => s + i.absenceDeduction + i.unpaidLeaveDeduction, 0));
      const totalDelayDeductions = roundAmount(runItems.reduce((s, i) => s + i.delayDeduction, 0));
      const totalGosiEmployee = roundAmount(runItems.reduce((s, i) => s + i.gosiEmployeeShare, 0));
      const totalGosiEmployer = roundAmount(runItems.reduce((s, i) => s + i.gosiEmployerShare, 0));
      const totalLoanDeductions = roundAmount(runItems.reduce((s, i) => s + i.loanDeduction, 0));
      const totalPenalties = roundAmount(runItems.reduce((s, i) => s + i.penaltiesDeduction + i.otherDeductions, 0));
      const totalDeductions = roundAmount(runItems.reduce((s, i) => s + i.totalDeductions, 0));
      const totalNetSalaries = roundAmount(runItems.reduce((s, i) => s + i.netSalary, 0));
      const totalCompanyCost = roundAmount(runItems.reduce((s, i) => s + i.totalCompanyBurden, 0));

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
        journalBatchId: `batch-${runId}`
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
    const updated: PayrollRun = {
      ...currentRun,
      status: newStatus,
      approvedAt: newStatus === 'APPROVED' ? new Date().toISOString() : currentRun.approvedAt,
      approvedBy: newStatus === 'APPROVED' ? 'سلطان القحطاني (مدير HR)' : currentRun.approvedBy,
      postedAt: newStatus === 'POSTED' ? new Date().toISOString() : currentRun.postedAt,
      postedBy: newStatus === 'POSTED' ? 'عبدالله الغامدي (المدير المالي)' : currentRun.postedBy,
    };
    onSavePayrollRun(updated);
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
              onChange={(e) => setSelectedPeriod(e.target.value)}
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
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>اعتماد مدير الموارد البشرية (HR Approval)</span>
              </button>
            )}

            {currentRun.status === 'APPROVED' && (
              <button
                onClick={() => handleStatusChange('POSTED')}
                className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>ترحيل القيد وإقفال الفترة نهائياً</span>
              </button>
            )}

            {currentRun.status === 'POSTED' && (
              <div className="flex items-center gap-2 text-xs font-bold text-purple-800 bg-purple-50 px-3 py-1.5 rounded-xl border border-purple-200">
                <CheckCircle2 className="w-4 h-4 text-purple-600" />
                <span>تم إقفال وترحيل مسير هذا الشهر بنجاح</span>
              </div>
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
              <th className="py-2.5 px-2 w-[15%] text-right font-bold">الموظف والرقم</th>
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
              filteredItems.map((item) => {
                const emp = employees.find(e => e.id === item.employeeId);
                const hasWarning = item.warningFlags.length > 0;

                return (
                  <tr 
                    key={item.id} 
                    className={`hover:bg-slate-50 transition-colors text-[11px] ${
                      item.isSuspended ? 'bg-amber-50/40' : (hasWarning ? 'bg-amber-50/20' : '')
                    }`}
                  >
                    {/* Name & Flags */}
                    <td className="py-2.5 px-2 truncate">
                      <div className="font-bold text-slate-900 flex items-center gap-1 truncate">
                        <span className="truncate">{item.employeeName}</span>
                        {item.nationality === 'SAUDI' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="سعودي (GOSI)" />
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {item.employeeNo}
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

    </div>
  );
};
