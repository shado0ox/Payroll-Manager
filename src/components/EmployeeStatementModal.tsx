import React from 'react';
import { 
  X, 
  Printer, 
  Download, 
  Building2, 
  User, 
  CreditCard, 
  Calendar, 
  DollarSign, 
  Receipt, 
  CheckCircle,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { Company, Employee, PayrollRun, PayrollSettlement, LoanSchedule } from '../types';
import { formatSAR, formatNumber, roundAmount } from '../utils/payrollEngine';
import { useLanguage } from '../i18n/LanguageContext';

interface EmployeeStatementModalProps {
  employee: Employee | null;
  company: Company;
  payrollRuns: PayrollRun[];
  periodMonth: string;
  settlements?: PayrollSettlement[];
  loans: LoanSchedule[];
  onClose: () => void;
}

export const EmployeeStatementModal: React.FC<EmployeeStatementModalProps> = ({
  employee,
  company,
  payrollRuns,
  periodMonth,
  settlements = [],
  loans,
  onClose,
}) => {
  const { language } = useLanguage();
  const tr = (ar: string, en: string) => language === 'ar' ? ar : en;
  if (!employee) return null;

  // Find employee's items in historical runs
  const employeeHistory = payrollRuns
    .filter(run => run.companyId === company.id)
    .map(run => {
      const item = run.items.find(i => i.employeeId === employee.id);
      return {
        run,
        item,
      };
    })
    .filter(h => h.item !== undefined)
    .sort((a, b) => b.run.periodMonth.localeCompare(a.run.periodMonth));

  const activeLoan = loans.find(l => l.companyId === company.id && l.employeeId === employee.id && l.status === 'ACTIVE');
  const employeePaidSettlements = settlements.filter(item => item.companyId === company.id && item.employeeId === employee.id && item.status === 'PAID');
  const employeePaidSettlementTotal = roundAmount(employeePaidSettlements.reduce((sum, item) => sum + Number(item.amount || 0), 0));
  const selectedHistory = employeeHistory.find(history => history.run.periodMonth === periodMonth);
  const latestItem = selectedHistory?.item;
  const latestRun = selectedHistory?.run;
  const paidPriorSettlements = payrollRuns.filter(run => run.companyId === company.id).flatMap(run => (run.paymentBatches || [])
    .filter(batch => batch.status === 'PAID')
    .flatMap(batch => (batch.priorEntitlements || [])
      .filter(ref => ref.employeeId === employee.id)
      .map(ref => ({ ...ref, paymentBatchNumber: batch.batchNumber, paymentDate: batch.paymentDate || batch.scheduledDate }))));
  const paidPriorSettlementTotal = roundAmount(paidPriorSettlements.reduce((sum, ref) => sum + ref.amount, 0));

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white">
      <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden print:shadow-none print:border-none print:rounded-none">
        
        {/* Modal Top Bar (Hidden in Print) */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2.5">
            <Receipt className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm sm:text-base">
              {tr('كشف حساب الموظف وقسيمة الراتب التفصيلية', 'Employee Statement & Detailed Payslip')}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>{tr('طباعة / تصدير PDF', 'Print / Export PDF')}</span>
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Official Statement Body */}
        <div className="p-6 sm:p-8 space-y-6 max-h-[85vh] overflow-y-auto print:max-h-none print:overflow-visible text-slate-800">
          
          {/* Header of Statement */}
          <div className="border-b-2 border-slate-900 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">{language === 'ar' ? company.nameAr : company.nameEn || company.nameAr}</h2>
              <div className="text-xs text-slate-500 font-medium">{language === 'ar' ? company.nameEn : company.nameAr}</div>
              <div className="text-xs text-slate-600 space-x-3 space-x-reverse">
                <span>{tr('س.ت:', 'C.R.:')} <strong>{company.crNumber}</strong></span>
                <span>{tr('الرقم الضريبي:', 'VAT No.:')} <strong>{company.taxNumber}</strong></span>
                <span>{tr('رقم التأمينات:', 'GOSI No.:')} <strong>{company.gosiEstablishmentNo}</strong></span>
              </div>
            </div>

            <div className="text-left sm:text-right bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <div className="text-xs text-slate-500">{tr('كشف حساب وقسيمة راتب شهر:', 'Statement and payslip for:')}</div>
              <div className="text-lg font-black text-emerald-800">
                {periodMonth}
              </div>
              <div className="text-[10px] text-slate-400">{tr('تاريخ الإصدار:', 'Issue Date:')} {new Date().toISOString().split('T')[0]}</div>
            </div>
          </div>

          {/* Employee Information Card */}
          <div className="bg-slate-50/80 rounded-2xl p-4 sm:p-5 border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-500 block mb-0.5">{tr('اسم الموظف:', 'Employee Name:')}</span>
              <span className="font-bold text-slate-900 text-sm">{employee.firstNameAr} {employee.lastNameAr}</span>
              <span className="text-[10px] text-slate-400 block">{employee.firstNameEn} {employee.lastNameEn}</span>
            </div>

            <div>
              <span className="text-slate-500 block mb-0.5">{tr('الرقم الوظيفي:', 'Employee Number:')}</span>
              <span className="font-mono font-bold text-slate-900">{employee.employeeNo}</span>
            </div>

            <div>
              <span className="text-slate-500 block mb-0.5">{tr('الهوية / الإقامة:', 'National ID / Iqama:')}</span>
              <span className="font-mono font-bold text-slate-900">{employee.nationalIdOrIqama}</span>
            </div>

            <div>
              <span className="text-slate-500 block mb-0.5">{tr('الجنسية:', 'Nationality:')}</span>
              <span className="font-bold text-slate-900">
                {employee.nationality === 'SAUDI' ? tr('سعودي (خاضع لـ GOSI)', 'Saudi (GOSI)') : `${employee.country}`}
              </span>
            </div>

            <div>
              <span className="text-slate-500 block mb-0.5">{tr('القسم والوظيفة:', 'Department & Job:')}</span>
              <span className="font-bold text-slate-900">{employee.department} - {employee.jobTitle}</span>
            </div>

            <div>
              <span className="text-slate-500 block mb-0.5">{tr('تاريخ التعيين:', 'Hire Date:')}</span>
              <span className="font-bold text-slate-900">{employee.hireDate}</span>
            </div>

            <div>
              <span className="text-slate-500 block mb-0.5">{tr('البنك المحول إليه:', 'Receiving Bank:')}</span>
              <span className="font-bold text-slate-900">{employee.bankName}</span>
            </div>

            <div>
              <span className="text-slate-500 block mb-0.5">{tr('رقم الآيبان (IBAN):', 'IBAN:')}</span>
              <span className="font-mono font-bold text-slate-900 text-[11px] dir-ltr inline-block">{employee.bankIban}</span>
            </div>

            {employee.bankSwiftCode && (
              <div>
                <span className="text-slate-500 block mb-0.5">{tr('رمز السويفت (SWIFT/BIC):', 'SWIFT/BIC:')}</span>
                <span className="font-mono font-bold text-emerald-700 text-[11px] dir-ltr inline-block">{employee.bankSwiftCode}</span>
              </div>
            )}
          </div>

          {paidPriorSettlements.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div><div className="text-xs font-black text-amber-900">{tr('مستحقات سابقة تم صرفها لاحقًا', 'Prior held entitlements paid later')}</div><div className="text-[10px] text-amber-700">{tr('هذه المبالغ تخص فتراتها الأصلية وليست مصروفًا جديدًا في شهر الدفع.', 'These amounts belong to their original payroll periods and are not a new expense in the payment month.')}</div></div>
                <div className="font-black text-amber-900">{formatSAR(paidPriorSettlementTotal)}</div>
              </div>
              <div className="space-y-1">{paidPriorSettlements.map(ref => (
                <div key={`${ref.sourcePayrollRunId}:${ref.sourcePayrollItemId}`} className="flex items-center justify-between text-[11px] border-t border-amber-200/70 pt-1.5">
                  <span>{tr('راتب', 'Salary')} {ref.sourcePeriodMonth} • {ref.paymentBatchNumber} • {ref.paymentDate}</span>
                  <strong>{formatSAR(ref.amount)}</strong>
                </div>
              ))}</div>
            </div>
          )}

          {employeePaidSettlements.length > 0 && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
              <div className="flex items-center justify-between gap-3 mb-2"><div><div className="text-xs font-black text-emerald-900">{tr('تسويات رواتب مسددة', 'Paid payroll settlements')}</div><div className="text-[10px] text-emerald-700">{tr('تاريخ الاستحقاق منفصل عن تاريخ السداد الفعلي.', 'Entitlement period is kept separate from the actual payment date.')}</div></div><strong>{formatSAR(employeePaidSettlementTotal)}</strong></div>
              <div className="space-y-1">{employeePaidSettlements.map(item => <div key={item.id} className="flex items-center justify-between border-t border-emerald-200/70 pt-1.5 text-[11px]"><span>{item.periodMonth} • {item.paymentDate || '-'} • {item.paymentMethod || '-'}</span><strong>{formatSAR(item.amount)}</strong></div>)}</div>
            </div>
          )}

          {/* Current Month Itemized Breakdown: Earnings vs Deductions */}
          {latestItem ? (
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                <span>{tr('تفاصيل قسيمة الراتب لشهر', 'Payslip Details for')} {latestRun?.periodMonth}</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Earnings (الاستحقاقات) */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="bg-emerald-50 px-4 py-2.5 font-bold text-xs text-emerald-900 border-b border-emerald-100 flex items-center justify-between">
                    <span>{tr('الاستحقاقات والبدلات', 'Earnings & Allowances')}</span>
                    <span>{tr('المبلغ', 'Amount')} (SR)</span>
                  </div>
                  <div className="p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-700">
                      <span>{tr('الراتب الأساسي', 'Basic Salary')}</span>
                      <span className="font-bold">{formatSAR(latestItem.baseSalary)}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-700">
                      <span>{tr('بدل السكن', 'Housing Allowance')}</span>
                      <span className="font-bold">{formatSAR(latestItem.housingAllowance)}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-700">
                      <span>{tr('بدل النقل والانتقال', 'Transport Allowance')}</span>
                      <span className="font-bold">{formatSAR(latestItem.transportAllowance)}</span>
                    </div>
                    {latestItem.otherAllowances > 0 && (
                      <div className="flex items-center justify-between text-slate-700">
                        <span>{tr('بدلات ومكافآت أخرى', 'Other Allowances & Bonuses')}</span>
                        <span className="font-bold">{formatSAR(latestItem.otherAllowances)}</span>
                      </div>
                    )}
                    {latestItem.overtimeAmount > 0 && (
                      <div className="flex items-center justify-between text-emerald-800 font-semibold">
                        <span>{tr('عمل إضافي', 'Overtime')} ({latestItem.overtimeHours} {tr('ساعة', 'hours')})</span>
                        <span className="font-bold">{formatSAR(latestItem.overtimeAmount)}</span>
                      </div>
                    )}
                    {latestItem.bonuses > 0 && (
                      <div className="flex items-center justify-between text-emerald-800 font-semibold">
                        <span>{tr('عمولات ومكافآت وإضافات مؤقتة', 'Commissions, bonuses & temporary earnings')}</span>
                        <span className="font-bold">{formatSAR(latestItem.bonuses)}</span>
                      </div>
                    )}

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between font-black text-sm text-slate-900">
                      <span>{tr('إجمالي المستحقات:', 'Gross Earnings:')}</span>
                      <span>{formatSAR(latestItem.totalGrossSalary)}</span>
                    </div>
                  </div>
                </div>

                {/* Deductions (الاستقطاعات) */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="bg-rose-50 px-4 py-2.5 font-bold text-xs text-rose-900 border-b border-rose-100 flex items-center justify-between">
                    <span>{tr('الاستقطاعات والخصومات', 'Deductions')}</span>
                    <span>{tr('المبلغ', 'Amount')} (SR)</span>
                  </div>
                  <div className="p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-700">
                      <span>{tr('تأمينات اجتماعية (حصة الموظف GOSI)', 'GOSI Employee Contribution')}</span>
                      <span className="font-bold text-rose-600">{formatSAR(latestItem.gosiEmployeeShare)}</span>
                    </div>
                    {latestItem.delayDeduction > 0 && (
                      <div className="flex items-center justify-between text-slate-700">
                        <span>{tr('خصم تأخير الحضور', 'Lateness Deduction')} ({latestItem.delayMinutes} {tr('دقيقة', 'minutes')})</span>
                        <span className="font-bold text-rose-600">{formatSAR(latestItem.delayDeduction)}</span>
                      </div>
                    )}
                    {latestItem.absenceDeduction > 0 && (
                      <div className="flex items-center justify-between text-slate-700">
                        <span>{tr('خصم أيام الغياب', 'Absence Deduction')} ({latestItem.absenceDays} {tr('يوم', 'days')})</span>
                        <span className="font-bold text-rose-600">{formatSAR(latestItem.absenceDeduction)}</span>
                      </div>
                    )}
                    {latestItem.unpaidLeaveDeduction > 0 && (
                      <div className="flex items-center justify-between text-slate-700">
                        <span>{tr('خصم إجازة بدون راتب', 'Unpaid Leave Deduction')} ({latestItem.unpaidLeaveDays} {tr('يوم', 'days')})</span>
                        <span className="font-bold text-rose-600">{formatSAR(latestItem.unpaidLeaveDeduction)}</span>
                      </div>
                    )}
                    {latestItem.loanDeduction > 0 && (
                      <div className="flex items-center justify-between text-slate-700">
                        <span>{tr('قسط سلفة الموظف الشهرية', 'Monthly Employee Loan Installment')}</span>
                        <span className="font-bold text-rose-600">{formatSAR(latestItem.loanDeduction)}</span>
                      </div>
                    )}
                    {latestItem.penaltiesDeduction > 0 && (
                      <div className="flex items-center justify-between text-slate-700">
                        <span>{tr('خصومات وجزاءات إدارية', 'Administrative Deductions & Penalties')}</span>
                        <span className="font-bold text-rose-600">{formatSAR(latestItem.penaltiesDeduction)}</span>
                      </div>
                    )}

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between font-black text-sm text-rose-700">
                      <span>{tr('إجمالي الاستقطاعات:', 'Total Deductions:')}</span>
                      <span>{formatSAR(latestItem.totalDeductions)}</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Net Pay Grand Card */}
              <div className="mt-4 bg-emerald-800 text-white rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md">
                <div>
                  <span className="text-xs text-emerald-200 block">{tr('صافي الراتب المستحق للتحويل:', 'Net Payable:')}</span>
                  <div className="text-2xl sm:text-3xl font-black font-mono mt-0.5">
                    {formatSAR(latestItem.netSalary)}
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <span className="text-[11px] text-emerald-200 block">{tr('مساهمة الشركة في التأمينات (حصة المنشأة):', 'Employer GOSI Contribution:')}</span>
                  <span className="text-sm font-bold text-white font-mono">{formatSAR(latestItem.gosiEmployerShare)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
              <div className="font-black text-amber-900">{tr('لا توجد قسيمة راتب لهذا الموظف في الشهر المحدد', 'No payslip exists for this employee in the selected month')}</div>
              <div className="mt-1 text-xs text-amber-700">{periodMonth}</div>
            </div>
          )}

          {/* Active Loan Ledger Section */}
          {activeLoan && (
            <div className="border border-slate-200 rounded-2xl p-4 bg-amber-50/50">
              <h3 className="text-xs font-bold text-amber-900 mb-2 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-amber-700" />
                <span>{tr('موقف سلف وأقساط الموظف الحالية', 'Current Employee Loan Status')}</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block">{tr('إجمالي السلفة:', 'Original Loan:')}</span>
                  <span className="font-bold text-slate-900">{formatSAR(activeLoan.totalAmount)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">{tr('القسط الشهري:', 'Monthly Installment:')}</span>
                  <span className="font-bold text-slate-900">{formatSAR(activeLoan.monthlyInstallment)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">{tr('الأقساط المتبقية:', 'Remaining Installments:')}</span>
                  <span className="font-bold text-slate-900">{activeLoan.remainingInstallments} {tr('شهر', 'months')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">{tr('الرصيد المتبقي:', 'Outstanding Balance:')}</span>
                  <span className="font-bold text-amber-800">{formatSAR(activeLoan.remainingAmount)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Historical Activity Table */}
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span>{tr('سجل مسيرات الرواتب السابقة للموظف', 'Employee Payroll History')}</span>
            </h3>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                    <th className="py-2.5 px-3">{tr('الشهر والفترة', 'Period')}</th>
                    <th className="py-2.5 px-3">{tr('الراتب الإجمالي', 'Gross Salary')}</th>
                    <th className="py-2.5 px-3">{tr('الاستقطاعات', 'Deductions')}</th>
                    <th className="py-2.5 px-3">{tr('صافي المحول', 'Net Transfer')}</th>
                    <th className="py-2.5 px-3">{tr('حالة المسير', 'Payroll Status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employeeHistory.map(({ run, item }) => (
                    <tr key={run.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{run.periodMonth}</td>
                      <td className="py-2.5 px-3">{formatSAR(item!.totalGrossSalary)}</td>
                      <td className="py-2.5 px-3 text-rose-600">{formatSAR(item!.totalDeductions)}</td>
                      <td className="py-2.5 px-3 font-bold text-emerald-800">{formatSAR(item!.netSalary)}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold">
                          {run.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Signatures & Stamp Footer */}
          <div className="pt-8 border-t-2 border-dashed border-slate-300 grid grid-cols-3 gap-6 text-center text-xs">
            <div>
              <span className="text-slate-500 block mb-8">{tr('إعداد مسؤول الرواتب', 'Prepared by Payroll Officer')}</span>
              <div className="border-t border-slate-300 pt-1 font-semibold text-slate-700">{tr('التوقيع / التاريخ', 'Signature / Date')}</div>
            </div>
            <div>
              <span className="text-slate-500 block mb-8">{tr('اعتماد مدير الموارد البشرية', 'HR Manager Approval')}</span>
              <div className="border-t border-slate-300 pt-1 font-semibold text-slate-700">{tr('التوقيع / التاريخ', 'Signature / Date')}</div>
            </div>
            <div>
              <span className="text-slate-500 block mb-8">{tr('الختم المالي والاعتماد', 'Finance Approval & Stamp')}</span>
              <div className="border-t border-slate-300 pt-1 font-semibold text-slate-700">{tr('ختم المنشأة', 'Company Stamp')}</div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
