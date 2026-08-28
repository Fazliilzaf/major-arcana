'use strict';

/**
 * Uppföljningskadens — en källa (ORD-139).
 *
 * Kadensen bor i config/cco-treatment-document-requirements.json
 * (followupCadence per behandling) och tolkas av parseCadenceOffset i
 * ccoAftercareSchedulerStore. Den finns på ETT ställe — inte i dokumentets
 * id (det var ORD-127:s misstag med follow_6 → follow_8) och inte i en
 * separat planerare.
 *
 * Testet håller ihop tre ändar: configen (TP = månader, botox = veckor,
 * bleph = dagar), parsern (h/d/w/m) och att TP-kadensen 4/8/12 inte rörts.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  parseCadenceOffset,
  createCcoAftercareSchedulerStore,
} = require('../../src/ops/ccoAftercareSchedulerStore');
const { FORM_VARIANTS, getSchema } = require('../../src/ops/ccoJournalSchemas');

const TREATMENT_REQUIREMENTS = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../config/cco-treatment-document-requirements.json'),
    'utf8'
  )
);

async function tempStoreFile() {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-kadens-'));
  return { dir, filePath: path.join(dir, 'aftercare.json') };
}

test('parseCadenceOffset tolkar veckor, dagar och månader (h/d/w/m)', () => {
  assert.deepEqual(parseCadenceOffset('2w_touchup_window'), {
    token: '2w_touchup_window',
    offsetMs: 2 * 7 * 24 * 60 * 60 * 1000,
    afterFinal: false,
    eachSession: false,
  });
  assert.deepEqual(parseCadenceOffset('7d_suture_removal'), {
    token: '7d_suture_removal',
    offsetMs: 7 * 24 * 60 * 60 * 1000,
    afterFinal: false,
    eachSession: false,
  });
  assert.equal(parseCadenceOffset('4m').offsetMs, 4 * 30 * 24 * 60 * 60 * 1000);
  assert.equal(parseCadenceOffset('1h').offsetMs, 60 * 60 * 1000);
  assert.equal(parseCadenceOffset('2w_after_each_session').eachSession, true);
  assert.equal(parseCadenceOffset('1m_after_final').afterFinal, true);
});

test('TP-kadensen är oförändrad — 4 · 8 · 12', () => {
  const t = TREATMENT_REQUIREMENTS.treatments;
  for (const key of ['fue', 'dhi', 'beard', 'eyebrow']) {
    assert.deepEqual(t[key].followupCadence, ['4m', '8m', '12m'], `${key} ska behålla 4/8/12`);
  }
});

test('estetik-kadensen är behandlingsspecifik — veckor och dagar, inte 4/8/12', () => {
  const t = TREATMENT_REQUIREMENTS.treatments;
  assert.deepEqual(t.botox.followupCadence, ['2w_touchup_window', '3m_re_treat_window']);
  assert.deepEqual(t.filler.followupCadence, ['2w_check', '12m_re_treat']);
  assert.deepEqual(t.bleph.followupCadence, ['7d_suture_removal', '3m', '12m']);
  assert.deepEqual(t.profhilo.followupCadence, ['1m', '2m_second_session', '6m']);
});

test('journalvarianterna täcker 4, 8 och 12 månader; 6_manader står kvar som legacy', () => {
  for (const variant of ['4_manader', '8_manader', '12_manader']) {
    assert.ok(FORM_VARIANTS.follow_up.includes(variant), `${variant} saknas i FORM_VARIANTS.follow_up`);
    assert.ok(getSchema('follow_up', variant), `inget schema för follow_up:${variant}`);
  }
  assert.ok(FORM_VARIANTS.follow_up.includes('6_manader'), 'legacy-varianten togs bort');
  assert.notEqual(
    FORM_VARIANTS.follow_up[0],
    '6_manader',
    '6_manader får inte vara default — nya uppföljningar ska vara 4/8/12'
  );
});

test('botox-uppföljning schemaläggs till 2 veckor, inte 4 månader (ORD-139 §2)', async () => {
  const { dir, filePath } = await tempStoreFile();
  try {
    const store = await createCcoAftercareSchedulerStore({
      filePath,
      treatmentRequirements: TREATMENT_REQUIREMENTS,
    });
    const result = await store.scheduleForCompletedEncounter({
      customerId: 'p1',
      encounterId: 'e-botox',
      treatmentKey: 'botox',
      tenantId: 't1',
      completedAt: '2026-08-01T10:00:00.000Z',
    });
    const followups = result.jobs.filter((job) => job.kind === 'followup');
    assert.equal(followups.length, 2); // 2w_touchup_window + 3m_re_treat_window
    const touchup = followups.find((job) => job.offsetToken.startsWith('2w'));
    assert.ok(touchup, 'botox ska ha en 2-veckorsuppföljning');
    assert.equal(
      touchup.dueAt,
      new Date(Date.parse('2026-08-01T10:00:00.000Z') + 2 * 7 * 24 * 60 * 60 * 1000).toISOString()
    );
    assert.ok(!followups.some((job) => job.offsetToken === '4m'), 'botox får inte ha 4m-kadens');
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

test('bleph-uppföljning schemaläggs till 7 dagar (ORD-139 §3)', async () => {
  const { dir, filePath } = await tempStoreFile();
  try {
    const store = await createCcoAftercareSchedulerStore({
      filePath,
      treatmentRequirements: TREATMENT_REQUIREMENTS,
    });
    const result = await store.scheduleForCompletedEncounter({
      customerId: 'p2',
      encounterId: 'e-bleph',
      treatmentKey: 'bleph',
      tenantId: 't1',
      completedAt: '2026-08-01T10:00:00.000Z',
    });
    const followups = result.jobs.filter((job) => job.kind === 'followup');
    const suture = followups.find((job) => job.offsetToken.startsWith('7d'));
    assert.ok(suture, 'bleph ska ha en 7-dagars suturkontroll');
    assert.equal(
      suture.dueAt,
      new Date(Date.parse('2026-08-01T10:00:00.000Z') + 7 * 24 * 60 * 60 * 1000).toISOString()
    );
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});
