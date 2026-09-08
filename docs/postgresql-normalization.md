# PostgreSQL payroll normalization

This release moves employees, payroll runs, payroll run items, payment batches, attendance, leaves, loans, penalties, and temporary earnings into relational PostgreSQL tables.
Company profiles and definitions, accounting journals, application audit history, and integration configuration are normalized as the third migration stage.

## Safety model

- `app_state` contains version/update metadata only; the legacy `state` JSON column is removed automatically after all startup migrations finish.
- Startup migration stores the original legacy JSON in `app_state_migration_backups` before inserting relational rows.
- An explicit developer restore stores the current normalized state in `app_state_restore_snapshots` before replacing any rows. Integration secrets are redacted from that snapshot.
- API reads and normal writes use the relational tables directly.
- A failed constraint, snapshot, or insert rolls back the complete transaction.

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
- `app_state` (version metadata only)
- `app_state_migration_backups`
- `app_state_restore_snapshots`
- `schema_migrations`
- `normalization_status` (view)

## Deployment checks

Before deployment, create a PostgreSQL custom-format backup. After deployment, run `scripts/verify-normalized-storage.sql` in pgAdmin. `counts_match` verifies that every payroll summary agrees with its normalized items; it must be true. Every payroll `net_total_matches` value must also be true, and duplicate employee-number results should be empty.

Historical operational records whose employee was already deleted are preserved through hidden archived employee references. They are not returned as active employees to the application.

Deleted companies are retained as archived relational references when historical payroll or journal records still depend on them. Qoyod's API key is stored separately in `integration_configs.secret_value` and is never copied into restore snapshots.

Do not delete `app_state`, `app_state_migration_backups`, or `app_state_restore_snapshots`.

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
confirmed backup restore. Before that operation changes normalized records, the
server creates a redacted snapshot in `app_state_restore_snapshots` in the same
transaction.

Normal `GET /api/state` responses and HR lifecycle processing are now assembled
directly from the normalized tables. They read only version metadata from
`app_state`; the JSON payload is no longer a source for normal application reads.
Dedicated record and workflow writes update only `app_state` version metadata
after changing their normalized rows. Employee create/delete, bulk employee
archive, company archive, settlement create/reversal, and explicit restore all
follow the same rule. The legacy JSON payload is read only during a one-time
startup migration and its column is then removed.
