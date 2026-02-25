#!/usr/bin/env node
require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBaseUrl(value) {
  const input = String(value || '').trim();
  if (!input) return 'http://localhost:3000';
  return input.replace(/\/+$/, '');
}

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    email: process.env.ARCANA_OWNER_EMAIL || '',
    password: process.env.ARCANA_OWNER_PASSWORD || '',
    tenantId: process.env.ARCANA_DEFAULT_TENANT || '',
    mfaCode: process.env.ARCANA_OWNER_MFA_CODE || '',
    mfaSecret: process.env.ARCANA_OWNER_MFA_SECRET || '',
    authStorePath: process.env.AUTH_STORE_PATH || './data/auth.json',
    apply: parseBoolean(process.env.ARCANA_OWNER_MFA_REMEDIATE_APPLY, false),
    detailsLimit: Number.parseInt(String(process.env.ARCANA_OWNER_MFA_REMEDIATE_DETAILS_LIMIT || '20'), 10),
  };

  if (!Number.isFinite(args.detailsLimit) || args.detailsLimit <= 0) {
    args.detailsLimit = 20;
  }
  args.detailsLimit = Math.max(1, Math.min(100, args.detailsLimit));

  for (let index = 0; index < argv.length; index += 1) {
    const item = normalizeText(argv[index] || '');
    if (item === '--base-url') {
      args.baseUrl = normalizeText(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (item === '--email') {
      args.email = normalizeText(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (item === '--password') {
      args.password = String(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (item === '--tenant') {
      args.tenantId = normalizeText(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (item === '--mfa-code') {
      args.mfaCode = normalizeText(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (item === '--mfa-secret') {
      args.mfaSecret = normalizeText(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (item === '--auth-store-path') {
      args.authStorePath = normalizeText(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (item === '--apply') {
      args.apply = true;
      continue;
    }
    if (item === '--dry-run') {
      args.apply = false;
      continue;
    }
    if (item === '--details-limit') {
      const parsed = Number.parseInt(String(argv[index + 1] || ''), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.detailsLimit = Math.max(1, Math.min(100, parsed));
      }
      index += 1;
      continue;
    }
  }

  return args;
}

function generateTotpCode(secretRaw) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const secret = String(secretRaw || '')
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, '');
  if (!secret) return '';

  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of secret) {
    const idx = alphabet.indexOf(char);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }

  const key = Buffer.from(bytes);
  if (!key.length) return '';

  const counter = Math.floor(Date.now() / 1000 / 30);
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  msg.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, '0');
  return code;
}

async function fetchJson(baseUrl, routePath, { method = 'GET', token = '', body } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${routePath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || `HTTP ${response.status}` };
  }
  if (!response.ok) {
    const error = new Error(data?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

async function readMfaSecretFromStore({ email = '', authStorePath = './data/auth.json' } = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return '';
  const filePath = path.resolve(String(authStorePath || './data/auth.json'));
  try {
    const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const users = raw && raw.users && typeof raw.users === 'object' ? Object.values(raw.users) : [];
    const user =
      users.find(
        (item) => String(item?.email || '').trim().toLowerCase() === normalizedEmail
      ) || null;
    return String(user?.mfaSecret || '').trim();
  } catch {
    return '';
  }
}

async function resolveToken({
  baseUrl,
  email,
  password,
  tenantId = '',
  mfaCode = '',
  mfaSecret = '',
  authStorePath = './data/auth.json',
}) {
  const loginResponse = await fetchJson(baseUrl, '/api/v1/auth/login', {
    method: 'POST',
    body: {
      email,
      password,
      tenantId: tenantId || undefined,
    },
  });

  if (loginResponse?.token) {
    return {
      token: String(loginResponse.token),
      authTenantId: String(loginResponse?.tenantId || tenantId || ''),
    };
  }

  let authStep = loginResponse;
  if (authStep?.requiresMfa === true) {
    const providedCode = String(mfaCode || '').trim();
    let resolvedMfaSecret = String(mfaSecret || '').trim();
    if (!providedCode && !resolvedMfaSecret) {
      resolvedMfaSecret = await readMfaSecretFromStore({
        email,
        authStorePath,
      });
    }
    const generatedCode = providedCode || generateTotpCode(resolvedMfaSecret);
    if (!generatedCode) {
      throw new Error(
        'MFA krävs men saknar kod. Sätt --mfa-code eller --mfa-secret / ARCANA_OWNER_MFA_CODE (eller AUTH_STORE_PATH med lokal mfaSecret).'
      );
    }
    const mfaTicket = String(authStep?.mfaTicket || '').trim();
    if (!mfaTicket) {
      throw new Error('MFA krävs men mfaTicket saknas i login-svaret.');
    }
    authStep = await fetchJson(baseUrl, '/api/v1/auth/mfa/verify', {
      method: 'POST',
      body: {
        mfaTicket,
        code: generatedCode,
        tenantId: tenantId || undefined,
      },
    });
  }

  if (authStep?.token) {
    return {
      token: String(authStep.token),
      authTenantId: String(authStep?.tenantId || tenantId || ''),
    };
  }

  if (authStep?.requiresTenantSelection === true) {
    const loginTicket = String(authStep?.loginTicket || '').trim();
    const tenants = Array.isArray(authStep?.tenants) ? authStep.tenants : [];
    const selectedTenantId =
      String(tenantId || '').trim() ||
      String(tenants?.[0]?.tenantId || '').trim();
    if (!loginTicket || !selectedTenantId) {
      throw new Error('Tenant-val krävs men loginTicket/tenantId saknas.');
    }
    const tenantResponse = await fetchJson(baseUrl, '/api/v1/auth/select-tenant', {
      method: 'POST',
      body: {
        loginTicket,
        tenantId: selectedTenantId,
      },
    });
    if (!tenantResponse?.token) {
      throw new Error('Kunde inte hämta token efter tenant-val.');
    }
    return {
      token: String(tenantResponse.token),
      authTenantId: String(tenantResponse?.tenantId || selectedTenantId),
    };
  }

  throw new Error('Login gav ingen token.');
}

function classifyOwners(membersPayload) {
  const members = Array.isArray(membersPayload?.members) ? membersPayload.members : [];
  const activeOwners = members
    .filter((item) => {
      const role = normalizeText(item?.membership?.role).toUpperCase();
      const status = normalizeText(item?.membership?.status).toLowerCase();
      return role === 'OWNER' && status === 'active';
    })
    .map((item) => ({
      email: normalizeText(item?.user?.email) || '-',
      userId: normalizeText(item?.user?.id) || '',
      mfaRequired: item?.user?.mfaRequired === true,
      mfaConfigured: item?.user?.mfaConfigured === true,
      membershipId: normalizeText(item?.membership?.id) || '',
      membershipStatus: normalizeText(item?.membership?.status).toLowerCase() || 'active',
      role: normalizeText(item?.membership?.role).toUpperCase() || 'OWNER',
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  const compliant = activeOwners.filter((item) => item.mfaRequired && item.mfaConfigured);
  const nonCompliant = activeOwners.filter((item) => !item.mfaRequired || !item.mfaConfigured);

  const canDisableNonCompliant = compliant.length >= 1;
  const disableCandidates = canDisableNonCompliant
    ? nonCompliant.filter((item) => item.membershipId)
    : [];

  return {
    activeOwners,
    compliant,
    nonCompliant,
    disableCandidates,
    canDisableNonCompliant,
  };
}

function printOwnerList(title, owners, limit = 20) {
  process.stdout.write(`${title} (${owners.length})\n`);
  const preview = owners.slice(0, limit);
  for (const owner of preview) {
    process.stdout.write(
      `  - ${owner.email} required=${owner.mfaRequired ? 'yes' : 'no'} configured=${owner.mfaConfigured ? 'yes' : 'no'} membershipId=${owner.membershipId || '-'}\n`
    );
  }
  if (owners.length > preview.length) {
    process.stdout.write(`  ... +${owners.length - preview.length} fler\n`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = normalizeBaseUrl(args.baseUrl);
  const email = normalizeText(args.email);
  const password = String(args.password || '');
  const tenantId = normalizeText(args.tenantId);

  if (!email || !password) {
    throw new Error(
      'Saknar credentials. Sätt ARCANA_OWNER_EMAIL och ARCANA_OWNER_PASSWORD (eller --email/--password).'
    );
  }

  const auth = await resolveToken({
    baseUrl,
    email,
    password,
    tenantId,
    mfaCode: args.mfaCode,
    mfaSecret: args.mfaSecret,
    authStorePath: args.authStorePath,
  });

  const membersBefore = await fetchJson(baseUrl, '/api/v1/users/staff', {
    token: auth.token,
  });
  const reportBefore = classifyOwners(membersBefore);

  process.stdout.write(`OWNER MFA remediation: ${baseUrl}\n`);
  process.stdout.write(
    `  tenant=${auth.authTenantId || tenantId || '-'} apply=${args.apply ? 'yes' : 'no'}\n`
  );
  process.stdout.write(
    `  activeOwners=${reportBefore.activeOwners.length} compliant=${reportBefore.compliant.length} nonCompliant=${reportBefore.nonCompliant.length} disableCandidates=${reportBefore.disableCandidates.length}\n`
  );

  if (reportBefore.nonCompliant.length > 0) {
    printOwnerList('Non-compliant OWNER accounts', reportBefore.nonCompliant, args.detailsLimit);
  } else {
    process.stdout.write('No non-compliant OWNER accounts found.\n');
  }

  if (!reportBefore.canDisableNonCompliant && reportBefore.nonCompliant.length > 0) {
    process.stdout.write(
      '⚠️ Ingen disable-remediation möjlig: minst en MFA-kompatibel aktiv OWNER krävs för säker fallback.\n'
    );
  }

  if (!args.apply) {
    process.stdout.write('\n');
    process.stdout.write('Preview mode only. Lägg till --apply för att disable candidates.\n');
    return;
  }

  let disabledCount = 0;
  const disabled = [];
  const skipped = [];
  for (const candidate of reportBefore.disableCandidates) {
    try {
      if (!candidate.membershipId) {
        skipped.push({
          email: candidate.email,
          reason: 'missing_membership_id',
        });
        continue;
      }
      await fetchJson(baseUrl, `/api/v1/users/staff/${candidate.membershipId}`, {
        method: 'PATCH',
        token: auth.token,
        body: {
          status: 'disabled',
        },
      });
      disabledCount += 1;
      disabled.push({
        email: candidate.email,
        membershipId: candidate.membershipId,
      });
    } catch (error) {
      skipped.push({
        email: candidate.email,
        membershipId: candidate.membershipId,
        reason: normalizeText(error?.message || 'patch_failed') || 'patch_failed',
      });
    }
  }

  const membersAfter = await fetchJson(baseUrl, '/api/v1/users/staff', {
    token: auth.token,
  });
  const reportAfter = classifyOwners(membersAfter);

  process.stdout.write('\n');
  process.stdout.write(
    `Applied: disabled=${disabledCount} skipped=${skipped.length} remainingNonCompliant=${reportAfter.nonCompliant.length}\n`
  );
  if (disabled.length > 0) {
    process.stdout.write('Disabled OWNER memberships:\n');
    for (const item of disabled.slice(0, args.detailsLimit)) {
      process.stdout.write(`  - ${item.email} membershipId=${item.membershipId}\n`);
    }
  }
  if (skipped.length > 0) {
    process.stdout.write('Skipped:\n');
    for (const item of skipped.slice(0, args.detailsLimit)) {
      process.stdout.write(
        `  - ${item.email || '-'} membershipId=${item.membershipId || '-'} reason=${item.reason || 'unknown'}\n`
      );
    }
  }
}

main().catch((error) => {
  console.error('❌ Kunde inte köra OWNER MFA remediation');
  console.error(error?.message || error);
  process.exit(1);
});

