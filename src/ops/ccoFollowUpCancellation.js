'use strict';

/**
 * ORD-140 §2 — vad en avbokad tid gör med uppföljningen.
 *
 * Det är ett VILLKOR, inte ett förval. Tre fall:
 *
 *   A · Uppföljningstiden avbokas → stäng bara det tillfället. Aldrig serien.
 *   B · Behandlingstiden avbokas, ingen signerad behandlingsjournal →
 *       behandlingen blev aldrig av → rör ingenting, flagga för personal.
 *   C · Behandlingstiden avbokas, men journalen är signerad → behandlingen
 *       HAR gjorts. Rör ingenting, flagga för en människa.
 *
 * Villkoret för B/C: finns en signerad behandlingsjournal på encountern?
 *
 * ORD-140 lämnade B öppen. ORD-148 (2026-08-30) stängde den: "uppföljningen
 * ligger kvar. Systemet stänger ingenting av sig självt. Men personalen ska få
 * en fråga." Koden följde det svaret direkt — den här docstringen gjorde inte
 * det, och påstod i tre dagar motsatsen till raderna under sig. Bekräftat av
 * Fazli igen 2026-09-01: patienten kan boka om nästa vecka, och då gäller
 * uppföljningen fortfarande. Den bedömningen ska en människa göra.
 *
 * Det är alltså bara fall A som stänger något. B och C flaggar.
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
    action: 'flag_for_human',
    reason: 'Behandlingen blev inte av — stäng inte uppföljningen, flagga för personal att avgöra.',
  };
}

/**
 * Kopplingen (ORD-140 §4): avboknings-/avslutsflödet → beslutet → stängning.
 * Fall A stänger via aftercare-storet; fall B och C flaggar och rör ingenting
 * (ORD-148: avbokad tid stänger INTE uppföljningen — personalen får en fråga).
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

  // C: signerad journal — rör ingenting, flagga för människa.
  if (decision.case === 'C') {
    return {
      handled: false,
      ...decision,
      flagForHuman: true,
      encounterId: encounter.encounterId,
    };
  }

  // A: uppföljningstiden avbokas. Stäng de utkast som är länkade till
  // encountern (via journalEntryIds) + deras jobb. Ingen länk → gör ingenting,
  // flagga. Stäng aldrig ett utkast som inte är kopplat till den avbokade tiden.
  if (decision.case === 'A') {
    const linked = Array.isArray(encounter.journalEntryIds) ? encounter.journalEntryIds : [];
    if (linked.length === 0) {
      return {
        handled: false,
        ...decision,
        flagForHuman: true,
        encounterId: encounter.encounterId,
        reason: 'Ingen länk till utkastet — stäng aldrig ett okopplat utkast.',
      };
    }
    let closedDrafts = 0;
    let cancelledJobs = 0;
    for (const entryId of linked) {
      const entry = await journalStore?.getEntry?.({
        tenantId,
        patientId: encounter.patientId,
        entryId,
      });
      const closed = await journalStore?.closeEntry?.({
        tenantId,
        patientId: encounter.patientId,
        entryId,
        reason,
        eventId,
        actor,
      });
      if (closed && closed.closedAt) closedDrafts += 1;
      const jobId = entry?.fields?.aftercareJobId;
      if (jobId && aftercareStore && typeof aftercareStore.cancelJob === 'function') {
        try {
          await aftercareStore.cancelJob(jobId, { reason, role: actor.role || 'operator' });
          cancelledJobs += 1;
        } catch {
          // Redan skickat/avbrutet — hoppa, fäll inte.
        }
      }
    }
    return {
      handled: true,
      ...decision,
      encounterId: encounter.encounterId,
      closedDrafts,
      cancelledJobs,
    };
  }

  // B: behandlingen blev inte av — stäng INTE uppföljningarna (ORD-148).
  // Personalen får en fråga i stället. Samma mönster som fall C.
  return {
    handled: false,
    ...decision,
    flagForHuman: true,
    encounterId: encounter.encounterId,
  };
}

/**
 * ORD-140 §4b — länka en bokad uppföljningstid till det utkast som väntar
 * sedan dag 0. Bokningen skapar inget nytt utkast; den pekar på det befintliga.
 * Den som bokar väljer vilket tillfälle (4/8/12) — systemet föreslår via
 * journalStore.listFollowUpDraftCandidates.
 */
async function linkFollowUpDraftToEncounter({
  tenantId,
  patientId,
  encounterId,
  entryId,
  encounterStore,
  journalStore,
} = {}) {
  const encounter = await encounterStore.getEncounter({ tenantId, patientId, encounterId });
  if (!encounter) {
    const error = new Error('Behandlingstillfället hittades inte.');
    error.statusCode = 404;
    throw error;
  }
  const entry = await journalStore.getEntry({ tenantId, patientId, entryId });
  if (!entry) {
    const error = new Error('Utkastet hittades inte.');
    error.statusCode = 404;
    throw error;
  }
  if (normalizeKey(entry.journalType) !== 'follow_up') {
    const error = new Error('Posten är inte ett uppföljningsutkast.');
    error.statusCode = 400;
    throw error;
  }
  if (normalizeKey(entry.status) !== 'draft' || entry.closedAt) {
    const error = new Error('Utkastet är inte öppet och kan inte länkas.');
    error.statusCode = 409;
    throw error;
  }
  return encounterStore.linkJournalEntry({ tenantId, patientId, encounterId, entryId });
}

module.exports = { decideFollowUpAction, resolveBookingCancellation, linkFollowUpDraftToEncounter };
