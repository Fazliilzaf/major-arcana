'use strict';

/**
 * ORD-84 — journeyn byggs en gång per tråd och pass.
 *
 * getThreadPrimaryLaneId kör isConsultation → isCommercial → isOperation, och
 * isOperation anropar de två första igen innan den frågar efter modulen. Varje
 * anrop byggde en komplett backbone + journey och kastade den.
 *
 * Uppmätt i prod före fixen: 12,84 och 13,41 journey-bygg per tråd i två
 * lane_counts-pass (489 resp. 573 trådar). Ordern gissade 3–5×.
 *
 * Testet låser fast fem egenskaper:
 *   1. Inom ett pass byggs journeyn EN gång per tråd, oavsett antal anrop.
 *   2. Olika trådar får olika journey — memot blandar dem inte.
 *   3. Utan pass byggs den varje gång, som förut.
 *   4. Memot överlever ALDRIG passet.
 *   5. Ett kast inuti passet lämnar inget memo kvar.
 *
 * Punkt 4 är den säkerhetsrelevanta: trådens innehåll ändras under laddningen,
 * och en kvarliggande journey klassificerar tråden på gammalt underlag.
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

function load() {
  const sandbox = {
    byggen: 0,
    __mailboxScopePass: null,
    normalizeKey: (v) => String(v ?? '').trim().toLowerCase(),
    getRuntimeFocusReadState: () => ({}),
    __exported: null,
  };
  // Stubbad journey-byggare som räknar konstruktioner och märker varje resultat
  // med sin tråd, så testet kan se att rätt journey serveras till rätt tråd.
  sandbox.getPreviewPatient360JourneyForThread = function (thread) {
    sandbox.byggen += 1;
    return { journey: { activeModule: { id: thread && thread.modul } }, forTrad: thread };
  };
  vm.createContext(sandbox);
  vm.runInContext(
    [
      '  let __mailboxScopePass = null;',
      extractFunction('withMailboxScopePass'),
      extractFunction('getThreadJourneyForPass'),
      extractFunction('getThreadJourneyActiveModuleId'),
      `__exported = { withMailboxScopePass, getThreadJourneyForPass, getThreadJourneyActiveModuleId };`,
    ].join('\n'),
    sandbox
  );
  return { api: sandbox.__exported, sandbox };
}

const tråd = (modul) => ({ modul, id: 't-' + modul });

test('inom ett pass byggs journeyn en gång per tråd', () => {
  const { api, sandbox } = load();
  const t = tråd('commercial');

  api.withMailboxScopePass(() => {
    for (let i = 0; i < 13; i += 1) api.getThreadJourneyActiveModuleId(t);
  });

  assert.equal(sandbox.byggen, 1, '13 anrop — som i predikatkedjan — ska ge ETT bygge');
});

test('olika trådar får sin egen journey — memot blandar dem inte', () => {
  const { api, sandbox } = load();
  const a = tråd('commercial');
  const b = tråd('consultation');

  const svar = api.withMailboxScopePass(() => {
    const first = [];
    for (let i = 0; i < 5; i += 1) {
      first.push(api.getThreadJourneyActiveModuleId(a));
      first.push(api.getThreadJourneyActiveModuleId(b));
    }
    return first;
  });

  assert.equal(sandbox.byggen, 2, 'två trådar → två byggen');
  assert.deepEqual(new Set(svar), new Set(['commercial', 'consultation']));
  // Rätt journey till rätt tråd, inte bara rätt antal.
  const { api: api2 } = load();
  api2.withMailboxScopePass(() => {
    assert.equal(api2.getThreadJourneyForPass(a, {}).forTrad, a);
    assert.equal(api2.getThreadJourneyForPass(b, {}).forTrad, b);
  });
});

test('utan pass byggs journeyn varje gång — oförändrat beteende', () => {
  const { api, sandbox } = load();
  const t = tråd('operation');

  for (let i = 0; i < 4; i += 1) api.getThreadJourneyActiveModuleId(t);

  assert.equal(sandbox.byggen, 4, 'utanför pass ska inget memoiseras');
});

test('memot överlever ALDRIG passet', () => {
  const { api, sandbox } = load();
  const t = tråd('commercial');

  api.withMailboxScopePass(() => api.getThreadJourneyActiveModuleId(t));
  assert.equal(sandbox.byggen, 1);

  // Innehållet ändras mellan passen, som under laddning.
  t.modul = 'operation';
  const andra = api.withMailboxScopePass(() => api.getThreadJourneyActiveModuleId(t));

  assert.equal(sandbox.byggen, 2, 'nytt pass ska bygga om, inte servera gammalt');
  assert.equal(andra, 'operation', 'nytt pass ska se det nya innehållet');
});

test('ett kast inuti passet lämnar inget memo kvar', () => {
  const { api, sandbox } = load();
  const t = tråd('commercial');

  assert.throws(
    () =>
      api.withMailboxScopePass(() => {
        api.getThreadJourneyActiveModuleId(t);
        throw new Error('avsiktligt fel mitt i passet');
      }),
    /avsiktligt fel/
  );

  t.modul = 'consultation';
  const efter = api.withMailboxScopePass(() => api.getThreadJourneyActiveModuleId(t));
  assert.equal(efter, 'consultation', 'finally ska ha stängt passet trots kastet');
  assert.equal(sandbox.byggen, 2);
});

test('nästlade pass — bara det yttersta äger memot', () => {
  const { api, sandbox } = load();
  const t = tråd('commercial');

  api.withMailboxScopePass(() => {
    api.getThreadJourneyActiveModuleId(t);
    api.withMailboxScopePass(() => api.getThreadJourneyActiveModuleId(t));
    api.getThreadJourneyActiveModuleId(t);
  });

  assert.equal(sandbox.byggen, 1, 'nästling ska inte ge extra byggen');
});

test('källnivå-vakt: predikatkedjan och dess nästling är orörd', () => {
  // ORD-84 ändrar HUR MÅNGA GÅNGER journeyn byggs, inte VAD predikaten svarar.
  const kedja = extractFunction('getThreadPrimaryLaneId');
  const ordning = ['isManualReviewRuntimeThread', 'isUnclearRuntimeThread',
    'isAftercareRuntimeThread', 'isConsultationRuntimeThread',
    'isCommercialRuntimeThread', 'isOperationRuntimeThread'];
  let pos = -1;
  for (const namn of ordning) {
    const i = kedja.indexOf(namn);
    assert.ok(i > pos, `${namn} ska ligga kvar i kedjan, i oförändrad ordning`);
    pos = i;
  }
  // isOperation ska fortfarande anropa sina syskon först — slösaktigt, men
  // uttryckligen utanför ORD-84:s scope.
  const op = extractFunction('isOperationRuntimeThread');
  assert.ok(op.includes('isConsultationRuntimeThread'), 'nästlingen ska vara orörd');
  assert.ok(op.includes('isCommercialRuntimeThread'), 'nästlingen ska vara orörd');

  // getPreviewPatient360JourneyForThread lämnas orörd — den har andra anropare.
  assert.ok(
    APP.includes('function getPreviewPatient360JourneyForThread(thread, focusReadState = {}) {'),
    'den delade byggaren ska ha oförändrad signatur'
  );
  assert.ok(
    APP.includes('getThreadJourneyForPass(thread, focusReadState)?.journey?.activeModule?.id'),
    'getThreadJourneyActiveModuleId ska gå via passvägen'
  );
});
