const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

// Tillåtna tillstånd för en booking-case och vilka övergångar som är giltiga.
const VALID_STATES = [
  'new',
  'qualifying',
  'proposed',
  'confirmed',
  'scheduled',
  'in_progress',
  'handoff',
  'completed',
  'cancelled',
];

const TRANSITIONS = {
  new: ['qualifying', 'proposed', 'cancelled'],
  qualifying: ['proposed', 'cancelled'],
  proposed: ['confirmed', 'qualifying', 'cancelled'],
  confirmed: ['scheduled', 'in_progress', 'handoff', 'cancelled'],
  scheduled: ['in_progress', 'handoff', 'cancelled'],
  in_progress: ['handoff', 'completed', 'cancelled'],
  handoff: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
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
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function emptyState() {
  const ts = nowIso();
  return { version: 1, createdAt: ts, updatedAt: ts, cases: [] };
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function notFound(message) {
  const err = new Error(message);
  err.statusCode = 404;
  return err;
}

function conflict(message) {
  const err = new Error(message);
  err.statusCode = 409;
  return err;
}

function emptyHandoffChecklist() {
  return {
    journalReady: false,
    consentSigned: false,
    paymentSettled: false,
    encounterLinked: false,
  };
}

function normalizeOrdinationReview(input = null) {
  if (!input || typeof input !== 'object') return null;
  const status = normalizeKey(input.status);
  return {
    status: ['approved', 'rejected', 'pending'].includes(status) ? status : 'pending',
    decidedAt: normalizeText(input.decidedAt) || null,
    decidedBy: normalizeText(input.decidedBy) || null,
    decidedByRole: normalizeText(input.decidedByRole) || null,
    signature: normalizeText(input.signature) || '',
    comment: normalizeText(input.comment) || '',
  };
}

function normalizeStaffActions(input = null) {
  if (!input || typeof input !== 'object') {
    return {
      seenAt: null,
      seenBy: null,
      sentToDoctorAt: null,
      sentToDoctorBy: null,
      lastActionAt: null,
      lastActionBy: null,
      lastAction: null,
    };
  }
  return {
    seenAt: normalizeText(input.seenAt) || null,
    seenBy: normalizeText(input.seenBy) || null,
    sentToDoctorAt: normalizeText(input.sentToDoctorAt) || null,
    sentToDoctorBy: normalizeText(input.sentToDoctorBy) || null,
    lastActionAt: normalizeText(input.lastActionAt) || null,
    lastActionBy: normalizeText(input.lastActionBy) || null,
    lastAction: normalizeText(input.lastAction) || null,
  };
}

function normalizeCaseRecord(input = {}) {
  const ts = normalizeText(input.createdAt) || nowIso();
  const state = VALID_STATES.includes(normalizeKey(input.state))
    ? normalizeKey(input.state)
    : 'new';
  return {
    id: normalizeText(input.id) || crypto.randomUUID(),
    tenantId: normalizeText(input.tenantId) || 'hairtp-clinic',
    state,
    patientId: normalizeText(input.patientId) || null,
    customerId: normalizeText(input.customerId) || null,
    customerName: normalizeText(input.customerName) || null,
    customerEmail: normalizeText(input.customerEmail) || null,
    conversationId: normalizeText(input.conversationId) || null,
    bookingId: normalizeText(input.bookingId) || null,
    serviceId: normalizeText(input.serviceId) || null,
    serviceLabel: normalizeText(input.serviceLabel) || null,
    resourceId: normalizeText(input.resourceId) || null,
    resourceLabel: normalizeText(input.resourceLabel) || null,
    encounterType: normalizeText(input.encounterType) || null,
    startsAt: normalizeText(input.startsAt) || null,
    endsAt: normalizeText(input.endsAt) || null,
    scheduledAt: normalizeText(input.scheduledAt) || null,
    assignedTo: normalizeText(input.assignedTo) || null,
    notes: normalizeText(input.notes) || '',
    candidates: Array.isArray(input.candidates) ? input.candidates : [],
    handoffChecklist: {
      ...emptyHandoffChecklist(),
      ...(input.handoffChecklist && typeof input.handoffChecklist === 'object'
        ? input.handoffChecklist
        : {}),
    },
    ordinationReview: normalizeOrdinationReview(input.ordinationReview),
    staffActions: normalizeStaffActions(input.staffActions),
    handoffCompletedAt: normalizeText(input.handoffCompletedAt) || null,
    history: Array.isArray(input.history) ? input.history : [],
    createdAt: ts,
    updatedAt: normalizeText(input.updatedAt) || ts,
  };
}

async function createCcoBookingCaseStore({ filePath, auditLog = null } = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoBookingCaseStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    cases: Array.isArray(state?.cases) ? state.cases.map((item) => normalizeCaseRecord(item)) : [],
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function findIndexById(id) {
    const wanted = normalizeText(id);
    return state.cases.findIndex((c) => c.id === wanted);
  }

  function audit(action, actor, id, detail) {
    if (!auditLog) return;
    auditLog.append({
      action,
      actor: { role: actor?.role || null, userId: actor?.userId || null },
      target: { kind: 'booking_case', id },
      detail: detail || {},
    });
  }

  async function listCases({
    tenantId,
    state: wantState = null,
    assignedTo = null,
    limit = 200,
  } = {}) {
    const tenant = normalizeText(tenantId);
    const filterState = wantState ? normalizeKey(wantState) : null;
    const filterAssigned = assignedTo ? normalizeText(assignedTo) : null;
    const max = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 200;
    return state.cases
      .filter((c) => (tenant ? c.tenantId === tenant : true))
      .filter((c) => (filterState ? c.state === filterState : true))
      .filter((c) => (filterAssigned ? c.assignedTo === filterAssigned : true))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, max)
      .map((c) => ({ ...c }));
  }

  async function listCasesForCustomer({
    tenantId,
    customerId = null,
    patientId = null,
    limit = 50,
  } = {}) {
    const wantedCustomer = normalizeText(customerId);
    const wantedPatient = normalizeText(patientId);
    if (!wantedCustomer && !wantedPatient) return [];
    const max = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 50;
    const list = await listCases({ tenantId, limit: Math.max(max * 4, 200) });
    return list
      .filter((c) => {
        const caseCustomer = normalizeText(c.customerId);
        const casePatient = normalizeText(c.patientId);
        return (
          (wantedCustomer && (caseCustomer === wantedCustomer || casePatient === wantedCustomer)) ||
          (wantedPatient && (casePatient === wantedPatient || caseCustomer === wantedPatient))
        );
      })
      .slice(0, max);
  }

  function stats() {
    const byState = {};
    for (const s of VALID_STATES) byState[s] = 0;
    for (const c of state.cases) {
      byState[c.state] = (byState[c.state] || 0) + 1;
    }
    return { total: state.cases.length, byState };
  }

  async function getCase(id) {
    const idx = findIndexById(id);
    if (idx === -1) return null;
    return { ...state.cases[idx] };
  }

  async function createCase(input = {}, actor = {}) {
    const record = normalizeCaseRecord(input);
    record.history = [
      {
        at: record.createdAt,
        action: 'created',
        toState: record.state,
        role: normalizeText(actor?.role) || 'system',
      },
    ];
    state.cases.push(record);
    await save();
    audit('cco.booking_case.created', actor, record.id, { state: record.state });
    return { ...record };
  }

  async function proposeCandidate(id, input = {}, actor = {}) {
    const idx = findIndexById(id);
    if (idx === -1) throw notFound('booking_case_not_found');
    const record = state.cases[idx];
    const candidate = {
      candidateId: normalizeText(input.candidateId) || crypto.randomUUID(),
      startsAt: normalizeText(input.startsAt) || null,
      endsAt: normalizeText(input.endsAt) || null,
      resourceId: normalizeText(input.resourceId) || null,
      resourceLabel: normalizeText(input.resourceLabel) || null,
      serviceId: normalizeText(input.serviceId) || record.serviceId || null,
      note: normalizeText(input.note) || '',
      proposedBy: normalizeText(actor?.role) || 'system',
      proposedAt: nowIso(),
    };
    record.candidates = [...(record.candidates || []), candidate];
    record.updatedAt = nowIso();
    record.history.push({
      at: candidate.proposedAt,
      action: 'candidate_proposed',
      candidateId: candidate.candidateId,
      role: candidate.proposedBy,
    });
    await save();
    audit('cco.booking_case.candidate_proposed', actor, record.id, {
      candidateId: candidate.candidateId,
    });
    return { ...record };
  }

  async function transitionState(id, toState, actor = {}, payload = {}) {
    const idx = findIndexById(id);
    if (idx === -1) throw notFound('booking_case_not_found');
    const next = normalizeKey(toState);
    if (!VALID_STATES.includes(next)) {
      throw badRequest(`Ogiltigt tillstånd. Tillåtna: ${VALID_STATES.join(', ')}.`);
    }
    const record = state.cases[idx];
    const allowed = TRANSITIONS[record.state] || [];
    if (record.state !== next && !allowed.includes(next)) {
      throw conflict(`Otillåten övergång: ${record.state} → ${next}.`);
    }

    const ts = nowIso();
    const fromState = record.state;
    record.state = next;
    record.updatedAt = ts;

    // Tillåt att payload uppdaterar utvalda fält som downstream-bryggor läser.
    const mutableFields = [
      'patientId',
      'startsAt',
      'endsAt',
      'scheduledAt',
      'resourceId',
      'resourceLabel',
      'serviceId',
      'serviceLabel',
      'encounterType',
      'assignedTo',
      'customerEmail',
      'customerName',
      'conversationId',
      'bookingId',
    ];
    for (const field of mutableFields) {
      if (payload && payload[field] != null) {
        record[field] = normalizeText(payload[field]) || record[field];
      }
    }

    record.history.push({
      at: ts,
      action: 'transition',
      fromState,
      toState: next,
      role: normalizeText(actor?.role) || 'system',
    });
    await save();
    audit('cco.booking_case.transition', actor, record.id, { fromState, toState: next });
    return { ...record };
  }

  async function updateHandoffChecklist(id, input = {}, actor = {}) {
    const idx = findIndexById(id);
    if (idx === -1) throw notFound('booking_case_not_found');
    const record = state.cases[idx];
    const next = { ...record.handoffChecklist };
    for (const key of Object.keys(emptyHandoffChecklist())) {
      if (input && typeof input[key] === 'boolean') {
        next[key] = input[key];
      }
    }
    record.handoffChecklist = next;
    record.updatedAt = nowIso();
    record.history.push({
      at: record.updatedAt,
      action: 'handoff_checklist_updated',
      role: normalizeText(actor?.role) || 'system',
    });
    await save();
    audit('cco.booking_case.handoff_updated', actor, record.id, { handoffChecklist: next });
    return { ...record };
  }

  async function updateOrdinationReview(id, input = {}, actor = {}) {
    const idx = findIndexById(id);
    if (idx === -1) throw notFound('booking_case_not_found');
    const status = normalizeKey(input.status);
    if (!['approved', 'rejected'].includes(status)) {
      throw badRequest('Ogiltigt ordinationsbeslut. Tillåtna: approved, rejected.');
    }

    const record = state.cases[idx];
    const ts = nowIso();
    const next = normalizeOrdinationReview({
      status,
      decidedAt: ts,
      decidedBy: actor?.userId || input.decidedBy || 'unknown',
      decidedByRole: actor?.role || input.decidedByRole || 'system',
      signature: input.signature || '',
      comment: input.comment || '',
    });

    record.ordinationReview = next;
    record.updatedAt = ts;
    record.history.push({
      at: ts,
      action: status === 'approved' ? 'ordination_approved' : 'ordination_rejected',
      role: normalizeText(actor?.role) || 'system',
      userId: normalizeText(actor?.userId) || null,
    });
    await save();
    audit(
      status === 'approved'
        ? 'cco.booking_case.ordination_approved'
        : 'cco.booking_case.ordination_rejected',
      actor,
      record.id,
      { status, comment: next.comment }
    );
    return { ...record };
  }

  async function recordStaffAction(id, input = {}, actor = {}) {
    const idx = findIndexById(id);
    if (idx === -1) throw notFound('booking_case_not_found');
    const action = normalizeKey(input.action);
    const allowed = ['mark_seen', 'send_to_doctor', 'complete_checklist'];
    if (!allowed.includes(action)) {
      throw badRequest(`Ogiltig personalåtgärd. Tillåtna: ${allowed.join(', ')}.`);
    }

    const record = state.cases[idx];
    const ts = nowIso();
    const actorUserId = normalizeText(actor?.userId) || 'unknown';
    const detail = {};
    record.staffActions = normalizeStaffActions(record.staffActions);

    if (action === 'mark_seen') {
      record.staffActions.seenAt = ts;
      record.staffActions.seenBy = actorUserId;
    }

    if (action === 'send_to_doctor') {
      record.staffActions.sentToDoctorAt = ts;
      record.staffActions.sentToDoctorBy = actorUserId;
      if (!record.ordinationReview) {
        record.ordinationReview = normalizeOrdinationReview({ status: 'pending' });
      }
    }

    if (action === 'complete_checklist') {
      const itemKey = normalizeText(input.itemKey);
      const allowedKeys = Object.keys(emptyHandoffChecklist());
      if (!allowedKeys.includes(itemKey)) {
        throw badRequest(`Ogiltig checkpunkt. Tillåtna: ${allowedKeys.join(', ')}.`);
      }
      record.handoffChecklist = {
        ...emptyHandoffChecklist(),
        ...(record.handoffChecklist && typeof record.handoffChecklist === 'object'
          ? record.handoffChecklist
          : {}),
        [itemKey]: true,
      };
      detail.itemKey = itemKey;
    }

    record.staffActions.lastActionAt = ts;
    record.staffActions.lastActionBy = actorUserId;
    record.staffActions.lastAction = action;
    record.updatedAt = ts;
    record.history.push({
      at: ts,
      action: `staff_${action}`,
      role: normalizeText(actor?.role) || 'system',
      userId: actorUserId,
      ...(detail.itemKey ? { itemKey: detail.itemKey } : {}),
    });
    await save();
    audit(`cco.booking_case.staff_${action}`, actor, record.id, detail);
    return { ...record };
  }

  async function attemptHandoffComplete(id, actor = {}) {
    const idx = findIndexById(id);
    if (idx === -1) throw notFound('booking_case_not_found');
    const record = state.cases[idx];
    const checklist = record.handoffChecklist || emptyHandoffChecklist();
    const pending = Object.entries(checklist)
      .filter(([, done]) => !done)
      .map(([key]) => key);
    if (pending.length > 0) {
      throw conflict(`Handoff ej klar. Saknas: ${pending.join(', ')}.`);
    }

    const ts = nowIso();
    record.state = 'completed';
    record.handoffCompletedAt = ts;
    record.updatedAt = ts;
    record.history.push({
      at: ts,
      action: 'handoff_completed',
      role: normalizeText(actor?.role) || 'system',
    });
    await save();
    audit('cco.booking_case.handoff_completed', actor, record.id, {});
    return { ...record };
  }

  return {
    listCases,
    listCasesForCustomer,
    stats,
    getCase,
    createCase,
    proposeCandidate,
    transitionState,
    updateHandoffChecklist,
    updateOrdinationReview,
    recordStaffAction,
    attemptHandoffComplete,
  };
}

module.exports = { createCcoBookingCaseStore, VALID_STATES, TRANSITIONS };
