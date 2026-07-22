'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HARNESS_PATH = path.join(__dirname, 'cco-v2-block5-readonly-harness.js');
const {
  assertApprovedRun,
  installReadOnlyGuard,
  isSameOriginWrite,
  mask,
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
  assert.doesNotMatch(source, /page\.screenshot\(|storageState\s*[:(]/);
  assert.notEqual(mask('patient-secret-123'), 'patient-secret-123');
});
