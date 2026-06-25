const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const VALID_DOC_STATUSES = ['pending', 'ready', 'sent', 'signed', 'declined', 'archived'];

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
  return { version: 1, createdAt: ts, updatedAt: ts, packages: [] };
}

// Bygger listan med dokument som ingår i ett paket utifrån offert + plan.
function buildDocs({ offer, plan, existingDocsState }) {
  const ts = nowIso();
  const docs = [];

  function pushDoc(kind, ref, title) {
    const refKey = normalizeText(ref);
    if (!refKey) return;
    const existing = existingDocsState && existingDocsState[refKey];
    const status = VALID_DOC_STATUSES.includes(normalizeText(existing?.status))
      ? normalizeText(existing.status)
      : 'pending';
    docs.push({
      docId: crypto.randomUUID(),
      kind,
      ref: refKey,
      title: normalizeText(title) || kind,
      status,
      updatedAt: ts,
      history: [{ status, at: ts, role: 'system' }],
    });
  }

  // Offerten själv är alltid huvuddokumentet.
  pushDoc('offer', offer?.id, offer?.title || `Offert ${normalizeText(offer?.id)}`);

  // Behandlingsplan, om kopplad.
  if (plan?.planId) {
    pushDoc('treatment_plan', plan.planId, plan.title || 'Behandlingsplan');
  }

  // Bilagor från offerten.
  const attachments = Array.isArray(offer?.attachments) ? offer.attachments : [];
  for (const att of attachments) {
    pushDoc('attachment', att?.id || att?.ref || att, att?.title || att?.name);
  }

  // Samtycken kopplade till offerten.
  const consents = Array.isArray(offer?.consents) ? offer.consents : [];
  for (const consent of consents) {
    pushDoc('consent', consent?.id || consent?.ref || consent, consent?.title || consent?.name);
  }

  return docs;
}

async function createCcoOfferDocumentPackageStore({
  filePath,
  auditLog = null,
  timelineStore = null,
} = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoOfferDocumentPackageStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    packages: Array.isArray(state?.packages) ? state.packages : [],
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  // Bygger ett dokumentpaket (offert + bilagor/samtycken) för en kund och registrerar det.
  async function preparePackage({ offer, plan = null, actor = {}, existingDocsState = {} } = {}) {
    if (!offer || typeof offer !== 'object') {
      throw badRequest('offer krävs för att förbereda dokumentpaket.');
    }
    const offerId = normalizeText(offer.id);
    const customerId = normalizeKey(offer.customerId);
    if (!offerId) throw badRequest('offer.id krävs.');
    if (!customerId) throw badRequest('offer.customerId krävs.');

    const ts = nowIso();
    const pkg = {
      packageId: crypto.randomUUID(),
      offerId,
      customerId,
      planId: plan?.planId ? normalizeText(plan.planId) : null,
      status: 'prepared',
      docs: buildDocs({ offer, plan, existingDocsState }),
      createdAt: ts,
      updatedAt: ts,
      createdBy: {
        userId: actor?.userId || null,
        role: normalizeText(actor?.role) || 'system',
      },
    };

    state.packages.push(pkg);
    await save();

    if (timelineStore) {
      timelineStore.appendEvent?.({
        kind: 'offer_document_package_prepared',
        surface: 'cco.offer_document_package',
        ts,
        customerId,
        offerId,
        planId: pkg.planId,
        packageId: pkg.packageId,
        docCount: pkg.docs.length,
      });
    }

    if (auditLog) {
      auditLog.append({
        action: 'cco.offer_document_package.prepare',
        actor: { role: pkg.createdBy.role, userId: pkg.createdBy.userId },
        target: { kind: 'offer_document_package', id: pkg.packageId },
        detail: { offerId, customerId, docCount: pkg.docs.length },
      });
    }

    return { ...pkg };
  }

  function getById(packageId) {
    const id = normalizeText(packageId);
    const found = state.packages.find((p) => p.packageId === id);
    return found ? { ...found } : null;
  }

  function listByCustomer(customerId) {
    const cust = normalizeKey(customerId);
    return state.packages
      .filter((p) => p.customerId === cust)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((p) => ({ ...p }));
  }

  // Uppdaterar status för ett dokument inom ett paket.
  async function updateDocStatus({ packageId, docId, status, actor = {} } = {}) {
    const pkgId = normalizeText(packageId);
    const dId = normalizeText(docId);
    const nextStatus = normalizeText(status);
    if (!pkgId) throw badRequest('packageId krävs.');
    if (!dId) throw badRequest('docId krävs.');
    if (!VALID_DOC_STATUSES.includes(nextStatus)) {
      throw badRequest(`Ogiltig status. Tillåtna: ${VALID_DOC_STATUSES.join(', ')}.`);
    }

    const pkg = state.packages.find((p) => p.packageId === pkgId);
    if (!pkg) throw badRequest('Dokumentpaketet saknas.');
    const doc = (pkg.docs || []).find((d) => d.docId === dId);
    if (!doc) throw badRequest('Dokumentet saknas i paketet.');

    const ts = nowIso();
    doc.status = nextStatus;
    doc.updatedAt = ts;
    doc.history = [
      ...(doc.history || []),
      { status: nextStatus, at: ts, role: normalizeText(actor?.role) || 'system' },
    ];
    pkg.updatedAt = ts;
    await save();

    if (auditLog) {
      auditLog.append({
        action: 'cco.offer_document_package.doc_status',
        actor: { role: normalizeText(actor?.role) || 'system', userId: actor?.userId || null },
        target: { kind: 'offer_document_package_doc', id: `${pkgId}::${dId}` },
        detail: { status: nextStatus },
      });
    }

    return { ...pkg };
  }

  return { preparePackage, getById, listByCustomer, updateDocStatus };
}

module.exports = { createCcoOfferDocumentPackageStore, VALID_DOC_STATUSES };
