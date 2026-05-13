function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function collectWorkspaceSignalText({
  bookingCase = {},
  savedNotes = [],
  latestFollowUp = null,
} = {}) {
  const safeBookingCase = asObject(bookingCase);
  const safeFollowUp = asObject(latestFollowUp);
  return [
    normalizeText(safeBookingCase.requestedTreatment),
    normalizeText(safeBookingCase.preferredWindow),
    normalizeText(safeBookingCase.notes),
    normalizeText(safeFollowUp.category),
    normalizeText(safeFollowUp.notes),
    ...asArray(savedNotes).flatMap((note) => {
      const safeNote = asObject(note);
      return [
        normalizeText(safeNote.destinationKey),
        normalizeText(safeNote.destinationLabel),
        normalizeText(safeNote.text),
        ...asArray(safeNote.tags).map((tag) => normalizeText(tag)),
      ];
    }),
  ]
    .filter(Boolean)
    .join(' ');
}

function mapNoteToPatientModule(note = {}) {
  const safeNote = asObject(note);
  const destinationKey = normalizeKey(safeNote.destinationKey);
  const text = normalizeKey(
    `${normalizeText(safeNote.text)} ${asArray(safeNote.tags)
      .map((tag) => normalizeText(tag))
      .join(' ')}`
  );
  if (destinationKey === 'medicinsk') return 'clinical';
  if (destinationKey === 'betalning') return 'commercial';
  if (destinationKey === 'uppfoljning') return 'aftercare';
  if (destinationKey === 'sla' || destinationKey === 'intern') return 'tasks';
  if (/samtycke|gdpr|personuppgift|medgiv/.test(text)) return 'documents';
  if (/allerg|kontra|medicinsk|behandlingsplan|klinisk/.test(text)) return 'clinical';
  if (/konsult|behandling/.test(text)) return 'consultation';
  if (/betal|pris|offert/.test(text)) return 'commercial';
  return 'tasks';
}

function mapBookingStatusToPatientStatus(status) {
  const normalized = normalizeKey(status);
  if (normalized === 'slots_ready') return 'needs_validation';
  if (normalized === 'offered') return 'waiting_customer';
  if (normalized === 'waiting_customer') return 'waiting_customer';
  if (normalized === 'confirmed_external') return 'scheduled';
  if (normalized === 'cancelled' || normalized === 'closed') return 'complete';
  return 'needs_action';
}

function mapConsultationStatusToPatientStatus(status) {
  const normalized = normalizeKey(status);
  if (normalized === 'scheduled') return 'scheduled';
  if (normalized === 'complete') return 'complete';
  if (normalized === 'ready') return 'ready';
  return 'needs_validation';
}

function mapClinicalStatusToPatientStatus(status) {
  const normalized = normalizeKey(status);
  if (normalized === 'validated') return 'ready';
  if (normalized === 'inactive') return 'inactive';
  return 'needs_validation';
}

function mapDocumentStatusToPatientStatus(status, consentStatus = '') {
  const normalized = normalizeKey(status);
  const consent = normalizeKey(consentStatus);
  if ((normalized === 'needs_validation' || normalized === 'missing') && consent === 'required') {
    return 'blocked';
  }
  if (normalized === 'validated' && consent === 'confirmed') return 'ready';
  if (normalized === 'inactive' && consent === 'not_applicable') return 'inactive';
  if (normalized === 'missing') return 'needs_action';
  return 'needs_validation';
}

function mapAftercareStatusToPatientStatus(status, outcomeStatus = '') {
  const normalized = normalizeKey(status);
  const outcome = normalizeKey(outcomeStatus);
  if (normalized === 'complete') return 'complete';
  if (normalized === 'cancelled') return 'complete';
  if (normalized === 'in_progress') return 'needs_validation';
  if (normalized === 'scheduled') {
    return outcome === 'needs_attention' ? 'blocked' : 'scheduled';
  }
  return 'needs_action';
}

function mapOperationStatusToPatientStatus(status, clearanceStatus = '', outcomeStatus = '') {
  const normalized = normalizeKey(status);
  const clearance = normalizeKey(clearanceStatus);
  const outcome = normalizeKey(outcomeStatus);
  if (normalized === 'complete' || normalized === 'cancelled') return 'complete';
  if (normalized === 'in_progress') return 'blocked';
  if (clearance === 'blocked') return 'blocked';
  if (normalized === 'planned') return 'scheduled';
  if (normalized === 'ready') {
    return outcome === 'needs_attention' ? 'needs_action' : 'ready';
  }
  if (clearance === 'cleared') return 'ready';
  return 'needs_validation';
}

function mapCommercialStatusToPatientStatus(status, quoteStatus = '', paymentStatus = '') {
  const normalized = normalizeKey(status);
  const quote = normalizeKey(quoteStatus);
  const payment = normalizeKey(paymentStatus);
  if (normalized === 'complete' || normalized === 'cancelled') return 'complete';
  if (payment === 'blocked') return 'blocked';
  if (normalized === 'deposit_pending' || normalized === 'payment_pending') return 'blocked';
  if (normalized === 'quote_sent' || quote === 'sent') return 'waiting_customer';
  if (normalized === 'ready' || payment === 'paid' || quote === 'accepted') return 'ready';
  return 'needs_action';
}

function getLatestBookingEvent(bookingCase = {}, eventTypes = []) {
  const types = new Set(
    asArray(eventTypes)
      .map((item) => normalizeKey(item))
      .filter(Boolean)
  );
  if (!types.size) return null;
  return (
    asArray(bookingCase.events)
      .filter((event) => types.has(normalizeKey(event.type)))
      .sort(
        (left, right) =>
          Date.parse(normalizeText(left?.createdAt)) - Date.parse(normalizeText(right?.createdAt))
      )
      .at(-1) || null
  );
}

function buildBookingConfirmedPhase(bookingCase = {}) {
  const status = normalizeKey(bookingCase.status);
  const confirmedExternalAt = normalizeText(bookingCase.confirmedExternalAt);
  if (status !== 'confirmed_external' && !confirmedExternalAt) return null;

  const confirmationEvent = getLatestBookingEvent(bookingCase, [
    'external_confirmation_marked',
    'engine_booking_confirmed',
    'engine_booking_rebooked',
  ]);
  const confirmationAt =
    normalizeText(confirmationEvent?.createdAt) ||
    confirmedExternalAt ||
    normalizeText(bookingCase.updatedAt);
  const confirmationMs = Date.parse(confirmationAt);

  const latestCustomerReply = getLatestBookingEvent(bookingCase, [
    'customer_replied',
    'customer_reply_received',
  ]);
  const latestFollowUp = getLatestBookingEvent(bookingCase, [
    'follow_up_scheduled',
    'follow_up_opened',
  ]);
  const customerReplyAt = normalizeText(latestCustomerReply?.createdAt);
  const followUpAt = normalizeText(latestFollowUp?.createdAt);
  const customerReplyMs = Date.parse(customerReplyAt);
  const followUpMs = Date.parse(followUpAt);
  const followUpDueAt = normalizeText(latestFollowUp?.metadata?.followUpDueAt);
  const followUpDueMs = Date.parse(followUpDueAt);
  const nowMs = Date.now();

  const customerReplyAfterConfirmation =
    latestCustomerReply &&
    Number.isFinite(customerReplyMs) &&
    (!Number.isFinite(confirmationMs) || customerReplyMs >= confirmationMs);
  const followUpAfterConfirmation =
    latestFollowUp &&
    Number.isFinite(followUpMs) &&
    (!Number.isFinite(confirmationMs) || followUpMs >= confirmationMs);

  if (
    customerReplyAfterConfirmation &&
    (!Number.isFinite(followUpMs) || customerReplyMs >= followUpMs)
  ) {
    return {
      mode: 'reply',
      confirmationAt,
      latestCustomerReplyAt: customerReplyAt,
      latestFollowUpAt: followUpAt,
    };
  }

  if (followUpAfterConfirmation) {
    const isDue = Number.isFinite(followUpDueMs) ? followUpDueMs <= nowMs : false;
    return {
      mode: isDue ? 'aftercare_due' : 'aftercare_active',
      confirmationAt,
      latestCustomerReplyAt: customerReplyAt,
      latestFollowUpAt: followUpAt,
      latestFollowUpDueAt: followUpDueAt,
    };
  }

  return {
    mode: 'ready_to_close',
    confirmationAt,
    latestCustomerReplyAt: customerReplyAt,
    latestFollowUpAt: followUpAt,
  };
}

function buildPatient360SnapshotFromBookingCase({
  context = {},
  bookingCase = {},
  source = 'cco',
} = {}) {
  const safeCase = bookingCase && typeof bookingCase === 'object' ? bookingCase : {};
  const selectedSlots = asArray(safeCase.selectedSlots);
  const requestedTreatment = normalizeText(safeCase.requestedTreatment) || 'Bokningsdialog';
  const preferredWindow = normalizeText(safeCase.preferredWindow) || 'Välj eller validera tider';
  const status = normalizeText(safeCase.status) || 'needs_triage';
  const baseBookingModuleStatus = mapBookingStatusToPatientStatus(status);
  const notes = normalizeText(safeCase.notes);
  const latestSlot =
    selectedSlots[0] && typeof selectedSlots[0] === 'object' ? selectedSlots[0] : null;
  const confirmedPhase = buildBookingConfirmedPhase(safeCase);
  const bookingModuleStatus =
    confirmedPhase?.mode === 'reply' ? 'needs_action' : baseBookingModuleStatus;
  const needsConsultationValidation =
    /behandling|konsult|plan|medgiv|samtycke|personuppgift|gdpr/i.test(
      `${requestedTreatment} ${preferredWindow} ${notes}`
    );
  const pipelineNextStep = confirmedPhase
    ? confirmedPhase.mode === 'reply'
      ? 'Bearbeta kundsvar efter bekräftelse'
      : confirmedPhase.mode === 'aftercare_due'
        ? 'Följ upp efter bekräftelse nu'
        : confirmedPhase.mode === 'aftercare_active'
          ? 'Bevaka planerad eftervård efter bekräftelse'
          : 'Säkra slutlogg eller stäng lugnt'
    : bookingModuleStatus === 'waiting_customer'
      ? 'Invänta kundsvar på föreslagna tider'
      : bookingModuleStatus === 'scheduled'
        ? 'Bekräfta extern bokning och planera nästa steg'
        : 'Validera tider och nästa operatörsdrag';
  const bookingNextAction = confirmedPhase
    ? confirmedPhase.mode === 'reply'
      ? 'Uppdatera kundsvaret efter bekräftelse'
      : 'Bokningen är redan bekräftad i CCO'
    : bookingModuleStatus === 'needs_validation'
      ? 'Validera valda kandidat-tider'
      : bookingModuleStatus === 'waiting_customer'
        ? 'Invänta kundsvar på föreslagna tider'
        : bookingModuleStatus === 'scheduled'
          ? 'Markera när extern bokning är helt bekräftad'
          : bookingModuleStatus === 'complete'
            ? 'Ingen aktiv bokningsåtgärd'
            : 'Välj eller hämta 1-3 kandidat-tider';
  const aftercareStatus = confirmedPhase
    ? confirmedPhase.mode === 'aftercare_due'
      ? 'needs_action'
      : confirmedPhase.mode === 'aftercare_active'
        ? 'scheduled'
        : confirmedPhase.mode === 'ready_to_close'
          ? 'ready'
          : 'scheduled'
    : bookingModuleStatus === 'scheduled'
      ? 'scheduled'
      : 'inactive';
  const aftercareNextAction = confirmedPhase
    ? confirmedPhase.mode === 'aftercare_due'
      ? 'Återuppta eftervård efter bekräftelse'
      : confirmedPhase.mode === 'aftercare_active'
        ? 'Bevaka planerad eftervård efter bekräftelse'
        : confirmedPhase.mode === 'ready_to_close'
          ? 'Säkra eftervård eller slutlogg efter bekräftelse'
          : 'Samordna eftervård efter kundsvaret'
    : bookingModuleStatus === 'scheduled'
      ? 'Planera eftervård när bokningen är slutligt bekräftad'
      : '';
  const tasksStatus = confirmedPhase
    ? 'ready'
    : bookingModuleStatus === 'complete'
      ? 'ready'
      : bookingModuleStatus === 'waiting_customer' || bookingModuleStatus === 'scheduled'
        ? 'ready'
        : 'needs_action';
  const tasksNextAction = confirmedPhase
    ? confirmedPhase.mode === 'reply'
      ? 'Synka nästa ägare efter kundsvaret'
      : confirmedPhase.mode === 'aftercare_due'
        ? 'Synka uppföljning och nästa ägare'
        : confirmedPhase.mode === 'aftercare_active'
          ? 'Håll eftervårdsägarskapet tydligt'
          : 'Säkra överlämning eller slutlogg'
    : bookingModuleStatus === 'waiting_customer'
      ? 'Följ upp om kunden inte svarar'
      : bookingModuleStatus === 'scheduled'
        ? 'Synka överlämning och nästa ägare'
        : 'Håll bokningsägarskapet tydligt';

  return {
    tenantId: normalizeText(context.tenantId),
    workspaceId: normalizeText(context.workspaceId) || 'major-arcana-preview',
    customerEmail: normalizeText(
      context.customerEmail || context.customerId || safeCase.customerEmail
    ),
    customerName: normalizeText(context.customerName || safeCase.customerName),
    pipeline: {
      status: status === 'closed' || status === 'cancelled' ? 'closed' : 'active',
      nextStep: pipelineNextStep,
      nextContactAt:
        normalizeText(latestSlot?.startsAt) ||
        normalizeText(safeCase.offeredAt) ||
        normalizeText(confirmedPhase?.latestFollowUpDueAt) ||
        normalizeText(safeCase.updatedAt),
    },
    modules: {
      communication: {
        status: 'ready',
        nextAction:
          confirmedPhase?.mode === 'reply'
            ? 'Besvara kunden efter bekräftelsen'
            : bookingModuleStatus === 'waiting_customer'
              ? 'Bevaka kundsvar i samma tråd'
              : 'Håll kommunikationen kort och tydlig',
        confidence:
          confirmedPhase?.mode === 'reply'
            ? 0.84
            : bookingModuleStatus === 'waiting_customer'
              ? 0.82
              : 0.76,
        metadata: { source },
      },
      booking: {
        status: bookingModuleStatus,
        nextAction: bookingNextAction,
        waitingOn: bookingModuleStatus === 'waiting_customer' ? 'customer' : 'operator',
        confidence:
          bookingModuleStatus === 'needs_validation'
            ? 0.7
            : bookingModuleStatus === 'scheduled'
              ? 0.88
              : 0.8,
        metadata: {
          source,
          bookingStatus: normalizeKey(status),
          postConfirmationMode: normalizeText(confirmedPhase?.mode),
          requestedTreatment,
          preferredWindow,
          selectedSlotCount: selectedSlots.length,
        },
      },
      consultation: {
        status: needsConsultationValidation ? 'needs_validation' : 'inactive',
        nextAction: needsConsultationValidation
          ? 'Verifiera konsultations- eller behandlingsbehov före råd'
          : '',
        confidence: needsConsultationValidation ? 0.64 : 0.6,
        metadata: { source },
      },
      documents: {
        status: /samtycke|personuppgift|gdpr|medgiv/i.test(`${requestedTreatment} ${notes}`)
          ? 'needs_validation'
          : 'inactive',
        nextAction: /samtycke|personuppgift|gdpr|medgiv/i.test(`${requestedTreatment} ${notes}`)
          ? 'Kontrollera samtycke och personuppgiftshantering'
          : '',
        confidence: 0.68,
        metadata: { source },
      },
      aftercare: {
        status: aftercareStatus,
        nextAction: aftercareNextAction,
        confidence: aftercareStatus === 'inactive' ? 0.6 : 0.78,
        metadata: {
          source,
          bookingStatus: normalizeKey(status),
          postConfirmationMode: normalizeText(confirmedPhase?.mode),
        },
      },
      tasks: {
        status: tasksStatus,
        nextAction: tasksNextAction,
        confidence: 0.8,
        metadata: { source },
      },
      commercial: {
        status: /pris|betal/i.test(`${requestedTreatment} ${notes}`) ? 'needs_action' : 'inactive',
        nextAction: /pris|betal/i.test(`${requestedTreatment} ${notes}`)
          ? 'Knyt pris eller betalningsfråga till samma kundkort'
          : '',
        confidence: 0.66,
        metadata: { source },
      },
    },
  };
}

function buildPatient360TimelineEventFromBookingCase({
  bookingCase = {},
  event = {},
  actorName = '',
  source = 'cco',
} = {}) {
  const safeCase = bookingCase && typeof bookingCase === 'object' ? bookingCase : {};
  const safeEvent = event && typeof event === 'object' ? event : {};
  const selectedSlots = asArray(safeCase.selectedSlots);
  const slotCount = selectedSlots.length;
  return {
    type: normalizeText(safeEvent.type) || 'booking_status_changed',
    module: 'booking',
    label:
      normalizeText(safeEvent.label) ||
      (slotCount ? `${slotCount} kandidat-tider i bokningsflödet` : 'Bokningsstatus uppdaterad'),
    detail:
      normalizeText(safeEvent.detail) ||
      normalizeText(safeCase.notes) ||
      normalizeText(safeCase.requestedTreatment) ||
      'Bokningsärendet uppdaterades i CCO.',
    occurredAt:
      normalizeText(safeEvent.createdAt) ||
      normalizeText(safeCase.updatedAt) ||
      new Date().toISOString(),
    source,
    actorName: normalizeText(actorName || safeEvent.actorName || safeCase.ownerName),
    confidence:
      mapBookingStatusToPatientStatus(safeCase.status) === 'needs_validation' ? 0.7 : 0.82,
    validationState:
      mapBookingStatusToPatientStatus(safeCase.status) === 'needs_validation'
        ? 'needs_human_validation'
        : 'observed',
    metadata: {
      bookingStatus: normalizeText(safeCase.status),
      selectedSlotCount: slotCount,
    },
  };
}

function buildPatient360SnapshotFromWorkspaceSignals({
  context = {},
  bookingCase = {},
  savedNotes = [],
  latestFollowUp = null,
  source = 'cco',
} = {}) {
  const safeBookingCase = asObject(bookingCase);
  const safeFollowUp = asObject(latestFollowUp);
  const signalText = normalizeKey(
    collectWorkspaceSignalText({
      bookingCase: safeBookingCase,
      savedNotes,
      latestFollowUp: safeFollowUp,
    })
  );
  const hasConsultationSignal = /konsult|behandling|behandlingsplan/.test(signalText);
  const hasClinicalSignal = /allerg|kontra|medicinsk|klinisk|känslighet/.test(signalText);
  const hasDocumentSignal = /samtycke|gdpr|personuppgift|medgiv/.test(signalText);
  const hasCommercialSignal = /betal|pris|offert|delbetal/.test(signalText);
  const hasTaskSignal = /intern|eskaler|ägar|agare|sla|bevaka/.test(signalText);
  const hasAftercareSignal =
    Boolean(
      normalizeText(safeFollowUp.followUpId || safeFollowUp.scheduledForIso || safeFollowUp.date)
    ) || /uppföljning|uppfoljning|återbesök|aterbesok/.test(signalText);
  const followUpWhen =
    normalizeText(safeFollowUp.scheduledForIso) ||
    (normalizeText(safeFollowUp.date) && normalizeText(safeFollowUp.time)
      ? `${normalizeText(safeFollowUp.date)}T${normalizeText(safeFollowUp.time)}:00.000Z`
      : '');
  const nextStep = hasDocumentSignal
    ? 'Kontrollera samtycke och personuppgiftshantering'
    : hasClinicalSignal
      ? 'Verifiera kliniskt underlag före nästa råd'
      : hasConsultationSignal
        ? 'Verifiera konsultationsbehov innan råd'
        : hasAftercareSignal
          ? 'Förbered planerad uppföljning'
          : hasCommercialSignal
            ? 'Knyt pris eller betalningsfråga till samma kundkort'
            : hasTaskSignal
              ? 'Håll nästa ägare och intern anteckning tydlig'
              : '';

  return {
    tenantId: normalizeText(context.tenantId),
    workspaceId: normalizeText(context.workspaceId) || 'major-arcana-preview',
    customerEmail: normalizeText(
      context.customerEmail || context.customerId || safeBookingCase.customerEmail
    ),
    customerName: normalizeText(context.customerName || safeBookingCase.customerName),
    pipeline: {
      status: 'active',
      nextStep,
      nextContactAt: followUpWhen,
    },
    modules: {
      consultation: hasConsultationSignal
        ? {
            status: 'needs_validation',
            nextAction: 'Verifiera konsultationsbehov innan råd',
            confidence: 0.7,
            metadata: { source },
          }
        : undefined,
      clinical: hasClinicalSignal
        ? {
            status: 'needs_validation',
            nextAction: 'Verifiera kliniskt underlag före nästa råd',
            confidence: 0.74,
            metadata: { source },
          }
        : undefined,
      documents: hasDocumentSignal
        ? {
            status: 'needs_validation',
            nextAction: 'Kontrollera samtycke och personuppgiftshantering',
            confidence: 0.72,
            metadata: { source },
          }
        : undefined,
      aftercare: hasAftercareSignal
        ? {
            status: 'scheduled',
            nextAction: 'Förbered planerad uppföljning',
            confidence: 0.84,
            metadata: {
              source,
              followUpCategory: normalizeText(safeFollowUp.category),
              followUpDoctorName: normalizeText(safeFollowUp.doctorName),
            },
          }
        : undefined,
      commercial: hasCommercialSignal
        ? {
            status: 'needs_action',
            nextAction: 'Knyt pris eller betalningsfråga till samma kundkort',
            confidence: 0.7,
            metadata: { source },
          }
        : undefined,
      tasks:
        hasTaskSignal || asArray(savedNotes).length
          ? {
              status: hasTaskSignal ? 'needs_action' : 'ready',
              nextAction: hasTaskSignal
                ? 'Håll nästa ägare och intern anteckning tydlig'
                : 'Anteckningar finns i samma kundkort',
              confidence: hasTaskSignal ? 0.78 : 0.68,
              metadata: { source, noteCount: asArray(savedNotes).length },
            }
          : undefined,
    },
  };
}

function buildPatient360TimelineEventFromWorkspaceSignal({
  note = null,
  followUp = null,
  source = 'cco',
  actorName = '',
} = {}) {
  const safeNote = asObject(note);
  const safeFollowUp = asObject(followUp);
  if (normalizeText(safeFollowUp.followUpId || safeFollowUp.scheduledForIso || safeFollowUp.date)) {
    return {
      type: 'followup_planned',
      module: 'aftercare',
      label: 'Uppföljning schemalagd',
      detail:
        normalizeText(safeFollowUp.notes) ||
        `${normalizeText(safeFollowUp.date)} ${normalizeText(safeFollowUp.time)} ${normalizeText(
          safeFollowUp.doctorName
        )}`.trim(),
      occurredAt:
        normalizeText(safeFollowUp.createdAt) ||
        normalizeText(safeFollowUp.scheduledForIso) ||
        new Date().toISOString(),
      source,
      actorName: normalizeText(actorName || safeFollowUp.actorUserId),
      confidence: 0.88,
      validationState: 'observed',
      metadata: {
        category: normalizeText(safeFollowUp.category),
      },
    };
  }
  if (!normalizeText(safeNote.noteId || safeNote.text)) return null;
  const module = mapNoteToPatientModule(safeNote);
  const detail = normalizeText(safeNote.text);
  const validationState =
    module === 'clinical' || module === 'documents' || module === 'consultation'
      ? 'needs_human_validation'
      : 'observed';
  return {
    type: 'workspace_note_saved',
    module,
    label: `Anteckning sparad: ${normalizeText(safeNote.destinationLabel || safeNote.destinationKey || 'Notering')}`,
    detail,
    occurredAt: normalizeText(safeNote.updatedAt || safeNote.createdAt) || new Date().toISOString(),
    source,
    actorName: normalizeText(actorName || safeNote.actorUserId),
    confidence: validationState === 'needs_human_validation' ? 0.68 : 0.8,
    validationState,
    metadata: {
      destinationKey: normalizeText(safeNote.destinationKey),
      visibility: normalizeText(safeNote.visibility),
    },
  };
}

function buildPatient360SnapshotFromConsultationCase({
  context = {},
  consultationCase = {},
  source = 'cco',
} = {}) {
  const safeCase = asObject(consultationCase);
  const consultationStatus = mapConsultationStatusToPatientStatus(safeCase.consultationStatus);
  const clinicalStatus = mapClinicalStatusToPatientStatus(safeCase.clinicalStatus);
  const documentStatus = mapDocumentStatusToPatientStatus(
    safeCase.documentStatus,
    safeCase.consentStatus
  );
  const requiredActions = asArray(safeCase.requiredActions)
    .map((item) => normalizeText(item))
    .filter(Boolean);
  const primaryAction =
    documentStatus === 'blocked' || documentStatus === 'needs_action'
      ? 'Kontrollera samtycke och dokumentunderlag'
      : clinicalStatus === 'needs_validation'
        ? 'Verifiera kliniskt underlag inför konsultation'
        : consultationStatus === 'scheduled'
          ? 'Förbered planerad konsultation'
          : requiredActions[0] || 'Verifiera konsultationsbehov innan råd';
  return {
    tenantId: normalizeText(context.tenantId),
    workspaceId: normalizeText(context.workspaceId) || 'major-arcana-preview',
    customerEmail: normalizeText(
      context.customerEmail || context.customerId || safeCase.customerId
    ),
    customerName: normalizeText(context.customerName || safeCase.customerName),
    pipeline: {
      status: consultationStatus === 'complete' ? 'closed' : 'active',
      nextStep: primaryAction,
      nextContactAt: normalizeText(safeCase.updatedAt),
    },
    modules: {
      consultation: {
        status: consultationStatus,
        nextAction:
          consultationStatus === 'scheduled'
            ? 'Förbered planerad konsultation'
            : consultationStatus === 'complete'
              ? 'Konsultationen är klar'
              : 'Verifiera konsultationsbehov innan råd',
        confidence: consultationStatus === 'scheduled' ? 0.86 : 0.74,
        metadata: {
          source,
          consultationType: normalizeText(safeCase.consultationType),
          requestedTreatment: normalizeText(safeCase.requestedTreatment),
        },
      },
      clinical: {
        status: clinicalStatus,
        nextAction:
          clinicalStatus === 'ready'
            ? 'Kliniskt underlag verifierat'
            : 'Verifiera kliniskt underlag inför konsultation',
        confidence: clinicalStatus === 'ready' ? 0.82 : 0.72,
        metadata: { source },
      },
      documents: {
        status: documentStatus,
        nextAction:
          documentStatus === 'ready'
            ? 'Samtycke och dokumentunderlag verifierade'
            : documentStatus === 'blocked' || documentStatus === 'needs_action'
              ? 'Kontrollera samtycke och dokumentunderlag'
              : 'Kontrollera samtycke och dokumentunderlag',
        confidence: documentStatus === 'ready' ? 0.84 : 0.73,
        metadata: {
          source,
          consentStatus: normalizeText(safeCase.consentStatus),
        },
      },
      tasks: requiredActions.length
        ? {
            status: documentStatus === 'blocked' ? 'ready' : 'needs_action',
            nextAction:
              documentStatus === 'blocked'
                ? 'Interna konsultationsuppgifter finns i samma kundkort'
                : primaryAction,
            confidence: documentStatus === 'blocked' ? 0.72 : 0.78,
            metadata: { source, requiredActionCount: requiredActions.length },
          }
        : undefined,
    },
  };
}

function buildPatient360SnapshotFromAftercareCase({
  context = {},
  aftercareCase = {},
  source = 'cco',
} = {}) {
  const safeCase = asObject(aftercareCase);
  const aftercareStatus = mapAftercareStatusToPatientStatus(
    safeCase.aftercareStatus,
    safeCase.outcomeStatus
  );
  const contactStatus = normalizeKey(safeCase.contactStatus);
  const outcomeStatus = normalizeKey(safeCase.outcomeStatus);
  const requiredActions = asArray(safeCase.requiredActions)
    .map((item) => normalizeText(item))
    .filter(Boolean);
  const primaryAction =
    outcomeStatus === 'needs_attention'
      ? 'Eskalera eftervårdsutfall och boka nästa åtgärd'
      : aftercareStatus === 'scheduled'
        ? 'Genomför planerad uppföljning och dokumentera utfallet'
        : aftercareStatus === 'needs_validation'
          ? 'Verifiera eftervårdsutfall med ansvarig kliniker'
          : requiredActions[0] || 'Öppna eftervårdsärendet och välj nästa steg';

  return {
    tenantId: normalizeText(context.tenantId),
    workspaceId: normalizeText(context.workspaceId) || 'major-arcana-preview',
    customerEmail: normalizeText(
      context.customerEmail || context.customerId || safeCase.customerId
    ),
    customerName: normalizeText(context.customerName || safeCase.customerName),
    pipeline: {
      status: aftercareStatus === 'complete' ? 'closed' : 'active',
      nextStep: primaryAction,
      nextContactAt: normalizeText(safeCase.scheduledForIso || safeCase.updatedAt),
    },
    modules: {
      aftercare: {
        status: aftercareStatus,
        nextAction: primaryAction,
        waitingOn: contactStatus === 'confirmed' ? 'clinic' : 'operator',
        confidence: aftercareStatus === 'scheduled' ? 0.84 : 0.74,
        metadata: {
          source,
          category: normalizeText(safeCase.category),
          contactStatus: normalizeText(safeCase.contactStatus),
          outcomeStatus: normalizeText(safeCase.outcomeStatus),
          doctorName: normalizeText(safeCase.doctorName),
        },
      },
      tasks: requiredActions.length
        ? {
            status: aftercareStatus === 'complete' ? 'ready' : 'needs_action',
            nextAction: requiredActions[0],
            confidence: 0.76,
            metadata: { source, requiredActionCount: requiredActions.length },
          }
        : undefined,
      clinical:
        outcomeStatus === 'needs_attention'
          ? {
              status: 'needs_validation',
              nextAction: 'Verifiera kliniskt eftervårdsutfall före nästa råd',
              confidence: 0.71,
              metadata: { source, aftercare: true },
            }
          : undefined,
    },
  };
}

function buildPatient360SnapshotFromOperationCase({
  context = {},
  operationCase = {},
  source = 'cco',
} = {}) {
  const safeCase = asObject(operationCase);
  const operationStatus = mapOperationStatusToPatientStatus(
    safeCase.operationStatus,
    safeCase.clearanceStatus,
    safeCase.outcomeStatus
  );
  const clearanceStatus = normalizeKey(safeCase.clearanceStatus);
  const outcomeStatus = normalizeKey(safeCase.outcomeStatus);
  const requiredActions = asArray(safeCase.requiredActions)
    .map((item) => normalizeText(item))
    .filter(Boolean);
  const primaryAction =
    operationStatus === 'blocked'
      ? 'Stoppa operationsflödet och lös blockerande klarering'
      : operationStatus === 'scheduled'
        ? 'Bekräfta operationsförberedelser och tider'
        : operationStatus === 'ready'
          ? 'Förbered nästa operativa steg'
          : requiredActions[0] || 'Verifiera operationsberedskap med ansvarig kliniker';

  return {
    tenantId: normalizeText(context.tenantId),
    workspaceId: normalizeText(context.workspaceId) || 'major-arcana-preview',
    customerEmail: normalizeText(
      context.customerEmail || context.customerId || safeCase.customerId
    ),
    customerName: normalizeText(context.customerName || safeCase.customerName),
    pipeline: {
      status: operationStatus === 'complete' ? 'closed' : 'active',
      nextStep: primaryAction,
      nextContactAt: normalizeText(safeCase.scheduledForIso || safeCase.updatedAt),
    },
    modules: {
      operation: {
        status: operationStatus,
        nextAction: primaryAction,
        waitingOn:
          clearanceStatus === 'blocked'
            ? 'clinic'
            : operationStatus === 'scheduled'
              ? 'operator'
              : 'clinic',
        confidence:
          operationStatus === 'blocked' ? 0.82 : operationStatus === 'scheduled' ? 0.86 : 0.74,
        metadata: {
          source,
          procedureType: normalizeText(safeCase.procedureType),
          doctorName: normalizeText(safeCase.doctorName),
          theatreName: normalizeText(safeCase.theatreName),
          clearanceStatus: normalizeText(safeCase.clearanceStatus),
          outcomeStatus: normalizeText(safeCase.outcomeStatus),
        },
      },
      clinical:
        clearanceStatus === 'blocked' || operationStatus === 'needs_validation'
          ? {
              status: 'needs_validation',
              nextAction:
                clearanceStatus === 'blocked'
                  ? 'Lös klinisk klarering före operation'
                  : 'Verifiera operationsberedskap med ansvarig kliniker',
              confidence: 0.76,
              metadata: { source, operation: true },
            }
          : undefined,
      aftercare:
        operationStatus === 'scheduled' || operationStatus === 'ready'
          ? {
              status: 'scheduled',
              nextAction: 'Förbered eftervårdsplan inför operationen',
              confidence: 0.72,
              metadata: { source, operation: true },
            }
          : undefined,
      tasks: requiredActions.length
        ? {
            status: operationStatus === 'complete' ? 'ready' : 'needs_action',
            nextAction: requiredActions[0],
            confidence: 0.77,
            metadata: { source, requiredActionCount: requiredActions.length },
          }
        : undefined,
    },
  };
}

function buildPatient360SnapshotFromCommercialCase({
  context = {},
  commercialCase = {},
  source = 'cco',
} = {}) {
  const safeCase = asObject(commercialCase);
  const commercialStatus = mapCommercialStatusToPatientStatus(
    safeCase.commercialStatus,
    safeCase.quoteStatus,
    safeCase.paymentStatus
  );
  const quoteStatus = normalizeKey(safeCase.quoteStatus);
  const paymentStatus = normalizeKey(safeCase.paymentStatus);
  const requiredActions = asArray(safeCase.requiredActions)
    .map((item) => normalizeText(item))
    .filter(Boolean);
  const primaryAction =
    commercialStatus === 'blocked'
      ? 'Lös deposition eller betalningsblockerare'
      : commercialStatus === 'waiting_customer'
        ? 'Invänta kundens besked om offert eller prisupplägg'
        : commercialStatus === 'ready'
          ? 'Ekonomiskt klartecken finns för nästa steg'
          : requiredActions[0] || 'Skicka offert eller tydlig prisbild till kunden';

  return {
    tenantId: normalizeText(context.tenantId),
    workspaceId: normalizeText(context.workspaceId) || 'major-arcana-preview',
    customerEmail: normalizeText(
      context.customerEmail || context.customerId || safeCase.customerId
    ),
    customerName: normalizeText(context.customerName || safeCase.customerName),
    pipeline: {
      status: commercialStatus === 'complete' ? 'closed' : 'active',
      nextStep: primaryAction,
      nextContactAt: normalizeText(safeCase.dueDateIso || safeCase.updatedAt),
    },
    modules: {
      commercial: {
        status: commercialStatus,
        nextAction: primaryAction,
        waitingOn:
          commercialStatus === 'waiting_customer'
            ? 'customer'
            : commercialStatus === 'blocked'
              ? 'operator'
              : 'team',
        confidence:
          commercialStatus === 'blocked'
            ? 0.84
            : commercialStatus === 'waiting_customer'
              ? 0.8
              : 0.74,
        metadata: {
          source,
          offerType: normalizeText(safeCase.offerType),
          quoteStatus: normalizeText(safeCase.quoteStatus),
          paymentStatus: normalizeText(safeCase.paymentStatus),
          quotedAmount: normalizeText(safeCase.quotedAmount),
          depositAmount: normalizeText(safeCase.depositAmount),
        },
      },
      tasks: requiredActions.length
        ? {
            status: commercialStatus === 'ready' ? 'ready' : 'needs_action',
            nextAction: requiredActions[0],
            confidence: 0.76,
            metadata: { source, requiredActionCount: requiredActions.length },
          }
        : undefined,
      booking:
        paymentStatus === 'paid' || quoteStatus === 'accepted'
          ? {
              status: 'ready',
              nextAction: 'Bokningsflödet kan fortsätta med ekonomiskt klartecken',
              confidence: 0.72,
              metadata: { source, commercial: true },
            }
          : undefined,
    },
  };
}

function buildPatient360TimelineEventFromConsultationCase({
  consultationCase = {},
  event = {},
  actorName = '',
  source = 'cco',
} = {}) {
  const safeCase = asObject(consultationCase);
  const safeEvent = asObject(event);
  const module =
    normalizeText(safeEvent.module) ||
    (normalizeKey(safeEvent.type).includes('document') ? 'documents' : 'consultation');
  return {
    type: normalizeText(safeEvent.type) || 'consultation_updated',
    module,
    label:
      normalizeText(safeEvent.label) ||
      (module === 'documents' ? 'Dokumentunderlag uppdaterat' : 'Konsultationsärende uppdaterat'),
    detail:
      normalizeText(safeEvent.detail) ||
      normalizeText(safeCase.notes) ||
      normalizeText(safeCase.requestedTreatment) ||
      'Konsultationsunderlaget uppdaterades i CCO.',
    occurredAt:
      normalizeText(safeEvent.createdAt) ||
      normalizeText(safeCase.updatedAt) ||
      new Date().toISOString(),
    source,
    actorName: normalizeText(actorName || safeEvent.actorName),
    confidence: module === 'documents' || module === 'clinical' ? 0.72 : 0.82,
    validationState:
      module === 'documents' || module === 'clinical' || module === 'consultation'
        ? 'needs_human_validation'
        : 'observed',
    metadata: {
      consultationStatus: normalizeText(safeCase.consultationStatus),
      documentStatus: normalizeText(safeCase.documentStatus),
      consentStatus: normalizeText(safeCase.consentStatus),
    },
  };
}

function buildPatient360TimelineEventFromAftercareCase({
  aftercareCase = {},
  event = {},
  actorName = '',
  source = 'cco',
} = {}) {
  const safeCase = asObject(aftercareCase);
  const safeEvent = asObject(event);
  return {
    type: normalizeText(safeEvent.type) || 'aftercare_updated',
    module: 'aftercare',
    label: normalizeText(safeEvent.label) || 'Eftervårdsärende uppdaterat',
    detail:
      normalizeText(safeEvent.detail) ||
      normalizeText(safeCase.notes) ||
      'Eftervårdsunderlaget uppdaterades i CCO.',
    occurredAt:
      normalizeText(safeEvent.createdAt) ||
      normalizeText(safeCase.updatedAt) ||
      new Date().toISOString(),
    source,
    actorName: normalizeText(actorName || safeEvent.actorName),
    confidence: normalizeKey(safeCase.outcomeStatus) === 'needs_attention' ? 0.7 : 0.84,
    validationState:
      normalizeKey(safeCase.outcomeStatus) === 'needs_attention'
        ? 'needs_human_validation'
        : 'observed',
    metadata: {
      aftercareStatus: normalizeText(safeCase.aftercareStatus),
      outcomeStatus: normalizeText(safeCase.outcomeStatus),
      contactStatus: normalizeText(safeCase.contactStatus),
    },
  };
}

function buildPatient360TimelineEventFromOperationCase({
  operationCase = {},
  event = {},
  actorName = '',
  source = 'cco',
} = {}) {
  const safeCase = asObject(operationCase);
  const safeEvent = asObject(event);
  return {
    type: normalizeText(safeEvent.type) || 'operation_updated',
    module: 'operation',
    label: normalizeText(safeEvent.label) || 'Operationsärende uppdaterat',
    detail:
      normalizeText(safeEvent.detail) ||
      normalizeText(safeCase.notes) ||
      normalizeText(safeCase.procedureType) ||
      'Operationsunderlaget uppdaterades i CCO.',
    occurredAt:
      normalizeText(safeEvent.createdAt) ||
      normalizeText(safeCase.updatedAt) ||
      new Date().toISOString(),
    source,
    actorName: normalizeText(actorName || safeEvent.actorName),
    confidence:
      normalizeKey(safeCase.clearanceStatus) === 'blocked' ||
      normalizeKey(safeCase.operationStatus) === 'in_progress'
        ? 0.76
        : 0.86,
    validationState:
      normalizeKey(safeCase.clearanceStatus) === 'blocked' ||
      normalizeKey(safeCase.operationStatus) === 'needs_review'
        ? 'needs_human_validation'
        : 'observed',
    metadata: {
      operationStatus: normalizeText(safeCase.operationStatus),
      clearanceStatus: normalizeText(safeCase.clearanceStatus),
      outcomeStatus: normalizeText(safeCase.outcomeStatus),
    },
  };
}

function buildPatient360TimelineEventFromCommercialCase({
  commercialCase = {},
  event = {},
  actorName = '',
  source = 'cco',
} = {}) {
  const safeCase = asObject(commercialCase);
  const safeEvent = asObject(event);
  return {
    type: normalizeText(safeEvent.type) || 'commercial_updated',
    module: 'commercial',
    label: normalizeText(safeEvent.label) || 'Offert- eller betalningsärende uppdaterat',
    detail:
      normalizeText(safeEvent.detail) ||
      normalizeText(safeCase.notes) ||
      normalizeText(safeCase.offerType) ||
      'Kommersiellt underlag uppdaterades i CCO.',
    occurredAt:
      normalizeText(safeEvent.createdAt) ||
      normalizeText(safeCase.updatedAt) ||
      new Date().toISOString(),
    source,
    actorName: normalizeText(actorName || safeEvent.actorName),
    confidence: normalizeKey(safeCase.paymentStatus) === 'blocked' ? 0.78 : 0.84,
    validationState:
      normalizeKey(safeCase.commercialStatus) === 'needs_review'
        ? 'needs_human_validation'
        : 'observed',
    metadata: {
      commercialStatus: normalizeText(safeCase.commercialStatus),
      quoteStatus: normalizeText(safeCase.quoteStatus),
      paymentStatus: normalizeText(safeCase.paymentStatus),
    },
  };
}

async function syncPatient360FromBookingCase({
  patientSystemStore,
  context = {},
  bookingCase = {},
  source = 'cco',
  includeTimelineEvent = false,
  event = null,
} = {}) {
  if (!patientSystemStore || typeof patientSystemStore.upsertPatient !== 'function') {
    return null;
  }
  const snapshot = buildPatient360SnapshotFromBookingCase({ context, bookingCase, source });
  if (!snapshot.customerEmail || !snapshot.tenantId) return null;
  const patientRecord = await patientSystemStore.upsertPatient(snapshot);
  if (includeTimelineEvent !== true || typeof patientSystemStore.addTimelineEvent !== 'function') {
    return patientRecord;
  }
  return patientSystemStore.addTimelineEvent({
    ...snapshot,
    ...buildPatient360TimelineEventFromBookingCase({
      bookingCase,
      event,
      actorName: context.actor?.userId || bookingCase.ownerName,
      source,
    }),
  });
}

async function syncPatient360FromWorkspaceSignals({
  patientSystemStore,
  context = {},
  bookingCase = {},
  savedNotes = [],
  latestFollowUp = null,
  source = 'cco',
  includeTimelineEvent = false,
  note = null,
  followUp = null,
} = {}) {
  if (!patientSystemStore || typeof patientSystemStore.upsertPatient !== 'function') {
    return null;
  }
  const snapshot = buildPatient360SnapshotFromWorkspaceSignals({
    context,
    bookingCase,
    savedNotes,
    latestFollowUp,
    source,
  });
  if (!snapshot.customerEmail || !snapshot.tenantId) return null;
  const patientRecord = await patientSystemStore.upsertPatient(snapshot);
  if (includeTimelineEvent !== true || typeof patientSystemStore.addTimelineEvent !== 'function') {
    return patientRecord;
  }
  const timelineEvent = buildPatient360TimelineEventFromWorkspaceSignal({
    note,
    followUp,
    source,
    actorName: context.actor?.userId,
  });
  if (!timelineEvent) return patientRecord;
  return patientSystemStore.addTimelineEvent({
    ...snapshot,
    ...timelineEvent,
  });
}

async function syncPatient360FromConsultationCase({
  patientSystemStore,
  context = {},
  consultationCase = {},
  source = 'cco',
  includeTimelineEvent = false,
  event = null,
} = {}) {
  if (!patientSystemStore || typeof patientSystemStore.upsertPatient !== 'function') {
    return null;
  }
  const snapshot = buildPatient360SnapshotFromConsultationCase({
    context,
    consultationCase,
    source,
  });
  if (!snapshot.customerEmail || !snapshot.tenantId) return null;
  const patientRecord = await patientSystemStore.upsertPatient(snapshot);
  if (includeTimelineEvent !== true || typeof patientSystemStore.addTimelineEvent !== 'function') {
    return patientRecord;
  }
  return patientSystemStore.addTimelineEvent({
    ...snapshot,
    ...buildPatient360TimelineEventFromConsultationCase({
      consultationCase,
      event,
      actorName: context.actor?.userId,
      source,
    }),
  });
}

async function syncPatient360FromAftercareCase({
  patientSystemStore,
  context = {},
  aftercareCase = {},
  source = 'cco',
  includeTimelineEvent = false,
  event = null,
} = {}) {
  if (!patientSystemStore || typeof patientSystemStore.upsertPatient !== 'function') {
    return null;
  }
  const snapshot = buildPatient360SnapshotFromAftercareCase({
    context,
    aftercareCase,
    source,
  });
  if (!snapshot.customerEmail || !snapshot.tenantId) return null;
  const patientRecord = await patientSystemStore.upsertPatient(snapshot);
  if (includeTimelineEvent !== true || typeof patientSystemStore.addTimelineEvent !== 'function') {
    return patientRecord;
  }
  return patientSystemStore.addTimelineEvent({
    ...snapshot,
    ...buildPatient360TimelineEventFromAftercareCase({
      aftercareCase,
      event,
      actorName: context.actor?.userId,
      source,
    }),
  });
}

async function syncPatient360FromOperationCase({
  patientSystemStore,
  context = {},
  operationCase = {},
  source = 'cco',
  includeTimelineEvent = false,
  event = null,
} = {}) {
  if (!patientSystemStore || typeof patientSystemStore.upsertPatient !== 'function') {
    return null;
  }
  const snapshot = buildPatient360SnapshotFromOperationCase({
    context,
    operationCase,
    source,
  });
  if (!snapshot.customerEmail || !snapshot.tenantId) return null;
  const patientRecord = await patientSystemStore.upsertPatient(snapshot);
  if (includeTimelineEvent !== true || typeof patientSystemStore.addTimelineEvent !== 'function') {
    return patientRecord;
  }
  return patientSystemStore.addTimelineEvent({
    ...snapshot,
    ...buildPatient360TimelineEventFromOperationCase({
      operationCase,
      event,
      actorName: context.actor?.userId,
      source,
    }),
  });
}

async function syncPatient360FromCommercialCase({
  patientSystemStore,
  context = {},
  commercialCase = {},
  source = 'cco',
  includeTimelineEvent = false,
  event = null,
} = {}) {
  if (!patientSystemStore || typeof patientSystemStore.upsertPatient !== 'function') {
    return null;
  }
  const snapshot = buildPatient360SnapshotFromCommercialCase({
    context,
    commercialCase,
    source,
  });
  if (!snapshot.customerEmail || !snapshot.tenantId) return null;
  const patientRecord = await patientSystemStore.upsertPatient(snapshot);
  if (includeTimelineEvent !== true || typeof patientSystemStore.addTimelineEvent !== 'function') {
    return patientRecord;
  }
  return patientSystemStore.addTimelineEvent({
    ...snapshot,
    ...buildPatient360TimelineEventFromCommercialCase({
      commercialCase,
      event,
      actorName: context.actor?.userId,
      source,
    }),
  });
}

module.exports = {
  buildPatient360SnapshotFromBookingCase,
  buildPatient360SnapshotFromAftercareCase,
  buildPatient360SnapshotFromConsultationCase,
  buildPatient360SnapshotFromCommercialCase,
  buildPatient360SnapshotFromOperationCase,
  buildPatient360SnapshotFromWorkspaceSignals,
  buildPatient360TimelineEventFromBookingCase,
  buildPatient360TimelineEventFromAftercareCase,
  buildPatient360TimelineEventFromConsultationCase,
  buildPatient360TimelineEventFromCommercialCase,
  buildPatient360TimelineEventFromOperationCase,
  buildPatient360TimelineEventFromWorkspaceSignal,
  mapAftercareStatusToPatientStatus,
  mapConsultationStatusToPatientStatus,
  mapCommercialStatusToPatientStatus,
  mapBookingStatusToPatientStatus,
  mapClinicalStatusToPatientStatus,
  mapDocumentStatusToPatientStatus,
  mapOperationStatusToPatientStatus,
  mapNoteToPatientModule,
  syncPatient360FromAftercareCase,
  syncPatient360FromBookingCase,
  syncPatient360FromCommercialCase,
  syncPatient360FromConsultationCase,
  syncPatient360FromOperationCase,
  syncPatient360FromWorkspaceSignals,
};
