'use strict';

const {
  computeMaxLeadTimeHours,
  DEFAULT_TOLERANCE_HOURS,
  isWithinReminderLeadWindow,
  normalizeBookingReminderLeadTimeConfig,
  resolveBookingReminderLeadTimeHours,
  resolveMeetingChannel,
} = require('./bookingReminderLeadTime');
const { createTransactionalMailer } = require('../infra/transactionalMailer');
const { buildBookingReminderEmail } = require('../templates/bookingReminderEmail');
const {
  buildBookingCancellationEmail,
} = require('../templates/bookingCancellationEmail');
const { buildEmailIcsReminderKey } = require('./bookingCalendarSignals');
const {
  FOLLOWUP_VARIANT_BY_MONTH,
  planFollowupDrafts,
} = require('./ccoFollowupDraftPlanner');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseIso(value) {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? null : date;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hoursUntil(iso) {
  const date = parseIso(iso);
  if (!date) return null;
  return (date.getTime() - Date.now()) / (60 * 60 * 1000);
}

function isSignedEntry(entry) {
  return Boolean(entry?.locked || entry?.signedAt || entry?.signatureStatus === 'signed');
}

async function listPatientsSafe(patientMasterStore, tenantId, limit = 500) {
  if (!patientMasterStore?.listPatients) return [];
  const result = await patientMasterStore.listPatients({ tenantId, limit });
  return asArray(result?.patients);
}

async function listJournalEntriesSafe(journalStore, tenantId, patientId) {
  if (!journalStore?.listEntries) return [];
  const result = await journalStore.listEntries({ tenantId, patientId });
  return asArray(result?.entries || result);
}

function classifyMissingForms(entries, agreement = null) {
  const rows = asArray(entries);
  const missing = [];
  const hasHealth = rows.some((e) => e.journalType === 'health_declaration' && isSignedEntry(e));
  const hasHealthDraft = rows.some((e) => e.journalType === 'health_declaration');
  const hasPlan = rows.some((e) => e.journalType === 'consultation_plan');
  const hasSignedPlan = rows.some((e) => e.journalType === 'consultation_plan' && isSignedEntry(e));

  if (!hasHealthDraft) missing.push('health_declaration');
  else if (!hasHealth) missing.push('health_declaration_signature');
  if (!hasPlan) missing.push('consultation_plan');
  else if (!hasSignedPlan) missing.push('consultation_plan_signature');

  const agreementStatus = normalizeText(agreement?.agreementStatus).toLowerCase();
  if (agreement && agreementStatus && !['bookable', 'signed'].includes(agreementStatus)) {
    missing.push('treatment_agreement');
  }

  return missing;
}

function buildDraftProposalFields(missing = []) {
  const fields = {};
  if (missing.includes('health_declaration') || missing.includes('health_declaration_signature')) {
    fields.healthDeclaration = {
      title: 'Hälsodeklaration',
      journalType: 'health_declaration',
      formVariant: 'hair_tp',
      sourceQuestionaryId: '16414',
      note: 'Föreslagen utkast — kräver personalgodkännande innan signering.',
    };
  }
  if (missing.includes('consultation_plan') || missing.includes('consultation_plan_signature')) {
    fields.consultationPlan = {
      title: 'Konsultation — behandlingsplan',
      journalType: 'consultation_plan',
      note: 'Föreslagen utkast baserat på saknad plan.',
    };
  }
  return fields;
}

async function applyApprovedDraftProposal({
  proposal,
  journalStore,
  patientMasterStore,
  actor = {},
} = {}) {
  if (!proposal || normalizeText(proposal.status).toLowerCase() !== 'approved') {
    return { applied: false, reason: 'not_approved' };
  }
  if (!journalStore?.upsertEntry) {
    return { applied: false, reason: 'journal_store_missing' };
  }

  const tenantId = normalizeText(proposal.tenantId);
  const patientId = normalizeText(proposal.patientId);
  if (!tenantId || !patientId) {
    return { applied: false, reason: 'missing_patient' };
  }

  let personnummer = '';
  if (patientMasterStore?.getPatient) {
    const patient = await patientMasterStore.getPatient({ tenantId, patientId });
    personnummer = normalizeText(patient?.personnummer || patient?.personalId);
  }

  const entries = await listJournalEntriesSafe(journalStore, tenantId, patientId);
  const draftFields = asObject(proposal.draftFields);
  const created = [];

  for (const spec of Object.values(draftFields)) {
    const journalType = normalizeText(spec?.journalType);
    if (!journalType) continue;
    const hasSigned = entries.some(
      (entry) => entry.journalType === journalType && isSignedEntry(entry)
    );
    if (hasSigned) {
      created.push({ journalType, action: 'skipped_signed_exists' });
      continue;
    }
    const openDraft = entries.find(
      (entry) => entry.journalType === journalType && !isSignedEntry(entry)
    );
    if (openDraft) {
      created.push({ journalType, entryId: openDraft.entryId, action: 'existing_draft' });
      continue;
    }
    const entry = await journalStore.upsertEntry(
      {
        tenantId,
        patientId,
        personnummer,
        journalType,
        formVariant: normalizeText(spec.formVariant) || undefined,
        sourceQuestionaryId: normalizeText(spec.sourceQuestionaryId) || undefined,
        title: normalizeText(spec.title) || journalType,
        source: 'cco_draft_proposal_approved',
        status: 'draft',
        fields: asObject(spec.fields),
      },
      { actor }
    );
    created.push({ journalType, entryId: entry.entryId, action: 'created' });
  }

  return {
    applied: true,
    proposalId: proposal.proposalId,
    patientId,
    created,
  };
}

/**
 * P6.6.10 — Promote ett **godkänt** journalutkast (proposal) till en
 * signerbar journalpost i `ccoJournalStore`. Skiljer sig från
 * `applyApprovedDraftProposal` genom att:
 *   - Markera proposalen som `promoted` med `journalEntryIds`
 *   - Returnera audit-shape (`auditEvent`) som route kan logga
 *   - Vara idempotent: redan promoted proposal returnerar utan dubbletter
 */
async function promoteApprovedDraftToJournalEntry({
  proposalId,
  tenantId,
  ownerUserId = '',
  patientCareStateStore,
  journalStore,
  patientMasterStore,
  actor = {},
} = {}) {
  if (!patientCareStateStore?.listDraftProposals || !patientCareStateStore?.upsertDraftProposal) {
    return { promoted: false, reason: 'patient_care_state_store_missing' };
  }
  if (!journalStore?.upsertEntry) {
    return { promoted: false, reason: 'journal_store_missing' };
  }
  const tenant = normalizeText(tenantId);
  const proposalIdNormalized = normalizeText(proposalId);
  if (!tenant || !proposalIdNormalized) {
    return { promoted: false, reason: 'tenant_or_proposal_missing' };
  }
  const proposals = await patientCareStateStore.listDraftProposals({
    tenantId: tenant,
    status: 'all',
    limit: 200,
  });
  const proposal = proposals.find((row) => row.proposalId === proposalIdNormalized) || null;
  if (!proposal) {
    return { promoted: false, reason: 'proposal_not_found' };
  }
  const status = normalizeText(proposal.status).toLowerCase();
  if (status === 'promoted') {
    return {
      promoted: false,
      reason: 'already_promoted',
      proposalId: proposal.proposalId,
      journalEntryIds: asArray(proposal.journalEntryIds),
      proposal,
    };
  }
  if (status !== 'approved') {
    return { promoted: false, reason: 'not_approved', currentStatus: status };
  }
  const promotionActor = {
    userId: normalizeText(ownerUserId || actor.userId),
    displayName: normalizeText(actor.displayName || ownerUserId),
    role: normalizeText(actor.role) || 'OWNER',
  };
  const application = await applyApprovedDraftProposal({
    proposal,
    journalStore,
    patientMasterStore,
    actor: promotionActor,
  });
  const journalEntryIds = asArray(application.created)
    .map((row) => normalizeText(row.entryId))
    .filter(Boolean);
  const promotedProposal = await patientCareStateStore.upsertDraftProposal({
    ...proposal,
    status: 'promoted',
    promotedAt: new Date().toISOString(),
    promotedBy: promotionActor.userId,
    journalEntryIds,
    journalEntries: asArray(application.created),
  });
  return {
    promoted: true,
    proposalId: promotedProposal.proposalId,
    patientId: promotedProposal.patientId,
    journalEntryIds,
    journalEntries: asArray(application.created),
    proposal: promotedProposal,
    auditEvent: {
      action: 'journal_draft_promoted',
      tenantId: tenant,
      actorUserId: promotionActor.userId,
      targetType: 'journal_draft_proposal',
      targetId: promotedProposal.proposalId,
      metadata: {
        patientId: promotedProposal.patientId,
        journalEntryIds,
        journalEntries: asArray(application.created),
      },
    },
  };
}

async function buildMissingFormsReport({
  patientMasterStore,
  journalStore,
  treatmentAgreementStore = null,
  tenantId,
  patientLimit = 200,
} = {}) {
  const patients = await listPatientsSafe(patientMasterStore, tenantId, patientLimit);
  const rows = [];

  for (const patient of patients) {
    const patientId = normalizeText(patient.patientId || patient.id);
    if (!patientId) continue;
    const entries = await listJournalEntriesSafe(journalStore, tenantId, patientId);
    let agreement = null;
    if (treatmentAgreementStore?.getPatientAgreement) {
      try {
        agreement = await treatmentAgreementStore.getPatientAgreement({ tenantId, patientId });
      } catch {
        agreement = null;
      }
    }
    const missing = classifyMissingForms(entries, agreement);
    if (!missing.length) continue;
    rows.push({
      patientId,
      displayName: patient.displayName || patient.fullName || '',
      primaryEmail: patient.primaryEmail || '',
      missing,
      entryCount: entries.length,
    });
  }

  rows.sort((a, b) => b.missing.length - a.missing.length || a.displayName.localeCompare(b.displayName));

  return {
    generatedAt: new Date().toISOString(),
    tenantId,
    patientCount: patients.length,
    patientsWithMissing: rows.length,
    rows,
  };
}

async function buildJournalDraftProposals({
  patientMasterStore,
  journalStore,
  treatmentAgreementStore = null,
  patientCareStateStore,
  tenantId,
  patientLimit = 100,
  persist = true,
} = {}) {
  const report = await buildMissingFormsReport({
    patientMasterStore,
    journalStore,
    treatmentAgreementStore,
    tenantId,
    patientLimit,
  });
  const proposals = [];

  for (const row of report.rows.slice(0, 50)) {
    const fields = buildDraftProposalFields(row.missing);
    if (!Object.keys(fields).length) continue;
    const proposal =
      patientCareStateStore && persist
        ? await patientCareStateStore.upsertDraftProposal({
            tenantId,
            patientId: row.patientId,
            status: 'pending',
            reviewRequired: true,
            source: 'cco_journal_draft_agent',
            missing: row.missing,
            displayName: row.displayName,
            draftFields: fields,
          })
        : {
            proposalId: persist ? `local-${row.patientId}` : `preview-${row.patientId}`,
            tenantId,
            patientId: row.patientId,
            status: 'pending',
            reviewRequired: true,
            source: 'cco_journal_draft_agent',
            missing: row.missing,
            displayName: row.displayName,
            draftFields: fields,
          };
    proposals.push(proposal);
  }

  return {
    generatedAt: new Date().toISOString(),
    tenantId,
    proposalCount: proposals.length,
    proposals,
    reportSummary: {
      patientsWithMissing: report.patientsWithMissing,
      patientCount: report.patientCount,
    },
  };
}

function listUpcomingBookings(bookingEngineStore, tenantId, withinHours = 48) {
  const state = bookingEngineStore?.state || bookingEngineStore?._state;
  const bookings = asArray(state?.bookings || state?.confirmedBookings);
  const reservations = asArray(state?.reservations);
  const slots = [];

  for (const booking of bookings) {
    const startsAt = normalizeText(booking?.slot?.startsAt || booking?.startsAt);
    const hours = hoursUntil(startsAt);
    if (hours === null || hours < 0 || hours > withinHours) continue;
    if (normalizeText(booking.tenantId) && normalizeText(booking.tenantId) !== tenantId) continue;
    slots.push({
      kind: 'booking',
      id: normalizeText(booking.bookingId || booking.id),
      patientId: normalizeText(booking.patientId),
      customerEmail: normalizeText(booking.customerEmail || booking.contact?.email),
      customerName: normalizeText(booking.customerName || booking.contact?.name),
      startsAt,
      hoursUntil: Math.round(hours * 10) / 10,
      serviceId: normalizeText(booking?.slot?.serviceId || booking.serviceId),
      resourceId: normalizeText(booking?.slot?.resourceId || booking.resourceId),
    });
  }

  for (const reservation of reservations) {
    const startsAt = normalizeText(reservation?.slot?.startsAt);
    const hours = hoursUntil(startsAt);
    if (hours === null || hours < 0 || hours > withinHours) continue;
    if (normalizeText(reservation.tenantId) && normalizeText(reservation.tenantId) !== tenantId) continue;
    slots.push({
      kind: 'reservation',
      id: normalizeText(reservation.reservationId),
      patientId: normalizeText(reservation.patientId),
      customerEmail: normalizeText(reservation.customerEmail),
      customerName: normalizeText(reservation.customerName),
      startsAt,
      hoursUntil: Math.round(hours * 10) / 10,
      serviceId: normalizeText(reservation?.slot?.serviceId),
      resourceId: normalizeText(reservation?.slot?.resourceId),
    });
  }

  return slots.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

async function loadServicesById(bookingEngineStore) {
  const map = new Map();
  if (typeof bookingEngineStore?.listServices === 'function') {
    const services = asArray(await bookingEngineStore.listServices());
    for (const service of services) {
      const id = normalizeText(service?.id);
      if (id) map.set(id, service);
    }
  }
  return map;
}

async function resolveLeadTimeConfig({ settingsStore, tenantId, leadTimeConfig = null } = {}) {
  if (leadTimeConfig) {
    return normalizeBookingReminderLeadTimeConfig(leadTimeConfig);
  }
  if (settingsStore && typeof settingsStore.getTenantSettings === 'function' && tenantId) {
    const settings = await settingsStore.getTenantSettings({ tenantId });
    return normalizeBookingReminderLeadTimeConfig(settings?.bookingReminderLeadTime);
  }
  return normalizeBookingReminderLeadTimeConfig({});
}

async function buildCustomerReminderQueue({
  bookingEngineStore,
  journalStore,
  patientMasterStore = null,
  patientCareStateStore = null,
  settingsStore = null,
  tenantId,
  leadTimeConfig = null,
  leadTimeToleranceHours = DEFAULT_TOLERANCE_HOURS,
  visitWithinHours = null,
} = {}) {
  const normalizedLeadTime = await resolveLeadTimeConfig({ settingsStore, tenantId, leadTimeConfig });
  const scanWithinHours =
    Number(visitWithinHours) > 0
      ? Number(visitWithinHours)
      : computeMaxLeadTimeHours(normalizedLeadTime) + Math.max(1, Number(leadTimeToleranceHours) || 1);
  const visitCandidates = listUpcomingBookings(bookingEngineStore, tenantId, scanWithinHours);
  const servicesById = await loadServicesById(bookingEngineStore);
  const visitReminders = [];

  for (const slot of visitCandidates) {
    const service = servicesById.get(slot.serviceId) || { id: slot.serviceId };
    const channel = resolveMeetingChannel(service);
    const leadTimeHours = resolveBookingReminderLeadTimeHours({
      config: normalizedLeadTime,
      service,
      resourceId: slot.resourceId,
      channel,
    });
    if (
      !isWithinReminderLeadWindow({
        hoursUntilVisit: slot.hoursUntil,
        leadTimeHours,
        toleranceHours: leadTimeToleranceHours,
      })
    ) {
      continue;
    }

    const reminderKey = `visit:${slot.kind}:${slot.id}`;
    const alreadySent = patientCareStateStore
      ? await patientCareStateStore.wasReminderSent({ tenantId, reminderKey, withinHours: 72 })
      : false;
    if (alreadySent) continue;
    visitReminders.push({
      ...slot,
      tenantId,
      reminderType: 'visit_upcoming',
      reminderKey,
      channel,
      leadTimeHours,
      message: `Påminnelse: besök om ${slot.hoursUntil}h (lead ${leadTimeHours}h, ${slot.startsAt})`,
    });
  }

  const aftercareReminders = [];
  if (journalStore?.listEntries && patientMasterStore?.listPatients) {
    const patients = await listPatientsSafe(patientMasterStore, tenantId, 100);
    for (const patient of patients) {
      const patientId = normalizeText(patient.patientId || patient.id);
      if (!patientId) continue;
      const entries = await listJournalEntriesSafe(journalStore, tenantId, patientId);
      const needsFollowUp = entries.some(
        (e) =>
          (e.journalType === 'tp_treatment' || e.journalType === 'follow_up') &&
          isSignedEntry(e) &&
          !entries.some((f) => f.journalType === 'follow_up' && !f.locked)
      );
      if (!needsFollowUp) continue;
      const reminderKey = `aftercare:${patientId}`;
      const alreadySent = patientCareStateStore
        ? await patientCareStateStore.wasReminderSent({ tenantId, reminderKey, withinHours: 168 })
        : false;
      if (alreadySent) continue;
      aftercareReminders.push({
        reminderType: 'aftercare_followup',
        reminderKey,
        patientId,
        displayName: patient.displayName || '',
        message: 'Eftervård/återbesök — formulär eller uppföljning saknas.',
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    tenantId,
    leadTimePolicy: normalizedLeadTime,
    visitReminders,
    aftercareReminders,
    total: visitReminders.length + aftercareReminders.length,
  };
}

function buildReminderDigestHtml(queue = {}) {
  const visitLines = asArray(queue.visitReminders).map(
    (row) =>
      `<li>${normalizeText(row.customerName) || normalizeText(row.patientId) || 'Kund'} — ${normalizeText(row.message)}</li>`
  );
  const aftercareLines = asArray(queue.aftercareReminders).map(
    (row) => `<li>${normalizeText(row.displayName) || normalizeText(row.patientId)} — ${normalizeText(row.message)}</li>`
  );
  return `
    <h2>CCO påminnelser</h2>
    <p>Genererad ${new Date().toISOString()}</p>
    <h3>Kommande besök (${visitLines.length})</h3>
    <ul>${visitLines.join('') || '<li>Inga</li>'}</ul>
    <h3>Eftervård / uppföljning (${aftercareLines.length})</h3>
    <ul>${aftercareLines.join('') || '<li>Inga</li>'}</ul>
  `.trim();
}

async function dispatchCustomerReminderDigest({
  graphSendConnector,
  queue,
  tenantId,
  toEmail,
  fromEmail,
} = {}) {
  if (!graphSendConnector || typeof graphSendConnector.sendNewMessage !== 'function') {
    return { skipped: true, reason: 'graph_send_unavailable' };
  }
  const recipient = normalizeText(toEmail);
  if (!recipient || queue?.total <= 0) {
    return { skipped: true, reason: 'no_recipient_or_empty_queue' };
  }
  const subject = `CCO påminnelser — ${queue.visitReminders.length} besök, ${queue.aftercareReminders.length} eftervård`;
  const html = buildReminderDigestHtml(queue);
  const mailboxId = normalizeText(fromEmail) || 'kons@hairtpclinic.com';
  await graphSendConnector.sendNewMessage({
    mailboxId,
    sourceMailboxId: mailboxId,
    subject,
    bodyHtml: html,
    body: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    to: [{ emailAddress: { address: recipient } }],
  });
  return { skipped: false, to: recipient, subject };
}

async function dispatchPatientVisitReminderEmails({
  queue,
  bookingEngineStore,
  graphSendConnector,
  patientCareStateStore = null,
  fromEmail,
  locale = 'sv',
} = {}) {
  const mailer = createTransactionalMailer({ graphSendConnector });
  const servicesById = await loadServicesById(bookingEngineStore);
  let sent = 0;
  let skipped = 0;
  const results = [];

  for (const reminder of asArray(queue?.visitReminders)) {
    const recipient = normalizeText(reminder.customerEmail);
    if (!recipient || !recipient.includes('@')) {
      skipped += 1;
      continue;
    }
    const service = servicesById.get(reminder.serviceId) || { label: reminder.serviceId };
    const content = buildBookingReminderEmail({
      customerName: reminder.customerName,
      serviceLabel: service.label,
      startsAt: reminder.startsAt,
      leadTimeHours: reminder.leadTimeHours,
      locale,
    });
    const result = await mailer.sendEmail({
      to: recipient,
      from: normalizeText(fromEmail) || undefined,
      subject: content.subject,
      html: content.html,
      text: `${content.text}\n\n--- calendar ---\n${content.ics}`,
      attachments: [
        {
          filename: 'besok.ics',
          content: Buffer.from(content.ics, 'utf8').toString('base64'),
          contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
        },
      ],
    });
    results.push({ recipient, ok: result.ok === true, provider: result.provider, mode: result.mode });
    if (result.ok === true) {
      sent += 1;
      if (patientCareStateStore && typeof patientCareStateStore.logReminder === 'function') {
        await patientCareStateStore.logReminder({
          tenantId: normalizeText(reminder.tenantId),
          reminderKey: buildEmailIcsReminderKey({ kind: reminder.kind, id: reminder.id }),
          reminderType: 'visit_upcoming',
          patientId: reminder.patientId,
          channel: 'patient_email_ics',
          metadata: {
            startsAt: reminder.startsAt,
            customerEmail: reminder.customerEmail,
            includesIcs: true,
            leadTimeHours: reminder.leadTimeHours,
          },
        });
      }
    } else {
      skipped += 1;
    }
  }

  return { sent, skipped, results };
}

/**
 * Skicka avbokningsbekräftelse till patient (Resend → Graph fallback).
 *
 * Pattern: motsvarar `dispatchPatientVisitReminderEmails` men för en
 * enstaka avbokad bokning. Idempotensskydd via patientCareStateStore
 * (`reminderKey = booking_cancellation:<bookingId>`) så att samma cancel
 * inte triggar mer än ett mail även om route anropas igen.
 */
async function dispatchBookingCancellationEmail({
  booking,
  graphSendConnector,
  patientCareStateStore = null,
  fromEmail,
  locale = 'sv',
  reason = '',
  tenantId = '',
  bookingEngineStore = null,
} = {}) {
  const safeBooking = asObject(booking);
  const customerEmail = normalizeText(safeBooking.customerEmail);
  if (!customerEmail || !customerEmail.includes('@')) {
    return { skipped: true, reason: 'no_recipient' };
  }
  const slot = asObject(safeBooking.slot);
  const startsAt = normalizeText(slot.startsAt || safeBooking.startsAt);
  const bookingId =
    normalizeText(safeBooking.bookingId) ||
    normalizeText(safeBooking.id) ||
    `${customerEmail}:${startsAt}`;
  const reminderKey = `booking_cancellation:${bookingId}`;
  const resolvedTenantId = normalizeText(tenantId || safeBooking.tenantId);

  if (
    patientCareStateStore &&
    typeof patientCareStateStore.wasReminderSent === 'function' &&
    resolvedTenantId
  ) {
    const alreadySent = await patientCareStateStore.wasReminderSent({
      tenantId: resolvedTenantId,
      reminderKey,
      withinHours: 24 * 14,
    });
    if (alreadySent) {
      return { skipped: true, reason: 'already_sent', reminderKey };
    }
  }

  let serviceLabel = normalizeText(slot.serviceLabel);
  let locationLabel = normalizeText(slot.locationLabel);
  if ((!serviceLabel || !locationLabel) && bookingEngineStore) {
    const servicesById = await loadServicesById(bookingEngineStore);
    const service = servicesById.get(normalizeText(slot.serviceId));
    if (service) {
      serviceLabel = serviceLabel || normalizeText(service.label);
    }
  }

  const content = buildBookingCancellationEmail({
    customerName: safeBooking.customerName,
    serviceId: slot.serviceId,
    serviceLabel: serviceLabel || normalizeText(slot.serviceLabel) || slot.serviceId,
    slotStart: startsAt,
    resourceLabel: slot.resourceLabel,
    locationLabel,
    reason,
    locale,
  });

  const mailer = createTransactionalMailer({ graphSendConnector });
  const result = await mailer.sendEmail({
    to: customerEmail,
    from: normalizeText(fromEmail) || undefined,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });

  if (
    result?.ok === true &&
    patientCareStateStore &&
    typeof patientCareStateStore.logReminder === 'function' &&
    resolvedTenantId
  ) {
    await patientCareStateStore.logReminder({
      tenantId: resolvedTenantId,
      reminderKey,
      reminderType: 'booking_cancellation',
      patientId: normalizeText(safeBooking.patientId),
      channel: 'patient_email',
      metadata: {
        bookingId,
        customerEmail,
        startsAt,
        serviceId: normalizeText(slot.serviceId),
        reason: normalizeText(reason),
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

/**
 * P6.4.8 — Automatisk draft uppföljning 4/6/12 mån efter signerad transplant.
 *
 * Scheduler-job (`cco_followup_draft_generator`) ringer denna funktion.
 * - Hittar signerade TP-behandlings-entries
 * - Listar befintliga follow_up-entries
 * - Hämtar plannedState för idempotens (`followupPlanState`)
 * - Planerar utkast och skapar drafts via `journalStore.upsertEntry`
 * - Persisterar plan-rader i `patientCareStateStore.recordFollowupPlanEntry`
 */
async function runFollowupDraftGenerator({
  journalStore,
  patientMasterStore,
  patientCareStateStore,
  tenantId,
  today = new Date(),
  leadDays = 30,
  patientLimit = 500,
  actor = {},
} = {}) {
  if (!journalStore?.listEntries || !patientMasterStore?.listPatients) {
    return { tenantId, skipped: true, reason: 'journal_or_patient_store_missing' };
  }
  if (!patientCareStateStore?.recordFollowupPlanEntry) {
    return { tenantId, skipped: true, reason: 'patient_care_state_store_missing' };
  }
  const patients = await listPatientsSafe(patientMasterStore, tenantId, patientLimit);
  const signedEncounters = [];
  const existingFollowups = [];
  for (const patient of patients) {
    const patientId = normalizeText(patient.patientId || patient.id);
    if (!patientId) continue;
    const entries = await listJournalEntriesSafe(journalStore, tenantId, patientId);
    for (const entry of entries) {
      const journalType = normalizeText(entry.journalType);
      if (journalType === 'tp_treatment' && isSignedEntry(entry)) {
        signedEncounters.push({
          encounterId: normalizeText(entry.treatmentEncounterId) || normalizeText(entry.entryId),
          patientId,
          tenantId,
          type: 'tp_treatment',
          signedAt: entry.signedAt || entry.updatedAt,
          formVariant: entry.formVariant,
          sourceEntryId: entry.entryId,
        });
      } else if (journalType === 'follow_up') {
        existingFollowups.push({
          patientId,
          treatmentEncounterId:
            normalizeText(entry.treatmentEncounterId) || normalizeText(entry.encounterId),
          formVariant: entry.formVariant,
          locked: Boolean(entry.locked),
          entryId: entry.entryId,
        });
      }
    }
  }
  const plannedState = await patientCareStateStore.listFollowupPlanState({ tenantId });
  const plan = planFollowupDrafts({
    signedEncounters,
    existingFollowups,
    plannedState,
    today,
    leadDays,
    tenantId,
  });

  let createdDrafts = 0;
  let recordedPlanRows = 0;
  const created = [];

  for (const row of plan.planned) {
    if (row.status !== 'planned') continue;
    const encounterMatch = signedEncounters.find(
      (entry) => entry.encounterId === row.encounterId
    );
    const sourceEntryId = encounterMatch?.sourceEntryId || row.encounterId;
    let personnummer = '';
    if (patientMasterStore?.getPatient) {
      try {
        const patient = await patientMasterStore.getPatient({
          tenantId,
          patientId: row.patientId,
        });
        personnummer = normalizeText(patient?.personnummer || patient?.personalId);
      } catch {
        personnummer = '';
      }
    }
    let draftEntry = null;
    try {
      draftEntry = await journalStore.upsertEntry(
        {
          tenantId,
          patientId: row.patientId,
          personnummer,
          treatmentEncounterId: row.encounterId,
          journalType: 'follow_up',
          formVariant: row.formVariant,
          status: 'draft',
          title: row.title,
          source: row.source,
          fields: {
            sourceEntryId,
            transplantSignedAt: row.signedAt,
            followupMonth: row.followupMonth,
            plannedDueAt: row.dueAt,
          },
        },
        { actor }
      );
      createdDrafts += 1;
      created.push({
        encounterId: row.encounterId,
        followupMonth: row.followupMonth,
        formVariant: row.formVariant,
        entryId: draftEntry.entryId,
      });
    } catch (error) {
      console.warn(
        '[cco_followup_draft_generator] kunde inte skapa draft:',
        error?.message || error
      );
    }
    try {
      await patientCareStateStore.recordFollowupPlanEntry({
        tenantId,
        encounterId: row.encounterId,
        followupMonth: row.followupMonth,
        patientId: row.patientId,
        formVariant: row.formVariant,
        dueAt: row.dueAt,
        plannedAt: new Date().toISOString(),
        draftEntryId: draftEntry?.entryId || '',
        status: draftEntry ? 'planned' : 'planned_no_draft',
        source: row.source,
      });
      recordedPlanRows += 1;
    } catch (error) {
      console.warn(
        '[cco_followup_draft_generator] kunde inte spara planState:',
        error?.message || error
      );
    }
  }

  return {
    tenantId,
    transplantCount: plan.transplantCount,
    plannedCount: plan.plannedCount,
    createdDrafts,
    recordedPlanRows,
    skippedExistingCount: plan.skippedExistingCount,
    skippedAlreadyPlannedCount: plan.skippedAlreadyPlannedCount,
    horizonDays: plan.horizonDays,
    created,
  };
}

function resolveMaintenanceWindow(config = {}) {
  const start = parseIso(config.maintenanceWindowStart);
  const end = parseIso(config.maintenanceWindowEnd);
  const message = normalizeText(config.maintenanceWindowMessage);
  if (!start || !end || end <= start) {
    return { active: false, message: '', startsAt: null, endsAt: null };
  }
  const now = Date.now();
  const active = now >= start.getTime() && now <= end.getTime();
  return {
    active,
    message: message || 'Planerat underhåll — journal kan vara otillgänglig en stort stund.',
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    upcoming: now < start.getTime(),
  };
}

module.exports = {
  applyApprovedDraftProposal,
  buildCustomerReminderQueue,
  buildJournalDraftProposals,
  buildMissingFormsReport,
  buildReminderDigestHtml,
  classifyMissingForms,
  dispatchBookingCancellationEmail,
  dispatchCustomerReminderDigest,
  dispatchPatientVisitReminderEmails,
  promoteApprovedDraftToJournalEntry,
  resolveMaintenanceWindow,
  runFollowupDraftGenerator,
};
