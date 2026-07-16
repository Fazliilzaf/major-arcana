#!/usr/bin/env node
'use strict';

/**
 * Read-only post-deploy verifier for #999.
 * Requires an explicit target and bearer token and only performs GET requests.
 */

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function validateIntegrityPayload(payload) {
  const body = asObject(payload);
  const errors = [];
  if (body.zeroWrites !== true) errors.push('integrity.zeroWrites_not_true');
  if (body.readOnly !== true) errors.push('integrity.readOnly_not_true');
  if (body.ok !== true) errors.push('integrity.ok_not_true');
  if (body.unavailable === true) errors.push('integrity.unavailable');
  if (Number(body.totalIssues) !== 0) errors.push('integrity.totalIssues_not_zero');
  if (asArray(body.issues).length !== 0) errors.push('integrity.issues_not_empty');
  if (body.issueSamplesTruncated === true) errors.push('integrity.issues_truncated');

  const totalVisits = Number(body.totalVisits);
  if (!Number.isInteger(totalVisits) || totalVisits < 0) {
    errors.push('integrity.totalVisits_invalid');
  }
  const statusCounts = Object.values(asObject(body.byStatus));
  if (statusCounts.some((count) => !Number.isInteger(Number(count)) || Number(count) < 0)) {
    errors.push('integrity.status_count_invalid');
  }
  const statusTotal = statusCounts.reduce((sum, count) => sum + (Number(count) || 0), 0);
  if (Number.isInteger(totalVisits) && statusTotal !== totalVisits) {
    errors.push('integrity.status_total_mismatch');
  }
  const encounter = asObject(body.encounterCoverage);
  if (
    !Number.isInteger(Number(encounter.withEncounter)) ||
    Number(encounter.withEncounter) < 0 ||
    !Number.isInteger(Number(encounter.withoutEncounter)) ||
    Number(encounter.withoutEncounter) < 0
  ) {
    errors.push('integrity.encounter_count_invalid');
  }
  const encounterTotal = Number(encounter.withEncounter) + Number(encounter.withoutEncounter);
  if (Number.isInteger(totalVisits) && encounterTotal !== totalVisits) {
    errors.push('integrity.encounter_total_mismatch');
  }
  return errors;
}

function validateUnlinkedPayload(payload, expectedCount = 55) {
  const body = asObject(payload);
  const errors = [];
  const rows = asArray(body.rows);
  if (body.zeroWrites !== true) errors.push('unlinked.zeroWrites_not_true');
  if (Number(body.total) !== expectedCount) errors.push('unlinked.total_mismatch');
  if (rows.length !== expectedCount) errors.push('unlinked.rows_mismatch');

  rows.forEach((rawRow, index) => {
    const row = asObject(rawRow);
    const prefix = `unlinked.row_${index}`;
    if (row.patientId !== null) errors.push(`${prefix}.patientId_not_null`);
    if (row.encounterId !== null) errors.push(`${prefix}.encounterId_not_null`);
    if (row.linkAllowed !== false) errors.push(`${prefix}.linkAllowed_not_false`);
    if (row.readOnly !== true) errors.push(`${prefix}.readOnly_not_true`);
    if (!row.bookingId || !row.date || !row.reasonCode || !row.reason) {
      errors.push(`${prefix}.review_fields_missing`);
    }
    const identityBasis = asArray(row.identityBasis);
    if (!identityBasis.length) errors.push(`${prefix}.identityBasis_missing`);
    for (const identity of identityBasis) {
      const safe = asObject(identity);
      if (!safe.type || !safe.masked) errors.push(`${prefix}.masked_identity_missing`);
      if ('key' in safe || 'raw' in safe || 'value' in safe || 'patientId' in safe) {
        errors.push(`${prefix}.identity_contains_raw_or_candidate_field`);
      }
    }
    if ('candidatePatientId' in row || 'suggestedPatientId' in row || 'matchPatientId' in row) {
      errors.push(`${prefix}.candidate_link_present`);
    }
  });
  return errors;
}

async function getJson(fetchImpl, url, token) {
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    signal:
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(30_000)
        : undefined,
  });
  const body = await response.json().catch(() => ({}));
  return {
    status: response.status,
    cacheControl: response.headers?.get?.('cache-control') || '',
    body,
  };
}

async function runVerification({ baseUrl, token, expectedCount = 55, fetchImpl = fetch } = {}) {
  const target = String(baseUrl || '').replace(/\/+$/, '');
  const bearer = String(token || '').trim();
  if (!target) throw new Error('BASE_URL krävs explicit');
  if (!bearer) throw new Error('ARCANA_SMOKE_BEARER_TOKEN krävs explicit');
  const parsed = new URL(target);
  if (!['https:', 'http:'].includes(parsed.protocol))
    throw new Error('BASE_URL måste vara http(s)');
  if (
    parsed.protocol !== 'https:' &&
    !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
  ) {
    throw new Error('Icke-lokal BASE_URL måste använda https');
  }
  if (!Number.isInteger(expectedCount) || expectedCount < 0) {
    throw new Error('EXPECTED_UNLINKED_REVIEW_COUNT måste vara ett heltal >= 0');
  }

  const integrity = await getJson(
    fetchImpl,
    `${target}/api/v1/cco-bookings/canonical-integrity`,
    bearer
  );
  const unlinked = await getJson(
    fetchImpl,
    `${target}/api/v1/cco-bookings/cliento-unlinked-review`,
    bearer
  );
  const errors = [];
  if (integrity.status !== 200) errors.push(`integrity.http_${integrity.status}`);
  if (!/\bno-store\b/i.test(integrity.cacheControl)) errors.push('integrity.cache_not_no_store');
  if (unlinked.status !== 200) errors.push(`unlinked.http_${unlinked.status}`);
  if (!/\bno-store\b/i.test(unlinked.cacheControl)) errors.push('unlinked.cache_not_no_store');
  errors.push(...validateIntegrityPayload(integrity.body));
  errors.push(...validateUnlinkedPayload(unlinked.body, expectedCount));

  return {
    ok: errors.length === 0,
    zeroWrites: true,
    requestMethods: ['GET', 'GET'],
    expectedUnlinkedReviewCount: expectedCount,
    totalVisits: Number(integrity.body?.totalVisits) || 0,
    unlinkedReviewCount: Number(unlinked.body?.total) || 0,
    errors,
  };
}

async function main() {
  const expectedRaw = process.env.EXPECTED_UNLINKED_REVIEW_COUNT || '55';
  if (!/^\d+$/.test(expectedRaw)) {
    throw new Error('EXPECTED_UNLINKED_REVIEW_COUNT måste vara ett heltal >= 0');
  }
  const result = await runVerification({
    baseUrl: process.env.BASE_URL,
    token: process.env.ARCANA_SMOKE_BEARER_TOKEN,
    expectedCount: Number(expectedRaw),
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 2;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(String(error?.stack || error));
    process.exit(1);
  });
}

module.exports = {
  validateIntegrityPayload,
  validateUnlinkedPayload,
  runVerification,
};
