const rows = value => Array.isArray(value) ? value : [];
export const salaryMoney = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

// A stored item may include a compatibility carry balance. Its monthly entitlement
// is the original month's net, never the cumulative amount displayed on a later run.
export const monthlySalaryNet = item => salaryMoney(Number(item?.netSalary || 0) - Number(item?.priorPeriodNet || 0));

export function salaryBatchAllocations(run, batch) {
  if (Array.isArray(batch?.allocations)) return batch.allocations.map(row => ({ ...row }));
  const result = new Map();
  const add = (employeeId, periodMonth, amount) => {
    const key = `${employeeId}:${periodMonth}`;
    if (employeeId && periodMonth && Number(amount) > 0 && !result.has(key)) {
      result.set(key, { employeeId, periodMonth, amount:salaryMoney(amount) });
    }
  };
  for (const employeeId of rows(batch?.employeeIds)) {
    const item = rows(run?.items).find(row => row.employeeId === employeeId);
    if (!item) continue;
    add(employeeId, run.periodMonth, monthlySalaryNet(item));
    for (const detail of rows(item.priorPeriodDetails)) add(employeeId, detail.periodMonth, detail.net);
  }
  for (const ref of rows(batch?.priorEntitlements)) add(ref.employeeId, ref.sourcePeriodMonth, ref.amount);
  return [...result.values()];
}

export function unpaidSalaryDetails(runs, targetRun, employeeId) {
  const covered = new Map();
  for (const run of rows(runs).filter(row => row.companyId === targetRun.companyId)) {
    for (const batch of rows(run.paymentBatches)) {
      if (!['SCHEDULED','PAID'].includes(batch.status)) continue;
      for (const allocation of salaryBatchAllocations(run, batch)) {
        if (allocation.employeeId === employeeId) covered.set(allocation.periodMonth, salaryMoney((covered.get(allocation.periodMonth) || 0) + allocation.amount));
      }
    }
  }
  return rows(runs)
    .filter(run => run.companyId === targetRun.companyId && run.periodMonth < targetRun.periodMonth
      && ['APPROVED','POSTED'].includes(run.status))
    .sort((a,b) => a.periodMonth.localeCompare(b.periodMonth))
    .flatMap(run => {
      const item = rows(run.items).find(row => row.employeeId === employeeId);
      if (!item || ['SETTLED','CANCELLED_WITH_DOCUMENT','UNDER_SETTLEMENT'].includes(item.entitlementStatus)) return [];
      const originalNet = monthlySalaryNet(item);
      const net = salaryMoney(originalNet - (covered.get(run.periodMonth) || 0));
      if (!(net > 0)) return [];
      return [{ periodMonth:run.periodMonth, gross:salaryMoney(Number(item.totalGrossSalary || 0) * net / originalNet), deductions:salaryMoney(Number(item.totalDeductions || 0) * net / originalNet), net }];
    });
}

// Explicit prior references are useful for legacy runs without embedded carry.
// Never add a reference for a month already present in that employee's carry.
export function additionalSalaryReferences(item, references) {
  const included = new Set(rows(item?.priorPeriodDetails).map(detail => detail.periodMonth));
  return rows(references).filter(ref => ref.employeeId === item?.employeeId && !included.has(ref.sourcePeriodMonth));
}

// Sources are saved, approved months. A partial transfer reserves only its amount,
// allowing the remainder to be paid separately, even through a later run.
export function availableSalaryAllocations(runs, targetRun, employeeId) {
  const candidates = [{periodMonth:targetRun.periodMonth}, ...rows(rows(targetRun.items).find(item => item.employeeId === employeeId)?.priorPeriodDetails)]
    .sort((a,b) => a.periodMonth.localeCompare(b.periodMonth));
  const covered = new Map();
  for (const run of rows(runs).filter(run => run.companyId === targetRun.companyId)) {
    for (const batch of rows(run.paymentBatches).filter(batch => ['SCHEDULED','PAID'].includes(batch.status))) {
      for (const row of salaryBatchAllocations(run,batch).filter(row => row.employeeId === employeeId)) {
        covered.set(row.periodMonth,salaryMoney((covered.get(row.periodMonth) || 0) + row.amount));
      }
    }
  }
  const seen = new Set();
  return candidates.flatMap(({periodMonth}) => {
    if (seen.has(periodMonth)) return [];
    seen.add(periodMonth);
    const source = rows(runs).find(run => run.companyId === targetRun.companyId && run.periodMonth === periodMonth);
    const item = rows(source?.items).find(item => item.employeeId === employeeId);
    if (!source || !['APPROVED','POSTED'].includes(source.status) || !item
      || ['SETTLED','CANCELLED_WITH_DOCUMENT','UNDER_SETTLEMENT'].includes(item.entitlementStatus)) return [];
    // A hold must be explicitly released in its original month before payment.
    if ((item.entitlementStatus || 'PAYABLE') !== 'PAYABLE' && item.entitlementReason !== 'MISSING_BANK_ACCOUNT') return [];
    const amount = salaryMoney(monthlySalaryNet(item) - (covered.get(periodMonth) || 0));
    if (!(amount > 0)) return [];
    return [{employeeId,periodMonth,sourcePayrollRunId:source.id,sourcePayrollItemId:item.id,amount}];
  });
}

export function allocateSalaryAmount(available, amount) {
  let remaining = salaryMoney(amount);
  const allocations = [];
  for (const source of rows(available)) {
    const applied = salaryMoney(Math.min(remaining,source.amount));
    if (applied > 0) allocations.push({...source,amount:applied});
    remaining = salaryMoney(remaining - applied);
  }
  if (remaining !== 0 || !(Number(amount) > 0)) throw new Error('PAYMENT_AMOUNT_EXCEEDS_AVAILABLE');
  return allocations;
}

export function salaryBatchEmployeeComponents(run,batch,employeeId) {
  const allocations=salaryBatchAllocations(run,batch).filter(row=>row.employeeId===employeeId);
  const amount=salaryMoney(allocations.reduce((sum,row)=>sum+row.amount,0));
  const item=rows(run.items).find(item=>item.employeeId===employeeId);
  let basic=0,housing=0,deductions=0;
  if(Array.isArray(batch.allocations)&&allocations.every(row=>row.salarySnapshot)){
    for(const row of allocations){const snapshot=row.salarySnapshot;const ratio=row.amount/snapshot.netSalary;
      basic+=snapshot.baseSalary*ratio;housing+=snapshot.housingAllowance*ratio;deductions+=snapshot.totalDeductions*ratio;}
  }else{const ratio=amount/Number(item?.netSalary||1);basic=Number(item?.baseSalary||0)*ratio;housing=Number(item?.housingAllowance||0)*ratio;deductions=Number(item?.totalDeductions||0)*ratio;}
  basic=salaryMoney(basic);housing=salaryMoney(housing);deductions=salaryMoney(deductions);
  return {amount,basic,housing,deductions,otherIncome:salaryMoney(amount+deductions-basic-housing)};
}
