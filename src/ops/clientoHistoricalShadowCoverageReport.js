'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

const { NOTE_FIELDS, classifyPair, payloadChecksums } = require('./clientoCrossTenantCoverage');
const {
  buildClientoHistoricalShadowReadmodel,
  HISTORICAL_BOOKING_LINK_TYPE,
  HISTORICAL_BOOKING_REASON,
} = require('./clientoHistoricalShadowReadmodel');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function maskedRef(value) {
  const text = normalizeText(value);
  return text ? `sha256:${sha256(text).slice(0, 16)}` : null;
}

function bookingIdOf(booking) {
  return normalizeText(booking?.bookingId || booking?.id);
}

function tenantIdOf(booking) {
  return normalizeText(booking?.tenantId || booking?.tenant);
}

function sourceKey(tenantId, bookingId) {
  return `${normalizeText(tenantId)}::${normalizeText(bookingId)}`;
}

function latestEventsByLink(events = []) {
  const byLink = new Map();
  for (const event of asArray(events)) {
    const linkId = normalizeText(event?.linkId);
    if (linkId) byLink.set(linkId, event);
  }
  return byLink;
}

function isApprovedHistoricalShadowEvent(event) {
  return (
    event?.state === 'approved' &&
    normalizeText(event?.linkType) === HISTORICAL_BOOKING_LINK_TYPE &&
    normalizeText(event?.reasonCode) === HISTORICAL_BOOKING_REASON &&
    normalizeText(event?.canonicalPatientId) &&
    !normalizeText(event?.canonicalEncounterId) &&
    asArray(event?.sourceRefs).length === 2
  );
}

function groupEntriesByBookingId(bookings = [], consumedSourceKeys = new Set()) {
  const byTenant = new Map();
  const skipped = { missingTenant: 0, missingBookingId: 0, consumedApprovedSourceRecords: 0 };
  for (const booking of asArray(bookings)) {
    const tenantId = tenantIdOf(booking);
    const bookingId = bookingIdOf(booking);
    if (!tenantId) {
      skipped.missingTenant += 1;
      continue;
    }
    if (!bookingId) {
      skipped.missingBookingId += 1;
      continue;
    }
    if (consumedSourceKeys.has(sourceKey(tenantId, bookingId))) {
      skipped.consumedApprovedSourceRecords += 1;
      continue;
    }
    if (!byTenant.has(tenantId)) byTenant.set(tenantId, new Map());
    const tenantMap = byTenant.get(tenantId);
    if (!tenantMap.has(bookingId)) tenantMap.set(bookingId, []);
    tenantMap.get(bookingId).push({ booking, ...payloadChecksums(booking) });
  }
  return { byTenant, skipped };
}

function tenantMapLookup(grouped, tenantId, bookingId) {
  return grouped.byTenant.get(tenantId)?.get(bookingId) || [];
}

function classifyRemainingSeparateBookings({
  bookings = [],
  leftTenant = 'hair_tp',
  rightTenant = 'hair-tp-clinic',
  consumedSourceKeys = new Set(),
} = {}) {
  const grouped = groupEntriesByBookingId(bookings, consumedSourceKeys);
  const left = normalizeText(leftTenant);
  const right = normalizeText(rightTenant);
  const bookingIds = new Set([
    ...Array.from(grouped.byTenant.get(left)?.keys() || []),
    ...Array.from(grouped.byTenant.get(right)?.keys() || []),
  ]);
  const classifications = {
    exact_duplicate_unapproved: 0,
    complementary_notes: 0,
    conflict: 0,
    one_sided_left: 0,
    one_sided_right: 0,
    other_tenant_or_unclassified: 0,
  };
  const sourceRecordsByClass = Object.fromEntries(
    Object.keys(classifications).map((key) => [key, 0])
  );
  const tenantOverlap = {
    intersectionBookingIds: 0,
    oneSidedLeftBookingIds: 0,
    oneSidedRightBookingIds: 0,
  };

  for (const bookingId of Array.from(bookingIds).sort()) {
    const leftEntries = tenantMapLookup(grouped, left, bookingId);
    const rightEntries = tenantMapLookup(grouped, right, bookingId);
    if (leftEntries.length && !rightEntries.length) {
      classifications.one_sided_left += 1;
      sourceRecordsByClass.one_sided_left += leftEntries.length;
      tenantOverlap.oneSidedLeftBookingIds += 1;
      continue;
    }
    if (!leftEntries.length && rightEntries.length) {
      classifications.one_sided_right += 1;
      sourceRecordsByClass.one_sided_right += rightEntries.length;
      tenantOverlap.oneSidedRightBookingIds += 1;
      continue;
    }
    if (!leftEntries.length && !rightEntries.length) continue;
    tenantOverlap.intersectionBookingIds += 1;
    if (leftEntries.length !== 1 || rightEntries.length !== 1) {
      classifications.conflict += 1;
      sourceRecordsByClass.conflict += leftEntries.length + rightEntries.length;
      continue;
    }
    const comparison = classifyPair(leftEntries[0], rightEntries[0]);
    if (comparison.classification === 'exact_match') {
      classifications.exact_duplicate_unapproved += 1;
      sourceRecordsByClass.exact_duplicate_unapproved += 2;
    } else if (comparison.classification === 'complementary_notes') {
      classifications.complementary_notes += 1;
      sourceRecordsByClass.complementary_notes += 2;
    } else {
      classifications.conflict += 1;
      sourceRecordsByClass.conflict += 2;
    }
  }

  for (const [tenantId, tenantMap] of grouped.byTenant.entries()) {
    if (tenantId === left || tenantId === right) continue;
    for (const entries of tenantMap.values()) {
      classifications.other_tenant_or_unclassified += 1;
      sourceRecordsByClass.other_tenant_or_unclassified += entries.length;
    }
  }

  return {
    bookingIds: classifications,
    sourceRecords: sourceRecordsByClass,
    tenantOverlap,
    skipped: grouped.skipped,
  };
}

function summarizeApprovedShadowEvents(events = []) {
  const perCustomer = new Map();
  const sourceRecordsByTenant = {};
  const sourcePresence = { present: 0, missing: 0 };
  const sourceChecksumVerification = {
    coreMatches: 0,
    coreMismatches: 0,
    coreMissingReference: 0,
    notesMatches: 0,
    notesMismatches: 0,
    notesMissingReference: 0,
  };
  const noteSegments = {
    fields: Object.fromEntries(
      NOTE_FIELDS.map((field) => [field, { sourceRecordsWithValue: 0, mergedEventsWithValue: 0 }])
    ),
    totalSourceRecordValues: 0,
    mergedEventsWithAnyNote: 0,
  };

  for (const event of asArray(events)) {
    const patientRef = maskedRef(event?.canonicalPatientId) || 'sha256:null';
    perCustomer.set(patientRef, (perCustomer.get(patientRef) || 0) + 1);
    let eventHasAnyNote = false;
    const eventFieldsWithValue = new Set();
    for (const record of asArray(event?.sourceRecords)) {
      const tenantId = normalizeText(record?.tenantId) || 'unknown';
      sourceRecordsByTenant[tenantId] = (sourceRecordsByTenant[tenantId] || 0) + 1;
      if (record?.present) sourcePresence.present += 1;
      else sourcePresence.missing += 1;

      const provenance = record?.provenance || {};
      if (provenance.coreChecksum) {
        if (provenance.coreChecksum === provenance.observedCoreChecksum) {
          sourceChecksumVerification.coreMatches += 1;
        } else {
          sourceChecksumVerification.coreMismatches += 1;
        }
      } else {
        sourceChecksumVerification.coreMissingReference += 1;
      }
      if (provenance.notesChecksum) {
        if (provenance.notesChecksum === provenance.observedNotesChecksum) {
          sourceChecksumVerification.notesMatches += 1;
        } else {
          sourceChecksumVerification.notesMismatches += 1;
        }
      } else {
        sourceChecksumVerification.notesMissingReference += 1;
      }

      for (const field of NOTE_FIELDS) {
        if (!normalizeText(record?.noteSegments?.[field])) continue;
        noteSegments.fields[field].sourceRecordsWithValue += 1;
        noteSegments.totalSourceRecordValues += 1;
        eventHasAnyNote = true;
        eventFieldsWithValue.add(field);
      }
    }
    for (const field of eventFieldsWithValue) {
      noteSegments.fields[field].mergedEventsWithValue += 1;
    }
    if (eventHasAnyNote) noteSegments.mergedEventsWithAnyNote += 1;
  }

  const perCustomerMasked = Array.from(perCustomer.entries())
    .map(([customerRef, approvedShadowEvents]) => ({ customerRef, approvedShadowEvents }))
    .sort((left, right) => {
      if (right.approvedShadowEvents !== left.approvedShadowEvents) {
        return right.approvedShadowEvents - left.approvedShadowEvents;
      }
      return left.customerRef.localeCompare(right.customerRef);
    });
  const distribution = {};
  for (const item of perCustomerMasked) {
    distribution[item.approvedShadowEvents] = (distribution[item.approvedShadowEvents] || 0) + 1;
  }

  return {
    uniqueCustomers: perCustomer.size,
    perCustomerMasked,
    perCustomerEventCountDistribution: distribution,
    sourceRecords: {
      total: sourcePresence.present + sourcePresence.missing,
      byTenant: sourceRecordsByTenant,
      presence: sourcePresence,
      checksumVerification: sourceChecksumVerification,
    },
    noteSegments,
  };
}

function countLedgerStates(events = []) {
  const byState = {};
  const latestByState = {};
  const latest = latestEventsByLink(events);
  for (const event of asArray(events)) {
    const state = normalizeText(event?.state) || 'unknown';
    byState[state] = (byState[state] || 0) + 1;
  }
  for (const event of latest.values()) {
    const state = normalizeText(event?.state) || 'unknown';
    latestByState[state] = (latestByState[state] || 0) + 1;
  }
  return {
    totalEvents: asArray(events).length,
    totalLinks: latest.size,
    byState,
    latestByState,
  };
}

function buildUnlinkedReviewSummary(unlinkedReview = null) {
  if (!unlinkedReview) return null;
  const rows = asArray(unlinkedReview)
    .concat(asArray(unlinkedReview?.rows))
    .concat(asArray(unlinkedReview?.items))
    .concat(asArray(unlinkedReview?.reviewRows))
    .filter((row) => row && typeof row === 'object');
  const refs = new Set();
  const classes = {};
  for (const row of rows) {
    const rawRef =
      normalizeText(row.bookingRef) ||
      maskedRef(row.bookingId || row.id || row.sourceBookingId || row.externalBookingId);
    if (rawRef) refs.add(rawRef);
    const reason =
      normalizeText(row.reasonCode || row.reason || row.identityClass || row.classification) ||
      'unknown';
    classes[reason] = (classes[reason] || 0) + 1;
  }
  return {
    inputRows: rows.length,
    uniqueMaskedBookingRefs: refs.size,
    classes,
  };
}

function buildClientoHistoricalShadowCoverageReport({
  bookings = [],
  ledgerEvents = [],
  bookingsChecksum,
  ledgerChecksum,
  leftTenant = 'hair_tp',
  rightTenant = 'hair-tp-clinic',
  unlinkedReview = null,
} = {}) {
  const latest = latestEventsByLink(ledgerEvents);
  const approvedLedgerEvents = Array.from(latest.values()).filter(isApprovedHistoricalShadowEvent);
  const consumedSourceKeys = new Set();
  for (const event of approvedLedgerEvents) {
    for (const ref of asArray(event.sourceRefs)) {
      consumedSourceKeys.add(sourceKey(ref?.tenantId, ref?.bookingId));
    }
  }

  const readmodel = buildClientoHistoricalShadowReadmodel({
    bookings,
    ledgerEvents,
    includeUnmerged: true,
  });
  const approvedShadowEvents = readmodel.events.filter(
    (event) => event.eventType === 'cliento_historical_booking_shadow_merge'
  );

  return {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    zeroWrites: true,
    piiMasked: true,
    rawIdentifiersEmitted: false,
    inputIntegrity: {
      bookingsChecksum,
      ledgerChecksum,
      checksumAlgorithm: 'sha256(file-bytes)',
    },
    gates: {
      activeProjectionUsed: false,
      runtimeActivation: false,
      dataWrites: 0,
      bookingMergeWrites: 0,
      patientWrites: 0,
      encounterWrites: 0,
    },
    ledger: countLedgerStates(ledgerEvents),
    approvedShadow: {
      links: approvedLedgerEvents.length,
      readmodelEvents: approvedShadowEvents.length,
      consumedSourceRecords: consumedSourceKeys.size,
      ...summarizeApprovedShadowEvents(approvedShadowEvents),
    },
    remainingSeparate: {
      readmodelUnmergedSourceRecords: readmodel.counts.unmergedBookings,
      ...classifyRemainingSeparateBookings({
        bookings,
        leftTenant,
        rightTenant,
        consumedSourceKeys,
      }),
      unlinkedReview: buildUnlinkedReviewSummary(unlinkedReview),
      handling:
        'Alla remainingSeparate-poster lämnas read-only, separata, linkAllowed:false och utan patient-/encounter-write.',
    },
  };
}

module.exports = {
  buildClientoHistoricalShadowCoverageReport,
  classifyRemainingSeparateBookings,
  fileSha256,
};
