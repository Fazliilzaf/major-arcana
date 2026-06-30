const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const COMMERCIAL_STATUSES = Object.freeze([
  'needs_review',
  'quote_sent',
  'deposit_pending',
  'payment_pending',
  'ready',
  'complete',
  'cancelled',
]);

const QUOTE_STATUSES = Object.freeze(['missing', 'draft', 'sent', 'accepted']);
const PAYMENT_STATUSES = Object.freeze([
  'pending',
  'pending_customer',
  'partially_paid',
  'paid',
  'blocked',
]);
const QUOTE_OPEN_DEBOUNCE_MS = 30 * 1000;

function nowIso() {
  return new Date().toISOString();
}

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

function normalizeQuoteOpen(input = {}) {
  const safe = asObject(input);
  const ts = normalizeText(safe.ts || safe.createdAt) || nowIso();
  return {
    ts,
    source: normalizeText(safe.source) || 'unknown',
  };
}

function uniqueActions(items = []) {
  return Array.from(
    new Set(
      asArray(items)
        .map((item) => normalizeText(item))
        .filter(Boolean)
    )
  );
}

function toScheduledMeta(isoString, nowMs = Date.now()) {
  const iso = normalizeText(isoString);
  if (!iso) {
    return {
      iso: '',
      isDue: false,
      isOverdue: false,
    };
  }
  const parsedMs = Date.parse(iso);
  if (!Number.isFinite(parsedMs)) {
    return {
      iso: '',
      isDue: false,
      isOverdue: false,
    };
  }
  const dayMs = 24 * 60 * 60 * 1000;
  return {
    iso: new Date(parsedMs).toISOString(),
    isDue: parsedMs >= nowMs && parsedMs - nowMs <= dayMs,
    isOverdue: parsedMs < nowMs,
  };
}

function buildCommercialOperatorActions({ phase = '', waitingOn = '', dueDateIso = '' } = {}) {
  if (phase === 'closed' || phase === 'cancelled') return [];
  if (phase === 'payment_blocked') {
    return [
      {
        key: 'resolve_payment_blocker',
        label: 'Lås upp betalning',
        type: 'surface_action',
        surfaceAction: 'commercial_open',
        emphasis: 'primary',
      },
      {
        key: 'open_commercial_note',
        label: 'Betalningsnot',
        type: 'surface_action',
        surfaceAction: 'note_open',
        noteDestination: 'betalning',
        noteTemplate: 'betalning',
        emphasis: 'secondary',
      },
    ];
  }
  if (phase === 'quote_sent') {
    return [
      {
        key: 'follow_up_quote',
        label: dueDateIso ? 'Följ upp offert' : 'Planera uppföljning',
        type: 'surface_action',
        surfaceAction: 'schedule_open',
        emphasis: waitingOn === 'customer' ? 'primary' : 'secondary',
      },
      {
        key: 'review_commercial_case',
        label: 'Öppna commercial',
        type: 'surface_action',
        surfaceAction: 'commercial_open',
        emphasis: 'secondary',
      },
    ];
  }
  if (phase === 'payment_pending' || phase === 'ready_for_booking') {
    return [
      {
        key:
          phase === 'ready_for_booking' ? 'review_commercial_booking_handoff' : 'follow_up_payment',
        label:
          phase === 'ready_for_booking'
            ? 'Bokningshandoff'
            : waitingOn === 'customer'
              ? 'Följ upp betalning'
              : 'Bekräfta betalning',
        type: 'surface_action',
        surfaceAction: phase === 'ready_for_booking' ? 'booking_surface' : 'commercial_open',
        emphasis: 'primary',
      },
      {
        key: 'open_commercial_note',
        label:
          phase === 'ready_for_booking'
            ? 'Bekräfta klartecken'
            : waitingOn === 'customer'
              ? 'Betalningsnot'
              : 'Prisnot',
        type: 'surface_action',
        surfaceAction: 'note_open',
        noteDestination: 'betalning',
        noteTemplate: 'betalning',
        emphasis: 'secondary',
      },
    ];
  }
  return [
    {
      key: 'review_commercial_case',
      label: 'Granska commercial',
      type: 'surface_action',
      surfaceAction: 'commercial_open',
      emphasis: 'primary',
    },
  ];
}

function buildCommercialCaseReadout(commercialCase = {}, { nowMs = Date.now() } = {}) {
  const safeCase = asObject(commercialCase);
  const commercialStatus = normalizeEnum(
    safeCase.commercialStatus,
    COMMERCIAL_STATUSES,
    'needs_review'
  );
  const quoteStatus = normalizeEnum(safeCase.quoteStatus, QUOTE_STATUSES, 'missing');
  const paymentStatus = normalizeEnum(safeCase.paymentStatus, PAYMENT_STATUSES, 'pending');
  const schedule = toScheduledMeta(safeCase.dueDateIso, nowMs);
  const existingActions = uniqueActions(safeCase.requiredActions);
  const offerType = normalizeText(safeCase.offerType) || 'Offert';
  const depositAmount = normalizeText(safeCase.depositAmount);
  const quotedAmount = normalizeText(safeCase.quotedAmount);

  let phase = 'review';
  let blocker = {
    key: 'commercial_review',
    action: 'review_commercial_case',
    label: 'Granska offertläge och välj nästa steg',
    score: 68,
  };
  let nextStep = 'Granska offertläge och välj nästa steg';
  let waitingOn = 'operator';
  let handoffCopy = '';

  if (commercialStatus === 'cancelled') {
    phase = 'cancelled';
    blocker = {
      key: 'commercial_cancelled',
      action: 'commercial_cancelled',
      label: 'Commercial-spåret är avbrutet',
      score: 10,
    };
    nextStep = 'Bekräfta om offertspåret ska öppnas igen eller lämnas stängt';
    waitingOn = 'operator';
  } else if (commercialStatus === 'complete') {
    phase = 'closed';
    blocker = {
      key: 'commercial_complete',
      action: 'commercial_complete',
      label: 'Commercial-spåret är avslutat',
      score: 12,
    };
    nextStep = 'Ekonomiskt klartecken är avslutat och caset kan lämnas vidare';
    waitingOn = 'none';
    handoffCopy =
      'Commercial är klart. Bokning eller nästa behandlingssteg kan ta över utan prisfriktion.';
  } else if (paymentStatus === 'blocked') {
    phase = 'payment_blocked';
    blocker = {
      key: 'payment_blocked',
      action: 'resolve_payment_blocker',
      label: 'Betalning eller deposition blockerar nästa steg',
      score: 95,
    };
    nextStep = depositAmount
      ? `Lös depositionen på ${depositAmount} innan bokning eller handoff går vidare`
      : 'Lös betalningsblockeraren innan nästa steg går vidare';
    waitingOn = 'operator';
  } else if (commercialStatus === 'needs_review' || quoteStatus === 'missing') {
    phase = 'review';
    blocker = {
      key: 'quote_review',
      action: 'review_commercial_case',
      label: 'Offertunderlag behöver bedömas',
      score: 72,
    };
    nextStep = quotedAmount
      ? `Bekräfta prisbilden på ${quotedAmount} och säkra nästa kommersiella steg`
      : 'Skapa tydlig offert eller prisbild innan ärendet lämnas vidare';
    waitingOn = 'operator';
  } else if (quoteStatus === 'draft') {
    phase = 'quote_draft';
    blocker = {
      key: 'quote_draft',
      action: 'send_commercial_quote',
      label: 'Offerten är inte skickad ännu',
      score: 79,
    };
    nextStep = 'Skicka offerten och tydliggör nästa betalnings- eller bokningssteg';
    waitingOn = 'operator';
  } else if (commercialStatus === 'quote_sent' || quoteStatus === 'sent') {
    const coolingEndsAt = normalizeText(safeCase.coolingOffEndsAt);
    const coolingActive = coolingEndsAt && Date.parse(coolingEndsAt) > nowMs;
    phase = coolingActive ? 'cooling_off' : 'quote_sent';
    blocker = {
      key: coolingActive ? 'cooling_off_active' : 'quote_sent',
      action: coolingActive ? 'wait_cooling_off' : 'follow_up_quote',
      label: coolingActive
        ? `Betänketid gäller till ${coolingEndsAt.slice(0, 10)}`
        : schedule.isOverdue
          ? 'Offerten väntar på kundens besked och uppföljningen har förfallit'
          : 'Offerten väntar på kundens besked',
      score: coolingActive ? 92 : schedule.isOverdue ? 88 : schedule.isDue ? 80 : 60,
    };
    nextStep = coolingActive
      ? `Invänta betänketid till ${coolingEndsAt.slice(0, 10)} innan bindande accept`
      : 'Invänta kundens besked om offert eller prisupplägg';
    waitingOn = coolingActive ? 'legal' : 'customer';
  } else if (
    commercialStatus === 'deposit_pending' ||
    commercialStatus === 'payment_pending' ||
    paymentStatus === 'pending' ||
    paymentStatus === 'pending_customer' ||
    paymentStatus === 'partially_paid'
  ) {
    phase = 'payment_pending';
    blocker = {
      key: 'payment_pending',
      action: 'confirm_payment_plan',
      label:
        paymentStatus === 'partially_paid'
          ? 'Delbetalning väntar på nästa kommersiella drag'
          : 'Betalning eller deposition väntar på klartecken',
      score: paymentStatus === 'partially_paid' ? 70 : 78,
    };
    nextStep =
      paymentStatus === 'partially_paid'
        ? 'Bekräfta återstående betalningsplan innan bokning eller handoff går vidare'
        : depositAmount
          ? `Följ upp depositionen på ${depositAmount} och säkra kundens besked`
          : 'Säkra betalningsupplägg eller deposition före nästa steg';
    waitingOn =
      paymentStatus === 'pending_customer' || commercialStatus === 'deposit_pending'
        ? 'customer'
        : 'operator';
  } else if (
    commercialStatus === 'ready' ||
    paymentStatus === 'paid' ||
    quoteStatus === 'accepted'
  ) {
    phase = 'ready_for_booking';
    blocker = {
      key: 'commercial_ready',
      action: 'handoff_commercial_ready',
      label: 'Ekonomiskt klartecken finns för nästa steg',
      score: 42,
    };
    nextStep = 'Lämna vidare till bokning eller behandling med ekonomiskt klartecken';
    waitingOn = 'booking';
    handoffCopy =
      'Commercial är redo. Bokning kan ta över med pris, offert och betalning förankrade.';
  }

  const requiredActions =
    existingActions.length > 0 ? existingActions : uniqueActions([nextStep, safeCase.nextStep]);
  const queueBucket =
    phase === 'payment_blocked'
      ? 'critical'
      : phase === 'quote_sent' || phase === 'payment_pending'
        ? schedule.isOverdue
          ? 'due'
          : schedule.isDue
            ? 'today'
            : waitingOn === 'customer'
              ? 'planned'
              : 'active'
        : phase === 'quote_draft' || phase === 'review'
          ? 'active'
          : phase === 'ready_for_booking'
            ? 'planned'
            : phase === 'closed'
              ? 'closed'
              : 'paused';

  return {
    enabled: Boolean(
      normalizeText(safeCase.tenantId) &&
      normalizeText(safeCase.workspaceId) &&
      normalizeText(safeCase.conversationId) &&
      normalizeText(safeCase.customerId)
    ),
    status: commercialStatus,
    phase,
    blocker,
    offerType,
    quoteStatus,
    paymentStatus,
    quotedAmount,
    depositAmount,
    dueDateIso: schedule.iso,
    isDue: schedule.isDue,
    isOverdue: schedule.isOverdue,
    nextStep,
    requiredActions,
    queueBucket,
    operatorActions: buildCommercialOperatorActions({
      phase,
      waitingOn,
      dueDateIso: schedule.iso,
    }),
    notes:
      normalizeText(safeCase.notes) ||
      (requiredActions[0]
        ? `${requiredActions[0]}.`
        : 'Commercial-spåret behöver ett tydligt nästa steg.'),
    waitingOn,
    attention: {
      what: nextStep,
      where: 'Offert & betalning',
      when: schedule.iso || normalizeText(safeCase.updatedAt) || 'Så snart som möjligt',
      confidence:
        phase === 'payment_blocked'
          ? 'Hög - blockerande betalningssignal'
          : phase === 'ready_for_booking'
            ? 'Hög - ekonomiskt klartecken finns'
            : waitingOn === 'customer'
              ? 'Medel - väntar på kundens besked'
              : 'Medel - operatören behöver validera nästa steg',
    },
    handoffCopy:
      handoffCopy ||
      (waitingOn === 'customer'
        ? 'Commercial väntar på kundens besked innan bokning eller nästa handoff ska forceras.'
        : waitingOn === 'booking'
          ? 'Commercial är förankrat. Lämna vidare till bokning med tydligt ekonomiskt läge.'
          : ''),
    linkedJournalEntryId: normalizeText(safeCase.linkedJournalEntryId),
    offerDocumentId: normalizeText(safeCase.offerDocumentId),
    offerDocumentPdfId: normalizeText(safeCase.offerDocumentPdfId),
    offerDocumentWordId: normalizeText(safeCase.offerDocumentWordId),
    offerTemplateKey: normalizeText(safeCase.offerTemplateKey),
    offerPlan:
      safeCase.offerPlan && typeof safeCase.offerPlan === 'object' ? safeCase.offerPlan : null,
    quoteSentAt: normalizeText(safeCase.quoteSentAt),
    quoteAcceptedAt: normalizeText(safeCase.quoteAcceptedAt),
    customerSignedName: normalizeText(safeCase.customerSignedName),
    coolingOffEndsAt: normalizeText(safeCase.coolingOffEndsAt),
    esignStatus: normalizeText(safeCase.esignStatus) || 'draft',
    hasPlanSnapshot: Boolean(safeCase.planSnapshot),
  };
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    commercialCases: [],
  };
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = normalizeKey(value);
  return allowed.includes(normalized) ? normalized : fallback;
}

function caseKey(input = {}) {
  const tenantId = normalizeText(input.tenantId);
  const workspaceId = normalizeText(input.workspaceId) || 'major-arcana-preview';
  const conversationId = normalizeText(input.conversationId);
  const customerId = normalizeKey(input.customerId);
  return [tenantId, workspaceId, conversationId, customerId].join('::');
}

function cloneCase(record) {
  if (!record) return null;
  return {
    ...record,
    requiredActions: [...asArray(record.requiredActions)],
    events: asArray(record.events).map((event) => ({ ...event })),
    quoteOpens: asArray(record.quoteOpens).map((open) => ({ ...open })),
  };
}

function normalizeCommercialCase(input = {}, existing = {}) {
  const safe = asObject(input);
  const previous = asObject(existing);
  const tenantId = normalizeText(safe.tenantId || previous.tenantId);
  const workspaceId =
    normalizeText(safe.workspaceId || previous.workspaceId) || 'major-arcana-preview';
  const conversationId = normalizeText(safe.conversationId || previous.conversationId);
  const customerId = normalizeKey(safe.customerId || previous.customerId);
  if (!tenantId || !workspaceId || !conversationId || !customerId) return null;

  const createdAt = normalizeText(previous.createdAt || safe.createdAt) || nowIso();
  const requiredActions = Array.from(
    new Set(
      [...asArray(previous.requiredActions), ...asArray(safe.requiredActions)]
        .map((item) => normalizeText(item))
        .filter(Boolean)
    )
  );

  return {
    commercialCaseId:
      normalizeText(previous.commercialCaseId || safe.commercialCaseId) || crypto.randomUUID(),
    tenantId,
    workspaceId,
    conversationId,
    customerId,
    customerName: normalizeText(safe.customerName || previous.customerName),
    offerType: normalizeText(safe.offerType || previous.offerType),
    commercialStatus: normalizeEnum(
      safe.commercialStatus || previous.commercialStatus,
      COMMERCIAL_STATUSES,
      'needs_review'
    ),
    quoteStatus: normalizeEnum(safe.quoteStatus || previous.quoteStatus, QUOTE_STATUSES, 'missing'),
    paymentStatus: normalizeEnum(
      safe.paymentStatus || previous.paymentStatus,
      PAYMENT_STATUSES,
      'pending'
    ),
    quotedAmount: normalizeText(safe.quotedAmount || previous.quotedAmount),
    depositAmount: normalizeText(safe.depositAmount || previous.depositAmount),
    dueDateIso: normalizeText(safe.dueDateIso || previous.dueDateIso),
    notes: normalizeText(safe.notes || previous.notes),
    nextStep: normalizeText(safe.nextStep || previous.nextStep),
    linkedOperationCaseId: normalizeText(
      safe.linkedOperationCaseId || previous.linkedOperationCaseId
    ),
    linkedJournalEntryId: normalizeText(safe.linkedJournalEntryId || previous.linkedJournalEntryId),
    linkedPatientId: normalizeText(safe.linkedPatientId || previous.linkedPatientId),
    offerDocumentId: normalizeText(safe.offerDocumentId || previous.offerDocumentId),
    offerDocumentPdfId: normalizeText(safe.offerDocumentPdfId || previous.offerDocumentPdfId),
    offerDocumentWordId: normalizeText(safe.offerDocumentWordId || previous.offerDocumentWordId),
    offerTemplateKey: normalizeText(safe.offerTemplateKey || previous.offerTemplateKey),
    quoteSentAt: normalizeText(safe.quoteSentAt || previous.quoteSentAt),
    quoteAcceptedAt: normalizeText(safe.quoteAcceptedAt || previous.quoteAcceptedAt),
    quoteOpens: asArray(safe.quoteOpens).length
      ? asArray(safe.quoteOpens).map(normalizeQuoteOpen)
      : asArray(previous.quoteOpens).map(normalizeQuoteOpen),
    quoteOpenCount: asArray(safe.quoteOpens).length
      ? asArray(safe.quoteOpens).length
      : asArray(previous.quoteOpens).length,
    quoteOpenedAt: asArray(safe.quoteOpens).length
      ? normalizeQuoteOpen(asArray(safe.quoteOpens).at(-1)).ts
      : normalizeText(previous.quoteOpenedAt),
    customerSignedName: normalizeText(safe.customerSignedName || previous.customerSignedName),
    coolingOffEndsAt: normalizeText(safe.coolingOffEndsAt || previous.coolingOffEndsAt),
    esignToken: normalizeText(safe.esignToken || previous.esignToken),
    esignStatus: normalizeText(safe.esignStatus || previous.esignStatus) || 'draft',
    planSnapshot:
      safe.planSnapshot && typeof safe.planSnapshot === 'object'
        ? safe.planSnapshot
        : previous.planSnapshot && typeof previous.planSnapshot === 'object'
          ? previous.planSnapshot
          : null,
    offerPlan:
      safe.offerPlan && typeof safe.offerPlan === 'object'
        ? safe.offerPlan
        : previous.offerPlan && typeof previous.offerPlan === 'object'
          ? previous.offerPlan
          : null,
    requiredActions,
    events: asArray(safe.events).length
      ? asArray(safe.events).map((event) => {
          const safeEvent = asObject(event);
          return {
            eventId: normalizeText(safeEvent.eventId) || crypto.randomUUID(),
            type: normalizeText(safeEvent.type) || 'commercial_updated',
            label: normalizeText(safeEvent.label) || 'Kommersiellt ärende uppdaterat',
            detail: normalizeText(safeEvent.detail),
            actorUserId: normalizeText(safeEvent.actorUserId),
            actorName: normalizeText(safeEvent.actorName),
            createdAt: normalizeText(safeEvent.createdAt) || nowIso(),
          };
        })
      : asArray(previous.events).map((event) => ({ ...event })),
    createdAt,
    updatedAt: nowIso(),
  };
}

async function createCcoCommercialStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoCommercialStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    commercialCases: asArray(state?.commercialCases)
      .map((item) => normalizeCommercialCase(item))
      .filter(Boolean),
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function getCase(input = {}) {
    const key = caseKey(input);
    if (!key || key.split('::').some((part) => !part)) return null;
    return cloneCase(state.commercialCases.find((item) => caseKey(item) === key));
  }

  async function ensureCase(input = {}) {
    const existing = await getCase(input);
    if (existing) return existing;
    return upsertCase(input);
  }

  async function upsertCase(input = {}) {
    const key = caseKey(input);
    if (!key || key.split('::').some((part) => !part)) {
      throw new Error('Det kommersiella ärendet saknar tenant, tråd eller kund.');
    }
    const index = state.commercialCases.findIndex((item) => caseKey(item) === key);
    const existing = index >= 0 ? state.commercialCases[index] : {};
    const normalized = normalizeCommercialCase(input, existing);
    if (!normalized) {
      throw new Error('Det kommersiella ärendet saknar tenant, tråd eller kund.');
    }
    if (index >= 0) {
      state.commercialCases[index] = normalized;
    } else {
      state.commercialCases.push(normalized);
    }
    await save();
    return cloneCase(state.commercialCases[index >= 0 ? index : state.commercialCases.length - 1]);
  }

  async function getPatientRegisterCase({ tenantId, patientId } = {}) {
    const key = caseKey({
      tenantId,
      workspaceId: 'major-arcana-preview',
      conversationId: 'patient-register',
      customerId: patientId,
    });
    return cloneCase(state.commercialCases.find((item) => caseKey(item) === key));
  }

  async function findCaseByEsignToken(token) {
    const normalized = normalizeText(token);
    if (!normalized) return null;
    return cloneCase(
      state.commercialCases.find((item) => normalizeText(item.esignToken) === normalized)
    );
  }

  async function listCases() {
    return state.commercialCases.map(cloneCase);
  }

  async function recordQuoteOpen({
    tenantId,
    patientId,
    source = 'customer_offer_view',
    ts = nowIso(),
  } = {}) {
    const commercialCase = await getPatientRegisterCase({ tenantId, patientId });
    if (!commercialCase) {
      const error = new Error('Offert saknas för kunden.');
      error.statusCode = 404;
      throw error;
    }
    const normalizedSource = normalizeText(source) || 'customer_offer_view';
    const normalizedTs = normalizeText(ts) || nowIso();
    const opens = asArray(commercialCase.quoteOpens).map(normalizeQuoteOpen);
    const currentMs = Date.parse(normalizedTs);
    const duplicate = opens.some((open) => {
      if (open.source !== normalizedSource) return false;
      const openMs = Date.parse(open.ts);
      if (!Number.isFinite(openMs) || !Number.isFinite(currentMs)) return false;
      return Math.abs(currentMs - openMs) <= QUOTE_OPEN_DEBOUNCE_MS;
    });
    if (duplicate) {
      return {
        commercialCase,
        recorded: false,
        debounced: true,
        openIndex: opens.length,
      };
    }
    const nextOpen = normalizeQuoteOpen({ ts: normalizedTs, source: normalizedSource });
    const updated = await upsertCase({
      ...commercialCase,
      quoteOpens: [...opens, nextOpen],
      events: [
        ...asArray(commercialCase.events),
        {
          type: 'offer_opened',
          label: 'Offert öppnad av kund',
          detail: normalizedSource,
          createdAt: nextOpen.ts,
        },
      ],
    });
    return {
      commercialCase: updated,
      recorded: true,
      debounced: false,
      openIndex: asArray(updated.quoteOpens).length,
      quoteOpen: nextOpen,
    };
  }

  return {
    getCase,
    getPatientRegisterCase,
    findCaseByEsignToken,
    listCases,
    ensureCase,
    recordQuoteOpen,
    upsertCase,
  };
}

function buildQuoteOpenTimelineEvents(commercialCase = {}) {
  const ref =
    normalizeText(commercialCase.offerDocumentId) ||
    normalizeText(commercialCase.commercialCaseId) ||
    'offert';
  return asArray(commercialCase.quoteOpens).map((open, index) => ({
    type: 'offer_opened',
    ts: normalizeText(open.ts),
    title: `Offert ${ref} öppnad`,
    icon: '👁',
    tone: 'warn',
    entityId: normalizeText(commercialCase.commercialCaseId) || null,
    detail: {
      openIndex: index + 1,
      source: normalizeText(open.source) || 'unknown',
      quoteOpenCount: asArray(commercialCase.quoteOpens).length,
      offerDocumentId: normalizeText(commercialCase.offerDocumentId) || null,
      ccoSourceOnly: true,
    },
  }));
}

module.exports = {
  COMMERCIAL_STATUSES,
  QUOTE_STATUSES,
  PAYMENT_STATUSES,
  buildQuoteOpenTimelineEvents,
  buildCommercialCaseReadout,
  createCcoCommercialStore,
};
