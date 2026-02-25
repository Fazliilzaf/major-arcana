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

function parsePositiveInt(value, fallback = 50, min = 1, max = 200) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
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

function checkSeverityRank(status) {
  const normalized = normalizeText(status).toLowerCase();
  if (normalized === 'red') return 0;
  if (normalized === 'unknown') return 1;
  if (normalized === 'yellow') return 2;
  if (normalized === 'green') return 3;
  return 4;
}

function toValuePreview(value, maxLen = 220) {
  if (value === undefined || value === null) return null;
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
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}

const BLOCKER_CHECK_HINTS = Object.freeze({
  owner_mfa_enforced: {
    owner: 'security_owner',
    playbook:
      'Run owner:mfa:setup for each active OWNER account; fallback: owner:mfa:remediate -- --apply where at least one compliant OWNER remains.',
  },
  cors_strict: {
    owner: 'platform_owner',
    playbook:
      'Set CORS_STRICT=true, CORS_ALLOW_NO_ORIGIN=false and configure CORS_ALLOWED_ORIGINS.',
  },
  cors_runtime_probe: {
    owner: 'platform_owner',
    playbook:
      'Run CORS runtime probe and verify allowed origin gets ACAO while denied origin gets no ACAO.',
  },
  rate_limits_configured: {
    owner: 'platform_owner',
    playbook: 'Set all auth/api/risk/public rate limits to values > 0.',
  },
  audit_append_only: {
    owner: 'security_owner',
    playbook: 'Set AUTH_AUDIT_APPEND_ONLY=true in runtime configuration.',
  },
  audit_integrity: {
    owner: 'security_owner',
    playbook: 'Run audit integrity verification and repair hash-chain issues.',
  },
  scheduler_enabled_started: {
    owner: 'ops_owner',
    playbook: 'Start scheduler and verify enabled=true and started=true.',
  },
  scheduler_required_jobs_enabled: {
    owner: 'ops_owner',
    playbook: 'Enable all required jobs: nightly report, backup, restore drill, alert probe.',
  },
  scheduler_job_freshness: {
    owner: 'ops_owner',
    playbook: 'Run and monitor required jobs until freshness status is green.',
  },
  restore_drill_30d: {
    owner: 'ops_owner',
    playbook: 'Run restore_drill_preview and verify successful audit event.',
  },
  nightly_pilot_report_freshness: {
    owner: 'ops_owner',
    playbook: 'Run nightly_pilot_report and verify report recency/freshness.',
  },
  gold_set_coverage: {
    owner: 'risk_owner',
    playbook: 'Increase and maintain a >=150-case calibrated gold set.',
  },
  band_accuracy: {
    owner: 'risk_owner',
    playbook: 'Tune rules/thresholds to restore band accuracy to target.',
  },
  level_accuracy: {
    owner: 'risk_owner',
    playbook: 'Tune rules/thresholds to restore level accuracy to target.',
  },
});

const NOGO_TRIGGER_HINTS = Object.freeze({
  output_without_risk_policy_gate: {
    owner: 'release_owner',
    playbook:
      'Run output-gate remediation and verify active versions include output risk + policy metadata before activation.',
  },
  policy_floor_bypass: {
    owner: 'risk_owner',
    playbook:
      'Stop activations violating policy floor, rerun risk evaluation, and reactivate only compliant versions.',
  },
  l5_without_manual_intervention: {
    owner: 'owner',
    playbook:
      'Require OWNER action (approve_exception/mark_false_positive) before any L5 template version goes live.',
  },
  restore_drill_unverified_30d: {
    owner: 'ops_owner',
    playbook:
      'Run restore_drill_preview and verify scheduler success + audit evidence within the 30-day window.',
  },
  nightly_pilot_report_unverified: {
    owner: 'ops_owner',
    playbook:
      'Run nightly_pilot_report and verify fresh scheduler success and report artifact evidence.',
  },
  audit_chain_not_immutable: {
    owner: 'security_owner',
    playbook:
      'Enable append-only audit mode and fix integrity/hash-chain issues before release.',
  },
  tenant_isolation_unverified: {
    owner: 'security_owner',
    playbook:
      'Run tenant access-check and confirm fresh tenants.access_check audit evidence.',
  },
});

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
    remediateOutputGates: parseBoolean(
      process.env.ARCANA_OPS_SUITE_REMEDIATE_OUTPUT_GATES,
      false
    ),
    remediationLimit: parsePositiveInt(process.env.ARCANA_OPS_SUITE_REMEDIATION_LIMIT, 50, 1, 200),
    remediateOwnerMfaMemberships: parseBoolean(
      process.env.ARCANA_OPS_SUITE_REMEDIATE_OWNER_MFA_MEMBERSHIPS,
      false
    ),
    ownerMfaRemediationLimit: parsePositiveInt(
      process.env.ARCANA_OPS_SUITE_OWNER_MFA_REMEDIATION_LIMIT,
      50,
      1,
      200
    ),
    refreshTenantAccessCheck: parseBoolean(
      process.env.ARCANA_OPS_SUITE_REFRESH_TENANT_ACCESS_CHECK,
      true
    ),
    corsRuntimeProbe: parseBoolean(process.env.ARCANA_OPS_SUITE_CORS_RUNTIME_PROBE, true),
    corsProbePath: normalizeRoutePath(
      process.env.ARCANA_OPS_SUITE_CORS_PROBE_PATH || '/healthz',
      '/healthz'
    ),
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
    if (item === '--remediate-output-gates') {
      args.remediateOutputGates = true;
      continue;
    }
    if (item === '--no-remediate-output-gates') {
      args.remediateOutputGates = false;
      continue;
    }
    if (item === '--remediation-limit') {
      args.remediationLimit = parsePositiveInt(argv[index + 1], args.remediationLimit, 1, 200);
      index += 1;
      continue;
    }
    if (item === '--remediate-owner-mfa-memberships') {
      args.remediateOwnerMfaMemberships = true;
      continue;
    }
    if (item === '--no-remediate-owner-mfa-memberships') {
      args.remediateOwnerMfaMemberships = false;
      continue;
    }
    if (item === '--owner-mfa-remediation-limit') {
      args.ownerMfaRemediationLimit = parsePositiveInt(
        argv[index + 1],
        args.ownerMfaRemediationLimit,
        1,
        200
      );
      index += 1;
      continue;
    }
    if (item === '--refresh-tenant-access-check') {
      args.refreshTenantAccessCheck = true;
      continue;
    }
    if (item === '--no-refresh-tenant-access-check') {
      args.refreshTenantAccessCheck = false;
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
      allowedOriginMatched: false,
      deniedOriginBlocked: false,
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

function classifyOwnerMfaMembers(membersPayload) {
  const members = Array.isArray(membersPayload?.members) ? membersPayload.members : [];
  const activeOwners = members
    .filter((item) => {
      const role = normalizeText(item?.membership?.role).toUpperCase();
      const status = normalizeText(item?.membership?.status).toLowerCase();
      return role === 'OWNER' && status === 'active';
    })
    .map((item) => ({
      email: normalizeText(item?.user?.email) || '-',
      membershipId: normalizeText(item?.membership?.id) || '',
      mfaRequired: item?.user?.mfaRequired === true,
      mfaConfigured: item?.user?.mfaConfigured === true,
    }));

  const compliantOwners = activeOwners.filter((item) => item.mfaRequired && item.mfaConfigured);
  const nonCompliantOwners = activeOwners.filter((item) => !item.mfaRequired || !item.mfaConfigured);
  const disableCandidates =
    compliantOwners.length >= 1
      ? nonCompliantOwners.filter((item) => item.membershipId)
      : [];

  return {
    activeOwners,
    compliantOwners,
    nonCompliantOwners,
    disableCandidates,
    canRemediateByDisable: compliantOwners.length >= 1,
  };
}

async function remediateOwnerMfaMemberships({
  baseUrl,
  token,
  limit = 50,
}) {
  const normalizedLimit = parsePositiveInt(limit, 50, 1, 200);
  try {
    return await fetchJson(baseUrl, '/api/v1/ops/readiness/remediate-owner-mfa-memberships', {
      method: 'POST',
      token,
      body: {
        dryRun: false,
        limit: normalizedLimit,
        detailsLimit: 5,
      },
    });
  } catch (error) {
    if (Number(error?.status || 0) !== 404) {
      throw error;
    }
  }

  const membersBefore = await fetchJson(baseUrl, '/api/v1/users/staff', {
    token,
  });
  const reportBefore = classifyOwnerMfaMembers(membersBefore);
  const candidates = reportBefore.disableCandidates.slice(0, normalizedLimit);

  const disabled = [];
  const skipped = [];
  for (const candidate of candidates) {
    if (!candidate.membershipId) {
      skipped.push({
        email: candidate.email,
        membershipId: null,
        reason: 'missing_membership_id',
      });
      continue;
    }
    try {
      await fetchJson(baseUrl, `/api/v1/users/staff/${candidate.membershipId}`, {
        method: 'PATCH',
        token,
        body: {
          status: 'disabled',
        },
      });
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
    token,
  });
  const reportAfter = classifyOwnerMfaMembers(membersAfter);

  return {
    attempted: candidates.length,
    disabledCount: disabled.length,
    skippedCount: skipped.length,
    before: {
      activeOwners: reportBefore.activeOwners.length,
      compliantOwners: reportBefore.compliantOwners.length,
      nonCompliantOwners: reportBefore.nonCompliantOwners.length,
      canRemediateByDisable: reportBefore.canRemediateByDisable,
    },
    after: {
      activeOwners: reportAfter.activeOwners.length,
      compliantOwners: reportAfter.compliantOwners.length,
      nonCompliantOwners: reportAfter.nonCompliantOwners.length,
    },
    candidatePreview: reportBefore.disableCandidates.slice(0, 5).map((item) => ({
      email: item.email,
      membershipId: item.membershipId || null,
      mfaRequired: item.mfaRequired,
      mfaConfigured: item.mfaConfigured,
    })),
    disabledPreview: disabled.slice(0, 5),
    skippedPreview: skipped.slice(0, 5),
  };
}

async function runTenantAccessCheck({
  baseUrl,
  token,
  tenantId = '',
}) {
  const normalizedTenantId = normalizeText(tenantId).toLowerCase();
  if (!normalizedTenantId) {
    return {
      enabled: true,
      attempted: false,
      ok: false,
      status: null,
      tenantId: null,
      error: 'missing_tenant_id',
    };
  }

  try {
    const response = await fetchJson(
      baseUrl,
      `/api/v1/tenants/${encodeURIComponent(normalizedTenantId)}/access-check`,
      { token }
    );
    return {
      enabled: true,
      attempted: true,
      ok: response?.ok === true,
      status: 200,
      tenantId: normalizeText(response?.tenantId).toLowerCase() || normalizedTenantId,
      role: normalizeText(response?.role).toUpperCase() || null,
      error: null,
    };
  } catch (error) {
    return {
      enabled: true,
      attempted: true,
      ok: false,
      status: Number(error?.status || 0) || null,
      tenantId: normalizedTenantId,
      role: null,
      error: normalizeText(error?.message || 'tenant_access_check_failed') || 'tenant_access_check_failed',
      payload: error?.payload || null,
    };
  }
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
  const tenantAccessCheckRefresh = args.refreshTenantAccessCheck
    ? await runTenantAccessCheck({
        baseUrl,
        token: auth.token,
        tenantId: auth.authTenantId || tenantId || '',
      })
    : {
        enabled: false,
        attempted: false,
        ok: false,
        status: null,
        tenantId: auth.authTenantId || tenantId || null,
        error: 'disabled',
      };
  let readinessOutputGateRemediation = null;
  if (args.remediateOutputGates) {
    readinessOutputGateRemediation = await fetchJson(
      baseUrl,
      '/api/v1/ops/readiness/remediate-output-gates',
      {
        method: 'POST',
        token: auth.token,
        body: {
          dryRun: false,
          tenantId: auth.authTenantId || tenantId || undefined,
          limit: parsePositiveInt(args.remediationLimit, 50, 1, 200),
          detailsLimit: 5,
        },
      }
    );
  }
  let ownerMfaMembershipRemediation = null;
  if (args.remediateOwnerMfaMemberships) {
    ownerMfaMembershipRemediation = await remediateOwnerMfaMemberships({
      baseUrl,
      token: auth.token,
      limit: parsePositiveInt(args.ownerMfaRemediationLimit, 50, 1, 200),
    });
  }
  const monitorStatus = await fetchJson(baseUrl, '/api/v1/monitor/status', {
    token: auth.token,
  });
  const readiness = await fetchJson(baseUrl, '/api/v1/monitor/readiness', {
    token: auth.token,
  });
  const slo = await fetchJson(baseUrl, '/api/v1/monitor/slo', {
    token: auth.token,
  });
  const readinessHistory = await fetchJson(baseUrl, '/api/v1/monitor/readiness/history?limit=14', {
    token: auth.token,
  });
  let corsRuntimeProbe = null;
  const readinessNoGoTriggers = Array.isArray(readiness?.noGoTriggers) ? readiness.noGoTriggers : [];
  const triggeredNoGo = readinessNoGoTriggers
    .filter((item) => String(item?.status || '').toLowerCase() === 'triggered')
    .map((item) => ({
      id: String(item?.id || ''),
      label: String(item?.label || ''),
      evidence: String(item?.evidence || ''),
      violations: Number(item?.value?.violations || 0),
      inferred: item?.inferred === true,
    }));
  const triggeredNoGoWithGuidance = triggeredNoGo.map((item) => {
    const hint = NOGO_TRIGGER_HINTS[normalizeText(item?.id)] || {};
    return {
      ...item,
      owner: normalizeText(hint?.owner) || null,
      playbook: normalizeText(hint?.playbook) || null,
    };
  });
  const remediationActions = Array.isArray(readiness?.remediation?.actions)
    ? readiness.remediation.actions
    : [];
  const remediationTopP0 = remediationActions
    .filter((item) => String(item?.priority || '').toUpperCase() === 'P0' || item?.required === true)
    .slice(0, 5)
    .map((item) => ({
      id: String(item?.id || ''),
      title: String(item?.title || item?.relatedId || ''),
      priority: String(item?.priority || '').toUpperCase() || null,
      owner: String(item?.owner || ''),
      targetState: String(item?.targetState || ''),
      required: item?.required === true,
      scoreImpactMax: Number(item?.scoreImpactMax || 0),
      playbook: String(item?.playbook || ''),
    }));
  const readinessCategories = Array.isArray(readiness?.categories) ? readiness.categories : [];
  const corsStrictReadinessCheck = readinessCategories
    .flatMap((category) => (Array.isArray(category?.checks) ? category.checks : []))
    .find((check) => normalizeText(check?.id) === 'cors_strict') || null;
  const corsStrictReadinessStatus =
    normalizeText(corsStrictReadinessCheck?.status).toLowerCase() || 'missing';
  if (!args.corsRuntimeProbe) {
    corsRuntimeProbe = {
      ok: false,
      skipped: true,
      reason: 'disabled',
      path: normalizeRoutePath(args.corsProbePath, '/healthz'),
      allowedOrigin: resolveOriginFromBaseUrl(baseUrl) || null,
      deniedOrigin: null,
      allowedOriginMatched: false,
      deniedOriginBlocked: false,
      allowed: null,
      denied: null,
      prerequisiteStatus: corsStrictReadinessStatus,
    };
  } else if (corsStrictReadinessStatus !== 'green') {
    corsRuntimeProbe = {
      ok: false,
      skipped: true,
      reason: `cors_strict_${corsStrictReadinessStatus}`,
      path: normalizeRoutePath(args.corsProbePath, '/healthz'),
      allowedOrigin: resolveOriginFromBaseUrl(baseUrl) || null,
      deniedOrigin: null,
      allowedOriginMatched: false,
      deniedOriginBlocked: false,
      allowed: null,
      denied: null,
      prerequisiteStatus: corsStrictReadinessStatus,
    };
  } else {
    corsRuntimeProbe = await runCorsRuntimeProbe({
      baseUrl,
      routePath: args.corsProbePath,
    });
    corsRuntimeProbe.prerequisiteStatus = corsStrictReadinessStatus;
  }
  const securityCategory = readinessCategories.find(
    (item) => normalizeText(item?.id).toUpperCase() === 'A'
  );
  const corsRuntimeProbeEnabled = Boolean(args.corsRuntimeProbe);
  const corsRuntimeProbeStatus = corsRuntimeProbeEnabled
    ? corsRuntimeProbe.skipped
      ? 'unknown'
      : corsRuntimeProbe.ok
        ? 'green'
        : 'red'
    : 'disabled';
  const corsRuntimeProbeEvidence = normalizeText(corsRuntimeProbe?.reason) || null;
  const categoryIssues = [];
  const blockerChecks = [];
  for (const category of readinessCategories) {
    const categoryId = normalizeText(category?.id);
    const categoryLabel = normalizeText(category?.label);
    const categoryStatus = normalizeText(category?.status).toLowerCase() || 'unknown';
    const categoryScore = Number(category?.score || 0);
    const checks = Array.isArray(category?.checks) ? category.checks : [];
    const nonGreenChecks = checks
      .filter((check) => normalizeText(check?.status).toLowerCase() !== 'green')
      .map((check) => ({
        checkId: normalizeText(check?.id) || null,
        label: normalizeText(check?.label) || null,
        status: normalizeText(check?.status).toLowerCase() || 'unknown',
        required: check?.required === true,
        target: normalizeText(check?.target) || null,
        valuePreview: toValuePreview(check?.value),
      }));
    if (categoryStatus !== 'green') {
      categoryIssues.push({
        categoryId: categoryId || null,
        categoryLabel: categoryLabel || null,
        status: categoryStatus,
        score: Number(categoryScore.toFixed(2)),
        nonGreenChecksCount: nonGreenChecks.length,
        nonGreenChecks: nonGreenChecks.slice(0, 5),
      });
    }
    for (const check of checks) {
      if (check?.required !== true) continue;
      const status = normalizeText(check?.status).toLowerCase() || 'unknown';
      if (status === 'green') continue;
      const checkId = normalizeText(check?.id);
      const hint = BLOCKER_CHECK_HINTS[checkId] || {};
      blockerChecks.push({
        categoryId: categoryId || null,
        categoryLabel: categoryLabel || null,
        checkId: checkId || null,
        label: normalizeText(check?.label) || null,
        status,
        target: normalizeText(check?.target) || null,
        evidence: normalizeText(check?.evidence) || null,
        value: check?.value ?? null,
        valuePreview: toValuePreview(check?.value),
        owner: normalizeText(hint?.owner) || null,
        playbook: normalizeText(hint?.playbook) || null,
      });
    }
  }
  if (corsRuntimeProbeEnabled && corsRuntimeProbeStatus === 'red') {
    const hint = BLOCKER_CHECK_HINTS.cors_runtime_probe || {};
    blockerChecks.push({
      categoryId: normalizeText(securityCategory?.id) || 'A',
      categoryLabel: normalizeText(securityCategory?.label) || 'Säkerhetshärdning',
      checkId: 'cors_runtime_probe',
      label: 'CORS runtime probe',
      status: corsRuntimeProbeStatus,
      target:
        'Allowed origin should receive ACAO header while denied origin should receive no ACAO header.',
      evidence: corsRuntimeProbeEvidence,
      valuePreview: toValuePreview(corsRuntimeProbe),
      owner: normalizeText(hint?.owner) || null,
      playbook: normalizeText(hint?.playbook) || null,
    });
  }
  blockerChecks.sort((a, b) => {
    const bySeverity = checkSeverityRank(a?.status) - checkSeverityRank(b?.status);
    if (bySeverity !== 0) return bySeverity;
    return String(a?.checkId || '').localeCompare(String(b?.checkId || ''));
  });
  const blockerChecksTop = blockerChecks.slice(0, 8);
  categoryIssues.sort((a, b) => {
    const bySeverity = checkSeverityRank(a?.status) - checkSeverityRank(b?.status);
    if (bySeverity !== 0) return bySeverity;
    return String(a?.categoryId || '').localeCompare(String(b?.categoryId || ''));
  });
  const categoryIssuesTop = categoryIssues.slice(0, 6);
  const corsStrictBlocker = blockerChecks.find((item) => item?.checkId === 'cors_strict') || null;
  const corsStrictRecommendation = corsStrictBlocker
    ? buildCorsStrictEnvRecommendation({
        baseUrl,
        corsValue: corsStrictBlocker.value,
      })
    : null;
  let ownerMfaGapReport = null;
  if (blockerChecks.some((item) => item?.checkId === 'owner_mfa_enforced')) {
    try {
      const membersPayload = await fetchJson(baseUrl, '/api/v1/users/staff', {
        token: auth.token,
      });
      const ownerMfaClassification = classifyOwnerMfaMembers(membersPayload);
      ownerMfaGapReport = {
        activeOwners: ownerMfaClassification.activeOwners.length,
        compliantOwners: ownerMfaClassification.compliantOwners.length,
        nonCompliantOwners: ownerMfaClassification.nonCompliantOwners.length,
        canRemediateByDisable: ownerMfaClassification.canRemediateByDisable,
        nonCompliantPreview: ownerMfaClassification.nonCompliantOwners.slice(0, 8).map((item) => ({
          email: item.email,
          membershipId: item.membershipId || null,
          mfaRequired: item.mfaRequired === true,
          mfaConfigured: item.mfaConfigured === true,
        })),
      };
    } catch (error) {
      ownerMfaGapReport = {
        error: normalizeText(error?.message || 'could_not_read_users_staff') || 'could_not_read_users_staff',
      };
    }
  }

  const artifact = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    options: {
      failOnNoGo: Boolean(args.failOnNoGo),
      remediateOutputGates: Boolean(args.remediateOutputGates),
      remediationLimit: parsePositiveInt(args.remediationLimit, 50, 1, 200),
      remediateOwnerMfaMemberships: Boolean(args.remediateOwnerMfaMemberships),
      ownerMfaRemediationLimit: parsePositiveInt(args.ownerMfaRemediationLimit, 50, 1, 200),
      refreshTenantAccessCheck: Boolean(args.refreshTenantAccessCheck),
      corsRuntimeProbe: Boolean(args.corsRuntimeProbe),
      corsProbePath: normalizeRoutePath(args.corsProbePath, '/healthz'),
    },
    auth: {
      flow: auth.authFlow,
      tenantId: auth.authTenantId || tenantId || null,
    },
    ops: {
      tenantAccessCheckRefresh,
      corsRuntimeProbe,
      readinessOutputGateRemediation,
      ownerMfaMembershipRemediation,
      ownerMfaGapReport,
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
        triggeredNoGoIds: Array.isArray(readiness?.goNoGo?.triggeredNoGoIds)
          ? readiness.goNoGo.triggeredNoGoIds
          : [],
        triggeredNoGo,
        triggeredNoGoWithGuidance,
        remediationSummary: readiness?.remediation?.summary || null,
        remediationTopP0,
        blockerChecks,
        categoryIssues,
        corsRuntimeProbe,
        corsStrictRecommendation,
      },
      readinessHistory: {
        generatedAt: readinessHistory?.generatedAt || null,
        count: Number(readinessHistory?.count || 0),
        trend: readinessHistory?.trend || null,
        latest: Array.isArray(readinessHistory?.entries) ? readinessHistory.entries[0] || null : null,
        entries: Array.isArray(readinessHistory?.entries) ? readinessHistory.entries : [],
      },
      slo: {
        generatedAt: slo?.generatedAt || null,
        summary: slo?.summary || {},
        slos: Array.isArray(slo?.slos) ? slo.slos : [],
      },
    },
  };

  const outAbs = path.resolve(outFile);

  const suiteTotal = Number(suiteResponse?.suite?.total || 0);
  const suiteFailed = Number(suiteResponse?.suite?.failed || 0);
  const suiteSucceeded = Number(suiteResponse?.suite?.succeeded || 0);
  const readinessScore = Number(readiness?.score || 0);
  const readinessBand = String(readiness?.band || '-');
  const goAllowed = readiness?.goNoGo?.allowed === true ? 'yes' : 'no';
  const pilotHealthy = monitorStatus?.gates?.pilotReport?.healthy === true ? 'yes' : 'no';
  const restoreHealthy = monitorStatus?.gates?.restoreDrill?.healthy === true ? 'yes' : 'no';
  const sloOverall = String(slo?.summary?.overallStatus || '-');
  const blockerCategoriesGreen = readiness?.goNoGo?.blockerCategoriesGreen === true;
  const triggeredNoGoCount = triggeredNoGo.length;
  const triggeredNoGoIds = triggeredNoGo.map((item) => item.id).filter(Boolean);
  const historyCount = Number(readinessHistory?.count || 0);
  const historyScoreDelta = Number(readinessHistory?.trend?.scoreDelta || 0);
  const historyNoGoDelta = Number(readinessHistory?.trend?.triggeredNoGoDelta || 0);
  const historyLatestTs = Array.isArray(readinessHistory?.entries)
    ? String(readinessHistory.entries?.[0]?.ts || '-')
    : '-';
  const remediationTotal = Number(readiness?.remediation?.summary?.total || 0);
  const remediationP0 = Number(readiness?.remediation?.summary?.byPriority?.P0 || 0);
  const remediationTopLabel =
    remediationTopP0
      .map((item) => item.id || item.title)
      .filter(Boolean)
      .slice(0, 3)
      .join(', ') || '-';
  const remediationRunEnabled = Boolean(args.remediateOutputGates);
  const remediationRunCandidates = Number(readinessOutputGateRemediation?.candidates || 0);
  const remediationRunFixable = Number(readinessOutputGateRemediation?.fixableCandidates || 0);
  const remediationRunFixed = Number(readinessOutputGateRemediation?.fixedCount || 0);
  const remediationRunRemaining = Number(
    readinessOutputGateRemediation?.remainingFixableAfterApply || 0
  );
  const ownerMfaRemediationEnabled = Boolean(args.remediateOwnerMfaMemberships);
  const ownerMfaDisabled = Number(ownerMfaMembershipRemediation?.disabledCount || 0);
  const ownerMfaSkipped = Number(ownerMfaMembershipRemediation?.skippedCount || 0);
  const ownerMfaRemaining = Number(ownerMfaMembershipRemediation?.after?.nonCompliantOwners || 0);
  const tenantAccessCheckEnabled = Boolean(args.refreshTenantAccessCheck);
  const tenantAccessCheckAttempted = tenantAccessCheckRefresh?.attempted === true;
  const tenantAccessCheckOk = tenantAccessCheckRefresh?.ok === true;
  const tenantAccessCheckStatus = Number(tenantAccessCheckRefresh?.status || 0) || 0;
  const tenantAccessCheckTenantId = normalizeText(tenantAccessCheckRefresh?.tenantId) || '-';
  const corsProbePath = normalizeText(corsRuntimeProbe?.path) || normalizeRoutePath(args.corsProbePath, '/healthz');
  const corsProbeAllowedOrigin = normalizeText(corsRuntimeProbe?.allowedOrigin) || '-';
  const corsProbeAllowedHeader = normalizeText(corsRuntimeProbe?.allowed?.accessControlAllowOrigin) || '';
  const corsProbeDeniedHeader = normalizeText(corsRuntimeProbe?.denied?.accessControlAllowOrigin) || '';
  const blockerCheckCount = blockerChecks.length;
  const blockerCheckLabels =
    blockerChecksTop
      .map((item) => `${item.checkId || '-'}(${item.status || '-'})`)
      .filter(Boolean)
      .join(', ') || '-';
  const categoryIssueCount = categoryIssues.length;
  const categoryIssueLabels =
    categoryIssuesTop
      .map((item) => `${item.categoryId || '-'}(${item.status || '-'})`)
      .filter(Boolean)
      .join(', ') || '-';
  const failOnNoGo = Boolean(args.failOnNoGo);
  const strictFailures = [];
  const advisories = [];
  if (suiteResponse?.ok !== true) strictFailures.push('scheduler suite not fully successful');
  if (readiness?.goNoGo?.allowed !== true) {
    const triggerSuffix =
      triggeredNoGoIds.length > 0 ? ` [${triggeredNoGoIds.slice(0, 6).join(', ')}]` : '';
    strictFailures.push(`readiness go/no-go is not allowed${triggerSuffix}`);
  }
  if (!blockerCategoriesGreen) {
    const checksSuffix =
      blockerChecksTop.length > 0
        ? ` [checks: ${blockerChecksTop
            .map((item) => item.checkId)
            .filter(Boolean)
            .slice(0, 6)
            .join(', ')}]`
        : categoryIssuesTop.length > 0
          ? ` [categories: ${categoryIssuesTop
              .map((item) => item.categoryId)
              .filter(Boolean)
              .slice(0, 6)
              .join(', ')}]`
          : '';
    strictFailures.push(`readiness blocker categories are not all green${checksSuffix}`);
  }
  if (monitorStatus?.gates?.pilotReport?.noGo === true) strictFailures.push('pilot report gate is no-go');
  if (monitorStatus?.gates?.restoreDrill?.noGo === true) strictFailures.push('restore drill gate is no-go');
  if (sloOverall === 'red' || sloOverall === 'unknown') {
    strictFailures.push(`slo overall status is ${sloOverall}`);
  }
  if (corsRuntimeProbeEnabled && corsRuntimeProbeStatus === 'red') {
    strictFailures.push(
      'cors runtime probe failed (allowed origin mismatch or denied origin leaked ACAO header)'
    );
  }
  if (
    tenantAccessCheckEnabled &&
    tenantAccessCheckAttempted &&
    !tenantAccessCheckOk &&
    tenantAccessCheckStatus !== 404
  ) {
    strictFailures.push(
      `tenant access-check refresh failed (status=${tenantAccessCheckStatus || 'n/a'})`
    );
  }
  if (
    !remediationRunEnabled &&
    triggeredNoGoIds.includes('output_without_risk_policy_gate')
  ) {
    advisories.push(
      'run with --remediate-output-gates to auto-fix active-version output/policy metadata gaps'
    );
  }
  if (
    !ownerMfaRemediationEnabled &&
    blockerChecks.some((item) => item.checkId === 'owner_mfa_enforced')
  ) {
    advisories.push(
      'run with --remediate-owner-mfa-memberships to disable non-compliant OWNER memberships (requires at least one compliant OWNER)'
    );
  }
  if (triggeredNoGoWithGuidance.length > 0) {
    for (const item of triggeredNoGoWithGuidance.slice(0, 4)) {
      if (item?.playbook) {
        advisories.push(`no-go ${item.id}: ${item.playbook}`);
      } else if (item?.evidence) {
        advisories.push(`no-go ${item.id}: ${item.evidence}`);
      }
    }
  }
  if (ownerMfaGapReport?.error) {
    advisories.push(`owner MFA gap details unavailable (${ownerMfaGapReport.error})`);
  } else if (ownerMfaGapReport && Number(ownerMfaGapReport.nonCompliantOwners || 0) > 0) {
    const previewEmails = Array.isArray(ownerMfaGapReport.nonCompliantPreview)
      ? ownerMfaGapReport.nonCompliantPreview
          .map((item) => normalizeText(item?.email))
          .filter(Boolean)
          .slice(0, 5)
      : [];
    if (previewEmails.length > 0) {
      advisories.push(`owner MFA gaps: ${previewEmails.join(', ')}`);
    }
  }
  if (!corsRuntimeProbeEnabled) {
    advisories.push(
      'run with --cors-runtime-probe to verify live CORS behavior (allowed vs denied origin headers)'
    );
  }
  if (corsRuntimeProbeEnabled && corsRuntimeProbeStatus === 'unknown') {
    advisories.push(
      `cors runtime probe skipped (${corsRuntimeProbeEvidence || 'unknown_reason'})`
    );
  }
  if (corsRuntimeProbeEnabled && corsRuntimeProbeStatus === 'red') {
    advisories.push(
      `cors runtime probe failed: allowed='${corsProbeAllowedHeader || '-'}' denied='${corsProbeDeniedHeader || '-'}'`
    );
  }
  if (!tenantAccessCheckEnabled && triggeredNoGoIds.includes('tenant_isolation_unverified')) {
    advisories.push(
      'run with --refresh-tenant-access-check to refresh tenants.access_check evidence before readiness gate'
    );
  }
  if (
    tenantAccessCheckEnabled &&
    tenantAccessCheckAttempted &&
    !tenantAccessCheckOk &&
    tenantAccessCheckStatus === 404
  ) {
    advisories.push(
      'tenant access-check endpoint unavailable (404); upgrade API routes or disable refresh with --no-refresh-tenant-access-check'
    );
  }
  if (
    tenantAccessCheckEnabled &&
    tenantAccessCheckAttempted &&
    !tenantAccessCheckOk &&
    tenantAccessCheckStatus !== 404
  ) {
    advisories.push(
      `tenant access-check refresh failed (status=${tenantAccessCheckStatus || 'n/a'})`
    );
  }
  if (blockerChecksTop.length > 0) {
    for (const blocker of blockerChecksTop.slice(0, 3)) {
      if (blocker?.playbook) {
        advisories.push(`${blocker.checkId}: ${blocker.playbook}`);
      } else if (blocker?.target) {
        advisories.push(`${blocker.checkId}: target=${blocker.target}`);
      }
    }
    if (corsStrictRecommendation?.envLine) {
      advisories.push(`cors_strict env: ${corsStrictRecommendation.envLine}`);
    }
  } else if (categoryIssuesTop.length > 0) {
    for (const category of categoryIssuesTop.slice(0, 2)) {
      advisories.push(
        `category ${category?.categoryId || '-'} status=${category?.status || '-'} score=${Number(category?.score || 0)}`
      );
      const checks = Array.isArray(category?.nonGreenChecks) ? category.nonGreenChecks : [];
      for (const check of checks.slice(0, 2)) {
        const hint = BLOCKER_CHECK_HINTS[normalizeText(check?.checkId)] || {};
        if (hint?.playbook) {
          advisories.push(`${check?.checkId || '-'}: ${hint.playbook}`);
        } else if (check?.target) {
          advisories.push(`${check?.checkId || '-'}: target=${check.target}`);
        }
      }
    }
  }

  const strictExitCode =
    failOnNoGo && strictFailures.length > 0 ? 2 : suiteResponse?.ok !== true ? 1 : 0;
  artifact.strict = {
    failOnNoGo,
    failureCount: strictFailures.length,
    failures: strictFailures,
    advisoryCount: advisories.length,
    advisories,
    exitCode: strictExitCode,
  };
  await fs.mkdir(path.dirname(outAbs), { recursive: true });
  await fs.writeFile(outAbs, JSON.stringify(artifact, null, 2), 'utf8');

  process.stdout.write(`✅ Scheduler suite körd: ${baseUrl}\n`);
  process.stdout.write(
    `   suite: succeeded=${suiteSucceeded}/${suiteTotal} failed=${suiteFailed}\n`
  );
  process.stdout.write(
    `   readiness: score=${Number(readinessScore.toFixed(2))} band=${readinessBand} goAllowed=${goAllowed}\n`
  );
  process.stdout.write(
    `   readinessNoGo: blockersGreen=${blockerCategoriesGreen ? 'yes' : 'no'} triggered=${triggeredNoGoCount} ids=${triggeredNoGoIds.slice(0, 6).join(',') || '-'}\n`
  );
  if (triggeredNoGoWithGuidance.length > 0) {
    for (const trigger of triggeredNoGoWithGuidance.slice(0, 4)) {
      const detailParts = [];
      if (trigger?.violations > 0) detailParts.push(`violations=${trigger.violations}`);
      if (trigger?.owner) detailParts.push(`owner=${trigger.owner}`);
      if (trigger?.inferred) detailParts.push('inferred=yes');
      if (trigger?.evidence) detailParts.push(`evidence=${trigger.evidence}`);
      const suffix = detailParts.length > 0 ? ` ${detailParts.join(' | ')}` : '';
      process.stdout.write(`   readinessNoGoDetail: ${trigger?.id || '-'}${suffix}\n`);
      if (trigger?.playbook) {
        process.stdout.write(`   readinessNoGoPlaybook: ${trigger.playbook}\n`);
      }
    }
  }
  process.stdout.write(
    `   remediation: total=${remediationTotal} p0=${remediationP0} top=${remediationTopLabel}\n`
  );
  process.stdout.write(
    `   blockerChecks: count=${blockerCheckCount} top=${blockerCheckLabels}\n`
  );
  process.stdout.write(
    `   categoryIssues: count=${categoryIssueCount} top=${categoryIssueLabels}\n`
  );
  if (blockerChecksTop.length > 0) {
    for (const blocker of blockerChecksTop.slice(0, 3)) {
      const detailParts = [];
      if (blocker?.target) detailParts.push(`target=${blocker.target}`);
      if (blocker?.valuePreview) detailParts.push(`value=${blocker.valuePreview}`);
      const suffix = detailParts.length > 0 ? ` ${detailParts.join(' | ')}` : '';
      process.stdout.write(
        `   blockerDetail: ${blocker?.checkId || '-'} status=${blocker?.status || '-'}${suffix}\n`
      );
    }
    if (corsStrictRecommendation?.envLine) {
      process.stdout.write(`   corsStrictEnv: ${corsStrictRecommendation.envLine}\n`);
    }
  }
  if (categoryIssuesTop.length > 0) {
    for (const category of categoryIssuesTop.slice(0, 3)) {
      const checksLabel = (Array.isArray(category?.nonGreenChecks) ? category.nonGreenChecks : [])
        .slice(0, 3)
        .map((item) => `${item.checkId || '-'}(${item.status || '-'})`)
        .join(', ');
      process.stdout.write(
        `   categoryDetail: ${category?.categoryId || '-'} status=${category?.status || '-'} score=${Number(category?.score || 0)} checks=${checksLabel || '-'}\n`
      );
    }
  }
  if (remediationRunEnabled) {
    process.stdout.write(
      `   remediationRun: candidates=${remediationRunCandidates} fixable=${remediationRunFixable} fixed=${remediationRunFixed} remaining=${remediationRunRemaining}\n`
    );
  }
  if (ownerMfaRemediationEnabled) {
    process.stdout.write(
      `   ownerMfaRemediation: disabled=${ownerMfaDisabled} skipped=${ownerMfaSkipped} remainingNonCompliant=${ownerMfaRemaining}\n`
    );
  }
  if (ownerMfaGapReport?.error) {
    process.stdout.write(`   ownerMfaGap: error=${ownerMfaGapReport.error}\n`);
  } else if (ownerMfaGapReport) {
    process.stdout.write(
      `   ownerMfaGap: active=${Number(ownerMfaGapReport.activeOwners || 0)} compliant=${Number(ownerMfaGapReport.compliantOwners || 0)} nonCompliant=${Number(ownerMfaGapReport.nonCompliantOwners || 0)} canDisable=${ownerMfaGapReport.canRemediateByDisable ? 'yes' : 'no'}\n`
    );
    const preview = Array.isArray(ownerMfaGapReport.nonCompliantPreview)
      ? ownerMfaGapReport.nonCompliantPreview
          .map((item) => normalizeText(item?.email))
          .filter(Boolean)
          .slice(0, 5)
      : [];
    if (preview.length > 0) {
      process.stdout.write(`   ownerMfaGapPreview: ${preview.join(', ')}\n`);
    }
  }
  process.stdout.write(
    `   corsRuntimeProbe: enabled=${corsRuntimeProbeEnabled ? 'yes' : 'no'} status=${corsRuntimeProbeStatus} path=${corsProbePath} allowedOrigin=${corsProbeAllowedOrigin} allowedHeader=${corsProbeAllowedHeader || '-'} deniedHeader=${corsProbeDeniedHeader || '-'}\n`
  );
  process.stdout.write(
    `   tenantAccessCheck: enabled=${tenantAccessCheckEnabled ? 'yes' : 'no'} attempted=${tenantAccessCheckAttempted ? 'yes' : 'no'} ok=${tenantAccessCheckOk ? 'yes' : 'no'} status=${tenantAccessCheckStatus || '-'} tenant=${tenantAccessCheckTenantId}\n`
  );
  process.stdout.write(
    `   gates: pilotReportHealthy=${pilotHealthy} restoreHealthy=${restoreHealthy} sloOverall=${sloOverall}\n`
  );
  process.stdout.write(
    `   readinessHistory: count=${historyCount} scoreDelta=${Number(historyScoreDelta.toFixed(2))} noGoDelta=${historyNoGoDelta} latestTs=${historyLatestTs}\n`
  );
  process.stdout.write(
    `   strictMode: failOnNoGo=${failOnNoGo ? 'yes' : 'no'} failures=${strictFailures.length}\n`
  );
  if (strictFailures.length > 0) {
    for (const reason of strictFailures) {
      process.stdout.write(`   - ${reason}\n`);
    }
  }
  if (advisories.length > 0) {
    for (const hint of advisories) {
      process.stdout.write(`   hint: ${hint}\n`);
    }
  }
  process.stdout.write(`   artifact: ${outAbs}\n`);

  if (strictExitCode === 2) {
    process.exitCode = strictExitCode;
    return;
  }
  if (strictExitCode === 1) {
    process.exitCode = strictExitCode;
  }
}

main().catch((error) => {
  console.error('❌ Kunde inte köra scheduler-suite');
  console.error(error?.message || error);
  process.exit(1);
});
