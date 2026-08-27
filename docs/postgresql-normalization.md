# PostgreSQL payroll normalization

This release moves employees, payroll runs, payroll run items, payment batches, and payment batch employees into relational PostgreSQL tables.

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
- `app_state_migration_backups`
- `normalization_status` (view)

## Deployment checks

Before deployment, create a PostgreSQL custom-format backup. After deployment, run `scripts/verify-normalized-storage.sql` in pgAdmin. `counts_match` must be true, every payroll `net_total_matches` value must be true, and duplicate employee-number results should be empty.

Do not delete `app_state` or `app_state_migration_backups` during this transition release.
