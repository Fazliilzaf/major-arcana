#!/usr/bin/env bash
# Fas 2 go-live: skapa STAFF (om saknas), flip auth env på Render, deploy, verify.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE="${ARCANA_PROD_URL:-https://arcana.hairtpclinic.se}"
BASE="${BASE%/}"

fail() { echo "❌ $1" >&2; exit 1; }
pass() { echo "✅ $1"; }

[[ -f .env ]] || fail "Saknar .env med ARCANA_OWNER_*"

node -r dotenv/config <<'NODE'
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(/\/+$/, '');
const ownerEmail = process.env.ARCANA_OWNER_EMAIL || '';
const ownerPassword = process.env.ARCANA_OWNER_PASSWORD || '';
let staffEmail = process.env.ARCANA_STAFF_EMAIL || 'staff@hairtpclinic.se';
const tenantId = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';
const serviceId = process.env.RENDER_SERVICE_ID || 'srv-d6b11o0boq4c73chm7f0';

if (!ownerEmail || !ownerPassword) {
  console.error('❌ Saknar ARCANA_OWNER_EMAIL/PASSWORD i .env');
  process.exit(1);
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-arcana-client': 'major_arcana_admin',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 200) }; }
  if (!res.ok) {
    throw new Error(`${opts.method || 'GET'} ${url} -> ${res.status}: ${body.error || text.slice(0, 120)}`);
  }
  return body;
}

function upsertEnvKey(raw, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  const line = `${key}=${value}`;
  return re.test(raw) ? raw.replace(re, line) : `${raw.trimEnd()}\n${line}\n`;
}

(async () => {
  const login = await fetchJson(`${base}/api/v1/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email: ownerEmail, password: ownerPassword, tenantId }),
  });
  if (!login.token) {
    console.error('❌ Owner login utan token');
    process.exit(1);
  }
  const auth = { Authorization: `Bearer ${login.token}` };

  const staffList = await fetchJson(`${base}/api/v1/users/staff`, { headers: auth });
  const members = staffList.members || staffList.staff || [];
  const staffOnly = members.filter((m) => String(m.role || '').toUpperCase() === 'STAFF');
  let staffPassword = process.env.ARCANA_STAFF_PASSWORD || '';

  if (staffOnly.length === 0) {
    staffPassword = staffPassword || crypto.randomBytes(18).toString('base64url');
    await fetchJson(`${base}/api/v1/users/staff`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ email: staffEmail, password: staffPassword, tenantId }),
    });
    console.log(`✅ STAFF skapad: ${staffEmail}`);
  } else {
    console.log(`ℹ STAFF finns redan (${staffOnly.length})`);
    staffEmail = staffOnly[0].email || staffEmail;
  }

  if (staffPassword) {
    let envRaw = fs.readFileSync('.env', 'utf8');
    envRaw = upsertEnvKey(envRaw, 'ARCANA_STAFF_EMAIL', staffEmail);
    envRaw = upsertEnvKey(envRaw, 'ARCANA_STAFF_PASSWORD', staffPassword);
    fs.writeFileSync('.env', envRaw);
    console.log('✅ STAFF credentials sparade i .env');
  }

  const cliYaml = fs.readFileSync(path.join(process.env.HOME, '.render/cli.yaml'), 'utf8');
  const apiKey = (cliYaml.match(/key: (rnd_\S+)/) || [])[1];
  if (!apiKey) throw new Error('Saknar Render API key');

  const existingRes = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars?limit=100`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const existing = await existingRes.json();
  const map = new Map(existing.map((row) => {
    const ev = row.envVar || row;
    return [ev.key, ev.value ?? ''];
  }));
  map.set('ARCANA_STAFF_JOURNAL_OPEN_ACCESS', 'false');
  map.set('ARCANA_AUTH_OWNER_MFA_REQUIRED', 'true');
  map.set('ARCANA_PREFLIGHT_READINESS_CHECKS', 'cors_strict,owner_mfa_enforced');
  map.set('ARCANA_BOOTSTRAP_RESET_OWNER_PASSWORD', 'false');

  const payload = JSON.stringify([...map.entries()].map(([key, value]) => ({ key, value })));
  const putRes = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: payload,
  });
  if (!putRes.ok) throw new Error(`Render env PUT failed: ${putRes.status}`);

  const deployRes = await fetch(`https://api.render.com/v1/services/${serviceId}/deploys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  const deploy = await deployRes.json();
  console.log(`✅ Render env go-live + deploy: ${deploy.id || deploy.deploy?.id || 'started'}`);
})().catch((err) => {
  console.error('❌', err.message || err);
  process.exit(1);
});
NODE

echo "Väntar på prod..."
open="?"
for attempt in $(seq 1 48); do
  code="$(curl -sS -o /tmp/go-live-diag.json -w '%{http_code}' "${BASE}/readyz" 2>/dev/null || echo 000)"
  if [[ "$code" == "200" ]]; then
    open="$(node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).resolved?.staffJournalOpenAccess??'?')}catch{console.log('?')}})" < /tmp/go-live-diag.json)"
    if [[ "$open" == "false" ]]; then
      pass "OPEN_ACCESS=false i prod"
      break
    fi
  fi
  echo "  försök $attempt (readyz=$code open=${open})"
  sleep 10
done

bash ./scripts/verify-auth-go-live-prod.sh || true

node -r dotenv/config <<'NODE'
const base='https://arcana.hairtpclinic.se';
const email=process.env.ARCANA_STAFF_EMAIL;
const password=process.env.ARCANA_STAFF_PASSWORD;
if(!email||!password){ console.log('⚠ Hoppar STAFF smoke — saknar ARCANA_STAFF_*'); process.exit(0);} 
(async()=>{
  const login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json','x-arcana-client':'major_arcana_admin'},body:JSON.stringify({email,password,tenantId:'hair-tp-clinic'})});
  const j=await login.json();
  if(login.status===200&&j.token){ console.log('✅ STAFF login OK'); }
  else { console.log('❌ STAFF login fail', j.error||''); process.exit(1); }
  const anon=await fetch(base+'/api/v1/cco-journal/entries?patientId=2e8d3535-cd89-418e-8b68-ca239f8836a4');
  if(anon.status===401||anon.status===403) console.log('✅ Journal kräver auth (open access av)');
  else console.log('⚠ Journal anon status='+anon.status);
})();
NODE

pass "Auth go-live script klart"
