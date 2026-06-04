#!/usr/bin/env node
'use strict';

/**
 * Mail enrichment gap recovery — diagnose-first, no blind restore.
 *
 *   node scripts/run-enrichment-gap-recovery.js --diagnose-only
 *   node scripts/run-enrichment-gap-recovery.js --restore --export
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const TARGET = { enriched: 8563, gap: 775, coverage: 91.7 };

function parseArgs(argv) {
  return {
    diagnoseOnly: argv.includes('--diagnose-only'),
    restore: argv.includes('--restore'),
    exportGap: argv.includes('--export'),
    entryId: (() => {
      const index = argv.indexOf('--entry-id');
      return index >= 0 ? String(argv[index + 1] || '05dd08b4').trim() : '05dd08b4';
    })(),
    exportPath:
      (() => {
        const index = argv.indexOf('--export-path');
        if (index >= 0) return argv[index + 1];
        return 'data/imports/mail-enrichment-gap-export-2026-06-01.json';
      })() || 'data/imports/mail-enrichment-gap-export-2026-06-01.json',
  };
}

async function resolveOwnerToken() {
  const { execSync } = require('node:child_process');
  const base = process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com';
  const out = execSync('node scripts/get-prod-auth-token.js --owner', {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, ARCANA_PROD_URL: base },
  });
  const token = out.trim().split('\n').pop();
  if (!token) throw new Error('owner token saknas');
  return token;
}

function baseUrl() {
  return (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');
}

async function fetchJson(url, { token, method = 'GET', body = null } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || `${res.status} ${url}`);
  return payload;
}

function coverageOk(coverage = {}) {
  const enriched = Number(coverage.enrichedConversationCount || 0);
  const gap = Number(coverage.gapCount || 0);
  const pct = Number(coverage.coveragePercent || 0);
  return (
    enriched >= TARGET.enriched - 150 &&
    enriched <= TARGET.enriched + 150 &&
    gap >= TARGET.gap - 100 &&
    gap <= TARGET.gap + 100 &&
    pct >= TARGET.coverage - 2
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = await resolveOwnerToken();
  const tenantId = 'hair-tp-clinic';

  console.log('=== STEP 1: READ-ONLY DIAGNOSE ===');
  const diagnosis = await fetchJson(
    `${baseUrl()}/api/v1/ops/cco/enrichment/baseline/diagnose?tenantId=${tenantId}&entryId=${encodeURIComponent(args.entryId)}`,
    { token }
  );
  console.log(
    JSON.stringify(
      {
        memory: diagnosis.memory,
        liveDisk: {
          entryCount: diagnosis.liveDisk?.entryCount,
          bestEnrichedCount: diagnosis.liveDisk?.bestEnrichedCount,
          targetEntry: diagnosis.liveDisk?.targetEntry,
          matchesPass6: diagnosis.liveDisk?.matchesPass6,
          isPreBackfillLike: diagnosis.liveDisk?.isPreBackfillLike,
        },
        liveCheckpoint: diagnosis.liveCheckpoint,
        backupCount: diagnosis.backups?.length || 0,
        unsafePreBackfillSources: diagnosis.unsafePreBackfillSources,
        recommendation: diagnosis.recommendation,
      },
      null,
      2
    )
  );

  if (args.diagnoseOnly) return;

  if (diagnosis.recommendation?.action === 'stop') {
    throw new Error(`Diagnostik stop: ${diagnosis.recommendation.reason}`);
  }

  if (!args.restore) {
    console.error('Kör med --restore för att applicera rekommenderad recovery.');
    return;
  }

  const rec = diagnosis.recommendation;
  console.log('=== STEP 2: TARGETED RESTORE ===');
  const restoreBody = {
    phase: rec.phase || 'reload-capability',
    go: true,
    tenantId,
    entryId: args.entryId,
  };
  if (rec.label) restoreBody.label = rec.label;
  const restore = await fetchJson(`${baseUrl()}/api/v1/ops/cco/enrichment/backfill/run`, {
    token,
    method: 'POST',
    body: restoreBody,
  });
  console.log(JSON.stringify(restore, null, 2));

  console.log('=== STEP 3: VERIFY COVERAGE ===');
  const coveragePayload = await fetchJson(
    `${baseUrl()}/api/v1/ops/cco/enrichment/coverage?tenantId=${tenantId}`,
    { token }
  );
  const coverage = coveragePayload.coverage || coveragePayload;
  console.log(
    JSON.stringify(
      {
        enrichedConversationCount: coverage.enrichedConversationCount,
        gapCount: coverage.gapCount,
        coveragePercent: coverage.coveragePercent,
        lastEnrichmentEntryId: coverage.lastEnrichmentEntryId,
      },
      null,
      2
    )
  );

  if (!coverageOk(coverage)) {
    throw new Error(
      `Coverage utanför mål efter restore: enriched=${coverage.enrichedConversationCount} gap=${coverage.gapCount} pct=${coverage.coveragePercent}`
    );
  }

  if (!args.exportGap) return;

  console.log('=== STEP 4: GAP EXPORT ===');
  const analysis = await fetchJson(
    `${baseUrl()}/api/v1/ops/cco/enrichment/gap-analysis?tenantId=${tenantId}&detailLimit=775`,
    { token }
  );
  if (!coverageOk(analysis.coverage || {})) {
    throw new Error('Gap-export baseline ogiltig — stoppar.');
  }
  const savePath = path.isAbsolute(args.exportPath)
    ? args.exportPath
    : path.join(REPO, args.exportPath);
  await fs.mkdir(path.dirname(savePath), { recursive: true });
  await fs.writeFile(savePath, `${JSON.stringify(analysis, null, 2)}\n`, 'utf8');
  console.log(
    JSON.stringify(
      {
        exportPath: savePath,
        totalGap: analysis.totalGap,
        enriched: analysis.coverage?.enrichedConversationCount,
        gap: analysis.coverage?.gapCount,
        coveragePercent: analysis.coverage?.coveragePercent,
        buckets: Object.fromEntries(
          Object.entries(analysis.bucketCounts || {})
            .filter(([, count]) => count)
            .sort((a, b) => b[1] - a[1])
        ),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
