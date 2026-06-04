'use strict';

const {
  normalizeBookingReminderLeadTimeConfig,
  resolveBookingReminderLeadTimeHours,
  resolveMeetingChannel,
} = require('./bookingReminderLeadTime');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function slotStartsAtKey(iso) {
  const raw = normalizeText(iso);
  if (!raw) return '';
  return raw.slice(0, 16);
}

function buildVisitReminderKey({ kind = 'booking', id = '' } = {}) {
  return `visit:${normalizeText(kind)}:${normalizeText(id)}`;
}

function buildEmailIcsReminderKey({ kind = 'booking', id = '' } = {}) {
  return `visit-email:${normalizeText(kind)}:${normalizeText(id)}`;
}

function labelForMissingForm(key) {
  const map = {
    health_declaration: 'Hälsodeklaration',
    health_declaration_signature: 'Hälsodeklaration (signering)',
    consultation_plan: 'Behandlingsplan',
    consultation_plan_signature: 'Behandlingsplan (signering)',
    treatment_agreement: 'Behandlingsavtal',
  };
  return map[key] || String(key || '');
}

function hasSmsReminderSentFromEvents(events = []) {
  return asArray(events).some((event) => {
    const type = normalizeKey(event?.type);
    if (type.includes('sms_reminder') || type.includes('patient_sms')) return true;
    const hay = `${type} ${event?.label || ''} ${event?.detail || ''}`.toLowerCase();
    return /sms.*påminn|sms.*reminder|patient_sms/.test(hay);
  });
}

function hasEmailIcsSentFromEvents(events = []) {
  return asArray(events).some((event) => {
    const type = normalizeKey(event?.type);
    if (
      type.includes('booking_reminder_email') ||
      type.includes('calendar_invite') ||
      type.includes('patient_reminder_email')
    ) {
      return true;
    }
    const hay = `${type} ${event?.label || ''} ${event?.detail || ''}`.toLowerCase();
    return /ics|kalenderinbjudan|calendar invite|e-post.*påminn|email.*reminder/.test(hay);
  });
}

function indexReminderLog(reminderLog = []) {
  const emailIcsKeys = new Set();
  const smsSentKeys = new Set();

  for (const row of asArray(reminderLog)) {
    const key = normalizeText(row.reminderKey);
    const channel = normalizeKey(row.channel);
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const compositeKey = metadata.customerEmail
      ? `${normalizeKey(metadata.customerEmail)}::${slotStartsAtKey(metadata.startsAt)}`
      : '';

    if (channel === 'patient_email_ics' || channel === 'patient_email') {
      if (key) emailIcsKeys.add(key);
      if (compositeKey) emailIcsKeys.add(compositeKey);
    }
    if (channel === 'patient_sms' || channel === 'sms') {
      if (key) smsSentKeys.add(key);
      if (compositeKey) smsSentKeys.add(compositeKey);
    }
  }

  return { emailIcsKeys, smsSentKeys };
}

function resolveLeadTimeHours({ leadTimeConfig, service = {}, resourceId = '' } = {}) {
  const config = normalizeBookingReminderLeadTimeConfig(leadTimeConfig || {});
  return resolveBookingReminderLeadTimeHours({
    config,
    service,
    resourceId,
    channel: resolveMeetingChannel(service),
  });
}

function deriveCalendarSignalsForVisit({
  bookingCase = null,
  slot = {},
  servicesById = new Map(),
  missingByEmail = new Map(),
  reminderIndex = { emailIcsKeys: new Set(), smsSentKeys: new Set() },
  leadTimeConfig = {},
} = {}) {
  const events = asArray(bookingCase?.events);
  const emailKey = normalizeKey(bookingCase?.customerEmail);
  const startsAt = normalizeText(slot?.startsAt || slot?.startAt || slot?.start);
  const serviceId = normalizeText(slot?.serviceId);
  const service =
    servicesById.get(serviceId) || { id: serviceId, meetingMode: slot?.meetingMode };
  const leadTimeHours = resolveLeadTimeHours({
    leadTimeConfig,
    service,
    resourceId: slot?.resourceId,
  });

  const missingRow = emailKey ? missingByEmail.get(emailKey) : null;
  const missing = asArray(missingRow?.missing);
  const needsHealthDeclaration = missing.some((item) =>
    String(item).includes('health_declaration')
  );

  const bookingRef =
    normalizeText(bookingCase?.engineBookingId) ||
    normalizeText(bookingCase?.bookingEngine?.booking?.bookingId) ||
    normalizeText(bookingCase?.bookingCaseId);
  const visitKey = buildVisitReminderKey({ kind: 'booking', id: bookingRef });
  const emailIcsKey = buildEmailIcsReminderKey({ kind: 'booking', id: bookingRef });
  const compositeKey = emailKey && startsAt ? `${emailKey}::${slotStartsAtKey(startsAt)}` : '';

  const emailIcsSent =
    hasEmailIcsSentFromEvents(events) ||
    reminderIndex.emailIcsKeys.has(emailIcsKey) ||
    reminderIndex.emailIcsKeys.has(visitKey) ||
    (compositeKey && reminderIndex.emailIcsKeys.has(compositeKey));

  const smsReminderSent =
    hasSmsReminderSentFromEvents(events) ||
    reminderIndex.smsSentKeys.has(visitKey) ||
    (compositeKey && reminderIndex.smsSentKeys.has(compositeKey));

  let smsReminderDue = false;
  if (startsAt && !smsReminderSent) {
    const hoursUntil = (Date.parse(startsAt) - Date.now()) / (60 * 60 * 1000);
    smsReminderDue = hoursUntil > 0 && hoursUntil <= leadTimeHours + 1;
  }

  return {
    smsLeadTimeHours: leadTimeHours,
    smsReminderSent,
    smsReminderDue,
    emailIcsSent,
    needsHealthDeclaration,
    missingForms: missing.length > 0,
    missingFormLabels: missing.map(labelForMissingForm).filter(Boolean),
    patientId: missingRow?.patientId || bookingCase?.patientId || '',
    patientPortalHint: needsHealthDeclaration ? 'patientportal_form_missing' : null,
  };
}

function buildCalendarSignalsIndex({
  bookingCases = [],
  servicesById = new Map(),
  missingByEmail = new Map(),
  reminderLog = [],
  leadTimeConfig = {},
  fromDate = '',
  toDate = '',
} = {}) {
  const reminderIndex = indexReminderLog(reminderLog);
  const byCaseId = {};

  for (const bookingCase of bookingCases) {
    const caseId = normalizeText(bookingCase?.bookingCaseId);
    if (!caseId) continue;
    const slots = asArray(bookingCase?.selectedSlots);
    const inRangeSlots = slots.filter((slot) => {
      const iso = normalizeText(slot?.startsAt || slot?.startAt || slot?.start).slice(0, 10);
      if (!iso) return false;
      if (fromDate && iso < fromDate) return false;
      if (toDate && iso > toDate) return false;
      return true;
    });
    if (!inRangeSlots.length) continue;

    byCaseId[caseId] = deriveCalendarSignalsForVisit({
      bookingCase,
      slot: inRangeSlots[0],
      servicesById,
      missingByEmail,
      reminderIndex,
      leadTimeConfig,
    });
  }

  return {
    leadTime: normalizeBookingReminderLeadTimeConfig(leadTimeConfig),
    byCaseId,
  };
}

module.exports = {
  buildCalendarSignalsIndex,
  buildEmailIcsReminderKey,
  buildVisitReminderKey,
  deriveCalendarSignalsForVisit,
  hasEmailIcsSentFromEvents,
  hasSmsReminderSentFromEvents,
  indexReminderLog,
  labelForMissingForm,
};
