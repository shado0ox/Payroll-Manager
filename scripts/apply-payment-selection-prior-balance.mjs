import fs from 'node:fs';

const payrollPath = 'src/components/PayrollRunsView.tsx';
let source = fs.readFileSync(payrollPath, 'utf8');

source = source.replace(
  `  onSavePayrollRun: (run: PayrollRun) => void;\n  onViewEmployeeStatement: (emp: Employee) => void;`,
  `  onSavePayrollRun: (run: PayrollRun) => void;\n  onFlushPersistence?: () => Promise<void>;\n  onViewEmployeeStatement: (emp: Employee) => void;`
);
source = source.replace(
  `  onSavePayrollRun,\n  onViewEmployeeStatement,`,
  `  onSavePayrollRun,\n  onFlushPersistence,\n  onViewEmployeeStatement,`
);

const selectedBefore = `  const selectedPaymentItems = currentRun?.items.filter(item => selectedPaymentEmployeeIds.includes(item.employeeId)) || [];\n  const selectedPaymentTotal = selectedPaymentItems.reduce((sum, item) => sum + item.netSalary, 0);`;
const selectedAfter = `  const priorPeriodTransferred = (employeeId: string, periodMonth: string) => companyRuns.some(run =>\n    run.periodMonth === periodMonth && (run.paymentBatches || []).some(batch =>\n      ['SCHEDULED', 'PAID'].includes(batch.status) && (batch.employeeIds || []).includes(employeeId)\n    )\n  );\n\n  const normalizeCarriedBalance = (item: PayrollRunItem): PayrollRunItem => {\n    const details = item.priorPeriodDetails || [];\n    if (!details.length) return item;\n    const activeDetails = details.filter(row => !priorPeriodTransferred(item.employeeId, row.periodMonth));\n    if (activeDetails.length === details.length) return item;\n    const oldPriorNet = Number(item.priorPeriodNet || 0);\n    const priorPeriodGross = roundAmount(activeDetails.reduce((sum, row) => sum + Number(row.gross || 0), 0));\n    const priorPeriodDeductions = roundAmount(activeDetails.reduce((sum, row) => sum + Number(row.deductions || 0), 0));\n    const priorPeriodNet = roundAmount(activeDetails.reduce((sum, row) => sum + Number(row.net || 0), 0));\n    return {\n      ...item,\n      priorPeriodGross,\n      priorPeriodDeductions,\n      priorPeriodNet,\n      priorPeriodDetails: activeDetails,\n      netSalary: roundAmount(Math.max(0, Number(item.netSalary || 0) - oldPriorNet + priorPeriodNet)),\n      totalCompanyBurden: roundAmount(Math.max(0, Number(item.totalCompanyBurden || 0) - oldPriorNet + priorPeriodNet)),\n    };\n  };\n\n  const normalizeRunCarriedBalances = (run: PayrollRun): PayrollRun => {\n    const items = run.items.map(item => committedEmployeeIds.has(item.employeeId) ? item : normalizeCarriedBalance(item));\n    const sum = (selector: (item: PayrollRunItem) => number) => roundAmount(items.reduce((total, item) => total + selector(item), 0));\n    return {\n      ...run,\n      items,\n      totalGrossSalaries: sum(item => Number(item.totalGrossSalary || 0) + Number(item.priorPeriodGross || 0)),\n      totalDeductions: sum(item => Number(item.totalDeductions || 0) + Number(item.priorPeriodDeductions || 0)),\n      totalNetSalaries: sum(item => Number(item.netSalary || 0)),\n      totalCompanyCost: sum(item => Number(item.totalCompanyBurden || 0)),\n    };\n  };\n\n  // Only explicitly selected, currently eligible rows can enter a payment batch.\n  // Remove any cached prior-period amount whose source month was subsequently scheduled/paid.\n  const selectedPaymentItems = currentRun?.items.filter(item =>\n    selectedPaymentEmployeeIds.includes(item.employeeId) &&\n    (item.entitlementStatus || 'PAYABLE') === 'PAYABLE' &&\n    item.netSalary > 0 &&\n    !committedEmployeeIds.has(item.employeeId)\n  ).map(normalizeCarriedBalance) || [];\n  const selectedPaymentTotal = selectedPaymentItems.reduce((sum, item) => sum + item.netSalary, 0);`;
if (source.includes(selectedBefore)) source = source.replace(selectedBefore, selectedAfter);
else if (!source.includes('const priorPeriodTransferred = (employeeId: string, periodMonth: string)')) {
  const idx = source.indexOf('selectedPayment');
  const diagnostic = idx >= 0 ? source.slice(Math.max(0, idx - 300), idx + 1500).replace(/\n/g, '\\n') : 'selectedPayment token not found';
  throw new Error(`Missing payment selection anchor. Generated snippet: ${diagnostic}`);
}

source = source.replace(
  `    const stillEligible = selectedPaymentItems.filter(item => (item.entitlementStatus || 'PAYABLE') === 'PAYABLE' && item.netSalary > 0 && !committedEmployeeIds.has(item.employeeId));\n    if (!stillEligible.length) return;`,
  `    const normalizedRun = normalizeRunCarriedBalances(currentRun);\n    const stillEligible = selectedPaymentItems;\n    if (!stillEligible.length) return;`
);
source = source.replace(
  `    const stillEligible = selectedPaymentItems;\n    if (!stillEligible.length) return;`,
  `    const normalizedRun = normalizeRunCarriedBalances(currentRun);\n    const stillEligible = selectedPaymentItems;\n    if (!stillEligible.length) return;`
);
source = source.replace(
  `    const sequence = (currentRun.paymentBatches?.length || 0) + 1;`,
  `    const sequence = (normalizedRun.paymentBatches?.length || 0) + 1;`
);
source = source.replace(
  `    const updatedRun = { ...currentRun, paymentBatches: [...(currentRun.paymentBatches || []), batch] };`,
  `    const updatedRun = { ...normalizedRun, paymentBatches: [...(normalizedRun.paymentBatches || []), batch] };`
);

source = source.replace(
  `disabled={!selectedPaymentEmployeeIds.length || !['APPROVED', 'POSTED'].includes(currentRun.status)}`,
  `disabled={!selectedPaymentItems.length || !['APPROVED', 'POSTED'].includes(currentRun.status)}`
);
source = source.replace(
  `tr('إنشاء دفعة للمحددين', 'Create selected batch')} ({selectedPaymentEmployeeIds.length})`,
  `tr('إنشاء دفعة للمحددين', 'Create selected batch')} ({selectedPaymentItems.length})`
);

source = source.replace(
  `  const handleStatusChange = (newStatus: PayrollRunStatus) => {\n    if (!currentRun) return;`,
  `  const handleStatusChange = async (newStatus: PayrollRunStatus) => {\n    if (!currentRun) return;`
);
source = source.replace(
  `    const updated: PayrollRun = {\n      ...currentRun,\n      status: newStatus,`,
  `    if (newStatus === 'POSTED' && onFlushPersistence) await onFlushPersistence();\n    const postingBase = newStatus === 'POSTED' ? normalizeRunCarriedBalances(currentRun) : currentRun;\n    const updated: PayrollRun = {\n      ...postingBase,\n      status: newStatus,`
);

source = source.replace(
  `            warningFlags: [...calculated.warningFlags, tr(\`رصيد فترات سابقة غير محول: \${formatSAR(priorPeriodNet)}\`, \`Unpaid prior-period balance: \${formatSAR(priorPeriodNet)}\`)],`,
  `            warningFlags: calculated.warningFlags,`
);

const additionsBefore = `                      {(item.overtimeAmount + item.bonuses) > 0 ? (\n                        <div>\n                          <span className="font-bold text-emerald-700">{formatSAR(item.overtimeAmount + item.bonuses)}</span>\n                          {item.overtimeAmount > 0 && <div className="text-[9px] text-slate-400">{tr('إضافي', 'OT')}: {item.overtimeHours}{tr('س', 'h')}</div>}\n                          {item.bonuses > 0 && <div className="text-[9px] text-emerald-600">{tr('مؤقت', 'One-time')}: {formatSAR(item.bonuses)}</div>}\n                        </div>\n                      ) : (`;
const additionsAfter = `                      {(item.overtimeAmount + item.bonuses + Number(item.priorPeriodNet || 0)) > 0 ? (\n                        <div>\n                          <span className="font-bold text-emerald-700">{formatSAR(item.overtimeAmount + item.bonuses + Number(item.priorPeriodNet || 0))}</span>\n                          {item.overtimeAmount > 0 && <div className="text-[9px] text-slate-400">{tr('إضافي', 'OT')}: {item.overtimeHours}{tr('س', 'h')}</div>}\n                          {item.bonuses > 0 && <div className="text-[9px] text-emerald-600">{tr('مؤقت', 'One-time')}: {formatSAR(item.bonuses)}</div>}\n                          {Number(item.priorPeriodNet || 0) > 0 && (\n                            <div className="text-[9px] text-blue-700">\n                              {tr('رصيد سابق', 'Prior balance')}: {formatSAR(Number(item.priorPeriodNet || 0))}\n                              {(item.priorPeriodDetails || []).map(row => (\n                                <div key={row.periodMonth} className="text-[8px] text-blue-600">{row.periodMonth}: {formatSAR(row.net)}</div>\n                              ))}\n                            </div>\n                          )}\n                        </div>\n                      ) : (`;
if (source.includes(additionsBefore)) source = source.replace(additionsBefore, additionsAfter);
else if (!source.includes("tr('رصيد سابق', 'Prior balance')")) throw new Error('Missing payroll additions display anchor');

fs.writeFileSync(payrollPath, source);

const appPath = 'src/App.tsx';
let app = fs.readFileSync(appPath, 'utf8');
const appAnchor = `                onSavePayrollRun={handleSavePayrollRun}\n                onViewEmployeeStatement={setStatementEmployee}`;
if (!app.includes('onFlushPersistence={async () =>')) {
  if (!app.includes(appAnchor)) throw new Error('Missing payroll persistence flush prop anchor');
  app = app.replace(
    appAnchor,
    `                onSavePayrollRun={handleSavePayrollRun}\n                onFlushPersistence={async () => { await persistenceQueueRef.current.catch(() => undefined); }}\n                onViewEmployeeStatement={setStatementEmployee}`
  );
}
fs.writeFileSync(appPath, app);

console.log('Payment selection, stale prior-balance cleanup, and posting persistence hardening applied.');
