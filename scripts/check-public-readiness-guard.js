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

function splitCsv(value, fallback = []) {
  const raw = normalizeText(value);
  if (!raw) return [...fallback];
  return raw
    .split(',')
    .map((item) => normalizeText(item))
    .filter(Boolean);
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
    checks: splitCsv(
      process.env.ARCANA_PREFLIGHT_READINESS_CHECKS || 'owner_mfa_enforced,cors_strict',
      ['owner_mfa_enforced', 'cors_strict']
    ),
    failStatuses: splitCsv(
      process.env.ARCANA_PREFLIGHT_READINESS_FAIL_STATUSES || 'red',
      ['red']
    ),
    allowMissing: parseBoolean(process.env.ARCANA_PREFLIGHT_READINESS_ALLOW_MISSING, false),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = String(argv[index] || '').trim();
    if (item === '--base-url') {
      args.baseUrl = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }
    if (item === '--email') {
      args.email = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }
    if (item === '--password') {
      args.password = String(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (item === '--tenant') {
      args.tenantId = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }
    if (item === '--mfa-code') {
      args.mfaCode = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }
    if (item === '--mfa-secret') {
      args.mfaSecret = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }
    if (item === '--auth-store-path') {
      args.authStorePath = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }
    if (item === '--checks') {
      args.checks = splitCsv(argv[index + 1], args.checks);
      index += 1;
      continue;
    }
    if (item === '--fail-statuses') {
      args.failStatuses = splitCsv(argv[index + 1], args.failStatuses);
      index += 1;
      continue;
    }
    if (item === '--allow-missing') {
      args.allowMissing = true;
      continue;
    }
    if (item === '--no-allow-missing') {
      args.allowMissing = false;
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
        'MFA krävs men saknar kod. Sätt --mfa-code eller --mfa-secret / ARCANA_OWNER_MFA_CODE.'
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

  throw new Error('Login gav ingen token.');
}

function collectChecksById(readiness) {
  const map = new Map();
  const categories = Array.isArray(readiness?.categories) ? readiness.categories : [];
  for (const category of categories) {
    const categoryId = normalizeText(category?.id);
    const categoryLabel = normalizeText(category?.label);
    const checks = Array.isArray(category?.checks) ? category.checks : [];
    for (const check of checks) {
      const checkId = normalizeText(check?.id);
      if (!checkId) continue;
      map.set(checkId, {
        categoryId: categoryId || null,
        categoryLabel: categoryLabel || null,
        checkId,
        label: normalizeText(check?.label) || null,
        status: normalizeText(check?.status).toLowerCase() || 'unknown',
        required: check?.required === true,
        target: normalizeText(check?.target) || null,
        evidence: normalizeText(check?.evidence) || null,
      });
    }
  }
  return map;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = normalizeBaseUrl(args.baseUrl);
  const email = String(args.email || '').trim();
  const password = String(args.password || '');
  const tenantId = String(args.tenantId || '').trim();

  if (!email || !password) {
    throw new Error(
      'Saknar credentials. Sätt ARCANA_OWNER_EMAIL och ARCANA_OWNER_PASSWORD (eller --email/--password).'
    );
  }
  if (!Array.isArray(args.checks) || args.checks.length === 0) {
    throw new Error('Minst en readiness check krävs (--checks).');
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
  const readiness = await fetchJson(baseUrl, '/api/v1/monitor/readiness', {
    token: auth.token,
  });

  const checksById = collectChecksById(readiness);
  const failStatuses = new Set(
    args.failStatuses.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)
  );
  const failures = [];
  const summary = [];

  for (const checkId of args.checks) {
    const check = checksById.get(checkId);
    if (!check) {
      summary.push(`${checkId}=missing`);
      if (!args.allowMissing) {
        failures.push({
          checkId,
          status: 'missing',
          message: 'check missing from readiness payload',
        });
      }
      continue;
    }

    summary.push(`${checkId}=${check.status}`);
    if (failStatuses.has(check.status)) {
      failures.push({
        checkId,
        status: check.status,
        target: check.target || null,
        evidence: check.evidence || null,
        categoryId: check.categoryId,
        categoryLabel: check.categoryLabel,
      });
    }
  }

  const goAllowed = readiness?.goNoGo?.allowed === true ? 'yes' : 'no';
  const band = normalizeText(readiness?.band) || '-';
  const score = Number(readiness?.score || 0);
  process.stdout.write(`Readiness guard: ${baseUrl}\n`);
  process.stdout.write(
    `  score=${Number(score.toFixed(2))} band=${band} goAllowed=${goAllowed} checks=${summary.join(', ')}\n`
  );

  if (failures.length > 0) {
    process.stdout.write(
      `❌ Readiness guard blocker (${failures.length}) for statuses: ${Array.from(failStatuses).join(', ')}\n`
    );
    for (const item of failures) {
      process.stdout.write(
        `  - ${item.checkId} status=${item.status} category=${item.categoryId || '-'}\n`
      );
      if (item.target) process.stdout.write(`    target: ${item.target}\n`);
      if (item.evidence) process.stdout.write(`    evidence: ${item.evidence}\n`);
      if (item.message) process.stdout.write(`    detail: ${item.message}\n`);
    }
    process.exitCode = 2;
    return;
  }

  process.stdout.write('✅ Readiness guard passed.\n');
}

main().catch((error) => {
  console.error('❌ Could not run readiness guard');
  console.error(error?.message || error);
  process.exit(1);
});

