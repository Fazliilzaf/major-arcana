'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCustomerHandoffUrl,
  validateVersionGate,
  validateCanonicalRows,
  validateUnlinkedRows,
  validatePagination,
  runVerification,
  buildEvidence,
} = require('../../scripts/verify-calendar-history-search-prod-smoke');

function response(body, { status = 200, headers = {} } = {}) {
  const lowerHeaders = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)])
  );
  return {
    status,
    headers: {
      get(name) {
        return lowerHeaders.get(String(name).toLowerCase()) || '';
      },
    },
    async json() {
      return body;
    },
    async text() {
      return typeof body === 'string' ? body : JSON.stringify(body);
    },
  };
}

function historyPayload(rows, { limit = 100, offset = 0, total = rows.length } = {}) {
  return {
    ok: true,
    readOnly: true,
    zeroWrites: true,
    rows,
    pagination: {
      limit,
      offset,
      total,
      returned: rows.length,
      hasMore: offset + rows.length < total,
    },
  };
}

function canonicalRow(id = 'patient-canonical', bookingId = 'booking-canonical') {
  return {
    kind: 'canonical_visit',
    readOnly: true,
    zeroWrites: true,
    linkAllowed: true,
    patientId: id,
    bookingId,
    startsAt: '2026-07-20T07:00:00.000Z',
    stockholmTime: '09:00',
    timeZone: 'Europe/Stockholm',
    serviceDisplayName: 'Fysisk konsultation',
  };
}

function unlinkedRow(bookingId = 'booking-unlinked') {
  return {
    kind: 'separate_unlinked_historical',
    readOnly: true,
    zeroWrites: true,
    linkAllowed: false,
    patientId: null,
    encounterId: null,
    canonicalEncounterId: null,
    bookingId,
    startsAt: '2026-07-20T08:00:00.000Z',
    stockholmTime: '10:00',
    timeZone: 'Europe/Stockholm',
    sourceRecords: [
      { tenantId: 'hair_tp', bookingId },
      { tenantId: 'hair-tp-clinic', bookingId },
    ],
  };
}

test('version gate must pass diag commit and X-Arcana-UI-Build before history-search can run', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/api/v1/_diag/version')) {
      return response({ ok: true, commit: 'old0000' });
    }
    return response('<html></html>', { headers: { 'x-arcana-ui-build': 'old0000' } });
  };

  const result = await runVerification({
    baseUrl: 'https://arcana.example',
    expectedSha: 'ba80b72',
    staffToken: 'staff-token',
    patientToken: 'patient-token',
    canonicalQuery: 'fy',
    unlinkedQuery: 'oklar',
    fetchImpl,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blocked, true);
  assert.equal(result.blocker, 'version_not_live');
  assert.deepEqual(result.requestMethods, ['GET', 'GET']);
  assert.equal(calls.length, 2);
  assert.equal(
    calls.some((call) => call.url.includes('/history-search')),
    false
  );
});

test('prod smoke performs only GETs and verifies 401, 403, canonical, unlinked and pagination contracts', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/api/v1/_diag/version')) {
      return response({ ok: true, commit: 'ba80b72248da2f94416938317df1c5fba7b38b07' });
    }
    if (url.endsWith('/admin')) {
      return response('<html></html>', {
        headers: { 'x-arcana-ui-build': 'ba80b72248da2f94416938317df1c5fba7b38b07' },
      });
    }
    const parsed = new URL(url);
    assert.equal(parsed.pathname, '/api/v1/cco-bookings/history-search');
    const auth = options.headers.Authorization || '';
    const q = parsed.searchParams.get('q');
    const limit = parsed.searchParams.get('limit');
    const offset = parsed.searchParams.get('offset') || '0';
    if (!auth) return response({ error: 'unauthorized' }, { status: 401 });
    if (auth === 'Bearer patient-token') return response({ error: 'forbidden' }, { status: 403 });
    if (q === 'oklar') return response(historyPayload([unlinkedRow()], { limit: 30, total: 1 }));
    if (limit === '999') {
      return response(historyPayload([canonicalRow()], { limit: 100, total: 3 }));
    }
    if (limit === '2' && offset === '0') {
      return response(
        historyPayload([canonicalRow('patient-a', 'booking-a')], { limit: 2, total: 3 })
      );
    }
    if (limit === '2' && offset === '2') {
      return response(
        historyPayload([canonicalRow('patient-b', 'booking-b')], { limit: 2, offset: 2, total: 3 })
      );
    }
    throw new Error(`unexpected request ${url}`);
  };

  const result = await runVerification({
    baseUrl: 'https://arcana.example',
    expectedSha: 'ba80b722',
    staffToken: 'staff-token',
    patientToken: 'patient-token',
    canonicalQuery: 'fy',
    unlinkedQuery: 'oklar',
    expectedCanonicalPatientId: 'patient-canonical',
    fetchImpl,
  });

  assert.equal(result.ok, true);
  assert.equal(result.zeroWrites, true);
  assert.equal(
    calls.every((call) => call.options.method === 'GET'),
    true
  );
  assert.equal(result.checks.auth401.ok, true);
  assert.equal(result.checks.rbac403.ok, true);
  assert.equal(result.checks.canonical.handoffUrlPatternOk, true);
  assert.equal(result.checks.unlinked.handoffSuppressed, true);
  assert.equal(result.checks.pagination.ok, true);
});

test('validators fail closed on handoff, tenant and pagination deviations', () => {
  assert.deepEqual(
    validateVersionGate({
      diagStatus: 200,
      diagBody: { commit: 'ba80b72248da2f94416938317df1c5fba7b38b07' },
      adminStatus: 200,
      uiBuildHeader: '',
      expectedSha: 'ba80b722',
    }).errors,
    ['version.ui_build_mismatch']
  );

  const canonical = validateCanonicalRows(
    historyPayload([{ ...canonicalRow('', 'bad'), patientId: '', linkAllowed: false }], {
      limit: 100,
      total: 1,
    })
  );
  assert.equal(canonical.ok, false);
  assert.equal(canonical.errors.includes('canonical.linkable_patient_row_missing'), true);

  const unsafeUnlinked = unlinkedRow();
  unsafeUnlinked.sourceRecords.push({ tenantId: 'other-tenant', bookingId: 'leak' });
  unsafeUnlinked.patientEmail = 'raw@example.com';
  const unlinked = validateUnlinkedRows(historyPayload([unsafeUnlinked], { limit: 30, total: 1 }));
  assert.equal(unlinked.ok, false);
  assert.equal(unlinked.errors.includes('unlinked.tenant_scope_leak'), true);
  assert.equal(unlinked.errors.includes('unlinked.patient_email_leak'), true);

  const pagination = validatePagination(
    historyPayload([canonicalRow('patient-a', 'same')], { limit: 2, offset: 0, total: 3 }),
    historyPayload([canonicalRow('patient-a', 'same')], { limit: 2, offset: 2, total: 3 })
  );
  assert.equal(pagination.ok, false);
  assert.equal(pagination.errors.includes('pagination.duplicate_row_across_pages'), true);
});

test('evidence output is aggregate and token/PII free', () => {
  const evidence = buildEvidence(
    {
      ok: true,
      zeroWrites: true,
      requestMethods: ['GET'],
      versionGate: {
        ok: true,
        expectedSha: 'ba80b722',
        diagCommit: 'ba80b72248da2f94416938317df1c5fba7b38b07',
        uiBuildHeader: 'ba80b72248da2f94416938317df1c5fba7b38b07',
      },
      checks: {
        canonical: {
          maskedCanonicalPatient: 'masked-only',
          token: 'must-not-leak',
          patientName: 'Private Patient',
          notes: 'Private note',
        },
      },
      errors: [],
    },
    { baseUrl: 'https://arcana.example/admin#cco', generatedAt: '2026-07-19T12:00:00.000Z' }
  );
  const serialized = JSON.stringify(evidence);
  assert.equal(evidence.targetOrigin, 'https://arcana.example');
  assert.match(buildCustomerHandoffUrl('patient-123'), /\/staff\?view=customers&/);
  assert.doesNotMatch(serialized, /must-not-leak|Private Patient|Private note|admin#cco/);
});
