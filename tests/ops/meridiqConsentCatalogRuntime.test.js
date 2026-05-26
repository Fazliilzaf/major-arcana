'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildMeridiqConsentReadout,
  loadMeridiqConsentCatalog,
  normalizeConsentEntry,
} = require('../../src/ops/meridiqConsentCatalogRuntime');

test('loadMeridiqConsentCatalog läser 39 Meridiq-samtycken från migration-filen', () => {
  const { catalog, consents } = loadMeridiqConsentCatalog();
  assert.equal(catalog.declaredCount ?? catalog.count, 39, 'expected declared count = 39');
  assert.equal(consents.length, 39, 'expected to normalize all 39 consents');
  for (const entry of consents) {
    assert.equal(typeof entry.id, 'string');
    assert.match(entry.id, /^meridiq-consent-\d+$/);
    assert.equal(typeof entry.apiId, 'number');
    assert.ok(entry.title);
    assert.ok(['hair_tp_clinic', 'curatiio', 'other'].includes(entry.brandKey));
    assert.ok(['sv', 'en'].includes(entry.locale));
  }
});

test('buildMeridiqConsentReadout activeOnly=true returnerar enbart aktiva', () => {
  const readout = buildMeridiqConsentReadout({ activeOnly: true });
  assert.equal(readout.totalCount, 39);
  assert.equal(readout.activeOnly, true);
  assert.equal(readout.returnedCount, readout.activeCount);
  for (const group of readout.brands) {
    for (const consent of group.consents) {
      assert.equal(consent.isActive, true);
    }
  }
});

test('buildMeridiqConsentReadout grupperar per brand med Hair TP först', () => {
  const readout = buildMeridiqConsentReadout({ activeOnly: false });
  assert.ok(Array.isArray(readout.brands));
  assert.ok(readout.brands.length >= 2);
  const sum = readout.brands.reduce((acc, group) => acc + group.count, 0);
  assert.equal(sum, readout.returnedCount);
  assert.equal(readout.brands[0].brandKey, 'hair_tp_clinic');
});

test('buildMeridiqConsentReadout activeOnly=false inkluderar inactive om sådana finns', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-consent-runtime-'));
  try {
    const tempFile = path.join(tempDir, 'consent-catalog.json');
    await fs.writeFile(
      tempFile,
      JSON.stringify(
        {
          exportedAt: '2026-05-25',
          source: 'unit-test',
          count: 3,
          consents: [
            { apiId: 1, title: 'Foo - SWE', brand: 'Hair TP Clinic', isActive: true, version: '1' },
            {
              apiId: 2,
              title: 'Bar - ENG',
              brand: 'Curatiio',
              isActive: false,
              version: '0',
              letterText: 'hej',
            },
            { apiId: 3, title: 'Baz', brand: 'Annan klinik', isActive: true, version: '2' },
          ],
        },
        null,
        2
      )
    );
    const activeOnly = buildMeridiqConsentReadout({ activeOnly: true, filePath: tempFile });
    const includeInactive = buildMeridiqConsentReadout({ activeOnly: false, filePath: tempFile });
    assert.equal(activeOnly.returnedCount, 2);
    assert.equal(includeInactive.returnedCount, 3);
    const flatInactive = includeInactive.brands.flatMap((b) => b.consents);
    assert.ok(flatInactive.some((c) => c.isActive === false));
    const curatiio = includeInactive.brands.find((b) => b.brandKey === 'curatiio');
    assert.ok(curatiio, 'expected curatiio bucket');
    assert.equal(curatiio.consents[0].hasLetterText, true);
    assert.equal(curatiio.consents[0].letterTextLength, 3);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('normalizeConsentEntry returnerar null när apiId saknas', () => {
  assert.equal(normalizeConsentEntry({ title: 'utan id' }), null);
});
