'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const express = require('express');

const { createCcoCustomerCommRouter } = require('../../src/routes/ccoCustomerComm');

function makeAuth(role = 'operator') {
  return (req, _res, next) => {
    req.auth = { tenantId: 'hairtpclinic', userId: 'u1', role };
    next();
  };
}

function makeTruthStore(messages = []) {
  return {
    listLoadedMailboxes() {
      return [...new Set(messages.map((m) => m.mailboxId).filter(Boolean))];
    },
    listMessages({ mailboxIds = [], limit = 0 } = {}) {
      let rows = messages;
      if (mailboxIds.length > 0) {
        rows = rows.filter((m) => mailboxIds.includes(m.mailboxId));
      }
      return limit > 0 ? rows.slice(0, limit) : rows;
    },
  };
}

function makeIngestionStore(messages = []) {
  return {
    listPatientMessages({ patientId, limit = 100 } = {}) {
      const rows = messages.filter((m) => m.patientId === patientId);
      return limit > 0 ? rows.slice(0, limit) : rows;
    },
  };
}

async function withServer(router, run) {
  const app = express();
  app.use('/api/v1', router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET /cco-customers/:id/conversation-threads surfaces mailboxTruthStore messages', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-comm-route-'));
  const customerId = 'cust-route-1';

  const router = createCcoCustomerCommRouter({
    config: {
      ccoConversationThreadStateStorePath: path.join(tmp, 'thread-state.json'),
    },
    requireAuth: makeAuth(),
    mailboxTruthStore: makeTruthStore([
      {
        mailboxId: 'contact@hairtpclinic.com',
        graphMessageId: 'g-route-1',
        conversationId: 'conv-route-1',
        folderType: 'inbox',
        direction: 'inbound',
        subject: 'Fråga från patient',
        bodyPreview: 'Hej, jag undrar om behandlingen',
        fromEmail: 'patient@example.com',
        receivedAt: '2026-07-01T09:00:00.000Z',
        customerIdentity: { customerId, canonicalCustomerId: customerId },
      },
    ]),
    mailIngestionStore: makeIngestionStore([]),
  });

  await withServer(router, async (baseUrl) => {
    const res = await fetch(
      `${baseUrl}/cco-customers/${encodeURIComponent(customerId)}/conversation-threads`
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.threads), 'threads must be array');
    const mailRows = body.threads.filter((t) => t.kind === 'incoming_mail');
    assert.equal(mailRows.length, 1, 'one truth-store mail thread must appear');
    assert.equal(mailRows[0].sourceLayer, 'mailbox_truth');
    assert.equal(mailRows[0].conversationId, 'conv-route-1');
    assert.equal(mailRows[0].subject, 'Fråga från patient');
    assert.ok(typeof body.counts === 'object', 'counts must be present');
    assert.ok('all' in body.counts, 'counts.all must exist');
  });
});

test('GET /cco-customers/:id/conversation-threads returns empty threads for unknown customer', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-comm-route-'));

  const router = createCcoCustomerCommRouter({
    config: {
      ccoConversationThreadStateStorePath: path.join(tmp, 'thread-state.json'),
    },
    requireAuth: makeAuth(),
    mailboxTruthStore: makeTruthStore([]),
    mailIngestionStore: makeIngestionStore([]),
  });

  await withServer(router, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-customers/no-such-customer/conversation-threads`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.threads));
    assert.equal(body.threads.length, 0);
  });
});

// ── C6: unified-timeline surfaces assets through the route with safety filter ──

function makeAssetStore(assets = []) {
  return {
    listAssetsForPatient(_patientId, _filters, _opts) {
      return assets;
    },
  };
}

test('C6 route: GET /cco-customers/:id/unified-timeline surfaces only VISIBLE assets, filters NEEDS_REVIEW', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-comm-route-'));
  const customerId = 'cust-timeline-1';

  const router = createCcoCustomerCommRouter({
    config: {
      ccoConversationThreadStateStorePath: path.join(tmp, 'thread-state.json'),
      ccoCustomerJourneyStorePath: path.join(tmp, 'journey.json'),
    },
    requireAuth: makeAuth(),
    mailboxTruthStore: makeTruthStore([
      {
        mailboxId: 'contact@hairtpclinic.com',
        graphMessageId: 'g-tl-1',
        conversationId: 'conv-tl-1',
        folderType: 'inbox',
        direction: 'inbound',
        subject: 'Tidslinjefråga',
        bodyPreview: 'Hej',
        fromEmail: 'patient@example.com',
        receivedAt: '2026-06-01T09:00:00.000Z',
        customerIdentity: { customerId, canonicalCustomerId: customerId },
      },
    ]),
    mailIngestionStore: makeIngestionStore([]),
    resolvePatientAssetStore: async () =>
      makeAssetStore([
        {
          id: 'visible-doc',
          patientId: customerId,
          status: 'VISIBLE_ON_PATIENT_CARD',
          category: 'document_medical',
          documentDate: '2026-05-20T10:00:00.000Z',
        },
        {
          id: 'hidden-review',
          patientId: customerId,
          status: 'NEEDS_REVIEW',
          category: 'document_medical',
          documentDate: '2026-05-21T10:00:00.000Z',
        },
      ]),
  });

  await withServer(router, async (baseUrl) => {
    const res = await fetch(
      `${baseUrl}/cco-customers/${encodeURIComponent(customerId)}/unified-timeline`
    );
    assert.equal(res.status, 200);
    const body = await res.json();

    const assetEvents = (body.events || []).filter((e) => e.source === 'asset');
    assert.equal(assetEvents.length, 1, 'only VISIBLE_ON_PATIENT_CARD asset surfaces');
    assert.equal(assetEvents[0].meta.assetId, 'visible-doc');
    assert.deepEqual(assetEvents[0].meta.openRef, {
      kind: 'patient_asset',
      assetId: 'visible-doc',
    });

    const mail = (body.events || []).find((e) => e.kind === 'incoming_mail');
    assert.ok(mail, 'mail event present');
    assert.equal(mail.meta.conversationKey, 'conv-tl-1');

    // Ingen direkt Drive-länk i hela payloaden.
    assert.ok(!/drive\.google\.com/i.test(JSON.stringify(body)), 'no direct Drive link');
  });
});

test('C6 route: unified-timeline for empty customer returns safe empty state', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-comm-route-'));

  const router = createCcoCustomerCommRouter({
    config: {
      ccoConversationThreadStateStorePath: path.join(tmp, 'thread-state.json'),
      ccoCustomerJourneyStorePath: path.join(tmp, 'journey.json'),
    },
    requireAuth: makeAuth(),
    mailboxTruthStore: makeTruthStore([]),
    mailIngestionStore: makeIngestionStore([]),
    resolvePatientAssetStore: async () => makeAssetStore([]),
  });

  await withServer(router, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-customers/empty-cust/unified-timeline`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.events, []);
    assert.equal(body.counts.all, 0);
  });
});
