# PostgreSQL backup and restore drill

The backup job creates a compressed custom-format dump, verifies that PostgreSQL can read its catalog, writes a SHA-256 checksum, and removes files older than the configured retention period. The restore drill verifies the checksum, restores the newest dump into a disposable database, queries essential tables, and removes only that test database.

## Defaults

- PostgreSQL container: `labor_postgres_db`
- Production database: `masar_payroll_db`
- Database user: `masar_payroll_user`
- Backup directory: `backups/postgres`
- Daily retention: 30 days
- Restore database: `masar_payroll_restore_test`
- Backup schedule: daily at 02:15 with up to 15 minutes randomized delay
- Restore drill: Sunday at 03:30 with up to 30 minutes randomized delay

Override defaults in `/mnt/ssd/projects/payroll-manager/.env.backup` when necessary:

```dotenv
PAYROLL_DB_CONTAINER=labor_postgres_db
PAYROLL_DB_NAME=masar_payroll_db
PAYROLL_DB_USER=masar_payroll_user
PAYROLL_DB_ADMIN_USER=masar_payroll_user
PAYROLL_DB_SCHEMA=masar_payroll
PAYROLL_BACKUP_DIR=/mnt/ssd/projects/payroll-manager/backups/postgres
PAYROLL_BACKUP_RETENTION_DAYS=30
PAYROLL_RESTORE_TEST_DB=masar_payroll_restore_test
OPS_ALERT_EMAILS=operations@example.com
# Optional alternative or additional JSON webhook:
# OPS_ALERT_WEBHOOK_URL=https://alerts.example.com/hooks/replace-me
# Reuses RESEND_API_KEY and EMAIL_FROM when email alerts are enabled.
```

Protect that file if it contains additional secrets:

```bash
chmod 600 .env.backup
```

## One-time verification

```bash
cd /mnt/ssd/projects/payroll-manager
./scripts/postgres-backup.sh
RESTORE_DRILL_CONFIRM=YES ./scripts/postgres-restore-drill.sh
```

Both commands must end with `BACKUP_SUCCESS` or `RESTORE_DRILL_SUCCESS`. The restore drill never targets `masar_payroll_db`; it rejects a test database name that does not contain `restore`, `test`, or `drill`.

## Enable systemd timers

```bash
cd /mnt/ssd/projects/payroll-manager
sudo cp deploy/systemd/masar-payroll-* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now masar-payroll-backup.timer masar-payroll-restore-drill.timer
sudo systemctl start masar-payroll-backup.service
sudo systemctl start masar-payroll-restore-drill.service
systemctl list-timers 'masar-payroll-*'
```

The backup and restore services trigger `masar-payroll-ops-alert@.service` on failure. Configure at least one alert channel (`OPS_ALERT_EMAILS` with Resend, or `OPS_ALERT_WEBHOOK_URL`) before enabling the timers. The application server uses the same variables for persistent database connection failures and sends one recovery notification after connectivity returns.

`GET /api/health` returns server uptime, build identifier, PostgreSQL state, and query latency. It returns HTTP 503 with `status: degraded` when PostgreSQL is unavailable, without exposing connection details. Server events and request failures are emitted as one JSON object per line with request IDs; sensitive fields are redacted.

Inspect the latest results:

```bash
journalctl -u masar-payroll-backup.service -n 50 --no-pager
journalctl -u masar-payroll-restore-drill.service -n 50 --no-pager
```

Do not set `PAYROLL_RESTORE_KEEP_DB=YES` for the scheduled drill. That option is only for a supervised acceptance session where the restored database must remain available temporarily.
