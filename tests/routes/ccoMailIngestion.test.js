'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createCcoMailIngestionRouter } = require('../../src/routes/ccoMailIngestion');

const passAuth = (_req, _res, next) => next();
const passRole = (_role) => (_req, _res, next) => next();

function createMockIngestionStore(overrides = {}) {
  const calls = [];
  const state = {
    dashboard: {
      counts: {
        rawMessages: 10,
        processed: 5,
        duplicates: 1,
        needsReview: 2,
        unmatched: 1,
        failed: 1,
      },
      queueLength: 3,
    },
    needsReview: [
      {
        rawMessage: { subject: 'Hej', fromEmail: 'p@example.com', receivedDateTime: '2026-01-01' },
        ledger: { status: 'NEEDS_REVIEW' },
      },
    ],
    reviewQueue: [
      {
        rawMessage: {
          id: 'raw-1',
          subject: 'Bokning',
          fromEmail: 'patient@example.com',
          receivedDateTime: '2026-01-01',
          folderType: 'inbox',
        },
        reviewSummary: { counterpartyEmail: 'patient@example.com' },
        ledger: { status: 'UNMATCHED' },
      },
    ],
  };

  let loaded = overrides.loaded !== false;
  let deferred = overrides.deferred === true;

  function record(name, args) {
    calls.push({ method: name, args });
  }

  return {
    _calls: calls,
    deferred,
    loaded,
    disabled: overrides.disabled === true,
    reason: overrides.reason || null,
    filePath: overrides.filePath || '/tmp/cco-mail-ingestion.json',
    _isLoaded() {
      return this.loaded;
    },
    async _load() {
      record('_load', {});
      if (overrides.loadError) throw new Error(overrides.loadError);
      this.loaded = true;
      this.deferred = false;
    },
    buildDashboardSummary({ mailboxEmail } = {}) {
      record('buildDashboardSummary', { mailboxEmail });
      return state.dashboard;
    },
    listNeedsReview({ mailboxEmail, limit } = {}) {
      record('listNeedsReview', { mailboxEmail, limit });
      return state.needsReview;
    },
    listReviewQueue({ mailboxEmail, statuses, limit } = {}) {
      record('listReviewQueue', { mailboxEmail, statuses, limit });
      return state.reviewQueue;
    },
    async linkPatientToMessage({ rawMessageId, patientId, actorUserId }) {
      record('linkPatientToMessage', { rawMessageId, patientId, actorUserId });
      return { rawMessageId, patientId, linked: true };
    },
    async requestReprocessUnmatched({ mailboxEmail, includeOldMatchVersion }) {
      record('requestReprocessUnmatched', { mailboxEmail, includeOldMatchVersion });
      return { requeued: 2 };
    },
    async resetMailboxLocalState({ mailboxEmail, hardResetRaw, actorUserId }) {
      record('resetMailboxLocalState', { mailboxEmail, hardResetRaw, actorUserId });
      return { reset: true };
    },
  };
}

function createMockIngestionWorker() {
  const calls = [];
  function record(name, args) {
    calls.push({ method: name, args });
  }
  return {
    _calls: calls,
    listJobs() {
      record('listJobs', {});
      return [];
    },
    enqueueImportJob({ mailboxEmail, mode, trigger, createdBy, skipDelta }) {
      record('enqueueImportJob', { mailboxEmail, mode, trigger, createdBy, skipDelta });
      return { id: 'job-import-1' };
    },
    runProcessBatch({ mailboxEmail, mode, maxMessages }) {
      record('runProcessBatch', { mailboxEmail, mode, maxMessages });
      return { processed: 5 };
    },
    enqueueProcessDrain({ mailboxEmail, mode, maxBatches }) {
      record('enqueueProcessDrain', { mailboxEmail, mode, maxBatches });
      return { id: 'job-drain-1' };
    },
    ensureQueueIntegrity({ mailboxEmail }) {
      record('ensureQueueIntegrity', { mailboxEmail });
    },
    enqueueBackfillJob({ mailboxEmail, maxBatches, createdBy }) {
      record('enqueueBackfillJob', { mailboxEmail, maxBatches, createdBy });
      return { id: 'job-backfill-1' };
    },
  };
}

function createMockSyncService() {
  const calls = [];
  return {
    _calls: calls,
    async runMailboxImport({ mailboxEmail, mode, trigger, createdBy, skipDelta }) {
      calls.push({
        method: 'runMailboxImport',
        args: { mailboxEmail, mode, trigger, createdBy, skipDelta },
      });
      return { imported: 7 };
    },
  };
}

function createMockGraphNotifications() {
  const calls = [];
  return {
    _calls: calls,
    isWebhookReady() {
      return true;
    },
    buildWebhookUrl(config) {
      return `${config.publicBaseUrl}/api/v1/cco/mail-ingestion/graph/webhook`;
    },
    listSubscriptions() {
      return [];
    },
    async handleValidationRequest(token) {
      calls.push({ method: 'handleValidationRequest', args: { token } });
      return token;
    },
    async handleNotifications(body) {
      calls.push({ method: 'handleNotifications', args: { body } });
      return { handled: 1 };
    },
    async ensureInboxSubscriptions({ mailboxEmails }) {
      calls.push({ method: 'ensureInboxSubscriptions', args: { mailboxEmails } });
      return { results: [{ subscription: { id: 'sub-1' } }] };
    },
  };
}

function createMockPatientMasterStore() {
  return {
    async listPatients() {
      return { patients: [] };
    },
  };
}

function createConfig(overrides = {}) {
  return {
    defaultTenantId: 'hair-tp-clinic',
    publicBaseUrl: 'http://localhost:3000',
    ccoMailIngestionEnabled: true,
    ccoMailIngestionMode: 'read_only',
    graphChangeNotificationsEnabled: true,
    ...overrides,
  };
}

function createRouter(config, overrides = {}) {
  return createCcoMailIngestionRouter({
    config,
    authStore: overrides.authStore || {
      async getSessionContextByToken() {
        return null;
      },
      async touchSession() {
        return true;
      },
      async addAuditEvent() {},
    },
    requireAuth: passAuth,
    requireRole: passRole,
    ingestionStore: overrides.ingestionStore || createMockIngestionStore(),
    syncService: overrides.syncService || createMockSyncService(),
    ingestionWorker: overrides.ingestionWorker || createMockIngestionWorker(),
    graphNotifications: overrides.graphNotifications || createMockGraphNotifications(),
    patientMasterStore: overrides.patientMasterStore || createMockPatientMasterStore(),
    mailboxAllowlist: ['kons@hairtpclinic.com'],
    logger: null,
  });
}

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('status endpoint returns dashboard, config flags and store activation status', async () => {
  const ingestionStore = createMockIngestionStore();
  const app = express();
  app.use('/api/v1', createRouter(createConfig(), { ingestionStore }));

  await withServer(app, async (baseUrl) => {
    const res = await fetch(
      `${baseUrl}/cco/mail-ingestion/status?mailboxEmail=kons@hairtpclinic.com`
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.enabled, true);
    assert.equal(body.mode, 'read_only');
    assert.equal(body.webhookEnabled, true);
    assert.equal(body.webhookReady, true);
    assert.ok(body.allowlistedMailboxes.includes('kons@hairtpclinic.com'));
    assert.equal(body.dashboard.counts.rawMessages, 10);
    assert.ok(body.store);
    assert.equal(body.store.loaded, true);
    assert.equal(body.store.deferred, false);
    assert.equal(ingestionStore._calls[0].method, 'buildDashboardSummary');
  });
});

test('activate endpoint loads deferred store and writes audit', async () => {
  const ingestionStore = createMockIngestionStore({ deferred: true, loaded: false });
  const auditEvents = [];
  const authStore = {
    async getSessionContextByToken() {
      return null;
    },
    async touchSession() {
      return true;
    },
    async addAuditEvent(event) {
      auditEvents.push(event);
    },
  };
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createRouter(createConfig(), { ingestionStore, authStore }));

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco/mail-ingestion/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ownerAck: true }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.activated, true);
    assert.equal(body.store.loaded, true);
    assert.equal(body.store.deferred, false);
    const loadCall = ingestionStore._calls.find((c) => c.method === '_load');
    assert.ok(loadCall);
    assert.equal(auditEvents.length, 2);
    assert.equal(auditEvents[0].action, 'cco.mail.ingestion.owner_ack');
    assert.equal(auditEvents[1].action, 'cco.mail.ingestion.activate');
    assert.equal(auditEvents[1].outcome, 'success');
  });
});

test('activate endpoint returns already active when store is loaded', async () => {
  const ingestionStore = createMockIngestionStore({ deferred: true, loaded: true });
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createRouter(createConfig(), { ingestionStore }));

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco/mail-ingestion/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ownerAck: true }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.activated, true);
    assert.ok(body.message.includes('redan'));
    const loadCall = ingestionStore._calls.find((c) => c.method === '_load');
    assert.equal(loadCall, undefined);
  });
});

test('activate endpoint returns 503 when mail ingestion is disabled in config', async () => {
  const ingestionStore = createMockIngestionStore({ deferred: true, loaded: false });
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createRouter(createConfig({ ccoMailIngestionEnabled: false }), { ingestionStore })
  );

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco/mail-ingestion/activate`, { method: 'POST' });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('inte aktiverat'));
  });
});

test('activate endpoint returns 409 when ownerAck is missing', async () => {
  const ingestionStore = createMockIngestionStore({ deferred: true, loaded: false });
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createRouter(createConfig(), { ingestionStore }));

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco/mail-ingestion/activate`, { method: 'POST' });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.metadata.ownerAckRequired, true);
  });
});

test('review-queue summary returns unmatched groups', async () => {
  const ingestionStore = createMockIngestionStore();
  const app = express();
  app.use('/api/v1', createRouter(createConfig(), { ingestionStore }));

  await withServer(app, async (baseUrl) => {
    const res = await fetch(
      `${baseUrl}/cco/mail-ingestion/review-queue/summary?mailboxEmail=kons@hairtpclinic.com`
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.totalUnmatched, 1);
    assert.equal(body.uniqueCounterparties, 1);
    assert.equal(ingestionStore._calls[0].method, 'listReviewQueue');
    assert.deepEqual(ingestionStore._calls[0].args.statuses, ['UNMATCHED']);
  });
});

test('review-queue endpoint filters by status', async () => {
  const ingestionStore = createMockIngestionStore();
  const app = express();
  app.use('/api/v1', createRouter(createConfig(), { ingestionStore }));

  await withServer(app, async (baseUrl) => {
    const res = await fetch(
      `${baseUrl}/cco/mail-ingestion/review-queue?mailboxEmail=kons@hairtpclinic.com&status=unmatched&limit=10`
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.status, 'unmatched');
    assert.equal(body.count, 1);
    assert.equal(ingestionStore._calls[0].method, 'listReviewQueue');
    assert.deepEqual(ingestionStore._calls[0].args.statuses, ['UNMATCHED']);
    assert.equal(ingestionStore._calls[0].args.limit, 10);
  });
});

test('link-patient endpoint requires rawMessageId and patientId', async () => {
  const ingestionStore = createMockIngestionStore();
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createRouter(createConfig(), { ingestionStore }));

  await withServer(app, async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/cco/mail-ingestion/link-patient`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rawMessageId: 'raw-1' }),
    });
    assert.equal(missing.status, 400);

    const ok = await fetch(`${baseUrl}/cco/mail-ingestion/link-patient`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rawMessageId: 'raw-1', patientId: 'pat-1' }),
    });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.ok, true);
    assert.equal(body.result.linked, true);
    const call = ingestionStore._calls.find((c) => c.method === 'linkPatientToMessage');
    assert.ok(call);
    assert.equal(call.args.rawMessageId, 'raw-1');
    assert.equal(call.args.patientId, 'pat-1');
  });
});

test('sync endpoint enqueues async job for allowlisted mailbox', async () => {
  const ingestionWorker = createMockIngestionWorker();
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createRouter(createConfig(), { ingestionWorker }));

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco/mail-ingestion/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mailboxEmail: 'kons@hairtpclinic.com', async: true, ownerAck: true }),
    });
    assert.equal(res.status, 202);
    const body = await res.json();
    assert.equal(body.accepted, true);
    assert.equal(body.jobId, 'job-import-1');
    const call = ingestionWorker._calls.find((c) => c.method === 'enqueueImportJob');
    assert.ok(call);
    assert.equal(call.args.mailboxEmail, 'kons@hairtpclinic.com');
  });
});

test('sync endpoint blocks non-allowlisted mailbox', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createRouter(createConfig()));

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco/mail-ingestion/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mailboxEmail: 'other@example.com' }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.ok(body.error.includes('inte allowlistad'));
  });
});

test('sync endpoint runs sync when async is false', async () => {
  const syncService = createMockSyncService();
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createRouter(createConfig(), { syncService }));

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco/mail-ingestion/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mailboxEmail: 'kons@hairtpclinic.com', async: false, ownerAck: true }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.result.imported, 7);
    assert.equal(syncService._calls[0].method, 'runMailboxImport');
  });
});

test('process endpoint runs batch via worker', async () => {
  const ingestionWorker = createMockIngestionWorker();
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createRouter(createConfig(), { ingestionWorker }));

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco/mail-ingestion/process`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mailboxEmail: 'kons@hairtpclinic.com',
        maxMessages: 25,
        ownerAck: true,
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.result.processed, 5);
    const call = ingestionWorker._calls.find((c) => c.method === 'runProcessBatch');
    assert.ok(call);
    assert.equal(call.args.maxMessages, 25);
  });
});

test('process-all endpoint enqueues drain job', async () => {
  const ingestionWorker = createMockIngestionWorker();
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createRouter(createConfig(), { ingestionWorker }));

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco/mail-ingestion/process-all`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mailboxEmail: 'kons@hairtpclinic.com',
        maxBatches: 100,
        ownerAck: true,
      }),
    });
    assert.equal(res.status, 202);
    const body = await res.json();
    assert.equal(body.accepted, true);
    const call = ingestionWorker._calls.find((c) => c.method === 'enqueueProcessDrain');
    assert.ok(call);
    assert.equal(call.args.maxBatches, 100);
  });
});

test('backfill endpoint enqueues backfill job for allowlisted mailbox', async () => {
  const ingestionWorker = createMockIngestionWorker();
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createRouter(createConfig(), { ingestionWorker }));

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco/mail-ingestion/backfill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mailboxEmail: 'kons@hairtpclinic.com',
        maxBatches: 50,
        ownerAck: true,
      }),
    });
    assert.equal(res.status, 202);
    const body = await res.json();
    assert.equal(body.accepted, true);
    assert.equal(body.mode, 'read_only');
    const call = ingestionWorker._calls.find((c) => c.method === 'enqueueBackfillJob');
    assert.ok(call);
    assert.equal(call.args.maxBatches, 50);
  });
});

test('reprocess-unmatched endpoint triggers requeue and drain', async () => {
  const ingestionStore = createMockIngestionStore();
  const ingestionWorker = createMockIngestionWorker();
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createRouter(createConfig(), { ingestionStore, ingestionWorker }));

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco/mail-ingestion/reprocess-unmatched`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mailboxEmail: 'kons@hairtpclinic.com', ownerAck: true }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.requeued, 2);
    const reprocessCall = ingestionStore._calls.find(
      (c) => c.method === 'requestReprocessUnmatched'
    );
    assert.ok(reprocessCall);
    assert.equal(reprocessCall.args.includeOldMatchVersion, true);
    const drainCall = ingestionWorker._calls.find((c) => c.method === 'enqueueProcessDrain');
    assert.ok(drainCall);
  });
});

test('reset endpoint requires mailboxEmail', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createRouter(createConfig()));

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco/mail-ingestion/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });
});

test('subscriptions/ensure endpoint ensures inbox subscriptions', async () => {
  const graphNotifications = createMockGraphNotifications();
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createRouter(createConfig(), { graphNotifications }));

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco/mail-ingestion/subscriptions/ensure`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mailboxIds: ['kons@hairtpclinic.com'] }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    const call = graphNotifications._calls.find((c) => c.method === 'ensureInboxSubscriptions');
    assert.ok(call);
    assert.deepEqual(call.args.mailboxEmails, ['kons@hairtpclinic.com']);
  });
});

test('graph webhook returns validation token', async () => {
  const graphNotifications = createMockGraphNotifications();
  const app = express();
  app.use('/api/v1', createRouter(createConfig(), { graphNotifications }));

  await withServer(app, async (baseUrl) => {
    const res = await fetch(
      `${baseUrl}/cco/mail-ingestion/graph/webhook?validationToken=hello-world`
    );
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.equal(text, 'hello-world');
    const call = graphNotifications._calls.find((c) => c.method === 'handleValidationRequest');
    assert.ok(call);
    assert.equal(call.args.token, 'hello-world');
  });
});

test('graph webhook handles notifications', async () => {
  const graphNotifications = createMockGraphNotifications();
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createRouter(createConfig(), { graphNotifications }));

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco/mail-ingestion/graph/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: [{ changeType: 'created' }] }),
    });
    assert.equal(res.status, 202);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.handled, 1);
  });
});

test('dashboard readout returns html', async () => {
  const ingestionStore = createMockIngestionStore();
  const app = express();
  app.use('/api/v1', createRouter(createConfig(), { ingestionStore }));

  await withServer(app, async (baseUrl) => {
    const res = await fetch(
      `${baseUrl}/cco/mail-ingestion/dashboard/readout?mailboxEmail=kons@hairtpclinic.com`
    );
    assert.equal(res.status, 200);
    const contentType = res.headers.get('content-type');
    assert.ok(contentType.includes('text/html'));
    const text = await res.text();
    assert.ok(text.includes('CCO Mail Ingestion Dashboard'));
    assert.ok(text.includes('Raw messages: 10'));
  });
});
