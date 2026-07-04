'use strict';

/* PR 33 — Ytterkant-marginal på full-breddsvyerna. Efter #579 (max-width släppt)
 * låg innehållet flöt mot kanten eftersom aux-foundationens --pad-x hade en
 * ogiltig calc ("0.5rem+1.6vw" utan mellanslag → hela clamp:en ogiltig →
 * padding föll till 0). Tidigare doldes det av margin-inline:auto-centreringen.
 * Nu: giltig clamp (med mellanslag) som ger ~30–36px luft. no-show-ai/smart
 * (egen struktur) får matchande padding-inline. Ren CSS, ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const read = (f) =>
  fs.readFileSync(path.join(repoRoot, 'public', 'major-arcana-preview', f), 'utf8');

// aux-baserade full-breddsvyer: --pad-x lagas.
const auxViews = [
  'cco-signaturer-v3.html',
  'cco-notiser-v3.html',
  'cco-skickat-v3.html',
  'cco-no-show-v3.html',
  'cco-makron-v3.html',
  'cco-patient-hub-v3.html',
];

for (const f of auxViews) {
  test(`PR33: ${f} har giltig --pad-x (ingen calc utan mellanslag → ingen 0-padding)`, () => {
    const src = read(f);
    assert.match(src, /--pad-x:\s*clamp\(1rem, 0\.6rem \+ 1\.4vw, 2\.25rem\)/);
    // Den trasiga varianten (saknar mellanslag runt +) ska vara borta.
    assert.doesNotMatch(src, /--pad-x:\s*clamp\(0\.875rem, 0\.5rem\+1\.6vw/);
  });
}

// no-show-ai + smart: egen struktur → padding-inline på body.
for (const f of ['cco-no-show-ai-v3.html', 'cco-smart-anteckning-v3.html']) {
  test(`PR33: ${f} får matchande ytterkant-luft (padding-inline)`, () => {
    const src = read(f);
    assert.match(src, /padding-inline:\s*clamp\(1rem, 0\.6rem \+ 1\.4vw, 2\.25rem\)/);
  });
}

test('PR33: ingen live-send introducerad', () => {
  for (const f of [...auxViews, 'cco-no-show-ai-v3.html', 'cco-smart-anteckning-v3.html']) {
    assert.doesNotMatch(read(f), /sendMail\(|graphSend|messages\/send/);
  }
});
