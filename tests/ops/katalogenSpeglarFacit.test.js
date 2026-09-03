'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');

/**
 * ORD-174 — katalogen ska spegla hemsidan och kliniken, inte en gissning.
 *
 * BAKGRUND 2026-09-03. Ägaren bad mig slå ihop två poster för övre
 * ögonlocksplastik. De visade sig vara ett symtom på två fel i katalogvägen:
 *
 *   1. `active` härleddes ur `publicBookable` (legacyCatalogRuntime). En tjänst
 *      som ska kunna bokas av personalen men inte av kunder blev osynlig för
 *      ALLA. Ögonlocksplastikerna har `internalBookable: true,
 *      publicBookable: false` på varje variant — kunden bokar konsultation
 *      först — och tvingades därmed till active: false.
 *
 *   2. Vägen satte aldrig pris. Alla triple-map-tjänster stod på 0 kr, trots
 *      att varianterna bar riktiga belopp.
 *
 * Därför skapades `curatiio-eyelid-surgery` i Curatiio-seeden som kringgång:
 * aktiv, publik, med ett pris. Men priset gissades till 28 000 — NEDRES pris —
 * på en post märkt "övre". Fyra tusen fel, på det enda som gick att boka.
 *
 * FACIT ÄR HEMSIDAN. Ägaren 2026-09-03: "priser står på hemsidan, det är facit
 * på alla tjänster respektive företag." Hämtat från curatiio.com/ogonlocksplastik
 * samma dag. Längderna kommer från ägaren: "övre eller nedre 1,5 h, båda 2,5 h."
 */

/**
 * ORD-175: facit läses ur config/publicerade-priser.json, inte ur siffror
 * skrivna här. Ändras ett pris på hemsidan uppdateras filen, och då märks det
 * på ETT ställe i stället för två.
 */
const PUBLICERAT = require('../../config/publicerade-priser.json');

/** Längder från ägaren 2026-09-03: "övre eller nedre 1,5 h, båda 2,5 h." */
const LANGDER = {
  'bleph-upper': 90,
  'bleph-lower': 90,
  'bleph-combined': 150,
};

async function medKatalog(run) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord174-'));
  const filePath = path.join(dir, 'engine.json');
  try {
    await createCcoBookingEngineStore({ filePath });
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    await run({ services: raw.services, perId: new Map(raw.services.map((s) => [s.id, s])) });
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

function pris(service) {
  return Number(service?.pricing?.basePriceSek ?? service?.fromPriceSek ?? 0);
}

test('varje publicerat pris står rätt i katalogen', async () => {
  // Sjutton tjänster, båda klinikerna. Det här är hela poängen med ORD-175:
  // katalogen ska spegla det kunden ser, inte ett belopp härlett ur en
  // mappning där tillägg och systerbehandlingar ligger blandade.
  await medKatalog(async ({ perId }) => {
    const avvikelser = [];
    for (const [id, entry] of Object.entries(PUBLICERAT.priser)) {
      const s = perId.get(id);
      if (!s) {
        avvikelser.push(`${id}: saknas i katalogen`);
        continue;
      }
      if (pris(s) !== entry.fromPriceSek) {
        avvikelser.push(`${id}: katalog ${pris(s)} men publicerat ${entry.fromPriceSek}`);
      }
    }
    assert.deepEqual(avvikelser, [], avvikelser.join(' | '));
  });
});

test('facitfilen pekar ut sin källa och sitt datum', () => {
  // Ett pris utan proveniens är en gissning som råkar stämma. Nästa läsare
  // ska kunna gå till samma sida och kontrollera.
  assert.match(PUBLICERAT._kallor['hair-tp-clinic'], /hairtpclinic\.com\/priser/);
  assert.match(PUBLICERAT._kallor.curatiio, /curatiio\.com\/priser/);
  assert.match(PUBLICERAT._kallor.hamtad, /^\d{4}-\d{2}-\d{2}$/);
});

test('curatiio-microneedling saknar publicerat pris — och det står skrivet', () => {
  // Den enda tjänsten jag inte kunde verifiera. Står på 4 200 i seeden men
  // finns inte på prislistan. Hellre en dokumenterad lucka än ett antagande.
  assert.ok(PUBLICERAT._utan_publicerat_pris['curatiio-microneedling']);
  assert.equal(PUBLICERAT.priser['curatiio-microneedling'], undefined);
});

test('längderna följer klinikens egna tider', async () => {
  await medKatalog(async ({ perId }) => {
    for (const [id, minuter] of Object.entries(LANGDER)) {
      assert.equal(perId.get(id).durationMinutes, minuter, `${id} ska vara ${minuter} min`);
    }
  });
});

test('dubbletten är borta — en tjänst, inte två', async () => {
  await medKatalog(async ({ perId, services }) => {
    assert.equal(
      perId.has('curatiio-eyelid-surgery'),
      false,
      'curatiio-eyelid-surgery var en kringgång och ska inte finnas kvar'
    );
    const ovre = services.filter((s) => /övre ögonlocksplastik/i.test(String(s.label || '')));
    assert.equal(
      ovre.length,
      1,
      'exakt en post för övre ögonlocksplastik: ' + ovre.map((s) => s.id)
    );
  });
});

test('ingreppen är AKTIVA men inte publikt bokningsbara', async () => {
  // Kärnan i fel 1. Kunden bokar kostnadsfri konsultation på hemsidan —
  // operationen bokas av kliniken efteråt. Att inte vara publik får inte
  // betyda avstängd.
  await medKatalog(async ({ perId }) => {
    for (const id of Object.keys(LANGDER)) {
      const s = perId.get(id);
      assert.equal(s.active, true, `${id} måste vara aktiv — kliniken utför den`);
      assert.equal(s.publicBookable, false, `${id} ska inte gå att boka direkt av kund`);
    }
  });
});

test('inget ingrepp står kvar på 0 kr', async () => {
  // Fel 2 träffade även transplantationerna. Konsultationer är kostnadsfria
  // och ska däremot vara noll.
  await medKatalog(async ({ services }) => {
    const nollpris = services
      .filter((s) => s.catalogSource === 'legacy_triple_map')
      .filter((s) => !/consultation|followup|follow-up/i.test(String(s.id)))
      .filter((s) => pris(s) === 0)
      .map((s) => s.id);
    assert.deepEqual(nollpris, [], 'dessa ingrepp saknar pris: ' + JSON.stringify(nollpris));
  });
});

test('konsultationer är kostnadsfria — noll är rätt där', async () => {
  await medKatalog(async ({ perId }) => {
    for (const id of ['consultation-bleph', 'consultation-physical']) {
      const s = perId.get(id);
      if (!s) continue;
      assert.equal(pris(s), 0, `${id} är kostnadsfri enligt hemsidan`);
    }
  });
});

test('DHI visar 52 000 — facit slår den trasiga mappningen', async () => {
  // I ORD-174 visade dhi 15 000 kr, och jag låste det med flit. Skälet var
  // att "DHI Ärr" — ett annat ingrepp — ligger inmappat under samma
  // arcanaServiceId, och lägsta-pris-regeln plockade det.
  //
  // MAPPNINGEN ÄR FORTFARANDE FEL. Men facit ligger nu över härledningen, så
  // katalogen visar rätt pris ändå. Kvar att göra i mappningen: DHI Ärr bör
  // bli en egen tjänst med eget pris, annars går den inte att boka separat.
  await medKatalog(async ({ perId }) => {
    assert.equal(pris(perId.get('dhi')), 52000, 'hemsidan säger DHI från 52 000 kr');
  });
});
