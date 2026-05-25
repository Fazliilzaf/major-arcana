'use strict';

const {
  computeMaxLeadTimeHours,
  DEFAULT_TOLERANCE_HOURS,
  isWithinReminderLeadWindow,
  normalizeBookingReminderLeadTimeConfig,
  resolveBookingReminderLeadTimeHours,
  resolveMeetingChannel,
} = require('./bookingReminderLeadTime');

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
  dispatchCustomerReminderDigest,
  resolveMaintenanceWindow,
};
