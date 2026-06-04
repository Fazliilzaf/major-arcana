#!/usr/bin/env node
'use strict';

/**
 * Gap Recovery Phase 2 orchestration (prod).
 *
 *   node scripts/run-gap-recovery-phase2.js --denominator-dry-run
 *   node scripts/run-gap-recovery-phase2.js --denominator-apply
 *   node scripts/run-gap-recovery-phase2.js --repair-plan
 *   node scripts/run-gap-recovery-phase2.js --repair-canary-dry-run
 *   node scripts/run-gap-recovery-phase2.js --repair-canary --wait
 */

require('dotenv').config({ quiet: true });

const REPO = require('node:path').resolve(__dirname, '..');
const TENANT = 'hair-tp-clinic';

function parseArgs(argv) {
  return {
    denominatorDryRun: argv.includes('--denominator-dry-run'),
    denominatorApply: argv.includes('--denominator-apply'),
    repairPlan: argv.includes('--repair-plan'),
    repairCanaryDryRun: argv.includes('--repair-canary-dry-run'),
    repairCanary: argv.includes('--repair-canary'),
    targetedEnrich: argv.includes('--targeted-enrich'),
    wait: argv.includes('--wait'),
    canaryLimit: (() => {
      const i = argv.indexOf('--canary-limit');
      return i >= 0 ? Number(argv[i + 1]) || 100 : 100;
    })(),
    conversationKeys: (() => {
      const i = argv.indexOf('--conversation-keys-file');
      if (i < 0) return [];
      const fs = require('node:fs');
      const raw = fs.readFileSync(argv[i + 1], 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : parsed.conversationKeys || [];
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tok = await token();
  const report = { steps: [] };

  if (args.denominatorDryRun || args.denominatorApply) {
    const step = await api(
      'POST',
      '/api/v1/ops/cco/enrichment/gap-recovery/phase2/denominator-exclusions',
      {
        tok,
        body: {
          tenantId: TENANT,
          dryRun: !args.denominatorApply,
          go: args.denominatorApply,
        },
      }
    );
    report.steps.push({ step: 'denominator-exclusions', ...step });
    console.log(JSON.stringify(step, null, 2));
  }

  if (args.repairPlan) {
    const step = await api(
      'GET',
      `/api/v1/ops/cco/enrichment/gap-recovery/phase2/repair-plan?tenantId=${TENANT}`,
      { tok }
    );
    report.steps.push({ step: 'repair-plan', ...step });
    console.log(JSON.stringify(step, null, 2));
  }

  if (args.repairCanaryDryRun || args.repairCanary) {
    const step = await api('POST', '/api/v1/ops/cco/enrichment/gap-recovery/phase2/repair/canary', {
      tok,
      body: {
        tenantId: TENANT,
        dryRun: !args.repairCanary,
        go: args.repairCanary,
        canaryLimit: args.canaryLimit,
      },
    });
    report.steps.push({ step: 'repair-canary', ...step });
    console.log(JSON.stringify(step, null, 2));

    if (args.repairCanary && step.repairableInPlan > 0 && step.processedCount > 0) {
      const repairedKeys = (
        step.repairedConversationKeys ||
        (step.results || [])
          .filter(
            (row) =>
              row.outcome === 'upserted_truth_message' || row.outcome === 'alias_pending_persist'
          )
          .map((row) => row.conversationKey)
      ).filter(Boolean);
      if (repairedKeys.length > 0 && args.wait) {
        const enrich = await api(
          'POST',
          '/api/v1/ops/cco/enrichment/gap-recovery/phase2/targeted-enrich',
          {
            tok,
            body: { tenantId: TENANT, go: true, conversationKeys: repairedKeys },
          }
        );
        report.steps.push({ step: 'targeted-enrich', ...enrich });
        console.log(JSON.stringify(enrich, null, 2));
      }
    }
  }

  if (args.targetedEnrich && args.conversationKeys.length > 0) {
    const step = await api(
      'POST',
      '/api/v1/ops/cco/enrichment/gap-recovery/phase2/targeted-enrich',
      {
        tok,
        body: { tenantId: TENANT, go: true, conversationKeys: args.conversationKeys },
      }
    );
    report.steps.push({ step: 'targeted-enrich', ...step });
    console.log(JSON.stringify(step, null, 2));
  }

  const coverage = await api('GET', `/api/v1/ops/cco/enrichment/coverage?tenantId=${TENANT}`, {
    tok,
  });
  const worklist = await fetchWorklistSummary(tok);
  report.final = {
    coverage,
    worklist,
  };
  console.log('=== FINAL ===');
  console.log(JSON.stringify(report.final, null, 2));
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
