'use strict';

/**
 * Bygger en läs-endast vy över needs_review_for_naming-kön.
 *
 * Används både av CLI-rapporten (scripts/report-naming-review-queue.js)
 * och av HTTP-endpointen (src/routes/ccoNamingReview.js).
 *
 * Skriver aldrig till någon store.
 */

const {
  resolveAliasKeyFn,
  groupByPatientId,
  assertPatientsResolved,
} = require('../ccoIdentityResolution/sharedPatientResolver');
const { needsBackfill } = require('../../../scripts/backfill-asset-display-names');
const { buildAssetNamingMetadata } = require('./index');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function maskId(value) {
  const text = normalizeText(value);
  if (!text) return '(tomt)';
  if (text.length <= 8) return `${text.slice(0, 2)}***`;
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

function classifyReason({ namingConfidence, sessionNumberIsUnreliable }) {
  const lowConfidence = namingConfidence === 'low';
  if (lowConfidence && sessionNumberIsUnreliable) return 'both';
  if (sessionNumberIsUnreliable) return 'fallback_session_number';
  if (lowConfidence) return 'low_confidence';
  return 'other';
}

/**
 * @param {object} patientStore
 * @param {object} assetStore
 * @param {object} options
 * @param {string} options.tenantId
 * @param {number} [options.top=30]
 * @param {number} [options.patientLimit=20000]
 * @param {boolean} [options.maskIds=true]
 * @returns {Promise<object>}
 */
async function buildNamingReviewQueue(patientStore, assetStore, options = {}) {
  const tenantId = normalizeText(options.tenantId);
  const top = Number.isFinite(options.top) && options.top > 0 ? options.top : 30;
  const patientLimit =
    Number.isFinite(options.patientLimit) && options.patientLimit > 0
      ? options.patientLimit
      : 20000;
  const maskIds = options.maskIds !== false;

  const reasonTotals = {
    low_confidence: 0,
    fallback_session_number: 0,
    both: 0,
    other: 0,
  };
  const byCategoryTotals = {};

  const patientsPage = await patientStore.listPatients({
    tenantId,
    limit: patientLimit,
    offset: 0,
  });
  const patients = patientsPage.patients || [];
  if (!patients.length) {
    return {
      readOnly: true,
      zeroWrites: true,
      generatedAt: new Date().toISOString(),
      tenant: tenantId,
      totalAssetsScanned: 0,
      totalReviewQueueSize: 0,
      reasonTotals,
      byCategoryTotals,
      patientsAffected: 0,
      patientsLikelyBulkFixable: 0,
      assetsLikelyBulkFixable: 0,
      note: 'Inga patienter hittades för tenant — kön är tom.',
      topPatientsByQueueSize: [],
    };
  }
  assertPatientsResolved(patients, { tenant: tenantId });

  const all = assetStore.listItemsForEnrichment(tenantId);
  const keyFn = resolveAliasKeyFn(all, patients);
  const byPatient = groupByPatientId(all, keyFn);

  const perPatient = new Map();

  for (const [patientId, siblingAssets] of byPatient) {
    for (const asset of siblingAssets) {
      if (!needsBackfill(asset, { force: false })) continue;
      let namingPatch;
      try {
        namingPatch = buildAssetNamingMetadata(asset, { siblingAssets });
      } catch {
        continue;
      }
      if (namingPatch.namingStatus !== 'needs_review_for_naming') continue;

      const reason = classifyReason(namingPatch);
      reasonTotals[reason] += 1;
      const category = normalizeText(asset.category) || '(okategoriserad)';
      byCategoryTotals[category] = (byCategoryTotals[category] || 0) + 1;

      if (!perPatient.has(patientId)) {
        perPatient.set(patientId, {
          low_confidence: 0,
          fallback_session_number: 0,
          both: 0,
          other: 0,
          total: 0,
        });
      }
      const entry = perPatient.get(patientId);
      entry[reason] += 1;
      entry.total += 1;
    }
  }

  const totalReview = Object.values(reasonTotals).reduce((sum, n) => sum + n, 0);

  const rows = [...perPatient.entries()]
    .map(([patientId, entry]) => ({
      patientId: maskIds ? maskId(patientId) : patientId,
      total: entry.total,
      lowConfidence: entry.low_confidence,
      fallbackSessionNumber: entry.fallback_session_number,
      both: entry.both,
      other: entry.other,
      likelyBulkFixable: entry.low_confidence === 0 && entry.both === 0 && entry.other === 0,
    }))
    .sort((a, b) => b.total - a.total);

  const bulkFixableCount = rows.filter((r) => r.likelyBulkFixable).length;
  const bulkFixableAssetCount = rows
    .filter((r) => r.likelyBulkFixable)
    .reduce((sum, r) => sum + r.total, 0);

  return {
    readOnly: true,
    zeroWrites: true,
    generatedAt: new Date().toISOString(),
    tenant: tenantId,
    totalAssetsScanned: all.length,
    totalReviewQueueSize: totalReview,
    reasonTotals,
    byCategoryTotals,
    patientsAffected: perPatient.size,
    patientsLikelyBulkFixable: bulkFixableCount,
    assetsLikelyBulkFixable: bulkFixableAssetCount,
    note:
      'likelyBulkFixable = patientens hela kö beror bara på fallback-daterat ' +
      'sessionNumber (inget low_confidence) — kandidat för en riktig documentDate-' +
      'backfill snarare än manuell granskning per post.',
    topPatientsByQueueSize: rows.slice(0, top),
  };
}

module.exports = {
  buildNamingReviewQueue,
  maskId,
  classifyReason,
};
