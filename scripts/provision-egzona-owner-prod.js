#!/usr/bin/env node
/**
 * Provisionera Egzona som OWNER + sätt resourceId på Fazli och Egzona i prod.
 *
 * Beslut (Fazli): "jag Fazli och Egzona OWNER på båda, vi bedriver företaget".
 * Detta skript:
 *   1. Egzona (egzona@hairtpclinic.com): skapar konto om det saknas
 *      (STAFF + resourceId=egzona + mustChangePassword=true), befordrar sedan
 *      till OWNER. Om kontot redan finns: sätter resourceId=egzona och
 *      role=OWNER (ingen lösenordsändring).
 *   2. Fazli: sätter resourceId=fazli på befintlig membership (rör INTE
 *      lösenord, roll eller status).
 *   3. Verifierar via GET /users/staff och skriver ut roll+resourceId.
 *
 * SÄKERHET: lösenord och token skrivs ALDRIG till stdout. Token hämtas via
 * get-prod-auth-token.js --owner --no-fallback (execSync). Egzonas tillfälliga
 * lösenord skrivs endast till en 0600-fil utanför repot.
 *
 * Usage:
 *   node scripts/provision-egzona-owner-prod.js --dry-run   # nuvarande tillstånd + plan
 *   node scripts/provision-egzona-owner-prod.js --commit    # utför + verifiera
 */
require('dotenv').config({ quiet: true });

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');
const TENANT = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';
const COMMIT = process.argv.includes('--commit');

const EGZONA_EMAIL = (process.env.EGZONA_EMAIL || 'egzona@hairtpclinic.com').trim().toLowerCase();
const FAZLI_EMAIL = (
  process.env.FAZLI_EMAIL ||
  process.env.ARCANA_OWNER_EMAIL ||
  'fazli@hairtpclinic.com'
)
  .trim()
  .toLowerCase();
const EGZONA_RESOURCE = (process.env.EGZONA_RESOURCE || 'egzona').trim().toLowerCase();
const FAZLI_RESOURCE = (process.env.FAZLI_RESOURCE || 'fazli').trim().toLowerCase();

const PW_FILE =
  process.env.EGZONA_PW_FILE ||
  path.join(process.env.HOME || '/tmp', 'cco-egzona-owner-initial-password.txt');

function generatePassword() {
  // 24 tecken, base64url. Tvingas bytas vid första inloggning.
  return crypto.randomBytes(18).toString('base64url');
}

function logSafe(value) {
  return String(value).replace(/[A-Za-z0-9_-]{8,}/g, (m) => `${m.slice(0, 4)}…`);
}

function getOwnerToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  // --owner --no-fallback: kräver OWNER. Token skrivs aldrig ut.
  return execSync(
    `node "${path.join(__dirname, 'get-prod-auth-token.js')}" --owner --no-fallback`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
}

async function request(pathname, { method = 'GET', token = '', body } = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'x-arcana-client': 'major_arcana_admin',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function listMembers(token) {
  const { status, data } = await request('/api/v1/users/staff', { token });
  if (status !== 200) {
    throw new Error(`GET /users/staff → HTTP ${status}: ${logSafe(data.error || '')}`);
  }
  return Array.isArray(data.members) ? data.members : [];
}

function rowsFor(members, email) {
  return members.filter(
    (m) => String(m?.user?.email || '').toLowerCase() === email.toLowerCase()
  );
}

function describe(m) {
  const mem = m?.membership || {};
  const user = m?.user || {};
  return {
    email: user.email,
    role: mem.role || '(ingen)',
    status: mem.status || '(ingen)',
    resourceId: mem.resourceId || '(saknas)',
    membershipId: mem.id,
  };
}

async function main() {
  const token = getOwnerToken();
  const members = await listMembers(token);

  const egzonaRows = rowsFor(members, EGZONA_EMAIL);
  const fazliRows = rowsFor(members, FAZLI_EMAIL);

  const egzona = egzonaRows[0]?.membership;
  const fazli = fazliRows[0]?.membership;

  console.log(`CCO provisioning @ ${BASE} (tenant ${TENANT})`);
  console.log(`  Egzona: ${EGZONA_EMAIL}  → OWNER, resourceId=${EGZONA_RESOURCE}`);
  console.log(`  Fazli : ${FAZLI_EMAIL}   → resourceId=${FAZLI_RESOURCE} (roll/orätt lösenord rörs ej)`);
  console.log('');

  // ---- Plan ----
  let egzonaAction;
  let fazliAction;
  if (!egzona) {
    egzonaAction = 'create_staff_then_promote_owner';
  } else {
    const role = String(egzona.role || '').toUpperCase();
    const res = String(egzona.resourceId || '').toLowerCase();
    const needsRole = role !== 'OWNER';
    const needsRes = res !== EGZONA_RESOURCE;
    egzonaAction = needsRole || needsRes ? 'patch' : 'ok';
  }
  if (!fazli) {
    fazliAction = 'missing';
  } else {
    fazliAction =
      String(fazli.resourceId || '').toLowerCase() !== FAZLI_RESOURCE ? 'patch_resource' : 'ok';
  }

  console.log('Nuvarande tillstånd:');
  console.log(`  Egzona: ${egzona ? describe(egzonaRows[0]).role : '(konto saknas)'}` +
    (egzona ? ` / resourceId=${describe(egzonaRows[0]).resourceId}` : ''));
  console.log(`  Fazli : ${fazli ? describe(fazliRows[0]).role : '(konto saknas)'}` +
    (fazli ? ` / resourceId=${describe(fazliRows[0]).resourceId}` : ''));
  console.log('');
  console.log(`Plan: Egzona → ${egzonaAction}; Fazli → ${fazliAction}`);
  console.log('');

  if (!COMMIT) {
    console.log('DRY-RUN — inga ändringar gjorda. Kör med --commit för att utföra.');
    return;
  }

  // ---- Commit ----
  if (egzonaAction === 'create_staff_then_promote_owner') {
    const password = generatePassword();
    // Skriv lösenordsfilen FÖRE anropen (0600, aldrig i repot).
    fs.writeFileSync(PW_FILE, `egzona: ${password}\n`, { mode: 0o600 });
    fs.chmodSync(PW_FILE, 0o600);
    console.log(`✅ Egzonas initiala lösenord sparat (0600): ${PW_FILE}`);

    const created = await request('/api/v1/users/staff', {
      method: 'POST',
      token,
      body: {
        tenantId: TENANT,
        email: EGZONA_EMAIL,
        password,
        resourceId: EGZONA_RESOURCE,
        mustChangePassword: true,
      },
    });
    if (created.status !== 200 && created.status !== 201) {
      throw new Error(
        `POST /users/staff (Egzona) → HTTP ${created.status}: ${logSafe(created.data.error || '')}`
      );
    }
    const membershipId = created.data?.membership?.id;
    if (!membershipId) throw new Error('Egzona skapades utan membershipId.');
    console.log(`✅ Egzona konto skapat (STAFF, resourceId=${EGZONA_RESOURCE}), membershipId=${logSafe(membershipId)}`);

    const promoted = await request(`/api/v1/users/staff/${membershipId}`, {
      method: 'PATCH',
      token,
      body: { role: 'OWNER' },
    });
    if (promoted.status !== 200) {
      throw new Error(
        `PATCH role=OWNER (Egzona) → HTTP ${promoted.status}: ${logSafe(promoted.data.error || '')}`
      );
    }
    console.log('✅ Egzona befordrad till OWNER.');
  } else if (egzonaAction === 'patch') {
    const patch = {};
    if (String(egzona.role || '').toUpperCase() !== 'OWNER') patch.role = 'OWNER';
    if (String(egzona.resourceId || '').toLowerCase() !== EGZONA_RESOURCE) {
      patch.resourceId = EGZONA_RESOURCE;
    }
    const res = await request(`/api/v1/users/staff/${egzona.id}`, {
      method: 'PATCH',
      token,
      body: patch,
    });
    if (res.status !== 200) {
      throw new Error(`PATCH Egzona → HTTP ${res.status}: ${logSafe(res.data.error || '')}`);
    }
    console.log(`✅ Egzona uppdaterad (${Object.keys(patch).join(', ')}).`);
  } else {
    console.log('✓ Egzona redan OWNER med rätt resourceId.');
  }

  if (fazliAction === 'missing') {
    console.log('⚠️  Fazli-konto hittades inte — inget att uppdatera.');
  } else if (fazliAction === 'patch_resource') {
    const res = await request(`/api/v1/users/staff/${fazli.id}`, {
      method: 'PATCH',
      token,
      body: { resourceId: FAZLI_RESOURCE },
    });
    if (res.status !== 200) {
      throw new Error(`PATCH Fazli → HTTP ${res.status}: ${logSafe(res.data.error || '')}`);
    }
    console.log('✅ Fazli resourceId=fazli satt.');
  } else {
    console.log('✓ Fazli har redan resourceId=fazli.');
  }

  // ---- Verify ----
  const after = await listMembers(token);
  console.log('');
  console.log('Verifiering (GET /users/staff):');
  for (const email of [EGZONA_EMAIL, FAZLI_EMAIL]) {
    const rows = rowsFor(after, email);
    if (!rows.length) {
      console.log(`  ❌ ${email}: saknas`);
      continue;
    }
    for (const r of rows) {
      const d = describe(r);
      console.log(`  ${email} → role=${d.role}, status=${d.status}, resourceId=${d.resourceId}`);
    }
  }

  console.log('');
  console.log('Nästa steg för Egzona (manuellt): byt lösenord vid första inloggning och aktivera MFA.');
}

main().catch((err) => {
  console.error('❌', logSafe(err.message || err));
  process.exit(1);
});
