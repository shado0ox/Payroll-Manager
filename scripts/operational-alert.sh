#!/usr/bin/env bash
set -Eeuo pipefail

event="${1:-unknown-operation}"
status="${2:-failed}"
webhook_url="${OPS_ALERT_WEBHOOK_URL:-}"
resend_api_key="${RESEND_API_KEY:-}"
email_from="${EMAIL_FROM:-}"
alert_emails="${OPS_ALERT_EMAILS:-}"
timestamp="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
host_name="$(hostname)"
payload="$(printf '{\"service\":\"masar-payroll\",\"event\":\"%s\",\"status\":\"%s\",\"host\":\"%s\",\"timestamp\":\"%s\"}' "${event}" "${status}" "${host_name}" "${timestamp}")"
delivered=false

if [[ -n "${webhook_url}" ]]; then
  curl --fail --silent --show-error --max-time 15 -H 'Content-Type: application/json' -d "${payload}" "${webhook_url}" >/dev/null
  delivered=true
fi

if [[ -n "${resend_api_key}" && -n "${email_from}" && -n "${alert_emails}" ]]; then
  recipients="$(printf '%s' "${alert_emails}" | awk -F',' '{ for (i=1; i<=NF; i++) { gsub(/^[ \t]+|[ \t]+$/, "", $i); printf "%s\"%s\"", (i > 1 ? "," : ""), $i } }')"
  email_payload="$(printf '{\"from\":\"%s\",\"to\":[%s],\"subject\":\"Masar Payroll: %s (%s)\",\"text\":%s}' "${email_from}" "${recipients}" "${event}" "${status}" "$(printf '%s' "${payload}" | sed 's/"/\\"/g; s/^/"/; s/$/"/')")"
  curl --fail --silent --show-error --max-time 15 -H "Authorization: Bearer ${resend_api_key}" -H 'Content-Type: application/json' -d "${email_payload}" https://api.resend.com/emails >/dev/null
  delivered=true
fi

if [[ "${delivered}" != "true" ]]; then
  echo "ALERT_SKIPPED event=${event} reason=NO_ALERT_CHANNEL" >&2
  exit 0
fi
echo "ALERT_SENT event=${event} status=${status}"
