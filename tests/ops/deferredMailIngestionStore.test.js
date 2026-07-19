const assert = require('node:assert/strict');
const test = require('node:test');

const { createDeferredCcoMailIngestionStore } = require('../../src/ops/deferredMailIngestionStore');

test('deferred CCO mail-ingestion store does not materialize the real store at boot', () => {
  let factoryCalls = 0;
  const placeholder = {
    disabled: true,
    reason: 'prod_safe_deferred_boot',
    buildDashboardSummary: () => ({
      disabled: true,
      reason: 'prod_safe_deferred_boot',
      counts: { rawMessages: 0 },
      queueLength: 0,
    }),
    getQueueLength: () => 0,
    listRawMessages: () => [],
    getState: () => ({ disabled: true, reason: 'prod_safe_deferred_boot' }),
  };

  const store = createDeferredCcoMailIngestionStore({
    placeholderStore: placeholder,
    createStore: async () => {
      factoryCalls += 1;
      return {
        buildDashboardSummary: () => ({
          disabled: false,
          counts: { rawMessages: 12 },
          queueLength: 2,
        }),
        getQueueLength: () => 2,
        listRawMessages: () => [{ id: 'raw-1' }],
        getState: () => ({ disabled: false }),
      };
    },
    logger: { log() {}, error() {} },
  });

  assert.equal(store._isLoaded(), false);
  assert.equal(factoryCalls, 0);
  assert.deepEqual(store.listRawMessages(), []);
  assert.equal(store.buildDashboardSummary().disabled, true);
  assert.equal(store.getQueueLength(), 0);
  assert.equal(factoryCalls, 0, 'read-only boot methods must not call the heavy factory');
});

test('deferred CCO mail-ingestion store delegates only after explicit load', async () => {
  let factoryCalls = 0;
  const store = createDeferredCcoMailIngestionStore({
    placeholderStore: {
      disabled: true,
      reason: 'prod_safe_deferred_boot',
      getQueueLength: () => 0,
      listRawMessages: () => [],
      getState: () => ({ disabled: true }),
    },
    createStore: async () => {
      factoryCalls += 1;
      return {
        disabled: false,
        filePath: '/var/data/cco-mail-ingestion.json',
        getQueueLength: () => 7,
        listRawMessages: () => [{ id: 'raw-1' }, { id: 'raw-2' }],
        getState: () => ({ disabled: false, mailRawMessages: { a: {}, b: {} } }),
      };
    },
    logger: { log() {}, error() {} },
  });

  assert.equal(store.getQueueLength(), 0);
  await store._load();
  await store._load();

  assert.equal(factoryCalls, 1, 'explicit load must be idempotent');
  assert.equal(store._isLoaded(), true);
  assert.equal(store.disabled, false);
  assert.equal(store.filePath, '/var/data/cco-mail-ingestion.json');
  assert.equal(store.getQueueLength(), 7);
  assert.equal(store.listRawMessages().length, 2);
});
