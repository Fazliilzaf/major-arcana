const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ACTION_ENGINE_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-action-engine.js'
);

const ASYNC_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-async-orchestration.js'
);

const OVERLAY_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-overlay-renderers.js'
);

const APP_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'app.js'
);

test('runtime action engine blockerar anteckning och schemalaggning i offline historik', () => {
  const source = fs.readFileSync(ACTION_ENGINE_PATH, 'utf8');

  assert.match(
    source,
    /Öppna en aktiv tråd i arbetslistan för att skapa anteckningar\./,
    'Anteckningsöppning ska blockeras ärligt utan att ge offline historik ett eget specialspråk.'
  );
  assert.match(
    source,
    /Öppna en aktiv tråd i arbetslistan för att schemalägga uppföljning\./,
    'Schemaläggning ska blockeras ärligt utan att ge offline historik ett eget specialspråk.'
  );
});

test('async orchestration blockerar operativa studioactions i offline historik', () => {
  const source = fs.readFileSync(ASYNC_PATH, 'utf8');

  [
    'Öppna en aktiv tråd i arbetslistan för att förhandsvisa eller svara.',
    'Öppna en aktiv tråd i arbetslistan för att spara utkast.',
    'Öppna en aktiv tråd i arbetslistan för att parkera konversationen.',
    'Öppna en aktiv tråd i arbetslistan för att markera konversationen som klar.',
    'Öppna en aktiv tråd i arbetslistan för att radera konversationen.',
    'Öppna en aktiv tråd i arbetslistan för att skicka svar.',
  ].forEach((message) => {
    assert.match(
      source,
      new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `Offline historik ska blockera actionen: ${message}`
    );
  });
});

test('overlay renderern satter studion i read-only lage for offline historik', () => {
  const source = fs.readFileSync(OVERLAY_PATH, 'utf8');

  assert.match(
    source,
    /const isOfflineHistoryReply =[\s\S]*isOfflineHistoryContextThread\(thread\)/,
    'Overlay-renderern måste räkna ut offline-history reply-läge.'
  );
  assert.match(
    source,
    /studioEditorInput\.disabled =[\s\S]*isOfflineHistoryReply/,
    'Editorn ska låsas i offline-history reply-läge.'
  );
  assert.match(
    source,
    /Välj en aktiv tråd i arbetslistan för att använda hela Svarstudio\./,
    'Studion ska ge en neutral blockerförklaring utan att göra offline historik till ett eget specialläge.'
  );
  assert.match(
    source,
    /studioPolicyPill\.textContent =[\s\S]*isOfflineHistoryReply[\s\S]*"Historik"[\s\S]*policy\.label;/,
    'Policy-pill ska märka historikkontexten utan att införa ett separat offline-läsläge i ytan.'
  );
});

test('appen begransar offline historik till verkligt offline_history-runtime', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');

  assert.match(
    source,
    /function isOfflineHistoryReadOnlyMode\(\) \{[\s\S]*getRuntimeLeftColumnState\(\)\.mode === "history"[\s\S]*getRuntimeMode\(\) === "offline_history"[\s\S]*getSelectedQueueHistoryConversationId\(\)/,
    'Offline historik ska bara aktiveras av vald historikkonversation nar runtime verkligen ar offline_history.'
  );
  assert.doesNotMatch(
    source,
    /function isOfflineHistoryReadOnlyMode\(\) \{[\s\S]*state\.runtime\?\.live !== true/,
    'Offline historik ska inte längre bero på att hela runtime-läget råkar vara offline.'
  );
});
