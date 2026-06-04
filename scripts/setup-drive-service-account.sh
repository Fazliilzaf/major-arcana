#!/usr/bin/env bash
# Skapa Google service account + JSON-nyckel för Drive read-only (C1/C2).
# Kräver: gcloud auth login fazli@hairtpclinic.com (engång)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_DIR="${HOME}/secrets"
KEY_PATH="${SECRETS_DIR}/arcana-drive-sa.json"
PROJECT_ID="${ARCANA_GCP_PROJECT_ID:-arcana-drive-migration}"
SA_NAME="${ARCANA_GCP_SA_NAME:-arcana-drive-reader}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
FOLDER_ID="${ARCANA_GOOGLE_DRIVE_FOLDER_ID:-0APPck7epTcZ-Uk9PVA}"
ACCOUNT="${ARCANA_GCP_ACCOUNT:-fazli@hairtpclinic.com}"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

if ! command -v gcloud >/dev/null 2>&1; then
  red "Saknar gcloud. Kör: brew install --cask google-cloud-sdk"
  exit 1
fi

if ! gcloud auth list --filter="status:ACTIVE" --format="value(account)" 2>/dev/null | grep -q .; then
  red "Ingen aktiv gcloud-inloggning."
  echo "Kör: gcloud auth login ${ACCOUNT}"
  echo "Öppnar GCP Console i standardwebbläsare (kan ha aktiv session)…"
  open "https://console.cloud.google.com/iam-admin/serviceaccounts?authuser=0" 2>/dev/null || true
  exit 1
fi

mkdir -p "${SECRETS_DIR}"

if gcloud projects describe "${PROJECT_ID}" >/dev/null 2>&1; then
  echo "GCP-projekt finns: ${PROJECT_ID}"
else
  echo "Skapar GCP-projekt ${PROJECT_ID}…"
  gcloud projects create "${PROJECT_ID}" --name="Arcana Drive Migration"
fi

gcloud config set project "${PROJECT_ID}" >/dev/null

echo "Aktiverar Drive API…"
gcloud services enable drive.googleapis.com iam.googleapis.com --project="${PROJECT_ID}"

if gcloud iam service-accounts describe "${SA_EMAIL}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "Service account finns: ${SA_EMAIL}"
else
  echo "Skapar service account ${SA_NAME}…"
  gcloud iam service-accounts create "${SA_NAME}" \
    --project="${PROJECT_ID}" \
    --display-name="Arcana Drive read-only"
fi

echo "Skapar JSON-nyckel → ${KEY_PATH}"
gcloud iam service-accounts keys create "${KEY_PATH}" \
  --iam-account="${SA_EMAIL}" \
  --project="${PROJECT_ID}"

chmod 600 "${KEY_PATH}"

ENV_FILE="${ROOT}/.env"
if [[ -f "${ENV_FILE}" ]]; then
  python3 - "${ENV_FILE}" "${FOLDER_ID}" "${KEY_PATH}" <<'PY'
import sys
from pathlib import Path
p = Path(sys.argv[1])
folder_id = sys.argv[2]
key_path = sys.argv[3]
text = p.read_text()
lines = []
seen_folder = seen_sa = False
for line in text.splitlines():
    if line.startswith("ARCANA_GOOGLE_DRIVE_FOLDER_ID="):
        lines.append(f"ARCANA_GOOGLE_DRIVE_FOLDER_ID={folder_id}")
        seen_folder = True
    elif line.startswith("ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON="):
        lines.append(f"ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON={key_path}")
        seen_sa = True
    else:
        lines.append(line)
if not seen_folder:
    lines.append(f"ARCANA_GOOGLE_DRIVE_FOLDER_ID={folder_id}")
if not seen_sa:
    lines.append(f"ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON={key_path}")
p.write_text("\n".join(lines) + "\n")
PY
  green ".env uppdaterad"
fi

echo ""
green "✅ Service account-nyckel skapad"
echo "   project:  ${PROJECT_ID}"
echo "   email:    ${SA_EMAIL}"
echo "   key:      ${KEY_PATH}"
echo "   folderId: ${FOLDER_ID}"
echo ""
echo "MANUELLT (Drive UI): Dela delade enheten Kunder HTP med ${SA_EMAIL}."
echo "  1. Öppna https://drive.google.com/drive/folders/${FOLDER_ID}"
echo "  2. Klicka Hantera medlemmar → Lägg till: ${SA_EMAIL}"
echo "  3. Roll: Läsare (Viewer) eller Innehållshanterare"
echo ""
echo "Verifiera access:"
echo "  npm run migration:preflight-drive"
