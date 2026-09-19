export async function initializeDatabaseSchema({ pool,q,schema,bcrypt }) {
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
await pool.query(`ALTER TABLE ${q('companies')} ADD COLUMN IF NOT EXISTS subscription_suspended_at timestamptz`);
await pool.query(`ALTER TABLE ${q('companies')} ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamptz`);
await pool.query(`DO $$ BEGIN
  ALTER TABLE ${q('companies')} ADD CONSTRAINT companies_subscription_status_check
    CHECK (subscription_status IN ('TRIAL','ACTIVE','EXPIRED','SUSPENDED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
await pool.query(`CREATE INDEX IF NOT EXISTS companies_subscription_lifecycle_idx
  ON ${q('companies')}(subscription_status,deletion_scheduled_at) WHERE is_archived=false`);
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
await pool.query(`CREATE TABLE IF NOT EXISTS ${q('auth_email_codes')} (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES ${q('users')}(id) ON DELETE CASCADE,
  company_id text REFERENCES ${q('companies')}(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('PASSWORD_RESET','EMAIL_LOGIN')),
  code_hash text NOT NULL, attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
  expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
)`);
await pool.query(`CREATE INDEX IF NOT EXISTS auth_email_codes_user_purpose_idx
  ON ${q('auth_email_codes')}(user_id,purpose,expires_at DESC)`);
await pool.query(`DELETE FROM ${q('auth_email_codes')} WHERE expires_at < now()-interval '1 day' OR used_at < now()-interval '1 day'`);
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
await pool.query(`CREATE TABLE IF NOT EXISTS ${q('subscription_notice_deliveries')} (
  event_key text PRIMARY KEY, company_id text NOT NULL, notice_number integer NOT NULL CHECK (notice_number >= 0),
  recipients jsonb NOT NULL DEFAULT '[]', sent_at timestamptz NOT NULL DEFAULT now()
)`);
await pool.query(`CREATE INDEX IF NOT EXISTS subscription_notice_deliveries_company_idx
  ON ${q('subscription_notice_deliveries')}(company_id,sent_at DESC)`);

await pool.query(`CREATE TABLE IF NOT EXISTS ${q('app_state')} (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1), state jsonb NOT NULL DEFAULT '{}',
  version bigint NOT NULL DEFAULT 1, updated_by text, updated_at timestamptz NOT NULL DEFAULT now()
)`);
await pool.query(`CREATE TABLE IF NOT EXISTS ${q('app_state_migration_backups')} (
  id bigserial PRIMARY KEY, source_version bigint NOT NULL UNIQUE, state jsonb NOT NULL,
  reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
)`);
await pool.query(`CREATE TABLE IF NOT EXISTS ${q('app_state_restore_snapshots')} (
  id bigserial PRIMARY KEY, source_version bigint NOT NULL, state jsonb NOT NULL,
  created_by text, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
)`);
await pool.query(`CREATE INDEX IF NOT EXISTS app_state_restore_snapshots_created_idx
  ON ${q('app_state_restore_snapshots')}(created_at DESC)`);
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
await pool.query(`CREATE TABLE IF NOT EXISTS ${q('payroll_settlements')} (
  id text PRIMARY KEY, company_id text NOT NULL REFERENCES ${q('companies')}(id) ON DELETE RESTRICT,
  employee_id text NOT NULL REFERENCES ${q('employees')}(id) ON DELETE RESTRICT,
  period_month text NOT NULL, period_start date NOT NULL, period_end date NOT NULL, amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL, source_payroll_run_id text, source_payroll_item_id text, dedupe_key text NOT NULL,
  status text NOT NULL, payment_method text, payment_date date, payment_reference text, created_at timestamptz NOT NULL,
  paid_at timestamptz, reversed_at timestamptz, reversal_reason text, payload jsonb NOT NULL,
  sort_order integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'), CHECK (period_end >= period_start),
  CHECK (reason IN ('HELD_PAYROLL','RETROACTIVE_EMPLOYEE','PAYROLL_DIFFERENCE')),
  CHECK (status IN ('PENDING','PAID','REVERSED')),
  CHECK (payment_method IS NULL OR payment_method IN ('WPS','BANK_TRANSFER','CASH'))
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
  CHECK (period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'), CHECK (status IN ('DRAFT','UNDER_REVIEW','APPROVED','EXPORTED_TO_QOYOD','POSTED')),
  CHECK (abs(total_debit-total_credit) < 0.01)
)`);
await pool.query(`ALTER TABLE ${q('journal_batches')} DROP CONSTRAINT IF EXISTS journal_batches_status_check`);
await pool.query(`ALTER TABLE ${q('journal_batches')} ADD CONSTRAINT journal_batches_status_check
  CHECK (status IN ('DRAFT','UNDER_REVIEW','APPROVED','EXPORTED_TO_QOYOD','POSTED'))`);
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
await pool.query(`CREATE TABLE IF NOT EXISTS ${q('gosi_accounts')} (
  id text PRIMARY KEY, company_id text NOT NULL REFERENCES ${q('companies')}(id) ON DELETE RESTRICT,
  registration_number text NOT NULL, name text NOT NULL, branch_name text NOT NULL DEFAULT '',
  branch_code text NOT NULL DEFAULT '', gosi_establishment_number text NOT NULL DEFAULT '',
  gosi_employer_expense_account text NOT NULL DEFAULT '', gosi_payable_account text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT false, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,registration_number)
)`);
await pool.query(`ALTER TABLE ${q('gosi_accounts')} ADD COLUMN IF NOT EXISTS branch_code text NOT NULL DEFAULT ''`);
await pool.query(`ALTER TABLE ${q('gosi_accounts')} ADD COLUMN IF NOT EXISTS gosi_establishment_number text NOT NULL DEFAULT ''`);
await pool.query(`ALTER TABLE ${q('gosi_accounts')} ADD COLUMN IF NOT EXISTS gosi_employer_expense_account text NOT NULL DEFAULT ''`);
await pool.query(`ALTER TABLE ${q('gosi_accounts')} ADD COLUMN IF NOT EXISTS gosi_payable_account text NOT NULL DEFAULT ''`);
await pool.query(`UPDATE ${q('gosi_accounts')} SET branch_code=registration_number WHERE branch_code=''`);
await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS gosi_accounts_branch_code_active_idx ON ${q('gosi_accounts')}(company_id,branch_code) WHERE is_active=true`);
await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS gosi_accounts_one_default_idx ON ${q('gosi_accounts')}(company_id) WHERE is_default=true AND is_active=true`);
await pool.query(`CREATE TABLE IF NOT EXISTS ${q('gosi_employee_assignments')} (
  id text PRIMARY KEY, employee_id text NOT NULL REFERENCES ${q('employees')}(id) ON DELETE CASCADE,
  account_id text NOT NULL REFERENCES ${q('gosi_accounts')}(id) ON DELETE RESTRICT,
  effective_from date NOT NULL, effective_to date, created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(effective_to IS NULL OR effective_to>=effective_from)
)`);
await pool.query(`CREATE INDEX IF NOT EXISTS gosi_assignments_employee_dates_idx ON ${q('gosi_employee_assignments')}(employee_id,effective_from,effective_to)`);
await pool.query(`CREATE TABLE IF NOT EXISTS ${q('journal_change_logs')} (
  id bigserial PRIMARY KEY, journal_batch_id text NOT NULL, company_id text NOT NULL,
  change_type text NOT NULL, changed_at timestamptz NOT NULL DEFAULT now(), changed_by text NOT NULL,
  reason text NOT NULL, previous_snapshot jsonb, new_snapshot jsonb NOT NULL,
  affected_branches jsonb NOT NULL DEFAULT '[]'::jsonb
)`);
await pool.query(`CREATE INDEX IF NOT EXISTS journal_change_logs_batch_changed_idx ON ${q('journal_change_logs')}(journal_batch_id,changed_at DESC)`);
await pool.query(`CREATE TABLE IF NOT EXISTS ${q('gosi_department_assignments')} (
  id text PRIMARY KEY,company_id text NOT NULL REFERENCES ${q('companies')}(id) ON DELETE RESTRICT,
  department_name text NOT NULL,account_id text NOT NULL REFERENCES ${q('gosi_accounts')}(id) ON DELETE RESTRICT,
  effective_from date NOT NULL,effective_to date,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(effective_to IS NULL OR effective_to>=effective_from)
)`);
await pool.query(`CREATE INDEX IF NOT EXISTS gosi_department_dates_idx ON ${q('gosi_department_assignments')}(company_id,department_name,effective_from,effective_to)`);
await pool.query(`CREATE TABLE IF NOT EXISTS ${q('gosi_invoices')} (
  id text PRIMARY KEY,company_id text NOT NULL REFERENCES ${q('companies')}(id) ON DELETE RESTRICT,
  account_id text NOT NULL REFERENCES ${q('gosi_accounts')}(id) ON DELETE RESTRICT,
  invoice_month text NOT NULL,payroll_month text NOT NULL,detected_month text,source_file_name text NOT NULL,
  items_count integer NOT NULL,total_subject_wage numeric(16,2) NOT NULL,total_employer_share numeric(16,2) NOT NULL,
  total_employee_share numeric(16,2) NOT NULL,total_amount numeric(16,2) NOT NULL,created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),CHECK(invoice_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),CHECK(payroll_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
)`);
await pool.query(`CREATE INDEX IF NOT EXISTS gosi_invoices_company_month_idx ON ${q('gosi_invoices')}(company_id,invoice_month DESC)`);
await pool.query(`CREATE TABLE IF NOT EXISTS ${q('gosi_invoice_items')} (
  invoice_id text NOT NULL REFERENCES ${q('gosi_invoices')}(id) ON DELETE CASCADE,id text NOT NULL,
  identity_number text NOT NULL,subscriber_name text NOT NULL,nationality text NOT NULL DEFAULT '',
  subject_wage numeric(16,2) NOT NULL,employer_share numeric(16,2) NOT NULL,employee_share numeric(16,2) NOT NULL,total_amount numeric(16,2) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,PRIMARY KEY(invoice_id,id),UNIQUE(invoice_id,identity_number)
)`);
await pool.query(`UPDATE ${q('users')} SET permissions=permissions || '["MANAGE_GOSI"]'::jsonb,updated_at=now()
  WHERE role IN ('COMPANY_MANAGER','OPERATIONS_MANAGER') AND permissions IS NOT NULL
    AND permissions @> '["MANAGE_PAYROLL"]'::jsonb AND NOT permissions @> '["MANAGE_GOSI"]'::jsonb`);
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
await pool.query(`CREATE INDEX IF NOT EXISTS payroll_settlements_company_period_idx ON ${q('payroll_settlements')}(company_id,period_month DESC)`);
await pool.query(`CREATE INDEX IF NOT EXISTS payroll_settlements_employee_idx ON ${q('payroll_settlements')}(employee_id,created_at DESC)`);
await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS payroll_settlements_active_dedupe_idx
  ON ${q('payroll_settlements')}(company_id,dedupe_key) WHERE status <> 'REVERSED'`);
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
}
