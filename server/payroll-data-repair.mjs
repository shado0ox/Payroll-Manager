const asArray = value => Array.isArray(value) ? value : [];
const roundAmount = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const sameJson = (a,b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const activeBatch = batch => ['SCHEDULED','PAID'].includes(String(batch?.status || ''));

const validReadyBank = employee => {
  const iban = String(employee?.bankIban || '').replace(/\s/g,'').toUpperCase();
  return /^SA\d{22}$/.test(iban) && employee?.bankAccountStatus !== 'PENDING';
};

const employeeLockedInRun = (run,employeeId) => asArray(run.paymentBatches).some(batch =>
  activeBatch(batch) && asArray(batch.employeeIds).includes(employeeId)
);

const sourceReserved = (runs,sourceRun,sourceItem) => asArray(runs).some(run => asArray(run.paymentBatches).some(batch => {
  if (!activeBatch(batch)) return false;
  const employeeIncluded = asArray(batch.employeeIds).includes(sourceItem.employeeId);
  if (run.id === sourceRun.id && employeeIncluded) return true;
  if (employeeIncluded) {
    const paymentItem = asArray(run.items).find(item => item.employeeId === sourceItem.employeeId);
    if (asArray(paymentItem?.priorPeriodDetails).some(detail => detail?.periodMonth === sourceRun.periodMonth)) return true;
  }
  return asArray(batch.priorEntitlements).some(ref =>
    ref?.sourcePayrollRunId === sourceRun.id && ref?.sourcePayrollItemId === sourceItem.id
  );
}));

const canonicalCarryDetails = (runs,targetRun,employeeId) => asArray(runs)
  .filter(sourceRun => sourceRun.companyId === targetRun.companyId && sourceRun.periodMonth < targetRun.periodMonth)
  .sort((a,b) => a.periodMonth.localeCompare(b.periodMonth))
  .flatMap(sourceRun => {
    const sourceItem = asArray(sourceRun.items).find(item => item.employeeId === employeeId);
    if (!sourceItem || sourceReserved(runs,sourceRun,sourceItem)) return [];
    if (['SETTLED','CANCELLED_WITH_DOCUMENT'].includes(String(sourceItem.entitlementStatus || ''))) return [];
    const net = roundAmount(Number(sourceItem.netSalary || 0) - Number(sourceItem.priorPeriodNet || 0));
    if (!(net > 0)) return [];
    return [{
      periodMonth:sourceRun.periodMonth,
      gross:roundAmount(sourceItem.totalGrossSalary),
      deductions:roundAmount(sourceItem.totalDeductions),
      net,
    }];
  });

const aggregateRun = run => ({
  employeesCount:asArray(run.items).length,
  totalGrossSalaries:roundAmount(asArray(run.items).reduce((sum,item) => sum + Number(item.totalGrossSalary || 0) + Number(item.priorPeriodGross || 0),0)),
  totalDeductions:roundAmount(asArray(run.items).reduce((sum,item) => sum + Number(item.totalDeductions || 0) + Number(item.priorPeriodDeductions || 0),0)),
  totalNetSalaries:roundAmount(asArray(run.items).reduce((sum,item) => sum + Number(item.netSalary || 0),0)),
  totalCompanyCost:roundAmount(asArray(run.items).reduce((sum,item) => sum + Number(item.totalCompanyBurden || 0),0)),
});

export function buildPayrollRepairPlan(state,companyIds = []) {
  const allowed = new Set(asArray(companyIds));
  const runs = asArray(state?.payrollRuns).filter(run => !allowed.size || allowed.has(run.companyId));
  const employeesById = new Map(asArray(state?.employees).map(employee => [employee.id,employee]));
  const issues = [];
  const proposedRuns = new Map();

  for (const originalRun of runs) {
    const findings = [];
    const repairable = ['DRAFT','UNDER_REVIEW'].includes(String(originalRun.status || 'DRAFT'));
    let carryChanged = false;
    let holdChanged = false;
    const items = asArray(originalRun.items).map(originalItem => {
      if (employeeLockedInRun(originalRun,originalItem.employeeId)) return originalItem;
      // Approved and posted payroll runs are immutable historical snapshots.
      // A payment created in a later month can legitimately change today's
      // carry-forward expectation without making the closed snapshot wrong.
      // Only validate their stored aggregates below; never recalculate their
      // employee carry or entitlement state from current payment coverage.
      if (!repairable) return originalItem;
      let item = { ...originalItem };
      const expectedDetails = canonicalCarryDetails(runs,originalRun,originalItem.employeeId);
      const currentDetails = asArray(originalItem.priorPeriodDetails).map(detail => ({
        periodMonth:String(detail?.periodMonth || ''),gross:roundAmount(detail?.gross),deductions:roundAmount(detail?.deductions),net:roundAmount(detail?.net),
      })).filter(detail => detail.periodMonth).sort((a,b) => a.periodMonth.localeCompare(b.periodMonth));
      if (!sameJson(currentDetails,expectedDetails)) {
        carryChanged = true;
        const baseNet = roundAmount(Number(originalItem.netSalary || 0) - Number(originalItem.priorPeriodNet || 0));
        const baseBurden = roundAmount(Number(originalItem.totalCompanyBurden || 0) - Number(originalItem.priorPeriodNet || 0));
        const priorPeriodGross = roundAmount(expectedDetails.reduce((sum,detail) => sum + detail.gross,0));
        const priorPeriodDeductions = roundAmount(expectedDetails.reduce((sum,detail) => sum + detail.deductions,0));
        const priorPeriodNet = roundAmount(expectedDetails.reduce((sum,detail) => sum + detail.net,0));
        item = { ...item,priorPeriodDetails:expectedDetails,priorPeriodGross,priorPeriodDeductions,priorPeriodNet,
          netSalary:roundAmount(baseNet + priorPeriodNet),totalCompanyBurden:roundAmount(baseBurden + priorPeriodNet) };
      }
      const employee = employeesById.get(originalItem.employeeId);
      const staleBankHold = item.entitlementStatus === 'HELD' && item.entitlementReason === 'MISSING_BANK_ACCOUNT' && validReadyBank(employee);
      const earlierSalaryWasPaid = runs.some(sourceRun => sourceRun.companyId === originalRun.companyId
        && sourceRun.periodMonth < originalRun.periodMonth
        && asArray(sourceRun.paymentBatches).some(batch => batch.status === 'PAID' && asArray(batch.employeeIds).includes(originalItem.employeeId)));
      const legacyPaidHold = item.entitlementStatus === 'HELD'
        && !item.entitlementHoldSource
        && employee?.status !== 'SUSPENDED'
        && validReadyBank(employee)
        && earlierSalaryWasPaid;
      const staleSuspensionHold = item.entitlementStatus === 'HELD'
        && item.entitlementHoldSource !== 'MANUAL'
        && (item.isSuspended === true
          || item.entitlementHoldSource === 'EMPLOYEE_SUSPENSION'
          || (Boolean(employee?.suspensionReason?.trim()) && item.entitlementReason === employee.suspensionReason.trim()))
        && employee?.status !== 'SUSPENDED';
      if (staleBankHold || staleSuspensionHold || legacyPaidHold) {
        holdChanged = true;
        item = { ...item,entitlementStatus:'PAYABLE',isSuspended:false,entitlementUpdatedAt:new Date().toISOString() };
        delete item.entitlementReason;
        delete item.entitlementDocumentRef;
        delete item.entitlementHoldSource;
      }
      return item;
    });
    let proposed = { ...originalRun,items };
    if (carryChanged) findings.push('CARRY_FORWARD_MISMATCH');
    if (holdChanged) findings.push('AUTOMATIC_HOLD_STALE');
    const expectedTotals = aggregateRun(proposed);
    const currentTotals = aggregateRun(originalRun);
    const storedTotals = {
      employeesCount:Number(originalRun.employeesCount || 0),totalGrossSalaries:roundAmount(originalRun.totalGrossSalaries),
      totalDeductions:roundAmount(originalRun.totalDeductions),totalNetSalaries:roundAmount(originalRun.totalNetSalaries),
      totalCompanyCost:roundAmount(originalRun.totalCompanyCost),
    };
    if (!sameJson(storedTotals,currentTotals) || !sameJson(currentTotals,expectedTotals)) findings.push('RUN_TOTAL_MISMATCH');
    proposed = { ...proposed,...expectedTotals };
    if (!findings.length) continue;
    const id = `payroll-run:${originalRun.id}`;
    issues.push({ id,type:'PAYROLL_RUN_INCONSISTENCY',companyId:originalRun.companyId,runId:originalRun.id,
      periodMonth:originalRun.periodMonth,status:originalRun.status,findings,repairable,
      blockedReason:repairable ? null : 'LOCKED_PAYROLL_RUN' });
    if (repairable) proposedRuns.set(id,proposed);
  }
  return { issues,proposedRuns };
}
