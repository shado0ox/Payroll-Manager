#!/usr/bin/env bash
set -euo pipefail

: "${LEGACY_DB_NAME:?Set LEGACY_DB_NAME to the current production database name}"
: "${LEGACY_DB_USER:?Set LEGACY_DB_USER to the current application role}"
: "${LEGACY_DB_SCHEMA:?Set LEGACY_DB_SCHEMA to the current application schema}"

target_database="${WAFR_DB_NAME:-wafr_payroll_db}"
target_user="${WAFR_DB_USER:-wafr_payroll_user}"
target_schema="${WAFR_DB_SCHEMA:-wafr_payroll}"
admin_database="${PGDATABASE:-postgres}"

validate_identifier() {
  [[ "$1" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || {
    echo "Unsafe PostgreSQL identifier: $1" >&2
    exit 1
  }
}

for identifier in "$LEGACY_DB_NAME" "$LEGACY_DB_USER" "$LEGACY_DB_SCHEMA" "$target_database" "$target_user" "$target_schema"; do
  validate_identifier "$identifier"
done

echo "A fresh verified backup is required before this migration."
echo "Database: $LEGACY_DB_NAME -> $target_database"
echo "Role:     $LEGACY_DB_USER -> $target_user"
echo "Schema:   $LEGACY_DB_SCHEMA -> $target_schema"
read -r -p "Type MIGRATE_WAFR to continue: " confirmation
[[ "$confirmation" == "MIGRATE_WAFR" ]] || { echo "Migration cancelled."; exit 1; }

if [[ "$LEGACY_DB_NAME" != "$target_database" ]]; then
  psql -v ON_ERROR_STOP=1 -d "$admin_database" \
    --set=legacy_db="$LEGACY_DB_NAME" --set=target_db="$target_database" <<'SQL'
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
WHERE datname = :'legacy_db' AND pid <> pg_backend_pid();
SELECT format('ALTER DATABASE %I RENAME TO %I', :'legacy_db', :'target_db') \gexec
SQL
fi

psql -v ON_ERROR_STOP=1 -d "$target_database" \
  --set=legacy_schema="$LEGACY_DB_SCHEMA" --set=target_schema="$target_schema" <<'SQL'
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = :'legacy_schema')
   AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = :'target_schema')
  THEN format('Both source schema %I and target schema %I exist', :'legacy_schema', :'target_schema')
END AS schema_conflict \gset
\if :{?schema_conflict}
  \echo :schema_conflict
  \quit 3
\endif
SELECT format('ALTER SCHEMA %I RENAME TO %I', :'legacy_schema', :'target_schema')
WHERE :'legacy_schema' <> :'target_schema'
  AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = :'legacy_schema') \gexec
SQL

if [[ "$LEGACY_DB_USER" != "$target_user" ]]; then
  psql -v ON_ERROR_STOP=1 -d "$admin_database" \
    --set=legacy_user="$LEGACY_DB_USER" --set=target_user="$target_user" <<'SQL'
SELECT format('ALTER ROLE %I RENAME TO %I', :'legacy_user', :'target_user') \gexec
SQL
fi

echo "PostgreSQL identifiers migrated successfully. Update the application environment before starting WAFR."
