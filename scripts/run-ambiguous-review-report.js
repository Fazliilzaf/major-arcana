#!/usr/bin/env node
'use strict';

/**
 * Ambiguous mail enrichment review — summary report (prod/local).
 *
 *   node scripts/run-ambiguous-review-report.js
 *   node scripts/run-ambiguous-review-report.js --local
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const TENANT = 'hair-tp-clinic';
const REPORT_PATH = 'data/imports/ambiguous-mail-enrichment-review-report.json';

function parseArgs(argv) {
  return { local: argv.includes('--local') };
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

function baseUrl(local) {
  if (local) return `http://127.0.0.1:${process.env.PORT || 3000}`;
  return (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');
}

async function api(method, pathname, { body = null, tok, local = false } = {}) {
  const res = await fetch(`${baseUrl(local)}${pathname}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${tok}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(payload.error || `${res.status} ${pathname}`);
    error.statusCode = res.status;
    throw error;
  }
  return payload;
}

function buildConsoleReport(summary) {
  const report = summary.report || {};
  const worklist = report.worklist || {};
  return {
    ambiguousTotal: summary.ambiguousTotal ?? report.ambiguousTotal ?? null,
    approved: summary.approved ?? report.approved ?? 0,
    unresolved:
      (summary.unresolved ?? 0) +
      (summary.ownerAcceptedUnresolved ?? report.ownerAcceptedUnresolved ?? 0),
    excluded: summary.excluded ?? report.excluded ?? 0,
    remainingAmbiguous: summary.remainingAmbiguous ?? summary.pending ?? report.remainingAmbiguous,
    adjustedCoveragePercent:
      summary.coverage?.adjustedCoveragePercent ?? report.adjustedCoveragePercent ?? null,
    enriched: summary.coverage?.enriched ?? report.enriched ?? null,
    effectiveGapCount: summary.coverage?.effectiveGapCount ?? report.effectiveGapCount ?? null,
    operationalReadiness: report.operationalReadiness ?? null,
    operationalReadinessReason: report.operationalReadinessReason ?? null,
    readyForWork: summary.coverage?.readyForWork ?? report.readyForWork ?? null,
    worklistRows: worklist.worklistRows ?? null,
    lanes: worklist.lanes ?? null,
    sla: worklist.sla ?? null,
    risk: worklist.risk ?? null,
    needsAction: worklist.needsAction ?? null,
    mailboxCounts: summary.mailboxCounts ?? report.mailboxCounts ?? {},
    rules: summary.rules ?? null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tok = await token();
  const summary = await api(
    'GET',
    `/api/v1/ops/cco/enrichment/gap-recovery/ambiguous-review/summary?tenantId=${TENANT}`,
    { tok, local: args.local }
  );

  const report = {
    generatedAt: new Date().toISOString(),
    tenantId: TENANT,
    source: args.local ? 'local' : 'prod',
    ...buildConsoleReport(summary),
    rawSummaryKeys: Object.keys(summary),
  };

  const savePath = path.join(REPO, REPORT_PATH);
  await fs.mkdir(path.dirname(savePath), { recursive: true });
  await fs.writeFile(savePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify(report, null, 2));
  console.error(`\nSaved: ${REPORT_PATH}`);
}

main().catch((error) => {
  if (error.statusCode === 404) {
    console.error('ambiguous-review API saknas på målmiljö — deploy krävs (Owner B routes + UI).');
  }
  console.error(error.message || error);
  process.exit(1);
});
