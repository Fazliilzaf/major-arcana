const test = require('node:test');
const assert = require('node:assert/strict');

const { adaptStore } = require('../../src/ops/ccoStoreAdapter');

function captureLogger() {
  const logs = [];
  return { logs, logger: { warn: (message) => logs.push(String(message)) } };
}

test('adaptStore loggar "store saknas" och returnerar null', () => {
  const { logs, logger } = captureLogger();
  const result = adaptStore(null, ['listByCustomer', 'getByCustomer'], {
    label: 'aftercare',
    logger,
  });
  assert.equal(result, null);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /store saknas/);
  assert.match(logs[0], /aftercare/);
});

test('adaptStore loggar "ingen metod matchade" när metodnamnen är fel', () => {
  const { logs, logger } = captureLogger();
  // Verkligheten: ccoAftercareStore har listCases/getCase — inte listByCustomer.
  const store = { listCases: () => [], getCase: () => null, applyCaseAction: () => null };
  const result = adaptStore(store, ['listByCustomer', 'listJobsByCustomer', 'getByCustomer'], {
    label: 'aftercare',
    logger,
  });
  assert.equal(logs.length, 1);
  assert.match(logs[0], /ingen metod matchade/);
  assert.match(logs[0], /listCases/); // tillgängliga metoder syns i loggen
  // Tomma listor — men nu med larm, inte tyst.
  assert.deepEqual(result.listByCustomer(), []);
  assert.deepEqual(result.getByCustomer(), []);
});

test('adaptStore binder listByCustomer/getByCustomer till första matchande metod', () => {
  const { logs, logger } = captureLogger();
  const store = { listByCustomer: () => 'ok' };
  const result = adaptStore(store, ['listByCustomer', 'getByCustomer'], { logger });
  assert.equal(logs.length, 0);
  assert.equal(result.listByCustomer(), 'ok');
  assert.equal(result.getByCustomer(), 'ok');
});

test('adaptStore tolererar en logger som kastar', () => {
  const throwingLogger = {
    warn() {
      throw new Error('logger broken');
    },
  };
  const result = adaptStore(null, ['listByCustomer'], { logger: throwingLogger });
  assert.equal(result, null);
});
