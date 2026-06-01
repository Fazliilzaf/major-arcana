#!/usr/bin/env node
'use strict';

/**
 * Controlled truth-only enrichment re-backfill (prod).
 *
 *   node scripts/run-truth-only-enrichment-rebackfill.js --snapshot --plan
 *   node scripts/run-truth-only-enrichment-rebackfill.js --canary --wait
 *   node scripts/run-truth-only-enrichment-rebackfill.js --full --wait --export-gap
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const TENANT = 'hair-tp-clinic';
const CANARY_LIMIT = 500;
const EXPORT_PATH = 'data/imports/mail-enrichment-gap-export-2026-06-01.json';

function parseArgs(argv) {
  return {
    snapshot: argv.includes('--snapshot'),
    plan: argv.includes('--plan'),
    canary: argv.includes('--canary'),
    full: argv.includes('--full'),
    wait: argv.includes('--wait'),
    exportGap: argv.includes('--export-gap'),
    waitMinutes: (() => {
      const i = argv.indexOf('--wait-minutes');
      return i >= 0 ? Number(argv[i + 1]) || 120 : 120;
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

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollJob(jobId, tok, waitMinutes) {
  const deadline = Date.now() + waitMinutes * 60 * 1000;
  while (Date.now() < deadline) {
    const job = await api('GET', `/api/v1/ops/cco/enrichment/backfill/status/${jobId}`, { tok });
    console.log(
      JSON.stringify({ status: job.status, phase: job.phase, coverage: job.coverage }, null, 2)
    );
    if (job.status === 'success' || job.status === 'error') return job;
    await sleep(30000);
  }
  throw new Error(`Job ${jobId} timeout efter ${waitMinutes} min`);
}

function coverageSummary(c = {}) {
  return {
    coveragePercent: c.coveragePercent,
    enrichedConversationCount: c.enrichedConversationCount,
    gapCount: c.gapCount,
    readyForWork: c.readyForWork,
    lastEnrichmentEntryId: c.lastEnrichmentEntryId,
  };
}

async function fetchThreadStats(tok) {
  try {
    return await api('GET', '/api/v1/cco-conversation-threads/stats', { tok });
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tok = await token();

  if (args.snapshot) {
    console.log('=== SNAPSHOT ===');
    const snap = await api('POST', '/api/v1/ops/cco/enrichment/backfill/run', {
      tok,
      body: { phase: 'snapshot', go: true, tenantId: TENANT },
    });
    console.log(JSON.stringify(snap, null, 2));
  }

  if (args.plan) {
    console.log('=== PLAN ===');
    const plan = await api(
      'GET',
      `/api/v1/ops/cco/enrichment/backfill/plan?tenantId=${TENANT}&canaryLimit=${CANARY_LIMIT}`,
      { tok }
    );
    console.log(JSON.stringify(plan, null, 2));
  }

  let lastJob = null;
  if (args.canary) {
    console.log('=== CANARY TRUTH-ONLY BACKFILL ===');
    const start = await api('POST', '/api/v1/ops/cco/enrichment/backfill/run', {
      tok,
      body: { phase: 'canary', go: true, tenantId: TENANT, canaryLimit: CANARY_LIMIT },
    });
    console.log(JSON.stringify(start, null, 2));
    lastJob = args.wait ? await pollJob(start.jobId, tok, args.waitMinutes) : start;
  }

  if (args.full) {
    console.log('=== FULL TRUTH-ONLY BACKFILL ===');
    const start = await api('POST', '/api/v1/ops/cco/enrichment/backfill/run', {
      tok,
      body: { phase: 'full', go: true, tenantId: TENANT },
    });
    console.log(JSON.stringify(start, null, 2));
    lastJob = args.wait ? await pollJob(start.jobId, tok, args.waitMinutes) : start;
  }

  const coverage = await api('GET', `/api/v1/ops/cco/enrichment/coverage?tenantId=${TENANT}`, {
    tok,
  });
  const threadStats = await fetchThreadStats(tok);
  console.log('=== COVERAGE ===');
  console.log(JSON.stringify(coverageSummary(coverage), null, 2));

  if (args.exportGap && Number(coverage.gapCount || 0) > 0) {
    console.log('=== GAP EXPORT ===');
    const analysis = await api(
      'GET',
      `/api/v1/ops/cco/enrichment/gap-analysis?tenantId=${TENANT}&detailLimit=2105&snapshotProbeLimit=0`,
      { tok }
    );
    const savePath = path.join(REPO, EXPORT_PATH);
    await fs.mkdir(path.dirname(savePath), { recursive: true });
    await fs.writeFile(savePath, `${JSON.stringify(analysis, null, 2)}\n`, 'utf8');
    console.log(
      JSON.stringify(
        { exportPath: savePath, totalGap: analysis.totalGap, buckets: analysis.bucketCounts },
        null,
        2
      )
    );
  }

  console.log('=== SUMMARY ===');
  console.log(
    JSON.stringify(
      {
        coverage: coverageSummary(coverage),
        threadStats: threadStats?.stats || null,
        lastJobStatus: lastJob?.status || null,
        lastJobResult: lastJob?.result || null,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
