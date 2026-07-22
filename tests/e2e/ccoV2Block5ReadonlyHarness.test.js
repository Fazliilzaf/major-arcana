'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HARNESS_PATH = path.join(__dirname, 'cco-v2-block5-readonly-harness.js');
const {
  assertApprovedRun,
  installReadOnlyGuard,
  isExplicitSafeSameOriginWrite,
  isSameOriginWrite,
  mask,
  SAFE_SAME_ORIGIN_WRITES,
} = require('./cco-v2-block5-readonly-harness');

test('Block 5-harnessen känner igen enbart same-origin-skrivningar', () => {
  assert.equal(
    isSameOriginWrite(
      'https://arcana.hairtpclinic.com/api/v1/cco/runtime/sync',
      'POST',
      'https://arcana.hairtpclinic.com'
    ),
    true
  );
  assert.equal(
    isSameOriginWrite(
      'https://arcana.hairtpclinic.com/api/v1/cco/runtime/worklist',
      'GET',
      'https://arcana.hairtpclinic.com'
    ),
    false
  );
  assert.equal(
    isSameOriginWrite('https://example.test/api', 'PATCH', 'https://arcana.hairtpclinic.com'),
    false
  );
});

test('Block 5-harnessen kräver uttryckligt produktionsgodkännande', () => {
  assert.throws(
    () => assertApprovedRun('https://arcana.hairtpclinic.com', false),
    /block5\.production_run_requires_explicit_owner_approval/
  );
  assert.doesNotThrow(() => assertApprovedRun('https://arcana.hairtpclinic.com', true));
  assert.doesNotThrow(() => assertApprovedRun('http://127.0.0.1:3100', false));
});

test('Block 5-harnessen har en tom, exakt allowlist tills säker skrivning är bevisad', () => {
  assert.deepEqual(SAFE_SAME_ORIGIN_WRITES, []);
  assert.equal(
    isExplicitSafeSameOriginWrite(
      'https://arcana.hairtpclinic.com/api/v1/telemetry',
      'POST',
      'https://arcana.hairtpclinic.com'
    ),
    false
  );
});

test('Block 5-harnessen avbryter slutresultatet när en skrivning blockerats', async () => {
  const handlers = {};
  const page = {
    async route(_pattern, handler) {
      handlers.route = handler;
    },
    async unroute() {},
    on(name, handler) {
      handlers[name] = handler;
    },
    off() {},
  };
  const cleanup = await installReadOnlyGuard(page, 'https://arcana.hairtpclinic.com');
  let aborted = false;
  await handlers.route({
    request: () => ({
      url: () => 'https://arcana.hairtpclinic.com/api/v1/cco/runtime/conversation/x/action',
      method: () => 'POST',
    }),
    abort: async () => {
      aborted = true;
    },
    continue: async () => {
      throw new Error('a same-origin write must not continue');
    },
  });
  assert.equal(aborted, true);
  await assert.rejects(cleanup, /block5\.same_origin_write_attempted/);
});

test('Block 5-harnessen returnerar bara maskerade identifierare och kräver destinationsbevisning', () => {
  const source = fs.readFileSync(HARNESS_PATH, 'utf8');
  assert.match(source, /crypto\s*\.\s*createHash\('sha256'\)/);
  assert.match(source, /booking_destination_context_not_observable/);
  assert.match(source, /await booking\.click\(\)/);
  assert.match(source, /assertDossierHandoff/);
  assert.match(source, /assertCalendarHandoff/);
  assert.match(source, /assertReviewHasNoHandoff/);
  assert.match(source, /x-arcana-preview-integrity/);
  assert.match(source, /x-arcana-preview-build/);
  assert.match(source, /frame\.frameLocator\('iframe\.cco-kalender-frame'\)/);
  assert.doesNotMatch(source, /page\.frameLocator\('iframe\.cco-kalender-frame'\)/);
  assert.match(source, /\[data-cco-more-toggle\]/);
  assert.match(source, /\[data-cco-more="konversationer_v2_preview"\]/);
  assert.match(source, /\[data-booking-surface\]\[data-booking-context-patient-id\]/);
  assert.match(source, /\[data-v2-thread\] \[data-v2-action="note"\]\[data-note-conversation-id\]/);
  assert.doesNotMatch(source, /page\.screenshot\(|storageState\s*[:(]/);
  assert.notEqual(mask('patient-secret-123'), 'patient-secret-123');
});
