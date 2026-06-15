'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createCcoCommCronStore,
  filterMissingDocumentsForReminder,
  isFitnessCertificateDocument,
} = require('../../src/ops/ccoCommCronStore');

test('missing_documents T-48 filtrerar bort FC/friskförsäkran', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-comm-cron-'));
  try {
    const store = await createCcoCommCronStore({
      filePath: path.join(tempDir, 'comm-cron.json'),
    });
    const startTime = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const proposals = store.buildProposals({
      trigger: 'missing_documents',
      tenantId: 'hair-tp-clinic',
      bookings: [
        {
          id: 'booking-1',
          customerId: 'patient-1',
          status: 'booked',
          startTime,
          missingDocuments: [
            'fitness_certificate',
            { registryId: 'friskfoers_tp', label: 'Friskförsäkran' },
          ],
        },
        {
          id: 'booking-2',
          customerId: 'patient-2',
          status: 'booked',
          startTime,
          missingDocuments: ['health_declaration', { registryId: 'foto_samtycke' }],
        },
      ],
    });

    assert.equal(proposals.length, 1);
    assert.equal(proposals[0].customerId, 'patient-2');
    assert.deepEqual(proposals[0].context.missingDocuments, [
      'health_declaration',
      { registryId: 'foto_samtycke' },
    ]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('FC-dokument känns igen innan T-48-påminnelse byggs', () => {
  assert.equal(isFitnessCertificateDocument('fitness_certificate'), true);
  assert.equal(isFitnessCertificateDocument({ registryId: 'friskfoers_tp' }), true);
  assert.deepEqual(filterMissingDocumentsForReminder(['fc', 'haelso_tp_sve']), ['haelso_tp_sve']);
});
