#!/usr/bin/env node
require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  DEFAULT_EXPECTED_REMAINING,
  buildClosureStatus,
} = require('../src/ops/closureStatus');

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

function parseArgs(argv) {
  const args = {
    finalizationFile: normalizeText(
      process.env.ARCANA_CLOSURE_STATUS_FINALIZATION_FILE ||
        path.join('data', 'reports', 'finalization-sweep-latest.json')
    ),
    releaseReadinessFile: normalizeText(
      process.env.ARCANA_CLOSURE_STATUS_RELEASE_READINESS_FILE ||
        path.join('data', 'reports', 'release-readiness-latest.json')
    ),
    stabilityFile: normalizeText(
      process.env.ARCANA_CLOSURE_STATUS_STABILITY_FILE ||
        path.join('data', 'reports', 'stability-window-latest.json')
    ),
    outJson: normalizeText(
      process.env.ARCANA_CLOSURE_STATUS_OUT_JSON ||
        path.join('data', 'reports', 'closure-status-latest.json')
    ),
    outMd: normalizeText(
      process.env.ARCANA_CLOSURE_STATUS_OUT_MD ||
        path.join('data', 'reports', 'closure-status-latest.md')
    ),
    strict: parseBoolean(process.env.ARCANA_CLOSURE_STATUS_STRICT, false),
    json: parseBoolean(process.env.ARCANA_CLOSURE_STATUS_JSON, false),
    expectedRemaining: normalizeText(
      process.env.ARCANA_CLOSURE_STATUS_EXPECTED_REMAINING ||
        DEFAULT_EXPECTED_REMAINING.join(',')
    ),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = normalizeText(argv[index]);
    if (item === '--finalization-file') {
      args.finalizationFile = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--release-readiness-file') {
      args.releaseReadinessFile = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--stability-file') {
      args.stabilityFile = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--out-json') {
      args.outJson = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--out-md') {
      args.outMd = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--strict') {
      args.strict = true;
      continue;
    }
    if (item === '--json') {
      args.json = true;
      continue;
    }
    if (item === '--expected-remaining') {
      args.expectedRemaining = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
  }

  return args;
}

async function readOptionalJson(filePath) {
  const resolved = path.resolve(filePath);
  try {
    const raw = await fs.readFile(resolved, 'utf8');
    return {
      path: resolved,
      exists: true,
      data: JSON.parse(raw),
    };
  } catch {
    return {
      path: resolved,
      exists: false,
      data: null,
    };
  }
}

function buildMarkdownReport(payload) {
  const lines = [];
  lines.push('# Arcana Closure Status');
  lines.push('');
  lines.push(`Generated: ${payload.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- done: ${payload.closure.done ? 'yes' : 'no'}`);
  lines.push(`- releaseGateClear: ${payload.closure.releaseGateClear ? 'yes' : 'no'}`);
  lines.push(`- launched: ${payload.closure.launched ? 'yes' : 'no'}`);
  lines.push(`- stabilityStatus: ${payload.closure.stabilityStatus || '-'}`);
  lines.push(`- stabilityReadyForBroadGoLive: ${payload.closure.stabilityReadyForBroadGoLive ? 'yes' : 'no'}`);
  lines.push(`- pentestBlocked: ${payload.closure.pentestBlocked ? 'yes' : 'no'}`);
  lines.push(`- stabilityBlocked: ${payload.closure.stabilityBlocked ? 'yes' : 'no'}`);
  lines.push(`- formalSignoffPending: ${payload.closure.formalSignoffPending ? 'yes' : 'no'}`);
  lines.push(
    `- finalLiveSignoffLocked: ${payload.closure.finalLiveSignoff?.locked ? 'yes' : 'no'}`
  );
  lines.push(
    `- finalLiveSignoffLockedAt: ${payload.closure.finalLiveSignoff?.lockedAt || '-'}`
  );
  lines.push(
    `- progress: ${payload.closure.progress.completedExpectedCount}/${payload.closure.progress.totalCount} (${payload.closure.progress.percent}%)`
  );
  lines.push(`- stabilityRemainingDays: ${payload.closure.timeline.remainingDays}`);
  lines.push(`- stabilityEstimatedReadyAt: ${payload.closure.timeline.estimatedReadyAt || '-'}`);
  lines.push('');
  lines.push('## Remaining');
  if (payload.closure.remaining.length === 0) {
    lines.push('- none');
  } else {
    for (const item of payload.closure.remaining) {
      lines.push(`- ${item.id}: ${item.reason}`);
      lines.push(`  - command: \`${item.command}\``);
    }
  }
  lines.push('');
  lines.push('## Sources');
  lines.push(`- finalization: ${payload.sources.finalization.path} (exists=${payload.sources.finalization.exists ? 'yes' : 'no'})`);
  lines.push(`- releaseReadiness: ${payload.sources.releaseReadiness.path} (exists=${payload.sources.releaseReadiness.exists ? 'yes' : 'no'})`);
  lines.push(`- stability: ${payload.sources.stability.path} (exists=${payload.sources.stability.exists ? 'yes' : 'no'})`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const expectedRemaining = String(args.expectedRemaining || '')
    .split(',')
    .map((item) => normalizeText(item))
    .filter(Boolean);

  const [finalizationSource, releaseReadinessSource, stabilitySource] = await Promise.all([
    readOptionalJson(args.finalizationFile),
    readOptionalJson(args.releaseReadinessFile),
    readOptionalJson(args.stabilityFile),
  ]);

  const closure = buildClosureStatus({
    finalization: finalizationSource.data,
    releaseReadiness: releaseReadinessSource.data,
    stability: stabilitySource.data,
    expectedRemainingIds: expectedRemaining.length > 0 ? expectedRemaining : DEFAULT_EXPECTED_REMAINING,
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    sources: {
      finalization: { path: finalizationSource.path, exists: finalizationSource.exists },
      releaseReadiness: { path: releaseReadinessSource.path, exists: releaseReadinessSource.exists },
      stability: { path: stabilitySource.path, exists: stabilitySource.exists },
    },
    closure,
  };

  const outJsonPath = path.resolve(args.outJson);
  const outMdPath = path.resolve(args.outMd);
  await fs.mkdir(path.dirname(outJsonPath), { recursive: true });
  await fs.mkdir(path.dirname(outMdPath), { recursive: true });
  await fs.writeFile(outJsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.writeFile(outMdPath, buildMarkdownReport(payload), 'utf8');

  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write('== Closure Status ==\n');
    process.stdout.write(`json: ${outJsonPath}\n`);
    process.stdout.write(`md: ${outMdPath}\n`);
    process.stdout.write(`done: ${closure.done ? 'yes' : 'no'}\n`);
    process.stdout.write(
      `remaining: ${closure.remaining.map((item) => item.id).join(',') || '-'}\n`
    );
  }

  if (args.strict && closure.done !== true) {
    process.exitCode = 2;
  }
}

run().catch((error) => {
  console.error('❌ Could not build closure status');
  console.error(error?.message || error);
  process.exitCode = 1;
});
