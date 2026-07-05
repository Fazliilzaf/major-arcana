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

const {
  sampleWorklistRows,
  buildBackfillVerdict,
  nextStopState,
} = require('../../scripts/run-cco-conversations-backfill.js');

test('sampleWorklistRows ger bevisfält utan ämne/brödtext, sorterat på senaste inkommande', () => {
  const rows = sampleWorklistRows(
    {
      rows: [
        {
          conversationKey: 'kons:conv-old',
          mailboxId: 'kons@hairtpclinic.com',
          lastInboundAt: '2026-01-01T08:00:00Z',
          needsReply: false,
          subject: 'HEMLIGT ÄMNE',
          bodyPreview: 'HEMLIG TEXT',
        },
        {
          conversationKey: 'kons:conv-new',
          mailboxId: 'kons@hairtpclinic.com',
          lastInboundAt: '2026-06-01T10:00:00Z',
          needsReply: true,
          ingestion: { matchStatus: 'NEEDS_REVIEW' },
        },
      ],
    },
    5
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].conversationKey, 'kons:conv-new', 'senaste inkommande först');
  assert.equal(rows[0].needsReply, true);
  assert.equal(rows[0].customerMatch, 'NEEDS_REVIEW');
  assert.equal(rows[1].customerMatch, 'UNKNOWN');
  // Integritet: inga ämnen/brödtexter i bevisraderna.
  const serialized = JSON.stringify(rows);
  assert.ok(!serialized.includes('HEMLIGT'), 'ämne får inte läcka');
  assert.ok(!serialized.includes('HEMLIG TEXT'), 'brödtext får inte läcka');
});

test('sampleWorklistRows markerar kundbunden rad som MATCHED', () => {
  const rows = sampleWorklistRows({
    rows: [{ conversationKey: 'k', customerId: 'cust-1', lastInboundAt: '2026-06-01T00:00:00Z' }],
  });
  assert.equal(rows[0].customerMatch, 'MATCHED');
});

test('buildBackfillVerdict stoppar när worklist fanns men ingestion gav noll bevis', () => {
  const verdict = buildBackfillVerdict({
    before: { ok: true, rowCount: 1 },
    after: { ok: true, rowCount: 1 },
    ingestion: { saved: 0, processed: 0, duplicates: 0, failed: 0 },
  });
  assert.equal(verdict.verdict, 'STOP');
  assert.equal(verdict.reason, 'no_new_pipeline_evidence');
});

test('buildBackfillVerdict kräver worklist och accepterar processade/dubbletter som bevis', () => {
  assert.equal(
    buildBackfillVerdict({
      before: { ok: true, rowCount: 0 },
      after: { ok: true, rowCount: 0 },
      ingestion: { processed: 1 },
    }).reason,
    'worklist_empty'
  );
  assert.equal(
    buildBackfillVerdict({
      before: { ok: true, rowCount: 1 },
      after: { ok: true, rowCount: 1 },
      ingestion: { duplicates: 5 },
    }).verdict,
    'PASS'
  );
  assert.equal(
    buildBackfillVerdict({
      before: { ok: true, rowCount: 1 },
      after: { ok: true, rowCount: 2 },
      ingestion: { processed: 0, duplicates: 0 },
    }).verdict,
    'PASS'
  );
});

test('nextStopState: 3 konsekutiva fel → abort; lyckad runda nollställer', () => {
  let s = nextStopState(null, {});
  s = nextStopState(s, { failed: true });
  s = nextStopState(s, { failed: true });
  assert.equal(s.abort, false, 'två fel räcker inte utan rate-limit');
  s = nextStopState(s, { failed: true });
  assert.equal(s.abort, true, 'tre konsekutiva fel → säkert stopp');
  // Lyckad runda nollställer streaken.
  s = nextStopState(s, {});
  assert.deepEqual(s, { consecutiveFailures: 0, rateLimited: false, abort: false });
});

test('nextStopState: rate-limit (429) sänker tröskeln till 2', () => {
  let s = nextStopState(null, { failed: true, statusCode: 429 });
  assert.equal(s.rateLimited, true);
  assert.equal(s.abort, false);
  s = nextStopState(s, { failed: true });
  assert.equal(s.abort, true, 'två fel varav ett 429 → stopp');
});

test('default prod-host är .com — den riktiga ytan (aldrig .se som default)', () => {
  const { DEFAULT_PROD_URL } = require('../../scripts/run-cco-conversations-backfill.js');
  assert.equal(DEFAULT_PROD_URL, 'https://arcana.hairtpclinic.com');
  const source = require('node:fs').readFileSync(
    require('node:path').join(
      __dirname,
      '..',
      '..',
      'scripts',
      'run-cco-conversations-backfill.js'
    ),
    'utf8'
  );
  assert.ok(
    !source.includes('hairtpclinic.se'),
    '.se-hosten får inte förekomma i Konversationer-driftskriptet'
  );
});

test('sampleWorklistRows läser consumer-modellens NÄSTLADE radform (v1)', () => {
  // Exakt form från ccoMailboxTruthWorklistReadModel.buildConsumerModel.
  const rows = sampleWorklistRows({
    rows: [
      {
        id: 'kons@hairtpclinic.com:conv:abc',
        subject: 'HEMLIGT ÄMNE',
        preview: 'HEMLIG BRÖDTEXT',
        conversation: { key: 'kons@hairtpclinic.com:conv:abc', conversationId: 'c-abc' },
        mailbox: {
          mailboxId: 'kons@hairtpclinic.com',
          mailboxAddress: 'kons@hairtpclinic.com',
          ownershipMailbox: 'kons',
        },
        customer: { email: 'kund@example.com', name: 'Kund Kundsson' },
        timing: { lastInboundAt: '2026-07-01T09:00:00Z', latestMessageAt: '2026-07-01T09:00:00Z' },
        state: {
          needsReply: true,
          ingestion: { dominantStatus: 'NEEDS_REVIEW', needsReview: true, messageCount: 3 },
        },
      },
      {
        id: 'kons@hairtpclinic.com:conv:def',
        conversation: { key: 'kons@hairtpclinic.com:conv:def' },
        mailbox: { mailboxId: 'kons@hairtpclinic.com' },
        customer: { email: 'annan@example.com' },
        timing: { lastInboundAt: null, latestMessageAt: '2026-06-20T12:00:00Z' },
        state: { needsReply: false, ingestion: { dominantStatus: 'MATCHED' } },
      },
    ],
  });
  assert.equal(rows[0].conversationKey, 'kons@hairtpclinic.com:conv:abc');
  assert.equal(
    rows[0].mailboxId,
    'kons@hairtpclinic.com',
    'mailbox från nästlade mailbox-objektet'
  );
  assert.equal(rows[0].lastInboundAt, '2026-07-01T09:00:00Z', 'tid från timing-objektet');
  assert.equal(rows[0].needsReply, true, 'needsReply från state-objektet');
  assert.equal(rows[0].customerMatch, 'NEEDS_REVIEW', 'match från state.ingestion.dominantStatus');
  // Rad utan lastInboundAt faller tillbaka på latestMessageAt.
  assert.equal(rows[1].lastInboundAt, '2026-06-20T12:00:00Z');
  assert.equal(rows[1].customerMatch, 'MATCHED');
  // Integritet: ämne/preview läcker aldrig.
  const s = JSON.stringify(rows);
  assert.ok(!s.includes('HEMLIGT') && !s.includes('HEMLIG BRÖDTEXT'));
});

test('summarizeWorklist räknar needsReply även i nästlad state-form', () => {
  const summary = summarizeWorklist({
    ok: true,
    rows: [{ state: { needsReply: true } }, { state: { needsReply: false } }, { needsReply: true }],
  });
  assert.equal(summary.rowCount, 3);
  assert.equal(summary.needsReply, 2);
});
