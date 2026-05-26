'use strict';

/**
 * Kommersiella mail-dispatchers (P6.10.7).
 *
 * Tre nya dispatchers ovanpå `transactionalMailer` (Resend → Graph fallback):
 *   - `dispatchOfferEmail`               offert med token-länk + ev. PDF-bilaga
 *   - `dispatchTreatmentPlanEmail`       behandlingsplan-utskick
 *   - `dispatchBookingConfirmationEmail` bekräftelse efter `cco-booking-engine/confirm`
 *
 * Mönstret följer `dispatchBookingCancellationEmail` (idempotensskydd via
 * `patientCareStateStore.wasReminderSent` + audit-spår via `logReminder`).
 */

const { createTransactionalMailer } = require('../infra/transactionalMailer');
const { buildOfferEmail } = require('../templates/offerEmail');
const { buildTreatmentPlanEmail } = require('../templates/treatmentPlanEmail');
const { buildBookingConfirmationEmail } = require('../templates/bookingConfirmationEmail');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Kollar via patientCareStateStore om motsvarande mail redan skickats
 * inom fönstret. Returnerar `true` om vi ska hoppa över send.
 */
async function alreadyDispatched({
  patientCareStateStore,
  tenantId,
  reminderKey,
  withinHours = 24 * 14,
}) {
  if (!patientCareStateStore || typeof patientCareStateStore.wasReminderSent !== 'function') {
    return false;
  }
  if (!normalizeText(tenantId) || !normalizeText(reminderKey)) return false;
  return Boolean(
    await patientCareStateStore.wasReminderSent({
      tenantId,
      reminderKey,
      withinHours,
    })
  );
}

async function logDispatch({
  patientCareStateStore,
  tenantId,
  reminderKey,
  reminderType,
  patientId = '',
  metadata = {},
}) {
  if (!patientCareStateStore || typeof patientCareStateStore.logReminder !== 'function') {
    return;
  }
  if (!normalizeText(tenantId) || !normalizeText(reminderKey)) return;
  await patientCareStateStore.logReminder({
    tenantId,
    reminderKey,
    reminderType,
    patientId,
    channel: 'patient_email',
    metadata,
  });
}

function buildOfferReminderKey({ tenantId, offer, conversationId, recipient }) {
  const safeOffer = asObject(offer);
  const tenant = normalizeText(tenantId);
  const id =
    normalizeText(safeOffer.offerId) ||
    normalizeText(safeOffer.id) ||
    normalizeText(safeOffer.documentId) ||
    `${normalizeText(conversationId)}:${normalizeText(recipient)}`;
  return `offer_email:${tenant}:${id}`;
}

function buildPlanReminderKey({ tenantId, plan, patientId, recipient }) {
  const safePlan = asObject(plan);
  const tenant = normalizeText(tenantId);
  const id =
    normalizeText(safePlan.planId) ||
    normalizeText(safePlan.entryId) ||
    normalizeText(safePlan.encounterId) ||
    `${normalizeText(patientId)}:${normalizeText(recipient)}`;
  return `treatment_plan_email:${tenant}:${id}`;
}

function buildBookingConfirmationReminderKey({ tenantId, booking }) {
  const safeBooking = asObject(booking);
  const tenant = normalizeText(tenantId);
  const id =
    normalizeText(safeBooking.bookingId) ||
    normalizeText(safeBooking.id) ||
    `${normalizeText(safeBooking.customerEmail)}:${normalizeText(safeBooking?.slot?.startsAt)}`;
  return `booking_confirmation:${tenant}:${id}`;
}

/**
 * Skickar offert-mail (Resend → Graph fallback).
 *
 * @returns {Promise<{ skipped: boolean, reason?: string, provider?: string, mode?: string, recipient?: string, reminderKey?: string }>}
 */
async function dispatchOfferEmail({
  tenantId,
  conversationId = '',
  offer,
  recipient,
  locale = 'sv',
  graphSendConnector = null,
  patientCareStateStore = null,
  fromEmail = '',
  attachments = [],
  patientId = '',
} = {}) {
  const safeOffer = asObject(offer);
  const to = normalizeText(recipient);
  if (!to || !to.includes('@')) {
    return { skipped: true, reason: 'no_recipient' };
  }
  const reminderKey = buildOfferReminderKey({ tenantId, offer: safeOffer, conversationId, recipient: to });
  if (await alreadyDispatched({ patientCareStateStore, tenantId, reminderKey })) {
    return { skipped: true, reason: 'already_sent', reminderKey };
  }

  const content = buildOfferEmail({
    customerName: safeOffer.customerName || safeOffer.patientName,
    offerType: safeOffer.offerType || safeOffer.treatment || safeOffer.title,
    amount: safeOffer.amount ?? safeOffer.quotedAmount ?? safeOffer.price,
    signUrl: safeOffer.signUrl || safeOffer.acceptUrl || safeOffer.tokenUrl,
    validUntil: safeOffer.validUntil || safeOffer.expiresAt,
    hasAttachment: asArray(attachments).length > 0,
    coolingOffNote: safeOffer.coolingOffNote,
    locale,
  });

  const mailer = createTransactionalMailer({ graphSendConnector });
  const result = await mailer.sendEmail({
    to,
    from: normalizeText(fromEmail) || undefined,
    subject: content.subject,
    html: content.html,
    text: content.text,
    attachments: asArray(attachments),
  });

  if (result?.ok === true) {
    await logDispatch({
      patientCareStateStore,
      tenantId,
      reminderKey,
      reminderType: 'offer_email',
      patientId,
      metadata: {
        conversationId: normalizeText(conversationId),
        offerType: normalizeText(safeOffer.offerType || safeOffer.treatment || safeOffer.title),
        provider: result.provider,
        mode: result.mode,
        signUrlPresent: Boolean(safeOffer.signUrl || safeOffer.acceptUrl || safeOffer.tokenUrl),
        attachmentsCount: asArray(attachments).length,
      },
    });
  }

  return {
    skipped: result?.ok !== true,
    reason: result?.ok === true ? undefined : result?.error || result?.skipped || 'send_failed',
    provider: result?.provider,
    mode: result?.mode,
    recipient: to,
    reminderKey,
  };
}

/**
 * Skickar behandlingsplan-mail (Resend → Graph fallback).
 */
async function dispatchTreatmentPlanEmail({
  tenantId,
  conversationId = '',
  plan,
  recipient,
  locale = 'sv',
  graphSendConnector = null,
  patientCareStateStore = null,
  fromEmail = '',
  attachments = [],
  patientId = '',
  viewUrl = '',
} = {}) {
  const safePlan = asObject(plan);
  const to = normalizeText(recipient);
  if (!to || !to.includes('@')) {
    return { skipped: true, reason: 'no_recipient' };
  }
  const reminderKey = buildPlanReminderKey({
    tenantId,
    plan: safePlan,
    patientId,
    recipient: to,
  });
  if (await alreadyDispatched({ patientCareStateStore, tenantId, reminderKey })) {
    return { skipped: true, reason: 'already_sent', reminderKey };
  }

  const content = buildTreatmentPlanEmail({
    customerName: safePlan.customerName || safePlan.patientName,
    plan: safePlan,
    viewUrl: normalizeText(viewUrl) || normalizeText(safePlan.viewUrl),
    hasAttachment: asArray(attachments).length > 0,
    locale,
  });

  const mailer = createTransactionalMailer({ graphSendConnector });
  const result = await mailer.sendEmail({
    to,
    from: normalizeText(fromEmail) || undefined,
    subject: content.subject,
    html: content.html,
    text: content.text,
    attachments: asArray(attachments),
  });

  if (result?.ok === true) {
    await logDispatch({
      patientCareStateStore,
      tenantId,
      reminderKey,
      reminderType: 'treatment_plan_email',
      patientId,
      metadata: {
        conversationId: normalizeText(conversationId),
        method: normalizeText(safePlan.method),
        graftsTotal: normalizeText(String(safePlan.graftsTotal ?? '')),
        provider: result.provider,
        mode: result.mode,
        viewUrlPresent: Boolean(viewUrl || safePlan.viewUrl),
        attachmentsCount: asArray(attachments).length,
      },
    });
  }

  return {
    skipped: result?.ok !== true,
    reason: result?.ok === true ? undefined : result?.error || result?.skipped || 'send_failed',
    provider: result?.provider,
    mode: result?.mode,
    recipient: to,
    reminderKey,
  };
}

/**
 * Skickar bokningsbekräftelse till patient (Resend → Graph fallback).
 *
 * Avsedd att triggas från `POST /api/v1/cco-booking-engine/confirm`
 * (eller via store-hook). Idempotent via reminderKey
 * `booking_confirmation:{tenantId}:{bookingId}`.
 */
async function dispatchBookingConfirmationEmail({
  tenantId,
  booking,
  graphSendConnector = null,
  patientCareStateStore = null,
  fromEmail = '',
  locale = 'sv',
  bookingEngineStore = null,
} = {}) {
  const safeBooking = asObject(booking);
  const slot = asObject(safeBooking.slot);
  const customerEmail = normalizeText(safeBooking.customerEmail || safeBooking.contact?.email);
  if (!customerEmail || !customerEmail.includes('@')) {
    return { skipped: true, reason: 'no_recipient' };
  }
  const tenant = normalizeText(tenantId || safeBooking.tenantId);
  const reminderKey = buildBookingConfirmationReminderKey({ tenantId: tenant, booking: safeBooking });
  if (await alreadyDispatched({ patientCareStateStore, tenantId: tenant, reminderKey })) {
    return { skipped: true, reason: 'already_sent', reminderKey };
  }

  let serviceLabel = normalizeText(slot.serviceLabel) || normalizeText(safeBooking.serviceLabel);
  let locationLabel = normalizeText(slot.locationLabel) || normalizeText(safeBooking.locationLabel);
  let durationMinutes = Number(slot.durationMinutes || safeBooking.durationMinutes) || 0;

  if ((!serviceLabel || !locationLabel) && bookingEngineStore && typeof bookingEngineStore.listServices === 'function') {
    try {
      const services = asArray(await bookingEngineStore.listServices());
      const match = services.find((row) => normalizeText(row?.id) === normalizeText(slot.serviceId));
      if (match) {
        serviceLabel = serviceLabel || normalizeText(match.label);
        durationMinutes = durationMinutes || Number(match.defaultDurationMinutes) || 0;
      }
    } catch {
      // Best-effort. Saknar service-katalog → fallar tillbaka till slot-shape.
    }
  }

  const content = buildBookingConfirmationEmail({
    customerName: safeBooking.customerName,
    serviceId: slot.serviceId,
    serviceLabel: serviceLabel || slot.serviceId,
    slotStart: slot.startsAt || safeBooking.startsAt,
    resourceLabel: slot.resourceLabel,
    locationLabel,
    durationMinutes: durationMinutes || 60,
    locale,
  });

  const mailer = createTransactionalMailer({ graphSendConnector });
  const attachments = content.ics
    ? [
        {
          filename: 'besok.ics',
          content: Buffer.from(content.ics, 'utf8').toString('base64'),
          contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
        },
      ]
    : [];

  const result = await mailer.sendEmail({
    to: customerEmail,
    from: normalizeText(fromEmail) || undefined,
    subject: content.subject,
    html: content.html,
    text: content.ics ? `${content.text}\n\n--- calendar ---\n${content.ics}` : content.text,
    attachments,
  });

  if (result?.ok === true) {
    await logDispatch({
      patientCareStateStore,
      tenantId: tenant,
      reminderKey,
      reminderType: 'booking_confirmation',
      patientId: normalizeText(safeBooking.patientId),
      metadata: {
        bookingId: normalizeText(safeBooking.bookingId || safeBooking.id),
        customerEmail,
        startsAt: normalizeText(slot.startsAt || safeBooking.startsAt),
        serviceId: normalizeText(slot.serviceId),
        provider: result.provider,
        mode: result.mode,
        includesIcs: Boolean(content.ics),
      },
    });
  }

  return {
    skipped: result?.ok !== true,
    reason: result?.ok === true ? undefined : result?.error || result?.skipped || 'send_failed',
    provider: result?.provider,
    mode: result?.mode,
    recipient: customerEmail,
    reminderKey,
  };
}

module.exports = {
  dispatchOfferEmail,
  dispatchTreatmentPlanEmail,
  dispatchBookingConfirmationEmail,
  buildOfferReminderKey,
  buildPlanReminderKey,
  buildBookingConfirmationReminderKey,
};
