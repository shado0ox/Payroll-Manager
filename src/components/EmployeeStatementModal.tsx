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
import { Company, Employee, PayrollRun, LoanSchedule, AttendanceRecord } from '../types';
import { formatSAR, formatNumber, roundAmount } from '../utils/payrollEngine';

interface EmployeeStatementModalProps {
  employee: Employee | null;
  company: Company;
  payrollRuns: PayrollRun[];
  loans: LoanSchedule[];
  onClose: () => void;
}

export const EmployeeStatementModal: React.FC<EmployeeStatementModalProps> = ({
  employee,
  company,
  payrollRuns,
  loans,
  onClose,
}) => {
  if (!employee) return null;

  // Find employee's items in historical runs
  const employeeHistory = payrollRuns
    .map(run => {
      const item = run.items.find(i => i.employeeId === employee.id);
      return {
        run,
        item,
      };
    })
    .filter(h => h.item !== undefined);

  const activeLoan = loans.find(l => l.employeeId === employee.id && l.status === 'ACTIVE');
  const latestItem = employeeHistory[0]?.item;
  const latestRun = employeeHistory[0]?.run;

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
              كشف حساب الموظف وقسيمة الراتب التفصيلية
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة / تصدير PDF</span>
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
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">{company.nameAr}</h2>
              <div className="text-xs text-slate-500 font-medium">{company.nameEn}</div>
              <div className="text-xs text-slate-600 space-x-3 space-x-reverse">
                <span>س.ت: <strong>{company.crNumber}</strong></span>
                <span>الرقم الضريبي: <strong>{company.taxNumber}</strong></span>
                <span>رقم التأمينات: <strong>{company.gosiEstablishmentNo}</strong></span>
              </div>
            </div>

            <div className="text-left sm:text-right bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <div className="text-xs text-slate-500">كشف حساب وقسيمة راتب شهر:</div>
              <div className="text-lg font-black text-emerald-800">
                {latestRun?.periodMonth || '2026-08'}
              </div>
              <div className="text-[10px] text-slate-400">تاريخ الإصدار: {new Date().toISOString().split('T')[0]}</div>
            </div>
          </div>

          {/* Employee Information Card */}
          <div className="bg-slate-50/80 rounded-2xl p-4 sm:p-5 border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-500 block mb-0.5">اسم الموظف:</span>
              <span className="font-bold text-slate-900 text-sm">{employee.firstNameAr} {employee.lastNameAr}</span>
              <span className="text-[10px] text-slate-400 block">{employee.firstNameEn} {employee.lastNameEn}</span>
            </div>

            <div>
              <span className="text-slate-500 block mb-0.5">الرقم الوظيفي:</span>
              <span className="font-mono font-bold text-slate-900">{employee.employeeNo}</span>
            </div>

            <div>
              <span className="text-slate-500 block mb-0.5">الهوية / الإقامة:</span>
              <span className="font-mono font-bold text-slate-900">{employee.nationalIdOrIqama}</span>
            </div>

            <div>
              <span className="text-slate-500 block mb-0.5">الجنسية:</span>
              <span className="font-bold text-slate-900">
                {employee.nationality === 'SAUDI' ? 'سعودي (خاضع لـ GOSI)' : `${employee.country}`}
              </span>
            </div>

            <div>
              <span className="text-slate-500 block mb-0.5">القسم والوظيفة:</span>
              <span className="font-bold text-slate-900">{employee.department} - {employee.jobTitle}</span>
            </div>

            <div>
              <span className="text-slate-500 block mb-0.5">تاريخ التعيين:</span>
              <span className="font-bold text-slate-900">{employee.hireDate}</span>
            </div>

            <div>
              <span className="text-slate-500 block mb-0.5">البنك المحول إليه:</span>
              <span className="font-bold text-slate-900">{employee.bankName}</span>
            </div>

            <div>
              <span className="text-slate-500 block mb-0.5">رقم الآيبان (IBAN):</span>
              <span className="font-mono font-bold text-slate-900 text-[11px]">{employee.bankIban}</span>
            </div>
          </div>

          {/* Current Month Itemized Breakdown: Earnings vs Deductions */}
          {latestItem ? (
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                <span>تفاصيل قسيمة الراتب لشهر {latestRun?.periodMonth}</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Earnings (الاستحقاقات) */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="bg-emerald-50 px-4 py-2.5 font-bold text-xs text-emerald-900 border-b border-emerald-100 flex items-center justify-between">
                    <span>الاستحقاقات والبدلات (Earnings)</span>
                    <span>المبلغ (SAR)</span>
                  </div>
                  <div className="p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-700">
                      <span>الراتب الأساسي</span>
                      <span className="font-bold">{formatSAR(latestItem.baseSalary)}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-700">
                      <span>بدل السكن</span>
                      <span className="font-bold">{formatSAR(latestItem.housingAllowance)}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-700">
                      <span>بدل النقل والانتقال</span>
                      <span className="font-bold">{formatSAR(latestItem.transportAllowance)}</span>
                    </div>
                    {latestItem.otherAllowances > 0 && (
                      <div className="flex items-center justify-between text-slate-700">
                        <span>بدلات ومكافآت أخرى</span>
                        <span className="font-bold">{formatSAR(latestItem.otherAllowances)}</span>
                      </div>
                    )}
                    {latestItem.overtimeAmount > 0 && (
                      <div className="flex items-center justify-between text-emerald-800 font-semibold">
                        <span>عمل إضافي ({latestItem.overtimeHours} ساعة)</span>
                        <span className="font-bold">{formatSAR(latestItem.overtimeAmount)}</span>
                      </div>
                    )}

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between font-black text-sm text-slate-900">
                      <span>إجمالي المستحقات (Gross):</span>
                      <span>{formatSAR(latestItem.totalGrossSalary)}</span>
                    </div>
                  </div>
                </div>

                {/* Deductions (الاستقطاعات) */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="bg-rose-50 px-4 py-2.5 font-bold text-xs text-rose-900 border-b border-rose-100 flex items-center justify-between">
                    <span>الاستقطاعات والخصومات (Deductions)</span>
                    <span>المبلغ (SAR)</span>
                  </div>
                  <div className="p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-700">
                      <span>تأمينات اجتماعية (حصة الموظف GOSI)</span>
                      <span className="font-bold text-rose-600">{formatSAR(latestItem.gosiEmployeeShare)}</span>
                    </div>
                    {latestItem.delayDeduction > 0 && (
                      <div className="flex items-center justify-between text-slate-700">
                        <span>خصم تأخير الحضور ({latestItem.delayMinutes} دقيقة)</span>
                        <span className="font-bold text-rose-600">{formatSAR(latestItem.delayDeduction)}</span>
                      </div>
                    )}
                    {latestItem.absenceDeduction > 0 && (
                      <div className="flex items-center justify-between text-slate-700">
                        <span>خصم أيام الغياب ({latestItem.absenceDays} يوم)</span>
                        <span className="font-bold text-rose-600">{formatSAR(latestItem.absenceDeduction)}</span>
                      </div>
                    )}
                    {latestItem.unpaidLeaveDeduction > 0 && (
                      <div className="flex items-center justify-between text-slate-700">
                        <span>خصم إجازة بدون راتب ({latestItem.unpaidLeaveDays} يوم)</span>
                        <span className="font-bold text-rose-600">{formatSAR(latestItem.unpaidLeaveDeduction)}</span>
                      </div>
                    )}
                    {latestItem.loanDeduction > 0 && (
                      <div className="flex items-center justify-between text-slate-700">
                        <span>قسط سلفة الموظف الشهرية</span>
                        <span className="font-bold text-rose-600">{formatSAR(latestItem.loanDeduction)}</span>
                      </div>
                    )}
                    {latestItem.penaltiesDeduction > 0 && (
                      <div className="flex items-center justify-between text-slate-700">
                        <span>خصومات وجزاءات إدارية</span>
                        <span className="font-bold text-rose-600">{formatSAR(latestItem.penaltiesDeduction)}</span>
                      </div>
                    )}

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between font-black text-sm text-rose-700">
                      <span>إجمالي الاستقطاعات (Deductions):</span>
                      <span>{formatSAR(latestItem.totalDeductions)}</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Net Pay Grand Card */}
              <div className="mt-4 bg-emerald-800 text-white rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md">
                <div>
                  <span className="text-xs text-emerald-200 block">صافي الراتب المستحق للتحويل (Net Payable):</span>
                  <div className="text-2xl sm:text-3xl font-black font-mono mt-0.5">
                    {formatSAR(latestItem.netSalary)}
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <span className="text-[11px] text-emerald-200 block">مساهمة الشركة في التأمينات (حصة المنشأة):</span>
                  <span className="text-sm font-bold text-white font-mono">{formatSAR(latestItem.gosiEmployerShare)}</span>
                </div>
              </div>
            </div>
          ) : null}

          {/* Active Loan Ledger Section */}
          {activeLoan && (
            <div className="border border-slate-200 rounded-2xl p-4 bg-amber-50/50">
              <h3 className="text-xs font-bold text-amber-900 mb-2 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-amber-700" />
                <span>موقف سلف وأقساط الموظف الحالية</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block">إجمالي السلفة:</span>
                  <span className="font-bold text-slate-900">{formatSAR(activeLoan.totalAmount)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">القسط الشهري:</span>
                  <span className="font-bold text-slate-900">{formatSAR(activeLoan.monthlyInstallment)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">الأقساط المتبقية:</span>
                  <span className="font-bold text-slate-900">{activeLoan.remainingInstallments} شهر</span>
                </div>
                <div>
                  <span className="text-slate-500 block">الرصيد المتبقي:</span>
                  <span className="font-bold text-amber-800">{formatSAR(activeLoan.remainingAmount)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Historical Activity Table */}
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span>سجل مسيرات الرواتب السابقة للموظف</span>
            </h3>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                    <th className="py-2.5 px-3">الشهر والفترة</th>
                    <th className="py-2.5 px-3">الراتب الإجمالي</th>
                    <th className="py-2.5 px-3">الاستقطاعات</th>
                    <th className="py-2.5 px-3">صافي المحول</th>
                    <th className="py-2.5 px-3">حالة المسير</th>
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
              <span className="text-slate-500 block mb-8">إعداد مسؤول الرواتب</span>
              <div className="border-t border-slate-300 pt-1 font-semibold text-slate-700">التوقيع / التاريخ</div>
            </div>
            <div>
              <span className="text-slate-500 block mb-8">اعتماد مدير الموارد البشرية</span>
              <div className="border-t border-slate-300 pt-1 font-semibold text-slate-700">التوقيع / التاريخ</div>
            </div>
            <div>
              <span className="text-slate-500 block mb-8">الختم المالي والاعتماد</span>
              <div className="border-t border-slate-300 pt-1 font-semibold text-slate-700">ختم المنشأة</div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
