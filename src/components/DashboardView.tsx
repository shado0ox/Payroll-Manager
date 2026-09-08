import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { 
  DollarSign, 
  Users, 
  ShieldCheck, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Layers, 
  Clock, 
  Building2,
  Calendar,
  Zap,
  ArrowRight,
  ArrowLeft,
  FileText,
  Target,
  ChevronDown
} from 'lucide-react';
import { Company, Employee, PayrollRun, LoanSchedule, UserRole, NavigationTab } from '../types';
import { formatSAR, formatNumber } from '../utils/payrollEngine';
import { useLanguage } from '../i18n/LanguageContext';
import { getEmployeeLifecycleAlerts } from '../utils/employeeLifecycle';
import { getCurrentPeriod } from '../utils/period';

interface DashboardViewProps {
  company: Company;
  employees: Employee[];
  payrollRuns: PayrollRun[];
  loans?: LoanSchedule[];
  activeRole: UserRole;
  onNavigate: (tab: NavigationTab) => void;
  onViewEmployeeStatement?: (emp: Employee, periodMonth: string) => void;
}

const DashboardPayrollCharts = lazy(() => import('./dashboard/DashboardPayrollCharts').then(module => ({ default:module.DashboardPayrollCharts })));

export const DashboardView: React.FC<DashboardViewProps> = ({
  company,
  employees,
  payrollRuns,
  loans = [],
  activeRole,
  onNavigate,
  onViewEmployeeStatement,
}) => {
  const { language } = useLanguage();
  const tr = (ar: string, en: string) => language === 'ar' ? ar : en;
  const [chartsReady,setChartsReady] = useState(false);
  const companyEmployees = useMemo(() => employees.filter(employee => employee.companyId === company.id), [employees,company.id]);
  const payrollReadiness = useMemo(() => {
    const activeEmployees = companyEmployees.filter(employee => employee.employmentStatus === 'ACTIVE');
    if (!activeEmployees.length) return 0;
    const ready = activeEmployees.filter(employee =>
      Number(employee.baseSalary) > 0 &&
      Boolean(employee.bankName) &&
      /^SA\d{22}$/.test((employee.bankIban || '').replace(/\s/g, ''))
    ).length;
    return Math.round((ready / activeEmployees.length) * 100);
  }, [companyEmployees]);

  useEffect(() => {
    const timer = window.setTimeout(() => setChartsReady(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // The dashboard represents the month currently in progress for the company.
  const currentPeriod = getCurrentPeriod(company.timezone || 'Asia/Riyadh');
  const companyPayrollRuns = useMemo(() => payrollRuns
    .filter(run => run.companyId === company.id)
    .sort((a,b) => b.periodMonth.localeCompare(a.periodMonth)), [payrollRuns,company.id]);
  const currentRun = companyPayrollRuns.find(run => run.periodMonth === currentPeriod);
  const lifecycleAlerts = useMemo(() => getEmployeeLifecycleAlerts(companyEmployees), [companyEmployees]);
  const alertCounts = useMemo(() => ({
    iqama:lifecycleAlerts.filter(alert => alert.type === 'IQAMA_EXPIRY').length,
    contract:lifecycleAlerts.filter(alert => alert.type === 'SAUDI_CONTRACT_EXPIRY').length,
    arrival:lifecycleAlerts.filter(alert => alert.type === 'NEW_HIRE_ENTRY_DEADLINE').length,
    missingBank:lifecycleAlerts.filter(alert => alert.type === 'MISSING_BANK_ACCOUNT').length,
  }), [lifecycleAlerts]);
  const topLifecycleAlerts = useMemo(() => lifecycleAlerts
    .slice()
    .sort((a, b) => {
      const rank = { EXPIRED: 0, URGENT: 1, WARNING: 2, INFO: 3 } as const;
      const severityDiff = rank[a.severity] - rank[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return String(a.dueDate || '9999-12-31').localeCompare(String(b.dueDate || '9999-12-31'));
    })
    .slice(0, 8), [lifecycleAlerts]);
  const onboardingEmployees = useMemo(() => companyEmployees
    .filter(employee => employee.status === 'ONBOARDING' || employee.onboardingStatus === 'NEW_ARRIVAL' || employee.onboardingStatus === 'WAITING_IQAMA' || employee.onboardingStatus === 'WAITING_BANK')
    .sort((a, b) => String(b.entryDate || b.hireDate || '').localeCompare(String(a.entryDate || a.hireDate || '')))
    .slice(0, 4), [companyEmployees]);

  // Monthly Budget Metrics
  const totalEmployeesCount = companyEmployees.length;
  const calculatedGross = useMemo(() => companyEmployees.reduce((acc, e) => {
    const pkg = e.salaryPackage || {};
    return acc + (pkg.baseSalary || e.basicSalary || 0) + (pkg.housingAllowance || e.housingAllowance || 0) + (pkg.transportAllowance || e.transportationAllowance || 0) + (pkg.otherFixedAllowances || e.otherAllowances || 0) + (pkg.nonGosiOtherAllowances || 0);
  }, 0), [companyEmployees]);
  
  const totalGross = currentRun ? currentRun.totalGrossSalaries : calculatedGross;
  const totalDeductions = currentRun ? currentRun.totalDeductions : 0;
  const totalNet = currentRun ? currentRun.totalNetSalaries : (totalGross - totalDeductions);

  // Monthly Budget calculations
  const monthlyAllocatedBudget = Math.max(0, Number(company.monthlyBudgetCap) || 0);
  const rawBudgetUtilizationPercent = monthlyAllocatedBudget > 0 ? Math.round((totalGross / monthlyAllocatedBudget) * 100) : 0;
  const budgetUtilizationPercent = Math.min(100, rawBudgetUtilizationPercent);
  const remainingBudget = monthlyAllocatedBudget - totalGross;
  const budgetPeriod = currentPeriod;
  const budgetPeriodLabel = new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-US', { month: 'long', year: 'numeric' })
    .format(new Date(`${budgetPeriod}-01T12:00:00`));
  const budgetIsConfigured = monthlyAllocatedBudget > 0;
  const budgetIsExceeded = budgetIsConfigured && totalGross > monthlyAllocatedBudget;

  // Sample items for table display
  const tableItems = useMemo(() => {
    if (currentRun && currentRun.items.length > 0) {
      return currentRun.items.slice(0, 6);
    }
    return companyEmployees.slice(0, 6).map(emp => {
      const basic = emp.salaryPackage?.baseSalary || emp.basicSalary || 0;
      const allw = (emp.salaryPackage?.housingAllowance || emp.housingAllowance || 0) + 
                   (emp.salaryPackage?.transportAllowance || emp.transportationAllowance || 0) + 
                   (emp.salaryPackage?.otherFixedAllowances || emp.otherAllowances || 0) +
                   (emp.salaryPackage?.nonGosiOtherAllowances || 0);
      const deductions = emp.nationality === 'SAUDI' && emp.saudiGosiPaymentMode !== 'COMPANY_FULL' ? Math.round(basic * 0.0975) : 0;
      return {
        employeeId: emp.id,
        employeeNo: emp.employeeNo,
        employeeNameAr: `${emp.firstNameAr} ${emp.lastNameAr}`,
        basicSalary: basic,
        allowances: allw,
        deductions: deductions,
        netSalary: basic + allw - deductions,
        status: 'ACTIVE' as const
      };
    });
  }, [currentRun, companyEmployees]);

  return (
    <div className="space-y-5 pb-8">
      
      {(
        <section data-dashboard-hr-focus className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-sm font-black text-slate-900">{tr('متابعة الموارد البشرية', 'HR attention')}</h3>
              <p className="mt-0.5 text-[11px] text-slate-500">{tr('ملخص تنفيذي ثابت للحالات التي تحتاج استكمال أو متابعة، حتى عندما تكون الأعداد صفرًا', 'A persistent executive summary for records needing completion or follow-up, including zero-state visibility')}</p>
            </div>
            <button type="button" onClick={() => onNavigate('employees')} className="rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50">{tr('فتح الموظفين', 'Open employees')}</button>
          </div>

          <div className="grid gap-0 lg:grid-cols-[auto_1fr]">
            <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-4 sm:grid-cols-4 lg:w-[430px] lg:grid-cols-2 lg:border-b-0 lg:border-e">
              {[
                { value: alertCounts.iqama, ar: 'إقامات', en: 'Iqamas' },
                { value: alertCounts.contract, ar: 'عقود سعوديين', en: 'Saudi contracts' },
                { value: alertCounts.arrival, ar: 'قادمون جدد', en: 'New arrivals' },
                { value: alertCounts.missingBank, ar: 'بدون IBAN', en: 'Missing IBAN' },
              ].map(card => (
                <button key={card.en} type="button" onClick={() => onNavigate('employees')} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-start transition hover:border-amber-200 hover:bg-amber-50/40">
                  <span className="text-[11px] font-semibold text-slate-600">{tr(card.ar, card.en)}</span>
                  <span className={`min-w-7 rounded-lg px-2 py-1 text-center text-xs font-black ${card.value > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{formatNumber(card.value)}</span>
                </button>
              ))}
            </div>

            <div className="grid min-w-0 md:grid-cols-2">
              <div className="min-w-0 p-4 md:border-e">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-black text-slate-700">{tr('الأكثر إلحاحًا', 'Highest priority')}</span>
                  <span className="text-[10px] text-slate-400">{Math.min(topLifecycleAlerts.length, 4)}</span>
                </div>
                <div className="space-y-1.5">
                  {topLifecycleAlerts.slice(0, 4).map(alert => {
                    const emp = companyEmployees.find(employee => employee.id === alert.employeeId);
                    const label = alert.type === 'IQAMA_EXPIRY' ? tr('إقامة', 'Iqama') : alert.type === 'SAUDI_CONTRACT_EXPIRY' ? tr('عقد', 'Contract') : alert.type === 'NEW_HIRE_ENTRY_DEADLINE' ? tr('مهلة دخول', 'Entry deadline') : tr('IBAN', 'IBAN');
                    return (
                      <button key={alert.type + '-' + alert.employeeId + '-' + (alert.dueDate || 'none')} type="button" onClick={() => emp && onViewEmployeeStatement ? onViewEmployeeStatement(emp, currentPeriod) : onNavigate('employees')} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-start hover:bg-slate-50">
                        <span className="min-w-0 truncate text-[11px] font-semibold text-slate-700">{emp ? (emp.firstNameAr + ' ' + emp.lastNameAr) : alert.employeeName}</span>
                        <span className="shrink-0 text-[10px] font-bold text-amber-700">{label}{typeof alert.daysRemaining === 'number' ? ' · ' + alert.daysRemaining : ''}</span>
                      </button>
                    );
                  })}
                  {topLifecycleAlerts.length === 0 && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">{tr('لا توجد تنبيهات عاجلة', 'No urgent alerts')}</div>}
                </div>
              </div>

              <div className="min-w-0 border-t border-slate-100 p-4 md:border-t-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-black text-slate-700">{tr('موظفون تحت الاستكمال', 'Onboarding')}</span>
                  <span className="text-[10px] text-slate-400">{onboardingEmployees.length}</span>
                </div>
                <div className="space-y-1.5">
                  {onboardingEmployees.map(emp => {
                    const state = emp.onboardingStatus === 'WAITING_IQAMA' || emp.onboardingStatus === 'NEW_ARRIVAL' ? tr('بانتظار الإقامة', 'Waiting for iqama') : emp.onboardingStatus === 'WAITING_BANK' ? tr('بانتظار IBAN', 'Waiting for IBAN') : tr('تحت الاستكمال', 'In progress');
                    return (
                      <button key={emp.id} type="button" onClick={() => onViewEmployeeStatement ? onViewEmployeeStatement(emp, currentPeriod) : onNavigate('employees')} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-start hover:bg-slate-50">
                        <span className="min-w-0 truncate text-[11px] font-semibold text-slate-700">{emp.firstNameAr + ' ' + emp.lastNameAr}</span>
                        <span className="shrink-0 text-[10px] font-bold text-sky-700">{state}</span>
                      </button>
                    );
                  })}
                  {onboardingEmployees.length === 0 && <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">{tr('لا توجد ملفات جديدة تحت الاستكمال', 'No onboarding records pending')}</div>}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 1. Top 4 KPI Cards - Professional Polish */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Employees */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
          <p className="text-slate-500 text-sm font-medium">{tr('إجمالي الموظفين', 'Total Employees')}</p>
          <h3 className="text-3xl font-bold text-slate-800 mt-1 tracking-tight">
            {formatNumber(totalEmployeesCount)}
          </h3>
          <p className="text-xs text-slate-400 mt-2 font-medium">
            {totalEmployeesCount > 0 ? `${totalEmployeesCount} ${tr('موظف مسجل بالمنشأة', 'employees registered')}` : tr('لا يوجد موظفون مضافون بعد', 'No employees have been added.')}
          </p>
        </div>

        {/* Total Gross / Entitlements */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
          <p className="text-slate-500 text-sm font-medium">{tr('إجمالي المستحقات', 'Gross Earnings')} (SR)</p>
          <h3 className="text-3xl font-bold text-slate-800 mt-1 tracking-tight">
            {formatNumber(totalGross)}
          </h3>
          <p className="text-xs text-slate-400 mt-2">
            {tr('شامل البدلات الثابتة', 'Includes fixed allowances')}
          </p>
        </div>

        {/* Deductions & Absences */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
          <p className="text-slate-500 text-sm font-medium">{tr('الاستقطاعات والغياب', 'Deductions & Absence')}</p>
          <h3 className="text-3xl font-bold text-rose-600 mt-1 tracking-tight">
            {formatNumber(totalDeductions)}
          </h3>
          <p className="text-xs text-rose-500 mt-2 font-medium">
            {tr('تشمل تأمينات ومخالفات', 'Includes GOSI and penalties')}
          </p>
        </div>

        {/* Net Salaries */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
          <p className="text-slate-500 text-sm font-medium">{tr('صافي الرواتب', 'Net Payroll')}</p>
          <h3 className="text-3xl font-bold text-emerald-600 mt-1 tracking-tight">
            {formatNumber(totalNet)}
          </h3>
          <p className="text-xs text-slate-400 mt-2">
            {tr('جاهز للتحويل البنكي', 'Ready for bank transfer')}
          </p>
        </div>

      </section>

      {/* Load charting code only after the dashboard summary has painted. */}
      {chartsReady ? (
        <Suspense fallback={<div className="h-[370px] animate-pulse rounded-xl border border-slate-200 bg-slate-100" aria-label={tr('جاري تحميل الرسوم', 'Loading charts')} />}>
          <DashboardPayrollCharts employees={companyEmployees} totalGross={totalGross} />
        </Suspense>
      ) : (
        <div className="h-[370px] animate-pulse rounded-xl border border-slate-200 bg-slate-100" aria-hidden="true" />
      )}

      {/* 3. Monthly Payroll Budget Visual Gauge & Indicators */}
      <section data-no-translate className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-200/60">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-base">{tr('مؤشر ميزانية الرواتب الشهرية', 'Monthly Payroll Budget')}</h4>
              <p className="text-xs text-slate-400">
                {tr('مقارنة ميزانية المنشأة مع', 'Company budget compared with')} {currentRun ? tr('المسير الفعلي لفترة', 'actual payroll for') : tr('الرواتب الثابتة التقديرية لفترة', 'estimated fixed payroll for')} {budgetPeriodLabel}
              </p>
            </div>
          </div>

          {/* Status Badge */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${!budgetIsConfigured ? 'bg-amber-50 border-amber-200 text-amber-800' : budgetIsExceeded ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
            {budgetIsConfigured && !budgetIsExceeded ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className={`w-4 h-4 ${budgetIsExceeded ? 'text-rose-600' : 'text-amber-600'}`} />}
            <span>
              {!budgetIsConfigured
                ? tr('الميزانية غير محددة في ملف المنشأة', 'Budget is not configured in Company Profile')
                : budgetIsExceeded
                  ? `${tr('تجاوز الميزانية', 'Budget exceeded')} (${rawBudgetUtilizationPercent}%)`
                  : `${tr('ضمن الميزانية المحددة', 'Within the configured budget')} (${rawBudgetUtilizationPercent}%)`}
            </span>
          </div>
        </div>

        {/* Progress Bar Gauge */}
        <div className="space-y-2 mb-6">
          <div className="flex justify-between items-center text-xs font-semibold">
            <span className="text-slate-700">{currentRun ? tr('مصروف المسير الفعلي', 'Actual payroll spending') : tr('الرواتب الثابتة التقديرية', 'Estimated fixed payroll')}: <strong className={budgetIsExceeded ? 'text-rose-600' : 'text-emerald-600'}>{formatSAR(totalGross)}</strong></span>
            <span className="text-slate-500">{tr('الميزانية المحددة في ملف المنشأة', 'Budget configured in Company Profile')}: <strong className="text-slate-800">{budgetIsConfigured ? formatSAR(monthlyAllocatedBudget) : '—'}</strong></span>
          </div>
          
          <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden p-0.5 border border-slate-200 flex">
            <div 
              className={`${budgetIsExceeded ? 'bg-gradient-to-l from-rose-500 to-red-600' : 'bg-gradient-to-l from-emerald-500 to-teal-600'} h-full rounded-full transition-all duration-700 shadow-xs relative`}
              style={{ width: `${budgetUtilizationPercent}%` }}
            >
              <span className="absolute right-2 top-0 bottom-0 flex items-center text-[10px] font-bold text-white">
                {budgetIsConfigured ? `${rawBudgetUtilizationPercent}%` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* 3 Metric Cards for Budget Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <p className="text-xs text-slate-500 font-medium">{tr('الميزانية الشهرية المتوقعة', 'Expected monthly budget')}</p>
            <p className="text-lg font-bold text-slate-800 mt-1">{budgetIsConfigured ? formatSAR(monthlyAllocatedBudget) : '—'}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{tr('قابلة للتعديل من ملف المنشأة', 'Editable from Company Profile')}</p>
          </div>

          <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-200/80">
            <p className="text-xs text-emerald-800 font-medium">{currentRun ? tr('إنفاق المسير الفعلي', 'Actual payroll spending') : tr('إجمالي الرواتب التقديري', 'Estimated payroll total')}</p>
            <p className="text-lg font-bold text-emerald-700 mt-1">{formatSAR(totalGross)}</p>
            <p className="text-[11px] text-emerald-600 font-medium mt-0.5">{budgetIsConfigured ? `${tr('يمثل', 'Represents')} ${rawBudgetUtilizationPercent}% ${tr('من الميزانية', 'of budget')}` : tr('حدد الميزانية لإظهار النسبة', 'Configure a budget to show utilization')}</p>
          </div>

          <div className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-200/80">
            <p className="text-xs text-blue-800 font-medium">{remainingBudget < 0 ? tr('تجاوز الميزانية', 'Budget overrun') : tr('المتبقي من الميزانية', 'Remaining budget')}</p>
            <p className={`text-lg font-bold mt-1 ${remainingBudget < 0 ? 'text-rose-700' : 'text-blue-700'}`}>{budgetIsConfigured ? formatSAR(Math.abs(remainingBudget)) : '—'}</p>
            <p className={`text-[11px] font-medium mt-0.5 ${remainingBudget < 0 ? 'text-rose-600' : 'text-blue-600'}`}>{budgetIsConfigured ? (remainingBudget < 0 ? tr('مبلغ التجاوز فوق السقف المحدد', 'Amount above the configured limit') : tr('المبلغ المتاح ضمن ميزانية الفترة', 'Available amount within the period budget')) : tr('لا توجد ميزانية محددة بعد', 'No budget configured yet')}</p>
          </div>
        </div>
      </section>

      {/* 4. Main Content Layout: Table (2/3) + Side Cards (1/3) */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Left 2 Cols: Payroll Status Table */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white">
            <div>
              <h4 className="font-bold text-slate-700 text-base">{tr('حالة تشغيل الرواتب الجارية', 'Current Payroll Status')}</h4>
              <p className="text-xs text-slate-400 mt-0.5">{tr('فترة الشهر', 'Period')}: {budgetPeriodLabel}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onNavigate('payroll_runs')}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
              >
                <span>{tr('فتح المسير الكامل', 'Open full payroll')}</span>
                <ArrowLeft className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                  <th className="p-4 font-semibold">{tr('الموظف', 'Employee')}</th>
                  <th className="p-4 font-semibold">{tr('الراتب الأساسي', 'Basic Salary')}</th>
                  <th className="p-4 font-semibold">{tr('بدلات', 'Allowances')}</th>
                  <th className="p-4 font-semibold">{tr('خصومات', 'Deductions')}</th>
                  <th className="p-4 font-semibold">{tr('الصافي', 'Net')}</th>
                  <th className="p-4 font-semibold text-center">{tr('الحالة', 'Status')}</th>
                  <th className="p-4 font-semibold text-center">{tr('الإجراء', 'Action')}</th>
                </tr>
              </thead>
              <tbody className="text-sm text-slate-600 divide-y divide-slate-100">
                {tableItems.map((item, idx) => {
                  const emp = employees.find(e => e.id === item.employeeId);
                  const isApproved = item.status === 'APPROVED' || item.status === 'POSTED';
                  const isUnderReview = item.status === 'UNDER_REVIEW';

                  return (
                    <tr key={`${item.employeeId || 'row'}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 font-medium text-slate-800">
                        <div>{item.employeeNameAr}</div>
                        <span className="text-[10px] text-slate-400">
                          {tr('رقم وظيفي:', 'Employee No.:')} {item.employeeNo}
                        </span>
                      </td>
                      <td className="p-4 font-medium text-slate-700">
                        {formatNumber(item.basicSalary)}
                      </td>
                      <td className="p-4 font-medium text-emerald-600">
                        {formatNumber(item.allowances || (item.totalAllowances || 0))}
                      </td>
                      <td className="p-4 font-medium text-rose-500">
                        {formatNumber(item.deductions || (item.totalDeductions || 0))}
                      </td>
                      <td className="p-4 font-bold text-slate-900">
                        {formatNumber(item.netSalary)}
                      </td>
                      <td className="p-4 text-center">
                        {isApproved ? (
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold">
                            {tr('معتمد', 'Approved')}
                          </span>
                        ) : isUnderReview ? (
                          <span className="px-2.5 py-1 bg-yellow-100 text-yellow-700 rounded-full text-[10px] font-bold">
                            {tr('قيد المراجعة', 'Under Review')}
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold">
                            {tr('مسودة', 'Draft')}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {emp && onViewEmployeeStatement ? (
                          <button
                            onClick={() => onViewEmployeeStatement(emp, currentPeriod)}
                            title={tr('معاينة قسيمة الراتب', 'View Payslip')}
                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Col: Payroll data readiness */}
        <div className="space-y-6">
          {/* Compliance Card */}
          <div className="bg-[#1e293b] p-6 rounded-xl text-white shadow-lg relative overflow-hidden">
            <div className="relative z-10">
              <h4 className="font-bold text-base mb-1 text-white">{tr('جاهزية بيانات الرواتب', 'Payroll Data Readiness')}</h4>
              <p className="text-xs text-slate-400 mb-4">{tr('نسبة الموظفين النشطين المكتملة رواتبهم وبياناتهم البنكية', 'Active employees with complete salary and bank details')}</p>
              
              <div className="w-full bg-slate-700/80 h-2.5 rounded-full mb-3 overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${payrollReadiness}%` }} />
              </div>
              
              <div className="flex justify-between text-xs font-medium">
                <span className="text-emerald-400 font-bold">{payrollReadiness}% {tr('مكتمل', 'complete')}</span>
                <span className="text-slate-400">{100 - payrollReadiness}% {tr('يحتاج استكمال', 'incomplete')}</span>
              </div>
            </div>

            {/* Glowing Accent */}
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          </div>

        </div>

      </section>

    </div>
  );
};
