'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { envRowsToMap, putRenderEnvMerged } = require('../../scripts/lib/renderEnvApi');

/**
 * Render PUT /env-vars ersätter HELA listan. Det gör varje merge-PUT till en
 * potentiell radering av produktionskonfiguration, och 2026-08-31 blev det just
 * det: sju apply-skript hämtade med `?limit=100` utan cursor mot en miljö som
 * render.yaml deklarerar med 122 nycklar. Allt bortom första sidan försvann.
 *
 * putRenderEnvMerged finns för att den koden inte ska skrivas en åttonde gång.
 * Testerna här mäter spärrarna, inte den lyckliga vägen — det är spärrarna som
 * står mellan ett slarvigt anrop och en tömd prod-miljö.
 */

function withFetch(impl, run) {
  const original = global.fetch;
  global.fetch = impl;
  return (async () => {
    try {
      return await run();
    } finally {
      global.fetch = original;
    }
  })();
}

function rows(pairs) {
  return pairs.map(([key, value], i) => ({
    envVar: { key, value },
    cursor: `c${i}`,
  }));
}

test('envRowsToMap plockar ut key/value oavsett radform', () => {
  const map = envRowsToMap([{ envVar: { key: 'A', value: '1' } }, { key: 'B', value: '2' }]);
  assert.equal(map.get('A'), '1');
  assert.equal(map.get('B'), '2');
});

test('GET pagineras — nycklar bortom första sidan följer med i PUT', async () => {
  // 120 befintliga nycklar i två sidor. En icke-paginerande anropare hade
  // skickat tillbaka 100 och raderat 20.
  const page1 = rows(Array.from({ length: 100 }, (_, i) => [`K${i}`, String(i)]));
  const page2 = rows(Array.from({ length: 20 }, (_, i) => [`K${100 + i}`, String(100 + i)]));
  let putBody = null;

  await withFetch(
    async (url, init) => {
      if (init?.method === 'PUT') {
        putBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          async text() {
            return '';
          },
        };
      }
      const cursor = new URL(url).searchParams.get('cursor');
      const page = cursor ? (cursor === 'c99' ? page2 : []) : page1;
      return {
        ok: true,
        status: 200,
        async json() {
          return page;
        },
      };
    },
    async () => {
      const result = await putRenderEnvMerged('srv-test', { NY: 'värde' }, { apiKey: 'rnd_x' });
      assert.equal(result.before, 120);
      assert.equal(result.after, 121);
      assert.deepEqual(result.changed, ['NY']);
    }
  );

  assert.equal(putBody.length, 121, 'alla 120 befintliga + den nya ska skickas tillbaka');
  assert.ok(
    putBody.some((r) => r.key === 'K119'),
    'nyckeln från sida två får inte tappas — det var exakt buggen'
  );
});

test('tom GET → vägrar skriva (ett API-fel är inte en tom miljö)', async () => {
  let putCalled = false;
  await withFetch(
    async (_url, init) => {
      if (init?.method === 'PUT') {
        putCalled = true;
        return {
          ok: true,
          status: 200,
          async text() {
            return '';
          },
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return [];
        },
      };
    },
    async () => {
      await assert.rejects(
        () => putRenderEnvMerged('srv-test', { NY: '1' }, { apiKey: 'rnd_x' }),
        /vägrar skriva över en miljö vi inte kunde läsa/
      );
    }
  );
  assert.equal(putCalled, false, 'ingen PUT får ske efter en tom läsning');
});

test('GET-fel kastar — ingen PUT på en halv läsning', async () => {
  let putCalled = false;
  await withFetch(
    async (_url, init) => {
      if (init?.method === 'PUT') {
        putCalled = true;
        return {
          ok: true,
          status: 200,
          async text() {
            return '';
          },
        };
      }
      return {
        ok: false,
        status: 500,
        async text() {
          return 'boom';
        },
      };
    },
    async () => {
      await assert.rejects(
        () => putRenderEnvMerged('srv-test', { NY: '1' }, { apiKey: 'rnd_x' }),
        /Render GET env-vars failed: 500/
      );
    }
  );
  assert.equal(putCalled, false);
});

// OBS för den som skriver fler mockar här: fetchAllRenderEnvRows följer cursorn
// tills en sida är tom. En mock som returnerar SAMMA cursor varje gång loopar
// för evigt — biblioteket har inget skydd mot en API-server som gör det. Det
// har aldrig hänt mot Render, men en sida måste alltså ta slut i mocken.
test('dryRun rapporterar utan att skriva', async () => {
  let putCalled = false;
  let getCalls = 0;
  await withFetch(
    async (_url, init) => {
      if (init?.method === 'PUT') {
        putCalled = true;
        return {
          ok: true,
          status: 200,
          async text() {
            return '';
          },
        };
      }
      getCalls += 1;
      const page = getCalls === 1 ? rows([['A', '1']]) : [];
      return {
        ok: true,
        status: 200,
        async json() {
          return page;
        },
      };
    },
    async () => {
      const r = await putRenderEnvMerged('srv-test', { A: '2' }, { apiKey: 'rnd_x', dryRun: true });
      assert.equal(r.dryRun, true);
      assert.equal(r.before, 1);
      assert.deepEqual(r.changed, ['A']);
    }
  );
  assert.equal(putCalled, false);
});

test('inga nycklar att sätta → kastar hellre än att PUT:a oförändrat', async () => {
  await assert.rejects(
    () => putRenderEnvMerged('srv-test', {}, { apiKey: 'rnd_x' }),
    /inga nycklar att sätta/
  );
});
