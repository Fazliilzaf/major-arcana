'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function renderWithHealth(health) {
  const source = fs.readFileSync(
    path.join(__dirname, '../../public/major-arcana-preview/app/cco-v11-rk.js'),
    'utf8'
  );
  const adapters = {
    buildHealthPreview() {
      return health;
    },
  };
  const sandbox = { window: { CcoV11RailAdapters: adapters }, console };
  vm.runInNewContext(`${source}\n;this.renderer = window.CcoV11RailKomplett;`, sandbox);
  return sandbox.renderer.render({ card: { displayName: 'Testkund' } });
}

test('V11 visar okand HD-data som ej registrerad, inte som nekande svar', () => {
  const html = renderWithHealth({
    status: 'missing',
    signedAt: '',
    allergies: [],
    medications: { items: [], known: false },
    contraindications: [],
    answers: [],
  });

  assert.match(html, /Allergier<\/span><span class="pill unknown">Ej registrerat/);
  assert.match(html, /Pågående mediciner<\/span><span class="pill unknown">Ej registrerat/);
  assert.doesNotMatch(html, /Allergier<\/span><span class="pill no">NEJ/);
  assert.doesNotMatch(html, /Pågående mediciner<\/span><span class="pill no">NEJ/);
});

test('V11 behaller explicita HD-svar fran formularparsern', () => {
  const html = renderWithHealth({
    status: 'signed',
    signedAt: '2026-07-14',
    allergies: [],
    medications: { items: [], known: false },
    contraindications: [],
    answers: [
      { label: 'Allergier', value: 'Nej', detail: '', risk: '' },
      { label: 'Pågående mediciner', value: 'Ja', detail: 'Minoxidil', risk: 'amber' },
    ],
  });

  assert.match(html, /Allergier<\/span><span class="pill no">NEJ/);
  assert.match(html, /Pågående mediciner<\/span><span class="pill yes">JA/);
});

test('V11 ateranvander den interna dokumentmodalen for signerad HD', () => {
  const html = renderWithHealth({
    status: 'signed',
    signedAt: '2026-07-14',
    viewUrl: '/api/v1/cco/assets/hd-1/download?inline=1',
    documentTitle: 'Hälsodeklaration',
    allergies: [],
    medications: { items: [], known: false },
    contraindications: [],
    answers: [],
  });

  assert.match(
    html,
    /data-kk-open-doc="\/api\/v1\/cco\/assets\/hd-1\/download\?inline=1"/
  );
  assert.match(html, /data-kk-doc-title="Hälsodeklaration">Öppna PDF/);
});
