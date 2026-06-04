'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoScalpAnalysisStore } = require('../../src/ops/ccoScalpAnalysisStore');

async function mkStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-scalp-'));
  return createCcoScalpAnalysisStore({
    filePath: path.join(dir, 'scalp.json'),
  });
}

test('createSession + addMetrics + verifySession', async () => {
  const store = await mkStore();
  const session = await store.createSession(
    {
      tenantId: 'hairtpclinic',
      patientId: 'pat-scalp-1',
      sessionType: 'consultation',
      source: 'aisia_ds3',
    },
    { actor: { userId: 'u1', role: 'operator' } }
  );
  assert.ok(session.id);
  assert.equal(session.status, 'draft');

  const metrics = await store.addMetrics(
    session.id,
    [{ metricType: 'total_hair_count', value: 150, unit: 'count', source: 'manual' }],
    { actor: { userId: 'u1' } }
  );
  assert.equal(metrics.length, 1);

  const verified = await store.verifySession(session.id, {
    verifiedBy: 'u1',
    clinicianNotes: 'OK baseline',
    actor: { userId: 'u1' },
  });
  assert.equal(verified.status, 'verified');
  assert.equal(verified.clinicianNotes, 'OK baseline');
});

test('checkCaptureProtocolCompleteness flags missing donor zones', async () => {
  const store = await mkStore();
  const session = await store.createSession(
    {
      tenantId: 'hairtpclinic',
      patientId: 'pat-scalp-2',
      sessionType: 'consultation',
      source: 'aisia_ds3',
    },
    { actor: { userId: 'u1' } }
  );
  await store.addImage(
    {
      sessionId: session.id,
      patientId: session.patientId,
      zone: 'global_front',
      assetId: 'asset-1',
    },
    { actor: { userId: 'u1' } }
  );
  const protocol = store.checkCaptureProtocolCompleteness(session.id);
  assert.equal(protocol.missingDonorLeft, true);
  assert.equal(protocol.missingDonorRight, true);
  assert.ok(protocol.missingZones.length > 0);
});

test('createComparison computes metric deltas', async () => {
  const store = await mkStore();
  const baseline = await store.createSession(
    {
      tenantId: 'hairtpclinic',
      patientId: 'pat-scalp-3',
      sessionType: 'consultation',
      source: 'aisia_ds3',
    },
    { actor: { userId: 'u1' } }
  );
  const followUp = await store.createSession(
    {
      tenantId: 'hairtpclinic',
      patientId: 'pat-scalp-3',
      sessionType: 'follow_up',
      source: 'aisia_ds3',
    },
    { actor: { userId: 'u1' } }
  );
  await store.addMetrics(baseline.id, [
    { metricType: 'total_hair_count', value: 100, source: 'manual' },
  ]);
  await store.addMetrics(followUp.id, [
    { metricType: 'total_hair_count', value: 120, source: 'manual' },
  ]);

  const comparison = await store.createComparison(
    {
      patientId: 'pat-scalp-3',
      baselineSessionId: baseline.id,
      comparisonSessionId: followUp.id,
    },
    { actor: { userId: 'u1' } }
  );
  assert.equal(comparison.metricChanges.total_hair_count.delta, 20);
});

test('timeline events recorded for patient', async () => {
  const store = await mkStore();
  const session = await store.createSession(
    {
      tenantId: 'hairtpclinic',
      patientId: 'pat-scalp-4',
      sessionType: 'consultation',
      source: 'aisia_ds3',
    },
    { actor: { userId: 'u1' } }
  );
  await store.verifySession(session.id, { verifiedBy: 'u1', actor: { userId: 'u1' } });
  const timeline = store.listTimelineForPatient('pat-scalp-4');
  assert.ok(timeline.some((e) => e.type === 'scalp_analysis_verified'));
});
