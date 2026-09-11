const asArray = value => Array.isArray(value) ? value : [];
const roundAmount = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const fail = code => { const error = new Error(code); error.status = 409; throw error; };

const activeBatchStatuses = new Set(['SCHEDULED', 'PAID']);

export function validatePayrollCarryForwardState(storedRuns, incomingRuns) {
  const runs = asArray(incomingRuns);
  const runById = new Map(runs.map(run => [run.id, run]));
  const reservedSources = new Map();
  const coveredEntitlements = new Map();

  const claimCoverage = (companyId,periodMonth,employeeId,batchId) => {
    if (!companyId || !periodMonth || !employeeId || !batchId) return;
    const key = `${companyId}:${periodMonth}:${employeeId}`;
    const existingBatch = coveredEntitlements.get(key);
    if (existingBatch && existingBatch !== batchId) fail('PAYROLL_ENTITLEMENT_ALREADY_COVERED');
    coveredEntitlements.set(key,batchId);
  };

  for (const destinationRun of runs) {
    for (const batch of asArray(destinationRun.paymentBatches)) {
      if (!activeBatchStatuses.has(String(batch.status || ''))) continue;

      const employeeIds = asArray(batch.employeeIds).map(String);
      if (employeeIds.length !== new Set(employeeIds).size) fail('PAYMENT_BATCH_DUPLICATE_EMPLOYEE');

      const destinationItems = new Map(asArray(destinationRun.items).map(item => [String(item.employeeId), item]));
      const generalCoverages = [];
      let currentTotal = 0;
      for (const employeeId of employeeIds) {
        const item = destinationItems.get(employeeId);
        if (!item) fail('PAYMENT_BATCH_EMPLOYEE_NOT_IN_RUN');
        if ((item.entitlementStatus || 'PAYABLE') !== 'PAYABLE') fail('PAYMENT_BATCH_EMPLOYEE_NOT_PAYABLE');
        if (Number(item.netSalary || 0) <= 0) fail('PAYMENT_BATCH_INVALID_CURRENT_AMOUNT');
        currentTotal = roundAmount(currentTotal + Number(item.netSalary || 0));
        const priorDetails = asArray(item.priorPeriodDetails);
        const priorNet = roundAmount(priorDetails.reduce((sum,detail) => sum + Number(detail?.net || 0),0));
        if (roundAmount(Number(item.netSalary || 0) - priorNet) > 0) {
          generalCoverages.push([destinationRun.periodMonth,employeeId]);
        }
        for (const detail of priorDetails) {
          const sourcePeriodMonth = String(detail?.periodMonth || '');
          if (!sourcePeriodMonth || sourcePeriodMonth >= String(destinationRun.periodMonth || '')) fail('PAYROLL_CARRY_PERIOD_INVALID');
          if (Number(detail?.net || 0) > 0) generalCoverages.push([sourcePeriodMonth,employeeId]);
        }
      }

      let priorTotal = 0;
      for (const ref of asArray(batch.priorEntitlements)) {
        const sourceRun = runById.get(ref?.sourcePayrollRunId);
        if (!sourceRun) fail('PRIOR_ENTITLEMENT_SOURCE_RUN_NOT_FOUND');
        if (String(sourceRun.companyId || '') !== String(destinationRun.companyId || '')) fail('PRIOR_ENTITLEMENT_CROSS_COMPANY');
        if (!sourceRun.periodMonth || !destinationRun.periodMonth || String(sourceRun.periodMonth) >= String(destinationRun.periodMonth)) {
          fail('PRIOR_ENTITLEMENT_PERIOD_INVALID');
        }

        const sourceItem = asArray(sourceRun.items).find(item => String(item.id) === String(ref?.sourcePayrollItemId));
        if (!sourceItem) fail('PRIOR_ENTITLEMENT_SOURCE_ITEM_NOT_FOUND');
        if (String(sourceItem.employeeId || '') !== String(ref?.employeeId || '')) fail('PRIOR_ENTITLEMENT_EMPLOYEE_MISMATCH');
        if (!employeeIds.includes(String(ref?.employeeId || ''))) fail('PRIOR_ENTITLEMENT_EMPLOYEE_NOT_IN_BATCH');
        if ((sourceItem.entitlementStatus || 'PAYABLE') !== 'HELD' || sourceItem.entitlementReason !== 'MISSING_BANK_ACCOUNT') {
          fail('PRIOR_ENTITLEMENT_SOURCE_NOT_HELD_FOR_BANK');
        }

        const expectedAmount = roundAmount(sourceItem.netSalary);
        const referencedAmount = roundAmount(ref?.amount);
        if (!(expectedAmount > 0) || referencedAmount !== expectedAmount) fail('PRIOR_ENTITLEMENT_AMOUNT_MISMATCH');
        if (String(ref?.sourcePeriodMonth || '') !== String(sourceRun.periodMonth || '')) fail('PRIOR_ENTITLEMENT_PERIOD_MISMATCH');

        const sourceKey = `${sourceRun.id}:${sourceItem.id}`;
        const existingBatch = reservedSources.get(sourceKey);
        if (existingBatch && existingBatch !== batch.id) fail('PRIOR_ENTITLEMENT_ALREADY_RESERVED');
        reservedSources.set(sourceKey, batch.id);
        claimCoverage(destinationRun.companyId,String(ref?.sourcePeriodMonth || ''),String(ref?.employeeId || ''),String(batch.id));
        priorTotal = roundAmount(priorTotal + referencedAmount);
      }

      const expectedBatchTotal = roundAmount(currentTotal + priorTotal);
      if (roundAmount(batch.totalAmount) !== expectedBatchTotal) fail('PAYMENT_BATCH_TOTAL_MISMATCH');
      for (const [periodMonth,employeeId] of generalCoverages) {
        claimCoverage(destinationRun.companyId,periodMonth,employeeId,String(batch.id));
      }
    }
  }

  // Preserve a reservation already active in stored state unless the same batch still owns it
  // in the incoming state. This prevents a client from moving a prior entitlement between batches.
  const incomingActiveBatchIds = new Set(
    runs.flatMap(run => asArray(run.paymentBatches))
      .filter(batch => activeBatchStatuses.has(String(batch.status || '')))
      .map(batch => String(batch.id)),
  );
  for (const storedRun of asArray(storedRuns)) {
    for (const storedBatch of asArray(storedRun.paymentBatches)) {
      if (!activeBatchStatuses.has(String(storedBatch.status || ''))) continue;
      for (const ref of asArray(storedBatch.priorEntitlements)) {
        const sourceKey = `${ref?.sourcePayrollRunId}:${ref?.sourcePayrollItemId}`;
        const incomingOwner = reservedSources.get(sourceKey);
        if (incomingOwner && incomingOwner !== storedBatch.id) fail('PRIOR_ENTITLEMENT_ALREADY_RESERVED');
        if (!incomingOwner && incomingActiveBatchIds.has(String(storedBatch.id))) {
          fail('PRIOR_ENTITLEMENT_RESERVATION_REMOVED');
        }
      }
    }
  }
}
