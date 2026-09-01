'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Ett test får inte fråga `git` vad koden innehåller.
 *
 * `git grep` och `git ls-files` läser INDEXET, inte arbetskatalogen. En fil som
 * ingen hunnit `git add` finns inte för dem. Ett test byggt på dem mäter alltså
 * inte koden, utan hur långt någon kommit med att checka in den.
 *
 * Det hände två gånger 2026-09-01, båda i mitt eget arbete:
 *
 *   betanketidTreLager   grön medan ccoCoolingOffPolicy.js var otspårad, röd i
 *                        samma sekund den committades. Commitmeddelandet sa
 *                        "7565 tester, 0 fel" — sant när jag körde, falskt när
 *                        jag pushade.
 *
 *   angerblankettUrl     samma fälla, byggd en timme efter att den första
 *                        rättats. Grön för att den nya modulen ännu inte låg i
 *                        indexet.
 *
 * Falskt rött är irriterande. Det farliga är andra hållet: ett test som ska
 * stoppa en ny modul släpper igenom den, eftersom en ny modul per definition är
 * den som ännu inte committats.
 *
 * Läs filsystemet. `fs.readdirSync` bryr sig inte om git.
 *
 * Undantaget är tester som mäter git SJÄLVT — historik, taggar, commit-innehåll.
 * De hör hemma i GIT_AR_AMNET, och listan motiveras rad för rad.
 */

const REPO_ROOT = path.join(__dirname, '..', '..');
const TESTS = path.join(REPO_ROOT, 'tests');

/** Tester där git är det som mäts, inte verktyget som mäter. */
const GIT_AR_AMNET = [];

/**
 * ANROPEN, inte omnämnandena.
 *
 * Första versionen hade även `/\bgit\s+(grep|ls-files)\b/` och fällde två
 * filer vars enda synd var att förklara i en kommentar varför man inte ska
 * använda git grep. Samma fel som testet finns för att stoppa, i testet självt
 * — tredje gången samma mönster dök upp den 2026-09-01.
 *
 * En kommentar kan innehålla vilken text som helst. Ett anrop har syntax.
 */
const MONSTER = [
  /execFileSync\(\s*['"]git['"]\s*,\s*\[\s*['"](grep|ls-files)['"]/,
  /exec(Sync)?\(\s*['"`][^'"`]*git\s+(grep|ls-files)/,
  /spawnSync\(\s*['"]git['"]\s*,\s*\[\s*['"](grep|ls-files)['"]/,
];

function jsFiler(dir, traffar = []) {
  for (const post of fs.readdirSync(dir, { withFileTypes: true })) {
    if (post.name === 'node_modules' || post.name.startsWith('.')) continue;
    const p = path.join(dir, post.name);
    if (post.isDirectory()) jsFiler(p, traffar);
    else if (post.name.endsWith('.js')) traffar.push(p);
  }
  return traffar;
}

test('inget test frågar git om vad koden innehåller', () => {
  const traffar = [];
  for (const fil of jsFiler(TESTS)) {
    const rel = path.relative(REPO_ROOT, fil);
    if (fil === __filename) continue; // mönstren står i den här filen
    if (GIT_AR_AMNET.includes(rel)) continue;
    if (MONSTER.some((m) => m.test(fs.readFileSync(fil, 'utf8')))) traffar.push(rel);
  }

  assert.deepEqual(
    traffar,
    [],
    'Testet läser git-indexet i stället för filsystemet. En otspårad fil är ' +
      'osynlig för det, så kontrollen släpper igenom precis den nya kod den ' +
      'finns för att stoppa. Använd fs.readdirSync:\n' +
      traffar.map((f) => `  - ${f}`).join('\n')
  );
});

test('undantagslistan innehåller bara filer som finns', () => {
  // En lista som pekar på borttagna filer växer tyst och slutar betyda något.
  const saknade = GIT_AR_AMNET.filter((f) => !fs.existsSync(path.join(REPO_ROOT, f)));
  assert.deepEqual(
    saknade,
    [],
    `GIT_AR_AMNET pekar på filer som inte finns: ${saknade.join(', ')}`
  );
});
