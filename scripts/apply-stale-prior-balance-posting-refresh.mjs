import fs from 'node:fs';

const patch = (path, transform) => {
  const source = fs.readFileSync(path, 'utf8');
  const next = transform(source);
  if (next !== source) fs.writeFileSync(path, next);
};

patch('src/components/PayrollRunsView.tsx', source => {
  source = source.replace(
    `  onSavePayrollRun: (run: PayrollRun) => void;\n  onViewEmployeeStatement: (emp: Employee) => void;`,
    `  onSavePayrollRun: (run: PayrollRun) => void;\n  onFlushPersistence?: () => Promise<void>;\n  onViewEmployeeStatement: (emp: Employee) => void;`
  );
  source = source.replace(
    `  onSavePayrollRun,\n  onViewEmployeeStatement,`,
    `  onSavePayrollRun,\n  onFlushPersistence,\n  onViewEmployeeStatement,`
  );

  const helperBlock = `  const priorPeriodTransferred = (employeeId: string, periodMonth: string) => companyRuns.some(run =>\n    run.periodMonth === periodMonth && (run.paymentBatches || []).some(batch =>\n      ['SCHEDULED', 'PAID'].includes(batch.status) && (batch.employeeIds || []).includes(employeeId)\n    )\n  );\n\n  const normalizeCarriedBalance = (item: PayrollRunItem): PayrollRunItem => {\n    const details = item.priorPeriodDetails || [];\n    if (!details.length) return item;\n    const activeDetails = details.filter(row => !priorPeriodTransferred(item.employeeId, row.periodMonth));\n    if (activeDetails.length === details.length) return item;\n    const oldPriorNet = Number(item.priorPeriodNet || 0);\n    const priorPeriodGross = roundAmount(activeDetails.reduce((sum, row) => sum + Number(row.gross || 0), 0));\n    const priorPeriodDeductions = roundAmount(activeDetails.reduce((sum, row) => sum + Number(row.deductions || 0), 0));\n    const priorPeriodNet = roundAmount(activeDetails.reduce((sum, row) => sum + Number(row.net || 0), 0));\n    return {\n      ...item,\n      priorPeriodGross,\n      priorPeriodDeductions,\n      priorPeriodNet,\n      priorPeriodDetails: activeDetails,\n      netSalary: roundAmount(Math.max(0, Number(item.netSalary || 0) - oldPriorNet + priorPeriodNet)),\n      totalCompanyBurden: roundAmount(Math.max(0, Number(item.totalCompanyBurden || 0) - oldPriorNet + priorPeriodNet)),\n    };\n  };\n\n  const normalizeRunCarriedBalances = (run: PayrollRun): PayrollRun => {\n    const items = run.items.map(item => committedEmployeeIds.has(item.employeeId) ? item : normalizeCarriedBalance(item));\n    const sum = (selector: (item: PayrollRunItem) => number) => roundAmount(items.reduce((total, item) => total + selector(item), 0));\n    return {\n      ...run,\n      items,\n      totalGrossSalaries: sum(item => Number(item.totalGrossSalary || 0) + Number(item.priorPeriodGross || 0)),\n      totalDeductions: sum(item => Number(item.totalDeductions || 0) + Number(item.priorPeriodDeductions || 0)),\n      totalNetSalaries: sum(item => Number(item.netSalary || 0)),\n      totalCompanyCost: sum(item => Number(item.totalCompanyBurden || 0)),\n    };\n  };\n\n`;

  if (!source.includes('const priorPeriodTransferred = (employeeId: string, periodMonth: string)')) {
    const totalAnchor = `  const selectedPaymentTotal = selectedPaymentItems.reduce((sum, item) => sum + item.netSalary, 0);`;
    if (!source.includes(totalAnchor)) throw new Error('Missing selected payment total anchor');
    source = source.replace(totalAnchor, `${helperBlock}  const normalizedSelectedPaymentItems = selectedPaymentItems\n    .map(normalizeCarriedBalance)\n    .filter(item => (item.entitlementStatus || 'PAYABLE') === 'PAYABLE' && item.netSalary > 0 && !committedEmployeeIds.has(item.employeeId));\n  const selectedPaymentTotal = normalizedSelectedPaymentItems.reduce((sum, item) => sum + item.netSalary, 0);`);
  }

  source = source.replace(
    `disabled={!selectedPaymentItems.length || !['APPROVED', 'POSTED'].includes(currentRun.status)}`,
    `disabled={!normalizedSelectedPaymentItems.length || !['APPROVED', 'POSTED'].includes(currentRun.status)}`
  );
  source = source.replace(
    `tr('إنشاء دفعة للمحددين', 'Create selected batch')} ({selectedPaymentItems.length})`,
    `tr('إنشاء دفعة للمحددين', 'Create selected batch')} ({normalizedSelectedPaymentItems.length})`
  );

  const oldStillEligible = `    const stillEligible = selectedPaymentItems;\n    if (!stillEligible.length) return;`;
  const legacyStillEligible = `    const stillEligible = selectedPaymentItems.filter(item => (item.entitlementStatus || 'PAYABLE') === 'PAYABLE' && item.netSalary > 0 && !committedEmployeeIds.has(item.employeeId));\n    if (!stillEligible.length) return;`;
  const newStillEligible = `    const normalizedRun = normalizeRunCarriedBalances(currentRun);\n    const stillEligible = normalizedSelectedPaymentItems;\n    if (!stillEligible.length) return;`;
  if (source.includes(oldStillEligible)) source = source.replace(oldStillEligible, newStillEligible);
  else if (source.includes(legacyStillEligible)) source = source.replace(legacyStillEligible, newStillEligible);
  else if (!source.includes('const normalizedRun = normalizeRunCarriedBalances(currentRun);')) throw new Error('Missing payment eligibility anchor');

  source = source.replace(
    `    const sequence = (currentRun.paymentBatches?.length || 0) + 1;`,
    `    const sequence = (normalizedRun.paymentBatches?.length || 0) + 1;`
  );
  source = source.replace(
    `    const updatedRun = { ...currentRun, paymentBatches: [...(currentRun.paymentBatches || []), batch] };`,
    `    const updatedRun = { ...normalizedRun, paymentBatches: [...(normalizedRun.paymentBatches || []), batch] };`
  );

  source = source.replace(
    `  const handleStatusChange = (newStatus: PayrollRunStatus) => {\n    if (!currentRun) return;`,
    `  const handleStatusChange = async (newStatus: PayrollRunStatus) => {\n    if (!currentRun) return;`
  );
  source = source.replace(
    `    const updated: PayrollRun = {\n      ...currentRun,\n      status: newStatus,`,
    `    if (newStatus === 'POSTED' && onFlushPersistence) await onFlushPersistence();\n    const postingBase = newStatus === 'POSTED' ? normalizeRunCarriedBalances(currentRun) : currentRun;\n    const updated: PayrollRun = {\n      ...postingBase,\n      status: newStatus,`
  );

  return source;
});

patch('src/App.tsx', source => {
  const anchor = `                onSavePayrollRun={handleSavePayrollRun}\n                onViewEmployeeStatement={setStatementEmployee}`;
  const replacement = `                onSavePayrollRun={handleSavePayrollRun}\n                onFlushPersistence={async () => { await persistenceQueueRef.current.catch(() => undefined); }}\n                onViewEmployeeStatement={setStatementEmployee}`;
  if (!source.includes('onFlushPersistence={async () =>')) {
    if (!source.includes(anchor)) throw new Error('Missing payroll persistence flush prop anchor');
    source = source.replace(anchor, replacement);
  }
  return source;
});

console.log('Stale prior balance invalidation and posting persistence flush applied.');
