'use strict';

/**
 * DRIVE-IMPORTERADE HÄLSODEKLARATIONER RÄKNADES ALDRIG.
 *
 * Kedjan från fil i Google Drive till bock i kundresan har fyra grindar. Två
 * av dem vaktas här; att var och en ensam räcker för att kolumnen ska se tom
 * ut är hela förklaringen till att problemet överlevt flera försök att laga
 * det.
 *
 *   1. Mojibake i filnamnet → klassas som `other`   (PR #1295)
 *   2. Filerna aldrig hämtade — Batch 1 tog bara journal + bild
 *   3. `makeVisible` krävde `category === 'journal'`  ← vaktas här
 *   4. `isHealthDeclarationAsset` accepterade bara `form`  ← vaktas här
 *
 * Grind 4 är asymmetrisk och det är själva nyckeln: `documentClassifier`
 * sätter kategorin till SUBkategorin vid en säker filnamnsträff, så en
 * Drive-fil som heter "Hälsodeklaration.pdf" får `health_declaration` — inte
 * `form`. Den föll därför till källkontrollen och avvisades, eftersom källan
 * är `drive_import`. `isFitnessCertificateAsset` har aldrig haft den
 * låsningen. Det är därför HD-gapet är 4 111 och FF-gapet 1 337.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { classifyDocument } = require('../../src/ops/ccoAssetNaming/documentClassifier');

const IMPORT_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'import-drive-history-full.js');

// ── Grind 4 · bevisregeln ────────────────────────────────────────────────────

test('klassificeraren ger en Drive-hälsodeklaration kategorin health_declaration', () => {
  // Premissen för hela grind 4. Vore kategorin 'form' hade det aldrig varit
  // ett problem.
  const result = classifyDocument({
    originalFileName: 'Hälsodeklaration.pdf',
    mimeType: 'application/pdf',
  });
  assert.equal(result.category, 'health_declaration');
  assert.notEqual(result.category, 'form');
});

test('en Drive-importerad hälsodeklaration räknas som bevis', () => {
  // Kräver att modulen laddas EFTER att kategorin är känd; enrichment
  // exporterar inte predikatet, så vi går via den publika ytan.
  const enrichment = require('../../src/ops/ccoKunderEnrichment');
  const probe =
    enrichment.isHealthDeclarationAsset ||
    (enrichment.__testing && enrichment.__testing.isHealthDeclarationAsset);
  if (!probe) {
    // Predikatet är privat — vakta källan i stället för att exponera det.
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'ops', 'ccoKunderEnrichment.js'),
      'utf8'
    );
    assert.match(
      source,
      /if \(cat === 'health_declaration'\) return true;/,
      'health_declaration måste accepteras oavsett källa'
    );
    return;
  }
  assert.equal(
    probe({ category: 'health_declaration', sourceSystem: 'drive_import' }),
    true,
    'drive_import ska inte diskvalificera en hälsodeklaration'
  );
});

test('friskförsäkran fungerade redan — asymmetrin ska vara borta, inte omvänd', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'ops', 'ccoKunderEnrichment.js'),
    'utf8'
  );
  // FF matchar på filnamn oavsett källa. Den raden får inte försvinna när
  // HD-sidan rättas.
  assert.match(source, /friskf\[o[öo]\]rs\[a[äa]\]kran\|fitness/);
});

// ── Grind 3 · synlighet vid import ───────────────────────────────────────────

test('makeVisible omfattar dokumenttyper som hör till kundresan', () => {
  const source = fs.readFileSync(IMPORT_SCRIPT, 'utf8');
  const setMatch = source.match(/VISIBLE_DOCUMENT_CATEGORIES = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(setMatch, 'VISIBLE_DOCUMENT_CATEGORIES ska finnas');
  const categories = setMatch[1];

  for (const kind of [
    'journal',
    'health_declaration',
    'fitness_certificate',
    'consent',
    'agreement',
    'offer',
  ]) {
    assert.match(categories, new RegExp(`'${kind}'`), `${kind} ska kunna bli synlig`);
  }
});

test('makeVisible använder listan, inte den gamla journal-jämförelsen', () => {
  const source = fs.readFileSync(IMPORT_SCRIPT, 'utf8');
  assert.match(source, /VISIBLE_DOCUMENT_CATEGORIES\.has\(category\)/);
  assert.doesNotMatch(
    source,
    /makeVisible:[\s\S]{0,120}category === 'journal'/,
    'den gamla journal-låsningen ska vara borta'
  );
});

test('synlighet kräver fortfarande säker klassificering', () => {
  // `other` och låg konfidens ska aldrig bli synliga automatiskt — den
  // spärren fanns före och ska finnas kvar.
  const source = fs.readFileSync(IMPORT_SCRIPT, 'utf8');
  assert.match(source, /makeVisible:[\s\S]{0,120}!needsClassification/);
  assert.doesNotMatch(
    /VISIBLE_DOCUMENT_CATEGORIES = new Set\(\[([\s\S]*?)\]\)/.exec(source)[1],
    /'other'/,
    'other får aldrig bli synlig automatiskt'
  );
});
