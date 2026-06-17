'use strict';

const {
  normalizeEmail,
  normalizePhone,
  normalizeText,
  splitName,
} = require('../../scripts/migration/lib/migrationUtils');

function serviceToPlanMethod(serviceId = '') {
  const id = normalizeText(serviceId).toLowerCase();
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

  const existingEncounterId = normalizeText(planEntry.treatmentEncounterId);
  if (existingEncounterId) {
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

async function lockEncounterOnJournalSign({ treatmentEncounterStore, tenantId, entry = {} } = {}) {
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
  syncBookingConfirmedToJournal,
  syncConsultationPhotoToEncounter,
  syncJournalEntryToEncounter,
  syncWebReservationToJournal,
};
