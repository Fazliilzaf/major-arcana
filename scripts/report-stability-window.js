#!/usr/bin/env node
require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  toIso,
  buildWindowSummary,
  isReleaseGateClear,
  buildStabilityDecision,
} = require('../src/ops/stabilityWindow');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInt(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
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

function parseArgs(argv) {
  const args = {
    baseUrl: normalizeText(process.env.BASE_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:3000'),
    tenantId: normalizeText(process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic'),
    ownerEmail: normalizeText(process.env.ARCANA_OWNER_EMAIL || ''),
    ownerPassword: normalizeText(process.env.ARCANA_OWNER_PASSWORD || ''),
    ownerMfaCode: normalizeText(process.env.ARCANA_OWNER_MFA_CODE || ''),
    ownerMfaSecret: normalizeText(process.env.ARCANA_OWNER_MFA_SECRET || ''),
    ownerMfaRecoveryCode: normalizeText(process.env.ARCANA_OWNER_MFA_RECOVERY_CODE || ''),
    authStorePath: normalizeText(process.env.AUTH_STORE_PATH || path.join('data', 'auth.json')),
    cycleId: normalizeText(process.env.ARCANA_STABILITY_WINDOW_CYCLE_ID || ''),
    windowDays: parsePositiveInt(process.env.ARCANA_STABILITY_WINDOW_DAYS, 14, 1, 90),
    historyLimit: parsePositiveInt(process.env.ARCANA_STABILITY_WINDOW_HISTORY_LIMIT, 200, 10, 200),
    runRequiredSuite: parseBoolean(process.env.ARCANA_STABILITY_WINDOW_RUN_REQUIRED_SUITE, false),
    requireCompleteWindow: parseBoolean(process.env.ARCANA_STABILITY_WINDOW_REQUIRE_COMPLETE, false),
    failOnWindow: parseBoolean(process.env.ARCANA_STABILITY_WINDOW_FAIL_ON_WINDOW, false),
    failOnReleaseBlockers: parseBoolean(
      process.env.ARCANA_STABILITY_WINDOW_FAIL_ON_RELEASE_BLOCKERS,
      false
    ),
    outFile: normalizeText(
      process.env.ARCANA_STABILITY_WINDOW_OUT_FILE ||
        path.join('data', 'reports', `Stability_Window_${nowStamp()}.json`)
    ),
    json: parseBoolean(process.env.ARCANA_STABILITY_WINDOW_JSON, false),
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
    if (item === '--cycle-id') {
      args.cycleId = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--window-days') {
      args.windowDays = parsePositiveInt(argv[index + 1], args.windowDays, 1, 90);
      index += 1;
      continue;
    }
    if (item === '--history-limit') {
      args.historyLimit = parsePositiveInt(argv[index + 1], args.historyLimit, 10, 200);
      index += 1;
      continue;
    }
    if (item === '--run-required-suite') {
      args.runRequiredSuite = true;
      continue;
    }
    if (item === '--no-run-required-suite') {
      args.runRequiredSuite = false;
      continue;
    }
    if (item === '--require-complete-window') {
      args.requireCompleteWindow = true;
      continue;
    }
    if (item === '--no-require-complete-window') {
      args.requireCompleteWindow = false;
      continue;
    }
    if (item === '--fail-on-window') {
      args.failOnWindow = true;
      continue;
    }
    if (item === '--no-fail-on-window') {
      args.failOnWindow = false;
      continue;
    }
    if (item === '--fail-on-release-blockers') {
      args.failOnReleaseBlockers = true;
      continue;
    }
    if (item === '--no-fail-on-release-blockers') {
      args.failOnReleaseBlockers = false;
      continue;
    }
    if (item === '--out-file') {
      args.outFile = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--json') {
      args.json = true;
      continue;
    }
  }

  return args;
}

function buildFinalLiveSignoffSummary(cycle = null, evaluation = null) {
  const fromEval =
    evaluation?.finalLiveSignoff && typeof evaluation.finalLiveSignoff === 'object'
      ? evaluation.finalLiveSignoff
      : null;
  if (fromEval) {
    return {
      locked: fromEval.locked === true,
      lockedAt: toIso(fromEval.lockedAt),
      lockedBy: normalizeText(fromEval.lockedBy) || null,
      note: normalizeText(fromEval.note),
    };
  }
  return {
    locked:
      Boolean(toIso(cycle?.governance?.finalLiveSignoffAt)) &&
      Boolean(normalizeText(cycle?.governance?.finalLiveSignoffBy)),
    lockedAt: toIso(cycle?.governance?.finalLiveSignoffAt),
    lockedBy: normalizeText(cycle?.governance?.finalLiveSignoffBy) || null,
    note: normalizeText(cycle?.governance?.finalLiveSignoffNote),
  };
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

  if (
    verify?.requiresTenantSelection === true &&
    normalizeText(verify?.loginTicket) &&
    normalizeText(tenantId)
  ) {
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

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (!normalizeText(args.baseUrl)) throw new Error('baseUrl saknas.');
  if (!normalizeText(args.ownerEmail) || !normalizeText(args.ownerPassword)) {
    throw new Error('Owner credentials saknas.');
  }
  if (!normalizeText(args.tenantId)) {
    throw new Error('tenantId saknas.');
  }

  const ownerAuth = await login({
    baseUrl: args.baseUrl,
    email: args.ownerEmail,
    password: args.ownerPassword,
    tenantId: args.tenantId,
    mfaCode: args.ownerMfaCode,
    mfaSecret: args.ownerMfaSecret,
    mfaRecoveryCode: args.ownerMfaRecoveryCode,
    authStorePath: args.authStorePath,
  });

  let requiredSuiteResult = null;
  if (args.runRequiredSuite) {
    requiredSuiteResult = await fetchJson(args.baseUrl, '/api/v1/ops/scheduler/run', {
      method: 'POST',
      token: ownerAuth.token,
      body: {
        jobId: 'required_suite',
      },
    });
  }

  const [readinessSnapshot, readinessHistory, releaseStatus, incidentsSummary] = await Promise.all([
    fetchJson(args.baseUrl, '/api/v1/monitor/readiness', { token: ownerAuth.token }),
    fetchJson(
      args.baseUrl,
      `/api/v1/monitor/readiness/history?limit=${encodeURIComponent(String(args.historyLimit))}`,
      {
        token: ownerAuth.token,
      }
    ),
    fetchJson(
      args.baseUrl,
      `/api/v1/ops/release/status${args.cycleId ? `?cycleId=${encodeURIComponent(args.cycleId)}` : ''}`,
      { token: ownerAuth.token }
    ),
    fetchJson(args.baseUrl, '/api/v1/incidents/summary', { token: ownerAuth.token }).catch(() => null),
  ]);

  const cycle = releaseStatus?.cycle && typeof releaseStatus.cycle === 'object'
    ? releaseStatus.cycle
    : null;
  const evaluation = releaseStatus?.evaluation && typeof releaseStatus.evaluation === 'object'
    ? releaseStatus.evaluation
    : null;
  const launchedAt = toIso(cycle?.launch?.launchedAt || cycle?.launch?.launched_at || null);
  const window = buildWindowSummary({
    entries: Array.isArray(readinessHistory?.entries) ? readinessHistory.entries : [],
    windowDays: args.windowDays,
    launchedAt,
    nowMs: Date.now(),
  });

  const blockerIds = Array.isArray(evaluation?.blockers)
    ? evaluation.blockers
        .map((item) => normalizeText(item?.id))
        .filter(Boolean)
    : [];
  const releaseGateClear = isReleaseGateClear(evaluation);
  const decision = buildStabilityDecision({
    releaseEvaluation: evaluation,
    windowSummary: window,
    requireCompleteWindow: args.requireCompleteWindow,
  });

  const output = {
    generatedAt: new Date().toISOString(),
    input: {
      baseUrl: args.baseUrl,
      tenantId: args.tenantId,
      cycleId: args.cycleId || null,
      windowDays: args.windowDays,
      historyLimit: args.historyLimit,
      runRequiredSuite: args.runRequiredSuite,
      requireCompleteWindow: args.requireCompleteWindow,
    },
    auth: {
      ownerEmail: args.ownerEmail,
      usedMfa: ownerAuth.usedMfa === true,
    },
    release: {
      cycleId: cycle?.id || null,
      status: cycle?.status || null,
      launchedAt,
      releaseGatePassed: evaluation?.releaseGatePassed === true,
      blockerCount: blockerIds.length,
      blockerIds,
      releaseGateClear,
      postLaunchReview: evaluation?.postLaunchReview || null,
      postLaunchStabilization: evaluation?.postLaunchStabilization || null,
      realityAudit: evaluation?.realityAudit || null,
      finalLiveSignoff: buildFinalLiveSignoffSummary(cycle, evaluation),
    },
    readiness: {
      latest: readinessSnapshot && typeof readinessSnapshot === 'object'
        ? {
            score: Number(readinessSnapshot?.score || 0),
            band: normalizeText(readinessSnapshot?.band) || null,
            goAllowed: readinessSnapshot?.goNoGo?.allowed === true,
            triggeredNoGoCount: Number(readinessSnapshot?.goNoGo?.triggeredNoGoCount || 0),
            blockingRequiredChecksCount: Number(
              readinessSnapshot?.goNoGo?.blockingRequiredChecksCount || 0
            ),
          }
        : null,
      history: {
        count: Number(readinessHistory?.count || 0),
        trend: readinessHistory?.trend || null,
      },
    },
    incidents: incidentsSummary && typeof incidentsSummary === 'object'
      ? incidentsSummary?.totals || null
      : null,
    requiredSuite: {
      executed: args.runRequiredSuite,
      result: requiredSuiteResult || null,
    },
    stabilityWindow: window,
    decision,
  };

  const outputPath = path.resolve(args.outFile);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  if (args.json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    process.stdout.write('== Stability Window Report ==\n');
    process.stdout.write(`out: ${outputPath}\n`);
    process.stdout.write(
      `cycle: ${output.release.cycleId || '-'} status=${output.release.status || '-'} launch=${output.release.launchedAt || '-'} releaseGateClear=${output.release.releaseGateClear ? 'yes' : 'no'} blockers=${output.release.blockerCount} finalLiveSignoffLocked=${output.release.finalLiveSignoff?.locked ? 'yes' : 'no'}\n`
    );
    process.stdout.write(
      `window: status=${output.stabilityWindow.status} days=${output.stabilityWindow.windowDays} covered=${output.stabilityWindow.daysCovered}/${output.stabilityWindow.expectedDays} coverage=${output.stabilityWindow.coveragePercent}% maxTriggeredNoGo=${output.stabilityWindow.maxTriggeredNoGo}\n`
    );
    process.stdout.write(
      `decision: overall=${output.decision.overallStatus} readySoFar=${output.decision.readySoFar ? 'yes' : 'no'} readyForBroadGoLive=${output.decision.readyForBroadGoLive ? 'yes' : 'no'} reasons=${output.decision.reasons.join(',') || '-'}\n`
    );
  }

  let shouldFail = false;
  if (args.failOnReleaseBlockers && !releaseGateClear) shouldFail = true;
  if (args.failOnWindow) {
    if (args.requireCompleteWindow) {
      if (decision.readyForBroadGoLive !== true) shouldFail = true;
    } else if (window.status === 'fail') {
      shouldFail = true;
    }
  }
  if (shouldFail) process.exitCode = 2;
}

run().catch((error) => {
  console.error('❌ Could not build stability-window report');
  console.error(error?.message || error);
  process.exitCode = 1;
});
