'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');
const {
  resolveServiceBookingPolicy,
  resolveDepositRetention,
  DEFAULT_DEPOSIT_RETENTION_HOURS,
} = require('../../src/ops/ccoBookingPolicy');
const { clampHours } = require('../../src/ops/bookingPolicySettings');

/**
 * ORD-175 — avbokningsreglerna mätta där de gäller, mot PUBLICERADE villkor.
 *
 * TVÅ MISSTAG BAKOM DET HÄR TESTET, båda mina, båda samma dag.
 *
 * FÖRST (ORD-173): jag läste `cancellationHours` i tjänstekatalogens defaults
 * och rapporterade att transplantationer stod på 72 h. Siffrorna var
 * verkningslösa — migrationsfilen sätter `cancellationPolicyHours` och vinner.
 * Därför läser det här testet aldrig källkodens siffror, utan bygger en store
 * och frågar `resolveServiceBookingPolicy`.
 *
 * SEDAN (rättat i ORD-175): jag satte 336 h på ingreppen efter att ägaren sagt
 * "operationen är två veckor innan". Fel spak. Curatiios bokningsvillkor
 * (curatiio.com/bokningsvillkor, uppdaterad 11 juli 2026) säger:
 *
 *   "Vill du avboka återbetalas förskottet om du meddelar oss minst 14 dagar
 *    före behandlingsdagen. Avbokar du senare än så täcker förskottet den tid
 *    och de resurser vi redan reserverat för dig."
 *
 * Kunden FÅR alltså avboka senare — hen förlorar förskottet. Tvåveckorsgränsen
 * är en PENGAREGEL, inte ett avbokningsförbud. Att neka avbokningen hade
 * stridit mot klinikens egna publicerade villkor.
 *
 * Modellen som gäller:
 *   avbokning tillåten     24 h varsel, allt
 *   förskottet behålls     vid avbokning inom 14 dygn
 */

const TVA_VECKOR_H = 336;
const ETT_DYGN_H = 24;

/** Ingreppen. De styrs av pengaregeln, inte av ett avbokningsförbud. */
const INGREPP = ['fue', 'dhi', 'beard', 'eyebrow', 'bleph-upper', 'bleph-lower', 'bleph-combined'];

async function medKatalog(run) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord175-'));
  const filePath = path.join(dir, 'engine.json');
  try {
    await createCcoBookingEngineStore({ filePath });
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    await run({ perId: new Map(raw.services.map((s) => [s.id, s])), services: raw.services });
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

const avbokning = (s) => resolveServiceBookingPolicy(s).cancellationPolicyHours;

test('avbokning tillåts med ett dygns varsel — på ALLT, inklusive ingrepp', async () => {
  // Det här är rättelsen. Att neka avbokning inom två veckor stred mot
  // klinikens publicerade bokningsvillkor.
  await medKatalog(async ({ services }) => {
    const avvikande = services
      .map((s) => ({ id: s.id, h: avbokning(s) }))
      .filter((x) => x.h !== ETT_DYGN_H);
    assert.deepEqual(
      avvikande,
      [],
      'ingen tjänst ska avvika från 24 h: ' + JSON.stringify(avvikande)
    );
  });
});

test('förskottet behålls vid avbokning inom två veckor — det är där gränsen sitter', () => {
  assert.equal(DEFAULT_DEPOSIT_RETENTION_HOURS, TVA_VECKOR_H);

  const nu = Date.parse('2026-09-03T10:00:00Z');
  const om10dagar = { startsAt: '2026-09-13T10:00:00.000Z' };
  const om20dagar = { startsAt: '2026-09-23T10:00:00.000Z' };

  assert.equal(
    resolveDepositRetention(om10dagar, {}, nu).retainDeposit,
    true,
    'inom 14 dygn: förskottet täcker reserverad tid'
  );
  assert.equal(
    resolveDepositRetention(om20dagar, {}, nu).retainDeposit,
    false,
    'mer än 14 dygn kvar: förskottet återbetalas'
  );
});

test('ingreppen finns kvar i katalogen och är aktiva', async () => {
  // Rättelsen av avbokningsregeln får inte råka slå ut något annat.
  await medKatalog(async ({ perId }) => {
    for (const id of INGREPP) {
      const s = perId.get(id);
      assert.ok(s, `${id} saknas i katalogen`);
      assert.equal(s.active, true, `${id} ska vara aktiv`);
    }
  });
});

test('taket tillåter fortfarande långa fönster om kliniken vill sätta ett', () => {
  // Gamla taket var 168 h (7 dygn) och gjorde två veckor omöjligt att ens
  // uttrycka. Höjt i ORD-173 och behållet — klampens uppgift är att fånga
  // skrivfel, inte att sätta policy. Att vi INTE använder ett långt fönster
  // för avbokning just nu är ett policyval, inte en teknisk begränsning.
  assert.equal(clampHours(336, 24), 336);
  assert.equal(clampHours(4320, 24), 4320, '180 dygn är taket');
  assert.equal(clampHours(99999, 24), 4320, 'orimliga värden fångas fortfarande');
  assert.equal(clampHours('inte ett tal', 24), 24, 'skräp faller till fallbacken');
});

test('ingen tjänst tillåter avbokning närmare än ett dygn', async () => {
  // Fyra timmar stod i defaults för konsultationerna. Den raden är död, men
  // om någon återupplivar den ska det synas.
  await medKatalog(async ({ services }) => {
    const forKort = services
      .map((s) => ({ id: s.id, h: avbokning(s) }))
      .filter((x) => x.h < ETT_DYGN_H);
    assert.deepEqual(forKort, [], 'för kort varsel: ' + JSON.stringify(forKort));
  });
});
