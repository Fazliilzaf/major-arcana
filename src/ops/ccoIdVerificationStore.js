const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const VALID_STATUSES = ['verified', 'rejected', 'pending', 'unverified'];

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
  return { version: 1, createdAt: ts, updatedAt: ts, verifications: [] };
}

function normalizeLast4(value) {
  const digits = normalizeText(value).replace(/\D/g, '');
  return digits ? digits.slice(-4) : '';
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

async function createCcoIdVerificationStore({ filePath, auditLog = null } = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoIdVerificationStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    verifications: Array.isArray(state?.verifications) ? state.verifications : [],
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function findIndex(customerId) {
    const key = normalizeKey(customerId);
    return state.verifications.findIndex((v) => normalizeKey(v.customerId) === key);
  }

  function getStatus(customerId) {
    const idx = findIndex(customerId);
    if (idx === -1) {
      return {
        customerId: normalizeKey(customerId),
        status: 'unverified',
        last4: '',
        docType: '',
        verifiedBy: '',
        note: '',
        history: [],
        exists: false,
      };
    }
    return { ...state.verifications[idx], exists: true };
  }

  async function setStatus(customerId, status, options = {}) {
    const custKey = normalizeKey(customerId);
    const nextStatus = normalizeText(status);
    if (!custKey) throw badRequest('customerId krävs.');
    if (!VALID_STATUSES.includes(nextStatus)) {
      throw badRequest(`Ogiltig status. Tillåtna: ${VALID_STATUSES.join(', ')}.`);
    }

    const { role = '', last4 = '', docType = '', verifiedBy = '', note = '' } = options || {};

    const ts = nowIso();
    const historyEntry = {
      status: nextStatus,
      last4: normalizeLast4(last4),
      docType: normalizeText(docType),
      verifiedBy: normalizeText(verifiedBy),
      note: normalizeText(note),
      role: normalizeText(role) || 'system',
      at: ts,
    };

    const idx = findIndex(customerId);
    let record;
    if (idx === -1) {
      record = {
        customerId: custKey,
        status: nextStatus,
        last4: normalizeLast4(last4),
        docType: normalizeText(docType),
        verifiedBy: normalizeText(verifiedBy),
        note: normalizeText(note),
        createdAt: ts,
        updatedAt: ts,
        history: [historyEntry],
      };
      state.verifications.push(record);
    } else {
      record = state.verifications[idx];
      record.status = nextStatus;
      record.last4 = normalizeLast4(last4);
      record.docType = normalizeText(docType);
      record.verifiedBy = normalizeText(verifiedBy);
      record.note = normalizeText(note);
      record.updatedAt = ts;
      record.history = [...(record.history || []), historyEntry];
    }
    await save();

    if (auditLog) {
      auditLog.append({
        action: 'cco.id_verification.set',
        actor: { role: historyEntry.role, userId: options?.userId || null },
        target: { kind: 'id_verification', id: custKey },
        detail: { status: nextStatus },
      });
    }

    return { ...record, exists: true };
  }

  function stats() {
    const byStatus = {};
    for (const s of VALID_STATUSES) byStatus[s] = 0;
    for (const v of state.verifications) {
      byStatus[v.status] = (byStatus[v.status] || 0) + 1;
    }
    return { total: state.verifications.length, byStatus };
  }

  return { getStatus, setStatus, stats };
}

module.exports = { createCcoIdVerificationStore, VALID_STATUSES };
