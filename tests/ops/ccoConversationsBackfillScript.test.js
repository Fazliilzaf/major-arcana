'use strict';

/* Konversationer Fas 1 — driftskriptet som kör truth-inbox-backfill →
 * ingestion-backfill → jobbföljning → worklist-verifiering för en brevlåda.
 * Låser skriptets rena helpers (täckningstolkning, jobbval/summering,
 * worklist-summering) och att require av skriptet INTE kör main (ingen
 * nätverksbieffekt i test). */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  inboxCoverage,
  pickBackfillJob,
  summarizeBackfillJob,
  summarizeWorklist,
} = require('../../scripts/run-cco-conversations-backfill.js');

test('inboxCoverage tolkar history/status-svaret (komplett/inkomplett/tomt)', () => {
  const complete = inboxCoverage({
    mailboxes: [
      {
        folderCounts: [
          { folderType: 'inbox', materializedMessageCount: 120, totalItemCount: 120 },
          { folderType: 'sent', materializedMessageCount: 0, totalItemCount: 80 },
        ],
      },
    ],
  });
  assert.deepEqual(complete, { materialized: 120, total: 120, complete: true });

  const partial = inboxCoverage({
    mailboxes: [
      { folderCounts: [{ folderType: 'inbox', materializedMessageCount: 5, totalItemCount: 120 }] },
    ],
  });
  assert.equal(partial.complete, false);

  // Tom/okänd täckning ska ALDRIG räknas som komplett (0/0 → inkomplett).
  assert.equal(inboxCoverage({}).complete, false);
  assert.equal(
    inboxCoverage({
      mailboxes: [
        { folderCounts: [{ folderType: 'inbox', materializedMessageCount: 0, totalItemCount: 0 }] },
      ],
    }).complete,
    false
  );
});

test('pickBackfillJob hittar rätt jobb bland flera i status-svaret', () => {
  const status = {
    jobs: [
      { id: 'a:backfill:1', status: 'completed' },
      { id: 'b:backfill:2', status: 'running' },
    ],
  };
  assert.equal(pickBackfillJob(status, 'b:backfill:2').status, 'running');
  assert.equal(pickBackfillJob(status, 'saknas'), null);
  assert.equal(pickBackfillJob({}, 'a'), null);
});

test('summarizeBackfillJob plockar räkneverken från workerns jobbformat', () => {
  const summary = summarizeBackfillJob({
    status: 'completed',
    phase: 'done',
    importResult: { totalFetched: 10, totalSaved: 7, totalDuplicates: 3 },
    totalProcessed: 7,
    totalFailed: 0,
    batches: 2,
    error: null,
  });
  assert.deepEqual(summary, {
    status: 'completed',
    phase: 'done',
    fetched: 10,
    saved: 7,
    duplicates: 3,
    processed: 7,
    failed: 0,
    batches: 2,
    error: null,
  });
  assert.equal(summarizeBackfillJob(null), null);
});

test('summarizeWorklist räknar trådar + needsReply ur consumer-svaret', () => {
  const summary = summarizeWorklist({
    ok: true,
    summary: { total: 3 },
    rows: [
      { conversationKey: 'k1', needsReply: true },
      { conversationKey: 'k2', status: 'needs_reply' },
      { conversationKey: 'k3' },
    ],
  });
  assert.equal(summary.ok, true);
  assert.equal(summary.rowCount, 3);
  assert.equal(summary.needsReply, 2);

  const empty = summarizeWorklist(null);
  assert.equal(empty.ok, false);
  assert.equal(empty.rowCount, 0);
});
