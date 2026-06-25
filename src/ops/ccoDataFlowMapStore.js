const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  const single = normalizeText(value);
  return single ? [single] : [];
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
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    systems: [],
    flows: [],
  };
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function normalizeSystemRecord(input = {}) {
  const id = normalizeKey(input.id);
  if (!id) return null;
  const createdAt = normalizeText(input.createdAt) || nowIso();
  const updatedAt = normalizeText(input.updatedAt) || createdAt;
  return {
    id,
    name: normalizeText(input.name) || id,
    description: normalizeText(input.description),
    // controller | processor | sub-processor — the Art. 30 role of this system.
    role: normalizeText(input.role) || 'processor',
    // Categories of personal data processed by the system.
    dataCategories: normalizeStringList(input.dataCategories),
    // Categories of data subjects.
    dataSubjects: normalizeStringList(input.dataSubjects),
    // Article 6 / 9 legal basis for the processing.
    legalBasis: normalizeText(input.legalBasis),
    // Where the data physically lives (used for cross-border review).
    location: normalizeText(input.location),
    owner: normalizeText(input.owner),
    retention: normalizeText(input.retention),
    createdAt,
    updatedAt,
  };
}

function normalizeFlowRecord(input = {}) {
  const fromSystem = normalizeKey(input.fromSystem ?? input.from ?? input.source);
  const toSystem = normalizeKey(input.toSystem ?? input.to ?? input.destination);
  if (!fromSystem || !toSystem) return null;
  const createdAt = normalizeText(input.createdAt) || nowIso();
  const reviewedAt = normalizeText(input.reviewedAt);
  return {
    id: normalizeText(input.id) || crypto.randomUUID(),
    fromSystem,
    toSystem,
    description: normalizeText(input.description),
    dataCategories: normalizeStringList(input.dataCategories),
    // Mechanism that legitimises the transfer (e.g. SCC, adequacy decision).
    transferMechanism: normalizeText(input.transferMechanism),
    // Whether this flow crosses outside the EU/EEA.
    crossBorder: Boolean(input.crossBorder),
    reviewed: reviewedAt ? true : Boolean(input.reviewed),
    reviewedAt: reviewedAt || null,
    reviewedBy: normalizeText(input.reviewedBy) || null,
    reviewNote: normalizeText(input.reviewNote),
    createdBy: normalizeText(input.createdBy) || null,
    createdAt,
  };
}

async function createCcoDataFlowMapStore({ filePath, auditLog = null } = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoDataFlowMapStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    systems: Array.isArray(state?.systems)
      ? state.systems.map((item) => normalizeSystemRecord(item)).filter(Boolean)
      : [],
    flows: Array.isArray(state?.flows)
      ? state.flows.map((item) => normalizeFlowRecord(item)).filter(Boolean)
      : [],
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function findSystemIndex(id) {
    const key = normalizeKey(id);
    return state.systems.findIndex((s) => s.id === key);
  }

  function findFlowIndex(id) {
    const key = normalizeText(id);
    return state.flows.findIndex((f) => f.id === key);
  }

  function listSystems() {
    return state.systems
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((s) => ({ ...s }));
  }

  function listFlows() {
    return state.flows
      .slice()
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((f) => ({ ...f }));
  }

  // Flows that still require a DPO/legal sign-off: not yet reviewed.
  function listNeedsLegalReview() {
    return state.flows
      .filter((f) => !f.reviewed)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .map((f) => ({ ...f }));
  }

  function exportArt30Register() {
    const generatedAt = nowIso();
    const systems = listSystems();
    const flows = listFlows();
    return {
      generatedAt,
      version: state.version,
      summary: {
        systemCount: systems.length,
        flowCount: flows.length,
        crossBorderFlowCount: flows.filter((f) => f.crossBorder).length,
        needsLegalReviewCount: flows.filter((f) => !f.reviewed).length,
      },
      systems: systems.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        role: s.role,
        dataCategories: s.dataCategories,
        dataSubjects: s.dataSubjects,
        legalBasis: s.legalBasis,
        location: s.location,
        owner: s.owner,
        retention: s.retention,
      })),
      flows: flows.map((f) => ({
        id: f.id,
        fromSystem: f.fromSystem,
        toSystem: f.toSystem,
        description: f.description,
        dataCategories: f.dataCategories,
        transferMechanism: f.transferMechanism,
        crossBorder: f.crossBorder,
        reviewed: f.reviewed,
        reviewedAt: f.reviewedAt,
        reviewedBy: f.reviewedBy,
      })),
    };
  }

  async function upsertSystem(id, input = {}, actor = {}) {
    const record = normalizeSystemRecord({ ...input, id });
    if (!record) {
      throw badRequest('Systemet saknar obligatoriskt id.');
    }
    const ts = nowIso();
    const idx = findSystemIndex(record.id);
    let saved;
    if (idx === -1) {
      record.createdAt = ts;
      record.updatedAt = ts;
      state.systems.push(record);
      saved = record;
    } else {
      const existing = state.systems[idx];
      saved = {
        ...record,
        createdAt: existing.createdAt,
        updatedAt: ts,
      };
      state.systems[idx] = saved;
    }
    await save();

    if (auditLog) {
      auditLog.append({
        action: 'cco.dataflow.system.upsert',
        actor: { role: normalizeText(actor?.role) || 'system', userId: actor?.userId || null },
        target: { kind: 'dataflow_system', id: saved.id },
        detail: { created: idx === -1, role: saved.role },
      });
    }

    return { ...saved };
  }

  async function addFlow(input = {}) {
    const actor = input?.actor || {};
    const record = normalizeFlowRecord({
      ...input,
      createdBy: input?.createdBy ?? actor?.userId,
    });
    if (!record) {
      throw badRequest('Flödet kräver fromSystem och toSystem.');
    }
    record.createdAt = nowIso();
    record.reviewed = false;
    record.reviewedAt = null;
    record.reviewedBy = null;
    state.flows.push(record);
    await save();

    if (auditLog) {
      auditLog.append({
        action: 'cco.dataflow.flow.add',
        actor: { role: normalizeText(actor?.role) || 'system', userId: actor?.userId || null },
        target: { kind: 'dataflow_flow', id: record.id },
        detail: {
          fromSystem: record.fromSystem,
          toSystem: record.toSystem,
          crossBorder: record.crossBorder,
        },
      });
    }

    return { ...record };
  }

  async function markReviewed(input = {}) {
    const actor = input?.actor || {};
    const flowId = normalizeText(input?.flowId ?? input?.id);
    if (!flowId) {
      throw badRequest('flowId krävs för att markera ett flöde som granskat.');
    }
    const idx = findFlowIndex(flowId);
    if (idx === -1) {
      throw badRequest(`Flödet ${flowId} hittades inte.`);
    }
    const ts = nowIso();
    const record = state.flows[idx];
    record.reviewed = true;
    record.reviewedAt = ts;
    record.reviewedBy = normalizeText(actor?.userId) || normalizeText(actor?.role) || 'system';
    record.reviewNote = normalizeText(input?.reviewNote ?? input?.note);
    await save();

    if (auditLog) {
      auditLog.append({
        action: 'cco.dataflow.flow.reviewed',
        actor: { role: normalizeText(actor?.role) || 'system', userId: actor?.userId || null },
        target: { kind: 'dataflow_flow', id: record.id },
        detail: { reviewedAt: ts },
      });
    }

    return { ...record };
  }

  return {
    listSystems,
    listFlows,
    listNeedsLegalReview,
    exportArt30Register,
    upsertSystem,
    addFlow,
    markReviewed,
  };
}

module.exports = { createCcoDataFlowMapStore };
