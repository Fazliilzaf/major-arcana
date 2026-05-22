#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const { inspectPentestEvidence } = require('../src/ops/pentestEvidence');

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

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function clamp(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseArgs(argv) {
  const args = {
    reportsDir: normalizeText(process.env.ARCANA_REPORTS_DIR || path.join('data', 'reports')),
    preflightFile: normalizeText(
      process.env.ARCANA_RELEASE_PREFLIGHT_FILE || path.join('data', 'reports', 'preflight-latest.json')
    ),
    opsFile: normalizeText(process.env.ARCANA_RELEASE_OPS_FILE || ''),
    outFile: normalizeText(
      process.env.ARCANA_RELEASE_READINESS_OUT_FILE ||
        path.join('data', 'reports', 'release-readiness-latest.json')
    ),
    pentestEvidencePath: normalizeText(
      process.env.ARCANA_RELEASE_PENTEST_EVIDENCE_PATH || './docs/security/pentest-latest.md'
    ),
    requirePentestEvidence: parseBoolean(
      process.env.ARCANA_RELEASE_REQUIRE_PENTEST_EVIDENCE,
      false
    ),
    pentestMaxAgeDays: parsePositiveInt(process.env.ARCANA_RELEASE_PENTEST_MAX_AGE_DAYS, 120),
    minNoGoFreeDays: parsePositiveInt(process.env.ARCANA_RELEASE_NO_GO_FREE_DAYS, 14),
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = normalizeText(argv[index]);
    if (item === '--reports-dir') {
      args.reportsDir = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--preflight-file') {
      args.preflightFile = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--ops-file') {
      args.opsFile = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--out-file') {
      args.outFile = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--pentest-evidence-path') {
      args.pentestEvidencePath = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--require-pentest-evidence') {
      args.requirePentestEvidence = true;
      continue;
    }
    if (item === '--no-require-pentest-evidence') {
      args.requirePentestEvidence = false;
      continue;
    }
    if (item === '--pentest-max-age-days') {
      args.pentestMaxAgeDays = parsePositiveInt(argv[index + 1], args.pentestMaxAgeDays);
      index += 1;
      continue;
    }
    if (item === '--min-no-go-free-days') {
      args.minNoGoFreeDays = parsePositiveInt(argv[index + 1], args.minNoGoFreeDays);
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

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function resolveLatestOpsSuiteFile(reportsDir) {
  const dir = path.resolve(reportsDir);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter(
      (name) =>
        (name.startsWith('Scheduler_Suite_') || name.startsWith('Ops_Suite_')) &&
        name.endsWith('.json')
    );
  if (candidates.length === 0) return '';
  const enriched = await Promise.all(
    candidates.map(async (name) => {
      const fullPath = path.join(dir, name);
      const stat = await fs.stat(fullPath);
      return {
        fullPath,
        mtimeMs: stat.mtimeMs,
      };
    })
  );
  enriched.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return enriched[0]?.fullPath || '';
}

function findCheckById(readiness, checkId) {
  const categories = Array.isArray(readiness?.categories) ? readiness.categories : [];
  for (const category of categories) {
    const checks = Array.isArray(category?.checks) ? category.checks : [];
    const match = checks.find((item) => normalizeText(item?.id) === checkId);
    if (match) return match;
  }
  return null;
}

function buildNoGoWindowFromHistory(readinessHistory = null, minDays = 14) {
  const safeDays = Math.max(1, Number(minDays) || 14);
  const nowMs = Date.now();
  const cutoffMs = nowMs - safeDays * 24 * 60 * 60 * 1000;
  const entries = Array.isArray(readinessHistory?.entries) ? readinessHistory.entries : [];
  const relevant = entries.filter((entry) => {
    const ts = Date.parse(String(entry?.ts || ''));
    return Number.isFinite(ts) && ts >= cutoffMs && ts <= nowMs;
  });
  let clean = relevant.length > 0;
  let maxTriggeredNoGo = 0;
  for (const entry of relevant) {
    const triggeredNoGo = Number(entry?.triggeredNoGo || 0);
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
    latestTs: relevant[0]?.ts || null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const preflightPath = path.resolve(args.preflightFile);
  const opsPath = path.resolve(
    args.opsFile || (await resolveLatestOpsSuiteFile(args.reportsDir))
  );

  if (!normalizeText(opsPath)) {
    throw new Error('Kunde inte hitta ops-suite rapportfil.');
  }

  const [preflight, opsReport] = await Promise.all([
    readJsonFile(preflightPath),
    readJsonFile(opsPath),
  ]);

  const readiness =
    opsReport?.monitor?.readiness && typeof opsReport.monitor.readiness === 'object'
      ? opsReport.monitor.readiness
      : preflight?.diagnostics?.opsSuite?.readiness && typeof preflight.diagnostics.opsSuite.readiness === 'object'
        ? preflight.diagnostics.opsSuite.readiness
        : null;
  const readinessHistory =
    opsReport?.monitor?.readinessHistory && typeof opsReport.monitor.readinessHistory === 'object'
      ? opsReport.monitor.readinessHistory
      : null;
  const monitorStatus =
    opsReport?.monitor?.status && typeof opsReport.monitor.status === 'object'
      ? opsReport.monitor.status
      : null;
  const strict =
    opsReport?.strict && typeof opsReport.strict === 'object'
      ? opsReport.strict
      : null;

  if (!readiness) {
    throw new Error('Readiness-data saknas i ops/preflight rapporter.');
  }

  const remediationSummary =
    readiness?.remediation?.summary && typeof readiness.remediation.summary === 'object'
      ? readiness.remediation.summary
      : {};
  const byPriority =
    remediationSummary?.byPriority && typeof remediationSummary.byPriority === 'object'
      ? remediationSummary.byPriority
      : {};
  const strictFailures = Array.isArray(strict?.failures) ? strict.failures : [];
  const noGoWindow = buildNoGoWindowFromHistory(readinessHistory, args.minNoGoFreeDays);
  const pentest = await inspectPentestEvidence(args.pentestEvidencePath, {
    maxAgeDays: args.pentestMaxAgeDays,
    requireSignedReference: true,
  });

  const noP0P1Blockers =
    Number(byPriority.P0 || 0) === 0 && Number(byPriority.P1 || 0) === 0 && strictFailures.length === 0;
  const publicChatGateCheck = findCheckById(readiness, 'public_chat_beta_gate');
  const patientFeedbackCheck = findCheckById(readiness, 'patient_conversion_feedback_loop');
  const patientSafetyApproved =
    normalizeText(publicChatGateCheck?.status) !== 'red' &&
    normalizeText(patientFeedbackCheck?.status) !== 'red' &&
    Number(readiness?.goNoGo?.triggeredNoGoCount || 0) === 0;

  const restorePreviewHealthy =
    monitorStatus?.gates?.restoreDrill?.healthy30d === true ||
    monitorStatus?.gates?.restoreDrill?.healthy === true;
  const restoreFullHealthy =
    monitorStatus?.gates?.restoreDrillFull?.healthy30d === true ||
    monitorStatus?.gates?.restoreDrillFull?.healthy === true;
  const auditIntegrityHealthy = monitorStatus?.gates?.auditIntegrityDaily?.healthy === true;
  const restoreDrillsVerified = restorePreviewHealthy && restoreFullHealthy && auditIntegrityHealthy;

  const runbookFiles = [
    path.resolve('docs/ops/arcana-finalization-runbook.md'),
    path.resolve('docs/ops/secrets-rotation-runbook.md'),
    path.resolve('docs/ops/runbooks/incident-runbook.md'),
    path.resolve('docs/ops/runbooks/failover-runbook.md'),
    path.resolve('docs/ops/runbooks/rollback-runbook.md'),
    path.resolve('docs/ops/runbooks/patient-safety-incident-runbook.md'),
  ];
  const runbookChecks = await Promise.all(
    runbookFiles.map(async (filePath) => {
      try {
        await fs.access(filePath);
        return { path: filePath, exists: true };
      } catch {
        return { path: filePath, exists: false };
      }
    })
  );
  const governanceRunbooksReady = runbookChecks.every((item) => item.exists === true);

  const checks = {
    readinessGoAllowed: readiness?.goNoGo?.allowed === true,
    strictPassed: strictFailures.length === 0,
    noP0P1Blockers,
    patientSafetyApproved,
    restoreDrillsVerified,
    governanceRunbooksReady,
    noGoWindowClean: noGoWindow.clean === true,
    pentestEvidenceOk: args.requirePentestEvidence ? pentest.healthy === true : true,
  };
  const failedChecks = Object.entries(checks)
    .filter(([, value]) => value !== true)
    .map(([id]) => id);

  const output = {
    generatedAt: new Date().toISOString(),
    inputs: {
      preflightFile: preflightPath,
      opsFile: opsPath,
      requirePentestEvidence: args.requirePentestEvidence,
      pentestMaxAgeDays: args.pentestMaxAgeDays,
      minNoGoFreeDays: args.minNoGoFreeDays,
    },
    readiness: {
      score: toNumber(readiness?.score || 0),
      band: normalizeText(readiness?.band) || null,
      goAllowed: readiness?.goNoGo?.allowed === true,
      blockerChecksCount: Number(readiness?.goNoGo?.blockingRequiredChecksCount || 0),
      triggeredNoGoCount: Number(readiness?.goNoGo?.triggeredNoGoCount || 0),
      triggeredNoGoIds: Array.isArray(readiness?.goNoGo?.triggeredNoGoIds)
        ? readiness.goNoGo.triggeredNoGoIds
        : [],
      remediation: {
        total: Number(remediationSummary?.total || 0),
        byPriority: {
          P0: Number(byPriority.P0 || 0),
          P1: Number(byPriority.P1 || 0),
          P2: Number(byPriority.P2 || 0),
          P3: Number(byPriority.P3 || 0),
        },
      },
    },
    strict: {
      passed: strictFailures.length === 0,
      failuresCount: strictFailures.length,
      failures: strictFailures.slice(0, 50),
    },
    noGoWindow,
    pentest,
    runbooks: {
      ready: governanceRunbooksReady,
      files: runbookChecks,
    },
    checks,
    releaseGatePassed: failedChecks.length === 0,
    failedChecks,
    reportSources: {
      readinessHistoryEntries: Number(
        Array.isArray(readinessHistory?.entries) ? readinessHistory.entries.length : 0
      ),
      monitorStatusAt: toIso(monitorStatus?.generatedAt),
      readinessAt: toIso(readiness?.generatedAt),
    },
  };

  const outputPath = path.resolve(args.outFile);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  if (args.json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    process.stdout.write('== Release Readiness Report ==\n');
    process.stdout.write(`out: ${outputPath}\n`);
    process.stdout.write(
      `gate: ${output.releaseGatePassed ? 'PASS' : 'FAIL'} | score=${output.readiness.score} band=${output.readiness.band || '-'} goAllowed=${output.readiness.goAllowed ? 'yes' : 'no'}\n`
    );
    process.stdout.write(`failedChecks: ${output.failedChecks.join(',') || '-'}\n`);
  }

  if (!output.releaseGatePassed) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error('❌ Could not build release readiness report');
  console.error(error?.message || error);
  process.exitCode = 1;
});
