'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const express = require('express');

const { createBookingPublicActionsRouter } = require('../../src/routes/bookingPublicActions');
const KONTAKT = require('../../config/avbokning-kontakt.json');

/**
 * ORD-202 — kunden bokar om, men avbokar inte.
 *
 * Ägaren 2026-09-04: "i kundportalen så ska kunden kunna boka om men inte
 * avboka, då måste dem maila in till contact@hairtpclinic.com eller
 * contact@curatiio.com eller ringa in till respektive nummer, annars godkänns
 * det inte."
 *
 * SPÄRREN LIGGER I RUTTEN, INTE I KNAPPEN. Att ta bort knappen hade lämnat
 * POST /avboka/:token öppen för den som redan har länken — och länken ligger i
 * ett mejl som kan vidarebefordras, sparas eller återanvändas månader senare.
 * En knapp som försvinner är en rekommendation. En rutt som vägrar är en regel.
 *
 * Testerna nedan angriper rutten direkt, inte sidan.
 */

const TOKEN = 'a'.repeat(64);

/**
 * Rutten slår upp bokningen via `bookingEngineStore._state.bookings` — inte via
 * en publik metod (ORD-190 tog bort den härledda vägen med flit). Fixturen
 * måste därför ha samma form, annars testar den ingenting: rutten hittar ingen
 * bokning och svarar 404 på allt, vilket ser ut som att spärren fungerar.
 */
function fejkStore(booking) {
  return {
    _state: { bookings: [booking] },
    _avbokningar: [],
    async cancelBooking(input) {
      this._avbokningar.push(input);
      return { ok: true };
    },
    async listAvailability() {
      return [];
    },
  };
}

const bokning = (extra = {}) => ({
  bookingId: 'b-1',
  conversationId: 'c-1',
  tenantId: 'hair-tp-clinic',
  customerEmail: 'kund@example.com',
  serviceLabel: 'FUE hårtransplantation',
  status: 'confirmed',
  bookingActionToken: TOKEN,
  slot: { startsAt: '2026-12-16T08:00:00.000Z', serviceLabel: 'FUE hårtransplantation' },
  ...extra,
});

async function medRutt(run, { booking = bokning() } = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord202-'));
  const audit = [];
  const store = fejkStore(booking);
  try {
    const app = express();
    app.use(
      createBookingPublicActionsRouter({
        bookingEngineStore: store,
        auditLog: { append: (e) => audit.push(e) },
      })
    );
    const srv = http.createServer(app);
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    try {
      await run({ baseUrl: `http://127.0.0.1:${srv.address().port}`, store, audit });
    } finally {
      await new Promise((r) => srv.close(r));
    }
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

test('POST /avboka VÄGRAR — och bokningen rörs inte', async () => {
  // Kärnan. Den som har länken kan skicka formuläret direkt utan att någonsin
  // se sidan.
  await medRutt(async ({ baseUrl, store }) => {
    const res = await fetch(`${baseUrl}/avboka/${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'reason=vill+inte',
    });
    assert.equal(res.status, 405, 'metoden är inte tillåten för kunden');
    assert.equal(store._avbokningar.length, 0, 'cancelBooking får ALDRIG anropas');
  });
});

test('svaret säger vart kunden ska vända sig — inte bara nej', async () => {
  // Ett nej utan väg vidare skickar kunden till telefonen ändå, men arg.
  await medRutt(async ({ baseUrl }) => {
    const html = await fetch(`${baseUrl}/avboka/${TOKEN}`, { method: 'POST' }).then((r) =>
      r.text()
    );
    assert.match(html, /contact@hairtpclinic\.com/);
    assert.match(html, /031 88 11 66/);
    assert.match(html, /står kvar/, 'kunden ska veta att tiden INTE är borta');
  });
});

test('Curatiio-kund hänvisas till Curatiio', async () => {
  await medRutt(
    async ({ baseUrl }) => {
      const html = await fetch(`${baseUrl}/avboka/${TOKEN}`, { method: 'POST' }).then((r) =>
        r.text()
      );
      assert.match(html, /contact@curatiio\.com/);
      assert.match(html, /Curatiio/);
      assert.ok(!/contact@hairtpclinic/.test(html), 'fel klinik får inte nämnas');
    },
    { booking: bokning({ tenantId: 'curatiio' }) }
  );
});

test('okänd klinik hänvisas till Hair TP — aldrig till tomt', async () => {
  // En bokning utan tenant får inte ge en sida där e-post och telefon saknas.
  for (const tenantId of ['', null, 'finns-inte']) {
    await medRutt(
      async ({ baseUrl }) => {
        const html = await fetch(`${baseUrl}/avboka/${TOKEN}`, { method: 'POST' }).then((r) =>
          r.text()
        );
        assert.match(html, /contact@hairtpclinic\.com/, `tenant=${tenantId}`);
      },
      { booking: bokning({ tenantId }) }
    );
  }
});

test('sidan visar kontaktvägen i stället för en avboka-knapp', async () => {
  await medRutt(async ({ baseUrl }) => {
    const html = await fetch(`${baseUrl}/avboka/${TOKEN}`).then((r) => r.text());
    assert.ok(!/Avboka min tid/.test(html), 'knappen ska vara borta');
    assert.ok(!/<form[^>]*method="POST"[^>]*avboka/i.test(html), 'och formuläret med den');
    assert.match(html, /Kontakta oss för att avboka/);
    assert.match(html, /contact@hairtpclinic\.com/);
  });
});

test('sidan erbjuder OMBOKNING i stället — det är det kunden får göra', async () => {
  await medRutt(async ({ baseUrl }) => {
    const html = await fetch(`${baseUrl}/avboka/${TOKEN}`).then((r) => r.text());
    assert.match(html, new RegExp(`/omboka/${TOKEN}`), 'vägen vidare ska finnas');
  });
});

test('OMBOKNING fungerar fortfarande — spärren gäller bara avbokning', async () => {
  // Motprovet. Stängs båda vägarna har jag byggt fel sak.
  await medRutt(async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/omboka/${TOKEN}`);
    assert.notEqual(res.status, 405, 'ombokningssidan ska vara öppen');
    assert.notEqual(res.status, 404);
  });
});

test('försöket hamnar i audit — annars vet vi inte om hänvisningen fungerar', async () => {
  await medRutt(async ({ baseUrl, audit }) => {
    await fetch(`${baseUrl}/avboka/${TOKEN}`, { method: 'POST' });
    const rad = audit.find((e) => e.action === 'booking.customer_cancel_blocked');
    assert.ok(rad, 'blockeringen ska loggas');
    assert.equal(rad.detail.hanvisadTill, 'contact@hairtpclinic.com');
  });
});

test('spärren är en KONSTANT, inte en env-flagga', () => {
  // Ett verksamhetsbeslut ska inte gå att slå av på en server klockan tre på
  // natten. Ska det ändras ska det granskas.
  const kod = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'routes', 'bookingPublicActions.js'),
    'utf8'
  );
  assert.match(kod, /const KUND_FAR_AVBOKA = false;/);
  assert.ok(
    !/KUND_FAR_AVBOKA[^\n]*process\.env/.test(kod),
    'spärren får inte läsa en miljövariabel'
  );
});

test('kontaktuppgifterna står i facit, inte i koden', () => {
  const kod = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'routes', 'bookingPublicActions.js'),
    'utf8'
  );
  assert.ok(!kod.includes('contact@hairtpclinic.com'), 'adressen läses ur facit');
  assert.ok(!kod.includes('031 88 11 66'), 'numret läses ur facit');
  assert.match(kod, /require\('\.\.\/\.\.\/config\/avbokning-kontakt\.json'\)/);
});

test('facit har båda klinikerna med e-post OCH telefon', () => {
  for (const id of ['hair-tp-clinic', 'curatiio']) {
    const k = KONTAKT.kliniker[id];
    assert.ok(k, `${id} saknas`);
    assert.match(k.epost, /@/, `${id} saknar e-post`);
    assert.match(k.telefonVisas, /\d/, `${id} saknar telefon`);
  }
  assert.equal(KONTAKT.kliniker.curatiio.epost, 'contact@curatiio.com', 'ägarens ord');
});

test('klinikerna har OLIKA nummer — hämtade från deras hemsidor', () => {
  // Jag skrev först Hair TP:s nummer på Curatiio-raden med en notering om att
  // det var obekräftat, eftersom brandConfig har samma nummer på båda. Ägaren:
  // "nej dem har olika nummer, sök på hemsidorna." Uppgiften fanns — jag hade
  // letat på fel ställe. En markering om osäkerhet ersätter inte en mätning
  // som går att göra.
  const htp = KONTAKT.kliniker['hair-tp-clinic'];
  const cur = KONTAKT.kliniker.curatiio;
  assert.equal(htp.telefon, '+4631881166', 'hairtpclinic.com/kontakt');
  assert.equal(cur.telefon, '+4631882244', 'curatiio.com/kontakt');
  assert.notEqual(htp.telefon, cur.telefon, 'olika nummer, det var hela poängen');
  assert.equal(cur.epost, 'contact@curatiio.com');
  for (const k of [htp, cur]) assert.match(k.kalla, /hämtad 2026-09-04/, 'proveniens ska stå');
});

test('brandConfig avviker — och avvikelsen är dokumenterad, inte tyst', () => {
  // brandConfig.js har fel nummer och fel adress för Curatiio. Den filen styr
  // avsändare och SMS för ALL klinikpost; att ändra den var en större sak än
  // den som beställdes. Men avvikelsen får inte glömmas bort.
  const brand = require('../../src/brand/brandConfig');
  const cfg = brand.BRANDS ? brand.BRANDS.curatiio : brand.curatiio || null;
  if (cfg && cfg.contact) {
    assert.notEqual(
      cfg.contact.phone,
      KONTAKT.kliniker.curatiio.telefon,
      'stämmer de överens är noteringen inaktuell och ska bort'
    );
  }
  assert.ok(KONTAKT._brandconfig_avviker, 'avvikelsen ska stå utskriven i facit');
});
