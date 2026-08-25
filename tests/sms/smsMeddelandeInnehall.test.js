'use strict';

/**
 * Utgående SMS måste bära klinikens telefonnummer — och rymmas i ett SMS.
 *
 * Bakgrund 2026-08-25. Utskicken går med avsändarnamnet "HairTP", ett
 * text-sender-ID. 46elks kan inte ta emot svar på ett sådant: mottagaren ser
 * ett namn, inte ett nummer. Kunden ska heller inte kunna svara — det är ett
 * medvetet beslut.
 *
 * Men texterna bad kunden "avboka senast 24h före" respektive "kontakta oss
 * för ny tid" utan att säga hur. Mottagaren hade alltså en uppmaning att agera
 * och ingen kanal att göra det i. Det hade blivit samtal av typen "jag
 * försökte svara men det gick inte fram".
 *
 * Det andra testet handlar om pengar. Gränsen för ett SMS är 160 tecken i
 * GSM 03.38. Varje del därutöver debiteras som ett helt SMS, per mottagare,
 * varje gång jobbet kör. Å, ä och ö ingår i teckenuppsättningen och kostar
 * inget — men en emoji tvingar hela meddelandet till UTF-16 och sänker
 * gränsen till 70 tecken. Ett tillagt hjärta skulle alltså tredubbla
 * kostnaden för hela utskicket utan att någon märkte det.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildBookingReminderSms, buildCancellationSms } = require('../../src/sms/smsConnector');

const KLINIKENS_NUMMER = '+4631881146';

// GSM 03.38 basic + extension. Tecken utanför dessa tvingar UTF-16.
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€';

/** Returnerar { gsm, tecken } där tecken är GSM-vikten, inte strängens längd. */
function gsmVikt(text) {
  let vikt = 0;
  for (const tecken of text) {
    if (GSM_BASIC.includes(tecken)) vikt += 1;
    else if (GSM_EXT.includes(tecken)) vikt += 2;
    else return { gsm: false, tecken: [...text].length };
  }
  return { gsm: true, tecken: vikt };
}

// Rimligt långa värden — inte de kortaste, så gränsen testas med marginal.
const PAMINNELSE = {
  patientName: 'Abdirahman',
  serviceName: 'Håroperation FUE',
  date: '2026-09-15',
  time: '08:30',
};

test('påminnelsen innehåller klinikens telefonnummer', () => {
  const text = buildBookingReminderSms(PAMINNELSE);
  assert.ok(
    text.includes(KLINIKENS_NUMMER),
    `numret saknas — kunden uppmanas avboka utan att kunna svara på SMS:et.\n${text}`
  );
});

test('avbokningen innehåller klinikens telefonnummer', () => {
  const text = buildCancellationSms(PAMINNELSE);
  assert.ok(text.includes(KLINIKENS_NUMMER), `numret saknas i avbokningen.\n${text}`);
});

test('påminnelsen ryms i ett enda SMS', () => {
  const text = buildBookingReminderSms(PAMINNELSE);
  const { gsm, tecken } = gsmVikt(text);

  assert.equal(gsm, true, `tecken utanför GSM 03.38 sänker gränsen till 70.\n${text}`);
  assert.ok(tecken <= 160, `${tecken} tecken — över 160 blir två SMS och dubbel kostnad.\n${text}`);
});

test('avbokningen ryms i ett enda SMS', () => {
  const { gsm, tecken } = gsmVikt(buildCancellationSms(PAMINNELSE));
  assert.equal(gsm, true);
  assert.ok(tecken <= 160, `${tecken} tecken`);
});

test('å ä ö kostar inget extra — de ingår i GSM 03.38', () => {
  assert.equal(gsmVikt('Håroperation på Hair TP Clinic i Göteborg').gsm, true);
});

test('en emoji tvingar UTF-16 och sänker gränsen till 70', () => {
  // Skyddar mot att någon "piffar till" mallen och tredubblar utskickskostnaden.
  assert.equal(gsmVikt('Välkommen! 🎉').gsm, false);
});

test('numret går att överstyra per anrop', () => {
  const text = buildBookingReminderSms({ ...PAMINNELSE, clinicPhone: '+46700000000' });
  assert.ok(text.includes('+46700000000'));
  assert.ok(!text.includes(KLINIKENS_NUMMER));
});
