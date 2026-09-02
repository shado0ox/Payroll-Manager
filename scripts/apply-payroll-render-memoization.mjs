import fs from 'node:fs';

const path = 'src/components/PayrollRunsView.tsx';
let source = fs.readFileSync(path, 'utf8');

if (!source.includes('const paymentSummary = useMemo(() => {')) {
  const start = source.indexOf('  const paymentBatches = currentRun?.paymentBatches || [];');
  const end = source.indexOf('  const togglePaymentEmployee', start);
  if (start < 0 || end < 0) throw new Error('Payroll render memoization anchors not found');
  const memoizedCalculations = fs.readFileSync(new URL('./payroll-render-memoization.snippet.txt', import.meta.url), 'utf8');
  source = source.slice(0, start) + memoizedCalculations + source.slice(end);
}

function replaceOnce(from, to, label) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Payroll memoization target not found: ${label}`);
  source = source.replace(from, to);
}

replaceOnce(
  "  const totalWarnings = currentRun?.items.reduce((s, i) => s + i.warningFlags.length, 0) || 0;",
  `  const totalWarnings = useMemo(() => currentRun?.items.reduce((s, i) => s + i.warningFlags.length, 0) || 0, [currentRun?.items]);
  const priorBalancesTotal = useMemo(() => (currentRun?.items || []).reduce((sum, item) => sum + Number(item.priorPeriodNet || 0), 0), [currentRun?.items]);
  const exportablePaymentEmployeeIds = useMemo(() => (currentRun?.items || [])
    .filter(item => (item.entitlementStatus || 'PAYABLE') === 'PAYABLE' && !committedEmployeeIds.has(item.employeeId))
    .map(item => item.employeeId), [currentRun?.items, committedEmployeeIds]);`,
  'warning and export summaries'
);
replaceOnce(
  "[tr('أرصدة سابقة', 'Prior balances'), (currentRun.items || []).reduce((sum, item) => sum + Number(item.priorPeriodNet || 0), 0), 'text-blue-700']",
  "[tr('أرصدة سابقة', 'Prior balances'), priorBalancesTotal, 'text-blue-700']",
  'prior balance summary'
);
replaceOnce(
  "exportWpsBankCsv(currentRun, company, currentRun.items.filter(item => (item.entitlementStatus || 'PAYABLE') === 'PAYABLE' && !committedEmployeeIds.has(item.employeeId)).map(item => item.employeeId))",
  'exportWpsBankCsv(currentRun, company, exportablePaymentEmployeeIds)',
  'WPS export employee ids'
);

fs.writeFileSync(path, source);
console.log('Payroll render-time filters and reductions memoized.');
