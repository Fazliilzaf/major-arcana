#!/usr/bin/env node
/**
 * Skapa/uppdatera STAFF-konton för sjuksköterskor i prod.
 * Kräver OWNER i .env (med MFA). Sätter mustChangePassword så första login = välj eget lösenord.
 *
 *   node scripts/provision-nurse-staff-prod.js
 *   node scripts/provision-nurse-staff-prod.js --dry-run
 */
require('dotenv').config({ quiet: true });

const crypto = require('node:crypto');
const { buildMfaVerifyAttempts } = require('./lib/mfa-totp');

const dryRun = process.argv.includes('--dry-run');
const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(/\/+$/, '');
const tenantId = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';

const NURSES = [
  { name: 'Clara Rebas', email: 'clara@hairtpclinic.com' },
  { name: 'Louise Blom', email: 'louise@hairtpclinic.com' },
  { name: 'Veronica Eklöv', email: 'veronica@hairtpclinic.com' },
  { name: 'Wendela', email: 'wendela@hairtpclinic.com' },
];

async function fetchJson(path, opts = {}, attempt = 1) {
  const res = await fetch(`${base}${path}`, {
    ...opts,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-arcana-client': 'major_arcana_admin',
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `${res.status}`);
    err.status = res.status;
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
      /* try next code */
    }
  }
  throw new Error('MFA verify misslyckades');
}

function buildInvite({ name, email, password }) {
  return [
    `Hej ${name},`,
    '',
    'Du har nu konto i Major Arcana för journalföring.',
    `Inloggning (mobil): ${base}/staff`,
    `Klinik: ${tenantId}`,
    `E-post: ${email}`,
    `Tillfälligt lösenord: ${password}`,
    '',
    'Första gången:',
    '1. Logga in med tillfälligt lösenord',
    '2. Välj eget lösenord',
    '3. Logga in igen med ditt nya lösenord',
    '',
    'Ingen MFA eller extra verifiering krävs.',
  ].join('\n');
}

async function main() {
  console.log(`Provision nurse STAFF @ ${base}${dryRun ? ' (dry-run)' : ''}`);

  if (dryRun) {
    for (const nurse of NURSES) {
      const password = crypto.randomBytes(12).toString('base64url');
      console.log(`\n--- ${nurse.name} (${nurse.email}) ---`);
      console.log(buildInvite({ ...nurse, password }));
    }
    return;
  }

  const token = await loginOwnerWithMfa();
  const auth = { Authorization: `Bearer ${token}` };
  const invites = [];

  for (const nurse of NURSES) {
    const password = crypto.randomBytes(12).toString('base64url');
    const result = await fetchJson('/api/v1/users/staff', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        email: nurse.email,
        password,
        tenantId,
        mustChangePassword: true,
      }),
    });
    const action = result.createdUser ? 'skapad' : 'uppdaterad';
    console.log(`✅ ${nurse.name} ${action} (${nurse.email})`);
    invites.push(buildInvite({ ...nurse, password }));
  }

  console.log('\n=== Inbjudningar (skicka till varje sjuksköterska) ===\n');
  console.log(invites.join('\n\n---\n\n'));
}

main().catch((err) => {
  console.error('❌', err.message || err);
  process.exit(1);
});
