#!/usr/bin/env node
/* eslint-disable no-console */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseArgs(argv) {
  const args = {
    baseUrl: normalizeText(process.env.BASE_URL || process.env.ARCANA_PUBLIC_BASE_URL) ||
      'https://arcana.hairtpclinic.se',
    tenantId: normalizeText(process.env.ARCANA_DEFAULT_TENANT) || 'hair-tp-clinic',
    email: normalizeText(process.env.ARCANA_OWNER_EMAIL),
    password: String(process.env.ARCANA_OWNER_PASSWORD || ''),
    mfaCode: normalizeText(process.env.ARCANA_OWNER_MFA_CODE),
    mfaSecret: normalizeText(process.env.ARCANA_OWNER_MFA_SECRET),
    mfaRecoveryCode: normalizeText(process.env.ARCANA_OWNER_MFA_RECOVERY_CODE),
    authStorePath: normalizeText(process.env.AUTH_STORE_PATH) || './data/auth.json',
    coverageOnly: false,
    trigger: false,
    wait: false,
    waitMinutes: 90,
    pollSeconds: 60,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = String(argv[index] || '').trim();
    if (item === '--base-url') {
      args.baseUrl = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--tenant') {
      args.tenantId = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--email') {
      args.email = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--password') {
      args.password = String(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (item === '--coverage-only') {
      args.coverageOnly = true;
      continue;
    }
    if (item === '--trigger') {
      args.trigger = true;
      continue;
    }
    if (item === '--wait') {
      args.wait = true;
      continue;
    }
    if (item === '--wait-minutes') {
      args.waitMinutes = Number(argv[index + 1] || 90);
      index += 1;
      continue;
    }
    if (item === '--poll-seconds') {
      args.pollSeconds = Number(argv[index + 1] || 60);
      index += 1;
    }
  }

  args.baseUrl = args.baseUrl.replace(/\/$/, '');
  return args;
}

function generateTotpCodeAt(secretRaw, timestampMs = Date.now()) {
  const secret = String(secretRaw || '')
    .replace(/\s+/g, '')
    .toUpperCase();
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
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
  const counter = Math.floor(Math.max(0, Number(timestampMs) || Date.now()) / 1000 / 30);
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}

function generateTotpCodes(secretRaw) {
  const secret = String(secretRaw || '').trim();
  if (!secret) return [];
  const now = Date.now();
  const codes = [];
  for (const offset of [0, -30_000, 30_000, -60_000, 60_000]) {
    const code = generateTotpCodeAt(secret, now + offset);
    if (code && !codes.includes(code)) codes.push(code);
  }
  return codes;
}

async function readMfaSecretFromStore({ email = '', authStorePath = './data/auth.json' } = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return '';
  try {
    const raw = JSON.parse(await fs.readFile(path.resolve(authStorePath), 'utf8'));
    const users = raw?.users && typeof raw.users === 'object' ? Object.values(raw.users) : [];
    const user =
      users.find((item) => String(item?.email || '').trim().toLowerCase() === normalizedEmail) ||
      null;
    return String(user?.mfaSecret || '').trim();
  } catch {
    return '';
  }
}

async function fetchJson(baseUrl, routePath, { method = 'GET', token = '', body = null } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${routePath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text || `HTTP ${response.status}` };
  }
  if (!response.ok) {
    const error = new Error(payload?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function resolveToken(args) {
  const loginResponse = await fetchJson(args.baseUrl, '/api/v1/auth/login', {
    method: 'POST',
    body: {
      email: args.email,
      password: args.password,
      tenantId: args.tenantId || undefined,
    },
  });
  if (loginResponse?.token) {
    return { token: String(loginResponse.token) };
  }
  let authStep = loginResponse;
  if (authStep?.requiresMfa === true) {
    const storeSecret = await readMfaSecretFromStore({
      email: args.email,
      authStorePath: args.authStorePath,
    });
    const attempts = [];
    if (args.mfaCode) attempts.push(args.mfaCode);
    if (args.mfaRecoveryCode) attempts.push(args.mfaRecoveryCode);
    for (const code of generateTotpCodes(args.mfaSecret)) attempts.push(code);
    for (const code of generateTotpCodes(storeSecret)) attempts.push(code);
    const uniqueAttempts = [...new Set(attempts.map((item) => String(item || '').trim()).filter(Boolean))];
    if (!uniqueAttempts.length) {
      throw new Error('MFA krävs men ingen kod/secret hittades.');
    }
    const mfaTicket = String(authStep?.mfaTicket || '').trim();
    for (const code of uniqueAttempts.slice(0, 9)) {
      try {
        authStep = await fetchJson(args.baseUrl, '/api/v1/auth/mfa/verify', {
          method: 'POST',
          body: { mfaTicket, code, tenantId: args.tenantId || undefined },
        });
        if (authStep?.token) break;
      } catch (error) {
        if (!String(error?.message || '').toLowerCase().includes('mfa')) throw error;
      }
    }
  }
  if (!authStep?.token) {
    throw new Error('Kunde inte logga in.');
  }
  return { token: String(authStep.token) };
}

async function readCoverage({ baseUrl, token, tenantId }) {
  const query = new URLSearchParams({ tenantId });
  return fetchJson(baseUrl, `/api/v1/ops/cco/enrichment/coverage?${query.toString()}`, { token });
}

async function triggerBackfill({ baseUrl, token, tenantId }) {
  return fetchJson(baseUrl, '/api/v1/ops/scheduler/run', {
    method: 'POST',
    token,
    body: {
      jobId: 'cco_inbox_enrichment_full_backfill',
      tenantId,
    },
  });
}

function printCoverage(coverage) {
  console.log(
    JSON.stringify(
      {
        ok: coverage?.ok,
        tenantId: coverage?.tenantId,
        truthConversationCount: coverage?.truthConversationCount,
        enrichedConversationCount: coverage?.enrichedConversationCount,
        gapCount: coverage?.gapCount,
        coveragePercent: coverage?.coveragePercent,
        readyForWork: coverage?.readyForWork,
        lastEnrichmentAt: coverage?.lastEnrichmentAt,
        perMailbox: coverage?.perMailbox,
        sampleUnenrichedIds: coverage?.sampleUnenrichedIds,
      },
      null,
      2
    )
  );
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.email || !args.password) {
    console.error(
      'Saknar ARCANA_OWNER_EMAIL / ARCANA_OWNER_PASSWORD. Se docs/ops/cco-fas-j-full-enrichment-backfill-plan.md.'
    );
    process.exit(1);
  }

  const auth = await resolveToken(args);
  const token = auth.token;

  if (args.trigger) {
    console.log('[cco-full-backfill] Triggering cco_inbox_enrichment_full_backfill ...');
    const runResult = await triggerBackfill({
      baseUrl: args.baseUrl,
      token,
      tenantId: args.tenantId,
    });
    console.log(JSON.stringify(runResult, null, 2));
    if (runResult?.ok !== true) {
      process.exit(2);
    }
  }

  const poll = async () => {
    const coverage = await readCoverage({
      baseUrl: args.baseUrl,
      token,
      tenantId: args.tenantId,
    });
    printCoverage(coverage);
    return coverage;
  };

  if (args.wait) {
    const deadline = Date.now() + Math.max(1, args.waitMinutes) * 60 * 1000;
    while (Date.now() < deadline) {
      const coverage = await poll();
      if (coverage?.readyForWork === true) {
        console.log('[cco-full-backfill] readyForWork=true');
        return;
      }
      await sleep(Math.max(15, args.pollSeconds) * 1000);
    }
    console.error('[cco-full-backfill] Timeout waiting for readyForWork.');
    process.exit(3);
    return;
  }

  await poll();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[cco-full-backfill] failed:', error?.message || error);
    process.exit(1);
  });
}

module.exports = { parseArgs, readCoverage, triggerBackfill };
