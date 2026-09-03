'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

const {
  createCcoBookingCaseStore,
  beraknaUnderlagsHash,
} = require('../../src/ops/ccoBookingCaseStore');

/**
 * ORD-172 — läkaren signerar ett INNEHÅLL, inte ett ärende-id.
 *
 * Före det här signerade läkaren mot ett ärende-id. Behandlingsplanen kunde
 * ändras efteråt — metod, graftantal, zoner, anestesi — utan att godkännandet
 * märkte något. Och eftersom ägarens flöde uttryckligen lägger godkännandet
 * EFTER att offert, samtycken, avtal och 20 % är klara, är en ändring efteråt
 * just det fall som ska synas.
 *
 * Testet avgör INTE om en ändring ska blockera. Det är ett kliniskt beslut och
 * hör ihop med grinden. Det här mäter bara: har underlaget ändrats sedan
 * signaturen?
 *
 * MÄTT 2026-09-03: `treatmentPlan` sätts BARA vid createCase
 * (ccoBookingCaseStore.js:323). Ingen kodväg ändrar den efteråt. Hashen är
 * alltså förebyggande, inte en lagning av ett öppet hål — men läkarens kö
 * kommer att behöva en väg att justera planen, och då ska skyddet redan
 * finnas. Samma skäl som att avbokningsregeln byggdes medan storen var tom.
 *
 * Därför prövas ändringsfallet mot hashfunktionen direkt, inte genom storen:
 * storen kan i dag inte utföra den ändring testet handlar om.
 */

const TENANT = 'hair-tp-clinic';

async function medStore(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ord172-'));
  const store = await createCcoBookingCaseStore({
    filePath: path.join(dir, 'cco-booking-cases.json'),
  });
  try {
    await run(store);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const PLAN = {
  method: 'DHI',
  graftsTotal: '3200',
  price: '49900',
  anesthesia: 'Carbocain med Adrenalin',
  zones: [
    { label: 'Hårlinje', grafts: '1800' },
    { label: 'Hjässa', grafts: '1400' },
  ],
};

async function godkantArende(store, { plan = PLAN } = {}) {
  await store.createCase({
    id: 'case-1',
    tenantId: TENANT,
    state: 'confirmed',
    patientId: 'patient-1',
    serviceId: 'dhi',
    serviceLabel: 'Hårtransplantation DHI',
    treatmentPlan: plan,
  });
  return store.updateOrdinationReview(
    'case-1',
    { status: 'approved', signature: 'A. Emami' },
    { userId: 'u-lakare', role: 'konsult' }
  );
}

test('godkännandet bär en hash av underlaget', async () => {
  await medStore(async (store) => {
    const d = await godkantArende(store);
    assert.ok(d.ordinationReview.approvedContentHash, 'hash ska sparas vid beslut');
    assert.match(d.ordinationReview.approvedContentHash, /^[0-9a-f]{64}$/);
    assert.equal(d.ordinationReview.contentChangedSinceApproval, false);
  });
});

test('ett beslut UTAN hash påstår inte att inget ändrats', async () => {
  // Poster fattade före ORD-172 saknar hash. Då är svaret null — inte false.
  // En boolean här hade dolt okunskap som ett godkänt läge.
  await medStore(async (store) => {
    await store.createCase({ id: 'case-g', tenantId: TENANT, treatmentPlan: PLAN });
    const arende = await store.getCase('case-g');
    // Inget beslut alls → ingen review, inget att jämföra.
    assert.equal(arende.ordinationReview, null);

    await store.recordStaffAction(
      'case-g',
      { action: 'send_to_doctor' },
      { userId: 'u-anna', role: 'personal' }
    );
    const vantande = await store.getCase('case-g');
    assert.equal(
      vantande.ordinationReview.contentChangedSinceApproval,
      null,
      'utan hash ska svaret vara null, aldrig false'
    );
  });
});

test('hashen är stabil över omläsning från disk', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ord172-disk-'));
  const filePath = path.join(dir, 'cco-booking-cases.json');
  try {
    const forsta = await createCcoBookingCaseStore({ filePath });
    await forsta.createCase({
      id: 'case-1',
      tenantId: TENANT,
      patientId: 'patient-1',
      serviceId: 'dhi',
      treatmentPlan: PLAN,
    });
    const beslut = await forsta.updateOrdinationReview(
      'case-1',
      { status: 'approved', signature: 'A. Emami' },
      { userId: 'u-lakare', role: 'konsult' }
    );

    // Ny store, samma fil — hashen får inte ändras av en omläsning.
    const andra = await createCcoBookingCaseStore({ filePath });
    const efter = await andra.getCase('case-1');
    assert.equal(
      efter.ordinationReview.approvedContentHash,
      beslut.ordinationReview.approvedContentHash
    );
    assert.equal(efter.ordinationReview.contentChangedSinceApproval, false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('även avslag och begärd komplettering bär hash', async () => {
  for (const status of ['rejected', 'needs_completion']) {
    await medStore(async (store) => {
      await store.createCase({ id: 'case-1', tenantId: TENANT, treatmentPlan: PLAN });
      const d = await store.updateOrdinationReview(
        'case-1',
        { status, signature: 'A. Emami', comment: 'Underlaget behöver ses över' },
        { userId: 'u-lakare', role: 'konsult' }
      );
      assert.ok(
        d.ordinationReview.approvedContentHash,
        `${status} gäller också ett bestämt underlag`
      );
    });
  }
});

test('en ändrad plan ger en annan hash — metod, graft, anestesi, zon, pris', () => {
  const bas = { patientId: 'p1', serviceId: 'dhi', treatmentPlan: PLAN };
  const original = beraknaUnderlagsHash(bas);

  const andringar = {
    metod: { ...PLAN, method: 'FUE' },
    graftantal: { ...PLAN, graftsTotal: '4000' },
    anestesi: { ...PLAN, anesthesia: 'Marcain med Adrenalin' },
    pris: { ...PLAN, price: '59900' },
    zon: { ...PLAN, zones: [{ label: 'Hårlinje', grafts: '2500' }] },
    individuell_ordination: { ...PLAN, individualOrdinationNote: 'Halverad dos' },
  };
  for (const [vad, plan] of Object.entries(andringar)) {
    assert.notEqual(
      beraknaUnderlagsHash({ ...bas, treatmentPlan: plan }),
      original,
      `ändrad ${vad} skulle ha gett en annan hash`
    );
  }
});

test('omordnade zoner ger SAMMA hash — signalen får inte ryta i onödan', () => {
  const bas = { patientId: 'p1', serviceId: 'dhi', treatmentPlan: PLAN };
  const omvand = {
    ...bas,
    treatmentPlan: { ...PLAN, zones: [PLAN.zones[1], PLAN.zones[0]] },
  };
  assert.equal(
    beraknaUnderlagsHash(omvand),
    beraknaUnderlagsHash(bas),
    'samma zoner i annan ordning är ingen klinisk ändring'
  );
});

test('byte av patient eller tjänst ger en annan hash', () => {
  const bas = { patientId: 'p1', serviceId: 'dhi', treatmentPlan: PLAN };
  assert.notEqual(beraknaUnderlagsHash({ ...bas, patientId: 'p2' }), beraknaUnderlagsHash(bas));
  assert.notEqual(beraknaUnderlagsHash({ ...bas, serviceId: 'fue' }), beraknaUnderlagsHash(bas));
});
