import fs from 'node:fs';

const path = 'src/components/PayrollRunsView.tsx';
let source = fs.readFileSync(path, 'utf8');

const selectedBefore = `  const selectedPaymentItems = currentRun?.items.filter(item => selectedPaymentEmployeeIds.includes(item.employeeId)) || [];\n  const selectedPaymentTotal = selectedPaymentItems.reduce((sum, item) => sum + item.netSalary, 0);`;
const selectedAfter = `  // Only currently eligible rows can enter a new payment batch. This also drops stale selections\n  // left behind after recalculation, period changes, holds, or earlier payment batches.\n  const selectedPaymentItems = currentRun?.items.filter(item =>\n    selectedPaymentEmployeeIds.includes(item.employeeId) &&\n    (item.entitlementStatus || 'PAYABLE') === 'PAYABLE' &&\n    item.netSalary > 0 &&\n    !committedEmployeeIds.has(item.employeeId)\n  ) || [];\n  const selectedPaymentTotal = selectedPaymentItems.reduce((sum, item) => sum + item.netSalary, 0);`;
if (source.includes(selectedBefore)) source = source.replace(selectedBefore, selectedAfter);

source = source.replace(
  `    const stillEligible = selectedPaymentItems.filter(item => (item.entitlementStatus || 'PAYABLE') === 'PAYABLE' && item.netSalary > 0 && !committedEmployeeIds.has(item.employeeId));\n    if (!stillEligible.length) return;`,
  `    const stillEligible = selectedPaymentItems;\n    if (!stillEligible.length) return;`
);

source = source.replace(
  `disabled={!selectedPaymentEmployeeIds.length || !['APPROVED', 'POSTED'].includes(currentRun.status)}`,
  `disabled={!selectedPaymentItems.length || !['APPROVED', 'POSTED'].includes(currentRun.status)}`
);
source = source.replace(
  `tr('إنشاء دفعة للمحددين', 'Create selected batch')} ({selectedPaymentEmployeeIds.length})`,
  `tr('إنشاء دفعة للمحددين', 'Create selected batch')} ({selectedPaymentItems.length})`
);

// Prior-period carry-forward is financial detail, not a warning under the employee name.
source = source.replace(
  `            warningFlags: [...calculated.warningFlags, tr(\`رصيد فترات سابقة غير محول: \${formatSAR(priorPeriodNet)}\`, \`Unpaid prior-period balance: \${formatSAR(priorPeriodNet)}\`)],`,
  `            warningFlags: calculated.warningFlags,`
);

const additionsBefore = `                      {(item.overtimeAmount + item.bonuses) > 0 ? (\n                        <div>\n                          <span className="font-bold text-emerald-700">{formatSAR(item.overtimeAmount + item.bonuses)}</span>\n                          {item.overtimeAmount > 0 && <div className="text-[9px] text-slate-400">{tr('إضافي', 'OT')}: {item.overtimeHours}{tr('س', 'h')}</div>}\n                          {item.bonuses > 0 && <div className="text-[9px] text-emerald-600">{tr('مؤقت', 'One-time')}: {formatSAR(item.bonuses)}</div>}\n                        </div>\n                      ) : (`;
const additionsAfter = `                      {(item.overtimeAmount + item.bonuses + Number(item.priorPeriodNet || 0)) > 0 ? (\n                        <div>\n                          <span className="font-bold text-emerald-700">{formatSAR(item.overtimeAmount + item.bonuses + Number(item.priorPeriodNet || 0))}</span>\n                          {item.overtimeAmount > 0 && <div className="text-[9px] text-slate-400">{tr('إضافي', 'OT')}: {item.overtimeHours}{tr('س', 'h')}</div>}\n                          {item.bonuses > 0 && <div className="text-[9px] text-emerald-600">{tr('مؤقت', 'One-time')}: {formatSAR(item.bonuses)}</div>}\n                          {Number(item.priorPeriodNet || 0) > 0 && (\n                            <div className="text-[9px] text-blue-700">\n                              {tr('رصيد سابق', 'Prior balance')}: {formatSAR(Number(item.priorPeriodNet || 0))}\n                              {(item.priorPeriodDetails || []).map(row => (\n                                <div key={row.periodMonth} className="text-[8px] text-blue-600">{row.periodMonth}: {formatSAR(row.net)}</div>\n                              ))}\n                            </div>\n                          )}\n                        </div>\n                      ) : (`;
if (source.includes(additionsBefore)) source = source.replace(additionsBefore, additionsAfter);
else if (!source.includes("tr('رصيد سابق', 'Prior balance')")) throw new Error('Missing payroll additions display anchor');

fs.writeFileSync(path, source);
console.log('Payment selection and prior-balance display hardening applied.');
