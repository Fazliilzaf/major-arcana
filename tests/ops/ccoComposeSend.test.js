'use strict';

/* Leverans av godkänt kompose-utkast (följdsteg). Grind av → dry-run (utkastet
 * orört). Grind på → går kedjan needs_approval→approved→queued→sent via vald
 * kanal (Graph/Resend). Owner-only i routern. */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { deliverComposeDraft } = require('../../src/ops/ccoComposeSend');
const { createCcoCommDraftStore } = require('../../src/ops/ccoCommDraftStore');
const { SIG_DIVIDER } = require('../../src/ops/ccoSignatureHtml');

function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-send-'));
  return path.join(dir, 'd.json');
}

const patientMasterStore = {
  getPatient: async ({ patientId }) =>
    patientId === 'CUST-1' ? { id: 'CUST-1', primaryEmail: 'mottagare@example.com' } : null,
};

async function seedDraft(channel = 'resend') {
  const draftStore = await createCcoCommDraftStore({ filePath: tmp() });
  const draft = await draftStore.createDraft(
    {
      tenantId: 'hairtpclinic',
      customerId: 'CUST-1',
      channel: 'email',
      subject: 'Hej',
      body: 'Rad ett.\n\nRad två.',
      mergeFields: { sendChannel: channel },
    },
    { actor: { userId: 'operator-1' } }
  );
  await draftStore.transitionStatus(draft.draftId, 'needs_approval', {
    actor: { userId: 'operator-1' },
    tenantId: 'hairtpclinic',
  });
  return { draftStore, draftId: draft.draftId };
}

test('grind AV → dry-run: skickar inget, utkastet orört på needs_approval', async () => {
  const { draftStore, draftId } = await seedDraft('resend');
  const sends = [];
  const sendStore = { performSend: async (i) => (sends.push(i), { ok: true, mode: 'mock' }) };
  const res = await deliverComposeDraft(
    { draftId, forceLive: false },
    { draftStore, patientMasterStore, sendStore }
  );
  assert.equal(res.status, 'skipped');
  assert.equal(res.reason, 'compose_gate_off');
  assert.equal(sends.length, 0);
  assert.equal(draftStore.getDraft(draftId).status, 'needs_approval'); // orört
});

test('grind PÅ + Resend → skickar och utkastet blir sent', async () => {
  const { draftStore, draftId } = await seedDraft('resend');
  const sends = [];
  const sendStore = {
    performSend: async (i) => (sends.push(i), { ok: true, messageId: 'r1', mode: 'live' }),
  };
  const res = await deliverComposeDraft(
    { draftId, forceLive: true },
    { draftStore, patientMasterStore, sendStore }
  );
  assert.equal(res.status, 'sent');
  assert.equal(res.channel, 'resend');
  assert.equal(sends.length, 1);
  assert.equal(sends[0].payload.to, 'mottagare@example.com');
  assert.equal(sends[0].dryRunOverride, false);
  assert.match(sends[0].payload.html, /<p>/); // body → html
  assert.equal(draftStore.getDraft(draftId).status, 'sent');
  assert.match(res.to, /@example\.com$/); // maskad mottagare i svaret
});

test('grind PÅ + Graph → använder graphSendAdapter.sendMail', async () => {
  const { draftStore, draftId } = await seedDraft('graph');
  const calls = [];
  const graphSendAdapter = {
    sendMail: async (p) => (calls.push(p), { ok: true, messageId: 'g1' }),
  };
  const res = await deliverComposeDraft(
    { draftId, forceLive: true },
    { draftStore, patientMasterStore, graphSendAdapter }
  );
  assert.equal(res.status, 'sent');
  assert.equal(res.channel, 'graph');
  assert.equal(calls[0].from, 'kons@hairtpclinic.com');
  assert.equal(calls[0].to, 'mottagare@example.com');
  assert.equal(draftStore.getDraft(draftId).status, 'sent');
});

test('grind PÅ + Graph → skickar med explicit senderMailboxId från utkastet', async () => {
  const { draftStore, draftId } = await seedDraft('graph');
  await draftStore.updateDraft(
    draftId,
    { mergeFields: { sendChannel: 'graph', senderMailboxId: 'egzona@hairtpclinic.com' } },
    { tenantId: 'hairtpclinic', actor: { userId: 'operator-1' } }
  );
  const calls = [];
  const graphSendAdapter = {
    sendMail: async (p) => (calls.push(p), { ok: true, messageId: 'g2' }),
  };
  const res = await deliverComposeDraft(
    { draftId, forceLive: true },
    { draftStore, patientMasterStore, graphSendAdapter }
  );
  assert.equal(res.status, 'sent');
  assert.equal(calls[0].from, 'egzona@hairtpclinic.com');
});

test('Graph vald men adapter saknas (Graph av) → skipped graph_disabled, orört', async () => {
  const { draftStore, draftId } = await seedDraft('graph');
  const res = await deliverComposeDraft(
    { draftId, forceLive: true },
    { draftStore, patientMasterStore, graphSendAdapter: null }
  );
  assert.equal(res.status, 'skipped');
  assert.equal(res.reason, 'graph_disabled');
  assert.equal(draftStore.getDraft(draftId).status, 'needs_approval');
});

test('sändfel → utkastet blir failed (återhämtningsbart)', async () => {
  const { draftStore, draftId } = await seedDraft('resend');
  const sendStore = { performSend: async () => ({ ok: false, error: 'http_403' }) };
  const res = await deliverComposeDraft(
    { draftId, forceLive: true },
    { draftStore, patientMasterStore, sendStore }
  );
  assert.equal(res.status, 'failed');
  assert.equal(draftStore.getDraft(draftId).status, 'failed');
});

test('redan skickat → skipped already_sent (idempotent)', async () => {
  const { draftStore, draftId } = await seedDraft('resend');
  const sendStore = { performSend: async () => ({ ok: true, mode: 'live' }) };
  await deliverComposeDraft(
    { draftId, forceLive: true },
    { draftStore, patientMasterStore, sendStore }
  );
  const again = await deliverComposeDraft(
    { draftId, forceLive: true },
    { draftStore, patientMasterStore, sendStore }
  );
  assert.equal(again.status, 'skipped');
  assert.equal(again.reason, 'already_sent');
});

async function seedSignedDraft(channel, signatureId) {
  const draftStore = await createCcoCommDraftStore({ filePath: tmp() });
  const draft = await draftStore.createDraft(
    {
      tenantId: 'hairtpclinic',
      customerId: 'CUST-1',
      channel: 'email',
      subject: 'Hej',
      body:
        'Hej och välkommen!' + SIG_DIVIDER + 'Bästa hälsningar,\n\nFazli Krasniqi\n031-88 11 66',
      signatureId,
      mergeFields: { sendChannel: channel },
    },
    { actor: { userId: 'operator-1' } }
  );
  await draftStore.transitionStatus(draft.draftId, 'needs_approval', {
    actor: { userId: 'operator-1' },
    tenantId: 'hairtpclinic',
  });
  return { draftStore, draftId: draft.draftId };
}

test('Resend: varumärkt HTML-signatur med inbäddad logga (inte ren text)', async () => {
  const { draftStore, draftId } = await seedSignedDraft('resend', 'fazli');
  const sends = [];
  const sendStore = {
    performSend: async (i) => (sends.push(i), { ok: true, messageId: 'r9', mode: 'live' }),
  };
  const res = await deliverComposeDraft(
    { draftId, forceLive: true },
    { draftStore, patientMasterStore, sendStore }
  );
  assert.equal(res.status, 'sent');
  const html = sends[0].payload.html;
  assert.match(html, /<img/i); // loggan finns
  assert.match(html, /Fazli Krasniqi/); // rätt namn i signaturen
  assert.match(html, /Hej och välkommen/); // meddelandetexten kvar
  assert.doesNotMatch(html, /— — — — —/); // textsignatur-dividern strippad
  // Plain-text-delen behåller textsignaturen (fallback för icke-HTML-klienter).
  assert.match(sends[0].payload.text, /Fazli Krasniqi/);
});

test('Graph: bodyHtml är den varumärkta signaturen med logga', async () => {
  const { draftStore, draftId } = await seedSignedDraft('graph', 'fazli');
  const calls = [];
  const graphSendAdapter = {
    sendMail: async (p) => (calls.push(p), { ok: true, messageId: 'g9' }),
  };
  const res = await deliverComposeDraft(
    { draftId, forceLive: true },
    { draftStore, patientMasterStore, graphSendAdapter }
  );
  assert.equal(res.status, 'sent');
  assert.match(calls[0].bodyHtml, /<img/i);
  assert.match(calls[0].bodyHtml, /Fazli Krasniqi/);
  assert.doesNotMatch(calls[0].bodyHtml, /— — — — —/);
});

test('utan signatur (ingen divider) → ren toHtml, ingen signatur påtvingad', async () => {
  const { draftStore, draftId } = await seedDraft('resend'); // body utan SIG_DIVIDER
  const sends = [];
  const sendStore = {
    performSend: async (i) => (sends.push(i), { ok: true, mode: 'live' }),
  };
  await deliverComposeDraft(
    { draftId, forceLive: true },
    { draftStore, patientMasterStore, sendStore }
  );
  assert.match(sends[0].payload.html, /<p>/); // ren toHtml
  assert.doesNotMatch(sends[0].payload.html, /<img/i); // ingen logga påtvingad
});

test('ingen mottagar-e-post → skipped no_recipient', async () => {
  const { draftStore, draftId } = await seedDraft('resend');
  const res = await deliverComposeDraft(
    { draftId, forceLive: true },
    { draftStore, patientMasterStore: { getPatient: async () => null } }
  );
  assert.equal(res.status, 'skipped');
  assert.equal(res.reason, 'no_recipient');
});
