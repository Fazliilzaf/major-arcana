'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PREVIEW_ROOT = path.join(__dirname, '../../public/major-arcana-preview');
const VISIT_SEGMENTS_PATH = path.join(PREVIEW_ROOT, 'app/cco-kundkort-visit-segments.js');
const V11_RK_PATH = path.join(PREVIEW_ROOT, 'app/cco-v11-rk.js');

function loadVisitSegments(fetchImpl) {
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

const sampleSegment = {
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
};

test('renderV11RailBesokInner uses kk-besok inside V11 helpers', () => {
  const api = loadVisitSegments();
  const html = api.renderV11RailBesokInner([sampleSegment]);
  assert.match(html, /class="kk-besok"/);
  assert.match(html, /photo-grid/);
  assert.match(html, /file-row/);
  assert.match(html, /kk-besok-uncertain/);
});

test('renderV11RailBesokPlaceholderInner exposes data-v11-besok-tillfallen', () => {
  const api = loadVisitSegments();
  const html = api.renderV11RailBesokPlaceholderInner('patient-abc');
  assert.match(html, /data-v11-besok-tillfallen/);
  assert.match(html, /data-patient-id="patient-abc"/);
});

test('hydrateV11RailBesokTillfallen fills placeholder without breaking rail shell', async () => {
  const api = loadVisitSegments(() =>
    Promise.resolve({
      ok: true,
      json: async () => ({ visitSegments: [sampleSegment] }),
    })
  );
  const root = {
    querySelector(sel) {
      if (sel === '[data-v11-besok-tillfallen]') return host;
      return null;
    },
  };
  const host = {
    innerHTML: '',
    attrs: {},
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    getAttribute(k) {
      return this.attrs[k];
    },
    closest() {
      return {
        querySelector() {
          return { textContent: '' };
        },
      };
    },
  };
  const ok = await api.hydrateV11RailBesokTillfallen(root, 'patient-abc');
  assert.equal(ok, true);
  assert.match(host.innerHTML, /class="kk-besok"/);
  assert.equal(host.attrs['data-v11-besok-state'], 'done');
});

test('cco-v11-rk.js mounts Besök/tillfällen section after Foton', () => {
  const rkSrc = fs.readFileSync(V11_RK_PATH, 'utf8');
  const fotoIdx = rkSrc.indexOf("label('Foton')");
  const besokIdx = rkSrc.indexOf("label('Besök/tillfällen'");
  assert.ok(fotoIdx > 0, 'Foton section should exist');
  assert.ok(besokIdx > fotoIdx, 'Besök/tillfällen should render after Foton');
  assert.match(rkSrc, /v11-rk__besok-tillfallen/);
  assert.match(rkSrc, /renderV11RailBesokPlaceholderInner/);
});
