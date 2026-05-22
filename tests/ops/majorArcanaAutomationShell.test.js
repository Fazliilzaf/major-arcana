const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'app.js'
);

const INDEX_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'index.html'
);

test('automation top-level Testkör pekar på explicit run-knapp i stället för Samarbete-knappen', () => {
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  const indexSource = fs.readFileSync(INDEX_PATH, 'utf8');

  assert.ok(
    indexSource.includes('data-automation-primary-action="run"'),
    'Automation-shellen ska märka upp den riktiga top-level Testkör-knappen explicit.'
  );

  assert.ok(
    appSource.includes(`document.querySelector(\n    '[data-automation-primary-action="run"]'\n  )`),
    'app.js ska hämta top-level Testkör via explicit selector så Samarbete inte kan få run-listenern.'
  );

  assert.ok(
    !appSource.includes('const automationRunButton = document.querySelector(".automation-run-button");'),
    'app.js får inte längre hämta första .automation-run-button eftersom den träffar Samarbete före Testkör.'
  );
});

test('automation analys -> lär dig mer öppnar verklig liveversion i stället för hårdkodad placeholder', () => {
  const appSource = fs.readFileSync(APP_PATH, 'utf8');

  assert.ok(
    appSource.includes('function getPreferredAutomationVersionId('),
    'Automation-shellen ska ha en helper som väljer aktiv eller första liveversion i versionvyn.'
  );

  assert.ok(
    appSource.includes('setSelectedAutomationVersion(getPreferredAutomationVersionId());'),
    'Analysytans learn-action ska öppna versioner på verklig liveversion i stället för hårdkodad placeholder.'
  );

});
