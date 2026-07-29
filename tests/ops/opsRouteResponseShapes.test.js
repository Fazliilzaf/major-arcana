'use strict';

/**
 * Vakt mot att ett svarsfält hamnar i FEL rutt.
 *
 * 2026-07-29 lade jag `scannedMailboxIds`, `skippedShardFiles` och `coverage`
 * i korsbrevlåderapportens svar med en textersättning som matchade det FÖRSTA
 * `return res.json({ ok: true, generatedAt: ... })` i filen. Det var
 * `/ops/cco-care/missing-forms-report`, 3 900 rader tidigare.
 *
 * Följden: den rutten refererade tre odefinierade variabler och svarade HTTP
 * 500 i prod. Korsbrevlåderapporten fick aldrig sina fält, vilket var det som
 * avslöjade det — svaret saknade det jag hade lagt till.
 *
 * Ett fält som bara finns på ett ställe kan inte hamna på fel ställe utan att
 * det syns. Det här testet är den kontrollen.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'routes', 'ops.js'),
  'utf8'
);

/** Rutten som en radposition ligger i — närmast föregående router.get/post. */
function routeAtLine(lineNumber) {
  const lines = SOURCE.split('\n');
  for (let index = lineNumber - 1; index >= 0; index -= 1) {
    const match = lines[index].match(/^\s*'(\/[^']+)',\s*$/);
    if (match && /router\.(get|post|put|delete)\(/.test(lines[index - 1] || '')) {
      return match[1];
    }
  }
  return '';
}

function linesContaining(token) {
  return SOURCE.split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter((row) => row.line.includes(token))
    .map((row) => row.number);
}

for (const field of ['scannedMailboxIds', 'skippedShardFiles']) {
  test(`${field} förekommer bara i korsbrevlåderapporten`, () => {
    const routes = new Set(linesContaining(field).map((n) => routeAtLine(n)).filter(Boolean));
    assert.deepEqual(
      [...routes],
      ['/ops/customers/cross-mailbox-report'],
      `${field} läckte till: ${[...routes].join(', ')}`
    );
  });
}

test('missing-forms-rapporten returnerar bara sina egna fält', () => {
  const start = SOURCE.indexOf("'/ops/cco-care/missing-forms-report'");
  assert.ok(start > -1);
  const handler = SOURCE.slice(start, SOURCE.indexOf('\n  router.', start));
  for (const foreign of ['scannedMailboxIds', 'skippedShardFiles', 'coverage']) {
    assert.ok(
      !handler.includes(foreign),
      `${foreign} hör inte hemma i missing-forms-rapporten — den svarade 500 i prod på just det`
    );
  }
});

test('varje variabel i korsbrevlåderapportens svar är också definierad där', () => {
  const start = SOURCE.indexOf("'/ops/customers/cross-mailbox-report'");
  const handler = SOURCE.slice(start, SOURCE.indexOf('\n  router.', start));
  for (const name of ['scannedMailboxIds', 'skippedShardFiles', 'coverage']) {
    assert.match(
      handler,
      new RegExp(`const ${name}\\b`),
      `${name} returneras men deklareras aldrig i rutten`
    );
  }
});
