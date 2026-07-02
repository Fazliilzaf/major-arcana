const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PREVIEW_ROOT = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview');
const QUEUE_RENDERERS_PATH = path.join(PREVIEW_ROOT, 'runtime-queue-renderers.js');
const DOM_LIVE_COMPOSITION_PATH = path.join(PREVIEW_ROOT, 'runtime-dom-live-composition.js');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('C12 visar en explicit maildata-gate i tom konversationskö', () => {
  const source = read(QUEUE_RENDERERS_PATH);

  assert.match(
    source,
    /function buildRuntimeMailDataGateMarkup\(/,
    'Tomma konversationer ska renderas via en tydlig data-gate, inte som mystiskt tom kö.'
  );
  assert.match(
    source,
    /Konversationer är tomma eftersom maildata saknas/,
    'Data-gaten ska säga varför användaren ser en tom konversationsvy.'
  );
  assert.match(
    source,
    /data-runtime-sync-mail/,
    'Data-gaten ska erbjuda en explicit sync-action från själva konversationsvyn.'
  );
  assert.match(
    source,
    /CCO-session saknas/,
    'Saknad session ska visas som auth-problem i UI:t, inte som noll data.'
  );
});

test('C12 sync-knappen postar till runtime-sync och cache-bustar worklist efter start', () => {
  const source = read(DOM_LIVE_COMPOSITION_PATH);

  assert.match(
    source,
    /async function handleRuntimeMailboxSync\(/,
    'Konversationsvyn ska ha en egen sync-handler.'
  );
  assert.match(
    source,
    /apiRequest\("\/api\/v1\/cco\/runtime\/sync",\s*\{[\s\S]*method:\s*"POST"/,
    'Sync-handlern ska använda befintlig backend-route för Microsoft Graph-backfill.'
  );
  assert.match(
    source,
    /lookbackDays:\s*14/,
    'Manuell sync ska köra en begränsad, operativ lookback i stället för obegränsad import.'
  );
  assert.match(
    source,
    /url\.searchParams\.set\("_mailSync", refreshNonce\)/,
    'Efter sync ska worklist-fetch cache-bustas så användaren inte ser gammal tom kö.'
  );
  assert.match(
    source,
    /graph_read_unavailable[\s\S]*ARCANA_GRAPH_READ_ENABLED=true/,
    'Graph READ-avstängning ska förklaras direkt i UI:t.'
  );
});
