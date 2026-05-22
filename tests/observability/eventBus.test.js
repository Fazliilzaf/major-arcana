const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  publishRuntimeEvent,
  subscribeRuntimeEvent,
} = require('../../src/observability/eventBus');

test('publishRuntimeEvent no-ops for blank names', () => {
  publishRuntimeEvent('   ', { x: 1 });
  publishRuntimeEvent(null, { x: 1 });
});

test('publishRuntimeEvent no-ops for icke-sträng eventnamn', () => {
  const name = `eventBus.nonstring.${crypto.randomUUID()}`;
  let calls = 0;
  const off = subscribeRuntimeEvent(name, () => {
    calls += 1;
  });
  publishRuntimeEvent(12345, { x: 1 });
  publishRuntimeEvent({}, { x: 1 });
  assert.equal(calls, 0);
  off();
});

test('subscribeRuntimeEvent returns noop when listener invalid', () => {
  const unsub = subscribeRuntimeEvent('some.event', null);
  assert.equal(typeof unsub, 'function');
  unsub();
});

test('subscribeRuntimeEvent returns noop for blank event name', () => {
  const unsub = subscribeRuntimeEvent('  \t', () => {});
  assert.equal(typeof unsub, 'function');
  unsub();
});

test('subscribeRuntimeEvent noop när eventnamn inte är sträng', () => {
  let calls = 0;
  const unsub = subscribeRuntimeEvent(999, () => {
    calls += 1;
  });
  assert.equal(typeof unsub, 'function');
  publishRuntimeEvent('999', { x: 1 });
  assert.equal(calls, 0);
  unsub();
});

test('publish och subscribe trimmar eventnamn konsekvent', (t, done) => {
  const base = `eventBus.trim.${crypto.randomUUID()}`;
  const unsub = subscribeRuntimeEvent(`  ${base}  `, (msg) => {
    assert.equal(msg.eventName, base);
    assert.deepEqual(msg.payload, { k: true });
    unsub();
    done();
  });
  publishRuntimeEvent(` \n${base}\n `, { k: true });
});

test('flera subscribers får samma publish', () => {
  const name = `eventBus.multi.${crypto.randomUUID()}`;
  let a = 0;
  let b = 0;
  const offA = subscribeRuntimeEvent(name, () => {
    a += 1;
  });
  const offB = subscribeRuntimeEvent(name, () => {
    b += 1;
  });
  publishRuntimeEvent(name, { x: 1 });
  assert.equal(a, 1);
  assert.equal(b, 1);
  offA();
  offB();
});

test('publish delivers wrapped payload and unsubscribe stops delivery', (t, done) => {
  const name = `eventBus.unit.${crypto.randomUUID()}`;
  let calls = 0;
  const unsub = subscribeRuntimeEvent(name, (msg) => {
    calls += 1;
    assert.equal(msg.eventName, name);
    assert.ok(typeof msg.emittedAt === 'string');
    assert.deepEqual(msg.payload, { n: 1 });
    unsub();
    publishRuntimeEvent(name, { n: 2 });
    setImmediate(() => {
      assert.equal(calls, 1);
      done();
    });
  });
  publishRuntimeEvent(name, { n: 1 });
});

test('publishRuntimeEvent skickar vidare undefined payload utan crash', (t, done) => {
  const name = `eventBus.undefined.${crypto.randomUUID()}`;
  const unsub = subscribeRuntimeEvent(name, (msg) => {
    assert.equal(msg.eventName, name);
    assert.equal(msg.payload, undefined);
    unsub();
    done();
  });
  publishRuntimeEvent(name);
});

test('unsubscribe är idempotent och kan anropas flera gånger', () => {
  const name = `eventBus.idempotent.${crypto.randomUUID()}`;
  let calls = 0;
  const unsub = subscribeRuntimeEvent(name, () => {
    calls += 1;
  });
  unsub();
  unsub();
  publishRuntimeEvent(name, { any: true });
  assert.equal(calls, 0);
});

test('publish till annat event triggar inte lyssnaren', () => {
  const nameA = `eventBus.a.${crypto.randomUUID()}`;
  const nameB = `eventBus.b.${crypto.randomUUID()}`;
  let calls = 0;
  const off = subscribeRuntimeEvent(nameA, () => {
    calls += 1;
  });
  publishRuntimeEvent(nameB, { x: 1 });
  assert.equal(calls, 0);
  off();
});

test('subscribe med samma funktion två gånger ger dubbla leveranser', () => {
  const name = `eventBus.dup.${crypto.randomUUID()}`;
  let calls = 0;
  const fn = () => {
    calls += 1;
  };
  const off1 = subscribeRuntimeEvent(name, fn);
  const off2 = subscribeRuntimeEvent(name, fn);
  publishRuntimeEvent(name, {});
  assert.equal(calls, 2);
  off1();
  off2();
});

test('publish sätter emittedAt som parsebar ISO-sträng', (t, done) => {
  const name = `eventBus.iso.${crypto.randomUUID()}`;
  const unsub = subscribeRuntimeEvent(name, (msg) => {
    assert.ok(Number.isFinite(Date.parse(msg.emittedAt)));
    unsub();
    done();
  });
  publishRuntimeEvent(name, { ok: true });
});
