'use strict';

/* Patient-notis vid klinik-svar (följdsteg). Skickar en transaktionell notis
 * med den magiska länken via ccoSendActionStore (dry-run/mock som default).
 * Skickar aldrig live utan CCO_SEND_LIVE; intent registreras ändå. */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { notifyPatientOfPortalReply } = require('../../src/ops/ccoPortalReplyNotification');
const { createCcoPortalAccessStore } = require('../../src/ops/ccoPortalAccessStore');

function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reply-notif-'));
  return path.join(dir, 'a.json');
}

function fakeSendStore() {
  const sends = [];
  return {
    sends,
    async performSend(input) {
      sends.push(input);
      return { ok: true, mode: 'dry-run' };
    },
  };
}

test('notifierar patienten: mint länk + transaktionell notis (dry-run default)', async () => {
  const accessStore = await createCcoPortalAccessStore({ filePath: tmp() });
  const sendStore = fakeSendStore();
  const res = await notifyPatientOfPortalReply(
    {
      tenantId: 'hairtpclinic',
      customerId: 'CUST-1',
      patientEmail: 'anna@mail.se',
      patientName: 'Anna',
      baseUrl: 'https://p.ex',
    },
    { accessStore, sendStore }
  );
  assert.equal(res.status, 'sent');
  assert.equal(res.dryRun, true);
  assert.match(res.url, /^https:\/\/p\.ex\/portal-chat\//);
  // Rätt payload gick till send-storen.
  assert.equal(sendStore.sends.length, 1);
  assert.equal(sendStore.sends[0].kind, 'notification');
  assert.equal(sendStore.sends[0].payload.to, 'anna@mail.se');
  assert.match(sendStore.sends[0].payload.text, /portal-chat\//);
});

test('utan e-post → skipped no_email (skickar inget)', async () => {
  const accessStore = await createCcoPortalAccessStore({ filePath: tmp() });
  const sendStore = fakeSendStore();
  const res = await notifyPatientOfPortalReply(
    { tenantId: 'hairtpclinic', customerId: 'CUST-1' },
    { accessStore, sendStore }
  );
  assert.equal(res.status, 'skipped');
  assert.equal(res.reason, 'no_email');
  assert.equal(sendStore.sends.length, 0);
});

test('saknade stores → skipped, ingen krasch', async () => {
  const res = await notifyPatientOfPortalReply(
    { customerId: 'CUST-1', patientEmail: 'x@y.se' },
    {}
  );
  assert.equal(res.status, 'skipped');
  assert.equal(res.reason, 'stores_unavailable');
});

test("ccoSendActionStore accepterar 'notification' som send-kind", async () => {
  // Verifierar att SEND_KINDS utökats (annars kastar performSend badRequest).
  const { createCcoSendActionStore } = require('../../src/ops/ccoSendActionStore');
  const store = await createCcoSendActionStore({
    filePath: path.join(os.tmpdir(), `send-${Date.now()}.json`),
  });
  const accessStore = await createCcoPortalAccessStore({ filePath: tmp() });
  const res = await notifyPatientOfPortalReply(
    { customerId: 'CUST-2', patientEmail: 'z@y.se', baseUrl: 'https://p.ex' },
    { accessStore, sendStore: store }
  );
  assert.notEqual(res.status, 'failed');
});
