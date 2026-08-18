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


test('Fas 6: portal-meddelanden dyker upp i tidslinjen med rätt kinds', async () => {
  const portalMessageStore = {
    listMessagesForCustomer() {
      return [
        {
          id: 'pm-1',
          direction: 'inbound',
          channel: 'portal',
          body: 'Hej från patienten',
          createdAt: '2026-08-01T10:00:00.000Z',
        },
        {
          id: 'pm-2',
          direction: 'outbound',
          channel: 'portal',
          body: 'Svar från kliniken',
          createdAt: '2026-08-01T11:00:00.000Z',
        },
        {
          id: 'pm-3',
          direction: 'inbound',
          channel: 'sms',
          body: 'SMS till kliniken',
          createdAt: '2026-08-01T09:00:00.000Z',
        },
      ];
    },
  };

  const result = await buildUnifiedTimeline({
    customerId: 'cust-portal',
    portalMessageStore,
  });

  const portalEvents = result.events.filter((e) => e.source === 'portal_message');
  assert.equal(portalEvents.length, 3);

  const chatInbound = portalEvents.find((e) => e.kind === 'portal_chat' && e.meta.direction === 'inbound');
  const staffReply = portalEvents.find((e) => e.kind === 'portal_staff_reply');
  const smsInbound = portalEvents.find((e) => e.kind === 'portal_sms_inbound');

  assert.ok(chatInbound, 'portal_chat inbound ska finnas');
  assert.ok(staffReply, 'portal_staff_reply ska finnas');
  assert.ok(smsInbound, 'portal_sms_inbound ska finnas');
  assert.equal(chatInbound.displayType, 'mail');
  assert.equal(staffReply.displayType, 'mail');
  assert.equal(smsInbound.displayType, 'mail');
  assert.equal(chatInbound.summary, 'Hej från patienten');

  assert.equal(result.counts.communication, 3);
});


test('Fas 7: sendAction + agreement signerat grupperas till dokumentkedja', async () => {
  const sendActionStore = {
    findSendByRelatedEntity(kind, entityId) {
      if (kind === 'agreement' && entityId === 'agr-1') {
        return { sendId: 'send-42' };
      }
      return null;
    },
  };
  const threadStore = makeThreadStore([
    {
      threadId: 'send-42',
      kind: 'file_sent',
      ts: '2026-06-01T08:00:00.000Z',
      subject: 'Avtal för signering',
      sendActionId: 'send-42',
      relatedEntityKind: 'agreement',
      relatedEntityId: 'agr-1',
    },
  ]);
  const agreementStore = {
    listForCustomer() {
      return [
        {
          agreementId: 'agr-1',
          title: 'Behandlingsavtal',
          signedAt: '2026-06-03T10:00:00.000Z',
        },
      ];
    },
  };

  const result = await buildUnifiedTimeline({
    customerId: 'cust-chain',
    threadStore,
    agreementStore,
    sendActionStore,
  });

  const chain = result.events.find((e) => e.kind === 'document_chain');
  assert.ok(chain, 'document_chain ska finnas');
  assert.equal(chain.meta.chainId, 'send-42');
  assert.equal(chain.meta.eventCount, 2);
  assert.ok(chain.meta.kinds.includes('file_sent'));
  assert.ok(chain.meta.kinds.includes('agreement_signed'));
  assert.equal(chain.displayType, 'dokumentkedja');
  // Kedje-eventen ska ha ersatts av kedjan, inte dubblerats.
  assert.equal(result.events.filter((e) => e.kind === 'file_sent').length, 0);
  assert.equal(result.events.filter((e) => e.kind === 'agreement_signed').length, 0);
});

test('Fas 7: asset med sourceSendId länkas till utskick i tidslinjen', async () => {
  const assetStore = makeAssetStore([
    {
      id: 'asset-linked',
      status: ASSET_VISIBLE_STATUS,
      category: 'agreement',
      documentDate: '2026-06-03T10:00:00.000Z',
      sourceSendId: 'send-42',
      conversationKey: 'conv-42',
    },
  ]);
  const threadStore = makeThreadStore([
    {
      threadId: 'send-42',
      kind: 'file_sent',
      ts: '2026-06-01T08:00:00.000Z',
      subject: 'Avtal',
      sendActionId: 'send-42',
    },
  ]);

  const result = await buildUnifiedTimeline({
    customerId: 'cust-asset-chain',
    threadStore,
    assetStore,
  });

  const chain = result.events.find((e) => e.kind === 'document_chain');
  assert.ok(chain, 'asset + send ska kedja');
  assert.equal(chain.meta.chainId, 'send-42');
  assert.ok(chain.meta.kinds.includes('asset_uploaded'));
});
