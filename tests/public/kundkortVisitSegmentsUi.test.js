'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PREVIEW_ROOT = path.join(__dirname, '../../public/major-arcana-preview');
const INDEX_HTML_PATH = path.join(PREVIEW_ROOT, 'index.html');
const VISIT_SEGMENTS_PATH = path.join(PREVIEW_ROOT, 'app/cco-kundkort-visit-segments.js');

function loadVisitSegmentsUi(fetchImpl) {
  const sandbox = {
    window: {},
    document: { querySelector: () => null },
    fetch:
      fetchImpl || (() => Promise.resolve({ ok: true, json: async () => ({ visitSegments: [] }) })),
  };
  vm.runInNewContext(fs.readFileSync(VISIT_SEGMENTS_PATH, 'utf8'), sandbox, {
    filename: VISIT_SEGMENTS_PATH,
  });
  return sandbox.window.CcoKundkortVisitSegments;
}

function scriptTagForSrc(html, srcFragment) {
  const pattern = new RegExp(
    `<script\\b[^>]*src="[^"]*${srcFragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"]*"[^>]*>`,
    'i'
  );
  const match = html.match(pattern);
  assert.ok(match, `expected script tag for ${srcFragment}`);
  return match[0];
}

test('index.html loads visit-segments before referens with defer on both', () => {
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  const visitIdx = html.indexOf('cco-kundkort-visit-segments.js');
  const referensIdx = html.indexOf('cco-kundkort-referens.js');
  assert.ok(visitIdx > 0, 'visit-segments script should exist');
  assert.ok(referensIdx > visitIdx, 'referens should load after visit-segments');

  const visitTag = scriptTagForSrc(html, 'cco-kundkort-visit-segments.js');
  const referensTag = scriptTagForSrc(html, 'cco-kundkort-referens.js');
  assert.match(visitTag, /\bdefer\b/, 'visit-segments script must use defer');
  assert.match(referensTag, /\bdefer\b/, 'referens script must use defer');
});

test('fetchVisitSegmentsOrEmpty returns [] when visit-segments API fails', async () => {
  const api = loadVisitSegmentsUi(() =>
    Promise.resolve({
      ok: false,
      status: 500,
    })
  );
  const result = await api.fetchVisitSegmentsOrEmpty('patient-1', 'token');
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});

test('summary hydration chain continues when visitSegments fetch rejects', async () => {
  const payload = { driveFiles: [{ id: 'drive-1', fileName: 'Journal.pdf' }] };
  const files = payload.driveFiles;
  const segmentsPromise = Promise.reject(new Error('HTTP 404')).catch(function () {
    return [];
  });
  const hydrated = await segmentsPromise.then(function (visitSegments) {
    return {
      driveFiles: files,
      payload,
      visitSegments: visitSegments || [],
    };
  });
  assert.equal(hydrated.driveFiles.length, 1);
  assert.equal(hydrated.driveFiles[0].id, 'drive-1');
  assert.deepEqual(hydrated.visitSegments, []);
});

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
