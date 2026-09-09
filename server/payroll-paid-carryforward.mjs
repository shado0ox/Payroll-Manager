const asArray = value => Array.isArray(value) ? value : [];
const roundAmount = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const hasReadyBankAccount = employee => {
  const iban = String(employee?.bankIban || '').replace(/\s/g, '').toUpperCase();
  return /^SA\d{22}$/.test(iban) && employee?.bankAccountStatus !== 'PENDING';
};

const employeeIsPaymentLocked = (run, employeeId) => asArray(run?.paymentBatches).some(batch =>
  ['SCHEDULED', 'PAID'].includes(String(batch?.status || ''))
  && asArray(batch?.employeeIds).includes(employeeId)
);

/**
 * Removes a salary period from later, still-editable payroll runs after that salary is paid late.
 * The function is pure so the database command can persist every returned run atomically.
 */
export function reconcilePaidPayrollCarryForward({ runs, employees, sourceRun, paidBatch, now = new Date().toISOString() }) {
  const employeeIds = new Set(asArray(paidBatch?.employeeIds).map(String));
  if (!sourceRun?.periodMonth || !employeeIds.size) return [];
  const employeesById = new Map(asArray(employees).map(employee => [String(employee.id), employee]));
  const affectedRuns = [];

  for (const run of asArray(runs)) {
    if (run.id === sourceRun.id || run.companyId !== sourceRun.companyId || run.periodMonth <= sourceRun.periodMonth) continue;
    if (!['DRAFT', 'UNDER_REVIEW'].includes(String(run.status || 'DRAFT'))) continue;

    let removedGross = 0;
    let removedDeductions = 0;
    let removedNet = 0;
    let changed = false;
    const items = asArray(run.items).map(item => {
      const employeeId = String(item.employeeId || '');
      if (!employeeIds.has(employeeId) || employeeIsPaymentLocked(run, employeeId)) return item;
      const removedDetails = asArray(item.priorPeriodDetails).filter(detail => detail?.periodMonth === sourceRun.periodMonth);
      const keptDetails = asArray(item.priorPeriodDetails).filter(detail => detail?.periodMonth !== sourceRun.periodMonth);
      const itemRemovedGross = roundAmount(removedDetails.reduce((sum, detail) => sum + Number(detail?.gross || 0), 0));
      const itemRemovedDeductions = roundAmount(removedDetails.reduce((sum, detail) => sum + Number(detail?.deductions || 0), 0));
      const itemRemovedNet = roundAmount(removedDetails.reduce((sum, detail) => sum + Number(detail?.net || 0), 0));
      const employee = employeesById.get(employeeId);
      const releaseAutomaticBankHold = item.entitlementStatus === 'HELD'
        && item.entitlementReason === 'MISSING_BANK_ACCOUNT'
        && hasReadyBankAccount(employee);
      const releaseAutomaticSuspensionHold = item.entitlementStatus === 'HELD'
        && item.entitlementHoldSource !== 'MANUAL'
        && (item.isSuspended === true
          || item.entitlementHoldSource === 'EMPLOYEE_SUSPENSION'
          || (Boolean(employee?.suspensionReason?.trim()) && item.entitlementReason === employee.suspensionReason.trim()))
        && employee?.status !== 'SUSPENDED';
      const releaseAutomaticHold = releaseAutomaticBankHold || releaseAutomaticSuspensionHold;
      if (!removedDetails.length && !releaseAutomaticHold) return item;

      changed = true;
      removedGross = roundAmount(removedGross + itemRemovedGross);
      removedDeductions = roundAmount(removedDeductions + itemRemovedDeductions);
      removedNet = roundAmount(removedNet + itemRemovedNet);
      const next = {
        ...item,
        priorPeriodGross:roundAmount(Number(item.priorPeriodGross || 0) - itemRemovedGross),
        priorPeriodDeductions:roundAmount(Number(item.priorPeriodDeductions || 0) - itemRemovedDeductions),
        priorPeriodNet:roundAmount(Number(item.priorPeriodNet || 0) - itemRemovedNet),
        priorPeriodDetails:keptDetails,
        netSalary:roundAmount(Number(item.netSalary || 0) - itemRemovedNet),
        totalCompanyBurden:roundAmount(Number(item.totalCompanyBurden || 0) - itemRemovedNet),
      };
      if (releaseAutomaticHold) {
        next.entitlementStatus = 'PAYABLE';
        next.isSuspended = false;
        delete next.entitlementReason;
        delete next.entitlementDocumentRef;
        delete next.entitlementHoldSource;
        next.entitlementUpdatedAt = now;
      }
      return next;
    });
    if (!changed) continue;
    affectedRuns.push({
      ...run,
      items,
      totalGrossSalaries:roundAmount(Number(run.totalGrossSalaries || 0) - removedGross),
      totalDeductions:roundAmount(Number(run.totalDeductions || 0) - removedDeductions),
      totalNetSalaries:roundAmount(Number(run.totalNetSalaries || 0) - removedNet),
      totalCompanyCost:roundAmount(Number(run.totalCompanyCost || 0) - removedNet),
    });
  }
  return affectedRuns;
}

const sourceCarryDetails = (runs,sourceRun,employeeId) => {
  const sourceItem = asArray(sourceRun?.items).find(item => String(item.employeeId || '') === employeeId);
  if (!sourceItem) return [];
  const byPeriod = new Map();
  for (const detail of asArray(sourceItem.priorPeriodDetails)) {
    if (!detail?.periodMonth) continue;
    byPeriod.set(String(detail.periodMonth),{
      periodMonth:String(detail.periodMonth),gross:roundAmount(detail.gross),deductions:roundAmount(detail.deductions),net:roundAmount(detail.net),
    });
  }
  const currentNet = roundAmount(Number(sourceItem.netSalary || 0) - Number(sourceItem.priorPeriodNet || 0));
  if (currentNet > 0) byPeriod.set(String(sourceRun.periodMonth),{
    periodMonth:String(sourceRun.periodMonth),gross:roundAmount(sourceItem.totalGrossSalary),
    deductions:roundAmount(sourceItem.totalDeductions),net:currentNet,
  });
  return [...byPeriod.values()];
};

/** Restores released salary reservations to later editable runs after a batch fails or is cancelled. */
export function reconcileReleasedPayrollCarryForward({ runs, sourceRun, releasedBatch }) {
  const employeeIds = new Set(asArray(releasedBatch?.employeeIds).map(String));
  if (!sourceRun?.periodMonth || !employeeIds.size) return [];
  const affectedRuns = [];
  for (const run of asArray(runs)) {
    if (run.id === sourceRun.id || run.companyId !== sourceRun.companyId || run.periodMonth <= sourceRun.periodMonth) continue;
    if (!['DRAFT','UNDER_REVIEW'].includes(String(run.status || 'DRAFT'))) continue;
    let addedGross = 0;
    let addedDeductions = 0;
    let addedNet = 0;
    let changed = false;
    const items = asArray(run.items).map(item => {
      const employeeId = String(item.employeeId || '');
      if (!employeeIds.has(employeeId) || employeeIsPaymentLocked(run,employeeId)) return item;
      const existingPeriods = new Set(asArray(item.priorPeriodDetails).map(detail => String(detail?.periodMonth || '')));
      const detailsToAdd = sourceCarryDetails(runs,sourceRun,employeeId)
        .filter(detail => detail.periodMonth < run.periodMonth && !existingPeriods.has(detail.periodMonth));
      if (!detailsToAdd.length) return item;
      const itemAddedGross = roundAmount(detailsToAdd.reduce((sum,detail) => sum + detail.gross,0));
      const itemAddedDeductions = roundAmount(detailsToAdd.reduce((sum,detail) => sum + detail.deductions,0));
      const itemAddedNet = roundAmount(detailsToAdd.reduce((sum,detail) => sum + detail.net,0));
      if (!(itemAddedNet > 0)) return item;
      changed = true;
      addedGross = roundAmount(addedGross + itemAddedGross);
      addedDeductions = roundAmount(addedDeductions + itemAddedDeductions);
      addedNet = roundAmount(addedNet + itemAddedNet);
      return {
        ...item,
        priorPeriodGross:roundAmount(Number(item.priorPeriodGross || 0) + itemAddedGross),
        priorPeriodDeductions:roundAmount(Number(item.priorPeriodDeductions || 0) + itemAddedDeductions),
        priorPeriodNet:roundAmount(Number(item.priorPeriodNet || 0) + itemAddedNet),
        priorPeriodDetails:[...asArray(item.priorPeriodDetails),...detailsToAdd].sort((a,b) => a.periodMonth.localeCompare(b.periodMonth)),
        netSalary:roundAmount(Number(item.netSalary || 0) + itemAddedNet),
        totalCompanyBurden:roundAmount(Number(item.totalCompanyBurden || 0) + itemAddedNet),
      };
    });
    if (!changed) continue;
    affectedRuns.push({
      ...run,items,
      totalGrossSalaries:roundAmount(Number(run.totalGrossSalaries || 0) + addedGross),
      totalDeductions:roundAmount(Number(run.totalDeductions || 0) + addedDeductions),
      totalNetSalaries:roundAmount(Number(run.totalNetSalaries || 0) + addedNet),
      totalCompanyCost:roundAmount(Number(run.totalCompanyCost || 0) + addedNet),
    });
  }
  return affectedRuns;
}
