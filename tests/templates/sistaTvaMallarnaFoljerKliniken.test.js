'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildBookingCancellationEmail } = require('../../src/templates/bookingCancellationEmail');

/**
 * ORD-210 — de två sista kundnära mallarna.
 *
 * AVBOKNINGSMEJLET går ut när PERSONALEN avbokar (kunden får inte, ORD-202).
 * Det sa "ring oss på 031 88 11 66" även till en Curatiio-patient som just
 * blivit av med sin ögonlockstid och vill boka en ny — alltså fel klinik att
 * ringa, i det ögonblick patienten är som mest benägen att ringa.
 *
 * POST-OP-FÖRFRÅGAN hade fyra hårdkodade konstanter. Den går ut ett år efter
 * ingreppet och ber om foto och omdöme. Samtyckesraden pekar ut vem patienten
 * ska vända sig till för att dra tillbaka sitt medgivande — fel adress där är
 * inte ett skönhetsfel.
 *
 * Sjunde gången samma familj: ORD-200, 203, 206, 207, 208, 209.
 */

const BAS = {
  customerName: 'Anna Andersson',
  slotStart: '2026-10-01T09:00:00Z',
  serviceId: 'consultation-physical',
};

test('AVBOKNINGSMEJLET: Curatiio-patienten ser aldrig Hair TP', () => {
  for (const locale of ['sv', 'en']) {
    const m = buildBookingCancellationEmail({ ...BAS, locale, tenantId: 'curatiio' });
    assert.ok(!/Hair TP|hairtpclinic/.test(m.html), `${locale}: Hair TP i html`);
    assert.ok(!/Hair TP|hairtpclinic/.test(m.text), `${locale}: Hair TP i text`);
    assert.match(m.html, /Curatiio/, `${locale}: klinikens namn saknas`);
  }
});

test('AVBOKNINGSMEJLET: numret att ringa för ny tid är klinikens eget', () => {
  /**
   * BUNDET TILL MENINGEN, inte till strängen — numret står också i sidfoten
   * sedan ORD-206. Två mutationer överlevde den fällan tidigare i dag.
   */
  const c = buildBookingCancellationEmail({ ...BAS, tenantId: 'curatiio' });
  assert.match(c.text, /ring oss på 031-88 22 44/);
  assert.match(c.html, /ring oss på <a href="tel:\+4631882244"/);

  const h = buildBookingCancellationEmail({ ...BAS, tenantId: 'hair-tp-clinic' });
  assert.match(h.text, /ring oss på 031 88 11 66/);
  assert.match(h.html, /ring oss på <a href="tel:\+4631881166"/);
});

test('AVBOKNINGSMEJLET: platsraden följer kliniken', () => {
  const c = buildBookingCancellationEmail({ ...BAS, tenantId: 'curatiio' });
  assert.match(c.text, /Plats \/ kanal: Curatiio, Göteborg/);
});

test('AVBOKNINGSMEJLET: utan tenantId blir det Hair TP — oförändrat', () => {
  const m = buildBookingCancellationEmail(BAS);
  assert.match(m.text, /Hair TP Clinic/);
  assert.match(m.html, /htp-logo-email\.png/);
});

test('POST-OP: samtyckesraden pekar på rätt klinik', () => {
  /**
   * Den raden är juridiskt laddad: den säger vart patienten vänder sig för
   * att återkalla sitt samtycke till att bilden används. Fel adress betyder
   * att en återkallelse går till fel klinik — eller ingenstans.
   *
   * FÖRSTA VERSIONEN AV TESTET GISSADE FEL EXPORTNAMN (`buildEmailSv` i
   * stället för `_buildEmailSv`), föll till en grep i källkoden, och blev
   * grön på en mutation som bytte ut hela klinikuppslaget mot hårdkodade
   * Hair TP-värden — greppet råkade träffa ett annat anrop längre ner.
   *
   * Byggarna ÄR exporterade. Testet kör dem.
   */
  const { _buildEmailSv, _buildEmailEn } = require('../../src/capabilities/requestPostOpReview');
  assert.equal(typeof _buildEmailSv, 'function', 'byggaren är inte längre exporterad');

  for (const bygg of [_buildEmailSv, _buildEmailEn]) {
    const c = bygg({ patientFirstName: 'Anna', reviewLink: 'https://x/y', tenantId: 'curatiio' });
    assert.match(c.html, /contact@curatiio\.com/, 'fel samtyckesadress');
    assert.ok(!/hairtpclinic|Hair TP/.test(c.html), 'Hair TP i ett Curatiio-brev');
    assert.ok(!/hairtpclinic|Hair TP/.test(c.text || ''), 'Hair TP i textversionen');
  }

  // Motprovet: Hair TP ska fortfarande få sina egna uppgifter.
  const h = _buildEmailSv({
    patientFirstName: 'Bo',
    reviewLink: 'https://x/y',
    tenantId: 'hair-tp-clinic',
  });
  assert.match(h.html, /contact@hairtpclinic\.com/);

  /**
   * ...OCH KAPABILITETEN MÅSTE FAKTISKT SKICKA MED KLINIKEN.
   *
   * Testet ovan anropar byggaren direkt och hoppar därmed över inkopplingen.
   * Mutationen som tog bort `tenantId` ur kapabilitetens anrop överlevde
   * därför — byggaren fick alltid rätt värde från testet självt.
   *
   * Att köra hela kapabiliteten kräver store, token och submission. Det här
   * är i stället en STRUKTURKONTROLL, avgränsad till exakt det anropet — inte
   * en sökning i hela filen, som skulle träffa vilket annat `tenantId` som
   * helst. Svagare än att köra koden, och märkt som sådan.
   */
  const fs = require('node:fs');
  const path = require('node:path');
  const kod = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'capabilities', 'requestPostOpReview.js'),
    'utf8'
  );
  const anrop = (kod.match(/const email = emailBuilder\(\{[\s\S]*?\n\s*\}\);/) || [''])[0];
  assert.ok(anrop.length > 0, 'hittade inte anropet till mallbyggaren');
  assert.match(anrop, /\btenantId\b/, 'kapabiliteten skickar inte med kliniken till mallen');
});

test('AVBOKNINGSMEJLETS AVSÄNDARE skickar med kliniken — mätt, inte grepat', async () => {
  /**
   * Mutationen som tog bort tenantId ur ccoPatientCareOps överlevde först:
   * mina tester körde bara mallen, aldrig avsändaren. Samma lucka som
   * ORD-205 hade för den andra påminnelsevägen.
   *
   * Här körs dispatchfunktionen med en stubbad connector, och brevet som
   * FAKTISKT går ut läses.
   */
  const { dispatchBookingCancellationEmail } = require('../../src/ops/ccoPatientCareOps');

  const tidigareGate = process.env.ARCANA_KUNDUTSKICK_ENABLED;
  process.env.ARCANA_KUNDUTSKICK_ENABLED = 'true';
  const skickade = [];
  try {
    await dispatchBookingCancellationEmail({
      booking: {
        bookingId: 'b-210',
        tenantId: 'curatiio',
        customerName: 'Anna',
        // INTE example.com — mailDeliveryGuard stoppar RFC2606-domäner före
        // connectorn, och då mäter testet ingenting.
        customerEmail: 'anna@ord210-fiktiv.se',
        slot: { startsAt: '2026-10-01T09:00:00Z', serviceId: 'consultation-physical' },
      },
      graphSendConnector: {
        async sendNewMessage(a) {
          skickade.push(a);
          return { sendMode: 'send_mail' };
        },
      },
    });
  } finally {
    if (tidigareGate === undefined) delete process.env.ARCANA_KUNDUTSKICK_ENABLED;
    else process.env.ARCANA_KUNDUTSKICK_ENABLED = tidigareGate;
  }

  if (!skickade.length) {
    assert.fail('inget gick ut — testet mäter ingenting och måste skrivas om, inte tas bort');
  }

  /**
   * INNEHÅLLET mäts, inte kuvertet.
   *
   * Första versionen läste hela JSON-objektet och gick rött på `mailboxId`,
   * som ÄR contact@hairtpclinic.com — helt riktigt: Curatiio står som vilande
   * i facit (ORD-203) tills brevlådan är klar, och avsändaren faller då
   * tillbaka på en adress som fungerar. Att kräva Curatiio där hade varit att
   * kräva att posten inte går fram.
   */
  const innehall = `${skickade[0].body || ''}${skickade[0].bodyHtml || ''}${skickade[0].subject || ''}`;
  assert.ok(!/Hair TP|hairtpclinic/.test(innehall), 'Hair TP i ett Curatiio-avbokningsmejl');
  assert.match(innehall, /Curatiio/);

  // Och kliniken ska ha nått mailern, så ORD-203:s avsändarval fungerar den
  // dag Curatiio aktiveras. Fram till dess är fallbacken rätt svar.
  assert.equal(skickade[0].mailboxId, 'contact@hairtpclinic.com', 'vilande klinik → fallback');
});
