#!/usr/bin/env bash
# Efter `az login`: skapa nytt Graph client secret, skriv .env, push Render.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

APP_ID="${ARCANA_GRAPH_CLIENT_ID:-13adfc91-69ab-4c35-ac80-b52ebba7e09f}"
DISPLAY_NAME="${GRAPH_SECRET_DISPLAY_NAME:-arcana-cco-$(date +%Y%m%d)}"

command -v az >/dev/null || { echo "❌ az CLI saknas"; exit 1; }
az account show >/dev/null 2>&1 || { echo "❌ Kör az login först (az login --use-device-code)"; exit 1; }

echo "== Skapar nytt client secret för $APP_ID =="
SECRET_JSON="$(az ad app credential reset --id "$APP_ID" --display-name "$DISPLAY_NAME" --years 1 -o json)"
export GRAPH_SECRET_NEW="$(node -e "const j=JSON.parse(process.argv[1]); process.stdout.write(j.password||'');" "$SECRET_JSON")"
[[ -n "$GRAPH_SECRET_NEW" ]] || { echo "❌ Tomt secret från az"; exit 1; }

node -e "
const fs = require('fs');
const secret = process.env.GRAPH_SECRET_NEW || '';
const upsert = (raw, key, value) => {
  const re = new RegExp('^' + key + '=.*$', 'm');
  const line = key + '=' + value;
  return re.test(raw) ? raw.replace(re, line) : raw.trimEnd() + '\\n' + line + '\\n';
};
let env = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
env = upsert(env, 'ARCANA_GRAPH_TENANT_ID', '90b09262-dfbf-42b7-9c56-1149703a76e5');
env = upsert(env, 'ARCANA_GRAPH_CLIENT_ID', process.env.APP_ID || '13adfc91-69ab-4c35-ac80-b52ebba7e09f');
env = upsert(env, 'ARCANA_GRAPH_CLIENT_SECRET', secret);
env = upsert(env, 'ARCANA_GRAPH_USER_ID', 'fazli@hairtpclinic.com');
env = upsert(env, 'ARCANA_GRAPH_READ_ENABLED', 'true');
fs.writeFileSync('.env', env);
console.log('✅ .env uppdaterad (Graph secret)');
"

SKIP_RESEND="${SKIP_RESEND:-true}" bash ./scripts/apply-graph-resend-go-live-prod.sh
echo "✅ Graph secret provisioned + Render deploy triggad (Resend: SKIP_RESEND=${SKIP_RESEND:-true})"
