'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { envRowsToMap, fetchAllRenderEnvRows } = require('../../scripts/lib/renderEnvApi.js');

test('envRowsToMap normaliserar envVar-rader', () => {
  const map = envRowsToMap([{ envVar: { key: 'FOO', value: 'bar' } }, { key: 'BAZ', value: '' }]);
  assert.equal(map.get('FOO'), 'bar');
  assert.equal(map.get('BAZ'), '');
});

test('fetchAllRenderEnvRows paginerar tills sista sida', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async (url) => {
    calls += 1;
    const u = new URL(String(url));
    assert.equal(u.searchParams.get('limit'), '100');
    if (calls === 1) {
      assert.equal(u.searchParams.has('cursor'), false);
      return {
        ok: true,
        json: async () => [
          { envVar: { key: 'A', value: '1' }, cursor: 'c1' },
          { envVar: { key: 'B', value: '2' }, cursor: 'c2' },
        ],
      };
    }
    assert.equal(u.searchParams.get('cursor'), 'c2');
    return {
      ok: true,
      json: async () => [{ envVar: { key: 'C', value: '3' } }],
    };
  };

  try {
    const rows = await fetchAllRenderEnvRows('srv-test', 'rnd_test');
    assert.equal(calls, 2);
    assert.equal(rows.length, 3);
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchAllRenderEnvRows fail hard vid HTTP-fel', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' });
  try {
    await assert.rejects(
      () => fetchAllRenderEnvRows('srv-test', 'rnd_bad'),
      /Render GET env-vars failed: 401/
    );
  } finally {
    global.fetch = originalFetch;
  }
});
