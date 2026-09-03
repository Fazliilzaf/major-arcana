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

/** curatiio.com/ogonlocksplastik, hämtad 2026-09-03. */
const FACIT = {
  'bleph-upper': { pris: 24000, minuter: 90, label: 'Övre ögonlocksplastik' },
  'bleph-lower': { pris: 28000, minuter: 90, label: 'Nedre ögonlocksplastik' },
  'bleph-combined': { pris: 48000, minuter: 150, label: 'Kombinerad ögonlocksplastik' },
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

test('ögonlocksplastikens priser matchar hemsidan', async () => {
  await medKatalog(async ({ perId }) => {
    for (const [id, f] of Object.entries(FACIT)) {
      const s = perId.get(id);
      assert.ok(s, `${id} saknas i katalogen`);
      assert.equal(pris(s), f.pris, `${id} ska kosta ${f.pris} kr enligt curatiio.com`);
    }
  });
});

test('längderna följer klinikens egna tider', async () => {
  await medKatalog(async ({ perId }) => {
    for (const [id, f] of Object.entries(FACIT)) {
      assert.equal(perId.get(id).durationMinutes, f.minuter, `${id} ska vara ${f.minuter} min`);
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
    for (const id of Object.keys(FACIT)) {
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

test('DHI visar 15 000 — och det är ett MAPPNINGSFEL, inte ett prisfel', async () => {
  // Testet låser ett läge som är fel, med flit, tills kliniken rättar källan.
  //
  // `dhi` har åtta varianter. Sju är hårtransplantation från 52 000 kr. Den
  // åttonde är "DHI Ärr" på 15 000 — ett annat ingrepp, inmappat under samma
  // arcanaServiceId. Lägsta-pris-regeln plockar därför 15 000, vilket blir
  // missvisande som "DHI hårtransplantation från 15 000 kr".
  //
  // Regeln är inte fel. Mappningen är. DHI Ärr bör bli en egen tjänst, och
  // då blir DHI 52 000 automatiskt — och det här testet rött, vilket är
  // signalen att uppdatera det.
  await medKatalog(async ({ perId }) => {
    assert.equal(
      pris(perId.get('dhi')),
      15000,
      'ändras detta har någon rättat mappningen — uppdatera testet och ta bort noteringen'
    );
  });
});
