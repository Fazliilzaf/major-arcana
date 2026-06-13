'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const SCHEMA_VERSION = '1.0.0';

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
    annotations: {},
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

function normalizeAnnotation(input = {}, existing = {}) {
  const safe = safeObject(input);
  const ex = safeObject(existing);
  const id = normalizeText(safe.id || safe.annotationId || ex.id) || crypto.randomUUID();
  const patientId = normalizeText(safe.patientId || safe.customerId || ex.patientId);
  const customerId = normalizeText(safe.customerId || safe.patientId || ex.customerId || patientId);
  if (!customerId && !patientId) {
    const err = new Error('customerId eller patientId krävs.');
    err.statusCode = 400;
    throw err;
  }

  return {
    id,
    customerId: customerId || patientId,
    patientId: patientId || customerId,
    sourceAssetId: normalizeText(safe.sourceAssetId || safe.assetId || ex.sourceAssetId) || null,
    derivedAssetId:
      normalizeText(safe.derivedAssetId || safe.savedAssetId || ex.derivedAssetId) || null,
    encounterId: normalizeText(safe.encounterId || ex.encounterId) || null,
    documentDate: normalizeText(safe.documentDate || safe.captureDate || ex.documentDate) || null,
    imageName: normalizeText(safe.imageName || safe.fileName || ex.imageName) || null,
    imageUrl: normalizeText(safe.imageUrl || safe.sourceUrl || ex.imageUrl) || null,
    previewUrl: normalizeText(safe.previewUrl || ex.previewUrl) || null,
    zone: normalizeText(safe.zone || ex.zone) || null,
    purpose: normalizeText(safe.purpose || ex.purpose) || 'clinical-markup',
    tags: asArray(safe.tags || ex.tags)
      .map(normalizeText)
      .filter(Boolean)
      .slice(0, 30),
    drawingData: safeObject(safe.drawingData || ex.drawingData),
    planSummary: safeObject(safe.planSummary || ex.planSummary),
    selectedFor: asArray(safe.selectedFor || ex.selectedFor)
      .map(normalizeText)
      .filter(Boolean)
      .slice(0, 12),
    note: normalizeText(safe.note || ex.note) || null,
    status: normalizeText(safe.status || ex.status) || 'draft',
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
      annotationId: item?.id || null,
      customerId: item?.customerId || null,
      patientId: item?.patientId || null,
      actor: normalizeText(actor?.userId) || 'system',
      role: normalizeText(actor?.role) || null,
      ...extra,
    });
}

async function createCcoPhotoAnnotationStore({ filePath, auditLog = null } = {}) {
  if (!filePath) throw new Error('filePath krävs för ccoPhotoAnnotationStore.');
  const state = await readJson(filePath, emptyState());
  state.annotations = safeObject(state.annotations);
  state.audit = asArray(state.audit);

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function all() {
    return Object.values(state.annotations).sort((a, b) =>
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
    return key && state.annotations[key] ? { ...state.annotations[key] } : null;
  }

  function listAnnotations(filters = {}) {
    const f = safeObject(filters);
    return all().filter((item) => {
      if (f.customerId && item.customerId !== f.customerId && item.patientId !== f.customerId)
        return false;
      if (f.patientId && item.patientId !== f.patientId && item.customerId !== f.patientId)
        return false;
      if (f.sourceAssetId && item.sourceAssetId !== f.sourceAssetId) return false;
      if (f.encounterId && item.encounterId !== f.encounterId) return false;
      if (f.status && item.status !== f.status) return false;
      return true;
    });
  }

  async function createAnnotationSet(input = {}) {
    const actor = safeObject(input.actor);
    const item = normalizeAnnotation(input);
    state.annotations[item.id] = item;
    audit(state, 'annotation.created', item, actor);
    await save();
    try {
      auditLog?.append?.({
        kind: 'cco.photo_annotation.created',
        ts: nowIso(),
        detail: {
          annotationId: item.id,
          customerId: item.customerId,
          patientId: item.patientId,
          sourceAssetId: item.sourceAssetId,
          actor: actor.userId || null,
        },
      });
    } catch {}
    return { ...item };
  }

  async function updateAnnotationSet(input = {}) {
    const annotationId = normalizeText(input.annotationId || input.id);
    const existing = annotationId ? state.annotations[annotationId] : null;
    if (!existing) {
      const err = new Error('annotation saknas.');
      err.statusCode = 404;
      throw err;
    }
    const patch = safeObject(input.patch && Object.keys(input.patch).length ? input.patch : input);
    const actor = safeObject(input.actor || patch.actor);
    const item = normalizeAnnotation({ ...existing, ...patch, id: existing.id, actor }, existing);
    state.annotations[item.id] = item;
    audit(state, 'annotation.updated', item, actor, {
      fields: Object.keys(patch)
        .filter((k) => k !== 'actor')
        .slice(0, 30),
    });
    await save();
    return { ...item };
  }

  async function deleteAnnotation(id, { actor = {} } = {}) {
    const key = normalizeText(id);
    const existing = key ? state.annotations[key] : null;
    if (!existing) return false;
    delete state.annotations[key];
    audit(state, 'annotation.deleted', existing, actor);
    await save();
    return true;
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    isStub: false,
    getByCustomer,
    getById,
    listAnnotations,
    createAnnotationSet,
    updateAnnotationSet,
    deleteAnnotation,
  };
}

module.exports = { createCcoPhotoAnnotationStore, SCHEMA_VERSION };
