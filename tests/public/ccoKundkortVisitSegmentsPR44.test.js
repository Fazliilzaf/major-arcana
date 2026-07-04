'use strict';

/* PR 44 — Kundkortets "Besök/tillfällen"-UI (read-only) ovanpå #594 visit-
 * segments. Testar den rena vy-modellen + HTML-renderaren i
 * app/cco-kundkort-visit-segments.js: datum (dag/månad/år) + timeRange,
 * bild-sortering på takenAt/timeLabel, dokument i samma segment, confidence +
 * reasons vid osäkerhet, och att osäkra/granskningssegment aldrig visas som
 * klara. Ingen live-send. */

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

// Modulen är en IIFE som fäster på global. Ladda den i denna process.
require(
  path.resolve(__dirname, '../../public/major-arcana-preview/app/cco-kundkort-visit-segments.js')
);
const VS = globalThis.CcoKundkortVisitSegments;

const SAMPLE = {
  patientId: 'patient-1',
  customerId: 'patient-1',
  visitSegments: [
    {
      date: '2024-04-22',
      label: '22 april 2024',
      timeRange: '09:14–10:02',
      visitType: 'prp',
      confidence: 'high',
      reasons: [],
      images: [
        {
          assetId: 'b',
          takenAt: '2024-04-22T10:02:00',
          timeLabel: '10:02',
          fileName: 'B.jpg',
          openRef: '/api/v1/cco/assets/b/download?inline=1',
        },
        {
          assetId: 'a',
          takenAt: '2024-04-22T09:14:00',
          timeLabel: '09:14',
          fileName: 'A.jpg',
          openRef: '/api/v1/cco/assets/a/download?inline=1',
        },
      ],
      documents: [
        {
          assetId: 'd',
          documentDate: '2024-04-22',
          fileName: 'Journal.pdf',
          type: 'journal_pdf',
          openRef: '/api/v1/cco/assets/d/download?inline=1',
        },
      ],
    },
    {
      date: '2024-01-10',
      label: '10 januari 2024',
      timeRange: '',
      visitType: 'consultation',
      confidence: 'low',
      reasons: ['inferred_from_path_or_filename', 'date_without_time_metadata'],
      images: [],
      documents: [],
    },
    {
      date: null,
      label: 'Behöver granskning',
      timeRange: '',
      visitType: 'unknown',
      confidence: 'low',
      reasons: ['inferred_from_path_or_filename'],
      images: [{ assetId: 'x', takenAt: null, timeLabel: '', fileName: 'IMG.heic', openRef: '' }],
      documents: [],
    },
  ],
};

test('PR44: modulen exporterar det publika API:t', () => {
  assert.equal(typeof VS.buildViewModel, 'function');
  assert.equal(typeof VS.renderSectionHtml, 'function');
  assert.equal(typeof VS.fetchVisitSegments, 'function');
  assert.equal(typeof VS.hydrate, 'function');
});

test('PR44: vy-modellen delar upp datum i dag/månad/år + timeRange', () => {
  const vm = VS.buildViewModel(SAMPLE);
  assert.equal(vm.patientId, 'patient-1');
  const s0 = vm.segments[0];
  assert.equal(s0.day, 22);
  assert.equal(s0.monthLabel, 'april');
  assert.equal(s0.year, 2024);
  assert.equal(s0.heading, '22 april 2024');
  assert.equal(s0.timeRange, '09:14–10:02');
  assert.equal(s0.visitTypeLabel, 'PRP');
  assert.equal(s0.uncertain, false);
});

test('PR44: bilder sorteras stigande efter takenAt/timeLabel', () => {
  const s0 = VS.buildViewModel(SAMPLE).segments[0];
  assert.deepEqual(
    s0.images.map((i) => i.fileName),
    ['A.jpg', 'B.jpg']
  );
});

test('PR44: dokument hör till samma besökssegment', () => {
  const s0 = VS.buildViewModel(SAMPLE).segments[0];
  assert.equal(s0.documents.length, 1);
  assert.equal(s0.documents[0].fileName, 'Journal.pdf');
});

test('PR44: låg confidence + reasons ger osäkerhet med svenska etiketter', () => {
  const s1 = VS.buildViewModel(SAMPLE).segments[1];
  assert.equal(s1.uncertain, true);
  assert.ok(s1.reasonLabels.includes('Datum härlett ur filnamn/mapp'));
  assert.ok(s1.reasonLabels.includes('Datum utan klockslag'));
});

test('PR44: "Behöver granskning"-bucket flaggas som review, aldrig klar', () => {
  const s2 = VS.buildViewModel(SAMPLE).segments[2];
  assert.equal(s2.reviewBucket, true);
  assert.equal(s2.uncertain, true);
  assert.equal(s2.date, null);
});

test('PR44: renderSectionHtml använder befintlig kundkortsdesign', () => {
  const html = VS.renderSectionHtml(VS.buildViewModel(SAMPLE));
  assert.match(html, /data-sek="besok-tillfallen"/);
  assert.match(html, /<span class="count">3<\/span>/);
  assert.match(html, /class="kk-besok"/);
  assert.match(html, /22 april 2024/);
  // Osäkra/granskningssegment får status-pill, aldrig ett "klar"-läge.
  assert.match(html, /class="pill p-warn">Osäkert/);
  assert.match(html, /class="pill p-block">Behöver granskning/);
  assert.doesNotMatch(html, /klar|Markera klar|done|slutf[oö]rd/i);
  // Öppningsbara rader använder dossierns rad-primitiv (button data-kk-open-doc).
  assert.match(
    html,
    /<button type="button" class="gk-med-doc" data-kk-open-doc="[^"]*assets\/a\/download[^"]*"/
  );
  assert.match(html, /class="gk-med-doc-open">Visa<\/span>/);
});

test('PR44: HTML escapas (ingen injektion via filnamn)', () => {
  const html = VS.renderSectionHtml(
    VS.buildViewModel({
      patientId: 'p',
      visitSegments: [
        {
          date: '2024-05-01',
          label: '1 maj 2024',
          confidence: 'high',
          reasons: [],
          images: [
            {
              fileName: '<img src=x onerror=alert(1)>.jpg',
              takenAt: '2024-05-01T08:00:00',
              timeLabel: '08:00',
              openRef: '',
            },
          ],
          documents: [],
        },
      ],
    })
  );
  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.match(html, /&lt;img src=x/);
});

test('PR44: tom payload ger tom-tillstånd, ingen krasch', () => {
  const html = VS.renderSectionHtml(VS.buildViewModel({ patientId: 'p', visitSegments: [] }));
  assert.match(html, /Inga besök\/tillfällen ännu/);
  assert.match(html, /<span class="count">0<\/span>/);
});
