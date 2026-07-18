'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const {
  buildClientoCrossTenantDecisionReport,
  deltaBucket,
} = require('../../scripts/report-cliento-cross-tenant-decision');

function booking(bookingId, overrides = {}) {
  return {
    bookingId,
    status: 'completed',
    startsAt: '2026-07-01T08:00:00.000Z',
    endsAt: '2026-07-01T08:30:00.000Z',
    durationMinutes: 30,
    serviceId: 'consultation-physical',
    serviceLabel: 'Fysisk konsultation',
    bookingNotes: '',
    customerMessage: '',
    internalNotes: '',
    treatmentNotes: '',
    notes: '',
    ...overrides,
  };
}

test('klassificerar core-only, note-only och kombinerad konflikt utan identifierare', () => {
  const left = [
    booking('core', { status: 'completed' }),
    booking('note', { treatmentNotes: 'vänster' }),
    booking('both', { startsAt: '2026-07-01T08:00:00.000Z', notes: 'vänster' }),
  ];
  const right = [
    booking('core', { status: 'cancelled' }),
    booking('note', { treatmentNotes: 'höger' }),
    booking('both', { startsAt: '2026-07-01T09:00:00.000Z', notes: 'höger' }),
  ];
  const report = buildClientoCrossTenantDecisionReport({
    leftBookings: left,
    rightBookings: right,
    expectedTotal: 6,
    expectedConflicts: 3,
    expectedComplementaryNotes: 0,
  });
  assert.deepEqual(report.conflictAnalysis.types, {
    core_only: 1,
    note_only: 1,
    core_and_note: 1,
    intra_tenant_duplicate: 0,
  });
  assert.equal(report.conflictAnalysis.coreFields.status, 1);
  assert.equal(report.conflictAnalysis.coreFields.startsAt, 1);
  assert.equal(report.conflictAnalysis.noteFields.treatmentNotes.differentNonEmpty, 1);
  assert.equal(report.conflictAnalysis.noteFields.notes.differentNonEmpty, 1);
  assert.equal(report.safety.bookingIdsEmitted, 0);
  assert.equal(JSON.stringify(report).includes('"bookingId"'), false);
  assert.equal(JSON.stringify(report).includes('vänster'), false);
  assert.equal(report.gate.status, 'review_plan_only');
});

test('räknar kompletterande noter per källriktning och förbjuder radvinnare', () => {
  const report = buildClientoCrossTenantDecisionReport({
    leftBookings: [booking('notes', { bookingNotes: 'vänster' })],
    rightBookings: [booking('notes', { customerMessage: 'höger' })],
    expectedTotal: 2,
    expectedConflicts: 0,
    expectedComplementaryNotes: 1,
  });
  assert.equal(report.complementaryNotesPreservation.byField.bookingNotes.leftOnly, 1);
  assert.equal(report.complementaryNotesPreservation.byField.customerMessage.rightOnly, 1);
  assert.equal(report.complementaryNotesPreservation.rowWinnerAllowed, false);
  assert.equal(report.complementaryNotesPreservation.destructiveFieldSelectionAllowed, false);
  assert.equal(report.safety.bookingWrites, 0);
  assert.equal(report.safety.linkWrites, 0);
});

test('blockerar vid populationsdrift eller ändrat konfliktantal', () => {
  const report = buildClientoCrossTenantDecisionReport({
    leftBookings: [booking('same')],
    rightBookings: [booking('same')],
    expectedTotal: 55221,
    expectedConflicts: 308,
    expectedComplementaryNotes: 15190,
  });
  assert.equal(report.gate.expectationsMet, false);
  assert.equal(report.gate.status, 'blocked_population_drift');
  assert.equal(report.gate.mergeAllowed, false);
  assert.equal(report.gate.persistentLinkWriteAllowed, false);
});

test('bucketar tidsdeltan deterministiskt', () => {
  assert.equal(deltaBucket(0), 'abs_0_5_min');
  assert.equal(deltaBucket(-30), 'abs_6_30_min');
  assert.equal(deltaBucket(60), 'abs_31_60_min');
  assert.equal(deltaBucket(1440), 'abs_61_1440_min');
  assert.equal(deltaBucket(1441), 'abs_over_1440_min');
  assert.equal(deltaBucket(null), 'invalid');
});

test('CLI lämnar store byte-identisk och emitterar ingen bookingId eller nottext', async (t) => {
  const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'arcana-cliento-decision-'));
  t.after(() => fsPromises.rm(dir, { recursive: true, force: true }));
  const storePath = path.join(dir, 'cliento-bookings.json');
  await fsPromises.writeFile(
    storePath,
    JSON.stringify({
      version: 1,
      bookings: {
        'hair_tp::left@example.test': [
          booking('secret-booking-id', { bookingNotes: 'hemlig vänsternot' }),
        ],
        'hair-tp-clinic::right@example.test': [booking('secret-booking-id')],
      },
      imports: {},
    })
  );
  const checksum = () =>
    crypto.createHash('sha256').update(fs.readFileSync(storePath)).digest('hex');
  const before = checksum();
  const result = spawnSync(
    process.execPath,
    [
      'scripts/report-cliento-cross-tenant-decision.js',
      '--store',
      storePath,
      '--expected-total',
      '2',
      '--expected-conflicts',
      '0',
      '--expected-complementary',
      '1',
    ],
    { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(checksum(), before);
  assert.equal(result.stdout.includes('secret-booking-id'), false);
  assert.equal(result.stdout.includes('hemlig vänsternot'), false);
  const report = JSON.parse(result.stdout);
  assert.equal(report.zeroWrites, true);
  assert.equal(report.gate.status, 'review_plan_only');
});
