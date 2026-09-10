#!/usr/bin/env bash
set -Eeuo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
container="${PAYROLL_DB_CONTAINER:-labor_postgres_db}"
production_database="${PAYROLL_DB_NAME:-masar_payroll_db}"
database_user="${PAYROLL_DB_USER:-masar_payroll_user}"
database_admin_user="${PAYROLL_DB_ADMIN_USER:-${database_user}}"
restore_database="${PAYROLL_RESTORE_TEST_DB:-masar_payroll_restore_test}"
database_schema="${PAYROLL_DB_SCHEMA:-masar_payroll}"
backup_dir="${PAYROLL_BACKUP_DIR:-${project_root}/backups/postgres}"
keep_database="${PAYROLL_RESTORE_KEEP_DB:-NO}"

if [[ "${RESTORE_DRILL_CONFIRM:-}" != "YES" ]]; then
  echo "Set RESTORE_DRILL_CONFIRM=YES only for a disposable restore database." >&2
  exit 2
fi
for identifier in "${production_database}" "${database_user}" "${database_admin_user}" "${restore_database}" "${database_schema}"; do
  if ! [[ "${identifier}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "Unsafe PostgreSQL identifier: ${identifier}" >&2
    exit 2
  fi
done
if [[ "${restore_database}" == "${production_database}" || ! "${restore_database}" =~ (restore|test|drill) ]]; then
  echo "Refusing unsafe restore database: ${restore_database}" >&2
  exit 2
fi

mkdir -p "${backup_dir}"
backup_dir="$(cd "${backup_dir}" && pwd)"
if [[ "${backup_dir}" == "/" || "${backup_dir}" == "${project_root}" || "${backup_dir}" != *backup* ]]; then
  echo "Refusing unsafe backup directory: ${backup_dir}" >&2
  exit 2
fi
if [[ "$(docker inspect -f '{{.State.Running}}' "${container}" 2>/dev/null || true)" != "true" ]]; then
  echo "PostgreSQL container is not running: ${container}" >&2
  exit 1
fi

backup_file="${PAYROLL_RESTORE_BACKUP_FILE:-}"
if [[ -z "${backup_file}" ]]; then
  backup_file="$(find "${backup_dir}" -maxdepth 1 -type f -name 'masar-payroll-*.dump' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
fi
if [[ -z "${backup_file}" || ! -f "${backup_file}" || ! -s "${backup_file}" ]]; then
  echo "No non-empty PostgreSQL backup was found." >&2
  exit 1
fi
backup_file="$(cd "$(dirname "${backup_file}")" && pwd)/$(basename "${backup_file}")"

checksum_file="${backup_file}.sha256"
if [[ -f "${checksum_file}" ]]; then
  (cd "$(dirname "${backup_file}")" && sha256sum -c "$(basename "${checksum_file}")")
else
  echo "Backup checksum is missing: ${checksum_file}" >&2
  exit 1
fi
docker exec -i "${container}" pg_restore --list < "${backup_file}" >/dev/null

database_created=false
cleanup() {
  if [[ "${database_created}" == "true" && "${keep_database}" != "YES" ]]; then
    docker exec "${container}" dropdb -U "${database_admin_user}" --if-exists --force "${restore_database}" >/dev/null
  fi
}
trap cleanup EXIT

docker exec "${container}" dropdb -U "${database_admin_user}" --if-exists --force "${restore_database}" >/dev/null
docker exec "${container}" createdb -U "${database_admin_user}" -O "${database_user}" "${restore_database}"
database_created=true
docker exec -i "${container}" pg_restore -U "${database_user}" -d "${restore_database}" \
  --no-owner --no-privileges --exit-on-error --single-transaction < "${backup_file}"

counts="$(docker exec "${container}" psql -U "${database_user}" -d "${restore_database}" -v ON_ERROR_STOP=1 -At -F',' -c "
  SELECT
    (SELECT count(*) FROM \"${database_schema}\".users),
    (SELECT count(*) FROM \"${database_schema}\".companies),
    (SELECT count(*) FROM \"${database_schema}\".employees),
    (SELECT count(*) FROM \"${database_schema}\".payroll_runs),
    (SELECT count(*) FROM \"${database_schema}\".payroll_run_items),
    (SELECT count(*) FROM \"${database_schema}\".loans);
")"
IFS=',' read -r users_count companies_count employees_count payroll_runs_count payroll_items_count loans_count <<< "${counts}"

echo "RESTORE_DRILL_SUCCESS backup=${backup_file} database=${restore_database} users=${users_count} companies=${companies_count} employees=${employees_count} payroll_runs=${payroll_runs_count} payroll_items=${payroll_items_count} loans=${loans_count}"
