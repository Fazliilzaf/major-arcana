'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');
const { resolveServiceBookingPolicy } = require('../../src/ops/ccoBookingPolicy');
const { clampHours } = require('../../src/ops/bookingPolicySettings');

/**
 * ORD-173 — avbokningsreglerna mätta där de FAKTISKT gäller.
 *
 * DET HÄR TESTET FINNS PÅ GRUND AV ETT MISSTAG JAG SJÄLV GJORDE 2026-09-03.
 *
 * Jag läste `cancellationHours` i tjänstekatalogens defaults och rapporterade
 * till ägaren att transplantationer stod på 72 h och konsultationer på 4 h.
 * Båda siffrorna var fel — inte felavlästa, utan verkningslösa. Migrationsfilen
 * `migration/booking-policy-defaults.json` sätter `cancellationPolicyHours: 24`
 * på VARJE tjänst, och det värdet vinner. Det verkliga läget var att en
 * transplantation gick att avboka 24 timmar innan.
 *
 * Sedan rättade jag defaults-värdena, körde om, och ingenting hände — för de
 * raderna är döda. Först en mätning av det RESOLVADE värdet visade sanningen.
 *
 * Därför läser testet aldrig källkodens siffror. Det bygger en store och frågar
 * `resolveServiceBookingPolicy` vad som gäller. Ett test mot defaults hade
 * varit grönt hela vägen genom felet.
 *
 * Ägarbeslut 2026-09-03: "FUE, DHI i både hår, skägg, ögonbryn, alltså alla
 * typer av ingrepp. Ögonplastik har likadant." Konsultation fysisk och online:
 * 24 timmar.
 */

const TVA_VECKOR_H = 336;
const ETT_DYGN_H = 24;

/** De åtta ingreppen. Konsultation, uppföljning och injektion är inte ingrepp. */
const INGREPP = [
  'fue',
  'dhi',
  'beard',
  'eyebrow',
  'curatiio-eyelid-surgery',
  'bleph-upper',
  'bleph-lower',
  'bleph-combined',
];

/** Ska uttryckligen INTE ha tvåveckorsregeln. */
const ICKE_INGREPP = [
  'consultation-physical',
  'consultation-online',
  'consultation',
  'followup-transplant',
  'prp-hair',
  'prp-skin',
  'microneedling',
];

async function medKatalog(run) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord173-'));
  const filePath = path.join(dir, 'engine.json');
  try {
    await createCcoBookingEngineStore({ filePath });
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const perId = new Map(raw.services.map((s) => [s.id, s]));
    await run({ perId, services: raw.services });
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

function effektivAvbokning(service) {
  return resolveServiceBookingPolicy(service).cancellationPolicyHours;
}

test('varje ingrepp kräver två veckors avbokning — effektivt, inte i källan', async () => {
  await medKatalog(async ({ perId }) => {
    for (const id of INGREPP) {
      const service = perId.get(id);
      assert.ok(service, `tjänsten ${id} saknas i katalogen`);
      assert.equal(
        effektivAvbokning(service),
        TVA_VECKOR_H,
        `${id} ska kräva ${TVA_VECKOR_H} h (två veckor)`
      );
    }
  });
});

test('konsultation och uppföljning ligger kvar på ett dygn', async () => {
  await medKatalog(async ({ perId }) => {
    for (const id of ICKE_INGREPP) {
      const service = perId.get(id);
      if (!service) continue;
      assert.equal(effektivAvbokning(service), ETT_DYGN_H, `${id} ska ligga på ${ETT_DYGN_H} h`);
    }
  });
});

test('taket tillåter två veckor — det gjorde det inte före ORD-173', () => {
  // Gamla taket var 168 h (7 dygn). 336 klipptes tyst ned till 168, vilket
  // gjorde klinikens egen regel omöjlig att uttrycka. Det är den sortens fel
  // som inte syns någonstans: värdet står rätt i filen och blir fel i minnet.
  assert.equal(clampHours(336, 24), 336, 'två veckor måste överleva klampen');
  assert.equal(clampHours(4320, 24), 4320, '180 dygn är taket');
  assert.equal(clampHours(99999, 24), 4320, 'orimliga värden ska fortfarande fångas');
  assert.equal(clampHours('inte ett tal', 24), 24, 'skräp faller till fallbacken');
});

test('ingen tjänst tillåter avbokning senare än ett dygn före utan att vara vald', async () => {
  // Fångar en tjänst som råkar få 0 eller 4 timmar. Fyra timmar var det gamla
  // värdet i defaults för konsultationerna — dött, men om någon återupplivar
  // raderna ska det synas.
  await medKatalog(async ({ services }) => {
    const forKort = services
      .map((s) => ({ id: s.id, h: effektivAvbokning(s) }))
      .filter((x) => x.h < ETT_DYGN_H);
    assert.deepEqual(
      forKort,
      [],
      'dessa tjänster tillåter avbokning närmare än ett dygn: ' + JSON.stringify(forKort)
    );
  });
});

test('ingreppen skiljer sig från allt annat — regeln är inte satt på hela katalogen', async () => {
  // Ett svep som satte 336 på ALLA tjänster hade fått de två första testerna
  // gröna men gjort konsultationer omöjliga att avboka. Det här skiljer fallen.
  //
  // Mutationstestat 2026-09-03, och första försöket var otillräckligt: jag
  // ändrade globalDefaults i migrationsfilen och INGENTING blev rött. Skälet är
  // att `applyBookingPolicyToService` (ccoBookingPolicy.js:45) faller tillbaka
  // på konstanten DEFAULT_CANCELLATION_POLICY_HOURS i koden, inte på
  // migrationsfilens global — den globalen når bara tjänster som redan har en
  // override. Ett riktigt svep måste alltså ändra konstanten, och DÅ blir det
  // här testet rött. Värt att veta för nästa som tror att filen styr allt.
  await medKatalog(async ({ services }) => {
    const medTvaVeckor = services
      .filter((s) => effektivAvbokning(s) === TVA_VECKOR_H)
      .map((s) => s.id)
      .sort();
    assert.deepEqual(
      medTvaVeckor,
      [...INGREPP].sort(),
      'exakt de åtta ingreppen ska ha tvåveckorsregeln'
    );
  });
});

test('depositionsregeln och avbokningsregeln pekar nu åt samma håll', () => {
  // Före ORD-173: avbokning tilläts 24 h före, men depositionen behölls redan
  // från 14 dygn. Systemet tillät alltså något det samtidigt bestraffade.
  const { DEFAULT_DEPOSIT_RETENTION_HOURS } = require('../../src/ops/ccoBookingPolicy');
  assert.equal(
    DEFAULT_DEPOSIT_RETENTION_HOURS,
    TVA_VECKOR_H,
    'pengaregeln är två veckor — avbokningsregeln för ingrepp ska vara densamma'
  );
});
