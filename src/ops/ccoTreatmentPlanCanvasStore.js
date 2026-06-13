'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const SCHEMA_VERSION = '1.0.0';

const VALID_STATUSES = new Set([
  'draft',
  'ready_for_review',
  'approved',
  'sent_to_offer',
  'converted_to_offer',
  'archived',
]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function emptyState() {
  const ts = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: ts,
    updatedAt: ts,
    plans: {},
    audit: [],
  };
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

function normalizeImageRef(value) {
  const v = safeObject(value);
  const id = normalizeText(v.id || v.assetId || v.sourceAssetId || v.annotationId);
  if (!id) return null;
  return {
    id,
    assetId: normalizeText(v.assetId || v.sourceAssetId) || null,
    annotationId: normalizeText(v.annotationId) || null,
    url: normalizeText(v.url || v.imageUrl || v.previewUrl) || null,
    thumbnailUrl: normalizeText(v.thumbnailUrl) || null,
    date: normalizeText(v.date || v.documentDate || v.captureDate) || null,
    zone: normalizeText(v.zone) || null,
    label: normalizeText(v.label || v.imageName) || null,
    selectedFor: asArray(v.selectedFor).map(normalizeText).filter(Boolean).slice(0, 12),
  };
}

function normalizePlan(input = {}, existing = {}) {
  const safe = safeObject(input);
  const ex = safeObject(existing);
  const id = normalizeText(safe.id || safe.planId || ex.id) || crypto.randomUUID();
  const customerId = normalizeText(safe.customerId || safe.patientId || ex.customerId);
  const patientId = normalizeText(safe.patientId || safe.customerId || ex.patientId || customerId);
  if (!customerId && !patientId) {
    const err = new Error('customerId eller patientId krävs.');
    err.statusCode = 400;
    throw err;
  }
  const status = normalizeText(safe.status || ex.status) || 'draft';
  if (!VALID_STATUSES.has(status)) {
    const err = new Error(`ogiltig status "${status}"`);
    err.statusCode = 400;
    throw err;
  }
  const selectedImages = asArray(safe.selectedImages || safe.images || ex.selectedImages)
    .map(normalizeImageRef)
    .filter(Boolean)
    .slice(0, 80);

  return {
    id,
    planId: id,
    customerId: customerId || patientId,
    patientId: patientId || customerId,
    encounterId: normalizeText(safe.encounterId || ex.encounterId) || null,
    title: normalizeText(safe.title || ex.title) || 'Behandlingsplan',
    technique: normalizeText(safe.technique || ex.technique) || null,
    totalGraftEstimate: Number.isFinite(Number(safe.totalGraftEstimate))
      ? Math.max(0, Math.round(Number(safe.totalGraftEstimate)))
      : Number.isFinite(Number(ex.totalGraftEstimate))
        ? Math.max(0, Math.round(Number(ex.totalGraftEstimate)))
        : null,
    areaSpecs: asArray(safe.areaSpecs || ex.areaSpecs)
      .map(safeObject)
      .slice(0, 20),
    selectedImages,
    annotationId: normalizeText(safe.annotationId || ex.annotationId) || null,
    assetId: normalizeText(safe.assetId || ex.assetId) || null,
    offerIntent: safeObject(safe.offerIntent || ex.offerIntent),
    providerComment: normalizeText(safe.providerComment || ex.providerComment) || '',
    customerComment: normalizeText(safe.customerComment || ex.customerComment) || '',
    offerId: normalizeText(safe.offerId || ex.offerId) || null,
    offerCreatedAt: normalizeText(safe.offerCreatedAt || ex.offerCreatedAt) || null,
    status,
    statusReason: normalizeText(safe.statusReason || ex.statusReason) || null,
    revisions: asArray(ex.revisions).slice(-49),
    createdBy: normalizeText(ex.createdBy || safe.createdBy || safe.actor?.userId) || null,
    createdAt: normalizeText(ex.createdAt) || nowIso(),
    updatedBy: normalizeText(safe.actor?.userId || safe.updatedBy || ex.updatedBy) || null,
    updatedAt: nowIso(),
  };
}

function audit(state, kind, item, actor, extra = {}) {
  state.audit = asArray(state.audit)
    .slice(-199)
    .concat({
      ts: nowIso(),
      kind,
      planId: item?.id || null,
      customerId: item?.customerId || null,
      patientId: item?.patientId || null,
      actor: normalizeText(actor?.userId) || 'system',
      role: normalizeText(actor?.role) || null,
      ...extra,
    });
}

async function createCcoTreatmentPlanCanvasStore({
  filePath,
  auditLog = null,
  timelineStore = null,
} = {}) {
  if (!filePath) throw new Error('filePath krävs för ccoTreatmentPlanCanvasStore.');
  const state = await readJson(filePath, emptyState());
  state.plans = safeObject(state.plans);
  state.audit = asArray(state.audit);

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function all() {
    return Object.values(state.plans).sort((a, b) =>
      String(b.updatedAt || b.createdAt || '').localeCompare(
        String(a.updatedAt || a.createdAt || '')
      )
    );
  }

  function getByCustomer(customerId) {
    const key = normalizeText(customerId);
    if (!key) return [];
    return all().filter((item) => item.customerId === key || item.patientId === key);
  }

  function getById(id) {
    const key = normalizeText(id);
    return key && state.plans[key] ? { ...state.plans[key] } : null;
  }

  function listPlans(filters = {}) {
    const f = safeObject(filters);
    return all().filter((item) => {
      if (f.customerId && item.customerId !== f.customerId && item.patientId !== f.customerId)
        return false;
      if (f.patientId && item.patientId !== f.patientId && item.customerId !== f.patientId)
        return false;
      if (f.status && item.status !== f.status) return false;
      return true;
    });
  }

  async function createPlan(input = {}) {
    const actor = safeObject(input.actor);
    const item = normalizePlan(input);
    state.plans[item.id] = item;
    audit(state, 'plan.created', item, actor);
    await save();
    try {
      auditLog?.append?.({
        kind: 'cco.treatment_plan.created',
        ts: nowIso(),
        detail: {
          planId: item.id,
          customerId: item.customerId,
          patientId: item.patientId,
          selectedImages: item.selectedImages.length,
          actor: actor.userId || null,
        },
      });
      timelineStore?.appendEvent?.({
        kind: 'treatment_plan_created',
        patientId: item.patientId,
        customerId: item.customerId,
        ts: nowIso(),
        label: item.title,
      });
    } catch {}
    return { ...item };
  }

  async function updatePlan(input = {}) {
    const planId = normalizeText(input.planId || input.id);
    const existing = planId ? state.plans[planId] : null;
    if (!existing) {
      const err = new Error('plan saknas.');
      err.statusCode = 404;
      throw err;
    }
    const patch = safeObject(input.patch && Object.keys(input.patch).length ? input.patch : input);
    const actor = safeObject(input.actor || patch.actor);
    const revision = {
      ts: nowIso(),
      actor: actor.userId || null,
      fields: Object.keys(patch)
        .filter((k) => k !== 'actor')
        .slice(0, 30),
      snapshot: {
        status: existing.status,
        selectedImages: asArray(existing.selectedImages).length,
        annotationId: existing.annotationId || null,
        assetId: existing.assetId || null,
      },
    };
    const item = normalizePlan(
      { ...existing, ...patch, id: existing.id, actor },
      { ...existing, revisions: asArray(existing.revisions).concat(revision) }
    );
    state.plans[item.id] = item;
    audit(state, 'plan.updated', item, actor, { fields: revision.fields });
    await save();
    return { ...item };
  }

  async function setStatus({ planId, status, reason = null, actor = {} } = {}) {
    const existing = getById(planId);
    if (!existing) {
      const err = new Error('plan saknas.');
      err.statusCode = 404;
      throw err;
    }
    return updatePlan({
      planId: existing.id,
      actor,
      patch: { status, statusReason: normalizeText(reason) || null },
    });
  }

  async function deletePlan(id, { actor = {} } = {}) {
    const key = normalizeText(id);
    const existing = key ? state.plans[key] : null;
    if (!existing) return false;
    delete state.plans[key];
    audit(state, 'plan.deleted', existing, actor);
    await save();
    return true;
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    isStub: false,
    getByCustomer,
    getById,
    listPlans,
    createPlan,
    updatePlan,
    setStatus,
    deletePlan,
  };
}

module.exports = { createCcoTreatmentPlanCanvasStore, SCHEMA_VERSION };
