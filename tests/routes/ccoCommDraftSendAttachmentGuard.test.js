'use strict';

/* B1 — /send avvisar utkast MED bilagor (422) före queue/send när adaptern inte
 * stödjer bilagor. Utkastet lämnas orört (ingen transition), adaptern anropas
 * aldrig. Text-only live-send tills B2 ger connectorn bilage-stöd. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoCommDraftRouter } = require('../../src/routes/ccoCommDraft');
const {
  createCcoRecipientAllowlistStore,
} = require('../../src/ops/ccoRecipientAllowlistStore');

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

function withSendEnv(vars, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return (async () => {
    try {
      return await fn();
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  })();
}

test('approved-utkast med bilagor → 422 attachments_not_supported, adaptern orörd, ingen transition', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-attguard-'));
  const allowlist = await createCcoRecipientAllowlistStore({
    filePath: path.join(tempDir, 'cco-recipient-allowlist.json'),
  });
  await allowlist.addRecipient('hairtpclinic', 'anna@mail.se', { actor: { userId: 'u1' } });

  const adapterCalls = [];
  const adapter = {
    supportsAttachments: false,
    sendMail: async (p) => {
      adapterCalls.push(p);
      return { messageId: null };
    },
  };

  const transitions = [];
  const fakeStore = {
    getDraft: (id) => ({
      draftId: id,
      tenantId: 'hairtpclinic',
      status: 'approved',
      subject: 'Hej',
      body: 'Text',
      channel: 'email',
      attachments: [{ name: 'preop.pdf', contentType: 'application/pdf', size: 12 }],
    }),
    transitionStatus: async (id, status) => {
      transitions.push(status);
      return { draftId: id, status };
    },
  };

  const app = express();
  app.use(
    '/api/v1',
    createCcoCommDraftRouter({
      config: { stateRoot: tempDir },
      requireAuth: (req, _res, next) => {
        req.auth = { tenantId: 'hairtpclinic', userId: 'owner-1', role: 'owner' };
        next();
      },
      commDraftStore: fakeStore,
      recipientAllowlistStore: allowlist,
      graphSendAdapter: adapter,
    })
  );

  await withSendEnv(
    { ARCANA_GRAPH_SEND_ENABLED: 'true', ARCANA_GRAPH_SEND_ALLOWLIST: 'kons@hairtp.se' },
    () =>
      withServer(app, async (baseUrl) => {
        const res = await fetch(`${baseUrl}/cco-comm/drafts/d1/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-role': 'owner' },
          body: JSON.stringify({ to: 'anna@mail.se', senderMailbox: 'kons@hairtp.se' }),
        }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
        assert.equal(res.status, 422);
        assert.equal(res.json.reason, 'attachments_not_supported');
        assert.equal(adapterCalls.length, 0, 'adaptern får inte anropas');
        assert.equal(transitions.length, 0, 'utkastet får inte transitioneras (lämnas approved)');
      })
  );
});
