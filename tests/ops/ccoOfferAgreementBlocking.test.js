'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoBlockingStore } = require('../../src/ops/ccoBlockingStore');
const { createCcoOfferQuickStore } = require('../../src/ops/ccoOfferQuickStore');
const { createCcoAgreementQuickStore } = require('../../src/ops/ccoAgreementQuickStore');

async function tmpFile(name) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-quick-'));
  return path.join(dir, name);
}

// Minimal treatment-requirements som speglar config-formen.
const treatmentRequirements = {
  treatments: {
    botox: {
      brand: 'curatiio',
      requiredDocuments: {
        treatmentConsent: {
          required: true,
          blocking: true,
          templateRef: 'consent_treatment_botox',
        },
        idVerification: { required: true, blocking: true },
      },
    },
    fue: {
      brand: 'hair_tp',
      requiredDocuments: {
        treatmentConsent: { required: true, blocking: true, templateRef: 'consent_treatment_fue' },
        idVerification: { required: true, blocking: true },
      },
    },
  },
};

// ─── BLOCKING ───────────────────────────────────────────────

test('blocking evaluateCustomer fires missing_treatment_consent (blocking)', async () => {
  const store = createCcoBlockingStore({
    journalStore: { listEntries: async () => [] },
    agreementStore: { listForCustomer: () => [] },
    treatmentRequirements,
  });
  const result = await store.evaluateCustomer('patient-1', {
    plannedTreatment: 'botox',
    hasUpcomingBooking: true,
  });
  assert.equal(typeof result.status, 'string');
  assert.equal(result.blocking, true);
  assert.equal(result.status, 'blocked');
  const consent = result.issues.find((i) => i.kind === 'missing_treatment_consent');
  assert.ok(consent, 'missing_treatment_consent issue should exist');
  assert.equal(consent.severity, 'blocking');
  assert.equal(consent.meta.treatmentKey, 'botox');
});

test('blocking evaluateCustomer fires wrong_brand_flow when brands mismatch', async () => {
  const store = createCcoBlockingStore({
    journalStore: { listEntries: async () => [] },
    agreementStore: {
      listForCustomer: () => [
        { id: 'a1', state: 'signed', brand: 'hair_tp', treatmentKey: 'botox' },
      ],
    },
    treatmentRequirements,
  });
  const result = await store.evaluateCustomer('patient-2', { plannedTreatment: 'botox' });
  const wrong = result.issues.find((i) => i.kind === 'wrong_brand_flow');
  assert.ok(wrong, 'wrong_brand_flow issue should exist');
  assert.equal(wrong.severity, 'blocking');
  assert.equal(wrong.meta.agreementBrand, 'hair_tp');
  assert.equal(wrong.meta.expectedBrand, 'curatiio');
  assert.notEqual(wrong.meta.expectedBrand, wrong.meta.agreementBrand);
});

test('blocking evaluateCustomer clear when consent present and brand matches', async () => {
  const store = createCcoBlockingStore({
    journalStore: {
      listEntries: async () => [
        { kind: 'treatment_consent', templateRef: 'consent_treatment_botox' },
      ],
    },
    agreementStore: {
      listForCustomer: () => [{ id: 'a1', state: 'signed', brand: 'curatiio' }],
    },
    idVerificationStore: { getStatus: async () => ({ state: 'verified' }) },
    treatmentRequirements,
  });
  const result = await store.evaluateCustomer('patient-3', { plannedTreatment: 'botox' });
  assert.equal(result.blocking, false);
  assert.equal(result.status, 'clear');
  assert.equal(result.issues.length, 0);
});

test('blocking evaluateDashboard returns customers + summary shape', async () => {
  const store = createCcoBlockingStore({
    journalStore: { listEntries: async () => [] },
    agreementStore: { listForCustomer: () => [] },
    treatmentRequirements,
  });
  const dash = await store.evaluateDashboard({
    customerIds: ['p1', 'p2'],
    opts: { p1: { plannedTreatment: 'botox' }, p2: { plannedTreatment: 'fue' } },
  });
  assert.ok(Array.isArray(dash.customers));
  assert.equal(dash.customers.length, 2);
  assert.equal(dash.summary.total, 2);
  assert.equal(typeof dash.summary.blocked, 'number');
  assert.equal(typeof dash.summary.byKind, 'object');
  assert.ok(Array.isArray(dash.summary.topIssues));
  assert.ok(dash.summary.byKind.missing_treatment_consent >= 2);
});

test('blocking works with no options (pure evaluator, no treatment)', async () => {
  const store = createCcoBlockingStore();
  const result = await store.evaluateCustomer('x');
  assert.equal(result.status, 'clear');
  assert.equal(result.blocking, false);
});

// ─── OFFERS ─────────────────────────────────────────────────

test('offer lifecycle: create -> update -> send(stub) -> accept', async () => {
  const filePath = await tmpFile('cco-offers-quick.json');
  let sendCalls = 0;
  const store = await createCcoOfferQuickStore({
    filePath,
    sendStore: {
      buildFilePayload: async (args) => ({ built: true, kind: args.kind }),
      performSend: async () => {
        sendCalls += 1;
        return { delivered: true, id: 'send-1' };
      },
    },
  });

  const offer = await store.createOffer({
    customerId: 'CUST-1',
    title: 'FUE-paket',
    amount: 50000,
  });
  assert.equal(offer.state, 'draft');
  assert.equal(offer.customerId, 'cust-1');

  const updated = await store.updateDraft(offer.id, { amount: 45000, notes: 'rabatt' });
  assert.equal(updated.amount, 45000);
  assert.equal(updated.notes, 'rabatt');

  const sent = await store.sendOffer(offer.id, { dryRunOverride: false }, { role: 'owner' });
  assert.equal(sendCalls, 1);
  assert.equal(sent.send.delivered, true);
  assert.equal(sent.offer.state, 'sent');

  const accepted = await store.acceptOffer(offer.id, { acceptedVia: 'email' }, { role: 'owner' });
  assert.equal(accepted.state, 'accepted');
  assert.equal(accepted.acceptedVia, 'email');
});

test('offer sendOffer dry-run is default and tolerates null send helpers', async () => {
  const filePath = await tmpFile('cco-offers-quick.json');
  const store = await createCcoOfferQuickStore({ filePath, sendStore: null });
  const offer = await store.createOffer({ customerId: 'c2' });
  const sent = await store.sendOffer(offer.id, {}, { role: 'staff' });
  assert.equal(sent.send.dryRun, true);
  assert.equal(sent.offer.state, 'draft'); // dry-run does not advance state
});

test('offer send tolerates helpers returning undefined (proxy not mounted)', async () => {
  const filePath = await tmpFile('cco-offers-quick.json');
  const store = await createCcoOfferQuickStore({
    filePath,
    sendStore: { buildFilePayload: () => undefined, performSend: () => undefined },
  });
  const offer = await store.createOffer({ customerId: 'c3' });
  const sent = await store.sendOffer(offer.id, { dryRunOverride: false }, { role: 'staff' });
  assert.equal(sent.send.delivered, false);
  assert.equal(sent.send.reason, 'send_store_unavailable');
  assert.equal(sent.offer.state, 'draft');
});

test('offer listForCustomer / listAll / stats', async () => {
  const filePath = await tmpFile('cco-offers-quick.json');
  const store = await createCcoOfferQuickStore({ filePath });
  const o1 = await store.createOffer({ customerId: 'cust-A', amount: 100 });
  await store.createOffer({ customerId: 'cust-A', amount: 200 });
  await store.createOffer({ customerId: 'cust-B', amount: 300 });
  await store.acceptOffer(o1.id, {}, { role: 'owner' });

  assert.equal(store.listForCustomer('CUST-A').length, 2);
  assert.equal(store.listAll().length, 3);
  assert.equal(store.listAll({ state: 'accepted' }).length, 1);

  const s = store.stats();
  assert.equal(s.total, 3);
  assert.equal(s.byState.accepted, 1);
  assert.equal(s.byState.draft, 2);
  assert.equal(s.acceptedAmount, 100);
});

test('offer deleteDraft only on draft; getById missing returns null', async () => {
  const filePath = await tmpFile('cco-offers-quick.json');
  const store = await createCcoOfferQuickStore({ filePath });
  const offer = await store.createOffer({ customerId: 'c' });
  const del = await store.deleteDraft(offer.id, { role: 'owner' });
  assert.equal(del.deleted, true);
  assert.equal(store.getById(offer.id), null);
  assert.equal(store.getById('nope'), null);
});

// ─── AGREEMENTS ─────────────────────────────────────────────

test('agreement lifecycle: create -> send(stub) -> sign', async () => {
  const filePath = await tmpFile('cco-agreements-quick.json');
  let sendCalls = 0;
  const store = await createCcoAgreementQuickStore({
    filePath,
    sendStore: {
      buildFilePayload: async () => ({ built: true }),
      performSend: async () => {
        sendCalls += 1;
        return { delivered: true };
      },
    },
  });

  const ag = await store.createAgreement({
    customerId: 'CUST-9',
    title: 'Avtal',
    brand: 'curatiio',
  });
  assert.equal(ag.state, 'draft');

  const sent = await store.sendAgreement(ag.id, { dryRunOverride: false }, { role: 'owner' });
  assert.equal(sendCalls, 1);
  assert.equal(sent.agreement.state, 'sent');

  const signed = await store.signAgreement(
    ag.id,
    { signedByName: 'Anna', signMethod: 'bankid_stub' },
    { role: 'patient' }
  );
  assert.equal(signed.state, 'signed');
  assert.equal(signed.signedByName, 'Anna');
  assert.equal(signed.signMethod, 'bankid_stub');
});

test('agreement cancel blocked after sign; signed cannot re-sign', async () => {
  const filePath = await tmpFile('cco-agreements-quick.json');
  const store = await createCcoAgreementQuickStore({ filePath });
  const ag = await store.createAgreement({ customerId: 'c' });
  await store.signAgreement(ag.id, { signMethod: 'staff_override' }, { role: 'owner' });
  await assert.rejects(() => store.cancelAgreement(ag.id, {}, { role: 'owner' }), /signerat/);
  await assert.rejects(() => store.signAgreement(ag.id, {}, { role: 'owner' }), /redan signerat/);
});

test('agreement listForCustomer / listAll / stats', async () => {
  const filePath = await tmpFile('cco-agreements-quick.json');
  const store = await createCcoAgreementQuickStore({ filePath });
  await store.createAgreement({ customerId: 'cust-X' });
  const a2 = await store.createAgreement({ customerId: 'cust-X' });
  await store.createAgreement({ customerId: 'cust-Y' });
  await store.signAgreement(a2.id, { signMethod: 'bankid_stub' }, { role: 'owner' });

  assert.equal(store.listForCustomer('CUST-X').length, 2);
  assert.equal(store.listAll().length, 3);
  assert.equal(store.listAll({ state: 'signed' }).length, 1);

  const s = store.stats();
  assert.equal(s.total, 3);
  assert.equal(s.byState.signed, 1);
  assert.equal(s.bySignMethod.bankid_stub, 1);
});

// ─── PERSISTENCE ────────────────────────────────────────────

test('offer + agreement persistence survives reload from file', async () => {
  const offerPath = await tmpFile('cco-offers-quick.json');
  const agPath = await tmpFile('cco-agreements-quick.json');

  const offerStore1 = await createCcoOfferQuickStore({ filePath: offerPath });
  const o = await offerStore1.createOffer({ customerId: 'persist-1', amount: 999 });

  const agStore1 = await createCcoAgreementQuickStore({ filePath: agPath });
  const a = await agStore1.createAgreement({ customerId: 'persist-1' });
  await agStore1.signAgreement(a.id, { signMethod: 'bankid_stub' }, { role: 'owner' });

  // Reload from disk into fresh store instances.
  const offerStore2 = await createCcoOfferQuickStore({ filePath: offerPath });
  const reloadedOffer = offerStore2.getById(o.id);
  assert.ok(reloadedOffer);
  assert.equal(reloadedOffer.amount, 999);
  assert.equal(reloadedOffer.customerId, 'persist-1');

  const agStore2 = await createCcoAgreementQuickStore({ filePath: agPath });
  const reloadedAg = agStore2.getById(a.id);
  assert.ok(reloadedAg);
  assert.equal(reloadedAg.state, 'signed');

  // Verify the file is valid JSON on disk.
  const rawOffers = JSON.parse(await fs.readFile(offerPath, 'utf8'));
  assert.equal(rawOffers.offers.length, 1);
  const rawAg = JSON.parse(await fs.readFile(agPath, 'utf8'));
  assert.equal(rawAg.agreements.length, 1);
});
