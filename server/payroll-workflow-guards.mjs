export function createPayrollWorkflowGuards({ can,asArray,workflowError }) {
const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const payrollFinancialCore = (run) => {
  if (!run || typeof run !== 'object') return run;
  const number = (value) => Number(value ?? 0);
  const text = (value) => String(value ?? '');
  return {
    companyId:text(run.companyId), periodMonth:text(run.periodMonth), startDate:text(run.startDate), endDate:text(run.endDate),
    employeesCount:number(run.employeesCount), totalBaseSalaries:number(run.totalBaseSalaries),
    totalAllowances:number(run.totalAllowances), totalOvertime:number(run.totalOvertime),
    totalGrossSalaries:number(run.totalGrossSalaries), totalAbsenceDeductions:number(run.totalAbsenceDeductions),
    totalDelayDeductions:number(run.totalDelayDeductions), totalGosiEmployee:number(run.totalGosiEmployee),
    totalGosiEmployer:number(run.totalGosiEmployer), totalLoanDeductions:number(run.totalLoanDeductions),
    totalPenalties:number(run.totalPenalties), totalDeductions:number(run.totalDeductions),
    totalNetSalaries:number(run.totalNetSalaries), totalCompanyCost:number(run.totalCompanyCost),
  };
};

const hasOwnPayrollInputKey = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
const closedRunsForInput = (stored, companyId) => asArray(stored?.payrollRuns).filter(run => run.companyId === companyId && ['APPROVED','POSTED'].includes(run.status));
const payrollSourceLocked = (stored, kind, record) => closedRunsForInput(stored, record.companyId).some(run => {
  const item = asArray(run.items).find(candidate => candidate.employeeId === record.employeeId);
  if (!item) return false;
  // Payroll inputs remain editable for unpaid/held employees. Once the employee is reserved
  // in a SCHEDULED batch or actually PAID, source entries used by that payroll item are locked.
  const employeePaymentLocked = asArray(run.paymentBatches).some(batch =>
    ['SCHEDULED','PAID'].includes(batch.status) && asArray(batch.employeeIds).includes(record.employeeId)
  );
  if (!employeePaymentLocked) return false;
  if (kind === 'attendance') return run.periodMonth === record.periodMonth;
  if (kind === 'penalty') return run.periodMonth === record.periodMonth && Number(item.penaltiesDeduction || 0) !== 0;
  if (kind === 'earning') return run.periodMonth === record.periodMonth && Number(item.bonuses || 0) !== 0;
  return run.periodMonth >= record.startDate && Number(item.loanDeduction || 0) !== 0;
});
const changedPayrollSourceRows = (beforeRows, afterRows) => {
  const before = new Map(asArray(beforeRows).map(row => [row.id, row]));
  const after = new Map(asArray(afterRows).map(row => [row.id, row]));
  const changed = [];
  for (const [id, row] of before) {
    const next = after.get(id);
    if (!next || !sameJson(row, next)) changed.push(row);
  }
  for (const [id, row] of after) if (!before.has(id)) changed.push(row);
  return changed;
};
const isAppendOnlyLoanAdjustment = (beforeLoan, afterLoan, user) => {
  if (!beforeLoan || !afterLoan) return false;
  const beforeAdjustments = asArray(beforeLoan.adjustments);
  const afterAdjustments = asArray(afterLoan.adjustments);
  if (afterAdjustments.length !== beforeAdjustments.length + 1) return false;
  if (!sameJson(beforeAdjustments, afterAdjustments.slice(0, -1))) return false;
  const adjustment = afterAdjustments[afterAdjustments.length - 1];
  if (!adjustment || typeof adjustment.id !== 'string' || !adjustment.id
    || !Number.isFinite(Number(adjustment.amount)) || Number(adjustment.amount) === 0
    || typeof adjustment.reason !== 'string' || !adjustment.reason.trim()
    || typeof adjustment.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(adjustment.date)) return false;
  const immutableKeys = ['id','companyId','employeeId','totalAmount','monthlyInstallment','totalInstallments','startDate','reason'];
  if (immutableKeys.some(key => !sameJson(beforeLoan[key], afterLoan[key]))) return false;
  const expectedBalance = Number((Number(beforeLoan.remainingAmount || 0) + Number(adjustment.amount)).toFixed(2));
  if (expectedBalance < 0 || Number(afterLoan.remainingAmount) !== expectedBalance) return false;
  const parsedAdjustmentDate = new Date(`${adjustment.date}T00:00:00Z`);
  if (Number.isNaN(parsedAdjustmentDate.getTime()) || parsedAdjustmentDate.toISOString().slice(0, 10) !== adjustment.date) return false;
  const installment = Number(beforeLoan.monthlyInstallment || 0);
  const expectedRemainingInstallments = expectedBalance === 0
    ? 0
    : installment > 0 ? Math.ceil(expectedBalance / installment) : Number(beforeLoan.remainingInstallments || 0);
  if (Number(afterLoan.remainingInstallments) !== expectedRemainingInstallments) return false;
  const expectedStatus = expectedBalance === 0
    ? 'COMPLETED'
    : beforeLoan.status === 'COMPLETED' ? 'ACTIVE' : beforeLoan.status;
  if (afterLoan.status !== expectedStatus) return false;
  adjustment.createdAt = new Date().toISOString();
  adjustment.createdBy = String(user?.id || '');
  return true;
};

function validateClosedPayrollInputs(stored, incoming) {
  const checks = [
    ['attendance', 'attendance'],
    ['loans', 'loan'],
    ['penalties', 'penalty'],
    ['temporaryEarnings', 'earning'],
  ];
  for (const [key, kind] of checks) {
    if (!hasOwnPayrollInputKey(incoming, key)) continue;
    const beforeById = new Map(asArray(stored?.[key]).map(row => [row.id, row]));
    const afterById = new Map(asArray(incoming?.[key]).map(row => [row.id, row]));
    for (const row of changedPayrollSourceRows(stored?.[key], incoming?.[key])) {
      if (!payrollSourceLocked(stored, kind, row)) continue;
      if (kind === 'loan' && isAppendOnlyLoanAdjustment(beforeById.get(row.id), afterById.get(row.id), user)) continue;
      throw workflowError(409, 'PAYROLL_SOURCE_ENTRY_LOCKED');
    }
  }
}

const payrollItemPaymentLockCore = (item) => {
  if (!item || typeof item !== 'object') return item ?? null;
  const number = (value) => Number(value ?? 0);
  const text = (value) => String(value ?? '');
  return {
    id:text(item.id), payrollRunId:text(item.payrollRunId), employeeId:text(item.employeeId), employeeNo:text(item.employeeNo),
    employeeName:text(item.employeeName), employeeNameEn:text(item.employeeNameEn), nationalIdOrIqama:text(item.nationalIdOrIqama),
    department:text(item.department), costCenterId:text(item.costCenterId), nationality:text(item.nationality),
    bankIban:text(item.bankIban), bankName:text(item.bankName), bankSwiftCode:text(item.bankSwiftCode),
    baseSalary:number(item.baseSalary), housingAllowance:number(item.housingAllowance), transportAllowance:number(item.transportAllowance),
    otherAllowances:number(item.otherAllowances), nonGosiAllowances:number(item.nonGosiAllowances), overtimeAmount:number(item.overtimeAmount),
    overtimeHours:number(item.overtimeHours), bonuses:number(item.bonuses), totalGrossSalary:number(item.totalGrossSalary),
    payableDays:number(item.payableDays), salaryProrationFactor:number(item.salaryProrationFactor),
    delayMinutes:number(item.delayMinutes), delayDeduction:number(item.delayDeduction), absenceDays:number(item.absenceDays),
    absenceDeduction:number(item.absenceDeduction), unpaidLeaveDays:number(item.unpaidLeaveDays), unpaidLeaveDeduction:number(item.unpaidLeaveDeduction),
    gosiEmployeeShare:number(item.gosiEmployeeShare), gosiSubjectAmount:number(item.gosiSubjectAmount),
    gosiEmployeeRate:number(item.gosiEmployeeRate), gosiEmployerRate:number(item.gosiEmployerRate), gosiEnabled:item.gosiEnabled !== false,
    loanDeduction:number(item.loanDeduction), penaltiesDeduction:number(item.penaltiesDeduction), otherDeductions:number(item.otherDeductions),
    totalDeductions:number(item.totalDeductions), netSalary:number(item.netSalary), gosiEmployerShare:number(item.gosiEmployerShare),
    totalCompanyBurden:number(item.totalCompanyBurden), saudiGosiPaymentMode:text(item.saudiGosiPaymentMode),
    manualAddition:number(item.manualAddition), manualDeduction:number(item.manualDeduction), adjustmentNotes:text(item.adjustmentNotes),
    entitlementStatus:text(item.entitlementStatus || 'PAYABLE'), entitlementReason:text(item.entitlementReason),
    entitlementDocumentRef:text(item.entitlementDocumentRef), entitlementHoldSource:text(item.entitlementHoldSource), isSuspended:Boolean(item.isSuspended),
    priorPeriodGross:number(item.priorPeriodGross), priorPeriodDeductions:number(item.priorPeriodDeductions), priorPeriodNet:number(item.priorPeriodNet),
    priorPeriodDetails:asArray(item.priorPeriodDetails).map(row => ({
      periodMonth:text(row?.periodMonth), gross:number(row?.gross), deductions:number(row?.deductions), net:number(row?.net)
    })),
  };
};

function validatePayrollWorkflowChanges(storedRuns, incomingRuns, user) {
  const before = new Map(asArray(storedRuns).map(run => [run.id, run]));
  const after = new Map(asArray(incomingRuns).map(run => [run.id, run]));

  for (const [runId, oldRun] of before) {
    const nextRun = after.get(runId);
    if (!nextRun) {
      if (['APPROVED','POSTED'].includes(oldRun.status) || asArray(oldRun.paymentBatches).some(batch => ['SCHEDULED','PAID'].includes(batch.status))) {
        throw workflowError(409, 'PAYROLL_RUN_LOCKED');
      }
      continue;
    }

    const oldStatus = String(oldRun.status || 'DRAFT');
    const nextStatus = String(nextRun.status || 'DRAFT');
    if (oldStatus !== nextStatus) {
      const transition = oldStatus + '->' + nextStatus;
      const allowed = new Set(['DRAFT->UNDER_REVIEW','UNDER_REVIEW->DRAFT','UNDER_REVIEW->APPROVED','APPROVED->UNDER_REVIEW','APPROVED->POSTED','POSTED->APPROVED']);
      if (!allowed.has(transition)) throw workflowError(409, 'INVALID_PAYROLL_STATUS_TRANSITION');
      if (transition === 'UNDER_REVIEW->APPROVED' && !can(user, 'APPROVE_PAYROLL')) {
        throw workflowError(403, 'APPROVE_PAYROLL_REQUIRED');
      }
      if ((transition === 'APPROVED->UNDER_REVIEW' || transition === 'POSTED->APPROVED') && !can(user, 'REVERSE_PAYROLL_APPROVAL')) {
        throw workflowError(403, 'REVERSE_PAYROLL_APPROVAL_REQUIRED');
      }
      if (transition === 'APPROVED->POSTED' && !can(user, 'POST_PAYROLL')) {
        throw workflowError(403, 'POST_PAYROLL_REQUIRED');
      }
      if ((transition === 'DRAFT->UNDER_REVIEW' || transition === 'UNDER_REVIEW->DRAFT') && !can(user, 'MANAGE_PAYROLL')) {
        throw workflowError(403, 'MANAGE_PAYROLL_REQUIRED');
      }
      if ((transition === 'APPROVED->UNDER_REVIEW' || transition === 'POSTED->APPROVED')
        && asArray(oldRun.paymentBatches).some(batch => batch.status === 'PAID')) {
        throw workflowError(409, 'PAID_PAYROLL_CANNOT_REOPEN');
      }
    }

    // Approved/posting no longer freezes the whole month. Only employees already reserved/paid
    // in an active transfer batch are immutable; unpaid/new employees may be recalculated or added.
    if (['APPROVED','POSTED'].includes(oldStatus)) {
      if (oldRun.companyId !== nextRun.companyId || oldRun.periodMonth !== nextRun.periodMonth) {
        throw workflowError(409, 'APPROVED_PAYROLL_IDENTITY_IMMUTABLE');
      }
      const lockedEmployeeIds = new Set(
        asArray(oldRun.paymentBatches)
          .filter(batch => ['SCHEDULED','PAID'].includes(batch.status))
          .flatMap(batch => asArray(batch.employeeIds))
      );
      const oldItemsByEmployee = new Map(asArray(oldRun.items).map(item => [item.employeeId, item]));
      const nextItemsByEmployee = new Map(asArray(nextRun.items).map(item => [item.employeeId, item]));
      for (const employeeId of lockedEmployeeIds) {
        if (!sameJson(payrollItemPaymentLockCore(oldItemsByEmployee.get(employeeId)), payrollItemPaymentLockCore(nextItemsByEmployee.get(employeeId)))) {
          throw workflowError(409, 'TRANSFERRED_EMPLOYEE_PAYROLL_IMMUTABLE');
        }
      }
    }

    const oldBatches = new Map(asArray(oldRun.paymentBatches).map(batch => [batch.id, batch]));
    const nextBatches = new Map(asArray(nextRun.paymentBatches).map(batch => [batch.id, batch]));
    for (const [batchId, oldBatch] of oldBatches) {
      const nextBatch = nextBatches.get(batchId);
      if (!nextBatch) {
        if (['SCHEDULED','PAID'].includes(oldBatch.status)) throw workflowError(409, 'PAYMENT_BATCH_CANNOT_BE_DELETED');
        continue;
      }
      const isPaidReversal = oldBatch.status === 'PAID' && nextBatch.status === 'SCHEDULED';
      if (oldBatch.status === 'PAID' && !sameJson(oldBatch, nextBatch) && !isPaidReversal) throw workflowError(409, 'PAID_BATCH_IMMUTABLE');
      if (oldBatch.status !== nextBatch.status) {
        const paymentTransition = String(oldBatch.status) + '->' + String(nextBatch.status);
        if (paymentTransition === 'SCHEDULED->PAID') {
          if (!can(user, 'CONFIRM_PAYROLL_PAYMENT')) throw workflowError(403, 'CONFIRM_PAYROLL_PAYMENT_REQUIRED');
          if (Number(oldBatch.totalAmount || 0) !== Number(nextBatch.totalAmount || 0)
            || !sameJson(asArray(oldBatch.employeeIds), asArray(nextBatch.employeeIds))) {
            throw workflowError(409, 'PAYMENT_BATCH_SCOPE_CHANGED');
          }
        } else if (paymentTransition === 'PAID->SCHEDULED') {
          if (!can(user, 'REVERSE_PAYROLL_PAYMENT')) throw workflowError(403, 'REVERSE_PAYROLL_PAYMENT_REQUIRED');
          if (Number(oldBatch.totalAmount || 0) !== Number(nextBatch.totalAmount || 0)
            || !sameJson(asArray(oldBatch.employeeIds), asArray(nextBatch.employeeIds))
            || !sameJson(oldBatch.method, nextBatch.method)
            || !sameJson(oldBatch.scheduledDate, nextBatch.scheduledDate)
            || !sameJson(oldBatch.reference, nextBatch.reference)
            || !sameJson(oldBatch.notes, nextBatch.notes)) throw workflowError(409, 'PAYMENT_BATCH_SCOPE_CHANGED');
          if (typeof nextBatch.paymentReversalReason !== 'string' || !nextBatch.paymentReversalReason.trim()
            || nextBatch.paymentDate != null
            || String(nextBatch.reversedPaymentDate || '') !== String(oldBatch.paymentDate || '')) {
            throw workflowError(409, 'PAYMENT_REVERSAL_METADATA_REQUIRED');
          }
          nextBatch.paymentReversedAt = new Date().toISOString();
          nextBatch.paymentReversedBy = String(user?.id || '');
          nextBatch.paymentReversedByName = String(user?.name || user?.username || '');
        } else if (paymentTransition === 'SCHEDULED->FAILED' || paymentTransition === 'SCHEDULED->CANCELLED') {
          if (!can(user, 'MANAGE_PAYROLL')) throw workflowError(403, 'MANAGE_PAYROLL_REQUIRED');
        } else {
          throw workflowError(409, 'INVALID_PAYMENT_BATCH_TRANSITION');
        }
      } else if (oldBatch.status === 'SCHEDULED' && !sameJson(oldBatch, nextBatch)) {
        throw workflowError(409, 'SCHEDULED_BATCH_IMMUTABLE');
      }
    }

    for (const [batchId, batch] of nextBatches) {
      if (oldBatches.has(batchId)) continue;
      if (!can(user, 'MANAGE_PAYROLL')) throw workflowError(403, 'MANAGE_PAYROLL_REQUIRED');
      if (batch.status !== 'SCHEDULED') throw workflowError(409, 'NEW_PAYMENT_BATCH_MUST_BE_SCHEDULED');
    }
  }

  for (const [runId, run] of after) {
    if (before.has(runId)) continue;
    if (!can(user, 'MANAGE_PAYROLL')) throw workflowError(403, 'MANAGE_PAYROLL_REQUIRED');
    if (!['DRAFT','UNDER_REVIEW'].includes(run.status)) throw workflowError(409, 'NEW_PAYROLL_RUN_INVALID_STATUS');
    if (asArray(run.paymentBatches).length) throw workflowError(409, 'NEW_PAYROLL_RUN_CANNOT_HAVE_PAYMENTS');
  }
}


  return { sameJson,isAppendOnlyLoanAdjustment,payrollSourceLocked,validateClosedPayrollInputs,validatePayrollWorkflowChanges };
}
