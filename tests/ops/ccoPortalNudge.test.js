'use strict';

/* Portal-nudge-servicen (följdsteg): myntar magisk länk + skapar ett utkast som
 * stannar på needs_approval. SKICKAR ALDRIG själv, idempotent, och nudgar aldrig
 * en kund som redan är aktiv i portalen. */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { preparePortalNudge, buildPortalUrl } = require('../../src/ops/ccoPortalNudge');
const { createCcoPortalNudgeStore } = require('../../src/ops/ccoPortalNudgeStore');
const { createCcoPortalAccessStore } = require('../../src/ops/ccoPortalAccessStore');
const { createCcoCommDraftStore } = require('../../src/ops/ccoCommDraftStore');

function tmp(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nudge-'));
  return path.join(dir, name);
}

async function build() {
  const accessStore = await createCcoPortalAccessStore({ filePath: tmp('a.json') });
  const nudgeStore = await createCcoPortalNudgeStore({ filePath: tmp('n.json') });
  const draftStore = await createCcoCommDraftStore({ filePath: tmp('d.json') });
  return { accessStore, nudgeStore, draftStore };
}

test('förbereder nudge: magisk länk + utkast på needs_approval (aldrig sent)', async () => {
  const stores = await build();
  const res = await preparePortalNudge(
    {
      tenantId: 'hairtpclinic',
      customerId: 'CUST-1',
      customerName: 'Anna',
      baseUrl: 'https://p.ex',
    },
    stores
  );
  assert.equal(res.status, 'prepared');
  assert.match(res.url, /^https:\/\/p\.ex\/portal-chat\//);
  assert.ok(res.draftId);
  // Utkastet ska vara needs_approval — INTE approved/sent.
  const draft = stores.draftStore.getDraft(res.draftId);
  assert.equal(draft.status, 'needs_approval');
  // Länken finns i brödtexten (leverans i den kontrollerade kedjan).
  assert.match(draft.body, /portal-chat\//);
  // Ingen egen avslutshälsning och inga streck (samma disciplin som Svarstudion).
  assert.doesNotMatch(draft.body, /[—–]/);
  assert.doesNotMatch(draft.body, /Mvh|Vänligen|Varma hälsningar/i);
});

test('portal-länk blir absolut även när baseUrl saknas', () => {
  assert.equal(
    buildPortalUrl('', 'tok en'),
    'https://arcana.hairtpclinic.com/portal-chat/tok%20en'
  );
});

test('idempotent: andra anropet hoppar över (already_nudged)', async () => {
  const stores = await build();
  await preparePortalNudge({ customerId: 'CUST-1' }, stores);
  const again = await preparePortalNudge({ customerId: 'CUST-1' }, stores);
  assert.equal(again.status, 'skipped');
  assert.equal(again.reason, 'already_nudged');
});

test('hoppar över kund som redan är aktiv i portalen (already_active)', async () => {
  const stores = await build();
  const messageStore = {
    listMessagesForCustomer: () => [{ direction: 'inbound', body: 'hej' }],
  };
  const res = await preparePortalNudge({ customerId: 'CUST-2' }, { ...stores, messageStore });
  assert.equal(res.status, 'skipped');
  assert.equal(res.reason, 'already_active');
});

test('saknad kundnyckel → skipped, ingen krasch', async () => {
  const stores = await build();
  const res = await preparePortalNudge({}, stores);
  assert.equal(res.status, 'skipped');
  assert.equal(res.reason, 'missing_customer_id');
});
