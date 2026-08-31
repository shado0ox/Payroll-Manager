import fs from 'node:fs';

function patch(path, transform) {
  const source = fs.readFileSync(path, 'utf8');
  const next = transform(source);
  if (next !== source) fs.writeFileSync(path, next);
}

patch('src/types/index.ts', source => {
  if (source.includes('export interface PayrollPriorEntitlement')) return source;
  const anchor = `export interface PayrollPaymentBatch {`;
  if (!source.includes(anchor)) throw new Error('PayrollPaymentBatch type anchor not found');
  const addition = `export interface PayrollPriorEntitlement {\n  sourcePayrollRunId: string;\n  sourcePayrollItemId: string;\n  sourcePeriodMonth: string;\n  employeeId: string;\n  employeeNo: string;\n  employeeName: string;\n  amount: number;\n}\n\n`;
  source = source.replace(anchor, addition + anchor);
  const fieldAnchor = `  notes?: string;\n  createdAt: string;`;
  if (!source.includes(fieldAnchor)) throw new Error('PayrollPaymentBatch field anchor not found');
  return source.replace(fieldAnchor, `  notes?: string;\n  priorEntitlements?: PayrollPriorEntitlement[];\n  createdAt: string;`);
});

patch('src/components/PayrollRunsView.tsx', source => {
  if (source.includes('selectedPriorPaymentTotal')) return source;

  const importAnchor = `  PayrollPaymentBatch,\n  PaymentMethod,`;
  if (!source.includes(importAnchor)) throw new Error('Payroll prior entitlement import anchor not found');
  source = source.replace(importAnchor, `  PayrollPaymentBatch,\n  PayrollPriorEntitlement,\n  PaymentMethod,`);

  const totalsAnchor = `  const selectedPaymentItems = currentRun?.items.filter(item => selectedPaymentEmployeeIds.includes(item.employeeId)) || [];\n  const selectedPaymentTotal = selectedPaymentItems.reduce((sum, item) => sum + item.netSalary, 0);`;
  if (!source.includes(totalsAnchor)) throw new Error('Selected payment total anchor not found');
  const totalsReplacement = `  const selectedPaymentItems = currentRun?.items.filter(item => selectedPaymentEmployeeIds.includes(item.employeeId)) || [];\n  const referencedPriorEntitlementKeys = useMemo(() => {\n    const keys = new Set<string>();\n    companyRuns.forEach(run => (run.paymentBatches || []).filter(batch => ['SCHEDULED', 'PAID'].includes(batch.status)).forEach(batch => {\n      (batch.priorEntitlements || []).forEach(ref => keys.add(\`\${ref.sourcePayrollRunId}:\${ref.sourcePayrollItemId}\`));\n    }));\n    return keys;\n  }, [companyRuns]);\n  const getAvailablePriorEntitlements = (employeeId: string): PayrollPriorEntitlement[] => companyRuns\n    .filter(run => run.periodMonth < selectedPeriod)\n    .flatMap(run => run.items\n      .filter(item => item.employeeId === employeeId\n        && (item.entitlementStatus || 'PAYABLE') === 'HELD'\n        && item.entitlementReason === 'MISSING_BANK_ACCOUNT'\n        && item.netSalary > 0\n        && !referencedPriorEntitlementKeys.has(\`\${run.id}:\${item.id}\`))\n      .map(item => ({\n        sourcePayrollRunId: run.id,\n        sourcePayrollItemId: item.id,\n        sourcePeriodMonth: run.periodMonth,\n        employeeId: item.employeeId,\n        employeeNo: item.employeeNo,\n        employeeName: item.employeeName,\n        amount: roundAmount(item.netSalary),\n      })));\n  const selectedPriorEntitlements = selectedPaymentItems.flatMap(item => getAvailablePriorEntitlements(item.employeeId));\n  const selectedCurrentPaymentTotal = roundAmount(selectedPaymentItems.reduce((sum, item) => sum + item.netSalary, 0));\n  const selectedPriorPaymentTotal = roundAmount(selectedPriorEntitlements.reduce((sum, ref) => sum + ref.amount, 0));\n  const selectedPaymentTotal = roundAmount(selectedCurrentPaymentTotal + selectedPriorPaymentTotal);`;
  source = source.replace(totalsAnchor, totalsReplacement);

  const eligibleAnchor = `    if (!stillEligible.length) return;\n    const invalidBankItems = stillEligible.filter(item => {`;
  if (!source.includes(eligibleAnchor)) throw new Error('Payment prior entitlement eligibility anchor not found');
  source = source.replace(eligibleAnchor, `    if (!stillEligible.length) return;\n    const priorEntitlements = stillEligible.flatMap(item => getAvailablePriorEntitlements(item.employeeId));\n    const priorEntitlementsTotal = roundAmount(priorEntitlements.reduce((sum, ref) => sum + ref.amount, 0));\n    const invalidBankItems = stillEligible.filter(item => {`);

  const totalAnchor = `      totalAmount: roundAmount(stillEligible.reduce((sum, item) => sum + item.netSalary, 0)),`;
  if (!source.includes(totalAnchor)) throw new Error('Payment batch total anchor not found');
  source = source.replace(totalAnchor, `      totalAmount: roundAmount(stillEligible.reduce((sum, item) => sum + item.netSalary, 0) + priorEntitlementsTotal),`);

  const notesAnchor = `      notes: \`\${currentRun.status === 'POSTED' ? 'دفعة متأخرة مرتبطة بالمسير الأصلي. ' : ''}\${paymentBatchForm.notes.trim()}\`.trim(),\n      createdAt: new Date().toISOString(),`;
  if (!source.includes(notesAnchor)) throw new Error('Payment batch notes anchor not found');
  source = source.replace(notesAnchor, `      notes: \`\${currentRun.status === 'POSTED' ? 'دفعة متأخرة مرتبطة بالمسير الأصلي. ' : ''}\${priorEntitlements.length ? \`تتضمن \${priorEntitlements.length} مستحق سابق بإجمالي \${priorEntitlementsTotal.toFixed(2)} SR. \` : ''}\${paymentBatchForm.notes.trim()}\`.trim(),\n      priorEntitlements,\n      createdAt: new Date().toISOString(),`);

  const modalTotalAnchor = `              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-center justify-between"><span className="font-bold text-emerald-900">{tr('إجمالي الدفعة', 'Batch total')}</span><span className="font-black text-emerald-800 text-base">{formatSAR(selectedPaymentTotal)}</span></div>`;
  if (!source.includes(modalTotalAnchor)) throw new Error('Payment modal total anchor not found');
  source = source.replace(modalTotalAnchor, `              {selectedPriorPaymentTotal > 0 && (\n                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-1.5">\n                  <div className="flex items-center justify-between"><span className="font-bold text-slate-700">{tr('راتب الفترة الحالية', 'Current-period salary')}</span><span className="font-black text-slate-900">{formatSAR(selectedCurrentPaymentTotal)}</span></div>\n                  <div className="flex items-center justify-between"><span className="font-bold text-amber-800">{tr('مستحقات سابقة معلقة', 'Prior held entitlements')}</span><span className="font-black text-amber-900">{formatSAR(selectedPriorPaymentTotal)}</span></div>\n                  <div className="text-[10px] text-amber-700">{tr('المستحق السابق يظل محملاً على شهره الأصلي ولا يعاد احتسابه كمصروف في الشهر الحالي.', 'Prior entitlement remains charged to its original payroll period and is not re-expensed in the current month.')}</div>\n                </div>\n              )}\n              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-center justify-between"><span className="font-bold text-emerald-900">{tr('إجمالي الدفعة', 'Batch total')}</span><span className="font-black text-emerald-800 text-base">{formatSAR(selectedPaymentTotal)}</span></div>`);

  return source;
});

patch('src/utils/bankExcelExport.ts', source => {
  if (source.includes('priorEntitlementsByEmployee')) return source;
  const selectedAnchor = `  const selectedIds = new Set(batch.employeeIds);\n  const items = payrollRun.items.filter(item => selectedIds.has(item.employeeId) && !item.isSuspended && item.netSalary > 0);`;
  if (!source.includes(selectedAnchor)) throw new Error('Bank export selected items anchor not found');
  source = source.replace(selectedAnchor, `  const selectedIds = new Set(batch.employeeIds);\n  const priorEntitlementsByEmployee = new Map<string, number>();\n  (batch.priorEntitlements || []).forEach(ref => {\n    priorEntitlementsByEmployee.set(ref.employeeId, (priorEntitlementsByEmployee.get(ref.employeeId) || 0) + Number(ref.amount || 0));\n  });\n  const items = payrollRun.items.filter(item => selectedIds.has(item.employeeId) && !item.isSuspended && item.netSalary > 0);`);

  const mapAnchor = `      const centralBank = detectBankFromIBAN(item.bankIban, company.bankDefinitions);\n      const centralSwift = centralBank?.swiftCode || getSwiftCodeFromBankName(item.bankName || employee?.bankName || '', company.bankDefinitions);\n      return makeRow(index + 4, [`;
  if (!source.includes(mapAnchor)) throw new Error('Bank export row anchor not found');
  source = source.replace(mapAnchor, `      const centralBank = detectBankFromIBAN(item.bankIban, company.bankDefinitions);\n      const centralSwift = centralBank?.swiftCode || getSwiftCodeFromBankName(item.bankName || employee?.bankName || '', company.bankDefinitions);\n      const priorEntitlementAmount = priorEntitlementsByEmployee.get(item.employeeId) || 0;\n      const transferAmount = item.netSalary + priorEntitlementAmount;\n      return makeRow(index + 4, [`);

  const amountAnchor = `      item.netSalary,\n      item.baseSalary,\n      item.housingAllowance,\n      item.transportAllowance + item.otherAllowances + item.overtimeAmount + item.bonuses,`;
  if (!source.includes(amountAnchor)) throw new Error('Bank export amount columns anchor not found');
  return source.replace(amountAnchor, `      transferAmount,\n      item.baseSalary,\n      item.housingAllowance,\n      item.transportAllowance + item.otherAllowances + item.overtimeAmount + item.bonuses + priorEntitlementAmount,`);
});

patch('src/components/EmployeeStatementModal.tsx', source => {
  if (source.includes('paidPriorSettlements')) return source;
  const latestAnchor = `  const latestItem = employeeHistory[0]?.item;\n  const latestRun = employeeHistory[0]?.run;`;
  if (!source.includes(latestAnchor)) throw new Error('Employee statement history anchor not found');
  source = source.replace(latestAnchor, `  const latestItem = employeeHistory[0]?.item;\n  const latestRun = employeeHistory[0]?.run;\n  const paidPriorSettlements = payrollRuns.flatMap(run => (run.paymentBatches || [])\n    .filter(batch => batch.status === 'PAID')\n    .flatMap(batch => (batch.priorEntitlements || [])\n      .filter(ref => ref.employeeId === employee.id)\n      .map(ref => ({ ...ref, paymentBatchNumber: batch.batchNumber, paymentDate: batch.paymentDate || batch.scheduledDate }))));\n  const paidPriorSettlementTotal = roundAmount(paidPriorSettlements.reduce((sum, ref) => sum + ref.amount, 0));`);

  const employeeInfoEnd = `          </div>\n\n          {/* Current Month Itemized Breakdown: Earnings vs Deductions */}`;
  if (!source.includes(employeeInfoEnd)) throw new Error('Employee statement settlement panel anchor not found');
  source = source.replace(employeeInfoEnd, `          </div>\n\n          {paidPriorSettlements.length > 0 && (\n            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">\n              <div className="flex items-center justify-between gap-3 mb-2">\n                <div><div className="text-xs font-black text-amber-900">{tr('مستحقات سابقة تم صرفها لاحقًا', 'Prior held entitlements paid later')}</div><div className="text-[10px] text-amber-700">{tr('هذه المبالغ تخص فتراتها الأصلية وليست مصروفًا جديدًا في شهر الدفع.', 'These amounts belong to their original payroll periods and are not a new expense in the payment month.')}</div></div>\n                <div className="font-black text-amber-900">{formatSAR(paidPriorSettlementTotal)}</div>\n              </div>\n              <div className="space-y-1">{paidPriorSettlements.map(ref => (\n                <div key={\`\${ref.sourcePayrollRunId}:\${ref.sourcePayrollItemId}\`} className="flex items-center justify-between text-[11px] border-t border-amber-200/70 pt-1.5">\n                  <span>{tr('راتب', 'Salary')} {ref.sourcePeriodMonth} • {ref.paymentBatchNumber} • {ref.paymentDate}</span>\n                  <strong>{formatSAR(ref.amount)}</strong>\n                </div>\n              ))}</div>\n            </div>\n          )}\n\n          {/* Current Month Itemized Breakdown: Earnings vs Deductions */}`);
  return source;
});

console.log('Prior held payroll entitlement carry-forward settlements applied.');
