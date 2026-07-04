'use strict';

/* Regression: V11/V12-facit-portarna (cco-v11-rk.js → CcoV11RailKomplett,
 * cco-v12-canon.js → CcoV12Canon, cco-v12-spine.js → CcoV12Spine) måste vara
 * dual-wired som egna <script>-taggar i index.html — inte enbart via
 * app.bundle. Annars, om staff-core-hashen 404:ar, blir globalerna undefined och
 * kundklick i ?view=customers faller till "V11 Rail · Block 0 / Scaffold aktiv"
 * trots att renderar-koden finns i repo. Det här testet låser att portarna laddas
 * oberoende av bundeln, i rätt beroendeordning (adapters före renderarna), och att
 * scaffold-fallbacken i patient-master-ui hoppas över när CcoV11RailKomplett finns. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const INDEX_HTML = path.join(ROOT, 'public', 'major-arcana-preview', 'index.html');
const PMUI = path.join(ROOT, 'public', 'major-arcana-preview', 'app', 'patient-master-ui.js');

const html = fs.readFileSync(INDEX_HTML, 'utf8');

// Portfiler som MÅSTE laddas som egna <script> på kundvyn, i denna ordning.
const REQUIRED_PORT_SCRIPTS = [
  'app/cco-v11-rail-adapters.js', // CcoV11RailAdapters — konsumeras av alla renderare
  'app/cco-v11-rk.js', // CcoV11RailKomplett — lilla railen (HÖGERSPALT-facit)
  'app/cco-v12-spine.js', // CcoV12Spine
  'app/cco-v12-canon.js', // CcoV12Canon — stora kundvyn
];

function scriptIndex(src) {
  // Matcha <script ... src="./<src>?v=..."> oavsett attribut-radbrytning.
  const re = new RegExp(
    'src="\\./' + src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\?[^"]*)?"'
  );
  return html.search(re);
}

test('index.html dual-wire:ar V11/V12-portarna som egna <script> (inte bara i bundeln)', () => {
  for (const src of REQUIRED_PORT_SCRIPTS) {
    assert.ok(
      scriptIndex(src) !== -1,
      `saknar <script src="./${src}"> i index.html — porten laddas då bara via bundeln och 404:ar med stale staff-core-hash`
    );
  }
});

test('adapters laddas före renderarna (CcoV11RailAdapters måste finnas vid render)', () => {
  const adapters = scriptIndex('app/cco-v11-rail-adapters.js');
  const rk = scriptIndex('app/cco-v11-rk.js');
  const spine = scriptIndex('app/cco-v12-spine.js');
  const canon = scriptIndex('app/cco-v12-canon.js');
  assert.ok(adapters < rk, 'cco-v11-rail-adapters.js måste ligga före cco-v11-rk.js');
  assert.ok(adapters < spine, 'cco-v11-rail-adapters.js måste ligga före cco-v12-spine.js');
  assert.ok(adapters < canon, 'cco-v11-rail-adapters.js måste ligga före cco-v12-canon.js');
});

test('port-scripten är defer (kör före DOMContentLoaded, blockerar inte parse)', () => {
  for (const src of REQUIRED_PORT_SCRIPTS) {
    const re = new RegExp(
      '<script[^>]*\\bdefer\\b[^>]*src="\\./' +
        src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        '(?:\\?[^"]*)?"'
    );
    assert.ok(re.test(html), `<script> för ${src} ska ha defer-attribut`);
  }
});

test('patient-master-ui renderar CcoV11RailKomplett och hoppar scaffold när inner har data-v11-rk', () => {
  const src = fs.readFileSync(PMUI, 'utf8');
  // Renderaren kallas när globalen finns …
  assert.match(
    src,
    /window\.CcoV11RailKomplett\s*&&\s*typeof window\.CcoV11RailKomplett\.render === 'function'/,
    'renderV11RailDetailShell ska anropa CcoV11RailKomplett.render när globalen finns'
  );
  // … och scaffold-fallbacken gäller bara när inner saknar data-v11-rk-markören.
  assert.match(
    src,
    /inner\.indexOf\('data-v11-rk'\) === -1/,
    'scaffold-gaten ska hoppas över när renderarens markup innehåller data-v11-rk'
  );
});
