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

function toStampUtc(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '-',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('');
}

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    email: process.env.ARCANA_OWNER_EMAIL || '',
    password: process.env.ARCANA_OWNER_PASSWORD || '',
    tenantId: process.env.ARCANA_DEFAULT_TENANT || '',
    outFile: process.env.ARCANA_SCHEDULER_SUITE_OUT || '',
    mfaCode: process.env.ARCANA_OWNER_MFA_CODE || '',
    mfaSecret: process.env.ARCANA_OWNER_MFA_SECRET || '',
    authStorePath: process.env.AUTH_STORE_PATH || './data/auth.json',
    failOnNoGo: parseBoolean(process.env.ARCANA_OPS_SUITE_FAIL_ON_NO_GO, false),
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
    if (item === '--out') {
      args.outFile = String(argv[index + 1] || '').trim();
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
    if (item === '--fail-on-no-go') {
      args.failOnNoGo = true;
      continue;
    }
    if (item === '--no-fail-on-no-go') {
      args.failOnNoGo = false;
      continue;
    }
  }

  return args;
}

function normalizeBaseUrl(value) {
  const input = String(value || '').trim();
  if (!input) return 'http://localhost:3000';
  return input.replace(/\/+$/, '');
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
      authFlow: 'login_token',
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
      authFlow: authStep?.requiresMfa ? 'mfa_token' : 'post_login_token',
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
      authFlow: 'tenant_selection',
    };
  }

  throw new Error('Login gav ingen token.');
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

  const defaultOutFile = path.join(
    'data',
    'reports',
    `Scheduler_Suite_${toStampUtc()}.json`
  );
  const outFile = String(args.outFile || defaultOutFile).trim();

  const auth = await resolveToken({
    baseUrl,
    email,
    password,
    tenantId,
    mfaCode: args.mfaCode,
    mfaSecret: args.mfaSecret,
    authStorePath: args.authStorePath,
  });

  const suiteResponse = await fetchJson(baseUrl, '/api/v1/ops/scheduler/run', {
    method: 'POST',
    token: auth.token,
    body: {
      jobId: 'required_suite',
      tenantId: auth.authTenantId || tenantId || undefined,
    },
  });
  const monitorStatus = await fetchJson(baseUrl, '/api/v1/monitor/status', {
    token: auth.token,
  });
  const readiness = await fetchJson(baseUrl, '/api/v1/monitor/readiness', {
    token: auth.token,
  });
  const slo = await fetchJson(baseUrl, '/api/v1/monitor/slo', {
    token: auth.token,
  });

  const artifact = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    auth: {
      flow: auth.authFlow,
      tenantId: auth.authTenantId || tenantId || null,
    },
    schedulerSuite: suiteResponse,
    monitor: {
      status: {
        generatedAt: monitorStatus?.generatedAt || null,
        kpis: monitorStatus?.kpis || {},
        gates: monitorStatus?.gates || {},
      },
      readiness: {
        generatedAt: readiness?.generatedAt || null,
        score: Number(readiness?.score || 0),
        band: readiness?.band || null,
        goNoGo: readiness?.goNoGo || null,
        remediationSummary: readiness?.remediation?.summary || null,
      },
      slo: {
        generatedAt: slo?.generatedAt || null,
        summary: slo?.summary || {},
        slos: Array.isArray(slo?.slos) ? slo.slos : [],
      },
    },
  };

  const outAbs = path.resolve(outFile);
  await fs.mkdir(path.dirname(outAbs), { recursive: true });
  await fs.writeFile(outAbs, JSON.stringify(artifact, null, 2), 'utf8');

  const suiteTotal = Number(suiteResponse?.suite?.total || 0);
  const suiteFailed = Number(suiteResponse?.suite?.failed || 0);
  const suiteSucceeded = Number(suiteResponse?.suite?.succeeded || 0);
  const readinessScore = Number(readiness?.score || 0);
  const readinessBand = String(readiness?.band || '-');
  const goAllowed = readiness?.goNoGo?.allowed === true ? 'yes' : 'no';
  const pilotHealthy = monitorStatus?.gates?.pilotReport?.healthy === true ? 'yes' : 'no';
  const restoreHealthy = monitorStatus?.gates?.restoreDrill?.healthy === true ? 'yes' : 'no';
  const sloOverall = String(slo?.summary?.overallStatus || '-');
  const failOnNoGo = Boolean(args.failOnNoGo);
  const strictFailures = [];
  if (suiteResponse?.ok !== true) strictFailures.push('scheduler suite not fully successful');
  if (readiness?.goNoGo?.allowed !== true) strictFailures.push('readiness go/no-go is not allowed');
  if (monitorStatus?.gates?.pilotReport?.noGo === true) strictFailures.push('pilot report gate is no-go');
  if (monitorStatus?.gates?.restoreDrill?.noGo === true) strictFailures.push('restore drill gate is no-go');
  if (sloOverall === 'red' || sloOverall === 'unknown') {
    strictFailures.push(`slo overall status is ${sloOverall}`);
  }

  process.stdout.write(`✅ Scheduler suite körd: ${baseUrl}\n`);
  process.stdout.write(
    `   suite: succeeded=${suiteSucceeded}/${suiteTotal} failed=${suiteFailed}\n`
  );
  process.stdout.write(
    `   readiness: score=${Number(readinessScore.toFixed(2))} band=${readinessBand} goAllowed=${goAllowed}\n`
  );
  process.stdout.write(
    `   gates: pilotReportHealthy=${pilotHealthy} restoreHealthy=${restoreHealthy} sloOverall=${sloOverall}\n`
  );
  process.stdout.write(
    `   strictMode: failOnNoGo=${failOnNoGo ? 'yes' : 'no'} failures=${strictFailures.length}\n`
  );
  if (strictFailures.length > 0) {
    for (const reason of strictFailures) {
      process.stdout.write(`   - ${reason}\n`);
    }
  }
  process.stdout.write(`   artifact: ${outAbs}\n`);

  if (failOnNoGo && strictFailures.length > 0) {
    process.exitCode = 2;
    return;
  }
  if (suiteResponse?.ok !== true) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('❌ Kunde inte köra scheduler-suite');
  console.error(error?.message || error);
  process.exit(1);
});
