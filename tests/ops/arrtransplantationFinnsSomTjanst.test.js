'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');
const PUBLICERAT = require('../../config/publicerade-priser.json');

/**
 * ORD-177 — Ärrtransplantation som egna tjänster.
 *
 * Ägaren 2026-09-03: "från 15 000kr DHI Ärr bör bli en egen tjänst för både
 * FUE och DHI."
 *
 * BAKGRUNDEN. "DHI Ärr" fanns bara som variant (meridiqApiId 7414) inmappad
 * under `dhi` i triple-mappen. Lägsta-pris-regeln i ORD-174 plockade dess
 * 15 000 kr och visade det som DHI-hårtransplantationens pris — 37 000 kr fel,
 * på klinikens dyraste ingrepp. ORD-175 rättade priset med publicerat facit,
 * men lämnade ärrbehandlingen omöjlig att boka: den var en prislapp utan
 * tjänst.
 *
 * TRE SAKER JAG INTE KUNDE VERIFIERA MOT HEMSIDAN, och som därför står
 * dokumenterade i stället för gissade:
 *
 *   1. Priset. hairtpclinic.com/arrtransplantation publicerar inget belopp,
 *      och ärr står inte i prislistan. 15 000 kommer från ägaren.
 *   2. Metoden. Hemsidan säger "FUE-metoden" om ärr. Den enda varianten i
 *      systemet heter DHI Ärr. Ägaren vill ha båda.
 *   3. Längden. 480 minuter är ärvt från moderteknikerna, inte mätt.
 */

async function medKatalog(run) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord177b-'));
  const filePath = path.join(dir, 'engine.json');
  try {
    await createCcoBookingEngineStore({ filePath });
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    await run({ services: raw.services, perId: new Map(raw.services.map((s) => [s.id, s])) });
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

const ARR = ['fue-scar', 'dhi-scar'];

test('båda ärrtjänsterna finns i katalogen', async () => {
  await medKatalog(async ({ perId }) => {
    for (const id of ARR) {
      assert.ok(perId.get(id), `${id} saknas — ägaren bad om en tjänst för både FUE och DHI`);
    }
  });
});

test('ärrtjänsterna är AKTIVA men inte publikt bokningsbara', async () => {
  // Kärnan, och samma fel som ORD-174 rättade på ett annat ställe.
  // migratePlanASchema tvingade `active: false` på allt som inte står som
  // publikt bokningsbart i tjänsteregistret — alltså blev en tjänst kliniken
  // faktiskt utför osynlig för hela personalen.
  //
  // Registret bestämmer PUBLIK bokning. Det gör det fortfarande. Men aktiv
  // betyder "kliniken utför den", och det är inte registrets fråga.
  await medKatalog(async ({ perId }) => {
    for (const id of ARR) {
      assert.equal(perId.get(id).active, true, `${id} måste vara aktiv — kliniken utför den`);
      assert.equal(perId.get(id).publicBookable, false, `${id} bokas efter konsultation`);
    }
  });
});

test('rättelsen aktiverade inte något annat', async () => {
  // Att lossa på en spärr är lätt att göra för brett. Före ORD-177 var 24
  // tjänster aktiva; de två ärrtjänsterna gjorde 26, och dhi-beard (ORD-178)
  // gjorde 27. Talet står utskrivet med flit — varje ny aktiv tjänst ska
  // kräva ett medvetet beslut här.
  await medKatalog(async ({ services }) => {
    const aktiva = services.filter((s) => s.active).map((s) => s.id);
    assert.equal(aktiva.length, 27, 'aktiva tjänster: ' + aktiva.join(', '));
    for (const id of ARR) assert.ok(aktiva.includes(id));
  });
});

test('priset är 15 000 kr på båda', async () => {
  await medKatalog(async ({ perId }) => {
    for (const id of ARR) {
      assert.equal(perId.get(id).pricing.basePriceSek, 15000, `${id} ska stå på 15 000 kr`);
    }
  });
});

test('priset står INTE i facit för publicerade priser — det är internt', () => {
  // Hemsidan publicerar inget pris för ärrtransplantation. Att lägga 15 000 i
  // publicerade-priser.json hade gjort ett internt belopp till ett påstått
  // publicerat, och nästa läsare hade gått till hemsidan och inte hittat det.
  for (const id of ARR) {
    assert.equal(PUBLICERAT.priser[id], undefined, `${id} får inte stå bland publicerade priser`);
    assert.ok(PUBLICERAT._utan_publicerat_pris[id], `${id} måste stå som dokumenterad lucka`);
  }
});

test('DHI-skäggluckan är stängd — den marknadsfördes men gick inte att boka', async () => {
  // Hittad 2026-09-03 vid jämförelsen mot prislistan, byggd samma dag efter
  // ägarens "lös det". Den här testen var tidigare formulerad tvärtom: den
  // krävde att luckan stod DOKUMENTERAD och att tjänsten INTE fanns, eftersom
  // jag inte skulle bygga den på egen gissning. Nu finns beslutet.
  //
  // Se tests/ops/luckornaIKatalogen.test.js för hela DHI-skägget.
  assert.ok(PUBLICERAT.priser['dhi-beard'], 'priset ÄR publicerat och står i facit');
  assert.equal(
    PUBLICERAT._utan_publicerat_pris['dhi-beard'],
    undefined,
    'den ska inte längre stå som en lucka'
  );
  await medKatalog(async ({ perId }) => {
    assert.equal(perId.get('dhi-beard').pricing.basePriceSek, 52000);
    assert.equal(perId.get('beard').pricing.basePriceSek, 42000, 'beard är FUE-skägget');
  });
});

test('ärrtransplantation kräver ordination', async () => {
  // Hemsidan om ärr: "Vi plockar ut grafts och planterar dem i ärrområdet
  // under lokalbedövning."
  await medKatalog(async ({ perId }) => {
    for (const id of ARR) {
      assert.equal(perId.get(id).requiresOrdination, true, `${id} ges under lokalbedövning`);
    }
  });
});

test('DHI står kvar på 52 000 — ärrpriset ska inte längre kunna dra ned det', async () => {
  // Hela anledningen till att de här tjänsterna bröts ut.
  await medKatalog(async ({ perId }) => {
    assert.equal(perId.get('dhi').pricing.basePriceSek, 52000);
    assert.equal(perId.get('fue').pricing.basePriceSek, 42000);
  });
});
