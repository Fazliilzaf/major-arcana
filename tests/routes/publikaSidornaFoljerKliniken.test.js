'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { createBookingPublicActionsRouter } = require('../../src/routes/bookingPublicActions');

/**
 * ORD-207 — avboka- och ombokasidorna följer kliniken.
 *
 * Skalet var hårdkodat Hair TP: <title>, logotypen överst och kickern i
 * felsidan. ORD-205 la omboka-länken i påminnelsen, vilket betyder att en
 * Curatiio-patient nu FAKTISKT skickas hit — och landade på en sida med fel
 * kliniks sköld.
 *
 * Fjärde gången samma familj: ORD-200 (kundresans steg), ORD-203
 * (avsändaradressen), ORD-206 (mejlets sidfot), nu de publika sidorna.
 */

const TOKEN = 'c'.repeat(64);

function byggApp(tenantId) {
  const booking = {
    bookingId: 'b-207',
    status: 'confirmed',
    tenantId,
    customerName: 'Anna',
    customerEmail: 'anna@ord207-fiktiv.se',
    serviceLabel: 'Ögonlocksplastik',
    bookingActionToken: TOKEN,
    slot: { startsAt: '2026-10-01T09:00:00Z', serviceLabel: 'Ögonlocksplastik' },
  };
  const app = express();
  app.use(
    createBookingPublicActionsRouter({
      bookingEngineStore: { _state: { bookings: [booking] } },
    })
  );
  return app;
}

async function hamta(app, sokvag) {
  const server = app.listen(0);
  try {
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}${sokvag}`);
    return { status: res.status, html: await res.text() };
  } finally {
    server.close();
  }
}

test('CURATIIO-PATIENT SER ALDRIG HAIR TP på avbokningssidan', async () => {
  const { status, html } = await hamta(byggApp('curatiio'), `/avboka/${TOKEN}`);
  assert.equal(status, 200);
  assert.match(html, /Curatiio/, 'klinikens namn saknas');
  assert.match(html, /contact@curatiio\.com/, 'fel e-post');
  assert.match(html, /031-88 22 44/, 'fel telefon');

  // Skalet: titel och logotyp.
  assert.ok(!/<title>[^<]*Hair TP Clinic/.test(html), 'sidtiteln säger Hair TP');
  assert.ok(!html.includes('htp-logo-email.png'), 'Hair TP:s logga på en Curatiio-sida');
  assert.ok(!html.includes('contact@hairtpclinic.com'), 'Hair TP:s e-post läckte in');
  assert.ok(!html.includes('031 88 11 66'), 'Hair TP:s nummer läckte in');
});

test('INGEN TRASIG BILD när kliniken saknar logotyp', async () => {
  /**
   * Curatiio har ingen egen logga. Utan spärren blir det src="null" eller en
   * tom <img> — en bruten bildikon överst på sidan, vilket är sämre än ingen
   * bild alls.
   */
  const { html } = await hamta(byggApp('curatiio'), `/avboka/${TOKEN}`);
  assert.ok(!/<img[^>]*class="logo"/.test(html), `tom loggtagg: ${html.slice(0, 300)}`);
  assert.ok(!/src="(null|undefined|)"/.test(html), 'bruten bildkälla');
});

test('HAIR TP PÅVERKAS INTE — motprovet', async () => {
  /**
   * Utan det här testet kunde ändringen ha tagit bort loggan för alla och
   * ändå gått grön på Curatiio-testet.
   */
  const { html } = await hamta(byggApp('hair-tp-clinic'), `/avboka/${TOKEN}`);
  assert.match(html, /<title>[^<]*Hair TP Clinic/, 'Hair TP tappade sin titel');
  assert.match(html, /htp-logo-email\.png/, 'Hair TP tappade sin logga');
  assert.match(html, /contact@hairtpclinic\.com/);
  assert.ok(!html.includes('Curatiio'), 'Curatiio läckte in på en Hair TP-sida');
});

test('OMBOKASIDAN följer också kliniken', async () => {
  const { status, html } = await hamta(byggApp('curatiio'), `/omboka/${TOKEN}`);
  assert.equal(status, 200);
  assert.ok(!/<title>[^<]*Hair TP Clinic/.test(html), 'ombokasidans titel säger Hair TP');
  assert.ok(!html.includes('htp-logo-email.png'), 'Hair TP:s logga på ombokasidan');
});

test('OMBOKNINGSBEKRÄFTELSEN visar rätt klinik under Plats', async () => {
  /**
   * Mutationen som låste "Plats" till Hair TP överlevde först — jag hade inte
   * kört POST-flödet alls, bara GET-sidorna.
   *
   * Det är den sista sidan kunden ser efter att ha bokat om, och den enda som
   * uttryckligen säger var hen ska komma. Fel klinik där är fel adress i
   * praktiken.
   */
  const NY = '2026-10-08T09:00:00.000Z';
  const booking = {
    bookingId: 'b-207c',
    status: 'confirmed',
    tenantId: 'curatiio',
    serviceId: 'bleph',
    bookingActionToken: TOKEN,
    slot: { startsAt: '2026-10-01T09:00:00Z', serviceLabel: 'Ögonlocksplastik' },
  };
  const app = express();
  app.use(
    createBookingPublicActionsRouter({
      bookingEngineStore: {
        _state: { bookings: [booking] },
        async listAvailability() {
          return [{ startsAt: NY, slotId: 's-1', serviceId: 'bleph' }];
        },
        async rebookBooking() {
          return { ok: true };
        },
      },
    })
  );

  const server = app.listen(0);
  let html;
  try {
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/omboka/${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ newSlot: NY }).toString(),
    });
    html = await res.text();
  } finally {
    server.close();
  }

  assert.match(html, /Tiden är ombokad/, `kom inte till bekräftelsen: ${html.slice(0, 300)}`);
  assert.match(html, /Curatiio/, 'Plats visar inte kliniken');
  assert.ok(!html.includes('Hair TP Clinic'), 'Hair TP läckte in på bekräftelsen');
});

test('FELSIDAN med KÄND klinik säger Curatiio, inte Hair TP', async () => {
  /**
   * Mutationen som låste felsidans kicker till Hair TP överlevde TVÅ gånger,
   * av två olika skäl — och båda är värda att komma ihåg.
   *
   * Först: koden. Jag lade till `klinik` som parameter på renderErrorPage men
   * skickade den aldrig från de elva anropsställen som har bokningen i scope.
   * Parametern fanns, men ingen använde den.
   *
   * Sedan: testet. Jag byggde en avbokad bokning och väntade mig felsidan
   * "Redan avbokad" — men findBookingByToken HOPPAR ÖVER avbokade, så den
   * hittades aldrig och jag landade på 404-sidan där fallbacken är rätt svar.
   *
   * Den här vägen går att nå: POST till /omboka utan vald tid. Bokningen är
   * giltig, kliniken är känd, och felsidan ska säga Curatiio.
   */
  const app = express();
  app.use(
    createBookingPublicActionsRouter({
      bookingEngineStore: {
        _state: {
          bookings: [
            {
              bookingId: 'b-207b',
              status: 'confirmed',
              tenantId: 'curatiio',
              bookingActionToken: TOKEN,
              slot: { startsAt: '2026-10-01T09:00:00Z' },
            },
          ],
        },
      },
    })
  );

  const server = app.listen(0);
  let html;
  try {
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/omboka/${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: '',
    });
    html = await res.text();
  } finally {
    server.close();
  }

  assert.match(html, /Välj en tid/, `nådde inte felsidan: ${html.slice(0, 300)}`);
  assert.match(html, /Curatiio/, 'felsidans kicker säger inte kliniken');
  assert.ok(!html.includes('Hair TP Clinic'), 'Hair TP läckte in på en Curatiio-felsida');
});

test('OKÄND LÄNK blir Hair TP — en trasig token vet inte vems den är', async () => {
  /**
   * Felsidan för en ogiltig token kan omöjligt veta vilken klinik det gällde.
   * Att gissa hade varit värre än att falla tillbaka. Testet finns för att
   * fallbacken ska vara ett medvetet val och inte en glömd gren.
   */
  const { status, html } = await hamta(byggApp('curatiio'), '/avboka/finns-inte');
  assert.equal(status, 404);
  assert.match(html, /Hair TP Clinic/, 'fallbacken saknas helt');
});
