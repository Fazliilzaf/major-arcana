#!/usr/bin/env node
'use strict';

const { resolveProdAuthToken, normalizeBase } = require('./lib/resolve-prod-auth-token');

const BASE = normalizeBase(process.env.ARCANA_PROD_URL || process.env.ARCANA_BASE_URL);
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const pageSizeArg = args.indexOf('--page-size');
const offsetArg = args.indexOf('--offset');
const retriesArg = args.indexOf('--max-retries');
const pageSize = Math.max(
  1,
  Math.min(Number(pageSizeArg >= 0 ? args[pageSizeArg + 1] : 500) || 500, 2000)
);
const startOffset = Math.max(0, Number(offsetArg >= 0 ? args[offsetArg + 1] : 0) || 0);
const maxRetries = Math.max(1, Number(retriesArg >= 0 ? args[retriesArg + 1] : 8) || 8);

async function postPage(token, offset) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(
        `${BASE}/api/v1/cco-patient-master/assets/diagnose-ghost-visible/page`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'x-cco-tenant': 'hair-tp-clinic',
            'x-arcana-client': 'major_arcana_admin',
          },
          body: JSON.stringify({ offset, pageSize, sampleSize: 0 }),
          signal: AbortSignal.timeout(120000),
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      return body;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(attempt * 2000, 15000)));
      }
    }
  }
  throw lastError;
}

async function main() {
  const token = await resolveProdAuthToken({ baseUrl: BASE, preferOwner: true });
  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    zeroWrites: true,
    pageSize,
    startOffset,
    pages: 0,
    scannedAssets: 0,
    totalRenderCandidates: null,
    ghostRenderCandidates: 0,
    withBlobSibling: 0,
    withoutBlobSibling: 0,
    crossPatientSibling: 0,
    withDriveFileId: 0,
    missingDriveFileId: 0,
    withChecksum: 0,
    missingChecksum: 0,
    byCategory: {},
    bySourceSystem: {},
    byStatus: {},
    samples: [],
  };
  const mergeCounts = (target, source) => {
    for (const [key, value] of Object.entries(source || {})) {
      target[key] = (target[key] || 0) + (Number(value) || 0);
    }
  };
  let offset = startOffset;
  while (offset !== null) {
    const page = await postPage(token, offset);
    summary.pages += 1;
    summary.scannedAssets += Number(page.pagination?.scanned) || 0;
    summary.totalRenderCandidates = page.pagination?.totalRenderCandidates ?? null;
    summary.ghostRenderCandidates += Number(page.stats?.ghostRenderCandidates) || 0;
    summary.withBlobSibling += Number(page.stats?.withBlobSibling) || 0;
    summary.withoutBlobSibling += Number(page.stats?.withoutBlobSibling) || 0;
    summary.crossPatientSibling += Number(page.stats?.crossPatientSibling) || 0;
    summary.withDriveFileId += Number(page.stats?.withDriveFileId) || 0;
    summary.missingDriveFileId += Number(page.stats?.missingDriveFileId) || 0;
    summary.withChecksum += Number(page.stats?.withChecksum) || 0;
    summary.missingChecksum += Number(page.stats?.missingChecksum) || 0;
    mergeCounts(summary.byCategory, page.stats?.byCategory);
    mergeCounts(summary.bySourceSystem, page.stats?.bySourceSystem);
    mergeCounts(summary.byStatus, page.stats?.byStatus);
    if (summary.samples.length < 25) {
      summary.samples.push(...(page.cases || []).slice(0, 25 - summary.samples.length));
    }
    offset = page.pagination?.nextOffset ?? null;
    if (!jsonMode) {
      process.stderr.write(
        `page=${summary.pages} scanned=${summary.scannedAssets}/${summary.totalRenderCandidates} ghosts=${summary.ghostRenderCandidates}\n`
      );
    }
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
