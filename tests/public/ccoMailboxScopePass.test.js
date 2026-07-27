'use strict';

/**
 * ORD-83 — mailbox-scopet beräknas en gång per pass, inte per tråd.
 *
 * Bakgrund: getRelatedCustomerThreads anropade getMailboxScopedRuntimeThreads
 * per tråd. Via journey-kedjan (buildPreviewPatient360Backbone →
 * buildCustomerHistoryEvents → getRelatedCustomerThreads) gjorde det
 * lane-räkningen O(trådar² × brevlådor): 78 661 929 toLowerCase i ETT
 * v2:lane_counts-anrop med 545 trådar.
 *
 * Testet låser fast fyra egenskaper:
 *
 *   1. Inom ett pass härleds scopet EN gång, oavsett antal anrop.
 *   2. Resultatet är identiskt med det omemoiserade — ingen beteendeändring.
 *   3. Memot överlever ALDRIG passet. Ändras state mellan passen ska nästa
 *      pass se det nya scopet, inte det gamla.
 *   4. Ett kast inuti passet stänger det ändå (finally), så ett fel inte
 *      lämnar ett låst scope kvar för resten av sessionen.
 *
 * Punkt 3 är den säkerhetsrelevanta: trådlistan och brevlådevalet ändras under
 * laddningen, och ett scope som låg kvar skulle servera ett gammalt urval.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'app.js'),
  'utf8'
);

function extractFunction(name) {
  const start = APP.indexOf(`\n  function ${name}(`);
  assert.ok(start > -1, `${name} ska finnas i app.js`);
  const end = APP.indexOf('\n  }\n', start);
  assert.ok(end > start, `${name} ska vara sluten på toppnivå i IIFE:n`);
  return APP.slice(start, end + '\n  }\n'.length);
}

/** Passets tillståndsvariabel deklareras utanför funktionerna. */
function extractPassState() {
  const line = '  let __mailboxScopePass = null;';
  assert.ok(APP.includes(line), 'passets tillståndsvariabel ska finnas i app.js');
  return line;
}

function load() {
  const sandbox = {
    // Räknar hur många gånger den dyra härledningen faktiskt körs.
    derivations: 0,
    currentScope: ['a'],
    normalizeKey: (v) => String(v ?? '').trim().toLowerCase(),
    asArray: (v) => (Array.isArray(v) ? v : []),
    __exported: null,
  };
  sandbox.getMailboxScopedRuntimeThreads = function () {
    sandbox.derivations += 1;
    return sandbox.currentScope.slice();
  };
  vm.createContext(sandbox);
  vm.runInContext(
    [
      extractPassState(),
      extractFunction('withMailboxScopePass'),
      extractFunction('getMailboxScopedRuntimeThreadsForPass'),
      extractFunction('matchCustomerThread'),
      extractFunction('getRelatedCustomerThreads'),
      `__exported = {
         withMailboxScopePass,
         getMailboxScopedRuntimeThreadsForPass,
         getRelatedCustomerThreads,
       };`,
    ].join('\n'),
    sandbox
  );
  return { api: sandbox.__exported, sandbox };
}

test('inom ett pass härleds scopet en gång, oavsett antal anrop', () => {
  const { api, sandbox } = load();

  api.withMailboxScopePass(() => {
    for (let i = 0; i < 500; i += 1) api.getMailboxScopedRuntimeThreadsForPass();
  });

  assert.equal(sandbox.derivations, 1, '500 anrop ska ge EN härledning');
});

test('utan pass härleds scopet varje gång — oförändrat beteende', () => {
  const { api, sandbox } = load();

  for (let i = 0; i < 5; i += 1) api.getMailboxScopedRuntimeThreadsForPass();

  assert.equal(sandbox.derivations, 5, 'utanför pass ska inget memoiseras');
});

test('resultatet är identiskt med det omemoiserade', () => {
  const { api, sandbox } = load();
  sandbox.currentScope = ['x', 'y', 'z'];

  const utanPass = api.getMailboxScopedRuntimeThreadsForPass();
  const iPass = api.withMailboxScopePass(() => api.getMailboxScopedRuntimeThreadsForPass());

  assert.deepEqual(iPass, utanPass);
  assert.deepEqual(iPass, ['x', 'y', 'z']);
});

test('memot överlever ALDRIG passet — nästa pass ser nytt state', () => {
  const { api, sandbox } = load();

  sandbox.currentScope = ['gammal'];
  const forsta = api.withMailboxScopePass(() => api.getMailboxScopedRuntimeThreadsForPass());
  assert.deepEqual(forsta, ['gammal']);

  // Trådlistan/brevlådevalet ändras mellan passen, som under laddning.
  sandbox.currentScope = ['ny'];
  const andra = api.withMailboxScopePass(() => api.getMailboxScopedRuntimeThreadsForPass());

  assert.deepEqual(andra, ['ny'], 'nytt pass får ALDRIG servera föregående scope');
  assert.equal(sandbox.derivations, 2, 'ett pass = en härledning, två pass = två');
});

test('ett kast inuti passet lämnar inget låst scope kvar', () => {
  const { api, sandbox } = load();

  sandbox.currentScope = ['före'];
  assert.throws(
    () =>
      api.withMailboxScopePass(() => {
        api.getMailboxScopedRuntimeThreadsForPass();
        throw new Error('avsiktligt fel mitt i passet');
      }),
    /avsiktligt fel/
  );

  sandbox.currentScope = ['efter'];
  const efter = api.withMailboxScopePass(() => api.getMailboxScopedRuntimeThreadsForPass());
  assert.deepEqual(efter, ['efter'], 'finally ska ha stängt passet trots kastet');
});

test('nästlade pass — bara det yttersta äger och stänger', () => {
  const { api, sandbox } = load();

  api.withMailboxScopePass(() => {
    api.getMailboxScopedRuntimeThreadsForPass();
    api.withMailboxScopePass(() => {
      api.getMailboxScopedRuntimeThreadsForPass();
    });
    // Det inre passet får inte ha stängt det yttre.
    api.getMailboxScopedRuntimeThreadsForPass();
  });

  assert.equal(sandbox.derivations, 1, 'nästling ska inte ge extra härledningar');
});

test('getRelatedCustomerThreads ger samma svar med och utan pass', () => {
  const { api, sandbox } = load();
  const trådar = [
    { id: '1', customerEmail: 'a@x.se' },
    { id: '2', customerEmail: 'A@X.SE' },
    { id: '3', customerEmail: 'b@x.se' },
    { id: '4', customerName: 'Anna' },
  ];
  sandbox.currentScope = trådar;

  for (const bas of trådar) {
    const utan = api.getRelatedCustomerThreads(bas).map((t) => t.id);
    const med = api.withMailboxScopePass(() =>
      api.getRelatedCustomerThreads(bas).map((t) => t.id)
    );
    assert.deepEqual(med, utan, `tråd ${bas.id} ska matcha identiskt`);
  }
});

test('källnivå-vakt: passet öppnas runt lane-räkningen', () => {
  // Faller detta test har någon tagit bort ORD-83:s enda anropsställe, och
  // O(trådar²)-beteendet är tillbaka utan att ett annat test märker det.
  assert.ok(
    /withMailboxScopePass\(\(\) => \{\s*\/\/ ORD-82/.test(APP),
    'v2:lane_counts ska köra createQueueLaneCounter inuti withMailboxScopePass'
  );
  assert.ok(
    APP.includes('const mailboxScopedThreads = getMailboxScopedRuntimeThreadsForPass();'),
    'getRelatedCustomerThreads ska gå via passvägen'
  );
});
