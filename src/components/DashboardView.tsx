import React, { useState, useMemo } from 'react';
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
  PieChart as PieChartIcon,
  BarChart3,
  Target,
  ChevronDown
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  CartesianGrid, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { Company, Employee, PayrollRun, LoanSchedule, UserRole, NavigationTab } from '../types';
import { formatSAR, formatNumber } from '../utils/payrollEngine';

interface DashboardViewProps {
  company: Company;
  employees: Employee[];
  payrollRuns: PayrollRun[];
  loans?: LoanSchedule[];
  activeRole: UserRole;
  onNavigate: (tab: NavigationTab) => void;
  onViewEmployeeStatement?: (emp: Employee) => void;
  onOpenQoyodModal: () => void;
}

const PIE_COLORS = ['#10b981', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ec4899'];

// Custom CustomTooltip for Recharts in Arabic RTL
const CustomBarTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-xl shadow-xl border border-slate-700/80 text-xs z-50 text-right min-w-[190px]">
        <p className="font-bold text-sm text-slate-100 mb-2 border-b border-slate-700 pb-1">{label}</p>
        <div className="space-y-1.5">
          {payload.map((entry: any, index: number) => (
            <div key={`item-${index}`} className="flex justify-between items-center gap-3">
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                <span>{entry.name}:</span>
              </span>
              <span className="font-semibold text-white">{formatNumber(entry.value)} ر.س</span>
            </div>
          ))}
          {payload.length > 1 && (
            <div className="pt-1.5 mt-1.5 border-t border-slate-700/80 flex justify-between font-bold text-emerald-400">
              <span>الإجمالي:</span>
              <span>
                {formatNumber(payload.reduce((sum: number, p: any) => sum + (Number(p.value) || 0), 0))} ر.س
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

const CustomPieTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div className="bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-xl shadow-xl border border-slate-700/80 text-xs z-50 text-right min-w-[170px]">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: data.payload.fill || data.color }} />
          <span className="font-bold text-slate-100">{data.name}</span>
        </div>
        <div className="flex justify-between text-slate-300">
          <span>المبلغ:</span>
          <span className="font-bold text-white">{formatNumber(data.value)} ر.س</span>
        </div>
        <div className="flex justify-between text-slate-300 mt-1">
          <span>النسبة:</span>
          <span className="font-bold text-emerald-400">{data.payload.percentage}%</span>
        </div>
      </div>
    );
  }
  return null;
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  company,
  employees,
  payrollRuns,
  loans = [],
  activeRole,
  onNavigate,
  onViewEmployeeStatement,
  onOpenQoyodModal,
}) => {
  const [chartViewMode, setChartViewMode] = useState<'total' | 'average'>('total');

  // Get current active or latest payroll run
  const latestRun = payrollRuns.find(r => r.companyId === company.id) || payrollRuns[0];
  const companyEmployees = employees.filter(e => e.companyId === company.id);

  // Department Salary Distribution Aggregation
  const departmentChartData = useMemo(() => {
    if (companyEmployees.length === 0) return [];
    const deptMap: Record<string, { basic: number; allowances: number; count: number; name: string }> = {};

    companyEmployees.forEach((emp) => {
      const deptName = emp.department || 'عام';
      if (!deptMap[deptName]) {
        deptMap[deptName] = { basic: 0, allowances: 0, count: 0, name: deptName };
      }
      const base = Number(emp.salaryPackage?.baseSalary || emp.basicSalary) || 0;
      const allw = (Number(emp.salaryPackage?.housingAllowance || emp.housingAllowance) || 0) + 
                   (Number(emp.salaryPackage?.transportAllowance || emp.transportationAllowance) || 0) + 
                   (Number(emp.salaryPackage?.otherAllowances || emp.otherAllowances) || 0);
      deptMap[deptName].basic += base;
      deptMap[deptName].allowances += allw;
      deptMap[deptName].count += 1;
    });

    return Object.values(deptMap).map(d => ({
      name: d.name,
      'الراتب الأساسي': chartViewMode === 'total' ? Math.round(d.basic) : Math.round(d.basic / Math.max(1, d.count)),
      'البدلات والمزايا': chartViewMode === 'total' ? Math.round(d.allowances) : Math.round(d.allowances / Math.max(1, d.count)),
      count: d.count,
    }));
  }, [companyEmployees, chartViewMode]);

  // Salary Structure / Allowances vs. Basic Salary Data
  const salaryStructureData = useMemo(() => {
    let totalBasic = 0;
    let totalHousing = 0;
    let totalTransport = 0;
    let totalOther = 0;

    companyEmployees.forEach(emp => {
      totalBasic += Number(emp.salaryPackage?.baseSalary || emp.basicSalary) || 0;
      totalHousing += Number(emp.salaryPackage?.housingAllowance || emp.housingAllowance) || 0;
      totalTransport += Number(emp.salaryPackage?.transportAllowance || emp.transportationAllowance) || 0;
      totalOther += Number(emp.salaryPackage?.otherAllowances || emp.otherAllowances) || 0;
    });

    const grandTotal = totalBasic + totalHousing + totalTransport + totalOther;

    if (grandTotal === 0) {
      return [
        { name: 'الراتب الأساسي', value: 0, percentage: '0.0', fill: '#10b981' },
        { name: 'بدل السكن', value: 0, percentage: '0.0', fill: '#0ea5e9' },
        { name: 'بدل النقل', value: 0, percentage: '0.0', fill: '#f59e0b' },
        { name: 'بدلات أخرى ومكافآت', value: 0, percentage: '0.0', fill: '#8b5cf6' },
      ];
    }

    return [
      { name: 'الراتب الأساسي', value: Math.round(totalBasic), percentage: ((totalBasic / grandTotal) * 100).toFixed(1), fill: '#10b981' },
      { name: 'بدل السكن', value: Math.round(totalHousing), percentage: ((totalHousing / grandTotal) * 100).toFixed(1), fill: '#0ea5e9' },
      { name: 'بدل النقل', value: Math.round(totalTransport), percentage: ((totalTransport / grandTotal) * 100).toFixed(1), fill: '#f59e0b' },
      { name: 'بدلات أخرى ومكافآت', value: Math.round(totalOther), percentage: ((totalOther / grandTotal) * 100).toFixed(1), fill: '#8b5cf6' },
    ];
  }, [companyEmployees]);

  // Monthly Budget Metrics
  const totalEmployeesCount = companyEmployees.length;
  const calculatedGross = companyEmployees.reduce((acc, e) => {
    const pkg = e.salaryPackage || {};
    return acc + (pkg.baseSalary || e.basicSalary || 0) + (pkg.housingAllowance || e.housingAllowance || 0) + (pkg.transportAllowance || e.transportationAllowance || 0) + (pkg.otherAllowances || e.otherAllowances || 0);
  }, 0);
  
  const totalGross = latestRun ? latestRun.totalGrossSalaries : calculatedGross;
  const totalDeductions = latestRun ? latestRun.totalDeductions : 0;
  const totalNet = latestRun ? latestRun.totalNetSalaries : (totalGross - totalDeductions);

  // Monthly Budget calculations
  const monthlyAllocatedBudget = company.monthlyBudgetCap || Math.max(100000, totalGross * 1.2);
  const budgetUtilizationPercent = monthlyAllocatedBudget > 0 ? Math.min(100, Math.round((totalGross / monthlyAllocatedBudget) * 100)) : 0;
  const remainingBudget = Math.max(0, monthlyAllocatedBudget - totalGross);

  // Sample items for table display
  const tableItems = useMemo(() => {
    if (latestRun && latestRun.items.length > 0) {
      return latestRun.items.slice(0, 6);
    }
    return companyEmployees.slice(0, 6).map(emp => {
      const basic = emp.salaryPackage?.baseSalary || emp.basicSalary || 0;
      const allw = (emp.salaryPackage?.housingAllowance || emp.housingAllowance || 0) + 
                   (emp.salaryPackage?.transportAllowance || emp.transportationAllowance || 0) + 
                   (emp.salaryPackage?.otherAllowances || emp.otherAllowances || 0);
      const deductions = emp.nationality === 'SAUDI' ? Math.round(basic * 0.0975) : 0;
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
  }, [latestRun, companyEmployees]);

  return (
    <div className="space-y-8 pb-10">
      
      {/* 1. Top 4 KPI Cards - Professional Polish */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Total Employees */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
          <p className="text-slate-500 text-sm font-medium">إجمالي الموظفين</p>
          <h3 className="text-3xl font-bold text-slate-800 mt-1 tracking-tight">
            {formatNumber(totalEmployeesCount)}
          </h3>
          <p className="text-xs text-slate-400 mt-2 font-medium">
            {totalEmployeesCount > 0 ? `${totalEmployeesCount} موظف مسجل بالمنشأة` : 'لا يوجد موظفون مضافون بعد'}
          </p>
        </div>

        {/* Total Gross / Entitlements */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
          <p className="text-slate-500 text-sm font-medium">إجمالي المستحقات (SAR)</p>
          <h3 className="text-3xl font-bold text-slate-800 mt-1 tracking-tight">
            {formatNumber(totalGross)}
          </h3>
          <p className="text-xs text-slate-400 mt-2">
            شامل البدلات الثابتة
          </p>
        </div>

        {/* Deductions & Absences */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
          <p className="text-slate-500 text-sm font-medium">الاستقطاعات والغياب</p>
          <h3 className="text-3xl font-bold text-rose-600 mt-1 tracking-tight">
            {formatNumber(totalDeductions)}
          </h3>
          <p className="text-xs text-rose-500 mt-2 font-medium">
            تشمل تأمينات ومخالفات
          </p>
        </div>

        {/* Net Salaries */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
          <p className="text-slate-500 text-sm font-medium">صافي الرواتب</p>
          <h3 className="text-3xl font-bold text-emerald-600 mt-1 tracking-tight">
            {formatNumber(totalNet)}
          </h3>
          <p className="text-xs text-slate-400 mt-2">
            جاهز للتحويل البنكي
          </p>
        </div>

      </section>

      {/* 2. Interactive Charts & Budget Analytics Section (Recharts) */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Chart 1: Department Salary Distribution (2 Cols) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-600" />
                <h4 className="font-bold text-slate-800 text-base">توزيع كتلة الرواتب حسب القسم</h4>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">مقارنة الرواتب الأساسية والبدلات عبر الأقسام التشغيلية</p>
            </div>

            {/* Toggle View: Total vs Average */}
            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
              <button
                onClick={() => setChartViewMode('total')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  chartViewMode === 'total'
                    ? 'bg-white text-slate-800 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                إجمالي القسم
              </button>
              <button
                onClick={() => setChartViewMode('average')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  chartViewMode === 'average'
                    ? 'bg-white text-slate-800 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                متوسط الموظف
              </button>
            </div>
          </div>

          {/* Bar Chart Container */}
          <div className="h-72 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={departmentChartData}
                margin={{ top: 10, right: 10, left: 10, bottom: 25 }}
                barSize={24}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <YAxis 
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickFormatter={(val) => `${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                  tickLine={false}
                  axisLine={false}
                  orientation="right"
                />
                <Tooltip content={<CustomBarTooltip />} />
                <Legend 
                  verticalAlign="top" 
                  align="right"
                  wrapperStyle={{ paddingBottom: '16px', fontSize: '12px' }}
                />
                <Bar 
                  dataKey="الراتب الأساسي" 
                  fill="#10b981" 
                  radius={[4, 4, 0, 0]} 
                />
                <Bar 
                  dataKey="البدلات والمزايا" 
                  fill="#0ea5e9" 
                  radius={[4, 4, 0, 0]} 
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Allowances vs. Basic Salary Donut Pie Chart (1 Col) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <PieChartIcon className="w-5 h-5 text-sky-600" />
              <h4 className="font-bold text-slate-800 text-base">هيكل الأجور والبدلات</h4>
            </div>
            <p className="text-xs text-slate-400">نسبة البدلات مقابل الراتب الأساسي</p>

            {/* Donut Chart */}
            <div className="h-52 w-full relative mt-2" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={salaryStructureData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={78}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {salaryStructureData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Centered Total Label inside Donut */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-[10px] text-slate-400 font-semibold">إجمالي الكتلة</span>
                <span className="text-sm font-bold text-slate-800">{formatNumber(totalGross)}</span>
                <span className="text-[9px] text-slate-400">ر.س</span>
              </div>
            </div>
          </div>

          {/* Breakdown Legend Items */}
          <div className="grid grid-cols-2 gap-2.5 pt-4 border-t border-slate-100">
            {salaryStructureData.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                  <span className="text-slate-600 truncate font-medium">{item.name}</span>
                </div>
                <span className="font-bold text-slate-800 shrink-0 mr-1">{item.percentage}%</span>
              </div>
            ))}
          </div>
        </div>

      </section>

      {/* 3. Monthly Payroll Budget Visual Gauge & Indicators */}
      <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-200/60">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-base">مؤشر ميزانية الرواتب الشهرية</h4>
              <p className="text-xs text-slate-400">مراقبة سقف الميزانية والإنفاق الفعلي لشهر مايو 2024</p>
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>ضمن النطاق الآمن المستهدف ({budgetUtilizationPercent}%)</span>
          </div>
        </div>

        {/* Progress Bar Gauge */}
        <div className="space-y-2 mb-6">
          <div className="flex justify-between items-center text-xs font-semibold">
            <span className="text-slate-700">المصروف الفعلي: <strong className="text-emerald-600">{formatSAR(totalGross)}</strong></span>
            <span className="text-slate-500">سقف الميزانية المعتمدة: <strong className="text-slate-800">{formatSAR(monthlyAllocatedBudget)}</strong></span>
          </div>
          
          <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden p-0.5 border border-slate-200 flex">
            <div 
              className="bg-gradient-to-l from-emerald-500 to-teal-600 h-full rounded-full transition-all duration-700 shadow-xs relative" 
              style={{ width: `${budgetUtilizationPercent}%` }}
            >
              <span className="absolute right-2 top-0 bottom-0 flex items-center text-[10px] font-bold text-white">
                {budgetUtilizationPercent}%
              </span>
            </div>
          </div>
        </div>

        {/* 3 Metric Cards for Budget Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <p className="text-xs text-slate-500 font-medium">الميزانية التقديرية المخصصة</p>
            <p className="text-lg font-bold text-slate-800 mt-1">{formatSAR(monthlyAllocatedBudget)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">معتمدة من مجلس الإدارة</p>
          </div>

          <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-200/80">
            <p className="text-xs text-emerald-800 font-medium">الإنفاق الفعلي الجاري</p>
            <p className="text-lg font-bold text-emerald-700 mt-1">{formatSAR(totalGross)}</p>
            <p className="text-[11px] text-emerald-600 font-medium mt-0.5">يمثل {budgetUtilizationPercent}% من المخصص</p>
          </div>

          <div className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-200/80">
            <p className="text-xs text-blue-800 font-medium">الاحتياطي المتبقي بالميزانية</p>
            <p className="text-lg font-bold text-blue-700 mt-1">{formatSAR(remainingBudget)}</p>
            <p className="text-[11px] text-blue-600 font-medium mt-0.5">فائض مالي متاح للشهر الحالي</p>
          </div>
        </div>
      </section>

      {/* 4. Main Content Layout: Table (2/3) + Side Cards (1/3) */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Left 2 Cols: Payroll Status Table */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white">
            <div>
              <h4 className="font-bold text-slate-700 text-base">حالة تشغيل الرواتب الجارية</h4>
              <p className="text-xs text-slate-400 mt-0.5">فترة شهر: {latestRun?.periodMonth || '2024-05'}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 italic">آخر تحديث: منذ 10 دقائق</span>
              <button
                onClick={() => onNavigate('payroll_runs')}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
              >
                <span>فتح المسير الكامل</span>
                <ArrowLeft className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                  <th className="p-4 font-semibold">الموظف</th>
                  <th className="p-4 font-semibold">الراتب الأساسي</th>
                  <th className="p-4 font-semibold">بدلات</th>
                  <th className="p-4 font-semibold">خصومات</th>
                  <th className="p-4 font-semibold">الصافي</th>
                  <th className="p-4 font-semibold text-center">الحالة</th>
                  <th className="p-4 font-semibold text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="text-sm text-slate-600 divide-y divide-slate-100">
                {tableItems.map((item, idx) => {
                  const emp = employees.find(e => e.id === item.employeeId);
                  const isApproved = item.status === 'APPROVED' || item.status === 'POSTED';
                  const isUnderReview = item.status === 'UNDER_REVIEW';

                  return (
                    <tr key={item.employeeId || idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 font-medium text-slate-800">
                        <div>{item.employeeNameAr}</div>
                        <span className="text-[10px] text-slate-400">
                          رقم وظيفي: {item.employeeNo}
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
                            معتمد
                          </span>
                        ) : isUnderReview ? (
                          <span className="px-2.5 py-1 bg-yellow-100 text-yellow-700 rounded-full text-[10px] font-bold">
                            قيد المراجعة
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold">
                            مسودة
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {emp && onViewEmployeeStatement ? (
                          <button
                            onClick={() => onViewEmployeeStatement(emp)}
                            title="معاينة قسيمة الراتب"
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

        {/* Right Col: Qoyod Card & Compliance Card */}
        <div className="space-y-6">
          
          {/* Qoyod Integration Card */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
            <h4 className="font-bold text-slate-700 mb-4 text-base">تكامل نظام قيود (Qoyod)</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-sm text-slate-600 font-medium">ربط API</span>
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                  <span>نشط</span>
                  <span>✓</span>
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-sm text-slate-600 font-medium">مزامنة القيود</span>
                <span className="text-xs font-bold text-slate-500">مجدولة غداً</span>
              </div>
              <button
                onClick={onOpenQoyodModal}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-medium rounded-lg text-sm transition-colors shadow-xs cursor-pointer mt-2"
              >
                إرسال القيود يدوياً الآن
              </button>
            </div>
          </div>

          {/* Compliance Card */}
          <div className="bg-[#1e293b] p-6 rounded-xl text-white shadow-lg relative overflow-hidden">
            <div className="relative z-10">
              <h4 className="font-bold text-base mb-1 text-white">مؤشر الامتثال</h4>
              <p className="text-xs text-slate-400 mb-4">التزام الشركة بقواعد العمل والتأمينات</p>
              
              <div className="w-full bg-slate-700/80 h-2.5 rounded-full mb-3 overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: '94%' }} />
              </div>
              
              <div className="flex justify-between text-xs font-medium">
                <span className="text-emerald-400 font-bold">94% مكتمل</span>
                <span className="text-slate-400">6% ملاحظات</span>
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
