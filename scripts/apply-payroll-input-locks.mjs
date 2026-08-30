import fs from 'node:fs';

function patchFile(relativePath, transform) {
  const url = new URL(`../${relativePath}`, import.meta.url);
  let source = fs.readFileSync(url, 'utf8');
  const next = transform(source);
  if (next === source) {
    console.log(`No payroll input lock changes needed for ${relativePath}.`);
    return;
  }
  fs.writeFileSync(url, next);
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Missing transform anchor: ${label}`);
  return source.replace(before, after);
}

const uiLockHelper = `\nconst payrollInputLockMessage = (language: 'ar' | 'en') => language === 'ar'\n  ? 'هذه العملية مرتبطة بمسير رواتب معتمد/مرحل. يجب إرجاع المسير أولاً قبل تعديلها أو حذفها.'\n  : 'This entry is linked to an approved/posted payroll run. Reopen the payroll run before editing or deleting it.';\n\nfunction isClosedPayrollInputLocked(\n  payrollRuns: PayrollRun[],\n  kind: 'attendance' | 'loan' | 'penalty' | 'earning',\n  record: AttendanceRecord | LoanSchedule | PenaltyRecord | TemporaryEarningRecord,\n) {\n  const closedRuns = payrollRuns.filter(run => run.companyId === record.companyId && ['APPROVED', 'POSTED'].includes(run.status));\n  return closedRuns.some(run => {\n    const item = run.items.find(candidate => candidate.employeeId === record.employeeId);\n    if (!item) return false;\n    if (kind === 'attendance') {\n      const attendance = record as AttendanceRecord;\n      if (run.periodMonth !== attendance.periodMonth) return false;\n      return Boolean(\n        attendance.absence || attendance.unpaidLeave || attendance.delayMinutes || attendance.overtimeHours ||\n        item.absenceDays || item.absenceDeduction || item.unpaidLeaveDays || item.unpaidLeaveDeduction ||\n        item.delayMinutes || item.delayDeduction || item.overtimeHours || item.overtimeAmount\n      );\n    }\n    if (kind === 'penalty') {\n      const penalty = record as PenaltyRecord;\n      return run.periodMonth === penalty.periodMonth && Number(item.penaltiesDeduction || 0) !== 0;\n    }\n    if (kind === 'earning') {\n      const earning = record as TemporaryEarningRecord;\n      return run.periodMonth === earning.periodMonth && Number(item.bonuses || 0) !== 0;\n    }\n    const loan = record as LoanSchedule;\n    return run.periodMonth >= loan.startDate && Number(item.loanDeduction || 0) !== 0;\n  });\n}\n`;

patchFile('src/App.tsx', (initial) => {
  let source = initial;
  const typeAnchor = `type MasarAppState = ReturnType<typeof loadInitialState> & { temporaryEarnings: TemporaryEarningRecord[] };`;
  source = replaceOnce(source, typeAnchor, `${typeAnchor}${uiLockHelper}`, 'App payroll input lock helper');

  const replacements = [
    [
      `  const handleAddAttendance = (record: AttendanceRecord) => {\n    setState(prev => {`,
      `  const handleAddAttendance = (record: AttendanceRecord) => {\n    if (isClosedPayrollInputLocked(state.payrollRuns, 'attendance', record)) {\n      alert(payrollInputLockMessage(language));\n      return;\n    }\n    setState(prev => {`,
      'attendance save lock',
    ],
    [
      `  const handleBulkImportAttendance = (records: AttendanceRecord[]) => {\n    setState(prev => {`,
      `  const handleBulkImportAttendance = (records: AttendanceRecord[]) => {\n    if (records.some(record => isClosedPayrollInputLocked(state.payrollRuns, 'attendance', record))) {\n      alert(payrollInputLockMessage(language));\n      return;\n    }\n    setState(prev => {`,
      'attendance bulk lock',
    ],
    [
      `  const handleDeleteAttendance = (recordId: string) => {\n    setState(prev => {`,
      `  const handleDeleteAttendance = (recordId: string) => {\n    const existingRecord = state.attendance.find(item => item.id === recordId);\n    if (existingRecord && isClosedPayrollInputLocked(state.payrollRuns, 'attendance', existingRecord)) {\n      alert(payrollInputLockMessage(language));\n      return;\n    }\n    setState(prev => {`,
      'attendance delete lock',
    ],
    [
      `  const handleAddLoan = (loan: LoanSchedule) => {\n    setState(prev => {`,
      `  const handleAddLoan = (loan: LoanSchedule) => {\n    const existingLoan = state.loans.find(item => item.id === loan.id);\n    if (existingLoan && isClosedPayrollInputLocked(state.payrollRuns, 'loan', existingLoan)) {\n      alert(payrollInputLockMessage(language));\n      return;\n    }\n    setState(prev => {`,
      'loan save lock',
    ],
    [
      `  const handleUpdateLoanStatus = (loanId: string, status: LoanSchedule['status']) => {\n    setState(prev => {`,
      `  const handleUpdateLoanStatus = (loanId: string, status: LoanSchedule['status']) => {\n    const existingLoan = state.loans.find(item => item.id === loanId);\n    if (existingLoan && isClosedPayrollInputLocked(state.payrollRuns, 'loan', existingLoan)) {\n      alert(payrollInputLockMessage(language));\n      return;\n    }\n    setState(prev => {`,
      'loan status lock',
    ],
    [
      `  const handleDeleteLoan = (loanId: string) => {\n    setState(prev => {`,
      `  const handleDeleteLoan = (loanId: string) => {\n    const existingLoan = state.loans.find(item => item.id === loanId);\n    if (existingLoan && isClosedPayrollInputLocked(state.payrollRuns, 'loan', existingLoan)) {\n      alert(payrollInputLockMessage(language));\n      return;\n    }\n    setState(prev => {`,
      'loan delete lock',
    ],
    [
      `  const handleAddPenalty = (penalty: PenaltyRecord) => {\n    setState(prev => {`,
      `  const handleAddPenalty = (penalty: PenaltyRecord) => {\n    const existingPenalty = state.penalties.find(item => item.id === penalty.id);\n    if (existingPenalty && isClosedPayrollInputLocked(state.payrollRuns, 'penalty', existingPenalty)) {\n      alert(payrollInputLockMessage(language));\n      return;\n    }\n    setState(prev => {`,
      'penalty save lock',
    ],
    [
      `  const handleCancelPenalty = (penaltyId: string) => {\n    setState(prev => {`,
      `  const handleCancelPenalty = (penaltyId: string) => {\n    const existingPenalty = state.penalties.find(item => item.id === penaltyId);\n    if (existingPenalty && isClosedPayrollInputLocked(state.payrollRuns, 'penalty', existingPenalty)) {\n      alert(payrollInputLockMessage(language));\n      return;\n    }\n    setState(prev => {`,
      'penalty cancel lock',
    ],
    [
      `  const handleDeletePenalty = (penaltyId: string) => {\n    setState(prev => {`,
      `  const handleDeletePenalty = (penaltyId: string) => {\n    const existingPenalty = state.penalties.find(item => item.id === penaltyId);\n    if (existingPenalty && isClosedPayrollInputLocked(state.payrollRuns, 'penalty', existingPenalty)) {\n      alert(payrollInputLockMessage(language));\n      return;\n    }\n    setState(prev => {`,
      'penalty delete lock',
    ],
    [
      `  const handleSaveTemporaryEarning = (earning: TemporaryEarningRecord) => {\n    setState(prev => {`,
      `  const handleSaveTemporaryEarning = (earning: TemporaryEarningRecord) => {\n    const existingEarning = state.temporaryEarnings.find(item => item.id === earning.id);\n    if (existingEarning && isClosedPayrollInputLocked(state.payrollRuns, 'earning', existingEarning)) {\n      alert(payrollInputLockMessage(language));\n      return;\n    }\n    setState(prev => {`,
      'earning save lock',
    ],
    [
      `  const handleCancelTemporaryEarning = (earningId: string) => {\n    setState(prev => {`,
      `  const handleCancelTemporaryEarning = (earningId: string) => {\n    const existingEarning = state.temporaryEarnings.find(item => item.id === earningId);\n    if (existingEarning && isClosedPayrollInputLocked(state.payrollRuns, 'earning', existingEarning)) {\n      alert(payrollInputLockMessage(language));\n      return;\n    }\n    setState(prev => {`,
      'earning cancel lock',
    ],
    [
      `  const handleDeleteTemporaryEarning = (earningId: string) => {\n    setState(prev => {`,
      `  const handleDeleteTemporaryEarning = (earningId: string) => {\n    const existingEarning = state.temporaryEarnings.find(item => item.id === earningId);\n    if (existingEarning && isClosedPayrollInputLocked(state.payrollRuns, 'earning', existingEarning)) {\n      alert(payrollInputLockMessage(language));\n      return;\n    }\n    setState(prev => {`,
      'earning delete lock',
    ],
  ];
  for (const [before, after, label] of replacements) source = replaceOnce(source, before, after, label);
  return source;
});

patchFile('scripts/apply-payroll-server-authorization.mjs', (initial) => {
  let source = initial;
  const mergeAnchor = `const mergeAnchor = \`function mergeStateForUser(stored, incoming, user) {\`;`;
  const validator = `\nconst lockedInputHelperAnchor = \`function validatePayrollWorkflowChanges(storedRuns, incomingRuns, user) {\`;\nconst lockedInputHelper = \`const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);\nconst closedRunsFor = (stored, companyId) => asArray(stored?.payrollRuns).filter(run => run.companyId === companyId && ['APPROVED','POSTED'].includes(run.status));\nconst lockedInput = (stored, kind, record) => closedRunsFor(stored, record.companyId).some(run => {\n  const item = asArray(run.items).find(candidate => candidate.employeeId === record.employeeId);\n  if (!item) return false;\n  if (kind === 'attendance') return run.periodMonth === record.periodMonth;\n  if (kind === 'penalty') return run.periodMonth === record.periodMonth && Number(item.penaltiesDeduction || 0) !== 0;\n  if (kind === 'earning') return run.periodMonth === record.periodMonth && Number(item.bonuses || 0) !== 0;\n  return run.periodMonth >= record.startDate && Number(item.loanDeduction || 0) !== 0;\n});\nconst changedRows = (beforeRows, afterRows) => {\n  const before = new Map(asArray(beforeRows).map(row => [row.id, row]));\n  const after = new Map(asArray(afterRows).map(row => [row.id, row]));\n  const changed = [];\n  for (const [id, row] of before) {\n    const next = after.get(id);\n    if (!next || !sameJson(row, next)) changed.push(row);\n  }\n  for (const [id, row] of after) if (!before.has(id)) changed.push(row);\n  return changed;\n};\nfunction validateClosedPayrollInputs(stored, incoming) {\n  const checks = [\n    ['attendance', 'attendance'],\n    ['loans', 'loan'],\n    ['penalties', 'penalty'],\n    ['temporaryEarnings', 'earning'],\n  ];\n  for (const [key, kind] of checks) {\n    if (!hasOwn(incoming, key)) continue;\n    for (const row of changedRows(stored?.[key], incoming?.[key])) {\n      if (lockedInput(stored, kind, row)) throw workflowError(409, 'PAYROLL_SOURCE_ENTRY_LOCKED');\n    }\n  }\n}\n\n\${lockedInputHelperAnchor}\`;\nreplaceOnce(lockedInputHelperAnchor, lockedInputHelper, 'closed payroll input protection helper');\n`;
  if (!source.includes('validateClosedPayrollInputs(stored, incoming);')) {
    source = replaceOnce(source, mergeAnchor, `${validator}\n${mergeAnchor}`, 'server closed input helper injection');
    source = replaceOnce(
      source,
      `  \`${mergeAnchor}\\n  validatePayrollWorkflowChanges(stored?.payrollRuns, incoming?.payrollRuns, user);\`,`,
      `  \`${mergeAnchor}\\n  validateClosedPayrollInputs(stored, incoming);\\n  validatePayrollWorkflowChanges(stored?.payrollRuns, incoming?.payrollRuns, user);\`,`,
      'server closed input validation call',
    );
  }
  return source;
});

console.log('Payroll input lock hardening applied.');
