import fs from 'node:fs';

const patch = (path, transform) => {
  const source = fs.readFileSync(path, 'utf8');
  const next = transform(source);
  if (next !== source) fs.writeFileSync(path, next);
};

patch('src/components/PayrollRunsView.tsx', source => {
  const oldRecalculateGuard = `  const handleRecalculate = () => {\n    if (currentRun && ['APPROVED', 'POSTED'].includes(currentRun.status)) {\n      alert(tr('لا يمكن إعادة احتساب مسير معتمد أو مرحل. يجب التراجع عن الاعتماد أولًا، ولا يمكن فتح المسير إذا وُجدت دفعة مدفوعة.', 'An approved or posted payroll cannot be recalculated. Reopen it first; a paid payroll cannot be reopened.'));\n      return;\n    }\n    if (currentRun?.paymentBatches?.some(batch => ['SCHEDULED', 'PAID'].includes(batch.status))) {\n      alert(tr('لا يمكن إعادة احتساب المسير مع وجود دفعة تحويل مجدولة أو مدفوعة. ألغِ الدفعة المجدولة أولًا.', 'Payroll cannot be recalculated while a scheduled or paid payment batch exists. Cancel the scheduled batch first.'));\n      return;\n    }\n    setIsCalculating(true);`;
  const newRecalculateStart = `  const handleRecalculate = () => {\n    // Recalculate only unpaid/new employees. Employees already reserved or paid are preserved below.\n    setIsCalculating(true);`;
  if (source.includes(oldRecalculateGuard)) source = source.replace(oldRecalculateGuard, newRecalculateStart);

  return source;
});

patch('src/App.tsx', source => {
  const oldHelper = `function isClosedPayrollInputLocked(\n  payrollRuns: PayrollRun[],\n  kind: 'attendance' | 'loan' | 'penalty' | 'earning',\n  record: AttendanceRecord | LoanSchedule | PenaltyRecord | TemporaryEarningRecord,\n) {\n  const closedRuns = payrollRuns.filter(run => run.companyId === record.companyId && ['APPROVED', 'POSTED'].includes(run.status));\n  return closedRuns.some(run => {\n    const item = run.items.find(candidate => candidate.employeeId === record.employeeId);\n    if (!item) return false;\n    if (kind === 'attendance') {\n      const attendance = record as AttendanceRecord;\n      if (run.periodMonth !== attendance.periodMonth) return false;\n      return Boolean(\n        attendance.absence || attendance.unpaidLeave || attendance.delayMinutes || attendance.overtimeHours ||\n        item.absenceDays || item.absenceDeduction || item.unpaidLeaveDays || item.unpaidLeaveDeduction ||\n        item.delayMinutes || item.delayDeduction || item.overtimeHours || item.overtimeAmount\n      );\n    }\n    if (kind === 'penalty') {\n      const penalty = record as PenaltyRecord;\n      return run.periodMonth === penalty.periodMonth && Number(item.penaltiesDeduction || 0) !== 0;\n    }\n    if (kind === 'earning') {\n      const earning = record as TemporaryEarningRecord;\n      return run.periodMonth === earning.periodMonth && Number(item.bonuses || 0) !== 0;\n    }\n    const loan = record as LoanSchedule;\n    return run.periodMonth >= loan.startDate && Number(item.loanDeduction || 0) !== 0;\n  });\n}`;

  const newHelper = `function isClosedPayrollInputLocked(\n  payrollRuns: PayrollRun[],\n  kind: 'attendance' | 'loan' | 'penalty' | 'earning',\n  record: AttendanceRecord | LoanSchedule | PenaltyRecord | TemporaryEarningRecord,\n) {\n  const closedRuns = payrollRuns.filter(run => run.companyId === record.companyId && ['APPROVED', 'POSTED'].includes(run.status));\n  return closedRuns.some(run => {\n    const item = run.items.find(candidate => candidate.employeeId === record.employeeId);\n    if (!item) return false;\n    // Approval does not lock an unpaid employee. Source inputs lock only after that employee\n    // is included in an active transfer batch or the payment has been confirmed.\n    const employeePaymentLocked = (run.paymentBatches || []).some(batch =>\n      ['SCHEDULED', 'PAID'].includes(batch.status) && (batch.employeeIds || []).includes(record.employeeId)\n    );\n    if (!employeePaymentLocked) return false;\n    if (kind === 'attendance') {\n      const attendance = record as AttendanceRecord;\n      if (run.periodMonth !== attendance.periodMonth) return false;\n      return Boolean(\n        attendance.absence || attendance.unpaidLeave || attendance.delayMinutes || attendance.overtimeHours ||\n        item.absenceDays || item.absenceDeduction || item.unpaidLeaveDays || item.unpaidLeaveDeduction ||\n        item.delayMinutes || item.delayDeduction || item.overtimeHours || item.overtimeAmount\n      );\n    }\n    if (kind === 'penalty') {\n      const penalty = record as PenaltyRecord;\n      return run.periodMonth === penalty.periodMonth && Number(item.penaltiesDeduction || 0) !== 0;\n    }\n    if (kind === 'earning') {\n      const earning = record as TemporaryEarningRecord;\n      return run.periodMonth === earning.periodMonth && Number(item.bonuses || 0) !== 0;\n    }\n    const loan = record as LoanSchedule;\n    return run.periodMonth >= loan.startDate && Number(item.loanDeduction || 0) !== 0;\n  });\n}`;

  if (source.includes(oldHelper)) source = source.replace(oldHelper, newHelper);
  return source;
});

console.log('Unified payroll recalculation compatibility applied.');
