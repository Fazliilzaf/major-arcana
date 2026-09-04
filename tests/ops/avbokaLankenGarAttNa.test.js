'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fsp = require('node:fs/promises');

const {
  nyBookingActionToken,
  tokenMatchar,
  buildBookingActionLinks,
} = require('../../src/ops/bookingActionLink');
const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');
const { buildBookingConfirmationEmail } = require('../../src/templates/bookingConfirmationEmail');
const { bookingMondayWindow } = require('../helpers/bookingTestDates');

/**
 * ORD-190 — avboka- och omboka-länken.
 *
 * SIDORNA FANNS REDAN. bookingPublicActions.js har fyra fungerande routes:
 * GET/POST /avboka/:token och /omboka/:token, med slot-picker och atomiskt lås.
 * Kommentaren sa "TOKEN GENERATION (internal, called by confirm-flow)".
 *
 * Ingenting anropade den. Ingen mall byggde någon länk. Fyra färdiga sidor som
 * ingen kund kunde nå — i fyra månader. Bekräftelsemailet sa i stället "svara
 * på det här mejlet eller ring oss", vilket blir ett telefonsamtal per
 * ombokning på en klinik med 26 besök om dagen.
 *
 * OCH TOKENEN FICK INTE SKICKAS SOM DEN VAR:
 *
 *   sha256(bookingId + (ARCANA_TOKEN_SALT || 'arcana-booking-salt')).slice(0,32)
 *
 * ARCANA_TOKEN_SALT är INTE satt i produktion — verifierat 2026-09-03. Saltet
 * var alltså literalen i källkoden. Med ett boknings-id gick avbokningslänken
 * att räkna fram för vilken bokning som helst. Så länge ingen länk skickades
 * var svagheten sovande; att lägga tokenen i ett mejl hade väckt den.
 */

const MILJO = { PUBLIC_BASE_URL: 'https://arcana.hairtpclinic.com' };

test('token är slumpad, inte härledd ur boknings-id', () => {
  // Kärnan i säkerhetsrättelsen. Två anrop får aldrig ge samma svar, och inget
  // i tokenen får gå att räkna fram ur något som är känt.
  const a = nyBookingActionToken();
  const b = nyBookingActionToken();
  assert.notEqual(a, b);
  assert.equal(a.length, 64, '32 bytes som hex');
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('jämförelsen är tidskonstant och tål skräp', () => {
  const t = nyBookingActionToken();
  assert.equal(tokenMatchar(t, t), true);
  // Byt SISTA tecknet mot ett garanterat annat. Testet hade tidigare
  // `t.slice(0, 63) + '0'`, vilket inte ändrar något alls när tokenen redan
  // slutar på nolla — en gång på sexton. Det gick igenom i sex veckor och slog
  // till först när testsviten växte och körordningen ändrades. En slumpmässig
  // fixtur måste jämföras mot sig själv, inte mot ett antagande om sitt
  // innehåll.
  const sista = t.slice(-1);
  const annat = sista === '0' ? '1' : '0';
  assert.equal(tokenMatchar(t, t.slice(0, 63) + annat), false, 'ett ändrat tecken räcker');
  assert.equal(tokenMatchar(t, ''), false);
  assert.equal(tokenMatchar('', ''), false, 'tomt matchar inte tomt');
  assert.equal(tokenMatchar(t, null), false);
  assert.equal(tokenMatchar(t, t.slice(0, 10)), false, 'olika längd får inte kasta');
});

test('länkarna byggs ur bokningens token', () => {
  const links = buildBookingActionLinks({ bookingActionToken: 'abc123' }, MILJO);
  assert.equal(links.cancelUrl, 'https://arcana.hairtpclinic.com/avboka/abc123');
  assert.equal(links.rebookUrl, 'https://arcana.hairtpclinic.com/omboka/abc123');
});

test('utan token eller bas-URL blir det NULL, inte en halv länk', () => {
  // En trasig avbokningslänk är värre än ingen: kunden klickar, får ett fel,
  // och ringer i tron att systemet tappat bokningen.
  assert.equal(buildBookingActionLinks({}, MILJO), null);
  assert.equal(buildBookingActionLinks({ bookingActionToken: 'abc' }, {}), null);
});

test('en bekräftad bokning får en token, och samma token vid ombekräftelse', async () => {
  // Tokenen får ALDRIG bytas ut för en befintlig bokning — då slutar länken i
  // ett redan skickat mejl att fungera.
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord190-'));
  try {
    const store = await createCcoBookingEngineStore({ filePath: path.join(dir, 'engine.json') });
    const { fromDate, toDate } = bookingMondayWindow();
    const tider = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    const bas = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-190',
      customerEmail: 'kund@example.com',
      customerName: 'Test Kund',
    };
    await store.reserveSlots({ ...bas, selectedSlots: [tider[0]] });
    const forsta = await store.confirmBooking({ ...bas, slot: tider[0] });
    assert.match(forsta.bookingActionToken, /^[0-9a-f]{64}$/);

    const andra = await store.confirmBooking({ ...bas, slot: tider[0] });
    assert.equal(andra.bookingActionToken, forsta.bookingActionToken, 'samma token');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('tokenen överlever en omstart — annars dör länken i mejlet', async () => {
  // Normaliseringen körs om vid varje läsning från disk. Ett fält som tappas
  // där hade ogiltigförklarat en länk som redan skickats. Samma fälla som bet i
  // ORD-181 med createVia.
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord190b-'));
  const filePath = path.join(dir, 'engine.json');
  try {
    const store = await createCcoBookingEngineStore({ filePath });
    const { fromDate, toDate } = bookingMondayWindow();
    const tider = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    const bas = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-190b',
      customerEmail: 'kund2@example.com',
    };
    await store.reserveSlots({ ...bas, selectedSlots: [tider[0]] });
    const bokning = await store.confirmBooking({ ...bas, slot: tider[0] });

    const omstartad = await createCcoBookingEngineStore({ filePath });
    const efter = omstartad._state.bookings.find((b) => b.bookingId === bokning.bookingId);
    assert.equal(efter.bookingActionToken, bokning.bookingActionToken);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('bekräftelsemailet innehåller länkarna när de finns', () => {
  const links = { cancelUrl: 'https://x.se/avboka/tok', rebookUrl: 'https://x.se/omboka/tok' };
  const mail = buildBookingConfirmationEmail({
    customerName: 'Anna',
    serviceId: 'consultation-physical',
    slotStart: '2026-10-01T08:00:00.000Z',
    actionLinks: links,
  });
  assert.match(mail.html, /omboka\/tok/);
  assert.match(mail.html, /avboka\/tok/);
  assert.match(mail.text, /omboka\/tok/);
  assert.match(mail.text, /Boka om tiden/);
});

test('utan länkar faller mailet tillbaka till "ring oss"', () => {
  // Fallbacken är inte en artighet — den är skillnaden mellan en kund som ringer
  // och en kund som klickar på en död länk och tror att bokningen försvunnit.
  const mail = buildBookingConfirmationEmail({
    customerName: 'Anna',
    serviceId: 'consultation-physical',
    slotStart: '2026-10-01T08:00:00.000Z',
  });
  assert.match(mail.text, /ring oss/);
  assert.ok(!mail.html.includes('/avboka/'), 'ingen halv länk');
});

test('den gamla härledda tokenen finns inte längre någonstans', () => {
  // Bakåtkompatibiliteten är medvetet borta. De 16 bokningarna i prod är
  // huvudsakligen testdata från maj och deras gamla länkar har aldrig skickats.
  // Att behålla den härledda vägen "för säkerhets skull" hade varit att behålla
  // svagheten.
  const fs = require('node:fs');
  const kalla = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'routes', 'bookingPublicActions.js'),
    'utf8'
  );
  // Mäter det som KÖRS, inte det som står. Första versionen letade efter
  // strängen 'arcana-booking-salt' och blev röd på min egen kommentar där den
  // gamla koden dokumenteras. Ett test som fäller en förklaring i stället för
  // ett beteende mäter fel sak.
  assert.ok(!kalla.includes("createHash('sha256')"), 'ingen härledning kvar');
  assert.ok(!kalla.includes('process.env.ARCANA_TOKEN_SALT'), 'saltet läses inte längre');
  assert.match(kalla, /tokenMatchar/, 'slår upp den lagrade tokenen');
});
