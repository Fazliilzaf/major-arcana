#!/usr/bin/env node
'use strict';

/**
 * Drive Import Review R3.3 — operator/admin batch pilot (PROD ONLY).
 *
 * NOT for CI. Manual canary after owner review. Uses preview → confirm API;
 * does not change batch logic or UI.
 *
 * Safety:
 *   - Default = dry-run (plan only, no preview/confirm writes)
 *   - --preview = POST batches/preview (stores preview token on server)
 *   - --confirm = POST batches/confirm (requires --preview-token OR --preview in same run)
 *   - Requires explicit ARCANA_PROD_URL (or BASE) + bearer token
 *   - Max 3 assets (default size=3, hard cap 3)
 *
 * Usage:
 *   ARCANA_PROD_URL=https://arcana.hairtpclinic.com ARCANA_SMOKE_BEARER_TOKEN=… \\
 *     npm run pilot:drive-import-review-batch-prod
 *
 *   … -- --preview
 *   … -- --preview --confirm
 *   … -- --confirm --preview-token=<uuid-from-preview>
 *
 * See docs/ops/drive-import-review-batch-pilot.md
 */

require('dotenv').config({ quiet: true });

const { execSync } = require('node:child_process');
const path = require('node:path');

const BATCH_MAX = 3;
const VALID_DECISIONS = new Set(['approve', 'mark_duplicate']);

const argv = process.argv.slice(2);
const wantsPreview = argv.includes('--preview');
const wantsConfirm = argv.includes('--confirm');
const dryRunOnly = !wantsPreview && !wantsConfirm;

function argValue(flag) {
  const idx = argv.indexOf(flag);
  if (idx >= 0 && argv[idx + 1]) return String(argv[idx + 1]).trim();
  const prefixed = argv.find((a) => a.startsWith(`${flag}=`));
  if (prefixed) return prefixed.slice(flag.length + 1).trim();
  return '';
}

const DECISION = (() => {
  const v = argValue('--decision') || process.env.DRIVE_IMPORT_REVIEW_BATCH_DECISION || 'approve';
  if (!VALID_DECISIONS.has(v)) {
    throw new Error(`Ogiltig --decision "${v}" (approve | mark_duplicate).`);
  }
  return v;
})();

const TARGET_SIZE = Math.min(
  BATCH_MAX,
  Math.max(2, Number(argValue('--size') || process.env.DRIVE_IMPORT_REVIEW_BATCH_SIZE || 3) || 3)
);
const PREVIEW_TOKEN = argValue('--preview-token');
const REVIEWER = (() => {
  const v = argValue('--reviewer') || process.env.DRIVE_IMPORT_REVIEW_BATCH_REVIEWER || '';
  if (v.length < 2) {
    throw new Error(
      'reviewer krävs: --reviewer eller DRIVE_IMPORT_REVIEW_BATCH_REVIEWER (min 2 tecken).'
    );
  }
  return v;
})();
const EXPECTED_STATUS = DECISION === 'mark_duplicate' ? 'DUPLICATE' : 'VISIBLE_ON_PATIENT_CARD';

function log(msg) {
  console.log(msg);
}

function fail(msg) {
  const e = new Error(msg);
  e.statusCode = 1;
  throw e;
}

function resolveProdBaseUrl() {
  const raw = String(process.env.ARCANA_PROD_URL || process.env.BASE || '').trim();
  if (!raw) {
    fail('Saknar ARCANA_PROD_URL (eller BASE). Pilot körs bara mot prod — ingen default-URL.');
  }
  const base = raw.replace(/\/+$/, '');
  if (/localhost|127\.0\.0\.1|:3100\b|:3000\b|\.local\b/i.test(base)) {
    fail(`Prod base URL krävs — vägrade: ${base}`);
  }
  return base;
}

function resolveBearerToken(baseUrl) {
  const fromEnv = String(process.env.ARCANA_SMOKE_BEARER_TOKEN || '').trim();
  if (fromEnv.length >= 20) return fromEnv;
  try {
    const token = execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}" --owner`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ARCANA_PROD_URL: baseUrl },
    }).trim();
    if (token.length >= 20) return token;
  } catch (err) {
    const detail = err.stderr?.toString?.()?.trim() || err.message;
    fail(
      `Saknar giltig token. Sätt ARCANA_SMOKE_BEARER_TOKEN eller owner .env för get-prod-auth-token. (${detail})`
    );
  }
  fail('Saknar giltig bearer-token (ARCANA_SMOKE_BEARER_TOKEN eller owner-login).');
}

function homogeneityKey(item) {
  return [
    item.suggestedPatientId || '',
    item.confidence || 'unknown',
    item.matchGround || item.matchBasis || '',
  ].join('|');
}

async function api(baseUrl, token, route, opts = {}) {
  const res = await fetch(`${baseUrl}${route}`, {
    ...opts,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-arcana-client': 'major_arcana_admin',
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 400) };
  }
  return { status: res.status, body };
}

function pickHomogeneousBatch(items, size) {
  const groups = new Map();
  for (const item of items) {
    const key = homogeneityKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const eligible = [...groups.entries()]
    .filter(([, rows]) => rows.length >= size)
    .sort((a, b) => b[1].length - a[1].length);
  if (!eligible.length) {
    const best = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    fail(`ingen homogen grupp med ${size}+ filer (största grupp: ${best?.[1]?.length || 0})`);
  }
  const [key, rows] = eligible[0];
  const picked = rows.slice(0, size);
  const [suggestedPatientId, confidence, matchBasis] = key.split('|');
  return {
    assetIds: picked.map((r) => r.assetId),
    homogeneity: { suggestedPatientId: suggestedPatientId || null, confidence, matchBasis },
    rows: picked,
  };
}

function snapshotFields(asset) {
  if (!asset) return null;
  return {
    status: asset.status,
    patientId: asset.patientId || null,
    storageKey: asset.storageKey || null,
    checksum: asset.checksum || null,
    originalDriveFileId: asset.originalDriveFileId || null,
    originalDrivePath: asset.originalDrivePath || null,
    originalFileName: asset.originalFileName || null,
  };
}

async function fetchAsset(baseUrl, token, assetId, patientId) {
  if (!patientId) return { status: 404, body: {} };
  const res = await api(
    baseUrl,
    token,
    `/api/v1/cco/patients/${encodeURIComponent(patientId)}/assets`
  );
  if (res.status !== 200) return res;
  const asset = (res.body?.assets || res.body?.items || []).find((a) => a.id === assetId);
  return { status: asset ? 200 : 404, body: { asset } };
}

async function loadMetrics(baseUrl, token) {
  const summary = await api(baseUrl, token, '/api/v1/ops/cco/drive-import-review/summary');
  if (summary.status !== 200) fail(`summary HTTP ${summary.status}`);
  if (!summary.body.writeEnabled) fail('write AV på prod (ENABLE_DRIVE_IMPORT_REVIEW_WRITE)');

  const canaryRes = await api(baseUrl, token, '/api/v1/ops/cco/drive-import-review/canary-status');
  return {
    queueTotal: Number(summary.body.totalNeedsReview ?? 0),
    canary: canaryRes.body?.canary || null,
  };
}

async function loadContext(baseUrl, token) {
  const metrics = await loadMetrics(baseUrl, token);
  const queue = await api(baseUrl, token, '/api/v1/ops/cco/drive-import-review/queue?limit=200');
  if (queue.status !== 200) fail(`queue HTTP ${queue.status}`);

  return {
    queueTotalBefore: metrics.queueTotal,
    canaryBefore: metrics.canary,
    batch: pickHomogeneousBatch(queue.body.items || [], TARGET_SIZE),
  };
}

function printPlan(baseUrl, ctx, modeLabel) {
  log(`Drive Import Review R3.3 batch pilot @ ${baseUrl}`);
  log(`Mode: ${modeLabel} · decision=${DECISION} · size=${TARGET_SIZE} · reviewer=${REVIEWER}`);
  log(`queue before: ${ctx.queueTotalBefore}`);
  log(
    `canary before: used=${ctx.canaryBefore?.decisionsUsed ?? '?'} remaining=${ctx.canaryBefore?.decisionsRemaining ?? '?'} storageKeyChanged=${ctx.canaryBefore?.storageKeyChanged ?? 0}`
  );
  log('\n--- Homogen batch (auto-vald från kö) ---');
  log(`homogeneity: ${JSON.stringify(ctx.batch.homogeneity)}`);
  for (const row of ctx.batch.rows) {
    log(
      `  ${row.assetId} · ${row.fileName || '—'} · ${row.suggestedPatientLabel || row.suggestedPatientId}`
    );
  }
}

function printSummary({
  baseUrl,
  ctx,
  batchId,
  previewToken,
  statusRows,
  canaryAfter,
  auditNote,
  pass,
}) {
  const queueDelta = ctx.queueTotalBefore - (ctx.queueTotalAfter ?? ctx.queueTotalBefore);
  const usedDelta =
    Number(canaryAfter?.decisionsUsed ?? 0) - Number(ctx.canaryBefore?.decisionsUsed ?? 0);
  const skDelta =
    Number(canaryAfter?.storageKeyChanged ?? 0) - Number(ctx.canaryBefore?.storageKeyChanged ?? 0);

  log('\n========== SUMMARY ==========');
  log(`base: ${baseUrl}`);
  log(`batchId: ${batchId || '—'}`);
  log(`previewToken: ${previewToken ? `${previewToken.slice(0, 8)}…` : '—'}`);
  log(`queue: ${ctx.queueTotalBefore} → ${ctx.queueTotalAfter ?? '—'} (Δ ${queueDelta || 0})`);
  log(
    `canary: used ${ctx.canaryBefore?.decisionsUsed ?? '?'} → ${canaryAfter?.decisionsUsed ?? '?'} (Δ ${usedDelta}) · remaining ${canaryAfter?.decisionsRemaining ?? '?'}`
  );
  log(`storageKeyChanged Δ: ${skDelta} (expected 0)`);
  if (statusRows?.length) {
    log('statuses:');
    for (const row of statusRows) {
      log(
        `  ${row.assetId}: ${row.before} → ${row.after} · storageKey ${row.storageOk ? 'OK' : 'CHANGED'}`
      );
    }
  }
  if (auditNote) log(`audit: ${auditNote}`);
  log(`result: ${pass ? 'PASS' : 'FAIL'}`);
  log('=============================');
}

async function runPreview(baseUrl, token, ctx) {
  const previewBody = {
    assetIds: ctx.batch.assetIds,
    decision: DECISION,
    reason: `batch pilot preview ${DECISION}`,
    reviewer: REVIEWER,
  };
  const preview = await api(baseUrl, token, '/api/v1/ops/cco/drive-import-review/batches/preview', {
    method: 'POST',
    body: previewBody,
  });
  if (preview.status !== 200) {
    fail(`preview HTTP ${preview.status}: ${preview.body?.error || JSON.stringify(preview.body)}`);
  }
  if (!preview.body.canCommit) {
    fail(`preview blocked: ${JSON.stringify(preview.body.rows?.filter((r) => !r.ok) || [])}`);
  }
  return preview.body;
}

async function runConfirm(baseUrl, token, previewToken) {
  if (!previewToken)
    fail('--confirm kräver --preview-token=<uuid> eller --preview i samma körning.');
  const confirm = await api(baseUrl, token, '/api/v1/ops/cco/drive-import-review/batches/confirm', {
    method: 'POST',
    body: { previewToken },
  });
  if (confirm.status !== 200) {
    fail(`confirm HTTP ${confirm.status}: ${confirm.body?.error || JSON.stringify(confirm.body)}`);
  }
  return confirm.body;
}

async function verifyAfterCommit(baseUrl, token, ctx, batchId, beforeSnaps, previewToken) {
  const summaryAfter = await api(baseUrl, token, '/api/v1/ops/cco/drive-import-review/summary');
  ctx.queueTotalAfter = Number(summaryAfter.body?.totalNeedsReview ?? ctx.queueTotalBefore);

  const canaryAfter = (
    await api(baseUrl, token, '/api/v1/ops/cco/drive-import-review/canary-status')
  ).body?.canary;

  const statusRows = [];
  let hardFail = false;
  for (const row of ctx.batch.rows) {
    const before = beforeSnaps[row.assetId] || {};
    const afterRes = await fetchAsset(baseUrl, token, row.assetId, row.suggestedPatientId);
    const after = snapshotFields(afterRes.body?.asset);
    const statusOk = after?.status === EXPECTED_STATUS;
    const storageOk = before.storageKey === after?.storageKey;
    statusRows.push({
      assetId: row.assetId,
      before: before.status || '?',
      after: after?.status,
      storageOk,
    });
    if (!statusOk || !storageOk) hardFail = true;
  }

  const usedDelta =
    Number(canaryAfter?.decisionsUsed ?? 0) - Number(ctx.canaryBefore?.decisionsUsed ?? 0);
  if (usedDelta !== ctx.batch.assetIds.length) hardFail = true;

  const skDelta =
    Number(canaryAfter?.storageKeyChanged ?? 0) - Number(ctx.canaryBefore?.storageKeyChanged ?? 0);
  if (skDelta !== 0) hardFail = true;

  const queueDelta = ctx.queueTotalBefore - ctx.queueTotalAfter;
  if (queueDelta !== ctx.batch.assetIds.length) hardFail = true;

  let auditNote = 'skipped';
  const auditRes = await api(
    baseUrl,
    token,
    `/api/v1/cco-audit?action=${encodeURIComponent('drive_import_review.batch_committed')}&limit=10`
  );
  if (auditRes.status === 403) {
    auditNote =
      'GET /cco-audit 403 — använd queue/canary-delta som bevis (skrivning sker server-side)';
  } else if (auditRes.status === 200) {
    const items = auditRes.body?.items || [];
    const hit = items.find((e) => e.detail?.batchId === batchId);
    auditNote = hit
      ? `batch_committed found batchId=${batchId}`
      : `batch_committed not in last ${items.length} (check manually)`;
  } else {
    auditNote = `audit HTTP ${auditRes.status}`;
  }

  printSummary({
    baseUrl,
    ctx,
    batchId,
    previewToken,
    statusRows,
    canaryAfter,
    auditNote,
    pass: !hardFail,
  });
  return hardFail ? 1 : 0;
}

async function main() {
  const baseUrl = resolveProdBaseUrl();
  const token = resolveBearerToken(baseUrl);

  if (wantsConfirm && !wantsPreview && PREVIEW_TOKEN) {
    log(`Drive Import Review R3.3 batch pilot @ ${baseUrl}`);
    log('Mode: CONFIRM ONLY (--preview-token)');
    const before = await loadMetrics(baseUrl, token);
    log(`queue before: ${before.queueTotal}`);
    log(`canary before: used=${before.canary?.decisionsUsed ?? '?'}`);

    log('\n=== CONFIRM ===');
    const confirmResult = await runConfirm(baseUrl, token, PREVIEW_TOKEN);
    log(`committed assetCount=${confirmResult.assetCount} batchId=${confirmResult.batchId}`);

    const after = await loadMetrics(baseUrl, token);
    const usedDelta =
      Number(after.canary?.decisionsUsed ?? 0) - Number(before.canary?.decisionsUsed ?? 0);
    const skDelta =
      Number(after.canary?.storageKeyChanged ?? 0) - Number(before.canary?.storageKeyChanged ?? 0);
    const queueDelta = before.queueTotal - after.queueTotal;

    log('\n========== SUMMARY ==========');
    log(`batchId: ${confirmResult.batchId}`);
    log(`queue: ${before.queueTotal} → ${after.queueTotal} (Δ ${queueDelta})`);
    log(`canary used Δ: ${usedDelta} · storageKeyChanged Δ: ${skDelta}`);
    for (const row of confirmResult.results || []) {
      log(
        `  ${row.asset?.assetId || row.assetId}: status=${row.asset?.status ?? row.status ?? '?'}`
      );
    }
    log('=============================');
    process.exit(0);
  }

  const ctx = await loadContext(baseUrl, token);

  if (dryRunOnly) {
    printPlan(baseUrl, ctx, 'DRY-RUN (ingen preview/confirm)');
    log('\nNästa steg:');
    log('  npm run pilot:drive-import-review-batch-prod -- --preview');
    log('  npm run pilot:drive-import-review-batch-prod -- --preview --confirm');
    log('  npm run pilot:drive-import-review-batch-prod -- --confirm --preview-token=<token>');
    process.exit(0);
  }

  if (wantsConfirm && !wantsPreview && !PREVIEW_TOKEN) {
    fail('--confirm kräver --preview-token=<uuid> eller kombinera med --preview.');
  }

  printPlan(baseUrl, ctx, wantsConfirm ? 'PREVIEW + CONFIRM' : 'PREVIEW ONLY');

  let previewResult = null;
  if (wantsPreview) {
    log('\n=== PREVIEW ===');
    previewResult = await runPreview(baseUrl, token, ctx);
    log(`batchId=${previewResult.batchId}`);
    log(`canCommit=${previewResult.canCommit} okCount=${previewResult.okCount}`);
    log(`previewToken=${previewResult.previewToken}`);
    log('\nConfirm separately:');
    log(
      `  npm run pilot:drive-import-review-batch-prod -- --confirm --preview-token=${previewResult.previewToken}`
    );
  }

  if (!wantsConfirm) {
    process.exit(0);
  }

  const beforeSnaps = {};
  for (const row of ctx.batch.rows) {
    const res = await fetchAsset(baseUrl, token, row.assetId, row.suggestedPatientId);
    beforeSnaps[row.assetId] = snapshotFields(res.body?.asset);
  }

  const tokenForConfirm = previewResult?.previewToken || PREVIEW_TOKEN;
  log('\n=== CONFIRM ===');
  const confirmResult = await runConfirm(baseUrl, token, tokenForConfirm);
  log(`committed assetCount=${confirmResult.assetCount} batchId=${confirmResult.batchId}`);

  const code = await verifyAfterCommit(
    baseUrl,
    token,
    ctx,
    confirmResult.batchId || previewResult?.batchId,
    beforeSnaps,
    previewResult?.previewToken || PREVIEW_TOKEN
  );
  process.exit(code);
}

main().catch((err) => {
  console.error(`❌ ${err.message || err}`);
  process.exit(1);
});
