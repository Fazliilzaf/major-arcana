'use strict';

/* Compose-send-routern (följdsteg). Owner-only (mail.live_send). Grind via env
 * CCO_COMPOSE_SEND_LIVE. Funktionellt mot express + riktiga stores. */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { createCcoComposeSendRouter } = require('../../src/routes/ccoComposeSend');
const { createCcoCommDraftStore } = require('../../src/ops/ccoCommDraftStore');

function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-send-route-'));
  return path.join(dir, 'd.json');
}

async function buildApp({
  channel = 'resend',
  graphSendAdapter = null,
  postSendMailboxSync = null,
} = {}) {
  const app = express();
  app.use(
    '/api/v1',
    createCcoComposeSendRouter({
      requireAuth: (rq, _r, n) => {
        rq.auth = { tenantId: 'hair-tp-clinic', userId: 'owner-1' };
        n();
      },
      graphSendAdapter,
      postSendMailboxSync,
    })
  );
  const draftStore = await createCcoCommDraftStore({ filePath: tmp() });
  const draft = await draftStore.createDraft(
    {
      tenantId: 'hair-tp-clinic',
      customerId: 'CUST-1',
      channel: 'email',
      subject: 'Hej',
      body: 'Text',
      mergeFields: { sendChannel: channel },
    },
    { actor: { userId: 'operator-1' } }
  );
  await draftStore.transitionStatus(draft.draftId, 'needs_approval', {
    actor: { userId: 'operator-1' },
    tenantId: 'hair-tp-clinic',
  });
  app.locals.ccoCommDraftStore = draftStore;
  app.locals.ccoPatientMasterStore = {
    getPatient: async () => ({ id: 'CUST-1', primaryEmail: 'to@example.com' }),
  };
  app.locals.ccoSendActionStore = { performSend: async () => ({ ok: true, mode: 'mock' }) };
  return { app, draftId: draft.draftId, draftStore };
}

function req(app, method, p, { headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const r = http.request({ port, path: p, method, headers }, (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode, body: b });
        });
      });
      r.on('error', (e) => {
        server.close();
        reject(e);
      });
      r.end();
    });
  });
}

// ORD-153 §6 (647efca1) la till en ANDRA grind i deliverComposeDraft: efter
// CCO_COMPOSE_SEND_LIVE kollas även den globala CCO_SEND_LIVE, så att samma
// utkast inte kan gå live via graph-kanalen medan exportfrysen gäller. Testerna
// här satte bara den första flaggan och har varit röda sedan dess — de kodade
// ett kontrakt som inte längre finns. Båda flaggorna krävs för "grind PÅ".
function withSendGates(run) {
  return async () => {
    const prev = {
      compose: process.env.CCO_COMPOSE_SEND_LIVE,
      global: process.env.CCO_SEND_LIVE,
    };
    process.env.CCO_COMPOSE_SEND_LIVE = '1';
    process.env.CCO_SEND_LIVE = '1';
    try {
      await run();
    } finally {
      if (prev.compose === undefined) delete process.env.CCO_COMPOSE_SEND_LIVE;
      else process.env.CCO_COMPOSE_SEND_LIVE = prev.compose;
      if (prev.global === undefined) delete process.env.CCO_SEND_LIVE;
      else process.env.CCO_SEND_LIVE = prev.global;
    }
  };
}

test(
  'owner + båda grindarna PÅ → 200 sent',
  withSendGates(async () => {
    const { app, draftId, draftStore } = await buildApp();
    const res = await req(app, 'POST', `/api/v1/cco/runtime/compose-new-mail/${draftId}/send`, {
      headers: { 'x-cco-role': 'owner' },
    });
    assert.equal(res.status, 200);
    assert.equal(JSON.parse(res.body).status, 'sent');
    assert.equal(draftStore.getDraft(draftId).status, 'sent');
  })
);

// Regeln ORD-153 §6 införde, otestad på routenivå tills nu: compose-grinden
// ensam räcker INTE. Utan den här skulle någon kunna ta bort den globala
// kollen i deliverComposeDraft och allt förblev grönt.
test('owner + compose-grind PÅ men global grind AV → skipped (send_gate_off)', async () => {
  const prev = {
    compose: process.env.CCO_COMPOSE_SEND_LIVE,
    global: process.env.CCO_SEND_LIVE,
  };
  process.env.CCO_COMPOSE_SEND_LIVE = '1';
  delete process.env.CCO_SEND_LIVE;
  try {
    const { app, draftId, draftStore } = await buildApp();
    const res = await req(app, 'POST', `/api/v1/cco/runtime/compose-new-mail/${draftId}/send`, {
      headers: { 'x-cco-role': 'owner' },
    });
    assert.equal(res.status, 200);
    const payload = JSON.parse(res.body);
    assert.equal(payload.status, 'skipped');
    assert.equal(payload.reason, 'send_gate_off');
    // Utkastet ska vara orört — en grindad väg får inte konsumera det.
    assert.notEqual(draftStore.getDraft(draftId).status, 'sent');
  } finally {
    if (prev.compose === undefined) delete process.env.CCO_COMPOSE_SEND_LIVE;
    else process.env.CCO_COMPOSE_SEND_LIVE = prev.compose;
    if (prev.global === undefined) delete process.env.CCO_SEND_LIVE;
    else process.env.CCO_SEND_LIVE = prev.global;
  }
});

test(
  'owner + Graph-kanal → schemalägger post-send mailbox-sync',
  withSendGates(async () => {
    const syncCalls = [];
    const { app, draftId } = await buildApp({
      channel: 'graph',
      graphSendAdapter: { sendMail: async () => ({ ok: true, messageId: 'graph-1' }) },
      postSendMailboxSync: (payload) => syncCalls.push(payload),
    });
    const res = await req(app, 'POST', `/api/v1/cco/runtime/compose-new-mail/${draftId}/send`, {
      headers: { 'x-cco-role': 'owner' },
    });
    assert.equal(res.status, 200);
    const payload = JSON.parse(res.body);
    assert.equal(payload.status, 'sent');
    assert.equal(payload.channel, 'graph');
    assert.deepEqual(syncCalls, [
      {
        mailboxId: 'kons@hairtpclinic.com',
        source: 'cco_compose_sent',
        draftId,
      },
    ]);
  })
);

test('owner + grind AV → 200 skipped (compose_gate_off), utkastet orört', async () => {
  const prev = process.env.CCO_COMPOSE_SEND_LIVE;
  delete process.env.CCO_COMPOSE_SEND_LIVE;
  try {
    const { app, draftId, draftStore } = await buildApp();
    const res = await req(app, 'POST', `/api/v1/cco/runtime/compose-new-mail/${draftId}/send`, {
      headers: { 'x-cco-role': 'owner' },
    });
    assert.equal(res.status, 200);
    assert.equal(JSON.parse(res.body).reason, 'compose_gate_off');
    assert.equal(draftStore.getDraft(draftId).status, 'needs_approval');
  } finally {
    if (prev !== undefined) process.env.CCO_COMPOSE_SEND_LIVE = prev;
  }
});

test('operator blockeras (live-send är owner-only)', async () => {
  const { app, draftId } = await buildApp();
  const res = await req(app, 'POST', `/api/v1/cco/runtime/compose-new-mail/${draftId}/send`, {
    headers: { 'x-cco-role': 'operator' },
  });
  assert.equal(res.status, 403);
});

test('utan draft-store → 503', async () => {
  const app = express();
  app.use(
    '/api/v1',
    createCcoComposeSendRouter({
      requireAuth: (rq, _r, n) => {
        rq.auth = { tenantId: 'hair-tp-clinic', userId: 'owner-1' };
        n();
      },
    })
  );
  const res = await req(app, 'POST', '/api/v1/cco/runtime/compose-new-mail/x/send', {
    headers: { 'x-cco-role': 'owner' },
  });
  assert.equal(res.status, 503);
});
