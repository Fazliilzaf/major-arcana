#!/usr/bin/env node
'use strict';

/**
 * Drive Import Review R2 prod-pilot — en fil i taget med efterkontroll.
 *
 * Usage:
 *   npm run pilot:drive-import-review-prod -- --dry-run
 *   npm run pilot:drive-import-review-prod -- --execute
 *
 * Kräver STAFF/owner-auth (.env) eller validerad ARCANA_SMOKE_BEARER_TOKEN.
 * Kör verify först: npm run verify:drive-import-review-prod
 */

require('dotenv').config({ quiet: true });

const path = require('node:path');
const { resolveProdAuthToken } = require('./lib/resolve-prod-auth-token');

const BASE = (
  process.env.BASE ||
  process.env.ARCANA_PROD_URL ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');
const REVIEWER = String(process.env.DRIVE_IMPORT_REVIEW_PILOT_REVIEWER || 'drive-pilot').trim();
const EXECUTE = process.argv.includes('--execute');
const DRY_RUN = process.argv.includes('--dry-run') || !EXECUTE;

function log(msg) {
  console.log(msg);
}

async function getToken() {
  return resolveProdAuthToken({ baseUrl: BASE, preferOwner: false });
}

async function api(token, route, opts = {}) {
  const res = await fetch(`${BASE}${route}`, {
    ...opts,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-arcana-client': 'major_arcana_admin',
      'x-cco-role': 'owner',
      'x-cco-tenant': 'hairtpclinic',
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  return { status: res.status, body };
}

async function fetchAsset(token, assetId, patientId) {
  if (!patientId) return { status: 404, body: {} };
  const res = await api(token, `/api/v1/cco/patients/${encodeURIComponent(patientId)}/assets`);
  if (res.status !== 200) return res;
  const asset = (res.body?.assets || res.body?.items || []).find((a) => a.id === assetId);
  return { status: asset ? 200 : 404, body: { asset } };
}

async function fetchCanary(token) {
  return api(token, '/api/v1/ops/cco/drive-import-review/canary-status');
}

async function fetchAuditDecisions(token, limit = 20) {
  const res = await api(
    token,
    `/api/v1/cco/audit?action=drive_import_review.decision&limit=${limit}`
  );
  return res;
}

async function pickQueueItems(token) {
  const queue = await api(token, '/api/v1/ops/cco/drive-import-review/queue?limit=30');
  if (queue.status !== 200) throw new Error(`queue HTTP ${queue.status}`);
  const items = queue.body.items || [];
  if (items.length < 4)
    throw new Error(`för få kö-rader (${items.length}) — behöver minst 4 för pilot`);

  const withPatient = items.filter((i) => i.suggestedPatientId);
  const withoutPatient = items.filter((i) => !i.suggestedPatientId);
  const approveItem = withPatient[0] || items[0];
  const reassignItem = withPatient.find((i) => i.assetId !== approveItem.assetId) || items[1];
  const rejectItem =
    items.find((i) => i.assetId !== approveItem.assetId && i.assetId !== reassignItem.assetId) ||
    items[2];
  const dupItem =
    items.find(
      (i) =>
        i.assetId !== approveItem.assetId &&
        i.assetId !== reassignItem.assetId &&
        i.assetId !== rejectItem.assetId
    ) || items[3];
  const browseItem =
    items.find(
      (i) => ![approveItem, reassignItem, rejectItem, dupItem].some((x) => x.assetId === i.assetId)
    ) || items[4];

  return {
    approve: approveItem,
    reassign: reassignItem,
    reject: rejectItem,
    duplicate: dupItem,
    browse: browseItem,
    reassignTargetPatientId:
      process.env.DRIVE_IMPORT_REVIEW_PILOT_REASSIGN_PATIENT_ID ||
      (withPatient.find((p) => p.suggestedPatientId !== reassignItem.suggestedPatientId)
        ?.suggestedPatientId ??
        null),
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

function assertImmutable(before, after) {
  const fields = [
    'storageKey',
    'checksum',
    'originalDriveFileId',
    'originalDrivePath',
    'originalFileName',
  ];
  const changed = fields.filter((f) => before[f] !== after[f]);
  return changed;
}

async function decide(token, assetId, body) {
  return api(
    token,
    `/api/v1/ops/cco/drive-import-review/assets/${encodeURIComponent(assetId)}/decide`,
    {
      method: 'POST',
      body,
    }
  );
}

async function runStep({
  name,
  token,
  assetId,
  patientIdForFetch,
  body,
  expectedStatus,
  canaryBefore,
}) {
  log(`\n=== ${name} ===`);
  log(`assetId=${assetId}`);
  const beforeRes = await fetchAsset(token, assetId, patientIdForFetch);
  const before = beforeRes.body?.asset;
  const beforeSnap = snapshotFields(before);
  log(`before: status=${beforeSnap?.status} patient=${beforeSnap?.patientId}`);

  if (DRY_RUN) {
    log(`DRY-RUN: skulle POST decide ${JSON.stringify(body)}`);
    return { ok: true, dryRun: true };
  }

  const result = await decide(token, assetId, body);
  if (result.status !== 200) {
    log(`FAIL decide HTTP ${result.status}: ${result.body?.error || JSON.stringify(result.body)}`);
    return { ok: false, result };
  }

  const afterFromDecision = result.body?.asset || null;
  let afterSnap = snapshotFields(afterFromDecision);
  if (!afterSnap?.status) {
    const afterRes = await fetchAsset(
      token,
      assetId,
      afterFromDecision?.patientId || body.patientId || patientIdForFetch
    );
    afterSnap = snapshotFields(afterRes.body?.asset);
  }
  const beforeSnapFinal = beforeSnap || {};
  const immutableBroken =
    beforeSnapFinal.storageKey && afterSnap?.storageKey
      ? assertImmutable(beforeSnapFinal, afterSnap)
      : [];
  const statusOk = afterSnap?.status === expectedStatus;

  log(`after: status=${afterSnap?.status} patient=${afterSnap?.patientId}`);
  log(`immutable broken: ${immutableBroken.length ? immutableBroken.join(', ') : 'none'}`);
  log(`decision=${result.body?.decision}`);

  const canaryAfter = await fetchCanary(token);
  const usedDelta =
    Number(canaryAfter.body?.canary?.decisionsUsed ?? 0) - Number(canaryBefore?.decisionsUsed ?? 0);
  log(`canary used delta: ${usedDelta}`);

  const audit = await fetchAuditDecisions(token, 5);
  const latest = (audit.body?.items || audit.body || []).find?.(
    (e) => e?.detail?.decision === body.decision || e?.action === 'drive_import_review.decision'
  );
  log(`audit latest: ${latest ? latest.action || 'found' : 'check manually'}`);

  const ok = statusOk && immutableBroken.length === 0 && usedDelta >= 1;
  log(ok ? 'PASS' : 'FAIL');
  return { ok, beforeSnap, afterSnap, result, immutableBroken, statusOk };
}

async function main() {
  log(`Drive Import Review pilot @ ${BASE}`);
  log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'EXECUTE'}`);

  const token = await getToken();
  const summary = await api(token, '/api/v1/ops/cco/drive-import-review/summary');
  if (summary.status !== 200) throw new Error(`summary HTTP ${summary.status}`);
  if (!summary.body.writeEnabled) {
    throw new Error('write AV på prod — kör npm run apply:drive-import-review-prod först');
  }

  const picks = await pickQueueItems(token);
  if (!picks.reassignTargetPatientId) {
    throw new Error('ingen reassign-target — sätt DRIVE_IMPORT_REVIEW_PILOT_REASSIGN_PATIENT_ID');
  }

  log('\n--- Pilotplan ---');
  log(`approve:  ${picks.approve.assetId} → ${picks.approve.suggestedPatientId}`);
  log(`reassign: ${picks.reassign.assetId} → ${picks.reassignTargetPatientId}`);
  log(`reject:   ${picks.reject.assetId}`);
  log(`duplicate:${picks.duplicate.assetId}`);
  log(`browse:   ${picks.browse.assetId} (öppna kundkort, inget beslut)`);

  const canary0 = (await fetchCanary(token)).body?.canary || {};
  const results = [];

  results.push(
    await runStep({
      name: '1/4 approve',
      token,
      assetId: picks.approve.assetId,
      patientIdForFetch: picks.approve.suggestedPatientId,
      body: {
        decision: 'approve',
        reason: 'pilot approve suggested patient',
        reviewer: REVIEWER,
        patientId: picks.approve.suggestedPatientId,
      },
      expectedStatus: 'VISIBLE_ON_PATIENT_CARD',
      canaryBefore: canary0,
    })
  );

  results.push(
    await runStep({
      name: '2/4 reassign',
      token,
      assetId: picks.reassign.assetId,
      patientIdForFetch: picks.reassign.suggestedPatientId,
      body: {
        decision: 'reassign',
        reason: 'pilot reassign to alternate patient',
        reviewer: REVIEWER,
        patientId: picks.reassignTargetPatientId,
      },
      expectedStatus: 'VISIBLE_ON_PATIENT_CARD',
      canaryBefore: canary0,
    })
  );

  results.push(
    await runStep({
      name: '3/4 reject',
      token,
      assetId: picks.reject.assetId,
      patientIdForFetch: picks.reject.suggestedPatientId,
      body: {
        decision: 'reject',
        reason: 'pilot ignore file',
        reviewer: REVIEWER,
      },
      expectedStatus: 'REJECTED',
      canaryBefore: canary0,
    })
  );

  results.push(
    await runStep({
      name: '4/4 mark_duplicate',
      token,
      assetId: picks.duplicate.assetId,
      patientIdForFetch: picks.duplicate.suggestedPatientId,
      body: {
        decision: 'mark_duplicate',
        reason: 'pilot duplicate candidate',
        reviewer: REVIEWER,
      },
      expectedStatus: 'REJECTED',
      canaryBefore: canary0,
    })
  );

  log('\n=== 5 browse-only (ingen API-skrivning) ===');
  log(
    `Öppna kundkort: ${BASE}${picks.browse.customerCardHref || '/major-arcana-preview/?view=customers'}`
  );
  log(`Fil: ${picks.browse.fileName} (${picks.browse.assetId}) — avbryt utan beslut`);

  const failed = results.filter((r) => r && r.ok === false);
  if (DRY_RUN) {
    log('\nDRY-RUN klar — kör med --execute för riktiga beslut.');
    process.exit(0);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`❌ ${err.message || err}`);
  process.exit(1);
});
