const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildCommercialOwnerOfferOverview,
  buildQuoteOpenTimelineEvents,
  buildCommercialCaseReadout,
  createCcoCommercialStore,
} = require('../../src/ops/ccoCommercialStore');

test('cco commercial store skapar och uppdaterar kommersiella ärenden idempotent', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-commercial-store-'));
  const filePath = path.join(tempDir, 'cco-commercial.json');

  try {
    const store = await createCcoCommercialStore({ filePath });

    const first = await store.ensureCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-1',
      customerId: 'anna@example.com',
      customerName: 'Anna',
      offerType: 'PRP paket',
    });

    const second = await store.upsertCase({
      ...first,
      commercialStatus: 'deposit_pending',
      quoteStatus: 'sent',
      paymentStatus: 'blocked',
      quotedAmount: '75 000 kr',
      depositAmount: '15 000 kr',
      requiredActions: ['Lös deposition eller betalningsblockerare'],
    });

    assert.equal(second.commercialCaseId, first.commercialCaseId);
    assert.equal(second.commercialStatus, 'deposit_pending');
    assert.equal(second.paymentStatus, 'blocked');
    assert.deepEqual(second.requiredActions, ['Lös deposition eller betalningsblockerare']);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('cco commercial readout prioriterar blockerad betalning och tydlig nästa åtgärd', () => {
  const readout = buildCommercialCaseReadout({
    customerName: 'Anna',
    offerType: 'PRP paket',
    commercialStatus: 'deposit_pending',
    quoteStatus: 'sent',
    paymentStatus: 'blocked',
    quotedAmount: '75 000 kr',
    depositAmount: '15 000 kr',
    dueDateIso: '2026-03-26T12:00:00.000Z',
    requiredActions: ['Lös deposition eller betalningsblockerare'],
    notes: 'Depositionen behöver lösas innan nästa steg kan bokas.',
  });

  assert.equal(readout.phase, 'payment_blocked');
  assert.equal(readout.queueBucket, 'critical');
  assert.equal(readout.waitingOn, 'operator');
  assert.match(readout.nextStep, /betalningsblockerare|deposition/i);
  assert.equal(readout.operatorActions[0]?.key, 'resolve_payment_blocker');
  assert.equal(readout.operatorActions[0]?.type, 'surface_action');
  assert.equal(readout.operatorActions[0]?.surfaceAction, 'commercial_open');
  assert.equal(readout.operatorActions[1]?.surfaceAction, 'note_open');
  assert.equal(readout.operatorActions[1]?.label, 'Betalningsnot');
});

test('cco commercial readout skickar redo commercial direkt mot bokningshandoff', () => {
  const readout = buildCommercialCaseReadout({
    customerName: 'Anna',
    offerType: 'PRP paket',
    commercialStatus: 'ready',
    quoteStatus: 'accepted',
    paymentStatus: 'paid',
    quotedAmount: '75 000 kr',
    depositAmount: '15 000 kr',
    requiredActions: ['Lämna vidare till bokning med ekonomiskt klartecken'],
  });

  assert.equal(readout.phase, 'ready_for_booking');
  assert.equal(readout.waitingOn, 'booking');
  assert.equal(readout.operatorActions[0]?.key, 'review_commercial_booking_handoff');
  assert.equal(readout.operatorActions[0]?.surfaceAction, 'booking_surface');
  assert.equal(readout.operatorActions[0]?.label, 'Bokningshandoff');
  assert.equal(readout.operatorActions[1]?.surfaceAction, 'note_open');
  assert.equal(readout.operatorActions[1]?.label, 'Bekräfta klartecken');
});

test('K57: owner offer overview exponerar ansvarig per fastnad offert', () => {
  const nowMs = Date.parse('2026-07-02T10:00:00.000Z');
  const overview = buildCommercialOwnerOfferOverview(
    [
      {
        commercialCaseId: 'case-owned',
        tenantId: 'tenant-a',
        workspaceId: 'major-arcana-preview',
        conversationId: 'conv-1',
        customerId: 'patient-1',
        customerName: 'Anna',
        quoteStatus: 'sent',
        quoteSentAt: '2026-06-20T10:00:00.000Z',
        offerOwnerUserId: 'operator-1',
        offerOwnerName: 'Sara Sjuksköterska',
      },
      {
        commercialCaseId: 'case-share-fallback',
        tenantId: 'tenant-a',
        workspaceId: 'major-arcana-preview',
        conversationId: 'conv-2',
        customerId: 'patient-2',
        customerName: 'Bertil',
        quoteStatus: 'sent',
        quoteSentAt: '2026-06-20T10:00:00.000Z',
        lastPortalSharedBy: 'Fazli',
      },
      {
        commercialCaseId: 'case-unassigned',
        tenantId: 'tenant-a',
        workspaceId: 'major-arcana-preview',
        conversationId: 'conv-3',
        customerId: 'patient-3',
        customerName: 'Cecilia',
        quoteStatus: 'sent',
        quoteSentAt: '2026-06-20T10:00:00.000Z',
      },
    ],
    { nowMs }
  );

  const byId = Object.fromEntries(overview.buckets.stuck.map((row) => [row.commercialCaseId, row]));
  assert.equal(byId['case-owned'].offerOwnerName, 'Sara Sjuksköterska');
  assert.equal(byId['case-owned'].offerOwnerUserId, 'operator-1');
  assert.equal(byId['case-owned'].offerOwnerSource, 'explicit');
  assert.equal(byId['case-share-fallback'].offerOwnerName, 'Fazli');
  assert.equal(byId['case-share-fallback'].offerOwnerSource, 'last_portal_share');
  assert.equal(byId['case-unassigned'].offerOwnerName, '');
  assert.equal(byId['case-unassigned'].offerOwnerSource, 'unassigned');
});

test('ORD-42: recordQuoteOpen räknar kundöppningar och debounce:ar dubbelträff', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-commercial-open-'));
  const filePath = path.join(tempDir, 'cco-commercial.json');

  try {
    const store = await createCcoCommercialStore({ filePath });
    await store.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'patient-register',
      customerId: 'patient-1',
      customerName: 'Anna',
      quoteStatus: 'sent',
      offerDocumentId: 'offer-doc-1',
    });

    const first = await store.recordQuoteOpen({
      tenantId: 'tenant-a',
      patientId: 'patient-1',
      source: 'offer_sign_page',
      ts: '2026-06-09T10:00:00.000Z',
    });
    assert.equal(first.recorded, true);
    assert.equal(first.openIndex, 1);

    const debounced = await store.recordQuoteOpen({
      tenantId: 'tenant-a',
      patientId: 'patient-1',
      source: 'offer_sign_page',
      ts: '2026-06-09T10:00:15.000Z',
    });
    assert.equal(debounced.recorded, false);
    assert.equal(debounced.debounced, true);

    const second = await store.recordQuoteOpen({
      tenantId: 'tenant-a',
      patientId: 'patient-1',
      source: 'offer_sign_page',
      ts: '2026-06-09T10:01:00.000Z',
    });
    assert.equal(second.recorded, true);
    assert.equal(second.openIndex, 2);

    const commercialCase = await store.getPatientRegisterCase({
      tenantId: 'tenant-a',
      patientId: 'patient-1',
    });
    assert.equal(commercialCase.quoteOpenCount, 2);
    assert.equal(commercialCase.quoteOpens.length, 2);
    assert.equal(commercialCase.quoteOpenedAt, '2026-06-09T10:01:00.000Z');

    const events = buildQuoteOpenTimelineEvents(commercialCase);
    assert.equal(events.length, 2);
    assert.equal(events[1].type, 'offer_opened');
    assert.equal(events[1].detail.openIndex, 2);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
