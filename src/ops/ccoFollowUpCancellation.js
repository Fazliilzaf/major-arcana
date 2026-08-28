'use strict';

/**
 * ORD-140 §2 — vad en avbokad tid gör med uppföljningen.
 *
 * Det är ett VILLKOR, inte ett förval. Tre fall:
 *
 *   A · Uppföljningstiden avbokas → stäng bara det tillfället. Aldrig serien.
 *   B · Behandlingstiden avbokas, ingen signerad behandlingsjournal →
 *       behandlingen blev aldrig av → stäng alla uppföljningar.
 *   C · Behandlingstiden avbokas, men journalen är signerad → behandlingen
 *       HAR gjorts. Rör ingenting, flagga för en människa.
 *
 * Villkoret för B/C: finns en signerad behandlingsjournal på encountern?
 */

function normalizeKey(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function decideFollowUpAction({ encounterType, hasSignedTreatmentJournal = false } = {}) {
  if (normalizeKey(encounterType) === 'follow_up') {
    return {
      case: 'A',
      action: 'close_single_follow_up',
      reason: 'Uppföljningstiden avbokas — stäng bara detta tillfälle.',
    };
  }
  if (hasSignedTreatmentJournal) {
    return {
      case: 'C',
      action: 'flag_for_human',
      reason:
        'Behandlingsjournalen är signerad — avbokningen är en efterhandsrättelse. Rör ingenting, flagga för människa.',
    };
  }
  return {
    case: 'B',
    action: 'close_all_follow_ups',
    reason: 'Behandlingen blev inte av — stäng alla uppföljningar.',
  };
}

/**
 * Kopplingen (ORD-140 §4): avboknings-/avslutsflödet → beslutet → stängning.
 * Fall A och B stänger via aftercare-storet; fall C flaggar och rör ingenting.
 */
async function resolveBookingCancellation({
  tenantId,
  bookingId,
  encounterStore,
  journalStore,
  aftercareStore,
  reason = '',
  eventId = '',
  actor = {},
} = {}) {
  const encounter = await encounterStore.findByBooking({ tenantId, bookingId });
  if (!encounter) {
    return { handled: false, reason: 'no_encounter_for_booking' };
  }

  // Villkoret: finns en signerad behandlingsjournal på encountern?
  let hasSignedTreatmentJournal = false;
  for (const entryId of encounter.journalEntryIds || []) {
    const entry = await journalStore.getEntry({
      tenantId,
      patientId: encounter.patientId,
      entryId,
    });
    if (entry && entry.status === 'signed') {
      hasSignedTreatmentJournal = true;
      break;
    }
  }

  const decision = decideFollowUpAction({
    encounterType: encounter.encounterType,
    hasSignedTreatmentJournal,
  });

  if (decision.case === 'C') {
    return {
      handled: false,
      ...decision,
      flagForHuman: true,
      encounterId: encounter.encounterId,
    };
  }

  const outcome = await aftercareStore.cancelFollowUpsForEncounter({
    tenantId,
    encounterId: encounter.encounterId,
    reason,
    eventId,
    actor,
  });
  return { handled: true, ...decision, encounterId: encounter.encounterId, outcome };
}

module.exports = { decideFollowUpAction, resolveBookingCancellation };
