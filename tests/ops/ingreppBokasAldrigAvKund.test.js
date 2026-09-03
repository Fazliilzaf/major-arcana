'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fsp = require('node:fs/promises');

const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');
const { isPublicWebBookingEnabled } = require('../../src/infra/publicWebBooking');
const PUBLIK = require('../../config/publik-bokning.json');

/**
 * ORD-177 — ett ingrepp bokas aldrig av kunden själv.
 *
 * Ägaren 2026-09-03: "inställningen ska finnas att man ska kunna boka fysisk
 * eller online konsultation på nätet, inte operation. men det ska inte kopplas
 * på än för att Cliento äger kunden än så länge."
 *
 * VAD SOM FAKTISKT GÄLLDE när jag mätte samma dag. listPublicServices()
 * returnerade 14 tjänster. Fyra av dem var ingrepp:
 *
 *   fue      FUE hårtransplantation     480 min   42 000 kr
 *   dhi      DHI hårtransplantation     480 min   52 000 kr
 *   beard    Skäggtransplantation       360 min   42 000 kr
 *   eyebrow  Ögonbrynstransplantation   240 min   25 000 kr
 *
 * Det enda som hindrade en kund från att boka en åtta timmar lång operation på
 * hemsidan var den globala nödbromsen ARCANA_PUBLIC_WEB_BOOKING_ENABLED, som
 * stod på false i produktion.
 *
 * Den bromsen SKA släppas — det är hela poängen med att ersätta Cliento. I
 * samma sekund hade fyra ingrepp blivit bokningsbara utan konsultation, utan
 * samtycke, utan avtal och utan förskott.
 *
 * En nödbroms är inte en regel. Det här testet mäter regeln, och det gör det
 * utan att bry sig om hur bromsen står — annars mäter det bromsen.
 */

async function medKatalog(run) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord177c-'));
  try {
    const store = await createCcoBookingEngineStore({ filePath: path.join(dir, 'engine.json') });
    await run({
      store,
      publika: await store.listPublicServices(),
      alla: await store.listServices(),
    });
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

test('ingen publik tjänst kräver ordination', async () => {
  // Kärnan. Kräver tjänsten läkarordination är den ett ingrepp, och ett
  // ingrepp bokas av kliniken efter konsultation — aldrig av kunden.
  await medKatalog(async ({ publika }) => {
    const ingrepp = publika.filter((s) => s.requiresOrdination === true).map((s) => s.id);
    assert.deepEqual(ingrepp, [], 'dessa ingrepp gick att boka publikt: ' + ingrepp.join(', '));
  });
});

test('de fyra som låg öppna är stängda, och skälet står kvar', async () => {
  // Namngivna med flit. Om någon av dem dyker upp publikt igen ska det här
  // testet peka ut exakt vilken.
  await medKatalog(async ({ alla }) => {
    const perId = new Map(alla.map((s) => [s.id, s]));
    for (const id of ['fue', 'dhi', 'beard', 'eyebrow']) {
      const s = perId.get(id);
      assert.ok(s, `${id} saknas i katalogen`);
      assert.equal(s.publicBookable, false, `${id} får inte gå att boka av kund`);
      assert.equal(
        s.publicBookableBlockedBy,
        'kraver_ordination',
        `${id} ska bära skälet till att den är stängd`
      );
      assert.equal(s.active, true, `${id} ska fortfarande vara aktiv — kliniken utför den`);
    }
  });
});

test('konsultationerna är kvar som publika — det var aldrig frågan', async () => {
  // Att stänga ingreppen får inte råka stänga vägen in.
  await medKatalog(async ({ publika }) => {
    const ids = publika.map((s) => s.id);
    for (const id of Object.keys(PUBLIK.konsultationer_publika)) {
      assert.ok(ids.includes(id), `${id} ska gå att boka publikt`);
    }
  });
});

test('PRP och estetiska behandlingar rörs inte — de är inte ingrepp', async () => {
  // Bara ett BESLUTAT ja stänger. `null` betyder att kliniken inte tagit
  // ställning, och de här behandlingarna säljs publikt i dag. Att stänga dem
  // på min tolkning hade varit att fatta ett affärsbeslut åt kliniken.
  await medKatalog(async ({ publika }) => {
    const ids = publika.map((s) => s.id);
    for (const id of ['prp-hair', 'prp-skin', 'microneedling', 'curatiio-botox']) {
      assert.ok(ids.includes(id), `${id} ska vara kvar publik`);
    }
  });
});

test('regeln gäller oavsett hur den globala flaggan står', () => {
  // Om testet läste flaggan skulle det mäta bromsen i stället för regeln, och
  // bli grönt av fel skäl den dag bromsen släpps.
  assert.equal(isPublicWebBookingEnabled({}), false, 'default är av');
  assert.equal(isPublicWebBookingEnabled({ ARCANA_PUBLIC_WEB_BOOKING_ENABLED: 'true' }), true);

  // Ingen av assertionsna ovan i den här filen läser flaggan. Det är avsikten.
  assert.ok(PUBLIK._globala_flaggan.join(' ').includes('gäller oavsett hur flaggan står'));
});

test('flaggan ska inte kopplas på än, och skälet står skrivet', () => {
  // Ägaren 2026-09-03: "det ska inte kopplas på än för att Cliento äger kunden
  // än så länge."
  assert.match(PUBLIK._globala_flaggan.join(' '), /Cliento/);
  assert.match(PUBLIK._globala_flaggan.join(' '), /false/);
});

test('de tre Curatiio-konsultationerna är öppnade — frågan är besvarad', async () => {
  // Den här testen krävde tidigare motsatsen: att de tre stod som en öppen
  // fråga, eftersom Curatiio saknade publik väg in och jag inte skulle fatta
  // beslutet åt kliniken. Ägaren 2026-09-03: "fixa det."
  //
  // Facit är hemsidan. curatiio.com/priser: "20 minuter direkt med
  // specialisten ingår alltid innan vi rekommenderar något." Samma knapp på
  // alla tre områdenas sidor — därför öppnades alla tre, inte bara ögonlock.
  await medKatalog(async ({ publika }) => {
    const ids = publika.map((s) => s.id);
    for (const id of [
      'consultation-bleph',
      'consultation-ortho',
      'consultation-curatiio-aesthetic',
    ]) {
      assert.ok(PUBLIK.konsultationer_publika[id], `${id} ska stå i listan`);
      assert.ok(ids.includes(id), `${id} ska gå att boka`);
    }
  });
});

test('att öppna konsultationerna öppnade inte operationerna', async () => {
  // Det farliga med att lossa en spärr är att den lossnar för mycket.
  await medKatalog(async ({ publika }) => {
    const ids = publika.map((s) => s.id);
    for (const id of ['bleph-upper', 'bleph-lower', 'bleph-combined', 'ortho-treatment']) {
      assert.ok(!ids.includes(id), `${id} ska förbli stängd`);
    }
  });
});
