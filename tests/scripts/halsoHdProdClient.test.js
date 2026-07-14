'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { fetchWithRetry } = require('../../scripts/lib/halsoHdProdClient');

test('fetchWithRetry retries a transient network error', async (t) => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('network down');
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const result = await fetchWithRetry('https://example.invalid', {}, {
    attempts: 2,
    timeoutMs: 50,
  });
  assert.equal(calls, 2);
  assert.equal(result.payload.ok, true);
});

test('fetchWithRetry stops after the configured network attempts', async (t) => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    throw new TypeError('network down');
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  await assert.rejects(
    fetchWithRetry('https://example.invalid', {}, { attempts: 2, timeoutMs: 50 }),
    /network down/
  );
  assert.equal(calls, 2);
});
