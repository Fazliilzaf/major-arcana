'use strict';

/* Konversationer Fas 1 — allowlist-gated historisk mail-backfill (read-only).
 * Låser att:
 *  - ingest-endpoints (sync/process/process-all/backfill) avvisar brevlådor
 *    utanför mailbox-allowlisten med 403,
 *  - POST /cco/mail-ingestion/backfill accepterar allowlistad brevlåda (202)
 *    och kedjar import → process-drain i workern,
 *  - backfill-jobbet HÅRDLÅSER mode till read_only oavsett anroparens body,
 *  - alla mail går genom befintlig pipeline-väg (processQueue), ingen bypass. */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createCcoMailIngestionRouter } = require('../../src/routes/ccoMailIngestion');
const { createCcoMailIngestionWorker } = require('../../src/ops/ccoMailIngestion/worker');

const ALLOWLIST = ['kons@hairtpclinic.com', 'info@hairtpclinic.com'];

function passthroughAuth(req, _res, next) {
  next();
}
function passthroughRole() {
  return (req, _res, next) => next();
}

function buildFakeStores() {
  const queue = [];
  return {
    queue,
    ingestionStore: {
      getState: () => ({ mailImportRuns: {}, mailSyncState: {} }),
      ensureMailAccount: ({ email }) => ({ id: `acct:${email}` }),
      startImportRun: async () => ({ id: 'run-1' }),
      finishImportRun: async () => {},
      appendAudit: async () => {},
      buildDashboardSummary: () => ({ queueLength: queue.length }),
      getQueueLength: () => queue.length,
      reconcileProcessingQueue: async () => ({ removed: 0, requeued: 0 }),
      save: async () => {},
    },
  };
}

async function withServer(router, fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    return await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function buildRouter({ syncService = null, ingestionWorker = null, ingestionStore }) {
  return createCcoMailIngestionRouter({
    config: { ccoMailIngestionDefaultMailbox: 'kons@hairtpclinic.com' },
    authStore: null,
    requireAuth: passthroughAuth,
    requireRole: passthroughRole,
    ingestionStore,
    syncService,
    ingestionWorker,
    graphNotifications: null,
    mailboxAllowlist: ALLOWLIST,
    logger: { error: () => {}, log: () => {} },
  });
}

test('ingest-endpoints avvisar icke-allowlistad brevlåda med 403', async () => {
  const { ingestionStore } = buildFakeStores();
  const worker = createCcoMailIngestionWorker({
    config: {},
    ingestionStore,
    syncService: { runMailboxImport: async () => ({}), processQueue: async () => ({}) },
    logger: { error: () => {}, log: () => {} },
  });
  const router = buildRouter({ ingestionStore, ingestionWorker: worker });
  await withServer(router, async (base) => {
    for (const endpoint of ['sync', 'process', 'process-all', 'backfill']) {
      const res = await fetch(`${base}/cco/mail-ingestion/${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mailboxEmail: 'hacker@evil.example' }),
      });
      assert.equal(res.status, 403, `${endpoint} ska ge 403 för icke-allowlistad brevlåda`);
      const body = await res.json();
      assert.match(body.error, /allowlistad/i);
    }
  });
});

test('backfill accepterar allowlistad brevlåda (202) och hårdlåser read_only', async () => {
  const { ingestionStore } = buildFakeStores();
  const calls = [];
  const syncService = {
    runMailboxImport: async (options) => {
      calls.push({ fn: 'runMailboxImport', options });
      return {
        skipped: false,
        ingestResult: { totalFetched: 3, totalSaved: 2, totalDuplicates: 1 },
      };
    },
    processQueue: async (options) => {
      calls.push({ fn: 'processQueue', options });
      return { processed: 0, failed: 0, results: [] };
    },
  };
  const worker = createCcoMailIngestionWorker({
    config: { ccoMailIngestionQueueBatchSize: 10 },
    ingestionStore,
    syncService,
    logger: { error: () => {}, log: () => {} },
  });
  const router = buildRouter({ syncService, ingestionWorker: worker, ingestionStore });

  await withServer(router, async (base) => {
    const res = await fetch(`${base}/cco/mail-ingestion/backfill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Försök eskalera mode — ska ignoreras.
      body: JSON.stringify({ mailboxEmail: 'kons@hairtpclinic.com', mode: 'live' }),
    });
    assert.equal(res.status, 202);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.mode, 'read_only', 'svaret ska deklarera read_only');
    assert.ok(body.jobId, 'jobId ska returneras');

    // Vänta in det asynkrona jobbet.
    let job = null;
    for (let i = 0; i < 100; i += 1) {
      job = worker.getJob(body.jobId);
      if (job && (job.status === 'completed' || job.status === 'failed')) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(job?.status, 'completed', `jobbet ska slutföras (fick: ${job?.status})`);
    assert.equal(job.mode, 'read_only');
    assert.equal(job.importResult.totalFetched, 3);
    assert.equal(job.importResult.totalSaved, 2);
    assert.equal(job.importResult.totalDuplicates, 1);

    // Import + processning kördes, båda i read_only — trots mode:'live' i request.
    const importCall = calls.find((c) => c.fn === 'runMailboxImport');
    assert.equal(importCall.options.mode, 'read_only', 'import ska vara read_only');
    assert.equal(importCall.options.trigger, 'historical_backfill');
    const processCall = calls.find((c) => c.fn === 'processQueue');
    assert.ok(processCall, 'process-drain ska köras via befintliga pipeline-vägen');
    assert.equal(processCall.options.mode, 'read_only', 'processning ska vara read_only');
  });
});

test('status-endpointen exponerar allowlist + jobb (för att följa backfill)', async () => {
  const { ingestionStore } = buildFakeStores();
  const worker = createCcoMailIngestionWorker({
    config: {},
    ingestionStore,
    syncService: { runMailboxImport: async () => ({}), processQueue: async () => ({}) },
    logger: { error: () => {}, log: () => {} },
  });
  const router = buildRouter({ ingestionWorker: worker, ingestionStore });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/cco/mail-ingestion/status`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual([...body.allowlistedMailboxes].sort(), [...ALLOWLIST].sort());
    assert.ok(Array.isArray(body.jobs));
  });
});

test('utan injicerad allowlist faller routern tillbaka på curated default (kons@ ingår)', async () => {
  const { ingestionStore } = buildFakeStores();
  const router = createCcoMailIngestionRouter({
    config: {},
    authStore: null,
    requireAuth: passthroughAuth,
    requireRole: passthroughRole,
    ingestionStore,
    syncService: null,
    ingestionWorker: null,
    graphNotifications: null,
    logger: { error: () => {}, log: () => {} },
  });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/cco/mail-ingestion/status`);
    const body = await res.json();
    assert.ok(
      body.allowlistedMailboxes.includes('kons@hairtpclinic.com'),
      'curated default ska innehålla kons@hairtpclinic.com'
    );
    assert.ok(
      !body.allowlistedMailboxes.includes('marknad@hairtpclinic.com'),
      'marknad@ ska inte ingå (utskicksadress)'
    );
  });
});

test('e2e: seedat kons@-mail i truth → backfill-jobb → raw + pipeline-ledger (read_only)', async () => {
  const os = require('node:os');
  const path = require('node:path');
  const fsp = require('node:fs/promises');
  const { createCcoMailboxTruthStore } = require('../../src/ops/ccoMailboxTruthStore');
  const { createCcoMailIngestionStore } = require('../../src/ops/ccoMailIngestion/store');
  const {
    createCcoMailIngestionSyncService,
  } = require('../../src/ops/ccoMailIngestion/syncService');

  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'arcana-conv-backfill-'));
  const truthStore = await createCcoMailboxTruthStore({ filePath: path.join(dir, 'truth.json') });
  const ingestionStore = await createCcoMailIngestionStore({
    filePath: path.join(dir, 'ingestion.json'),
  });

  // Seed: ett historiskt inkommande kundmail i kons@-inboxen (truth-lagret).
  const account = { mailboxId: 'kons@hairtpclinic.com', mailboxAddress: 'kons@hairtpclinic.com' };
  const run = await truthStore.startBackfillRun({ account });
  await truthStore.recordFolderPage({
    runId: run.runId,
    account,
    folder: { folderType: 'inbox' },
    messages: [
      {
        graphMessageId: 'kons-hist-1',
        internetMessageId: '<kons-hist-1@example.com>',
        conversationId: 'conv-kons-1',
        folderType: 'inbox',
        subject: 'Fråga om hårtransplantation',
        bodyPreview: 'Hej, jag undrar över pris och lediga tider.',
        direction: 'inbound',
        receivedAt: '2026-03-10T09:15:00.000Z',
        from: { address: 'kund@example.com', name: 'Intresserad Kund' },
        toRecipients: ['kons@hairtpclinic.com'],
        isRead: true,
      },
    ],
    complete: true,
  });
  await truthStore.finishBackfillRun(run.runId, { status: 'completed' });

  // Riktig syncService + worker (ingen Graph-connector → ingen delta, bara truth→ingest).
  const syncService = createCcoMailIngestionSyncService({
    config: { defaultTenant: 'hair-tp-clinic' },
    graphReadConnector: null,
    ingestionStore,
    truthStore,
    patientDirectoryProvider: async () => [],
    logger: { error: () => {}, log: () => {} },
  });
  const worker = createCcoMailIngestionWorker({
    config: { ccoMailIngestionQueueBatchSize: 10 },
    ingestionStore,
    syncService,
    logger: { error: () => {}, log: () => {} },
  });

  const job = worker.enqueueBackfillJob({ mailboxEmail: 'kons@hairtpclinic.com' });
  let done = null;
  for (let i = 0; i < 200; i += 1) {
    done = worker.getJob(job.id);
    if (done && (done.status === 'completed' || done.status === 'failed')) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(
    done?.status,
    'completed',
    `backfill ska slutföras (${done?.error || done?.status})`
  );
  assert.equal(done.importResult.totalFetched, 1, 'truth-mailet ska hämtas');
  assert.equal(done.importResult.totalSaved, 1, 'truth-mailet ska sparas som raw');

  // Pipeline-ledger: mailet har processats (inte kvar i kö) med en pipeline-status.
  const state = ingestionStore.getState();
  const ledgers = Object.values(state.mailProcessingLedger || {});
  assert.equal(ledgers.length, 1, 'exakt en ledger-post');
  assert.ok(
    ['MATCHED', 'UNMATCHED', 'NEEDS_REVIEW', 'FILTERED', 'SECURITY_REVIEW'].includes(
      ledgers[0].status
    ),
    `ledger ska ha pipeline-status (fick: ${ledgers[0].status})`
  );
  assert.equal(ingestionStore.getQueueLength({ mailboxEmail: 'kons@hairtpclinic.com' }), 0);

  // Idempotens: körs backfillen igen dedupe:as mailet.
  const job2 = worker.enqueueBackfillJob({ mailboxEmail: 'kons@hairtpclinic.com' });
  let done2 = null;
  for (let i = 0; i < 200; i += 1) {
    done2 = worker.getJob(job2.id);
    if (done2 && (done2.status === 'completed' || done2.status === 'failed')) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(done2?.status, 'completed');
  assert.equal(done2.importResult.totalDuplicates, 1, 'omkörning ska dedupe:a, inte duplicera');
  assert.equal(done2.importResult.totalSaved, 0);
});
