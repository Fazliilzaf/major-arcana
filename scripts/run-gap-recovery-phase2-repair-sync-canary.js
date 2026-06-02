#!/usr/bin/env node
'use strict';

/**
 * Repair sync canary — 25 repair + targeted enrich + verify repairable drops.
 *
 *   node scripts/run-gap-recovery-phase2-repair-sync-canary.js --snapshot --canary-limit 25 --wait
 *   node scripts/run-gap-recovery-phase2-repair-sync-canary.js --full-remaining --wait
 */

require('dotenv').config({ quiet: true });

const REPO = require('node:path').resolve(__dirname, '..');
const TENANT = 'hair-tp-clinic';

function parseArgs(argv) {
  return {
    snapshot: argv.includes('--snapshot'),
    wait: argv.includes('--wait'),
    fullRemaining: argv.includes('--full-remaining'),
    canaryLimit: (() => {
      const i = argv.indexOf('--canary-limit');
      if (argv.includes('--full-remaining')) return 125;
      return i >= 0 ? Math.min(250, Math.max(1, Number(argv[i + 1]) || 25)) : 25;
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
  const plan = await api(
    'GET',
    `/api/v1/ops/cco/enrichment/gap-recovery/phase2/repair-plan?tenantId=${TENANT}`,
    { tok }
  );
  let worklist = null;
  try {
    const wl = await api(
      'GET',
      `/api/v1/cco/runtime/worklist/consumer?tenantId=${TENANT}&limit=1`,
      {
        tok,
      }
    );
    worklist = wl.summary || null;
  } catch {
    /* optional */
  }
  return {
    coveragePercent: coverage.coveragePercent,
    enriched: coverage.enrichedConversationCount,
    gap: coverage.gapCount,
    readyForWork: coverage.readyForWork,
    repairable: plan.repairableCount,
    ambiguous: plan.ambiguousCount,
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

  const repair = await api('POST', '/api/v1/ops/cco/enrichment/gap-recovery/phase2/repair/canary', {
    tok,
    body: { tenantId: TENANT, go: true, dryRun: false, canaryLimit: args.canaryLimit },
  });
  report.steps.push({
    step: 'repair',
    canaryLimit: args.canaryLimit,
    messagesUpserted: repair.messagesUpserted,
    skippedAlreadyRepaired: repair.skippedAlreadyRepaired,
    repairRunId: repair.repairRunId,
    registrySave: repair.registrySave,
  });
  console.log(JSON.stringify(report.steps.at(-1), null, 2));

  const keys = (
    repair.repairedConversationKeys ||
    (repair.results || [])
      .filter((row) => row.outcome === 'upserted_truth_message')
      .map((row) => row.conversationKey)
  ).filter(Boolean);

  if (keys.length === 0 && Number(repair.skippedAlreadyRepaired || 0) === 0) {
    throw new Error('repair gav inga keys — stoppar');
  }

  if (keys.length > 0) {
    const enrich = await api(
      'POST',
      '/api/v1/ops/cco/enrichment/gap-recovery/phase2/targeted-enrich',
      {
        tok,
        body: { tenantId: TENANT, go: true, conversationKeys: keys },
      }
    );
    report.steps.push({
      step: 'targeted-enrich',
      targetedCount: enrich.targetedCount,
      ok: enrich.ok,
      coverage: enrich.coverage,
    });
    console.log(JSON.stringify(report.steps.at(-1), null, 2));
  }

  const after = await measure(tok);
  report.after = after;
  report.delta = {
    enriched: Number(after.enriched || 0) - Number(before.enriched || 0),
    repairable: Number(before.repairable || 0) - Number(after.repairable || 0),
    gap: Number(before.gap || 0) - Number(after.gap || 0),
    coveragePercent: Number(after.coveragePercent || 0) - Number(before.coveragePercent || 0),
  };

  console.log('=== AFTER ===');
  console.log(JSON.stringify({ after, delta: report.delta }, null, 2));

  if (Number(report.delta.repairable || 0) <= 0 && keys.length > 0) {
    throw new Error('stop: repairable minskade inte efter canary — sync-fix ej verifierad');
  }
  if (Number(report.delta.enriched || 0) < 0) {
    throw new Error('stop: coverage backade');
  }

  const out = require('node:path').join(REPO, 'data/imports/phase2-repair-sync-canary-report.json');
  await require('node:fs/promises').mkdir(require('node:path').dirname(out), { recursive: true });
  await require('node:fs/promises').writeFile(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log('Report:', out);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
