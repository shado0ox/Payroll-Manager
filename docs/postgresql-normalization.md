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

## Concurrent record updates

Normal browser writes use dedicated record and workflow endpoints for employees,
attendance, leaves, loans, penalties, temporary earnings, payroll runs, payment
batches, companies, journals, users, settlements, and Qoyod configuration. The
generic `PATCH /api/state/patch` endpoint has been removed, so a client cannot
submit an arbitrary collection patch or replace unrelated records.

This prevents a loan, attendance entry, employee, or payroll record saved by one
user from being removed by another user's stale whole-application snapshot.
Server-sent events continue to notify other authenticated sessions, which reload
the company-filtered result through `GET /api/state`.

`PUT /api/state` remains available only to the developer account for an explicit,
confirmed backup restore. `app_state` remains a temporary compatibility snapshot
until the final normalized-read migration and rollback checks are complete.

Normal `GET /api/state` responses and HR lifecycle processing are now assembled
directly from the normalized tables. They read only version metadata from
`app_state`; the JSON payload is no longer a source for normal application reads.
Record write paths still update the compatibility snapshot temporarily so the
explicit restore and rollback path remains available during the final migration.
