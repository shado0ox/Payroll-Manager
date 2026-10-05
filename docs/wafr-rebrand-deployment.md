# WAFR rebrand deployment

This release changes browser, cookie, Docker, service, backup, and PostgreSQL identifiers.

## User impact

- The session cookie is renamed to `wafr_session`. Every currently signed-in user is signed out once after deployment and must sign in again.
- Browser cache, language, privacy, tab, and IndexedDB identifiers use the WAFR namespace. Server data is unaffected.

## PostgreSQL migration

1. Stop application writes and create a fresh verified PostgreSQL backup.
2. Export `LEGACY_DB_NAME`, `LEGACY_DB_USER`, and `LEGACY_DB_SCHEMA` with the values currently used by the server.
3. Configure PostgreSQL administrator connection variables (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and optionally `PGDATABASE`).
4. Run `bash scripts/migrate-postgres-identifiers-to-wafr.sh` and type the requested confirmation.
5. Update the application environment to `wafr_payroll_db`, `wafr_payroll_user`, and `wafr_payroll`.

The migration validates identifiers, terminates connections only when the database must be renamed, refuses to merge two schemas, and stops on the first PostgreSQL error.

## Docker replacement

Run the shutdown command against the currently deployed compose file before pulling or starting the renamed compose service:

```bash
docker compose down
git pull origin main
docker compose up -d --build
```

The application container, image, and service are renamed. No application named volume is removed; PostgreSQL remains on its separately managed external network.

## systemd operations

Disable and remove the legacy unit files, copy the `wafr-payroll-*` units, then reload systemd:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now wafr-payroll-backup.timer wafr-payroll-restore-drill.timer
```
