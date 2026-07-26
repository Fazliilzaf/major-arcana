'use strict';

/**
 * apiRequest måste överleva icke-JSON-svar.
 *
 * Live-fynd 2026-07-26: workspace-bootstrap fick HTML där JSON väntades.
 * JSON.parse kördes FÖRE response.ok-kollen, så ett 401/404 med HTML-kropp
 * kastade "Unexpected token '<'". Den riktiga statuskoden gick förlorad, och
 * auth-retryn längre ned kunde därför ALDRIG trigga — en utgången session gick
 * inte att återhämta automatiskt.
 *
 * Testet kör den RIKTIGA apiRequestImpl-källan i en sandlåda med stubbad fetch,
 * så beteendet prövas — inte bara kodformen.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'app.js'),
  'utf8'
);

/** Minimal Response-stub med bara det apiRequestImpl faktiskt använder. */
function makeResponse({ status = 200, body = '', contentType = 'application/json' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => body,
  };
}

/**
 * Laddar apiRequestImpl isolerat. `responses` är en kö som konsumeras per
 * fetch-anrop, så auth-retryn (två anrop) kan observeras.
 */
function loadApiRequest(responses, { token = 'tok-1' } = {}) {
  const start = APP.indexOf('async function apiRequestImpl(path, options = {}) {');
  assert.ok(start > -1, 'apiRequestImpl ska finnas i app.js');
  const end = APP.indexOf('\n  function applyStudioTemplateSelection', start);
  assert.ok(end > start, 'kunde inte avgränsa apiRequestImpl');
  const source = APP.slice(start, end);

  const calls = [];
  const queue = [...responses];
  let currentToken = token;

  const sandbox = {
    URL,
    URLSearchParams,
    JSON,
    Boolean,
    Error,
    Number,
    String,
    Object,
    Promise,
    window: { location: { origin: 'https://example.test' } },
    // Externa beroenden apiRequestImpl slår mot:
    getActiveWorkspaceContext: () => ({ workspaceId: 'ws-1' }),
    getAdminToken: () => currentToken,
    clearAdminToken: () => {
      currentToken = '';
    },
    isAuthFailure: (status) => status === 401,
    normalizeText: (value) => (typeof value === 'string' ? value.trim() : ''),
    ensurePreviewBootstrapSession: async () => {
      currentToken = 'tok-2';
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), authorization: init?.headers?.Authorization || null });
      if (!queue.length) throw new Error('fler fetch-anrop än förväntat');
      return queue.shift();
    },
  };

  vm.runInNewContext(`${source}\nthis.apiRequestImpl = apiRequestImpl;`, sandbox);
  return { apiRequestImpl: sandbox.apiRequestImpl, calls };
}

test('HTML vid 401 behåller statusen OCH triggar auth-retry', async () => {
  const html = '<!doctype html><html><body>Logga in</body></html>';
  const { apiRequestImpl, calls } = loadApiRequest([
    // Första försöket: 401 med HTML-kropp (auth-redirect).
    makeResponse({ status: 401, body: html, contentType: 'text/html' }),
    // Efter token-förnyelse: giltigt JSON-svar.
    makeResponse({ status: 200, body: JSON.stringify({ ok: true, scope: 'v2' }) }),
  ]);

  const payload = await apiRequestImpl('/api/v1/cco-workspace/bootstrap');

  // Retryn kördes — och lyckades. Före fixen kastade JSON.parse innan
  // retry-grenen ens utvärderades.
  assert.equal(calls.length, 2, 'auth-retryn ska ha gjort ett andra anrop');
  assert.equal(calls[0].authorization, 'Bearer tok-1');
  assert.equal(calls[1].authorization, 'Bearer tok-2', 'andra anropet ska bära den förnyade token');
  assert.deepEqual({ ...payload }, { ok: true, scope: 'v2' });
});

test('HTML vid 404 kastar med bevarad status — inte ett parse-fel', async () => {
  const { apiRequestImpl } = loadApiRequest([
    makeResponse({ status: 404, body: '<html>Not found</html>', contentType: 'text/html' }),
  ]);

  await assert.rejects(
    () => apiRequestImpl('/api/v1/cco-workspace/bootstrap'),
    (error) => {
      assert.equal(error.statusCode, 404, 'statuskoden ska överleva');
      assert.equal(error.nonJsonResponse, true, 'ska markeras som icke-JSON-svar');
      assert.match(error.message, /text\/html/, 'content-type ska framgå av felet');
      assert.doesNotMatch(
        error.message,
        /Unexpected token/,
        'ska inte längre vara ett rått JSON.parse-fel'
      );
      return true;
    }
  );
});

test('trasig 2xx-JSON rödar tydligt i stället för att se ut som giltig payload', async () => {
  const { apiRequestImpl } = loadApiRequest([
    makeResponse({ status: 200, body: '<html>proxy</html>', contentType: 'text/html' }),
  ]);

  await assert.rejects(
    () => apiRequestImpl('/api/v1/cco-workspace/bootstrap'),
    (error) => {
      assert.equal(error.statusCode, 200);
      assert.equal(error.nonJsonResponse, true);
      assert.match(error.message, /i stället för JSON/);
      return true;
    }
  );
});

test('tomt svar fungerar som tidigare (t.ex. 204 No Content)', async () => {
  const { apiRequestImpl } = loadApiRequest([makeResponse({ status: 204, body: '' })]);
  const payload = await apiRequestImpl('/api/v1/cco-workspace/follow-ups');
  assert.deepEqual({ ...payload }, {}, 'tom kropp ska ge tomt objekt, inte kasta');
});

test('giltigt JSON-svar är oförändrat', async () => {
  const { apiRequestImpl, calls } = loadApiRequest([
    makeResponse({ status: 200, body: JSON.stringify({ followUps: [1, 2, 3] }) }),
  ]);
  const payload = await apiRequestImpl('/api/v1/cco-workspace/follow-ups');
  assert.deepEqual([...payload.followUps], [1, 2, 3]);
  assert.equal(calls.length, 1, 'ingen extra retry för lyckade svar');
});

test('JSON-fel från servern behåller sitt eget felmeddelande', async () => {
  const { apiRequestImpl } = loadApiRequest([
    makeResponse({ status: 403, body: JSON.stringify({ error: 'forbidden', metadata: { r: 1 } }) }),
  ]);

  await assert.rejects(
    () => apiRequestImpl('/api/v1/cco/runtime/worklist'),
    (error) => {
      assert.equal(error.message, 'forbidden', 'serverns eget fel ska vinna');
      assert.equal(error.statusCode, 403);
      assert.equal(error.nonJsonResponse, false);
      return true;
    }
  );
});
