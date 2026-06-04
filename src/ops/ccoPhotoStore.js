'use strict';

/**
 * ccoPhotoStore.js — P0.6 Photo/encounter-koppling
 * ====================================================
 *
 * Per-tenant metadata-store för patient-foton som kopplar foto → encounter →
 * patient-tidslinje. Existerande `ccoJournalPhotoStore` hanterar själva foto-
 * filerna (på disk under data/journal-photos/<tenant>/<patient>/...).
 * Den här store:n hanterar BARA metadata + indexering så foton hittas via
 * encounter/patient/timeline.
 *
 * Per foto:
 *   {
 *     photoId, tenantId, patientId, encounterId,
 *     treatmentDate, type: 'before|during|after|reference|consent',
 *     source: 'cco_camera|drive|upload|legacy_import',
 *     filePath  (relativ till data/), absent om Drive
 *     driveFileId (optional),
 *     mimeType, sizeBytes, takenAt, takenByUserId, takenByName,
 *     brand, label,
 *     createdAt, updatedAt
 *   }
 *
 * INGA patient-bilder lagras i denna store — bara metadata. filePath pekar
 * till säker lagring (Drive eller lokal mount via ccoJournalPhotoStore).
 *
 * Audit:
 *   - photo.add (skapa metadata)
 *   - photo.link_encounter (binda till behandlingsdatum)
 *   - photo.read (när någon listar foton för patient/encounter)
 *   - photo.delete (owner only)
 *
 * Endpoint-skiss (NOT implementerad här — bara design):
 *
 *   POST /api/v1/cco/photo
 *     auth: attachRole + requirePermission('photo.write')
 *     body: { tenantId, patientId, encounterId?, type, source,
 *             treatmentDate?, label?, takenAt?, mimeType,
 *             // bild-binär laddas separat via ccoJournalPhotoStore.savePhoto()
 *             photoFileRef: { storedPhotoId, mimeType, sizeBytes } }
 *     resp: { photo: {...metadata...} }
 *     audit: 'photo.add'
 *
 *   POST /api/v1/cco/photo/:photoId/link-encounter
 *     auth: requirePermission('photo.write')
 *     body: { encounterId, treatmentDate }
 *     resp: { photo }
 *     audit: 'photo.link_encounter'
 *
 *   GET /api/v1/cco/photo?tenantId=&patientId=
 *     auth: requirePermission('photo.read')
 *     resp: { count, photos: [...] }
 *     audit: 'photo.read'
 *
 *   GET /api/v1/cco/photo/encounter/:encounterId
 *     auth: requirePermission('photo.read')
 *     resp: { encounterId, before:[], during:[], after:[], reference:[] }
 *     audit: 'photo.read'
 *
 *   DELETE /api/v1/cco/photo/:photoId
 *     auth: requirePermission('photo.delete')  // owner only
 *     audit: 'photo.delete'
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const VALID_TYPES = Object.freeze(['before', 'during', 'after', 'reference', 'consent']);
const VALID_SOURCES = Object.freeze([
  'cco_camera',
  'drive',
  'upload',
  'legacy_import',
  'meridiq_import',
]);

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

function emptyState() {
  const ts = nowIso();
  return { version: 1, createdAt: ts, updatedAt: ts, photos: [] };
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

function normalizePhoto(input = {}, existing = {}) {
  const safe = input || {};
  const existingSafe = existing || {};
  const type = normalizeKey(safe.type || existingSafe.type) || 'reference';
  if (!VALID_TYPES.includes(type)) {
    const e = new Error(`invalid photo type "${type}"`);
    e.statusCode = 400;
    throw e;
  }
  const source = normalizeKey(safe.source || existingSafe.source) || 'upload';
  if (!VALID_SOURCES.includes(source)) {
    const e = new Error(`invalid photo source "${source}"`);
    e.statusCode = 400;
    throw e;
  }
  return {
    photoId: normalizeText(safe.photoId || existingSafe.photoId) || crypto.randomUUID(),
    tenantId: normalizeText(safe.tenantId || existingSafe.tenantId),
    patientId: normalizeText(safe.patientId || existingSafe.patientId),
    encounterId: normalizeText(safe.encounterId || existingSafe.encounterId) || null,
    treatmentDate: normalizeText(safe.treatmentDate || existingSafe.treatmentDate) || null,
    type,
    source,
    brand: normalizeText(safe.brand || existingSafe.brand) || null,
    label: normalizeText(safe.label || existingSafe.label) || '',
    filePath: normalizeText(safe.filePath || existingSafe.filePath) || null,
    driveFileId: normalizeText(safe.driveFileId || existingSafe.driveFileId) || null,
    mimeType: normalizeText(safe.mimeType || existingSafe.mimeType) || 'image/jpeg',
    sizeBytes: Number(safe.sizeBytes || existingSafe.sizeBytes) || 0,
    takenAt: normalizeText(safe.takenAt || existingSafe.takenAt) || nowIso(),
    takenByUserId: normalizeText(safe.takenByUserId || existingSafe.takenByUserId) || null,
    takenByName: normalizeText(safe.takenByName || existingSafe.takenByName) || null,
    createdAt: normalizeText(existingSafe.createdAt) || nowIso(),
    updatedAt: nowIso(),
  };
}

function logAudit(auditLog, action, photo, actor, result = 'ok', extra = {}) {
  if (!auditLog || typeof auditLog.append !== 'function') return;
  try {
    auditLog.append({
      action,
      actor: { role: actor?.role || 'unknown', userId: actor?.userId || null },
      target: {
        kind: 'patient_photo',
        id: photo?.photoId || null,
        tenantId: photo?.tenantId || null,
      },
      result,
      detail: {
        patientId: photo?.patientId || null,
        encounterId: photo?.encounterId || null,
        type: photo?.type || null,
        source: photo?.source || null,
        ...extra,
      },
    });
  } catch {
    /* audit failure must never break the flow */
  }
}

async function createCcoPhotoStore({ filePath, auditLog = null } = {}) {
  if (!filePath) throw new Error('filePath krävs för ccoPhotoStore');
  const state = await readJson(filePath, emptyState());
  if (!Array.isArray(state.photos)) state.photos = [];

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function addPhoto(input = {}, { actor = {} } = {}) {
    const photo = normalizePhoto(input);
    if (!photo.tenantId || !photo.patientId) {
      const e = new Error('tenantId och patientId krävs.');
      e.statusCode = 400;
      throw e;
    }
    state.photos.push(photo);
    await save();
    logAudit(auditLog, 'photo.write', photo, actor, 'ok', { phase: 'add' });
    return { ...photo };
  }

  async function linkPhotoToEncounter({ tenantId, patientId, photoId, encounterId, treatmentDate, actor = {} } = {}) {
    const tId = normalizeText(tenantId);
    const pId = normalizeText(patientId);
    const phId = normalizeText(photoId);
    if (!tId || !pId || !phId || !encounterId) {
      const e = new Error('tenantId, patientId, photoId, encounterId krävs.');
      e.statusCode = 400;
      throw e;
    }
    const index = state.photos.findIndex(
      (p) => p.photoId === phId && p.tenantId === tId && p.patientId === pId
    );
    if (index < 0) {
      const e = new Error('Foto hittades inte.');
      e.statusCode = 404;
      throw e;
    }
    const merged = normalizePhoto(
      { ...state.photos[index], encounterId: normalizeText(encounterId), treatmentDate: normalizeText(treatmentDate) || state.photos[index].treatmentDate },
      state.photos[index]
    );
    state.photos[index] = merged;
    await save();
    logAudit(auditLog, 'photo.write', merged, actor, 'ok', { phase: 'link_encounter' });
    return { ...merged };
  }

  function listForPatient({ tenantId, patientId, actor = {}, _audit = true } = {}) {
    const tId = normalizeText(tenantId);
    const pId = normalizeText(patientId);
    const photos = state.photos
      .filter((p) => p.tenantId === tId && p.patientId === pId)
      .map((p) => ({ ...p }));
    if (_audit) {
      logAudit(
        auditLog,
        'photo.read',
        { tenantId: tId, patientId: pId, photoId: null },
        actor,
        'ok',
        { count: photos.length, scope: 'patient' }
      );
    }
    return photos;
  }

  function listForEncounter({ tenantId, patientId, encounterId, actor = {}, _audit = true } = {}) {
    const tId = normalizeText(tenantId);
    const pId = normalizeText(patientId);
    const eId = normalizeText(encounterId);
    const photos = state.photos
      .filter(
        (p) =>
          p.tenantId === tId &&
          p.patientId === pId &&
          (p.encounterId || '') === eId
      )
      .map((p) => ({ ...p }));
    if (_audit) {
      logAudit(
        auditLog,
        'photo.read',
        { tenantId: tId, patientId: pId, photoId: null, encounterId: eId },
        actor,
        'ok',
        { count: photos.length, scope: 'encounter' }
      );
    }
    return photos;
  }

  function bucketByPhase({ tenantId, patientId, encounterId, actor = {} } = {}) {
    const list = listForEncounter({ tenantId, patientId, encounterId, actor, _audit: true });
    const bucket = { before: [], during: [], after: [], reference: [], consent: [] };
    for (const p of list) {
      if (bucket[p.type]) bucket[p.type].push(p);
    }
    return bucket;
  }

  function getPhoto({ tenantId, patientId, photoId } = {}) {
    const tId = normalizeText(tenantId);
    const pId = normalizeText(patientId);
    const phId = normalizeText(photoId);
    const found = state.photos.find(
      (p) => p.photoId === phId && p.tenantId === tId && p.patientId === pId
    );
    return found ? { ...found } : null;
  }

  async function deletePhoto({ tenantId, patientId, photoId, actor = {} } = {}) {
    const tId = normalizeText(tenantId);
    const pId = normalizeText(patientId);
    const phId = normalizeText(photoId);
    const index = state.photos.findIndex(
      (p) => p.photoId === phId && p.tenantId === tId && p.patientId === pId
    );
    if (index < 0) {
      const e = new Error('Foto hittades inte.');
      e.statusCode = 404;
      throw e;
    }
    const [removed] = state.photos.splice(index, 1);
    await save();
    logAudit(auditLog, 'photo.delete', removed, actor, 'ok', { phase: 'delete' });
    return { ...removed };
  }

  function stats({ tenantId } = {}) {
    const tId = normalizeText(tenantId);
    const all = tId ? state.photos.filter((p) => p.tenantId === tId) : state.photos.slice();
    const byType = {};
    const bySource = {};
    let linkedToEncounter = 0;
    for (const p of all) {
      byType[p.type] = (byType[p.type] || 0) + 1;
      bySource[p.source] = (bySource[p.source] || 0) + 1;
      if (p.encounterId) linkedToEncounter += 1;
    }
    return {
      tenantId: tId || null,
      total: all.length,
      byType,
      bySource,
      linkedToEncounter,
      unlinked: all.length - linkedToEncounter,
    };
  }

  return {
    addPhoto,
    linkPhotoToEncounter,
    listForPatient,
    listForEncounter,
    bucketByPhase,
    getPhoto,
    deletePhoto,
    stats,
    VALID_TYPES,
    VALID_SOURCES,
  };
}

module.exports = {
  createCcoPhotoStore,
  VALID_TYPES,
  VALID_SOURCES,
};
