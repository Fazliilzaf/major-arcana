'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');

const {
  assertVisibleSearchResultClickTarget,
} = require('../../scripts/calendar-visible-search-click-guard');

const repoRoot = path.join(__dirname, '../..');

function extractFunction(source, name, nextName) {
  const asyncStart = source.indexOf(`async function ${name}`);
  const start = asyncStart === -1 ? source.indexOf(`function ${name}`) : asyncStart;
  assert.notEqual(start, -1, `${name} should exist`);
  const nextAsyncStart = nextName ? source.indexOf(`async function ${nextName}`, start) : -1;
  const nextPlainStart = nextName ? source.indexOf(`function ${nextName}`, start) : -1;
  const nextStart =
    nextAsyncStart !== -1 && (nextPlainStart === -1 || nextAsyncStart < nextPlainStart)
      ? nextAsyncStart
      : nextPlainStart;
  const end = nextName
    ? nextStart
    : source.indexOf('\n  function ', start + 1);
  assert.notEqual(end, -1, `${name} extraction should have a terminator`);
  return source.slice(start, end);
}

async function buildActiveCalendarSearchHarness({
  overlayClass = 'search-overlay is-visible',
  overlayPointerEvents = 'auto',
  hitTarget = 'result-child',
} = {}) {
  const html = fs.readFileSync(path.join(repoRoot, 'public/kalender.html'), 'utf8');
  const shell = fs.readFileSync(path.join(repoRoot, 'public/cco-kalender-shell.js'), 'utf8');
  assert.match(html, /<script src="\/cco-kalender-shell\.js\?v=20260717i" defer><\/script>/);
  assert.doesNotMatch(html, /major-arcana-preview\/app\/cco-calendar-v8-shell\.js/);

  const { window } = parseHTML(`
    <main>
      <section class="greet">Underliggande Morgon-yta</section>
      <div id="searchOverlay" class="${overlayClass}"></div>
      <div id="searchPanelKicker"></div>
      <div id="searchPanelList"></div>
      <button class="booking" data-booking-id="booking-canonical"></button>
    </main>
  `);
  window.location = { origin: 'https://arcana.example' };
  window.parent = { postMessage() {} };
  window.getComputedStyle = (node) => ({
    pointerEvents: node?.id === 'searchOverlay' ? overlayPointerEvents : 'auto',
  });

  const sandbox = {
    window,
    document: window.document,
    console,
    URLSearchParams,
    CSS: { escape: (value) => String(value) },
    fetch: async (url, options = {}) => {
      assert.match(String(url), /\/api\/v1\/cco-bookings\/history-search/);
      assert.equal(options.credentials, 'same-origin');
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            readOnly: true,
            zeroWrites: true,
            rows: [{
              bookingId: 'booking-canonical',
              patientId: 'patient-canonical-42',
              patientName: 'Canonical Patient',
              serviceDisplayName: 'Fysisk konsultation',
              startsAt: '2026-08-03T09:00:00.000Z',
              status: 'booked',
            }],
            pagination: { total: 1, limit: 30, offset: 0, returned: 1 },
          };
        },
      };
    },
  };
  const script = `
    const global = window;
    const v6State = { visits: [] };
    function calendarHeaders() { return { Authorization: 'Bearer runtime-token' }; }
    function v6SetText(node, text) { if (node) node.textContent = text; }
    function v6Initials(name) { return String(name || '?').slice(0, 2).toUpperCase(); }
    function statusLabel(status) { return status || ''; }
    function v6RenderIntel() {}
    ${extractFunction(shell, 'el', 'timeToMinutes')}
    ${extractFunction(shell, 'stockholmParts', 'canonicalVisitToSlot')}
    ${extractFunction(shell, 'openCanonicalPatient', 'detectViewFromUrl')}
    ${extractFunction(shell, 'historySearchRowToV6Slot', 'fetchV6HistorySearchRows')}
    ${extractFunction(shell, 'fetchV6HistorySearchRows', 'v6RenderSearch')}
    ${extractFunction(shell, 'v6RenderSearch', 'v6BindControls')}
    window.__test = { v6RenderSearch };
  `;
  vm.runInNewContext(script, sandbox);
  await window.__test.v6RenderSearch('canonical');

  const result = window.document.querySelector('.search-result');
  assert.ok(result);
  Object.defineProperty(result, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 100, top: 50, width: 240, height: 40 }),
  });

  const child = result.querySelector('small');
  const greet = window.document.querySelector('.greet');
  window.document.elementFromPoint = () => {
    if (hitTarget === 'underlying-greet') return greet;
    if (hitTarget === 'result') return result;
    return child;
  };

  return { window, result };
}

test('visible Kalender search smoke guard accepts only visible active /kalender.html results', async () => {
  const { window, result } = await buildActiveCalendarSearchHarness();

  const guard = assertVisibleSearchResultClickTarget({
    document: window.document,
    result,
  });

  assert.equal(guard.ok, true);
  assert.deepEqual(guard.clickPoint, { x: 220, y: 70 });
  assert.equal(guard.patientId, 'patient-canonical-42');
  assert.equal(guard.bookingId, 'booking-canonical');
  assert.equal(guard.readOnly, '0');
});

test('visible Kalender search smoke guard fails closed when overlay is hidden', async () => {
  const { window, result } = await buildActiveCalendarSearchHarness({
    overlayClass: 'search-overlay',
    overlayPointerEvents: 'none',
  });

  assert.throws(
    () => assertVisibleSearchResultClickTarget({ document: window.document, result }),
    /search_overlay_not_visible/
  );
});

test('visible Kalender search smoke guard fails closed when pointer-events are blocked', async () => {
  const { window, result } = await buildActiveCalendarSearchHarness({
    overlayClass: 'search-overlay is-visible',
    overlayPointerEvents: 'none',
  });

  assert.throws(
    () => assertVisibleSearchResultClickTarget({ document: window.document, result }),
    /search_overlay_pointer_events_blocked/
  );
});

test('visible Kalender search smoke guard fails closed when click point hits underlying Morgon', async () => {
  const { window, result } = await buildActiveCalendarSearchHarness({
    hitTarget: 'underlying-greet',
  });

  assert.throws(
    () => assertVisibleSearchResultClickTarget({ document: window.document, result }),
    /search_result_hit_target_mismatch/
  );
});
