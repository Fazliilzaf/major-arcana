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
function loadRecorder({ search = '', lsValue = null } = {}) {
  const start = APP.indexOf('const __ccoPerf = (() => {');
  assert.ok(start > -1, '__ccoPerf-recordern ska finnas i app.js');
  const end = APP.indexOf('\n  })();', start);
  assert.ok(end > -1, 'recordern ska vara en sluten IIFE');
  const source = APP.slice(start, end + '\n  })();'.length);

  const observed = [];
  const sandbox = {
    window: {
      location: { search },
      localStorage: { getItem: () => lsValue },
    },
    performance: { now: () => observed.length * 7 },
    PerformanceObserver: class {
      constructor(cb) {
        this.cb = cb;
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
  vm.runInNewContext(`${source}\n;this.result = __ccoPerf;`, sandbox);
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

test('endast fasnamn, ms och numeriska antal registreras — aldrig PII', () => {
  const perf = loadRecorder({ search: '?ccoPerf=1' });
  // Försök smuggla in adresser/ämnen via counts-objektet.
  perf.record('apply:truth_payload', 42, {
    rows: 120,
    customerEmail: 'patient@hairtpclinic.com',
    subject: 'Boka PRP-behandling',
    mailbox: 'fazli@hairtpclinic.com',
  });

  assert.equal(perf.entries.length, 1);
  const entry = perf.entries[0];
  assert.equal(entry.rows, 120, 'numeriska antal ska behållas');
  assert.equal('customerEmail' in entry, false, 'fritext får inte lagras');
  assert.equal('subject' in entry, false, 'ämnen får inte lagras');
  assert.equal('mailbox' in entry, false, 'adresser får inte lagras');

  const serialized = JSON.stringify(perf.entries);
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
  assert.match(RUNTIME, /"shell:paint_"/);
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
