'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  importHalsoFormAttachments,
} = require('../../src/ops/ccoHalsoFormAttachmentImport');

function stores(existing = []) {
  const runs = [];
  return {
    assetStore: {
      listItemsForEnrichment: () => existing,
      transitionStatus: async () => {},
      markAsVisibleOnPatientCard: async () => {},
    },
    importRunStore: {
      startRun: async (input) => {
        runs.push(input);
        return 'run-halso-1';
      },
      finishRun: async () => {},
    },
    reviewQueueStore: {},
    secureStorage: {},
    runs,
  };
}

test('imports matched halso PDF with stable source record and canonical patient', async () => {
  const deps = stores();
  const calls = [];
  const report = await importHalsoFormAttachments({
    attachments: [
      {
        id: 'attachment-1',
        name: 'Friskforsakran.pdf',
        contentType: 'application/pdf',
        body: Buffer.from('%PDF-test'),
      },
    ],
    rawMessage: { id: 'message-1', receivedAt: '2026-07-11T10:00:00Z' },
    formResult: {
      patientId: 'patient-1',
      parsed: { signedAt: '2026-07-11T10:00:00Z' },
    },
    tenantId: 'hair-tp-clinic',
    stores: deps,
    pipelineFactory: () => ({
      importSingleAsset: async (input) => {
        calls.push(input);
        return { ok: true, status: 'VISIBLE_ON_PATIENT_CARD' };
      },
    }),
  });

  assert.equal(report.imported, 1);
  assert.equal(report.failed, 0);
  assert.equal(deps.runs[0].sourceSystem, 'm365_halso');
  assert.equal(calls[0].sourceRecord.sourceRecordId, 'message-1:attachment-1');
  assert.equal(calls[0].sourceRecord.patientId, 'patient-1');
  assert.equal(calls[0].sourceRecord.mimeType, 'application/pdf');
});

test('skips an attachment already indexed from the same Graph record', async () => {
  const deps = stores([
    {
      sourceSystem: 'm365_halso',
      sourceRecordId: 'message-1:attachment-1',
      status: 'VISIBLE_ON_PATIENT_CARD',
    },
  ]);
  const report = await importHalsoFormAttachments({
    attachments: [{ id: 'attachment-1', name: 'Halsodeklaration.pdf', body: Buffer.from('pdf') }],
    rawMessage: { id: 'message-1' },
    formResult: { patientId: 'patient-1', parsed: {} },
    tenantId: 'hair-tp-clinic',
    stores: deps,
    pipelineFactory: () => {
      throw new Error('pipeline must not be created for an indexed attachment');
    },
  });

  assert.equal(report.imported, 0);
  assert.equal(report.skipped, 1);
  assert.equal(report.runId, null);
});

test('does not import attachments for review-required patient matches', async () => {
  const deps = stores();
  const report = await importHalsoFormAttachments({
    attachments: [{ id: 'attachment-1', name: 'Halsodeklaration.pdf', body: Buffer.from('pdf') }],
    rawMessage: { id: 'message-1' },
    formResult: { patientId: 'review-stub', needsReview: true },
    tenantId: 'hair-tp-clinic',
    stores: deps,
  });

  assert.equal(report.imported, 0);
  assert.equal(report.skipped, 1);
  assert.equal(deps.runs.length, 0);
});

test('promotes a checksum duplicate so the halso PDF remains visible in the dossier', async () => {
  const deps = stores();
  const transitions = [];
  deps.assetStore.transitionStatus = async (...args) => transitions.push(['transition', ...args]);
  deps.assetStore.markAsVisibleOnPatientCard = async (...args) =>
    transitions.push(['visible', ...args]);

  const report = await importHalsoFormAttachments({
    attachments: [{ id: 'attachment-1', name: 'Friskforsakran.pdf', body: Buffer.from('pdf') }],
    rawMessage: { id: 'message-1' },
    formResult: { patientId: 'patient-1', parsed: {} },
    tenantId: 'hair-tp-clinic',
    stores: deps,
    pipelineFactory: () => ({
      importSingleAsset: async () => ({
        ok: true,
        status: 'DUPLICATE',
        asset: { id: 'duplicate-asset-1' },
      }),
    }),
  });

  assert.equal(report.duplicate, 1);
  assert.equal(report.failed, 0);
  assert.deepEqual(
    transitions.map((entry) => [entry[0], entry[1], entry[2]]),
    [
      ['transition', 'duplicate-asset-1', 'VERIFIED_IN_CCO'],
      ['visible', 'duplicate-asset-1', { actor: { role: 'system', userId: 'halso-hd-scheduler', tenantId: 'hair-tp-clinic' } }],
    ]
  );
});
