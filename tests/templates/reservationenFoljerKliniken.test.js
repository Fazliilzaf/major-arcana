'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildBookingReservationEmail,
  resolveMeetingTypeCopy,
} = require('../../src/templates/bookingReservationEmail');

/**
 * ORD-209 — reservationsmejlet.
 *
 * DET FÖRSTA BREVET EN NY PATIENT FÅR, innan någon har ringt. Det sa "Tack för
 * att du bokat hos Hair TP Clinic" även till den som bokat en ögonlocksplastik
 * hos Curatiio, och gav Hair TP:s nummer att ringa om något ändrades.
 *
 * Sjätte gången samma familj: ORD-200, ORD-203, ORD-206, ORD-207, ORD-208.
 */

const BAS = {
  patientName: 'Anna Andersson',
  slotStart: '2026-10-01T09:00:00Z',
  serviceId: 'consultation-physical',
};

test('CURATIIO-PATIENT ser aldrig Hair TP — html och text', () => {
  for (const locale of ['sv', 'en']) {
    const m = buildBookingReservationEmail({ ...BAS, locale, tenantId: 'curatiio' });
    assert.ok(!/Hair TP|hairtpclinic/.test(m.html), `${locale}: Hair TP i html`);
    assert.ok(!/Hair TP|hairtpclinic/.test(m.text), `${locale}: Hair TP i text`);
    assert.match(m.html, /Curatiio/, `${locale}: klinikens namn saknas`);
  }
});

test('TELEFONNUMRET att ringa är klinikens eget', () => {
  /**
   * Brevet säger "ring oss om något ändras". Fel nummer där betyder att
   * patienten ringer en klinik som inte har bokningen.
   */
  const c = buildBookingReservationEmail({ ...BAS, tenantId: 'curatiio' });
  assert.match(c.text, /ring oss på 031-88 22 44/);

  /**
   * BUNDET TILL MENINGEN, inte till strängen.
   *
   * Numret står på TVÅ ställen i brevet: i den här meningen och i sidfoten
   * (sedan ORD-206). En lös sökning efter tel:+4631882244 hittade foten och
   * gick grön även när brödtextens länk pekade på Hair TP — mutationen
   * överlevde. Exakt samma fälla som i ORD-208.
   */
  assert.match(
    c.html,
    /ring oss på <a href="tel:\+4631882244"/,
    'brödtextens telefonlänk pekar på fel klinik'
  );

  const h = buildBookingReservationEmail({ ...BAS, tenantId: 'hair-tp-clinic' });
  assert.match(h.text, /ring oss på 031 88 11 66/);
  assert.match(h.html, /ring oss på <a href="tel:\+4631881166"/);
});

test('PLATSEN följer kliniken i båda grenarna', () => {
  for (const serviceId of ['consultation-physical', 'followup-transplant']) {
    const c = resolveMeetingTypeCopy({ serviceId, tenantId: 'curatiio' });
    assert.equal(c.channel, 'Curatiio, Göteborg', serviceId);
    const h = resolveMeetingTypeCopy({ serviceId, tenantId: 'hair-tp-clinic' });
    assert.equal(h.channel, 'Hair TP Clinic, Göteborg', serviceId);
  }
  // Engelska staden ska också följa med.
  const en = resolveMeetingTypeCopy({
    serviceId: 'consultation-physical',
    locale: 'en',
    tenantId: 'curatiio',
  });
  assert.equal(en.channel, 'Curatiio, Gothenburg');
});

test('EN EXPLICIT locationLabel VINNER över klinikens standard', () => {
  /**
   * Personalen kan sätta en egen plats på passet. Klinikuppslaget är en
   * fallback, inte ett överskrivande.
   */
  const m = resolveMeetingTypeCopy({
    serviceId: 'consultation-physical',
    locationLabel: 'Mottagning 2, plan 3',
    tenantId: 'curatiio',
  });
  assert.equal(m.channel, 'Mottagning 2, plan 3');
});

test('UTAN tenantId blir det Hair TP — oförändrat för allt annat', () => {
  const m = buildBookingReservationEmail(BAS);
  assert.match(m.text, /Hair TP Clinic/);
  assert.match(m.html, /htp-logo-email\.png/);
});

test('AVSÄNDAREN skickar med kliniken', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const route = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'routes', 'publicBookingEngine.js'),
    'utf8'
  );
  // Anropet till reservationsmallen ska bära tenantId.
  const anrop = (route.match(/buildBookingReservationEmail\(\{[\s\S]*?\}\);/) || [''])[0];
  assert.match(anrop, /tenantId/, 'publicBookingEngine skickar inte med kliniken');
});
