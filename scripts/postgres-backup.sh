#!/usr/bin/env bash
set -Eeuo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
container="${PAYROLL_DB_CONTAINER:-labor_postgres_db}"
database="${PAYROLL_DB_NAME:-masar_payroll_db}"
database_user="${PAYROLL_DB_USER:-masar_payroll_user}"
backup_dir="${PAYROLL_BACKUP_DIR:-${project_root}/backups/postgres}"
retention_days="${PAYROLL_BACKUP_RETENTION_DAYS:-30}"

if ! [[ "${retention_days}" =~ ^[1-9][0-9]*$ ]] || (( retention_days > 3650 )); then
  echo "PAYROLL_BACKUP_RETENTION_DAYS must be between 1 and 3650." >&2
  exit 2
fi
if [[ -z "${container}" || -z "${database}" || -z "${database_user}" ]]; then
  echo "Database container, name, and user are required." >&2
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

timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
final_path="${backup_dir}/masar-payroll-${timestamp}.dump"
partial_path="${final_path}.partial"
checksum_path="${final_path}.sha256"
trap 'rm -f -- "${partial_path}" "${checksum_path}.partial"' EXIT

docker exec "${container}" pg_dump -U "${database_user}" -d "${database}" -Fc > "${partial_path}"
if [[ ! -s "${partial_path}" ]]; then
  echo "pg_dump produced an empty backup." >&2
  exit 1
fi
docker exec -i "${container}" pg_restore --list < "${partial_path}" >/dev/null

mv -- "${partial_path}" "${final_path}"
(
  cd "${backup_dir}"
  sha256sum "$(basename "${final_path}")" > "$(basename "${checksum_path}").partial"
)
mv -- "${checksum_path}.partial" "${checksum_path}"

find "${backup_dir}" -maxdepth 1 -type f \
  \( -name 'masar-payroll-*.dump' -o -name 'masar-payroll-*.dump.sha256' \) \
  -mtime "+${retention_days}" -delete

size_bytes="$(stat -c '%s' "${final_path}")"
echo "BACKUP_SUCCESS path=${final_path} bytes=${size_bytes} retention_days=${retention_days}"
