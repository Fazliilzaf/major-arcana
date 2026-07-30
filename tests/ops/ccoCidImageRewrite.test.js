'use strict';

/**
 * ORD-93 — EN implementation, inte tre.
 *
 * `rewriteMailCidImageSources` (ccoConversation.js) och `resolveCidInHtml`
 * (ccoMailDocument.js) delar nu den här filen i stället för att bära var sin
 * kopia av "aldrig en trasig cid: kvar, alltid en synlig markering". Se
 * ccoCidImageRewrite.js för varför en chokepunkt inte räckte den här gången —
 * tre parallella implementationer av samma begrepp behöver bli en, inte bara
 * en gemensam anropspunkt.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeCidCandidates,
  rewriteCidImageReferences,
} = require('../../src/ops/ccoCidImageRewrite');

test('normalizeCidCandidates städar cid:-prefix, vinkelparenteser och gemener', () => {
  assert.deepEqual(normalizeCidCandidates('cid:Logo@ABC'), ['logo@abc']);
  assert.deepEqual(normalizeCidCandidates('<Logo@ABC>'), ['logo@abc']);
  assert.deepEqual(normalizeCidCandidates(''), []);
});

test('normalizeCidCandidates ger en extra kandidat för värdet före snedstreck', () => {
  const candidates = normalizeCidCandidates('image001.png@01dcba/extra');
  assert.ok(candidates.includes('image001.png@01dcba/extra'));
  assert.ok(candidates.includes('image001.png@01dcba'));
});

test('normalizeCidCandidates faller tillbaka på rått värde om decodeURIComponent kastar', () => {
  // "%" utan giltig hex-sekvens kastar i decodeURIComponent — ska inte krascha.
  assert.deepEqual(normalizeCidCandidates('bad%value'), ['bad%value']);
});

test('rewriteCidImageReferences löser ett känt cid till sin URL', () => {
  const html = rewriteCidImageReferences('<img src="cid:logo">', new Map([['logo', '/asset/1']]));
  assert.equal(html, '<img src="/asset/1">');
});

test('rewriteCidImageReferences markerar ett okänt cid i stället för att lämna det trasigt', () => {
  const html = rewriteCidImageReferences('<img src="cid:missing">', new Map());
  assert.doesNotMatch(html, /cid:missing/);
  assert.match(html, /data:image\/svg\+xml/);
  assert.match(html, /data-cid-missing="true"/);
});

test('rewriteCidImageReferences markerar ett olöst url(cid:...) i style-attribut', () => {
  const html = rewriteCidImageReferences(
    '<div style="background:url(cid:missing-bg)"></div>',
    new Map()
  );
  assert.doesNotMatch(html, /cid:missing-bg/);
  assert.match(html, /url\("data:image\/svg\+xml/);
});

test('rewriteCidImageReferences rör inte about:blank om handleAboutBlank inte är satt', () => {
  // resolveCidInHtml (history-läsvägen) hade aldrig den funktionen — den ska
  // inte dyka upp som en bieffekt av sammanslagningen.
  const html = rewriteCidImageReferences('<img src="about:blank">', new Map());
  assert.equal(html, '<img src="about:blank">');
});

test('rewriteCidImageReferences binder about:blank till trådens enda inline-bild när handleAboutBlank är satt', () => {
  const html = rewriteCidImageReferences('<img src="about:blank">', new Map(), {
    handleAboutBlank: true,
    fallbackInlineUrl: '/asset/only-inline',
  });
  assert.match(html, /src="\/asset\/only-inline"/);
});

test('rewriteCidImageReferences markerar about:blank utan en entydig fallback', () => {
  const html = rewriteCidImageReferences('<img src="about:blank">', new Map(), {
    handleAboutBlank: true,
  });
  assert.doesNotMatch(html, /about:blank/);
  assert.match(html, /data-cid-missing="true"/);
});

test('VAKT: ingen fjärde kopia av cid-upplösningen får dyka upp i src/', () => {
  // De enda platser som får bygga en "src=cid:... → URL eller markering"-
  // regex är den här filen (delad) och microsoftGraphReadConnector.js:s
  // resolveInlineCidImages (skrivvägen, medvetet separat — se kommentaren
  // där). Ett nytt read-path-ställe som skriver sin egen regex i stället för
  // att importera rewriteCidImageReferences är precis den bugg som redan
  // hänt två gånger.
  const ROOT = path.join(__dirname, '..', '..');
  const SRC_DIR = path.join(ROOT, 'src');
  const ALLOWED_FILES = new Set([
    path.join(SRC_DIR, 'ops', 'ccoCidImageRewrite.js'),
    path.join(SRC_DIR, 'infra', 'microsoftGraphReadConnector.js'),
  ]);

  function walk(dir, files = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, files);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
    return files;
  }

  const offenders = [];
  for (const file of walk(SRC_DIR)) {
    if (ALLOWED_FILES.has(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    // Leta efter en regex-literal som matchar src=...cid: — samma form som
    // de tre tidigare kopiornas replace-regex.
    if (/\/[^/\n]*\\bsrc[^/\n]*cid:[^/\n]*\/[a-z]*/i.test(source)) {
      offenders.push(path.relative(ROOT, file));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `en fjärde cid-regex hittad utanför de tillåtna filerna: ${offenders.join(', ')}`
  );
});
