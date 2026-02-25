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
  const blockerChecks = [];
  for (const category of readinessCategories) {
    const categoryId = normalizeText(category?.id);
    const categoryLabel = normalizeText(category?.label);
    const checks = Array.isArray(category?.checks) ? category.checks : [];
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
        valuePreview: toValuePreview(check?.value),
        owner: normalizeText(hint?.owner) || null,
        playbook: normalizeText(hint?.playbook) || null,
      });
    }
  }
  blockerChecks.sort((a, b) => {
    const bySeverity = checkSeverityRank(a?.status) - checkSeverityRank(b?.status);
    if (bySeverity !== 0) return bySeverity;
    return String(a?.checkId || '').localeCompare(String(b?.checkId || ''));
  });
  const blockerChecksTop = blockerChecks.slice(0, 8);

  const artifact = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    options: {
      failOnNoGo: Boolean(args.failOnNoGo),
      remediateOutputGates: Boolean(args.remediateOutputGates),
      remediationLimit: parsePositiveInt(args.remediationLimit, 50, 1, 200),
    },
    auth: {
      flow: auth.authFlow,
      tenantId: auth.authTenantId || tenantId || null,
    },
    ops: {
      readinessOutputGateRemediation,
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
        remediationSummary: readiness?.remediation?.summary || null,
        remediationTopP0,
        blockerChecks,
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
  const blockerCheckCount = blockerChecks.length;
  const blockerCheckLabels =
    blockerChecksTop
      .map((item) => `${item.checkId || '-'}(${item.status || '-'})`)
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
        : '';
    strictFailures.push(`readiness blocker categories are not all green${checksSuffix}`);
  }
  if (monitorStatus?.gates?.pilotReport?.noGo === true) strictFailures.push('pilot report gate is no-go');
  if (monitorStatus?.gates?.restoreDrill?.noGo === true) strictFailures.push('restore drill gate is no-go');
  if (sloOverall === 'red' || sloOverall === 'unknown') {
    strictFailures.push(`slo overall status is ${sloOverall}`);
  }
  if (
    !remediationRunEnabled &&
    triggeredNoGoIds.includes('output_without_risk_policy_gate')
  ) {
    advisories.push(
      'run with --remediate-output-gates to auto-fix active-version output/policy metadata gaps'
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
  }

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
  process.stdout.write(
    `   remediation: total=${remediationTotal} p0=${remediationP0} top=${remediationTopLabel}\n`
  );
  process.stdout.write(
    `   blockerChecks: count=${blockerCheckCount} top=${blockerCheckLabels}\n`
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
  }
  if (remediationRunEnabled) {
    process.stdout.write(
      `   remediationRun: candidates=${remediationRunCandidates} fixable=${remediationRunFixable} fixed=${remediationRunFixed} remaining=${remediationRunRemaining}\n`
    );
  }
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
