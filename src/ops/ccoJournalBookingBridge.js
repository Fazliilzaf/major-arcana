'use strict';

const {
  normalizeEmail,
  normalizePhone,
  normalizeText,
  splitName,
} = require('../../scripts/migration/lib/migrationUtils');
const { loadLegacyCatalogBundle } = require('./legacyCatalogLoader');
const { buildLegacyMapping, readTripleMapEntries } = require('./legacyCatalogRuntime');

let serviceRegisterMethodCache = null;

function buildServiceRegisterMethodCache() {
  const cache = new Map();
  try {
    const entries = readTripleMapEntries(loadLegacyCatalogBundle());
    for (const entry of entries) {
      const mapping = buildLegacyMapping(entry);
      const method = normalizeText(mapping.bookingMethodLabel);
      if (!method) continue;
      if (mapping.arcanaServiceId) cache.set(mapping.arcanaServiceId, method);
      for (const alias of mapping.legacyAliases || []) {
        if (alias) cache.set(alias, method);
      }
    }
  } catch (_) {
    // Keep journal sync fail-closed to legacy fallback labels if the migration catalog is unavailable.
  }
  return cache;
}

function serviceRegisterBookingMethodLabel(serviceId = '') {
  const id = normalizeText(serviceId);
  if (!id) return '';
  if (!serviceRegisterMethodCache) serviceRegisterMethodCache = buildServiceRegisterMethodCache();
  return serviceRegisterMethodCache.get(id) || '';
}

function serviceToPlanMethod(serviceId = '') {
  const id = normalizeText(serviceId).toLowerCase();
  const registered = serviceRegisterBookingMethodLabel(id);
  if (registered) return registered;
  if (id === 'consultation-online') return 'Online';
  if (id === 'consultation-physical') return 'Fysisk konsultation';
  if (id === 'followup-transplant') return 'Uppföljning HT';
  return '';
}

async function resolvePatientFromBookingContact({
  patientMasterStore,
  tenantId,
  name = '',
  email = '',
  phone = '',
} = {}) {
  if (!patientMasterStore) return null;
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  const { firstName, lastName } = splitName(name);
  const displayName = normalizeText(name) || [firstName, lastName].filter(Boolean).join(' ');

  let patient = null;
  if (normalizedEmail) {
    patient = await patientMasterStore.findPatientByEmail({ tenantId, email: normalizedEmail });
  }
  if (!patient && normalizedPhone) {
    const listed = await patientMasterStore.listPatients({
      tenantId,
      query: normalizedPhone,
      limit: 5,
    });
    patient = (listed.patients || []).find(
      (row) =>
        normalizePhone(row.primaryPhone) === normalizedPhone ||
        (row.phones || []).some((value) => normalizePhone(value) === normalizedPhone)
    );
  }

  if (patient) {
    return patientMasterStore.upsertPatient({
      ...patient,
      displayName: displayName || patient.displayName,
      primaryEmail: normalizedEmail || patient.primaryEmail,
      primaryPhone: normalizedPhone || patient.primaryPhone,
      emails: [...new Set([...(patient.emails || []), normalizedEmail].filter(Boolean))],
      phones: [...new Set([...(patient.phones || []), normalizedPhone].filter(Boolean))],
    });
  }

  return patientMasterStore.upsertPatient({
    tenantId,
    displayName: displayName || normalizedEmail || 'Webb-bokning',
    firstName,
    lastName,
    primaryEmail: normalizedEmail,
    primaryPhone: normalizedPhone,
    emails: normalizedEmail ? [normalizedEmail] : [],
    phones: normalizedPhone ? [normalizedPhone] : [],
    matchStatus: 'web_booking',
    flags: ['missing_personnummer'],
  });
}

async function syncWebReservationToJournal({
  patientMasterStore,
  treatmentEncounterStore,
  journalStore,
  tenantId,
  reservation = {},
  contact = {},
  conversationId = '',
  channel = 'web_public',
} = {}) {
  if (!journalStore || !treatmentEncounterStore || !patientMasterStore) {
    return { patient: null, encounter: null, plan: null, skipped: true };
  }

  const slot = reservation.slot || {};
  const patient = await resolvePatientFromBookingContact({
    patientMasterStore,
    tenantId,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
  });
  if (!patient?.id) return { patient: null, encounter: null, plan: null, skipped: true };

  const encounter = await treatmentEncounterStore.upsertEncounter({
    tenantId,
    patientId: patient.id,
    conversationId,
    reservationId: reservation.reservationId,
    bookingId: '',
    serviceId: slot.serviceId,
    serviceLabel: slot.serviceLabel || slot.serviceId,
    resourceId: slot.resourceId,
    resourceLabel: slot.resourceLabel || slot.resourceId,
    locationLabel: slot.locationLabel,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    status: 'reserved',
    channel,
    customerEmail: contact.email,
    customerName: contact.name,
    customerPhone: contact.phone,
    metadata: {
      expiresAt: reservation.expiresAt || '',
    },
  });

  const method = serviceToPlanMethod(slot.serviceId);
  let plan = await journalStore.findOpenConsultationPlan({ tenantId, patientId: patient.id });
  if (!plan) {
    plan = await journalStore.ensureConsultationPlan({
      tenantId,
      patientId: patient.id,
      personnummer: patient.personnummer || '',
      actor: { userId: 'web-public', role: 'STAFF', displayName: 'Webb-bokning' },
    });
  }

  plan = await journalStore.upsertEntry(
    {
      ...plan,
      treatmentEncounterId: encounter.encounterId,
      fields: {
        ...plan.fields,
        consultationDate: (slot.startsAt || '').slice(0, 10),
        method: method || plan.fields?.method || '',
        notes: plan.fields?.notes || 'Skapad från webbbokning (reservation).',
        bookingConversationId: conversationId,
        bookingServiceId: slot.serviceId || '',
        bookingSlotStart: slot.startsAt || '',
        bookingChannel: channel,
      },
    },
    { actor: { userId: 'web-public', role: 'STAFF', displayName: 'Webb-bokning' } }
  );

  await treatmentEncounterStore.linkJournalEntry({
    tenantId,
    patientId: patient.id,
    encounterId: encounter.encounterId,
    entryId: plan.entryId,
  });

  return { patient, encounter, plan, skipped: false };
}

async function syncBookingConfirmedToJournal({
  treatmentEncounterStore,
  journalStore,
  tenantId,
  patientId = '',
  conversationId = '',
  booking = {},
  channel = 'cco_staff',
} = {}) {
  if (!journalStore || !treatmentEncounterStore || !patientId) {
    return { encounter: null, plan: null, skipped: true };
  }

  const slot = booking.slot || {};
  let encounter =
    (conversationId
      ? await treatmentEncounterStore.findByConversation({ tenantId, conversationId })
      : null) || null;

  if (encounter) {
    encounter = await treatmentEncounterStore.upsertEncounter({
      ...encounter,
      bookingId: booking.bookingId || encounter.bookingId,
      status: 'confirmed',
      startsAt: slot.startsAt || encounter.startsAt,
      endsAt: slot.endsAt || encounter.endsAt,
      serviceId: slot.serviceId || encounter.serviceId,
      resourceId: slot.resourceId || encounter.resourceId,
    });
  } else {
    encounter = await treatmentEncounterStore.upsertEncounter({
      tenantId,
      patientId,
      conversationId,
      bookingId: booking.bookingId,
      serviceId: slot.serviceId,
      serviceLabel: slot.serviceLabel || slot.serviceId,
      resourceId: slot.resourceId,
      resourceLabel: slot.resourceLabel || slot.resourceId,
      locationLabel: slot.locationLabel,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      status: 'confirmed',
      channel,
    });
  }

  const plans = await journalStore.listEntries({
    tenantId,
    patientId,
    journalType: 'consultation_plan',
  });
  let plan =
    plans.find((entry) => entry.treatmentEncounterId === encounter.encounterId) ||
    plans.find((entry) => !entry.locked) ||
    null;

  if (plan && !plan.locked) {
    plan = await journalStore.upsertEntry({
      ...plan,
      treatmentEncounterId: encounter.encounterId,
      fields: {
        ...plan.fields,
        consultationDate: (slot.startsAt || plan.fields?.consultationDate || '').slice(0, 10),
        method: serviceToPlanMethod(slot.serviceId) || plan.fields?.method || '',
        bookingConversationId: conversationId || plan.fields?.bookingConversationId || '',
        bookingServiceId: slot.serviceId || plan.fields?.bookingServiceId || '',
        bookingSlotStart: slot.startsAt || plan.fields?.bookingSlotStart || '',
        bookingConfirmedAt: new Date().toISOString(),
      },
    });
    await treatmentEncounterStore.linkJournalEntry({
      tenantId,
      patientId,
      encounterId: encounter.encounterId,
      entryId: plan.entryId,
    });
  }

  return { encounter, plan, skipped: false };
}

async function syncConsultationPhotoToEncounter({
  treatmentEncounterStore,
  journalStore,
  patientMasterStore = null,
  tenantId,
  planEntry = {},
  photo = {},
  encounterId = '',
  actor = {},
  channel = 'cco_staff',
} = {}) {
  if (!journalStore || !treatmentEncounterStore || !planEntry?.entryId) {
    return { encounter: null, plan: planEntry, skipped: true };
  }

  const patientId = normalizeText(planEntry.patientId);
  if (!patientId) return { encounter: null, plan: planEntry, skipped: true };

  const today = new Date().toISOString().slice(0, 10);
  let encounter = null;

  const requestedEncounterId = normalizeText(encounterId);
  if (requestedEncounterId) {
    encounter = await treatmentEncounterStore.getEncounter({
      tenantId,
      patientId,
      encounterId: requestedEncounterId,
    });
  }

  const existingEncounterId = normalizeText(planEntry.treatmentEncounterId);
  if (!encounter && existingEncounterId) {
    encounter = await treatmentEncounterStore.getEncounter({
      tenantId,
      patientId,
      encounterId: existingEncounterId,
    });
  }

  if (!encounter) {
    const encounters = await treatmentEncounterStore.listByPatient({
      tenantId,
      patientId,
      limit: 20,
    });
    encounter =
      encounters.find(
        (item) =>
          item.status !== 'cancelled' &&
          !normalizeText(item.bookingId) &&
          (normalizeText(item.startsAt).slice(0, 10) === today ||
            normalizeText(item.channel) === channel)
      ) || null;
  }

  if (!encounter) {
    let customerEmail = '';
    let customerName = '';
    if (patientMasterStore) {
      const patient = await patientMasterStore.getPatient({ tenantId, patientId });
      customerEmail = normalizeEmail(patient?.primaryEmail || patient?.emails?.[0] || '');
      customerName = normalizeText(patient?.displayName);
    }
    encounter = await treatmentEncounterStore.upsertEncounter({
      tenantId,
      patientId,
      serviceId: 'consultation-physical',
      serviceLabel: 'Konsultation',
      startsAt: `${today}T12:00:00.000Z`,
      status: 'confirmed',
      channel,
      customerEmail,
      customerName,
      metadata: {
        photoCaptureAt: normalizeText(photo.storedAt) || new Date().toISOString(),
        photoId: normalizeText(photo.photoId),
      },
    });
  }

  let plan = planEntry;
  if (normalizeText(plan.treatmentEncounterId) !== encounter.encounterId) {
    plan = await journalStore.upsertEntry(
      {
        ...planEntry,
        treatmentEncounterId: encounter.encounterId,
        fields: {
          ...(planEntry.fields || {}),
          consultationDate: normalizeText(planEntry.fields?.consultationDate) || today,
        },
      },
      { actor }
    );
  }

  await treatmentEncounterStore.linkJournalEntry({
    tenantId,
    patientId,
    encounterId: encounter.encounterId,
    entryId: plan.entryId,
  });

  if (journalStore && normalizeText(photo.photoId)) {
    plan = await journalStore.patchConsultationPhotoEncounter({
      tenantId,
      patientId,
      entryId: plan.entryId,
      photoId: photo.photoId,
      treatmentEncounterId: encounter.encounterId,
      actor,
    });
  }

  return { encounter, plan, skipped: false };
}

const ENCOUNTER_LINKED_JOURNAL_TYPES = new Set([
  'consultation_plan',
  'health_declaration',
  'fitness_certificate',
  'tp_treatment',
  'prp_treatment',
  'follow_up',
  'bleph_treatment',
]);

async function resolveEncounterForJournalEntry({
  treatmentEncounterStore,
  journalStore,
  tenantId,
  patientId,
  entry = {},
} = {}) {
  const explicitId = normalizeText(entry.treatmentEncounterId);
  if (explicitId) {
    const encounter = await treatmentEncounterStore.getEncounter({
      tenantId,
      patientId,
      encounterId: explicitId,
    });
    if (encounter) return encounter;
  }

  const plans = await journalStore.listEntries({
    tenantId,
    patientId,
    journalType: 'consultation_plan',
  });
  const planEncounterId = normalizeText(
    plans.find((item) => normalizeText(item.treatmentEncounterId))?.treatmentEncounterId ||
      plans.find((item) => !item.locked)?.treatmentEncounterId
  );
  if (planEncounterId) {
    const encounter = await treatmentEncounterStore.getEncounter({
      tenantId,
      patientId,
      encounterId: planEncounterId,
    });
    if (encounter) return encounter;
  }

  const encounters = await treatmentEncounterStore.listByPatient({
    tenantId,
    patientId,
    limit: 20,
  });
  return encounters.find((item) => item.status !== 'cancelled') || null;
}

async function syncJournalEntryToEncounter({
  treatmentEncounterStore,
  journalStore,
  patientMasterStore = null,
  tenantId,
  entry = {},
  actor = {},
  channel = 'cco_staff',
} = {}) {
  if (!journalStore || !treatmentEncounterStore || !entry?.entryId) {
    return { entry, encounter: null, skipped: true };
  }
  const patientId = normalizeText(entry.patientId);
  const journalType = normalizeText(entry.journalType);
  if (!patientId || !ENCOUNTER_LINKED_JOURNAL_TYPES.has(journalType)) {
    return { entry, encounter: null, skipped: true };
  }

  let encounter = await resolveEncounterForJournalEntry({
    treatmentEncounterStore,
    journalStore,
    tenantId,
    patientId,
    entry,
  });

  if (!encounter) {
    const today = new Date().toISOString().slice(0, 10);
    let customerEmail = '';
    let customerName = '';
    if (patientMasterStore) {
      const patient = await patientMasterStore.getPatient({ tenantId, patientId });
      customerEmail = normalizeEmail(patient?.primaryEmail || patient?.emails?.[0] || '');
      customerName = normalizeText(patient?.displayName);
    }
    encounter = await treatmentEncounterStore.upsertEncounter({
      tenantId,
      patientId,
      serviceId: journalType === 'consultation_plan' ? 'consultation-physical' : journalType,
      serviceLabel: normalizeText(entry.title) || journalType,
      startsAt: `${today}T12:00:00.000Z`,
      status: 'confirmed',
      channel,
      customerEmail,
      customerName,
      metadata: {
        journalType,
        entryId: entry.entryId,
      },
    });
  }

  let updated = entry;
  if (normalizeText(entry.treatmentEncounterId) !== encounter.encounterId) {
    updated = await journalStore.upsertEntry(
      {
        ...entry,
        treatmentEncounterId: encounter.encounterId,
      },
      { actor }
    );
  }

  await treatmentEncounterStore.linkJournalEntry({
    tenantId,
    patientId,
    encounterId: encounter.encounterId,
    entryId: updated.entryId,
  });

  const now = new Date().toISOString();
  encounter = await treatmentEncounterStore.upsertEncounter({
    ...encounter,
    status: normalizeText(encounter.status) === 'completed' ? 'completed' : 'in_progress',
    metadata: {
      ...(encounter.metadata || {}),
      startedAt: normalizeText(encounter.metadata?.startedAt) || now,
      lastJournalEntryAt: now,
      lastJournalEntryId: updated.entryId,
    },
  });

  return { entry: updated, encounter, skipped: false };
}

// Efter att en encounter låsts som 'completed' vid journalsignering, schemalägg
// aftercare-/follow-up-jobb via ccoAftercareSchedulerStore. Idempotent (jobben
// dedupliceras på jobb-id av schemaläggaren) och fail-safe: ett fel här får
// aldrig bryta själva journalsigneringen.
async function scheduleAftercareForCompletedEncounter({
  schedulerStore,
  entry,
  encounter,
  tenantId,
} = {}) {
  if (!schedulerStore || typeof schedulerStore.scheduleForCompletedEncounter !== 'function') {
    return { scheduled: 0, skipped: true, reason: 'schedulerStore ej monterad' };
  }
  // Kund-id = patient/journal-id i CCO-modellen (på samma ställe som schedulern
  // använder customerId för dedup och kontaktuppslag).
  const customerId = normalizeText(entry.patientId) || normalizeText(encounter?.patientId);
  // Behandlingsnyckeln tas från encountern (serviceId bär oftast behandlings-id),
  // med fallback till metadata/entry-fält. Okänd nyckel hanteras tyst av schedulern.
  const treatmentKey = normalizeText(
    encounter?.metadata?.treatmentKey || encounter?.serviceId || entry?.fields?.treatmentKey
  ).toLowerCase();
  const encounterId = normalizeText(encounter?.encounterId);
  if (!customerId || !treatmentKey || !encounterId) {
    return { scheduled: 0, skipped: true, reason: 'saknar kund/behandling/encounter' };
  }
  try {
    return await schedulerStore.scheduleForCompletedEncounter({
      customerId,
      customerEmail: normalizeText(encounter?.customerEmail) || normalizeText(entry?.customerEmail),
      customerName: normalizeText(encounter?.customerName) || normalizeText(entry?.customerName),
      treatmentKey,
      encounterId,
      tenantId: normalizeText(tenantId) || normalizeText(encounter?.tenantId) || '',
      completedAt:
        normalizeText(encounter?.metadata?.completedAt) ||
        normalizeText(entry.signedAt) ||
        new Date().toISOString(),
    });
  } catch (err) {
    return { scheduled: 0, skipped: true, error: String(err?.message || err) };
  }
}

// Block 4.2/4.3 (WORKFLOW-IN-I-CCO-TODO-2026-08-26): när en behandling
// journalförts, föreslå en återkommande serie utifrån mallen (followup-
// transplant vid transplantation, PRP-serier vid PRP). Detta är ENDAST ett
// förslag — personalen väljer tider och kunden får bekräftelse först när
// personalen bokar. Misslyckas det får journalföringen aldrig brytas.
async function suggestRecurringSeriesOnJournalSign({
  recurringSeriesStore,
  entry = {},
  encounter = {},
  tenantId = '',
} = {}) {
  if (
    !recurringSeriesStore ||
    typeof recurringSeriesStore.suggestSeriesFromJournal !== 'function'
  ) {
    return { matched: 0, suggestions: [], skipped: true, reason: 'seriesStore ej monterad' };
  }
  const patientId = normalizeText(entry.patientId) || normalizeText(encounter?.patientId);
  if (!patientId) {
    return { matched: 0, suggestions: [], skipped: true, reason: 'saknar patientId' };
  }
  const treatmentKey = normalizeText(
    encounter?.metadata?.treatmentKey || encounter?.serviceId || entry?.fields?.treatmentKey
  ).toLowerCase();
  try {
    return await recurringSeriesStore.suggestSeriesFromJournal({
      patientId,
      patientName:
        normalizeText(encounter?.customerName) || normalizeText(entry?.customerName) || '',
      journalType: normalizeText(entry.journalType),
      treatmentKey,
      serviceId: normalizeText(encounter?.serviceId),
      entryServiceId: normalizeText(entry?.fields?.serviceId) || normalizeText(entry?.serviceId),
      treatment: normalizeText(entry?.fields?.treatment),
      startDate:
        normalizeText(encounter?.startsAt) ||
        normalizeText(entry.signedAt) ||
        new Date().toISOString(),
      resourceId: normalizeText(encounter?.resourceId),
      sourceEncounterId: normalizeText(encounter?.encounterId),
      tenantId,
    });
  } catch (err) {
    return { matched: 0, suggestions: [], skipped: true, error: String(err?.message || err) };
  }
}

async function lockEncounterOnJournalSign({
  treatmentEncounterStore,
  tenantId,
  entry = {},
  schedulerStore = null,
  recurringSeriesStore = null,
} = {}) {
  const patientId = normalizeText(entry.patientId);
  const encounterId = normalizeText(entry.treatmentEncounterId);
  if (!treatmentEncounterStore || !patientId || !encounterId) {
    return { encounter: null, skipped: true };
  }
  const encounter = await treatmentEncounterStore.getEncounter({
    tenantId,
    patientId,
    encounterId,
  });
  if (!encounter) return { encounter: null, skipped: true };
  const lockedEntryIds = [
    ...new Set(
      [...asArray(encounter.metadata?.lockedEntryIds), normalizeText(entry.entryId)].filter(Boolean)
    ),
  ];
  const locked = await treatmentEncounterStore.upsertEncounter({
    ...encounter,
    status: 'completed',
    metadata: {
      ...(encounter.metadata || {}),
      journalLockedAt:
        normalizeText(encounter.metadata?.journalLockedAt) || new Date().toISOString(),
      completedAt:
        normalizeText(encounter.metadata?.completedAt) ||
        normalizeText(entry.signedAt) ||
        new Date().toISOString(),
      startedAt:
        normalizeText(encounter.metadata?.startedAt) ||
        normalizeText(entry.updatedAt) ||
        normalizeText(entry.createdAt) ||
        new Date().toISOString(),
      lockedEntryIds,
    },
  });
  await scheduleAftercareForCompletedEncounter({
    schedulerStore,
    entry,
    encounter: locked,
    tenantId,
  });
  await suggestRecurringSeriesOnJournalSign({
    recurringSeriesStore,
    entry,
    encounter: locked,
    tenantId,
  });
  return { encounter: locked, skipped: false };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = {
  ENCOUNTER_LINKED_JOURNAL_TYPES,
  resolvePatientFromBookingContact,
  serviceToPlanMethod,
  lockEncounterOnJournalSign,
  suggestRecurringSeriesOnJournalSign,
  syncBookingConfirmedToJournal,
  syncConsultationPhotoToEncounter,
  syncJournalEntryToEncounter,
  syncWebReservationToJournal,
};
