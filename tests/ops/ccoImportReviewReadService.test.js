'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  loadSummary,
  listQueue,
  invalidateImportReviewCache,
} = require('../../src/ops/ccoImportReviewReadService');

const REPO = path.join(__dirname, '../..');
const dataDir = path.join(REPO, 'data');

test('counts halso@ and GetAccept from object items', () => {
  invalidateImportReviewCache();
  const summary = loadSummary(dataDir, REPO);
  if (!summary.liveQueuePath) {
    assert.equal(summary.total, 1497);
    return;
  }
  assert.equal(summary.operatorScope, true);
  assert.ok(summary.total > 0);
  const halso = summary.sources.find((s) => s.id === 'halso');
  const ga = summary.sources.find((s) => s.id === 'getaccept');
  assert.ok(halso.queueCount > 0);
  assert.ok(ga.queueCount > 0);
  assert.equal(halso.queueCount + ga.queueCount, summary.total);
});

test('lists pending queue page read-only', () => {
  invalidateImportReviewCache();
  const page = listQueue(dataDir, { source: 'halso', limit: 5, offset: 0 });
  if (page.total === 0) return;
  assert.ok(page.items.length <= 5);
  assert.equal(page.writeEnabled, false);
  assert.ok(page.items[0].preparedActions?.length > 0);
});

test('assets fallback synthesizes GetAccept + journal_sign owner rows', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'import-review-assets-'));
  const assetsPath = path.join(tmp, 'cco-patient-assets.json');
  fs.writeFileSync(
    assetsPath,
    JSON.stringify({
      items: {
        ga1: {
          id: 'ga1',
          status: 'NEEDS_REVIEW',
          sourceSystem: 'getaccept_import',
          category: 'agreement',
          patientId: 'pat_a',
          originalFileName: 'avtal.pdf',
        },
        js1: {
          id: 'js1',
          status: 'NEEDS_REVIEW',
          sourceSystem: 'cco_journal_sign',
          category: 'journal',
          patientId: 'anon-x',
          originalFileName: 'journal.pdf',
        },
        skip: {
          id: 'skip',
          status: 'VISIBLE_ON_PATIENT_CARD',
          sourceSystem: 'getaccept_import',
        },
      },
    })
  );
  const prevAssets = process.env.ARCANA_CCO_PATIENT_ASSETS_PATH;
  const prevState = process.env.ARCANA_STATE_ROOT;
  process.env.ARCANA_CCO_PATIENT_ASSETS_PATH = assetsPath;
  process.env.ARCANA_STATE_ROOT = tmp;
  try {
    invalidateImportReviewCache();
    const summary = loadSummary(tmp, REPO);
    assert.equal(summary.dataSource, 'patient_assets_needs_review');
    const ga = summary.sources.find((s) => s.id === 'getaccept');
    const js = summary.sources.find((s) => s.id === 'journal_sign');
    assert.equal(ga.queueCount, 1);
    assert.equal(js.queueCount, 1);
    const page = listQueue(tmp, { source: 'owner117', limit: 10 });
    assert.equal(page.total, 2);
    assert.ok(page.items.every((i) => i.readOnlyOwnerQueue === true));
  } finally {
    if (prevAssets == null) delete process.env.ARCANA_CCO_PATIENT_ASSETS_PATH;
    else process.env.ARCANA_CCO_PATIENT_ASSETS_PATH = prevAssets;
    if (prevState == null) delete process.env.ARCANA_STATE_ROOT;
    else process.env.ARCANA_STATE_ROOT = prevState;
    invalidateImportReviewCache();
  }
});
