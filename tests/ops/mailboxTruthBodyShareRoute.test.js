'use strict';

/**
 * ORD-89 steg 1 — källvakt för mätändpunkten.
 *
 * Hela poängen med mätningen är att den INTE får gå den väg den mäter.
 * `loadShard()` parsar hela filen, och en `JSON.parse` av `egzona@` (179 MB) är
 * precis det fel vi undersöker. Slutsatsen "skannern är strömmande" är lätt att
 * verifiera en gång och lätt att förlora i nästa redigering — därför vaktas
 * MEKANISMEN här, inte utfallet.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const OPS_ROUTE = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'ops.js'), 'utf8');
const SCAN = fs.readFileSync(
  path.join(ROOT, 'src', 'ops', 'mailboxTruthBodyShareScan.js'),
  'utf8'
);

/** Källa utan kommentarer — annars vaktar testet sin egen dokumentation. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function bodyShareHandler() {
  const start = OPS_ROUTE.indexOf("'/ops/mailbox-truth/body-share'");
  assert.ok(start > -1, 'ändpunkten ska finnas');
  const end = OPS_ROUTE.indexOf('\n  router.', start);
  return OPS_ROUTE.slice(start, end > -1 ? end : start + 2000);
}

test('mätändpunkten är ägar-gatad', () => {
  const handler = bodyShareHandler();
  assert.match(handler, /requireAuth/);
  assert.match(handler, /requireRole\(ROLE_OWNER\)/);
});

test('mätändpunkten är en läsning, inte en skrivning', () => {
  assert.match(
    OPS_ROUTE,
    /router\.get\(\s*'\/ops\/mailbox-truth\/body-share'/,
    'måste vara GET — en mätning ändrar ingenting'
  );
});

test('mätvägen rör aldrig shard-laddaren', () => {
  // Att gå via ensureMailboxLoaded/loadShard skulle ge ett korrekt tal och
  // samtidigt kunna starta om instansen. Talet vore rätt, priset fel.
  const handler = stripComments(bodyShareHandler());
  for (const forbidden of ['ensureMailboxLoaded', 'loadShard', 'readMailboxTruthState']) {
    assert.ok(
      !handler.includes(forbidden),
      `mätändpunkten får inte anropa ${forbidden} — det är felläget den mäter`
    );
  }
});

test('skannern parsar aldrig JSON', () => {
  // Den här raden är hela skälet till att modulen finns. Faller den är
  // mätningen tillbaka på 1,3 GB heap för en 275 MB fil.
  const source = stripComments(SCAN);
  assert.ok(!source.includes('JSON.parse'), 'skannern får inte innehålla JSON.parse');
  assert.ok(!source.includes('readFileSync'), 'skannern får inte läsa hela filen i minnet');
  assert.match(source, /createReadStream/, 'skannern ska läsa strömmande');
});

test('shardarna mäts minst först', () => {
  // Ordningen är ett säkerhetsbeslut, inte kosmetik: kons@ är 0,9 MB och
  // egzona@ 179 MB. Vänds sorteringen faller det dyraste först.
  const source = stripComments(SCAN);
  assert.match(
    source,
    /sort\(\(left, right\) => left\.sizeBytes - right\.sizeBytes\)/,
    'listningen ska sortera stigande på filstorlek'
  );
});

test('mätningen skriver ett granskningsspår', () => {
  assert.match(bodyShareHandler(), /ops\.mailbox_truth\.body_share\.measure/);
});

test('migreringsändpunkten tar EN brevlåda per anrop', () => {
  // Ingen "kör alla"-knapp. Ordningen minst först är ett säkerhetsbeslut, och
  // en loop över alla brevlådor gör det möjligt att av misstag möta egzona@
  // (179 MB) före kons@ (0,9 MB).
  const start = OPS_ROUTE.indexOf("'/ops/mailbox-truth/body-migration'");
  assert.ok(start > -1, 'ändpunkten ska finnas');
  const handler = OPS_ROUTE.slice(start, OPS_ROUTE.indexOf('\n  router.', start));
  assert.match(handler, /requireRole\(ROLE_OWNER\)/);
  assert.match(handler, /mailboxId krävs/);
  // Ingen flerbrevlådeväg IN. (listMessages tar en mailboxIds-array internt
  // efter reloaden — det är en läsning av EN brevlåda, inte en väg in.)
  assert.ok(!/body\.mailboxIds/.test(handler), 'ingen flerbrevlådeväg in');
  assert.ok(!/Array\.isArray\(body\./.test(handler), 'inget listargument från anroparen');
});

test('apply måste anges uttryckligen — annars torrkörning', () => {
  const start = OPS_ROUTE.indexOf("'/ops/mailbox-truth/body-migration'");
  const handler = OPS_ROUTE.slice(start, OPS_ROUTE.indexOf('\n  router.', start));
  assert.match(
    handler,
    /apply:\s*body\.apply === true/,
    'allt utom exakt true måste bli torrkörning'
  );
});

test('migreringen laddar om sharden i SAMMA anrop', () => {
  // Migreringen byter shard-FILEN. Servern håller samma shard i minnet med
  // brödtexterna kvar inline, och nästa save() skriver tillbaka minnesbilden.
  // kons@ gick tillbaka från 401 737 till exakt 910 355 byte den 29 juli.
  //
  // En femminutersgrind räcker inte: save() sker när något ÄNDRAS i brevlådan,
  // inte på klockan. Reloaden måste ligga i handlern, inte som ett steg
  // anroparen kan glömma.
  const start = OPS_ROUTE.indexOf("'/ops/mailbox-truth/body-migration'");
  const handler = OPS_ROUTE.slice(start, OPS_ROUTE.indexOf('\n  router.', start));
  const unloadPos = handler.indexOf('unloadMailbox(');
  const reloadPos = handler.indexOf('ensureMailboxLoaded(');
  const sizePos = handler.indexOf('fileBytesAfterReload');
  assert.ok(unloadPos > -1, 'minnesbilden måste kastas');
  assert.ok(reloadPos > unloadPos, 'reload efter unload — annars läses cachen om');
  assert.ok(sizePos > reloadPos, 'storleken läses EFTER reloaden');
});

test('reload sker bara efter en LYCKAD skarp körning', () => {
  // En torrkörning har inte rört sharden, och en stoppad körning ska inte
  // belönas med en omladdning som ser ut som ett kvitto.
  const start = OPS_ROUTE.indexOf("'/ops/mailbox-truth/body-migration'");
  const handler = OPS_ROUTE.slice(start, OPS_ROUTE.indexOf('\n  router.', start));
  assert.match(handler, /if \(report\.apply && !report\.stoppedBecause\)/);
});
