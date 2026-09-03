'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fsp = require('node:fs/promises');

const {
  byggBlock,
  blockIdFor,
  importeraFramtidaClientoTider,
} = require('../../src/ops/clientoFramtidaImport');
const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');
const MAPPNING = require('../../config/cliento-kalendermappning.json');

/**
 * ORD-185 — de framtida Cliento-tiderna in i motorn, som block.
 *
 * Clientos API kan bara läsa. CCO kan aldrig skriva in en bokning där. Så
 * länge båda systemen delar ut tider vet Cliento ingenting om det CCO bokar —
 * samma stol, samma sköterska, två kunder.
 *
 * Mätt 2026-09-03: 381 framtida icke-avbokade bokningar, den sista 2027-05-15.
 * Fördelning på kalendrar: Veronica 118, Egzona 94, Clara 64, Transplantation
 * 49, Wendela 17, Louise 17, Online konsultation 11, Fysisk konsultation 5,
 * Sabina 4, Arya 2.
 */

const NU = Date.parse('2026-09-03T12:00:00.000Z');

const post = (extra = {}) => ({
  bookingId: '22502705',
  customerName: 'Jan Rydel',
  serviceLabel: 'Transplantation FUE',
  staffName: 'Veronica',
  startsAt: '2026-09-22T08:00:00.000Z',
  endsAt: '2026-09-22T14:00:00.000Z',
  status: 'upcoming',
  source: 'cliento_csv',
  ...extra,
});

test('en bokning på en personkalender blockerar den personen', async () => {
  const { block } = byggBlock(post(), MAPPNING, { nu: NU });
  assert.deepEqual(block.resourceIds, ['veronica']);
  assert.equal(block.dateFrom, '2026-09-22');
  assert.equal(block.dateTo, '2026-09-22');
});

test('tiderna räknas om till klinikens väggklocka', () => {
  // 08:00 UTC den 22 september är 10:00 svensk sommartid. Ett block på "08:00"
  // hade blockerat fel två timmar — och lämnat de rätta öppna.
  const { block } = byggBlock(post(), MAPPNING, { nu: NU });
  assert.equal(block.startTime, '10:00');
  assert.equal(block.endTime, '16:00');
});

test('veckodagen sätts explicit — annars gissar normaliseringen mån–fre', () => {
  // normalizeWeekdays fyller i [1,2,3,4,5] när listan är tom. En lördagstid
  // hade då fått ett block som inte gäller på lördagar, alltså inget skydd
  // alls. Samma tysta ifyllnad som bet i ORD-181.
  const lordag = byggBlock(
    post({ startsAt: '2026-09-26T08:00:00.000Z', endsAt: '2026-09-26T10:00:00.000Z' }),
    MAPPNING,
    { nu: NU }
  );
  assert.deepEqual(lordag.block.weekdays, [6], 'lördag');
  const tisdag = byggBlock(post(), MAPPNING, { nu: NU });
  assert.deepEqual(tisdag.block.weekdays, [2], 'tisdag');
});

test('en transplantation blockerar hela kliniken', () => {
  // 49 av de 65 posterna på icke-personkalendrar är transplantationer på sex
  // timmar. Vem som opererar framgår inte av datat. Tom resurslista = alla.
  //
  // MEDVETET FÖR BRETT: att blockera för mycket kostar en manuell
  // överstyrning, att blockera för lite kostar en dubbelbokad patient mitt
  // under en operation.
  const { block } = byggBlock(post({ staffName: 'Transplantation' }), MAPPNING, { nu: NU });
  assert.deepEqual(block.resourceIds, [], 'tom lista = hela kliniken');
});

test('en omappad kalender importeras INTE — den rapporteras', () => {
  // "Fysisk konsultation" och "Online konsultation" är tjänstekalendrar med
  // 15–30-minuterspass. Att blockera hela kliniken för ett trettiominuters
  // samtal vore fel åt andra hållet, och att gissa en person vore värre.
  for (const kalender of ['Fysisk konsultation', 'Online konsultation', 'Måns / Felix', '']) {
    const r = byggBlock(post({ staffName: kalender }), MAPPNING, { nu: NU });
    assert.ok(r.skip, `${kalender || '(tom)'} ska hoppas över`);
    assert.match(r.skip, /omappad kalender/);
  }
});

test('Egzonas två kalendrar landar på samma person', () => {
  // "Egzona" och "Egzona [Curatiio]" är samma människa i två varumärken.
  const a = byggBlock(post({ staffName: 'Egzona' }), MAPPNING, { nu: NU });
  const b = byggBlock(post({ staffName: 'Egzona [Curatiio]' }), MAPPNING, { nu: NU });
  assert.deepEqual(a.block.resourceIds, ['egzona']);
  assert.deepEqual(b.block.resourceIds, ['egzona']);
});

test('avbokat, passerat och testdata importeras inte', () => {
  const fall = [
    [post({ status: 'cancelled' }), /avbokad/],
    [
      post({ startsAt: '2020-01-01T08:00:00.000Z', endsAt: '2020-01-01T09:00:00.000Z' }),
      /passerat/,
    ],
    [post({ source: 'cliento_uat' }), /uat/],
    [post({ startsAt: '' }), /starttid/],
    [post({ endsAt: '' }), /sluttid/],
    [post({ bookingId: '' }), /bookingId/],
  ];
  for (const [p, matchning] of fall) {
    const r = byggBlock(p, MAPPNING, { nu: NU });
    assert.ok(r.skip, 'ska hoppas över');
    assert.match(r.skip, matchning);
  }
});

test('ett besök över midnatt klipps inte tyst', () => {
  // Det finns inga i datat — längsta posten är 360 minuter. Men att klippa det
  // vore att hitta på en sluttid, och ett block som slutar tidigare än besöket
  // öppnar tid mitt i ett pågående ingrepp.
  const r = byggBlock(
    post({ startsAt: '2026-09-22T21:00:00.000Z', endsAt: '2026-09-23T03:00:00.000Z' }),
    MAPPNING,
    { nu: NU }
  );
  assert.match(r.skip, /midnatt/);
});

test('TORRKÖRNING som standard — inget skrivs utan commit', async () => {
  // En import som skriver av misstag är svår att ångra: 381 block utspridda i
  // kalendern.
  let skrivningar = 0;
  const res = await importeraFramtidaClientoTider({
    bokningar: [post(), post({ bookingId: '2', staffName: 'Clara' })],
    mappning: MAPPNING,
    bookingEngineStore: {
      upsertCalendarBlock: async () => {
        skrivningar += 1;
      },
    },
    nu: NU,
  });
  assert.equal(res.commit, false);
  assert.equal(res.skapade, 2, 'ska rapportera vad den SKULLE gjort');
  assert.equal(skrivningar, 0, 'men inte skriva');
});

test('idempotent — en andra körning ger inte dubbla block', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord185-'));
  try {
    const store = await createCcoBookingEngineStore({ filePath: path.join(dir, 'engine.json') });
    // Råa rader, inte listCalendarBlocks(): den senare EXPANDERAR block över
    // ett datumintervall och ger noll utan datum. Idempotens handlar om antalet
    // lagrade rader, inte om hur många dagar de täcker.
    const rader = () => store._state.calendarBlocks.length;
    const fore = rader();
    const bokningar = [post(), post({ bookingId: '2', staffName: 'Clara' })];

    await importeraFramtidaClientoTider({
      bokningar,
      mappning: MAPPNING,
      bookingEngineStore: store,
      commit: true,
      nu: NU,
    });
    const efterForsta = rader();
    assert.equal(efterForsta, fore + 2);

    // Andra körningen — som på cutover-morgonen.
    await importeraFramtidaClientoTider({
      bokningar,
      mappning: MAPPNING,
      bookingEngineStore: store,
      commit: true,
      nu: NU,
    });
    assert.equal(rader(), efterForsta, 'inga dubbletter');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('blockets id härleds ur Clientos id — det är därför den är idempotent', () => {
  assert.equal(blockIdFor('22502705'), 'cliento-import-22502705');
  assert.equal(byggBlock(post(), MAPPNING, { nu: NU }).block.blockId, 'cliento-import-22502705');
});

test('den importerade tiden går inte längre att boka', async () => {
  // Hela poängen. Utan det här dubbelbokar motorn varje befintlig patient.
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord185b-'));
  try {
    const store = await createCcoBookingEngineStore({ filePath: path.join(dir, 'engine.json') });
    const dag = '2026-09-22';
    const fore = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate: dag,
      toDate: dag,
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });

    await importeraFramtidaClientoTider({
      bokningar: [
        post({
          staffName: 'Egzona',
          startsAt: '2026-09-22T06:00:00.000Z',
          endsAt: '2026-09-22T20:00:00.000Z',
        }),
      ],
      mappning: MAPPNING,
      bookingEngineStore: store,
      commit: true,
      nu: NU,
    });

    const efter = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate: dag,
      toDate: dag,
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    assert.ok(fore.length > 0, 'det fanns tider att blockera');
    assert.equal(efter.length, 0, 'hela dagen ska vara blockerad');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('rapporten säger vad som INTE gick in, och varför', async () => {
  // En import som tyst hoppar över poster är farligare än en som inte körs:
  // man tror att kalendern är skyddad.
  const res = await importeraFramtidaClientoTider({
    bokningar: [
      post(),
      post({ bookingId: '2', staffName: 'Fysisk konsultation' }),
      post({ bookingId: '3', staffName: 'Online konsultation' }),
      post({ bookingId: '4', status: 'cancelled' }),
    ],
    mappning: MAPPNING,
    nu: NU,
  });
  assert.equal(res.skapade, 1);
  assert.equal(res.hoppade, 3);
  assert.equal(res.skalRakning['omappad kalender'], 2);
  assert.equal(res.skalRakning['avbokad'], 1);
  assert.equal(
    res.hoppadeposter[0].kund,
    'Jan Rydel',
    'kunden ska stå med så den går att lägga in för hand'
  );
});
