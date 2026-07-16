'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateIntegrityPayload,
  validateUnlinkedPayload,
  runVerification,
} = require('../../scripts/verify-cco-canonical-bookings-prod');

function response(body, { status = 200, cacheControl = 'no-store' } = {}) {
  return {
    status,
    headers: { get: (name) => (name.toLowerCase() === 'cache-control' ? cacheControl : '') },
    async json() {
      return body;
    },
  };
}

function reviewRow(index) {
  return {
    bookingId: `booking-${index}`,
    date: '2026-01-01',
    identityBasis: [{ type: 'email', masked: 'a***@e***.com' }],
    reasonCode: 'no_canonical_match',
    reason: 'Ingen canonical match.',
    patientId: null,
    encounterId: null,
    readOnly: true,
    linkAllowed: false,
  };
}

test('canonical booking verifier performs exactly two authenticated GET requests', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/canonical-integrity')) {
      return response({
        zeroWrites: true,
        readOnly: true,
        ok: true,
        totalIssues: 0,
        totalVisits: 4,
        byStatus: { upcoming: 1, completed: 1, cancelled: 1, no_show: 1 },
        encounterCoverage: { withEncounter: 2, withoutEncounter: 2 },
        issues: [],
        issueSamplesTruncated: false,
      });
    }
    return response({ zeroWrites: true, total: 2, rows: [reviewRow(1), reviewRow(2)] });
  };

  const result = await runVerification({
    baseUrl: 'https://arcana.example/',
    token: 'secret-token',
    expectedCount: 2,
    fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.equal(result.zeroWrites, true);
  assert.deepEqual(result.requestMethods, ['GET', 'GET']);
  assert.equal(calls.length, 2);
  assert.equal(
    calls.every((call) => call.options.method === 'GET'),
    true
  );
  assert.equal(
    calls.every((call) => call.options.headers.Authorization === 'Bearer secret-token'),
    true
  );
});

test('canonical booking verifier fails closed on integrity and review deviations', async () => {
  assert.deepEqual(
    validateIntegrityPayload({
      zeroWrites: false,
      readOnly: false,
      ok: false,
      totalIssues: 1,
      totalVisits: 2,
      byStatus: { completed: 1 },
      encounterCoverage: { withEncounter: 0, withoutEncounter: 1 },
      issues: [{ code: 'invalid_status' }],
    }),
    [
      'integrity.zeroWrites_not_true',
      'integrity.readOnly_not_true',
      'integrity.ok_not_true',
      'integrity.totalIssues_not_zero',
      'integrity.issues_not_empty',
      'integrity.status_total_mismatch',
      'integrity.encounter_total_mismatch',
    ]
  );

  const unsafeRow = reviewRow(1);
  unsafeRow.patientId = 'candidate-patient';
  unsafeRow.identityBasis[0].raw = 'person@example.com';
  const errors = validateUnlinkedPayload({ zeroWrites: true, total: 1, rows: [unsafeRow] }, 2);
  assert.equal(errors.includes('unlinked.total_mismatch'), true);
  assert.equal(errors.includes('unlinked.rows_mismatch'), true);
  assert.equal(errors.includes('unlinked.row_0.patientId_not_null'), true);
  assert.equal(errors.includes('unlinked.row_0.identity_contains_raw_or_candidate_field'), true);
});

test('canonical booking verifier requires explicit target, token and integer expectation', async () => {
  await assert.rejects(() => runVerification({ token: 'x' }), /BASE_URL/);
  await assert.rejects(() => runVerification({ baseUrl: 'https://arcana.example' }), /TOKEN/);
  await assert.rejects(
    () =>
      runVerification({
        baseUrl: 'https://arcana.example',
        token: 'x',
        expectedCount: 1.5,
      }),
    /heltal/
  );
});
