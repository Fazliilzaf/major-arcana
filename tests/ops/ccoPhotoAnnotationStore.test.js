'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCcoPhotoAnnotationStore, SCHEMA_VERSION } = require('../../src/ops/ccoPhotoAnnotationStore');

function tmpPath() {
  return path.join(os.tmpdir(), `cco-photo-ann-${process.pid}-${Date.now()}.json`);
}

test('modellen räcker: drawingData + planSummary + selectedFor + zone + tags sparas', async () => {
  const fp = tmpPath();
  const store = await createCcoPhotoAnnotationStore({ filePath: fp });

  const ann = await store.createAnnotationSet({
    customerId: 'c1',
    sourceAssetId: 'asset-1',
    zone: 'crown',
    purpose: 'clinical-markup',
    drawingData: { grafts: [{ x: 10, y: 20 }, { x: 30, y: 40 }], zones: ['crown', 'hairline'] },
    planSummary: { plannedGrafts: 2500, zones: { crown: 1800, hairline: 700 } },
    selectedFor: ['consultation_form_step_3'],
    tags: ['plan', 'grafts'],
  });

  assert.ok(ann.id);
  assert.equal(ann.zone, 'crown');
  assert.equal(ann.drawingData.grafts.length, 2);
  assert.equal(ann.planSummary.plannedGrafts, 2500);
  assert.deepEqual(ann.selectedFor, ['consultation_form_step_3']);
  assert.equal(store.getByCustomer('c1').length, 1);

  fs.rmSync(fp, { force: true });
});

test('update + delete är idempotenta och auditerade', async () => {
  const fp = tmpPath();
  const store = await createCcoPhotoAnnotationStore({ filePath: fp });

  const ann = await store.createAnnotationSet({ customerId: 'c2', zone: 'hairline' });
  const upd = await store.updateAnnotationSet({ annotationId: ann.id, patch: { note: 'klar' } });
  assert.equal(upd.note, 'klar');

  assert.equal(await store.deleteAnnotation(ann.id, {}), true);
  assert.equal(await store.deleteAnnotation(ann.id, {}), false); // redan borta
  assert.equal(store.getById(ann.id), null);

  fs.rmSync(fp, { force: true });
});

test('kräver customerId/patientId (400)', async () => {
  const fp = tmpPath();
  const store = await createCcoPhotoAnnotationStore({ filePath: fp });
  await assert.rejects(() => store.createAnnotationSet({}), (err) => err.statusCode === 400);
  fs.rmSync(fp, { force: true });
});
