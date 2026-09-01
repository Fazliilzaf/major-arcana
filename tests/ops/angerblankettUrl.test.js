'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ANGER_BLANKET_URL } = require('../../src/ops/ccoAngerblankett');

/**
 * ORD-160 §3.
 *
 * Adressen till Konsumentverkets ångerblankett låg hårdkodad på två ställen och
 * pekade på en sida som svarar 404. Avtalet hänvisar till den som "bilaga 3" —
 * en patient som ville utöva sin ångerrätt fick en felsida.
 *
 * Testerna här går INTE mot nätet. Att adressen svarar 200 mäts av
 * scripts/check-angerblankett-link.js på schema; ett testbygge ska inte kunna
 * falla på att Konsumentverket har driftstopp. Det som mäts här är det som
 * ligger i vår kontroll: att adressen finns på ett ställe och ser rimlig ut.
 */

const REPO_ROOT = path.join(__dirname, '..', '..');

/**
 * Läser filsystemet, inte git.
 *
 * Första versionen använde `git grep`. Den ser bara SPÅRADE filer, så testet
 * var grönt medan ccoAngerblankett.js var otspårad — samma fälla som gjorde
 * betänketidstestet rött i samma sekund det committades, byggd på nytt en timme
 * efter att jag rättat den. En kontroll som beror på om någon hunnit `git add`
 * mäter inte koden.
 */
function filerMedTraff(dir, monster, traffar = []) {
  for (const post of fs.readdirSync(dir, { withFileTypes: true })) {
    if (post.name === 'node_modules' || post.name.startsWith('.')) continue;
    const p = path.join(dir, post.name);
    if (post.isDirectory()) filerMedTraff(p, monster, traffar);
    else if (post.name.endsWith('.js') && fs.readFileSync(p, 'utf8').includes(monster)) {
      traffar.push(path.relative(REPO_ROOT, p));
    }
  }
  return traffar;
}

test('adressen är definierad på exakt ett ställe', () => {
  const filer = filerMedTraff(path.join(REPO_ROOT, 'src'), 'konsumentverket.se').sort();

  assert.deepEqual(
    filer,
    ['src/ops/ccoAngerblankett.js'],
    'Adressen ska bo i ccoAngerblankett.js och importeras därifrån. Två kopior ' +
      'betyder att någon rättar den ena — det var precis så den gamla 404:an ' +
      'överlevde på båda ställena samtidigt:\n' +
      filer.map((f) => `  - ${f}`).join('\n')
  );
});

test('den kända döda adressen kommer inte tillbaka', () => {
  assert.doesNotMatch(
    ANGER_BLANKET_URL,
    /for-foretag\/konsumentratt-for-foretagare/,
    'det är den url som svarade 404 den 2026-09-01'
  );
  assert.match(ANGER_BLANKET_URL, /^https:\/\//, 'ska vara https — det är en juridisk hänvisning');
});

test('kontrollskriptet skiljer död länk från oåtkomligt nät', () => {
  // Ett nätverksfel är inte ett fel i vår kod. Skiljs de inte åt slutar någon
  // titta på larmet, och då är kontrollen värdelös den dag länken faktiskt dör.
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts', 'check-angerblankett-link.js'),
    'utf8'
  );
  assert.match(src, /return 2;/, 'oåtkomligt nät ska ge egen exit-kod');
  assert.match(src, /return 1;/, 'icke-200 ska ge fel-exit');
  assert.match(src, /ccoAngerblankett/, 'skriptet ska läsa adressen ur samma modul som koden');
});
