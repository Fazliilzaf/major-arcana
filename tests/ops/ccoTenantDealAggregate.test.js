'use strict';

/**
 * ORD-87 — affärsaggregatet i getTenantStats.
 *
 * 41 489 801 kr fanns redan uträknade per kund (`lifetimeValue`) och renderades
 * på varje kundkort. Det som saknades var ett led högre upp: getTenantStats
 * returnerade elva fält och inget om pengar, så frågan "vad är en kund värd"
 * gick inte att besvara i produkten trots att svaret redan var uträknat 726
 * gånger.
 *
 * TRE SAKER SOM MÅSTE HÅLLA:
 *
 * 1. NÄMNAREN. Hela registret (7 451), inte de 726 med vunnen affär.
 *    41 489 801 / 7 451 = 5 568 kr.  Med 726: 57 149 kr.
 *    Tiofaldig skillnad, och den besvarar en ANNAN fråga. Valet får inte vara
 *    implicit — därför skickas nämnaren med som eget fält.
 *
 * 2. VUNNET ≠ ÖPPET. Öppet är offerter som KAN gå igenom. Presenteras de som
 *    intäkt blir siffran en lögn i ett beslutsunderlag.
 *
 * 3. AGGREGATET = SUMMAN AV DELARNA. Ändras sumPipedriveWonDeals ska
 *    aggregatet följa med, inte glida isär från kundkorten.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const {
  sumPipedriveWonDeals,
  sumPipedriveOpenDeals,
} = require('../../src/ops/pipedriveDealHelpers');

const TENANT = 'hair-tp-clinic';

const affär = (value, status, extra = {}) => ({ value, status, ...extra });

const PATIENTER = [
  // Två vunna affärer, en öppen.
  {
    id: 'p1',
    tenantId: TENANT,
    displayName: 'Anna Andersson',
    matchStatus: 'matched',
    personnummer: '19800101-1234',
    pipedrive: { deals: [affär('30 000', 'won'), affär('12 000', 'vunnen'), affär('50 000', 'open')] },
  },
  // Bara öppna — ska INTE räknas som kund med vunnen affär.
  {
    id: 'p2',
    tenantId: TENANT,
    displayName: 'Björn Öberg',
    matchStatus: 'matched',
    pipedrive: { deals: [affär('80 000', 'öppen')] },
  },
  // Förlorad affär — varken vunnen eller öppen.
  {
    id: 'p3',
    tenantId: TENANT,
    displayName: 'Cecilia Ek',
    matchStatus: 'cliento_only',
    pipedrive: { deals: [affär('99 000', 'förlorad')] },
  },
  // Ingen Pipedrive-koppling alls. Räknas i NÄMNAREN men bidrar inte med pengar.
  { id: 'p4', tenantId: TENANT, displayName: 'David Dahl', matchStatus: 'drive_only' },
  { id: 'p5', tenantId: TENANT, displayName: 'Erik Ek', matchStatus: 'needs_review' },
  // Sammanslagen sekundär — ska inte räknas någonstans utom archivedPatients.
  {
    id: 'p6',
    tenantId: TENANT,
    displayName: 'Anna Andersson',
    matchStatus: 'merged',
    pipedrive: { deals: [affär('1 000 000', 'won')] },
  },
];

async function skapaStore(patients = PATIENTER) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ord87-'));
  fs.writeFileSync(path.join(dir, 'pm.json'), JSON.stringify({ tenants: { [TENANT]: { patients } } }));
  const store = await createCcoPatientMasterStore({ filePath: path.join(dir, 'pm.json') });
  return { store, städa: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('aggregatet är summan av per-kund-värdena', async () => {
  const { store, städa } = await skapaStore();
  const stats = await store.getTenantStats({ tenantId: TENANT });

  // Räkna om från källan, precis som kundkorten gör.
  let väntatVunnet = 0;
  let väntatÖppet = 0;
  for (const p of PATIENTER) {
    if (p.matchStatus === 'merged') continue;
    väntatVunnet += sumPipedriveWonDeals(p.pipedrive).total;
    väntatÖppet += sumPipedriveOpenDeals(p.pipedrive).total;
  }

  assert.equal(stats.wonDealsTotal, väntatVunnet, 'vunnet ska matcha per-kund-summan');
  assert.equal(stats.openDealsTotal, väntatÖppet, 'öppet ska matcha per-kund-summan');
  assert.equal(stats.wonDealsTotal, 42000, '30 000 + 12 000');
  assert.equal(stats.openDealsTotal, 130000, '50 000 + 80 000');
  städa();
});

test('NÄMNAREN är hela registret — inte kunderna med vunnen affär', async () => {
  const { store, städa } = await skapaStore();
  const stats = await store.getTenantStats({ tenantId: TENANT });

  assert.equal(stats.totalPatients, 5, 'fem aktiva, den sammanslagna räknas inte');
  assert.equal(stats.customersWithWonDeals, 1, 'bara Anna har vunnen affär');
  assert.equal(stats.lifetimeValueDenominator, 5, 'nämnaren = hela registret');

  // 42 000 / 5 = 8 400. Med 1 som nämnare blir det 42 000 — fem gånger fel.
  assert.equal(stats.lifetimeValueAverage, 8400);
  assert.notEqual(
    stats.lifetimeValueAverage,
    42000,
    'nämnaren får ALDRIG vara customersWithWonDeals — det besvarar en annan fråga'
  );
  städa();
});

test('nämnaren skickas med som eget fält, så valet inte blir implicit', async () => {
  const { store, städa } = await skapaStore();
  const stats = await store.getTenantStats({ tenantId: TENANT });
  assert.equal(typeof stats.lifetimeValueDenominator, 'number');
  assert.equal(
    stats.lifetimeValueDenominator,
    stats.totalPatients,
    'UI:t ska kunna skriva ut nämnaren utan att gissa vilken den är'
  );
  städa();
});

test('VUNNET och ÖPPET blandas aldrig ihop', async () => {
  const { store, städa } = await skapaStore();
  const stats = await store.getTenantStats({ tenantId: TENANT });

  assert.notEqual(stats.wonDealsTotal, stats.openDealsTotal);
  assert.equal(stats.customersWithWonDeals, 1);
  assert.equal(stats.customersWithOpenDeals, 2, 'Anna och Björn har öppna affärer');
  // Björn har BARA öppet — han får inte smyga in i vunnet.
  assert.ok(
    stats.wonDealsTotal < stats.openDealsTotal,
    'i den här fixturen är öppet större; blir de lika har någon slagit ihop dem'
  );
  städa();
});

test('förlorade affärer räknas varken som vunna eller öppna', async () => {
  const { store, städa } = await skapaStore();
  const stats = await store.getTenantStats({ tenantId: TENANT });
  const summa = stats.wonDealsTotal + stats.openDealsTotal;
  assert.ok(!String(summa).includes('99'), '99 000 var förlorad och ska inte finnas i någon summa');
  assert.equal(summa, 172000);
  städa();
});

test('sammanslagna sekundärer bidrar inte med pengar', async () => {
  // p6 bär en vunnen affär på 1 000 000. Räknas den har merge-hanteringen
  // läckt in i ekonomin, och totalen blir tjugofem gånger för hög.
  const { store, städa } = await skapaStore();
  const stats = await store.getTenantStats({ tenantId: TENANT });
  assert.equal(stats.archivedPatients, 1);
  assert.ok(stats.wonDealsTotal < 1000000, 'sammanslagen sekundärs affär får inte räknas');
  städa();
});

test('golv-flaggan följer med — talet är inte ett facit', async () => {
  const { store, städa } = await skapaStore();
  const stats = await store.getTenantStats({ tenantId: TENANT });
  assert.equal(stats.dealTotalsAreFloor, true);
  städa();
});

test('de elva ursprungliga fälten är oförändrade', async () => {
  // Aggregatet lades in i samma pass som de gamla räknarna skrevs om från
  // sju .filter() till en loop. Blir något av dem fel har omskrivningen
  // ändrat betydelse, inte bara form.
  const { store, städa } = await skapaStore();
  const stats = await store.getTenantStats({ tenantId: TENANT });

  assert.equal(stats.totalPatients, 5);
  assert.equal(stats.withPersonnummer, 1);
  assert.equal(stats.matched, 2);
  assert.equal(stats.clientoOnly, 1);
  assert.equal(stats.driveOnly, 1);
  assert.equal(stats.needsReview, 1);
  assert.equal(stats.pipedriveLinked, 3);
  assert.equal(stats.archivedPatients, 1);
  städa();
});

test('VAKT: inget nytt svep över bucket.patients', () => {
  // Kravet i ordern. getTenantStats filtrerade tidigare sju gånger; att lägga
  // affärsaggregatet som ett tionde svep hade varit exakt det mönster ORD-82
  // och ORD-85 tog bort. Vakten räknar iterationer över patientlistan.
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'ops', 'ccoPatientMasterStore.js'),
    'utf8'
  );
  const start = src.indexOf('async function getTenantStats');
  const slut = src.indexOf('\n  async function ', start + 10);
  const rå = src.slice(start, slut > start ? slut : undefined);

  // KOMMENTARER MÅSTE BORT FÖRST.
  //
  // Första versionen räknade i råtexten. När budgetkommentaren skrevs in vid
  // funktionen — raden "nio .filter() utan affärer" — föll vakten på sin egen
  // dokumentation. En vakt som läser prosa som kod ger falsklarm, och ett
  // falsklarm som ingen kan förklara blir en vakt någon stänger av.
  const kropp = rå
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((rad) => rad.replace(/\/\/.*$/, ''))
    .join('\n');

  const svep = (kropp.match(/\.(filter|map|forEach|reduce|some|every)\(/g) || []).length;
  assert.equal(svep, 0, `getTenantStats ska inte svepa listan alls — hittade ${svep} anrop`);

  const loopar = (kropp.match(/\bfor\s*\(/g) || []).length;
  assert.equal(loopar, 1, `exakt en genomgång förväntas, hittade ${loopar}`);
});

test('tomt register kraschar inte och ger 0 i snitt', async () => {
  const { store, städa } = await skapaStore([]);
  const stats = await store.getTenantStats({ tenantId: TENANT });
  assert.equal(stats.totalPatients, 0);
  assert.equal(stats.lifetimeValueAverage, 0, 'division med noll får inte ge NaN eller Infinity');
  assert.equal(stats.wonDealsTotal, 0);
  städa();
});
