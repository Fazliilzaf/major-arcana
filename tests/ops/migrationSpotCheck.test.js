const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { evaluateSpotCheck } = require('../../scripts/migration/lib/spotCheckCore');

test('evaluateSpotCheck hittar overlap mellan index och patient master', () => {
  const root = path.join(__dirname, '..');
  const indexRaw = JSON.parse(
    fs.readFileSync(path.join(root, 'fixtures', 'migration-index-sample.json'), 'utf8')
  );
  const masterRaw = JSON.parse(
    fs.readFileSync(path.join(root, 'fixtures', 'migration-patient-master-sample.json'), 'utf8')
  );

  const result = evaluateSpotCheck({
    indexRaw,
    masterRaw,
    tenantId: 'hair-tp-clinic',
    minMatches: 2,
    sampleSize: 2,
    shuffleFn: (items) => items,
  });

  assert.equal(result.overlapCount, 2);
  assert.equal(result.checks.overlapMin, true);
  assert.equal(result.checks.sampleClean, true);
  assert.equal(result.warnings.length, 0);
});

test('evaluateSpotCheck flaggar saknad journal_pdf i sample', () => {
  const indexRaw = {
    files: [
      {
        personnummer: '19801224-5513',
        displayName: 'David Persson',
        fileType: 'image',
      },
    ],
  };
  const masterRaw = {
    patients: [
      {
        tenantId: 'hair-tp-clinic',
        personnummer: '19801224-5513',
        displayName: 'David Persson',
      },
    ],
  };

  const result = evaluateSpotCheck({
    indexRaw,
    masterRaw,
    minMatches: 1,
    sampleSize: 1,
    shuffleFn: (items) => items,
  });

  assert.equal(result.checks.sampleClean, false);
  assert.equal(result.warnings[0].type, 'missing_journal_pdf');
});
