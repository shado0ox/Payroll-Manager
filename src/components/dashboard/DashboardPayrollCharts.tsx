import React, { useMemo, useState } from 'react';
import { BarChart3, PieChart as PieChartIcon } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Employee } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';
import { formatNumber } from '../../utils/payrollEngine';

interface DashboardPayrollChartsProps {
  employees: Employee[];
  totalGross: number;
}

const CustomBarTooltip = ({ active, payload, label }: any) => {
  const { language } = useLanguage();
  const tr = (ar: string, en: string) => language === 'ar' ? ar : en;
  if (!active || !payload?.length) return null;
  return (
    <div className="z-50 min-w-[190px] rounded-xl border border-slate-700/80 bg-slate-900/95 p-3.5 text-right text-xs text-white shadow-xl backdrop-blur-md">
      <p className="mb-2 border-b border-slate-700 pb-1 text-sm font-bold text-slate-100">{label}</p>
      <div className="space-y-1.5">
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor:entry.color }} />
              <span>{entry.name}:</span>
            </span>
            <span className="font-semibold text-white">{formatNumber(entry.value)} SR</span>
          </div>
        ))}
        {payload.length > 1 && (
          <div className="mt-1.5 flex justify-between border-t border-slate-700/80 pt-1.5 font-bold text-emerald-400">
            <span>{tr('الإجمالي:', 'Total:')}</span>
            <span>{formatNumber(payload.reduce((sum: number, item: any) => sum + (Number(item.value) || 0), 0))} SR</span>
          </div>
        )}
      </div>
    </div>
  );
};

const CustomPieTooltip = ({ active, payload }: any) => {
  const { language } = useLanguage();
  const tr = (ar: string, en: string) => language === 'ar' ? ar : en;
  if (!active || !payload?.length) return null;
  const data = payload[0];
  return (
    <div className="z-50 min-w-[170px] rounded-xl border border-slate-700/80 bg-slate-900/95 p-3 text-right text-xs text-white shadow-xl backdrop-blur-md">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor:data.payload.fill || data.color }} />
        <span className="font-bold text-slate-100">{data.name}</span>
      </div>
      <div className="flex justify-between text-slate-300">
        <span>{tr('المبلغ:', 'Amount:')}</span>
        <span className="font-bold text-white">{formatNumber(data.value)} SR</span>
      </div>
      <div className="mt-1 flex justify-between text-slate-300">
        <span>{tr('النسبة:', 'Percentage:')}</span>
        <span className="font-bold text-emerald-400">{data.payload.percentage}%</span>
      </div>
    </div>
  );
};

export const DashboardPayrollCharts = React.memo<DashboardPayrollChartsProps>(({ employees,totalGross }) => {
  const { language } = useLanguage();
  const tr = (ar: string, en: string) => language === 'ar' ? ar : en;
  const [viewMode,setViewMode] = useState<'total' | 'average'>('total');

  const departmentData = useMemo(() => {
    const departments: Record<string, { basic:number;allowances:number;count:number;name:string }> = {};
    employees.forEach(employee => {
      const name = employee.department || tr('عام', 'General');
      if (!departments[name]) departments[name] = { basic:0,allowances:0,count:0,name };
      departments[name].basic += Number(employee.salaryPackage?.baseSalary || employee.basicSalary) || 0;
      departments[name].allowances +=
        (Number(employee.salaryPackage?.housingAllowance || employee.housingAllowance) || 0) +
        (Number(employee.salaryPackage?.transportAllowance || employee.transportationAllowance) || 0) +
        (Number(employee.salaryPackage?.otherFixedAllowances || employee.otherAllowances) || 0) +
        (Number(employee.salaryPackage?.nonGosiOtherAllowances) || 0);
      departments[name].count += 1;
    });
    return Object.values(departments).map(department => ({
      name:department.name,
      basic:viewMode === 'total' ? Math.round(department.basic) : Math.round(department.basic / Math.max(1,department.count)),
      allowances:viewMode === 'total' ? Math.round(department.allowances) : Math.round(department.allowances / Math.max(1,department.count)),
    }));
  }, [employees,viewMode,language]);

  const salaryStructure = useMemo(() => {
    const totals = employees.reduce((result, employee) => ({
      basic:result.basic + (Number(employee.salaryPackage?.baseSalary || employee.basicSalary) || 0),
      housing:result.housing + (Number(employee.salaryPackage?.housingAllowance || employee.housingAllowance) || 0),
      transport:result.transport + (Number(employee.salaryPackage?.transportAllowance || employee.transportationAllowance) || 0),
      other:result.other + (Number(employee.salaryPackage?.otherFixedAllowances || employee.otherAllowances) || 0) + (Number(employee.salaryPackage?.nonGosiOtherAllowances) || 0),
    }), { basic:0,housing:0,transport:0,other:0 });
    const grandTotal = totals.basic + totals.housing + totals.transport + totals.other;
    return [
      { name:tr('الراتب الأساسي', 'Basic Salary'),rawValue:totals.basic,fill:'#10b981' },
      { name:tr('بدل السكن', 'Housing Allowance'),rawValue:totals.housing,fill:'#0ea5e9' },
      { name:tr('بدل النقل', 'Transport Allowance'),rawValue:totals.transport,fill:'#f59e0b' },
      { name:tr('بدلات أخرى ومكافآت', 'Other Allowances & Bonuses'),rawValue:totals.other,fill:'#8b5cf6' },
    ].map(item => ({
      name:item.name,
      value:Math.round(item.rawValue),
      fill:item.fill,
      percentage:grandTotal ? ((item.rawValue / grandTotal) * 100).toFixed(1) : '0.0',
    }));
  }, [employees,language]);

  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-2">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-600" />
              <h4 className="text-base font-bold text-slate-800">{tr('توزيع كتلة الرواتب حسب القسم', 'Payroll Distribution by Department')}</h4>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">{tr('مقارنة الرواتب الأساسية والبدلات عبر الأقسام التشغيلية', 'Compare basic salaries and allowances across departments.')}</p>
          </div>
          <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-1 text-xs font-semibold">
            {(['total','average'] as const).map(mode => (
              <button key={mode} type="button" onClick={() => setViewMode(mode)} className={`cursor-pointer rounded-md px-3 py-1 transition-colors ${viewMode === mode ? 'bg-white font-bold text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}>
                {mode === 'total' ? tr('إجمالي القسم', 'Department Total') : tr('متوسط الموظف', 'Employee Average')}
              </button>
            ))}
          </div>
        </div>
        <div className="h-72 w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={departmentData} margin={{ top:10,right:10,left:10,bottom:25 }} barSize={24}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fill:'#64748b',fontSize:11 }} interval={0} angle={-15} textAnchor="end" tickLine={false} axisLine={{ stroke:'#cbd5e1' }} />
              <YAxis tick={{ fill:'#64748b',fontSize:11 }} tickFormatter={value => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value} tickLine={false} axisLine={false} orientation="right" />
              <Tooltip content={<CustomBarTooltip />} />
              <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom:'16px',fontSize:'12px' }} />
              <Bar dataKey="basic" name={tr('الراتب الأساسي', 'Basic Salary')} fill="#10b981" radius={[4,4,0,0]} />
              <Bar dataKey="allowances" name={tr('البدلات والمزايا', 'Allowances & Benefits')} fill="#0ea5e9" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <PieChartIcon className="h-5 w-5 text-sky-600" />
            <h4 className="text-base font-bold text-slate-800">{tr('هيكل الأجور والبدلات', 'Salary & Allowance Structure')}</h4>
          </div>
          <p className="text-xs text-slate-400">{tr('نسبة البدلات مقابل الراتب الأساسي', 'Allowances compared with basic salary')}</p>
          <div className="relative mt-2 h-52 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={salaryStructure} cx="50%" cy="50%" innerRadius={55} outerRadius={78} paddingAngle={3} dataKey="value">
                  {salaryStructure.map((entry,index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                </Pie>
                <Tooltip content={<CustomPieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] font-semibold text-slate-400">{tr('إجمالي الكتلة', 'Total Payroll')}</span>
              <span className="text-sm font-bold text-slate-800">{formatNumber(totalGross)}</span>
              <span className="text-[9px] text-slate-400">SR</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 border-t border-slate-100 pt-4">
          {salaryStructure.map(item => (
            <div key={item.name} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor:item.fill }} />
                <span className="truncate font-medium text-slate-600">{item.name}</span>
              </div>
              <span className="mr-1 shrink-0 font-bold text-slate-800">{item.percentage}%</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
});

DashboardPayrollCharts.displayName = 'DashboardPayrollCharts';
