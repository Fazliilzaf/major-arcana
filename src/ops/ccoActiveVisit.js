'use strict';

const ACTIVE_VISIT_STATES = Object.freeze([
  'scheduled_today',
  'checked_in',
  'in_progress',
  'completed_today',
]);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseMs(value) {
  const parsed = Date.parse(normalizeText(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function isTodayIso(value) {
  return normalizeText(value).slice(0, 10) === isoToday();
}

function resolveScheduledTodayBooking(bookingContext = {}) {
  const rows = [
    ...asArray(bookingContext.upcomingBookings),
    ...asArray(bookingContext.historyBookings),
  ].filter((row) => isTodayIso(row?.startsAt || row?.startAt || ''));
  if (!rows.length) return null;
  rows.sort((left, right) => {
    const leftMs = parseMs(left?.startsAt || left?.startAt) || 0;
    const rightMs = parseMs(right?.startsAt || right?.startAt) || 0;
    return leftMs - rightMs;
  });
  return rows[0];
}

function resolveTodayEncounter(
  encounters = [],
  { scheduledBooking = null, cardEncounterId = '' } = {}
) {
  const bookingId = normalizeText(scheduledBooking?.id || scheduledBooking?.bookingId);
  const encounterId = normalizeText(cardEncounterId);
  const todayRows = asArray(encounters).filter((encounter) => {
    if (normalizeKey(encounter?.status) === 'cancelled') return false;
    return isTodayIso(
      encounter?.startsAt ||
        encounter?.metadata?.checkedInAt ||
        encounter?.metadata?.startedAt ||
        encounter?.metadata?.completedAt ||
        ''
    );
  });
  if (!todayRows.length) return null;
  return todayRows.slice().sort((left, right) => {
    const leftScore =
      (normalizeText(left.bookingId) === bookingId ? 4 : 0) +
      (normalizeText(left.encounterId) === encounterId ? 2 : 0) +
      (normalizeKey(left.status) === 'completed' ? 1 : 0) +
      (normalizeKey(left.status) === 'in_progress' ? 2 : 0) +
      (normalizeKey(left.status) === 'checked_in' ? 1 : 0);
    const rightScore =
      (normalizeText(right.bookingId) === bookingId ? 4 : 0) +
      (normalizeText(right.encounterId) === encounterId ? 2 : 0) +
      (normalizeKey(right.status) === 'completed' ? 1 : 0) +
      (normalizeKey(right.status) === 'in_progress' ? 2 : 0) +
      (normalizeKey(right.status) === 'checked_in' ? 1 : 0);
    if (leftScore !== rightScore) return rightScore - leftScore;
    return (parseMs(left.startsAt) || 0) - (parseMs(right.startsAt) || 0);
  })[0];
}

function resolveActiveVisitBlockers(card = {}) {
  const blockers = [];
  const push = (code, label) => {
    if (blockers.some((item) => item.code === code)) return;
    blockers.push({ code, label });
  };
  if (card.missingHealthDeclaration === true || card.missingForm === true) {
    push('health_declaration', 'Hälsodeklaration saknas');
  }
  if (card.missingAgreement === true) {
    push('agreement', 'Avtal och samtycke saknas');
  }
  if (card.missingFitnessCertificate === true) {
    push('fitness_certificate', 'Friskförsäkran saknas');
  }
  if (card.identityVerified === false) {
    push('identity_verification', 'ID-verifiering saknas');
  }
  if (card.missingPhotoConsent === true) {
    push('photo_consent', 'Foto-samtycke saknas');
  }
  return blockers;
}

function resolveJournalVisitSignals(journalEntries = [], encounterId = '') {
  const targetEncounterId = normalizeText(encounterId);
  const relevant = asArray(journalEntries).filter((entry) => {
    if (targetEncounterId) {
      return normalizeText(entry?.treatmentEncounterId) === targetEncounterId;
    }
    return isTodayIso(entry?.signedAt || entry?.updatedAt || '');
  });
  let startedAt = null;
  let completedAt = null;
  for (const entry of relevant) {
    const updatedAt = normalizeText(entry?.updatedAt);
    const signedAt = normalizeText(entry?.signedAt);
    if (isTodayIso(updatedAt)) {
      if (!startedAt || (parseMs(updatedAt) || 0) < (parseMs(startedAt) || Infinity)) {
        startedAt = updatedAt;
      }
    }
    if (isTodayIso(signedAt)) {
      if (!startedAt || (parseMs(signedAt) || 0) < (parseMs(startedAt) || Infinity)) {
        startedAt = signedAt;
      }
      if (!completedAt || (parseMs(signedAt) || 0) > (parseMs(completedAt) || 0)) {
        completedAt = signedAt;
      }
    }
  }
  return {
    journalStarted: Boolean(startedAt),
    journalCompleted: Boolean(completedAt),
    startedAt,
    completedAt,
  };
}

function resolveActiveVisitState({ encounter = null, journalSignals = {} } = {}) {
  const status = normalizeKey(encounter?.status);
  const metadata = encounter?.metadata || {};
  const checkedInAt = normalizeText(metadata.checkedInAt);
  const startedAt = normalizeText(metadata.startedAt || journalSignals.startedAt);
  const completedAt = normalizeText(metadata.completedAt || journalSignals.completedAt);

  if (status === 'completed' || isTodayIso(completedAt) || journalSignals.journalCompleted) {
    return 'completed_today';
  }
  if (status === 'in_progress' || isTodayIso(startedAt) || journalSignals.journalStarted) {
    return 'in_progress';
  }
  if (status === 'checked_in' || isTodayIso(checkedInAt)) {
    return 'checked_in';
  }
  return 'scheduled_today';
}

function buildActiveVisitPayload({
  card = {},
  bookingContext = {},
  journalEntries = [],
  encounter = null,
}) {
  const scheduled = resolveScheduledTodayBooking(bookingContext);
  const visible = Boolean(card.todayVisit === true || scheduled || encounter);
  if (!visible) {
    return {
      visible: false,
      state: null,
      bookingId: null,
      encounterId: null,
      startsAt: null,
      serviceLabel: null,
      practitionerLabel: null,
      checkedInAt: null,
      startedAt: null,
      completedAt: null,
      blockers: [],
    };
  }
  const visitEncounter = encounter || null;
  const journalSignals = resolveJournalVisitSignals(journalEntries, visitEncounter?.encounterId);
  const metadata = visitEncounter?.metadata || {};
  const checkedInAt = normalizeText(metadata.checkedInAt) || null;
  const startedAt = normalizeText(metadata.startedAt || journalSignals.startedAt) || null;
  const completedAt = normalizeText(metadata.completedAt || journalSignals.completedAt) || null;
  return {
    visible: true,
    state: resolveActiveVisitState({ encounter: visitEncounter, journalSignals }),
    bookingId:
      normalizeText(visitEncounter?.bookingId) ||
      normalizeText(scheduled?.id || scheduled?.bookingId) ||
      null,
    encounterId: normalizeText(visitEncounter?.encounterId || card.encounterId) || null,
    startsAt:
      normalizeText(visitEncounter?.startsAt || scheduled?.startsAt || scheduled?.startAt) || null,
    serviceLabel:
      normalizeText(visitEncounter?.serviceLabel || scheduled?.serviceName || scheduled?.title) ||
      null,
    practitionerLabel:
      normalizeText(
        visitEncounter?.resourceLabel || scheduled?.staff || scheduled?.resourceLabel
      ) || null,
    checkedInAt,
    startedAt,
    completedAt,
    journalStarted: journalSignals.journalStarted,
    photoCaptureAvailable: true,
    notesAvailable: true,
    blockers: resolveActiveVisitBlockers(card),
  };
}

module.exports = {
  ACTIVE_VISIT_STATES,
  buildActiveVisitPayload,
  resolveActiveVisitBlockers,
  resolveActiveVisitState,
  resolveJournalVisitSignals,
  resolveScheduledTodayBooking,
  resolveTodayEncounter,
};
