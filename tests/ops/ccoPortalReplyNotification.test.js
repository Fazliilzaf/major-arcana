'use strict';

/* Patient-notis vid klinik-svar (följdsteg). ORD-125: notisen skickas UR EN MALL
 * (portal_reply_notify) bakom den juridiska grinden — inte längre från hårdkodad
 * HTML. Verifiering: fyra fall som räknar mailer-anropen (det bevisar något).
 *
 *   1. mall pending      → inget skickat, TEMPLATE_NOT_LEGALLY_APPROVED
 *   2. mall saknas (404) → inget skickat, {status:'skipped', reason:'template_unavailable'}
 *   3. mall godkänd      → skickat, kroppen kommer ur revisionen
 *   4. variabel saknas   → inget skickat, TEMPLATE_MISSING_VARIABLE
 *
 * MUTATIONSBEVIS (körs manuellt): ta bort 404-fail-closed-kontrollen i
 * notifyPatientOfPortalReply → fall 2 ska bli RÖTT. Se kommentar i fall 2.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

/**
 * ORD-197 §1 — FALL 3 gick rött när kundutskicksspärren lades i performSend.
 *
 * Det var rätt av den. Fallet anropar med `forceLive: true`, som med avsikt
 * går förbi CCO_SEND_LIVE — och just därför är det ett av få ställen där ett
 * skarpt kundutskick faktiskt sker i testsviten. Kundgrinden stoppade det.
 * Att den gjorde det är beviset på att andra lagret ligger under `forceLive`
 * och inte över.
 *
 * Testerna här mäter mallhanteringen — juridisk grind, rendering, variabler —
 * inte spärren. Därför slås den av uttryckligen för den här filen. Spärren har
 * egna test i tests/ops/kundpostenGarInteUtDenHarVagenHeller.test.js.
 */
const KUNDUTSKICK_NYCKEL = 'ARCANA_KUNDUTSKICK_ENABLED';
const kundutskickTidigare = process.env[KUNDUTSKICK_NYCKEL];
process.env[KUNDUTSKICK_NYCKEL] = 'true';
process.on('exit', () => {
  if (kundutskickTidigare === undefined) delete process.env[KUNDUTSKICK_NYCKEL];
  else process.env[KUNDUTSKICK_NYCKEL] = kundutskickTidigare;
});
const {
  notifyPatientOfPortalReply,
  isPortalNotifyLive,
  PORTAL_REPLY_TEMPLATE_REF,
  PORTAL_REPLY_TEMPLATE_LANG,
} = require('../../src/ops/ccoPortalReplyNotification');
const { createCcoPortalAccessStore } = require('../../src/ops/ccoPortalAccessStore');
const { createCcoTemplateRegistry } = require('../../src/ops/ccoTemplateRegistry');
const { createCcoSendActionStore } = require('../../src/ops/ccoSendActionStore');

function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reply-notif-'));
  return path.join(dir, 'a.json');
}

// Mallposten enligt ORD-125 (subject/body ordagrant från dagens hårdkodade notis).
const TEMPLATE = {
  id: 'portal_reply_notify',
  name: 'Portal-notis vid klinik-svar',
  type: 'notification',
  lang: 'sv',
  subject: 'Du har ett nytt svar i din portal',
  body:
    'Hej {{firstName}},\n\n' +
    'Kliniken har svarat dig i din trygga portal.\n\n' +
    '{{portalUrl}}\n\n' +
    'Hair TP Clinic',
};

async function makeRegistry({ withTemplate = true, approve = false } = {}) {
  const reg = await createCcoTemplateRegistry({ filePath: tmp() });
  if (withTemplate) {
    await reg.upsert(TEMPLATE, { role: 'system' });
    if (approve) {
      await reg.setLegalReviewStatus(TEMPLATE.id, 'approved', { role: 'legal', reviewer: 'Test' });
    }
  }
  return reg;
}

// Riktig send-store + stub-mailer som räknar anrop. Skickar skarpt (mailer gås)
// när dryRunOverride:false (forceLive) — det är det som räknar MAILER-anropen.
async function makeSendStore(reg) {
  const stats = { calls: 0, lastMail: null };
  const mailer = {
    async sendEmail(input) {
      stats.calls += 1;
      stats.lastMail = input;
      return { ok: true, mode: 'live', messageId: 'msg-1' };
    },
  };
  const sendStore = await createCcoSendActionStore({
    filePath: tmp(),
    mailer,
    snapshotForSend: reg.snapshotForSend.bind(reg),
  });
  return { sendStore, stats };
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

const baseRef = {
  tenantId: 'hair-tp-clinic',
  customerId: 'CUST-1',
  patientEmail: 'anna@mail.se',
  patientName: 'Anna',
  baseUrl: 'https://p.ex',
};

test('notifierar patienten: mint länk + transaktionell notis (dry-run default)', async () => {
  const accessStore = await createCcoPortalAccessStore({ filePath: tmp() });
  const reg = await makeRegistry({ approve: true });
  const sendStore = fakeSendStore();
  const res = await notifyPatientOfPortalReply(baseRef, {
    accessStore,
    sendStore,
    templateRegistry: reg,
  });
  assert.equal(res.status, 'sent');
  assert.equal(res.dryRun, true);
  assert.match(res.url, /^https:\/\/p\.ex\/portal-chat\//);
  assert.equal(sendStore.sends.length, 1);
  assert.equal(sendStore.sends[0].kind, 'notification');
  assert.equal(sendStore.sends[0].payload.to, 'anna@mail.se');
  // Kroppen kommer ur revisionen, INTE ur hårdkodad sträng.
  assert.match(sendStore.sends[0].payload.text, /Kliniken har svarat dig i din trygga portal/);
  assert.match(sendStore.sends[0].payload.text, /portal-chat\//);
  assert.equal(sendStore.sends[0].payload.subject, 'Du har ett nytt svar i din portal');
});

test('utan e-post → skipped no_email (skickar inget)', async () => {
  const accessStore = await createCcoPortalAccessStore({ filePath: tmp() });
  const sendStore = fakeSendStore();
  const res = await notifyPatientOfPortalReply(
    { tenantId: 'hair-tp-clinic', customerId: 'CUST-1' },
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
  const accessStore = await createCcoPortalAccessStore({ filePath: tmp() });
  const reg = await makeRegistry({ approve: true });
  const { sendStore } = await makeSendStore(reg);
  const res = await notifyPatientOfPortalReply(
    { ...baseRef, patientName: 'Anna' },
    { accessStore, sendStore, templateRegistry: reg }
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
  const reg = await makeRegistry({ approve: true });
  const sendStore = fakeSendStore();
  await notifyPatientOfPortalReply(
    { ...baseRef, patientName: 'Anna', forceLive: true },
    { accessStore, sendStore, templateRegistry: reg }
  );
  assert.equal(sendStore.sends[0].dryRunOverride, false);
});

test('forceLive default → dryRunOverride:null (följer globala CCO_SEND_LIVE)', async () => {
  const accessStore = await createCcoPortalAccessStore({ filePath: tmp() });
  const reg = await makeRegistry({ approve: true });
  const sendStore = fakeSendStore();
  await notifyPatientOfPortalReply(
    { ...baseRef, patientName: 'Anna' },
    { accessStore, sendStore, templateRegistry: reg }
  );
  assert.equal(sendStore.sends[0].dryRunOverride, null);
});

test('CCO_PORTAL_NOTIFY_LIVE=1 skickar portal-notisen skarpt (mock utan mailer, ej dry-run)', async () => {
  const prev = process.env.CCO_PORTAL_NOTIFY_LIVE;
  const prevGlobal = process.env.CCO_SEND_LIVE;
  process.env.CCO_PORTAL_NOTIFY_LIVE = '1';
  delete process.env.CCO_SEND_LIVE; // global grind AV → bevisar isolering
  try {
    const reg = await makeRegistry({ approve: true });
    const { sendStore } = await makeSendStore(reg);
    const accessStore = await createCcoPortalAccessStore({ filePath: tmp() });
    const res = await notifyPatientOfPortalReply(
      { ...baseRef, customerId: 'CUST-9', patientEmail: 'live@b.se', patientName: 'Anna' },
      { accessStore, sendStore, templateRegistry: reg }
    );
    assert.equal(res.status, 'sent');
    assert.equal(res.dryRun, false); // inte dry-run: grinden öppnade just portal-notisen
  } finally {
    if (prev === undefined) delete process.env.CCO_PORTAL_NOTIFY_LIVE;
    else process.env.CCO_PORTAL_NOTIFY_LIVE = prev;
    if (prevGlobal !== undefined) process.env.CCO_SEND_LIVE = prevGlobal;
  }
});

// ── ORD-125: mallen + juridiska grinden ──────────────────────────────────────

test('performSend anropas med templateRef + templateLang (steget genom grinden)', async () => {
  const accessStore = await createCcoPortalAccessStore({ filePath: tmp() });
  const reg = await makeRegistry({ approve: true });
  const sendStore = fakeSendStore();
  await notifyPatientOfPortalReply(
    { ...baseRef, patientName: 'Anna' },
    { accessStore, sendStore, templateRegistry: reg }
  );
  assert.equal(sendStore.sends[0].templateRef, 'portal_reply_notify');
  assert.equal(sendStore.sends[0].templateLang, 'sv');
  assert.equal(sendStore.sends[0].payload.meta.templateRef, 'portal_reply_notify');
});

// FALL 1 — mall pending → inget skickat, TEMPLATE_NOT_LEGALLY_APPROVED (mailer 0).
test('FALL 1: mall pending → blockerad av grinden, mailer 0', async () => {
  const accessStore = await createCcoPortalAccessStore({ filePath: tmp() });
  const reg = await makeRegistry({ approve: false }); // pending som standard
  const { sendStore, stats } = await makeSendStore(reg);
  await assert.rejects(
    () =>
      notifyPatientOfPortalReply(
        { ...baseRef, patientName: 'Anna', forceLive: true },
        { accessStore, sendStore, templateRegistry: reg }
      ),
    (err) => {
      assert.equal(err.code, 'TEMPLATE_NOT_LEGALLY_APPROVED');
      assert.equal(err.statusCode, 403);
      return true;
    }
  );
  assert.equal(stats.calls, 0, 'ingen mailer får anropas vid juridiskt stopp');
});

// FALL 2 — mall saknas (404) → inget skickat, {status:'skipped', reason:'template_unavailable'}.
// MUTATION: ta bort 404-kontrollen/fail-closed i notifyPatientOfPortalReply så faller
// den här på assert.equal(res.status, 'skipped') / res.reason (notify kastar 404 i stället).
test('FALL 2: mall saknas (404) → fail-closed, mailer 0', async () => {
  const accessStore = await createCcoPortalAccessStore({ filePath: tmp() });
  const reg = await makeRegistry({ withTemplate: false }); // tomt register, ingen mallpost
  const { sendStore, stats } = await makeSendStore(reg);
  const res = await notifyPatientOfPortalReply(
    { ...baseRef, patientName: 'Anna', forceLive: true },
    { accessStore, sendStore, templateRegistry: reg }
  );
  assert.equal(res.status, 'skipped');
  assert.equal(res.reason, 'template_unavailable');
  assert.equal(stats.calls, 0, 'ingen mailer får anropas när mallposten saknas');
});

// FALL 3 — mall godkänd → skickat, kroppen kommer ur revisionen (mailer 1).
test('FALL 3: mall godkänd → skickat, kroppen ur revisionen, mailer 1', async () => {
  const accessStore = await createCcoPortalAccessStore({ filePath: tmp() });
  const reg = await makeRegistry({ approve: true });
  const { sendStore, stats } = await makeSendStore(reg);
  const res = await notifyPatientOfPortalReply(
    { ...baseRef, patientName: 'Anna', forceLive: true },
    { accessStore, sendStore, templateRegistry: reg }
  );
  assert.equal(res.status, 'sent');
  assert.equal(res.dryRun, false); // forceLive → skarpt
  assert.equal(stats.calls, 1, 'mailer ska anropas exakt en gång vid godkänd mall');
  // Ämne + kropp kommer ur revisionen.
  assert.equal(stats.lastMail.subject, 'Du har ett nytt svar i din portal');
  assert.match(stats.lastMail.text, /Kliniken har svarat dig i din trygga portal/);
  assert.match(stats.lastMail.text, /Anna/); // {{firstName}} utfylld
  assert.match(stats.lastMail.text, /portal-chat\//); // {{portalUrl}} utfylld
});

// FALL 4 — variabel saknas → inget skickat, TEMPLATE_MISSING_VARIABLE (mailer 0).
test('FALL 4: variabel saknas → TEMPLATE_MISSING_VARIABLE, mailer 0', async () => {
  const accessStore = await createCcoPortalAccessStore({ filePath: tmp() });
  const reg = await makeRegistry({ approve: true });
  const { sendStore, stats } = await makeSendStore(reg);
  // patientName utelämnas → {{firstName}} saknar värde → renderMessage stoppar.
  await assert.rejects(
    () =>
      notifyPatientOfPortalReply(
        {
          tenantId: 'hair-tp-clinic',
          customerId: 'CUST-1',
          patientEmail: 'anna@mail.se',
          baseUrl: 'https://p.ex',
          forceLive: true,
        },
        { accessStore, sendStore, templateRegistry: reg }
      ),
    (err) => {
      assert.equal(err.code, 'TEMPLATE_MISSING_VARIABLE');
      assert.equal(err.variable, 'firstName');
      return true;
    }
  );
  assert.equal(stats.calls, 0, 'ingen mailer får anropas vid saknad variabel');
});

test('konstanter exporteras', () => {
  assert.equal(PORTAL_REPLY_TEMPLATE_REF, 'portal_reply_notify');
  assert.equal(PORTAL_REPLY_TEMPLATE_LANG, 'sv');
});
