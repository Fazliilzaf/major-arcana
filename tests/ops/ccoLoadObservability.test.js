'use strict';

/**
 * Avgränsat test för den tillfälliga laddningsdiagnostiken.
 *
 * Diagnostiken finns för att avgöra VAR tiden går när mailbox-scopet vidgas
 * (3→4, 3→9): nätverk, payload-merge, legacy-shell eller V2-state. Testet
 * låser fast de tre egenskaper som gör den säker att ha i produktion:
 *
 *   1. Den är AVSTÄNGD som default (opt-in via ?ccoPerf=1 / localStorage).
 *   2. Den är PII-fri — endast fasnamn, millisekunder och numeriska antal.
 *   3. Den ändrar inte beteendet hos koden den mäter (retur och kast bevaras).
 *
 * Samt att mätpunkterna faktiskt sitter kvar på de ställen vi ska mäta.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PREVIEW = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview');
const APP = fs.readFileSync(path.join(PREVIEW, 'app.js'), 'utf8');
const RUNTIME = fs.readFileSync(path.join(PREVIEW, 'runtime-dom-live-composition.js'), 'utf8');

/**
 * Kör recorder-IIFE:n isolerat med en stubbad window, så testet kan mäta dess
 * beteende utan att ladda hela app.js.
 */
const CCO_PERF_CONSTS = (() => {
  const start = APP.indexOf('const CCO_PERF_PHASES = [');
  const end = APP.indexOf('];', APP.indexOf('const CCO_PERF_COUNT_KEYS = [')) + 2;
  assert.ok(start > -1 && end > start, 'allowlistorna ska finnas i app.js');
  return APP.slice(start, end);
})();

function loadRecorder({ search = '', lsValue = null } = {}) {
  const start = APP.indexOf('const __ccoPerf = (() => {');
  assert.ok(start > -1, '__ccoPerf-recordern ska finnas i app.js');
  const end = APP.indexOf('\n  })();', start);
  assert.ok(end > -1, 'recordern ska vara en sluten IIFE');
  const source = APP.slice(start, end + '\n  })();'.length);

  const observed = [];
  // Styrbar klocka så att fas-intervall (start/end) kan sättas exakt i test.
  const clock = { value: 0 };
  // Fångar longtask-observerns callback så testet kan mata in riktiga
  // PerformanceEntry-lika poster och verifiera attribueringen.
  const observerHolder = { cb: null };
  const sandbox = {
    window: {
      location: { search },
      localStorage: { getItem: () => lsValue },
    },
    performance: { now: () => clock.value },
    PerformanceObserver: class {
      constructor(cb) {
        observerHolder.cb = cb;
      }
      observe() {
        observed.push('observed');
      }
    },
    console: { table() {} },
    URLSearchParams,
    Number,
    Object,
    Math,
    String,
  };
  vm.runInNewContext(
    `${CCO_PERF_CONSTS}\n${source}\n;this.result = __ccoPerf;`,
    sandbox
  );
  sandbox.result.__clock = clock;
  sandbox.result.__emitLongTask = (startTime, duration) => {
    if (!observerHolder.cb) throw new Error('longtask-observern registrerades aldrig');
    observerHolder.cb({ getEntries: () => [{ startTime, duration }] });
  };
  return sandbox.result;
}

test('diagnostiken är avstängd som default (ingen kostnad i produktion)', () => {
  const perf = loadRecorder();
  assert.equal(perf.enabled, false, 'utan flagga ska den vara av');

  perf.record('select:mailbox_scope_sync', 1234, { threads: 900 });
  assert.equal(perf.entries.length, 0, 'avstängd får inte samla poster');
});

test('diagnostiken slås på via ?ccoPerf=1 respektive localStorage', () => {
  assert.equal(loadRecorder({ search: '?ccoPerf=1' }).enabled, true);
  assert.equal(loadRecorder({ lsValue: '1' }).enabled, true);
  assert.equal(loadRecorder({ lsValue: '0' }).enabled, false);
});

test('PII filtreras bort ur både count-nycklar och fasnamn (allowlist)', () => {
  const perf = loadRecorder({ search: '?ccoPerf=1' });
  // Försök smuggla in adresser/ämnen via BÅDE counts-nycklar och fasnamn.
  perf.record('apply:truth_payload', 42, {
    rows: 120,
    customerEmail: 'patient@hairtpclinic.com',
    subject: 'Boka PRP-behandling',
    'fazli@hairtpclinic.com': 5,
  });
  perf.record('kund: patient@hairtpclinic.com — Boka PRP', 10, { threads: 3 });

  const entries = perf.entries;
  assert.equal(entries.length, 2);

  // Allowlistade räknare behålls, allt annat faller bort.
  assert.equal(entries[0].rows, 120);
  assert.equal('customerEmail' in entries[0], false, 'okänd nyckel får inte lagras');
  assert.equal('subject' in entries[0], false, 'ämnen får inte lagras');
  assert.equal(
    'fazli@hairtpclinic.com' in entries[0],
    false,
    'PII i NYCKELN får inte lagras — även med numeriskt värde'
  );

  // Okänt fasnamn kollapsar till "other" i stället för att lagras som fritext.
  assert.equal(entries[1].phase, 'other', 'okänt fasnamn ska kollapsa till "other"');

  const serialized = JSON.stringify(entries);
  assert.equal(serialized.includes('@'), false, 'ingen post får innehålla e-postadress');
  assert.equal(serialized.includes('PRP'), false, 'ingen post får innehålla ämnesinnehåll');
});

test('time() bevarar returvärde och kast (mätningen ändrar inte beteendet)', () => {
  const perf = loadRecorder({ search: '?ccoPerf=1' });

  assert.equal(
    perf.time('shell:paint_queue', () => 'oförändrat returvärde'),
    'oförändrat returvärde'
  );

  assert.throws(
    () =>
      perf.time('apply:truth_payload', () => {
        throw new Error('fel ska propagera');
      }),
    /fel ska propagera/
  );
  // Även den kastande körningen ska ha mätts (finally-blocket).
  assert.equal(
    perf.entries.some((entry) => entry.phase === 'apply:truth_payload'),
    true
  );
});

test('summary() aggregerar per fas för avläsning', () => {
  const perf = loadRecorder({ search: '?ccoPerf=1' });
  perf.record('fetch:worklist_chunk', 800, { mailboxes: 2 });
  perf.record('fetch:worklist_chunk', 1200, { mailboxes: 2 });
  perf.record('longtask', 300);

  const summary = perf.summary();
  assert.equal(summary['fetch:worklist_chunk'].calls, 2);
  assert.equal(summary['fetch:worklist_chunk'].totalMs, 2000);
  assert.equal(summary['fetch:worklist_chunk'].maxMs, 1200);
  assert.equal(summary.longtask.calls, 1);
});

test('mätpunkterna sitter kvar på de ställen vi ska mäta', () => {
  // Long tasks är det enda som kan BEVISA en blockerad main-tråd.
  assert.match(APP, /entryTypes:\s*\["longtask"\]/, 'longtask-observer ska finnas');

  // V2-sidan: skalets render och lane-counts (flera fulla pass).
  assert.match(APP, /__ccoPerf\.time\(\s*"v2:shell_render"/);
  assert.match(APP, /"v2:lane_counts"/);

  // Laddningssidan: mailbox-valet, varje chunk, merge och apply, samt paint.
  assert.match(RUNTIME, /"select:mailbox_scope_sync"/);
  assert.match(RUNTIME, /"fetch:worklist_chunk"/);
  assert.match(RUNTIME, /"merge:worklist_chunks"/);
  assert.match(RUNTIME, /"apply:truth_payload"/);
  // paintRuntimeShell mäter bara SCHEMALÄGGNINGEN; den faktiska målningen
  // mäts i flush-callbacken i app.js. Båda måste finnas.
  assert.match(RUNTIME, /"shell:schedule_"/);
  assert.doesNotMatch(RUNTIME, /"shell:paint_"/, 'det missvisande paint-namnet ska vara borta');
  assert.match(APP, /__ccoPerf\.time\(\s*"shell:flush_render"/);
  assert.match(
    APP,
    /function flushScheduledRuntimeConversationShell\(\)[\s\S]{0,400}shell:flush_render/,
    'flush-callbacken ska vara instrumenterad — det är där målningen sker'
  );
});

test('runtime-modulen mäter utan att kräva att recordern finns (no-op-säker)', () => {
  const start = RUNTIME.indexOf('function perfTime(phase, fn, counts) {');
  assert.ok(start > -1, 'perfTime-hjälparen ska finnas');
  const source = RUNTIME.slice(start, RUNTIME.indexOf('\n    }', start) + '\n    }'.length);

  // Utan __ccoPerf på window ska anropet ändå returnera funktionens värde.
  const sandbox = { windowObject: {} };
  vm.runInNewContext(`${source}\nthis.result = perfTime('x', () => 'kördes ändå');`, sandbox);
  assert.equal(sandbox.result, 'kördes ändå');
});

test('long tasks attribueras till den fas de överlappar (svarar på huvudfrågan)', () => {
  const perf = loadRecorder({ search: '?ccoPerf=1' });
  const clock = perf.__clock;

  // Fas A: 0–20ms (billig). Fas B: 100–900ms (dyr).
  clock.value = 0;
  perf.time('merge:worklist_chunks', () => {
    clock.value = 20;
  });
  clock.value = 100;
  perf.time('apply:truth_payload', () => {
    clock.value = 900;
  });

  // Fasintervallen måste finnas — utan start/end går attribuering inte alls.
  const phases = perf.entries.filter((entry) => entry.phase !== 'longtask');
  assert.equal(phases[0].start, 0);
  assert.equal(phases[0].end, 20);
  assert.equal(phases[1].start, 100);
  assert.equal(phases[1].end, 900);

  // En riktig long task 200–800ms ligger helt inuti fas B → observern ska
  // attribuera den dit, inte till fas A.
  clock.value = 900;
  perf.__emitLongTask(200, 600);

  const longTasks = perf.entries.filter((entry) => entry.phase === 'longtask');
  assert.equal(longTasks.length, 1);
  assert.equal(
    longTasks[0].attributedTo,
    'apply:truth_payload',
    'long task ska kopplas till den fas den överlappar mest'
  );
  assert.equal(longTasks[0].overlapMs, 600);

  // Tidslinjen är kronologisk och maskerad (endast fas/tid/antal).
  assert.equal(
    perf
      .timeline()
      .map((entry) => entry.phase)
      .join(','),
    'merge:worklist_chunks,apply:truth_payload,longtask'
  );
  assert.equal(JSON.stringify(perf.timeline()).includes('@'), false);
});

test('longTasks() summerar blockerad main-tråd per fas', () => {
  const perf = loadRecorder({ search: '?ccoPerf=1' });
  const blocking = perf.record('longtask', 700, null, 0);
  blocking.attributedTo = 'apply:truth_payload';
  const smaller = perf.record('longtask', 120, null, 800);
  smaller.attributedTo = 'apply:truth_payload';

  const byPhase = perf.longTasks();
  assert.equal(byPhase['apply:truth_payload'].blockingTasks, 2);
  assert.equal(byPhase['apply:truth_payload'].totalBlockedMs, 820);
  assert.equal(byPhase['apply:truth_payload'].longestMs, 700);
});
