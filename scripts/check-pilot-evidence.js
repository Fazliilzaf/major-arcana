#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');

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

function parseNumber(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseArgs(argv) {
  const args = {
    file: process.env.ARCANA_PILOT_EVIDENCE_FILE || '',
    reportsDir: process.env.ARCANA_PILOT_EVIDENCE_REPORTS_DIR || path.join('data', 'reports'),
    preflightFile:
      process.env.ARCANA_PILOT_EVIDENCE_PREFLIGHT_FILE ||
      path.join('data', 'reports', 'preflight-latest.json'),
    opsSuiteFile: process.env.ARCANA_PILOT_EVIDENCE_OPS_SUITE_FILE || '',
    windowDays: parseNumber(process.env.ARCANA_PILOT_EVIDENCE_WINDOW_DAYS, 14, { min: 1, max: 365 }),
    minTemplates: parseNumber(process.env.ARCANA_PILOT_EVIDENCE_MIN_TEMPLATES, 100, {
      min: 0,
      max: 1_000_000,
    }),
    minEvaluations: parseNumber(process.env.ARCANA_PILOT_EVIDENCE_MIN_EVALUATIONS, 200, {
      min: 0,
      max: 1_000_000,
    }),
    maxHighCritical: parseNumber(process.env.ARCANA_PILOT_EVIDENCE_MAX_HIGH_CRITICAL, 0, {
      min: 0,
      max: 1_000_000,
    }),
    maxOwnerPending: parseNumber(process.env.ARCANA_PILOT_EVIDENCE_MAX_OWNER_PENDING, 0, {
      min: 0,
      max: 1_000_000,
    }),
    minReadinessScore: parseNumber(process.env.ARCANA_PILOT_EVIDENCE_MIN_READINESS_SCORE, 85, {
      min: 0,
      max: 100,
    }),
    requireGoAllowed: parseBoolean(process.env.ARCANA_PILOT_EVIDENCE_REQUIRE_GO_ALLOWED, true),
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = normalizeText(argv[index]);
    if (item === '--file') {
      args.file = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
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
    if (item === '--ops-suite-file') {
      args.opsSuiteFile = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--window-days') {
      args.windowDays = parseNumber(argv[index + 1], args.windowDays, { min: 1, max: 365 });
      index += 1;
      continue;
    }
    if (item === '--min-templates') {
      args.minTemplates = parseNumber(argv[index + 1], args.minTemplates, {
        min: 0,
        max: 1_000_000,
      });
      index += 1;
      continue;
    }
    if (item === '--min-evaluations') {
      args.minEvaluations = parseNumber(argv[index + 1], args.minEvaluations, {
        min: 0,
        max: 1_000_000,
      });
      index += 1;
      continue;
    }
    if (item === '--max-high-critical') {
      args.maxHighCritical = parseNumber(argv[index + 1], args.maxHighCritical, {
        min: 0,
        max: 1_000_000,
      });
      index += 1;
      continue;
    }
    if (item === '--max-owner-pending') {
      args.maxOwnerPending = parseNumber(argv[index + 1], args.maxOwnerPending, {
        min: 0,
        max: 1_000_000,
      });
      index += 1;
      continue;
    }
    if (item === '--min-readiness-score') {
      args.minReadinessScore = parseNumber(argv[index + 1], args.minReadinessScore, {
        min: 0,
        max: 100,
      });
      index += 1;
      continue;
    }
    if (item === '--require-go-allowed') {
      args.requireGoAllowed = true;
      continue;
    }
    if (item === '--no-require-go-allowed') {
      args.requireGoAllowed = false;
      continue;
    }
    if (item === '--json') {
      args.json = true;
      continue;
    }
  }

  return args;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function resolveReportFile({ file = '', reportsDir = '', windowDays = 14 } = {}) {
  const explicit = normalizeText(file);
  if (explicit) {
    return path.resolve(explicit);
  }

  const dir = path.resolve(normalizeText(reportsDir) || path.join('data', 'reports'));
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const wantedWindow = String(Math.max(1, Number(windowDays) || 14));
  const candidates = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.startsWith('Pilot_') && name.endsWith('.json'))
    .filter((name) => name.includes(`_${wantedWindow}d_`));

  if (candidates.length === 0) {
    throw new Error(`Hittade ingen pilotrapport i ${dir} för ${wantedWindow}d.`);
  }

  const enriched = await Promise.all(
    candidates.map(async (name) => {
      const fullPath = path.join(dir, name);
      const stat = await fs.stat(fullPath);
      return { name, fullPath, mtimeMs: stat.mtimeMs };
    })
  );

  enriched.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return enriched[0].fullPath;
}

async function readReadinessFromPreflight(filePathRaw = '') {
  const filePath = normalizeText(filePathRaw);
  if (!filePath) return null;
  try {
    const raw = JSON.parse(await fs.readFile(path.resolve(filePath), 'utf8'));
    const readiness =
      raw?.diagnostics?.opsSuite?.readiness &&
      typeof raw.diagnostics.opsSuite.readiness === 'object'
        ? raw.diagnostics.opsSuite.readiness
        : null;
    if (!readiness) return null;
    const score = toNumber(readiness.score, NaN);
    const band = normalizeText(readiness.band);
    const goAllowed = readiness.goAllowed === true;
    if (!Number.isFinite(score) && !band) return null;
    return {
      score: Number.isFinite(score) ? score : 0,
      band: band || '-',
      goNoGo: { allowed: goAllowed },
      source: 'preflight-latest',
    };
  } catch {
    return null;
  }
}

async function resolveLatestOpsSuiteFile({ file = '', reportsDir = '' } = {}) {
  const explicit = normalizeText(file);
  if (explicit) return path.resolve(explicit);
  const dir = path.resolve(normalizeText(reportsDir) || path.join('data', 'reports'));
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return '';
  }
  const candidates = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.startsWith('Ops_Suite_') && name.endsWith('.json'));
  if (candidates.length === 0) return '';
  const enriched = await Promise.all(
    candidates.map(async (name) => {
      const fullPath = path.join(dir, name);
      const stat = await fs.stat(fullPath);
      return { fullPath, mtimeMs: stat.mtimeMs };
    })
  );
  enriched.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return enriched[0]?.fullPath || '';
}

async function readReadinessFromOpsSuite(filePathRaw = '') {
  const filePath = normalizeText(filePathRaw);
  if (!filePath) return null;
  try {
    const raw = JSON.parse(await fs.readFile(path.resolve(filePath), 'utf8'));
    const readiness =
      raw?.monitor?.readiness && typeof raw.monitor.readiness === 'object'
        ? raw.monitor.readiness
        : null;
    if (!readiness) return null;
    const score = toNumber(readiness.score, NaN);
    const band = normalizeText(readiness.band);
    const goAllowed = readiness?.goNoGo?.allowed === true;
    if (!Number.isFinite(score) && !band) return null;
    return {
      score: Number.isFinite(score) ? score : 0,
      band: band || '-',
      goNoGo: { allowed: goAllowed },
      source: 'ops-suite-latest',
    };
  } catch {
    return null;
  }
}

function buildChecks(report, thresholds) {
  const kpis = report?.kpis && typeof report.kpis === 'object' ? report.kpis : {};
  const hasReadinessSnapshot =
    report?.readinessSnapshot && typeof report.readinessSnapshot === 'object';
  const readiness =
    hasReadinessSnapshot ? report.readinessSnapshot : {};
  const goNoGo = readiness?.goNoGo && typeof readiness.goNoGo === 'object' ? readiness.goNoGo : {};

  const values = {
    templatesTotal: toNumber(kpis.templatesTotal, 0),
    evaluationsTotal: toNumber(kpis.evaluationsTotal, 0),
    highCriticalTotal: toNumber(kpis.highCriticalTotal, 0),
    ownerDecisionPending: toNumber(kpis.ownerDecisionPending, 0),
    readinessScore: hasReadinessSnapshot ? toNumber(readiness.score, 0) : null,
    goAllowed: goNoGo.allowed === true,
    readinessBand: normalizeText(readiness.band) || '-',
    readinessAvailable: hasReadinessSnapshot,
  };

  const checks = [
    {
      id: 'templates_total',
      ok: values.templatesTotal >= thresholds.minTemplates,
      expected: `>= ${thresholds.minTemplates}`,
      actual: values.templatesTotal,
    },
    {
      id: 'evaluations_total',
      ok: values.evaluationsTotal >= thresholds.minEvaluations,
      expected: `>= ${thresholds.minEvaluations}`,
      actual: values.evaluationsTotal,
    },
    {
      id: 'high_critical_total',
      ok: values.highCriticalTotal <= thresholds.maxHighCritical,
      expected: `<= ${thresholds.maxHighCritical}`,
      actual: values.highCriticalTotal,
    },
    {
      id: 'owner_pending',
      ok: values.ownerDecisionPending <= thresholds.maxOwnerPending,
      expected: `<= ${thresholds.maxOwnerPending}`,
      actual: values.ownerDecisionPending,
    },
    {
      id: 'readiness_score',
      ok: hasReadinessSnapshot && values.readinessScore >= thresholds.minReadinessScore,
      expected: `>= ${thresholds.minReadinessScore}`,
      actual: hasReadinessSnapshot ? values.readinessScore : 'missing',
    },
  ];

  if (thresholds.requireGoAllowed) {
    checks.push({
      id: 'go_allowed',
      ok: hasReadinessSnapshot && values.goAllowed === true,
      expected: 'true',
      actual: hasReadinessSnapshot ? values.goAllowed : 'missing',
    });
  }

  const failed = checks.filter((item) => item.ok !== true);

  return {
    values,
    checks,
    failed,
    ok: failed.length === 0,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reportFile = await resolveReportFile({
    file: args.file,
    reportsDir: args.reportsDir,
    windowDays: args.windowDays,
  });

  const raw = await fs.readFile(reportFile, 'utf8');
  const report = JSON.parse(raw);
  let readinessSource = 'report';
  let effectiveReport = report;
  const hasReadinessSnapshot =
    report?.readinessSnapshot && typeof report.readinessSnapshot === 'object';
  if (!hasReadinessSnapshot) {
    const fallbackReadiness = await readReadinessFromPreflight(args.preflightFile);
    if (fallbackReadiness) {
      effectiveReport = {
        ...report,
        readinessSnapshot: fallbackReadiness,
      };
      readinessSource = fallbackReadiness.source || 'preflight-latest';
    } else {
      const opsSuiteFile = await resolveLatestOpsSuiteFile({
        file: args.opsSuiteFile,
        reportsDir: args.reportsDir,
      });
      const opsFallbackReadiness = await readReadinessFromOpsSuite(opsSuiteFile);
      if (opsFallbackReadiness) {
        effectiveReport = {
          ...report,
          readinessSnapshot: opsFallbackReadiness,
        };
        readinessSource = opsFallbackReadiness.source || 'ops-suite-latest';
      } else {
        readinessSource = 'missing';
      }
    }
  }

  const evaluation = buildChecks(effectiveReport, {
    minTemplates: args.minTemplates,
    minEvaluations: args.minEvaluations,
    maxHighCritical: args.maxHighCritical,
    maxOwnerPending: args.maxOwnerPending,
    minReadinessScore: args.minReadinessScore,
    requireGoAllowed: args.requireGoAllowed,
  });

  const output = {
    generatedAt: new Date().toISOString(),
    file: reportFile,
    tenantId: normalizeText(effectiveReport?.tenantId) || null,
    windowDays: toNumber(effectiveReport?.windowDays, null),
    reportGeneratedAt: normalizeText(effectiveReport?.generatedAt) || null,
    readinessSource,
    readinessBand: evaluation.values.readinessBand,
    ok: evaluation.ok,
    thresholds: {
      minTemplates: args.minTemplates,
      minEvaluations: args.minEvaluations,
      maxHighCritical: args.maxHighCritical,
      maxOwnerPending: args.maxOwnerPending,
      minReadinessScore: args.minReadinessScore,
      requireGoAllowed: args.requireGoAllowed,
    },
    values: evaluation.values,
    checks: evaluation.checks,
    failed: evaluation.failed,
  };

  if (args.json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    process.stdout.write('== Pilot Evidence Check ==\n');
    process.stdout.write(`file: ${output.file}\n`);
    process.stdout.write(`tenant: ${output.tenantId || '-'}\n`);
    process.stdout.write(`windowDays: ${output.windowDays ?? '-'}\n`);
    process.stdout.write(`readinessBand: ${output.readinessBand}\n`);
    for (const check of output.checks) {
      process.stdout.write(
        `${check.ok ? '✅' : '❌'} ${check.id}: actual=${check.actual} expected=${check.expected}\n`
      );
    }
  }

  if (!output.ok) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error('❌ Could not check pilot evidence');
  console.error(error?.message || error);
  process.exitCode = 1;
});
