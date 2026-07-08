'use strict';

/* Patient-notis vid klinik-svar (följdsteg). Skickar en transaktionell notis
 * med den magiska länken via ccoSendActionStore (dry-run/mock som default).
 * Skickar aldrig live utan CCO_SEND_LIVE; intent registreras ändå. */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const {
  notifyPatientOfPortalReply,
  isPortalNotifyLive,
} = require('../../src/ops/ccoPortalReplyNotification');
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

// ── Finkornig grind: CCO_PORTAL_NOTIFY_LIVE / forceLive ──────────────────────

test('isPortalNotifyLive tolkar env-flaggan', () => {
  const prev = process.env.CCO_PORTAL_NOTIFY_LIVE;
  try {
    for (const v of ['1', 'true', 'YES', 'True']) {
      process.env.CCO_PORTAL_NOTIFY_LIVE = v;
      assert.equal(isPortalNotifyLive(), true, `"${v}" ska vara live`);
    }
    for (const v of ['', '0', 'false', 'no']) {
      process.env.CCO_PORTAL_NOTIFY_LIVE = v;
      assert.equal(isPortalNotifyLive(), false, `"${v}" ska vara av`);
    }
  } finally {
    if (prev === undefined) delete process.env.CCO_PORTAL_NOTIFY_LIVE;
    else process.env.CCO_PORTAL_NOTIFY_LIVE = prev;
  }
});

test('forceLive:true → performSend får dryRunOverride:false (portal-notis skarp)', async () => {
  const accessStore = await createCcoPortalAccessStore({ filePath: tmp() });
  const sendStore = fakeSendStore();
  await notifyPatientOfPortalReply(
    { customerId: 'CUST-1', patientEmail: 'a@b.se', forceLive: true },
    { accessStore, sendStore }
  );
  assert.equal(sendStore.sends[0].dryRunOverride, false);
});

test('forceLive default → dryRunOverride:null (följer globala CCO_SEND_LIVE)', async () => {
  const accessStore = await createCcoPortalAccessStore({ filePath: tmp() });
  const sendStore = fakeSendStore();
  await notifyPatientOfPortalReply(
    { customerId: 'CUST-1', patientEmail: 'a@b.se' },
    { accessStore, sendStore }
  );
  assert.equal(sendStore.sends[0].dryRunOverride, null);
});

test('CCO_PORTAL_NOTIFY_LIVE=1 skickar portal-notisen skarpt (mock utan mailer, ej dry-run)', async () => {
  const prev = process.env.CCO_PORTAL_NOTIFY_LIVE;
  const prevGlobal = process.env.CCO_SEND_LIVE;
  process.env.CCO_PORTAL_NOTIFY_LIVE = '1';
  delete process.env.CCO_SEND_LIVE; // global grind AV → bevisar isolering
  try {
    const { createCcoSendActionStore } = require('../../src/ops/ccoSendActionStore');
    const store = await createCcoSendActionStore({
      filePath: path.join(os.tmpdir(), `send-live-${Date.now()}.json`),
    });
    const accessStore = await createCcoPortalAccessStore({ filePath: tmp() });
    const res = await notifyPatientOfPortalReply(
      { customerId: 'CUST-9', patientEmail: 'live@b.se', baseUrl: 'https://p.ex' },
      { accessStore, sendStore: store }
    );
    assert.equal(res.status, 'sent');
    assert.equal(res.dryRun, false); // inte dry-run: grinden öppnade just portal-notisen
  } finally {
    if (prev === undefined) delete process.env.CCO_PORTAL_NOTIFY_LIVE;
    else process.env.CCO_PORTAL_NOTIFY_LIVE = prev;
    if (prevGlobal !== undefined) process.env.CCO_SEND_LIVE = prevGlobal;
  }
});
