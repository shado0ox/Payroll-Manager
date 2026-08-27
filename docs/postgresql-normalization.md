# PostgreSQL payroll normalization

This release moves employees, payroll runs, payroll run items, payment batches, attendance, leaves, loans, penalties, and temporary earnings into relational PostgreSQL tables.
Company profiles and definitions, accounting journals, application audit history, and integration configuration are normalized as the third migration stage.

## Safety model

- `app_state` remains available as a temporary compatibility and rollback copy.
- The first migration stores the source JSON in `app_state_migration_backups` before inserting relational rows.
- State writes update the relational tables and compatibility JSON in one PostgreSQL transaction.
- API reads hydrate employees and payroll runs from the relational tables.
- A failed constraint or insert rolls back the complete write.

## Tables

- `employees`
- `payroll_runs`
- `payroll_run_items`
- `payroll_payment_batches`
- `payroll_payment_batch_items`
- `attendance_records`
- `leave_requests`
- `loans`
- `penalties`
- `temporary_earnings`
- `company_departments`
- `cost_centers`
- `company_bank_definitions`
- `journal_batches`
- `journal_lines`
- `application_audit_logs`
- `integration_configs`
- `app_state_migration_backups`
- `schema_migrations`
- `normalization_status` (view)

## Deployment checks

Before deployment, create a PostgreSQL custom-format backup. After deployment, run `scripts/verify-normalized-storage.sql` in pgAdmin. `counts_match` must be true, every payroll `net_total_matches` value must be true, and duplicate employee-number results should be empty.

Historical operational records whose employee was already deleted are preserved through hidden archived employee references. They are not returned as active employees to the application.

Deleted companies are retained as archived relational references when historical payroll or journal records still depend on them. Qoyod's API key is stored separately in `integration_configs.secret_value` and is redacted from the compatibility state after the next successful write.

Do not delete `app_state` or `app_state_migration_backups` during this transition release.
