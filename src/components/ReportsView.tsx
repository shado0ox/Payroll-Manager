import React, { useState, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Download, 
  TrendingUp, 
  ShieldCheck, 
  DollarSign, 
  Building2, 
  PieChart, 
  Calendar,
  Users,
  CheckCircle2,
  FileText
} from 'lucide-react';
import { Company, Employee, PayrollRun, UserRole } from '../types';
import { formatSAR, formatNumber } from '../utils/payrollEngine';
import { exportPayrollSheetCsv, exportGosiReportCsv, exportWpsBankCsv } from '../utils/exportUtils';
import { useLanguage } from '../i18n/LanguageContext';

interface ReportsViewProps {
  company: Company;
  employees: Employee[];
  payrollRuns: PayrollRun[];
  activeRole: UserRole;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  company,
  employees,
  payrollRuns,
  activeRole,
}) => {
  const { language } = useLanguage();
  const ui = (ar: string, en: string) => language === 'ar' ? ar : en;
  const companyRuns = useMemo(() => {
    return payrollRuns.filter(r => r.companyId === company.id);
  }, [payrollRuns, company.id]);

  const [selectedPeriod, setSelectedPeriod] = useState<string>(
    companyRuns[0]?.periodMonth || new Date().toISOString().slice(0, 7)
  );

  const currentRun = useMemo(() => {
    return companyRuns.find(r => r.periodMonth === selectedPeriod) || companyRuns[0];
  }, [companyRuns, selectedPeriod]);

  const companyEmployees = useMemo(() => {
    return employees.filter(e => e.companyId === company.id);
  }, [employees, company.id]);

  // Department cost breakdown
  const deptCostBreakdown = useMemo(() => {
    if (!currentRun || !currentRun.items) return [];
    const map = new Map<string, { count: number; totalGross: number; totalNet: number; totalBurden: number }>();

    (currentRun.items || []).forEach(item => {
      const existing = map.get(item.department) || { count: 0, totalGross: 0, totalNet: 0, totalBurden: 0 };
      existing.count += 1;
      existing.totalGross += item.totalGrossSalary;
      existing.totalNet += item.netSalary;
      existing.totalBurden += item.totalCompanyBurden;
      map.set(item.department, existing);
    });

    return Array.from(map.entries()).map(([dept, data]) => ({
      dept,
      ...data,
    }));
  }, [currentRun]);

  // GOSI Breakdown
  const gosiMetrics = useMemo(() => {
    if (!currentRun || !currentRun.items) return { saudiCount: 0, nonSaudiCount: 0, employeeTotal: 0, employerTotal: 0, gosiTotal: 0 };
    let saudiCount = 0;
    let nonSaudiCount = 0;

    (currentRun.items || []).forEach(i => {
      if (i.nationality === 'SAUDI') saudiCount++;
      else nonSaudiCount++;
    });

    return {
      saudiCount,
      nonSaudiCount,
      employeeTotal: currentRun.totalGosiEmployee || 0,
      employerTotal: currentRun.totalGosiEmployer || 0,
      gosiTotal: (currentRun.totalGosiEmployee || 0) + (currentRun.totalGosiEmployer || 0),
    };
  }, [currentRun]);

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            <span>{ui('التقارير المالية والامتثال النظامي', 'Financial Reports & Regulatory Compliance')}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {ui('كشوفات الرواتب، تقارير التأمينات الاجتماعية (GOSI)، ومطابقة حماية الأجور (WPS / مُدد)', 'Payroll statements, GOSI reports, and Wage Protection System (WPS / Mudad) reconciliation.')}
          </p>
        </div>

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
      </div>

      {/* 3 Main Export Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Card 1: Payroll Sheet */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900">{ui('مسير الرواتب الشامل', 'Detailed Payroll')}</h3>
            <p className="text-xs text-slate-500">
              {ui(`ملف إكسل كامل بجميع الاستحقاقات والبدلات والإضافي والتأمينات والخصومات لجميع الموظفين (${currentRun?.employeesCount || 0} موظف).`, `A complete spreadsheet of earnings, allowances, overtime, GOSI, and deductions for ${currentRun?.employeesCount || 0} employees.`)}
            </p>
          </div>
          <button
            onClick={() => currentRun && exportPayrollSheetCsv(currentRun, company)}
            disabled={!currentRun}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>{ui('تحميل ملف المسير Excel / CSV', 'Download Payroll Excel / CSV')}</span>
          </button>
        </div>

        {/* Card 2: WPS / Mudad File */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900">{ui('ملف حماية الأجور', 'Wage Protection File')} (WPS / {ui('مُدد', 'Mudad')})</h3>
            <p className="text-xs text-slate-500">
              {ui('ملف مصرفي مطابق لإعدادات المنشأة ومتطلبات حماية الأجور ومنصة مُدد لصرف الرواتب.', 'A bank file generated from the company settings for salary transfers and WPS/Mudad compliance.')}
            </p>
          </div>
          <button
            onClick={() => currentRun && exportWpsBankCsv(currentRun, company)}
            disabled={!currentRun}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>{ui('تحميل ملف حماية الأجور WPS', 'Download WPS File')}</span>
          </button>
        </div>

        {/* Card 3: GOSI Report */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900">{ui('تقرير اشتراكات التأمينات', 'GOSI Contribution Report')} (GOSI)</h3>
            <p className="text-xs text-slate-500">
              {ui('تقرير مفصل بحصة الموظف والمنشأة وفق نسب وقواعد GOSI المحددة في إعدادات المنشأة.', 'A detailed employee and employer contribution report using the GOSI rates and rules configured for the company.')}
            </p>
          </div>
          <button
            onClick={() => currentRun && exportGosiReportCsv(currentRun, company)}
            disabled={!currentRun}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>{ui('تحميل تقرير اشتراكات GOSI', 'Download GOSI Report')}</span>
          </button>
        </div>

      </div>

      {/* GOSI Monthly Compliance Overview */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-600" />
          <span>{ui('ملخص اشتراكات التأمينات الاجتماعية لشهر', 'GOSI contribution summary for')} {selectedPeriod}</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <span className="text-slate-500 block mb-1">{ui('الموظفون السعوديون (معاشات + أخطار + ساند):', 'Saudi employees (pension + occupational hazards + SANED):')}</span>
            <span className="text-base font-bold text-slate-900">{gosiMetrics.saudiCount} {ui('موظف', 'employees')}</span>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <span className="text-slate-500 block mb-1">{ui('الموظفون غير السعوديين (أخطار مهنية):', 'Non-Saudi employees (occupational hazards):')}</span>
            <span className="text-base font-bold text-slate-900">{gosiMetrics.nonSaudiCount} {ui('موظف', 'employees')}</span>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <span className="text-slate-500 block mb-1">{ui('حصة الموظفين المستقطعة:', 'Employee contributions deducted:')}</span>
            <span className="text-base font-bold text-rose-700 font-mono">{formatSAR(gosiMetrics.employeeTotal)}</span>
          </div>

          <div className="bg-blue-50 p-3.5 rounded-xl border border-blue-200">
            <span className="text-blue-900 font-semibold block mb-1">{ui('إجمالي فاتورة التأمينات المستحقة:', 'Total GOSI payable:')}</span>
            <span className="text-base font-black text-blue-900 font-mono">{formatSAR(gosiMetrics.gosiTotal)}</span>
          </div>
        </div>
      </div>

      {/* Department Cost Centers Breakdown Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-600" />
            <span>{ui('توزيع تكلفة الرواتب حسب مراكز التكلفة والأقسام لشهر', 'Payroll cost by cost center and department for')} {selectedPeriod}</span>
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                <th className="py-3 px-4">{ui('مركز التكلفة / القسم', 'Cost Center / Department')}</th>
                <th className="py-3 px-4">{ui('عدد الموظفين', 'Employees')}</th>
                <th className="py-3 px-4">{ui('إجمالي المستحق', 'Gross Earnings')}</th>
                <th className="py-3 px-4">{ui('صافي التحويل', 'Net Transfer')}</th>
                <th className="py-3 px-4">{ui('إجمالي تكلفة المنشأة الشاملة', 'Total Company Cost')}</th>
                <th className="py-3 px-4">{ui('النسبة من إجمالي الرواتب', 'Share of Total Payroll')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deptCostBreakdown.map((row) => {
                const percentage = currentRun && currentRun.totalCompanyCost > 0
                  ? ((row.totalBurden / currentRun.totalCompanyCost) * 100).toFixed(1)
                  : '0';

                return (
                  <tr key={row.dept} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-bold text-slate-900">{row.dept}</td>
                    <td className="py-3 px-4 font-semibold text-slate-600">{row.count} {ui('موظف', 'employees')}</td>
                    <td className="py-3 px-4 font-semibold text-slate-800">{formatSAR(row.totalGross)}</td>
                    <td className="py-3 px-4 font-bold text-emerald-800">{formatSAR(row.totalNet)}</td>
                    <td className="py-3 px-4 font-extrabold text-purple-800 font-mono">{formatSAR(row.totalBurden)}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-emerald-600 h-full rounded-full" 
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="font-bold text-slate-700 text-[11px]">{percentage}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
