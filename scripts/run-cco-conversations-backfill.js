#!/usr/bin/env node
'use strict';

/* Konversationer Fas 1 — kör hela backfill-kedjan för EN brevlåda mot prod:
 *
 *   1. Truth-täckning (inbox): /cco/runtime/history/status
 *      → rundor av /cco/runtime/history/backfill tills inbox är materialiserad.
 *      (Scope = historiska INKOMMANDE mail → enbart inbox-foldern.)
 *   2. Ingestion-backfill: POST /cco/mail-ingestion/backfill (read-only,
 *      allowlist-gated; kedjar import + processning genom befintliga
 *      pipelinen: brusfilter/dedupe/kundmatchning/conflict-review/needsReply).
 *   3. Följer jobbet via GET /cco/mail-ingestion/status tills completed/failed.
 *   4. Verifierar att Konversationer-ytan ser trådarna:
 *      GET /cco/runtime/worklist/consumer?mailboxId=<mailbox> → radantal m.m.
 *
 * Read-only: ingen send-väg berörs. Idempotent: dedupe gör omkörning säker.
 *
 * Env:
 *   ARCANA_PROD_URL   (default https://arcana.hairtpclinic.se)
 *   ARCANA_MAILBOX    (default kons@hairtpclinic.com)
 *   ARCANA_BACKFILL_MAX_ROUNDS / _MAX_PAGES / _PAGE_SIZE / _RETRY_MS
 *   ARCANA_INGEST_POLL_MS (default 15000) / ARCANA_INGEST_MAX_POLLS (default 240)
 *
 * Kör: node scripts/run-cco-conversations-backfill.js
 */

require('dotenv').config({ quiet: true });

const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(/\/+$/, '');
const mailboxEmail = (process.env.ARCANA_MAILBOX || 'kons@hairtpclinic.com').toLowerCase();
const maxRounds = Number(process.env.ARCANA_BACKFILL_MAX_ROUNDS || 300);
const maxPagesPerFolder = Number(process.env.ARCANA_BACKFILL_MAX_PAGES || 3);
const pageSize = Number(process.env.ARCANA_BACKFILL_PAGE_SIZE || 150);
const retryDelayMs = Number(process.env.ARCANA_BACKFILL_RETRY_MS || 20000);
const ingestPollMs = Number(process.env.ARCANA_INGEST_POLL_MS || 15000);
const ingestMaxPolls = Number(process.env.ARCANA_INGEST_MAX_POLLS || 240);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ── Rena helpers (testade i tests/ops/ccoConversationsBackfillScript.test.js) ── */

function inboxCoverage(coveragePayload) {
  const row = (coveragePayload?.mailboxes?.[0]?.folderCounts || []).find(
    (item) => item.folderType === 'inbox'
  );
  return {
    materialized: Number(row?.materializedMessageCount || 0),
    total: Number(row?.totalItemCount || 0),
    complete:
      Boolean(row) &&
      Number(row.totalItemCount || 0) > 0 &&
      Number(row.materializedMessageCount || 0) >= Number(row.totalItemCount || 0),
  };
}

function pickBackfillJob(statusPayload, jobId) {
  return (statusPayload?.jobs || []).find((job) => job.id === jobId) || null;
}

function summarizeBackfillJob(job) {
  if (!job) return null;
  return {
    status: job.status,
    phase: job.phase,
    fetched: Number(job.importResult?.totalFetched || 0),
    saved: Number(job.importResult?.totalSaved || 0),
    duplicates: Number(job.importResult?.totalDuplicates || 0),
    processed: Number(job.totalProcessed || 0),
    failed: Number(job.totalFailed || 0),
    batches: Number(job.batches || 0),
    error: job.error || null,
  };
}

function summarizeWorklist(payload) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const needsReply = rows.filter(
    (row) => row?.needsReply === true || row?.status === 'needs_reply'
  ).length;
  return {
    ok: payload?.ok === true,
    rowCount: rows.length,
    needsReply,
    summary: payload?.summary || null,
  };
}

/* ── HTTP mot prod (samma mönster som run-mailbox-truth-backfill-prod.js) ── */

async function fetchJson(path, { method = 'GET', token = '', body = null, retries = 5 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(text.slice(0, 120) || `${res.status}`);
      }
      if (!res.ok) {
        const error = new Error(payload.error || `${res.status}`);
        error.statusCode = res.status;
        error.metadata = payload.metadata || null;
        throw error;
      }
      return payload;
    } catch (error) {
      lastError = error;
      // 4xx är slutgiltiga (t.ex. 403 = inte allowlistad) — inga retries.
      if (Number(error.statusCode) >= 400 && Number(error.statusCode) < 500) throw error;
      if (attempt < retries) {
        console.warn(`retry ${attempt}/${retries}: ${error.message || error}`);
        await sleep(retryDelayMs);
      }
    }
  }
  throw lastError;
}

async function resolveOwnerToken() {
  const output = require('node:child_process').execSync(
    'node scripts/get-prod-auth-token.js --owner',
    { cwd: `${__dirname}/..`, encoding: 'utf8' }
  );
  const token = output.trim().split('\n').pop();
  if (!token) throw new Error('owner token saknas');
  return token;
}

/* ── Fas 1: truth-inbox ── */

async function ensureInboxTruth(token) {
  const coverage = await fetchJson(
    `/api/v1/cco/runtime/history/status?mailboxId=${encodeURIComponent(mailboxEmail)}`,
    { token }
  );
  let inbox = inboxCoverage(coverage);
  console.log(`[1/4] Truth inbox: ${inbox.materialized}/${inbox.total}`);
  if (inbox.complete) return inbox;

  for (let round = 1; round <= maxRounds; round += 1) {
    console.log(`  -- truth-runda ${round} (inbox) --`);
    try {
      await fetchJson('/api/v1/cco/runtime/history/backfill', {
        method: 'POST',
        token,
        body: {
          mailboxId: mailboxEmail,
          mailboxIds: [mailboxEmail],
          lookbackDays: 365,
          maxPagesPerFolder,
          pageSize,
          folderTypes: ['inbox'],
        },
      });
    } catch (error) {
      console.warn(`  runda ${round} misslyckades: ${error.message || error}`);
    }
    const after = await fetchJson(
      `/api/v1/cco/runtime/history/status?mailboxId=${encodeURIComponent(mailboxEmail)}`,
      { token }
    );
    inbox = inboxCoverage(after);
    console.log(`  inbox: ${inbox.materialized}/${inbox.total}`);
    if (inbox.complete) return inbox;
    await sleep(5000);
  }
  throw new Error('Truth-backfill (inbox) nådde max rundor utan komplett täckning');
}

/* ── Fas 2+3: ingestion-backfill + jobbföljning ── */

async function runIngestionBackfill(token) {
  const accepted = await fetchJson('/api/v1/cco/mail-ingestion/backfill', {
    method: 'POST',
    token,
    body: { mailboxEmail },
  });
  console.log(`[2/4] Ingestion-backfill accepterad: jobId=${accepted.jobId} (read-only)`);

  for (let poll = 1; poll <= ingestMaxPolls; poll += 1) {
    await sleep(ingestPollMs);
    const status = await fetchJson('/api/v1/cco/mail-ingestion/status', { token });
    const job = pickBackfillJob(status, accepted.jobId);
    const summary = summarizeBackfillJob(job);
    if (!summary) {
      console.warn(`  poll ${poll}: jobbet syns inte ännu`);
      continue;
    }
    console.log(
      `  [3/4] ${summary.status}/${summary.phase} — fetched=${summary.fetched} saved=${summary.saved} ` +
        `dup=${summary.duplicates} processed=${summary.processed} failed=${summary.failed}`
    );
    if (summary.status === 'completed') return summary;
    if (summary.status === 'failed') {
      throw new Error(`Ingestion-backfill misslyckades: ${summary.error || 'okänt fel'}`);
    }
  }
  throw new Error('Ingestion-backfill blev inte klar inom polling-fönstret');
}

/* ── Fas 4: verifiera Konversationer-ytan ── */

async function verifyWorklist(token) {
  const payload = await fetchJson(
    `/api/v1/cco/runtime/worklist/consumer?mailboxId=${encodeURIComponent(mailboxEmail)}`,
    { token }
  );
  const summary = summarizeWorklist(payload);
  console.log(
    `[4/4] Worklist (${mailboxEmail}): ${summary.rowCount} trådar, needsReply=${summary.needsReply}`
  );
  if (!summary.ok || summary.rowCount === 0) {
    throw new Error(
      'Worklist är tom efter backfill — kontrollera truth-täckning och pipeline-review-kön.'
    );
  }
  return summary;
}

async function main() {
  console.log(`== CCO Konversationer-backfill (${mailboxEmail}) mot ${base} ==`);
  const token = await resolveOwnerToken();
  await ensureInboxTruth(token);
  const jobSummary = await runIngestionBackfill(token);
  const worklist = await verifyWorklist(token);
  console.log('== Klart ==');
  console.log(JSON.stringify({ mailboxEmail, ingestion: jobSummary, worklist }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  inboxCoverage,
  pickBackfillJob,
  summarizeBackfillJob,
  summarizeWorklist,
};
