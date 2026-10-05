-- Run in pgAdmin after deploying the normalized payroll storage release.
-- Change the schema name below only if DB_SCHEMA is not wafr_payroll.

SELECT *
FROM wafr_payroll.normalization_status;

SELECT
  company_id,
  employee_no,
  count(*) AS duplicate_count
FROM wafr_payroll.employees
WHERE employee_no <> ''
GROUP BY company_id, employee_no
HAVING count(*) > 1
ORDER BY duplicate_count DESC, company_id, employee_no;

SELECT
  r.company_id,
  r.period_month,
  r.status,
  r.employees_count AS recorded_employee_count,
  count(i.*) AS table_employee_count,
  r.total_net_salaries AS recorded_net_total,
  COALESCE(sum(i.net_salary), 0) AS items_net_total,
  r.total_net_salaries = COALESCE(sum(i.net_salary), 0) AS net_total_matches
FROM wafr_payroll.payroll_runs r
LEFT JOIN wafr_payroll.payroll_run_items i ON i.payroll_run_id = r.id
GROUP BY r.id
ORDER BY r.period_month DESC, r.company_id;

SELECT
  id,
  source_version,
  reason,
  created_at
FROM wafr_payroll.app_state_migration_backups
ORDER BY id;

SELECT
  id,
  source_version,
  created_by,
  reason,
  created_at
FROM wafr_payroll.app_state_restore_snapshots
ORDER BY id DESC;

SELECT
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'wafr_payroll'
      AND table_name = 'app_state'
      AND column_name = 'state'
  ) AS legacy_state_column_removed;

SELECT
  (SELECT count(*) FROM wafr_payroll.employees WHERE is_archived = true) AS archived_employee_references,
  (SELECT count(*) FROM wafr_payroll.attendance_records) AS attendance_records,
  (SELECT count(*) FROM wafr_payroll.leave_requests) AS leave_requests,
  (SELECT count(*) FROM wafr_payroll.loans) AS loans,
  (SELECT count(*) FROM wafr_payroll.penalties) AS penalties,
  (SELECT count(*) FROM wafr_payroll.temporary_earnings) AS temporary_earnings;

SELECT
  company_id,
  period_month,
  status,
  count(*) AS settlement_count,
  sum(amount) AS settlement_total
FROM wafr_payroll.payroll_settlements
GROUP BY company_id, period_month, status
ORDER BY period_month DESC, company_id, status;

SELECT
  (SELECT COALESCE(sum(remaining_amount),0) FROM wafr_payroll.loans) AS loans_remaining_total,
  (SELECT COALESCE(sum(amount),0) FROM wafr_payroll.penalties) AS penalties_total,
  (SELECT COALESCE(sum(amount),0) FROM wafr_payroll.temporary_earnings) AS temporary_earnings_total;

SELECT version, applied_at
FROM wafr_payroll.schema_migrations
ORDER BY applied_at, version;

SELECT company_code,name_ar,subscription_status,trial_ends_at,subscription_ends_at
FROM wafr_payroll.companies
WHERE is_archived=false
ORDER BY created_at;

SELECT
  (SELECT count(*) FROM wafr_payroll.companies WHERE is_archived=false) AS companies,
  (SELECT count(*) FROM wafr_payroll.company_departments) AS departments,
  (SELECT count(*) FROM wafr_payroll.cost_centers) AS cost_centers,
  (SELECT count(*) FROM wafr_payroll.company_bank_definitions) AS bank_definitions,
  (SELECT count(*) FROM wafr_payroll.journal_batches) AS journal_batches,
  (SELECT count(*) FROM wafr_payroll.journal_lines) AS journal_lines,
  (SELECT count(*) FROM wafr_payroll.application_audit_logs) AS application_audit_logs;

SELECT
  j.id,
  j.batch_number,
  j.total_debit,
  j.total_credit,
  COALESCE(sum(l.debit),0) AS lines_debit,
  COALESCE(sum(l.credit),0) AS lines_credit,
  j.total_debit=COALESCE(sum(l.debit),0) AND j.total_credit=COALESCE(sum(l.credit),0) AS totals_match
FROM wafr_payroll.journal_batches j
LEFT JOIN wafr_payroll.journal_lines l ON l.journal_batch_id=j.id
GROUP BY j.id
ORDER BY j.period_month DESC,j.batch_number;

SELECT provider, secret_value <> '' AS secret_configured, updated_at
FROM wafr_payroll.integration_configs;
