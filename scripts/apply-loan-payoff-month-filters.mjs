import fs from 'node:fs';

function patchFile(relativePath, transform) {
  const url = new URL(`../${relativePath}`, import.meta.url);
  const source = fs.readFileSync(url, 'utf8');
  const next = transform(source);
  if (next !== source) fs.writeFileSync(url, next);
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Missing loan payoff/month filter anchor: ${label}`);
  return source.replace(before, after);
}

// Derive the open balance from finalized payroll history. This prevents a fully
// deducted loan from appearing again while keeping payroll reversals auditable.
patchFile('src/components/PayrollRunsView.tsx', initial => replaceOnce(
  initial,
  `        const empLoans = loans.filter(l => l.employeeId === emp.id);`,
  `        const employeeLoanRows = loans
          .filter(l => l.employeeId === emp.id)
          .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
        const loanBalances = new Map(employeeLoanRows.map(loan => [loan.id, Math.max(0, Number(loan.remainingAmount) || 0)]));
        payrollRuns
          .filter(candidate => candidate.companyId === company.id
            && candidate.periodMonth < selectedPeriod
            && ['APPROVED', 'POSTED'].includes(candidate.status))
          .sort((a, b) => a.periodMonth.localeCompare(b.periodMonth))
          .forEach(candidate => {
            let paid = Math.max(0, Number(candidate.items.find(item => item.employeeId === emp.id)?.loanDeduction) || 0);
            for (const loan of employeeLoanRows) {
              if (paid <= 0 || loan.startDate > candidate.periodMonth) continue;
              const balance = loanBalances.get(loan.id) || 0;
              const applied = Math.min(balance, paid);
              loanBalances.set(loan.id, Number((balance - applied).toFixed(2)));
              paid = Number((paid - applied).toFixed(2));
            }
          });
        const empLoans = employeeLoanRows.map(loan => {
          const remainingAmount = loanBalances.get(loan.id) || 0;
          return {
            ...loan,
            remainingAmount,
            remainingInstallments: remainingAmount === 0
              ? 0
              : loan.monthlyInstallment > 0 ? Math.ceil(remainingAmount / loan.monthlyInstallment) : loan.remainingInstallments,
            status: remainingAmount === 0 ? 'COMPLETED' as const : loan.status,
          };
        });`,
  'payroll effective loan balances',
));

// Show the same derived balance/status in the loans screen.
patchFile('src/components/LoansPenaltiesView.tsx', initial => {
  let source = initial;
  source = replaceOnce(
    source,
    `import { Company, Employee, LoanSchedule, PenaltyRecord, TemporaryEarningRecord, UserRole } from '../types';`,
    `import { Company, Employee, LoanSchedule, PenaltyRecord, TemporaryEarningRecord, PayrollRun, UserRole } from '../types';`,
    'payroll run type import',
  );
  source = replaceOnce(
    source,
    `  temporaryEarnings: TemporaryEarningRecord[];
  activeRole: UserRole;`,
    `  temporaryEarnings: TemporaryEarningRecord[];
  payrollRuns: PayrollRun[];
  activeRole: UserRole;`,
    'payroll runs prop type',
  );
  source = replaceOnce(
    source,
    `  temporaryEarnings,
  activeRole,`,
    `  temporaryEarnings,
  payrollRuns,
  activeRole,`,
    'payroll runs prop destructure',
  );
  source = replaceOnce(
    source,
    `  const [editingPenalty, setEditingPenalty] = useState<PenaltyRecord | null>(null);`,
    `  const [editingPenalty, setEditingPenalty] = useState<PenaltyRecord | null>(null);
  const [penaltyPeriodFrom, setPenaltyPeriodFrom] = useState(currentPeriod);
  const [penaltyPeriodTo, setPenaltyPeriodTo] = useState(currentPeriod);`,
    'penalty period filter state',
  );
  source = replaceOnce(
    source,
    `  const companyLoans = useMemo(() => {
    return loans.filter(l => l.companyId === company.id);
  }, [loans, company.id]);`,
    `  const companyLoans = useMemo(() => {
    const rows = loans
      .filter(loan => loan.companyId === company.id)
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
    const balances = new Map(rows.map(loan => [loan.id, Math.max(0, Number(loan.remainingAmount) || 0)]));
    payrollRuns
      .filter(run => run.companyId === company.id && ['APPROVED', 'POSTED'].includes(run.status))
      .sort((a, b) => a.periodMonth.localeCompare(b.periodMonth))
      .forEach(run => {
        const deductions = new Map(run.items.map(item => [item.employeeId, Math.max(0, Number(item.loanDeduction) || 0)]));
        for (const loan of rows) {
          if (loan.startDate > run.periodMonth) continue;
          const paid = deductions.get(loan.employeeId) || 0;
          if (paid <= 0) continue;
          const balance = balances.get(loan.id) || 0;
          const applied = Math.min(balance, paid);
          balances.set(loan.id, Number((balance - applied).toFixed(2)));
          deductions.set(loan.employeeId, Number((paid - applied).toFixed(2)));
        }
      });
    return rows.map(loan => {
      const remainingAmount = balances.get(loan.id) || 0;
      return {
        ...loan,
        remainingAmount,
        remainingInstallments: remainingAmount === 0
          ? 0
          : loan.monthlyInstallment > 0 ? Math.ceil(remainingAmount / loan.monthlyInstallment) : loan.remainingInstallments,
        status: remainingAmount === 0 ? 'COMPLETED' as const : loan.status,
      };
    });
  }, [loans, payrollRuns, company.id]);`,
    'loans screen effective balances',
  );
  source = replaceOnce(
    source,
    `  const companyPenalties = useMemo(() => {
    return penalties.filter(p => p.companyId === company.id);
  }, [penalties, company.id]);`,
    `  const companyPenalties = useMemo(() => {
    return penalties.filter(p => p.companyId === company.id);
  }, [penalties, company.id]);

  const filteredPenalties = useMemo(() => companyPenalties.filter(penalty =>
    penalty.periodMonth >= penaltyPeriodFrom && penalty.periodMonth <= penaltyPeriodTo
  ), [companyPenalties, penaltyPeriodFrom, penaltyPeriodTo]);`,
    'filtered penalties',
  );
  source = replaceOnce(
    source,
    `        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">`,
    `        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-slate-50/70 p-4">
            <div><label className="mb-1 block text-[11px] font-bold text-slate-600">{tr('من شهر', 'From month')}</label><input type="month" value={penaltyPeriodFrom} onChange={event => setPenaltyPeriodFrom(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs" /></div>
            <div><label className="mb-1 block text-[11px] font-bold text-slate-600">{tr('إلى شهر', 'To month')}</label><input type="month" value={penaltyPeriodTo} min={penaltyPeriodFrom} onChange={event => setPenaltyPeriodTo(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs" /></div>
            <button type="button" onClick={() => { setPenaltyPeriodFrom(currentPeriod); setPenaltyPeriodTo(currentPeriod); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">{tr('الشهر الحالي', 'Current month')}</button>
            <span className="text-[11px] text-slate-500">{tr('النتائج', 'Results')}: {filteredPenalties.length}</span>
          </div>
          <div className="overflow-x-auto">`,
    'penalty filter controls',
  );
  source = replaceOnce(source, `{companyPenalties.map((pen) => {`, `{filteredPenalties.map((pen) => {`, 'filtered penalty rows');
  return source;
});

patchFile('src/App.tsx', initial => replaceOnce(
  initial,
  `                temporaryEarnings={state.temporaryEarnings}
                activeRole={state.activeRole}`,
  `                temporaryEarnings={state.temporaryEarnings}
                payrollRuns={state.payrollRuns}
                activeRole={state.activeRole}`,
  'pass payroll history to loan screen',
));

// Default temporary earnings to the current month, with an inclusive month range.
patchFile('src/components/TemporaryEarningsPanel.tsx', initial => {
  let source = initial;
  source = replaceOnce(
    source,
    `  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: '', periodMonth: currentPeriod, date: today, type: 'COMMISSION' as TemporaryEarningType, amount: 0, reason: '' });`,
    `  const [isOpen, setIsOpen] = useState(false);
  const [periodFrom, setPeriodFrom] = useState(currentPeriod);
  const [periodTo, setPeriodTo] = useState(currentPeriod);
  const [form, setForm] = useState({ employeeId: '', periodMonth: currentPeriod, date: today, type: 'COMMISSION' as TemporaryEarningType, amount: 0, reason: '' });`,
    'earning filter state',
  );
  source = replaceOnce(
    source,
    `  const totalActive = companyEarnings.filter(item => item.appliedInPayroll).reduce((sum, item) => sum + item.amount, 0);`,
    `  const filteredEarnings = companyEarnings.filter(item => item.periodMonth >= periodFrom && item.periodMonth <= periodTo);
  const totalActive = filteredEarnings.filter(item => item.appliedInPayroll).reduce((sum, item) => sum + item.amount, 0);`,
    'filtered earning totals',
  );
  source = replaceOnce(
    source,
    `      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">`,
    `      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-slate-50/70 p-4">
          <div><label className="mb-1 block text-[11px] font-bold text-slate-600">{tr('من شهر', 'From month')}</label><input type="month" value={periodFrom} onChange={event => setPeriodFrom(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs" /></div>
          <div><label className="mb-1 block text-[11px] font-bold text-slate-600">{tr('إلى شهر', 'To month')}</label><input type="month" value={periodTo} min={periodFrom} onChange={event => setPeriodTo(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs" /></div>
          <button type="button" onClick={() => { setPeriodFrom(currentPeriod); setPeriodTo(currentPeriod); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">{tr('الشهر الحالي', 'Current month')}</button>
          <span className="text-[11px] text-slate-500">{tr('النتائج', 'Results')}: {filteredEarnings.length}</span>
        </div>
        <div className="overflow-x-auto">`,
    'earning filter controls',
  );
  source = replaceOnce(
    source,
    `{companyEarnings.length === 0 ? <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">{tr('لا توجد إضافات مؤقتة مسجلة', 'No temporary earnings recorded')}</td></tr> : companyEarnings.map(earning => {`,
    `{filteredEarnings.length === 0 ? <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">{tr('لا توجد إضافات في الفترة المحددة', 'No earnings in the selected period')}</td></tr> : filteredEarnings.map(earning => {`,
    'filtered earning rows',
  );
  return source;
});

console.log('Loan payoff lifecycle and monthly filters applied.');
