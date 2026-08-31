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
const { getCoolingOffMeta } = require('../../src/ops/ccoOfferEsign');

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

test('cco commercial store persisterar signatureProof (offer-accept-bevis)', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-commercial-store-'));
  const filePath = path.join(tempDir, 'cco-commercial.json');

  try {
    const store = await createCcoCommercialStore({ filePath });
    const first = await store.ensureCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-2',
      customerId: 'anna@example.com',
      customerName: 'Anna',
      offerType: 'PRP paket',
    });

    const proof = {
      signedAt: '2026-05-20T10:00:00.000Z',
      documentId: 'offer-doc-1',
      documentVersion: 'tp-2026',
      signerName: 'Anna',
      signerPatientId: 'anna@example.com',
      source: 'bankid',
      bankIdSessionId: 'sess-1',
    };
    const updated = await store.upsertCase({
      ...first,
      quoteStatus: 'accepted',
      customerSignedName: 'Anna',
      signatureProof: [proof],
    });

    assert.equal(updated.signatureProof.length, 1);
    assert.deepEqual(updated.signatureProof[0], proof);
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

test('ORD-153 §3/§4: fristen startar vid första VERIFIERADE inloggningen — oidentifierad startar inte, legacy rörs inte', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-commercial-verify-'));
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
      quoteSentAt: '2026-08-28T10:00:00.000Z',
      offerDocumentId: 'offer-doc-1',
    });

    // Oidentifierad öppning → ingen frist startar.
    await store.recordQuoteOpen({
      tenantId: 'tenant-a',
      patientId: 'patient-1',
      source: 'offer_sign_page',
      ts: '2026-08-29T10:00:00.000Z',
      verified: false,
    });
    let c = await store.getPatientRegisterCase({ tenantId: 'tenant-a', patientId: 'patient-1' });
    assert.equal(c.coolingOffEndsAt || null, null, 'oidentifierad öppning får inte starta fristen');
    assert.equal(c.quoteOpens[0].verified, false);

    // Första verifierade inloggningen → fristen startar.
    await store.recordQuoteOpen({
      tenantId: 'tenant-a',
      patientId: 'patient-1',
      source: 'portal_bankid',
      ts: '2026-08-31T09:00:00.000Z',
      verified: true,
    });
    c = await store.getPatientRegisterCase({ tenantId: 'tenant-a', patientId: 'patient-1' });
    assert.equal(c.quoteOpens[1].verified, true);
    assert.equal(c.quoteOpens[1].patientId, 'patient-1');
    assert.equal(c.coolingOffEndsAt, '2026-09-02T09:00:00.000Z');

    // §4: en senare verifierad öppning rör inte den lagrade fristen.
    await store.recordQuoteOpen({
      tenantId: 'tenant-a',
      patientId: 'patient-1',
      source: 'portal_bankid',
      ts: '2026-09-01T09:00:00.000Z',
      verified: true,
    });
    c = await store.getPatientRegisterCase({ tenantId: 'tenant-a', patientId: 'patient-1' });
    assert.equal(c.coolingOffEndsAt, '2026-09-02T09:00:00.000Z', 'lagrad frist får inte skrivas om');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

function dateOnlyPlusDays(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

test('opDate: persisteras från bekräftad bokning och driver OP-fönster-signalen i readout', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-commercial-opdate-'));
  const filePath = path.join(tempDir, 'cco-commercial.json');

  try {
    const store = await createCcoCommercialStore({ filePath });
    const opDate = dateOnlyPlusDays(7); // inom 14-dagarsfönstret

    const seeded = await store.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'patient-register',
      customerId: 'patient-1',
      customerName: 'Anna',
      quoteStatus: 'accepted',
      commercialStatus: 'ready',
      quotedAmount: '75 000 kr',
      depositAmount: '15 000 kr',
      opDate,
    });
    assert.equal(seeded.opDate, opDate, 'opDate ska persistras i caset');

    const readout = buildCommercialCaseReadout(seeded);
    assert.equal(readout.opDate, opDate);
    assert.ok(readout.finalInvoiceSignal, 'förväntade en OP-fönster-signal');
    assert.equal(readout.finalInvoiceSignal.metadata.trigger, 'op_window');
    assert.match(readout.finalInvoiceSignal.what, /OP om \d+ dag/);

    // Avbokning → opDate rensas, OP-signalen utlöses inte längre.
    const cleared = await store.upsertCase({ ...seeded, opDate: '' });
    assert.equal(cleared.opDate, '', 'opDate ska rensas vid avbokning');
    const clearedReadout = buildCommercialCaseReadout(cleared);
    assert.equal(clearedReadout.opDate, '');
    assert.equal(clearedReadout.finalInvoiceSignal, null);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('opDate långt utanför fönstret ger ingen OP-signal (faller tillbaka på persisterad)', () => {
  const opDate = dateOnlyPlusDays(60);
  const readout = buildCommercialCaseReadout({
    tenantId: 'tenant-a',
    workspaceId: 'major-arcana-preview',
    conversationId: 'patient-register',
    customerId: 'patient-1',
    quoteStatus: 'accepted',
    commercialStatus: 'ready',
    quotedAmount: '75 000 kr',
    depositAmount: '15 000 kr',
    opDate,
  });
  assert.equal(readout.opDate, opDate);
  // Utanför fönstret → ingen op-signal; ingen persisterad journal-signal → null.
  assert.equal(readout.finalInvoiceSignal, null);
});

test('ORD-153 §5: owner-offer-raden bär samma coolingOff-meta som kundvyn', () => {
  const nowMs = Date.parse('2026-08-31T09:00:00.000Z');

  // Fall 1: skickad men aldrig verifierad → fristen har inte börjat.
  const notVerifiedCase = {
    commercialCaseId: 'c-1',
    customerId: 'p-1',
    customerName: 'Anna',
    quoteStatus: 'sent',
    quoteSentAt: '2026-08-28T10:00:00.000Z',
    // ingen coolingOffEndsAt → ingen verifierad inloggning
  };
  const notVerified = buildCommercialOwnerOfferOverview([notVerifiedCase], { nowMs });
  const rowNotVerified = notVerified.buckets.waitingCustomer[0];
  assert.ok(rowNotVerified, 'skickad men ej verifierad hamnar i waitingCustomer');
  assert.equal(rowNotVerified.coolingOff.blocked, 'not_verified');
  assert.equal(rowNotVerified.coolingOff.endsAt, '');
  // Samma sanning som kundvyn — identisk funktion, identisk input.
  assert.deepEqual(rowNotVerified.coolingOff, getCoolingOffMeta(notVerifiedCase, nowMs));

  // Fall 2: verifierad → fristen räknas från verifieringen, inte utskicket.
  const verifiedCase = {
    commercialCaseId: 'c-2',
    customerId: 'p-2',
    customerName: 'Björn',
    quoteStatus: 'sent',
    quoteSentAt: '2026-08-28T10:00:00.000Z',
    coolingOffEndsAt: '2026-09-02T09:00:00.000Z',
    quoteOpenedAt: '2026-08-31T09:00:00.000Z',
    quoteOpens: [{ ts: '2026-08-31T09:00:00.000Z', verified: true }],
  };
  const verified = buildCommercialOwnerOfferOverview([verifiedCase], { nowMs });
  const rowVerified = verified.buckets.waitingCustomer[0];
  assert.ok(rowVerified, 'verifierad med löpande frist hamnar i waitingCustomer');
  assert.equal(rowVerified.coolingOff.active, true);
  assert.equal(rowVerified.coolingOff.startsAt, '2026-08-31T09:00:00.000Z');
  assert.equal(rowVerified.coolingOff.endsAt, '2026-09-02T09:00:00.000Z');
  assert.deepEqual(rowVerified.coolingOff, getCoolingOffMeta(verifiedCase, nowMs));
});

test('ORD-154 §1: tomt esignToken rensar, undefined behåller (store-nivå)', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-ord154-'));
  const store = await createCcoCommercialStore({ filePath: path.join(tempDir, 'cco.json') });
  const base = {
    tenantId: 'tenant-a',
    workspaceId: 'major-arcana-preview',
    conversationId: 'conv-1',
    customerId: 'anna@example.com',
    customerName: 'Anna',
  };

  try {
    const withToken = await store.upsertCase({ ...base, esignToken: 'tok-1', esignStatus: 'sent' });
    assert.equal(withToken.esignToken, 'tok-1');

    // Explicit tomt → rensar (får inte falla igenom till förra värdet).
    const cleared = await store.upsertCase({ ...base, esignToken: '' });
    assert.equal(cleared.esignToken, '', 'tom sträng ska rensa token');

    // Återställ, sedan uppdatering UTAN esignToken → behåller.
    await store.upsertCase({ ...base, esignToken: 'tok-2' });
    const kept = await store.upsertCase({ ...base, quoteStatus: 'draft' });
    assert.equal(kept.esignToken, 'tok-2', 'undefined ska behålla token');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ORD-154 §3: findCaseByRevokedEsignToken känner igen återkallad token', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-ord154-rev-'));
  const store = await createCcoCommercialStore({ filePath: path.join(tempDir, 'cco.json') });
  const base = {
    tenantId: 'tenant-a',
    workspaceId: 'major-arcana-preview',
    conversationId: 'conv-1',
    customerId: 'anna@example.com',
    customerName: 'Anna',
  };

  try {
    await store.upsertCase({ ...base, esignToken: 'tok-live' });
    // Återkalla: rensa token + minns den i esignRevocations.
    const revoked = await store.upsertCase({
      ...base,
      esignToken: '',
      esignStatus: 'revoked',
      esignRevocations: [{ token: 'tok-live', revokedAt: new Date().toISOString(), reason: 'fel adress' }],
    });
    assert.equal(revoked.esignToken, '');
    assert.equal(revoked.esignStatus, 'revoked');

    assert.equal(await store.findCaseByEsignToken('tok-live'), null, 'återkallad token matchar inte längre esignToken');
    const byRevoked = await store.findCaseByRevokedEsignToken('tok-live');
    assert.ok(byRevoked, 'återkallad token ska kännas igen via revocations');
    assert.equal(byRevoked.customerId, 'anna@example.com');
    assert.equal(await store.findCaseByRevokedEsignToken('okänd-token'), null);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
