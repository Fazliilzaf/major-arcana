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
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const end = nextName
    ? source.indexOf(`function ${nextName}`, start)
    : source.indexOf('\n  function ', start + 1);
  assert.notEqual(end, -1, `${name} extraction should have a terminator`);
  return source.slice(start, end);
}

function buildActiveCalendarSearchHarness({
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
    CSS: { escape: (value) => String(value) },
  };
  const script = `
    const v6State = { visits: [{
      bookingId: 'booking-canonical',
      patientId: 'patient-canonical-42',
      patientName: 'Canonical Patient',
      serviceLabel: 'Fysisk konsultation',
      date: '2026-08-03',
      time: '11:00',
      status: 'booked'
    }] };
    function v6SetText(node, text) { if (node) node.textContent = text; }
    function v6Initials(name) { return String(name || '?').slice(0, 2).toUpperCase(); }
    function statusLabel(status) { return status || ''; }
    function v6RenderIntel() {}
    ${extractFunction(shell, 'el', 'timeToMinutes')}
    ${extractFunction(shell, 'openCanonicalPatient', 'detectViewFromUrl')}
    ${extractFunction(shell, 'v6RenderSearch', 'v6BindControls')}
    window.__test = { v6RenderSearch };
  `;
  vm.runInNewContext(script, sandbox);
  window.__test.v6RenderSearch('canonical');

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

test('visible Kalender search smoke guard accepts only visible active /kalender.html results', () => {
  const { window, result } = buildActiveCalendarSearchHarness();

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

test('visible Kalender search smoke guard fails closed when overlay is hidden', () => {
  const { window, result } = buildActiveCalendarSearchHarness({
    overlayClass: 'search-overlay',
    overlayPointerEvents: 'none',
  });

  assert.throws(
    () => assertVisibleSearchResultClickTarget({ document: window.document, result }),
    /search_overlay_not_visible/
  );
});

test('visible Kalender search smoke guard fails closed when pointer-events are blocked', () => {
  const { window, result } = buildActiveCalendarSearchHarness({
    overlayClass: 'search-overlay is-visible',
    overlayPointerEvents: 'none',
  });

  assert.throws(
    () => assertVisibleSearchResultClickTarget({ document: window.document, result }),
    /search_overlay_pointer_events_blocked/
  );
});

test('visible Kalender search smoke guard fails closed when click point hits underlying Morgon', () => {
  const { window, result } = buildActiveCalendarSearchHarness({
    hitTarget: 'underlying-greet',
  });

  assert.throws(
    () => assertVisibleSearchResultClickTarget({ document: window.document, result }),
    /search_result_hit_target_mismatch/
  );
});
