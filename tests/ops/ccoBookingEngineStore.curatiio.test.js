'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');
const {
  loadCuratiioCatalogSeed,
  serviceMatchesBrand,
  resourceMatchesBrand,
} = require('../../src/ops/curatiioCatalogRuntime');

async function withStore(run) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-curatiio-'));
  try {
    const store = await createCcoBookingEngineStore({
      filePath: path.join(tempDir, 'booking-engine.json'),
    });
    await run(store);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test('Curatiio seed läses in från migration/curatiio-services-seed.json', () => {
  const seed = loadCuratiioCatalogSeed();
  assert.ok(Array.isArray(seed.services));
  assert.ok(seed.services.length >= 5, 'minst 5 Curatiio-tjänster i seed');
  for (const service of seed.services) {
    assert.equal(service.brand, 'curatiio');
    assert.match(service.id, /^curatiio-/);
  }
});

test('serviceMatchesBrand isolerar Curatiio från Hair TP', () => {
  const curatiioService = { id: 'curatiio-botox', brand: 'curatiio' };
  const hairTpDefaultService = { id: 'consultation-online' }; // ingen brand → Hair TP
  const hairTpExplicitService = { id: 'fue', brand: 'hair-tp-clinic' };
  const hairTpLegacyBrandService = { id: 'consultation-online', brand: 'Hair TP Clinic' };

  // Curatiio-vy ska bara se Curatiio
  assert.equal(serviceMatchesBrand(curatiioService, 'curatiio'), true);
  assert.equal(serviceMatchesBrand(hairTpDefaultService, 'curatiio'), false);
  assert.equal(serviceMatchesBrand(hairTpExplicitService, 'curatiio'), false);
  assert.equal(serviceMatchesBrand(hairTpLegacyBrandService, 'curatiio'), false);

  // Hair TP-vy ska se default + explicit hair-tp, inte Curatiio
  assert.equal(serviceMatchesBrand(curatiioService, 'hair-tp-clinic'), false);
  assert.equal(serviceMatchesBrand(hairTpDefaultService, 'hair-tp-clinic'), true);
  assert.equal(serviceMatchesBrand(hairTpExplicitService, 'hair-tp-clinic'), true);
  assert.equal(serviceMatchesBrand(hairTpLegacyBrandService, 'hair-tp-clinic'), true);

  // Inget brand-arg → matchar allt (bakåtkompat)
  assert.equal(serviceMatchesBrand(curatiioService, ''), true);
  assert.equal(serviceMatchesBrand(hairTpDefaultService, ''), true);
});

test('resourceMatchesBrand följer samma regel som services', () => {
  const hairTpResource = { id: 'fazli' }; // ingen brand → Hair TP
  assert.equal(resourceMatchesBrand(hairTpResource, 'hair-tp-clinic'), true);
  assert.equal(resourceMatchesBrand(hairTpResource, 'curatiio'), false);
  assert.equal(resourceMatchesBrand({ id: 'x', brand: 'curatiio' }, 'curatiio'), true);
  assert.equal(resourceMatchesBrand({ id: 'x', brand: 'curatiio' }, 'hair-tp-clinic'), false);
});

test('listPublicServices med brand=hair-tp-clinic returnerar inga Curatiio-tjänster', async () => {
  await withStore(async (store) => {
    const services = await store.listPublicServices({ brand: 'hair-tp-clinic' });
    assert.ok(services.length > 0);
    for (const service of services) {
      assert.notEqual(
        String(service.brand || '').toLowerCase(),
        'curatiio',
        `Hair TP-publik katalog läckte Curatiio: ${service.id}`
      );
    }
    const ids = services.map((service) => service.id);
    assert.ok(ids.includes('consultation-online'));
    assert.ok(ids.includes('consultation-physical'));
    assert.ok(ids.includes('followup-transplant'));
    assert.ok(!ids.some((id) => id.startsWith('curatiio-')));
  });
});

test('listPublicServices med brand=curatiio returnerar enbart Curatiio-tjänster', async () => {
  await withStore(async (store) => {
    const services = await store.listPublicServices({ brand: 'curatiio' });
    assert.ok(services.length >= 5);
    for (const service of services) {
      assert.equal(String(service.brand || '').toLowerCase(), 'curatiio');
      assert.match(service.id, /^curatiio-/);
    }
    const labels = services.map((service) => service.label);
    assert.ok(labels.some((label) => /botox/i.test(label)));
    assert.ok(labels.some((label) => /filler/i.test(label)));
    assert.ok(labels.some((label) => /profhilo/i.test(label)));
    assert.ok(labels.some((label) => /ögonlock/i.test(label)));
    assert.ok(labels.some((label) => /microneedling/i.test(label)));
  });
});

test('listPublicResources med brand=curatiio returnerar inga Hair TP-resurser', async () => {
  await withStore(async (store) => {
    const resources = await store.listPublicResources({ brand: 'curatiio' });
    // Fas 1: Curatiio har inga egna resurser ännu — Hair TP-resurser ska vara osynliga.
    for (const resource of resources) {
      assert.equal(String(resource.brand || '').toLowerCase(), 'curatiio');
    }
    const ids = resources.map((resource) => resource.id);
    assert.ok(!ids.includes('fazli'));
    assert.ok(!ids.includes('egzona'));
    assert.ok(!ids.includes('arya'));
  });
});

test('listPublicServices utan brand-arg returnerar fortfarande Hair TP + Curatiio (bakåtkompat)', async () => {
  await withStore(async (store) => {
    const services = await store.listPublicServices();
    const hairTpIds = services.filter((service) =>
      ['consultation-online', 'consultation-physical', 'followup-transplant'].includes(service.id)
    );
    const curatiioIds = services.filter((service) =>
      String(service.id || '').startsWith('curatiio-')
    );
    assert.ok(hairTpIds.length >= 3);
    assert.ok(curatiioIds.length >= 5);
  });
});
