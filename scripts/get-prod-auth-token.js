#!/usr/bin/env node
/**
 * Skriv Bearer-token till stdout för prod API.
 * Default: STAFF. --owner: OWNER med MFA (.env).
 * --force: logga alltid in även om open access är explicit på.
 * --no-fallback: med --owner, avbryt om owner-login misslyckas (ingen STAFF-reserv).
 * --skip-if-open-access: returnera tom sträng endast om ARCANA_STAFF_JOURNAL_OPEN_ACCESS=true i prod env.
 */
require('dotenv').config({ quiet: true });

const { buildMfaVerifyAttempts } = require('./lib/mfa-totp');

const ownerMode = process.argv.includes('--owner');
const forceMode = process.argv.includes('--force');
const skipIfOpenAccess = process.argv.includes('--skip-if-open-access');
const base = (
  process.env.ARCANA_PROD_URL ||
  process.env.BASE_URL ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');
const tenantId = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';

async function fetchJson(path, opts = {}, attempt = 1) {
  try {
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
      const err = new Error(body.error || `${res.status}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  } catch (err) {
    const retryable = err.status >= 500 || err.status === 429 || err.code === 'ECONNRESET';
    if (retryable && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      return fetchJson(path, opts, attempt + 1);
    }
    throw err;
  }
}

async function loginOwnerWithMfa() {
  const email = process.env.ARCANA_OWNER_EMAIL || '';
  const password = process.env.ARCANA_OWNER_PASSWORD || '';
  const mfaSecret = process.env.ARCANA_OWNER_MFA_SECRET || '';
  const mfaRecoveryCode = process.env.ARCANA_OWNER_MFA_RECOVERY_CODE || '';
  if (!email || !password) throw new Error('saknar OWNER credentials');

  const login = await fetchJson('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, tenantId }),
  });
  if (login.token) return login.token;

  if (!login.requiresMfa || !login.mfaTicket) {
    throw new Error(login.error || 'owner login utan token/MFA');
  }

  const attempts = buildMfaVerifyAttempts({ mfaSecret, mfaRecoveryCode });
  let lastErr = null;
  for (const code of attempts) {
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
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('MFA verify misslyckades');
}

async function loginStaff() {
  const email = process.env.ARCANA_STAFF_EMAIL || '';
  const password = process.env.ARCANA_STAFF_PASSWORD || '';
  if (!email || !password) throw new Error('saknar STAFF credentials');
  const login = await fetchJson('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, tenantId }),
  });
  if (!login.token) throw new Error(login.error || 'staff login utan token');
  return login.token;
}

function parseEnvBool(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return null;
}

async function isStaffJournalOpenAccessExplicitOnProd() {
  try {
    const diag = await fetchJson('/api/v1/_diag/env');
    const parsed = parseEnvBool(diag.env?.ARCANA_STAFF_JOURNAL_OPEN_ACCESS);
    return parsed === true;
  } catch {
    return false;
  }
}

async function shouldSkipTokenForOpenAccess() {
  if (forceMode || ownerMode) return false;
  if (!skipIfOpenAccess) return false;
  return isStaffJournalOpenAccessExplicitOnProd();
}

async function main() {
  if (await shouldSkipTokenForOpenAccess()) {
    return;
  }

  if (ownerMode) {
    try {
      process.stdout.write(await loginOwnerWithMfa());
      return;
    } catch (ownerErr) {
      if (process.argv.includes('--no-fallback')) throw ownerErr;
      try {
        process.stderr.write(
          `get-prod-auth-token: owner login misslyckades (${ownerErr.message || ownerErr}), försöker STAFF\n`
        );
        process.stdout.write(await loginStaff());
        return;
      } catch (_staffErr) {
        throw ownerErr;
      }
    }
  }

  process.stdout.write(await loginStaff());
}

main().catch((err) => {
  process.stderr.write(`get-prod-auth-token: ${err.message || err}\n`);
  process.exit(1);
});
