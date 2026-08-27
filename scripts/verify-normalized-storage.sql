-- Run in pgAdmin after deploying the normalized payroll storage release.
-- Change the schema name below only if DB_SCHEMA is not masar_payroll.

SELECT *
FROM masar_payroll.normalization_status;

SELECT
  company_id,
  employee_no,
  count(*) AS duplicate_count
FROM masar_payroll.employees
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
FROM masar_payroll.payroll_runs r
LEFT JOIN masar_payroll.payroll_run_items i ON i.payroll_run_id = r.id
GROUP BY r.id
ORDER BY r.period_month DESC, r.company_id;

SELECT
  id,
  source_version,
  reason,
  created_at
FROM masar_payroll.app_state_migration_backups
ORDER BY id;

SELECT
  (SELECT count(*) FROM masar_payroll.employees WHERE is_archived = true) AS archived_employee_references,
  (SELECT count(*) FROM masar_payroll.attendance_records) AS attendance_records,
  (SELECT count(*) FROM masar_payroll.leave_requests) AS leave_requests,
  (SELECT count(*) FROM masar_payroll.loans) AS loans,
  (SELECT count(*) FROM masar_payroll.penalties) AS penalties,
  (SELECT count(*) FROM masar_payroll.temporary_earnings) AS temporary_earnings;

SELECT
  (SELECT COALESCE(sum(remaining_amount),0) FROM masar_payroll.loans) AS loans_remaining_total,
  (SELECT COALESCE(sum(amount),0) FROM masar_payroll.penalties) AS penalties_total,
  (SELECT COALESCE(sum(amount),0) FROM masar_payroll.temporary_earnings) AS temporary_earnings_total;

SELECT version, applied_at
FROM masar_payroll.schema_migrations
ORDER BY applied_at, version;
