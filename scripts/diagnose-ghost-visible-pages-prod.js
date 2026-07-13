#!/usr/bin/env node
'use strict';

const { resolveProdAuthToken, normalizeBase } = require('./lib/resolve-prod-auth-token');

const BASE = normalizeBase(process.env.ARCANA_PROD_URL || process.env.ARCANA_BASE_URL);
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const pageSizeArg = args.indexOf('--page-size');
const pageSize = Math.max(
  1,
  Math.min(Number(pageSizeArg >= 0 ? args[pageSizeArg + 1] : 500) || 500, 2000)
);

async function postPage(token, offset) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
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
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
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
    pages: 0,
    scannedAssets: 0,
    totalRenderCandidates: null,
    ghostRenderCandidates: 0,
    withBlobSibling: 0,
    withoutBlobSibling: 0,
    crossPatientSibling: 0,
    samples: [],
  };
  let offset = 0;
  while (offset !== null) {
    const page = await postPage(token, offset);
    summary.pages += 1;
    summary.scannedAssets += Number(page.pagination?.scanned) || 0;
    summary.totalRenderCandidates = page.pagination?.totalRenderCandidates ?? null;
    summary.ghostRenderCandidates += Number(page.stats?.ghostRenderCandidates) || 0;
    summary.withBlobSibling += Number(page.stats?.withBlobSibling) || 0;
    summary.withoutBlobSibling += Number(page.stats?.withoutBlobSibling) || 0;
    summary.crossPatientSibling += Number(page.stats?.crossPatientSibling) || 0;
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
