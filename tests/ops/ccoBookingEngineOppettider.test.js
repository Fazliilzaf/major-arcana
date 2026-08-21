'use strict';

/**
 * Bokningsmotorn får inte erbjuda konsultationstider när kliniken är stängd.
 *
 * ── Bakgrunden ──────────────────────────────────────────────────────────────
 *
 * Öppettiderna för konsultation är mån–fre 10–18 och lör 10–16. Fram till
 * 2026-08-21 erbjöd motorn ändå:
 *
 *     rule-consultation-fazli     09:00   en timme före öppning
 *     rule-consultation-egzona    09:30   en halvtimme före öppning
 *     rule-evening-cons-fazli     18:00   slutar 18:30, efter stängning
 *
 * En patient kunde alltså boka en tid då ingen var på plats.
 *
 * ── Varför testet mäter slots och inte regler ───────────────────────────────
 *
 * Det vore enklare att läsa `startTimes` ur konfigurationen och jämföra
 * strängar. Men det testar bara att någon skrev rätt siffra — inte att motorn
 * gör rätt av den. Schemat sätts ihop av defaults, av filens egna regler och
 * av sammanslagningen dem emellan, och det är summan som möter patienten.
 *
 * Därför frågar testet motorn efter riktiga tider och kontrollerar var och en.
 *
 * Tiderna jämförs i Europe/Stockholm. Motorn arbetar i UTC, och sommartid gör
 * att en UTC-tid som ser oskyldig ut kan vara 09:30 lokalt.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');

const OPPET = {
  1: { fran: '10:00', till: '18:00' },
  2: { fran: '10:00', till: '18:00' },
  3: { fran: '10:00', till: '18:00' },
  4: { fran: '10:00', till: '18:00' },
  5: { fran: '10:00', till: '18:00' },
  6: { fran: '10:00', till: '16:00' },
  // Söndag saknas med flit — stängt.
};

const KONSULTATIONER = ['consultation-physical', 'consultation-online'];

/**
 * Längden hämtas ur katalogen, inte som en siffra här.
 *
 * Skrivs 45 på två ställen glider de isär, och då mäter testet en längd som
 * motorn inte använder — det skulle bli grönt medan patienter bokas 30 minuter
 * in i stängningen.
 */
async function langdMinuter(store, serviceId) {
  const tjanster = await store.listServices({});
  const tjanst = tjanster.find((item) => item.id === serviceId);
  assert.ok(tjanst, serviceId + ' saknas i katalogen');
  assert.ok(Number.isFinite(tjanst.durationMinutes), serviceId + ' saknar durationMinutes');
  return tjanst.durationMinutes;
}

/** ISO-tid → { datum, minuter, veckodag } i Europe/Stockholm. */
function stockholm(iso) {
  const lokal = new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' });
  const [datum, klocka] = lokal.split(' ');
  const [timme, minut] = klocka.split(':').map(Number);
  // Datumdelen är redan lokal, så UTC-tolkning ger rätt veckodag.
  const veckodag = new Date(datum + 'T00:00:00Z').getUTCDay();
  return { datum, klocka, minuter: timme * 60 + minut, veckodag };
}

const tillMinuter = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

async function medStore(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-oppettider-'));
  try {
    const store = await createCcoBookingEngineStore({
      filePath: path.join(dir, 'booking-engine.json'),
    });
    return await fn(store);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const datum = (dagarFram) => new Date(Date.now() + dagarFram * 86400000).toISOString().slice(0, 10);

test('konsultationstider ligger innanför öppettiderna', async () => {
  await medStore(async (store) => {
    let granskade = 0;
    for (const serviceId of KONSULTATIONER) {
      const LANGD_MIN = await langdMinuter(store, serviceId);
      assert.equal(LANGD_MIN, 45, serviceId + ' ska vara 45 minuter');
      const slots = await store.listAvailability({
        tenantId: 'tenant-a',
        fromDate: datum(1),
        toDate: datum(28),
        srvIds: serviceId,
      });
      assert.ok(slots.length > 0, serviceId + ' gav inga tider alls — testet mäter ingenting');

      for (const slot of slots) {
        const t = stockholm(slot.startsAt);
        const oppet = OPPET[t.veckodag];
        assert.ok(
          oppet,
          `${serviceId} erbjuder ${t.datum} ${t.klocka} (veckodag ${t.veckodag}) — kliniken är stängd den dagen`
        );
        assert.ok(
          t.minuter >= tillMinuter(oppet.fran),
          `${serviceId} erbjuder ${t.datum} ${t.klocka} hos ${slot.resourceId} — före öppning ${oppet.fran}`
        );
        assert.ok(
          t.minuter + LANGD_MIN <= tillMinuter(oppet.till),
          `${serviceId} erbjuder ${t.datum} ${t.klocka} hos ${slot.resourceId} — slutar efter stängning ${oppet.till}`
        );
        granskade += 1;
      }
    }
    assert.ok(granskade > 100, 'för få tider granskade (' + granskade + ') för att säga något');
  });
});

test('lördagar erbjuds — kliniken är öppen 10–16', async () => {
  await medStore(async (store) => {
    const slots = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate: datum(1),
      toDate: datum(28),
      srvIds: 'consultation-physical',
    });
    const lordagar = slots.filter((s) => stockholm(s.startsAt).veckodag === 6);
    assert.ok(
      lordagar.length > 0,
      'inga lördagstider — kliniken är öppen 10–16 men motorn erbjuder ingenting'
    );
  });
});

test('första passet börjar när kliniken öppnar, inte senare', async () => {
  // Utan det här skulle "ta bort 09:00" kunna lösas genom att stryka tiden helt
  // och lämna första tiden 11:00. Öppettiden ska användas.
  await medStore(async (store) => {
    const slots = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate: datum(1),
      toDate: datum(28),
      srvIds: 'consultation-physical',
    });
    const vardagar = slots
      .map((s) => stockholm(s.startsAt))
      .filter((t) => t.veckodag >= 1 && t.veckodag <= 5);
    const tidigaste = Math.min(...vardagar.map((t) => t.minuter));
    assert.equal(
      tidigaste,
      tillMinuter('10:00'),
      'tidigaste vardagstid är ' +
        Math.floor(tidigaste / 60) +
        ':' +
        String(tidigaste % 60).padStart(2, '0') +
        ' — öppningstiden 10:00 används inte'
    );
  });
});
