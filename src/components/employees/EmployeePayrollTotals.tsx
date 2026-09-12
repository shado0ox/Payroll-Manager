import React, { useMemo } from 'react';
import {
  Building2,
  CalendarDays,
  Layers3,
  PauseCircle,
  ShieldCheck,
  UserCheck,
  UserX,
  WalletCards,
  WalletMinimal,
} from 'lucide-react';
import type { Company, Employee } from '../../types';
import { formatSAR, roundAmount } from '../../utils/payrollEngine';

interface Props {
  company: Company;
  employees: Employee[];
  language: 'ar' | 'en';
}

const employeeSalary = (employee: Employee) => {
  const salary = employee.salaryPackage;
  const customAllowances = (salary.customAllowances || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return roundAmount(
    Number(salary.baseSalary || 0)
    + Number(salary.housingAllowance || 0)
    + Number(salary.transportAllowance || 0)
    + Number(salary.otherFixedAllowances || 0)
    + Number(salary.nonGosiOtherAllowances || 0)
    + customAllowances
  );
};

const otherAllowances = (employee: Employee) => roundAmount(
  Number(employee.salaryPackage.otherFixedAllowances || 0)
  + Number(employee.salaryPackage.nonGosiOtherAllowances || 0)
  + (employee.salaryPackage.customAllowances || []).reduce((sum, item) => sum + Number(item.amount || 0), 0)
);

export const EmployeePayrollTotals = React.memo<Props>(({ company, employees, language }) => {
  const totals = useMemo(() => employees.reduce((summary, employee) => {
    const salary = employeeSalary(employee);
    summary.totalSalary = roundAmount(summary.totalSalary + salary);
    if (employee.status === 'ACTIVE') summary.activeSalary = roundAmount(summary.activeSalary + salary);
    if (employee.status === 'ABSCONDED') summary.abscondedSalary = roundAmount(summary.abscondedSalary + salary);
    if (employee.status === 'ON_LEAVE') summary.leaveSalary = roundAmount(summary.leaveSalary + salary);
    if (employee.status === 'SUSPENDED') summary.suspendedSalary = roundAmount(summary.suspendedSalary + salary);
    summary.otherAllowances = roundAmount(summary.otherAllowances + otherAllowances(employee));

    if (employee.gosiEnabled !== false) {
      const subjectAmount = Math.min(
        Number(employee.salaryPackage.baseSalary || 0) + Number(employee.salaryPackage.housingAllowance || 0),
        Number(company.calculationRules?.saudiGosiMaxCap || 45000)
      );
      if (employee.nationality === 'SAUDI') {
        const employeeShare = roundAmount(subjectAmount * Number(employee.gosiEmployeeRate ?? company.calculationRules?.saudiGosiEmployeeRate ?? 0.0975));
        const normalEmployerShare = roundAmount(subjectAmount * Number(employee.gosiEmployerRate ?? company.calculationRules?.saudiGosiEmployerRate ?? 0.1175));
        if (employee.saudiGosiPaymentMode === 'COMPANY_FULL') {
          summary.employerGosi = roundAmount(summary.employerGosi + employeeShare + normalEmployerShare);
        } else {
          summary.employeeGosi = roundAmount(summary.employeeGosi + employeeShare);
          summary.employerGosi = roundAmount(summary.employerGosi + normalEmployerShare);
        }
      } else {
        summary.employerGosi = roundAmount(summary.employerGosi
          + subjectAmount * Number(company.calculationRules?.nonSaudiGosiEmployerHazardRate ?? 0.02));
      }
    }
    return summary;
  }, {
    totalSalary: 0,
    activeSalary: 0,
    abscondedSalary: 0,
    leaveSalary: 0,
    suspendedSalary: 0,
    employerGosi: 0,
    employeeGosi: 0,
    otherAllowances: 0,
  }), [company.calculationRules, employees]);

  const cards = [
    { key:'total', labelAr:'إجمالي الرواتب', labelEn:'Total salaries', value:totals.totalSalary, icon:WalletCards, classes:'bg-slate-900 text-white border-slate-900', valueClasses:'text-emerald-300' },
    { key:'active', labelAr:'رواتب النشطين', labelEn:'Active salaries', value:totals.activeSalary, icon:UserCheck, classes:'bg-emerald-50 text-emerald-900 border-emerald-200', valueClasses:'text-emerald-800' },
    { key:'absconded', labelAr:'رواتب الهاربين', labelEn:'Absconded salaries', value:totals.abscondedSalary, icon:UserX, classes:'bg-rose-50 text-rose-900 border-rose-200', valueClasses:'text-rose-800' },
    { key:'leave', labelAr:'رواتب الإجازة', labelEn:'On-leave salaries', value:totals.leaveSalary, icon:CalendarDays, classes:'bg-sky-50 text-sky-900 border-sky-200', valueClasses:'text-sky-800' },
    { key:'suspended', labelAr:'رواتب المعلقين', labelEn:'Suspended salaries', value:totals.suspendedSalary, icon:PauseCircle, classes:'bg-amber-50 text-amber-900 border-amber-200', valueClasses:'text-amber-800' },
    { key:'gosi-total', labelAr:'إجمالي استحقاق التأمينات', labelEn:'Total GOSI payable', value:roundAmount(totals.employerGosi + totals.employeeGosi), icon:ShieldCheck, classes:'bg-violet-50 text-violet-900 border-violet-200', valueClasses:'text-violet-800' },
    { key:'gosi-employer', labelAr:'تأمينات على المنشأة', labelEn:'Employer GOSI', value:totals.employerGosi, icon:Building2, classes:'bg-purple-50 text-purple-900 border-purple-200', valueClasses:'text-purple-800' },
    { key:'gosi-employee', labelAr:'تأمينات تُخصم من الموظفين', labelEn:'Employee GOSI deductions', value:totals.employeeGosi, icon:WalletMinimal, classes:'bg-orange-50 text-orange-900 border-orange-200', valueClasses:'text-orange-800' },
    { key:'other', labelAr:'إجمالي البدلات الأخرى', labelEn:'Other allowances', value:totals.otherAllowances, icon:Layers3, classes:'bg-teal-50 text-teal-900 border-teal-200', valueClasses:'text-teal-800' },
  ];

  return (
    <section data-employee-payroll-totals className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-black text-slate-900">{language === 'ar' ? 'إجماليات الرواتب حسب الفلتر الحالي' : 'Payroll totals for current filters'}</h2>
          <p className="mt-0.5 text-[10px] text-slate-500">{language === 'ar' ? 'القيم الشهرية الثابتة للموظفين الظاهرين فقط' : 'Fixed monthly values for visible employees only'}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700">{employees.length} {language === 'ar' ? 'موظف' : 'employees'}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.key} className={`min-w-0 rounded-xl border p-3 ${card.classes}`}>
              <div className="flex items-center gap-1.5 text-[10px] font-bold">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{language === 'ar' ? card.labelAr : card.labelEn}</span>
              </div>
              <div className={`mt-1.5 truncate font-mono text-sm font-black ${card.valueClasses}`} title={formatSAR(card.value)}>{formatSAR(card.value)}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
});

EmployeePayrollTotals.displayName = 'EmployeePayrollTotals';
