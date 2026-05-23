#!/usr/bin/env bash
# Ta bort dubbletter av hälsodeklaration på prod (behåller senast signerade).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${ARCANA_PROD_URL:-${BASE_URL:-https://arcana.hairtpclinic.se}}"
BASE_URL="${BASE_URL%/}"
PATIENT_ID="${1:-f8233fca-779c-488b-a980-0e41bc01c0c0}"
DRY_RUN="${DRY_RUN:-false}"

AUTH_TOKEN="$(node "$ROOT_DIR/scripts/get-prod-auth-token.js" 2>/dev/null || true)"
if [[ -z "$AUTH_TOKEN" ]]; then
  echo "Kunde inte hämta AUTH_TOKEN — kontrollera .env (ARCANA_STAFF_*)" >&2
  exit 1
fi
export AUTH_TOKEN

node - "$BASE_URL" "$PATIENT_ID" "$DRY_RUN" <<'NODE'
const baseUrl = process.argv[2];
const patientId = process.argv[3];
const dryRun = process.argv[4] === 'true';
const token = process.env.AUTH_TOKEN || '';
const headers = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'x-arcana-client': 'major_arcana_admin',
};
if (token) headers.Authorization = `Bearer ${token}`;

async function api(method, path, body, attempt = 0) {
  const res = await fetch(new URL(path, baseUrl), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  if ((res.status === 502 || res.status === 503) && attempt < 8) {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    return api(method, path, body, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${json.error || text.slice(0, 200)}`);
  }
  return json;
}

(async () => {
  const patient = (await api('GET', `/api/v1/cco-patient-master/patient?patientId=${encodeURIComponent(patientId)}`)).patient;
  if (!patient) throw new Error('Patient saknas');

  const journal = await api('GET', `/api/v1/cco-journal/entries?patientId=${encodeURIComponent(patientId)}`);
  const health = (journal.entries || []).filter((e) => e.journalType === 'health_declaration');
  if (health.length <= 1) {
    console.log(`${patient.displayName}: inga dubbletter (${health.length} st)`);
    return;
  }

  const sorted = [...health].sort(
    (a, b) => Date.parse(b.signedAt || b.updatedAt || 0) - Date.parse(a.signedAt || a.updatedAt || 0)
  );
  const keep = sorted[0];
  const remove = sorted.slice(1);

  console.log(`${patient.displayName}: behåller ${keep.entryId} (${keep.signedAt || keep.updatedAt})`);
  for (const entry of remove) {
    console.log(`  tar bort ${entry.entryId} (${entry.signedAt || entry.updatedAt})`);
    if (!dryRun) {
      await api(
        'DELETE',
        `/api/v1/cco-journal/entry?patientId=${encodeURIComponent(patientId)}&entryId=${encodeURIComponent(entry.entryId)}`
      );
    }
  }

  if (dryRun) {
    console.log('DRY_RUN — inget raderat');
  } else {
    const after = await api('GET', `/api/v1/cco-journal/entries?patientId=${encodeURIComponent(patientId)}`);
    const count = (after.entries || []).filter((e) => e.journalType === 'health_declaration').length;
    console.log(`Klart. Hälsodeklarationer kvar: ${count}`);
  }
})();
NODE
