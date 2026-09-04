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

test('en transplantation landar på operationskolumnen, inte på hela kliniken', () => {
  // ORD-186. Ägaren: "transplantationer kan få en egen kolumn så som typ jag
  // eller Egzona." Så gör Cliento redan — 8 778 bokningar ligger på kalendern
  // "Transplantation", inte på en person.
  //
  // FÖRSTA VERSIONEN (ORD-185) blockerade hela kliniken för de 48 framtida
  // transplantationerna, eftersom det inte fanns någon kolumn att lägga dem
  // på. Försiktigt men fel: det stängde också Aryas ögonlocksoperationer och
  // Sabinas ortopedi under varje transplantationsdag.
  const { block } = byggBlock(post({ staffName: 'Transplantation' }), MAPPNING, { nu: NU });
  assert.deepEqual(block.resourceIds, ['transplantation']);
});

test('en transplantationsdag stänger INTE Aryas och Sabinas kalendrar', async () => {
  // Motprovet, och skälet till att ORD-186 finns. Det här testet hade varit
  // rött före ändringen.
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord186-'));
  try {
    const store = await createCcoBookingEngineStore({ filePath: path.join(dir, 'engine.json') });
    await store.upsertAvailabilityRule(
      {
        resourceId: 'sabina',
        serviceId: 'consultation-ortho',
        weekdays: [2],
        startTimes: ['10:00', '11:00'],
      },
      { role: 'operator' }
    );
    await importeraFramtidaClientoTider({
      bokningar: [
        post({
          staffName: 'Transplantation',
          startsAt: '2026-09-22T06:00:00.000Z',
          endsAt: '2026-09-22T18:00:00.000Z',
        }),
      ],
      mappning: MAPPNING,
      bookingEngineStore: store,
      commit: true,
      nu: NU,
    });
    const sabinasTider = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate: '2026-09-22',
      toDate: '2026-09-22',
      resIds: 'sabina',
      srvIds: 'consultation-ortho',
    });
    assert.ok(sabinasTider.length > 0, 'Sabina ska kunna ta emot under en transplantationsdag');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('operationskolumnen är ingen person och kan inte bokas av kund', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord186b-'));
  try {
    const store = await createCcoBookingEngineStore({ filePath: path.join(dir, 'engine.json') });
    const resurs = (await store.listResources()).find((r) => r.id === 'transplantation');
    assert.ok(resurs, 'kolumnen ska finnas');
    assert.equal(resurs.publicBookable, false, 'kunden bokar aldrig operationssalen direkt');
    assert.notEqual(
      String(resurs.role || '').toLowerCase(),
      'sjuksköterska',
      'rollen sjuksköterska utlöser städningen av gamla scheman'
    );
    const publika = (await store.listPublicResources()).map((r) => r.id);
    assert.ok(!publika.includes('transplantation'));
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('en omappad kalender importeras INTE — den rapporteras', () => {
  // Delade kalendrar och personal som slutat. Hellre en rapporterad lucka än en
  // blockering på fel person.
  for (const kalender of ['Måns / Felix', 'Arya, Sabina, Jessica', 'Natsuko Martinsson', '']) {
    const r = byggBlock(post({ staffName: kalender }), MAPPNING, { nu: NU });
    assert.ok(r.skip, `${kalender || '(tom)'} ska hoppas över`);
    assert.match(r.skip, /omappad kalender/);
  }
});

/**
 * ORD-195 — konsultationskalendrarna fick egna kolumner.
 *
 * Fram till nu hoppades de över, och de 16 posterna rapporterades för hand-
 * läggning. Innan jag lade dem på en person mätte jag om historiken bär svaret.
 * Den gör inte det: i 1 423 fall där kunden sett flera behandlare och "senast"
 * pekade på en annan än "flest" gick 32,6 % till den senaste, 28,9 % till den
 * vanligaste — och 38,5 % till en TREDJE person. Vanligaste utgången är alltså
 * ingen av reglerna.
 */

test('de två konsultationskolumnerna importeras — och bara till sig själva', () => {
  const fysisk = byggBlock(post({ staffName: 'Fysisk konsultation' }), MAPPNING, { nu: NU });
  const online = byggBlock(post({ staffName: 'Online konsultation' }), MAPPNING, { nu: NU });
  assert.deepEqual(fysisk.block.resourceIds, ['konsultation-fysisk']);
  assert.deepEqual(online.block.resourceIds, ['konsultation-online']);
});

test('ett trettiominuterssamtal stänger INTE hela kliniken', async () => {
  // Det var skälet att inte importera dem alls. En tom resourceIds betyder
  // klinikbrett, och hade stängt Veronica, Clara och operationssalen för ett
  // telefonsamtal. Kolumnen finns just för att det inte ska hända.
  for (const kalender of ['Fysisk konsultation', 'Online konsultation']) {
    const { block } = byggBlock(post({ staffName: kalender }), MAPPNING, { nu: NU });
    assert.equal(block.resourceIds.length, 1, `${kalender} får blockera exakt en kolumn`);
    assert.ok(!block.resourceIds.includes('veronica'));
    assert.ok(!block.resourceIds.includes('transplantation'));
  }
});

test('varje kalender i facit pekar på en resurs som FINNS', async () => {
  // ORD-193 brände på precis det här: tre resurser deployades tre gånger och
  // fanns aldrig i produktion, eftersom migreringen bara gick igenom services.
  // En mappning mot ett resurs-id som inte finns ger ett block ingen ser.
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord195-'));
  try {
    const store = await createCcoBookingEngineStore({ filePath: path.join(dir, 'e.json') });
    const finns = new Set((await store.listResources()).map((r) => r.id));
    for (const [kalender, resurs] of Object.entries(MAPPNING.kalendrar)) {
      assert.ok(finns.has(resurs), `${kalender} → ${resurs}, som inte finns som resurs`);
    }
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('konsultationskolumnerna är inga personer och kan inte bokas av kund', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord195b-'));
  try {
    const store = await createCcoBookingEngineStore({ filePath: path.join(dir, 'e.json') });
    const resurser = await store.listResources();
    for (const id of ['konsultation-fysisk', 'konsultation-online']) {
      const r = resurser.find((x) => x.id === id);
      assert.ok(r, `${id} ska finnas`);
      assert.equal(r.publicBookable, false, 'kunden bokar en tjänst, inte en kolumn');
      assert.notEqual(r.role, 'Sjuksköterska', 'rollen städar gamla sköterskescheman');
    }
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('facit heter kalendrar, inte personkalendrar — och tomt är inte tyst', () => {
  // Om koden läser en nyckel som facit inte har blir VARJE post omappad och
  // importen skapar noll block, utan att något ser trasigt ut. Ett stavfel i
  // ett fältnamn är den tystaste buggen i den här filen.
  assert.ok(MAPPNING.kalendrar, 'nyckeln måste heta kalendrar');
  assert.equal(MAPPNING.personkalendrar, undefined, 'det gamla namnet ska vara borta');
  const antal = Object.keys(MAPPNING.kalendrar).length;
  assert.ok(antal >= 13, `förväntade minst 13 kalendrar, fick ${antal}`);
  // Tre av dem är inte personer. Namnet 'personkalendrar' ljög om det.
  for (const id of ['transplantation', 'konsultation-fysisk', 'konsultation-online']) {
    assert.ok(Object.values(MAPPNING.kalendrar).includes(id), `${id} ska vara mappad`);
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
      // ORD-195: konsultationskalendrarna GÅR nu in. De två som fortfarande
      // hoppas över är en delad kalender och en avbokning.
      post({ bookingId: '2', staffName: 'Fysisk konsultation' }),
      post({ bookingId: '3', staffName: 'Online konsultation' }),
      post({ bookingId: '4', staffName: 'Måns / Felix' }),
      post({ bookingId: '5', status: 'cancelled' }),
    ],
    mappning: MAPPNING,
    nu: NU,
  });
  assert.equal(res.skapade, 3);
  assert.equal(res.hoppade, 2);
  assert.equal(res.skalRakning['omappad kalender'], 1);
  assert.equal(res.skalRakning['avbokad'], 1);
  assert.equal(
    res.hoppadeposter[0].kund,
    'Jan Rydel',
    'kunden ska stå med så den går att lägga in för hand'
  );
});
