const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

// CCO Vendor Register (PUB-register / GDPR processor + sub-processor register).
// PUB-avtal = Data Processing Agreement (DPA). "underbilaga 1" = sub-appendix
// listing the sub-processors (subprocessors) per vendor.
// Canonical store pattern: se src/ops/ccoFollowUpStore.js + ccoPhotoConsentStore.js.

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
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
  return { version: 1, createdAt: ts, updatedAt: ts, vendors: [] };
}

function normalizeSubprocessor(input = {}) {
  const name = normalizeText(input.name);
  if (!name) return null;
  return {
    id: normalizeText(input.id) || crypto.randomUUID(),
    name,
    purpose: normalizeText(input.purpose),
    country: normalizeText(input.country),
    transferMechanism: normalizeText(input.transferMechanism),
    addedAt: normalizeText(input.addedAt) || nowIso(),
  };
}

function normalizeVendor(input = {}) {
  const name = normalizeText(input.name);
  const createdAt = normalizeText(input.createdAt) || nowIso();
  return {
    id: normalizeText(input.id) || crypto.randomUUID(),
    name,
    category: normalizeText(input.category),
    purpose: normalizeText(input.purpose),
    contactEmail: normalizeText(input.contactEmail),
    country: normalizeText(input.country),
    // DPA / PUB-avtal review state.
    dpaSigned: input.dpaSigned === true,
    dpaReviewed: input.dpaReviewed === true,
    dpaReviewedAt: normalizeText(input.dpaReviewedAt) || null,
    dpaReviewedBy: normalizeText(input.dpaReviewedBy) || null,
    dpaNote: normalizeText(input.dpaNote),
    // underbilaga 1 (sub-processor appendix) completion state.
    underbilaga1Completed: input.underbilaga1Completed === true,
    underbilaga1CompletedAt: normalizeText(input.underbilaga1CompletedAt) || null,
    underbilaga1CompletedBy: normalizeText(input.underbilaga1CompletedBy) || null,
    // Legacy exit (avveckling) state.
    legacyExit: input.legacyExit === true,
    legacyExitAt: normalizeText(input.legacyExitAt) || null,
    legacyExitBy: normalizeText(input.legacyExitBy) || null,
    legacyExitReason: normalizeText(input.legacyExitReason),
    subprocessors: Array.isArray(input.subprocessors)
      ? input.subprocessors.map((s) => normalizeSubprocessor(s)).filter(Boolean)
      : [],
    createdAt,
    updatedAt: normalizeText(input.updatedAt) || createdAt,
  };
}

async function createCcoVendorRegisterStore({ filePath, auditLog = null } = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoVendorRegisterStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    vendors: Array.isArray(state?.vendors) ? state.vendors.map((v) => normalizeVendor(v)) : [],
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function findIndex(id) {
    const key = normalizeText(id);
    if (!key) return -1;
    return state.vendors.findIndex((v) => v.id === key);
  }

  function audit(action, actor, id, detail) {
    if (!auditLog) return;
    auditLog.append({
      action,
      actor: { role: actor?.role || 'system', userId: actor?.userId || null },
      target: { kind: 'cco_vendor', id },
      detail: detail || {},
    });
  }

  function getById(id) {
    const idx = findIndex(id);
    return idx === -1 ? null : { ...state.vendors[idx] };
  }

  function listAll() {
    return state.vendors.map((v) => ({ ...v }));
  }

  async function createVendor(input = {}, actor = {}) {
    const vendor = normalizeVendor(input);
    if (!vendor.name) {
      throw badRequest('Leverantörens namn (name) krävs.');
    }
    const ts = nowIso();
    vendor.createdAt = ts;
    vendor.updatedAt = ts;
    state.vendors.push(vendor);
    await save();
    audit('cco.vendor.create', actor, vendor.id, { name: vendor.name });
    return { ...vendor };
  }

  async function updateVendor(id, patch = {}, actor = {}) {
    const idx = findIndex(id);
    if (idx === -1) throw badRequest('Leverantören hittades inte.');
    const current = state.vendors[idx];
    // Only allow descriptive fields to be patched; state transitions go through
    // the dedicated mark* methods.
    const allowed = [
      'name',
      'category',
      'purpose',
      'contactEmail',
      'country',
      'dpaSigned',
      'dpaNote',
    ];
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        if (key === 'dpaSigned') {
          current.dpaSigned = patch.dpaSigned === true;
        } else {
          current[key] = normalizeText(patch[key]);
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'name') && !current.name) {
      throw badRequest('Leverantörens namn (name) krävs.');
    }
    current.updatedAt = nowIso();
    await save();
    audit('cco.vendor.update', actor, current.id, {});
    return { ...current };
  }

  async function addSubprocessor({ vendorId, subprocessor, actor = {} } = {}) {
    const idx = findIndex(vendorId);
    if (idx === -1) throw badRequest('Leverantören hittades inte.');
    const normalized = normalizeSubprocessor(subprocessor);
    if (!normalized) throw badRequest('Underbiträdets namn (name) krävs.');
    const current = state.vendors[idx];
    current.subprocessors.push(normalized);
    // A newly added sub-processor invalidates a previously completed appendix.
    current.underbilaga1Completed = false;
    current.underbilaga1CompletedAt = null;
    current.underbilaga1CompletedBy = null;
    current.updatedAt = nowIso();
    await save();
    audit('cco.vendor.subprocessor.add', actor, current.id, {
      subprocessorId: normalized.id,
      name: normalized.name,
    });
    return { ...current };
  }

  async function markDpaReviewed({ vendorId, actor = {}, note = '' } = {}) {
    const idx = findIndex(vendorId);
    if (idx === -1) throw badRequest('Leverantören hittades inte.');
    const current = state.vendors[idx];
    const ts = nowIso();
    current.dpaReviewed = true;
    current.dpaReviewedAt = ts;
    current.dpaReviewedBy = normalizeText(actor?.userId) || null;
    if (normalizeText(note)) current.dpaNote = normalizeText(note);
    current.updatedAt = ts;
    await save();
    audit('cco.vendor.dpa_reviewed', actor, current.id, {});
    return { ...current };
  }

  async function markUnderbilaga1Completed({ vendorId, actor = {} } = {}) {
    const idx = findIndex(vendorId);
    if (idx === -1) throw badRequest('Leverantören hittades inte.');
    const current = state.vendors[idx];
    const ts = nowIso();
    current.underbilaga1Completed = true;
    current.underbilaga1CompletedAt = ts;
    current.underbilaga1CompletedBy = normalizeText(actor?.userId) || null;
    current.updatedAt = ts;
    await save();
    audit('cco.vendor.underbilaga1_completed', actor, current.id, {});
    return { ...current };
  }

  async function markLegacyExit({ vendorId, actor = {}, reason = '' } = {}) {
    const idx = findIndex(vendorId);
    if (idx === -1) throw badRequest('Leverantören hittades inte.');
    const current = state.vendors[idx];
    const ts = nowIso();
    current.legacyExit = true;
    current.legacyExitAt = ts;
    current.legacyExitBy = normalizeText(actor?.userId) || null;
    current.legacyExitReason = normalizeText(reason);
    current.updatedAt = ts;
    await save();
    audit('cco.vendor.legacy_exit', actor, current.id, { reason: current.legacyExitReason });
    return { ...current };
  }

  // Vendors needing review = DPA not yet reviewed, and not exited.
  function listNeedsReview() {
    return state.vendors
      .filter((v) => !v.legacyExit && (!v.dpaReviewed || !v.underbilaga1Completed))
      .map((v) => ({ ...v }));
  }

  function listLegacyExit() {
    return state.vendors.filter((v) => v.legacyExit === true).map((v) => ({ ...v }));
  }

  function exportRegister() {
    return {
      version: state.version,
      generatedAt: nowIso(),
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      vendorCount: state.vendors.length,
      vendors: state.vendors.map((v) => ({
        ...v,
        subprocessors: v.subprocessors.map((s) => ({ ...s })),
      })),
    };
  }

  return {
    createVendor,
    updateVendor,
    getById,
    listAll,
    addSubprocessor,
    exportRegister,
    listNeedsReview,
    markDpaReviewed,
    listLegacyExit,
    markLegacyExit,
    markUnderbilaga1Completed,
  };
}

module.exports = { createCcoVendorRegisterStore };
