'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildUnifiedTimeline,
  displayTypeForEvent,
  ASSET_VISIBLE_STATUS,
} = require('../../src/ops/ccoUnifiedTimelineBuilder');

// ── Fakes ──────────────────────────────────────────────────────────────────

function makeThreadStore(threads) {
  return {
    async buildThreadsForCustomer() {
      return { threads };
    },
  };
}

function makeAssetStore(assets) {
  // Signatur (patientId, filters, { actor }) → length 3 (>=2) så byggaren
  // anropar den som listAssetsForPatient(customerId, {}, { actor }).
  return {
    listAssetsForPatient(_patientId, _filters, _opts) {
      return assets;
    },
  };
}

// ── C6-tester ────────────────────────────────────────────────────────────────

test('C6: sorterar hela tidslinjen efter faktisk timestamp (nyast först)', async () => {
  const threadStore = makeThreadStore([
    { threadId: 't-old', kind: 'incoming_mail', ts: '2026-01-01T08:00:00.000Z', subject: 'Äldst' },
    { threadId: 't-new', kind: 'incoming_mail', ts: '2026-06-01T08:00:00.000Z', subject: 'Nyast' },
    { threadId: 't-mid', kind: 'outgoing_mail', ts: '2026-03-15T08:00:00.000Z', subject: 'Mitten' },
  ]);
  const assetStore = makeAssetStore([
    {
      id: 'a-apr',
      status: ASSET_VISIBLE_STATUS,
      category: 'document_medical',
      documentDate: '2026-04-10T08:00:00.000Z',
    },
  ]);

  const result = await buildUnifiedTimeline({ customerId: 'cust-1', threadStore, assetStore });

  const order = result.events.map((e) => e.ts);
  const sortedDesc = [...order].sort((a, b) => String(b).localeCompare(String(a)));
  assert.deepEqual(order, sortedDesc, 'events ska vara sorterade nyast först');
  assert.equal(result.events[0].title, 'Nyast');
  assert.equal(result.events[result.events.length - 1].title, 'Äldst');
});

test('C6: NEEDS_REVIEW-assets filtreras bort från tidslinjen', async () => {
  const assetStore = makeAssetStore([
    {
      id: 'ok-1',
      status: ASSET_VISIBLE_STATUS,
      category: 'document_medical',
      documentDate: '2026-05-01',
    },
    {
      id: 'review-1',
      status: 'NEEDS_REVIEW',
      category: 'document_medical',
      documentDate: '2026-05-02',
    },
    {
      id: 'review-2',
      status: 'DISCOVERED',
      category: 'photo_clinical',
      documentDate: '2026-05-03',
    },
    {
      id: 'review-3',
      status: 'VERIFIED_IN_CCO',
      category: 'document_medical',
      documentDate: '2026-05-04',
    },
    {
      id: 'review-4',
      status: 'REJECTED',
      category: 'document_medical',
      documentDate: '2026-05-05',
    },
  ]);

  const result = await buildUnifiedTimeline({ customerId: 'cust-1', assetStore });

  const assetEvents = result.events.filter((e) => e.source === 'asset');
  assert.equal(assetEvents.length, 1, 'endast VISIBLE_ON_PATIENT_CARD ska visas');
  assert.equal(assetEvents[0].meta.assetId, 'ok-1');
  assert.equal(assetEvents[0].meta.status, ASSET_VISIBLE_STATUS);

  const surfacedIds = assetEvents.map((e) => e.meta.assetId);
  for (const blocked of ['review-1', 'review-2', 'review-3', 'review-4']) {
    assert.ok(!surfacedIds.includes(blocked), `${blocked} får INTE visas`);
  }
});

test('C6: VISIBLE_ON_PATIENT_CARD-asset visas som dokument/bild med säkrad openRef (ingen Drive-länk)', async () => {
  const assetStore = makeAssetStore([
    {
      id: 'doc-1',
      status: ASSET_VISIBLE_STATUS,
      category: 'document_medical',
      documentDate: '2026-05-01',
    },
    {
      id: 'img-1',
      status: ASSET_VISIBLE_STATUS,
      category: 'photo_clinical',
      documentDate: '2026-05-02',
    },
  ]);

  const result = await buildUnifiedTimeline({ customerId: 'cust-1', assetStore });
  const assetEvents = result.events.filter((e) => e.source === 'asset');
  assert.equal(assetEvents.length, 2);

  const img = assetEvents.find((e) => e.meta.assetId === 'img-1');
  const doc = assetEvents.find((e) => e.meta.assetId === 'doc-1');
  assert.equal(img.displayType, 'bild');
  assert.equal(doc.displayType, 'dokument');

  for (const ev of assetEvents) {
    // Native asset-kontrakt (ej migration-index fileId).
    assert.deepEqual(ev.meta.openRef, { kind: 'patient_asset', assetId: ev.meta.assetId });
    // Ingen rå Drive-länk får finnas någonstans i eventet.
    const serialized = JSON.stringify(ev);
    assert.ok(!/drive\.google\.com/i.test(serialized), 'ingen direkt Drive-länk');
    assert.ok(!/webViewLink|driveWebViewLink/i.test(serialized), 'inget drive webViewLink');
  }
});

test('C6: mailrad bär conversationKey så den kan länka till rätt konversation', async () => {
  const threadStore = makeThreadStore([
    {
      threadId: 'conv-key-42',
      conversationId: 'conv-key-42',
      mailboxId: 'info@hairtpclinic.com',
      kind: 'incoming_mail',
      ts: '2026-06-01T08:00:00.000Z',
      subject: 'Fråga om tid',
    },
    {
      threadId: 'note-1',
      kind: 'internal_note',
      ts: '2026-06-02T08:00:00.000Z',
      subject: 'Intern notis',
    },
  ]);

  const result = await buildUnifiedTimeline({ customerId: 'cust-1', threadStore });

  const mail = result.events.find((e) => e.kind === 'incoming_mail');
  assert.ok(mail, 'mailrad ska finnas');
  assert.equal(mail.displayType, 'mail');
  assert.equal(mail.meta.conversationKey, 'conv-key-42');
  assert.equal(mail.meta.mailboxId, 'info@hairtpclinic.com');
  assert.equal(mail.entityId, 'conv-key-42');

  // Intern notis är inte mail → ingen konversationslänk.
  const note = result.events.find((e) => e.kind === 'internal_note');
  assert.equal(note.displayType, 'anteckning');
  assert.equal(note.meta.conversationKey, null);
});

test('C6: tom kund ger trygg empty state (inga events, counts.all = 0)', async () => {
  const threadStore = makeThreadStore([]);
  const assetStore = makeAssetStore([]);

  const result = await buildUnifiedTimeline({ customerId: 'cust-empty', threadStore, assetStore });

  assert.deepEqual(result.events, []);
  assert.equal(result.counts.all, 0);
  assert.ok(Array.isArray(result.availableFilters));
});

test('C6: buildUnifiedTimeline utan customerId returnerar tom struktur utan att kasta', async () => {
  const result = await buildUnifiedTimeline({ customerId: '' });
  assert.deepEqual(result.events, []);
});

test('C6: displayTypeForEvent mappar kinds till tydlig typ', () => {
  assert.equal(displayTypeForEvent({ kind: 'incoming_mail', category: 'communication' }), 'mail');
  assert.equal(displayTypeForEvent({ kind: 'outgoing_mail', category: 'communication' }), 'mail');
  assert.equal(
    displayTypeForEvent({ kind: 'internal_note', category: 'communication' }),
    'anteckning'
  );
  assert.equal(displayTypeForEvent({ kind: 'form_sent', category: 'communication' }), 'utskick');
  assert.equal(displayTypeForEvent({ kind: 'journal_signed', category: 'journal' }), 'journal');
  assert.equal(
    displayTypeForEvent({ kind: 'encounter_completed', category: 'bookings' }),
    'bokning'
  );
  assert.equal(displayTypeForEvent({ kind: 'journey_advance', category: 'journey' }), 'kundresa');
  assert.equal(
    displayTypeForEvent({
      kind: 'asset_uploaded',
      category: 'documents',
      meta: { category: 'photo_clinical' },
    }),
    'bild'
  );
  assert.equal(
    displayTypeForEvent({
      kind: 'asset_uploaded',
      category: 'documents',
      meta: { category: 'document_medical' },
    }),
    'dokument'
  );
  assert.equal(displayTypeForEvent({ kind: 'agreement_signed', category: 'documents' }), 'avtal');
});
