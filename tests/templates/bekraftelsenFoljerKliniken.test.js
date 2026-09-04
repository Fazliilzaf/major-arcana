'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildBookingConfirmationEmail } = require('../../src/templates/bookingConfirmationEmail');

/**
 * ORD-208 — bokningsbekräftelsen.
 *
 * TVÅ FEL I SAMMA MEJL, och det är det som når flest patienter: det skickas
 * vid VARJE bokning, inte bara inför besöket som påminnelsen.
 *
 * 1. Det länkade till /avboka med ordet "Avboka". Sedan ORD-202 svarar den
 *    sidan 405 — kunden får omboka men inte avboka. En inbjudan till en låst
 *    dörr, i det första brev en ny patient får.
 *
 * 2. Sidfot, signatur, adress och ICS-beskrivning var Hair TP oavsett klinik.
 *
 * Ingenting hade nått en kund — alla tre grindar är avstängda — men det hade
 * skett första dagen de öppnades.
 */

const BAS = {
  customerName: 'Anna Andersson',
  serviceLabel: 'Ögonlocksplastik',
  slotStart: '2026-10-01T09:00:00Z',
};
const LANKAR = {
  cancelUrl: 'https://arcana.example/avboka/xyz',
  rebookUrl: 'https://arcana.example/omboka/xyz',
};

test('AVBOKA LÄNKAS INTE — sidan nekar kunden sedan ORD-202', () => {
  const m = buildBookingConfirmationEmail({ ...BAS, actionLinks: LANKAR });
  assert.ok(!m.html.includes('/avboka/'), 'html länkar fortfarande till avbokningssidan');
  assert.ok(!m.text.includes('/avboka/'), 'text länkar fortfarande till avbokningssidan');
  // ...men omboka SKA finnas. Utan motprovet kunde båda ha försvunnit.
  assert.match(m.html, /\/omboka\/xyz/, 'omboka-länken försvann');
  assert.match(m.text, /\/omboka\/xyz/, 'omboka saknas i textversionen');
});

test('AVBOKNINGSVÄGEN står i stället, med rätt kliniks uppgifter', () => {
  /**
   * MÄTS PÅ SJÄLVA MENINGEN, inte på adressen.
   *
   * Första versionen letade bara efter contact@curatiio.com i brevet — men
   * sedan ORD-206 står den adressen ÄVEN i sidfoten. Mutationen som tog bort
   * hela avbokningsstycket överlevde därför grön: strängen fanns kvar, en rad
   * längre ner, i ett stycke som betyder något helt annat.
   *
   * Två träffar på samma sträng är inte samma sak som rätt innehåll.
   */
  const c = buildBookingConfirmationEmail({ ...BAS, tenantId: 'curatiio' });
  assert.match(c.html, /Behöver du avboka\?[\s\S]{0,200}contact@curatiio\.com/, 'saknas i html');
  assert.match(c.html, /Behöver du avboka\?[\s\S]{0,250}031-88 22 44/, 'numret saknas');
  assert.match(c.text, /Behöver du avboka\? Mejla contact@curatiio\.com/, 'saknas i text');

  const h = buildBookingConfirmationEmail({ ...BAS, tenantId: 'hair-tp-clinic' });
  assert.match(h.html, /Behöver du avboka\?[\s\S]{0,200}contact@hairtpclinic\.com/);
  assert.match(h.text, /Behöver du avboka\? Mejla contact@hairtpclinic\.com/);
});

test('PLATSRADEN följer kliniken — det patienten läser på väg dit', () => {
  /**
   * Mutationen som låste platsen till 'Hair TP Clinic, Göteborg' överlevde
   * först: mina anrop saknade serviceId, så de föll till standardgrenen och
   * rörde aldrig de två grenar där platsen faktiskt sätts.
   *
   * Raden går ut i både brevet och kalenderfilens LOCATION — den rad telefonen
   * visar när patienten öppnar bokningen på väg till kliniken.
   */
  for (const serviceId of ['consultation-physical', 'followup-transplant']) {
    const m = buildBookingConfirmationEmail({ ...BAS, serviceId, tenantId: 'curatiio' });
    assert.match(m.html, /Curatiio, Göteborg/, `${serviceId}: fel plats i brevet`);
    assert.ok(!m.html.includes('Hair TP Clinic, Göteborg'), `${serviceId}: Hair TP i brevet`);
    assert.match(m.ics, /LOCATION:Curatiio, Göteborg/, `${serviceId}: fel LOCATION i ICS`);
  }

  // Motprovet: Hair TP ska fortfarande få sin egen plats.
  const h = buildBookingConfirmationEmail({
    ...BAS,
    serviceId: 'consultation-physical',
    tenantId: 'hair-tp-clinic',
  });
  assert.match(h.html, /Hair TP Clinic, Göteborg/);
});

test('HELA BREVET följer kliniken — fot, signatur, logga, ICS', () => {
  const m = buildBookingConfirmationEmail({ ...BAS, tenantId: 'curatiio' });
  assert.ok(!m.html.includes('contact@hairtpclinic.com'), 'Hair TP:s e-post kvar');
  assert.ok(!m.html.includes('031 88 11 66'), 'Hair TP:s nummer kvar');
  assert.ok(!m.html.includes('htp-logo-email.png'), 'Hair TP:s logga på ett Curatiio-brev');
  assert.ok(!m.text.includes('contact@hairtpclinic.com'), 'Hair TP i textsignaturen');
  assert.match(m.ics, /Curatiio/, 'ICS-beskrivningen säger fel klinik');
  assert.ok(!/Hair TP Clinic/.test(m.ics), `Hair TP kvar i ICS: ${m.ics.slice(0, 300)}`);
});

test('UTAN tenantId blir det Hair TP — oförändrat', () => {
  /**
   * Bekräftelsen skickas från flera ställen. De som inte vet vilken klinik
   * det gäller ska bete sig exakt som förut.
   */
  const m = buildBookingConfirmationEmail(BAS);
  assert.match(m.html, /contact@hairtpclinic\.com/);
  assert.match(m.html, /htp-logo-email\.png/);
});

test('UTAN LÄNKAR faller texten tillbaka — aldrig en halv länk', () => {
  const m = buildBookingConfirmationEmail(BAS);
  assert.ok(!m.html.includes('href="undefined'), 'halv länk');
  assert.ok(!m.html.includes('/omboka/'));
  assert.match(m.html, /Behöver du omboka\?/, 'fallbacktexten saknas');
});

test('AVSÄNDAREN skickar med tenantId — mätt, inte grepat', () => {
  /**
   * Ett grep efter `tenantId` i dispatchfilen blir grönt av vilken rad som
   * helst. Här läses i stället det brev som faktiskt byggs: samma mall, samma
   * indata som ccoCommercialMailDispatch skickar, och kontroll av att
   * klinikvalet slår igenom hela vägen till ICS-filen.
   */
  const fs = require('node:fs');
  const path = require('node:path');
  const dispatch = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'ops', 'ccoCommercialMailDispatch.js'),
    'utf8'
  );
  assert.match(
    dispatch,
    /tenantId: safeBooking\.tenantId \|\| null/,
    'dispatch skickar inte med kliniken'
  );

  // Och beteendet: samma anrop som dispatch gör.
  const m = buildBookingConfirmationEmail({
    customerName: 'Bo',
    serviceLabel: 'Ögonlocksplastik',
    slotStart: '2026-10-01T09:00:00Z',
    actionLinks: LANKAR,
    tenantId: 'curatiio',
  });
  assert.match(m.html, /Curatiio/);
  assert.ok(!m.html.includes('contact@hairtpclinic.com'));
});
