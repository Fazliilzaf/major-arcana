'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP_PATH = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'app.js');
const SHELL_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'app',
  'cco-conversations-v2-shell.js'
);

test('v2 persistenta actions använder enbart legacys etablerade action-kontrakt och laddar om samma scope', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');

  assert.match(source, /function getV2ConversationActionTarget\(thread\)/);
  assert.match(
    source,
    /\/api\/v1\/cco\/runtime\/conversation\/\$\{encodeURIComponent\(target\.conversationKey\)\}\/action/,
    'enskilda actions ska använda befintlig conversation/:key/action-route'
  );
  assert.match(source, /action,\s*customerId: target\.customerId/);
  assert.match(
    source,
    /await refreshConversationActionRuntimeProjection\(thread, `v2 \$\{action\}`\)/,
    'en sparad action ska läsa om samma runtime-projektion efter serverns svar'
  );
  assert.match(source, /\/api\/v1\/cco\/runtime\/conversation\/bulk\/preview/);
  assert.match(source, /\/api\/v1\/cco\/runtime\/conversation\/bulk\/confirm/);
  assert.match(source, /confirm: true/);
  assert.match(
    source,
    /const selectedMailboxIds = getSelectedRuntimeMailboxScopeIds\(\);/,
    'reloaden ska bevara valt mailbox-scope'
  );
  assert.doesNotMatch(source, /v2Action[^\n]*demo|v2Action[^\n]*mock/i);
});

test('v2 bulkytan erbjuder endast serverstödda persistenta actions', () => {
  const source = fs.readFileSync(SHELL_PATH, 'utf8');
  const bulkStart = source.indexOf('var V3_BULK_ACTIONS = [');
  const bulkEnd = source.indexOf('];', bulkStart);
  const bulkSource = source.slice(bulkStart, bulkEnd);

  assert.match(bulkSource, /id: 'handled'/);
  assert.match(bulkSource, /id: 'reply_later'/);
  assert.match(bulkSource, /id: 'reopen'/);
  assert.doesNotMatch(bulkSource, /assign|snooze|triage/);
});

test('v2 handoff använder bara worklistens exakta e-postmatchning och etablerade legacy-kontrakt', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');

  assert.match(source, /function getV2ConfirmedPatientHandoff\(thread\)/);
  assert.match(source, /exactEmailMatchSources\.has\(matchedBy\)/);
  assert.match(source, /"primaryemail",\s*"emails",\s*"cliento\.emails",\s*"pipedrive\.emails"/);
  assert.match(source, /function buildV2ThreadHandoffContext\(thread\)/);
  assert.match(source, /type: "cco:kalender:context", context/);
  assert.match(source, /openBookingOperatorSurface\(/);
  assert.match(source, /type: "arcana:cco-open-customer-dossier", patientId: context\.patientId/);

  const handoffStart = source.indexOf('function openV2CustomerDossier(thread)');
  const handoffEnd = source.indexOf('function setV2ConversationActionFeedback', handoffStart);
  const handoffSource = source.slice(handoffStart, handoffEnd);
  assert.doesNotMatch(
    handoffSource,
    /openPatientByEmail|customerEmail:/,
    'v2-kundhandoff får inte falla tillbaka till namn eller e-post'
  );
});
