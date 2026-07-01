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
