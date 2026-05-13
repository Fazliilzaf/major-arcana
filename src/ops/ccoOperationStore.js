const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const OPERATION_STATUSES = Object.freeze([
  'needs_review',
  'planned',
  'ready',
  'in_progress',
  'complete',
  'cancelled',
]);

const CLEARANCE_STATUSES = Object.freeze(['pending', 'cleared', 'blocked']);
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

function buildOperationOperatorActions({
  phase = 'review',
  clearanceStatus = 'pending',
  scheduledForIso = '',
} = {}) {
  const actions = [];

  if (phase === 'review') {
    actions.push({
      action: 'review_operation_case',
      label: 'Granska ärendet',
      emphasis: 'primary',
    });
  }

  if (phase === 'clearance_blocked' || phase === 'clearance_pending') {
    actions.push({
      action: 'resolve_operation_clearance',
      label: 'Driv klarering',
      emphasis: 'primary',
    });
  }

  if (phase === 'ready_for_operation' || phase === 'operation_today') {
    actions.push({
      action: 'confirm_operation_handoff',
      label: 'Bekräfta handoff',
      emphasis: 'primary',
    });
  }

  if (phase === 'in_progress') {
    actions.push({
      action: 'capture_operation_progress',
      label: 'Logga status',
      emphasis: 'secondary',
    });
  }

  if (phase === 'clinical_follow_up') {
    actions.push({
      action: 'escalate_operation_outcome',
      label: 'Eskalera utfall',
      emphasis: 'primary',
    });
  }

  if (phase === 'closed') {
    actions.push({
      action: 'review_aftercare_handoff',
      label: 'Öppna eftervård',
      emphasis: 'secondary',
    });
  }

  if (clearanceStatus === 'cleared' && scheduledForIso) {
    actions.push({
      action: 'share_operation_time',
      label: 'Dela tid',
      emphasis: 'secondary',
    });
  }

  return actions;
}

function buildOperationCaseReadout(operationCase = {}, { nowMs = Date.now() } = {}) {
  const safeCase = asObject(operationCase);
  const operationStatus = normalizeEnum(
    safeCase.operationStatus,
    OPERATION_STATUSES,
    'needs_review'
  );
  const clearanceStatus = normalizeEnum(safeCase.clearanceStatus, CLEARANCE_STATUSES, 'pending');
  const outcomeStatus = normalizeEnum(safeCase.outcomeStatus, OUTCOME_STATUSES, 'unknown');
  const schedule = toScheduledMeta(safeCase.scheduledForIso, nowMs);
  const doctorName = normalizeText(safeCase.doctorName) || 'Ansvarig kliniker';
  const theatreName = normalizeText(safeCase.theatreName) || 'Operationssal ej satt';
  const existingActions = uniqueActions(safeCase.requiredActions);

  let phase = 'review';
  let blocker = {
    key: 'operation_review',
    action: 'review_operation_case',
    label: 'Granska operationsärendet och välj nästa steg',
    score: 70,
  };
  let nextStep = 'Granska operationsärendet och välj nästa steg';
  let waitingOn = 'operator';

  if (operationStatus === 'cancelled') {
    phase = 'cancelled';
    blocker = {
      key: 'operation_cancelled',
      action: 'operation_cancelled',
      label: 'Operationsärendet är avbrutet',
      score: 10,
    };
    nextStep = 'Bekräfta om ärendet ska öppnas igen eller lämnas stängt';
    waitingOn = 'operator';
  } else if (operationStatus === 'complete') {
    phase = 'closed';
    blocker = {
      key: 'operation_complete',
      action: 'operation_complete',
      label: 'Operationen är genomförd',
      score: 12,
    };
    nextStep =
      outcomeStatus === 'needs_attention'
        ? `Följ upp kliniskt utfall med ${doctorName}`
        : 'Lämna över till eftervård och säkra slutlogg';
    waitingOn = outcomeStatus === 'needs_attention' ? 'clinic' : 'aftercare';
  } else if (outcomeStatus === 'needs_attention') {
    phase = 'clinical_follow_up';
    blocker = {
      key: 'operation_outcome_attention',
      action: 'escalate_operation_outcome',
      label: 'Postoperativt utfall behöver klinisk bedömning',
      score: 94,
    };
    nextStep = `Eskalera postoperativt utfall till ${doctorName}`;
    waitingOn = 'clinic';
  } else if (operationStatus === 'in_progress') {
    phase = 'in_progress';
    blocker = {
      key: 'operation_in_progress',
      action: 'track_operation_progress',
      label: 'Operationen pågår och behöver tät koordinering',
      score: 86,
    };
    nextStep = 'Följ operationen, fånga avvikelser och förbered eftervård';
    waitingOn = 'clinic';
  } else if (clearanceStatus === 'blocked') {
    phase = 'clearance_blocked';
    blocker = {
      key: 'clearance_blocked',
      action: 'resolve_operation_clearance',
      label: 'Blockerande klarering stoppar operationsflödet',
      score: 96,
    };
    nextStep = `Lös blockerande klarering med ${doctorName} före operation`;
    waitingOn = 'clinic';
  } else if (operationStatus === 'needs_review') {
    phase = 'review';
    blocker = {
      key: 'operation_review',
      action: 'review_operation_case',
      label: 'Operationsärendet behöver initial bedömning',
      score: 74,
    };
    nextStep = 'Bekräfta procedur, ansvarig kliniker och planerat nästa steg';
    waitingOn = 'operator';
  } else if (clearanceStatus !== 'cleared') {
    phase = 'clearance_pending';
    blocker = {
      key: 'clearance_pending',
      action: 'resolve_operation_clearance',
      label: 'Operationsklarering väntar på bekräftelse',
      score: 84,
    };
    nextStep = `Driv klarering med ${doctorName} innan operationen låses`;
    waitingOn = 'clinic';
  } else if (schedule.isOverdue || schedule.isDue) {
    phase = 'operation_today';
    blocker = {
      key: 'operation_today',
      action: 'confirm_operation_handoff',
      label: schedule.isOverdue
        ? 'Operationstid är passerad och behöver följas upp nu'
        : 'Operationen ska över i genomförande nu',
      score: schedule.isOverdue ? 91 : 88,
    };
    nextStep = `Bekräfta handoff till ${theatreName} och säkra att teamet är redo`;
    waitingOn = 'clinic';
  } else if (operationStatus === 'planned' || operationStatus === 'ready') {
    phase = 'ready_for_operation';
    blocker = {
      key: 'ready_for_operation',
      action: 'confirm_operation_handoff',
      label: 'Operationen är planerad och behöver lugn handoff',
      score: 66,
    };
    nextStep = `Bekräfta operationsupplägg, tid och ansvarig handoff till ${theatreName}`;
    waitingOn = 'operator';
  }

  const requiredActions =
    existingActions.length > 0 ? existingActions : uniqueActions([nextStep, safeCase.nextStep]);

  const queueBucket =
    phase === 'clearance_blocked' || phase === 'clinical_follow_up'
      ? 'critical'
      : phase === 'operation_today'
        ? schedule.isOverdue
          ? 'due'
          : 'today'
        : phase === 'clearance_pending' || phase === 'review' || phase === 'in_progress'
          ? 'active'
          : phase === 'ready_for_operation'
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
    status: operationStatus,
    phase,
    blocker,
    procedureType: normalizeText(safeCase.procedureType) || 'Operation',
    clearanceStatus,
    outcomeStatus,
    doctorName,
    theatreName,
    scheduledForIso: schedule.iso,
    isDue: schedule.isDue,
    isOverdue: schedule.isOverdue,
    nextStep,
    requiredActions,
    queueBucket,
    operatorActions: buildOperationOperatorActions({
      phase,
      clearanceStatus,
      scheduledForIso: schedule.iso,
    }),
    waitingOn,
    handoffCopy:
      phase === 'ready_for_operation' || phase === 'operation_today'
        ? `Lås klinisk handoff med ${doctorName}, bekräfta ${theatreName}, och se till att eftervården är förberedd innan ingreppet.`
        : phase === 'clearance_blocked'
          ? `Klarering saknas. Håll tillbaka operationsspåret tills ${doctorName} har bekräftat nästa säkra steg.`
          : phase === 'closed'
            ? 'Operationen är klar. För över tydlig slutstatus och lämna vidare till eftervården.'
            : 'Operationen behöver ett tydligt nästa steg och ett namngivet ansvar.',
    notes:
      normalizeText(safeCase.notes) ||
      (requiredActions[0]
        ? `${requiredActions[0]}.`
        : 'Operationsspåret behöver tydlig koordination före nästa steg.'),
    attention: {
      what: nextStep,
      where:
        waitingOn === 'clinic' ? doctorName : waitingOn === 'aftercare' ? 'Eftervård' : 'Operation',
      when: schedule.iso || normalizeText(safeCase.updatedAt) || 'Så snart som möjligt',
      confidence:
        phase === 'clearance_blocked' || phase === 'clinical_follow_up'
          ? 'Hög - blockerande klinisk signal'
          : phase === 'operation_today'
            ? 'Hög - aktivt operationsfönster'
            : 'Medel - operatören behöver driva nästa steg',
    },
  };
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    operationCases: [],
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

function normalizeOperationCase(input = {}, existing = {}) {
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
    operationCaseId:
      normalizeText(previous.operationCaseId || safe.operationCaseId) || crypto.randomUUID(),
    tenantId,
    workspaceId,
    conversationId,
    customerId,
    customerName: normalizeText(safe.customerName || previous.customerName),
    procedureType: normalizeText(safe.procedureType || previous.procedureType),
    operationStatus: normalizeEnum(
      safe.operationStatus || previous.operationStatus,
      OPERATION_STATUSES,
      'needs_review'
    ),
    clearanceStatus: normalizeEnum(
      safe.clearanceStatus || previous.clearanceStatus,
      CLEARANCE_STATUSES,
      'pending'
    ),
    outcomeStatus: normalizeEnum(
      safe.outcomeStatus || previous.outcomeStatus,
      OUTCOME_STATUSES,
      'unknown'
    ),
    scheduledForIso: normalizeText(safe.scheduledForIso || previous.scheduledForIso),
    doctorName: normalizeText(safe.doctorName || previous.doctorName) || 'Dr. Eriksson',
    theatreName: normalizeText(safe.theatreName || previous.theatreName),
    notes: normalizeText(safe.notes || previous.notes),
    nextStep: normalizeText(safe.nextStep || previous.nextStep),
    linkedConsultationCaseId: normalizeText(
      safe.linkedConsultationCaseId || previous.linkedConsultationCaseId
    ),
    requiredActions,
    events: asArray(safe.events).length
      ? asArray(safe.events).map((event) => {
          const safeEvent = asObject(event);
          return {
            eventId: normalizeText(safeEvent.eventId) || crypto.randomUUID(),
            type: normalizeText(safeEvent.type) || 'operation_updated',
            label: normalizeText(safeEvent.label) || 'Operationsärende uppdaterat',
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

async function createCcoOperationStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoOperationStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    operationCases: asArray(state?.operationCases)
      .map((item) => normalizeOperationCase(item))
      .filter(Boolean),
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function getCase(input = {}) {
    const key = caseKey(input);
    if (!key || key.split('::').some((part) => !part)) return null;
    return cloneCase(state.operationCases.find((item) => caseKey(item) === key));
  }

  async function ensureCase(input = {}) {
    const existing = await getCase(input);
    if (existing) return existing;
    return upsertCase(input);
  }

  async function upsertCase(input = {}) {
    const key = caseKey(input);
    if (!key || key.split('::').some((part) => !part)) {
      throw new Error('Operationsärendet saknar tenant, tråd eller kund.');
    }
    const index = state.operationCases.findIndex((item) => caseKey(item) === key);
    const existing = index >= 0 ? state.operationCases[index] : {};
    const normalized = normalizeOperationCase(input, existing);
    if (!normalized) {
      throw new Error('Operationsärendet saknar tenant, tråd eller kund.');
    }
    if (index >= 0) {
      state.operationCases[index] = normalized;
    } else {
      state.operationCases.push(normalized);
    }
    await save();
    return cloneCase(state.operationCases[index >= 0 ? index : state.operationCases.length - 1]);
  }

  return {
    getCase,
    ensureCase,
    upsertCase,
  };
}

module.exports = {
  OPERATION_STATUSES,
  CLEARANCE_STATUSES,
  OUTCOME_STATUSES,
  buildOperationCaseReadout,
  createCcoOperationStore,
};
