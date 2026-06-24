const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const VALID_STATUSES = ['granted', 'denied', 'revoked', 'pending'];

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
  return { version: 1, createdAt: ts, updatedAt: ts, consents: [] };
}

function consentKey(customerId, photoId) {
  return `${normalizeKey(customerId)}::${normalizeText(photoId)}`;
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

async function createCcoPhotoConsentStore({ filePath, auditLog = null } = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoPhotoConsentStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    consents: Array.isArray(state?.consents) ? state.consents : [],
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function findIndex(customerId, photoId) {
    const key = consentKey(customerId, photoId);
    return state.consents.findIndex((c) => consentKey(c.customerId, c.photoId) === key);
  }

  function getConsent(customerId, photoId) {
    const idx = findIndex(customerId, photoId);
    if (idx === -1) {
      return {
        customerId: normalizeKey(customerId),
        photoId: normalizeText(photoId),
        status: 'pending',
        note: '',
        history: [],
        exists: false,
      };
    }
    return { ...state.consents[idx], exists: true };
  }

  function listGranted({ customerId = null } = {}) {
    const wantCustomer = customerId ? normalizeKey(customerId) : null;
    return state.consents
      .filter((c) => c.status === 'granted')
      .filter((c) => (wantCustomer ? c.customerId === wantCustomer : true))
      .map((c) => ({ ...c }));
  }

  async function setStatus(customerId, photoId, status, actor = {}, { note = '' } = {}) {
    const custKey = normalizeKey(customerId);
    const photo = normalizeText(photoId);
    const nextStatus = normalizeText(status);
    if (!custKey || !photo) throw badRequest('customerId och photoId krävs.');
    if (!VALID_STATUSES.includes(nextStatus)) {
      throw badRequest(`Ogiltig status. Tillåtna: ${VALID_STATUSES.join(', ')}.`);
    }

    const ts = nowIso();
    const historyEntry = {
      status: nextStatus,
      note: normalizeText(note),
      role: normalizeText(actor?.role) || 'system',
      at: ts,
    };

    const idx = findIndex(customerId, photoId);
    let record;
    if (idx === -1) {
      record = {
        customerId: custKey,
        photoId: photo,
        status: nextStatus,
        note: normalizeText(note),
        createdAt: ts,
        updatedAt: ts,
        history: [historyEntry],
      };
      state.consents.push(record);
    } else {
      record = state.consents[idx];
      record.status = nextStatus;
      record.note = normalizeText(note);
      record.updatedAt = ts;
      record.history = [...(record.history || []), historyEntry];
    }
    await save();

    if (auditLog) {
      auditLog.append({
        action: 'cco.photo_consent.set',
        actor: { role: historyEntry.role, userId: actor?.userId || null },
        target: { kind: 'photo_consent', id: consentKey(custKey, photo) },
        detail: { status: nextStatus },
      });
    }

    return { ...record, exists: true };
  }

  function stats() {
    const byStatus = {};
    for (const s of VALID_STATUSES) byStatus[s] = 0;
    for (const c of state.consents) {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    }
    return { total: state.consents.length, byStatus };
  }

  return { getConsent, listGranted, setStatus, stats };
}

module.exports = { createCcoPhotoConsentStore, VALID_STATUSES };
