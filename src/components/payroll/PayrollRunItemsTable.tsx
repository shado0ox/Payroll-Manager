import React from 'react';
import { FileText, PencilLine } from 'lucide-react';
import type { Employee, PayrollEntitlementStatus, PayrollPaymentBatch, PayrollRun, PayrollRunItem } from '../../types';
import { formatSAR } from '../../utils/payrollEngine';

const PAYMENT_STATUS_CONFIG = {
  SCHEDULED: { labelAr: 'مجدولة للتحويل', labelEn: 'Scheduled', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
  PAID: { labelAr: 'تم التحويل', labelEn: 'Paid', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  FAILED: { labelAr: 'فشل التحويل', labelEn: 'Failed', classes: 'bg-rose-50 text-rose-700 border-rose-200' },
  CANCELLED: { labelAr: 'ملغاة', labelEn: 'Cancelled', classes: 'bg-slate-100 text-slate-600 border-slate-200' },
} as const;

const ENTITLEMENT_CONFIG = {
  PAYABLE: { labelAr: 'مستحق للدفع', labelEn: 'Payable', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  HELD: { labelAr: 'راتب معلق', labelEn: 'Held', classes: 'bg-amber-50 text-amber-800 border-amber-200' },
  UNDER_SETTLEMENT: { labelAr: 'تحت التسوية', labelEn: 'Under Settlement', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
  SETTLED: { labelAr: 'مسوى نهائيًا', labelEn: 'Settled', classes: 'bg-purple-50 text-purple-700 border-purple-200' },
  CANCELLED_WITH_DOCUMENT: { labelAr: 'ملغى بمستند', labelEn: 'Cancelled with Document', classes: 'bg-slate-100 text-slate-700 border-slate-200' },
} as const;

interface Props {
  currentRun?: PayrollRun;
  filteredItems: PayrollRunItem[];
  eligibleFilteredItems: PayrollRunItem[];
  selectedPaymentEmployeeIds: string[];
  employees: Employee[];
  committedEmployeeIds: Set<string>;
  language: 'ar' | 'en';
  onToggleAllEligible: () => void;
  onTogglePaymentEmployee: (employeeId: string) => void;
  getEmployeePaymentBatch: (employeeId: string) => PayrollPaymentBatch | undefined;
  onEntitlementStatusChange: (item: PayrollRunItem, status: PayrollEntitlementStatus) => void;
  onOpenAdjustment: (item: PayrollRunItem) => void;
  onViewEmployeeStatement: (employee: Employee) => void;
  tr: (ar: string, en: string) => string;
}

export const PayrollRunItemsTable = React.memo(function PayrollRunItemsTable({
  currentRun, filteredItems, eligibleFilteredItems, selectedPaymentEmployeeIds, employees,
  committedEmployeeIds, language, onToggleAllEligible, onTogglePaymentEmployee,
  getEmployeePaymentBatch, onEntitlementStatusChange, onOpenAdjustment,
  onViewEmployeeStatement, tr,
}: Props) {
  const toggleAllEligibleEmployees = onToggleAllEligible;
  const togglePaymentEmployee = onTogglePaymentEmployee;
  const handleEntitlementStatusChange = onEntitlementStatusChange;
  const openAdjustmentModal = onOpenAdjustment;

  const renderEntitlement = (item: PayrollRunItem, paymentBatch?: PayrollPaymentBatch) => {
    const entitlementStatus = item.entitlementStatus || 'PAYABLE';
    if (paymentBatch) {
      return (
        <span className={`inline-flex px-1.5 py-0.5 rounded border text-[9px] font-bold ${PAYMENT_STATUS_CONFIG[paymentBatch.status].classes}`}>
          {language === 'ar' ? PAYMENT_STATUS_CONFIG[paymentBatch.status].labelAr : PAYMENT_STATUS_CONFIG[paymentBatch.status].labelEn}
        </span>
      );
    }
    return (
      <span className={`inline-flex px-1.5 py-0.5 rounded border text-[9px] font-bold ${ENTITLEMENT_CONFIG[entitlementStatus].classes}`}>
        {language === 'ar' ? ENTITLEMENT_CONFIG[entitlementStatus].labelAr : ENTITLEMENT_CONFIG[entitlementStatus].labelEn}
      </span>
    );
  };

  return (
    <div className="w-full">
      {/* Mobile: compact employee identity first, details expand only when needed. */}
      <div className="md:hidden space-y-2">
        {!currentRun || filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white py-10 text-center text-xs text-slate-400">
            {tr('لا توجد بنود رواتب مطابقة للبحث أو الفترة', 'No payroll items match this search or period')}
          </div>
        ) : filteredItems.map((item, idx) => {
          const emp = employees.find(e => e.id === item.employeeId);
          const hasWarning = (item.warningFlags || []).length > 0;
          const paymentBatch = getEmployeePaymentBatch(item.employeeId);
          const entitlementStatus = item.entitlementStatus || 'PAYABLE';
          const canSelectForPayment = entitlementStatus === 'PAYABLE' && item.netSalary > 0 && !committedEmployeeIds.has(item.employeeId);
          const identity = emp?.nationalIdOrIqama || emp?.iqamaNumber || emp?.entryNumber || '—';
          const nationality = emp?.nationality === 'SAUDI'
            ? tr('سعودي', 'Saudi')
            : (emp?.country || tr('غير سعودي', 'Non-Saudi'));

          return (
            <details key={`${item.id || 'item'}-mobile-${idx}`} className={`group rounded-2xl border bg-white shadow-xs ${item.isSuspended || hasWarning ? 'border-amber-200' : 'border-slate-200'}`}>
              <summary className="list-none cursor-pointer px-3 py-3 [&::-webkit-details-marker]:hidden">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    disabled={!canSelectForPayment}
                    checked={selectedPaymentEmployeeIds.includes(item.employeeId)}
                    onChange={() => togglePaymentEmployee(item.employeeId)}
                    onClick={event => event.stopPropagation()}
                    className="mt-1 accent-emerald-600 disabled:opacity-30"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-extrabold text-slate-900">{item.employeeName}</span>
                      {renderEntitlement(item, paymentBatch)}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      <span>{tr('الإقامة/الهوية', 'ID/Iqama')}: <b className="font-mono text-slate-700">{identity}</b></span>
                      <span>{tr('الجنسية', 'Nationality')}: <b className="text-slate-700">{nationality}</b></span>
                    </div>
                    {hasWarning && <div className="mt-1 truncate text-[10px] font-semibold text-amber-700">⚠️ {(item.warningFlags || [])[0]}</div>}
                  </div>
                  <span aria-hidden className="mt-1 shrink-0 text-lg leading-none text-slate-400 transition-transform group-open:rotate-180">⌄</span>
                </div>
              </summary>

              <div className="border-t border-slate-100 px-3 pb-3 pt-2">
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                  <div><span className="text-slate-400">{tr('الرقم الوظيفي', 'Employee no.')}</span><div className="font-mono font-bold text-slate-800">{item.employeeNo}</div></div>
                  <div><span className="text-slate-400">{tr('القسم', 'Department')}</span><div className="font-bold text-slate-800">{item.department || '—'}</div></div>
                  <div><span className="text-slate-400">{tr('الأساسي', 'Basic')}</span><div className="font-bold text-slate-900">{formatSAR(item.baseSalary)}</div></div>
                  <div><span className="text-slate-400">{tr('البدلات', 'Allowances')}</span><div className="font-bold text-slate-900">{formatSAR(item.housingAllowance + item.transportAllowance + item.otherAllowances)}</div></div>
                  <div><span className="text-slate-400">{tr('المستحق', 'Gross')}</span><div className="font-bold text-slate-900">{formatSAR(item.totalGrossSalary)}</div></div>
                  <div><span className="text-slate-400">{tr('الغياب/التأخير', 'Absence/late')}</span><div className="font-bold text-rose-700">{formatSAR(item.delayDeduction + item.absenceDeduction + item.unpaidLeaveDeduction)}</div></div>
                  <div><span className="text-slate-400">{tr('التأمينات', 'GOSI')}</span><div className="font-bold text-slate-800">{formatSAR(item.gosiEmployeeShare)}</div></div>
                  <div><span className="text-slate-400">{tr('السلف', 'Loans')}</span><div className="font-bold text-slate-800">{formatSAR(item.loanDeduction)}</div></div>
                  <div><span className="text-slate-400">{tr('إجمالي الخصم', 'Deductions')}</span><div className="font-bold text-rose-700">{formatSAR(item.totalDeductions)}</div></div>
                  <div><span className="text-slate-400">{tr('صافي الراتب', 'Net salary')}</span><div className="font-extrabold text-emerald-800">{formatSAR(item.netSalary)}</div></div>
                </div>

                {!paymentBatch && ['APPROVED', 'POSTED'].includes(currentRun.status) && (
                  <select value={entitlementStatus} onChange={event => handleEntitlementStatusChange(item, event.target.value as PayrollEntitlementStatus)} className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-[11px] font-bold">
                    {Object.entries(ENTITLEMENT_CONFIG).map(([status, config]) => <option key={status} value={status}>{language === 'ar' ? config.labelAr : config.labelEn}</option>)}
                  </select>
                )}
                <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2">
                  {['UNDER_REVIEW', 'APPROVED'].includes(currentRun.status) && (
                    <button type="button" onClick={() => openAdjustmentModal(item)} className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[10px] font-bold text-blue-700">
                      <PencilLine className="h-3.5 w-3.5" /> {tr('تعديل إضافة أو خصم', 'Edit adjustment')}
                    </button>
                  )}
                  <button type="button" disabled={!emp} onClick={() => emp && onViewEmployeeStatement(emp)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold text-emerald-700 disabled:opacity-40">
                    <FileText className="h-3.5 w-3.5" /> {tr('القسيمة', 'Payslip')}
                  </button>
                </div>
              </div>
            </details>
          );
        })}
      </div>

      {/* Desktop/tablet keeps the full accounting grid. */}
      <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden w-full">
        <table className="w-full text-right text-xs table-fixed divide-y divide-slate-100">
          <thead>
            <tr className="bg-slate-800 text-white font-bold border-b border-slate-700 text-[11px]">
              <th className="py-2.5 px-2 w-[15%] text-right font-bold">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={eligibleFilteredItems.length > 0 && eligibleFilteredItems.every(item => selectedPaymentEmployeeIds.includes(item.employeeId))} onChange={toggleAllEligibleEmployees} className="accent-emerald-500" />
                  <span>{tr('الموظف والرقم', 'Employee & number')}</span>
                </div>
              </th>
              <th className="py-2.5 px-1.5 w-[8%] text-start font-bold">{tr('القسم', 'Department')}</th>
              <th className="py-2.5 px-1.5 w-[7%] text-start font-bold">{tr('الأساسي', 'Basic')}</th>
              <th className="py-2.5 px-1.5 w-[8%] text-start font-bold">{tr('البدلات', 'Allowances')}</th>
              <th className="py-2.5 px-1.5 w-[6%] text-start font-bold">{tr('إضافات', 'Additions')}</th>
              <th className="py-2.5 px-1.5 w-[9%] text-start font-bold">{tr('المستحق (Gross)', 'Gross pay')}</th>
              <th className="py-2.5 px-1.5 w-[7%] text-start font-bold text-rose-300">{tr('الغياب/التأخير', 'Absence / late')}</th>
              <th className="py-2.5 px-1.5 w-[7%] text-start font-bold text-rose-300">{tr('تأمينات', 'GOSI')}</th>
              <th className="py-2.5 px-1.5 w-[6%] text-start font-bold text-rose-300">{tr('السلف', 'Loans')}</th>
              <th className="py-2.5 px-1.5 w-[8%] text-start font-bold text-rose-300">{tr('الخصم', 'Deductions')}</th>
              <th className="py-2.5 px-1.5 w-[10%] text-start font-bold text-emerald-300">{tr('صافي الراتب', 'Net salary')}</th>
              <th className="py-2.5 px-1.5 w-[6%] text-start font-bold text-purple-300">{tr('المنشأة', 'Employer')}</th>
              <th className="py-2.5 px-1 w-[3%] text-center font-bold">{tr('قسيمة', 'Payslip')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {!currentRun || filteredItems.length === 0 ? (
              <tr><td colSpan={13} className="py-12 text-center text-slate-400">{tr('لا توجد بنود رواتب مطابقة للبحث أو الفترة', 'No payroll items match this search or period')}</td></tr>
            ) : filteredItems.map((item, idx) => {
              const emp = employees.find(e => e.id === item.employeeId);
              const hasWarning = (item.warningFlags || []).length > 0;
              const paymentBatch = getEmployeePaymentBatch(item.employeeId);
              const entitlementStatus = item.entitlementStatus || 'PAYABLE';
              const canSelectForPayment = entitlementStatus === 'PAYABLE' && item.netSalary > 0 && !committedEmployeeIds.has(item.employeeId);
              return (
                <tr key={`${item.id || 'item'}-${idx}`} className={`hover:bg-slate-50 transition-colors text-[11px] ${item.isSuspended ? 'bg-amber-50/40' : (hasWarning ? 'bg-amber-50/20' : '')}`}>
                  <td className="py-2.5 px-2 truncate">
                    <div className="flex items-start gap-2">
                      <input type="checkbox" disabled={!canSelectForPayment} checked={selectedPaymentEmployeeIds.includes(item.employeeId)} onChange={() => togglePaymentEmployee(item.employeeId)} className="mt-0.5 accent-emerald-600 disabled:opacity-30" />
                      <div className="min-w-0 grow">
                        <div className="font-bold text-slate-900 flex items-center gap-1 truncate"><span className="truncate">{item.employeeName}</span><span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.gosiEnabled === false ? 'bg-slate-300' : 'bg-emerald-500'}`} /></div>
                        <div className="text-[10px] text-slate-400 font-mono">{item.employeeNo}</div>
                        <div className="mt-0.5">{renderEntitlement(item, paymentBatch)}</div>
                        {!paymentBatch && ['APPROVED', 'POSTED'].includes(currentRun.status) && (
                          <select value={entitlementStatus} onChange={event => handleEntitlementStatusChange(item, event.target.value as PayrollEntitlementStatus)} className="block mt-1 max-w-full px-1.5 py-1 rounded-lg border border-slate-200 bg-white text-[9px] font-bold">
                            {Object.entries(ENTITLEMENT_CONFIG).map(([status, config]) => <option key={status} value={status}>{language === 'ar' ? config.labelAr : config.labelEn}</option>)}
                          </select>
                        )}
                        {item.entitlementReason && <div className="text-[9px] text-slate-500 mt-0.5 truncate">{item.entitlementReason}{item.entitlementDocumentRef ? ` • ${item.entitlementDocumentRef}` : ''}</div>}
                        {['UNDER_REVIEW', 'APPROVED'].includes(currentRun.status) && <button type="button" onClick={() => openAdjustmentModal(item)} className="mt-1 text-[9px] font-bold text-blue-700 hover:text-blue-900 inline-flex items-center gap-1"><PencilLine className="w-3 h-3" /> {tr('تعديل إضافة أو خصم', 'Edit addition or deduction')}</button>}
                      </div>
                    </div>
                    {hasWarning && <div className="text-[9px] text-amber-700 font-semibold truncate mt-0.5">⚠️ {(item.warningFlags || [])[0]}</div>}
                  </td>
                  <td className="py-2.5 px-1.5 text-slate-600 truncate font-medium">{item.department}</td>
                  <td className="py-2.5 px-1.5 font-semibold text-slate-800 whitespace-nowrap">{formatSAR(item.baseSalary)}</td>
                  <td className="py-2.5 px-1.5 text-slate-600 whitespace-nowrap">{formatSAR(item.housingAllowance + item.transportAllowance + item.otherAllowances)}</td>
                  <td className="py-2.5 px-1.5 whitespace-nowrap">{formatSAR(item.overtimeAmount + item.bonuses + Number(item.priorPeriodNet || 0))}</td>
                  <td className="py-2.5 px-1.5 font-bold text-slate-900 whitespace-nowrap">{formatSAR(item.totalGrossSalary)}</td>
                  <td className="py-2.5 px-1.5 text-rose-600 whitespace-nowrap">{formatSAR(item.delayDeduction + item.absenceDeduction + item.unpaidLeaveDeduction)}</td>
                  <td className="py-2.5 px-1.5 text-slate-700 font-medium whitespace-nowrap">{item.gosiEmployeeShare > 0 ? formatSAR(item.gosiEmployeeShare) : item.nationality === 'NON_SAUDI' && item.gosiEnabled !== false && item.gosiEmployerShare > 0 ? <span className="text-[9px] font-bold text-purple-700">{tr('على الشركة فقط', 'Employer only')}</span> : <span className="text-slate-300">-</span>}</td>
                  <td className="py-2.5 px-1.5 text-slate-700 whitespace-nowrap">{item.loanDeduction > 0 ? formatSAR(item.loanDeduction) : <span className="text-slate-300">-</span>}</td>
                  <td className="py-2.5 px-1.5 font-bold text-rose-700 whitespace-nowrap">{formatSAR(item.totalDeductions)}</td>
                  <td className="py-2.5 px-1.5 font-extrabold text-emerald-800 font-mono bg-emerald-50/40 whitespace-nowrap">{formatSAR(item.netSalary)}</td>
                  <td className="py-2.5 px-1.5 text-purple-700 font-medium whitespace-nowrap">{formatSAR(item.gosiEmployerShare)}</td>
                  <td className="py-2.5 px-1 text-center"><button onClick={() => { if (emp) onViewEmployeeStatement(emp); }} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg"><FileText className="w-3.5 h-3.5" /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});
