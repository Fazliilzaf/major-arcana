'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ORDINATIONSFONSTER_TIMMAR,
  FONSTER,
  bedomOrdinationsfonster,
  ordinationForfallen,
  fonsterEtikett,
} = require('../../src/ops/ordinationsfonster');
const { DEFAULT_DEPOSIT_RETENTION_HOURS } = require('../../src/ops/ccoBookingPolicy');

/**
 * ORD-180 — ordinationen efterfrågas när det är dags, inte alltid.
 *
 * Ägaren 2026-09-03: "två veckor innan varje operationstillfälle, de ska ha en
 * ordination. Så allt annat ordinationer som är bakåt i tiden ska inte vara
 * med." Och: "Målet är inte att göra det för de kunder som har varit."
 *
 * BERÄKNAT, INTE SKRIVET. Den uppenbara lösningen är ett schemalagt jobb som
 * vid T−14 sätter ordinationReview.status = 'pending'. Den är fel av samma
 * skäl som en lagrad "aktiv"-flagga på en delegering är fel:
 *
 *   - Kunden bokar om till tre månader fram. Den skrivna 'pending' ligger kvar
 *     och läkaren har en post i kön för något som inte är nära.
 *   - Tiden bokas in med tio dagars varsel. Jobbet hann aldrig köra, och
 *     ordinationen efterfrågas aldrig.
 *
 * En beräkning kan inte bli inaktuell. Den frågar klockan varje gång.
 *
 * `ordinationReview` skrivs alltjämt — men bara av en människa som fattar ett
 * beslut. Systemet skriver aldrig ett tillstånd åt läkaren.
 */

const NU = Date.parse('2026-09-03T12:00:00.000Z');
const om = (dagar) => new Date(NU + dagar * 24 * 3600000).toISOString();

const transplantation = (startsAt) => ({ serviceId: 'fue', startsAt });
const konsultation = (startsAt) => ({ serviceId: 'consultation-physical', startsAt });

test('fönstret är fjorton dygn', () => {
  assert.equal(ORDINATIONSFONSTER_TIMMAR, 336);
});

test('fönstret öppnar precis fjorton dygn före', () => {
  // Gränsen mätt från båda hållen, så att ett tecknfel inte kan smyga igenom.
  assert.equal(bedomOrdinationsfonster(transplantation(om(15)), NU).status, FONSTER.FOR_TIDIGT);
  assert.equal(bedomOrdinationsfonster(transplantation(om(14)), NU).status, FONSTER.OPPET);
  assert.equal(bedomOrdinationsfonster(transplantation(om(13)), NU).status, FONSTER.OPPET);
  assert.equal(bedomOrdinationsfonster(transplantation(om(1)), NU).status, FONSTER.OPPET);
});

test('en operation ett halvår bort efterfrågar ingen ordination ännu', () => {
  const f = bedomOrdinationsfonster(transplantation(om(180)), NU);
  assert.equal(f.status, FONSTER.FOR_TIDIGT);
  assert.equal(ordinationForfallen(transplantation(om(180)), NU), false);
  assert.equal(f.oppnarAt, om(180 - 14), 'och den ska säga NÄR den öppnar');
});

test('bakåt i tiden ska inte med — ägarens ord', () => {
  assert.equal(bedomOrdinationsfonster(transplantation(om(-2)), NU).status, FONSTER.PASSERAT);
  assert.equal(bedomOrdinationsfonster(transplantation(om(-200)), NU).status, FONSTER.PASSERAT);
  assert.equal(ordinationForfallen(transplantation(om(-2)), NU), false);
});

test('ett PÅGÅENDE ingrepp göms inte — mitt eget fel, fångat av sviten', () => {
  // FÖRSTA VERSIONEN STÄNGDE FÖNSTRET VID STARTTIDEN. En operation utan
  // godkänd ordination försvann då tyst ur läkarens kö klockan 09:00:01 — den
  // farligaste minuten att gömma något i hela kedjan.
  //
  // Upptäckt genom att ett befintligt test (daily-work-queue) hade en fixtur
  // med startsAt = nu, och blev rött.
  //
  // Fönstret stänger när ingreppet är ÖVER: endsAt när den finns, annars vid
  // slutet av operationsdagen i klinikens tidszon.
  const startadNyss = { serviceId: 'fue', startsAt: new Date(NU - 2 * 3600000).toISOString() };
  assert.equal(bedomOrdinationsfonster(startadNyss, NU).status, FONSTER.OPPET);
  assert.equal(ordinationForfallen(startadNyss, NU), true, 'ska ligga kvar i kön');

  // Exakt starttid räknas inte längre som passerad.
  assert.equal(bedomOrdinationsfonster(transplantation(om(0)), NU).status, FONSTER.OPPET);
});

test('endsAt stänger fönstret när den finns', () => {
  // ORD-179 fyller i endsAt vid bekräftelse, så det är den exakta gränsen när
  // den är känd. Dagsslutet är bara reserven.
  const avslutad = {
    serviceId: 'fue',
    startsAt: new Date(NU - 9 * 3600000).toISOString(),
    endsAt: new Date(NU - 1 * 3600000).toISOString(),
  };
  assert.equal(bedomOrdinationsfonster(avslutad, NU).status, FONSTER.PASSERAT);

  const pagaende = {
    serviceId: 'fue',
    startsAt: new Date(NU - 2 * 3600000).toISOString(),
    endsAt: new Date(NU + 6 * 3600000).toISOString(),
  };
  assert.equal(bedomOrdinationsfonster(pagaende, NU).status, FONSTER.OPPET);
});

test('en konsultation hamnar aldrig i fönstret, hur nära den än ligger', () => {
  // Ägaren: "det är inte på konsultationer ordinationer ska skapas."
  for (const d of [0.5, 1, 7, 13, 14, 90]) {
    assert.equal(
      bedomOrdinationsfonster(konsultation(om(d)), NU).status,
      FONSTER.EJ_RELEVANT,
      `${d} dygn bort`
    );
  }
});

test('en oklassificerad tjänst stängs INTE av — null är inte nej', () => {
  // bleph-upper står som ej beslutad i facit. Att låta null bete sig som ett
  // beslutat nej hade gömt frågan i stället för att ställa den.
  const oklar = { serviceId: 'bleph-upper', startsAt: om(7) };
  assert.equal(bedomOrdinationsfonster(oklar, NU).status, FONSTER.OPPET);
  assert.equal(bedomOrdinationsfonster(oklar, NU).kravsOrdination, null);
});

test('en transplantation utan tid göms inte — den flaggas', () => {
  // Fail-safe. Ett ingrepp utan tidpunkt är inte ett avklarat ärende, det är
  // ett ärende ingen kan tidsätta. Att dölja det hade fått en lucka att se ut
  // som ordning.
  const utanTid = { serviceId: 'dhi' };
  assert.equal(bedomOrdinationsfonster(utanTid, NU).status, FONSTER.OKAND_TID);
  assert.equal(ordinationForfallen(utanTid, NU), true, 'ska synas i kön');
});

test('scheduledAt duger när startsAt saknas', () => {
  const f = bedomOrdinationsfonster({ serviceId: 'fue', scheduledAt: om(7) }, NU);
  assert.equal(f.status, FONSTER.OPPET);
});

test('skräp i tidfältet ger okänd tid, inte ett tyst nej', () => {
  const f = bedomOrdinationsfonster({ serviceId: 'fue', startsAt: 'inte ett datum' }, NU);
  assert.equal(f.status, FONSTER.OKAND_TID);
  assert.notEqual(f.status, FONSTER.EJ_RELEVANT);
});

test('fönstret räknar ut timmar kvar, inte bara ett ja eller nej', () => {
  const f = bedomOrdinationsfonster(transplantation(om(10)), NU);
  assert.equal(f.timmarKvar, 240);
  assert.equal(f.oppnarAt, om(-4), 'fönstret öppnade för fyra dygn sedan');
});

test('samma tal som förskottsregeln — men två skilda beslut', () => {
  // Det är ingen slump att de sammanfaller: efter T−14 täcker förskottet den
  // reserverade tiden, alltså är operationen låst, alltså behövs ordinationen.
  //
  // Men de är TVÅ beslut. Ändrar kliniken återbetalningen till 21 dygn ska
  // ordinationsfönstret inte följa med automatiskt. Den här raden blir röd då,
  // så att någon får ta ställning i stället för att märka det i efterhand.
  assert.equal(
    ORDINATIONSFONSTER_TIMMAR,
    DEFAULT_DEPOSIT_RETENTION_HOURS,
    'talen skiljer sig åt — är det avsiktligt? Ta ställning, ändra inte bara testet.'
  );
});

test('varje läge har en text — inget läge visas som tomrum', () => {
  for (const status of Object.values(FONSTER)) {
    assert.ok(fonsterEtikett(status).length > 5, `${status} saknar text`);
  }
});

test('en beräkning kan inte bli inaktuell — samma ärende, olika klocka', () => {
  // Kärnan i valet att beräkna i stället för att skriva. Ärendet rörs inte;
  // bara tiden går. En skriven flagga hade stått kvar på sitt gamla värde.
  const arende = transplantation('2026-10-01T09:00:00.000Z');
  const langtIfran = Date.parse('2026-08-01T00:00:00.000Z');
  const nara = Date.parse('2026-09-25T00:00:00.000Z');
  const efterat = Date.parse('2026-10-02T00:00:00.000Z');

  assert.equal(bedomOrdinationsfonster(arende, langtIfran).status, FONSTER.FOR_TIDIGT);
  assert.equal(bedomOrdinationsfonster(arende, nara).status, FONSTER.OPPET);
  assert.equal(bedomOrdinationsfonster(arende, efterat).status, FONSTER.PASSERAT);
});
