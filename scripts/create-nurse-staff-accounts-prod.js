#!/usr/bin/env node
/**
 * Skapar staff-konton för sköterskorna med resourceId-koppling.
 *
 * Koden för staff-skapande finns redan: POST /users/staff accepterar
 * resourceId och validerar mot bokningsmotorn (assertResourceIdExists).
 * Det här skriptet är bara en bekväm wrapper — körs när Fazli har bestämt
 * lösenorden. LÄSANDE i default-läge: --dry-run visar vad som skulle skapas.
 *
 * Usage:
 *   node scripts/create-nurse-staff-accounts-prod.js --dry-run
 *   node scripts/create-nurse-staff-accounts-prod.js            # kräver env
 *
 * Kräver env:
 *   ARCANA_SMOKE_BEARER_TOKEN eller fungerande owner-login (.env),
 *   samt lösenord per person (nedan).
 */
require('dotenv').config({ quiet: true });
const { execSync } = require('node:child_process');
const path = require('node:path');

const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');
const TENANT = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';
const DRY_RUN = !process.argv.includes('--commit');

const NURSES = [
  {
    name: 'Veronica',
    email: process.env.NURSE_VERONICA_EMAIL,
    password: process.env.NURSE_VERONICA_PASSWORD,
    resourceId: 'veronica',
  },
  {
    name: 'Clara',
    email: process.env.NURSE_CLARA_EMAIL,
    password: process.env.NURSE_CLARA_PASSWORD,
    resourceId: 'clara',
  },
  {
    name: 'Louise',
    email: process.env.NURSE_LOUISE_EMAIL,
    password: process.env.NURSE_LOUISE_PASSWORD,
    resourceId: 'louise',
  },
  {
    name: 'Wendela',
    email: process.env.NURSE_WENDELA_EMAIL,
    password: process.env.NURSE_WENDELA_PASSWORD,
    resourceId: 'wendela',
  },
];

function getOwnerToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}" --owner`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function main() {
  const incomplete = NURSES.filter((n) => !n.email || !n.password);
  if (incomplete.length) {
    console.error('❌ Saknar email/lösenord för:', incomplete.map((n) => n.name).join(', '));
    console.error('Sätt NURSE_<NAMN>_EMAIL + NURSE_<NAMN>_PASSWORD i .env');
    process.exit(1);
  }

  console.log(`${DRY_RUN ? 'DRY-RUN' : 'SKAPAR'} staff-konton @ ${BASE} (tenant ${TENANT})`);
  console.log('');

  const token = DRY_RUN ? '' : getOwnerToken();
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-arcana-client': 'major_arcana_admin',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  for (const nurse of NURSES) {
    const payload = {
      tenantId: TENANT,
      email: nurse.email,
      password: nurse.password,
      displayName: nurse.name,
      role: 'staff',
      resourceId: nurse.resourceId,
      mustChangePassword: true,
    };
    if (DRY_RUN) {
      console.log(
        `  [dry-run] skulle skapa ${nurse.name} (${nurse.email}) med resourceId=${nurse.resourceId}`
      );
      continue;
    }
    const res = await fetch(`${BASE}/api/v1/users/staff`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    const ok = res.status === 200 || res.status === 201;
    console.log(
      `  ${ok ? '✅' : '❌'} ${nurse.name} (${nurse.email}): HTTP ${res.status} ${body.error || body.message || ''}`
    );
    if (!ok) {
      console.error('    payload:', JSON.stringify(payload));
    }
  }

  if (DRY_RUN) {
    console.log(
      '\nKör med --commit för att faktiskt skapa kontona (kräver owner-token + NURSE_* env).'
    );
  }
}

main().catch((err) => {
  console.error('❌', err.message || err);
  process.exit(1);
});
