'use strict';

/**
 * Kalender-shellen far inte anropa endpoints som inte finns.
 *
 * Sex routes anropades tidigare utan att existera. De failade tyst: klienten
 * hade hardkodade fallbackvarden och satte alla status-pills till `missing`,
 * sa granssnittet sag trasigt ut utan att nagot felmeddelande visades.
 *
 * ── Varfor testet ser ut som det gor ────────────────────────────────────────
 *
 * Forsta versionen av det har testet letade bara pa rader som innehaller
 * `fetch(`. Det gjorde det blint for exakt den form koden faktiskt anvander:
 *
 *   const endpointMap = {
 *     'checkin': '/api/v1/cco-bookings/' + encodeURIComponent(id) + '/checkin',
 *   };
 *   ... senare: fetch(endpointMap[actionId], ...)
 *
 * Ingen av de raderna innehaller `fetch(`, sa testet hoppade over dem och var
 * gront medan anropen lag kvar. Mutationstestet "passerade" ocksa — men bara
 * for att mutationen var en literal fetch pa en rad, alltsa den form testet
 * redan forstod. En mutation som liknar testets antagande i stallet for den
 * riktiga koden bevisar ingenting.
 *
 * Darfor letar testet nu efter ALLA strangar som ser ut som en v1-route,
 * oavsett var i filen de star och oavsett hur de senare anvands. Det ar
 * strangare an nodvandigt och kan flagga en strang som aldrig anropas — det
 * ar avsiktligt. Hellre en falsk varning som en manniska avfardar an ett tyst
 * anrop mot ingenting.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SHELL_PATH = path.join(__dirname, '..', '..', 'public', 'cco-kalender-shell.js');

/** Routes som togs bort eller aldrig byggdes. Far inte forekomma. */
const SAKNADE_ROUTES = [
  '/api/v1/calendar/services',
  '/api/v1/calendar/booking/',
  '/checkin',
  '/no-show',
  '/follow-up',
  '/status-pills',
  '/intelligence',
];

/** Routes som finns och far anropas. */
const TILLATNA_PREFIX = [
  '/api/v1/calendar/day',
  '/api/v1/calendar/week',
  '/api/v1/cco-bookings/calendar-bundle',
  '/api/v1/cco-bookings/canonical-integrity',
  '/api/v1/cco-bookings/cliento-unlinked-review',
  '/api/v1/cco-bookings/history-search',
  '/api/v1/cco-booking-engine/availability',
  '/api/v1/cco-booking-engine/catalog',
  '/api/v1/cco-booking-engine/create/preflight',
  '/api/v1/cco-booking-engine/create/confirm',
  '/api/v1/cco-booking-engine/rebook',
  '/api/v1/cco-booking-engine/cancel',
  '/api/v1/cco-customers/',
  '/api/v1/cco-journal/before-after-photos',
  '/api/v1/cco-journal/photo',
  '/api/v1/cco-patient-master/patient/dossier-bundle',
  '/api/v1/cco/settings',
];

/**
 * Plockar ut varje strangliteral som borjar med /api/v1/, var den an star:
 * i ett fetch-anrop, i ett uppslagsobjekt, i en variabel eller i en array.
 *
 * Kommentarer rensas forst — de sex borttagna routerna namns med flit i
 * kommentarer i shellen for att forklara vad som funnits, och de ska inte
 * fa testet att falla.
 */
function utanKommentarer(kalla) {
  return kalla
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((rad) => rad.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

function routeStrangar(kalla) {
  const kod = utanKommentarer(kalla);
  const traffar = new Set();
  for (const [, strang] of kod.matchAll(/['"`](\/api\/v1\/[^'"`]*)['"`]/g)) {
    traffar.add(strang);
  }
  return [...traffar];
}

function laesShell() {
  return fs.readFileSync(SHELL_PATH, 'utf8');
}

test('shellen namner ingen borttagen eller saknad route', () => {
  const kod = utanKommentarer(laesShell());
  const funna = SAKNADE_ROUTES.filter((route) => kod.includes(route));
  assert.deepEqual(
    funna,
    [],
    `Anrop mot routes som inte finns: ${funna.join(', ')}. ` +
      'De failar tyst och gor att granssnittet ser trasigt ut utan felmeddelande.'
  );
});

test('varje v1-route i shellen finns i den tillatna listan', () => {
  const okanda = routeStrangar(laesShell()).filter(
    (route) => !TILLATNA_PREFIX.some((prefix) => route.startsWith(prefix))
  );
  assert.deepEqual(
    okanda,
    [],
    `Okanda routes: ${okanda.join(', ')}. Lagg till i TILLATNA_PREFIX om de ` +
      'finns, ta annars bort anropet.'
  );
});

test('testet ser routes aven nar de byggs i ett uppslagsobjekt', () => {
  // Regressionsskydd for testet sjalvt. Den forsta versionen letade bara pa
  // rader med `fetch(` och var darfor blind for precis den har formen — vilket
  // ar hur shellen faktiskt byggde sina URL:er.
  const kod = `
    const endpointMap = {
      'checkin': '/api/v1/cco-bookings/' + encodeURIComponent(id) + '/checkin',
    };
    await fetch(endpointMap[actionId], { method: 'POST' });
  `;
  assert.ok(
    routeStrangar(kod).includes('/api/v1/cco-bookings/'),
    'routeStrangar maste se strangar utanfor fetch-anrop'
  );
  assert.ok(
    utanKommentarer(kod).includes('/checkin'),
    'sokningen maste se suffixet aven nar det ar konkatenerat'
  );
});

test('kommentarer som namner borttagna routes faller inte testet', () => {
  const kod = `
    // Status-pills hamtades tidigare fran /api/v1/calendar/booking/:id/status-pills,
    // en route som togs bort.
    const x = 1;
  `;
  assert.equal(utanKommentarer(kod).includes('/status-pills'), false);
  assert.deepEqual(routeStrangar(kod), []);
});
