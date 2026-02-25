#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

REPORT_FILE="${ARCANA_PREFLIGHT_REPORT_FILE:-./data/reports/preflight-latest.json}"
ACTIONS_JSON=0
PREFLIGHT_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --report-file)
      REPORT_FILE="${2:-}"
      shift 2
      ;;
    --actions-json)
      ACTIONS_JSON=1
      shift
      ;;
    *)
      PREFLIGHT_ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ -z "$REPORT_FILE" ]]; then
  echo "❌ report-file kan inte vara tom."
  exit 1
fi

mkdir -p "$(dirname "$REPORT_FILE")"

echo "== Arcana Pilot Advisor =="
echo "reportFile: $REPORT_FILE"
echo

set +e
ARCANA_PREFLIGHT_REPORT_FILE="$REPORT_FILE" bash ./scripts/pilot-preflight.sh "${PREFLIGHT_ARGS[@]}"
PREFLIGHT_EXIT_CODE=$?
set -e

echo
echo "== Preflight Action Plan =="
ACTION_ARGS=(--file "$REPORT_FILE")
if [[ "$ACTIONS_JSON" -eq 1 ]]; then
  ACTION_ARGS+=(--json)
fi

set +e
node ./scripts/preflight-report-actions.js "${ACTION_ARGS[@]}"
ACTIONS_EXIT_CODE=$?
set -e

if [[ "$ACTIONS_EXIT_CODE" -ne 0 ]]; then
  echo "⚠️ Kunde inte läsa action-plan från rapportfilen."
fi

exit "$PREFLIGHT_EXIT_CODE"
