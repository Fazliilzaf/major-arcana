const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertDeceasedGuardReadyForLive,
  setDeceasedResolver,
} = require('../../src/ops/ccoDeceasedSendGuard');

function withLiveEnv(value, fn) {
  const prev = process.env.CCO_SEND_LIVE;
  if (value === undefined) delete process.env.CCO_SEND_LIVE;
  else process.env.CCO_SEND_LIVE = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.CCO_SEND_LIVE;
    else process.env.CCO_SEND_LIVE = prev;
  }
}

// Ett test per rad i tabellen (ORD-147 startkontroll).
// Modulen är oarmad vid load (färsk process per testfil) — test 1 och 2 kör
// oarmade, test 3 armar explicit.

test('CCO_SEND_LIVE av + ej armerad → varning, startar', () => {
  withLiveEnv(undefined, () => {
    assert.doesNotThrow(() => assertDeceasedGuardReadyForLive());
  });
});

test('CCO_SEND_LIVE på + ej armerad → kastar (processen startar inte)', () => {
  withLiveEnv('1', () => {
    assert.throws(() => assertDeceasedGuardReadyForLive(), /armerad|vägrar starta/);
  });
});

test('CCO_SEND_LIVE på + armerad → startar', () => {
  setDeceasedResolver(async () => false);
  withLiveEnv('true', () => {
    assert.doesNotThrow(() => assertDeceasedGuardReadyForLive());
  });
});
