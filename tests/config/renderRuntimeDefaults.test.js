'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { isPublicWebBookingEnabled } = require('../../src/infra/publicWebBooking');

/**
 * ORD-155 — en glömd nyckel får aldrig öppna något.
 *
 * 2026-08-31 stod den publika webbokningen öppen i prod i sju timmar mot
 * website-booking-policy.mdc. Ingen kod orsakade det: nyckeln saknades i
 * Render, och RENDER_RUNTIME_DEFAULTS hade `'true'`. Tomt fält betydde alltså
 * "på", inte "osatt".
 *
 * Testerna läser tabellen ur källan i stället för att duplicera den, så en ny
 * öppnande flagga fångas utan att någon minns att uppdatera testet.
 */

const CONFIG_SRC = path.join(__dirname, '..', '..', 'src', 'config.js');

function readDefaultsTable() {
  const src = require('node:fs').readFileSync(CONFIG_SRC, 'utf8');
  const block = src.match(/const RENDER_RUNTIME_DEFAULTS = Object\.freeze\(\{([\s\S]*?)\n\}\);/);
  assert.ok(block, 'RENDER_RUNTIME_DEFAULTS hittades inte i src/config.js');
  const entries = [...block[1].matchAll(/^\s{2}([A-Z0-9_]+):\s*'([^']*)'/gm)];
  return new Map(entries.map((m) => [m[1], m[2]]));
}

// Flaggor vars "på"-läge öppnar något utåt: mot patienter, mot internet, eller
// genom att ta bort ett skydd. Att stå med här betyder "måste vara stängd när
// nyckeln saknas". Lägg till, ta aldrig bort för att göra testet grönt.
const MUST_FAIL_CLOSED = {
  ARCANA_PUBLIC_WEB_BOOKING_ENABLED: 'false',
  ARCANA_CLIENTO_INTEGRATION_ENABLED: 'false',
  ARCANA_GRAPH_READ_ENABLED: 'false',
  ARCANA_GRAPH_SEND_ENABLED: 'false',
  ARCANA_MAIL_SHADOW_SEND: 'false',
  ARCANA_MARKETING_CONNECTORS_ENABLED: 'false',
  ARCANA_MARKETING_CONNECTORS_LIVE_FETCH: 'false',
  ARCANA_MARKETING_GOOGLE_ADS_ENABLED: 'false',
  ARCANA_MARKETING_META_ENABLED: 'false',
  ARCANA_MARKETING_LINKEDIN_ENABLED: 'false',
  ARCANA_BOOTSTRAP_RESET_OWNER_MFA: 'false',
  // Öppnar genom att vara AV: utan MFA räcker ägarlösenordet ensamt.
  ARCANA_AUTH_OWNER_MFA_REQUIRED: 'true',
  // Live-hämtning mot annonsplattformarna ska inte starta på en glömd nyckel.
  ARCANA_MARKETING_CONNECTORS_MODE: 'fixture',
};

test('ingen öppnande flagga har ett öppnande kod-default', () => {
  const table = readDefaultsTable();
  const fel = [];

  for (const [key, expected] of Object.entries(MUST_FAIL_CLOSED)) {
    const actual = table.get(key);
    assert.ok(actual !== undefined, `${key} saknas i RENDER_RUNTIME_DEFAULTS`);
    if (actual !== expected) fel.push(`${key}: '${actual}' — ska vara '${expected}'`);
  }

  assert.deepEqual(
    fel,
    [],
    'En glömd nyckel i Render skulle öppna något:\n' + fel.map((f) => `  - ${f}`).join('\n')
  );
});

test('OPENING_FLAGS-listan täcker de flaggor boot-varningen ska larma om', () => {
  const src = require('node:fs').readFileSync(CONFIG_SRC, 'utf8');
  const block = src.match(/const OPENING_FLAGS = Object\.freeze\(\[([\s\S]*?)\n\]\);/);
  assert.ok(block, 'OPENING_FLAGS hittades inte i src/config.js');
  const listed = [...block[1].matchAll(/'([A-Z0-9_]+)'/g)].map((m) => m[1]);

  // Varningen finns för att tystnaden var problemet. Den viktigaste flaggan —
  // den som faktiskt stod öppen — måste vara med.
  assert.ok(
    listed.includes('ARCANA_PUBLIC_WEB_BOOKING_ENABLED'),
    'webbokningsflaggan måste larma när den kör på kod-default'
  );
  assert.ok(listed.includes('ARCANA_AUTH_OWNER_MFA_REQUIRED'));
});

test('en flagga, en avläsning — config och infra ger samma svar', () => {
  // Det fanns två tolkningar av samma env: config.js defaultade till true,
  // infra/publicWebBooking.js till false. Vilket som gällde berodde på vem som
  // frågade. Nu finns bara den ena, och den ska svara likadant för alla former.
  const fall = [
    [undefined, false],
    ['', false],
    ['off', false],
    ['nej', false],
    ['0', false],
    ['false', false],
    ['true', true],
    ['1', true],
    ['yes', true],
    ['on', true],
    ['  TRUE  ', true],
  ];

  for (const [value, expected] of fall) {
    const env = value === undefined ? {} : { ARCANA_PUBLIC_WEB_BOOKING_ENABLED: value };
    assert.equal(
      isPublicWebBookingEnabled(env),
      expected,
      `${JSON.stringify(value)} ska ge ${expected}`
    );
  }
});

test('config.publicWebBookingEnabled kommer från samma funktion', () => {
  const src = require('node:fs').readFileSync(CONFIG_SRC, 'utf8');
  assert.match(
    src,
    /publicWebBookingEnabled:\s*isPublicWebBookingEnabled\(/,
    'config.js ska importera avläsningen, inte tolka env själv — annars kan de glida isär igen'
  );
  assert.doesNotMatch(
    src,
    /publicWebBookingEnabled:\s*asBool\(/,
    'den gamla asBool-tolkningen får inte komma tillbaka'
  );
});
