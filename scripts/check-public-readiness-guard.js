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

function normalizeOrigin(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\/+$/, '').toLowerCase();
}

function resolveOriginFromBaseUrl(baseUrl) {
  try {
    return normalizeOrigin(new URL(String(baseUrl || '').trim()).origin);
  } catch {
    return '';
  }
}

function normalizeRoutePath(value, fallback = '/healthz') {
  const input = normalizeText(value);
  if (!input) return fallback;
  return input.startsWith('/') ? input : `/${input}`;
}

function buildCorsStrictEnvRecommendation({ baseUrl, corsValue } = {}) {
  const origins = [];
  const pushOrigin = (value) => {
    const origin = normalizeOrigin(value);
    if (!origin || origins.includes(origin)) return;
    origins.push(origin);
  };
  if (corsValue && typeof corsValue === 'object' && !Array.isArray(corsValue)) {
    const effectiveOrigins = Array.isArray(corsValue.effectiveOrigins)
      ? corsValue.effectiveOrigins
      : [];
    for (const origin of effectiveOrigins) pushOrigin(origin);
  }
  pushOrigin(resolveOriginFromBaseUrl(baseUrl));
  if (origins.length === 0) return null;
  return {
    origins,
    envLine: `CORS_STRICT=true CORS_ALLOW_NO_ORIGIN=false CORS_ALLOWED_ORIGINS=${origins.join(',')}`,
  };
}

function toValuePreview(value, maxLen = 220) {
  if (value === undefined || value === null) return '';
  let raw = '';
  if (typeof value === 'string') raw = value;
  else if (typeof value === 'number' || typeof value === 'boolean') raw = String(value);
  else {
    try {
      raw = JSON.stringify(value);
    } catch {
      raw = '[unserializable]';
    }
  }
  const trimmed = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}

const CHECK_HINTS = Object.freeze({
  owner_mfa_enforced: [
    'Kör owner-setup per konto: BASE_URL=<url> ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run owner:mfa:setup',
    'Om MFA-kod/secret/recovery saknas: sätt ARCANA_BOOTSTRAP_RESET_OWNER_MFA=true i runtime env, deploya en gång, kör owner:mfa:setup och sätt sedan tillbaka till false.',
    'Emergency fallback (disable icke-MFA OWNER där minst en compliant OWNER finns): BASE_URL=<url> ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run owner:mfa:remediate -- --apply',
    'Verifiera sedan igen: BASE_URL=<url> ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run preflight:readiness:guard',
  ],
  cors_strict: [
    'Sätt CORS_STRICT=true, CORS_ALLOW_NO_ORIGIN=false och säkerställ minst en effektiv origin via CORS_ALLOWED_ORIGINS eller PUBLIC_BASE_URL/ARCANA_BRAND_BY_HOST.',
    'Verifiera i readiness att effectiveAllowedOrigins > 0 och kör guard igen.',
  ],
  cors_runtime_probe: [
    'Kör runtime-probe mot publik miljö för att verifiera att tillåten origin får ACAO-header och otillåten origin blockeras.',
    'Om probe failar: verifiera CORS-middleware, reverse proxy och att requests går till rätt host/baseUrl.',
  ],
});

function splitCsv(value, fallback = []) {
  const raw = normalizeText(value);
  if (!raw) return [...fallback];
  return raw
    .split(',')
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function uniqueList(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function resolveRequestedChecks({
  checksById,
  explicitChecks = [],
  useRequiredChecks = false,
}) {
  const out = [];
  const seen = new Set();
  const pushCheck = (value) => {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };

  let expandRequired = Boolean(useRequiredChecks);
  for (const rawCheck of Array.isArray(explicitChecks) ? explicitChecks : []) {
    const checkId = normalizeText(rawCheck);
    if (!checkId) continue;
    if (checkId === 'required') {
      expandRequired = true;
      continue;
    }
    pushCheck(checkId);
  }

  if (expandRequired) {
    for (const check of Array.from(checksById.values())) {
      if (check?.required !== true) continue;
      pushCheck(check.checkId);
    }
  }

  return out;
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
    useRequiredChecks: parseBoolean(
      process.env.ARCANA_PREFLIGHT_READINESS_USE_REQUIRED_CHECKS,
      false
    ),
    failStatuses: splitCsv(
      process.env.ARCANA_PREFLIGHT_READINESS_FAIL_STATUSES || 'red',
      ['red']
    ),
    allowMissing: parseBoolean(process.env.ARCANA_PREFLIGHT_READINESS_ALLOW_MISSING, false),
    showOwnerMfaGaps: parseBoolean(
      process.env.ARCANA_PREFLIGHT_READINESS_SHOW_OWNER_MFA_GAPS,
      true
    ),
    corsRuntimeProbe: parseBoolean(
      process.env.ARCANA_PREFLIGHT_READINESS_CORS_RUNTIME_PROBE,
      true
    ),
    corsProbePath: normalizeRoutePath(
      process.env.ARCANA_PREFLIGHT_READINESS_CORS_PROBE_PATH || '/healthz',
      '/healthz'
    ),
    reportFile: normalizeText(process.env.ARCANA_PREFLIGHT_READINESS_REPORT_FILE || ''),
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
    if (item === '--use-required-checks') {
      args.useRequiredChecks = true;
      continue;
    }
    if (item === '--no-use-required-checks') {
      args.useRequiredChecks = false;
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
    if (item === '--show-owner-mfa-gaps') {
      args.showOwnerMfaGaps = true;
      continue;
    }
    if (item === '--no-show-owner-mfa-gaps') {
      args.showOwnerMfaGaps = false;
      continue;
    }
    if (item === '--cors-runtime-probe') {
      args.corsRuntimeProbe = true;
      continue;
    }
    if (item === '--no-cors-runtime-probe') {
      args.corsRuntimeProbe = false;
      continue;
    }
    if (item === '--cors-probe-path') {
      args.corsProbePath = normalizeRoutePath(argv[index + 1], args.corsProbePath);
      index += 1;
      continue;
    }
    if (item === '--report-file') {
      args.reportFile = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }
  }

  return args;
}

async function writeJsonReport(filePath, payload) {
  const resolvedPath = normalizeText(filePath);
  if (!resolvedPath) return null;
  const absolutePath = path.resolve(resolvedPath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return absolutePath;
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

async function fetchCorsProbeHeaders(baseUrl, routePath, origin) {
  const headers = {};
  if (origin) headers.Origin = origin;
  const response = await fetch(`${baseUrl}${routePath}`, {
    method: 'GET',
    headers,
  });
  return {
    status: Number(response.status || 0),
    accessControlAllowOrigin: normalizeText(response.headers.get('access-control-allow-origin')),
    vary: normalizeText(response.headers.get('vary')),
  };
}

async function runCorsRuntimeProbe({
  baseUrl,
  routePath = '/healthz',
}) {
  const allowedOrigin = resolveOriginFromBaseUrl(baseUrl);
  const normalizedPath = normalizeRoutePath(routePath, '/healthz');
  const deniedOrigin = `https://forbidden-${Date.now()}.arcana.invalid`;

  if (!allowedOrigin) {
    return {
      ok: false,
      skipped: true,
      reason: 'invalid_base_url_origin',
      path: normalizedPath,
      allowedOrigin: null,
      deniedOrigin,
      allowed: null,
      denied: null,
    };
  }

  try {
    const [allowed, denied] = await Promise.all([
      fetchCorsProbeHeaders(baseUrl, normalizedPath, allowedOrigin),
      fetchCorsProbeHeaders(baseUrl, normalizedPath, deniedOrigin),
    ]);

    const allowedHeader = normalizeOrigin(allowed.accessControlAllowOrigin);
    const deniedHeader = normalizeOrigin(denied.accessControlAllowOrigin);
    const allowedOriginMatched = allowedHeader === allowedOrigin;
    const deniedOriginBlocked = !deniedHeader;

    return {
      ok: allowedOriginMatched && deniedOriginBlocked,
      skipped: false,
      reason: null,
      path: normalizedPath,
      allowedOrigin,
      deniedOrigin,
      allowedOriginMatched,
      deniedOriginBlocked,
      allowed,
      denied,
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      reason: normalizeText(error?.message || 'cors_runtime_probe_failed') || 'cors_runtime_probe_failed',
      path: normalizedPath,
      allowedOrigin,
      deniedOrigin,
      allowedOriginMatched: false,
      deniedOriginBlocked: false,
      allowed: null,
      denied: null,
    };
  }
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
      resolvedMfaSecret = normalizeText(authStep?.mfa?.secret) || '';
    }
    if (!providedCode && !resolvedMfaSecret) {
      resolvedMfaSecret = await readMfaSecretFromStore({
        email,
        authStorePath,
      });
    }
    const generatedCode = providedCode || generateTotpCode(resolvedMfaSecret);
    if (!generatedCode) {
      throw new Error(
        'MFA krävs men saknar kod. Sätt --mfa-code eller --mfa-secret / ARCANA_OWNER_MFA_CODE (eller AUTH_STORE_PATH med lokal mfaSecret). Om recovery saknas helt: gör kontrollerad reset med ARCANA_BOOTSTRAP_RESET_OWNER_MFA=true och deploy.'
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

function extractOwnerMfaGapReport(membersPayload) {
  const members = Array.isArray(membersPayload?.members) ? membersPayload.members : [];
  const owners = members.filter((item) => {
    const membershipRole = normalizeText(item?.membership?.role).toUpperCase();
    const membershipStatus = normalizeText(item?.membership?.status).toLowerCase();
    return membershipRole === 'OWNER' && membershipStatus === 'active';
  });
  const missing = owners
    .filter((item) => !item?.user?.mfaRequired || !item?.user?.mfaConfigured)
    .map((item) => ({
      email: normalizeText(item?.user?.email) || '-',
      mfaRequired: item?.user?.mfaRequired === true,
      mfaConfigured: item?.user?.mfaConfigured === true,
      membershipId: normalizeText(item?.membership?.id) || '-',
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  return {
    activeOwners: owners.length,
    missingOwners: missing.length,
    missing,
  };
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
        value: check?.value ?? null,
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
  if (
    (!Array.isArray(args.checks) || args.checks.length === 0) &&
    args.useRequiredChecks !== true
  ) {
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
  const resolvedChecks = resolveRequestedChecks({
    checksById,
    explicitChecks: uniqueList(args.checks),
    useRequiredChecks: args.useRequiredChecks === true,
  });
  if (resolvedChecks.length === 0) {
    throw new Error(
      'Inga checks kunde väljas. Använd --checks <id1,id2> och/eller --use-required-checks (eller "required" i --checks).'
    );
  }
  const failStatuses = new Set(
    args.failStatuses.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)
  );
  const failures = [];
  const summary = [];
  const failedCheckIds = new Set();

  for (const checkId of resolvedChecks) {
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
        valuePreview: toValuePreview(check.value),
        value: check.value,
        categoryId: check.categoryId,
        categoryLabel: check.categoryLabel,
      });
      failedCheckIds.add(checkId);
    }
  }

  let corsRuntimeProbe = null;
  if (args.corsRuntimeProbe && resolvedChecks.includes('cors_strict')) {
    const corsCheck = checksById.get('cors_strict') || null;
    const corsCheckStatus = normalizeText(corsCheck?.status).toLowerCase() || 'missing';
    if (corsCheckStatus === 'green') {
      corsRuntimeProbe = await runCorsRuntimeProbe({
        baseUrl,
        routePath: args.corsProbePath,
      });
    } else {
      corsRuntimeProbe = {
        ok: false,
        skipped: true,
        reason: `cors_strict_${corsCheckStatus}`,
        path: normalizeRoutePath(args.corsProbePath, '/healthz'),
        allowedOrigin: resolveOriginFromBaseUrl(baseUrl) || null,
        deniedOrigin: null,
        allowedOriginMatched: false,
        deniedOriginBlocked: false,
        allowed: null,
        denied: null,
      };
    }
    const probeStatus = corsRuntimeProbe.skipped
      ? 'unknown'
      : corsRuntimeProbe.ok
        ? 'green'
        : 'red';
    summary.push(`cors_runtime_probe=${probeStatus}`);
    if (failStatuses.has(probeStatus)) {
      failures.push({
        checkId: 'cors_runtime_probe',
        status: probeStatus,
        target: 'Tillåten origin ska få ACAO-header, otillåten origin ska blockeras utan ACAO-header.',
        evidence: corsRuntimeProbe?.reason || null,
        valuePreview: toValuePreview(corsRuntimeProbe),
        value: corsRuntimeProbe,
        categoryId: corsCheck?.categoryId || null,
        categoryLabel: corsCheck?.categoryLabel || null,
      });
      failedCheckIds.add('cors_runtime_probe');
    }
  }

  let ownerGapReport = null;
  if (args.showOwnerMfaGaps && failedCheckIds.has('owner_mfa_enforced')) {
    try {
      const membersPayload = await fetchJson(baseUrl, '/api/v1/users/staff', {
        token: auth.token,
      });
      ownerGapReport = extractOwnerMfaGapReport(membersPayload);
    } catch (error) {
      ownerGapReport = {
        error: normalizeText(error?.message || 'kunde inte läsa users/staff'),
      };
    }
  }

  const corsStrictFailure =
    failures.find((item) => normalizeText(item?.checkId) === 'cors_strict') || null;
  const corsStrictRecommendation = corsStrictFailure
    ? buildCorsStrictEnvRecommendation({
        baseUrl,
        corsValue: corsStrictFailure.value,
      })
    : null;

  const goAllowed = readiness?.goNoGo?.allowed === true ? 'yes' : 'no';
  const band = normalizeText(readiness?.band) || '-';
  const score = Number(readiness?.score || 0);
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    auth: {
      tenantId: auth.authTenantId || tenantId || null,
    },
    readiness: {
      generatedAt: readiness?.generatedAt || null,
      score,
      band,
      goAllowed: readiness?.goNoGo?.allowed === true,
    },
    checks: {
      requested: uniqueList(args.checks),
      useRequiredChecks: args.useRequiredChecks === true,
      resolved: resolvedChecks,
      failStatuses: Array.from(failStatuses),
      summary,
    },
    failures,
    failedCheckIds: Array.from(failedCheckIds),
    corsRuntimeProbe,
    ownerMfaGapReport: ownerGapReport,
    recommendations: {
      corsStrictEnv: corsStrictRecommendation?.envLine || null,
      corsStrictOrigins: Array.isArray(corsStrictRecommendation?.origins)
        ? corsStrictRecommendation.origins
        : [],
    },
    outcome: failures.length > 0 ? 'blocked' : 'passed',
  };
  let reportFilePath = null;
  let reportWriteError = '';
  if (normalizeText(args.reportFile)) {
    try {
      reportFilePath = await writeJsonReport(args.reportFile, report);
    } catch (error) {
      reportWriteError =
        normalizeText(error?.message || 'report_write_failed') || 'report_write_failed';
    }
  }
  process.stdout.write(`Readiness guard: ${baseUrl}\n`);
  process.stdout.write(
    `  score=${Number(score.toFixed(2))} band=${band} goAllowed=${goAllowed} checks=${summary.join(', ')}\n`
  );
  process.stdout.write(
    `  resolvedChecks: count=${resolvedChecks.length} ids=${resolvedChecks.slice(0, 12).join(',')}${resolvedChecks.length > 12 ? ',…' : ''}\n`
  );
  if (reportFilePath) {
    process.stdout.write(`  reportFile=${reportFilePath}\n`);
  }
  if (reportWriteError) {
    process.stdout.write(`  reportFileError=${reportWriteError}\n`);
  }
  if (corsRuntimeProbe) {
    const probeStatus = corsRuntimeProbe.skipped
      ? 'unknown'
      : corsRuntimeProbe.ok
        ? 'green'
        : 'red';
    process.stdout.write(
      `  corsProbe: status=${probeStatus} path=${corsRuntimeProbe.path || args.corsProbePath} allowedOrigin=${corsRuntimeProbe.allowedOrigin || '-'}\n`
    );
  }

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
      if (item.valuePreview) process.stdout.write(`    value: ${item.valuePreview}\n`);
      if (item.message) process.stdout.write(`    detail: ${item.message}\n`);
      const hints = Array.isArray(CHECK_HINTS[item.checkId]) ? CHECK_HINTS[item.checkId] : [];
      for (const hint of hints.slice(0, 3)) {
        process.stdout.write(`    hint: ${hint}\n`);
      }
      if (
        item.checkId === 'cors_strict' &&
        item.value &&
        typeof item.value === 'object' &&
        !Array.isArray(item.value)
      ) {
        const configuredCount = Number(
          item.value?.configuredAllowedOrigins ?? item.value?.allowedOrigins ?? 0
        );
        const effectiveCount = Number(
          item.value?.effectiveAllowedOrigins ?? item.value?.allowedOrigins ?? 0
        );
        const effectiveOrigins = Array.isArray(item.value?.effectiveOrigins)
          ? item.value.effectiveOrigins.slice(0, 5)
          : [];
        process.stdout.write(
          `    corsStrictDetail: configuredAllowedOrigins=${configuredCount} effectiveAllowedOrigins=${effectiveCount}\n`
        );
        if (effectiveOrigins.length > 0) {
          process.stdout.write(`    corsStrictEffectiveOrigins: ${effectiveOrigins.join(', ')}\n`);
        }
        const recommendation = buildCorsStrictEnvRecommendation({
          baseUrl,
          corsValue: item.value,
        });
        if (recommendation) {
          process.stdout.write(
            `    corsStrictRecommendedOrigins: ${recommendation.origins.join(', ')}\n`
          );
          process.stdout.write(`    corsStrictEnv: ${recommendation.envLine}\n`);
        }
      }
      if (
        item.checkId === 'cors_runtime_probe' &&
        item.value &&
        typeof item.value === 'object' &&
        !Array.isArray(item.value)
      ) {
        process.stdout.write(
          `    corsProbeDetail: path=${item.value?.path || '-'} allowedOrigin=${item.value?.allowedOrigin || '-'} deniedOrigin=${item.value?.deniedOrigin || '-'}\n`
        );
        process.stdout.write(
          `    corsProbeMatch: allowedOriginMatched=${item.value?.allowedOriginMatched ? 'yes' : 'no'} deniedOriginBlocked=${item.value?.deniedOriginBlocked ? 'yes' : 'no'}\n`
        );
        const allowedHeader = normalizeText(item.value?.allowed?.accessControlAllowOrigin);
        const deniedHeader = normalizeText(item.value?.denied?.accessControlAllowOrigin);
        if (allowedHeader || deniedHeader) {
          process.stdout.write(
            `    corsProbeHeaders: allowed='${allowedHeader || '-'}' denied='${deniedHeader || '-'}'\n`
          );
        }
      }
      if (item.checkId === 'owner_mfa_enforced' && ownerGapReport) {
        if (ownerGapReport?.error) {
          process.stdout.write(`    ownerMfaGap: kunde inte hämta detaljer (${ownerGapReport.error})\n`);
        } else {
          process.stdout.write(
            `    ownerMfaGap: activeOwners=${Number(ownerGapReport.activeOwners || 0)} missing=${Number(ownerGapReport.missingOwners || 0)}\n`
          );
          const preview = Array.isArray(ownerGapReport.missing)
            ? ownerGapReport.missing.slice(0, 10)
            : [];
          for (const owner of preview) {
            process.stdout.write(
              `      - ${owner.email} required=${owner.mfaRequired ? 'yes' : 'no'} configured=${owner.mfaConfigured ? 'yes' : 'no'} membershipId=${owner.membershipId}\n`
            );
          }
          if (Array.isArray(ownerGapReport.missing) && ownerGapReport.missing.length > preview.length) {
            process.stdout.write(
              `      ... +${ownerGapReport.missing.length - preview.length} fler konton\n`
            );
          }
        }
      }
    }
    process.exitCode = 2;
    return;
  }

  process.stdout.write('✅ Readiness guard passed.\n');
}

main().catch(async (error) => {
  const message = normalizeText(error?.message || error) || 'unknown_error';
  let reportFilePath = '';
  let reportWriteError = '';
  try {
    const args = parseArgs(process.argv.slice(2));
    const baseUrl = normalizeBaseUrl(args.baseUrl);
    if (normalizeText(args.reportFile)) {
      reportFilePath =
        (await writeJsonReport(args.reportFile, {
          generatedAt: new Date().toISOString(),
          baseUrl,
          auth: {
            tenantId: normalizeText(args.tenantId) || null,
          },
          checks: {
            requested: uniqueList(args.checks),
            useRequiredChecks: args.useRequiredChecks === true,
            failStatuses: uniqueList(args.failStatuses),
          },
          failures: [
            {
              checkId: 'auth_login',
              status: 'error',
              message,
            },
          ],
          failedCheckIds: ['auth_login'],
          outcome: 'error',
          error: message,
        })) || '';
    }
  } catch (reportError) {
    reportWriteError = normalizeText(reportError?.message || reportError);
  }
  console.error('❌ Could not run readiness guard');
  console.error(message);
  if (reportFilePath) {
    console.error(`  reportFile=${reportFilePath}`);
  }
  if (reportWriteError) {
    console.error(`  reportFileError=${reportWriteError}`);
  }
  process.exit(1);
});
