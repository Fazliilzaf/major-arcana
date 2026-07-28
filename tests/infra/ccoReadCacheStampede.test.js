'use strict';

/**
 * ORD-85 — in-flight-dedupliering i readCache.wrap.
 *
 * Utan den startar varje samtidig miss sin EGEN fulla laddning, eftersom den
 * första inte hunnit fram till set(). Det tog ner prod 2026-07-27: nyckeln för
 * identitetspopulationen är per TENANT, laddaren hämtar hela patientregistret,
 * och tre kundkort efter att femminuterscachen förfallit gav tre samtidiga
 * materialiseringar.
 *
 * Uppmätt mot realistisk poststorlek:
 *   ett anrop            +517 MB heap
 *   tre överlappande   +1 516 MB heap
 *   med dedupliering     +517 MB heap, 1 loader-anrop av 3
 *
 * Fem egenskaper låses fast:
 *   1. Samtidiga missar delar EN laddning.
 *   2. Alla anropare får samma värde.
 *   3. Ett kast når ALLA väntande, inte bara den första.
 *   4. En misslyckad laddning fastnar inte — nästa anrop får försöka igen.
 *   5. Dedupliceringen överlever inte anropet.
 *
 * Punkt 3 och 4 är de som gör skillnad i drift. En laddning som kastar och
 * ligger kvar i kartan hade blivit ett permanent fel för hela tenanten.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { createCcoReadCache } = require(
  path.join(__dirname, '..', '..', 'src', 'infra', 'ccoReadCache.js')
);

const vänta = (ms) => new Promise((r) => setTimeout(r, ms));

test('samtidiga missar delar EN laddning', async () => {
  const cache = createCcoReadCache({});
  let anrop = 0;
  const loader = async () => {
    anrop += 1;
    await vänta(30);
    return { patienter: 7451 };
  };

  const svar = await Promise.all([
    cache.wrap('k1', 60_000, loader),
    cache.wrap('k1', 60_000, loader),
    cache.wrap('k1', 60_000, loader),
  ]);

  assert.equal(anrop, 1, 'tre samtidiga missar ska ge EN laddning');
  for (const s of svar) assert.deepEqual(s.value, { patienter: 7451 });
});

test('olika nycklar delar inte laddning', async () => {
  const cache = createCcoReadCache({});
  let anrop = 0;
  const loader = async () => { anrop += 1; await vänta(20); return anrop; };

  await Promise.all([cache.wrap('a', 60_000, loader), cache.wrap('b', 60_000, loader)]);

  assert.equal(anrop, 2, 'skilda nycklar ska laddas var för sig');
});

test('ett kast når ALLA väntande anropare', async () => {
  const cache = createCcoReadCache({});
  let anrop = 0;
  const loader = async () => {
    anrop += 1;
    await vänta(20);
    throw new Error('registret kunde inte läsas');
  };

  const utfall = await Promise.allSettled([
    cache.wrap('k2', 60_000, loader),
    cache.wrap('k2', 60_000, loader),
    cache.wrap('k2', 60_000, loader),
  ]);

  assert.equal(anrop, 1, 'ett laddningsförsök, inte tre');
  assert.equal(utfall.length, 3);
  for (const u of utfall) {
    assert.equal(u.status, 'rejected', 'alla tre ska få felet, inte bara den första');
    assert.match(String(u.reason?.message), /kunde inte läsas/);
  }
});

test('en misslyckad laddning fastnar inte — nästa anrop får försöka igen', async () => {
  const cache = createCcoReadCache({});
  let anrop = 0;
  const loader = async () => {
    anrop += 1;
    if (anrop === 1) throw new Error('tillfälligt fel');
    return { ok: true };
  };

  await assert.rejects(() => cache.wrap('k3', 60_000, loader), /tillfälligt fel/);
  const andra = await cache.wrap('k3', 60_000, loader);

  assert.equal(anrop, 2, 'andra anropet ska få försöka på nytt');
  assert.deepEqual(andra.value, { ok: true });
});

test('dedupliceringen överlever inte anropet', async () => {
  // OBS: set() golvar TTL till 1 000 ms (Math.max(1000, ...)), så ett TTL-test
  // hade mätt golvet och inte dedupliceringen. Vi rensar nyckeln i stället —
  // då är cachen tom och enda anledningen till en delad laddning vore att
  // in-flight-posten låg kvar. Den ska vara borta.
  const cache = createCcoReadCache({});
  let anrop = 0;
  const loader = async () => { anrop += 1; await vänta(10); return anrop; };

  await cache.wrap('k4', 60_000, loader);
  assert.equal(anrop, 1);

  await cache.del('k4');
  await cache.wrap('k4', 60_000, loader);

  assert.equal(anrop, 2, 'kartan är in-flight, inte en cache ovanpå cachen');
});

test('cachad träff rapporteras som träff, delad laddning som miss', async () => {
  const cache = createCcoReadCache({});
  const loader = async () => { await vänta(15); return 1; };

  const [första, delad] = await Promise.all([
    cache.wrap('k5', 60_000, loader),
    cache.wrap('k5', 60_000, loader),
  ]);
  assert.equal(första.cacheHit, false);
  assert.equal(delad.cacheHit, false, 'delad laddning ÄR en miss — annars döljs stampede-trycket');

  const efterat = await cache.wrap('k5', 60_000, loader);
  assert.equal(efterat.cacheHit, true, 'först när värdet ligger i cachen är det en träff');
});

test('källnivå-vakt: in-flight-kartan städas i finally', async () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'infra', 'ccoReadCache.js'),
    'utf8'
  );
  assert.ok(src.includes('const inFlight = new Map()'), 'in-flight-kartan ska finnas');
  assert.match(
    src,
    /finally\s*\{\s*inFlight\.delete\(key\);\s*\}/,
    'posten MÅSTE tas bort i finally — annars fastnar en misslyckad laddning permanent'
  );
});
