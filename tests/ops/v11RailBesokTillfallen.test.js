'use strict';

/* "Besök/tillfällen → V11 Rail": visit-segments renderas i V11 Rails (cco-v11-rk.js)
 * EGET formspråk, mellan Historik och Foton, read-only, med confidence + reasons.
 * Låser att:
 *  - sektionen ligger mellan Historik och Foton i källan,
 *  - render återanvänder befintlig datalayer (CcoKundkortVisitSegments), inte en
 *    bespoke fetch och inte kkref/storvy-markup som primär yta,
 *  - occasion-render använder railens klasser (hist-row/photo-grid/file-row),
 *  - osäkra kopplingar (medium/low) aldrig visas som klara utan får amber-badge,
 *  - overifierade assets aldrig kan visas som klara (API-filtret är kvar). */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const RK = path.join(ROOT, 'public', 'major-arcana-preview', 'app', 'cco-v11-rk.js');
const ROUTE = path.join(ROOT, 'src', 'routes', 'ccoPatientMaster.js');
const source = fs.readFileSync(RK, 'utf8');

// Ladda modulen i Node (IIFE:n väljer globalThis när window saknas; DOM-observern
// hoppas när global.document saknas).
require(RK);
const RailKomplett = globalThis.CcoV11RailKomplett;

test('modulen exponerar render + Besök/tillfällen-render/hydrering', () => {
  assert.equal(typeof RailKomplett.render, 'function');
  assert.equal(typeof RailKomplett.renderBesokOccasion, 'function');
  assert.equal(typeof RailKomplett.hydrateBesok, 'function');
});

test('Besök/tillfällen-sektionen ligger mellan Historik och Foton i källan', () => {
  const hist = source.indexOf('I · HISTORIK');
  const besok = source.indexOf('data-v11-rk-besok-sec');
  const foton = source.indexOf('M · FOTON');
  assert.ok(hist !== -1 && besok !== -1 && foton !== -1, 'saknar en av sektionsmarkörerna');
  assert.ok(hist < besok, 'Besök/tillfällen ska ligga efter Historik');
  assert.ok(besok < foton, 'Besök/tillfällen ska ligga före Foton');
});

test('render() emitterar dold mount-punkt med patientId (hydreras async)', () => {
  const html = RailKomplett.render({ card: { id: 'pat-42', displayName: 'Test' } });
  assert.match(html, /data-v11-rk-besok="pat-42"/, 'mount ska bära patientId');
  assert.match(html, /data-v11-rk-besok-sec hidden/, 'sektionen ska börja dold');
});

test('återanvänder befintlig datalayer, inte bespoke fetch/kkref-markup', () => {
  assert.match(
    source,
    /CcoKundkortVisitSegments/,
    'ska använda den delade visit-segments-datalayern'
  );
  assert.match(source, /fetchVisitSegmentsOrEmpty/, 'ska hämta via delade datalayern');
  // Ingen egen fetch mot visit-segments-endpointen i railfilen.
  assert.doesNotMatch(source, /fetch\(\s*['"`][^'"`]*visit-segments/, 'ingen bespoke fetch');
  // Ingen kkref/storvy-markup som primär yta i den nya render-vägen.
  assert.doesNotMatch(source, /gk-visit-card|kk-besok|\.kkref/, 'ingen kkref/storvy-markup');
});

test('occasion-render använder railens egna klasser (ingen ny design)', () => {
  const html = RailKomplett.renderBesokOccasion({
    date: '2026-06-18',
    label: '18 jun',
    visitType: 'treatment',
    timeRange: '14:20–15:10',
    confidence: 'high',
    images: [{ thumbnailUrl: '/t.jpg', timeLabel: '14:22' }],
    documents: [{ fileName: 'avtal.pdf', openRef: '/d', documentDate: '2026-06-18' }],
  });
  assert.match(html, /class="hist-row"/, 'ska återanvända hist-row');
  assert.match(html, /class="photo-grid"/, 'ska återanvända photo-grid');
  assert.match(html, /class="photo-tile raw"/, 'ska återanvända photo-tile');
  assert.match(html, /class="file-row"/, 'ska återanvända file-row');
});

test('osäker koppling (low/medium) visas aldrig som klar — amber-badge, aldrig "Genomförd"', () => {
  const low = RailKomplett.renderBesokOccasion({
    date: '2026-06-18',
    confidence: 'low',
    reasons: ['uncertain_document_date_binding'],
    images: [],
    documents: [],
  });
  assert.match(low, /q-status warn/, 'low → amber-badge');
  assert.match(low, /Osäker/, 'low → "Osäker"');
  const medium = RailKomplett.renderBesokOccasion({ date: '2026-06-18', confidence: 'medium' });
  assert.match(medium, /q-status warn/, 'medium → amber-badge');
  assert.match(medium, /Kontrollera/, 'medium → "Kontrollera"');
  // Aldrig grön "klar"-status på tillfällen.
  for (const html of [low, medium]) {
    assert.doesNotMatch(html, /Genomförd|q-status green/, 'tillfällen ska aldrig visas som klara');
  }
});

test('high confidence → ingen osäkerhets-badge', () => {
  const high = RailKomplett.renderBesokOccasion({ date: '2026-06-18', confidence: 'high' });
  assert.doesNotMatch(high, /q-status warn|Osäker|Kontrollera/, 'high ska inte flagga osäkerhet');
});

test('segment utan datum renderas inte (bara daterade tillfällen)', () => {
  assert.equal(RailKomplett.renderBesokOccasion({ confidence: 'high' }), '');
  assert.equal(RailKomplett.renderBesokOccasion(null), '');
});

test('overifierade native-assets exkluderas fortfarande vid API:t', () => {
  const routeSrc = fs.readFileSync(ROUTE, 'utf8');
  assert.match(
    routeSrc,
    /\['VISIBLE_ON_PATIENT_CARD',\s*'VERIFIED_IN_CCO'\]\.includes\(asset\.status\)/,
    'buildPatientPayload ska bara släppa igenom VISIBLE_ON_PATIENT_CARD/VERIFIED_IN_CCO'
  );
});
