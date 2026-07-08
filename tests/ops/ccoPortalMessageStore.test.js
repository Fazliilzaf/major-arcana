'use strict';

/* Portal-meddelande-store (Fas 2, steg 1). Den fria patient↔klinik-kanalen.
 * Testar append (in/ut), sortering, läsmarkering, oläst-räkning, validering och
 * kund-/tenant-isolering. Ren datalagring — inget skickas. */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { createCcoPortalMessageStore } = require('../../src/ops/ccoPortalMessageStore');

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-msg-'));
  return path.join(dir, 'portal-messages.json');
}

test('append + list: patient in, klinik ut, sorterat äldst först', async () => {
  const store = await createCcoPortalMessageStore({ filePath: tmpFile() });
  const ref = { tenantId: 'hairtpclinic', customerId: 'CUST-1' };
  await store.appendMessage({ ...ref, direction: 'inbound', body: 'Hej, går det bra fredag?' });
  await store.appendMessage({
    ...ref,
    direction: 'outbound',
    body: 'Ja, vi bokar 09:00.',
    author: 'fazli',
  });
  const list = store.listMessagesForCustomer(ref);
  assert.equal(list.length, 2);
  assert.equal(list[0].direction, 'inbound');
  assert.equal(list[1].direction, 'outbound');
  assert.equal(list[0].channel, 'portal');
  assert.equal(list[1].author, 'fazli');
});

test('markInboundRead + countUnreadInbound', async () => {
  const store = await createCcoPortalMessageStore({ filePath: tmpFile() });
  const ref = { tenantId: 'hairtpclinic', customerId: 'CUST-2' };
  await store.appendMessage({ ...ref, direction: 'inbound', body: 'Fråga 1' });
  await store.appendMessage({ ...ref, direction: 'inbound', body: 'Fråga 2' });
  await store.appendMessage({ ...ref, direction: 'outbound', body: 'Svar', author: 'egzona' });
  assert.equal(store.countUnreadInbound(ref), 2);
  const r = await store.markInboundRead(ref);
  assert.equal(r.markedRead, 2);
  assert.equal(store.countUnreadInbound(ref), 0);
});

test('validering: ogiltig direction, tom/för lång body', async () => {
  const store = await createCcoPortalMessageStore({ filePath: tmpFile() });
  const ref = { tenantId: 't', customerId: 'c' };
  await assert.rejects(() => store.appendMessage({ ...ref, direction: 'sidoväg', body: 'x' }));
  await assert.rejects(() => store.appendMessage({ ...ref, direction: 'inbound', body: '   ' }));
  await assert.rejects(() =>
    store.appendMessage({ ...ref, direction: 'inbound', body: 'x'.repeat(9000) })
  );
});

test('isolering: olika kund/tenant blandas inte', async () => {
  const store = await createCcoPortalMessageStore({ filePath: tmpFile() });
  await store.appendMessage({
    tenantId: 'hairtpclinic',
    customerId: 'A',
    direction: 'inbound',
    body: 'a',
  });
  await store.appendMessage({
    tenantId: 'hairtpclinic',
    customerId: 'B',
    direction: 'inbound',
    body: 'b',
  });
  assert.equal(
    store.listMessagesForCustomer({ tenantId: 'hairtpclinic', customerId: 'A' }).length,
    1
  );
  assert.equal(store.listMessagesForCustomer({ tenantId: 'other', customerId: 'A' }).length, 0);
});

test('listUnreadInboundSummaries: en post per kund med oläst inbound', async () => {
  const store = await createCcoPortalMessageStore({ filePath: tmpFile() });
  // Kund A: 2 olästa inbound
  await store.appendMessage({
    tenantId: 'hairtpclinic',
    customerId: 'A',
    direction: 'inbound',
    body: 'A1',
  });
  await store.appendMessage({
    tenantId: 'hairtpclinic',
    customerId: 'A',
    direction: 'inbound',
    body: 'A2 senast',
  });
  // Kund B: 1 inbound men LÄST → ska inte dyka upp
  await store.appendMessage({
    tenantId: 'hairtpclinic',
    customerId: 'B',
    direction: 'inbound',
    body: 'B1',
  });
  await store.markInboundRead({ tenantId: 'hairtpclinic', customerId: 'B' });
  // Kund C: bara outbound → ska inte dyka upp
  await store.appendMessage({
    tenantId: 'hairtpclinic',
    customerId: 'C',
    direction: 'outbound',
    body: 'C-svar',
  });

  const summaries = store.listUnreadInboundSummaries();
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].customerId, 'A');
  assert.equal(summaries[0].tenantId, 'hairtpclinic');
  assert.equal(summaries[0].unread, 2);
  assert.equal(summaries[0].latestBody, 'A2 senast'); // senaste inbound
});

test('persistens: ny store-instans läser samma fil', async () => {
  const file = tmpFile();
  const s1 = await createCcoPortalMessageStore({ filePath: file });
  await s1.appendMessage({
    tenantId: 't',
    customerId: 'c',
    direction: 'inbound',
    body: 'kvar efter omstart',
  });
  const s2 = await createCcoPortalMessageStore({ filePath: file });
  const list = s2.listMessagesForCustomer({ tenantId: 't', customerId: 'c' });
  assert.equal(list.length, 1);
  assert.equal(list[0].body, 'kvar efter omstart');
});

test('sourceKey dedupe: provider-retry skapar inte dubblett', async () => {
  const store = await createCcoPortalMessageStore({ filePath: tmpFile() });
  const ref = { tenantId: 'hairtpclinic', customerId: 'CUST-SMS' };
  const first = await store.appendMessage({
    ...ref,
    direction: 'inbound',
    channel: 'sms',
    sourceKey: 'sms:+46766000000:sabc',
    body: 'Samma SMS',
  });
  const second = await store.appendMessage({
    ...ref,
    direction: 'inbound',
    channel: 'sms',
    sourceKey: 'sms:+46766000000:sabc',
    body: 'Samma SMS',
  });
  assert.equal(second.id, first.id);
  assert.equal(second.deduped, true);
  assert.equal(store.listMessagesForCustomer(ref).length, 1);
});
