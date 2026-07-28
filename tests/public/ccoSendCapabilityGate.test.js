'use strict';

/**
 * Send-grinden i launchern läser sessionen, inte en konstant.
 *
 * `public/konversationer-bottom-actions.js:8` deklarerar `const ROLE = 'owner'`.
 * Grinden `ROLE === 'owner'` var alltså ALLTID sann. En icke-owner fick en
 * Skicka-knapp som gav 403 från backend, och samma yta hade motsatt fel i V2:
 * där grindades på serverflaggan utan rollkontroll.
 *
 * Backend har hela tiden varit korrekt grindad — `/send` kräver
 * `mail.live_send`, `ARCANA_GRAPH_SEND_ENABLED`, adapter, `approved`,
 * allowlistad avsändare, och audit-loggar varje försök. Det här är alltså en
 * ÄRLIGHETSFIX i UI:t, inte en säkerhetsfix.
 *
 * DÄRFÖR ÄR FELRIKTNINGEN FAIL-OPEN, och det är den viktigaste egenskapen här:
 * vi döljer Skicka bara när vi VET att den inte kan användas. Att fail-closed:a
 * på saknad information vore att ta bort en fungerande knapp från ägaren för
 * att en fetch inte hunnit klart — en regression för att slippa en 403 som
 * backend ändå stoppar.
 *
 * Fallbacken när send inte är tillåten är inte "ingen knapp" utan
 * `saveDraftV2('needs_approval')`: utkastet går till godkännande i stället.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const LAUNCHER = fs.readFileSync(path.join(ROOT, 'public', 'konversationer-bottom-actions.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'public', 'major-arcana-preview', 'app.js'), 'utf8');

/** Kör den RIKTIGA canOfferLiveSend ur launcher-källan mot en given kapacitet. */
function canOfferLiveSend(capabilityFactory) {
  const start = LAUNCHER.indexOf('  function canOfferLiveSend() {');
  assert.ok(start > -1, 'canOfferLiveSend ska finnas i launchern');
  const end = LAUNCHER.indexOf('\n  }\n', start) + '\n  }\n'.length;
  const source = LAUNCHER.slice(start, end);

  const sandbox = {
    window: capabilityFactory ? { CCOSendCapability: { get: capabilityFactory } } : {},
    __resultat: null,
  };
  vm.runInNewContext(`${source}\n__resultat = canOfferLiveSend();`, sandbox);
  return sandbox.__resultat;
}

test('OKÄNT läge ⇒ oförändrat beteende — knappen tas aldrig bort på gissning', () => {
  assert.equal(canOfferLiveSend(null), true, 'ingen kapacitet alls (launcher fristående)');
  assert.equal(
    canOfferLiveSend(() => ({ known: false, role: '', sendEnabled: false, canSendLive: true })),
    true,
    'kapacitet finns men rollen är inte hämtad än'
  );
  assert.equal(canOfferLiveSend(() => undefined), true, 'getter svarar tomt');
});

test('ett kast i kapaciteten får inte släcka knappen', () => {
  assert.equal(
    canOfferLiveSend(() => {
      throw new Error('providern kraschade');
    }),
    true,
    'fail-open — backend är den riktiga grinden'
  );
});

test('KÄNT läge: owner med påslagen flagga får skicka', () => {
  assert.equal(
    canOfferLiveSend(() => ({ known: true, role: 'owner', sendEnabled: true, canSendLive: true })),
    true
  );
});

test('KÄNT läge: icke-owner får INTE skicka — utkastet går till godkännande', () => {
  assert.equal(
    canOfferLiveSend(() => ({ known: true, role: 'staff', sendEnabled: true, canSendLive: false })),
    false,
    'det var det här fallet som gav 403 med den gamla konstantgrinden'
  );
});

test('KÄNT läge: owner men flaggan av ⇒ inte heller skicka', () => {
  assert.equal(
    canOfferLiveSend(() => ({ known: true, role: 'owner', sendEnabled: false, canSendLive: false })),
    false,
    'admin visade tidigare Skicka även när ARCANA_GRAPH_SEND_ENABLED var av'
  );
});

test('VAKT: konstantgrinden är borta ur båda send-vägarna', () => {
  // ROLE-konstanten får ligga kvar (den används inte till grindning längre),
  // men den får inte styra om live-send erbjuds.
  assert.doesNotMatch(
    LAUNCHER,
    /if \(ROLE === 'owner'\)/,
    'live-send får inte grindas på en konstant'
  );
  assert.doesNotMatch(
    LAUNCHER,
    /ROLE === 'owner' && j\.draftId/,
    'compose-genvägen får inte heller grindas på konstanten'
  );
  assert.equal(
    (LAUNCHER.match(/canOfferLiveSend\(\)/g) || []).length >= 3,
    true,
    'grinden ska användas på båda send-vägarna plus sin egen definition'
  );
});

test('app.js publicerar kapaciteten och skiljer "av" från "inte läst än"', () => {
  assert.match(APP, /window\.CCOSendCapability = \{/, 'kapaciteten ska publiceras för launchern');
  assert.match(
    APP,
    /const known = Boolean\(role\) && state\.runtime\.graphStatusApplied === true;/,
    'known kräver BÅDE roll och att graph-status är läst — annars döljs Skicka under boot'
  );
  assert.match(
    APP,
    /canSendLive: known \? role === "owner" && state\.runtime\.sendEnabled === true : true/,
    'okänt läge ska svara true, dvs oförändrat beteende'
  );
  assert.match(
    APP,
    /normalizeKey\(payload\?\.membership\?\.role\)/,
    'rollen ska komma från auth/me:s membership, inte gissas'
  );

  const COMPOSITION = fs.readFileSync(
    path.join(ROOT, 'public', 'major-arcana-preview', 'runtime-dom-live-composition.js'),
    'utf8'
  );
  assert.match(
    COMPOSITION,
    /state\.runtime\.graphStatusApplied = true;/,
    'graphStatusApplied måste sättas där sendEnabled läses, annars är known aldrig sant'
  );
});
