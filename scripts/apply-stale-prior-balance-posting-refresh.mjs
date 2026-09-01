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

  const normalizedBlock = `  const priorPeriodTransferred = (employeeId: string, periodMonth: string) => companyRuns.some(run =>\n    run.periodMonth === periodMonth && (run.paymentBatches || []).some(batch =>\n      ['SCHEDULED', 'PAID'].includes(batch.status) && (batch.employeeIds || []).includes(employeeId)\n    )\n  );\n\n  const normalizeCarriedBalance = (item: PayrollRunItem): PayrollRunItem => {\n    const details = item.priorPeriodDetails || [];\n    if (!details.length) return item;\n    const activeDetails = details.filter(row => !priorPeriodTransferred(item.employeeId, row.periodMonth));\n    if (activeDetails.length === details.length) return item;\n    const oldPriorNet = Number(item.priorPeriodNet || 0);\n    const priorPeriodGross = roundAmount(activeDetails.reduce((sum, row) => sum + Number(row.gross || 0), 0));\n    const priorPeriodDeductions = roundAmount(activeDetails.reduce((sum, row) => sum + Number(row.deductions || 0), 0));\n    const priorPeriodNet = roundAmount(activeDetails.reduce((sum, row) => sum + Number(row.net || 0), 0));\n    return {\n      ...item,\n      priorPeriodGross,\n      priorPeriodDeductions,\n      priorPeriodNet,\n      priorPeriodDetails: activeDetails,\n      netSalary: roundAmount(Math.max(0, Number(item.netSalary || 0) - oldPriorNet + priorPeriodNet)),\n      totalCompanyBurden: roundAmount(Math.max(0, Number(item.totalCompanyBurden || 0) - oldPriorNet + priorPeriodNet)),\n    };\n  };\n\n  const normalizeRunCarriedBalances = (run: PayrollRun): PayrollRun => {\n    const items = run.items.map(item => committedEmployeeIds.has(item.employeeId) ? item : normalizeCarriedBalance(item));\n    const sum = (selector: (item: PayrollRunItem) => number) => roundAmount(items.reduce((total, item) => total + selector(item), 0));\n    return {\n      ...run,\n      items,\n      totalGrossSalaries: sum(item => Number(item.totalGrossSalary || 0) + Number(item.priorPeriodGross || 0)),\n      totalDeductions: sum(item => Number(item.totalDeductions || 0) + Number(item.priorPeriodDeductions || 0)),\n      totalNetSalaries: sum(item => Number(item.netSalary || 0)),\n      totalCompanyCost: sum(item => Number(item.totalCompanyBurden || 0)),\n    };\n  };\n\n  const selectedPaymentItems = currentRun?.items.filter(item =>\n    selectedPaymentEmployeeIds.includes(item.employeeId) &&\n    (item.entitlementStatus || 'PAYABLE') === 'PAYABLE' &&\n    item.netSalary > 0 &&\n    !committedEmployeeIds.has(item.employeeId)\n  ).map(normalizeCarriedBalance) || [];\n  const selectedPaymentTotal = selectedPaymentItems.reduce((sum, item) => sum + item.netSalary, 0);`;

  if (!source.includes('const priorPeriodTransferred = (employeeId: string, periodMonth: string)')) {
    const selectedPattern = /  const selectedPaymentItems =[^\n]*[\s\S]*?  const selectedPaymentTotal = selectedPaymentItems\.reduce\(\(sum, item\) => sum \+ item\.netSalary, 0\);/;
    if (!selectedPattern.test(source)) throw new Error('Missing selected payment block for stale prior balance fix');
    source = source.replace(selectedPattern, normalizedBlock);
  }

  const createReplacement = `    const normalizedRun = normalizeRunCarriedBalances(currentRun);\n    const stillEligible = normalizedRun.items.filter(item =>\n      selectedPaymentEmployeeIds.includes(item.employeeId) &&\n      (item.entitlementStatus || 'PAYABLE') === 'PAYABLE' &&\n      item.netSalary > 0 &&\n      !committedEmployeeIds.has(item.employeeId)\n    );\n    if (!stillEligible.length) return;\n    const sequence = (normalizedRun.paymentBatches?.length || 0) + 1;`;
  const createPattern = /    const stillEligible = [\s\S]*?    if \(!stillEligible\.length\) return;\n    const sequence = \([^\n]+\) \+ 1;/;
  if (createPattern.test(source) && !source.includes('const normalizedRun = normalizeRunCarriedBalances(currentRun);')) {
    source = source.replace(createPattern, createReplacement);
  }

  source = source.replace(
    `    const updatedRun = { ...currentRun, paymentBatches: [...(currentRun.paymentBatches || []), batch] };`,
    `    const updatedRun = { ...normalizedRun, paymentBatches: [...(normalizedRun.paymentBatches || []), batch] };`
  );

  const statusBefore = `  const handleStatusChange = (newStatus: PayrollRunStatus) => {\n    if (!currentRun) return;`;
  const statusAfter = `  const handleStatusChange = async (newStatus: PayrollRunStatus) => {\n    if (!currentRun) return;`;
  if (source.includes(statusBefore)) source = source.replace(statusBefore, statusAfter);

  const updatedBefore = `    const updated: PayrollRun = {\n      ...currentRun,\n      status: newStatus,`;
  const updatedAfter = `    // Before final posting, wait for any preceding payment/status write to finish.\n    // This removes the save race that previously required a hard refresh before posting.\n    if (newStatus === 'POSTED' && onFlushPersistence) await onFlushPersistence();\n    const postingBase = newStatus === 'POSTED' ? normalizeRunCarriedBalances(currentRun) : currentRun;\n    const updated: PayrollRun = {\n      ...postingBase,\n      status: newStatus,`;
  if (source.includes(updatedBefore)) source = source.replace(updatedBefore, updatedAfter);

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
