'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

function fileChecksum(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

test('CLI läser hela store-populationen över 50 000 utan att skriva till källfilen', async (t) => {
  const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'arcana-cliento-coverage-'));
  t.after(() => fsPromises.rm(dir, { recursive: true, force: true }));
  const storePath = path.join(dir, 'cliento-bookings.json');
  const leftRows = Array.from({ length: 50001 }, (_, index) => ({
    bookingId: `left-${index}`,
    status: 'completed',
    startsAt: '2026-07-01T08:00:00.000Z',
    serviceLabel: 'Fysisk konsultation',
  }));
  await fsPromises.writeFile(
    storePath,
    JSON.stringify({
      version: 1,
      bookings: {
        'hair_tp::bulk@example.test': leftRows,
        'hair-tp-clinic::one@example.test': [
          {
            bookingId: 'right-only',
            status: 'completed',
            startsAt: '2026-07-01T08:00:00.000Z',
            serviceLabel: 'Fysisk konsultation',
          },
        ],
      },
      imports: {},
    })
  );
  const beforeChecksum = fileChecksum(storePath);

  const result = spawnSync(
    process.execPath,
    [
      'scripts/report-cliento-cross-tenant-coverage.js',
      '--store',
      storePath,
      '--expected-total',
      '50002',
      '--sample-limit',
      '0',
    ],
    { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.population.limitApplied, null);
  assert.equal(report.population.totalOccurrences, 50002);
  assert.equal(report.population.left.occurrences, 50001);
  assert.equal(report.population.complete, true);
  assert.equal(report.zeroWrites, true);
  assert.equal(fileChecksum(storePath), beforeChecksum);
});

test('CLI stoppar på saknad store i stället för att rapportera en tom population', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/report-cliento-cross-tenant-coverage.js', '--store', '/missing/cliento.json'],
    { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Store-filen finns inte/);
});
