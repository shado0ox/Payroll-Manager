import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;
const port = Number(process.env.PORT || 3000);
const schema = process.env.DB_SCHEMA || 'masar_payroll';
if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('DB_SCHEMA is invalid');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const ALLOWED_ROLES = new Set(['ADMIN', 'COMPANY_MANAGER', 'OPERATIONS_MANAGER']);
const ALL_PERMISSIONS = new Set(['VIEW_DASHBOARD','MANAGE_COMPANY_PROFILE','MANAGE_COMPANIES','MANAGE_EMPLOYEES','MANAGE_ATTENDANCE','MANAGE_LOANS_PENALTIES','MANAGE_PAYROLL','APPROVE_PAYROLL','POST_PAYROLL','MANAGE_JOURNALS','VIEW_REPORTS','MANAGE_USERS','VIEW_AUDIT_LOGS']);
const DEFAULT_PERMISSIONS = {
  COMPANY_MANAGER: [...ALL_PERMISSIONS].filter(value => value !== 'MANAGE_COMPANIES'),
  OPERATIONS_MANAGER: ['VIEW_DASHBOARD','MANAGE_EMPLOYEES','MANAGE_ATTENDANCE','MANAGE_LOANS_PENALTIES','MANAGE_PAYROLL','POST_PAYROLL','VIEW_REPORTS'],
};
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
const COMPANY_SCOPED_KEYS = ['employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns', 'journals'];
const OPERATIONS_MUTABLE_KEYS = new Set(['employees', 'attendance', 'loans', 'penalties', 'temporaryEarnings', 'leaves', 'payrollRuns']);
const clone = (value) => value == null ? value : structuredClone(value);
const allowedCompanyIds = (user) => new Set(user.role === 'ADMIN' ? [] : (Array.isArray(user.company_ids) ? user.company_ids : []));
const itemCompanyId = (item) => item && typeof item.companyId === 'string' ? item.companyId : '';
const permissionsFor = (user) => user.role === 'ADMIN' ? [...ALL_PERMISSIONS] : (Array.isArray(user.permissions) ? user.permissions : DEFAULT_PERMISSIONS[user.role] || []);
const can = (user, permission) => user.role === 'ADMIN' || permissionsFor(user).includes(permission);
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
  const allowed = allowedCompanyIds(user);
  if (user.role !== 'ADMIN') {
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
  // Integration secrets must never be returned to the browser.
  if (state.qoyodConfig && typeof state.qoyodConfig === 'object') {
    state.qoyodConfig = { ...state.qoyodConfig, apiKey: '', apiKeyConfigured: Boolean(state.qoyodConfig.apiKey) };
  }
  return state;
}

function mergeCompanyScoped(storedItems, incomingItems, allowed) {
  const preserved = (Array.isArray(storedItems) ? storedItems : []).filter(item => !allowed.has(itemCompanyId(item)));
  const accepted = (Array.isArray(incomingItems) ? incomingItems : []).filter(item => allowed.has(itemCompanyId(item)));
  return [...preserved, ...accepted];
}

function mergeStateForUser(stored, incoming, user) {
  if (user.role === 'ADMIN') return incoming;
  const next = clone(stored || {});
  const allowed = allowedCompanyIds(user);
  const keyPermissions = {
    employees:'MANAGE_EMPLOYEES', attendance:'MANAGE_ATTENDANCE', leaves:'MANAGE_ATTENDANCE',
    loans:'MANAGE_LOANS_PENALTIES', penalties:'MANAGE_LOANS_PENALTIES', temporaryEarnings:'MANAGE_LOANS_PENALTIES', payrollRuns:'MANAGE_PAYROLL', journals:'MANAGE_JOURNALS',
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
  next.qoyodConfig = stored?.qoyodConfig || {};
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

const asArray = (value) => Array.isArray(value) ? value : [];

async function replaceNormalizedPayrollData(client, state) {
  const companies = asArray(state?.companies);
  const employees = asArray(state?.employees);
  const payrollRuns = asArray(state?.payrollRuns);

  await client.query(`INSERT INTO ${q('companies')} (id,company_code,name_ar,name_en)
    SELECT company->>'id',company->>'companyCode',COALESCE(company->>'nameAr',''),COALESCE(company->>'nameEn','')
    FROM jsonb_array_elements($1::jsonb) AS source(company)
    ON CONFLICT (id) DO UPDATE SET company_code=EXCLUDED.company_code,name_ar=EXCLUDED.name_ar,name_en=EXCLUDED.name_en`,
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

async function hydrateNormalizedStateData(client, rawState) {
  const payrollState = await hydrateNormalizedPayrollData(client, rawState);
  return hydrateNormalizedOperationsData(client, payrollState);
}

async function migrate() {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('companies')} (
    id text PRIMARY KEY, company_code text NOT NULL UNIQUE, name_ar text NOT NULL, name_en text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('users')} (
    id text PRIMARY KEY, username text NOT NULL UNIQUE, password_hash text NOT NULL, name text NOT NULL,
    email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', role text NOT NULL,
    company_ids jsonb NOT NULL DEFAULT '[]', is_active boolean NOT NULL DEFAULT true,
    last_login timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`ALTER TABLE ${q('users')} ADD COLUMN IF NOT EXISTS permissions jsonb`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${q('sessions')} (
    token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES ${q('users')}(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  )`);
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
    CHECK (status IN ('ACTIVE','SUSPENDED','ON_LEAVE','TERMINATED','ABSCONDED'))
  )`);
  await pool.query(`ALTER TABLE ${q('employees')} ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false`);
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
  await pool.query(`CREATE INDEX IF NOT EXISTS leaves_employee_dates_idx ON ${q('leave_requests')}(employee_id,start_date,end_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS loans_employee_status_idx ON ${q('loans')}(employee_id,status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS penalties_employee_period_idx ON ${q('penalties')}(employee_id,period_month)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS earnings_employee_period_idx ON ${q('temporary_earnings')}(employee_id,period_month)`);
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
        jsonb_array_length(COALESCE(state->'temporaryEarnings','[]'::jsonb)) AS legacy_temporary_earnings
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
      legacy_employees=(SELECT count(*) FROM ${q('employees')} WHERE is_archived=false)
        AND legacy_runs=(SELECT count(*) FROM ${q('payroll_runs')})
        AND legacy_items=(SELECT count(*) FROM ${q('payroll_run_items')})
        AND legacy_attendance=(SELECT count(*) FROM ${q('attendance_records')})
        AND legacy_leaves=(SELECT count(*) FROM ${q('leave_requests')})
        AND legacy_loans=(SELECT count(*) FROM ${q('loans')})
        AND legacy_penalties=(SELECT count(*) FROM ${q('penalties')})
        AND legacy_temporary_earnings=(SELECT count(*) FROM ${q('temporary_earnings')}) AS counts_match
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
    next();
  } catch (error) { next(error); }
}

app.get('/api/health', async (_req, res, next) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); } catch (e) { next(e); }
});

app.post('/api/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const companyCode = String(req.body?.companyCode || '').trim();
    const password = String(req.body?.password || '');
    const result = await pool.query(`SELECT u.*, c.id company_id FROM ${q('users')} u
      JOIN ${q('companies')} c ON c.company_code=$2 WHERE lower(u.username)=$1`, [username, companyCode]);
    const user = result.rows[0];
    const valid = user && user.is_active && await bcrypt.compare(password, user.password_hash);
    const companyAllowed = valid && (user.role === 'ADMIN' || user.company_ids.includes(user.company_id));
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
        FROM ${q('employees')} WHERE is_archived=false AND employee_no <> '' GROUP BY company_id,employee_no HAVING count(*) > 1
        ORDER BY duplicate_count DESC,company_id,employee_no LIMIT 100`),
      pool.query(`SELECT
        COALESCE((SELECT sum(total_net_salaries) FROM ${q('payroll_runs')}),0)::text AS table_net_total,
        COALESCE((SELECT sum(COALESCE(NULLIF(run->>'totalNetSalaries','')::numeric,0))
          FROM ${q('app_state')} state_row
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(state_row.state->'payrollRuns','[]'::jsonb)) AS runs(run)
          WHERE state_row.id=1),0)::text AS legacy_net_total`),
    ]);
    res.json({
      status: status.rows[0] || null,
      payrollTotals: totals.rows[0] || null,
      duplicateEmployeeNumbers: duplicateNumbers.rows,
    });
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
    state.users = userResult.rows
      .filter(user => req.user.role === 'ADMIN' || (Array.isArray(user.company_ids) && user.company_ids.some(id => allowed.has(id))))
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
    await replaceNormalizedPayrollData(client, state);
    await replaceNormalizedOperationsData(client, state);
    const r = current.rowCount
      ? await client.query(`UPDATE ${q('app_state')} SET state=$1::jsonb,version=version+1,updated_by=$2,updated_at=now()
          WHERE id=1 RETURNING version,updated_at`, [JSON.stringify(state), req.user.id])
      : await client.query(`INSERT INTO ${q('app_state')} (id,state,version,updated_by) VALUES (1,$1::jsonb,1,$2)
          RETURNING version,updated_at`, [JSON.stringify(state), req.user.id]);
    await client.query(`INSERT INTO ${q('app_state_migration_backups')} (source_version,state,reason)
      SELECT $1,$2::jsonb,'Normalized storage baseline'
      WHERE NOT EXISTS (SELECT 1 FROM ${q('app_state_migration_backups')})
      ON CONFLICT (source_version) DO NOTHING`,
      [r.rows[0].version, JSON.stringify(state)]);
    await client.query('COMMIT');
    broadcastStateUpdate({ version:r.rows[0].version, updatedBy:req.user.id, updatedAt:r.rows[0].updated_at });
    res.json(r.rows[0]);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    if (e?.code === '23505') return res.status(409).json({ error:'NORMALIZED_DATA_DUPLICATE', detail:e.constraint });
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
    const permissions = Array.isArray(u.permissions) ? [...new Set(u.permissions)].filter(value => ALL_PERMISSIONS.has(value) && value !== 'MANAGE_COMPANIES') : DEFAULT_PERMISSIONS[u.role];
    if (req.user.role !== 'ADMIN' && (u.role !== 'OPERATIONS_MANAGER' || u.companyIds.some(id => !req.user.company_ids.includes(id)))) {
      return res.status(403).json({ error:'FORBIDDEN' });
    }
    if (req.user.role !== 'ADMIN' && permissions.some(permission => !permissionsFor(req.user).includes(permission))) return res.status(403).json({ error:'CANNOT_GRANT_UNOWNED_PERMISSION' });
    const existing = await pool.query(`SELECT id,password_hash FROM ${q('users')} WHERE id=$1`, [req.params.id]);
    if ((!existing.rowCount || u.password) && !isStrongPassword(u.password)) return res.status(400).json({ error:'PASSWORD_POLICY_FAILED' });
    const passwordHash = u.password ? await bcrypt.hash(u.password, 12) : existing.rows[0]?.password_hash;
    const r = await pool.query(`INSERT INTO ${q('users')} (id,username,password_hash,name,email,phone,role,company_ids,permissions,is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10)
      ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username,password_hash=EXCLUDED.password_hash,name=EXCLUDED.name,
      email=EXCLUDED.email,phone=EXCLUDED.phone,role=EXCLUDED.role,company_ids=EXCLUDED.company_ids,permissions=EXCLUDED.permissions,is_active=EXCLUDED.is_active,updated_at=now()
      RETURNING id,username,name,email,phone,role,company_ids,permissions,is_active,created_at,last_login`, [
      req.params.id, String(u.username).toLowerCase(), passwordHash, u.name, u.email || '', u.phone || '', u.role, JSON.stringify(u.companyIds), JSON.stringify(permissions), u.isActive !== false
    ]);
    const row = r.rows[0];
    res.json({ id:row.id,username:row.username,name:row.name,email:row.email,phone:row.phone,role:row.role,companyIds:row.company_ids,permissions:row.permissions,isActive:row.is_active,createdAt:row.created_at,lastLogin:row.last_login });
  } catch (e) { if (e?.code === '23505') return res.status(409).json({ error:'USERNAME_EXISTS' }); next(e); }
});

app.delete('/api/users/:id', auth, writeLimiter, async (req, res, next) => {
  try {
    if (!can(req.user, 'MANAGE_USERS')) return res.status(403).json({ error:'FORBIDDEN' });
    if (req.params.id === 'user-admin') return res.status(403).json({ error:'SYSTEM_ADMIN_IMMUTABLE' });
    if (req.user.id === req.params.id) return res.status(400).json({ error:'CANNOT_DELETE_SELF' });
    const params = [req.params.id];
    const scope = req.user.role !== 'ADMIN' ? ` AND role='OPERATIONS_MANAGER' AND company_ids <@ $2::jsonb` : '';
    if (req.user.role !== 'ADMIN') params.push(JSON.stringify(req.user.company_ids));
    await pool.query(`DELETE FROM ${q('users')} WHERE id=$1${scope}`, params);
    res.status(204).end();
  } catch (e) { next(e); }
});

app.post('/api/integrations/qoyod/journal', auth, writeLimiter, async (req, res, next) => {
  try {
    if (!can(req.user, 'MANAGE_JOURNALS')) return res.status(403).json({ error:'FORBIDDEN' });
    const companyId = String(req.body?.companyId || '');
    if (!companyId || (req.user.role !== 'ADMIN' && !req.user.company_ids.includes(companyId))) {
      return res.status(403).json({ error:'FORBIDDEN' });
    }
    const stateResult = await pool.query(`SELECT state FROM ${q('app_state')} WHERE id=1`);
    const config = stateResult.rows[0]?.state?.qoyodConfig || {};
    const apiKey = String(config.apiKey || '').trim();
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
app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: 'INTERNAL_ERROR' }); });

await migrate();
const server = app.listen(port, '0.0.0.0', () => console.log(`Masar Payroll listening on ${port}`));
const shutdown = async () => { server.close(); await pool.end(); process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
