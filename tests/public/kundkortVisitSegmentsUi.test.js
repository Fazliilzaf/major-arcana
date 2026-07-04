'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadVisitSegmentsUi() {
  const filePath = path.join(
    __dirname,
    '../../public/major-arcana-preview/app/cco-kundkort-visit-segments.js'
  );
  const sandbox = { window: {}, document: { querySelector: () => null } };
  vm.runInNewContext(fs.readFileSync(filePath, 'utf8'), sandbox, { filename: filePath });
  return sandbox.window.CcoKundkortVisitSegments;
}

test('renderBesokInnerFromVisitSegments uses kk-besok markup and confidence reasons', () => {
  const api = loadVisitSegmentsUi();
  const html = api.renderBesokInnerFromVisitSegments(
    [
      {
        date: '2024-04-22',
        label: '22 april 2024',
        timeRange: '09:14–09:38',
        visitType: 'prp',
        confidence: 'medium',
        reasons: ['document_shared_across_same_day_clusters'],
        images: [
          {
            assetId: 'img-1',
            takenAt: '2024-04-22T09:14:00',
            timeLabel: '09:14',
            fileName: 'Front.jpg',
            thumbnailUrl: '/api/v1/cco/assets/img-1/thumbnail',
            openRef: '/api/v1/cco/assets/img-1/download?inline=1',
          },
        ],
        documents: [
          {
            assetId: 'doc-1',
            documentDate: '2024-04-22',
            fileName: 'Journal.pdf',
            type: 'journal_pdf',
            openRef: '/api/v1/cco/assets/doc-1/download?inline=1',
          },
        ],
      },
    ],
    {
      esc: (s) => String(s ?? ''),
      buildDocViewRow: (label, meta, url, key) =>
        `<row data-key="${key}" data-url="${url}">${label}|${meta}</row>`,
      gkSharedPhotoGrid: (items) => `<grid count="${items.length}"></grid>`,
      empty: (t) => `<empty>${t}</empty>`,
    }
  );

  assert.match(html, /class="kk-besok"/);
  assert.match(html, /22 april 2024 · PRP · 09:14–09:38/);
  assert.match(html, /kk-besok-uncertain/);
  assert.match(html, /Dokument delat mellan besök samma dag/);
  assert.match(html, /gk-visit-photos/);
  assert.match(html, /<grid count="1"><\/grid>/);
  assert.match(html, /Journal\.pdf\|2024-04-22 · journal_pdf/);
});

test('countDatedSegments ignores catch-all buckets without date', () => {
  const api = loadVisitSegmentsUi();
  assert.equal(
    api.countDatedSegments([{ date: '2024-04-22' }, { date: null, label: 'Datum/tid saknas' }]),
    1
  );
});
