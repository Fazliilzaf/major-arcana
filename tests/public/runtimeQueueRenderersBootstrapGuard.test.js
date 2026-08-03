'use strict';

/**
 * INTERVALL-LÄCKA + SAKNAD IN-FLIGHT-SPÄRR I KUNDNAMNS-RESOLVERN.
 *
 * `runtime-queue-renderers.js` registrerade `setInterval(60000)` i en IIFE på
 * modulnivå, utan spärr mot dubbelregistrering och utan ett enda
 * `clearInterval` i filen. Modulen ligger i BÅDE `app.bundle` och
 * `app.bundle.staff-core`, så en vy som laddar båda fick två intervall som
 * aldrig städades.
 *
 * Varje tick anropar `/api/v1/cco/runtime/worklist/consumer`, vilket på
 * servern är en kall shard-läsning (`cold_timing`, dataReadMs upp till
 * 1,6 s). Med `maxLoadedShards = 2` mot åtta brevlådor blir samtidiga anrop
 * shard-thrash — i produktion sågs samma fråga 43 gånger på tio sekunder,
 * följt av ett RSS-hopp på 2,3 GB.
 *
 * Testet kör modulkällan TVÅ gånger i samma fönster, precis som två bundles
 * gör, och kräver att andra körningen är en no-op.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseHTML } = require('linkedom');

const MODULE_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-queue-renderers.js'
);
const source = fs.readFileSync(MODULE_PATH, 'utf8');

/**
 * Riktig DOM via linkedom (samma som ccoConversationsV2Shell.smoke), men med
 * timers, fetch och localStorage instrumenterade så vi kan räkna dem.
 */
function createHarness({ token = 'test-token' } = {}) {
  const calls = { fetch: [], intervals: [], cleared: [], unloadHandlers: [] };
  let intervalSeq = 0;

  const dom = parseHTML('<!doctype html><html><body></body></html>');
  const { window: windowStub, document: documentStub } = dom;

  windowStub.localStorage = {
    getItem: (key) => (key === 'ARCANA_ADMIN_TOKEN' ? token : null),
    setItem: () => {},
    removeItem: () => {},
  };
  windowStub.matchMedia = () => ({ matches: false, addEventListener() {} });
  // linkedom saknar MutationObserver; modulens andra bootstrap
  // (bootstrapMailboxCounts) använder den.
  windowStub.MutationObserver = class {
    observe() {}
    disconnect() {}
  };

  windowStub.setInterval = (fn, ms) => {
    intervalSeq += 1;
    calls.intervals.push({ id: intervalSeq, ms, fn });
    return intervalSeq;
  };
  windowStub.clearInterval = (id) => {
    calls.cleared.push(id);
  };
  windowStub.setTimeout = () => 0;
  windowStub.clearTimeout = () => {};
  windowStub.fetch = async (url) => {
    calls.fetch.push(String(url));
    return { ok: true, json: async () => ({ rows: [] }) };
  };

  return { calls, windowStub, documentStub };
}

function runModule(harness) {
  const { windowStub, documentStub } = harness;
  // Modulen är en IIFE som läser bara globaler — vi skuggar dem som argument.
  const runner = new Function(
    'window',
    'globalThis',
    'document',
    'localStorage',
    'fetch',
    'setInterval',
    'clearInterval',
    'setTimeout',
    'clearTimeout',
    'MutationObserver',
    source
  );
  runner(
    windowStub,
    windowStub,
    documentStub,
    windowStub.localStorage,
    windowStub.fetch,
    windowStub.setInterval,
    windowStub.clearInterval,
    windowStub.setTimeout,
    windowStub.clearTimeout,
    windowStub.MutationObserver
  );
}

// Bootstrapen är asynkron och hoppar över flera microtask-led innan
// setInterval hinner registreras.
async function flush() {
  for (let i = 0; i < 30; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

// Filen har TVÅ pollare: bootstrapCustomerNameResolver och
// bootstrapMailboxCounts. Båda var oskyddade, båda träffar
// worklist/consumer.
const POLLARE = 2;

test('modulen registrerar inga extra intervall när den laddas två gånger', async () => {
  const harness = createHarness();
  runModule(harness);
  await flush();
  const efterForsta = harness.calls.intervals.length;
  runModule(harness);
  await flush();

  assert.equal(efterForsta, POLLARE, 'en laddning ska ge exakt en pollare vardera');
  assert.equal(
    harness.calls.intervals.length,
    POLLARE,
    'andra bundle-laddningen ska inte registrera nya intervall'
  );
  harness.calls.intervals.forEach((entry) => assert.equal(entry.ms, 60000));
});

test('bootstrap-hämtningen sker bara en gång vid dubbel laddning', async () => {
  const harness = createHarness();
  runModule(harness);
  await flush();
  const efterForsta = harness.calls.fetch.length;
  runModule(harness);
  await flush();

  assert.equal(
    harness.calls.fetch.length,
    efterForsta,
    'andra laddningen ska inte göra en till kall shard-läsning'
  );
});

test('båda intervallen städas vid pagehide — filen hade tidigare noll clearInterval', async () => {
  const harness = createHarness();
  runModule(harness);
  await flush();

  assert.equal(harness.calls.cleared.length, 0, 'inget ska städas innan sidan lämnas');

  // Skickar ett riktigt event i stället för att fånga lyssnaren — det är
  // beteendet som spelar roll, inte hur den registrerades.
  harness.windowStub.dispatchEvent(new harness.windowStub.Event('pagehide'));

  assert.deepEqual(
    harness.calls.cleared.slice().sort(),
    harness.calls.intervals.map((entry) => entry.id).sort(),
    'exakt de registrerade intervallen ska avregistreras'
  );
});

test('in-flight-spärr: samtidiga anrop ger EN nätverksfråga', async () => {
  const harness = createHarness();
  runModule(harness);
  await flush();
  const baseline = harness.calls.fetch.length;

  const resolver = harness.windowStub.MajorArcanaCustomerNameResolver;
  assert.ok(resolver, 'modulen ska exponera MajorArcanaCustomerNameResolver');

  await Promise.all(Array.from({ length: 10 }, () => resolver.refetch()));

  assert.equal(
    harness.calls.fetch.length - baseline,
    1,
    'tio samtidiga refetch ska koalesceras till en enda fråga'
  );
});

test('spärren släpper efter avslutad hämtning — nästa tick får hämta igen', async () => {
  const harness = createHarness();
  runModule(harness);
  await flush();
  const resolver = harness.windowStub.MajorArcanaCustomerNameResolver;

  const baseline = harness.calls.fetch.length;
  await resolver.refetch();
  await resolver.refetch();

  assert.equal(
    harness.calls.fetch.length - baseline,
    2,
    'sekventiella anrop ska inte blockeras — spärren gäller bara samtidighet'
  );
});
