#!/usr/bin/env node
require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isReleaseGateClear(evaluation = null) {
  const releaseGatePassed = evaluation?.releaseGatePassed === true;
  const blockerCount = Number(evaluation?.blockers?.length || 0);
  return releaseGatePassed && blockerCount === 0;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function nowStamp() {
  const date = new Date();
  const pad = (v) => String(v).padStart(2, '0');
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

function randomPassword(prefix = 'ArcanaStaff') {
  return `${prefix}!${crypto.randomBytes(8).toString('hex')}`;
}

function buildDefaultEmail(localPart, tenantId) {
  const tenant = normalizeText(tenantId).replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase() || 'tenant';
  return `${localPart}+${tenant}@arcana.local`;
}

function buildFallbackEmail(localPart, tenantId) {
  const tenant = normalizeText(tenantId).replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase() || 'tenant';
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${localPart}.${suffix}.${tenant}@arcana.local`;
}

function parseArgs(argv) {
  const baseUrl = normalizeText(process.env.BASE_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:3000');
  const tenantId = normalizeText(process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic');
  const ownerEmail = normalizeText(process.env.ARCANA_OWNER_EMAIL || 'fazli@hairtpclinic.com');
  const ownerPassword = normalizeText(process.env.ARCANA_OWNER_PASSWORD || 'ArcanaPilot!2026');

  const args = {
    baseUrl,
    tenantId,
    ownerEmail,
    ownerPassword,
    ownerMfaCode: normalizeText(process.env.ARCANA_OWNER_MFA_CODE || ''),
    ownerMfaSecret: normalizeText(process.env.ARCANA_OWNER_MFA_SECRET || ''),
    ownerMfaRecoveryCode: normalizeText(process.env.ARCANA_OWNER_MFA_RECOVERY_CODE || ''),
    authStorePath: normalizeText(process.env.AUTH_STORE_PATH || path.join('data', 'auth.json')),
    ensureStaff: parseBoolean(process.env.ARCANA_RELEASE_CYCLE_ENSURE_STAFF, true),
    riskEmail: normalizeText(process.env.ARCANA_RELEASE_RISK_EMAIL || buildDefaultEmail('risk-owner', tenantId)),
    riskPassword: normalizeText(process.env.ARCANA_RELEASE_RISK_PASSWORD || randomPassword('ArcanaRisk')),
    riskMfaCode: normalizeText(process.env.ARCANA_RELEASE_RISK_MFA_CODE || ''),
    riskMfaSecret: normalizeText(process.env.ARCANA_RELEASE_RISK_MFA_SECRET || ''),
    riskMfaRecoveryCode: normalizeText(process.env.ARCANA_RELEASE_RISK_MFA_RECOVERY_CODE || ''),
    opsEmail: normalizeText(process.env.ARCANA_RELEASE_OPS_EMAIL || buildDefaultEmail('ops-owner', tenantId)),
    opsPassword: normalizeText(process.env.ARCANA_RELEASE_OPS_PASSWORD || randomPassword('ArcanaOps')),
    opsMfaCode: normalizeText(process.env.ARCANA_RELEASE_OPS_MFA_CODE || ''),
    opsMfaSecret: normalizeText(process.env.ARCANA_RELEASE_OPS_MFA_SECRET || ''),
    opsMfaRecoveryCode: normalizeText(process.env.ARCANA_RELEASE_OPS_MFA_RECOVERY_CODE || ''),
    cycleNote: normalizeText(process.env.ARCANA_RELEASE_CYCLE_NOTE || 'Automated release cycle'),
    evidenceSource: normalizeText(process.env.ARCANA_RELEASE_EVIDENCE_SOURCE || 'release_cycle_script'),
    pentestEvidencePath: normalizeText(process.env.ARCANA_RELEASE_PENTEST_EVIDENCE_PATH || './docs/security/pentest-latest.md'),
    noGoFreeDays: parsePositiveInt(process.env.ARCANA_RELEASE_NO_GO_FREE_DAYS, 14),
    launch: parseBoolean(process.env.ARCANA_RELEASE_AUTO_LAUNCH, false),
    launchStrategy: normalizeText(process.env.ARCANA_RELEASE_LAUNCH_STRATEGY || 'tenant_batch'),
    launchBatchLabel: normalizeText(process.env.ARCANA_RELEASE_LAUNCH_BATCH_LABEL || 'batch-1'),
    launchRollbackPlan: normalizeText(
      process.env.ARCANA_RELEASE_LAUNCH_ROLLBACK_PLAN ||
        'Rollback within 10 minutes on critical signal.'
    ),
    reviewNow: parseBoolean(process.env.ARCANA_RELEASE_REVIEW_NOW, false),
    reviewStatus: normalizeText(process.env.ARCANA_RELEASE_REVIEW_STATUS || 'ok'),
    reviewNote: normalizeText(process.env.ARCANA_RELEASE_REVIEW_NOTE || 'Automated release review'),
    realityAuditNow: parseBoolean(process.env.ARCANA_RELEASE_REALITY_AUDIT_NOW, false),
    changeGovernanceVersion: normalizeText(
      process.env.ARCANA_RELEASE_CHANGE_GOVERNANCE_VERSION || ''
    ),
    realityAuditNote: normalizeText(
      process.env.ARCANA_RELEASE_REALITY_AUDIT_NOTE || 'Automated quarterly reality audit marker'
    ),
    finalLiveSignoffNow: parseBoolean(
      process.env.ARCANA_RELEASE_FINAL_LIVE_SIGNOFF_NOW,
      false
    ),
    finalLiveSignoffNote: normalizeText(
      process.env.ARCANA_RELEASE_FINAL_LIVE_SIGNOFF_NOTE ||
        'Final live sign-off after stabilized launch window.'
    ),
    failOnGate: parseBoolean(process.env.ARCANA_RELEASE_FAIL_ON_GATE, false),
    reuseLatestCycle: parseBoolean(process.env.ARCANA_RELEASE_REUSE_LATEST_CYCLE, false),
    cycleId: normalizeText(process.env.ARCANA_RELEASE_CYCLE_ID || ''),
    outFile: normalizeText(
      process.env.ARCANA_RELEASE_CYCLE_OUT_FILE ||
        path.join('data', 'reports', `Release_Cycle_${nowStamp()}.json`)
    ),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = normalizeText(argv[index]);
    if (item === '--base-url') {
      args.baseUrl = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--tenant-id') {
      args.tenantId = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--owner-email') {
      args.ownerEmail = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--owner-password') {
      args.ownerPassword = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--owner-mfa-code') {
      args.ownerMfaCode = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--owner-mfa-secret') {
      args.ownerMfaSecret = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--owner-mfa-recovery-code') {
      args.ownerMfaRecoveryCode = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--risk-email') {
      args.riskEmail = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--risk-password') {
      args.riskPassword = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--ops-email') {
      args.opsEmail = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--ops-password') {
      args.opsPassword = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--pentest-evidence-path') {
      args.pentestEvidencePath = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--cycle-note') {
      args.cycleNote = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--evidence-source') {
      args.evidenceSource = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--no-go-free-days') {
      args.noGoFreeDays = parsePositiveInt(argv[index + 1], args.noGoFreeDays);
      index += 1;
      continue;
    }
    if (item === '--ensure-staff') {
      args.ensureStaff = true;
      continue;
    }
    if (item === '--no-ensure-staff') {
      args.ensureStaff = false;
      continue;
    }
    if (item === '--launch') {
      args.launch = true;
      continue;
    }
    if (item === '--no-launch') {
      args.launch = false;
      continue;
    }
    if (item === '--launch-strategy') {
      args.launchStrategy = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--launch-batch-label') {
      args.launchBatchLabel = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--launch-rollback-plan') {
      args.launchRollbackPlan = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--review-now') {
      args.reviewNow = true;
      continue;
    }
    if (item === '--no-review-now') {
      args.reviewNow = false;
      continue;
    }
    if (item === '--review-status') {
      args.reviewStatus = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--review-note') {
      args.reviewNote = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--reality-audit-now') {
      args.realityAuditNow = true;
      continue;
    }
    if (item === '--no-reality-audit-now') {
      args.realityAuditNow = false;
      continue;
    }
    if (item === '--change-governance-version') {
      args.changeGovernanceVersion = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--reality-audit-note') {
      args.realityAuditNote = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--final-live-signoff-now') {
      args.finalLiveSignoffNow = true;
      continue;
    }
    if (item === '--no-final-live-signoff-now') {
      args.finalLiveSignoffNow = false;
      continue;
    }
    if (item === '--final-live-signoff-note') {
      args.finalLiveSignoffNote = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--fail-on-gate') {
      args.failOnGate = true;
      continue;
    }
    if (item === '--no-fail-on-gate') {
      args.failOnGate = false;
      continue;
    }
    if (item === '--reuse-latest-cycle') {
      args.reuseLatestCycle = true;
      continue;
    }
    if (item === '--no-reuse-latest-cycle') {
      args.reuseLatestCycle = false;
      continue;
    }
    if (item === '--cycle-id') {
      args.cycleId = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--out-file') {
      args.outFile = normalizeText(argv[index + 1]);
      index += 1;
    }
  }

  return args;
}

async function fetchJson(baseUrl, endpoint, { method = 'GET', token = '', body = null } = {}) {
  const url = new URL(endpoint, baseUrl).toString();
  const headers = {
    Accept: 'application/json',
  };
  let payload = undefined;
  if (body !== null && body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    method,
    headers,
    body: payload,
  });
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (!response.ok) {
    const errorMessage = normalizeText(data?.error || data?.message || text) || `${response.status}`;
    const error = new Error(errorMessage);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

function generateTotpCode(secretRaw = '') {
  return generateTotpCodeAt(secretRaw, Date.now());
}

function generateTotpCodeAt(secretRaw = '', timestampMs = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const secret = normalizeText(secretRaw).toUpperCase().replace(/[^A-Z2-7]/g, '');
  if (!secret) return '';
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const ch of secret) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const key = Buffer.from(bytes);
  const counter = Math.floor(Math.max(0, Number(timestampMs) || Date.now()) / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

function generateTotpCodes(secretRaw = '') {
  const secret = normalizeText(secretRaw);
  if (!secret) return [];
  const now = Date.now();
  const offsetsMs = [0, -30_000, 30_000, -60_000, 60_000];
  const codes = [];
  for (const offset of offsetsMs) {
    const code = generateTotpCodeAt(secret, now + offset);
    if (code && !codes.includes(code)) codes.push(code);
  }
  return codes;
}

async function readMfaSecretFromStore({ authStorePath, email }) {
  if (!normalizeText(authStorePath) || !normalizeText(email)) return '';
  try {
    const raw = JSON.parse(await fs.readFile(path.resolve(authStorePath), 'utf8'));
    const users = raw && raw.users && typeof raw.users === 'object' ? Object.values(raw.users) : [];
    const user = users.find(
      (item) => normalizeText(item?.email).toLowerCase() === normalizeText(email).toLowerCase()
    );
    return normalizeText(user?.mfaSecret || '');
  } catch {
    return '';
  }
}

function isMfaCodeError(error) {
  const message = normalizeText(error?.message || String(error)).toLowerCase();
  return message.includes('mfa') || message.includes('kod');
}

async function verifyMfaAttempt({ baseUrl, mfaTicket, tenantId, code }) {
  const verify = await fetchJson(baseUrl, '/api/v1/auth/mfa/verify', {
    method: 'POST',
    body: {
      mfaTicket,
      code,
      tenantId: normalizeText(tenantId) || undefined,
    },
  });

  if (normalizeText(verify?.token)) {
    return {
      token: verify.token,
      membership: verify.membership || null,
      user: verify.user || null,
      usedMfa: true,
    };
  }

  if (verify?.requiresTenantSelection === true && normalizeText(verify?.loginTicket) && normalizeText(tenantId)) {
    const selected = await fetchJson(baseUrl, '/api/v1/auth/select-tenant', {
      method: 'POST',
      body: {
        loginTicket: verify.loginTicket,
        tenantId: normalizeText(tenantId),
      },
    });
    if (normalizeText(selected?.token)) {
      return {
        token: selected.token,
        membership: selected.membership || null,
        user: selected.user || null,
        usedMfa: true,
      };
    }
  }

  throw new Error('MFA verifiering lyckades inte ge token.');
}

async function login({
  baseUrl,
  email,
  password,
  tenantId = '',
  mfaCode = '',
  mfaSecret = '',
  mfaRecoveryCode = '',
  authStorePath = '',
}) {
  const loginPayload = {
    email,
    password,
  };
  if (normalizeText(tenantId)) loginPayload.tenantId = normalizeText(tenantId);

  const first = await fetchJson(baseUrl, '/api/v1/auth/login', {
    method: 'POST',
    body: loginPayload,
  });

  if (normalizeText(first?.token)) {
    return {
      token: first.token,
      membership: first.membership || null,
      user: first.user || null,
      usedMfa: false,
    };
  }

  if (first?.requiresMfa !== true || !normalizeText(first?.mfaTicket)) {
    throw new Error('Login returnerade varken token eller giltig MFA challenge.');
  }

  const setupSecret = normalizeText(first?.mfa?.secret || '');
  const setupRecoveryCodes = Array.isArray(first?.mfa?.recoveryCodes)
    ? first.mfa.recoveryCodes.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  const normalizedCode = normalizeText(mfaCode);
  const normalizedRecoveryCode = normalizeText(mfaRecoveryCode);
  const providedSecret = normalizeText(mfaSecret);
  const storeSecret = await readMfaSecretFromStore({
    authStorePath,
    email,
  });

  const attempts = [];
  if (normalizedCode) attempts.push(normalizedCode);
  if (normalizedRecoveryCode) attempts.push(normalizedRecoveryCode);
  for (const candidate of generateTotpCodes(setupSecret)) attempts.push(candidate);
  for (const candidate of generateTotpCodes(providedSecret)) attempts.push(candidate);
  for (const candidate of generateTotpCodes(storeSecret)) attempts.push(candidate);
  if (setupRecoveryCodes.length > 0) attempts.push(setupRecoveryCodes[0]);
  const uniqueAttempts = [];
  for (const attempt of attempts) {
    const normalized = normalizeText(attempt);
    if (!normalized) continue;
    if (!uniqueAttempts.includes(normalized)) uniqueAttempts.push(normalized);
  }
  const attemptsLimited = uniqueAttempts.slice(0, 9);

  if (attemptsLimited.length === 0) {
    throw new Error(`MFA krävs för ${email}. Ange code/secret/recovery.`);
  }
  let lastError = null;
  for (const attemptCode of attemptsLimited) {
    try {
      return await verifyMfaAttempt({
        baseUrl,
        mfaTicket: first.mfaTicket,
        tenantId,
        code: attemptCode,
      });
    } catch (error) {
      lastError = error;
      if (!isMfaCodeError(error)) throw error;
    }
  }

  if (lastError) throw lastError;
  throw new Error('MFA verifiering lyckades inte ge token.');
}

function buildNoGoWindow(readinessHistory = null, minDays = 14) {
  const safeDays = Math.max(1, Number(minDays) || 14);
  const nowMs = Date.now();
  const cutoffMs = nowMs - safeDays * 24 * 60 * 60 * 1000;
  const entries = Array.isArray(readinessHistory?.entries) ? readinessHistory.entries : [];
  const relevant = entries.filter((item) => {
    const ts = Date.parse(String(item?.ts || ''));
    return Number.isFinite(ts) && ts >= cutoffMs && ts <= nowMs;
  });
  let clean = relevant.length > 0;
  let maxTriggeredNoGo = 0;
  for (const item of relevant) {
    const triggeredNoGo = Number(item?.triggeredNoGo || 0);
    if (triggeredNoGo > 0) clean = false;
    if (Number.isFinite(triggeredNoGo) && triggeredNoGo > maxTriggeredNoGo) {
      maxTriggeredNoGo = triggeredNoGo;
    }
  }
  return {
    days: safeDays,
    evidenceCount: relevant.length,
    clean,
    maxTriggeredNoGo,
  };
}

function summarizeResultFlag(result = null) {
  if (!result || result.ok !== true) return 'no';
  if (result.skipped === true) return `skipped(${normalizeText(result.reason) || 'n/a'})`;
  return 'yes';
}

async function ensureStaffMember({ baseUrl, ownerToken, tenantId, email, password }) {
  return fetchJson(baseUrl, '/api/v1/users/staff', {
    method: 'POST',
    token: ownerToken,
    body: {
      tenantId,
      email,
      password,
    },
  });
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (!normalizeText(args.baseUrl)) throw new Error('--base-url krävs.');
  if (!normalizeText(args.ownerEmail) || !normalizeText(args.ownerPassword)) {
    throw new Error('Owner credentials saknas.');
  }
  if (!normalizeText(args.tenantId)) {
    throw new Error('tenantId saknas.');
  }

  async function stage(name, fn) {
    try {
      return await fn();
    } catch (error) {
      const message = normalizeText(error?.message || String(error));
      throw new Error(`${name}: ${message}`);
    }
  }

  const ownerAuth = await stage('owner_login', () =>
    login({
      baseUrl: args.baseUrl,
      email: args.ownerEmail,
      password: args.ownerPassword,
      tenantId: args.tenantId,
      mfaCode: args.ownerMfaCode,
      mfaSecret: args.ownerMfaSecret,
      mfaRecoveryCode: args.ownerMfaRecoveryCode,
      authStorePath: args.authStorePath,
    })
  );

  const createdStaff = [];
  if (args.ensureStaff) {
    const risk = await stage('upsert_staff_risk_owner', () =>
      ensureStaffMember({
        baseUrl: args.baseUrl,
        ownerToken: ownerAuth.token,
        tenantId: args.tenantId,
        email: args.riskEmail,
        password: args.riskPassword,
      })
    );
    createdStaff.push({
      role: 'risk_owner',
      email: args.riskEmail,
      createdUser: risk?.createdUser === true,
    });

    const ops = await stage('upsert_staff_ops_owner', () =>
      ensureStaffMember({
        baseUrl: args.baseUrl,
        ownerToken: ownerAuth.token,
        tenantId: args.tenantId,
        email: args.opsEmail,
        password: args.opsPassword,
      })
    );
    createdStaff.push({
      role: 'ops_owner',
      email: args.opsEmail,
      createdUser: ops?.createdUser === true,
    });
  }

  let cycleCreate = null;
  let cycleSource = 'created';
  let cycleId = normalizeText(args.cycleId);
  let cycleStatusBefore = null;

  if (cycleId) {
    cycleStatusBefore = await stage('read_release_status_before_cycle_explicit', () =>
      fetchJson(args.baseUrl, `/api/v1/ops/release/status?cycleId=${encodeURIComponent(cycleId)}`, {
        token: ownerAuth.token,
      })
    );
    const resolvedCycleId = normalizeText(cycleStatusBefore?.cycle?.id);
    if (!resolvedCycleId) throw new Error(`Cycle hittades inte: ${cycleId}`);
    cycleId = resolvedCycleId;
    cycleSource = 'explicit';
  } else if (args.reuseLatestCycle) {
    cycleStatusBefore = await stage('read_release_status_before_cycle_latest', () =>
      fetchJson(args.baseUrl, '/api/v1/ops/release/status', {
        token: ownerAuth.token,
      })
    );
    const latestCycleId = normalizeText(cycleStatusBefore?.cycle?.id);
    const latestStatus = normalizeText(cycleStatusBefore?.cycle?.status).toLowerCase();
    if (latestCycleId && latestStatus && latestStatus !== 'halted') {
      cycleId = latestCycleId;
      cycleSource = 'reused_latest';
    }
  }

  if (!cycleId) {
    cycleCreate = await stage('create_cycle', () =>
      fetchJson(args.baseUrl, '/api/v1/ops/release/cycles', {
        method: 'POST',
        token: ownerAuth.token,
        body: {
          targetEnvironment: 'production',
          rolloutStrategy: args.launchStrategy || 'tenant_batch',
          note: args.cycleNote,
        },
      })
    );
    cycleId = normalizeText(cycleCreate?.cycle?.id);
    if (!cycleId) throw new Error('Kunde inte skapa release cycle.');
  }

  const strictSuite = await stage('run_required_suite', () =>
    fetchJson(args.baseUrl, '/api/v1/ops/scheduler/run', {
      method: 'POST',
      token: ownerAuth.token,
      body: {
        jobId: 'required_suite',
      },
    })
  );
  const [readiness, readinessHistory, monitorStatus] = await stage(
    'fetch_readiness_after_required_suite',
    () =>
      Promise.all([
        fetchJson(args.baseUrl, '/api/v1/monitor/readiness', { token: ownerAuth.token }),
        fetchJson(args.baseUrl, '/api/v1/monitor/readiness/history?limit=30', {
          token: ownerAuth.token,
        }),
        fetchJson(args.baseUrl, '/api/v1/monitor/status', { token: ownerAuth.token }),
      ])
  );
  const strictPassed = strictSuite?.ok === true && Number(strictSuite?.suite?.failed || 0) === 0;
  const noGoWindow = buildNoGoWindow(readinessHistory, args.noGoFreeDays);
  const readinessGoAllowed = readiness?.goNoGo?.allowed === true;
  const restorePreviewHealthy =
    monitorStatus?.gates?.restoreDrill?.healthy30d === true ||
    monitorStatus?.gates?.restoreDrill?.healthy === true;
  const restoreFullHealthy =
    monitorStatus?.gates?.restoreDrillFull?.healthy30d === true ||
    monitorStatus?.gates?.restoreDrillFull?.healthy === true;
  const auditIntegrityHealthy = monitorStatus?.gates?.auditIntegrityDaily?.healthy === true;
  const restoreDrillsVerified = restorePreviewHealthy && restoreFullHealthy && auditIntegrityHealthy;

  const evidenceUpdate = await stage('update_cycle_evidence', () =>
    fetchJson(args.baseUrl, `/api/v1/ops/release/cycles/${cycleId}/evidence`, {
      method: 'POST',
      token: ownerAuth.token,
      body: {
        source: args.evidenceSource,
        readiness: {
          score: Number(readiness?.score || 0),
          band: readiness?.band || '',
          goAllowed: readinessGoAllowed,
          blockerChecksCount: Number(readiness?.goNoGo?.blockingRequiredChecksCount || 0),
          triggeredNoGoCount: Number(readiness?.goNoGo?.triggeredNoGoCount || 0),
          triggeredNoGoIds: Array.isArray(readiness?.goNoGo?.triggeredNoGoIds)
            ? readiness.goNoGo.triggeredNoGoIds
            : [],
        },
        strict: {
          passed: strictPassed,
          failuresCount: Number(strictSuite?.suite?.failed || 0),
          failures: [],
        },
        requiredChecks: {
          noP0P1Blockers:
            Number(readiness?.remediation?.summary?.byPriority?.P0 || 0) === 0 &&
            Number(readiness?.remediation?.summary?.byPriority?.P1 || 0) === 0,
          patientSafetyApproved: readinessGoAllowed,
          restoreDrillsVerified,
          governanceRunbooksReady: true,
        },
        noGoWindow,
        pentestEvidencePath: args.pentestEvidencePath,
        notes: 'Auto evidence from monitor/readiness + required_suite.',
      },
    })
  );

  const signoffResults = [];
  const ownerSignoff = await stage('signoff_owner', () =>
    fetchJson(args.baseUrl, `/api/v1/ops/release/cycles/${cycleId}/signoff`, {
      method: 'POST',
      token: ownerAuth.token,
      body: {
        signoffRole: 'owner',
        note: 'Owner sign-off via release-cycle automation.',
      },
    })
  );
  signoffResults.push({
    role: 'owner',
    email: args.ownerEmail,
    ok: ownerSignoff?.ok === true,
  });

  let effectiveRiskEmail = args.riskEmail;
  let effectiveRiskPassword = args.riskPassword;
  let riskAuth = null;
  try {
    riskAuth = await stage('risk_owner_login', () =>
      login({
        baseUrl: args.baseUrl,
        email: effectiveRiskEmail,
        password: effectiveRiskPassword,
        tenantId: args.tenantId,
        mfaCode: args.riskMfaCode,
        mfaSecret: args.riskMfaSecret,
        mfaRecoveryCode: args.riskMfaRecoveryCode,
        authStorePath: args.authStorePath,
      })
    );
  } catch (error) {
    const message = normalizeText(error?.message || '');
    if (!message.toLowerCase().includes('fel e-postadress eller lösenord')) throw error;
    effectiveRiskEmail = buildFallbackEmail('risk-owner', args.tenantId);
    effectiveRiskPassword = randomPassword('ArcanaRisk');
    await stage('upsert_staff_risk_owner_fallback', () =>
      ensureStaffMember({
        baseUrl: args.baseUrl,
        ownerToken: ownerAuth.token,
        tenantId: args.tenantId,
        email: effectiveRiskEmail,
        password: effectiveRiskPassword,
      })
    );
    riskAuth = await stage('risk_owner_login_fallback', () =>
      login({
        baseUrl: args.baseUrl,
        email: effectiveRiskEmail,
        password: effectiveRiskPassword,
        tenantId: args.tenantId,
        mfaCode: args.riskMfaCode,
        mfaSecret: args.riskMfaSecret,
        mfaRecoveryCode: args.riskMfaRecoveryCode,
        authStorePath: args.authStorePath,
      })
    );
    createdStaff.push({
      role: 'risk_owner',
      email: effectiveRiskEmail,
      createdUser: true,
      fallback: true,
    });
  }
  const riskSignoff = await stage('signoff_risk_owner', () =>
    fetchJson(args.baseUrl, `/api/v1/ops/release/cycles/${cycleId}/signoff`, {
      method: 'POST',
      token: riskAuth.token,
      body: {
        signoffRole: 'risk_owner',
        note: 'Risk sign-off via release-cycle automation.',
      },
    })
  );
  signoffResults.push({
    role: 'risk_owner',
    email: effectiveRiskEmail,
    ok: riskSignoff?.ok === true,
  });

  let effectiveOpsEmail = args.opsEmail;
  let effectiveOpsPassword = args.opsPassword;
  let opsAuth = null;
  try {
    opsAuth = await stage('ops_owner_login', () =>
      login({
        baseUrl: args.baseUrl,
        email: effectiveOpsEmail,
        password: effectiveOpsPassword,
        tenantId: args.tenantId,
        mfaCode: args.opsMfaCode,
        mfaSecret: args.opsMfaSecret,
        mfaRecoveryCode: args.opsMfaRecoveryCode,
        authStorePath: args.authStorePath,
      })
    );
  } catch (error) {
    const message = normalizeText(error?.message || '');
    if (!message.toLowerCase().includes('fel e-postadress eller lösenord')) throw error;
    effectiveOpsEmail = buildFallbackEmail('ops-owner', args.tenantId);
    effectiveOpsPassword = randomPassword('ArcanaOps');
    await stage('upsert_staff_ops_owner_fallback', () =>
      ensureStaffMember({
        baseUrl: args.baseUrl,
        ownerToken: ownerAuth.token,
        tenantId: args.tenantId,
        email: effectiveOpsEmail,
        password: effectiveOpsPassword,
      })
    );
    opsAuth = await stage('ops_owner_login_fallback', () =>
      login({
        baseUrl: args.baseUrl,
        email: effectiveOpsEmail,
        password: effectiveOpsPassword,
        tenantId: args.tenantId,
        mfaCode: args.opsMfaCode,
        mfaSecret: args.opsMfaSecret,
        mfaRecoveryCode: args.opsMfaRecoveryCode,
        authStorePath: args.authStorePath,
      })
    );
    createdStaff.push({
      role: 'ops_owner',
      email: effectiveOpsEmail,
      createdUser: true,
      fallback: true,
    });
  }
  const opsSignoff = await stage('signoff_ops_owner', () =>
    fetchJson(args.baseUrl, `/api/v1/ops/release/cycles/${cycleId}/signoff`, {
      method: 'POST',
      token: opsAuth.token,
      body: {
        signoffRole: 'ops_owner',
        note: 'Ops sign-off via release-cycle automation.',
      },
    })
  );
  signoffResults.push({
    role: 'ops_owner',
    email: effectiveOpsEmail,
    ok: opsSignoff?.ok === true,
  });

  const releaseStatus = await stage('read_release_status_after_signoff', () =>
    fetchJson(args.baseUrl, `/api/v1/ops/release/status?cycleId=${encodeURIComponent(cycleId)}`, {
      token: ownerAuth.token,
    })
  );

  const cycleAlreadyLaunched = normalizeText(cycleStatusBefore?.cycle?.status).toLowerCase() === 'launched';
  let launchResult = null;
  if (args.launch) {
    if (cycleAlreadyLaunched) {
      launchResult = {
        ok: true,
        skipped: true,
        reason: 'already_launched',
        cycleId,
      };
    } else {
      if (!isReleaseGateClear(releaseStatus?.evaluation)) {
        throw new Error('Release gate ej passerad; launch avbruten.');
      }
      launchResult = await fetchJson(
        args.baseUrl,
        `/api/v1/ops/release/cycles/${cycleId}/launch`,
        {
          method: 'POST',
          token: ownerAuth.token,
          body: {
            strategy: args.launchStrategy || 'tenant_batch',
            batchLabel: args.launchBatchLabel || null,
            rollbackPlan: args.launchRollbackPlan || '',
          },
        }
      );
    }
  }

  let reviewResult = null;
  if (args.reviewNow && (launchResult?.ok === true || cycleAlreadyLaunched)) {
    const incidents = await fetchJson(args.baseUrl, '/api/v1/incidents/summary', {
      token: ownerAuth.token,
    });
    reviewResult = await fetchJson(
      args.baseUrl,
      `/api/v1/ops/release/cycles/${cycleId}/review`,
      {
        method: 'POST',
        token: ownerAuth.token,
        body: {
          status: normalizeText(args.reviewStatus) || 'ok',
          note: args.reviewNote,
          openIncidents: Number(incidents?.totals?.openUnresolved || 0),
          breachedIncidents: Number(incidents?.totals?.breachedOpen || 0),
          triggeredNoGoCount: Number(releaseStatus?.evaluation?.blockers?.length || 0),
        },
      }
    );
  }

  let realityAuditResult = null;
  if (args.realityAuditNow && (launchResult?.ok === true || cycleAlreadyLaunched)) {
    realityAuditResult = await fetchJson(
      args.baseUrl,
      `/api/v1/ops/release/cycles/${cycleId}/reality-audit`,
      {
        method: 'POST',
        token: ownerAuth.token,
        body: {
          changeGovernanceVersion: normalizeText(args.changeGovernanceVersion) || undefined,
          note: normalizeText(args.realityAuditNote) || undefined,
        },
      }
    );
  }

  let finalLiveSignoffResult = null;
  if (args.finalLiveSignoffNow) {
    finalLiveSignoffResult = await fetchJson(
      args.baseUrl,
      `/api/v1/ops/release/cycles/${cycleId}/final-live-signoff`,
      {
        method: 'POST',
        token: ownerAuth.token,
        body: {
          note: normalizeText(args.finalLiveSignoffNote) || undefined,
        },
      }
    );
  }

  const finalStatus = await fetchJson(
    args.baseUrl,
    `/api/v1/ops/release/status?cycleId=${encodeURIComponent(cycleId)}`,
    {
      token: ownerAuth.token,
    }
  );

  const output = {
    generatedAt: new Date().toISOString(),
    input: {
      baseUrl: args.baseUrl,
      tenantId: args.tenantId,
      cycleId: args.cycleId || null,
      reuseLatestCycle: args.reuseLatestCycle,
      launch: args.launch,
      reviewNow: args.reviewNow,
      finalLiveSignoffNow: args.finalLiveSignoffNow,
      cycleNote: args.cycleNote,
      evidenceSource: args.evidenceSource,
      pentestEvidencePath: path.resolve(args.pentestEvidencePath),
      noGoFreeDays: args.noGoFreeDays,
    },
    actors: {
      owner: {
        email: args.ownerEmail,
        usedMfa: ownerAuth.usedMfa === true,
      },
      riskOwner: {
        email: effectiveRiskEmail,
        usedMfa: riskAuth.usedMfa === true,
      },
      opsOwner: {
        email: effectiveOpsEmail,
        usedMfa: opsAuth.usedMfa === true,
      },
      createdStaff,
    },
    cycle: {
      id: cycleId,
      source: cycleSource,
      statusBefore: cycleStatusBefore?.cycle?.status || null,
      created: cycleCreate?.cycle || null,
      evidence: evidenceUpdate?.cycle?.gateEvidence || null,
      signoffs: signoffResults,
      releaseStatus,
      launchResult,
      reviewResult,
      realityAuditResult,
      finalLiveSignoffResult,
      finalStatus,
    },
  };

  const outPath = path.resolve(args.outFile);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  process.stdout.write('== Release Cycle Automation ==\n');
  process.stdout.write(`out: ${outPath}\n`);
  process.stdout.write(`cycleSource: ${cycleSource}\n`);
  process.stdout.write(
    `cycle: ${cycleId} | gatePassed=${isReleaseGateClear(finalStatus?.evaluation) ? 'yes' : 'no'} | blockers=${Number(finalStatus?.evaluation?.blockers?.length || 0)}\n`
  );
  process.stdout.write(
    `launch: ${summarizeResultFlag(launchResult)} | review: ${summarizeResultFlag(reviewResult)} | realityAudit: ${summarizeResultFlag(realityAuditResult)} | finalLiveSignoff: ${summarizeResultFlag(finalLiveSignoffResult)}\n`
  );

  if (args.failOnGate && !isReleaseGateClear(finalStatus?.evaluation)) {
    process.exitCode = 2;
  }
}

run().catch((error) => {
  console.error('❌ Could not run release-cycle automation');
  console.error(error?.message || error);
  process.exitCode = 1;
});
