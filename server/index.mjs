import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { validatePayrollCarryForwardState } from './payroll-carryforward-validation.mjs';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { createTenantScopedClient, scopeStateForCompanies } from './tenant-storage.mjs';
import { appendStateAudit } from './state-audit.mjs';
import { appendPayrollFinancialAudit } from './payroll-financial-audit.mjs';

const { Pool } = pg;
const port = Number(process.env.PORT || 3000);
const schema = process.env.DB_SCHEMA || 'masar_payroll';
if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('DB_SCHEMA is invalid');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const ALLOWED_ROLES = new Set(['ADMIN', 'COMPANY_MANAGER', 'OPERATIONS_MANAGER']);
const ALL_PERMISSIONS = new Set(['VIEW_DASHBOARD','MANAGE_COMPANY_PROFILE','MANAGE_COMPANIES','MANAGE_EMPLOYEES','MANAGE_ATTENDANCE','MANAGE_LOANS_PENALTIES','MANAGE_PAYROLL','APPROVE_PAYROLL','REVERSE_PAYROLL_APPROVAL','POST_PAYROLL','CONFIRM_PAYROLL_PAYMENT','REVERSE_PAYROLL_PAYMENT','MANAGE_JOURNALS','VIEW_REPORTS','MANAGE_USERS','RECEIVE_HR_EXPIRY_EMAILS','VIEW_AUDIT_LOGS']);
const DEFAULT_PERMISSIONS = {
  COMPANY_MANAGER: [...ALL_PERMISSIONS].filter(value => value !== 'MANAGE_COMPANIES'),
  OPERATIONS_MANAGER: ['VIEW_DASHBOARD','MANAGE_EMPLOYEES','MANAGE_ATTENDANCE','MANAGE_LOANS_PENALTIES','MANAGE_PAYROLL','POST_PAYROLL','CONFIRM_PAYROLL_PAYMENT','VIEW_REPORTS'],
};
const trialDays = Math.max(1, Math.min(90, Number(process.env.TRIAL_DAYS || 14)));
const publicRegistrationEnabled = process.env.ALLOW_PUBLIC_REGISTRATION === 'true';
const developerContactPhone = String(process.env.DEVELOPER_CONTACT_PHONE || '').trim();
const resendApiKey = String(process.env.RESEND_API_KEY || '').trim();
const verificationEmailFrom = String(process.env.EMAIL_FROM || '').trim();
const isStrongPassword = (value) => typeof value === 'string' && value.length >= 8 && value.length <= 128
  && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
if (!isStrongPassword(process.env.ADMIN_PASSWORD)) {
  throw new Error('ADMIN_PASSWORD must be 8-128 characters and include uppercase, lowercase, number, and symbol');
}
for (const key of ['ADMIN_USERNAME', 'ADMIN_NAME', 'COMPANY_ID', 'COMPANY_CODE', 'COMPANY_NAME_AR', 'COMPANY_NAME_EN']) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
});

const q = (name) => `"${schema}".${name}`;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const cookieValue = (req, key) => (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${key}=`))?.slice(key.length + 1);
const COMPANY_SCOPED_KEYS = ['employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns', 'payrollSettlements', 'journals'];
const OPERATIONS_MUTABLE_KEYS = new Set(['employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns', 'payrollSettlements']);
const PATCHABLE_COLLECTIONS = new Set(['companies', 'employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns', 'payrollSettlements', 'journals']);
const clone = (value) => value == null ? value : structuredClone(value);
const allowedCompanyIds = (user) => new Set(user.role === 'ADMIN' ? [] : (Array.isArray(user.company_ids) ? user.company_ids : []));
const itemCompanyId = (item) => item && typeof item.companyId === 'string' ? item.companyId : '';
const permissionsFor = (user) => user.role === 'ADMIN' ? [...ALL_PERMISSIONS] : (Array.isArray(user.permissions) ? user.permissions : DEFAULT_PERMISSIONS[user.role] || []);
const can = (user, permission) => user.role === 'ADMIN' || permissionsFor(user).includes(permission);

const workflowError = (status, code) => Object.assign(new Error(code), { status });
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
    entitlementDocumentRef:text(item.entitlementDocumentRef), isSuspended:Boolean(item.isSuspended),
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

const stateEventClients = new Set();
const broadcastStateUpdate = (payload) => {
  const message = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of stateEventClients) {
    try { client.write(message); } catch { stateEventClients.delete(client); }
  }
};

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

function applyRecordPatch(visibleState, patch) {
  const next = clone(visibleState || {});
  const collections = patch?.collections;
  if (!collections || typeof collections !== 'object' || Array.isArray(collections)) {
    throw Object.assign(new Error('INVALID_STATE_PATCH'), { status:400 });
  }
  for (const [key, change] of Object.entries(collections)) {
    if (!PATCHABLE_COLLECTIONS.has(key) || !change || typeof change !== 'object' || Array.isArray(change)) {
      throw Object.assign(new Error('INVALID_STATE_PATCH'), { status:400 });
    }
    const upsert = Array.isArray(change.upsert) ? change.upsert : [];
    const deleteIds = Array.isArray(change.deleteIds) ? change.deleteIds : [];
    if (upsert.length > 2_000 || deleteIds.length > 2_000
      || upsert.some(item => !item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string' || !item.id)
      || deleteIds.some(id => typeof id !== 'string' || !id)) {
      throw Object.assign(new Error('INVALID_STATE_PATCH'), { status:400 });
    }
    const deleted = new Set(deleteIds);
    const byId = new Map(asArray(next[key]).filter(item => item?.id && !deleted.has(item.id)).map(item => [item.id, item]));
    for (const item of upsert) byId.set(item.id, clone(item));
    next[key] = [...byId.values()];
  }
  const objects = patch?.objects;
  if (objects != null && (typeof objects !== 'object' || Array.isArray(objects))) {
    throw Object.assign(new Error('INVALID_STATE_PATCH'), { status:400 });
  }
  if (Object.prototype.hasOwnProperty.call(objects || {}, 'qoyodConfig')) {
    if (!objects.qoyodConfig || typeof objects.qoyodConfig !== 'object' || Array.isArray(objects.qoyodConfig)) {
      throw Object.assign(new Error('INVALID_STATE_PATCH'), { status:400 });
    }
    next.qoyodConfig = clone(objects.qoyodConfig);
  }
  return next;
}

const asArray = (value) => Array.isArray(value) ? value : [];

async function replaceNormalizedPayrollData(client, state) {
  const companies = asArray(state?.companies);
  const employees = asArray(state?.employees);
  const payrollRuns = asArray(state?.payrollRuns);

  await client.query(`INSERT INTO ${q('companies')} (id,company_code,name_ar,name_en,is_archived)
    SELECT company->>'id',company->>'companyCode',COALESCE(company->>'nameAr',''),COALESCE(company->>'nameEn',''),false
    FROM jsonb_array_elements($1::jsonb) AS source(company)
    ON CONFLICT (id) DO UPDATE SET company_code=EXCLUDED.company_code,name_ar=EXCLUDED.name_ar,name_en=EXCLUDED.name_en,is_archived=false`,
    [JSON.stringify(companies)]);

  // Operational rows reference employees, so clear them before replacing employee identities.
  await client.query(`DELETE FROM ${q('attendance_records')}`);
  await client.query(`DELETE FROM ${q('leave_requests')}`);
  await client.query(`DELETE FROM ${q('loans')}`);
  await client.query(`DELETE FROM ${q('penalties')}`);
  await client.query(`DELETE FROM ${q('temporary_earnings')}`);
  await client.query(`DELETE FROM ${q('payroll_payment_batch_items')}`);
  await client.query(`DELETE FROM ${q('payroll_payment_batches')}`);
  await client.query(`DELETE FROM ${q('payroll_run_items')}`);
  await client.query(`DELETE FROM ${q('payroll_runs')}`);
  await client.query(`DELETE FROM ${q('employees')}`);

  await client.query(`INSERT INTO ${q('employees')} (
      id,company_id,employee_no,national_id_or_iqama,status,first_name_ar,last_name_ar,first_name_en,last_name_en,
      department,job_title,hire_date,salary_start_date,termination_date,suspension_start_date,suspension_end_date,
      base_salary,housing_allowance,transport_allowance,other_fixed_allowances,bank_iban,payload,sort_order,is_archived
    )
    SELECT employee->>'id',employee->>'companyId',employee->>'employeeNo',COALESCE(employee->>'nationalIdOrIqama',''),
      COALESCE(employee->>'status','ACTIVE'),COALESCE(employee->>'firstNameAr',''),COALESCE(employee->>'lastNameAr',''),
      COALESCE(employee->>'firstNameEn',''),COALESCE(employee->>'lastNameEn',''),COALESCE(employee->>'department',''),
      COALESCE(employee->>'jobTitle',''),NULLIF(employee->>'hireDate','')::date,NULLIF(employee->>'salaryStartDate','')::date,
      NULLIF(employee->>'terminationDate','')::date,NULLIF(employee->>'suspensionStartDate','')::date,NULLIF(employee->>'suspensionEndDate','')::date,
      COALESCE(NULLIF(employee->'salaryPackage'->>'baseSalary','')::numeric,0),
      COALESCE(NULLIF(employee->'salaryPackage'->>'housingAllowance','')::numeric,0),
      COALESCE(NULLIF(employee->'salaryPackage'->>'transportAllowance','')::numeric,0),
      COALESCE(NULLIF(employee->'salaryPackage'->>'otherFixedAllowances','')::numeric,0),
      COALESCE(employee->>'bankIban',''),employee,(ordinality - 1)::integer,false
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(employee, ordinality)`, [JSON.stringify(employees)]);

  await client.query(`INSERT INTO ${q('payroll_runs')} (
      id,company_id,period_month,status,employees_count,total_gross_salaries,total_deductions,total_net_salaries,
      total_company_cost,created_at,calculated_at,approved_at,posted_at,payload,sort_order
    )
    SELECT run->>'id',run->>'companyId',run->>'periodMonth',COALESCE(run->>'status','DRAFT'),
      COALESCE(NULLIF(run->>'employeesCount','')::integer,0),COALESCE(NULLIF(run->>'totalGrossSalaries','')::numeric,0),
      COALESCE(NULLIF(run->>'totalDeductions','')::numeric,0),COALESCE(NULLIF(run->>'totalNetSalaries','')::numeric,0),
      COALESCE(NULLIF(run->>'totalCompanyCost','')::numeric,0),NULLIF(run->>'createdAt','')::timestamptz,
      NULLIF(run->>'calculatedAt','')::timestamptz,NULLIF(run->>'approvedAt','')::timestamptz,NULLIF(run->>'postedAt','')::timestamptz,
      run - 'items' - 'paymentBatches',(ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(run, ordinality)`, [JSON.stringify(payrollRuns)]);

  await client.query(`INSERT INTO ${q('payroll_run_items')} (
      payroll_run_id,id,employee_id,employee_no,employee_name,entitlement_status,entitlement_reason,
      base_salary,total_gross_salary,total_deductions,net_salary,payload,sort_order
    )
    SELECT run->>'id',item->>'id',item->>'employeeId',COALESCE(item->>'employeeNo',''),COALESCE(item->>'employeeName',''),
      COALESCE(item->>'entitlementStatus','PAYABLE'),NULLIF(item->>'entitlementReason',''),
      COALESCE(NULLIF(item->>'baseSalary','')::numeric,0),COALESCE(NULLIF(item->>'totalGrossSalary','')::numeric,0),
      COALESCE(NULLIF(item->>'totalDeductions','')::numeric,0),COALESCE(NULLIF(item->>'netSalary','')::numeric,0),
      item,(item_ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) AS runs(run)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(run->'items','[]'::jsonb)) WITH ORDINALITY AS items(item,item_ordinality)`, [JSON.stringify(payrollRuns)]);

  await client.query(`INSERT INTO ${q('payroll_payment_batches')} (
      id,payroll_run_id,company_id,batch_number,status,method,total_amount,scheduled_date,payment_date,payload,sort_order
    )
    SELECT batch->>'id',run->>'id',batch->>'companyId',COALESCE(batch->>'batchNumber',''),COALESCE(batch->>'status','SCHEDULED'),
      COALESCE(batch->>'method','BANK_TRANSFER'),COALESCE(NULLIF(batch->>'totalAmount','')::numeric,0),
      NULLIF(batch->>'scheduledDate','')::date,NULLIF(batch->>'paymentDate','')::date,
      batch - 'employeeIds',(batch_ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) AS runs(run)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(run->'paymentBatches','[]'::jsonb)) WITH ORDINALITY AS batches(batch,batch_ordinality)`, [JSON.stringify(payrollRuns)]);

  await client.query(`INSERT INTO ${q('payroll_payment_batch_items')} (payment_batch_id,employee_id,sort_order)
    SELECT batch->>'id',employee_id,(employee_ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) AS runs(run)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(run->'paymentBatches','[]'::jsonb)) AS batches(batch)
    CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(batch->'employeeIds','[]'::jsonb)) WITH ORDINALITY AS employee_ids(employee_id,employee_ordinality)`, [JSON.stringify(payrollRuns)]);
}

async function replaceNormalizedOperationsData(client, state) {
  const attendance = asArray(state?.attendance);
  const leaves = asArray(state?.leaves);
  const loans = asArray(state?.loans);
  const penalties = asArray(state?.penalties);
  const temporaryEarnings = asArray(state?.temporaryEarnings);

  await client.query(`DELETE FROM ${q('attendance_records')}`);
  await client.query(`DELETE FROM ${q('leave_requests')}`);
  await client.query(`DELETE FROM ${q('loans')}`);
  await client.query(`DELETE FROM ${q('penalties')}`);
  await client.query(`DELETE FROM ${q('temporary_earnings')}`);

  const operationalSources = [attendance, leaves, loans, penalties, temporaryEarnings].flat();
  await client.query(`INSERT INTO ${q('employees')} (
      id,company_id,employee_no,national_id_or_iqama,status,first_name_ar,last_name_ar,first_name_en,last_name_en,
      payload,sort_order,is_archived
    )
    SELECT DISTINCT ON (record->>'employeeId') record->>'employeeId',record->>'companyId',
      'ARCHIVED-' || left(record->>'employeeId',32),'','TERMINATED','موظف','مؤرشف','Archived','Employee',
      jsonb_build_object('id',record->>'employeeId','companyId',record->>'companyId','employeeNo','ARCHIVED-' || left(record->>'employeeId',32),'status','TERMINATED'),
      2147483647,true
    FROM jsonb_array_elements($1::jsonb) AS source(record)
    WHERE NULLIF(record->>'employeeId','') IS NOT NULL AND NULLIF(record->>'companyId','') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM ${q('employees')} employee WHERE employee.id=record->>'employeeId')
    ON CONFLICT (id) DO NOTHING`, [JSON.stringify(operationalSources)]);

  await client.query(`INSERT INTO ${q('attendance_records')} (
      id,company_id,employee_id,period_month,record_date,end_date,days_count,delay_minutes,absence,unpaid_leave,
      overtime_hours,overtime_type,notes,payload,sort_order
    )
    SELECT record->>'id',record->>'companyId',record->>'employeeId',record->>'periodMonth',NULLIF(record->>'date','')::date,
      NULLIF(record->>'endDate','')::date,COALESCE(NULLIF(record->>'daysCount','')::integer,1),
      COALESCE(NULLIF(record->>'delayMinutes','')::integer,0),COALESCE((record->>'absence')::boolean,false),
      COALESCE((record->>'unpaidLeave')::boolean,false),COALESCE(NULLIF(record->>'overtimeHours','')::numeric,0),
      COALESCE(record->>'overtimeType','STANDARD'),NULLIF(record->>'notes',''),record,(ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(record,ordinality)`, [JSON.stringify(attendance)]);

  await client.query(`INSERT INTO ${q('leave_requests')} (
      id,company_id,employee_id,leave_type,start_date,end_date,days_count,status,is_paid,reason,payload,sort_order
    )
    SELECT leave->>'id',leave->>'companyId',leave->>'employeeId',leave->>'type',NULLIF(leave->>'startDate','')::date,
      NULLIF(leave->>'endDate','')::date,COALESCE(NULLIF(leave->>'daysCount','')::integer,0),COALESCE(leave->>'status','PENDING'),
      COALESCE((leave->>'isPaid')::boolean,false),NULLIF(leave->>'reason',''),leave,(ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(leave,ordinality)`, [JSON.stringify(leaves)]);

  await client.query(`INSERT INTO ${q('loans')} (
      id,company_id,employee_id,total_amount,monthly_installment,total_installments,remaining_installments,
      remaining_amount,start_month,status,reason,payload,sort_order
    )
    SELECT loan->>'id',loan->>'companyId',loan->>'employeeId',COALESCE(NULLIF(loan->>'totalAmount','')::numeric,0),
      COALESCE(NULLIF(loan->>'monthlyInstallment','')::numeric,0),COALESCE(NULLIF(loan->>'totalInstallments','')::integer,0),
      COALESCE(NULLIF(loan->>'remainingInstallments','')::integer,0),COALESCE(NULLIF(loan->>'remainingAmount','')::numeric,0),
      loan->>'startDate',COALESCE(loan->>'status','ACTIVE'),COALESCE(loan->>'reason',''),loan,(ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(loan,ordinality)`, [JSON.stringify(loans)]);

  await client.query(`INSERT INTO ${q('penalties')} (
      id,company_id,employee_id,period_month,record_date,reason,amount,applied_in_payroll,payload,sort_order
    )
    SELECT penalty->>'id',penalty->>'companyId',penalty->>'employeeId',penalty->>'periodMonth',
      NULLIF(penalty->>'date','')::date,COALESCE(penalty->>'reason',''),COALESCE(NULLIF(penalty->>'amount','')::numeric,0),
      COALESCE((penalty->>'appliedInPayroll')::boolean,false),penalty,(ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(penalty,ordinality)`, [JSON.stringify(penalties)]);

  await client.query(`INSERT INTO ${q('temporary_earnings')} (
      id,company_id,employee_id,period_month,record_date,earning_type,amount,reason,applied_in_payroll,payload,sort_order
    )
    SELECT earning->>'id',earning->>'companyId',earning->>'employeeId',earning->>'periodMonth',
      NULLIF(earning->>'date','')::date,earning->>'type',COALESCE(NULLIF(earning->>'amount','')::numeric,0),
      COALESCE(earning->>'reason',''),COALESCE((earning->>'appliedInPayroll')::boolean,false),earning,(ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(earning,ordinality)`, [JSON.stringify(temporaryEarnings)]);
}

async function replaceNormalizedCoreData(client, state) {
  const companies = asArray(state?.companies);
  const journals = asArray(state?.journals);
  const auditLogs = asArray(state?.auditLogs);
  const qoyodConfig = state?.qoyodConfig && typeof state.qoyodConfig === 'object' ? state.qoyodConfig : {};
  const companyIdsForConfig = new Set(companies.map(company => String(company?.id || '')).filter(Boolean));
  const requestedQoyodCompanyId = String(state?.activeCompanyId || '');
  const qoyodCompanyId = companyIdsForConfig.has(requestedQoyodCompanyId)
    ? requestedQoyodCompanyId
    : (String(companies[0]?.id || ''));

  await client.query(`UPDATE ${q('companies')} SET is_archived=true,updated_at=now()`);
  await client.query(`INSERT INTO ${q('companies')} (id,company_code,name_ar,name_en,payload,sort_order,is_archived)
    SELECT company->>'id',company->>'companyCode',COALESCE(company->>'nameAr',''),COALESCE(company->>'nameEn',''),
      company - 'departments' - 'costCenters' - 'bankDefinitions',(ordinality - 1)::integer,false
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(company,ordinality)
    ON CONFLICT (id) DO UPDATE SET company_code=EXCLUDED.company_code,name_ar=EXCLUDED.name_ar,name_en=EXCLUDED.name_en,
      payload=EXCLUDED.payload,sort_order=EXCLUDED.sort_order,is_archived=false,updated_at=now()`, [JSON.stringify(companies)]);

  await client.query(`DELETE FROM ${q('company_departments')}`);
  await client.query(`DELETE FROM ${q('cost_centers')}`);
  await client.query(`DELETE FROM ${q('company_bank_definitions')}`);
  await client.query(`INSERT INTO ${q('company_departments')} (company_id,id,code,name_ar,name_en,payload,sort_order)
    SELECT company->>'id',department->>'id',COALESCE(department->>'code',''),COALESCE(department->>'nameAr',''),
      COALESCE(department->>'nameEn',''),department,(department_ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) AS companies(company)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(company->'departments','[]'::jsonb)) WITH ORDINALITY AS departments(department,department_ordinality)`,
    [JSON.stringify(companies)]);
  await client.query(`INSERT INTO ${q('cost_centers')} (company_id,id,code,name_ar,name_en,payload,sort_order)
    SELECT company->>'id',center->>'id',COALESCE(center->>'code',''),COALESCE(center->>'nameAr',''),
      COALESCE(center->>'nameEn',''),center,(center_ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) AS companies(company)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(company->'costCenters','[]'::jsonb)) WITH ORDINALITY AS centers(center,center_ordinality)`,
    [JSON.stringify(companies)]);
  await client.query(`INSERT INTO ${q('company_bank_definitions')} (company_id,iban_bank_code,name_ar,name_en,swift_code,is_active,payload,sort_order)
    SELECT company->>'id',bank->>'ibanBankCode',COALESCE(bank->>'nameAr',''),COALESCE(bank->>'nameEn',''),
      COALESCE(bank->>'swiftCode',''),COALESCE((bank->>'isActive')::boolean,true),bank,(bank_ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) AS companies(company)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(company->'bankDefinitions','[]'::jsonb)) WITH ORDINALITY AS banks(bank,bank_ordinality)`,
    [JSON.stringify(companies)]);

  await client.query(`DELETE FROM ${q('journal_lines')}`);
  await client.query(`DELETE FROM ${q('journal_batches')}`);
  await client.query(`INSERT INTO ${q('journal_batches')} (
      id,company_id,payroll_run_id,period_month,batch_number,journal_date,description,status,total_debit,total_credit,payload,sort_order
    )
    SELECT journal->>'id',journal->>'companyId',journal->>'payrollRunId',journal->>'periodMonth',COALESCE(journal->>'batchNumber',''),
      NULLIF(journal->>'date','')::date,COALESCE(journal->>'description',''),COALESCE(journal->>'status','DRAFT'),
      COALESCE(NULLIF(journal->>'totalDebit','')::numeric,0),COALESCE(NULLIF(journal->>'totalCredit','')::numeric,0),
      journal - 'lines',(ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(journal,ordinality)`, [JSON.stringify(journals)]);
  await client.query(`INSERT INTO ${q('journal_lines')} (
      journal_batch_id,id,account_code,account_name_ar,description_ar,debit,credit,cost_center_code,payload,sort_order
    )
    SELECT journal->>'id',line->>'id',COALESCE(line->>'accountCode',''),COALESCE(line->>'accountNameAr',''),
      COALESCE(line->>'descriptionAr',''),COALESCE(NULLIF(line->>'debit','')::numeric,0),
      COALESCE(NULLIF(line->>'credit','')::numeric,0),NULLIF(line->>'costCenterCode',''),line,(line_ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) AS journals(journal)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(journal->'lines','[]'::jsonb)) WITH ORDINALITY AS lines(line,line_ordinality)`,
    [JSON.stringify(journals)]);

  await client.query(`DELETE FROM ${q('application_audit_logs')}`);
  await client.query(`INSERT INTO ${q('application_audit_logs')} (
      id,company_id,user_id,user_name,user_role,action,entity_type,entity_id,occurred_at,details,payload,sort_order
    )
    SELECT log->>'id',NULLIF(log->>'companyId',''),NULLIF(log->>'userId',''),COALESCE(log->>'userName',''),
      COALESCE(log->>'userRole','OPERATIONS_MANAGER'),COALESCE(log->>'action',''),NULLIF(COALESCE(log->>'entityType',log->>'entity'),''),
      COALESCE(log->>'entityId',''),NULLIF(log->>'timestamp','')::timestamptz,NULLIF(log->>'details',''),log,(ordinality - 1)::integer
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(log,ordinality)`, [JSON.stringify(auditLogs)]);

  const { apiKey = '', apiKeyConfigured: _ignored, ...publicConfig } = qoyodConfig;
  if (qoyodCompanyId) {
    await client.query(`INSERT INTO ${q('integration_configs')} (company_id,provider,public_config,secret_value,updated_at)
      VALUES ($1,'QOYOD',$2::jsonb,$3,now())
      ON CONFLICT (company_id,provider) DO UPDATE SET public_config=EXCLUDED.public_config,
        secret_value=CASE WHEN EXCLUDED.secret_value <> '' THEN EXCLUDED.secret_value ELSE ${q('integration_configs')}.secret_value END,
        updated_at=now()`, [qoyodCompanyId, JSON.stringify(publicConfig), String(apiKey || '')]);
  }
}

async function hydrateNormalizedPayrollData(client, rawState) {
  const state = clone(rawState || {});
  const [employeeResult, runResult, itemResult, batchResult, batchItemResult] = await Promise.all([
    client.query(`SELECT payload FROM ${q('employees')} WHERE is_archived=false ORDER BY sort_order,id`),
    client.query(`SELECT id,payload FROM ${q('payroll_runs')} ORDER BY sort_order,id`),
    client.query(`SELECT payroll_run_id,payload FROM ${q('payroll_run_items')} ORDER BY payroll_run_id,sort_order,id`),
    client.query(`SELECT id,payroll_run_id,payload FROM ${q('payroll_payment_batches')} ORDER BY payroll_run_id,sort_order,id`),
    client.query(`SELECT payment_batch_id,employee_id FROM ${q('payroll_payment_batch_items')} ORDER BY payment_batch_id,sort_order`),
  ]);
  const itemsByRun = new Map();
  for (const row of itemResult.rows) {
    if (!itemsByRun.has(row.payroll_run_id)) itemsByRun.set(row.payroll_run_id, []);
    itemsByRun.get(row.payroll_run_id).push(row.payload);
  }
  const employeeIdsByBatch = new Map();
  for (const row of batchItemResult.rows) {
    if (!employeeIdsByBatch.has(row.payment_batch_id)) employeeIdsByBatch.set(row.payment_batch_id, []);
    employeeIdsByBatch.get(row.payment_batch_id).push(row.employee_id);
  }
  const batchesByRun = new Map();
  for (const row of batchResult.rows) {
    if (!batchesByRun.has(row.payroll_run_id)) batchesByRun.set(row.payroll_run_id, []);
    batchesByRun.get(row.payroll_run_id).push({ ...row.payload, employeeIds: employeeIdsByBatch.get(row.id) || [] });
  }
  state.employees = employeeResult.rows.map(row => row.payload);
  state.payrollRuns = runResult.rows.map(row => ({
    ...row.payload,
    items: itemsByRun.get(row.id) || [],
    paymentBatches: batchesByRun.get(row.id) || [],
  }));
  return state;
}

async function hydrateNormalizedOperationsData(client, rawState) {
  const state = clone(rawState || {});
  const [attendance, leaves, loans, penalties, temporaryEarnings] = await Promise.all([
    client.query(`SELECT payload FROM ${q('attendance_records')} ORDER BY sort_order,id`),
    client.query(`SELECT payload FROM ${q('leave_requests')} ORDER BY sort_order,id`),
    client.query(`SELECT payload FROM ${q('loans')} ORDER BY sort_order,id`),
    client.query(`SELECT payload FROM ${q('penalties')} ORDER BY sort_order,id`),
    client.query(`SELECT payload FROM ${q('temporary_earnings')} ORDER BY sort_order,id`),
  ]);
  state.attendance = attendance.rows.map(row => row.payload);
  state.leaves = leaves.rows.map(row => row.payload);
  state.loans = loans.rows.map(row => row.payload);
  state.penalties = penalties.rows.map(row => row.payload);
  state.temporaryEarnings = temporaryEarnings.rows.map(row => row.payload);
  return state;
}

async function hydrateNormalizedCoreData(client, rawState) {
  const state = clone(rawState || {});
  const [companies, departments, costCenters, bankDefinitions, journals, journalLines, auditLogs, integration] = await Promise.all([
    client.query(`SELECT id,company_code,name_ar,name_en,payload,subscription_status,trial_ends_at,subscription_ends_at
      FROM ${q('companies')} WHERE is_archived=false ORDER BY sort_order,id`),
    client.query(`SELECT company_id,payload FROM ${q('company_departments')} ORDER BY company_id,sort_order,id`),
    client.query(`SELECT company_id,payload FROM ${q('cost_centers')} ORDER BY company_id,sort_order,id`),
    client.query(`SELECT company_id,payload FROM ${q('company_bank_definitions')} ORDER BY company_id,sort_order,iban_bank_code`),
    client.query(`SELECT id,payload FROM ${q('journal_batches')} ORDER BY sort_order,id`),
    client.query(`SELECT journal_batch_id,payload FROM ${q('journal_lines')} ORDER BY journal_batch_id,sort_order,id`),
    client.query(`SELECT payload FROM ${q('application_audit_logs')} ORDER BY sort_order,id`),
    client.query(`SELECT company_id,public_config,secret_value FROM ${q('integration_configs')} WHERE provider='QOYOD'`),
  ]);
  const linesByJournal = new Map();
  for (const row of journalLines.rows) {
    if (!linesByJournal.has(row.journal_batch_id)) linesByJournal.set(row.journal_batch_id, []);
    linesByJournal.get(row.journal_batch_id).push(row.payload);
  }
  const groupPayloads = (rows) => {
    const grouped = new Map();
    for (const row of rows) {
      if (!grouped.has(row.company_id)) grouped.set(row.company_id, []);
      grouped.get(row.company_id).push(row.payload);
    }
    return grouped;
  };
  const departmentsByCompany = groupPayloads(departments.rows);
  const costCentersByCompany = groupPayloads(costCenters.rows);
  const bankDefinitionsByCompany = groupPayloads(bankDefinitions.rows);
  state.companies = companies.rows.map(row => ({
    ...row.payload,
    id:row.id,
    companyCode:row.company_code,
    nameAr:row.name_ar,
    nameEn:row.name_en,
    subscriptionStatus:subscriptionState(row).status,
    trialEndsAt:row.trial_ends_at?.toISOString?.() || row.trial_ends_at || null,
    subscriptionEndsAt:row.subscription_ends_at?.toISOString?.() || row.subscription_ends_at || null,
    departments: departmentsByCompany.get(row.id) || [],
    costCenters: costCentersByCompany.get(row.id) || [],
    bankDefinitions: bankDefinitionsByCompany.get(row.id) || [],
  }));
  state.journals = journals.rows.map(row => ({ ...row.payload, lines: linesByJournal.get(row.id) || [] }));
  state.auditLogs = auditLogs.rows.map(row => row.payload);
  state.qoyodConfigsByCompany = Object.fromEntries(integration.rows
    .filter(row => row.company_id)
    .map(row => [row.company_id, { ...row.public_config, apiKey: row.secret_value || '' }]));
  return state;
}

async function hydrateNormalizedStateData(client, rawState) {
  const payrollState = await hydrateNormalizedPayrollData(client, rawState);
  const operationsState = await hydrateNormalizedOperationsData(client, payrollState);
  return hydrateNormalizedCoreData(client, operationsState);
}

async function migrate() {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('companies')} (
    id text PRIMARY KEY, company_code text NOT NULL UNIQUE, name_ar text NOT NULL, name_en text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`ALTER TABLE ${q('companies')} ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb`);
  await pool.query(`ALTER TABLE ${q('companies')} ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE ${q('companies')} ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE ${q('companies')} ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`);
  await pool.query(`ALTER TABLE ${q('companies')} ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'ACTIVE'`);
  await pool.query(`ALTER TABLE ${q('companies')} ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz`);
  await pool.query(`ALTER TABLE ${q('companies')} ADD COLUMN IF NOT EXISTS subscription_ends_at timestamptz`);
  await pool.query(`DO $$ BEGIN
    ALTER TABLE ${q('companies')} ADD CONSTRAINT companies_subscription_status_check
      CHECK (subscription_status IN ('TRIAL','ACTIVE','EXPIRED','SUSPENDED'));
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('users')} (
    id text PRIMARY KEY, username text NOT NULL UNIQUE, password_hash text NOT NULL, name text NOT NULL,
    email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', role text NOT NULL,
    company_ids jsonb NOT NULL DEFAULT '[]', is_active boolean NOT NULL DEFAULT true,
    last_login timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`ALTER TABLE ${q('users')} ADD COLUMN IF NOT EXISTS permissions jsonb`);
  await pool.query(`ALTER TABLE ${q('users')} ADD COLUMN IF NOT EXISTS email_verified_at timestamptz`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON ${q('users')}(lower(email)) WHERE email <> ''`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('registration_requests')} (
    id text PRIMARY KEY, email text NOT NULL UNIQUE, code_hash text NOT NULL, details jsonb NOT NULL,
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 10),
    expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`DELETE FROM ${q('registration_requests')} WHERE expires_at < now()-interval '1 day'`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('password_reset_tokens')} (
    id text PRIMARY KEY, user_id text NOT NULL REFERENCES ${q('users')}(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON ${q('password_reset_tokens')}(user_id,expires_at)`);
  const duplicateUserEmails = await pool.query(`SELECT lower(email) AS email_key,count(*)::integer AS duplicate_count
    FROM ${q('users')} WHERE email IS NOT NULL AND btrim(email) <> ''
    GROUP BY lower(email) HAVING count(*) > 1 LIMIT 1`);
  if (!duplicateUserEmails.rowCount) {
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_ci_unique ON ${q('users')} (lower(email)) WHERE email IS NOT NULL AND btrim(email) <> ''`);
  } else {
    console.warn('Skipping users_email_ci_unique because duplicate user emails already exist; resolve duplicates before enforcing the index.');
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('sessions')} (
    token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES ${q('users')}(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('hr_lifecycle_alert_deliveries')} (
    event_key text PRIMARY KEY, company_id text NOT NULL, employee_id text NOT NULL, alert_type text NOT NULL,
    due_date date, recipients jsonb NOT NULL DEFAULT '[]', sent_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS hr_lifecycle_alert_deliveries_company_idx
    ON ${q('hr_lifecycle_alert_deliveries')}(company_id,sent_at DESC)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('app_state')} (
    id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1), state jsonb NOT NULL DEFAULT '{}',
    version bigint NOT NULL DEFAULT 1, updated_by text, updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('app_state_migration_backups')} (
    id bigserial PRIMARY KEY, source_version bigint NOT NULL UNIQUE, state jsonb NOT NULL,
    reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('schema_migrations')} (
    version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('employees')} (
    id text PRIMARY KEY, company_id text NOT NULL REFERENCES ${q('companies')}(id) ON DELETE RESTRICT,
    employee_no text NOT NULL, national_id_or_iqama text NOT NULL DEFAULT '', status text NOT NULL,
    first_name_ar text NOT NULL DEFAULT '', last_name_ar text NOT NULL DEFAULT '', first_name_en text NOT NULL DEFAULT '', last_name_en text NOT NULL DEFAULT '',
    department text NOT NULL DEFAULT '', job_title text NOT NULL DEFAULT '', hire_date date, salary_start_date date, termination_date date,
    suspension_start_date date, suspension_end_date date, base_salary numeric(14,2) NOT NULL DEFAULT 0,
    housing_allowance numeric(14,2) NOT NULL DEFAULT 0, transport_allowance numeric(14,2) NOT NULL DEFAULT 0,
    other_fixed_allowances numeric(14,2) NOT NULL DEFAULT 0, bank_iban text NOT NULL DEFAULT '', payload jsonb NOT NULL,
    sort_order integer NOT NULL DEFAULT 0, is_archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (status IN ('ONBOARDING','ACTIVE','SUSPENDED','ON_LEAVE','TERMINATED','ABSCONDED'))
  )`);
  await pool.query(`ALTER TABLE ${q('employees')} ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE ${q('employees')} DROP CONSTRAINT IF EXISTS employees_status_check`);
  await pool.query(`ALTER TABLE ${q('employees')} ADD CONSTRAINT employees_status_check CHECK (status IN ('ONBOARDING','ACTIVE','SUSPENDED','ON_LEAVE','TERMINATED','ABSCONDED'))`);

  // LEGACY_EMPLOYEE_IDENTITY_COMPAT: records created before the lifecycle wizard already
  // have a valid national ID/iqama. Never reinterpret them as new arrivals solely because
  // lifecycle fields did not exist at the time. No expiry date is invented.
  await pool.query(`UPDATE ${q('employees')}
    SET payload = jsonb_set(
      jsonb_set(
        jsonb_set(payload, '{iqamaNumber}', to_jsonb(national_id_or_iqama), true),
        '{iqamaIssueStatus}', '"ISSUED"'::jsonb, true
      ),
      '{onboardingStatus}', to_jsonb(CASE WHEN COALESCE(bank_iban,'') <> '' THEN 'COMPLETE' ELSE 'WAITING_BANK' END::text), true
    ), updated_at=now()
    WHERE is_archived=false
      AND payload->>'nationality'='NON_SAUDI'
      AND COALESCE(national_id_or_iqama,'') <> ''
      AND COALESCE(payload->>'iqamaNumber','')=''
      AND COALESCE(payload->>'entryNumber','')=''`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('payroll_runs')} (
    id text PRIMARY KEY, company_id text NOT NULL REFERENCES ${q('companies')}(id) ON DELETE RESTRICT,
    period_month text NOT NULL CHECK (period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'), status text NOT NULL,
    employees_count integer NOT NULL DEFAULT 0, total_gross_salaries numeric(16,2) NOT NULL DEFAULT 0,
    total_deductions numeric(16,2) NOT NULL DEFAULT 0, total_net_salaries numeric(16,2) NOT NULL DEFAULT 0,
    total_company_cost numeric(16,2) NOT NULL DEFAULT 0, created_at timestamptz, calculated_at timestamptz,
    approved_at timestamptz, posted_at timestamptz, payload jsonb NOT NULL, sort_order integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (company_id,period_month),
    CHECK (status IN ('DRAFT','UNDER_REVIEW','APPROVED','POSTED'))
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('payroll_run_items')} (
    payroll_run_id text NOT NULL REFERENCES ${q('payroll_runs')}(id) ON DELETE CASCADE, id text NOT NULL,
    employee_id text NOT NULL, employee_no text NOT NULL DEFAULT '', employee_name text NOT NULL DEFAULT '',
    entitlement_status text NOT NULL DEFAULT 'PAYABLE', entitlement_reason text,
    base_salary numeric(14,2) NOT NULL DEFAULT 0, total_gross_salary numeric(14,2) NOT NULL DEFAULT 0,
    total_deductions numeric(14,2) NOT NULL DEFAULT 0, net_salary numeric(14,2) NOT NULL DEFAULT 0,
    payload jsonb NOT NULL, sort_order integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (payroll_run_id,id), UNIQUE (payroll_run_id,employee_id),
    CHECK (entitlement_status IN ('PAYABLE','HELD','UNDER_SETTLEMENT','SETTLED','CANCELLED_WITH_DOCUMENT'))
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('payroll_payment_batches')} (
    id text PRIMARY KEY, payroll_run_id text NOT NULL REFERENCES ${q('payroll_runs')}(id) ON DELETE CASCADE,
    company_id text NOT NULL REFERENCES ${q('companies')}(id) ON DELETE RESTRICT, batch_number text NOT NULL,
    status text NOT NULL, method text NOT NULL, total_amount numeric(14,2) NOT NULL DEFAULT 0,
    scheduled_date date, payment_date date, payload jsonb NOT NULL, sort_order integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (company_id,batch_number),
    CHECK (status IN ('SCHEDULED','PAID','FAILED','CANCELLED')),
    CHECK (method IN ('WPS','BANK_TRANSFER','CASH'))
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('payroll_payment_batch_items')} (
    payment_batch_id text NOT NULL REFERENCES ${q('payroll_payment_batches')}(id) ON DELETE CASCADE,
    employee_id text NOT NULL, sort_order integer NOT NULL DEFAULT 0, PRIMARY KEY (payment_batch_id,employee_id)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('attendance_records')} (
    id text PRIMARY KEY, company_id text NOT NULL REFERENCES ${q('companies')}(id) ON DELETE RESTRICT,
    employee_id text NOT NULL REFERENCES ${q('employees')}(id) ON DELETE CASCADE,
    period_month text NOT NULL CHECK (period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'), record_date date NOT NULL,
    end_date date, days_count integer NOT NULL DEFAULT 1 CHECK (days_count >= 0), delay_minutes integer NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0),
    absence boolean NOT NULL DEFAULT false, unpaid_leave boolean NOT NULL DEFAULT false,
    overtime_hours numeric(10,2) NOT NULL DEFAULT 0 CHECK (overtime_hours >= 0), overtime_type text NOT NULL,
    notes text, payload jsonb NOT NULL, sort_order integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (overtime_type IN ('STANDARD','WEEKEND'))
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('leave_requests')} (
    id text PRIMARY KEY, company_id text NOT NULL REFERENCES ${q('companies')}(id) ON DELETE RESTRICT,
    employee_id text NOT NULL REFERENCES ${q('employees')}(id) ON DELETE CASCADE,
    leave_type text NOT NULL, start_date date NOT NULL, end_date date NOT NULL, days_count integer NOT NULL CHECK (days_count >= 0),
    status text NOT NULL, is_paid boolean NOT NULL DEFAULT false, reason text, payload jsonb NOT NULL,
    sort_order integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (leave_type IN ('ANNUAL','SICK','UNPAID','EMERGENCY','MATERNITY')),
    CHECK (status IN ('PENDING','APPROVED','REJECTED')), CHECK (end_date >= start_date)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('loans')} (
    id text PRIMARY KEY, company_id text NOT NULL REFERENCES ${q('companies')}(id) ON DELETE RESTRICT,
    employee_id text NOT NULL REFERENCES ${q('employees')}(id) ON DELETE RESTRICT,
    total_amount numeric(14,2) NOT NULL CHECK (total_amount >= 0), monthly_installment numeric(14,2) NOT NULL CHECK (monthly_installment >= 0),
    total_installments integer NOT NULL CHECK (total_installments >= 0), remaining_installments integer NOT NULL CHECK (remaining_installments >= 0),
    remaining_amount numeric(14,2) NOT NULL CHECK (remaining_amount >= 0), start_month text NOT NULL,
    status text NOT NULL, reason text NOT NULL DEFAULT '', payload jsonb NOT NULL, sort_order integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(), CHECK (start_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CHECK (status IN ('ACTIVE','COMPLETED','PAUSED'))
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('penalties')} (
    id text PRIMARY KEY, company_id text NOT NULL REFERENCES ${q('companies')}(id) ON DELETE RESTRICT,
    employee_id text NOT NULL REFERENCES ${q('employees')}(id) ON DELETE RESTRICT,
    period_month text NOT NULL, record_date date NOT NULL, reason text NOT NULL DEFAULT '', amount numeric(14,2) NOT NULL CHECK (amount >= 0),
    applied_in_payroll boolean NOT NULL DEFAULT false, payload jsonb NOT NULL, sort_order integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(), CHECK (period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('temporary_earnings')} (
    id text PRIMARY KEY, company_id text NOT NULL REFERENCES ${q('companies')}(id) ON DELETE RESTRICT,
    employee_id text NOT NULL REFERENCES ${q('employees')}(id) ON DELETE RESTRICT,
    period_month text NOT NULL, record_date date NOT NULL, earning_type text NOT NULL,
    amount numeric(14,2) NOT NULL CHECK (amount >= 0), reason text NOT NULL DEFAULT '', applied_in_payroll boolean NOT NULL DEFAULT false,
    payload jsonb NOT NULL, sort_order integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'), CHECK (earning_type IN ('COMMISSION','BONUS','INCENTIVE','OTHER'))
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('company_departments')} (
    company_id text NOT NULL REFERENCES ${q('companies')}(id) ON DELETE CASCADE, id text NOT NULL, code text NOT NULL DEFAULT '',
    name_ar text NOT NULL DEFAULT '', name_en text NOT NULL DEFAULT '', payload jsonb NOT NULL, sort_order integer NOT NULL DEFAULT 0,
    PRIMARY KEY (company_id,id)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('cost_centers')} (
    company_id text NOT NULL REFERENCES ${q('companies')}(id) ON DELETE CASCADE, id text NOT NULL, code text NOT NULL DEFAULT '',
    name_ar text NOT NULL DEFAULT '', name_en text NOT NULL DEFAULT '', payload jsonb NOT NULL, sort_order integer NOT NULL DEFAULT 0,
    PRIMARY KEY (company_id,id)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('company_bank_definitions')} (
    company_id text NOT NULL REFERENCES ${q('companies')}(id) ON DELETE CASCADE, iban_bank_code text NOT NULL,
    name_ar text NOT NULL DEFAULT '', name_en text NOT NULL DEFAULT '', swift_code text NOT NULL DEFAULT '', is_active boolean NOT NULL DEFAULT true,
    payload jsonb NOT NULL, sort_order integer NOT NULL DEFAULT 0, PRIMARY KEY (company_id,iban_bank_code)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('journal_batches')} (
    id text PRIMARY KEY, company_id text NOT NULL REFERENCES ${q('companies')}(id) ON DELETE RESTRICT,
    payroll_run_id text NOT NULL, period_month text NOT NULL, batch_number text NOT NULL, journal_date date NOT NULL,
    description text NOT NULL DEFAULT '', status text NOT NULL, total_debit numeric(16,2) NOT NULL DEFAULT 0,
    total_credit numeric(16,2) NOT NULL DEFAULT 0, payload jsonb NOT NULL, sort_order integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (company_id,batch_number),
    CHECK (period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'), CHECK (status IN ('DRAFT','EXPORTED_TO_QOYOD','POSTED')),
    CHECK (abs(total_debit-total_credit) < 0.01)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('journal_lines')} (
    journal_batch_id text NOT NULL REFERENCES ${q('journal_batches')}(id) ON DELETE CASCADE, id text NOT NULL,
    account_code text NOT NULL, account_name_ar text NOT NULL DEFAULT '', description_ar text NOT NULL DEFAULT '',
    debit numeric(16,2) NOT NULL DEFAULT 0 CHECK (debit >= 0), credit numeric(16,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
    cost_center_code text, payload jsonb NOT NULL, sort_order integer NOT NULL DEFAULT 0,
    PRIMARY KEY (journal_batch_id,id), CHECK (NOT (debit > 0 AND credit > 0))
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('application_audit_logs')} (
    id text PRIMARY KEY, company_id text, user_id text, user_name text NOT NULL DEFAULT '', user_role text NOT NULL,
    action text NOT NULL DEFAULT '', entity_type text, entity_id text NOT NULL DEFAULT '', occurred_at timestamptz NOT NULL,
    details text, payload jsonb NOT NULL, sort_order integer NOT NULL DEFAULT 0
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('integration_configs')} (
    provider text PRIMARY KEY, public_config jsonb NOT NULL DEFAULT '{}'::jsonb, secret_value text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now(), CHECK (provider IN ('QOYOD'))
  )`);
  await pool.query(`ALTER TABLE ${q('integration_configs')} ADD COLUMN IF NOT EXISTS company_id text`);
  await pool.query(`UPDATE ${q('integration_configs')} SET company_id=$1 WHERE company_id IS NULL`, [process.env.COMPANY_ID]);
  await pool.query(`ALTER TABLE ${q('integration_configs')} ALTER COLUMN company_id SET NOT NULL`);
  const integrationPk = await pool.query(`SELECT pg_get_constraintdef(oid) definition FROM pg_constraint
    WHERE conrelid=$1::regclass AND contype='p'`, [q('integration_configs')]);
  if (integrationPk.rows[0]?.definition === 'PRIMARY KEY (provider)') {
    await pool.query(`ALTER TABLE ${q('integration_configs')} DROP CONSTRAINT integration_configs_pkey`);
  }
  const integrationPkAfter = await pool.query(`SELECT 1 FROM pg_constraint WHERE conrelid=$1::regclass AND contype='p'`, [q('integration_configs')]);
  if (!integrationPkAfter.rowCount) {
    await pool.query(`ALTER TABLE ${q('integration_configs')} ADD CONSTRAINT integration_configs_pkey PRIMARY KEY (company_id,provider)`);
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('audit_log')} (
    id bigserial PRIMARY KEY, user_id text, action text NOT NULL, ip inet, created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON ${q('sessions')}(expires_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS employees_company_idx ON ${q('employees')}(company_id,status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS employees_number_idx ON ${q('employees')}(company_id,employee_no)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS employees_company_number_unique_idx
    ON ${q('employees')}(company_id,employee_no) WHERE is_archived=false AND employee_no <> ''`);
  await pool.query(`CREATE INDEX IF NOT EXISTS payroll_runs_company_period_idx ON ${q('payroll_runs')}(company_id,period_month DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS payroll_items_employee_idx ON ${q('payroll_run_items')}(employee_id,payroll_run_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS attendance_employee_period_idx ON ${q('attendance_records')}(employee_id,period_month)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS attendance_company_period_idx ON ${q('attendance_records')}(company_id,period_month)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS leaves_employee_dates_idx ON ${q('leave_requests')}(employee_id,start_date,end_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS leaves_company_idx ON ${q('leave_requests')}(company_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS loans_employee_status_idx ON ${q('loans')}(employee_id,status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS loans_company_idx ON ${q('loans')}(company_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS penalties_employee_period_idx ON ${q('penalties')}(employee_id,period_month)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS penalties_company_period_idx ON ${q('penalties')}(company_id,period_month)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS earnings_employee_period_idx ON ${q('temporary_earnings')}(employee_id,period_month)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS earnings_company_period_idx ON ${q('temporary_earnings')}(company_id,period_month)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS journal_batches_company_period_idx ON ${q('journal_batches')}(company_id,period_month)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS application_audit_logs_company_time_idx ON ${q('application_audit_logs')}(company_id,occurred_at DESC)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS company_departments_code_unique_idx
    ON ${q('company_departments')}(company_id,code) WHERE code <> ''`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS cost_centers_code_unique_idx
    ON ${q('cost_centers')}(company_id,code) WHERE code <> ''`);
  await pool.query(`UPDATE ${q('users')} SET role='OPERATIONS_MANAGER',updated_at=now()
    WHERE id <> 'user-admin' AND role IN ('HR_MANAGER','PAYROLL_SPECIALIST','AUDITOR','EMPLOYEE')`);

  const companyId = process.env.COMPANY_ID;
  await pool.query(`INSERT INTO ${q('companies')} (id, company_code, name_ar, name_en) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`, [
    companyId, process.env.COMPANY_CODE, process.env.COMPANY_NAME_AR, process.env.COMPANY_NAME_EN
  ]);
  const adminHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
  await pool.query(`INSERT INTO ${q('users')} (id, username, password_hash, name, email, role, company_ids)
    VALUES ('user-admin',$1,$2,$3,$4,'ADMIN',$5::jsonb) ON CONFLICT (username) DO NOTHING`, [
    process.env.ADMIN_USERNAME, adminHash, process.env.ADMIN_NAME, process.env.ADMIN_EMAIL || '', JSON.stringify([companyId])
  ]);

  const migrationClient = await pool.connect();
  try {
    await migrationClient.query('BEGIN');
    const payrollMigration = await migrationClient.query(`SELECT 1 FROM ${q('schema_migrations')} WHERE version='001_normalized_payroll'`);
    if (!payrollMigration.rowCount) {
      const marker = await migrationClient.query(`SELECT 1 FROM ${q('app_state_migration_backups')} LIMIT 1`);
      const source = await migrationClient.query(`SELECT state,version FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
      if (!marker.rowCount && source.rowCount) {
        await migrationClient.query(`INSERT INTO ${q('app_state_migration_backups')} (source_version,state,reason)
          VALUES ($1,$2::jsonb,'Initial migration from app_state JSONB to normalized payroll tables')`,
          [source.rows[0].version, JSON.stringify(source.rows[0].state)]);
        await replaceNormalizedPayrollData(migrationClient, source.rows[0].state);
      }
      await migrationClient.query(`INSERT INTO ${q('schema_migrations')} (version) VALUES ('001_normalized_payroll')`);
    }

    const operationsMigration = await migrationClient.query(`SELECT 1 FROM ${q('schema_migrations')} WHERE version='002_normalized_operations'`);
    if (!operationsMigration.rowCount) {
      const source = await migrationClient.query(`SELECT state,version FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
      if (source.rowCount) {
        await migrationClient.query(`INSERT INTO ${q('app_state_migration_backups')} (source_version,state,reason)
          VALUES ($1,$2::jsonb,'Migration of attendance, leave, loan, penalty and temporary earning data')
          ON CONFLICT (source_version) DO NOTHING`, [source.rows[0].version, JSON.stringify(source.rows[0].state)]);
        await replaceNormalizedOperationsData(migrationClient, source.rows[0].state);
      }
      await migrationClient.query(`INSERT INTO ${q('schema_migrations')} (version) VALUES ('002_normalized_operations')`);
    }

    const coreMigration = await migrationClient.query(`SELECT 1 FROM ${q('schema_migrations')} WHERE version='003_normalized_core'`);
    if (!coreMigration.rowCount) {
      const source = await migrationClient.query(`SELECT state,version FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
      if (source.rowCount) {
        await migrationClient.query(`INSERT INTO ${q('app_state_migration_backups')} (source_version,state,reason)
          VALUES ($1,$2::jsonb,'Migration of companies, journals, application audit logs and integration configuration')
          ON CONFLICT (source_version) DO NOTHING`, [source.rows[0].version, JSON.stringify(source.rows[0].state)]);
        await replaceNormalizedCoreData(migrationClient, source.rows[0].state);
      }
      await migrationClient.query(`INSERT INTO ${q('schema_migrations')} (version) VALUES ('003_normalized_core')`);
    }
    await migrationClient.query(`INSERT INTO ${q('schema_migrations')} (version) VALUES ('004_company_trials')
      ON CONFLICT (version) DO NOTHING`);
    await migrationClient.query('COMMIT');
  } catch (error) {
    await migrationClient.query('ROLLBACK');
    throw error;
  } finally {
    migrationClient.release();
  }

  await pool.query(`DROP VIEW IF EXISTS ${q('normalization_status')}`);
  await pool.query(`CREATE VIEW ${q('normalization_status')} AS
    WITH legacy AS (
      SELECT state,
        jsonb_array_length(COALESCE(state->'employees','[]'::jsonb)) AS legacy_employees,
        jsonb_array_length(COALESCE(state->'payrollRuns','[]'::jsonb)) AS legacy_runs,
        COALESCE((SELECT sum(jsonb_array_length(COALESCE(run->'items','[]'::jsonb)))
          FROM jsonb_array_elements(COALESCE(state->'payrollRuns','[]'::jsonb)) AS runs(run)),0) AS legacy_items,
        jsonb_array_length(COALESCE(state->'attendance','[]'::jsonb)) AS legacy_attendance,
        jsonb_array_length(COALESCE(state->'leaves','[]'::jsonb)) AS legacy_leaves,
        jsonb_array_length(COALESCE(state->'loans','[]'::jsonb)) AS legacy_loans,
        jsonb_array_length(COALESCE(state->'penalties','[]'::jsonb)) AS legacy_penalties,
        jsonb_array_length(COALESCE(state->'temporaryEarnings','[]'::jsonb)) AS legacy_temporary_earnings,
        jsonb_array_length(COALESCE(state->'companies','[]'::jsonb)) AS legacy_companies,
        COALESCE((SELECT sum(jsonb_array_length(COALESCE(company->'departments','[]'::jsonb)))
          FROM jsonb_array_elements(COALESCE(state->'companies','[]'::jsonb)) AS companies(company)),0) AS legacy_departments,
        COALESCE((SELECT sum(jsonb_array_length(COALESCE(company->'costCenters','[]'::jsonb)))
          FROM jsonb_array_elements(COALESCE(state->'companies','[]'::jsonb)) AS companies(company)),0) AS legacy_cost_centers,
        COALESCE((SELECT sum(jsonb_array_length(COALESCE(company->'bankDefinitions','[]'::jsonb)))
          FROM jsonb_array_elements(COALESCE(state->'companies','[]'::jsonb)) AS companies(company)),0) AS legacy_bank_definitions,
        jsonb_array_length(COALESCE(state->'journals','[]'::jsonb)) AS legacy_journals,
        COALESCE((SELECT sum(jsonb_array_length(COALESCE(journal->'lines','[]'::jsonb)))
          FROM jsonb_array_elements(COALESCE(state->'journals','[]'::jsonb)) AS journals(journal)),0) AS legacy_journal_lines,
        jsonb_array_length(COALESCE(state->'auditLogs','[]'::jsonb)) AS legacy_audit_logs
      FROM ${q('app_state')} WHERE id=1
    )
    SELECT legacy_employees,(SELECT count(*) FROM ${q('employees')} WHERE is_archived=false) AS table_employees,
      legacy_runs,(SELECT count(*) FROM ${q('payroll_runs')}) AS table_runs,
      legacy_items,(SELECT count(*) FROM ${q('payroll_run_items')}) AS table_items,
      legacy_attendance,(SELECT count(*) FROM ${q('attendance_records')}) AS table_attendance,
      legacy_leaves,(SELECT count(*) FROM ${q('leave_requests')}) AS table_leaves,
      legacy_loans,(SELECT count(*) FROM ${q('loans')}) AS table_loans,
      legacy_penalties,(SELECT count(*) FROM ${q('penalties')}) AS table_penalties,
      legacy_temporary_earnings,(SELECT count(*) FROM ${q('temporary_earnings')}) AS table_temporary_earnings,
      legacy_companies,(SELECT count(*) FROM ${q('companies')} WHERE is_archived=false) AS table_companies,
      legacy_departments,(SELECT count(*) FROM ${q('company_departments')}) AS table_departments,
      legacy_cost_centers,(SELECT count(*) FROM ${q('cost_centers')}) AS table_cost_centers,
      legacy_bank_definitions,(SELECT count(*) FROM ${q('company_bank_definitions')}) AS table_bank_definitions,
      legacy_journals,(SELECT count(*) FROM ${q('journal_batches')}) AS table_journals,
      legacy_journal_lines,(SELECT count(*) FROM ${q('journal_lines')}) AS table_journal_lines,
      legacy_audit_logs,(SELECT count(*) FROM ${q('application_audit_logs')}) AS table_audit_logs,
      legacy_employees=(SELECT count(*) FROM ${q('employees')} WHERE is_archived=false)
        AND legacy_runs=(SELECT count(*) FROM ${q('payroll_runs')})
        AND legacy_items=(SELECT count(*) FROM ${q('payroll_run_items')})
        AND legacy_attendance=(SELECT count(*) FROM ${q('attendance_records')})
        AND legacy_leaves=(SELECT count(*) FROM ${q('leave_requests')})
        AND legacy_loans=(SELECT count(*) FROM ${q('loans')})
        AND legacy_penalties=(SELECT count(*) FROM ${q('penalties')})
        AND legacy_temporary_earnings=(SELECT count(*) FROM ${q('temporary_earnings')})
        AND legacy_companies=(SELECT count(*) FROM ${q('companies')} WHERE is_archived=false)
        AND legacy_departments=(SELECT count(*) FROM ${q('company_departments')})
        AND legacy_cost_centers=(SELECT count(*) FROM ${q('cost_centers')})
        AND legacy_bank_definitions=(SELECT count(*) FROM ${q('company_bank_definitions')})
        AND legacy_journals=(SELECT count(*) FROM ${q('journal_batches')})
        AND legacy_journal_lines=(SELECT count(*) FROM ${q('journal_lines')})
        AND legacy_audit_logs=(SELECT count(*) FROM ${q('application_audit_logs')}) AS counts_match
    FROM legacy`);
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'"] } } }));
app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    const expectedOrigin = process.env.APP_ORIGIN || `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}`;
    if (req.headers['sec-fetch-site'] === 'cross-site' || (origin && origin !== expectedOrigin)) {
      return res.status(403).json({ error: 'CROSS_SITE_REQUEST_BLOCKED' });
    }
  }
  next();
});

const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });
const registrationLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false });

const subscriptionState = (company) => {
  const now = Date.now();
  const status = String(company?.subscription_status || 'ACTIVE');
  const trialEndsAt = company?.trial_ends_at ? new Date(company.trial_ends_at) : null;
  const subscriptionEndsAt = company?.subscription_ends_at ? new Date(company.subscription_ends_at) : null;
  const expired = status === 'EXPIRED' || status === 'SUSPENDED'
    || (status === 'TRIAL' && trialEndsAt && trialEndsAt.getTime() <= now)
    || (status === 'ACTIVE' && subscriptionEndsAt && subscriptionEndsAt.getTime() <= now);
  return {
    status: expired ? 'EXPIRED' : status,
    trialEndsAt: trialEndsAt?.toISOString() || null,
    subscriptionEndsAt: subscriptionEndsAt?.toISOString() || null,
    expired,
  };
};


const HR_DAY_MS = 86400000;
const hrDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(String(value) + 'T00:00:00Z');
  return Number.isNaN(date.getTime()) ? null : date;
};
const hrDaysUntil = (value, now = new Date()) => {
  const due = hrDateOnly(value);
  if (!due) return null;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.ceil((due.getTime() - today.getTime()) / HR_DAY_MS);
};
const hrAddDays = (value, days) => {
  const date = hrDateOnly(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0,10);
};
const hrEscape = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
const hrRecipientHasPermission = (user) => {
  if (!user || user.role === 'ADMIN' || !user.is_active || !String(user.email || '').trim()) return false;
  if (Array.isArray(user.permissions)) return user.permissions.includes('RECEIVE_HR_EXPIRY_EMAILS');
  return user.role === 'COMPANY_MANAGER';
};
const buildHrLifecycleAlerts = (employees, now = new Date()) => {
  const alerts = [];
  for (const employee of Array.isArray(employees) ? employees : []) {
    if (!employee?.id || !employee?.companyId || employee.status === 'TERMINATED' || employee.status === 'ABSCONDED') continue;
    const common = { companyId:employee.companyId, employeeId:employee.id, employeeNo:employee.employeeNo || '', employeeName:(employee.firstNameAr + ' ' + employee.lastNameAr).trim() };
    if (employee.nationality === 'NON_SAUDI') {
      if (employee.iqamaExpiryDate) {
        const days = hrDaysUntil(employee.iqamaExpiryDate, now);
        if (days !== null && days <= 30) alerts.push({ ...common, type:'IQAMA_EXPIRY', dueDate:employee.iqamaExpiryDate, daysRemaining:days });
      } else if (employee.entryDate && employee.iqamaIssueStatus !== 'ISSUED') {
        const dueDate = hrAddDays(employee.entryDate, 90);
        const days = dueDate ? hrDaysUntil(dueDate, now) : null;
        if (dueDate && days !== null && days <= 30) alerts.push({ ...common, type:'NEW_HIRE_ENTRY_DEADLINE', dueDate, daysRemaining:days });
      }
    }
    if (employee.nationality === 'SAUDI' && employee.contractEndDate) {
      const days = hrDaysUntil(employee.contractEndDate, now);
      if (days !== null && days <= 60) alerts.push({ ...common, type:'SAUDI_CONTRACT_EXPIRY', dueDate:employee.contractEndDate, daysRemaining:days });
    }
    if (!String(employee.bankIban || '').replace(/\s/g,'') || employee.bankAccountStatus === 'PENDING') {
      alerts.push({ ...common, type:'MISSING_BANK_ACCOUNT', dueDate:null, daysRemaining:null });
    }
  }
  return alerts;
};
const hrAlertEventKey = (alert) => [alert.companyId, alert.type, alert.employeeId, alert.dueDate || 'NO-DATE'].join(':');
let hrAlertRunInProgress = false;
async function sendHrLifecycleDigest(to, company, alerts) {
  if (!resendApiKey || !verificationEmailFrom || !to.length || !alerts.length) return false;
  const label = (alert) => alert.type === 'IQAMA_EXPIRY' ? 'انتهاء الإقامة'
    : alert.type === 'SAUDI_CONTRACT_EXPIRY' ? 'انتهاء عقد موظف سعودي'
    : alert.type === 'NEW_HIRE_ENTRY_DEADLINE' ? 'مهلة القادم الجديد'
    : 'الحساب البنكي غير مكتمل';
  const rows = alerts.map(alert => '<tr>'
    + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">' + hrEscape(alert.employeeNo) + '</td>'
    + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">' + hrEscape(alert.employeeName) + '</td>'
    + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">' + hrEscape(label(alert)) + '</td>'
    + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">' + hrEscape(alert.dueDate || '-') + '</td>'
    + '<td style="padding:8px;border-bottom:1px solid #e5e7eb">' + hrEscape(alert.daysRemaining ?? '-') + '</td>'
    + '</tr>').join('');
  const response = await fetch('https://api.resend.com/emails', {
    method:'POST',
    headers:{ Authorization:'Bearer ' + resendApiKey, 'Content-Type':'application/json' },
    body:JSON.stringify({
      from:verificationEmailFrom,
      to,
      subject:'مسار - تنبيهات الموارد البشرية - ' + (company?.nameAr || company?.nameEn || company?.id || ''),
      html:'<div dir="rtl" style="font-family:Arial,sans-serif;max-width:760px;margin:auto;padding:24px">'
        + '<h2 style="margin:0 0 12px">تنبيهات الموارد البشرية</h2>'
        + '<p>هذه الرسالة أُرسلت للمستخدمين المصرح لهم باستقبال تنبيهات انتهاء الوثائق والقادمين الجدد.</p>'
        + '<table style="width:100%;border-collapse:collapse"><thead><tr><th>الرقم</th><th>الموظف</th><th>التنبيه</th><th>التاريخ</th><th>الأيام المتبقية</th></tr></thead><tbody>' + rows + '</tbody></table>'
        + '</div>'
    })
  });
  if (!response.ok) throw new Error('HR_ALERT_EMAIL_FAILED_' + response.status);
  return true;
}
async function runHrLifecycleAlerts() {
  if (hrAlertRunInProgress || !resendApiKey || !verificationEmailFrom) return;
  hrAlertRunInProgress = true;
  try {
    const [stateResult, usersResult] = await Promise.all([
      pool.query(`SELECT state FROM ${q('app_state')} WHERE id=1`),
      pool.query(`SELECT id,name,email,role,company_ids,permissions,is_active FROM ${q('users')} WHERE is_active=true AND email<>''`),
    ]);
    if (!stateResult.rowCount) return;
    const hydrated = await hydrateNormalizedStateData(pool, stateResult.rows[0].state);
    const alerts = buildHrLifecycleAlerts(hydrated?.employees || []);
    if (!alerts.length) return;
    const existing = await pool.query(`SELECT event_key FROM ${q('hr_lifecycle_alert_deliveries')} WHERE event_key = ANY($1::text[])`, [alerts.map(hrAlertEventKey)]);
    const alreadySent = new Set(existing.rows.map(row => row.event_key));
    const unsent = alerts.filter(alert => !alreadySent.has(hrAlertEventKey(alert)));
    if (!unsent.length) return;
    const companies = new Map((hydrated?.companies || []).map(company => [company.id, company]));
    const grouped = new Map();
    for (const alert of unsent) {
      if (!grouped.has(alert.companyId)) grouped.set(alert.companyId, []);
      grouped.get(alert.companyId).push(alert);
    }
    for (const [companyId, companyAlerts] of grouped) {
      const recipients = usersResult.rows
        .filter(user => hrRecipientHasPermission(user) && Array.isArray(user.company_ids) && user.company_ids.includes(companyId))
        .map(user => String(user.email).trim().toLowerCase());
      const uniqueRecipients = [...new Set(recipients)];
      if (!uniqueRecipients.length) continue;
      await sendHrLifecycleDigest(uniqueRecipients, companies.get(companyId), companyAlerts);
      for (const alert of companyAlerts) {
        await pool.query(`INSERT INTO ${q('hr_lifecycle_alert_deliveries')} (event_key,company_id,employee_id,alert_type,due_date,recipients)
          VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT (event_key) DO NOTHING`,
          [hrAlertEventKey(alert), alert.companyId, alert.employeeId, alert.type, alert.dueDate, JSON.stringify(uniqueRecipients)]);
      }
    }
  } catch (error) {
    console.error('HR lifecycle alert scheduler failed', error?.message || error);
  } finally {
    hrAlertRunInProgress = false;
  }
}

async function sendVerificationEmail(email, code, language = 'ar') {
  if (!resendApiKey || !verificationEmailFrom) throw Object.assign(new Error('EMAIL_SERVICE_NOT_CONFIGURED'), { status:503 });
  const isArabic = language !== 'en';
  const response = await fetch('https://api.resend.com/emails', {
    method:'POST',
    headers:{ Authorization:`Bearer ${resendApiKey}`, 'Content-Type':'application/json' },
    body:JSON.stringify({
      from:verificationEmailFrom,
      to:[email],
      subject:isArabic ? 'رمز التحقق لتجربة مسار' : 'Masar trial verification code',
      html:`<div dir="${isArabic ? 'rtl' : 'ltr'}" style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px">
        <h2>${isArabic ? 'تأكيد البريد الإلكتروني' : 'Verify your email'}</h2>
        <p>${isArabic ? 'استخدم الرمز التالي لإكمال إنشاء شركتك في مسار. الرمز صالح لمدة 15 دقيقة.' : 'Use this code to finish creating your Masar company. It expires in 15 minutes.'}</p>
        <div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#ecfdf5;padding:18px;text-align:center;border-radius:12px">${code}</div>
        <p style="color:#64748b;font-size:12px">${isArabic ? 'إذا لم تطلب التسجيل فتجاهل الرسالة.' : 'If you did not request this, ignore this email.'}</p>
      </div>`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('Resend verification email failed', response.status, detail.slice(0, 500));
    throw Object.assign(new Error('EMAIL_SEND_FAILED'), { status:502 });
  }
}

function newCompanyPayload({ id, companyCode, companyNameAr, companyNameEn, crNumber, taxNumber, phone, email, trialEndsAt }) {
  return {
    id, companyCode, nameAr:companyNameAr, nameEn:companyNameEn || companyNameAr,
    crNumber:crNumber || '', taxNumber:taxNumber || '', gosiEstablishmentNo:'',
    phone:phone || '', email, currency:'SAR', timezone:'Asia/Riyadh',
    fiscalYearStartMonth:1, payrollCutoffDay:25, payrollPaymentDay:27,
    workDaysPerMonth:30, dailyWorkHours:8, departments:[], costCenters:[], bankDefinitions:[],
    subscriptionStatus:'TRIAL', trialEndsAt,
    calculationRules:{
      dailyRateFormula:'BASE_PLUS_FIXED', hourlyRateDivisor:8, delayGracePeriodMinutes:15,
      delayCalculationMethod:'EXACT_MINUTES', absenceDayMultiplier:1, unpaidLeaveMultiplier:1,
      saudiGosiEmployeeRate:0.0975, saudiGosiEmployerRate:0.1175, saudiGosiMaxCap:45000,
      saudiGosiBaseComponents:['BASE','HOUSING'], nonSaudiGosiEmployerHazardRate:0.02,
      overtimeStandardRate:1.5, overtimeWeekendRate:2, roundingDecimals:2,
    },
    chartOfAccounts:{
      salariesExpenseAccount:'510101', housingAllowanceAccount:'510102', transportAllowanceAccount:'510103',
      overtimeExpenseAccount:'510104', otherAllowancesExpenseAccount:'510105', gosiEmployerExpenseAccount:'510106',
      salariesPayableAccount:'210101', gosiPayableAccount:'210201', employeeAdvancesAccount:'110501',
      penaltiesPayableAccount:'210501', bankAccount:'101001',
    },
  };
}

async function auth(req, res, next) {
  try {
    const token = cookieValue(req, 'masar_session');
    if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    const result = await pool.query(`SELECT u.id,u.username,u.name,u.email,u.phone,u.role,u.company_ids,u.permissions,u.is_active
      FROM ${q('sessions')} s JOIN ${q('users')} u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at > now() AND u.is_active=true`, [sha256(token)]);
    if (!result.rowCount) return res.status(401).json({ error: 'SESSION_EXPIRED' });
    await pool.query(`UPDATE ${q('sessions')} SET expires_at=now()+interval '1 hour' WHERE token_hash=$1`, [sha256(token)]);
    req.user = result.rows[0];
    if (req.user.role !== 'ADMIN') {
      const company = await pool.query(`SELECT subscription_status,trial_ends_at,subscription_ends_at
        FROM ${q('companies')} WHERE id=ANY($1::text[]) AND is_archived=false
        ORDER BY created_at LIMIT 1`, [req.user.company_ids]);
      const subscription = subscriptionState(company.rows[0]);
      req.subscription = subscription;
      const allowedWhileExpired = req.path === '/api/state' || req.path === '/api/auth/session'
        || req.path === '/api/auth/logout' || req.path === '/api/subscription/status';
      if (subscription.expired && !allowedWhileExpired) {
        return res.status(402).json({ error:'SUBSCRIPTION_EXPIRED', subscription, developerContactPhone });
      }
    }
    next();
  } catch (error) { next(error); }
}

app.get('/api/health', async (_req, res, next) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); } catch (e) { next(e); }
});

app.get('/api/public/config', (_req, res) => {
  res.json({
    registrationEnabled:publicRegistrationEnabled && Boolean(resendApiKey && verificationEmailFrom),
    trialDays,
    developerContactPhone,
  });
});

app.post('/api/auth/register/start', registrationLimiter, async (req, res, next) => {
  try {
    if (!publicRegistrationEnabled) return res.status(404).json({ error:'REGISTRATION_DISABLED' });
    const companyNameAr = String(req.body?.companyNameAr || '').trim();
    const companyNameEn = String(req.body?.companyNameEn || '').trim();
    const crNumber = String(req.body?.crNumber || '').trim();
    const taxNumber = String(req.body?.taxNumber || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const adminName = String(req.body?.adminName || '').trim();
    const username = String(req.body?.username || '').trim().toLowerCase();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const language = req.body?.language === 'en' ? 'en' : 'ar';
    if (companyNameAr.length < 2 || adminName.length < 2 || !/^[a-z0-9._-]{3,40}$/.test(username)
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !isStrongPassword(password)
      || phone.length < 7 || phone.length > 25) {
      return res.status(400).json({ error:'INVALID_REGISTRATION' });
    }
    const duplicate = await pool.query(`SELECT 1 FROM ${q('users')} WHERE lower(username)=$1 OR lower(email)=$2 LIMIT 1`, [username,email]);
    if (duplicate.rowCount) return res.status(409).json({ error:'ACCOUNT_ALREADY_EXISTS' });
    const requestId = crypto.randomUUID();
    const code = String(crypto.randomInt(100000, 1000000));
    const details = { companyNameAr,companyNameEn,crNumber,taxNumber,phone,adminName,username,email,passwordHash:await bcrypt.hash(password,12),language };
    await pool.query(`INSERT INTO ${q('registration_requests')} (id,email,code_hash,details,expires_at)
      VALUES ($1,$2,$3,$4::jsonb,now()+interval '15 minutes')
      ON CONFLICT (email) DO UPDATE SET id=EXCLUDED.id,code_hash=EXCLUDED.code_hash,details=EXCLUDED.details,
        expires_at=EXCLUDED.expires_at,attempts=0,updated_at=now()`,
      [requestId,email,sha256(`${requestId}:${code}`),JSON.stringify(details)]);
    try {
      await sendVerificationEmail(email,code,language);
    } catch (error) {
      await pool.query(`DELETE FROM ${q('registration_requests')} WHERE id=$1`, [requestId]);
      throw error;
    }
    res.status(202).json({ requestId, maskedEmail:email.replace(/^(.{1,2}).*(@.*)$/, '$1***$2'), expiresInSeconds:900 });
  } catch (e) { next(e); }
});

app.post('/api/auth/register/verify', registrationLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const requestId = String(req.body?.requestId || '');
    const code = String(req.body?.code || '').trim();
    if (!requestId || !/^\d{6}$/.test(code)) return res.status(400).json({ error:'INVALID_VERIFICATION_CODE' });
    await client.query('BEGIN');
    const request = await client.query(`SELECT * FROM ${q('registration_requests')} WHERE id=$1 FOR UPDATE`, [requestId]);
    const row = request.rows[0];
    if (!row || new Date(row.expires_at).getTime() <= Date.now() || row.attempts >= 5) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error:'VERIFICATION_EXPIRED' });
    }
    if (row.code_hash !== sha256(`${requestId}:${code}`)) {
      await client.query(`UPDATE ${q('registration_requests')} SET attempts=attempts+1,updated_at=now() WHERE id=$1`, [requestId]);
      await client.query('COMMIT');
      return res.status(400).json({ error:'INVALID_VERIFICATION_CODE' });
    }
    const d = row.details;
    const duplicate = await client.query(`SELECT 1 FROM ${q('users')} WHERE lower(username)=$1 OR lower(email)=$2 LIMIT 1`, [d.username,d.email]);
    if (duplicate.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error:'ACCOUNT_ALREADY_EXISTS' });
    }
    const companyId = `comp-${crypto.randomUUID()}`;
    let companyCode = '';
    for (let attempt=0; attempt<10 && !companyCode; attempt += 1) {
      const candidate = String(crypto.randomInt(100000,1000000));
      const exists = await client.query(`SELECT 1 FROM ${q('companies')} WHERE company_code=$1`, [candidate]);
      if (!exists.rowCount) companyCode = candidate;
    }
    if (!companyCode) throw new Error('COMPANY_CODE_GENERATION_FAILED');
    const trialEndsAt = new Date(Date.now()+trialDays*86_400_000).toISOString();
    const payload = newCompanyPayload({ id:companyId,companyCode,...d,trialEndsAt });
    await client.query(`INSERT INTO ${q('companies')}
      (id,company_code,name_ar,name_en,payload,subscription_status,trial_ends_at,is_archived)
      VALUES ($1,$2,$3,$4,$5::jsonb,'TRIAL',$6,false)`,
      [companyId,companyCode,d.companyNameAr,d.companyNameEn || d.companyNameAr,JSON.stringify(payload),trialEndsAt]);
    const userId = `user-${crypto.randomUUID()}`;
    await client.query(`INSERT INTO ${q('users')}
      (id,username,password_hash,name,email,phone,role,company_ids,permissions,is_active,email_verified_at)
      VALUES ($1,$2,$3,$4,$5,$6,'COMPANY_MANAGER',$7::jsonb,$8::jsonb,true,now())`,
      [userId,d.username,d.passwordHash,d.adminName,d.email,d.phone,JSON.stringify([companyId]),JSON.stringify(DEFAULT_PERMISSIONS.COMPANY_MANAGER)]);
    await client.query(`DELETE FROM ${q('registration_requests')} WHERE email=$1`, [d.email]);
    await client.query('COMMIT');
    res.status(201).json({ companyCode,username:d.username,trialEndsAt,trialDays });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    next(e);
  } finally { client.release(); }
});

app.post('/api/auth/password-reset/request', loginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const accepted = () => res.json({ ok:true, message:'PASSWORD_RESET_REQUEST_ACCEPTED' });
    if (!email || !email.includes('@')) return accepted();
    const r = await pool.query(`SELECT id,email,name FROM ${q('users')} WHERE lower(email)=lower($1) AND is_active=true LIMIT 1`, [email]);
    if (!r.rowCount) return accepted();
    const user = r.rows[0];
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = sha256(token);
    await pool.query(`DELETE FROM ${q('password_reset_tokens')} WHERE user_id=$1 OR expires_at <= now() OR used_at IS NOT NULL`, [user.id]);
    await pool.query(`INSERT INTO ${q('password_reset_tokens')} (id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,now()+interval '30 minutes')`, [`reset-${crypto.randomUUID()}`, user.id, tokenHash]);
    const origin = String(process.env.APP_ORIGIN || '').replace(/\/$/, '');
    const resetUrl = `${origin}/?reset_token=${encodeURIComponent(token)}`;
    if (resendApiKey && verificationEmailFrom && origin) {
      try {
        await fetch('https://api.resend.com/emails', {
          method:'POST',
          headers:{ Authorization:`Bearer ${resendApiKey}`, 'Content-Type':'application/json' },
          body:JSON.stringify({
            from:verificationEmailFrom,
            to:[user.email],
            subject:'Masar Payroll - Password reset',
            html:`<p>مرحبًا ${String(user.name || '').replace(/[<>&"']/g,'')}</p><p>تم طلب إعادة تعيين كلمة المرور لحسابك في مسار.</p><p><a href="${resetUrl}">إعادة تعيين كلمة المرور</a></p><p>الرابط صالح لمدة 30 دقيقة ولمرة واحدة فقط.</p>`,
          }),
        });
      } catch {}
    }
    return accepted();
  } catch (e) { next(e); }
});

app.post('/api/auth/password-reset/confirm', loginLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const token = String(req.body?.token || '');
    const password = String(req.body?.password || '');
    if (!token || !isStrongPassword(password)) return res.status(400).json({ error:'INVALID_PASSWORD_RESET' });
    await client.query('BEGIN');
    const r = await client.query(`SELECT id,user_id FROM ${q('password_reset_tokens')} WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`, [sha256(token)]);
    if (!r.rowCount) { await client.query('ROLLBACK'); return res.status(400).json({ error:'PASSWORD_RESET_TOKEN_INVALID_OR_EXPIRED' }); }
    const row = r.rows[0];
    const passwordHash = await bcrypt.hash(password, 12);
    await client.query(`UPDATE ${q('users')} SET password_hash=$1,updated_at=now() WHERE id=$2`, [passwordHash,row.user_id]);
    await client.query(`UPDATE ${q('password_reset_tokens')} SET used_at=now() WHERE id=$1`, [row.id]);
    await client.query(`DELETE FROM ${q('sessions')} WHERE user_id=$1`, [row.user_id]);
    await client.query('COMMIT');
    res.json({ ok:true });
  } catch (e) { try { await client.query('ROLLBACK'); } catch {} next(e); } finally { client.release(); }
});

app.post('/api/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const companyCode = String(req.body?.companyCode || '').trim();
    const password = String(req.body?.password || '');
    const result = await pool.query(`SELECT u.*, c.id company_id FROM ${q('users')} u
      JOIN ${q('companies')} c ON c.company_code=$2 AND c.is_archived=false WHERE lower(u.username)=$1`, [username, companyCode]);
    const user = result.rows[0];
    const valid = user && user.is_active && await bcrypt.compare(password, user.password_hash);
    const companyAllowed = valid && user.company_ids.includes(user.company_id);
    if (!companyAllowed) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    const token = crypto.randomBytes(32).toString('base64url');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM ${q('sessions')} WHERE expires_at <= now()`);
      await client.query(`INSERT INTO ${q('sessions')} (token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')`, [sha256(token), user.id]);
      await client.query(`UPDATE ${q('users')} SET last_login=now() WHERE id=$1`, [user.id]);
      await client.query(`INSERT INTO ${q('audit_log')} (user_id,action,ip) VALUES ($1,'LOGIN',$2)`, [user.id, req.ip]);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    res.setHeader('Set-Cookie', `masar_session=${token}; Path=/; HttpOnly; SameSite=Strict${process.env.COOKIE_SECURE === 'false' ? '' : '; Secure'}`);
    res.json({ user: { id:user.id, username:user.username, name:user.name, email:user.email, phone:user.phone, role:user.role, companyIds:user.company_ids, permissions:permissionsFor(user), isActive:true, createdAt:user.created_at, lastLogin:new Date().toISOString() }, companyId:user.company_id });
  } catch (e) { next(e); }
});

app.get('/api/auth/session', auth, async (req, res) => {
  const user = req.user;
  res.json({
    user: { id:user.id, username:user.username, name:user.name, email:user.email, phone:user.phone, role:user.role, companyIds:user.company_ids, permissions:permissionsFor(user), isActive:true },
  });
});

app.get('/api/admin/database/normalization-status', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error:'FORBIDDEN' });
    const [status, duplicateNumbers, totals] = await Promise.all([
      pool.query(`SELECT * FROM ${q('normalization_status')}`),
      pool.query(`SELECT company_id,employee_no,count(*)::integer AS duplicate_count
        FROM ${q('employees')} WHERE is_archived=false AND employee_no <> '' AND company_id=ANY($1::text[])
        GROUP BY company_id,employee_no HAVING count(*) > 1 ORDER BY duplicate_count DESC,company_id,employee_no LIMIT 100`,
        [req.user.company_ids]),
      pool.query(`SELECT
        COALESCE(sum(total_net_salaries),0)::text AS table_net_total
        FROM ${q('payroll_runs')} WHERE company_id=ANY($1::text[])`, [req.user.company_ids]),
    ]);
    res.json({
      status: { counts_match:Boolean(status.rows[0]?.counts_match) },
      payrollTotals: totals.rows[0] || null,
      duplicateEmployeeNumbers: duplicateNumbers.rows,
    });
  } catch (e) { next(e); }
});

app.put('/api/admin/companies/:id/subscription', auth, writeLimiter, async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error:'FORBIDDEN' });
    const status = String(req.body?.status || '');
    const endsAt = req.body?.endsAt ? new Date(req.body.endsAt) : null;
    if (!['TRIAL','ACTIVE','EXPIRED','SUSPENDED'].includes(status) || (endsAt && Number.isNaN(endsAt.getTime()))) {
      return res.status(400).json({ error:'INVALID_SUBSCRIPTION' });
    }
    const result = await pool.query(`UPDATE ${q('companies')} SET subscription_status=$2,
      trial_ends_at=CASE WHEN $2='TRIAL' THEN $3 ELSE trial_ends_at END,
      subscription_ends_at=CASE WHEN $2='ACTIVE' THEN $3 ELSE subscription_ends_at END,
      updated_at=now() WHERE id=$1 AND is_archived=false
      RETURNING id,subscription_status,trial_ends_at,subscription_ends_at`,
      [req.params.id,status,endsAt?.toISOString() || null]);
    if (!result.rowCount) return res.status(404).json({ error:'COMPANY_NOT_FOUND' });
    const current = await pool.query(`UPDATE ${q('app_state')} SET version=version+1,updated_by=$1,updated_at=now()
      WHERE id=1 RETURNING version,updated_at`, [req.user.id]);
    if (current.rowCount) broadcastStateUpdate({ version:current.rows[0].version,updatedBy:req.user.id,updatedAt:current.rows[0].updated_at });
    res.json(result.rows[0]);
  } catch (e) { next(e); }
});

// Broadcast version metadata only. Clients reload through the normal authenticated,
// company-filtered state endpoint so no cross-company data is exposed.
app.get('/api/state/events', auth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(`event: ready\ndata: ${JSON.stringify({ connected:true })}\n\n`);
  stateEventClients.add(res);
  const heartbeat = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch {} }, 25_000);
  req.on('close', () => { clearInterval(heartbeat); stateEventClients.delete(res); });
});

app.post('/api/auth/logout', auth, async (req, res, next) => {
  try {
    const token = cookieValue(req, 'masar_session');
    await pool.query(`DELETE FROM ${q('sessions')} WHERE token_hash=$1`, [sha256(token)]);
    res.setHeader('Set-Cookie', 'masar_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    res.status(204).end();
  } catch (e) { next(e); }
});

app.get('/api/state', auth, async (req, res, next) => {
  try {
    const [r, userResult] = await Promise.all([
      pool.query(`SELECT state,version,updated_at FROM ${q('app_state')} WHERE id=1`),
      pool.query(`SELECT id,username,name,email,phone,role,company_ids,permissions,is_active,created_at,last_login FROM ${q('users')} ORDER BY created_at`),
    ]);
    if (!r.rowCount) return res.json({ state:null, version:0 });
    const normalizedState = await hydrateNormalizedStateData(pool, r.rows[0].state);
    const state = publicStateForUser(normalizedState, req.user);
    const allowed = allowedCompanyIds(req.user);
    const visibleCompanyIds = new Set(Array.isArray(req.user.company_ids) ? req.user.company_ids : []);
    state.users = userResult.rows
      .filter(user => Array.isArray(user.company_ids) && user.company_ids.some(id => visibleCompanyIds.has(id)))
      .map(user => ({ id:user.id, username:user.username, name:user.name, email:user.email, phone:user.phone, role:user.role,
        companyIds:user.company_ids, permissions:permissionsFor(user), isActive:user.is_active, createdAt:user.created_at, lastLogin:user.last_login }));
    res.json({ ...r.rows[0], state });
  } catch (e) { next(e); }
});

app.put('/api/state', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    let state = clone(req.body?.state);
    const expectedVersion = Number(req.body?.version || 0);
    if (!state || typeof state !== 'object' || Array.isArray(state)) return res.status(400).json({ error:'INVALID_STATE' });
    delete state.currentUser;
    if (Array.isArray(state.users)) state.users = state.users.map(({ password, ...u }) => u);
    await client.query('BEGIN');
    const current = await client.query(`SELECT state,version FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
    const currentVersion = Number(current.rows[0]?.version || 0);
    if (currentVersion !== expectedVersion) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error:'STATE_CONFLICT_RELOAD_REQUIRED' });
    }
    const stored = current.rowCount
      ? await hydrateNormalizedStateData(client, current.rows[0].state)
      : {};
    // A redacted key from GET must not erase the existing server-side secret.
    if (stored.qoyodConfig?.apiKey && !state.qoyodConfig?.apiKey) {
      state.qoyodConfig = { ...(state.qoyodConfig || {}), apiKey: stored.qoyodConfig.apiKey };
    }
    delete state.qoyodConfig?.apiKeyConfigured;
    state = mergeStateForUser(stored, state, req.user);
    await appendPayrollFinancialAudit(client, q, { stored, next:state, user:req.user });
    const tenantCompanyIds = Array.isArray(req.user.company_ids) ? req.user.company_ids : [];
    const scopedState = scopeStateForCompanies(state, tenantCompanyIds);
    const tenantClient = createTenantScopedClient(client, q, tenantCompanyIds);
    await replaceNormalizedPayrollData(tenantClient, scopedState);
    await replaceNormalizedOperationsData(tenantClient, scopedState);
    await replaceNormalizedCoreData(tenantClient, scopedState);
    const compatibilityState = clone(state);
    if (compatibilityState.qoyodConfig && typeof compatibilityState.qoyodConfig === 'object') {
      compatibilityState.qoyodConfig = { ...compatibilityState.qoyodConfig, apiKey:'', apiKeyConfigured:Boolean(state.qoyodConfig?.apiKey) };
    }
    const r = current.rowCount
      ? await client.query(`UPDATE ${q('app_state')} SET state=$1::jsonb,version=version+1,updated_by=$2,updated_at=now()
          WHERE id=1 RETURNING version,updated_at`, [JSON.stringify(compatibilityState), req.user.id])
      : await client.query(`INSERT INTO ${q('app_state')} (id,state,version,updated_by) VALUES (1,$1::jsonb,1,$2)
          RETURNING version,updated_at`, [JSON.stringify(compatibilityState), req.user.id]);
    await client.query(`INSERT INTO ${q('app_state_migration_backups')} (source_version,state,reason)
      SELECT $1,$2::jsonb,'Normalized storage baseline'
      WHERE NOT EXISTS (SELECT 1 FROM ${q('app_state_migration_backups')})
      ON CONFLICT (source_version) DO NOTHING`,
      [r.rows[0].version, JSON.stringify(compatibilityState)]);
    await appendStateAudit(client, q, { companyIds:req.user.company_ids, user:req.user, action:'STATE_REPLACE', version:r.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:r.rows[0].version, updatedBy:req.user.id, updatedAt:r.rows[0].updated_at });
    res.json(r.rows[0]);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    if (e?.code === '23505') return res.status(409).json({ error:'NORMALIZED_DATA_DUPLICATE', detail:e.constraint });
    next(e);
  } finally { client.release(); }
});

async function updateCompatibilityCollectionRecord(client, key, record, userId) {
  const stateRow = await client.query(`SELECT state FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
  if (!stateRow.rowCount) throw workflowError(409, 'STATE_NOT_INITIALIZED');
  const state = clone(stateRow.rows[0].state || {});
  const records = asArray(state[key]);
  const index = records.findIndex(item => item?.id === record.id);
  if (index >= 0) records[index] = clone(record); else records.unshift(clone(record));
  state[key] = records;
  return client.query(`UPDATE ${q('app_state')} SET state=$1::jsonb,version=version+1,updated_by=$2,updated_at=now()
    WHERE id=1 RETURNING version,updated_at`, [JSON.stringify(state),userId]);
}

async function deleteCompatibilityCollectionRecord(client, key, id, userId) {
  const stateRow = await client.query(`SELECT state FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
  if (!stateRow.rowCount) throw workflowError(409, 'STATE_NOT_INITIALIZED');
  const state = clone(stateRow.rows[0].state || {});
  state[key] = asArray(state[key]).filter(item => item?.id !== id);
  return client.query(`UPDATE ${q('app_state')} SET state=$1::jsonb,version=version+1,updated_by=$2,updated_at=now()
    WHERE id=1 RETURNING version,updated_at`, [JSON.stringify(state),userId]);
}

const validPeriodMonth = value => typeof value === 'string' && /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(value);
const validIsoDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
};

function validateJournalRecord(record, user) {
  if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id
    || typeof record.companyId !== 'string' || !user.company_ids.includes(record.companyId)
    || typeof record.payrollRunId !== 'string' || !record.payrollRunId
    || !validPeriodMonth(record.periodMonth) || !validIsoDate(record.date)
    || typeof record.batchNumber !== 'string' || !record.batchNumber.trim()
    || typeof record.description !== 'string' || !record.description.trim()
    || !['DRAFT','EXPORTED_TO_QOYOD','POSTED'].includes(record.status)
    || (record.status === 'POSTED' && (!record.qoyodSyncStatus?.synced || !String(record.qoyodSyncStatus?.qoyodJournalId || '').trim()))
    || !Array.isArray(record.lines) || !record.lines.length
    || !Number.isFinite(Number(record.totalDebit)) || !Number.isFinite(Number(record.totalCredit))) {
    throw workflowError(400,'INVALID_JOURNAL_RECORD');
  }
  const lineIds = new Set();
  let debit = 0;
  let credit = 0;
  for (const line of record.lines) {
    const lineDebit = Number(line?.debit);
    const lineCredit = Number(line?.credit);
    if (!line || typeof line.id !== 'string' || !line.id || lineIds.has(line.id)
      || typeof line.accountCode !== 'string' || !line.accountCode.trim()
      || typeof line.accountNameAr !== 'string' || !line.accountNameAr.trim()
      || typeof line.descriptionAr !== 'string'
      || !Number.isFinite(lineDebit) || !Number.isFinite(lineCredit)
      || lineDebit < 0 || lineCredit < 0 || (lineDebit > 0 && lineCredit > 0) || (lineDebit === 0 && lineCredit === 0)) {
      throw workflowError(400,'INVALID_JOURNAL_LINE');
    }
    lineIds.add(line.id);
    debit += lineDebit;
    credit += lineCredit;
  }
  if (Math.abs(debit - credit) >= 0.01
    || Math.abs(debit - Number(record.totalDebit)) >= 0.01
    || Math.abs(credit - Number(record.totalCredit)) >= 0.01) {
    throw workflowError(400,'UNBALANCED_JOURNAL');
  }
}

async function upsertJournalAggregate(client, record) {
  const existing = await client.query(`SELECT company_id,status,payload,sort_order FROM ${q('journal_batches')} WHERE id=$1 FOR UPDATE`, [record.id]);
  if (existing.rowCount && existing.rows[0].company_id !== record.companyId) throw workflowError(409,'JOURNAL_COMPANY_IMMUTABLE');
  if (existing.rows[0]?.status === 'POSTED' && !sameJson(existing.rows[0].payload, { ...record,lines:undefined })) {
    throw workflowError(409,'POSTED_JOURNAL_IMMUTABLE');
  }
  const run = await client.query(`SELECT company_id,period_month FROM ${q('payroll_runs')} WHERE id=$1`, [record.payrollRunId]);
  if (!run.rowCount || run.rows[0].company_id !== record.companyId || run.rows[0].period_month !== record.periodMonth) {
    throw workflowError(400,'INVALID_JOURNAL_PAYROLL_RUN');
  }
  const sortOrder = existing.rowCount ? existing.rows[0].sort_order : Number((await client.query(
    `SELECT COALESCE(min(sort_order),0)-1 AS sort_order FROM ${q('journal_batches')} WHERE company_id=$1`, [record.companyId]
  )).rows[0]?.sort_order || 0);
  const payload = clone(record);
  delete payload.lines;
  await client.query(`INSERT INTO ${q('journal_batches')} (
      id,company_id,payroll_run_id,period_month,batch_number,journal_date,description,status,total_debit,total_credit,payload,sort_order,updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10,$11::jsonb,$12,now())
    ON CONFLICT (id) DO UPDATE SET payroll_run_id=EXCLUDED.payroll_run_id,period_month=EXCLUDED.period_month,
      batch_number=EXCLUDED.batch_number,journal_date=EXCLUDED.journal_date,description=EXCLUDED.description,status=EXCLUDED.status,
      total_debit=EXCLUDED.total_debit,total_credit=EXCLUDED.total_credit,payload=EXCLUDED.payload,updated_at=now()`, [
    record.id,record.companyId,record.payrollRunId,record.periodMonth,record.batchNumber,record.date,record.description,
    record.status,Number(record.totalDebit),Number(record.totalCredit),JSON.stringify(payload),sortOrder
  ]);
  await client.query(`DELETE FROM ${q('journal_lines')} WHERE journal_batch_id=$1`, [record.id]);
  await client.query(`INSERT INTO ${q('journal_lines')} (
      journal_batch_id,id,account_code,account_name_ar,description_ar,debit,credit,cost_center_code,payload,sort_order
    ) SELECT $1,line->>'id',line->>'accountCode',line->>'accountNameAr',COALESCE(line->>'descriptionAr',''),
      COALESCE(NULLIF(line->>'debit','')::numeric,0),COALESCE(NULLIF(line->>'credit','')::numeric,0),
      NULLIF(line->>'costCenterCode',''),line,(ordinality-1)::integer
      FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS source(line,ordinality)`, [record.id,JSON.stringify(record.lines)]);
  return existing.rowCount > 0;
}

app.put('/api/attendance/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_ATTENDANCE')) return res.status(403).json({ error:'FORBIDDEN' });
    const record = req.body || {};
    if (record.id !== req.params.id || typeof record.companyId !== 'string' || !req.user.company_ids.includes(record.companyId)
      || typeof record.employeeId !== 'string' || !validPeriodMonth(record.periodMonth) || !validIsoDate(record.date)
      || (record.endDate && !validIsoDate(record.endDate)) || (record.endDate && record.endDate < record.date)
      || !Number.isInteger(Number(record.daysCount ?? 1)) || Number(record.daysCount ?? 1) < 0
      || !Number.isInteger(Number(record.delayMinutes ?? 0)) || Number(record.delayMinutes ?? 0) < 0
      || !Number.isFinite(Number(record.overtimeHours ?? 0)) || Number(record.overtimeHours ?? 0) < 0
      || !['STANDARD','WEEKEND'].includes(record.overtimeType || 'STANDARD')) {
      return res.status(400).json({ error:'INVALID_ATTENDANCE_RECORD' });
    }
    await client.query('BEGIN');
    const stateRow = await client.query(`SELECT state FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
    if (!stateRow.rowCount) throw workflowError(409, 'STATE_NOT_INITIALIZED');
    const stored = await hydrateNormalizedStateData(client, stateRow.rows[0].state);
    const existingRecord = asArray(stored.attendance).find(item => item.id === record.id);
    if ((existingRecord && payrollSourceLocked(stored,'attendance',existingRecord)) || payrollSourceLocked(stored,'attendance',record)) {
      throw workflowError(409, 'PAYROLL_SOURCE_ENTRY_LOCKED');
    }
    const employee = await client.query(`SELECT company_id FROM ${q('employees')} WHERE id=$1 AND is_archived=false`, [record.employeeId]);
    if (!employee.rowCount || employee.rows[0].company_id !== record.companyId) throw workflowError(400, 'INVALID_ATTENDANCE_EMPLOYEE');
    const existing = await client.query(`SELECT company_id,sort_order FROM ${q('attendance_records')} WHERE id=$1 FOR UPDATE`, [record.id]);
    if (existing.rowCount && existing.rows[0].company_id !== record.companyId) throw workflowError(409, 'ATTENDANCE_COMPANY_IMMUTABLE');
    const sortOrder = existing.rowCount ? existing.rows[0].sort_order : Number((await client.query(`SELECT COALESCE(min(sort_order),0)-1 AS sort_order FROM ${q('attendance_records')} WHERE company_id=$1`, [record.companyId])).rows[0]?.sort_order || 0);
    await client.query(`INSERT INTO ${q('attendance_records')} (
      id,company_id,employee_id,period_month,record_date,end_date,days_count,delay_minutes,absence,unpaid_leave,overtime_hours,overtime_type,notes,payload,sort_order,updated_at
    ) VALUES ($1,$2,$3,$4,$5::date,NULLIF($6,'')::date,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,now())
    ON CONFLICT (id) DO UPDATE SET employee_id=EXCLUDED.employee_id,period_month=EXCLUDED.period_month,
      record_date=EXCLUDED.record_date,end_date=EXCLUDED.end_date,days_count=EXCLUDED.days_count,delay_minutes=EXCLUDED.delay_minutes,
      absence=EXCLUDED.absence,unpaid_leave=EXCLUDED.unpaid_leave,overtime_hours=EXCLUDED.overtime_hours,
      overtime_type=EXCLUDED.overtime_type,notes=EXCLUDED.notes,payload=EXCLUDED.payload,updated_at=now()`, [
      record.id,record.companyId,record.employeeId,record.periodMonth,record.date,record.endDate || '',Number(record.daysCount ?? 1),
      Number(record.delayMinutes || 0),Boolean(record.absence),Boolean(record.unpaidLeave),Number(record.overtimeHours || 0),
      record.overtimeType || 'STANDARD',record.notes || null,JSON.stringify(record),sortOrder
    ]);
    const updated = await updateCompatibilityCollectionRecord(client,'attendance',record,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:existing.rowCount ? 'UPDATE_ATTENDANCE' : 'CREATE_ATTENDANCE',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
    res.json({ record,created:!existing.rowCount,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

app.delete('/api/attendance/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_ATTENDANCE')) return res.status(403).json({ error:'FORBIDDEN' });
    await client.query('BEGIN');
    const row = await client.query(`SELECT company_id,payload FROM ${q('attendance_records')} WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!row.rowCount) throw workflowError(404, 'ATTENDANCE_NOT_FOUND');
    if (!req.user.company_ids.includes(row.rows[0].company_id)) throw workflowError(403, 'FORBIDDEN');
    const stateRow = await client.query(`SELECT state FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
    const stored = await hydrateNormalizedStateData(client,stateRow.rows[0]?.state || {});
    if (payrollSourceLocked(stored,'attendance',row.rows[0].payload)) throw workflowError(409, 'PAYROLL_SOURCE_ENTRY_LOCKED');
    await client.query(`DELETE FROM ${q('attendance_records')} WHERE id=$1`, [req.params.id]);
    const updated = await deleteCompatibilityCollectionRecord(client,'attendance',req.params.id,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:'DELETE_ATTENDANCE',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
    res.json({ deleted:true,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

app.put('/api/penalties/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_LOANS_PENALTIES')) return res.status(403).json({ error:'FORBIDDEN' });
    const record = req.body || {};
    if (record.id !== req.params.id || typeof record.companyId !== 'string' || !req.user.company_ids.includes(record.companyId)
      || typeof record.employeeId !== 'string' || !validPeriodMonth(record.periodMonth) || !validIsoDate(record.date)
      || typeof record.reason !== 'string' || !record.reason.trim() || !Number.isFinite(Number(record.amount)) || Number(record.amount) < 0) {
      return res.status(400).json({ error:'INVALID_PENALTY_RECORD' });
    }
    await client.query('BEGIN');
    const stateRow = await client.query(`SELECT state FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
    if (!stateRow.rowCount) throw workflowError(409, 'STATE_NOT_INITIALIZED');
    const stored = await hydrateNormalizedStateData(client,stateRow.rows[0].state);
    const existingRecord = asArray(stored.penalties).find(item => item.id === record.id);
    if ((existingRecord && payrollSourceLocked(stored,'penalty',existingRecord)) || payrollSourceLocked(stored,'penalty',record)) {
      throw workflowError(409, 'PAYROLL_SOURCE_ENTRY_LOCKED');
    }
    const employee = await client.query(`SELECT company_id FROM ${q('employees')} WHERE id=$1 AND is_archived=false`, [record.employeeId]);
    if (!employee.rowCount || employee.rows[0].company_id !== record.companyId) throw workflowError(400, 'INVALID_PENALTY_EMPLOYEE');
    const existing = await client.query(`SELECT company_id,sort_order FROM ${q('penalties')} WHERE id=$1 FOR UPDATE`, [record.id]);
    if (existing.rowCount && existing.rows[0].company_id !== record.companyId) throw workflowError(409, 'PENALTY_COMPANY_IMMUTABLE');
    const sortOrder = existing.rowCount ? existing.rows[0].sort_order : Number((await client.query(`SELECT COALESCE(min(sort_order),0)-1 AS sort_order FROM ${q('penalties')} WHERE company_id=$1`, [record.companyId])).rows[0]?.sort_order || 0);
    await client.query(`INSERT INTO ${q('penalties')} (id,company_id,employee_id,period_month,record_date,reason,amount,applied_in_payroll,payload,sort_order,updated_at)
      VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9::jsonb,$10,now())
      ON CONFLICT (id) DO UPDATE SET employee_id=EXCLUDED.employee_id,period_month=EXCLUDED.period_month,record_date=EXCLUDED.record_date,
        reason=EXCLUDED.reason,amount=EXCLUDED.amount,applied_in_payroll=EXCLUDED.applied_in_payroll,payload=EXCLUDED.payload,updated_at=now()`, [
      record.id,record.companyId,record.employeeId,record.periodMonth,record.date,record.reason.trim(),Number(record.amount),Boolean(record.appliedInPayroll),JSON.stringify(record),sortOrder
    ]);
    const updated = await updateCompatibilityCollectionRecord(client,'penalties',record,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:existing.rowCount ? 'UPDATE_PENALTY' : 'CREATE_PENALTY',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
    res.json({ record,created:!existing.rowCount,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

app.delete('/api/penalties/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_LOANS_PENALTIES')) return res.status(403).json({ error:'FORBIDDEN' });
    await client.query('BEGIN');
    const row = await client.query(`SELECT company_id,payload FROM ${q('penalties')} WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!row.rowCount) throw workflowError(404, 'PENALTY_NOT_FOUND');
    if (!req.user.company_ids.includes(row.rows[0].company_id)) throw workflowError(403, 'FORBIDDEN');
    const stateRow = await client.query(`SELECT state FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
    const stored = await hydrateNormalizedStateData(client,stateRow.rows[0]?.state || {});
    if (payrollSourceLocked(stored,'penalty',row.rows[0].payload)) throw workflowError(409, 'PAYROLL_SOURCE_ENTRY_LOCKED');
    await client.query(`DELETE FROM ${q('penalties')} WHERE id=$1`, [req.params.id]);
    const updated = await deleteCompatibilityCollectionRecord(client,'penalties',req.params.id,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:'DELETE_PENALTY',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
    res.json({ deleted:true,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

app.put('/api/loans/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_LOANS_PENALTIES')) return res.status(403).json({ error:'FORBIDDEN' });
    const record = req.body || {};
    const numericFields = ['totalAmount','monthlyInstallment','totalInstallments','remainingInstallments','remainingAmount'];
    if (record.id !== req.params.id || typeof record.companyId !== 'string' || !req.user.company_ids.includes(record.companyId)
      || typeof record.employeeId !== 'string' || !validPeriodMonth(record.startDate)
      || !['ACTIVE','COMPLETED','PAUSED'].includes(record.status)
      || numericFields.some(key => !Number.isFinite(Number(record[key])) || Number(record[key]) < 0)
      || !Number.isInteger(Number(record.totalInstallments)) || !Number.isInteger(Number(record.remainingInstallments))) {
      return res.status(400).json({ error:'INVALID_LOAN_RECORD' });
    }
    await client.query('BEGIN');
    const stateRow = await client.query(`SELECT state FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
    if (!stateRow.rowCount) throw workflowError(409, 'STATE_NOT_INITIALIZED');
    const stored = await hydrateNormalizedStateData(client,stateRow.rows[0].state);
    const existingRecord = asArray(stored.loans).find(item => item.id === record.id);
    const appendOnlyAdjustment = existingRecord ? isAppendOnlyLoanAdjustment(existingRecord,record,req.user) : false;
    if (existingRecord && payrollSourceLocked(stored,'loan',existingRecord) && !appendOnlyAdjustment) {
      throw workflowError(409, 'PAYROLL_SOURCE_ENTRY_LOCKED');
    }
    const employee = await client.query(`SELECT company_id FROM ${q('employees')} WHERE id=$1 AND is_archived=false`, [record.employeeId]);
    if (!employee.rowCount || employee.rows[0].company_id !== record.companyId) throw workflowError(400, 'INVALID_LOAN_EMPLOYEE');
    const existing = await client.query(`SELECT company_id,sort_order FROM ${q('loans')} WHERE id=$1 FOR UPDATE`, [record.id]);
    if (existing.rowCount && existing.rows[0].company_id !== record.companyId) throw workflowError(409, 'LOAN_COMPANY_IMMUTABLE');
    const sortOrder = existing.rowCount ? existing.rows[0].sort_order : Number((await client.query(`SELECT COALESCE(min(sort_order),0)-1 AS sort_order FROM ${q('loans')} WHERE company_id=$1`, [record.companyId])).rows[0]?.sort_order || 0);
    await client.query(`INSERT INTO ${q('loans')} (
      id,company_id,employee_id,total_amount,monthly_installment,total_installments,remaining_installments,remaining_amount,start_month,status,reason,payload,sort_order,updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,now())
    ON CONFLICT (id) DO UPDATE SET employee_id=EXCLUDED.employee_id,total_amount=EXCLUDED.total_amount,
      monthly_installment=EXCLUDED.monthly_installment,total_installments=EXCLUDED.total_installments,
      remaining_installments=EXCLUDED.remaining_installments,remaining_amount=EXCLUDED.remaining_amount,start_month=EXCLUDED.start_month,
      status=EXCLUDED.status,reason=EXCLUDED.reason,payload=EXCLUDED.payload,updated_at=now()`, [
      record.id,record.companyId,record.employeeId,Number(record.totalAmount),Number(record.monthlyInstallment),Number(record.totalInstallments),
      Number(record.remainingInstallments),Number(record.remainingAmount),record.startDate,record.status,String(record.reason || ''),JSON.stringify(record),sortOrder
    ]);
    const updated = await updateCompatibilityCollectionRecord(client,'loans',record,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:appendOnlyAdjustment ? 'ADJUST_LOAN' : existing.rowCount ? 'UPDATE_LOAN' : 'CREATE_LOAN',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
    res.json({ record,created:!existing.rowCount,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

app.delete('/api/loans/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_LOANS_PENALTIES')) return res.status(403).json({ error:'FORBIDDEN' });
    await client.query('BEGIN');
    const row = await client.query(`SELECT company_id,payload FROM ${q('loans')} WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!row.rowCount) throw workflowError(404, 'LOAN_NOT_FOUND');
    if (!req.user.company_ids.includes(row.rows[0].company_id)) throw workflowError(403, 'FORBIDDEN');
    const stateRow = await client.query(`SELECT state FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
    const stored = await hydrateNormalizedStateData(client,stateRow.rows[0]?.state || {});
    if (payrollSourceLocked(stored,'loan',row.rows[0].payload)) throw workflowError(409, 'PAYROLL_SOURCE_ENTRY_LOCKED');
    await client.query(`DELETE FROM ${q('loans')} WHERE id=$1`, [req.params.id]);
    const updated = await deleteCompatibilityCollectionRecord(client,'loans',req.params.id,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:'DELETE_LOAN',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
    res.json({ deleted:true,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

app.put('/api/temporary-earnings/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_LOANS_PENALTIES')) return res.status(403).json({ error:'FORBIDDEN' });
    const record = req.body || {};
    if (record.id !== req.params.id || typeof record.companyId !== 'string' || !req.user.company_ids.includes(record.companyId)
      || typeof record.employeeId !== 'string' || !validPeriodMonth(record.periodMonth) || !validIsoDate(record.date)
      || !['COMMISSION','BONUS','INCENTIVE','OTHER'].includes(record.type)
      || !Number.isFinite(Number(record.amount)) || Number(record.amount) < 0 || typeof record.reason !== 'string' || !record.reason.trim()) {
      return res.status(400).json({ error:'INVALID_TEMPORARY_EARNING_RECORD' });
    }
    await client.query('BEGIN');
    const stateRow = await client.query(`SELECT state FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
    if (!stateRow.rowCount) throw workflowError(409, 'STATE_NOT_INITIALIZED');
    const stored = await hydrateNormalizedStateData(client,stateRow.rows[0].state);
    const existingRecord = asArray(stored.temporaryEarnings).find(item => item.id === record.id);
    if ((existingRecord && payrollSourceLocked(stored,'earning',existingRecord)) || payrollSourceLocked(stored,'earning',record)) {
      throw workflowError(409, 'PAYROLL_SOURCE_ENTRY_LOCKED');
    }
    const employee = await client.query(`SELECT company_id FROM ${q('employees')} WHERE id=$1 AND is_archived=false`, [record.employeeId]);
    if (!employee.rowCount || employee.rows[0].company_id !== record.companyId) throw workflowError(400, 'INVALID_TEMPORARY_EARNING_EMPLOYEE');
    const existing = await client.query(`SELECT company_id,sort_order FROM ${q('temporary_earnings')} WHERE id=$1 FOR UPDATE`, [record.id]);
    if (existing.rowCount && existing.rows[0].company_id !== record.companyId) throw workflowError(409, 'TEMPORARY_EARNING_COMPANY_IMMUTABLE');
    const sortOrder = existing.rowCount ? existing.rows[0].sort_order : Number((await client.query(`SELECT COALESCE(min(sort_order),0)-1 AS sort_order FROM ${q('temporary_earnings')} WHERE company_id=$1`, [record.companyId])).rows[0]?.sort_order || 0);
    await client.query(`INSERT INTO ${q('temporary_earnings')} (
      id,company_id,employee_id,period_month,record_date,earning_type,amount,reason,applied_in_payroll,payload,sort_order,updated_at
    ) VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10::jsonb,$11,now())
    ON CONFLICT (id) DO UPDATE SET employee_id=EXCLUDED.employee_id,period_month=EXCLUDED.period_month,
      record_date=EXCLUDED.record_date,earning_type=EXCLUDED.earning_type,amount=EXCLUDED.amount,reason=EXCLUDED.reason,
      applied_in_payroll=EXCLUDED.applied_in_payroll,payload=EXCLUDED.payload,updated_at=now()`, [
      record.id,record.companyId,record.employeeId,record.periodMonth,record.date,record.type,Number(record.amount),record.reason.trim(),Boolean(record.appliedInPayroll),JSON.stringify(record),sortOrder
    ]);
    const updated = await updateCompatibilityCollectionRecord(client,'temporaryEarnings',record,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:existing.rowCount ? 'UPDATE_TEMPORARY_EARNING' : 'CREATE_TEMPORARY_EARNING',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
    res.json({ record,created:!existing.rowCount,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

app.delete('/api/temporary-earnings/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_LOANS_PENALTIES')) return res.status(403).json({ error:'FORBIDDEN' });
    await client.query('BEGIN');
    const row = await client.query(`SELECT company_id,payload FROM ${q('temporary_earnings')} WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!row.rowCount) throw workflowError(404, 'TEMPORARY_EARNING_NOT_FOUND');
    if (!req.user.company_ids.includes(row.rows[0].company_id)) throw workflowError(403, 'FORBIDDEN');
    const stateRow = await client.query(`SELECT state FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
    const stored = await hydrateNormalizedStateData(client,stateRow.rows[0]?.state || {});
    if (payrollSourceLocked(stored,'earning',row.rows[0].payload)) throw workflowError(409, 'PAYROLL_SOURCE_ENTRY_LOCKED');
    await client.query(`DELETE FROM ${q('temporary_earnings')} WHERE id=$1`, [req.params.id]);
    const updated = await deleteCompatibilityCollectionRecord(client,'temporaryEarnings',req.params.id,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:'DELETE_TEMPORARY_EARNING',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
    res.json({ deleted:true,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

async function commitPayrollCommandState(client, stored, record, user, action) {
  const nextRuns = asArray(stored.payrollRuns).map(item => item.id === record.id ? record : item);
  const nextState = { ...stored,payrollRuns:nextRuns };
  await appendPayrollFinancialAudit(client,q,{ stored,next:nextState,user });
  const updated = await updateCompatibilityCollectionRecord(client,'payrollRuns',record,user.id);
  await appendStateAudit(client,q,{ companyIds:user.company_ids,user,action,version:updated.rows[0].version });
  return updated;
}

app.post('/api/payroll-runs/:id/status', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stateRow = await client.query(`SELECT state FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
    if (!stateRow.rowCount) throw workflowError(409,'STATE_NOT_INITIALIZED');
    const stored = await hydrateNormalizedStateData(client,stateRow.rows[0].state);
    const previous = asArray(stored.payrollRuns).find(item => item.id === req.params.id);
    if (!previous) throw workflowError(404,'PAYROLL_RUN_NOT_FOUND');
    if (!req.user.company_ids.includes(previous.companyId)) throw workflowError(403,'FORBIDDEN');
    const status = String(req.body?.status || '');
    if (status === previous.status) throw workflowError(409,'PAYROLL_STATUS_UNCHANGED');
    const record = { ...previous,status };
    if (status === 'APPROVED' && previous.status === 'UNDER_REVIEW') {
      record.approvedAt = new Date().toISOString();
      record.approvedBy = req.user.name || req.user.username || req.user.id;
    } else if (status === 'UNDER_REVIEW' && previous.status === 'APPROVED') {
      delete record.approvedAt; delete record.approvedBy;
    } else if (status === 'POSTED' && previous.status === 'APPROVED') {
      record.postedAt = new Date().toISOString();
      record.postedBy = req.user.name || req.user.username || req.user.id;
    } else if (status === 'APPROVED' && previous.status === 'POSTED') {
      delete record.postedAt; delete record.postedBy;
    }
    const nextRuns = asArray(stored.payrollRuns).map(item => item.id === record.id ? record : item);
    validatePayrollWorkflowChanges(stored.payrollRuns,nextRuns,req.user);
    validatePayrollCarryForwardState(stored.payrollRuns,nextRuns);
    const payload = clone(record); delete payload.items; delete payload.paymentBatches;
    await client.query(`UPDATE ${q('payroll_runs')} SET status=$2,approved_at=NULLIF($3,'')::timestamptz,posted_at=NULLIF($4,'')::timestamptz,payload=$5::jsonb,updated_at=now() WHERE id=$1`, [record.id,record.status,record.approvedAt || '',record.postedAt || '',JSON.stringify(payload)]);
    const updated = await commitPayrollCommandState(client,stored,record,req.user,'PAYROLL_STATUS_TRANSITION');
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
    res.json({ record,created:false,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

app.post('/api/payroll-runs/:id/payment-batches', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stateRow = await client.query(`SELECT state FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
    if (!stateRow.rowCount) throw workflowError(409,'STATE_NOT_INITIALIZED');
    const stored = await hydrateNormalizedStateData(client,stateRow.rows[0].state);
    const previous = asArray(stored.payrollRuns).find(item => item.id === req.params.id);
    if (!previous) throw workflowError(404,'PAYROLL_RUN_NOT_FOUND');
    if (!req.user.company_ids.includes(previous.companyId)) throw workflowError(403,'FORBIDDEN');
    const batch = req.body || {};
    if (typeof batch.id !== 'string' || !batch.id || batch.payrollRunId !== previous.id || batch.companyId !== previous.companyId
      || batch.status !== 'SCHEDULED' || !['WPS','BANK_TRANSFER','CASH'].includes(batch.method)
      || !Array.isArray(batch.employeeIds) || !batch.employeeIds.length || !(Number(batch.totalAmount) > 0)
      || !validIsoDate(batch.scheduledDate)) throw workflowError(400,'INVALID_PAYMENT_BATCH');
    const record = { ...previous,paymentBatches:[...asArray(previous.paymentBatches),batch] };
    const nextRuns = asArray(stored.payrollRuns).map(item => item.id === record.id ? record : item);
    validatePayrollWorkflowChanges(stored.payrollRuns,nextRuns,req.user);
    validatePayrollCarryForwardState(stored.payrollRuns,nextRuns);
    const payload = clone(batch); delete payload.employeeIds;
    const sortOrder = Number((await client.query(`SELECT COALESCE(max(sort_order),-1)+1 AS sort_order FROM ${q('payroll_payment_batches')} WHERE payroll_run_id=$1`, [previous.id])).rows[0]?.sort_order || 0);
    await client.query(`INSERT INTO ${q('payroll_payment_batches')} (id,payroll_run_id,company_id,batch_number,status,method,total_amount,scheduled_date,payment_date,payload,sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,NULLIF($9,'')::date,$10::jsonb,$11)`, [batch.id,previous.id,batch.companyId,batch.batchNumber || '',batch.status,batch.method,Number(batch.totalAmount),batch.scheduledDate,batch.paymentDate || '',JSON.stringify(payload),sortOrder]);
    await client.query(`INSERT INTO ${q('payroll_payment_batch_items')} (payment_batch_id,employee_id,sort_order)
      SELECT $1,employee_id,(ordinality-1)::integer FROM jsonb_array_elements_text($2::jsonb) WITH ORDINALITY AS ids(employee_id,ordinality)`, [batch.id,JSON.stringify(batch.employeeIds)]);
    const updated = await commitPayrollCommandState(client,stored,record,req.user,'CREATE_PAYMENT_BATCH');
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
    res.json({ record,created:false,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    if (e?.code === '23505') return res.status(409).json({ error:'PAYMENT_BATCH_DUPLICATE',detail:e.constraint });
    next(e);
  } finally { client.release(); }
});

app.patch('/api/payroll-runs/:id/payment-batches/:batchId/status', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stateRow = await client.query(`SELECT state FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
    if (!stateRow.rowCount) throw workflowError(409,'STATE_NOT_INITIALIZED');
    const stored = await hydrateNormalizedStateData(client,stateRow.rows[0].state);
    const previous = asArray(stored.payrollRuns).find(item => item.id === req.params.id);
    if (!previous) throw workflowError(404,'PAYROLL_RUN_NOT_FOUND');
    if (!req.user.company_ids.includes(previous.companyId)) throw workflowError(403,'FORBIDDEN');
    const oldBatch = asArray(previous.paymentBatches).find(item => item.id === req.params.batchId);
    if (!oldBatch) throw workflowError(404,'PAYMENT_BATCH_NOT_FOUND');
    const status = String(req.body?.status || '');
    let nextBatch = { ...oldBatch,status };
    if (oldBatch.status === 'SCHEDULED' && status === 'PAID') {
      nextBatch.paymentDate = validIsoDate(req.body?.paymentDate) ? req.body.paymentDate : new Date().toISOString().slice(0,10);
    } else if (oldBatch.status === 'PAID' && status === 'SCHEDULED') {
      nextBatch = { ...nextBatch,reversedPaymentDate:oldBatch.paymentDate,paymentDate:undefined,paymentReversalReason:String(req.body?.paymentReversalReason || '').trim() };
    }
    const record = { ...previous,paymentBatches:asArray(previous.paymentBatches).map(item => item.id === nextBatch.id ? nextBatch : item) };
    const nextRuns = asArray(stored.payrollRuns).map(item => item.id === record.id ? record : item);
    validatePayrollWorkflowChanges(stored.payrollRuns,nextRuns,req.user);
    validatePayrollCarryForwardState(stored.payrollRuns,nextRuns);
    nextBatch = record.paymentBatches.find(item => item.id === nextBatch.id);
    const payload = clone(nextBatch); delete payload.employeeIds;
    await client.query(`UPDATE ${q('payroll_payment_batches')} SET status=$3,payment_date=NULLIF($4,'')::date,payload=$5::jsonb,updated_at=now() WHERE id=$1 AND payroll_run_id=$2`, [nextBatch.id,previous.id,nextBatch.status,nextBatch.paymentDate || '',JSON.stringify(payload)]);
    const updated = await commitPayrollCommandState(client,stored,record,req.user,'PAYMENT_BATCH_STATUS_TRANSITION');
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
    res.json({ record,created:false,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

app.put('/api/payroll-runs/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_PAYROLL')) return res.status(403).json({ error:'FORBIDDEN' });
    const record = req.body || {};
    if (record.id !== req.params.id || typeof record.companyId !== 'string' || !req.user.company_ids.includes(record.companyId)
      || !validPeriodMonth(record.periodMonth) || !['DRAFT','UNDER_REVIEW','APPROVED','POSTED'].includes(record.status)
      || !Array.isArray(record.items) || !Array.isArray(record.paymentBatches || [])) {
      return res.status(400).json({ error:'INVALID_PAYROLL_RUN' });
    }
    await client.query('BEGIN');
    const stateRow = await client.query(`SELECT state FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
    if (!stateRow.rowCount) throw workflowError(409, 'STATE_NOT_INITIALIZED');
    const stored = await hydrateNormalizedStateData(client,stateRow.rows[0].state);
    const existingRecord = asArray(stored.payrollRuns).find(item => item.id === record.id);
    if (existingRecord && existingRecord.companyId !== record.companyId) throw workflowError(409, 'PAYROLL_COMPANY_IMMUTABLE');
    if (existingRecord && (existingRecord.status !== record.status || !sameJson(existingRecord.paymentBatches,record.paymentBatches))) {
      throw workflowError(409,'PAYROLL_COMMAND_ENDPOINT_REQUIRED');
    }
    const nextRuns = existingRecord
      ? asArray(stored.payrollRuns).map(item => item.id === record.id ? record : item)
      : [record,...asArray(stored.payrollRuns)];
    validatePayrollWorkflowChanges(stored.payrollRuns,nextRuns,req.user);
    validatePayrollCarryForwardState(stored.payrollRuns,nextRuns);
    const nextState = { ...stored,payrollRuns:nextRuns };
    await appendPayrollFinancialAudit(client,q,{ stored,next:nextState,user:req.user });

    const existing = await client.query(`SELECT company_id,sort_order FROM ${q('payroll_runs')} WHERE id=$1 FOR UPDATE`, [record.id]);
    const sortOrder = existing.rowCount ? existing.rows[0].sort_order : Number((await client.query(`SELECT COALESCE(min(sort_order),0)-1 AS sort_order FROM ${q('payroll_runs')} WHERE company_id=$1`, [record.companyId])).rows[0]?.sort_order || 0);
    const runPayload = clone(record);
    delete runPayload.items;
    delete runPayload.paymentBatches;
    await client.query(`INSERT INTO ${q('payroll_runs')} (
      id,company_id,period_month,status,employees_count,total_gross_salaries,total_deductions,total_net_salaries,total_company_cost,
      created_at,calculated_at,approved_at,posted_at,payload,sort_order,updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULLIF($10,'')::timestamptz,NULLIF($11,'')::timestamptz,NULLIF($12,'')::timestamptz,NULLIF($13,'')::timestamptz,$14::jsonb,$15,now())
    ON CONFLICT (id) DO UPDATE SET period_month=EXCLUDED.period_month,status=EXCLUDED.status,employees_count=EXCLUDED.employees_count,
      total_gross_salaries=EXCLUDED.total_gross_salaries,total_deductions=EXCLUDED.total_deductions,total_net_salaries=EXCLUDED.total_net_salaries,
      total_company_cost=EXCLUDED.total_company_cost,calculated_at=EXCLUDED.calculated_at,approved_at=EXCLUDED.approved_at,
      posted_at=EXCLUDED.posted_at,payload=EXCLUDED.payload,updated_at=now()`, [
      record.id,record.companyId,record.periodMonth,record.status,Number(record.employeesCount || record.items.length),
      Number(record.totalGrossSalaries || 0),Number(record.totalDeductions || 0),Number(record.totalNetSalaries || 0),Number(record.totalCompanyCost || 0),
      record.createdAt || '',record.calculatedAt || '',record.approvedAt || '',record.postedAt || '',JSON.stringify(runPayload),sortOrder
    ]);

    await client.query(`DELETE FROM ${q('payroll_payment_batch_items')} WHERE payment_batch_id IN (SELECT id FROM ${q('payroll_payment_batches')} WHERE payroll_run_id=$1)`, [record.id]);
    await client.query(`DELETE FROM ${q('payroll_payment_batches')} WHERE payroll_run_id=$1`, [record.id]);
    await client.query(`DELETE FROM ${q('payroll_run_items')} WHERE payroll_run_id=$1`, [record.id]);
    await client.query(`INSERT INTO ${q('payroll_run_items')} (
      payroll_run_id,id,employee_id,employee_no,employee_name,entitlement_status,entitlement_reason,base_salary,total_gross_salary,total_deductions,net_salary,payload,sort_order
    ) SELECT $1,item->>'id',item->>'employeeId',COALESCE(item->>'employeeNo',''),COALESCE(item->>'employeeName',''),
      COALESCE(item->>'entitlementStatus','PAYABLE'),NULLIF(item->>'entitlementReason',''),COALESCE(NULLIF(item->>'baseSalary','')::numeric,0),
      COALESCE(NULLIF(item->>'totalGrossSalary','')::numeric,0),COALESCE(NULLIF(item->>'totalDeductions','')::numeric,0),
      COALESCE(NULLIF(item->>'netSalary','')::numeric,0),item,(ordinality-1)::integer
      FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS source(item,ordinality)`, [record.id,JSON.stringify(record.items)]);
    await client.query(`INSERT INTO ${q('payroll_payment_batches')} (
      id,payroll_run_id,company_id,batch_number,status,method,total_amount,scheduled_date,payment_date,payload,sort_order
    ) SELECT batch->>'id',$1,batch->>'companyId',COALESCE(batch->>'batchNumber',''),COALESCE(batch->>'status','SCHEDULED'),
      COALESCE(batch->>'method','BANK_TRANSFER'),COALESCE(NULLIF(batch->>'totalAmount','')::numeric,0),NULLIF(batch->>'scheduledDate','')::date,
      NULLIF(batch->>'paymentDate','')::date,batch-'employeeIds',(ordinality-1)::integer
      FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS source(batch,ordinality)`, [record.id,JSON.stringify(record.paymentBatches || [])]);
    await client.query(`INSERT INTO ${q('payroll_payment_batch_items')} (payment_batch_id,employee_id,sort_order)
      SELECT batch->>'id',employee_id,(employee_ordinality-1)::integer
      FROM jsonb_array_elements($1::jsonb) AS source(batch)
      CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(batch->'employeeIds','[]'::jsonb)) WITH ORDINALITY AS employee_ids(employee_id,employee_ordinality)`, [JSON.stringify(record.paymentBatches || [])]);

    const updated = await updateCompatibilityCollectionRecord(client,'payrollRuns',record,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:existing.rowCount ? 'UPDATE_PAYROLL_RUN' : 'CREATE_PAYROLL_RUN',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
    res.json({ record,created:!existing.rowCount,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    if (e?.code === '23505') return res.status(409).json({ error:'PAYROLL_RUN_DUPLICATE',detail:e.constraint });
    next(e);
  } finally { client.release(); }
});

app.put('/api/journals/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_JOURNALS')) return res.status(403).json({ error:'FORBIDDEN' });
    const record = req.body || {};
    if (record.id !== req.params.id) return res.status(400).json({ error:'INVALID_JOURNAL_RECORD' });
    validateJournalRecord(record,req.user);
    await client.query('BEGIN');
    const existed = await upsertJournalAggregate(client,record);
    const updated = await updateCompatibilityCollectionRecord(client,'journals',record,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:existed ? 'UPDATE_JOURNAL' : 'CREATE_JOURNAL',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
    res.json({ record,created:!existed,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    if (e?.code === '23505') return res.status(409).json({ error:'JOURNAL_DUPLICATE',detail:e.constraint });
    next(e);
  } finally { client.release(); }
});

app.delete('/api/journals/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_JOURNALS')) return res.status(403).json({ error:'FORBIDDEN' });
    await client.query('BEGIN');
    const row = await client.query(`SELECT company_id,status FROM ${q('journal_batches')} WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!row.rowCount) throw workflowError(404,'JOURNAL_NOT_FOUND');
    if (!req.user.company_ids.includes(row.rows[0].company_id)) throw workflowError(403,'FORBIDDEN');
    if (row.rows[0].status === 'POSTED') throw workflowError(409,'POSTED_JOURNAL_IMMUTABLE');
    await client.query(`DELETE FROM ${q('journal_batches')} WHERE id=$1`, [req.params.id]);
    const updated = await deleteCompatibilityCollectionRecord(client,'journals',req.params.id,req.user.id);
    await appendStateAudit(client,q,{ companyIds:req.user.company_ids,user:req.user,action:'DELETE_JOURNAL',version:updated.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
    res.json({ deleted:true,version:Number(updated.rows[0].version),updated_at:updated.rows[0].updated_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (Number.isInteger(e?.status) && e.status >= 400 && e.status < 500) return res.status(e.status).json({ error:e.message });
    next(e);
  } finally { client.release(); }
});

// Record-level mutations avoid overwriting unrelated work when several users save
// employees, attendance or payroll operations at the same time.
app.patch('/api/state/patch', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(`SELECT state,version FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
    if (!current.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error:'STATE_NOT_INITIALIZED' });
    }
    const stored = await hydrateNormalizedStateData(client, current.rows[0].state);
    const visible = publicStateForUser(stored, req.user);
    const patchedVisible = applyRecordPatch(visible, req.body?.patch);
    let state = mergeStateForUser(stored, patchedVisible, req.user);
    await appendPayrollFinancialAudit(client, q, { stored, next:state, user:req.user });
    if (stored.qoyodConfig?.apiKey && !state.qoyodConfig?.apiKey) {
      state.qoyodConfig = { ...(state.qoyodConfig || {}), apiKey:stored.qoyodConfig.apiKey };
    }
    const tenantCompanyIds = Array.isArray(req.user.company_ids) ? req.user.company_ids : [];
    const scopedState = scopeStateForCompanies(state, tenantCompanyIds);
    const tenantClient = createTenantScopedClient(client, q, tenantCompanyIds);
    await replaceNormalizedPayrollData(tenantClient, scopedState);
    await replaceNormalizedOperationsData(tenantClient, scopedState);
    await replaceNormalizedCoreData(tenantClient, scopedState);
    const compatibilityState = clone(state);
    if (compatibilityState.qoyodConfig && typeof compatibilityState.qoyodConfig === 'object') {
      compatibilityState.qoyodConfig = { ...compatibilityState.qoyodConfig, apiKey:'', apiKeyConfigured:Boolean(state.qoyodConfig?.apiKey) };
    }
    const result = await client.query(`UPDATE ${q('app_state')}
      SET state=$1::jsonb,version=version+1,updated_by=$2,updated_at=now()
      WHERE id=1 RETURNING version,updated_at`, [JSON.stringify(compatibilityState), req.user.id]);
    await appendStateAudit(client, q, { companyIds:req.user.company_ids, user:req.user, action:'STATE_PATCH', version:result.rows[0].version });
    await client.query('COMMIT');
    broadcastStateUpdate({ version:result.rows[0].version, updatedBy:req.user.id, updatedAt:result.rows[0].updated_at });
    res.json(result.rows[0]);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (e?.status === 400) return res.status(400).json({ error:e.message });
    if (e?.code === '23505') return res.status(409).json({ error:'NORMALIZED_DATA_DUPLICATE', detail:e.constraint });
    next(e);
  } finally { client.release(); }
});

app.put('/api/employees/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_EMPLOYEES')) return res.status(403).json({ error:'FORBIDDEN' });
    const employee = req.body || {};
    if (!employee || typeof employee !== 'object' || employee.id !== req.params.id
      || typeof employee.companyId !== 'string' || !req.user.company_ids.includes(employee.companyId)
      || typeof employee.employeeNo !== 'string' || !employee.employeeNo.trim()
      || typeof employee.firstNameAr !== 'string' || !employee.firstNameAr.trim()
      || typeof employee.lastNameAr !== 'string' || !employee.lastNameAr.trim()) {
      return res.status(400).json({ error:'INVALID_EMPLOYEE' });
    }
    const allowedStatuses = new Set(['ACTIVE','SUSPENDED','ON_LEAVE','TERMINATED','ABSCONDED','ONBOARDING']);
    if (!allowedStatuses.has(employee.status || 'ACTIVE')) return res.status(400).json({ error:'INVALID_EMPLOYEE_STATUS' });

    await client.query('BEGIN');
    const existing = await client.query(`SELECT id,company_id,sort_order FROM ${q('employees')} WHERE id=$1 FOR UPDATE`, [employee.id]);
    if (existing.rowCount && existing.rows[0].company_id !== employee.companyId) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error:'EMPLOYEE_COMPANY_IMMUTABLE' });
    }
    const orderResult = existing.rowCount
      ? { rows:[{ sort_order:existing.rows[0].sort_order }] }
      : await client.query(`SELECT COALESCE(max(sort_order),-1)+1 AS sort_order FROM ${q('employees')} WHERE company_id=$1`, [employee.companyId]);
    const sortOrder = Number(orderResult.rows[0]?.sort_order || 0);
    const salary = employee.salaryPackage || {};

    await client.query(`INSERT INTO ${q('employees')} (
      id,company_id,employee_no,national_id_or_iqama,status,first_name_ar,last_name_ar,first_name_en,last_name_en,
      department,job_title,hire_date,salary_start_date,termination_date,suspension_start_date,suspension_end_date,
      base_salary,housing_allowance,transport_allowance,other_fixed_allowances,bank_iban,payload,sort_order,is_archived,updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULLIF($12,'')::date,NULLIF($13,'')::date,NULLIF($14,'')::date,
      NULLIF($15,'')::date,NULLIF($16,'')::date,$17,$18,$19,$20,$21,$22::jsonb,$23,false,now()
    ) ON CONFLICT (id) DO UPDATE SET
      employee_no=EXCLUDED.employee_no,national_id_or_iqama=EXCLUDED.national_id_or_iqama,status=EXCLUDED.status,
      first_name_ar=EXCLUDED.first_name_ar,last_name_ar=EXCLUDED.last_name_ar,first_name_en=EXCLUDED.first_name_en,last_name_en=EXCLUDED.last_name_en,
      department=EXCLUDED.department,job_title=EXCLUDED.job_title,hire_date=EXCLUDED.hire_date,salary_start_date=EXCLUDED.salary_start_date,
      termination_date=EXCLUDED.termination_date,suspension_start_date=EXCLUDED.suspension_start_date,suspension_end_date=EXCLUDED.suspension_end_date,
      base_salary=EXCLUDED.base_salary,housing_allowance=EXCLUDED.housing_allowance,transport_allowance=EXCLUDED.transport_allowance,
      other_fixed_allowances=EXCLUDED.other_fixed_allowances,bank_iban=EXCLUDED.bank_iban,payload=EXCLUDED.payload,is_archived=false,updated_at=now()`, [
      employee.id, employee.companyId, employee.employeeNo.trim(), employee.nationalIdOrIqama || '', employee.status || 'ACTIVE',
      employee.firstNameAr.trim(), employee.lastNameAr.trim(), employee.firstNameEn || '', employee.lastNameEn || '',
      employee.department || '', employee.jobTitle || '', employee.hireDate || '', employee.salaryStartDate || '', employee.terminationDate || '',
      employee.suspensionStartDate || '', employee.suspensionEndDate || '', Number(salary.baseSalary || 0), Number(salary.housingAllowance || 0),
      Number(salary.transportAllowance || 0), Number(salary.otherFixedAllowances || 0), employee.bankIban || '', JSON.stringify(employee), sortOrder
    ]);

    const stateRow = await client.query(`SELECT state FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
    const compatibilityState = clone(stateRow.rows[0]?.state || {});
    const employees = asArray(compatibilityState.employees);
    const employeeIndex = employees.findIndex(item => item?.id === employee.id);
    if (employeeIndex >= 0) employees[employeeIndex] = clone(employee); else employees.push(clone(employee));
    compatibilityState.employees = employees;
    const updated = await client.query(`UPDATE ${q('app_state')} SET state=$1::jsonb,version=version+1,updated_by=$2,updated_at=now()
      WHERE id=1 RETURNING version,updated_at`, [JSON.stringify(compatibilityState),req.user.id]);

    const auditId = 'employee-save-' + crypto.randomUUID();
    const action = existing.rowCount ? 'UPDATE_EMPLOYEE' : 'CREATE_EMPLOYEE';
    await client.query(`INSERT INTO ${q('audit_log')} (user_id,action,ip) VALUES ($1,$2,$3)`, [req.user.id, action + ':' + employee.id, req.ip]);
    await client.query(`INSERT INTO ${q('application_audit_logs')}
      (id,company_id,user_id,user_name,user_role,action,entity_type,entity_id,occurred_at,details,payload,sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,'EMPLOYEE',$7,now(),$8,$9::jsonb,
        COALESCE((SELECT max(sort_order)+1 FROM ${q('application_audit_logs')}),0))`, [
      auditId, employee.companyId, req.user.id, req.user.name || req.user.username || '', req.user.role,
      existing.rowCount ? 'تعديل بيانات موظف' : 'إضافة موظف جديد', employee.id,
      `${employee.firstNameAr} ${employee.lastNameAr} (${employee.employeeNo})`, JSON.stringify({ id:auditId, companyId:employee.companyId, userId:req.user.id, userName:req.user.name || req.user.username || '', userRole:req.user.role, action:existing.rowCount ? 'تعديل بيانات موظف' : 'إضافة موظف جديد', entityType:'EMPLOYEE', entityId:employee.id, timestamp:new Date().toISOString(), details:`${employee.firstNameAr} ${employee.lastNameAr} (${employee.employeeNo})` })
    ]);

    await client.query('COMMIT');
    if (updated.rowCount) broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
    res.json({ employee, created:!existing.rowCount, version:Number(updated.rows[0]?.version || 0), updated_at:updated.rows[0]?.updated_at || new Date().toISOString() });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (e?.code === '23505') return res.status(409).json({ error:'EMPLOYEE_NUMBER_EXISTS' });
    next(e);
  } finally { client.release(); }
});

app.delete('/api/employees/:id', auth, writeLimiter, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!can(req.user,'MANAGE_EMPLOYEES')) return res.status(403).json({ error:'FORBIDDEN' });
    await client.query('BEGIN');
    const employee = await client.query(`SELECT id,company_id FROM ${q('employees')} WHERE id=$1 AND is_archived=false FOR UPDATE`, [req.params.id]);
    if (!employee.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error:'EMPLOYEE_NOT_FOUND' });
    }
    if (!req.user.company_ids.includes(employee.rows[0].company_id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error:'FORBIDDEN' });
    }
    const references = await client.query(`SELECT
      (SELECT count(*) FROM ${q('attendance_records')} WHERE employee_id=$1)
      +(SELECT count(*) FROM ${q('leave_requests')} WHERE employee_id=$1)
      +(SELECT count(*) FROM ${q('loans')} WHERE employee_id=$1)
      +(SELECT count(*) FROM ${q('penalties')} WHERE employee_id=$1)
      +(SELECT count(*) FROM ${q('temporary_earnings')} WHERE employee_id=$1)
      +(SELECT count(*) FROM ${q('payroll_run_items')} WHERE employee_id=$1) AS count`, [req.params.id]);
    const archived = Number(references.rows[0]?.count || 0) > 0;
    if (archived) {
      await client.query(`UPDATE ${q('employees')} SET is_archived=true,updated_at=now() WHERE id=$1`, [req.params.id]);
    } else {
      await client.query(`DELETE FROM ${q('employees')} WHERE id=$1`, [req.params.id]);
    }
    const stateRow = await client.query(`SELECT state FROM ${q('app_state')} WHERE id=1 FOR UPDATE`);
    const compatibilityState = clone(stateRow.rows[0]?.state || {});
    compatibilityState.employees = asArray(compatibilityState.employees).filter(item => item?.id !== req.params.id);
    const updated = await client.query(`UPDATE ${q('app_state')} SET state=$1::jsonb,version=version+1,updated_by=$2,updated_at=now()
      WHERE id=1 RETURNING version,updated_at`, [JSON.stringify(compatibilityState),req.user.id]);
    await client.query(`INSERT INTO ${q('audit_log')} (user_id,action,ip) VALUES ($1,$2,$3)`,
      [req.user.id,`${archived ? 'ARCHIVE' : 'DELETE'}_EMPLOYEE:${req.params.id}`,req.ip]);
    const deleteAuditId = 'employee-delete-' + crypto.randomUUID();
    await client.query(`INSERT INTO ${q('application_audit_logs')}
      (id,company_id,user_id,user_name,user_role,action,entity_type,entity_id,occurred_at,details,payload,sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,'EMPLOYEE',$7,now(),$8,$9::jsonb,
        COALESCE((SELECT max(sort_order)+1 FROM ${q('application_audit_logs')}),0))`, [
      deleteAuditId, employee.rows[0].company_id, req.user.id, req.user.name || req.user.username || '', req.user.role,
      archived ? 'أرشفة موظف' : 'حذف موظف', req.params.id,
      archived ? 'تمت أرشفة الموظف لوجود حركات مرتبطة' : 'تم حذف الموظف نهائيًا',
      JSON.stringify({ id:deleteAuditId, companyId:employee.rows[0].company_id, userId:req.user.id, userName:req.user.name || req.user.username || '', userRole:req.user.role, action:archived ? 'أرشفة موظف' : 'حذف موظف', entityType:'EMPLOYEE', entityId:req.params.id, timestamp:new Date().toISOString(), details:archived ? 'تمت أرشفة الموظف لوجود حركات مرتبطة' : 'تم حذف الموظف نهائيًا' })
    ]);
    await client.query('COMMIT');
    if (updated.rowCount) broadcastStateUpdate({ version:updated.rows[0].version,updatedBy:req.user.id,updatedAt:updated.rows[0].updated_at });
    res.json({ deleted:!archived,archived });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    next(e);
  } finally { client.release(); }
});

app.put('/api/users/:id', auth, writeLimiter, async (req, res, next) => {
  try {
    if (!can(req.user, 'MANAGE_USERS')) return res.status(403).json({ error:'FORBIDDEN' });
    if (req.params.id === 'user-admin') return res.status(403).json({ error:'SYSTEM_ADMIN_IMMUTABLE' });
    const u = req.body || {};
    if (!u.username || !u.name || !u.role || !Array.isArray(u.companyIds)) return res.status(400).json({ error:'INVALID_USER' });
    if (!ALLOWED_ROLES.has(u.role) || u.role === 'ADMIN') return res.status(400).json({ error:'INVALID_ROLE' });
    if (req.user.role === 'ADMIN' && u.companyIds.some(id => !req.user.company_ids.includes(id))) {
      return res.status(403).json({ error:'TENANT_DATA_IS_PRIVATE' });
    }
    const permissions = Array.isArray(u.permissions) ? [...new Set(u.permissions)].filter(value => ALL_PERMISSIONS.has(value) && value !== 'MANAGE_COMPANIES') : DEFAULT_PERMISSIONS[u.role];
    if (req.user.role !== 'ADMIN' && (u.role !== 'OPERATIONS_MANAGER' || u.companyIds.some(id => !req.user.company_ids.includes(id)))) {
      return res.status(403).json({ error:'FORBIDDEN' });
    }
    if (req.user.role !== 'ADMIN' && permissions.some(permission => !permissionsFor(req.user).includes(permission))) return res.status(403).json({ error:'CANNOT_GRANT_UNOWNED_PERMISSION' });
    const normalizedEmail = String(u.email || '').trim().toLowerCase();
    if (normalizedEmail) {
      const duplicateEmail = await pool.query(`SELECT id FROM ${q('users')} WHERE lower(email)=lower($1) AND id<>$2 LIMIT 1`, [normalizedEmail, req.params.id]);
      if (duplicateEmail.rowCount) return res.status(409).json({ error:'USER_EMAIL_EXISTS' });
    }
    const existing = await pool.query(`SELECT id,password_hash,company_ids,role FROM ${q('users')} WHERE id=$1`, [req.params.id]);
    if (existing.rowCount) {
      const existingCompanyIds = Array.isArray(existing.rows[0].company_ids) ? existing.rows[0].company_ids : [];
      const targetOutsideScope = existingCompanyIds.some(id => !req.user.company_ids.includes(id));
      if (targetOutsideScope || (req.user.role !== 'ADMIN' && existing.rows[0].role !== 'OPERATIONS_MANAGER')) {
        return res.status(403).json({ error:'FORBIDDEN' });
      }
    }
    if ((!existing.rowCount || u.password) && !isStrongPassword(u.password)) return res.status(400).json({ error:'PASSWORD_POLICY_FAILED' });
    const passwordHash = u.password ? await bcrypt.hash(u.password, 12) : existing.rows[0]?.password_hash;
    const r = await pool.query(`INSERT INTO ${q('users')} (id,username,password_hash,name,email,phone,role,company_ids,permissions,is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10)
      ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username,password_hash=EXCLUDED.password_hash,name=EXCLUDED.name,
      email=EXCLUDED.email,phone=EXCLUDED.phone,role=EXCLUDED.role,company_ids=EXCLUDED.company_ids,permissions=EXCLUDED.permissions,is_active=EXCLUDED.is_active,updated_at=now()
      RETURNING id,username,name,email,phone,role,company_ids,permissions,is_active,created_at,last_login`, [
      req.params.id, String(u.username).toLowerCase(), passwordHash, u.name, normalizedEmail, u.phone || '', u.role, JSON.stringify(u.companyIds), JSON.stringify(permissions), u.isActive !== false
    ]);
    const row = r.rows[0];
    res.json({ id:row.id,username:row.username,name:row.name,email:row.email,phone:row.phone,role:row.role,companyIds:row.company_ids,permissions:row.permissions,isActive:row.is_active,createdAt:row.created_at,lastLogin:row.last_login });
  } catch (e) {
    if (e?.code === '23505') {
      const constraint = String(e.constraint || '');
      return res.status(409).json({ error:constraint.includes('email') ? 'USER_EMAIL_EXISTS' : 'USERNAME_EXISTS' });
    }
    next(e);
  }
});

app.delete('/api/users/:id', auth, writeLimiter, async (req, res, next) => {
  try {
    if (!can(req.user, 'MANAGE_USERS')) return res.status(403).json({ error:'FORBIDDEN' });
    if (req.params.id === 'user-admin') return res.status(403).json({ error:'SYSTEM_ADMIN_IMMUTABLE' });
    if (req.user.id === req.params.id) return res.status(400).json({ error:'CANNOT_DELETE_SELF' });
    const params = [req.params.id,JSON.stringify(req.user.company_ids)];
    const scope = ` AND company_ids <@ $2::jsonb${req.user.role !== 'ADMIN' ? " AND role='OPERATIONS_MANAGER'" : ''}`;
    await pool.query(`DELETE FROM ${q('users')} WHERE id=$1${scope}`, params);
    res.status(204).end();
  } catch (e) { next(e); }
});

app.post('/api/integrations/qoyod/journal', auth, writeLimiter, async (req, res, next) => {
  try {
    if (!can(req.user, 'MANAGE_JOURNALS')) return res.status(403).json({ error:'FORBIDDEN' });
    const companyId = String(req.body?.companyId || '');
    if (!companyId || !req.user.company_ids.includes(companyId)) {
      return res.status(403).json({ error:'FORBIDDEN' });
    }
    const configResult = await pool.query(`SELECT public_config,secret_value FROM ${q('integration_configs')} WHERE company_id=$1 AND provider='QOYOD'`, [companyId]);
    const config = configResult.rows[0]?.public_config || {};
    const apiKey = String(configResult.rows[0]?.secret_value || '').trim();
    if (apiKey.length < 5) return res.status(400).json({ error:'QOYOD_NOT_CONFIGURED' });
    const baseUrl = new URL(String(config.baseUrl || 'https://api.qoyod.com/2.0'));
    if (baseUrl.protocol !== 'https:' || baseUrl.hostname !== 'api.qoyod.com') {
      return res.status(400).json({ error:'INVALID_QOYOD_URL' });
    }
    const payload = req.body?.payload;
    if (!payload?.journal_entry || !Array.isArray(payload.journal_entry.debit_amounts) || !Array.isArray(payload.journal_entry.credit_amounts)) {
      return res.status(400).json({ error:'INVALID_QOYOD_PAYLOAD' });
    }
    const response = await fetch(`${baseUrl.toString().replace(/\/+$/, '')}/journal_entries`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'API-KEY':apiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { message:text.slice(0, 500) }; }
    await pool.query(`INSERT INTO ${q('audit_log')} (user_id,action,ip) VALUES ($1,$2,$3)`, [
      req.user.id, response.ok ? `QOYOD_JOURNAL_SYNC:${companyId}` : `QOYOD_JOURNAL_FAILED:${companyId}:${response.status}`, req.ip,
    ]);
    if (!response.ok) return res.status(502).json({ error:'QOYOD_REQUEST_FAILED', upstreamStatus:response.status, message:data?.message || data?.error || 'Qoyod rejected the request' });
    res.json(data);
  } catch (e) { next(e); }
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
app.use(express.static(root, { index: false, maxAge: '1h', immutable: false }));
app.get('*', (_req, res) => res.sendFile(path.join(root, 'index.html')));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(Number(error?.status) || 500).json({ error:Number(error?.status) < 500 ? error.message : 'INTERNAL_ERROR' });
});

await migrate();
const hrAlertTimer = setInterval(() => { void runHrLifecycleAlerts(); }, 6 * 60 * 60 * 1000);
setTimeout(() => { void runHrLifecycleAlerts(); }, 60 * 1000);
const server = app.listen(port, '0.0.0.0', () => console.log(`Masar Payroll listening on ${port}`));
const shutdown = async () => { clearInterval(hrAlertTimer); server.close(); await pool.end(); process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
