import React, { useMemo, useState } from 'react';
import { Banknote, CheckCircle2, Clock3, RefreshCcw, Search } from 'lucide-react';
import {
  AttendanceRecord,
  Company,
  Employee,
  LoanSchedule,
  PaymentMethod,
  PayrollRun,
  PayrollSettlement,
  PenaltyRecord,
  TemporaryEarningRecord,
  UserRole,
} from '../types';
import { calculateEmployeePayrollItem, formatSAR } from '../utils/payrollEngine';
import { useLanguage } from '../i18n/LanguageContext';

interface PayrollSettlementsViewProps {
  company: Company;
  employees: Employee[];
  payrollRuns: PayrollRun[];
  settlements: PayrollSettlement[];
  attendance: AttendanceRecord[];
  loans: LoanSchedule[];
  penalties: PenaltyRecord[];
  temporaryEarnings: TemporaryEarningRecord[];
  activeRole: UserRole;
  onSaveSettlement: (settlement: PayrollSettlement) => Promise<void> | void;
  onSavePayrollRun: (run: PayrollRun) => void;
}

type Candidate = {
  key: string;
  employee: Employee;
  periodMonth: string;
  amount: number;
  reason: PayrollSettlement['reason'];
  sourcePayrollRunId?: string;
  sourcePayrollItemId?: string;
  periodStart: string;
  periodEnd: string;
};

const monthEnd = (periodMonth: string) => {
  const [year, month] = periodMonth.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${periodMonth}-${String(last).padStart(2, '0')}`;
};

export const PayrollSettlementsView: React.FC<PayrollSettlementsViewProps> = ({
  company,
  employees,
  payrollRuns,
  settlements,
  attendance,
  loans,
  penalties,
  temporaryEarnings,
  onSaveSettlement,
  onSavePayrollRun,
}) => {
  const { language } = useLanguage();
  const tr = (ar: string, en: string) => language === 'ar' ? ar : en;
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');

  const companyEmployees = useMemo(() => employees.filter(employee => employee.companyId === company.id), [employees, company.id]);
  const companyRuns = useMemo(() => payrollRuns.filter(run => run.companyId === company.id), [payrollRuns, company.id]);
  const companySettlements = useMemo(() => settlements.filter(item => item.companyId === company.id), [settlements, company.id]);

  const paidPayrollKeys = useMemo(() => {
    const result = new Set<string>();
    companyRuns.forEach(run => (run.paymentBatches || []).filter(batch => ['SCHEDULED', 'PAID'].includes(batch.status)).forEach(batch => {
      (batch.employeeIds || []).forEach(employeeId => result.add(`${run.id}:${employeeId}`));
      (batch.priorEntitlements || []).forEach(ref => result.add(`${ref.sourcePayrollRunId}:${ref.employeeId}`));
    }));
    return result;
  }, [companyRuns]);

  const settlementKeys = useMemo(() => new Set(companySettlements.filter(item => item.status !== 'REVERSED').map(item => item.dedupeKey)), [companySettlements]);

  const candidates = useMemo<Candidate[]>(() => {
    const result: Candidate[] = [];
    for (const run of companyRuns.filter(item => ['APPROVED', 'POSTED'].includes(item.status))) {
      for (const item of run.items) {
        const employee = companyEmployees.find(candidate => candidate.id === item.employeeId);
        if (!employee || Number(item.netSalary || 0) <= 0) continue;
        const isHeld = (item.entitlementStatus || 'PAYABLE') === 'HELD';
        if (!isHeld || paidPayrollKeys.has(`${run.id}:${item.employeeId}`)) continue;
        const key = `HELD:${run.id}:${item.id}`;
        if (settlementKeys.has(key)) continue;
        result.push({
          key,
          employee,
          periodMonth: run.periodMonth,
          amount: Number(item.netSalary || 0),
          reason: 'HELD_PAYROLL',
          sourcePayrollRunId: run.id,
          sourcePayrollItemId: item.id,
          periodStart: run.startDate || `${run.periodMonth}-01`,
          periodEnd: run.endDate || monthEnd(run.periodMonth),
        });
      }

      for (const employee of companyEmployees) {
        if (!employee.salaryStartDate || employee.salaryStartDate > (run.endDate || monthEnd(run.periodMonth))) continue;
        if (run.items.some(item => item.employeeId === employee.id)) continue;
        const key = `RETRO:${employee.id}:${run.periodMonth}`;
        if (settlementKeys.has(key) || paidPayrollKeys.has(`${run.id}:${employee.id}`)) continue;
        const calculated = calculateEmployeePayrollItem({
          employee,
          company,
          periodMonth: run.periodMonth,
          attendanceRecords: attendance.filter(row => row.employeeId === employee.id && row.periodMonth === run.periodMonth),
          activeLoans: loans.filter(row => row.employeeId === employee.id && row.startDate <= run.periodMonth),
          penalties: penalties.filter(row => row.employeeId === employee.id && row.periodMonth === run.periodMonth && row.appliedInPayroll !== false),
          temporaryEarnings: temporaryEarnings.filter(row => row.employeeId === employee.id && row.periodMonth === run.periodMonth && row.appliedInPayroll !== false),
        });
        if (Number(calculated.netSalary || 0) <= 0) continue;
        result.push({
          key,
          employee,
          periodMonth: run.periodMonth,
          amount: Number(calculated.netSalary || 0),
          reason: 'RETROACTIVE_EMPLOYEE',
          sourcePayrollRunId: run.id,
          periodStart: employee.salaryStartDate > `${run.periodMonth}-01` ? employee.salaryStartDate : `${run.periodMonth}-01`,
          periodEnd: run.endDate || monthEnd(run.periodMonth),
        });
      }
    }
    return result.sort((a, b) => a.periodMonth.localeCompare(b.periodMonth) || a.employee.employeeNo.localeCompare(b.employee.employeeNo));
  }, [companyRuns, companyEmployees, paidPayrollKeys, settlementKeys, attendance, loans, penalties, temporaryEarnings, company]);

  const filtered = candidates.filter(candidate => {
    const haystack = `${candidate.employee.employeeNo} ${candidate.employee.firstNameAr} ${candidate.employee.lastNameAr} ${candidate.periodMonth}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });
  const selected = candidates.find(candidate => candidate.key === selectedKey);

  const payCandidate = async () => {
    if (!selected) return;
    if (method !== 'CASH' && !String(selected.employee.bankIban || '').startsWith('SA')) {
      alert(tr('لا يمكن إنشاء تحويل بنكي بدون آيبان سعودي صالح. يمكن إبقاء الاستحقاق معلقًا أو اختيار نقدي.', 'A bank settlement requires a valid Saudi IBAN. Keep it pending or choose cash.'));
      return;
    }
    const now = new Date().toISOString();
    const settlement: PayrollSettlement = {
      id: `settlement-${company.id}-${Date.now()}`,
      companyId: company.id,
      employeeId: selected.employee.id,
      employeeNo: selected.employee.employeeNo,
      employeeName: `${selected.employee.firstNameAr} ${selected.employee.lastNameAr}`.trim(),
      periodMonth: selected.periodMonth,
      periodStart: selected.periodStart,
      periodEnd: selected.periodEnd,
      amount: selected.amount,
      reason: selected.reason,
      sourcePayrollRunId: selected.sourcePayrollRunId,
      sourcePayrollItemId: selected.sourcePayrollItemId,
      dedupeKey: selected.key,
      status: 'PAID',
      paymentMethod: method,
      paymentDate,
      paymentReference: reference.trim(),
      createdAt: now,
      paidAt: now,
    };
    await onSaveSettlement(settlement);

    if (selected.sourcePayrollRunId && selected.sourcePayrollItemId) {
      const run = companyRuns.find(item => item.id === selected.sourcePayrollRunId);
      if (run) {
        onSavePayrollRun({
          ...run,
          items: run.items.map(item => item.id === selected.sourcePayrollItemId ? {
            ...item,
            entitlementStatus: 'SETTLED',
            entitlementReason: item.entitlementReason || 'SETTLED_VIA_PAYROLL_SETTLEMENT',
            entitlementUpdatedAt: now,
          } : item),
        });
      }
    }
    setSelectedKey('');
    setReference('');
  };

  return (
    <div className="space-y-5" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">{tr('تسويات الرواتب', 'Payroll Settlements')}</h2>
          <p className="mt-1 text-xs text-slate-500">{tr('سداد الرواتب المعلقة والمستحقات بأثر رجعي بدون إعادة فتح ما تم تحويله سابقًا.', 'Pay held and retroactive salary without reopening payroll already transferred.')}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
          {tr('مستحقات جاهزة للتسوية:', 'Ready to settle:')} {filtered.length}
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder={tr('بحث بالموظف أو الشهر', 'Search employee or month')} className="w-full rounded-xl border border-slate-200 bg-white py-2 pr-9 pl-3 text-sm" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600"><tr>
              <th className="px-3 py-3 text-start">{tr('الموظف', 'Employee')}</th><th className="px-3 py-3 text-start">{tr('الفترة', 'Period')}</th><th className="px-3 py-3 text-start">{tr('النوع', 'Type')}</th><th className="px-3 py-3 text-end">{tr('المستحق', 'Due')}</th><th className="px-3 py-3"></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(candidate => <tr key={candidate.key}>
                <td className="px-3 py-3"><div className="font-bold text-slate-900">{candidate.employee.firstNameAr} {candidate.employee.lastNameAr}</div><div className="font-mono text-[10px] text-slate-500">{candidate.employee.employeeNo}</div></td>
                <td className="px-3 py-3"><div className="font-bold">{candidate.periodMonth}</div><div className="text-[10px] text-slate-500">{candidate.periodStart} → {candidate.periodEnd}</div></td>
                <td className="px-3 py-3">{candidate.reason === 'HELD_PAYROLL' ? tr('راتب معلق', 'Held payroll') : tr('موظف مضاف بأثر رجعي', 'Retroactive employee')}</td>
                <td className="px-3 py-3 text-end font-black">{formatSAR(candidate.amount)}</td>
                <td className="px-3 py-3 text-end"><button onClick={() => setSelectedKey(candidate.key)} className="rounded-lg bg-emerald-600 px-3 py-2 font-bold text-white hover:bg-emerald-700">{tr('سداد', 'Pay')}</button></td>
              </tr>)}
              {!filtered.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">{tr('لا توجد مستحقات غير مسددة مطابقة.', 'No matching unpaid entitlements.')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
        <div className="mb-3 flex items-center justify-between"><div><div className="font-black text-slate-900">{selected.employee.firstNameAr} {selected.employee.lastNameAr}</div><div className="text-xs text-slate-500">{selected.periodMonth} · {formatSAR(selected.amount)}</div></div><Banknote className="h-5 w-5 text-emerald-700" /></div>
        <div className="grid gap-3 md:grid-cols-3">
          <select value={method} onChange={event => setMethod(event.target.value as PaymentMethod)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><option value="BANK_TRANSFER">{tr('تحويل بنكي', 'Bank transfer')}</option><option value="WPS">WPS</option><option value="CASH">{tr('نقدي', 'Cash')}</option></select>
          <input type="date" value={paymentDate} onChange={event => setPaymentDate(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
          <input value={reference} onChange={event => setReference(event.target.value)} placeholder={tr('مرجع الدفع', 'Payment reference')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
        </div>
        <div className="mt-3 flex justify-end gap-2"><button onClick={() => setSelectedKey('')} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold">{tr('إلغاء', 'Cancel')}</button><button onClick={payCandidate} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white"><CheckCircle2 className="h-4 w-4" />{tr('تأكيد السداد', 'Confirm payment')}</button></div>
      </div>}

      {companySettlements.length > 0 && <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2 font-black text-slate-900"><Clock3 className="h-4 w-4" />{tr('آخر التسويات المسددة', 'Recent paid settlements')}</div>
        <div className="space-y-2">{companySettlements.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,20).map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs"><span><strong>{item.employeeName}</strong> · {item.periodMonth} · {item.paymentDate}</span><span className="font-black">{formatSAR(item.amount)}</span></div>)}</div>
      </div>}
    </div>
  );
};
