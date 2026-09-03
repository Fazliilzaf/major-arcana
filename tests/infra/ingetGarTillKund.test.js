'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { bedomKundutskick, arKundutskickPa } = require('../../src/infra/kundutskickGate');
const { createTransactionalMailer } = require('../../src/infra/transactionalMailer');

/**
 * ORD-184 — ingenting går till kund.
 *
 * Ägaren 2026-09-03: "vi kan köra på med alla installationer och
 * implementering men det får inte skickas någon info till någon kund."
 *
 * VARFÖR DET BEHÖVDES EN TILL GRIND. Mätt samma dag: `CCO_SEND_LIVE=false`
 * grindar offerter, utskick, SMS-puffar och portalnotiser — men INTE
 * bokningsbekräftelser:
 *
 *   bekräfta bokning
 *     → toggles.automaticBookingConfirmation (default TRUE)
 *     → transactionalMailer.sendEmail
 *     → Resend (ej konfigurerad) → Graph (ARCANA_GRAPH_SEND_ENABLED=true i prod)
 *     → skickat
 *
 * CCO_SEND_LIVE finns inte i den kedjan. Ingenting hade gått ut hittills, men
 * bara för att CCO knappt har några bokningar — noll bokningsbekräftelser i
 * audit-loggen. Omständighet, inte skydd.
 *
 * Och för Cliento-importen var det akut: 381 bokningar genom bekräftelsevägen
 * hade blivit 381 mail till patienter om tider de bokade för månader sedan.
 */

const AV = {};
const PA = { ARCANA_KUNDUTSKICK_ENABLED: 'true' };

test('utan deklarerad mottagartyp blockeras utskicket', () => {
  // Grinden frågar inte "är det här en kund?" utan "har någon intygat att det
  // INTE är det?". Att gissa ur adressen kräver en lista över personalens
  // adresser, och den blir fel den dag någon anställs.
  assert.equal(bedomKundutskick(undefined, AV).blockerat, true);
  assert.equal(bedomKundutskick('', AV).blockerat, true);
  assert.equal(bedomKundutskick('customer', AV).blockerat, true);
  assert.equal(bedomKundutskick('patient', AV).blockerat, true);
});

test('personal- och driftnotiser släpps igenom även när grinden är av', () => {
  // Annars hade spärren tystat klinikens egna larm, och ett dolt driftfel är
  // inte en säkrare klinik.
  for (const typ of ['staff', 'ops', 'internal']) {
    assert.equal(bedomKundutskick(typ, AV).blockerat, false, typ);
  }
});

test('skälet står med, så att en utebliven bekräftelse går att förklara', () => {
  assert.match(bedomKundutskick(undefined, AV).skal, /audience saknas/);
  assert.match(bedomKundutskick('customer', AV).skal, /audience: customer/);
});

test('grinden är AV som standard och kräver ett medvetet ja', () => {
  assert.equal(arKundutskickPa({}), false, 'default måste vara av');
  assert.equal(arKundutskickPa({ ARCANA_KUNDUTSKICK_ENABLED: 'false' }), false);
  assert.equal(arKundutskickPa({ ARCANA_KUNDUTSKICK_ENABLED: '0' }), false);
  assert.equal(arKundutskickPa({ ARCANA_KUNDUTSKICK_ENABLED: 'kanske' }), false, 'skräp = av');
  assert.equal(arKundutskickPa(PA), true);
  assert.equal(arKundutskickPa({ ARCANA_KUNDUTSKICK_ENABLED: '1' }), true);
});

test('påslagen grind släpper igenom kundutskick', () => {
  // Spärren ska gå att lyfta den dag kliniken vill — annars byggs den bort i
  // stället för att slås på.
  assert.equal(bedomKundutskick('customer', PA).blockerat, false);
  assert.equal(bedomKundutskick(undefined, PA).blockerat, false);
});

test('MAILERN skickar inte — grinden sitter i sändvägen, inte i anroparna', async () => {
  // Det här är kärnan. Grinden ligger i transactionalMailer i stället för i de
  // tretton anropsställena, så att en ny sändväg är blockerad tills någon
  // aktivt märker den. Motsatsen kräver att nästa person hittar det fjortonde
  // stället.
  //
  // graphSendConnector fejkas som fungerande. Skulle grinden inte hålla
  // anropas den — och testet ser det.
  let anropad = false;
  const mailer = createTransactionalMailer({
    graphSendConnector: {
      sendNewMessage: async () => {
        anropad = true;
        return { sendMode: 'send_mail' };
      },
    },
  });

  const res = await mailer.sendEmail({
    to: 'riktig.kund@gmail.com',
    subject: 'Din bokning är bekräftad',
    text: 'Välkommen',
  });

  assert.equal(anropad, false, 'ingenting fick nå Graph');
  assert.equal(res.mode, 'blocked');
  assert.match(res.skipped, /kundutskick_avstangt/);
});

test('en driftnotis når fram, med samma mailer', async () => {
  // Motprovet. Spärren får inte vara ett generellt sändstopp.
  let anropad = false;
  const mailer = createTransactionalMailer({
    graphSendConnector: {
      sendNewMessage: async () => {
        anropad = true;
        return { sendMode: 'send_mail' };
      },
    },
  });

  const res = await mailer.sendEmail({
    to: 'contact@hairtpclinic.com',
    audience: 'ops',
    subject: '[Arcana] driftprob',
    text: 'prob',
  });

  assert.equal(anropad, true, 'driftnotisen ska gå fram');
  assert.equal(res.mode, 'live');
});

test('spärren ligger FÖRE leverantörsvalet', async () => {
  // Ordningen spelar roll: inget får hinna iväg medan en senare kontroll
  // fortfarande överväger. Utan mottagare finns ingen adress att blockera på,
  // så den kontrollen får ligga före — men allt som rör sändning ska ligga
  // efter grinden.
  const mailer = createTransactionalMailer({
    graphSendConnector: {
      sendNewMessage: async () => {
        throw new Error('fick aldrig anropas');
      },
    },
  });
  const res = await mailer.sendEmail({ to: 'kund@gmail.com', subject: 'x' });
  assert.equal(res.mode, 'blocked');
});
