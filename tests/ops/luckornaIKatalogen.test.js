'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');
const PRISER = require('../../config/publicerade-priser.json');
const PUBLIK = require('../../config/publik-bokning.json');
const LANGDER = require('../../config/tjanstelangder.json');

/**
 * ORD-178 — de tre luckorna ägaren bad mig stänga.
 *
 * 1. DHI SKÄGGTRANSPLANTATION marknadsfördes men gick inte att boka.
 *    Prislistan på hairtpclinic.com/priser säljer den med egen rubrik, egen
 *    beskrivning och egen graftstege 52 000 → 68 000 kr. Katalogen hade bara
 *    `beard`, FUE-skägget på 42 000. En kund som valde "skägg" fick alltså
 *    FUE-priset oavsett vad hen ville ha.
 *
 * 2. CURATIIO SAKNADE PUBLIK VÄG IN. De tre konsultationerna stod
 *    publicBookable: false, och operationerna är — korrekt — också stängda.
 *    Nettoresultat: en kund som klickade "Boka kostnadsfri konsultation" på
 *    curatiio.com/ogonlocksplastik hade mötts av en tom katalog.
 *
 * 3. "DET SÄTTER VI MANUELLT" gick inte att göra. Se längdtesterna nederst.
 */

async function medKatalog(run) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord178-'));
  const filePath = path.join(dir, 'engine.json');
  try {
    const store = await createCcoBookingEngineStore({ filePath });
    await run({
      store,
      filePath,
      alla: await store.listServices(),
      publika: await store.listPublicServices(),
    });
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

/* ---------- 1. DHI Skäggtransplantation ---------- */

test('DHI Skäggtransplantation finns och kostar 52 000 kr', async () => {
  await medKatalog(async ({ alla }) => {
    const s = alla.find((x) => x.id === 'dhi-beard');
    assert.ok(s, 'dhi-beard saknas — behandlingen marknadsförs men går inte att boka');
    assert.equal(s.pricing.basePriceSek, 52000, 'prislistan säger från 52 000 kr');
    assert.equal(s.label, 'DHI Skäggtransplantation');
  });
});

test('de två skäggtjänsterna går att skilja åt i en lista', async () => {
  // `beard` hette bara "Skäggtransplantation". Det dög så länge det fanns en
  // enda skäggtjänst. Med två blir namnet en gissningslek för den som bokar.
  await medKatalog(async ({ alla }) => {
    const skagg = alla.filter((s) => /skägg/i.test(s.label));
    assert.equal(skagg.length, 2, 'skäggtjänster: ' + skagg.map((s) => s.label).join(' + '));
    const namn = skagg.map((s) => s.label).sort();
    assert.deepEqual(namn, ['DHI Skäggtransplantation', 'FUE Skäggtransplantation']);
  });
});

test('FUE-skägget står kvar på sitt eget pris', async () => {
  // Att lägga till DHI-skägget får inte råka flytta FUE-skäggets pris.
  await medKatalog(async ({ alla }) => {
    assert.equal(alla.find((s) => s.id === 'beard').pricing.basePriceSek, 42000);
  });
});

test('graftstegen står dokumenterad med sitt publicerade ursprung', () => {
  const entry = PRISER.priser['dhi-beard'];
  assert.ok(entry, 'dhi-beard måste stå i facit — priset ÄR publicerat');
  assert.equal(entry.fromPriceSek, 52000);
  assert.equal(entry._graftstege.length, 5, '1 000 till 3 000 grafter');
  assert.match(entry._graftstege[4], /68 000/);
});

test('DHI-skägget kräver ordination och är inte publikt bokningsbart', async () => {
  await medKatalog(async ({ alla, publika }) => {
    const s = alla.find((x) => x.id === 'dhi-beard');
    assert.equal(s.requiresOrdination, true, 'det är ett ingrepp under lokalbedövning');
    assert.equal(s.publicBookable, false);
    assert.ok(!publika.some((x) => x.id === 'dhi-beard'));
  });
});

/* ---------- 2. Curatiios väg in ---------- */

test('Curatiios tre konsultationer går att boka publikt', async () => {
  // curatiio.com/priser: "20 minuter direkt med specialisten ingår alltid
  // innan vi rekommenderar något." Varje behandlingssida — ortopedi,
  // ögonlocksplastik, estetik — har samma knapp. Alla tre öppnas.
  await medKatalog(async ({ publika }) => {
    const ids = publika.map((s) => s.id);
    for (const id of [
      'consultation-bleph',
      'consultation-ortho',
      'consultation-curatiio-aesthetic',
    ]) {
      assert.ok(ids.includes(id), `${id} måste gå att boka — den är vägen in`);
    }
  });
});

test('ögonlocksplastik har nu en väg in, men inte genom operationen', async () => {
  // Kärnan i lucka 2. Vägen ska finnas — och den ska gå via konsultationen.
  await medKatalog(async ({ publika }) => {
    const ids = publika.map((s) => s.id);
    assert.ok(ids.includes('consultation-bleph'), 'konsultationen är öppen');
    for (const id of ['bleph-upper', 'bleph-lower', 'bleph-combined']) {
      assert.ok(!ids.includes(id), `${id} ska förbli stängd för kundbokning`);
    }
  });
});

test('listan öppnar bara — den kan inte öppna ett ingrepp', async () => {
  // Skulle någon råka lägga fue eller dhi i konsultationslistan ska
  // ordinationsregeln stänga dem ändå. Regeln körs efter och vinner.
  await medKatalog(async ({ publika }) => {
    const ingrepp = publika.filter((s) => s.requiresOrdination === true);
    assert.deepEqual(
      ingrepp.map((s) => s.id),
      []
    );
  });
});

test('varje öppnad konsultation kräver bevisligen ingen ordination', async () => {
  await medKatalog(async ({ alla }) => {
    for (const id of Object.keys(PUBLIK.konsultationer_publika)) {
      const s = alla.find((x) => x.id === id);
      if (!s) continue;
      assert.equal(s.requiresOrdination, false, `${id} måste vara ett beslutat nej, inte null`);
    }
  });
});

/* ---------- 3. Längderna ---------- */

test('en längd i facit slår igenom i katalogen', async () => {
  await medKatalog(async ({ alla }) => {
    for (const [id, entry] of Object.entries(LANGDER.langder)) {
      const s = alla.find((x) => x.id === id);
      if (!s) continue;
      assert.equal(s.durationMinutes, entry.minuter, `${id} ska vara ${entry.minuter} min`);
    }
  });
});

test('facit ÅTERSTÄLLER en ändrad längd — mekanismen bär, inte sammanträffandet', async () => {
  // TESTET OVAN BEVISADE INGENTING, och jag upptäckte det genom att mutera.
  //
  // `langder` innehåller i dag bara ögonlocksplastikerna, och deras värden är
  // redan katalogens standardvärden sedan ORD-174. Kopplade jag bort
  // applyServiceDurations helt förblev testet grönt. Ett test som är grönt
  // både med och utan koden det påstår sig mäta är en dekoration.
  //
  // Det här mäter mekanismen: sätt ett annat värde på disk, starta om, och
  // kräv att facit skriver tillbaka sitt. Nu måste appliceringen finnas.
  await medKatalog(async ({ filePath }) => {
    const [id, entry] = Object.entries(LANGDER.langder)[0];
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const target = raw.services.find((s) => s.id === id);
    assert.ok(target, `${id} måste finnas i katalogen`);
    assert.notEqual(entry.minuter, 37, 'testvärdet får inte råka vara facitvärdet');
    target.durationMinutes = 37;
    fs.writeFileSync(filePath, JSON.stringify(raw, null, 2));

    const store2 = await createCcoBookingEngineStore({ filePath });
    const efter = (await store2.listServices()).find((s) => s.id === id);
    assert.equal(
      efter.durationMinutes,
      entry.minuter,
      `${id} ska tvingas tillbaka till facitets ${entry.minuter} min`
    );
    assert.equal(efter.durationSource, 'facit', 'och bära var värdet kom ifrån');
  });
});

test('handredigering på servern överlever INTE en omstart — därför finns facit', async () => {
  // MÄTT 2026-09-03. Ägaren sa "det sätter vi manuellt". Det finns ingen
  // upsertService, ingen admin-route och ingen vy — "manuellt" betyder SSH och
  // JSON-redigering. Och den redigeringen håller inte: migratePlanASchema
  // bygger om standardtjänster som { ...svc, ...(existing), ...svc }, alltså
  // med defaults sist.
  //
  // Det här testet bevarar mätningen. Skulle någon "förbättra" migreringen så
  // att handredigering plötsligt håller, blir raden röd och den som ändrar får
  // veta att facitfilen då kan förenklas.
  await medKatalog(async ({ filePath }) => {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    for (const s of raw.services) {
      if (['dhi', 'beard', 'consultation-physical'].includes(s.id)) s.durationMinutes = 222;
    }
    fs.writeFileSync(filePath, JSON.stringify(raw, null, 2));

    const store2 = await createCcoBookingEngineStore({ filePath });
    const efter = new Map((await store2.listServices()).map((s) => [s.id, s.durationMinutes]));
    assert.equal(efter.get('dhi'), 480, 'tyst återställd av migreringen');
    assert.equal(efter.get('beard'), 360, 'tyst återställd av migreringen');
    assert.equal(efter.get('consultation-physical'), 45, 'tyst återställd av migreringen');
  });
});

test('ärrlängderna står som ej fastställda, inte som mätta', () => {
  // 480 min är ärvt från moderteknikerna. Att låta det stå som ett värde utan
  // markering hade gjort en gissning till data.
  for (const id of ['fue-scar', 'dhi-scar']) {
    assert.ok(LANGDER._att_sattas[id], `${id} måste stå som ej fastställd`);
    assert.equal(LANGDER.langder[id], undefined, `${id} får inte stå som fastställd ännu`);
  }
});

test('DHI-skäggets längd är märkt som härledd, inte mätt', () => {
  const text = LANGDER._att_sattas['dhi-beard'].join(' ');
  assert.match(text, /resonemang, inte en mätning/);
});
