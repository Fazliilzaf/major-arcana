#!/usr/bin/env node
/**
 * Skapa OWNER-konto i prod (Major Arcana CCO/Arcana).
 *
 * Använder den befintliga staff-provisioneringsflödet:
 *   1. Logga in som befintlig OWNER (MFA via .env).
 *   2. POST /api/v1/users/staff för att skapa nytt STAFF-konto med
 *      slumpmässigt tillfälligt lösenord + mustChangePassword=true.
 *   3. PATCH /api/v1/users/staff/:membershipId för att sätta role=OWNER.
 *   4. Skriv ut det tillfälliga lösenordet EN gång på stdout. Vidarebefordra
 *      det säkert (t.ex. Signal/1Password) till den nya användaren. Hen
 *      måste byta lösenord vid första inloggning och aktivera MFA direkt.
 *
 * Kräver i .env:
 *   ARCANA_OWNER_EMAIL, ARCANA_OWNER_PASSWORD, ARCANA_OWNER_MFA_SECRET
 *   (samma som provision-nurse-staff-prod.js använder)
 *
 * Användning:
 *   node scripts/provision-owner-prod.js --email egzona@hairtpclinic.com
 *   node scripts/provision-owner-prod.js --email NY@... --dry-run
 */
require('dotenv').config({ quiet: true });

const crypto = require('node:crypto');
const { buildMfaVerifyAttempts } = require('./lib/mfa-totp');

function argVal(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : '';
}

const newEmail = argVal('--email').toLowerCase().trim();
const dryRun = process.argv.includes('--dry-run');
const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(/\/+$/, '');
const tenantId = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';

if (!newEmail || !newEmail.includes('@')) {
  console.error('Användning: --email NY@EPOST [--dry-run]');
  process.exit(1);
}

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${base}${path}`, {
    ...opts,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function loginOwnerWithMfa() {
  const email = process.env.ARCANA_OWNER_EMAIL || '';
  const password = process.env.ARCANA_OWNER_PASSWORD || '';
  const mfaSecret = process.env.ARCANA_OWNER_MFA_SECRET || '';
  const mfaRecoveryCode = process.env.ARCANA_OWNER_MFA_RECOVERY_CODE || '';
  if (!email || !password) throw new Error('saknar ARCANA_OWNER_EMAIL/PASSWORD i .env');

  const login = await fetchJson('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, tenantId }),
  });
  if (login.token) return login.token;
  if (!login.requiresMfa || !login.mfaTicket) {
    throw new Error(login.error || 'owner login utan token/MFA');
  }

  for (const code of buildMfaVerifyAttempts({ mfaSecret, mfaRecoveryCode })) {
    try {
      const verified = await fetchJson('/api/v1/auth/mfa/verify', {
        method: 'POST',
        body: JSON.stringify({ mfaTicket: login.mfaTicket, code, tenantId }),
      });
      if (verified.token) return verified.token;
      if (verified.requiresTenantSelection && verified.loginTicket) {
        const selected = await fetchJson('/api/v1/auth/select-tenant', {
          method: 'POST',
          body: JSON.stringify({ loginTicket: verified.loginTicket, tenantId }),
        });
        if (selected.token) return selected.token;
      }
    } catch {
      /* nästa kod */
    }
  }
  throw new Error('MFA verify misslyckades');
}

function genTempPassword() {
  // 24 tecken, base64url. Tvingas bytas vid första inloggning.
  return crypto.randomBytes(18).toString('base64url');
}

async function main() {
  console.log(`[provision-owner] mål: ${newEmail} -> OWNER på tenant ${tenantId}`);
  if (dryRun) console.log('[provision-owner] DRY-RUN: ingen ändring i prod.');

  const token = await loginOwnerWithMfa();
  console.log('[provision-owner] OWNER-login OK.');

  if (dryRun) {
    console.log('[provision-owner] DRY-RUN: skulle nu POSTa /users/staff och PATCHa till OWNER.');
    return;
  }

  const tempPassword = genTempPassword();

  const created = await fetchJson('/api/v1/users/staff', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      email: newEmail,
      password: tempPassword,
      tenantId,
      mustChangePassword: true,
    }),
  });
  const membershipId = created?.membership?.id;
  if (!membershipId) {
    throw new Error('skapad utan membershipId: ' + JSON.stringify(created));
  }
  console.log('[provision-owner] STAFF-konto skapat. membershipId:', membershipId);

  const promoted = await fetchJson(`/api/v1/users/staff/${membershipId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ role: 'OWNER' }),
  });
  console.log('[provision-owner] Befordrad till OWNER:', promoted?.membership?.role || '(ok)');

  console.log('\n=== TEMPORÄRT LÖSENORD (skicka SÄKERT till ' + newEmail + ') ===');
  console.log(tempPassword);
  console.log('========================================================');
  console.log('Den nya användaren MÅSTE byta lösenord vid första inloggning (mustChangePassword=true).');
  console.log('Aktivera MFA direkt efter första inloggning (setup-owner-mfa.js eller via UI).');
}

main().catch((err) => {
  console.error('[provision-owner] FEL:', err.message || err);
  if (err.body) console.error(err.body);
  process.exit(1);
});
