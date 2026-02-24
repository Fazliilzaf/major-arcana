#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${BASE_URL:-}"
EMAIL="${ARCANA_OWNER_EMAIL:-}"
PASSWORD="${ARCANA_OWNER_PASSWORD:-}"
TENANT_ID="${ARCANA_DEFAULT_TENANT:-hair-tp-clinic}"
RUN_MAIL_SEEDS="false"

usage() {
  cat <<'USAGE'
Kör publik pilot-verifiering i ett steg.

Användning:
  bash ./scripts/public-pilot-run.sh [--base-url URL] [--email EMAIL] [--tenant TENANT] [--password PASS] [--with-mail-seeds]

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

BASE_URL="${BASE_URL%/}"

if [[ -z "$PASSWORD" ]]; then
  read -r -s -p "Arcana lösenord för $EMAIL: " PASSWORD
  echo
fi

LOGIN_PAYLOAD="$(node -e 'const [email,password,tenant]=process.argv.slice(1); process.stdout.write(JSON.stringify({email,password,tenantId:tenant}));' "$EMAIL" "$PASSWORD" "$TENANT_ID")"
LOGIN_RESPONSE="$(curl -sS -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  --data-raw "$LOGIN_PAYLOAD")"

TOKEN="$(printf '%s' "$LOGIN_RESPONSE" | node -e 'try { const d = JSON.parse(require("fs").readFileSync(0, "utf8")); process.stdout.write(d.token || ""); } catch { process.stdout.write(""); }' || true)"
if [[ -z "$TOKEN" ]]; then
  echo "❌ Login verifiering misslyckades."
  printf '%s\n' "$LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Login verifierad (token length: ${#TOKEN})"

BASE_URL="$BASE_URL" ARCANA_OWNER_EMAIL="$EMAIL" ARCANA_OWNER_PASSWORD="$PASSWORD" ARCANA_DEFAULT_TENANT="$TENANT_ID" npm run smoke:public

if [[ "$RUN_MAIL_SEEDS" == "true" ]]; then
  BASE_URL="$BASE_URL" ARCANA_OWNER_EMAIL="$EMAIL" ARCANA_OWNER_PASSWORD="$PASSWORD" ARCANA_DEFAULT_TENANT="$TENANT_ID" npm run mail:seeds:apply-activate
fi

BASE_URL="$BASE_URL" ARCANA_OWNER_EMAIL="$EMAIL" ARCANA_OWNER_PASSWORD="$PASSWORD" ARCANA_DEFAULT_TENANT="$TENANT_ID" npm run report:pilot

if [[ -d "$ROOT_DIR/data/reports" ]]; then
  /bin/ls -lt "$ROOT_DIR/data/reports" | /usr/bin/head
fi

unset PASSWORD TOKEN LOGIN_RESPONSE LOGIN_PAYLOAD
echo "✅ Klart."
