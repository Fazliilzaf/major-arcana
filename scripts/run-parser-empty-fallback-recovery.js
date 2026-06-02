#!/usr/bin/env node
'use strict';

/**
 * Parser-empty fallback recovery (owner decision C).
 *
 *   node scripts/run-parser-empty-fallback-recovery.js --dry-run
 *   node scripts/run-parser-empty-fallback-recovery.js --snapshot --canary --wait
 *   node scripts/run-parser-empty-fallback-recovery.js --full-remaining --wait
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const TENANT = 'hair-tp-clinic';
const REPORT_PATH = 'data/imports/parser-empty-fallback-recovery-report.json';

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    snapshot: argv.includes('--snapshot'),
    canary: argv.includes('--canary'),
    fullRemaining: argv.includes('--full-remaining'),
    wait: argv.includes('--wait'),
    canaryLimit: (() => {
      const index = argv.indexOf('--canary-limit');
      if (argv.includes('--full-remaining')) return 125;
      return index >= 0 ? Math.min(500, Math.max(1, Number(argv[index + 1]) || 25)) : 25;
    })(),
  };
}

async function token() {
  const { execSync } = require('node:child_process');
  const base = process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com';
  const out = execSync('node scripts/get-prod-auth-token.js --owner', {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, ARCANA_PROD_URL: base },
  });
  const t = out.trim().split('\n').pop();
  if (!t) throw new Error('owner token saknas');
  return t;
}

function baseUrl() {
  return (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');
}

async function api(method, pathname, { body = null, tok } = {}) {
  const res = await fetch(`${baseUrl()}${pathname}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${tok}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || `${res.status} ${pathname}`);
  return payload;
}

async function measure(tok) {
  const coverage = await api('GET', `/api/v1/ops/cco/enrichment/coverage?tenantId=${TENANT}`, {
    tok,
  });
  let worklist = null;
  try {
    const wl = await api(
      'GET',
      `/api/v1/cco/runtime/worklist/consumer?tenantId=${TENANT}&limit=1`,
      { tok }
    );
    worklist = wl.summary || null;
  } catch {
    /* optional */
  }
  const de = coverage.denominatorExclusions || {};
  return {
    adjustedCoveragePercent: coverage.adjustedCoveragePercent ?? coverage.coveragePercent,
    enriched: coverage.enrichedConversationCount,
    effectiveGapCount: de.effectiveGapCount ?? coverage.gapCount,
    readyForWork: coverage.readyForWork,
    worklist,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tok = await token();
  const report = { steps: [] };

  if (args.snapshot) {
    const snap = await api('POST', '/api/v1/ops/cco/enrichment/backfill/run', {
      tok,
      body: { phase: 'snapshot', go: true, tenantId: TENANT },
    });
    report.steps.push({ step: 'snapshot', dir: snap.dir });
    console.log(JSON.stringify(report.steps.at(-1), null, 2));
  }

  const before = await measure(tok);
  report.before = before;
  console.log('=== BEFORE ===');
  console.log(JSON.stringify(before, null, 2));

  const plan = await api(
    'GET',
    `/api/v1/ops/cco/enrichment/gap-recovery/parser-empty/plan?tenantId=${TENANT}`,
    { tok }
  );
  report.steps.push({
    step: 'dry-run-plan',
    parserEmptyTotal: plan.parserEmptyTotal,
    policyCounts: plan.policyCounts,
    applyActionCounts: plan.applyActionCounts,
    canarySafeCount: plan.canarySafeCount,
    unresolvedReviewCount: plan.unresolvedReviewCount,
  });
  console.log(JSON.stringify(report.steps.at(-1), null, 2));

  if (args.dryRun) {
    report.after = before;
    const out = path.join(REPO, REPORT_PATH);
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log('Report:', out);
    return;
  }

  if (!args.canary && !args.fullRemaining) {
    throw new Error('Ange --canary, --full-remaining eller --dry-run');
  }

  const applyDry = await api('POST', '/api/v1/ops/cco/enrichment/gap-recovery/parser-empty/apply', {
    tok,
    body: {
      tenantId: TENANT,
      dryRun: true,
      canaryOnly: true,
      canaryLimit: args.canaryLimit,
    },
  });
  report.steps.push({
    step: 'apply-dry-run',
    canaryLimit: args.canaryLimit,
    fallbackEnrichedCount: applyDry.fallbackEnrichedCount,
    excludedCount: applyDry.excludedCount,
    unresolvedCount: applyDry.unresolvedCount,
  });
  console.log(JSON.stringify(report.steps.at(-1), null, 2));

  if (Number(applyDry.fallbackEnrichedCount || 0) <= 0) {
    throw new Error('stop: dry-run apply gav inga fallback-enrich kandidater');
  }

  const apply = await api('POST', '/api/v1/ops/cco/enrichment/gap-recovery/parser-empty/apply', {
    tok,
    body: {
      tenantId: TENANT,
      go: true,
      canaryOnly: true,
      canaryLimit: args.canaryLimit,
    },
  });
  report.steps.push({
    step: 'apply',
    canaryLimit: args.canaryLimit,
    runId: apply.runId,
    fallbackEnrichedCount: apply.fallbackEnrichedCount,
    excludedCount: apply.excludedCount,
    unresolvedCount: apply.unresolvedCount,
    coverageBefore: apply.coverageBefore,
    coverageAfter: apply.coverageAfter,
  });
  console.log(JSON.stringify(report.steps.at(-1), null, 2));

  const after = await measure(tok);
  report.after = after;
  report.delta = {
    enriched: Number(after.enriched || 0) - Number(before.enriched || 0),
    effectiveGap: Number(before.effectiveGapCount || 0) - Number(after.effectiveGapCount || 0),
    adjustedCoveragePercent:
      Number(after.adjustedCoveragePercent || 0) - Number(before.adjustedCoveragePercent || 0),
  };
  console.log('=== AFTER ===');
  console.log(JSON.stringify({ after, delta: report.delta }, null, 2));

  if (Number(report.delta.adjustedCoveragePercent || 0) < 0) {
    throw new Error('stop: coverage backade');
  }

  const out = path.join(REPO, REPORT_PATH);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log('Report:', out);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
