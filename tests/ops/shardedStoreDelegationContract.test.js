'use strict';

/**
 * DET SOM LÄGGS TILL I SHARD-STOREN ÄR ONÅBART TILLS WRAPPERN NÄMNER DET.
 *
 * Produktionen använder `ccoMailboxTruthShardedStore` (se
 * ccoMailboxTruthStoreFactory.js). Varje shard ÄR en `ccoMailboxTruthStore`,
 * men wrappern exponerar bara de metoder den uttryckligen delegerar.
 *
 * Två gånger har det bitit på en dag:
 *   getFidelityInventory / getCidFidelityManifest → deepScan blev en no-op i
 *     produktion; adapterns fallback tog över och läste bara inline bodyHtml
 *   hydrateMessageBodies → konversationsrutten kunde inte hydrera, så
 *     operatören fick en 500-teckens bodyPreview i stället för hela mejlet
 *
 * Båda fixarna var korrekta och oåtkomliga. Vakten nedan listar de metoder
 * som MÅSTE delegeras, så att den tredje inte behöver upptäckas i drift.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SHARDED = fs.readFileSync(
  path.join(ROOT, 'src', 'ops', 'ccoMailboxTruthShardedStore.js'),
  'utf8'
);

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const MUST_DELEGATE = [
  ['getFidelityInventory', 'deepScan blir en no-op i produktion utan den'],
  ['getCidFidelityManifest', 'CID-larmet kan inte larma utan den'],
  ['hydrateMessageBodies', 'operatören får bodyPreview i stället för hela mejlet utan den'],
];

for (const [method, why] of MUST_DELEGATE) {
  test(`sharded storen delegerar ${method}`, () => {
    const code = stripComments(SHARDED);
    assert.match(
      code,
      new RegExp(`async ${method}\\(`),
      `${method} saknas i den shardade wrappern — ${why}`
    );
  });
}

test('produktionen använder den SHARDADE storen — annars vaktar testet fel lager', () => {
  const factory = stripComments(
    fs.readFileSync(path.join(ROOT, 'src', 'ops', 'ccoMailboxTruthStoreFactory.js'), 'utf8')
  );
  assert.match(factory, /createCcoMailboxTruthShardedStore/);
});

test('fetchSortedConversationMessages hydrerar — den ENDA plats alla trådvägar läser genom', () => {
  // ORD-98, fjärde och femte kodvägen: /summary, /booking-confirm, /draft,
  // bulk/preview och bulk/confirm läste alla via
  // fetchSortedConversationMessages UTAN att hydrera — samma avhuggna
  // bodyPreview som konversationsrutten hade, fast i AI-sammanfattningen
  // och utkasten i stället för trådvyn.
  //
  // Fixen flyttar hydreringen IN I fetchSortedConversationMessages — den
  // funktion ALLA dessa vägar redan går via — i stället för att lita på att
  // varje enskilt anropsställe kommer ihåg att hydrera själv. Ett nytt
  // anropsställe kan då inte glömma det; det ärver hydreringen gratis.
  // Det var precis så de tre första instanserna av samma bugg uppstod: en
  // korrekt fix på EN plats, men ingen som skyddade mot en fjärde.
  //
  // Whitespace normaliseras bort innan sökningen: prettier radbryter ett
  // funktionsanrop olika beroende på total radlängd, och en efterföljande
  // körning av `npm run` (via lint-staged) på HELA filen — inte bara den
  // rad som faktiskt ändrades — kan alltid flytta ett argument till en ny
  // rad. Testet ska verifiera att ANROPET finns, inte en enda
  // prettier-körnings radbrytning.
  const route = stripComments(
    fs.readFileSync(path.join(ROOT, 'src', 'routes', 'ccoConversation.js'), 'utf8')
  ).replace(/\s+/g, '');
  const fnStart = route.indexOf('asyncfunctionfetchSortedConversationMessages(');
  assert.ok(
    fnStart > -1,
    'funktionen måste finnas — den är den enda hydreringsvakten alla trådvägar delar'
  );
  const fnEnd = route.indexOf('asyncfunction', fnStart + 1);
  const fnBody = route.slice(fnStart, fnEnd > -1 ? fnEnd : undefined);
  assert.match(
    fnBody,
    /store\.hydrateMessageBodies\(matches\)/,
    'utan detta läser varje anropsställe (summary/booking-confirm/draft/bulk) en oavhuggen bodyPreview'
  );
});
