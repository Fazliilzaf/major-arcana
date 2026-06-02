#!/usr/bin/env node
'use strict';

/**
 * Phase 2 continuation — riktad repair/enrichment (ingen blind loop).
 *
 *   node scripts/run-gap-recovery-phase2-continuation.js --snapshot --verify-baseline
 *   node scripts/run-gap-recovery-phase2-continuation.js --batch-loop --batch-size 150 --max-batches 8
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const TENANT = 'hair-tp-clinic';
const ZERO_DELTA_STOP_AFTER = 2;

function parseArgs(argv) {
  return {
    snapshot: argv.includes('--snapshot'),
    reloadTruthOnly: argv.includes('--reload-truth-only'),
    verifyBaseline: argv.includes('--verify-baseline'),
    batchLoop: argv.includes('--batch-loop'),
    wait: argv.includes('--wait'),
    batchSize: (() => {
      const i = argv.indexOf('--batch-size');
      return i >= 0 ? Math.min(250, Math.max(1, Number(argv[i + 1]) || 100)) : 100;
    })(),
    maxBatches: (() => {
      const i = argv.indexOf('--max-batches');
      return i >= 0 ? Math.max(1, Number(argv[i + 1]) || 12) : 12;
    })(),
    waitMinutes: (() => {
      const i = argv.indexOf('--wait-minutes');
      return i >= 0 ? Number(argv[i + 1]) || 180 : 180;
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

async function pollBackfillJob(jobId, tok, waitMinutes) {
  const deadline = Date.now() + waitMinutes * 60 * 1000;
  while (Date.now() < deadline) {
    const job = await api('GET', `/api/v1/ops/cco/enrichment/backfill/status/${jobId}`, { tok });
    console.log(JSON.stringify({ status: job.status, coverage: job.coverage }, null, 2));
    if (job.status === 'success' || job.status === 'error') return job;
    await sleep(30000);
  }
  throw new Error(`Backfill job ${jobId} timeout efter ${waitMinutes} min`);
}

function coverageDigest(c = {}) {
  const de = c.denominatorExclusions || {};
  return {
    coveragePercent: c.coveragePercent,
    enrichedConversationCount: c.enrichedConversationCount,
    gapCount: c.gapCount,
    truthConversationCount: c.truthConversationCount,
    readyForWork: c.readyForWork,
    denominatorExcluded: de.excludedConversationCount || 0,
    effectiveGapCount: de.effectiveGapCount ?? c.gapCount,
    effectiveDenominator: de.effectiveDenominator ?? c.truthConversationCount,
    lastEnrichmentEntryId: c.lastEnrichmentEntryId,
  };
}

async function fetchWorklistSummary(tok) {
  try {
    const data = await api(
      'GET',
      `/api/v1/cco/runtime/worklist/consumer?tenantId=${TENANT}&limit=1`,
      { tok }
    );
    return data.summary || null;
  } catch {
    return null;
  }
}

async function verifyBaseline(tok, prior = null) {
  const coverage = await api('GET', `/api/v1/ops/cco/enrichment/coverage?tenantId=${TENANT}`, {
    tok,
  });
  const diagnose = await api('GET', '/api/v1/ops/cco/enrichment/baseline/diagnose', { tok });
  const repairPlan = await api(
    'GET',
    `/api/v1/ops/cco/enrichment/gap-recovery/phase2/repair-plan?tenantId=${TENANT}`,
    { tok }
  );
  const worklist = await fetchWorklistSummary(tok);

  const report = {
    coverage: coverageDigest(coverage),
    diagnose: {
      memoryCoverage: diagnose.memory?.coveragePercent,
      memoryEnriched: diagnose.memory?.enrichedConversationCount,
      diskEntryCount: diagnose.liveDisk?.entryCount,
      bestEntryId: diagnose.liveDisk?.bestEntryId,
    },
    repairPlan: {
      missingGraphMessageIdAnalyzed: repairPlan.missingGraphMessageIdAnalyzed,
      repairableCount: repairPlan.repairableCount,
      ambiguousCount: repairPlan.ambiguousCount,
      statusCounts: repairPlan.statusCounts,
    },
    worklist: summarizeWorklist(worklist),
  };

  if (prior?.enrichedConversationCount != null) {
    report.deltaEnriched =
      Number(coverage.enrichedConversationCount || 0) -
      Number(prior.enrichedConversationCount || 0);
    if (report.deltaEnriched < 0) report.coverageRegression = true;
  }

  console.log('=== BASELINE VERIFY ===');
  console.log(JSON.stringify(report, null, 2));
  return { report, coverage, repairPlan, worklist };
}

function summarizeWorklist(summary = null) {
  if (!summary) return null;
  return {
    rowCount: summary.rowCount,
    actNowCount: summary.actNowCount,
    needsReplyCount: summary.needsReplyCount,
    needsActionCount: summary.needsActionCount,
    unreadCount: summary.unreadCount,
    laneCounts: summary.laneCounts || null,
    riskCounts: summary.riskCounts || summary.riskLevelCounts || null,
    slaCounts: summary.slaCounts || summary.slaBucketCounts || null,
  };
}

function assertNoStopConditions(before, after, label) {
  if (
    Number(after.enrichedConversationCount || 0) < Number(before.enrichedConversationCount || 0)
  ) {
    throw new Error(
      `${label}: coverage backade (${before.enrichedConversationCount} → ${after.enrichedConversationCount})`
    );
  }
}

function assertEnrichOk(enrich, label) {
  if (enrich?.ok !== true) {
    throw new Error(`${label}: targeted enrich misslyckades (${enrich?.error || 'ok=false'})`);
  }
  const result = enrich?.result?.result || enrich?.result || {};
  const stopReason = normalizeText(result.stopReason);
  if (stopReason.includes('customer') && stopReason.includes('mismatch')) {
    throw new Error(`${label}: customerId mismatch`);
  }
  if (stopReason.includes('duplicate')) {
    throw new Error(`${label}: duplicate explosion (${stopReason})`);
  }
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function targetedEnrich(tok, conversationKeys) {
  return api('POST', '/api/v1/ops/cco/enrichment/gap-recovery/phase2/targeted-enrich', {
    tok,
    body: { tenantId: TENANT, go: true, conversationKeys },
  });
}

async function repairBatch(tok, canaryLimit) {
  return api('POST', '/api/v1/ops/cco/enrichment/gap-recovery/phase2/repair/canary', {
    tok,
    body: { tenantId: TENANT, dryRun: false, go: true, canaryLimit },
  });
}

async function reloadCapabilityIfNeeded(tok, baselineReport) {
  const memCov = Number(baselineReport?.diagnose?.memoryCoverage || 0);
  const memEnriched = Number(baselineReport?.diagnose?.memoryEnriched || 0);
  if (memCov >= 70 && memEnriched >= 6800) {
    return { skipped: true, reason: 'capability_ok' };
  }
  console.log('=== RELOAD TRUTH-ONLY (capability låg) ===');
  const start = await api('POST', '/api/v1/ops/cco/enrichment/backfill/run', {
    tok,
    body: { phase: 'full', go: true, tenantId: TENANT },
  });
  const job = await pollBackfillJob(start.jobId, tok, 180);
  return { skipped: false, job };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tok = await token();
  const report = {
    startedAt: new Date().toISOString(),
    zeroDeltaStopAfter: ZERO_DELTA_STOP_AFTER,
    steps: [],
    totals: { repairWrites: 0, enrichKeys: 0, enrichedDelta: 0 },
  };

  if (args.snapshot) {
    const snap = await api('POST', '/api/v1/ops/cco/enrichment/backfill/run', {
      tok,
      body: { phase: 'snapshot', go: true, tenantId: TENANT },
    });
    report.steps.push({ step: 'snapshot', dir: snap.dir, copied: snap.copied });
    console.log(JSON.stringify(report.steps.at(-1), null, 2));
  }

  let baseline = null;
  if (args.verifyBaseline || args.batchLoop) {
    baseline = await verifyBaseline(tok);
    report.baseline = baseline.report;
    const reload = await reloadCapabilityIfNeeded(tok, baseline.report);
    if (!reload.skipped) {
      report.steps.push({ step: 'truth-only-reload', ...reload });
      baseline = await verifyBaseline(tok);
      report.baselineAfterReload = baseline.report;
    }
  }

  let startEnriched = null;

  if (args.batchLoop) {
    let prior = baseline?.coverage || (await verifyBaseline(tok)).coverage;
    startEnriched = Number(prior.enrichedConversationCount || 0);
    let consecutiveZeroDelta = 0;

    for (let batch = 1; batch <= args.maxBatches; batch += 1) {
      const planBefore = await api(
        'GET',
        `/api/v1/ops/cco/enrichment/gap-recovery/phase2/repair-plan?tenantId=${TENANT}`,
        { tok }
      );
      const repairableCount = Number(planBefore.repairableCount || 0);
      if (repairableCount === 0) {
        report.steps.push({ step: 'batch-loop-stop', reason: 'no_repairable_left', batch });
        break;
      }

      const batchLimit = Math.min(args.batchSize, repairableCount);
      const repair = await repairBatch(tok, batchLimit);
      const repairedKeys = (
        repair.repairedConversationKeys ||
        (repair.results || [])
          .filter((row) => row.outcome === 'upserted_truth_message')
          .map((row) => row.conversationKey)
      ).filter(Boolean);

      const ambiguousWrites = (repair.results || []).filter(
        (row) =>
          row.repairStatus === 'ambiguous_multiple_matches' &&
          row.outcome === 'upserted_truth_message'
      );
      if (ambiguousWrites.length > 0) {
        throw new Error(`batch-${batch}: ambiguous auto-write blocker (${ambiguousWrites.length})`);
      }

      if (repairedKeys.length === 0) {
        report.steps.push({ step: 'batch-loop-stop', reason: 'repair_zero_writes', batch, repair });
        break;
      }

      report.totals.repairWrites += Number(repair.messagesUpserted || repairedKeys.length);

      const enrich = await targetedEnrich(tok, repairedKeys);
      assertEnrichOk(enrich, `batch-${batch}`);
      report.totals.enrichKeys += repairedKeys.length;

      const after = await verifyBaseline(tok, prior);
      assertNoStopConditions(prior, after.coverage, `batch-${batch}`);

      const deltaEnriched = Number(after.report.deltaEnriched || 0);
      report.totals.enrichedDelta =
        Number(after.coverage.enrichedConversationCount || 0) - startEnriched;

      report.steps.push({
        step: `batch-${batch}`,
        batchLimit,
        repaired: repairedKeys.length,
        messagesUpserted: repair.messagesUpserted,
        skipped: repair.skipped,
        enrichOk: enrich.ok,
        deltaEnriched,
        repairableRemaining: after.repairPlan.repairableCount,
        ambiguousRemaining: after.repairPlan.ambiguousCount,
        coverage: after.report.coverage,
      });
      console.log(JSON.stringify(report.steps.at(-1), null, 2));

      if (deltaEnriched === 0) {
        consecutiveZeroDelta += 1;
        if (consecutiveZeroDelta >= ZERO_DELTA_STOP_AFTER) {
          report.steps.push({
            step: 'batch-loop-stop',
            reason: 'zero_delta_consecutive',
            consecutiveZeroDelta,
            batch,
          });
          break;
        }
      } else {
        consecutiveZeroDelta = 0;
      }

      prior = after.coverage;
      if (Number(after.repairPlan.repairableCount || 0) === 0) break;
      if (args.wait) await sleep(3000);
    }
  }

  const final = await verifyBaseline(tok);
  report.final = final.report;
  report.totals.enrichedDelta =
    Number(final.coverage.enrichedConversationCount || 0) -
    Number(report.baseline?.coverage?.enrichedConversationCount ?? startEnriched ?? 0);
  report.completedAt = new Date().toISOString();

  console.log('=== FINAL REPORT ===');
  console.log(
    JSON.stringify(
      {
        totals: report.totals,
        final: report.final,
        stopStep: report.steps.filter((s) => s.step === 'batch-loop-stop').pop() || null,
      },
      null,
      2
    )
  );

  const outPath = path.join(REPO, 'data/imports/phase2-continuation-report.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log('Report saved:', outPath);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
