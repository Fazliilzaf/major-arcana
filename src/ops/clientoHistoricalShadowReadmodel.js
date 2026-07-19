'use strict';

const crypto = require('node:crypto');

const { NOTE_FIELDS, payloadChecksums } = require('./clientoCrossTenantCoverage');

const HISTORICAL_BOOKING_LINK_TYPE = 'exact_booking_duplicate';
const HISTORICAL_BOOKING_REASON = 'historical_booking_without_encounter';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])])
  );
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function maskedRef(value) {
  const text = normalizeText(value);
  return text ? `sha256:${sha256(text).slice(0, 16)}` : null;
}

function bookingIdOf(booking) {
  return normalizeText(booking?.bookingId || booking?.id);
}

function sourceKey(ref) {
  return `${normalizeText(ref?.tenantId)}::${normalizeText(ref?.bookingId)}`;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function groupBookingsBySource(bookings = []) {
  const grouped = new Map();
  for (const booking of asArray(bookings)) {
    const tenantId = normalizeText(booking?.tenantId || booking?.tenant);
    const bookingId = bookingIdOf(booking);
    if (!tenantId || !bookingId) continue;
    const key = `${tenantId}::${bookingId}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(booking);
  }
  return grouped;
}

function latestEventsByLink(events = []) {
  const byLink = new Map();
  for (const event of asArray(events)) {
    const linkId = normalizeText(event?.linkId);
    if (!linkId) continue;
    byLink.set(linkId, event);
  }
  return byLink;
}

function isApprovedHistoricalLink(event) {
  return (
    event?.state === 'approved' &&
    normalizeText(event?.linkType) === HISTORICAL_BOOKING_LINK_TYPE &&
    normalizeText(event?.reasonCode) === HISTORICAL_BOOKING_REASON &&
    normalizeText(event?.canonicalPatientId) &&
    !normalizeText(event?.canonicalEncounterId) &&
    asArray(event?.sourceRefs).length === 2
  );
}

function collectNoteSegments(booking = {}) {
  return Object.fromEntries(
    NOTE_FIELDS.map((field) => [field, normalizeText(booking?.[field]) || null])
  );
}

function buildSourceRecord(ref, booking) {
  const checksums = payloadChecksums(booking || {});
  return {
    tenantId: normalizeText(ref?.tenantId),
    bookingRef: maskedRef(ref?.bookingId),
    bookingId: normalizeText(ref?.bookingId),
    present: Boolean(booking),
    status: normalizeText(booking?.status) || null,
    startsAt: normalizeText(booking?.startsAt) || null,
    endsAt: normalizeText(booking?.endsAt) || null,
    durationMinutes: Number.isFinite(Number(booking?.durationMinutes))
      ? Number(booking.durationMinutes)
      : null,
    serviceLabel: normalizeText(booking?.serviceLabel || booking?.service) || null,
    resourceLabel:
      normalizeText(booking?.staffName || booking?.staff || booking?.resourceLabel) || null,
    locationLabel:
      normalizeText(booking?.locationName || booking?.location || booking?.locationLabel) || null,
    noteSegments: collectNoteSegments(booking || {}),
    provenance: {
      sourceSnapshotChecksum: normalizeText(ref?.sourceSnapshotChecksum) || null,
      coreChecksum: normalizeText(ref?.coreChecksum) || null,
      notesChecksum: normalizeText(ref?.notesChecksum) || null,
      observedCoreChecksum: booking ? checksums.coreChecksum : null,
      observedNotesChecksum: booking ? checksums.notesChecksum : null,
    },
  };
}

function buildMergedEventFromApprovedLink(event, bookingIndex) {
  const sourceRefs = asArray(event.sourceRefs);
  const sourceRecords = sourceRefs.map((ref) => {
    const candidates = bookingIndex.get(sourceKey(ref)) || [];
    return buildSourceRecord(ref, candidates[0] || null);
  });
  return {
    eventType: 'cliento_historical_booking_shadow_merge',
    readOnly: true,
    linkAllowed: false,
    linkState: 'approved',
    linkId: normalizeText(event.linkId),
    ledgerEventId: normalizeText(event.ledgerEventId),
    bookingRef: maskedRef(sourceRefs[0]?.bookingId),
    canonicalPatientId: normalizeText(event.canonicalPatientId),
    canonicalEncounterId: null,
    historicalReason: HISTORICAL_BOOKING_REASON,
    display: {
      startsAt: sourceRecords.find((record) => record.startsAt)?.startsAt || null,
      endsAt: sourceRecords.find((record) => record.endsAt)?.endsAt || null,
      status: sourceRecords.find((record) => record.status)?.status || null,
      serviceLabel: sourceRecords.find((record) => record.serviceLabel)?.serviceLabel || null,
    },
    sourceRecords,
    provenance: {
      source: 'cliento_link_sidecar_approved_shadow_read',
      linkType: normalizeText(event.linkType),
      eventHash: normalizeText(event.eventHash) || null,
      sourceRefsChecksum: normalizeText(event.compareAndSwap?.sourceRefsChecksum) || null,
      patientResolution: clone(event.patientResolution || null),
    },
  };
}

function buildUnmergedBookingEvent(booking, reasonCode = 'unlinked_or_unapproved') {
  const tenantId = normalizeText(booking?.tenantId || booking?.tenant);
  const bookingId = bookingIdOf(booking);
  return {
    eventType: 'cliento_historical_booking_unmerged',
    readOnly: true,
    linkAllowed: false,
    reasonCode,
    bookingRef: maskedRef(bookingId),
    canonicalPatientId: null,
    canonicalEncounterId: null,
    display: {
      startsAt: normalizeText(booking?.startsAt) || null,
      endsAt: normalizeText(booking?.endsAt) || null,
      status: normalizeText(booking?.status) || null,
      serviceLabel: normalizeText(booking?.serviceLabel || booking?.service) || null,
    },
    sourceRecords: [
      {
        tenantId,
        bookingRef: maskedRef(bookingId),
        bookingId,
        present: true,
        status: normalizeText(booking?.status) || null,
        startsAt: normalizeText(booking?.startsAt) || null,
        endsAt: normalizeText(booking?.endsAt) || null,
        durationMinutes: Number.isFinite(Number(booking?.durationMinutes))
          ? Number(booking.durationMinutes)
          : null,
        serviceLabel: normalizeText(booking?.serviceLabel || booking?.service) || null,
        resourceLabel:
          normalizeText(booking?.staffName || booking?.staff || booking?.resourceLabel) || null,
        locationLabel:
          normalizeText(booking?.locationName || booking?.location || booking?.locationLabel) ||
          null,
        noteSegments: collectNoteSegments(booking || {}),
        provenance: {
          sourceSnapshotChecksum: null,
          coreChecksum: null,
          notesChecksum: null,
          observedCoreChecksum: payloadChecksums(booking || {}).coreChecksum,
          observedNotesChecksum: payloadChecksums(booking || {}).notesChecksum,
        },
      },
    ],
    provenance: {
      source: 'cliento_imported_booking_shadow_read',
      tenantId,
    },
  };
}

function buildClientoHistoricalShadowReadmodel({
  bookings = [],
  ledgerEvents = [],
  includeUnmerged = true,
} = {}) {
  const bookingIndex = groupBookingsBySource(bookings);
  const consumedSourceKeys = new Set();
  const mergedEvents = [];
  const skippedLinks = [];

  for (const event of latestEventsByLink(ledgerEvents).values()) {
    if (!isApprovedHistoricalLink(event)) {
      skippedLinks.push({
        linkId: normalizeText(event?.linkId) || null,
        state: normalizeText(event?.state) || null,
        reasonCode: normalizeText(event?.reasonCode) || null,
      });
      continue;
    }
    const modelEvent = buildMergedEventFromApprovedLink(event, bookingIndex);
    mergedEvents.push(modelEvent);
    for (const ref of asArray(event.sourceRefs)) consumedSourceKeys.add(sourceKey(ref));
  }

  const unmergedEvents = includeUnmerged
    ? asArray(bookings)
        .filter(
          (booking) =>
            !consumedSourceKeys.has(
              `${booking.tenantId || booking.tenant}::${bookingIdOf(booking)}`
            )
        )
        .map((booking) => buildUnmergedBookingEvent(booking))
    : [];

  const events = [...mergedEvents, ...unmergedEvents].sort((left, right) => {
    const l = normalizeText(left.display?.startsAt);
    const r = normalizeText(right.display?.startsAt);
    if (l !== r) return l.localeCompare(r);
    return JSON.stringify(stableValue(left)).localeCompare(JSON.stringify(stableValue(right)));
  });

  return {
    schemaVersion: '1.0.0',
    readOnly: true,
    zeroWrites: true,
    activeProjectionUsed: false,
    bookingMergeWritten: false,
    patientEncounterWrite: false,
    counts: {
      mergedApprovedLinks: mergedEvents.length,
      unmergedBookings: unmergedEvents.length,
      skippedLinks: skippedLinks.length,
      totalEvents: events.length,
    },
    events,
    skippedLinks,
  };
}

module.exports = {
  HISTORICAL_BOOKING_LINK_TYPE,
  HISTORICAL_BOOKING_REASON,
  buildClientoHistoricalShadowReadmodel,
  collectNoteSegments,
};
