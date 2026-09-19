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
  totalAbsenceDeductions:roundAmount(asArray(run.items).reduce((sum,item) => sum + Number(item.absenceDeduction || 0) + Number(item.unpaidLeaveDeduction || 0),0)),
  totalDelayDeductions:roundAmount(asArray(run.items).reduce((sum,item) => sum + Number(item.delayDeduction || 0),0)),
  totalGosiEmployee:roundAmount(asArray(run.items).reduce((sum,item) => sum + Number(item.gosiEmployeeShare || 0),0)),
  totalGosiEmployer:roundAmount(asArray(run.items).reduce((sum,item) => sum + Number(item.gosiEmployerShare || 0),0)),
  totalLoanDeductions:roundAmount(asArray(run.items).reduce((sum,item) => sum + Number(item.loanDeduction || 0),0)),
  totalPenalties:roundAmount(asArray(run.items).reduce((sum,item) => sum + Number(item.penaltiesDeduction || 0) + Number(item.otherDeductions || 0),0)),
  totalDeductions:roundAmount(asArray(run.items).reduce((sum,item) => sum + Number(item.totalDeductions || 0) + Number(item.priorPeriodDeductions || 0),0)),
  totalNetSalaries:roundAmount(asArray(run.items).reduce((sum,item) => sum + Number(item.netSalary || 0),0)),
  totalCompanyCost:roundAmount(asArray(run.items).reduce((sum,item) => sum + Number(item.totalCompanyBurden || 0),0)),
});

const employeeIdentity = (employee,item) => ({
  employeeId:String(item?.employeeId || employee?.id || ''),
  employeeNo:String(employee?.employeeNo || item?.employeeNo || ''),
  employeeName:String(
    [employee?.firstNameAr,employee?.lastNameAr].filter(Boolean).join(' ')
    || item?.employeeName
    || item?.employeeNameEn
    || ''
  ).trim(),
});

const carryDifferenceDetails = (employee,item,currentDetails,expectedDetails) => {
  const currentByMonth = new Map(currentDetails.map(detail => [detail.periodMonth,detail]));
  const expectedByMonth = new Map(expectedDetails.map(detail => [detail.periodMonth,detail]));
  const months = [...new Set([...currentByMonth.keys(),...expectedByMonth.keys()])].sort();
  const identity = employeeIdentity(employee,item);
  return months.flatMap(sourcePeriodMonth => {
    const recordedNet = roundAmount(currentByMonth.get(sourcePeriodMonth)?.net);
    const expectedNet = roundAmount(expectedByMonth.get(sourcePeriodMonth)?.net);
    if (recordedNet === expectedNet) return [];
    return [{ ...identity,sourcePeriodMonth,recordedNet,expectedNet,difference:roundAmount(expectedNet - recordedNet) }];
  });
};

const totalDifferenceDetails = (storedTotals,expectedTotals) => Object.keys(expectedTotals).flatMap(metric => {
  const stored = Number(storedTotals[metric] || 0);
  const computed = Number(expectedTotals[metric] || 0);
  if (stored === computed) return [];
  return [{ metric,stored,computed,difference:roundAmount(computed - stored) }];
});

const hasFiniteFields = (record,fields) => fields.every(field => record?.[field] != null && Number.isFinite(Number(record[field])));
const grossComponentFields = ['baseSalary','housingAllowance','transportAllowance','otherAllowances','overtimeAmount','bonuses'];
const deductionComponentFields = ['delayDeduction','absenceDeduction','unpaidLeaveDeduction','gosiEmployeeShare','loanDeduction','penaltiesDeduction','otherDeductions'];
const inspectedFinancialFields = [...grossComponentFields,...deductionComponentFields,'totalGrossSalary','totalDeductions','netSalary','gosiEmployerShare','totalCompanyBurden','priorPeriodNet'];

const itemArithmeticRepair = (employee,originalItem) => {
  let item={...originalItem};
  const mismatches=[];
  const identity=employeeIdentity(employee,originalItem);
  if(hasFiniteFields(item,grossComponentFields)){
    const expected=roundAmount(grossComponentFields.reduce((sum,field)=>sum+Number(item[field]||0),0));
    const recorded=roundAmount(item.totalGrossSalary);
    if(recorded!==expected){mismatches.push({...identity,metric:'totalGrossSalary',recorded,expected,difference:roundAmount(expected-recorded)});item.totalGrossSalary=expected;}
  }
  if(hasFiniteFields(item,deductionComponentFields)){
    const expected=roundAmount(deductionComponentFields.reduce((sum,field)=>sum+Number(item[field]||0),0));
    const recorded=roundAmount(item.totalDeductions);
    if(recorded!==expected){mismatches.push({...identity,metric:'totalDeductions',recorded,expected,difference:roundAmount(expected-recorded)});item.totalDeductions=expected;}
  }
  if(hasFiniteFields(item,['totalGrossSalary','totalDeductions','netSalary','priorPeriodNet'])){
    const expected=roundAmount(Math.max(0,Number(item.totalGrossSalary)-Number(item.totalDeductions))+Number(item.priorPeriodNet||0));
    const recorded=roundAmount(item.netSalary);
    if(recorded!==expected){mismatches.push({...identity,metric:'netSalary',recorded,expected,difference:roundAmount(expected-recorded)});item.netSalary=expected;}
  }
  if(hasFiniteFields(item,['totalGrossSalary','gosiEmployerShare','totalCompanyBurden','priorPeriodNet'])){
    const expected=roundAmount(Number(item.totalGrossSalary)+Number(item.gosiEmployerShare||0)+Number(item.priorPeriodNet||0));
    const recorded=roundAmount(item.totalCompanyBurden);
    if(recorded!==expected){mismatches.push({...identity,metric:'totalCompanyBurden',recorded,expected,difference:roundAmount(expected-recorded)});item.totalCompanyBurden=expected;}
  }
  return { item,mismatches };
};

const itemRiskDetails = (employee,item) => {
  const identity=employeeIdentity(employee,item);
  const negativeAmounts=inspectedFinancialFields.flatMap(field => {
    const amount=Number(item?.[field]);
    return Number.isFinite(amount)&&amount<0?[{...identity,field,amount}]:[];
  });
  const deductionExcess=Number(item?.totalDeductions||0)>Number(item?.totalGrossSalary||0)
    ? [{...identity,gross:roundAmount(item.totalGrossSalary),deductions:roundAmount(item.totalDeductions),
      excess:roundAmount(Number(item.totalDeductions)-Number(item.totalGrossSalary))}]
    : [];
  const missingGosiBranch=(Number(item?.gosiEmployeeShare||0)>0||Number(item?.gosiEmployerShare||0)>0)
    && (!String(item?.gosiBranchId||'').trim()||!String(item?.gosiBranchCode||'').trim())
    ? [{...identity,employeeShare:roundAmount(item.gosiEmployeeShare),employerShare:roundAmount(item.gosiEmployerShare)}]
    : [];
  return { negativeAmounts,deductionExcess,missingGosiBranch };
};

const paymentBatchDetails = run => asArray(run.paymentBatches).flatMap(batch => {
  if(!activeBatch(batch))return [];
  const employeeIds=asArray(batch.employeeIds).map(String);
  const duplicateEmployeeIds=[...new Set(employeeIds.filter((id,index)=>employeeIds.indexOf(id)!==index))];
  const missingEmployeeIds=employeeIds.filter(id=>!asArray(run.items).some(item=>String(item.employeeId)===id));
  const currentAmount=roundAmount(employeeIds.reduce((sum,id)=>{
    const item=asArray(run.items).find(candidate=>String(candidate.employeeId)===id);
    return sum+Number(item?.netSalary||0);
  },0));
  const priorAmount=roundAmount(asArray(batch.priorEntitlements).reduce((sum,ref)=>sum+Number(ref?.amount||0),0));
  const expectedTotal=roundAmount(currentAmount+priorAmount);
  const recordedTotal=roundAmount(batch.totalAmount);
  const employeesCountMismatch=batch.employeesCount!=null&&Number(batch.employeesCount)!==employeeIds.length;
  if(!duplicateEmployeeIds.length&&!missingEmployeeIds.length&&!employeesCountMismatch
    &&(batch.totalAmount==null||recordedTotal===expectedTotal))return [];
  return [{batchId:String(batch.id||''),batchNumber:String(batch.batchNumber||''),status:String(batch.status||''),
    duplicateEmployeeIds,missingEmployeeIds,recordedEmployeesCount:batch.employeesCount==null?null:Number(batch.employeesCount),
    expectedEmployeesCount:employeeIds.length,recordedTotal,expectedTotal,difference:roundAmount(expectedTotal-recordedTotal)}];
});

const journalAdjustmentDetails = (state,run) => asArray(state?.journals).flatMap(journal => {
  if(journal?.payrollRunId!==run.id||(journal?.journalType&&journal.journalType!=='PAYROLL_ACCRUAL'))return [];
  const adjustmentLines=asArray(journal.lines).filter(line=>line?.id==='line-balance-adjustment'||String(line?.accountCode||'')==='9999');
  return adjustmentLines.map(line=>({journalBatchId:String(journal.id||''),batchNumber:String(journal.batchNumber||''),
    amount:roundAmount(Number(line.debit||0)-Number(line.credit||0)),qoyodSynced:Boolean(journal.qoyodSyncStatus?.synced)}));
});

export function buildPayrollRepairPlan(state,companyIds = []) {
  const allowed = new Set(asArray(companyIds));
  const runs = asArray(state?.payrollRuns).filter(run => !allowed.size || allowed.has(run.companyId));
  const employeesById = new Map(asArray(state?.employees).map(employee => [employee.id,employee]));
  const issues = [];
  const proposedRuns = new Map();

  for (const originalRun of runs) {
    const findings = [];
    const editable = ['DRAFT','UNDER_REVIEW'].includes(String(originalRun.status || 'DRAFT'));
    let carryChanged = false;
    let holdChanged = false;
    let itemArithmeticChanged = false;
    const carryMismatches = [];
    const holdMismatches = [];
    const itemCalculationMismatches = [];
    const negativeAmounts = [];
    const deductionExcesses = [];
    const missingEmployees = [];
    const missingGosiBranches = [];
    const employeeIds=asArray(originalRun.items).map(item=>String(item.employeeId||''));
    const duplicateEmployeeIds=[...new Set(employeeIds.filter((id,index)=>id&&employeeIds.indexOf(id)!==index))];
    const items = asArray(originalRun.items).map(originalItem => {
      if (employeeLockedInRun(originalRun,originalItem.employeeId)) {
        const employee=employeesById.get(originalItem.employeeId);
        if(!employee)missingEmployees.push(employeeIdentity(employee,originalItem));
        const arithmetic=itemArithmeticRepair(employee,originalItem);
        itemCalculationMismatches.push(...arithmetic.mismatches.map(detail=>({...detail,locked:true})));
        const risks=itemRiskDetails(employee,originalItem);
        negativeAmounts.push(...risks.negativeAmounts);deductionExcesses.push(...risks.deductionExcess);missingGosiBranches.push(...risks.missingGosiBranch);
        return originalItem;
      }
      // Approved and posted payroll runs are immutable historical snapshots.
      // A payment created in a later month can legitimately change today's
      // carry-forward expectation without making the closed snapshot wrong.
      // Only validate their stored aggregates below; never recalculate their
      // employee carry or entitlement state from current payment coverage.
      if (!editable) {
        const employee=employeesById.get(originalItem.employeeId);
        if(!employee)missingEmployees.push(employeeIdentity(employee,originalItem));
        const arithmetic=itemArithmeticRepair(employee,originalItem);
        itemCalculationMismatches.push(...arithmetic.mismatches.map(detail=>({...detail,locked:true})));
        const risks=itemRiskDetails(employee,originalItem);
        negativeAmounts.push(...risks.negativeAmounts);deductionExcesses.push(...risks.deductionExcess);missingGosiBranches.push(...risks.missingGosiBranch);
        return originalItem;
      }
      let item = { ...originalItem };
      const employee = employeesById.get(originalItem.employeeId);
      if(!employee)missingEmployees.push(employeeIdentity(employee,originalItem));
      const expectedDetails = canonicalCarryDetails(runs,originalRun,originalItem.employeeId);
      const currentDetails = asArray(originalItem.priorPeriodDetails).map(detail => ({
        periodMonth:String(detail?.periodMonth || ''),gross:roundAmount(detail?.gross),deductions:roundAmount(detail?.deductions),net:roundAmount(detail?.net),
      })).filter(detail => detail.periodMonth).sort((a,b) => a.periodMonth.localeCompare(b.periodMonth));
      if (!sameJson(currentDetails,expectedDetails)) {
        carryChanged = true;
        carryMismatches.push(...carryDifferenceDetails(employee,originalItem,currentDetails,expectedDetails));
        const baseNet = roundAmount(Number(originalItem.netSalary || 0) - Number(originalItem.priorPeriodNet || 0));
        const baseBurden = roundAmount(Number(originalItem.totalCompanyBurden || 0) - Number(originalItem.priorPeriodNet || 0));
        const priorPeriodGross = roundAmount(expectedDetails.reduce((sum,detail) => sum + detail.gross,0));
        const priorPeriodDeductions = roundAmount(expectedDetails.reduce((sum,detail) => sum + detail.deductions,0));
        const priorPeriodNet = roundAmount(expectedDetails.reduce((sum,detail) => sum + detail.net,0));
        item = { ...item,priorPeriodDetails:expectedDetails,priorPeriodGross,priorPeriodDeductions,priorPeriodNet,
          netSalary:roundAmount(baseNet + priorPeriodNet),totalCompanyBurden:roundAmount(baseBurden + priorPeriodNet) };
      }
      const expectedCarryGross=roundAmount(expectedDetails.reduce((sum,detail)=>sum+detail.gross,0));
      const expectedCarryDeductions=roundAmount(expectedDetails.reduce((sum,detail)=>sum+detail.deductions,0));
      const expectedCarryNet=roundAmount(expectedDetails.reduce((sum,detail)=>sum+detail.net,0));
      if(roundAmount(item.priorPeriodGross)!==expectedCarryGross||roundAmount(item.priorPeriodDeductions)!==expectedCarryDeductions||roundAmount(item.priorPeriodNet)!==expectedCarryNet){
        carryChanged=true;
        const baseNet=roundAmount(Number(item.netSalary||0)-Number(item.priorPeriodNet||0));
        const baseBurden=roundAmount(Number(item.totalCompanyBurden||0)-Number(item.priorPeriodNet||0));
        item={...item,priorPeriodGross:expectedCarryGross,priorPeriodDeductions:expectedCarryDeductions,priorPeriodNet:expectedCarryNet,
          netSalary:roundAmount(baseNet+expectedCarryNet),totalCompanyBurden:roundAmount(baseBurden+expectedCarryNet)};
      }
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
        holdMismatches.push(employeeIdentity(employee,originalItem));
        item = { ...item,entitlementStatus:'PAYABLE',isSuspended:false,entitlementUpdatedAt:new Date().toISOString() };
        delete item.entitlementReason;
        delete item.entitlementDocumentRef;
        delete item.entitlementHoldSource;
      }
      const arithmetic=itemArithmeticRepair(employee,item);
      if(arithmetic.mismatches.length){
        itemArithmeticChanged=true;
        itemCalculationMismatches.push(...arithmetic.mismatches);
        item=arithmetic.item;
      }
      const risks=itemRiskDetails(employee,item);
      negativeAmounts.push(...risks.negativeAmounts);deductionExcesses.push(...risks.deductionExcess);missingGosiBranches.push(...risks.missingGosiBranch);
      return item;
    });
    let proposed = { ...originalRun,items };
    if (carryChanged) findings.push('CARRY_FORWARD_MISMATCH');
    if (holdChanged) findings.push('AUTOMATIC_HOLD_STALE');
    if (itemCalculationMismatches.length) findings.push('ITEM_CALCULATION_MISMATCH');
    if (deductionExcesses.length) findings.push('DEDUCTION_EXCEEDS_GROSS');
    if (negativeAmounts.length) findings.push('NEGATIVE_PAYROLL_AMOUNT');
    if (missingEmployees.length||duplicateEmployeeIds.length) findings.push('EMPLOYEE_REFERENCE_MISMATCH');
    if (missingGosiBranches.length) findings.push('GOSI_BRANCH_MISSING');
    const paymentBatchMismatches=paymentBatchDetails(originalRun);
    if(paymentBatchMismatches.length)findings.push('PAYMENT_BATCH_MISMATCH');
    const journalAdjustments=journalAdjustmentDetails(state,originalRun);
    if(journalAdjustments.length)findings.push('JOURNAL_BALANCE_ADJUSTMENT');
    const expectedTotals = aggregateRun(proposed);
    const currentTotals = aggregateRun(originalRun);
    const storedTotals = {
      employeesCount:Number(originalRun.employeesCount || 0),totalGrossSalaries:roundAmount(originalRun.totalGrossSalaries),
      totalAbsenceDeductions:roundAmount(originalRun.totalAbsenceDeductions),totalDelayDeductions:roundAmount(originalRun.totalDelayDeductions),
      totalGosiEmployee:roundAmount(originalRun.totalGosiEmployee),totalGosiEmployer:roundAmount(originalRun.totalGosiEmployer),
      totalLoanDeductions:roundAmount(originalRun.totalLoanDeductions),totalPenalties:roundAmount(originalRun.totalPenalties),
      totalDeductions:roundAmount(originalRun.totalDeductions),totalNetSalaries:roundAmount(originalRun.totalNetSalaries),
      totalCompanyCost:roundAmount(originalRun.totalCompanyCost),
    };
    const totalMismatches = totalDifferenceDetails(storedTotals,expectedTotals);
    if (!sameJson(storedTotals,currentTotals) || !sameJson(currentTotals,expectedTotals)) findings.push('RUN_TOTAL_MISMATCH');
    proposed = { ...proposed,...expectedTotals };
    if (!findings.length) continue;
    const hasSafeRepair=editable&&(carryChanged||holdChanged||itemArithmeticChanged||totalMismatches.length>0);
    const id = `payroll-run:${originalRun.id}`;
    issues.push({ id,type:'PAYROLL_RUN_INCONSISTENCY',companyId:originalRun.companyId,runId:originalRun.id,
      periodMonth:originalRun.periodMonth,status:originalRun.status,findings,repairable:hasSafeRepair,
      details:{ carryMismatches,holdMismatches,totalMismatches,itemCalculationMismatches,deductionExcesses,negativeAmounts,
        missingEmployees,duplicateEmployeeIds,missingGosiBranches,paymentBatchMismatches,journalAdjustments },
      blockedReason:hasSafeRepair ? null : editable ? 'MANUAL_REVIEW_REQUIRED' : 'LOCKED_PAYROLL_RUN' });
    if (hasSafeRepair) proposedRuns.set(id,proposed);
  }
  return { issues,proposedRuns };
}
