#!/usr/bin/env node
'use strict';

/**
 * Re-enable staff@ on prod: upsert STAFF user + reset password from .env.
 *
 *   node scripts/reactivate-staff-prod.js
 */
require('dotenv').config({ quiet: true });

const crypto = require('node:crypto');
const { execSync } = require('node:child_process');
const { buildMfaVerifyAttempts } = require('./lib/mfa-totp');

const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(/\/+$/, '');
const tenantId = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';
const staffEmail = process.env.ARCANA_STAFF_EMAIL || 'staff@hairtpclinic.se';
let staffPassword = process.env.ARCANA_STAFF_PASSWORD || '';

async function fetchJson(path, opts = {}) {
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

async function ownerToken() {
  try {
    return execSync('node scripts/get-prod-auth-token.js --owner', { encoding: 'utf8' }).trim();
  } catch {
    const email = process.env.ARCANA_OWNER_EMAIL || '';
    const password = process.env.ARCANA_OWNER_PASSWORD || '';
    const login = await fetchJson('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, tenantId }),
    });
    if (login.token) return login.token;
    if (!login.requiresMfa || !login.mfaTicket) throw new Error(login.error || 'owner login failed');
    for (const code of buildMfaVerifyAttempts({
      mfaSecret: process.env.ARCANA_OWNER_MFA_SECRET,
      mfaRecoveryCode: process.env.ARCANA_OWNER_MFA_RECOVERY_CODE,
    })) {
      try {
        const verified = await fetchJson('/api/v1/auth/mfa/verify', {
          method: 'POST',
          body: JSON.stringify({ mfaTicket: login.mfaTicket, code, tenantId }),
        });
        if (verified.token) return verified.token;
      } catch {
        /* next */
      }
    }
    throw new Error('owner MFA failed');
  }
}

async function main() {
  if (!staffPassword) {
    staffPassword = crypto.randomBytes(16).toString('base64url');
    console.log(`Generated STAFF password (save to .env): ${staffPassword}`);
  }

  const token = await ownerToken();
  const auth = { Authorization: `Bearer ${token}` };

  const result = await fetchJson('/api/v1/users/staff', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      email: staffEmail,
      password: staffPassword,
      tenantId,
      mustChangePassword: false,
    }),
  });

  console.log(`✅ STAFF upsert: ${staffEmail} (createdUser=${Boolean(result.createdUser)})`);

  const login = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-arcana-client': 'major_arcana_admin',
    },
    body: JSON.stringify({ email: staffEmail, password: staffPassword, tenantId }),
  });
  const body = await login.json();
  if (login.status === 200 && body.token) {
    console.log('✅ STAFF login verify PASS');
    return;
  }
  console.error('❌ STAFF login verify FAIL', login.status, body.error || body);
  process.exit(1);
}

main().catch((err) => {
  console.error('❌', err.message || err);
  process.exit(1);
});
