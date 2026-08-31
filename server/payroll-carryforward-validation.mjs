const asArray = value => Array.isArray(value) ? value : [];
const roundAmount = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const fail = code => { const error = new Error(code); error.status = 409; throw error; };

const activeBatchStatuses = new Set(['SCHEDULED', 'PAID']);

export function validatePayrollCarryForwardState(storedRuns, incomingRuns) {
  const runs = asArray(incomingRuns);
  const runById = new Map(runs.map(run => [run.id, run]));
  const reservedSources = new Map();

  for (const destinationRun of runs) {
    for (const batch of asArray(destinationRun.paymentBatches)) {
      if (!activeBatchStatuses.has(String(batch.status || ''))) continue;

      const employeeIds = asArray(batch.employeeIds).map(String);
      if (employeeIds.length !== new Set(employeeIds).size) fail('PAYMENT_BATCH_DUPLICATE_EMPLOYEE');

      const destinationItems = new Map(asArray(destinationRun.items).map(item => [String(item.employeeId), item]));
      let currentTotal = 0;
      for (const employeeId of employeeIds) {
        const item = destinationItems.get(employeeId);
        if (!item) fail('PAYMENT_BATCH_EMPLOYEE_NOT_IN_RUN');
        if ((item.entitlementStatus || 'PAYABLE') !== 'PAYABLE') fail('PAYMENT_BATCH_EMPLOYEE_NOT_PAYABLE');
        if (Number(item.netSalary || 0) <= 0) fail('PAYMENT_BATCH_INVALID_CURRENT_AMOUNT');
        currentTotal = roundAmount(currentTotal + Number(item.netSalary || 0));
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
        priorTotal = roundAmount(priorTotal + referencedAmount);
      }

      const expectedBatchTotal = roundAmount(currentTotal + priorTotal);
      if (roundAmount(batch.totalAmount) !== expectedBatchTotal) fail('PAYMENT_BATCH_TOTAL_MISMATCH');
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
