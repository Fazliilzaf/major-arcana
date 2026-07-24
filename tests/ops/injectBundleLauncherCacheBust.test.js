'use strict';

/* Regression: launchern (public/konversationer-bottom-actions.js) bundlas INTE
 * (ligger i public-roten, utanför major-arcana-preview/) och får därför ingen
 * content-hash-cache-bust. Den serveras med `max-age=600, stale-while-revalidate`,
 * så med en STATISK ?v=-token fortsätter browser/edge att servera den GAMLA
 * filen upp till ~70 min efter deploy → panel-fixarna i launchern (t.ex.
 * fetchPatientMasterCard/demo-neutralisering) "syns inte live". bin/inject-bundle.js
 * (körs vid VARJE Render-deploy) måste därför stämpla launcher-token med
 * deploy-committen så URL:en byts varje deploy → garanterad cache-miss.
 * Det här testet låser att stämplingen finns kvar och är inkopplad i pipelinen. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const INJECT = path.resolve(__dirname, '../../bin/inject-bundle.js');
const INDEX_HTML = path.resolve(__dirname, '../../public/major-arcana-preview/index.html');

test('inject-bundle stämplar launcher-token med deploy-committen (auto-cache-bust)', () => {
  const source = fs.readFileSync(INJECT, 'utf8');
  assert.match(
    source,
    /function injectLauncherCacheBust\(html, latestInfo\)/,
    'launcher-cache-bust-funktionen ska finnas'
  );
  // Token = deploy-commit (buildCommit), fallback bundle-hash.
  assert.match(
    source,
    /latestInfo\.buildCommit \|\| latestInfo\.hash/,
    'token ska härledas från buildCommit (fallback hash)'
  );
  // Måste rewrita just launcher-URL:ens ?v=-token.
  assert.match(
    source,
    /src="\\\/konversationer-bottom-actions\\\.js\\\?v=/,
    'ska rewrita launcherns ?v=-token'
  );
  // Måste vara inkopplad i den faktiska injektions-pipelinen (inte bara definierad).
  assert.match(
    source,
    /injectLauncherCacheBust\(withHeadMeta, latest\)/,
    'launcher-cache-bust ska köras i pipelinen'
  );
});

test('index.html laddar launchern via en cache-bustbar ?v=-token (inte den gamla statiska)', () => {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const m = html.match(/\/konversationer-bottom-actions\.js\?v=([^"]+)"/);
  assert.ok(m, 'launcher-taggen ska finnas med en ?v=-token i index.html');
  assert.notEqual(
    m[1],
    'v2-library-mode-1',
    'den gamla statiska token (aldrig bumpad under #1185–1189) får inte ligga kvar'
  );
});
