const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const AFTERCARE_STATUSES = Object.freeze([
  'needs_review',
  'scheduled',
  'in_progress',
  'complete',
  'cancelled',
]);

const CONTACT_STATUSES = Object.freeze(['pending', 'confirmed', 'not_needed']);
const OUTCOME_STATUSES = Object.freeze(['unknown', 'stable', 'needs_attention']);

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

function toIso(value) {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toISOString();
}

function toScheduledMeta(isoValue, nowMs = Date.now()) {
  const iso = toIso(isoValue);
  if (!iso) return { iso: '', isDue: false, isOverdue: false };
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return { iso: '', isDue: false, isOverdue: false };
  const diffMs = ms - nowMs;
  return {
    iso,
    isDue: diffMs <= 60 * 60 * 1000,
    isOverdue: diffMs < 0,
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

function buildAftercareCaseReadout(aftercareCase = {}, { nowMs = Date.now() } = {}) {
  const safeCase = asObject(aftercareCase);
  const aftercareStatus = normalizeEnum(
    safeCase.aftercareStatus,
    AFTERCARE_STATUSES,
    'needs_review'
  );
  const contactStatus = normalizeEnum(safeCase.contactStatus, CONTACT_STATUSES, 'pending');
  const outcomeStatus = normalizeEnum(safeCase.outcomeStatus, OUTCOME_STATUSES, 'unknown');
  const schedule = toScheduledMeta(safeCase.scheduledForIso, nowMs);
  const doctorName = normalizeText(safeCase.doctorName) || 'Ansvarig kliniker';
  const existingActions = uniqueActions(safeCase.requiredActions);

  let phase = 'review';
  let blocker = {
    key: 'aftercare_review',
    action: 'review_aftercare_case',
    label: 'Bedöm eftervårdsärendet och välj nästa steg',
    score: 72,
  };
  let nextStep = 'Bedöm eftervårdsärendet och välj nästa steg';
  let waitingOn = 'operator';

  if (outcomeStatus === 'needs_attention') {
    phase = 'clinical_escalation';
    blocker = {
      key: 'clinical_escalation',
      action: 'escalate_aftercare_outcome',
      label: 'Kliniskt utfall behöver ansvarig bedömning',
      score: 96,
    };
    nextStep = `Eskalera eftervårdsutfall till ${doctorName} och boka nästa åtgärd`;
    waitingOn = 'clinic';
  } else if (aftercareStatus === 'scheduled' && schedule.isOverdue) {
    phase = 'follow_up_due';
    blocker = {
      key: 'follow_up_due',
      action: 'complete_aftercare_follow_up',
      label: 'Planerad uppföljning har förfallit',
      score: 88,
    };
    nextStep = 'Genomför förfallen uppföljning och dokumentera utfallet';
    waitingOn = 'operator';
  } else if (aftercareStatus === 'scheduled') {
    phase = schedule.isDue ? 'follow_up_today' : 'follow_up_planned';
    blocker = {
      key: 'follow_up_planned',
      action: 'prepare_aftercare_follow_up',
      label: schedule.isDue
        ? 'Planerad uppföljning ska göras nu'
        : 'Planerad uppföljning väntar på genomförande',
      score: schedule.isDue ? 82 : 58,
    };
    nextStep = 'Genomför planerad uppföljning och dokumentera utfallet';
    waitingOn = 'operator';
  } else if (aftercareStatus === 'in_progress' && contactStatus !== 'confirmed') {
    phase = 'contact_pending';
    blocker = {
      key: 'contact_pending',
      action: 'confirm_aftercare_contact',
      label: 'Eftervårdskontakt behöver bekräftas',
      score: 68,
    };
    nextStep = 'Bekräfta att uppföljningskontakten är tagen och säkra återkoppling';
    waitingOn = 'operator';
  } else if (aftercareStatus === 'in_progress') {
    phase = 'document_outcome';
    blocker = {
      key: 'document_outcome',
      action: 'document_aftercare_outcome',
      label: 'Eftervårdsutfall behöver dokumenteras',
      score: 64,
    };
    nextStep = 'Dokumentera eftervårdsutfall och avgör om ärendet kan stängas';
    waitingOn = 'operator';
  } else if (aftercareStatus === 'complete') {
    phase = 'closed';
    blocker = {
      key: 'aftercare_complete',
      action: 'aftercare_complete',
      label: 'Eftervårdsärendet är avslutat',
      score: 10,
    };
    nextStep =
      outcomeStatus === 'stable'
        ? 'Eftervården är avslutad och kunden är stabil'
        : 'Eftervården är avslutad';
    waitingOn = 'none';
  } else if (aftercareStatus === 'cancelled') {
    phase = 'cancelled';
    blocker = {
      key: 'aftercare_cancelled',
      action: 'aftercare_cancelled',
      label: 'Eftervårdsärendet är avbrutet',
      score: 12,
    };
    nextStep = 'Bekräfta om ett nytt eftervårdsupplägg behövs';
    waitingOn = 'operator';
  }

  const requiredActions =
    existingActions.length > 0 ? existingActions : uniqueActions([nextStep, safeCase.nextStep]);
  const queueBucket =
    phase === 'clinical_escalation'
      ? 'critical'
      : phase === 'follow_up_due'
        ? 'due'
        : phase === 'follow_up_today'
          ? 'today'
          : phase === 'follow_up_planned'
            ? 'planned'
            : phase === 'review' || phase === 'contact_pending' || phase === 'document_outcome'
              ? 'active'
              : phase === 'closed'
                ? 'closed'
                : 'paused';
  const operatorActions = buildAftercareOperatorActions({
    phase,
    waitingOn,
    scheduledForIso: normalizeText(safeCase.scheduledForIso),
  });

  return {
    enabled: Boolean(
      normalizeText(safeCase.tenantId) &&
      normalizeText(safeCase.workspaceId) &&
      normalizeText(safeCase.conversationId) &&
      normalizeText(safeCase.customerId)
    ),
    status: aftercareStatus,
    phase,
    blocker,
    category: normalizeText(safeCase.category) || 'Uppföljning',
    contactStatus,
    outcomeStatus,
    scheduledForIso: schedule.iso,
    isDue: schedule.isDue,
    isOverdue: schedule.isOverdue,
    doctorName,
    nextStep,
    requiredActions,
    queueBucket,
    operatorActions,
    notes:
      normalizeText(safeCase.notes) ||
      (requiredActions[0]
        ? `${requiredActions[0]}.`
        : 'Eftervården behöver ett tydligt nästa steg.'),
    waitingOn,
    attention: {
      what: nextStep,
      where: outcomeStatus === 'needs_attention' ? doctorName : 'Eftervård',
      when: schedule.iso || normalizeText(safeCase.updatedAt) || 'Så snart som möjligt',
      confidence:
        outcomeStatus === 'needs_attention'
          ? 'Hög - klinisk eskalering'
          : schedule.isOverdue
            ? 'Hög - uppföljning förfallen'
            : aftercareStatus === 'scheduled'
              ? 'Medel - planerad uppföljning'
              : aftercareStatus === 'complete'
                ? 'Hög - avslutat läge'
                : 'Medel - operatörsbedömning krävs',
    },
  };
}

function buildAftercareOperatorActions({ phase = '', waitingOn = '', scheduledForIso = '' } = {}) {
  const safePhase = normalizeText(phase);
  const safeWaitingOn = normalizeText(waitingOn);
  const hasSchedule = Boolean(normalizeText(scheduledForIso));
  const actionSets = {
    review: [
      {
        key: 'confirm_contact',
        label: 'Bekräfta kontakt',
        type: 'case_action',
        emphasis: 'primary',
      },
      {
        key: 'schedule_open',
        label: hasSchedule ? 'Planera om uppföljning' : 'Schemalägg uppföljning',
        type: 'surface_action',
        surfaceAction: 'schedule_open',
        emphasis: 'secondary',
      },
    ],
    contact_pending: [
      {
        key: 'confirm_contact',
        label: 'Bekräfta kontakt',
        type: 'case_action',
        emphasis: 'primary',
      },
      {
        key: 'studio_open',
        label: 'Öppna Svarstudio',
        type: 'surface_action',
        surfaceAction: 'studio_open',
        emphasis: 'secondary',
      },
    ],
    follow_up_due: [
      {
        key: 'mark_follow_up_done',
        label: 'Markera uppföljning gjord',
        type: 'case_action',
        emphasis: 'primary',
      },
      {
        key: 'schedule_open',
        label: 'Planera om uppföljning',
        type: 'surface_action',
        surfaceAction: 'schedule_open',
        emphasis: 'secondary',
      },
    ],
    follow_up_today: [
      {
        key: 'mark_follow_up_done',
        label: 'Markera uppföljning gjord',
        type: 'case_action',
        emphasis: 'primary',
      },
      {
        key: 'schedule_open',
        label: 'Flytta tiden',
        type: 'surface_action',
        surfaceAction: 'schedule_open',
        emphasis: 'secondary',
      },
    ],
    follow_up_planned: [
      {
        key: 'mark_follow_up_done',
        label: 'Markera uppföljning gjord',
        type: 'case_action',
        emphasis: 'primary',
      },
      {
        key: 'schedule_open',
        label: 'Planera om uppföljning',
        type: 'surface_action',
        surfaceAction: 'schedule_open',
        emphasis: 'secondary',
      },
    ],
    clinical_escalation: [
      {
        key: 'escalate_clinical_outcome',
        label: safeWaitingOn === 'clinic' ? 'Bekräfta eskalering' : 'Eskalera kliniskt',
        type: 'case_action',
        emphasis: 'primary',
      },
      {
        key: 'note_open',
        label: 'Öppna anteckning',
        type: 'surface_action',
        surfaceAction: 'note_open',
        emphasis: 'secondary',
      },
    ],
    document_outcome: [
      {
        key: 'document_stable_outcome',
        label: 'Dokumentera stabilt utfall',
        type: 'case_action',
        emphasis: 'primary',
      },
      {
        key: 'escalate_clinical_outcome',
        label: 'Eskalera kliniskt',
        type: 'case_action',
        emphasis: 'secondary',
      },
    ],
    closed: [],
    cancelled: [],
  };

  return (actionSets[safePhase] || []).map((item) => ({ ...item }));
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    aftercareCases: [],
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
  };
}

const AFTERCARE_QUEUE_PRIORITY = Object.freeze({
  critical: 0,
  due: 1,
  today: 2,
  active: 3,
  planned: 4,
  closed: 5,
  paused: 6,
});

function getAftercareQueueSortValue(record = {}, readout = {}) {
  const queueBucket = normalizeKey(readout.queueBucket || '');
  const priority = AFTERCARE_QUEUE_PRIORITY[queueBucket] ?? 99;
  const scheduledMs = Date.parse(
    normalizeText(record.scheduledForIso || readout.scheduledForIso || '')
  );
  const updatedMs = Date.parse(normalizeText(record.updatedAt || record.createdAt || ''));
  return {
    priority,
    scheduledMs: Number.isFinite(scheduledMs) ? scheduledMs : Number.POSITIVE_INFINITY,
    updatedMs: Number.isFinite(updatedMs) ? updatedMs : 0,
  };
}

function normalizeAftercareCase(input = {}, existing = {}) {
  const safe = asObject(input);
  const previous = asObject(existing);
  const tenantId = normalizeText(safe.tenantId || previous.tenantId);
  const workspaceId =
    normalizeText(safe.workspaceId || previous.workspaceId) || 'major-arcana-preview';
  const conversationId = normalizeText(safe.conversationId || previous.conversationId);
  const customerId = normalizeKey(safe.customerId || previous.customerId);
  if (!tenantId || !workspaceId || !conversationId || !customerId) return null;

  const createdAt = normalizeText(previous.createdAt || safe.createdAt) || nowIso();
  const requiredActions =
    safe.replaceRequiredActions === true
      ? uniqueActions(safe.requiredActions)
      : uniqueActions([...asArray(previous.requiredActions), ...asArray(safe.requiredActions)]);

  return {
    aftercareCaseId:
      normalizeText(previous.aftercareCaseId || safe.aftercareCaseId) || crypto.randomUUID(),
    tenantId,
    workspaceId,
    conversationId,
    customerId,
    customerName: normalizeText(safe.customerName || previous.customerName),
    category: normalizeText(safe.category || previous.category) || 'Uppföljning',
    aftercareStatus: normalizeEnum(
      safe.aftercareStatus || previous.aftercareStatus,
      AFTERCARE_STATUSES,
      'needs_review'
    ),
    contactStatus: normalizeEnum(
      safe.contactStatus || previous.contactStatus,
      CONTACT_STATUSES,
      'pending'
    ),
    outcomeStatus: normalizeEnum(
      safe.outcomeStatus || previous.outcomeStatus,
      OUTCOME_STATUSES,
      'unknown'
    ),
    scheduledForIso: normalizeText(safe.scheduledForIso || previous.scheduledForIso),
    doctorName: normalizeText(safe.doctorName || previous.doctorName) || 'Dr. Eriksson',
    reminderLeadMinutes:
      Number.parseInt(
        String(safe.reminderLeadMinutes ?? previous.reminderLeadMinutes ?? 120),
        10
      ) || 120,
    notes: normalizeText(safe.notes || previous.notes),
    nextStep: normalizeText(safe.nextStep || previous.nextStep),
    linkedFollowUpId: normalizeText(safe.linkedFollowUpId || previous.linkedFollowUpId),
    requiredActions,
    events: asArray(safe.events).length
      ? asArray(safe.events).map((event) => {
          const safeEvent = asObject(event);
          return {
            eventId: normalizeText(safeEvent.eventId) || crypto.randomUUID(),
            type: normalizeText(safeEvent.type) || 'aftercare_updated',
            label: normalizeText(safeEvent.label) || 'Eftervårdsärende uppdaterat',
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

async function createCcoAftercareStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoAftercareStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    aftercareCases: asArray(state?.aftercareCases)
      .map((item) => normalizeAftercareCase(item))
      .filter(Boolean),
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function getCase(input = {}) {
    const key = caseKey(input);
    if (!key || key.split('::').some((part) => !part)) return null;
    return cloneCase(state.aftercareCases.find((item) => caseKey(item) === key));
  }

  async function ensureCase(input = {}) {
    const existing = await getCase(input);
    if (existing) return existing;
    return upsertCase(input);
  }

  async function listCases(input = {}) {
    const tenantId = normalizeText(input.tenantId);
    const workspaceId =
      normalizeText(input.workspaceId || 'major-arcana-preview') || 'major-arcana-preview';
    const includeClosed = input.includeClosed === true;
    const limit = Math.max(1, Math.min(50, Number.parseInt(String(input.limit ?? 12), 10) || 12));
    if (!tenantId || !workspaceId) return [];

    return state.aftercareCases
      .filter(
        (item) =>
          normalizeText(item.tenantId) === tenantId &&
          normalizeText(item.workspaceId) === workspaceId
      )
      .map((item) => {
        const record = cloneCase(item);
        const readout = buildAftercareCaseReadout(record);
        return {
          ...record,
          readout,
          _sort: getAftercareQueueSortValue(record, readout),
        };
      })
      .filter(
        (item) =>
          includeClosed || !['closed', 'paused'].includes(normalizeKey(item.readout?.queueBucket))
      )
      .sort((left, right) => {
        const priorityDelta = left._sort.priority - right._sort.priority;
        if (priorityDelta) return priorityDelta;
        const scheduledDelta = left._sort.scheduledMs - right._sort.scheduledMs;
        if (Number.isFinite(scheduledDelta) && scheduledDelta !== 0) return scheduledDelta;
        return right._sort.updatedMs - left._sort.updatedMs;
      })
      .slice(0, limit)
      .map(({ _sort, ...item }) => item);
  }

  async function upsertCase(input = {}) {
    const key = caseKey(input);
    if (!key || key.split('::').some((part) => !part)) {
      throw new Error('Eftervårdsärendet saknar tenant, tråd eller kund.');
    }
    const index = state.aftercareCases.findIndex((item) => caseKey(item) === key);
    const existing = index >= 0 ? state.aftercareCases[index] : {};
    const normalized = normalizeAftercareCase(input, existing);
    if (!normalized) {
      throw new Error('Eftervårdsärendet saknar tenant, tråd eller kund.');
    }
    if (index >= 0) {
      state.aftercareCases[index] = normalized;
    } else {
      state.aftercareCases.push(normalized);
    }
    await save();
    return cloneCase(state.aftercareCases[index >= 0 ? index : state.aftercareCases.length - 1]);
  }

  async function recordFollowUpSchedule(input = {}) {
    const existing = await ensureCase({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      customerId: input.customerId,
      customerName: input.customerName,
      category: input.category,
      aftercareStatus: 'needs_review',
    });
    return upsertCase({
      ...existing,
      ...input,
      replaceRequiredActions: true,
      aftercareStatus: 'scheduled',
      contactStatus: 'pending',
      linkedFollowUpId: normalizeText(input.linkedFollowUpId || existing.linkedFollowUpId),
      nextStep:
        normalizeText(input.nextStep) || 'Genomför planerad uppföljning och dokumentera utfallet',
      requiredActions: ['Genomför planerad uppföljning och dokumentera utfallet'],
      events: [
        ...asArray(existing.events),
        {
          type: 'aftercare_followup_scheduled',
          label: 'Eftervårdsuppföljning schemalagd',
          detail: normalizeText(input.notes) || 'Ny eftervårdsuppföljning skapades.',
          actorUserId: normalizeText(input.actorUserId),
          actorName: normalizeText(input.actorName),
        },
      ],
    });
  }

  async function applyCaseAction(input = {}) {
    const actionKey = normalizeText(input.actionKey);
    if (!actionKey) {
      throw new Error('Eftervårdsåtgärden saknar actionKey.');
    }

    const existing = await ensureCase({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      customerId: input.customerId,
      customerName: input.customerName,
      category: input.category,
      aftercareStatus: 'needs_review',
      contactStatus: 'pending',
      outcomeStatus: 'unknown',
    });

    let patch = {};
    let event = null;

    if (actionKey === 'confirm_contact') {
      patch = {
        aftercareStatus: 'in_progress',
        contactStatus: 'confirmed',
        nextStep: 'Dokumentera eftervårdsutfall och avgör om ärendet kan stängas',
        requiredActions: ['Dokumentera eftervårdsutfall och avgör om ärendet kan stängas'],
      };
      event = {
        type: 'aftercare_contact_confirmed',
        label: 'Eftervårdskontakt bekräftad',
        detail: 'Eftervårdskontakten är tagen och nästa steg är att dokumentera utfallet.',
      };
    } else if (actionKey === 'mark_follow_up_done') {
      patch = {
        aftercareStatus: 'in_progress',
        contactStatus: 'confirmed',
        nextStep: 'Dokumentera eftervårdsutfall och avgör om ärendet kan stängas',
        requiredActions: ['Dokumentera eftervårdsutfall och avgör om ärendet kan stängas'],
      };
      event = {
        type: 'aftercare_followup_completed',
        label: 'Planerad uppföljning genomförd',
        detail: 'Uppföljningen är genomförd och väntar nu på dokumenterat utfall.',
      };
    } else if (actionKey === 'escalate_clinical_outcome') {
      const doctorName =
        normalizeText(input.doctorName || existing.doctorName) || 'Ansvarig kliniker';
      patch = {
        aftercareStatus: 'in_progress',
        contactStatus: 'confirmed',
        outcomeStatus: 'needs_attention',
        doctorName,
        nextStep: `Eskalera eftervårdsutfall till ${doctorName} och boka nästa åtgärd`,
        requiredActions: [`Verifiera eftervårdsutfall med ${doctorName}`, 'Boka nästa åtgärd'],
      };
      event = {
        type: 'aftercare_clinical_escalated',
        label: 'Eftervårdsutfall eskalerat',
        detail: `Utfallet kräver nu klinisk bedömning från ${doctorName}.`,
      };
    } else if (actionKey === 'document_stable_outcome') {
      patch = {
        aftercareStatus: 'complete',
        contactStatus: 'confirmed',
        outcomeStatus: 'stable',
        nextStep: 'Eftervården är avslutad och kunden är stabil',
        requiredActions: [],
      };
      event = {
        type: 'aftercare_outcome_documented',
        label: 'Stabilt eftervårdsutfall dokumenterat',
        detail: 'Kunden är stabil och eftervårdsärendet kan avslutas.',
      };
    } else if (actionKey === 'close_case') {
      patch = {
        aftercareStatus: 'complete',
        nextStep: 'Eftervården är avslutad',
        requiredActions: [],
      };
      event = {
        type: 'aftercare_case_closed',
        label: 'Eftervårdsärendet avslutades',
        detail: 'Eftervårdsärendet stängdes från operator-ytan.',
      };
    } else {
      throw new Error('Eftervårdsåtgärden stöds inte.');
    }

    return upsertCase({
      ...existing,
      ...patch,
      replaceRequiredActions: true,
      events: [
        ...asArray(existing.events),
        {
          ...event,
          actorUserId: normalizeText(input.actorUserId),
          actorName: normalizeText(input.actorName),
        },
      ],
    });
  }

  return {
    applyCaseAction,
    getCase,
    ensureCase,
    listCases,
    upsertCase,
    recordFollowUpSchedule,
  };
}

module.exports = {
  AFTERCARE_STATUSES,
  CONTACT_STATUSES,
  OUTCOME_STATUSES,
  buildAftercareCaseReadout,
  createCcoAftercareStore,
};
