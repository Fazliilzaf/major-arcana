'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');
const OPPET = require('../../config/klinikens-oppettider.json');
const { utcTillKlinikTid } = require('../../src/ops/klinikTid');

/**
 * ORD-189 — kliniken är stängd på röda dagar.
 *
 * MÄTT 2026-09-03, och det var värre än att öppettiderna låg som konstanter:
 *
 *   47 lediga tider   Juldagen 2026-12-25
 *   47 lediga tider   Nyårsdagen 2027-01-01
 *   36 lediga tider   en vanlig tisdag
 *
 * Det fanns inget begrepp för röd dag alls. Kliniken var inte bara bokningsbar
 * på juldagen — den hade FLER tider än en vanlig tisdag, eftersom
 * sköterskeschemats fyraveckorscykel råkade lägga fler skift där.
 *
 * En kund bokar 10:00 på juldagen, får en bekräftelse, kommer till Vasaplatsen
 * och möter en låst dörr. Ingenting i systemet hade sagt emot.
 */

async function medMotor(run) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord189-'));
  const filePath = path.join(dir, 'engine.json');
  try {
    const store = await createCcoBookingEngineStore({ filePath });
    await run({ store, filePath });
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

const tider = (store, datum) =>
  store.listAvailability({
    tenantId: 'tenant-a',
    fromDate: datum,
    toDate: datum,
    srvIds: 'consultation-physical',
  });

test('juldagen och nyårsdagen är stängda', async () => {
  await medMotor(async ({ store }) => {
    for (const datum of ['2026-12-24', '2026-12-25', '2026-12-26', '2026-12-31', '2027-01-01']) {
      assert.equal((await tider(store, datum)).length, 0, `${datum} ska vara stängd`);
    }
  });
});

test('vanliga dagar rörs inte', async () => {
  // Att stänga röda dagar får inte råka stänga verksamheten. Före ändringen gav
  // en vanlig tisdag 36 tider och en lördag 32 — de ska stå kvar.
  await medMotor(async ({ store }) => {
    assert.ok((await tider(store, '2026-12-08')).length > 0, 'tisdag ska vara öppen');
    assert.ok((await tider(store, '2026-12-05')).length > 0, 'lördag ska vara öppen');
  });
});

test('varje röd dag i konfigen ger en stängd dag', async () => {
  await medMotor(async ({ store, filePath }) => {
    const raa = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const stangda = raa.calendarBlocks.filter((b) => String(b.blockId).startsWith('stangt-'));
    assert.equal(stangda.length, OPPET.stangda_dagar.length);
    for (const b of stangda) {
      assert.deepEqual(b.resourceIds, [], 'en stängd dag gäller hela kliniken');
      assert.equal(b.dateFrom, b.dateTo, 'en dag, inte ett intervall');
    }
    void store;
  });
});

test('veckodagen sätts explicit — annars gissar normaliseringen mån–fre', async () => {
  // Samma tysta ifyllnad som bet i ORD-181 och ORD-185. Juldagen 2026 är en
  // fredag, annandagen en lördag. Ett block utan veckodag hade gällt mån–fre
  // och därmed lämnat annandagen öppen.
  await medMotor(async ({ filePath }) => {
    const raa = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const annandag = raa.calendarBlocks.find((b) => b.blockId === 'stangt-2026-12-26');
    assert.ok(annandag, 'annandag jul ska finnas');
    assert.deepEqual(annandag.weekdays, [6], 'lördag');
  });
});

test('en omstart ger inga dubbla stängda dagar', async () => {
  await medMotor(async ({ filePath }) => {
    const fore = JSON.parse(fs.readFileSync(filePath, 'utf8')).calendarBlocks.length;
    await createCcoBookingEngineStore({ filePath });
    const efter = JSON.parse(fs.readFileSync(filePath, 'utf8')).calendarBlocks.length;
    assert.equal(efter, fore);
  });
});

test('öppettiderna kommer ur konfigen, inte ur koden', async () => {
  // Ingen i personalen kunde ändra en öppettid utan att någon ändrade kod och
  // deployade. Talen läses nu ur filen — den här testen binder ihop dem, så att
  // en ändring i konfigen inte tyst blir verkningslös.
  const vardag = OPPET.oppettider['2'];
  const lordag = OPPET.oppettider['6'];
  assert.equal(vardag.fran, '10:00');
  assert.equal(vardag.till, '18:00');
  assert.equal(lordag.till, '16:00', 'lördagen stänger tidigare');
  assert.equal(OPPET.konsultationsminuter, 45);

  // MUTATIONSTESTAT OCH SKÄRPT. Första versionen mätte bara LÖRDAGENS sista
  // tid. Den var grön även när vardagstiderna hårdkodades om till 08:00–20:00 —
  // alltså bevisade den bara halva kopplingen.
  //
  // Nu mäts första och sista tiden på BÅDA dagtyperna, mot konfigens värden och
  // konsultationslängden. Ändras en öppettid i filen måste tiderna följa med,
  // annars blir raden röd.
  await medMotor(async ({ store }) => {
    const klockslag = async (datum) => {
      const t = await tider(store, datum);
      const lokala = t.map((s) => utcTillKlinikTid(s.startsAt).klockslag).sort();
      return { forsta: lokala[0], sista: lokala[lokala.length - 1] };
    };
    const minusMinuter = (hhmm, min) => {
      const [h, m] = hhmm.split(':').map(Number);
      const t = h * 60 + m - min;
      return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    };

    const tisdag = await klockslag('2026-12-08');
    assert.equal(tisdag.forsta, vardag.fran, 'vardagen börjar när konfigen säger');

    /**
     * HÄR HADE JAG FEL MODELL, och mutationstestet visade det.
     *
     * Jag antog att vardagens SISTA tid är stängning minus konsultationslängden
     * (18:00 − 45 = 17:15). Den är 16:45. Skälet: `consultation-physical`
     * erbjuds av både läkare och sjuksköterskor, och sköterskornas skifttider
     * (SKIFT_A_VARDAG m.fl.) är EGNA KONSTANTER i koden som klipper fönstret
     * snävare än öppettiden.
     *
     * ORD-189 gjorde alltså bara HALVA öppettiderna konfigurerbara. Öppning och
     * stängning kommer ur filen; sköterskeschemats skift gör det inte.
     *
     * Testet mäter därför den invariant som faktiskt gäller — ingen tid får
     * sträcka sig förbi stängning — plus att lördagen, som inte har
     * skiftbegränsning, ligger exakt på konfigens gräns. Gapet står skrivet i
     * config/klinikens-oppettider.json under _kvar_som_konstanter.
     */
    assert.ok(
      tisdag.sista <= minusMinuter(vardag.till, OPPET.konsultationsminuter),
      `sista vardagstiden ${tisdag.sista} får inte sluta efter stängning ${vardag.till}`
    );

    const lordagen = await klockslag('2026-12-05');
    assert.equal(lordagen.forsta, lordag.fran);
    assert.equal(
      lordagen.sista,
      minusMinuter(lordag.till, OPPET.konsultationsminuter),
      'lördagen har ingen skiftbegränsning och ligger exakt på konfigens gräns'
    );
  });
});

test('listan över stängda dagar tar slut — och det ska synas i tid', () => {
  // En tom lista efter årsskiftet betyder att kliniken tystnadsvis blir
  // bokningsbar på juldagen igen. Den här raden blir röd i god tid innan det
  // händer, i stället för att någon upptäcker det genom en låst dörr.
  const sista = OPPET.stangda_dagar
    .map((d) => d.datum)
    .sort()
    .pop();
  const gransen = new Date(Date.now() + 270 * 24 * 3600000).toISOString().slice(0, 10);
  assert.ok(
    sista > gransen,
    `stängda dagar tar slut ${sista} — fyll på listan för nästa år (gräns ${gransen})`
  );
});

test('datumen är beräknade, och stickproven stämmer', () => {
  // Påskdagen 2026-04-05 och 2027-03-28 togs fram med den anonyma gregorianska
  // algoritmen, inte ur minnet. De rörliga dagarna räknades därifrån.
  const per = new Map(OPPET.stangda_dagar.map((d) => [d.datum, d.namn]));
  assert.equal(per.get('2026-04-03'), 'Långfredagen', 'påsk 2026 − 2 dygn');
  assert.equal(per.get('2026-04-06'), 'Annandag påsk', 'påsk 2026 + 1');
  assert.equal(per.get('2026-05-14'), 'Kristi himmelsfärdsdag', 'påsk 2026 + 39');
  assert.equal(per.get('2027-03-26'), 'Långfredagen', 'påsk 2027 − 2');
  assert.equal(per.get('2026-06-19'), 'Midsommarafton', 'fredagen 19–25 juni');
  assert.equal(per.get('2027-11-06'), 'Alla helgons dag', 'lördagen 31 okt–6 nov');
});

test('en trasig konfigfil ger samma tider som förut, inte en stängd klinik', () => {
  // Reserven är de tal som stod hårdkodade före ORD-189. En oläsbar fil ska
  // inte kunna stänga kliniken — det vore att göra ett konfigurationsfel till
  // ett driftstopp.
  const kalla = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'ops', 'ccoBookingEngineStore.js'),
    'utf8'
  );
  assert.match(kalla, /fran: '10:00', till: '18:00'/, 'reserv för vardag');
  assert.match(kalla, /fran: '10:00', till: '16:00'/, 'reserv för lördag');
  assert.match(kalla, /stangdaDagar: \[\]/, 'utan fil stängs inga dagar');
});
