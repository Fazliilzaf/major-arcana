'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  rebuildPatientMasterIndexes,
  lookupPatientsByQuery,
  listCasesInDateRange,
  rebuildBookingCasesByDate,
} = require('../../src/ops/ccoStoreIndexes');

test('patient index lookup by email', () => {
  const bucket = {
    patients: [
      { id: 'p1', primaryEmail: 'a@test.se', emails: ['a@test.se'], displayName: 'A' },
      { id: 'p2', primaryEmail: 'b@test.se', emails: ['b@test.se'], displayName: 'B' },
    ],
  };
  rebuildPatientMasterIndexes(bucket);
  const matches = lookupPatientsByQuery(bucket, 'a@test.se');
  assert.equal(matches.length, 1);
  assert.equal(bucket.patients[matches[0]].id, 'p1');
});

test('casesByDate index filters range', () => {
  const state = {
    cases: [
      {
        tenantId: 't1',
        selectedSlots: [{ date: '2026-05-10' }],
      },
      {
        tenantId: 't1',
        selectedSlots: [{ date: '2026-06-01' }],
      },
    ],
  };
  rebuildBookingCasesByDate(state);
  const inRange = listCasesInDateRange(state, {
    tenantId: 't1',
    fromDate: '2026-05-01',
    toDate: '2026-05-31',
    limit: 10,
  });
  assert.equal(inRange.length, 1);
});
