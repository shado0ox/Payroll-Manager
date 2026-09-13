export function createStateAccessService({
  clone,can,allowedCompanyIds,itemCompanyId,companyScopedKeys,operationsMutableKeys,
  validateClosedPayrollInputs,validatePayrollWorkflowChanges,workflowError,
}) {
function publicStateForUser(rawState, user) {
  const state = clone(rawState || {});
  delete state.currentUser;
  const assigned = new Set(Array.isArray(user.company_ids) ? user.company_ids : []);
  const sanitizeCompany = (item) => ({
    id:item.id,companyCode:item.companyCode,nameAr:item.nameAr,nameEn:item.nameEn,
    crNumber:item.crNumber || '',taxNumber:item.taxNumber || '',phone:item.phone || '',email:item.email || '',
    subscriptionStatus:item.subscriptionStatus,trialEndsAt:item.trialEndsAt,subscriptionEndsAt:item.subscriptionEndsAt,
    currency:'SAR',timezone:'Asia/Riyadh',fiscalYearStartMonth:1,payrollCutoffDay:25,payrollPaymentDay:27,
    workDaysPerMonth:30,dailyWorkHours:8,departments:[],costCenters:[],bankDefinitions:[],
    calculationRules:{},chartOfAccounts:{},
  });
  if (user.role === 'ADMIN') {
    // The developer can administer tenant identity and subscriptions, but payroll,
    // employee, banking and operational records are never returned for tenant companies.
    if (Array.isArray(state.companies)) state.companies = state.companies.map(item => assigned.has(item.id) ? item : sanitizeCompany(item));
    for (const key of COMPANY_SCOPED_KEYS) {
      if (Array.isArray(state[key])) state[key] = state[key].filter(item => assigned.has(itemCompanyId(item)));
    }
    if (Array.isArray(state.auditLogs)) state.auditLogs = state.auditLogs.filter(item => item.companyId && assigned.has(item.companyId));
    if (Array.isArray(state.users)) state.users = state.users.filter(item => item.id === user.id);
    if (state.activeCompanyId && !assigned.has(state.activeCompanyId)) state.activeCompanyId = [...assigned][0] || '';
  } else {
    const allowed = allowedCompanyIds(user);
    if (Array.isArray(state.companies)) state.companies = state.companies.filter(item => allowed.has(item.id));
    for (const key of COMPANY_SCOPED_KEYS) {
      if (Array.isArray(state[key])) state[key] = state[key].filter(item => allowed.has(itemCompanyId(item)));
    }
    if (Array.isArray(state.users)) {
      state.users = state.users.filter(item => Array.isArray(item.companyIds) && item.companyIds.some(id => allowed.has(id)));
    }
    if (Array.isArray(state.auditLogs)) state.auditLogs = state.auditLogs.filter(item => item.companyId && allowed.has(item.companyId));
    if (state.activeCompanyId && !allowed.has(state.activeCompanyId)) state.activeCompanyId = [...allowed][0] || '';
  }
  if (Array.isArray(state.users)) state.users = state.users.map(({ password, ...item }) => item);
  // Each company has its own Qoyod configuration. Only expose the active assigned company's public settings.
  const integrationCompanyId = state.activeCompanyId && assigned.has(state.activeCompanyId)
    ? state.activeCompanyId
    : ([...assigned][0] || '');
  if (integrationCompanyId) state.activeCompanyId = integrationCompanyId;
  const activeQoyodConfig = state.qoyodConfigsByCompany?.[integrationCompanyId] || {};
  delete state.qoyodConfigsByCompany;
  state.qoyodConfig = { ...activeQoyodConfig, apiKey: '', apiKeyConfigured: Boolean(activeQoyodConfig.apiKey) };
  return state;
}

function mergeCompanyScoped(storedItems, incomingItems, allowed) {
  const preserved = (Array.isArray(storedItems) ? storedItems : []).filter(item => !allowed.has(itemCompanyId(item)));
  const accepted = (Array.isArray(incomingItems) ? incomingItems : []).filter(item => allowed.has(itemCompanyId(item)));
  return [...preserved, ...accepted];
}

function validatePayrollSettlementChanges(storedSettlements, incomingSettlements) {
  const before = asArray(storedSettlements);
  const after = asArray(incomingSettlements);
  const beforeById = new Map(before.map(item => [item.id, item]));
  const seenDedupe = new Set();
  for (const settlement of after) {
    if (!settlement || typeof settlement.id !== 'string' || !settlement.id || typeof settlement.companyId !== 'string' || !settlement.companyId
      || typeof settlement.employeeId !== 'string' || !settlement.employeeId || typeof settlement.dedupeKey !== 'string' || !settlement.dedupeKey
      || !/^\d{4}-\d{2}$/.test(String(settlement.periodMonth || '')) || !(Number(settlement.amount) > 0)) {
      throw workflowError(400, 'INVALID_PAYROLL_SETTLEMENT');
    }
    if (settlement.status !== 'REVERSED') {
      const key = settlement.companyId + ':' + settlement.dedupeKey;
      if (seenDedupe.has(key)) throw workflowError(409, 'DUPLICATE_PAYROLL_SETTLEMENT');
      seenDedupe.add(key);
    }
    const previous = beforeById.get(settlement.id);
    if (previous?.status === 'PAID' && settlement.status === 'PAID' && !sameJson(previous, settlement)) {
      throw workflowError(409, 'PAID_SETTLEMENT_LOCKED');
    }
    if (previous?.status === 'PAID' && settlement.status === 'REVERSED') {
      if (!settlement.reversedAt) throw workflowError(400, 'SETTLEMENT_REVERSAL_DATE_REQUIRED');
      if (String(settlement.reversalReason || '').trim().length < 5) throw workflowError(400, 'SETTLEMENT_REVERSAL_REASON_REQUIRED');
    }
    if (previous?.status === 'REVERSED' && !sameJson(previous, settlement)) {
      throw workflowError(409, 'REVERSED_SETTLEMENT_LOCKED');
    }
  }
}

function mergeStateForUser(stored, incoming, user) {
  if (Object.prototype.hasOwnProperty.call(incoming || {}, 'payrollSettlements')) validatePayrollSettlementChanges(stored?.payrollSettlements, incoming?.payrollSettlements);
  validateClosedPayrollInputs(stored, incoming);
  validatePayrollWorkflowChanges(stored?.payrollRuns, incoming?.payrollRuns, user);
  validatePayrollCarryForwardState(stored?.payrollRuns, incoming?.payrollRuns);
  if (user.role === 'ADMIN') {
    const next = clone(stored || {});
    const assigned = new Set(Array.isArray(user.company_ids) ? user.company_ids : []);
    for (const key of COMPANY_SCOPED_KEYS) next[key] = mergeCompanyScoped(stored?.[key],incoming?.[key],assigned);
    const oldCompanies = asArray(stored?.companies);
    const incomingById = new Map(asArray(incoming?.companies).filter(item => assigned.has(item.id)).map(item => [item.id,item]));
    next.companies = oldCompanies.map(item => assigned.has(item.id) && incomingById.has(item.id) ? incomingById.get(item.id) : item);
    next.auditLogs = stored?.auditLogs || [];
    next.users = stored?.users || [];
    next.qoyodConfig = incoming?.qoyodConfig || stored?.qoyodConfig || {};
    if (incoming?.activeCompanyId && assigned.has(incoming.activeCompanyId)) next.activeCompanyId = incoming.activeCompanyId;
    return next;
  }
  const next = clone(stored || {});
  const allowed = allowedCompanyIds(user);
  const keyPermissions = {
    employees:'MANAGE_EMPLOYEES', attendance:'MANAGE_ATTENDANCE', leaves:'MANAGE_ATTENDANCE',
    loans:'MANAGE_LOANS_PENALTIES', penalties:'MANAGE_LOANS_PENALTIES', temporaryEarnings:'MANAGE_LOANS_PENALTIES', payrollRuns:'MANAGE_PAYROLL', payrollSettlements:'MANAGE_PAYROLL', journals:'MANAGE_JOURNALS',
  };
  const roleKeys = user.role === 'OPERATIONS_MANAGER' ? OPERATIONS_MUTABLE_KEYS : new Set(COMPANY_SCOPED_KEYS);
  const mutableKeys = [...roleKeys].filter(key => can(user, keyPermissions[key]));
  for (const key of mutableKeys) next[key] = mergeCompanyScoped(stored?.[key], incoming?.[key], allowed);

  if (user.role === 'COMPANY_MANAGER' && can(user, 'MANAGE_COMPANY_PROFILE')) {
    const oldCompanies = Array.isArray(stored?.companies) ? stored.companies : [];
    const newCompanies = Array.isArray(incoming?.companies) ? incoming.companies : [];
    const incomingById = new Map(newCompanies.filter(item => allowed.has(item.id)).map(item => [item.id, item]));
    // General managers may edit assigned company profiles, but cannot add or delete companies.
    next.companies = oldCompanies.map(item => allowed.has(item.id) && incomingById.has(item.id) ? incomingById.get(item.id) : item);
  }
  // Users, audit history and integration secrets use dedicated server-owned paths.
  next.users = stored?.users || [];
  next.auditLogs = stored?.auditLogs || [];
  next.qoyodConfig = can(user, 'MANAGE_JOURNALS') ? (incoming?.qoyodConfig || {}) : {};
  if (incoming?.activeCompanyId && allowed.has(incoming.activeCompanyId)) next.activeCompanyId = incoming.activeCompanyId;

  if (!can(user, 'APPROVE_PAYROLL') && Array.isArray(next.payrollRuns)) {
    const oldRuns = new Map((stored?.payrollRuns || []).map(run => [run.id, run]));
    next.payrollRuns = next.payrollRuns.map(run => {
      const old = oldRuns.get(run.id);
      return old && run.status !== old.status
        ? { ...run, status: old.status, approvedAt: old.approvedAt, approvedBy: old.approvedBy, postedAt: old.postedAt, postedBy: old.postedBy }
        : run;
    });
  }
  return next;
}


  return { publicStateForUser,mergeStateForUser };
}

