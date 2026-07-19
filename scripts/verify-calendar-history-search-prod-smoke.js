#!/usr/bin/env node
'use strict';

/**
 * Read-only post-deploy verifier for #1105 calendar history search.
 *
 * This script is intentionally fail-closed:
 * - it requires an explicit expected live commit/SHA;
 * - it checks /api/v1/_diag/version and X-Arcana-UI-Build before any history-search call;
 * - it only performs GET requests;
 * - it never prints bearer tokens, patient names, raw notes, email addresses or source records.
 */

const crypto = require('node:crypto');

const HISTORY_ENDPOINT = '/api/v1/cco-bookings/history-search';
const CUSTOMER_FLAGS = 'v9=on&demo=off&embed=admin&v11rail=on&v12workspace=on';
const SAFE_TENANTS = new Set(['hair_tp', 'hair-tp-clinic']);

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function ensureExplicitHttpsBase(baseUrl) {
  const raw = clean(baseUrl).replace(/\/+$/, '');
  if (!raw) throw new Error('BASE_URL krävs explicit');
  const parsed = new URL(raw);
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('BASE_URL måste vara http(s)');
  }
  if (
    parsed.protocol !== 'https:' &&
    !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
  ) {
    throw new Error('Icke-lokal BASE_URL måste använda https');
  }
  return raw;
}

function requireMinQuery(value, envName) {
  const query = clean(value);
  if (query.length < 2) throw new Error(`${envName} måste vara minst 2 tecken`);
  return query;
}

function requireToken(value, envName) {
  const token = clean(value);
  if (!token) throw new Error(`${envName} krävs explicit`);
  return token;
}

function normalizeExpectedSha(value) {
  const sha = clean(value).toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(sha)) {
    throw new Error('EXPECTED_SHA måste vara en git-SHA/prefix på minst 7 hex-tecken');
  }
  return sha;
}

function mask(value) {
  const raw = clean(value);
  if (!raw) return null;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12);
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

async function readText(response) {
  return response.text().catch(() => '');
}

async function get(fetchImpl, url, { token = '', accept = 'application/json' } = {}) {
  const headers = { Accept: accept };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetchImpl(url, {
    method: 'GET',
    headers,
    signal:
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(30_000)
        : undefined,
  });
  return response;
}

function header(response, name) {
  return clean(
    response?.headers?.get?.(name) || response?.headers?.get?.(name.toLowerCase()) || ''
  );
}

function buildCustomerHandoffUrl(patientId) {
  const id = clean(patientId);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) return null;
  return `/staff?view=customers&${CUSTOMER_FLAGS}&patientId=${encodeURIComponent(id)}`;
}

function validateVersionGate({ diagStatus, diagBody, adminStatus, uiBuildHeader, expectedSha }) {
  const errors = [];
  const expected = normalizeExpectedSha(expectedSha);
  const commit = clean(asObject(diagBody).commit).toLowerCase();
  const uiBuild = clean(uiBuildHeader).toLowerCase();
  if (diagStatus !== 200) errors.push(`version.diag_http_${diagStatus}`);
  if (adminStatus !== 200) errors.push(`version.admin_http_${adminStatus}`);
  if (!commit || commit === 'unknown' || !commit.startsWith(expected)) {
    errors.push('version.diag_commit_mismatch');
  }
  if (!uiBuild || !uiBuild.includes(expected)) {
    errors.push('version.ui_build_mismatch');
  }
  return {
    ok: errors.length === 0,
    expectedSha: expected,
    diagCommit: commit || null,
    uiBuildHeader: uiBuild || null,
    errors,
  };
}

async function fetchVersionGate({ baseUrl, expectedSha, fetchImpl }) {
  const diag = await get(fetchImpl, `${baseUrl}/api/v1/_diag/version`);
  const diagBody = await readJson(diag);
  const admin = await get(fetchImpl, `${baseUrl}/admin`, { accept: 'text/html' });
  await readText(admin);
  return validateVersionGate({
    diagStatus: diag.status,
    diagBody,
    adminStatus: admin.status,
    uiBuildHeader: header(admin, 'x-arcana-ui-build'),
    expectedSha,
  });
}

function parseHistoryPayload(payload) {
  const body = asObject(payload);
  return {
    body,
    rows: asArray(body.rows),
    pagination: asObject(body.pagination),
  };
}

function rowKey(row = {}) {
  return [
    clean(row.kind),
    clean(row.patientId || 'null'),
    clean(row.bookingId || 'null'),
    clean(row.startsAt || 'null'),
  ].join('|');
}

function containsUnsafePatientLeak(row = {}) {
  return Object.hasOwn(row, 'patientEmail') || Object.hasOwn(row, 'email');
}

function validateCanonicalRows(payload, { expectedPatientId = '' } = {}) {
  const { body, rows, pagination } = parseHistoryPayload(payload);
  const errors = [];
  if (body.readOnly !== true) errors.push('canonical.readOnly_not_true');
  if (body.zeroWrites !== true) errors.push('canonical.zeroWrites_not_true');
  if (Number(pagination.limit) !== 100) errors.push('canonical.limit_not_clamped_to_100');
  if (!Number.isInteger(Number(pagination.total)) || Number(pagination.total) < 1) {
    errors.push('canonical.total_invalid');
  }
  if (!rows.length) errors.push('canonical.rows_empty');
  if (rows.some(containsUnsafePatientLeak)) errors.push('canonical.patient_email_leak');

  const expected = clean(expectedPatientId);
  const canonical = rows.find((row) => {
    if (!row || row.kind === 'separate_unlinked_historical') return false;
    if (row.linkAllowed !== true || !clean(row.patientId)) return false;
    return expected ? clean(row.patientId) === expected : true;
  });
  if (!canonical) errors.push('canonical.linkable_patient_row_missing');
  const handoffUrl = canonical ? buildCustomerHandoffUrl(canonical.patientId) : null;
  if (canonical && !handoffUrl) errors.push('canonical.handoff_patient_id_invalid');

  return {
    ok: errors.length === 0,
    errors,
    total: Number(pagination.total) || 0,
    returned: rows.length,
    maskedCanonicalPatient: canonical ? mask(canonical.patientId) : null,
    maskedCanonicalBooking: canonical ? mask(canonical.bookingId) : null,
    handoffUrlPatternOk: Boolean(handoffUrl),
  };
}

function validateUnlinkedRows(payload) {
  const { body, rows, pagination } = parseHistoryPayload(payload);
  const errors = [];
  if (body.readOnly !== true) errors.push('unlinked.readOnly_not_true');
  if (body.zeroWrites !== true) errors.push('unlinked.zeroWrites_not_true');
  if (rows.some(containsUnsafePatientLeak)) errors.push('unlinked.patient_email_leak');

  const separate = rows.find((row) => row?.kind === 'separate_unlinked_historical');
  if (!separate) errors.push('unlinked.row_missing');
  if (separate) {
    if (separate.patientId !== null) errors.push('unlinked.patientId_not_null');
    if (separate.linkAllowed !== false) errors.push('unlinked.linkAllowed_not_false');
    if (separate.encounterId !== null) errors.push('unlinked.encounterId_not_null');
    if (separate.canonicalEncounterId !== null)
      errors.push('unlinked.canonicalEncounterId_not_null');
    const tenants = asArray(separate.sourceRecords).map((record) => clean(record?.tenantId));
    if (tenants.some((tenantId) => !SAFE_TENANTS.has(tenantId))) {
      errors.push('unlinked.tenant_scope_leak');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    total: Number(pagination.total) || 0,
    returned: rows.length,
    maskedUnlinkedBooking: separate ? mask(separate.bookingId) : null,
    handoffSuppressed: separate
      ? separate.patientId === null && separate.linkAllowed === false
      : false,
  };
}

function validatePagination(pageOnePayload, pageTwoPayload) {
  const first = parseHistoryPayload(pageOnePayload);
  const second = parseHistoryPayload(pageTwoPayload);
  const errors = [];
  if (Number(first.pagination.limit) !== 2) errors.push('pagination.first_limit_not_2');
  if (Number(second.pagination.limit) !== 2) errors.push('pagination.second_limit_not_2');
  if (Number(first.pagination.offset) !== 0) errors.push('pagination.first_offset_not_0');
  if (Number(second.pagination.offset) !== 2) errors.push('pagination.second_offset_not_2');
  if (Number(first.pagination.total) !== Number(second.pagination.total)) {
    errors.push('pagination.total_not_stable');
  }
  const seen = new Set(first.rows.map(rowKey));
  if (second.rows.some((row) => seen.has(rowKey(row)))) {
    errors.push('pagination.duplicate_row_across_pages');
  }
  return {
    ok: errors.length === 0,
    errors,
    firstReturned: first.rows.length,
    secondReturned: second.rows.length,
    total: Number(first.pagination.total) || 0,
  };
}

async function fetchHistory(fetchImpl, baseUrl, params, token = '') {
  const query = new URLSearchParams(params);
  const response = await get(fetchImpl, `${baseUrl}${HISTORY_ENDPOINT}?${query.toString()}`, {
    token,
  });
  const body = await readJson(response);
  return { status: response.status, body };
}

function summarizeHttpCheck(label, actual, expected) {
  return {
    ok: actual === expected,
    status: actual,
    expectedStatus: expected,
    error: actual === expected ? null : `${label}.http_${actual}_expected_${expected}`,
  };
}

async function runVerification({
  baseUrl,
  expectedSha,
  staffToken,
  patientToken,
  canonicalQuery,
  unlinkedQuery,
  expectedCanonicalPatientId = '',
  fetchImpl = fetch,
} = {}) {
  const target = ensureExplicitHttpsBase(baseUrl);
  const expected = normalizeExpectedSha(expectedSha);
  const staffBearer = requireToken(staffToken, 'ARCANA_SMOKE_BEARER_TOKEN');
  const patientBearer = requireToken(patientToken, 'ARCANA_PATIENT_BEARER_TOKEN');
  const canonicalQ = requireMinQuery(canonicalQuery, 'ARCANA_HISTORY_CANONICAL_QUERY');
  const unlinkedQ = requireMinQuery(unlinkedQuery, 'ARCANA_HISTORY_UNLINKED_QUERY');

  const requestMethods = [];
  const versionGate = await fetchVersionGate({ baseUrl: target, expectedSha: expected, fetchImpl });
  requestMethods.push('GET', 'GET');
  if (!versionGate.ok) {
    return {
      ok: false,
      blocked: true,
      blocker: 'version_not_live',
      readOnly: true,
      zeroWrites: true,
      requestMethods,
      versionGate,
      checks: {},
      errors: versionGate.errors,
    };
  }

  const unauthorized = await fetchHistory(fetchImpl, target, { q: canonicalQ, limit: '1' });
  requestMethods.push('GET');
  const forbidden = await fetchHistory(
    fetchImpl,
    target,
    { q: canonicalQ, limit: '1' },
    patientBearer
  );
  requestMethods.push('GET');
  const canonical = await fetchHistory(
    fetchImpl,
    target,
    { q: canonicalQ, limit: '999', includeSeparate: 'true' },
    staffBearer
  );
  requestMethods.push('GET');
  const unlinked = await fetchHistory(
    fetchImpl,
    target,
    { q: unlinkedQ, limit: '30', includeSeparate: 'true' },
    staffBearer
  );
  requestMethods.push('GET');
  const pageOne = await fetchHistory(
    fetchImpl,
    target,
    { q: canonicalQ, limit: '2', offset: '0' },
    staffBearer
  );
  requestMethods.push('GET');
  const pageTwo = await fetchHistory(
    fetchImpl,
    target,
    { q: canonicalQ, limit: '2', offset: '2' },
    staffBearer
  );
  requestMethods.push('GET');

  const auth401 = summarizeHttpCheck('auth.unauthorized', unauthorized.status, 401);
  const rbac403 = summarizeHttpCheck('rbac.patient', forbidden.status, 403);
  const canonicalHttp = summarizeHttpCheck('canonical.search', canonical.status, 200);
  const unlinkedHttp = summarizeHttpCheck('unlinked.search', unlinked.status, 200);
  const pageOneHttp = summarizeHttpCheck('pagination.page_one', pageOne.status, 200);
  const pageTwoHttp = summarizeHttpCheck('pagination.page_two', pageTwo.status, 200);

  const canonicalCheck =
    canonical.status === 200
      ? validateCanonicalRows(canonical.body, { expectedPatientId: expectedCanonicalPatientId })
      : { ok: false, errors: [canonicalHttp.error].filter(Boolean) };
  const unlinkedCheck =
    unlinked.status === 200
      ? validateUnlinkedRows(unlinked.body)
      : { ok: false, errors: [unlinkedHttp.error].filter(Boolean) };
  const paginationCheck =
    pageOne.status === 200 && pageTwo.status === 200
      ? validatePagination(pageOne.body, pageTwo.body)
      : { ok: false, errors: [pageOneHttp.error, pageTwoHttp.error].filter(Boolean) };

  const checks = {
    auth401,
    rbac403,
    canonical: { ...canonicalHttp, ...canonicalCheck },
    unlinked: { ...unlinkedHttp, ...unlinkedCheck },
    pagination: {
      ok: pageOneHttp.ok && pageTwoHttp.ok && paginationCheck.ok,
      pageOneStatus: pageOne.status,
      pageTwoStatus: pageTwo.status,
      ...paginationCheck,
    },
  };
  const errors = [
    auth401.error,
    rbac403.error,
    canonicalHttp.error,
    unlinkedHttp.error,
    pageOneHttp.error,
    pageTwoHttp.error,
    ...asArray(canonicalCheck.errors),
    ...asArray(unlinkedCheck.errors),
    ...asArray(paginationCheck.errors),
  ].filter(Boolean);

  return {
    ok: errors.length === 0,
    blocked: false,
    readOnly: true,
    zeroWrites: true,
    endpoint: HISTORY_ENDPOINT,
    requestMethods,
    versionGate,
    queries: {
      canonicalQueryLength: canonicalQ.length,
      unlinkedQueryLength: unlinkedQ.length,
    },
    checks,
    errors,
  };
}

function buildEvidence(result = {}, { baseUrl = '', generatedAt = new Date().toISOString() } = {}) {
  const target = new URL(ensureExplicitHttpsBase(baseUrl));
  const checks = asObject(result.checks);
  const canonical = asObject(checks.canonical);
  const unlinked = asObject(checks.unlinked);
  const pagination = asObject(checks.pagination);
  return {
    schemaVersion: 1,
    generatedAt,
    targetOrigin: target.origin,
    readOnly: true,
    zeroWrites: result.zeroWrites === true,
    ok: result.ok === true,
    blocked: result.blocked === true,
    blocker: result.blocker || null,
    endpoint: result.endpoint || HISTORY_ENDPOINT,
    requestMethods: asArray(result.requestMethods),
    versionGate: {
      ok: result.versionGate?.ok === true,
      expectedSha: result.versionGate?.expectedSha || null,
      diagCommit: result.versionGate?.diagCommit || null,
      uiBuildHeader: result.versionGate?.uiBuildHeader || null,
      errors: asArray(result.versionGate?.errors),
    },
    checks: {
      auth401: {
        ok: checks.auth401?.ok === true,
        status: Number(checks.auth401?.status) || null,
        expectedStatus: Number(checks.auth401?.expectedStatus) || null,
      },
      rbac403: {
        ok: checks.rbac403?.ok === true,
        status: Number(checks.rbac403?.status) || null,
        expectedStatus: Number(checks.rbac403?.expectedStatus) || null,
      },
      canonical: {
        ok: canonical.ok === true,
        total: Number(canonical.total) || 0,
        returned: Number(canonical.returned) || 0,
        maskedCanonicalPatient: canonical.maskedCanonicalPatient || null,
        maskedCanonicalBooking: canonical.maskedCanonicalBooking || null,
        handoffUrlPatternOk: canonical.handoffUrlPatternOk === true,
        errors: asArray(canonical.errors),
      },
      unlinked: {
        ok: unlinked.ok === true,
        total: Number(unlinked.total) || 0,
        returned: Number(unlinked.returned) || 0,
        maskedUnlinkedBooking: unlinked.maskedUnlinkedBooking || null,
        handoffSuppressed: unlinked.handoffSuppressed === true,
        errors: asArray(unlinked.errors),
      },
      pagination: {
        ok: pagination.ok === true,
        firstReturned: Number(pagination.firstReturned) || 0,
        secondReturned: Number(pagination.secondReturned) || 0,
        total: Number(pagination.total) || 0,
        errors: asArray(pagination.errors),
      },
    },
    errors: asArray(result.errors),
  };
}

async function main() {
  const result = await runVerification({
    baseUrl: process.env.BASE_URL,
    expectedSha: process.env.EXPECTED_SHA,
    staffToken: process.env.ARCANA_SMOKE_BEARER_TOKEN,
    patientToken: process.env.ARCANA_PATIENT_BEARER_TOKEN,
    canonicalQuery: process.env.ARCANA_HISTORY_CANONICAL_QUERY,
    unlinkedQuery: process.env.ARCANA_HISTORY_UNLINKED_QUERY,
    expectedCanonicalPatientId: process.env.ARCANA_EXPECTED_CANONICAL_PATIENT_ID || '',
  });
  const evidence = buildEvidence(result, { baseUrl: process.env.BASE_URL });
  console.log(JSON.stringify(evidence, null, 2));
  if (!result.ok) process.exitCode = result.blocked ? 3 : 2;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(String(error?.stack || error));
    process.exit(1);
  });
}

module.exports = {
  HISTORY_ENDPOINT,
  buildCustomerHandoffUrl,
  validateVersionGate,
  validateCanonicalRows,
  validateUnlinkedRows,
  validatePagination,
  runVerification,
  buildEvidence,
};
