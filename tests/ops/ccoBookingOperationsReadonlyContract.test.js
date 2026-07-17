const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function routeBlock(source, route) {
  const start = source.indexOf(`router.post('${route}'`);
  assert.notEqual(start, -1, `Missing route ${route}`);
  const next = source.indexOf('\n  router.', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

test('operational booking contract is fail-closed and zero-write', () => {
  const contract = JSON.parse(read('docs/strategy/cco-booking-operations-readonly-contract.json'));

  assert.equal(contract.zeroWrites, true);
  assert.equal(contract.activeSurface.path, '/admin#cco');
  assert.equal(contract.activeSurface.calendarReadOnly, true);
  assert.equal(contract.activeSurface.writeBridgeDisabled, true);
  assert.equal(contract.providers.cliento.mutationCapability, 'absent');
  assert.deepEqual(contract.providers.cliento.writeMethods, []);
  assert.equal(contract.recommendedFirstFlow.mode, 'read_only');
  assert.deepEqual(
    Object.values(contract.actions).map((action) => action.releaseGate),
    ['blocked', 'blocked', 'blocked']
  );
});

test('Cliento adapter remains read-only with no create, move or cancel method', () => {
  const source = read('src/infra/clientoApi.js');

  assert.match(source, /method: 'GET'/);
  assert.doesNotMatch(source, /\b(createBooking|confirmBooking|rebookBooking|cancelBooking)\s*\(/);
});

test('active admin Calendar keeps every write surface disabled', () => {
  const html = read('public/kalender.html');
  const bridge = read('public/cco-kalender-bridge.js');
  const shell = read('public/cco-kalender-shell.js');

  assert.match(html, /window\.CCO_CALENDAR_READ_ONLY = true/);
  assert.match(bridge, /CCO_CALENDAR_READ_ONLY === true/);
  assert.match(bridge, /write bridge disabled/);
  assert.match(shell, /global\.CcoKalenderShell = isReadOnlyMode\(\)/);
  assert.doesNotMatch(
    shell.slice(shell.indexOf('global.CcoKalenderShell = isReadOnlyMode()')),
    /rebook|cancel|confirmBooking/
  );
});

test('legacy mutation gaps stay isolated while controlled create is permissioned and audited', () => {
  const engineRoutes = read('src/routes/ccoBookingEngine.js');
  const calendarRoutes = read('src/routes/ccoBookings.js');

  for (const route of [
    '/cco-booking-engine/reservations',
    '/cco-booking-engine/confirm',
    '/cco-booking-engine/cancel',
    '/cco-booking-engine/rebook',
  ]) {
    const block = routeBlock(engineRoutes, route);
    assert.match(block, /requireBookingContext\(context\)/);
    assert.doesNotMatch(block, /requireStaffRole\(context\)/);
    assert.doesNotMatch(block, /x-idempotency-key|appendStrictAudit/);
  }

  assert.match(
    routeBlock(calendarRoutes, '/cco-bookings/calendar/rebook'),
    /requireStaffRole\(context\)/
  );
  const preflight = routeBlock(engineRoutes, '/cco-booking-engine/create/preflight');
  const confirm = routeBlock(engineRoutes, '/cco-booking-engine/create/confirm');
  assert.match(engineRoutes, /requireBookingWrite\(context\)/);
  assert.match(engineRoutes, /x-idempotency-key/);
  assert.match(confirm, /reserveAndConfirmIdempotent/);
  assert.match(confirm, /appendStrictAudit/);
  assert.doesNotMatch(preflight, /reserveSlots|confirmBooking|reserveAndConfirmIdempotent/);
});

test('move remains a non-atomic cancel-reserve-confirm sequence', () => {
  const source = read('src/ops/ccoBookingEngineStore.js');
  const start = source.indexOf('async function rebookBooking');
  const end = source.indexOf('async function getCaseSummary', start);
  const block = source.slice(start, end);

  const cancel = block.indexOf('await cancelBooking');
  const reserve = block.indexOf('await reserveSlots');
  const confirm = block.indexOf('await confirmBooking');
  assert.ok(cancel >= 0 && reserve > cancel && confirm > reserve);
  assert.doesNotMatch(block, /compensat|rollback|restore/i);
});
