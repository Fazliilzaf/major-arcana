'use strict';

/**
 * ORD-77 — Clinic Performance konverteringstratt (aggregat only).
 *
 * KONSULTATION → OFFERT → BEHANDLING. All matching happens inside the clinic
 * system; the returned shape contains counts and rates only — never names,
 * emails, notes, or other person-identifying fields.
 *
 * ORD-77 komplettering: konsult→behandling räknas även ur Cliento-
 * bokningshistorik (paying/included efter konsultation) utan krav på
 * matchad offert. Coverage redovisar via_offer vs via_booking_history.
 */

const { classifyBookingKind } = require('./clinicPerformance');
const { classifyService } = require('./ccoClientoLedJourneyAudit');
const { HAIR_TP_CANONICAL } = require('../tenant/tenantIdCanonical');

const MS_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_STOPPED_AT_OFFER_DAYS = 60;
const DEFAULT_ROLLING_DAYS = 90;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseMs(iso) {
  const ms = Date.parse(normalizeText(iso));
  return Number.isFinite(ms) ? ms : null;
}

function endOfUtcDayExclusive(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

function sameDayMonthWindow(now) {
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  return { startMs: monthStart, endMsExclusive: endOfUtcDayExclusive(now) };
}

function rollingWindow(now, days) {
  const endMsExclusive = endOfUtcDayExclusive(now);
  const startMs = endMsExclusive - Math.max(1, days) * MS_DAY;
  return { startMs, endMsExclusive };
}

function inWindow(ms, window) {
  return ms != null && ms >= window.startMs && ms < window.endMsExclusive;
}

function isConsultationBooking(booking) {
  const kind = normalizeText(booking.bookingKind) || classifyBookingKind(booking);
  if (kind === 'consultation') return true;
  // ORD-76 kan klassa betald konsultation som paying — tratten faller tillbaka på tjänstenamn.
  return classifyService(booking.serviceLabel || booking.service) === 'consultation';
}

function isTreatmentBooking(booking) {
  // Konsultation (även betald) är aldrig "gått vidare till behandling".
  if (isConsultationBooking(booking)) return false;
  const kind = normalizeText(booking.bookingKind) || classifyBookingKind(booking);
  // ORD-77 komplettering: paying / included_in_package = behandlingssteg i historiken.
  if (kind === 'paying' || kind === 'included_in_package') return true;
  const service = classifyService(booking.serviceLabel || booking.service);
  if (service === 'consultation' || service === 'follow_up') return false;
  return service === 'hair_transplant' || service === 'prp';
}

/** Intern kundnyckel — patientId först, annars Cliento-id/e-post (aldrig ut till CEO). */
function bookingPatientKey(booking, resolvePatientKey) {
  return (
    normalizeText(resolvePatientKey(booking) || '') ||
    normalizeText(booking.patientId || booking.patientKey) ||
    normalizeText(booking.clientoCustomerId || booking.customerId) ||
    normalizeText(booking.customerEmail).toLowerCase() ||
    null
  );
}

function isShowStatus(status) {
  const s = normalizeText(status).toLowerCase();
  return (
    s === 'completed' ||
    s === 'checked_in' ||
    s === 'in_progress' ||
    s === 'confirmed' ||
    s === 'show'
  );
}

function isNoShowStatus(status) {
  return normalizeText(status).toLowerCase() === 'no_show';
}

function isCountableOfferStatus(status) {
  const s = normalizeText(status).toLowerCase();
  return s === 'sent' || s === 'accepted';
}

function rate(numerator, denominator) {
  if (!denominator || denominator < 1) return null;
  return Number((numerator / denominator).toFixed(4));
}

function emptyConsultations() {
  return { booked: 0, show: 0, noShow: 0 };
}

function emptyCoverage() {
  return {
    bookingsMatched: 0,
    bookingsTotal: 0,
    offersMatched: 0,
    offersTotal: 0,
    via_offer: 0,
    via_booking_history: 0,
  };
}

function emptyWindowMetrics() {
  return {
    consultations: emptyConsultations(),
    offersSent: 0,
    proceededToTreatment: 0,
    stoppedAtOffer: 0,
    rates: {
      consultToOffer: null,
      offerToTreatment: null,
      consultToTreatment: null,
    },
    coverage: emptyCoverage(),
  };
}

/**
 * @param {object} args
 * @param {Array} args.bookings
 * @param {Array} args.offers [{ patientKey, sentAt, status }]
 * @param {(booking: object) => string|null} args.resolvePatientKey
 * @param {Date} [args.now]
 * @param {number} [args.stoppedAtOfferDays]
 * @param {number} [args.rollingDays]
 */
function composeConversionFunnel({
  bookings = [],
  offers = [],
  resolvePatientKey = () => null,
  now = new Date(),
  stoppedAtOfferDays = DEFAULT_STOPPED_AT_OFFER_DAYS,
  rollingDays = DEFAULT_ROLLING_DAYS,
} = {}) {
  const nowMs = now.getTime();
  const stopMs = Math.max(1, Number(stoppedAtOfferDays) || DEFAULT_STOPPED_AT_OFFER_DAYS) * MS_DAY;

  const bookingEvents = asArray(bookings)
    .map((b) => {
      const startsAtMs = parseMs(b.startsAt);
      if (startsAtMs == null) return null;
      const patientKey = bookingPatientKey(b, resolvePatientKey);
      return {
        patientKey,
        startsAtMs,
        status: b.status,
        isConsultation: isConsultationBooking(b),
        isTreatment: isTreatmentBooking(b),
      };
    })
    .filter(Boolean);

  const offerEvents = asArray(offers)
    .map((o) => {
      const patientKey = normalizeText(o.patientKey || o.patientId) || null;
      const sentAtMs = parseMs(o.sentAt || o.quoteSentAt);
      if (sentAtMs == null || !isCountableOfferStatus(o.status || o.quoteStatus)) return null;
      return { patientKey, sentAtMs, matched: Boolean(patientKey) };
    })
    .filter(Boolean);

  function firstTreatmentAfter(patientKey, afterMs) {
    let best = null;
    for (const b of bookingEvents) {
      if (!b.isTreatment || b.patientKey !== patientKey) continue;
      if (b.startsAtMs < afterMs) continue;
      if (best == null || b.startsAtMs < best) best = b.startsAtMs;
    }
    return best;
  }

  function metricsForWindow(window) {
    const out = emptyWindowMetrics();
    const consultPatientsShow = new Set();
    const earliestConsultShowMs = new Map();
    const offerPatientsInWindow = new Set();
    const earliestOfferMs = new Map();

    for (const b of bookingEvents) {
      if (!inWindow(b.startsAtMs, window)) continue;
      out.coverage.bookingsTotal += 1;
      if (b.patientKey) out.coverage.bookingsMatched += 1;
      if (!b.isConsultation) continue;
      out.consultations.booked += 1;
      if (isNoShowStatus(b.status)) {
        out.consultations.noShow += 1;
      } else if (isShowStatus(b.status)) {
        out.consultations.show += 1;
        if (b.patientKey) {
          consultPatientsShow.add(b.patientKey);
          const prev = earliestConsultShowMs.get(b.patientKey);
          if (prev == null || b.startsAtMs < prev) {
            earliestConsultShowMs.set(b.patientKey, b.startsAtMs);
          }
        }
      }
    }

    for (const o of offerEvents) {
      if (!inWindow(o.sentAtMs, window)) continue;
      out.coverage.offersTotal += 1;
      if (o.matched) {
        out.coverage.offersMatched += 1;
        out.offersSent += 1;
        offerPatientsInWindow.add(o.patientKey);
        const prev = earliestOfferMs.get(o.patientKey);
        if (prev == null || o.sentAtMs < prev) earliestOfferMs.set(o.patientKey, o.sentAtMs);
      }
    }

    let offerProceeded = 0;
    let stopped = 0;
    for (const patientKey of offerPatientsInWindow) {
      const earliestOffer = earliestOfferMs.get(patientKey);
      const treatmentMs = firstTreatmentAfter(patientKey, earliestOffer);
      if (treatmentMs != null) {
        offerProceeded += 1;
        continue;
      }
      if (nowMs - earliestOffer >= stopMs) stopped += 1;
    }
    out.proceededToTreatment = offerProceeded;
    out.stoppedAtOffer = stopped;

    let consultPatientsWithOffer = 0;
    let viaOffer = 0;
    let viaBookingHistory = 0;
    for (const patientKey of consultPatientsShow) {
      if (offerPatientsInWindow.has(patientKey)) consultPatientsWithOffer += 1;
      const consultMs = earliestConsultShowMs.get(patientKey);
      const treatmentMs = firstTreatmentAfter(patientKey, consultMs);
      if (treatmentMs == null) continue;
      // via_offer om matchad offert finns och skickades före (eller samma dag som) behandling.
      const offerMs = earliestOfferMs.get(patientKey);
      if (offerMs != null && offerMs <= treatmentMs) {
        viaOffer += 1;
      } else {
        viaBookingHistory += 1;
      }
    }
    out.coverage.via_offer = viaOffer;
    out.coverage.via_booking_history = viaBookingHistory;

    out.rates.consultToOffer = rate(consultPatientsWithOffer, consultPatientsShow.size);
    out.rates.offerToTreatment = rate(offerProceeded, out.offersSent);
    out.rates.consultToTreatment = rate(viaOffer + viaBookingHistory, consultPatientsShow.size);

    return out;
  }

  const period = metricsForWindow(sameDayMonthWindow(now));
  const rolling90d = metricsForWindow(rollingWindow(now, rollingDays));

  const noteParts = [];
  if (period.coverage.offersTotal > period.coverage.offersMatched) {
    const miss = period.coverage.offersTotal - period.coverage.offersMatched;
    noteParts.push(
      `Konverteringstratt: ${miss} offert(er) utan patientkoppling räknas inte i offersSent (ärligt unknown).`
    );
  }
  if (period.coverage.via_booking_history > 0) {
    noteParts.push(
      `Konsult→behandling: ${period.coverage.via_offer} via offert · ${period.coverage.via_booking_history} via bokningshistorik.`
    );
  }
  const stoppedForNote = Math.max(period.stoppedAtOffer || 0, rolling90d.stoppedAtOffer || 0);
  if (stoppedForNote > 0) {
    noteParts.push(
      `${stoppedForNote} offert(er) äldre än ${stoppedAtOfferDays} dagar utan behandling (stannat vid offert hittills).`
    );
  }

  return {
    stoppedAtOfferDays: Math.max(1, Number(stoppedAtOfferDays) || DEFAULT_STOPPED_AT_OFFER_DAYS),
    rollingDays: Math.max(1, Number(rollingDays) || DEFAULT_ROLLING_DAYS),
    period,
    rolling90d,
    dataNote: noteParts.length ? noteParts.join(' ') : undefined,
  };
}

/** Build offer events from commercial cases (patientId only — no PII copied). */
function offersFromCommercialCases(cases = [], { tenantId = '' } = {}) {
  const tid = normalizeText(tenantId);
  const allowed = tid
    ? new Set(
        [
          tid,
          tid.replace(/-/g, '_'),
          tid.replace(/_/g, '-'),
          ...(tid.includes('hair')
            ? [HAIR_TP_CANONICAL, 'hair_tp', 'hairtp-clinic', 'hairtpclinic']
            : []),
        ].filter(Boolean)
      )
    : null;
  const out = [];
  for (const raw of asArray(cases)) {
    const caseTenant = normalizeText(raw.tenantId);
    if (allowed && caseTenant && !allowed.has(caseTenant)) continue;
    const status = normalizeText(raw.quoteStatus).toLowerCase();
    if (!isCountableOfferStatus(status)) continue;
    const patientKey = normalizeText(raw.customerId || raw.patientId || raw.linkedPatientId);
    const sentAt = normalizeText(raw.quoteSentAt) || normalizeText(raw.quoteAcceptedAt);
    if (!sentAt) continue;
    out.push({ patientKey: patientKey || null, sentAt, status });
  }
  return out;
}

module.exports = {
  composeConversionFunnel,
  offersFromCommercialCases,
  isConsultationBooking,
  isTreatmentBooking,
  bookingPatientKey,
  DEFAULT_STOPPED_AT_OFFER_DAYS,
  DEFAULT_ROLLING_DAYS,
};
