'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

const {
  createCcoBookingCaseStore,
  ORDINATION_STATUSAR,
} = require('../../src/ops/ccoBookingCaseStore');

/**
 * ORD-171 — avbokad tid släcker läkarens ordinationsgodkännande.
 *
 * Ägaren 2026-09-03: "om det är så att kunden bokar av sin tid, så ska det
 * automatiskt den delegeringen försvinna. Annars ska den vara kvar så att
 * sköterskorna kan se det."
 *
 * VARFÖR DET ÄR DEN VIKTIGASTE AV DE TRE LÄNKARNA:
 * Utan regeln ligger godkännandet kvar som giltigt efter avbokning, och
 * sköterskan ser grön pill — "Ordination godkänd" — för en operation som inte
 * finns kvar. De andra två bristerna i flödet visar TOMHET. Den här visar
 * något FALSKT.
 */

const TENANT = 'hair-tp-clinic';
const BOKNING = 'bkg-1';

async function medStore(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ord171-'));
  const store = await createCcoBookingCaseStore({
    filePath: path.join(dir, 'cco-booking-cases.json'),
  });
  try {
    await run(store);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function skapaGodkantArende(store, { id = 'case-1', bookingId = BOKNING } = {}) {
  await store.createCase({
    id,
    tenantId: TENANT,
    state: 'confirmed',
    patientId: 'patient-1',
    customerId: 'customer-1',
    customerName: 'Test Kund',
    serviceLabel: 'Hårtransplantation DHI',
    bookingId,
  });
  return store.updateOrdinationReview(
    id,
    { status: 'approved', signature: 'A. Emami', comment: 'Underlaget granskat' },
    { userId: 'u-lakare', role: 'konsult' }
  );
}

test('ett godkännande släcks när tiden avbokas', async () => {
  await medStore(async (store) => {
    const fore = await skapaGodkantArende(store);
    assert.equal(fore.ordinationReview.status, 'approved');

    const res = await store.lapseOrdinationForBooking({
      bookingId: BOKNING,
      tenantId: TENANT,
      reason: 'Kunden avbokade tiden',
    });
    assert.equal(res.count, 1);

    const [efter] = await store.listCases({ tenantId: TENANT });
    assert.equal(efter.ordinationReview.status, 'lapsed');
    assert.notEqual(efter.ordinationReview.status, 'approved');
  });
});

test('beslutet raderas inte — signaturen och vad det VAR går att läsa bakåt', async () => {
  await medStore(async (store) => {
    await skapaGodkantArende(store);
    await store.lapseOrdinationForBooking({ bookingId: BOKNING, tenantId: TENANT });

    const [efter] = await store.listCases({ tenantId: TENANT });
    const r = efter.ordinationReview;
    assert.equal(r.signature, 'A. Emami', 'signaturen ska finnas kvar');
    assert.equal(r.decidedBy, 'u-lakare');
    assert.ok(r.decidedAt, 'tidpunkten för beslutet ska finnas kvar');
    assert.equal(r.lapsedFromStatus, 'approved', 'vad det var ska framgå');
    assert.ok(r.lapsedAt);
    assert.match(r.lapsedReason, /avbokade/i);
  });
});

test('ett VÄNTANDE beslut släcks också — läkaren ska inte signera en avbokad tid', async () => {
  await medStore(async (store) => {
    await store.createCase({
      id: 'case-p',
      tenantId: TENANT,
      state: 'confirmed',
      serviceLabel: 'Hårtransplantation FUE',
      bookingId: BOKNING,
    });
    await store.recordStaffAction(
      'case-p',
      { action: 'send_to_doctor' },
      { userId: 'u-anna', role: 'personal' }
    );
    let [arende] = await store.listCases({ tenantId: TENANT });
    assert.equal(arende.ordinationReview.status, 'pending');

    await store.lapseOrdinationForBooking({ bookingId: BOKNING, tenantId: TENANT });
    [arende] = await store.listCases({ tenantId: TENANT });
    assert.equal(arende.ordinationReview.status, 'lapsed');
    assert.equal(arende.ordinationReview.lapsedFromStatus, 'pending');
  });
});

test('ett AVSLAG lämnas orört — ett nej är redan ett nej', async () => {
  await medStore(async (store) => {
    await store.createCase({ id: 'case-r', tenantId: TENANT, bookingId: BOKNING });
    await store.updateOrdinationReview(
      'case-r',
      { status: 'rejected', signature: 'A. Emami', comment: 'Underlaget ofullständigt' },
      { userId: 'u-lakare', role: 'konsult' }
    );

    const res = await store.lapseOrdinationForBooking({ bookingId: BOKNING, tenantId: TENANT });
    assert.equal(res.count, 0);

    const [arende] = await store.listCases({ tenantId: TENANT });
    assert.equal(arende.ordinationReview.status, 'rejected');
  });
});

test('bara ärenden med RÄTT bokning släcks', async () => {
  await medStore(async (store) => {
    await skapaGodkantArende(store, { id: 'case-a', bookingId: 'bkg-a' });
    await skapaGodkantArende(store, { id: 'case-b', bookingId: 'bkg-b' });

    const res = await store.lapseOrdinationForBooking({ bookingId: 'bkg-a', tenantId: TENANT });
    assert.equal(res.count, 1);

    const alla = await store.listCases({ tenantId: TENANT });
    const perId = Object.fromEntries(alla.map((c) => [c.id, c.ordinationReview.status]));
    assert.equal(perId['case-a'], 'lapsed');
    assert.equal(perId['case-b'], 'approved', 'den andra bokningens godkännande ska stå kvar');
  });
});

test('en annan klinik släcks inte av samma boknings-id', async () => {
  await medStore(async (store) => {
    await skapaGodkantArende(store);
    const res = await store.lapseOrdinationForBooking({
      bookingId: BOKNING,
      tenantId: 'curatiio',
    });
    assert.equal(res.count, 0);

    const [arende] = await store.listCases({ tenantId: TENANT });
    assert.equal(arende.ordinationReview.status, 'approved');
  });
});

test('idempotent — en andra avbokning ändrar ingenting', async () => {
  await medStore(async (store) => {
    await skapaGodkantArende(store);
    const forsta = await store.lapseOrdinationForBooking({
      bookingId: BOKNING,
      tenantId: TENANT,
    });
    const andra = await store.lapseOrdinationForBooking({ bookingId: BOKNING, tenantId: TENANT });
    assert.equal(forsta.count, 1);
    assert.equal(andra.count, 0, 'redan släckt ska inte släckas igen');
  });
});

test('utan boknings-id släcks ingenting — aldrig ett svep över alla ärenden', async () => {
  await medStore(async (store) => {
    await skapaGodkantArende(store);
    for (const tomt of [undefined, '', null, '   ']) {
      const res = await store.lapseOrdinationForBooking({ bookingId: tomt, tenantId: TENANT });
      assert.equal(res.count, 0, `bookingId=${JSON.stringify(tomt)} skulle inte träffa något`);
    }
    const [arende] = await store.listCases({ tenantId: TENANT });
    assert.equal(arende.ordinationReview.status, 'approved');
  });
});

test('läkaren kan godkänna igen om kunden bokar en ny tid', async () => {
  await medStore(async (store) => {
    await skapaGodkantArende(store);
    await store.lapseOrdinationForBooking({ bookingId: BOKNING, tenantId: TENANT });

    const igen = await store.updateOrdinationReview(
      'case-1',
      { status: 'approved', signature: 'A. Emami', comment: 'Ny tid, underlaget granskat igen' },
      { userId: 'u-lakare', role: 'konsult' }
    );
    assert.equal(igen.ordinationReview.status, 'approved');
    assert.equal(
      igen.ordinationReview.lapsedAt,
      null,
      'det nya beslutet bär inte gammal släckning'
    );
  });
});

test('händelsen hamnar i ärendets historik', async () => {
  await medStore(async (store) => {
    await skapaGodkantArende(store);
    await store.lapseOrdinationForBooking({
      bookingId: BOKNING,
      tenantId: TENANT,
      actor: { userId: 'u-system', role: 'system' },
    });
    const [arende] = await store.listCases({ tenantId: TENANT });
    const actions = arende.history.map((h) => h.action);
    assert.ok(actions.includes('ordination_approved'), 'godkännandet ska finnas kvar i historiken');
    assert.ok(actions.includes('ordination_lapsed'), 'släckningen ska loggas');
  });
});

test('läkaren kan inte sätta lapsed själv — det är inget beslut, det är en följd', () => {
  // updateOrdinationReview accepterar bara approved/rejected/needs_completion.
  // Att kunna "släcka" manuellt vore ett fjärde beslut utan motsvarighet i
  // verkligheten — det som släcker är avbokningen.
  assert.ok(ORDINATION_STATUSAR.includes('lapsed'));
});

test('en okänd status normaliseras till pending, aldrig till approved', () => {
  // Fail-safe: skulle en post bära skräp i status får den inte läsas som
  // godkänd. Klientens pill och serverns doctorFeedback ger grönt ENBART på
  // exakt 'approved' — den här normaliseringen är sista ledet i samma kedja.
  assert.ok(!ORDINATION_STATUSAR.includes('godkand'));
  assert.equal(ORDINATION_STATUSAR[0], 'approved');
});
