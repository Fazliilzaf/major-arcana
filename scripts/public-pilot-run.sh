#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${BASE_URL:-}"
EMAIL="${ARCANA_OWNER_EMAIL:-}"
PASSWORD="${ARCANA_OWNER_PASSWORD:-}"
TENANT_ID="${ARCANA_DEFAULT_TENANT:-hair-tp-clinic}"
RUN_MAIL_SEEDS="false"
RUN_PREFLIGHT="true"
PREFLIGHT_MODE="default"
PREFLIGHT_SKIP_LOCAL=1
FORCE_GUARD_CONTINUE=0
PREFLIGHT_REPORT_FILE="${ARCANA_PUBLIC_PILOT_PREFLIGHT_REPORT_FILE:-./data/reports/preflight-public-latest.json}"

usage() {
  cat <<'USAGE'
Kör publik pilot-verifiering i ett steg.

Användning:
  bash ./scripts/public-pilot-run.sh [--base-url URL] [--email EMAIL] [--tenant TENANT] [--password PASS] [--with-mail-seeds] [--skip-preflight] [--preflight-heal|--preflight-heal-all] [--with-local-verify] [--preflight-force-on-guard-fail] [--preflight-report-file FILE]

Exempel:
  BASE_URL=https://arcana.hairtpclinic.se ARCANA_OWNER_EMAIL=fazli@hairtpclinic.com bash ./scripts/public-pilot-run.sh
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="${2:-}"
      shift 2
      ;;
    --email)
      EMAIL="${2:-}"
      shift 2
      ;;
    --tenant)
      TENANT_ID="${2:-}"
      shift 2
      ;;
    --password)
      PASSWORD="${2:-}"
      shift 2
      ;;
    --with-mail-seeds)
      RUN_MAIL_SEEDS="true"
      shift
      ;;
    --skip-preflight)
      RUN_PREFLIGHT="false"
      shift
      ;;
    --preflight-heal)
      PREFLIGHT_MODE="heal"
      shift
      ;;
    --preflight-heal-all)
      PREFLIGHT_MODE="heal-all"
      shift
      ;;
    --with-local-verify)
      PREFLIGHT_SKIP_LOCAL=0
      shift
      ;;
    --preflight-force-on-guard-fail)
      FORCE_GUARD_CONTINUE=1
      shift
      ;;
    --preflight-report-file)
      PREFLIGHT_REPORT_FILE="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "❌ Okänd flagga: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$BASE_URL" ]]; then
  echo "❌ Saknar BASE_URL."
  echo "   Exempel: BASE_URL=https://arcana.hairtpclinic.se ARCANA_OWNER_EMAIL=fazli@hairtpclinic.com bash ./scripts/public-pilot-run.sh"
  exit 1
fi
if [[ -z "$EMAIL" ]]; then
  echo "❌ Saknar ARCANA_OWNER_EMAIL."
  echo "   Exempel: BASE_URL=https://arcana.hairtpclinic.se ARCANA_OWNER_EMAIL=fazli@hairtpclinic.com bash ./scripts/public-pilot-run.sh"
  exit 1
fi
if [[ "$RUN_PREFLIGHT" == "true" && -z "$PREFLIGHT_REPORT_FILE" ]]; then
  echo "❌ Saknar preflight report-fil."
  echo "   Sätt --preflight-report-file <fil> eller ARCANA_PUBLIC_PILOT_PREFLIGHT_REPORT_FILE."
  exit 1
fi

BASE_URL="${BASE_URL%/}"

if [[ -z "$PASSWORD" ]]; then
  read -r -s -p "Arcana lösenord för $EMAIL: " PASSWORD
  echo
fi

if [[ "$RUN_PREFLIGHT" == "true" ]]; then
  PREFLIGHT_SCRIPT="preflight:pilot:advisor"
  case "$PREFLIGHT_MODE" in
    heal)
      PREFLIGHT_SCRIPT="preflight:pilot:advisor:heal"
      ;;
    heal-all)
      PREFLIGHT_SCRIPT="preflight:pilot:advisor:heal:all"
      ;;
  esac
  mkdir -p "$(dirname "$PREFLIGHT_REPORT_FILE")"
  PREFLIGHT_ARGS=(--public-url "$BASE_URL" --report-file "$PREFLIGHT_REPORT_FILE")
  if [[ "$PREFLIGHT_SKIP_LOCAL" -eq 1 ]]; then
    PREFLIGHT_ARGS+=(--skip-local)
  fi
  echo "1) Public preflight advisor ($BASE_URL)"
  set +e
  BASE_URL="$BASE_URL" ARCANA_OWNER_EMAIL="$EMAIL" ARCANA_OWNER_PASSWORD="$PASSWORD" ARCANA_DEFAULT_TENANT="$TENANT_ID" ARCANA_PREFLIGHT_FORCE_OPS_ON_GUARD_FAIL="$FORCE_GUARD_CONTINUE" npm run "$PREFLIGHT_SCRIPT" -- "${PREFLIGHT_ARGS[@]}"
  PREFLIGHT_EXIT_CODE=$?
  set -e
  if [[ "$PREFLIGHT_EXIT_CODE" -ne 0 ]]; then
    echo
    echo "❌ Preflight advisor misslyckades (exit: $PREFLIGHT_EXIT_CODE)."
    echo "   Läs action-plan igen via:"
    echo "   npm run preflight:report:actions -- --file $PREFLIGHT_REPORT_FILE"
    exit "$PREFLIGHT_EXIT_CODE"
  fi
  echo
else
  echo "1) Public preflight advisor SKIP"
  echo
fi

echo "2) Public smoke ($BASE_URL)"
BASE_URL="$BASE_URL" ARCANA_OWNER_EMAIL="$EMAIL" ARCANA_OWNER_PASSWORD="$PASSWORD" ARCANA_DEFAULT_TENANT="$TENANT_ID" npm run smoke:public

if [[ "$RUN_MAIL_SEEDS" == "true" ]]; then
  echo "3) Mail seeds apply+activate"
  BASE_URL="$BASE_URL" ARCANA_OWNER_EMAIL="$EMAIL" ARCANA_OWNER_PASSWORD="$PASSWORD" ARCANA_DEFAULT_TENANT="$TENANT_ID" npm run mail:seeds:apply-activate
  echo
else
  echo "3) Mail seeds SKIP"
  echo
fi

echo "4) Pilot report"
BASE_URL="$BASE_URL" ARCANA_OWNER_EMAIL="$EMAIL" ARCANA_OWNER_PASSWORD="$PASSWORD" ARCANA_DEFAULT_TENANT="$TENANT_ID" npm run report:pilot

if [[ -d "$ROOT_DIR/data/reports" ]]; then
  echo
  echo "Senaste rapportfiler:"
  /bin/ls -lt "$ROOT_DIR/data/reports" | /usr/bin/head
fi

unset PASSWORD
echo "✅ Klart."
