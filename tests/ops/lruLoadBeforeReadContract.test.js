'use strict';

/**
 * LRU-TAKET ÄR 2. VARJE LÄSVÄG MÅSTE LADDA FÖRE LÄSNING.
 *
 * `listMessages` returnerar TOM LISTA för en oladdad shard — tyst. Med
 * maxLoadedShards = 2 räcker det inte att brevlådan laddades tidigare i samma
 * anrop; den kan redan vara utvräkt.
 *
 * Fyra ställen samma dag (2026-07-29) gav tyst tomhet av exakt detta:
 *   korsbrevlåderapporten      såg två av tio brevlådor
 *   listMessages({})           betydde "de laddade"
 *   trådstorens preload        åtta laddades, sex vräktes ut före läsning
 *   konversationsrutten        truthMs 0.1, truthCount 0 — ingen scanning alls
 *
 * Vakten är KONTRAKTSBASERAD: den granskar alla läsvägar, inte den som just
 * rättades. En platsvakt hade inte hindrat det fjärde stället.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const READ_PATHS = [
  ['src/routes/ccoConversation.js', 'konversationsrutten'],
  ['src/ops/ccoConversationThreadStore.js', 'trådstoren'],
  ['src/routes/ops.js', 'korsbrevlåderapporten'],
];

for (const [relative, label] of READ_PATHS) {
  test(`${label} laddar brevlådan innan den läser meddelanden`, () => {
    const source = stripComments(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
    assert.ok(
      source.includes('ensureMailboxLoaded'),
      `${relative} läser meddelanden men laddar aldrig — en oladdad shard svarar tomt, tyst`
    );
  });
}

test('LRU-taket är fortfarande 2 — annars vaktar testet ovan ingenting', () => {
  const sharded = stripComments(
    fs.readFileSync(path.join(ROOT, 'src', 'ops', 'ccoMailboxTruthShardedStore.js'), 'utf8')
  );
  assert.match(sharded, /maxLoadedShards = 2/);
});

test('listMessages svarar tomt för oladdad shard — premissen för hela vakten', () => {
  // Om detta någon gång ändras till att ladda på begäran blir vakten
  // överflödig, och då ska någon få veta det här.
  const sharded = stripComments(
    fs.readFileSync(path.join(ROOT, 'src', 'ops', 'ccoMailboxTruthShardedStore.js'), 'utf8')
  );
  assert.match(sharded, /if \(!store\) continue/, 'oladdad shard hoppas över tyst');
});
