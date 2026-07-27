'use strict';

/**
 * ORD-82 — enpass-räkning i v2:lane_counts.
 *
 * Bakgrund: lane-räkningen filtrerade hela trådlistan en gång per lane, 13
 * gånger. Uppmätt 15 700 ms på 532 trådar i prod — 99,96 % av ett block på
 * 15 707 ms. ORD-82 klassificerar varje tråd EN gång och tallyar räknarna ur
 * den passeringen.
 *
 * Testet kör den GAMLA räkningen (getQueueLaneThreads, en gång per lane) och
 * den NYA (createQueueLaneCounter) mot samma trådlista och jämför lane för
 * lane. Båda funktionerna hämtas ur app.js — ingen kopia i testet.
 *
 * Predikaten stubbas medvetet. Det som ändrats är räknestrukturen, inte
 * klassificeringen, och med stubbade predikat gäller pariteten för GODTYCKLIGT
 * predikatbeteende — inte bara för den kombination produktionsdata råkar ge.
 * Att predikaten är orörda vaktas separat på källnivå i sista testet.
 *
 * Kritiskt fall (ORD-82:s korrekthetskrav): commercial och operation använder
 * sina egna predikat DIREKT, medan getThreadPrimaryLaneId är en kedja där ett
 * tidigare predikat kan vinna. Samma tråd kan därför räknas i commercial OCH i
 * review. En implementation som tallyar allt ur primaryLaneId ger fel siffror.
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

/** Klipper ut en namngiven funktion ur app.js på indentering. */
function extractFunction(name) {
  const start = APP.indexOf(`\n  function ${name}(`);
  assert.ok(start > -1, `${name} ska finnas i app.js`);
  const end = APP.indexOf('\n  }\n', start);
  assert.ok(end > start, `${name} ska vara sluten på toppnivå i IIFE:n`);
  return APP.slice(start, end + '\n  }\n'.length);
}

const LANES = [
  'all', 'act-now', 'sprint', 'later', 'admin', 'review', 'unclear',
  'bookable', 'consultation', 'operation', 'aftercare', 'medical', 'commercial',
];

/**
 * Bygger en sandbox med de två räkningarna ur app.js och stubbade predikat.
 * Varje tråd bär sitt eget facit: { handled, commercial, operation, primary }.
 */
function load() {
  const sandbox = {
    QUEUE_LANE_ORDER: LANES.filter((id) => id !== 'all'),
    asArray: (v) => (Array.isArray(v) ? v : []),
    normalizeKey: (v) => String(v ?? '').trim().toLowerCase(),
    getQueueScopedRuntimeThreads: () => [],
    isHandledRuntimeThread: (t) => Boolean(t && t.handled),
    isCommercialRuntimeThread: (t) => Boolean(t && t.commercial),
    isOperationRuntimeThread: (t) => Boolean(t && t.operation),
    getThreadPrimaryLaneId: (t) => (t && t.primary) || 'all',
    __exported: null,
  };
  vm.createContext(sandbox);
  vm.runInContext(
    [
      extractFunction('normalizePrimaryQueueLaneId'),
      extractFunction('getQueueLaneThreads'),
      extractFunction('createQueueLaneCounter'),
      `__exported = { getQueueLaneThreads, createQueueLaneCounter };`,
    ].join('\n'),
    sandbox
  );
  return sandbox.__exported;
}

/** Gamla vägen: ett filtreringspass per lane. */
const gammalRakning = (api, threads) =>
  Object.fromEntries(LANES.map((id) => [id, api.getQueueLaneThreads(id, threads).length]));

/** Nya vägen: ett pass, tretton tallys. */
const nyRakning = (api, threads) => {
  const count = api.createQueueLaneCounter(threads);
  return Object.fromEntries(LANES.map((id) => [id, count(id)]));
};

const jamforParitet = (threads, vad) => {
  const api = load();
  const gammal = gammalRakning(api, threads);
  const ny = nyRakning(api, threads);
  assert.deepEqual(ny, gammal, `lane-siffrorna ska vara identiska — ${vad}`);
  return gammal;
};

test('paritet: commercial överlappar review — kritiska fallet', () => {
  const threads = [
    // Matchar commercial-predikatet MEN har review som primärlane.
    // Ska räknas i BÅDA. Tallyas allt ur primaryLaneId blir commercial = 0.
    { id: 'a', commercial: true, primary: 'review' },
    { id: 'b', commercial: true, primary: 'review' },
    { id: 'c', primary: 'review' },
  ];
  const siffror = jamforParitet(threads, 'commercial ∩ review');

  assert.equal(siffror.review, 3, 'alla tre har review som primärlane');
  assert.equal(siffror.commercial, 2, 'två matchar commercial-predikatet');
  assert.equal(siffror.all, 3, 'all = antal ohanterade, inte primaryLaneId === all');
});

test('paritet: operation överlappar annan primärlane', () => {
  const threads = [
    { id: 'a', operation: true, primary: 'unclear' },
    { id: 'b', operation: true, primary: 'operation' },
    { id: 'c', primary: 'unclear' },
  ];
  const siffror = jamforParitet(threads, 'operation ∩ unclear');
  assert.equal(siffror.operation, 2);
  assert.equal(siffror.unclear, 2);
});

test('paritet: hanterade trådar räknas inte i någon lane', () => {
  const threads = [
    { id: 'a', handled: true, commercial: true, operation: true, primary: 'review' },
    { id: 'b', primary: 'review' },
  ];
  const siffror = jamforParitet(threads, 'hanterade exkluderas');
  assert.equal(siffror.all, 1);
  assert.equal(siffror.review, 1);
  assert.equal(siffror.commercial, 0, 'hanterad tråd får inte räknas i commercial');
});

test('paritet: tom lista', () => {
  const siffror = jamforParitet([], 'tom lista');
  for (const id of LANES) assert.equal(siffror[id], 0);
});

test('paritet: okänd primärlane hamnar inte i någon räknad lane', () => {
  const threads = [{ id: 'a', primary: 'nagot-obefintligt' }, { id: 'b', primary: 'sprint' }];
  const siffror = jamforParitet(threads, 'okänd primärlane');
  assert.equal(siffror.all, 2, 'räknas ändå som ohanterad');
  assert.equal(siffror.sprint, 1);
});

test('paritet: tomma previews vs fyllda brödtexter ger samma svar från båda', () => {
  // ORD-82 acceptanskriterium 3. Predikaten härleds ur nyttolasten, precis som
  // de äkta gör. Poängen är inte att de två tillstånden ger samma siffror — det
  // gör de inte, och ska inte göra — utan att gammal och ny räkning är eniga i
  // BÅDA tillstånden. Annars vore omstruktureringen nyttolastberoende på ett
  // nytt sätt.
  const bygg = (previews) =>
    previews.map((preview, i) => ({
      id: 'p' + i,
      preview,
      commercial: /pris|offert|betal/.test(preview),
      operation: /operation/.test(preview),
      primary: /granska/.test(preview) ? 'review' : 'all',
    }));

  const tomma = bygg(['', '', '', '']);
  const fyllda = bygg(['pris på behandling', 'granska detta', 'operation nästa vecka', 'hej']);

  const utanText = jamforParitet(tomma, 'tomma previews');
  const medText = jamforParitet(fyllda, 'fyllda brödtexter');

  assert.equal(utanText.commercial, 0);
  assert.equal(medText.commercial, 1);
  assert.equal(medText.review, 1);
  assert.notDeepEqual(utanText, medText, 'nyttolasten ska påverka klassificeringen');
});

test('paritet: slumpad last, 300 trådar × 40 varv', () => {
  const primaries = LANES.slice();
  let frö = 20260726;
  const rnd = () => ((frö = (frö * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  for (let varv = 0; varv < 40; varv += 1) {
    const threads = Array.from({ length: 300 }, (_, i) => ({
      id: 't' + i,
      handled: rnd() < 0.25,
      commercial: rnd() < 0.2,
      operation: rnd() < 0.15,
      primary: primaries[Math.floor(rnd() * primaries.length)],
    }));
    jamforParitet(threads, `slumpvarv ${varv}`);
  }
});

test('ingen cache införd — räknaren lever bara inom anropet', () => {
  const source = extractFunction('createQueueLaneCounter');
  assert.ok(
    !/\bcache\b/i.test(source),
    'ORD-82 förbjuder cache i denna sväng — hittade ordet i källan'
  );
  // Två räknare över samma lista får inte dela tillstånd.
  const api = load();
  const threads = [{ id: 'a', commercial: true, primary: 'review' }];
  const forsta = api.createQueueLaneCounter(threads);
  const andra = api.createQueueLaneCounter([]);
  assert.equal(forsta('commercial'), 1);
  assert.equal(andra('commercial'), 0, 'ny räknare ska inte ärva föregåendes tally');
});

test('lane-reglerna är orörda — källnivå-vakt', () => {
  // ORD-82 är en omstrukturering av HUR MÅNGA GÅNGER klassificeringen körs,
  // inte av VAD den svarar. Faller detta test ska ändringen granskas separat.
  const kvar = extractFunction('getQueueLaneThreads');
  for (const needle of [
    'const activeQueueThreads = threads.filter((thread) => !isHandledRuntimeThread(thread));',
    'if (normalizedLane === "all") {',
    'activeQueueThreads.filter((thread) => isCommercialRuntimeThread(thread))',
    'activeQueueThreads.filter((thread) => isOperationRuntimeThread(thread))',
    'activeQueueThreads.filter((thread) => getThreadPrimaryLaneId(thread) === normalizedLane)',
  ]) {
    assert.ok(kvar.includes(needle), `getQueueLaneThreads ska behålla: ${needle}`);
  }

  // Predikatkedjans ordning i getThreadPrimaryLaneId ska ligga fast.
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
});
