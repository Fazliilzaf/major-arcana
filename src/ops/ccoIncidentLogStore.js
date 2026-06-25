const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

// GDPR personal-data-breach incident log (CCO).
// IMY = Integritetsskyddsmyndigheten (Swedish DPA). Under GDPR art. 33 a
// personal-data breach must be reported to the supervisory authority within
// 72 hours of becoming aware of it. We track that deadline here.
const IMY_DEADLINE_HOURS = 72;

const VALID_STATUSES = ['open', 'investigating', 'contained', 'imy_reported', 'resolved', 'closed'];

const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'];

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
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
  return { version: 1, createdAt: ts, updatedAt: ts, incidents: [] };
}

function normalizeSeverity(value) {
  const sev = normalizeKey(value);
  return VALID_SEVERITIES.includes(sev) ? sev : 'medium';
}

function isoOrNull(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

// The 72h IMY reporting clock starts when the breach was discovered.
function computeImyDeadline(discoveredAtIso) {
  const base = new Date(discoveredAtIso);
  if (Number.isNaN(base.getTime())) return null;
  return new Date(base.getTime() + IMY_DEADLINE_HOURS * 3600 * 1000).toISOString();
}

function normalizeActor(actor = {}) {
  return {
    role: normalizeText(actor?.role) || 'system',
    userId: actor?.userId || null,
  };
}

function shallowClone(incident) {
  return {
    ...incident,
    mitigationActions: (incident.mitigationActions || []).map((a) => ({ ...a })),
    history: (incident.history || []).map((h) => ({ ...h })),
  };
}

function normalizeIncidentRecord(input = {}) {
  const ts = normalizeText(input.createdAt) || nowIso();
  const discoveredAt = isoOrNull(input.discoveredAt) || ts;
  return {
    incidentId: normalizeText(input.incidentId) || crypto.randomUUID(),
    title: normalizeText(input.title),
    description: normalizeText(input.description),
    severity: normalizeSeverity(input.severity),
    status: VALID_STATUSES.includes(normalizeKey(input.status))
      ? normalizeKey(input.status)
      : 'open',
    affectsPersonalData:
      input.affectsPersonalData === undefined ? true : Boolean(input.affectsPersonalData),
    discoveredAt,
    imyDeadline: input.imyDeadline
      ? isoOrNull(input.imyDeadline)
      : computeImyDeadline(discoveredAt),
    imyNotified: Boolean(input.imyNotified) || false,
    imyReferenceNumber: normalizeText(input.imyReferenceNumber) || null,
    imyNotifiedAt: isoOrNull(input.imyNotifiedAt),
    reportedBy: normalizeText(input.reportedBy) || null,
    mitigationActions: Array.isArray(input.mitigationActions)
      ? input.mitigationActions.map((a) => ({
          action: normalizeText(a?.action),
          by: normalizeText(a?.by) || 'system',
          at: isoOrNull(a?.at) || ts,
        }))
      : [],
    history: Array.isArray(input.history) ? input.history.map((h) => ({ ...h })) : [],
    createdAt: ts,
    updatedAt: normalizeText(input.updatedAt) || ts,
  };
}

async function createCcoIncidentLogStore({ filePath, auditLog = null, secureStorage = null } = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoIncidentLogStore.');
  }
  // secureStorage is accepted for parity with sibling stores but blob storage
  // is not required by the incident-log routes; retained for forward use.
  void secureStorage;

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    incidents: Array.isArray(state?.incidents)
      ? state.incidents.map((item) => normalizeIncidentRecord(item))
      : [],
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function findIndex(incidentId) {
    const id = normalizeText(incidentId);
    return state.incidents.findIndex((i) => i.incidentId === id);
  }

  function requireIncident(incidentId) {
    const idx = findIndex(incidentId);
    if (idx === -1) throw badRequest('Incidenten hittades inte.');
    return idx;
  }

  function appendHistory(incident, entry, actor) {
    incident.history.push({
      ...entry,
      role: actor.role,
      userId: actor.userId,
      at: nowIso(),
    });
  }

  function audit(action, actor, incidentId, detail) {
    if (!auditLog) return;
    auditLog.append({
      action,
      actor: { role: actor.role, userId: actor.userId },
      target: { kind: 'cco_incident', id: incidentId },
      detail: detail || {},
    });
  }

  async function createIncident(input = {}) {
    const actor = normalizeActor(input.actor);
    const title = normalizeText(input.title);
    if (!title) throw badRequest('title krävs för incidenten.');

    const record = normalizeIncidentRecord({
      ...input,
      reportedBy: input.reportedBy || actor.userId,
    });
    appendHistory(record, { event: 'created', status: record.status }, actor);
    state.incidents.push(record);
    await save();
    audit('cco.incident.create', actor, record.incidentId, {
      severity: record.severity,
      status: record.status,
    });
    return shallowClone(record);
  }

  async function updateIncident({ incidentId, actor, patch = {} } = {}) {
    const act = normalizeActor(actor);
    const idx = requireIncident(incidentId);
    const incident = state.incidents[idx];

    const editableFields = ['title', 'description', 'reportedBy'];
    const changed = {};
    for (const field of editableFields) {
      if (patch[field] !== undefined) {
        incident[field] = normalizeText(patch[field]) || null;
        changed[field] = incident[field];
      }
    }
    if (patch.severity !== undefined) {
      incident.severity = normalizeSeverity(patch.severity);
      changed.severity = incident.severity;
    }
    if (patch.affectsPersonalData !== undefined) {
      incident.affectsPersonalData = Boolean(patch.affectsPersonalData);
      changed.affectsPersonalData = incident.affectsPersonalData;
    }
    if (patch.discoveredAt !== undefined) {
      const disc = isoOrNull(patch.discoveredAt);
      if (disc) {
        incident.discoveredAt = disc;
        // Recompute the IMY deadline if the discovery time moved.
        if (!incident.imyNotified) incident.imyDeadline = computeImyDeadline(disc);
        changed.discoveredAt = disc;
      }
    }

    incident.updatedAt = nowIso();
    appendHistory(incident, { event: 'updated', changed }, act);
    await save();
    audit('cco.incident.update', act, incident.incidentId, { changed });
    return shallowClone(incident);
  }

  async function transitionStatus({ incidentId, actor, status, reason } = {}) {
    const act = normalizeActor(actor);
    const idx = requireIncident(incidentId);
    const nextStatus = normalizeKey(status);
    if (!VALID_STATUSES.includes(nextStatus)) {
      throw badRequest(`Ogiltig status. Tillåtna: ${VALID_STATUSES.join(', ')}.`);
    }
    const incident = state.incidents[idx];
    const fromStatus = incident.status;
    incident.status = nextStatus;
    incident.updatedAt = nowIso();
    appendHistory(
      incident,
      { event: 'status', from: fromStatus, to: nextStatus, reason: normalizeText(reason) || null },
      act
    );
    await save();
    audit('cco.incident.status', act, incident.incidentId, { from: fromStatus, to: nextStatus });
    return shallowClone(incident);
  }

  async function addMitigationAction({ incidentId, actor, action } = {}) {
    const act = normalizeActor(actor);
    const idx = requireIncident(incidentId);
    const text = normalizeText(action);
    if (!text) throw badRequest('action krävs.');
    const incident = state.incidents[idx];
    const entry = { action: text, by: act.role, at: nowIso() };
    incident.mitigationActions.push(entry);
    incident.updatedAt = nowIso();
    appendHistory(incident, { event: 'mitigation', action: text }, act);
    await save();
    audit('cco.incident.mitigation', act, incident.incidentId, { action: text });
    return shallowClone(incident);
  }

  async function markImyNotified({ incidentId, actor, referenceNumber, sentAt } = {}) {
    const act = normalizeActor(actor);
    const idx = requireIncident(incidentId);
    const incident = state.incidents[idx];
    incident.imyNotified = true;
    incident.imyReferenceNumber = normalizeText(referenceNumber) || null;
    incident.imyNotifiedAt = isoOrNull(sentAt) || nowIso();
    if (
      incident.status === 'open' ||
      incident.status === 'investigating' ||
      incident.status === 'contained'
    ) {
      incident.status = 'imy_reported';
    }
    incident.updatedAt = nowIso();
    appendHistory(
      incident,
      {
        event: 'imy_notified',
        referenceNumber: incident.imyReferenceNumber,
        at: incident.imyNotifiedAt,
      },
      act
    );
    await save();
    audit('cco.incident.imy_notified', act, incident.incidentId, {
      referenceNumber: incident.imyReferenceNumber,
    });
    return shallowClone(incident);
  }

  function listAll() {
    return state.incidents
      .slice()
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((i) => shallowClone(i));
  }

  // Incidents that affect personal data, have not yet been reported to IMY,
  // and whose 72h deadline falls within `withinHours` from now (or is already
  // overdue). Default lookahead = 24h.
  function listImyDeadlineImminent(withinHours = 24) {
    const hours = Number.isFinite(Number(withinHours)) ? Number(withinHours) : 24;
    const cutoff = Date.now() + hours * 3600 * 1000;
    return state.incidents
      .filter((i) => i.affectsPersonalData && !i.imyNotified && i.imyDeadline)
      .filter((i) => i.status !== 'resolved' && i.status !== 'closed')
      .filter((i) => {
        const deadline = new Date(i.imyDeadline).getTime();
        return !Number.isNaN(deadline) && deadline <= cutoff;
      })
      .sort((a, b) => String(a.imyDeadline).localeCompare(String(b.imyDeadline)))
      .map((i) => shallowClone(i));
  }

  function getById(incidentId) {
    const idx = findIndex(incidentId);
    return idx === -1 ? null : shallowClone(state.incidents[idx]);
  }

  function exportReport({ since, until } = {}) {
    const sinceIso = isoOrNull(since);
    const untilIso = isoOrNull(until);
    const incidents = state.incidents
      .filter((i) => (sinceIso ? i.createdAt >= sinceIso : true))
      .filter((i) => (untilIso ? i.createdAt <= untilIso : true))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .map((i) => shallowClone(i));

    const byStatus = {};
    for (const s of VALID_STATUSES) byStatus[s] = 0;
    const bySeverity = {};
    for (const s of VALID_SEVERITIES) bySeverity[s] = 0;
    let imyReportable = 0;
    let imyReported = 0;
    for (const i of incidents) {
      byStatus[i.status] = (byStatus[i.status] || 0) + 1;
      bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1;
      if (i.affectsPersonalData) imyReportable += 1;
      if (i.imyNotified) imyReported += 1;
    }

    return {
      generatedAt: nowIso(),
      range: { since: sinceIso, until: untilIso },
      summary: {
        total: incidents.length,
        byStatus,
        bySeverity,
        imyReportable,
        imyReported,
        imyDeadlineImminent: listImyDeadlineImminent(24).length,
      },
      incidents,
    };
  }

  return {
    createIncident,
    updateIncident,
    transitionStatus,
    addMitigationAction,
    markImyNotified,
    listAll,
    listImyDeadlineImminent,
    getById,
    exportReport,
  };
}

module.exports = {
  createCcoIncidentLogStore,
  VALID_STATUSES,
  VALID_SEVERITIES,
  IMY_DEADLINE_HOURS,
};
