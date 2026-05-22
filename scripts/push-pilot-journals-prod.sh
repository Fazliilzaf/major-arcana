#!/usr/bin/env bash
# Synka lokala journalposter (t.ex. pilot) till prod via öppen journal-API.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${BASE_URL:-https://arcana.hairtpclinic.se}"
BASE_URL="${BASE_URL%/}"
PILOT_JSON="${PILOT_JSON:-./data/pilot-patients.json}"
JOURNAL_JSON="${JOURNAL_JSON:-./data/cco-journal.json}"
CLIENT_HEADER='x-arcana-client: major_arcana_admin'

fail() { echo "❌ $1"; exit 1; }
pass() { echo "✅ $1"; }

[[ -f "$PILOT_JSON" && -f "$JOURNAL_JSON" ]] || fail "Saknar pilot- eller journaldata."

node - "$BASE_URL" "$PILOT_JSON" "$JOURNAL_JSON" <<'NODE'
const fs = require('fs');
const https = require('https');
const http = require('http');

const baseUrl = process.argv[2];
const pilot = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const journal = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
const ids = new Set(pilot.patientIds || []);
const entries = (journal.entries || []).filter((e) => ids.has(e.patientId));

if (!entries.length) {
  console.error('Inga journalposter för pilotkunder.');
  process.exit(1);
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const lib = url.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : '';
    const req = lib.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-arcana-client': 'major_arcana_admin',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`${method} ${path} -> ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          resolve(data ? JSON.parse(data) : {});
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  let ok = 0;
  for (const entry of entries) {
    const payload = {
      ...entry,
      patientId: entry.patientId,
      entryId: entry.entryId || entry.id,
    };
    await request('PUT', '/api/v1/cco-journal/entry', payload);
    ok += 1;
    if (ok % 10 === 0) process.stdout.write(`  ${ok}/${entries.length}\n`);
  }
  console.log(`✅ Synkade ${ok} journalposter till prod`);
})();
NODE
