'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fsp = require('node:fs/promises');

const { createCcoBookingCaseStore } = require('../../src/ops/ccoBookingCaseStore');
const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');
const { caseRequiresOrdination } = require('../../src/ops/ordinationRequirement');
const { bookingMondayWindow } = require('../helpers/bookingTestDates');

/**
 * ORD-179 — bokningsärendet skapas när tiden bekräftas.
 *
 * DET HÄR VAR KEDJANS SAKNADE LÄNK. Läkarens ordinationsflöde,
 * delegeringskontrollen, avbokningen som släcker godkännandet (ORD-171),
 * underlagshashen (ORD-172) och ordinationskravet (ORD-177) läser alla
 * bokningsärenden. Ingen kod skapade dem vid bekräftelse.
 * cco-booking-cases.json fanns inte ens på disk i produktion — verifierat via
 * SSH 2026-09-03. Ett godkännandeflöde utan något att godkänna.
 *
 * EN RÄTTELSE JAG ÄR SKYLDIG ATT SKRIVA UT. I ORD-177 påstod jag att den gamla
 * regexen "svarade nej på 369 ärenden i produktion". De 369 ligger i
 * ccoBookingStore (cco-booking.json) — en ANNAN store, som personalportalen
 * aldrig läser. Portalen läser ccoBookingCaseStore, och den var tom.
 *
 * Fältmätningen var alltså riktig men slutsatsen övertolkad: regexen körde på
 * noll verkliga poster, inte på 369. Rättelsen i ORD-177 är fortfarande rätt —
 * den läser id i stället för etikett — men den var förebyggande, inte akut.
 * Från och med ORD-179 blir den akut, eftersom ärenden nu faktiskt uppstår.
 */

async function medStore(run) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord179-'));
  try {
    const store = await createCcoBookingCaseStore({ filePath: path.join(dir, 'cases.json') });
    await run(store);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

const BEKRAFTELSE = {
  bookingId: 'bk-1',
  tenantId: 'hair-tp-clinic',
  conversationId: 'conv-1',
  customerEmail: 'kund@example.com',
  customerName: 'Test Kund',
  serviceId: 'fue',
  serviceLabel: 'FUE hårtransplantation',
  resourceId: 'fazli',
  startsAt: '2030-06-01T08:00:00.000Z',
  endsAt: '2030-06-01T16:00:00.000Z',
};

test('en bekräftad tid ger ett bokningsärende', async () => {
  await medStore(async (store) => {
    const res = await store.upsertCaseForBooking(BEKRAFTELSE, { role: 'system' });
    assert.equal(res.created, true);
    assert.equal(res.case.bookingId, 'bk-1');
    assert.equal(res.case.serviceId, 'fue');
    assert.equal(res.case.state, 'confirmed');
    assert.equal(res.case.startsAt, BEKRAFTELSE.startsAt);
  });
});

test('ärendet bär serviceId — annars kan ordinationskravet inte avgöras', async () => {
  // Kopplingen till ORD-177. Utan id faller kravet till null och ärendet
  // hamnar i läkarens kö som "oklassificerat" i stället för som en
  // transplantation som behöver godkännas.
  await medStore(async (store) => {
    const { case: arende } = await store.upsertCaseForBooking(BEKRAFTELSE, { role: 'system' });
    assert.equal(caseRequiresOrdination(arende), true, 'FUE ska kräva ordination');
  });
});

test('en konsultation ger ett ärende men inget ordinationskrav', async () => {
  // Ägaren 2026-09-03: "det är inte på konsultationer ordinationer ska skapas."
  // Ärendet ska ändå finnas — det är personalens arbetsenhet.
  await medStore(async (store) => {
    const { case: arende } = await store.upsertCaseForBooking(
      { ...BEKRAFTELSE, bookingId: 'bk-2', serviceId: 'consultation-physical' },
      { role: 'system' }
    );
    assert.ok(arende, 'ärendet ska finnas');
    assert.equal(caseRequiresOrdination(arende), false);
  });
});

test('en andra bekräftelse ger inte ett andra ärende', async () => {
  // confirmBooking anropas om via reserveAndConfirmIdempotent och vid
  // ombokning. Dubbletter hade gett läkaren samma patient två gånger i kön.
  await medStore(async (store) => {
    await store.upsertCaseForBooking(BEKRAFTELSE, { role: 'system' });
    const andra = await store.upsertCaseForBooking(BEKRAFTELSE, { role: 'system' });
    assert.equal(andra.created, false);
    const alla = await store.listCases({ limit: 50 });
    assert.equal(alla.length, 1, 'ett ärende, inte två');
  });
});

test('ombokning FLYTTAR ärendet, den skapar inte ett nytt', async () => {
  // Utan det här hade den gamla posten legat kvar som `confirmed` med en
  // avbokad tid under sig — en aktiv rad utan verklighet bakom.
  await medStore(async (store) => {
    const forst = await store.upsertCaseForBooking(BEKRAFTELSE, { role: 'system' });
    const flyttad = await store.upsertCaseForBooking(
      {
        ...BEKRAFTELSE,
        bookingId: 'bk-99',
        startsAt: '2030-07-01T08:00:00.000Z',
        endsAt: '2030-07-01T16:00:00.000Z',
        rescheduledFromBookingId: 'bk-1',
      },
      { role: 'system' }
    );
    assert.equal(flyttad.created, false, 'inget nytt ärende');
    assert.equal(flyttad.rescheduled, true);
    assert.equal(flyttad.case.id, forst.case.id, 'samma ärende');
    assert.equal(flyttad.case.bookingId, 'bk-99');
    assert.equal(flyttad.case.startsAt, '2030-07-01T08:00:00.000Z');

    const alla = await store.listCases({ limit: 50 });
    assert.equal(alla.length, 1, 'en rad, inte två');
  });
});

test('ombokning upphäver inte läkarens bedömning', async () => {
  // En ombokning flyttar en tid. Att rensa treatmentPlan eller ordinationReview
  // här hade tvingat fram ett nytt godkännande för att kunden bytte dag.
  // Byter TJÄNSTEN vid ombokningen fångas det i stället av underlagshashen
  // (ORD-172), som jämför innehållet mot det läkaren faktiskt godkände.
  await medStore(async (store) => {
    const { case: skapat } = await store.upsertCaseForBooking(BEKRAFTELSE, { role: 'system' });
    await store.updateHandoffChecklist(
      skapat.id,
      { journalReady: true },
      { userId: 'ops-1', role: 'operator' }
    );

    const flyttad = await store.upsertCaseForBooking(
      { ...BEKRAFTELSE, bookingId: 'bk-99', rescheduledFromBookingId: 'bk-1' },
      { role: 'system' }
    );
    assert.equal(flyttad.case.handoffChecklist.journalReady, true, 'checklistan ska överleva');
  });
});

test('utan bookingId skapas inget ärende', async () => {
  // Ett ärende utan bokning går inte att avboka, inte att släcka och inte att
  // koppla till en tid. Hellre inget än ett som inte hör ihop med något.
  await medStore(async (store) => {
    const res = await store.upsertCaseForBooking({ ...BEKRAFTELSE, bookingId: '' });
    assert.equal(res.created, false);
    assert.equal(res.case, null);
    assert.equal((await store.listCases({ limit: 50 })).length, 0);
  });
});

test('ett tomt inkommande fält raderar inte vad ärendet redan vet', async () => {
  // Bekräftelsen bär inte alltid allt. Att skriva null över ett känt serviceId
  // hade tagit bort ordinationskravet från en transplantation.
  await medStore(async (store) => {
    await store.upsertCaseForBooking(BEKRAFTELSE, { role: 'system' });
    const efter = await store.upsertCaseForBooking(
      { bookingId: 'bk-1', tenantId: 'hair-tp-clinic' },
      { role: 'system' }
    );
    assert.equal(efter.case.serviceId, 'fue', 'serviceId ska stå kvar');
    assert.equal(efter.case.startsAt, BEKRAFTELSE.startsAt, 'tiden ska stå kvar');
  });
});

test('MOTORN anropar hooken — kedjan är kopplad, inte bara byggd', async () => {
  // De andra testerna i filen mäter lagret ovanför hooken. Om ingen anropar
  // den är de gröna av fel skäl. Det här kör en riktig bekräftelse genom
  // bokningsmotorn och kräver att ärendet dyker upp i ärendestoren.
  //
  // Verifierat genom mutation: kopplas onBookingConfirmed-anropet bort i
  // confirmBooking blir just den här raden röd, medan resten står kvar gröna.
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord179-motor-'));
  try {
    const caseStore = await createCcoBookingCaseStore({
      filePath: path.join(dir, 'cases.json'),
    });
    const engine = await createCcoBookingEngineStore({
      filePath: path.join(dir, 'engine.json'),
      onBookingConfirmed: (händelse) =>
        caseStore.upsertCaseForBooking(händelse, { userId: 'system', role: 'system' }),
    });

    const { fromDate, toDate } = bookingMondayWindow();
    const tider = await engine.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    assert.ok(tider.length >= 1, 'behöver minst en ledig tid att boka');
    const vald = tider[0];

    await engine.reserveSlots({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-179',
      customerEmail: 'kedjan@example.com',
      customerName: 'Kedjan',
      selectedSlots: [vald],
    });
    const bokning = await engine.confirmBooking({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-179',
      customerEmail: 'kedjan@example.com',
      customerName: 'Kedjan',
      slot: vald,
    });
    assert.equal(bokning.status, 'confirmed');

    const arenden = await caseStore.listCases({ limit: 50 });
    assert.equal(arenden.length, 1, 'bekräftelsen ska ha gett exakt ett ärende');
    assert.equal(arenden[0].bookingId, bokning.bookingId, 'och det ska peka på bokningen');
    assert.equal(arenden[0].serviceId, 'consultation-physical', 'med tjänsten ifylld');
    assert.equal(arenden[0].startsAt, bokning.slot.startsAt);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('hela kedjan: bekräftelse → ärende → godkännande → avbokning släcker', async () => {
  // Det här är poängen med ORD-179. Alla delarna fanns; ingen av dem kunde
  // köras, eftersom första steget aldrig hände.
  await medStore(async (store) => {
    const { case: arende } = await store.upsertCaseForBooking(BEKRAFTELSE, { role: 'system' });
    assert.equal(caseRequiresOrdination(arende), true);

    await store.updateOrdinationReview(
      arende.id,
      { status: 'approved', comment: 'Godkänd', signature: 'Arya Emami' },
      { userId: 'arya', role: 'lakare' }
    );
    const godkant = await store.getCase(arende.id);
    assert.equal(godkant.ordinationReview.status, 'approved');

    const res = await store.lapseOrdinationForBooking({
      bookingId: 'bk-1',
      tenantId: 'hair-tp-clinic',
      reason: 'Kunden avbokade tiden',
      actor: { userId: 'system', role: 'system' },
    });
    assert.equal(res.count, 1, 'avbokningen ska hitta ärendet');
    const slackt = await store.getCase(arende.id);
    assert.equal(slackt.ordinationReview.status, 'lapsed');
  });
});
