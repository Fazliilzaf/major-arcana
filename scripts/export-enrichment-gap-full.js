#!/usr/bin/env node
'use strict';

/**
 * Full enrichment gap export (prod read-only).
 * No raw mail bodies · no patient identifiers in output.
 *
 *   node scripts/export-enrichment-gap-full.js
 *   node scripts/export-enrichment-gap-full.js --detail-limit 2105
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const TENANT = 'hair-tp-clinic';
const DEFAULT_EXPORT = 'data/imports/mail-enrichment-gap-export-2026-06-01.json';

function parseArgs(argv) {
  return {
    detailLimit: (() => {
      const index = argv.indexOf('--detail-limit');
      if (index >= 0) return Number(argv[index + 1]) || 2105;
      return 2105;
    })(),
    out: (() => {
      const index = argv.indexOf('--out');
      if (index >= 0) return argv[index + 1] || DEFAULT_EXPORT;
      return DEFAULT_EXPORT;
    })(),
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

async function fetchCoverage(token) {
  const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(
    /\/+$/,
    ''
  );
  const res = await fetch(
    `${base}/api/v1/ops/cco/enrichment/coverage?tenantId=${encodeURIComponent(TENANT)}`,
    { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${res.status} coverage`);
  return body;
}

async function fetchGapAnalysis(token, detailLimit) {
  const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(
    /\/+$/,
    ''
  );
  const query = new URLSearchParams({
    tenantId: TENANT,
    detailLimit: String(detailLimit),
    snapshotProbeLimit: '0',
  });
  const res = await fetch(`${base}/api/v1/ops/cco/enrichment/gap-analysis?${query}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${res.status} gap-analysis`);
  return body;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = await resolveOwnerToken();
  const coverage = await fetchCoverage(token);
  const detailLimit = Math.max(Number(coverage.gapCount || 0), args.detailLimit);
  const analysis = await fetchGapAnalysis(token, detailLimit);

  if (Number(analysis.detailCount || analysis.details?.length || 0) < Number(analysis.totalGap)) {
    console.warn(
      `WARN: detailCount ${analysis.detailCount || analysis.details?.length} < totalGap ${analysis.totalGap}`
    );
  }

  const savePath = path.isAbsolute(args.out) ? args.out : path.join(REPO, args.out);
  await fs.mkdir(path.dirname(savePath), { recursive: true });
  await fs.writeFile(savePath, `${JSON.stringify({ ok: true, ...analysis }, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        exportPath: savePath,
        totalGap: analysis.totalGap,
        detailCount: analysis.detailCount || analysis.details?.length,
        bucketCounts: analysis.bucketCounts,
        actionSummary: analysis.actionSummary,
        coverage: analysis.coverage,
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
