'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const TEMPLATE_TYPES = Object.freeze(['message', 'document']);
const LEGAL_REVIEW_STATUSES = Object.freeze(['pending', 'in_review', 'approved', 'rejected']);
const DEFAULT_LANG = 'sv';

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = normalizeKey(value);
  return allowed.includes(normalized) ? normalized : fallback;
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
    templates: [],
  };
}

// Body content of a revision (the part that is versioned).
function normalizeBody(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  return {
    subject: normalizeText(safe.subject),
    body: typeof safe.body === 'string' ? safe.body : '',
    lang: normalizeKey(safe.lang) || DEFAULT_LANG,
  };
}

function bodiesEqual(a, b) {
  return a.subject === b.subject && a.body === b.body && a.lang === b.lang;
}

function makeRevision(body, actorRole, note, version) {
  return {
    version,
    subject: body.subject,
    body: body.body,
    lang: body.lang,
    note: normalizeText(note),
    createdAt: nowIso(),
    createdByRole: normalizeText(actorRole) || 'system',
  };
}

function normalizeTemplateRecord(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const id = normalizeText(safe.id);
  const name = normalizeText(safe.name);
  const type = normalizeEnum(safe.type, TEMPLATE_TYPES, 'message');
  const brand = normalizeText(safe.brand) || null;
  const journeyStep = normalizeText(safe.journeyStep) || null;
  const ts = normalizeText(safe.createdAt) || nowIso();

  const revisions = Array.isArray(safe.revisions)
    ? safe.revisions.map((rev, idx) => {
        const body = normalizeBody(rev);
        return {
          version: Number.isFinite(rev?.version) ? rev.version : idx + 1,
          subject: body.subject,
          body: body.body,
          lang: body.lang,
          note: normalizeText(rev?.note),
          createdAt: normalizeText(rev?.createdAt) || ts,
          createdByRole: normalizeText(rev?.createdByRole) || 'system',
        };
      })
    : [];

  return {
    id,
    name,
    type,
    brand,
    journeyStep,
    currentVersion: Number.isFinite(safe.currentVersion) ? safe.currentVersion : revisions.length,
    legalReviewStatus: normalizeEnum(safe.legalReviewStatus, LEGAL_REVIEW_STATUSES, 'pending'),
    legalReview:
      safe.legalReview && typeof safe.legalReview === 'object'
        ? {
            status: normalizeEnum(safe.legalReview.status, LEGAL_REVIEW_STATUSES, 'pending'),
            reviewer: normalizeText(safe.legalReview.reviewer) || null,
            externalRef: normalizeText(safe.legalReview.externalRef) || null,
            reviewedAt: normalizeText(safe.legalReview.reviewedAt) || null,
            reviewedVersion: Number.isFinite(safe.legalReview.reviewedVersion)
              ? safe.legalReview.reviewedVersion
              : null,
          }
        : {
            status: 'pending',
            reviewer: null,
            externalRef: null,
            reviewedAt: null,
            reviewedVersion: null,
          },
    revisions,
    createdAt: ts,
    updatedAt: normalizeText(safe.updatedAt) || ts,
  };
}

function cloneTemplate(record) {
  return {
    ...record,
    legalReview: { ...record.legalReview },
    revisions: record.revisions.map((rev) => ({ ...rev })),
  };
}

async function createCcoTemplateRegistry({ filePath, auditLog = null } = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoTemplateRegistry.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    templates: Array.isArray(state?.templates)
      ? state.templates.map((item) => normalizeTemplateRecord(item)).filter((t) => t.id)
      : [],
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function findIndex(id) {
    const key = normalizeText(id);
    if (!key) return -1;
    return state.templates.findIndex((t) => t.id === key);
  }

  function list(filter = {}) {
    const brand = filter.brand ? normalizeText(filter.brand) : null;
    const type = filter.type ? normalizeEnum(filter.type, TEMPLATE_TYPES, null) : null;
    const journeyStep = filter.journeyStep ? normalizeText(filter.journeyStep) : null;
    const legalReviewStatus = filter.legalReviewStatus
      ? normalizeEnum(filter.legalReviewStatus, LEGAL_REVIEW_STATUSES, null)
      : null;

    return state.templates
      .filter((t) => (brand ? t.brand === brand : true))
      .filter((t) => (type ? t.type === type : true))
      .filter((t) => (journeyStep ? t.journeyStep === journeyStep : true))
      .filter((t) => (legalReviewStatus ? t.legalReviewStatus === legalReviewStatus : true))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .map((t) => cloneTemplate(t));
  }

  function get(id) {
    const idx = findIndex(id);
    if (idx === -1) return null;
    return cloneTemplate(state.templates[idx]);
  }

  function getRevisions(id) {
    const idx = findIndex(id);
    if (idx === -1) return [];
    return state.templates[idx].revisions
      .slice()
      .sort((a, b) => b.version - a.version)
      .map((rev) => ({ ...rev }));
  }

  function currentRevision(record) {
    if (!record.revisions.length) return null;
    return (
      record.revisions.find((rev) => rev.version === record.currentVersion) ||
      record.revisions[record.revisions.length - 1]
    );
  }

  async function upsert(input = {}, actor = {}) {
    const safe = input && typeof input === 'object' ? input : {};
    const id = normalizeText(safe.id);
    const name = normalizeText(safe.name);
    if (!id) throw badRequest('id krävs för mallen.');
    if (!name) throw badRequest('name krävs för mallen.');

    const body = normalizeBody(safe);
    if (!body.body) throw badRequest('body krävs för mallen.');

    const type = normalizeEnum(safe.type, TEMPLATE_TYPES, 'message');
    const brand = normalizeText(safe.brand) || null;
    const journeyStep = normalizeText(safe.journeyStep) || null;
    const actorRole = normalizeText(actor?.role) || 'system';

    const idx = findIndex(id);
    let record;
    let created = false;
    let revisionAdded = false;

    if (idx === -1) {
      const ts = nowIso();
      const revision = makeRevision(body, actorRole, safe.note, 1);
      record = {
        id,
        name,
        type,
        brand,
        journeyStep,
        currentVersion: 1,
        legalReviewStatus: 'pending',
        legalReview: {
          status: 'pending',
          reviewer: null,
          externalRef: null,
          reviewedAt: null,
          reviewedVersion: null,
        },
        revisions: [revision],
        createdAt: ts,
        updatedAt: ts,
      };
      state.templates.push(record);
      created = true;
      revisionAdded = true;
    } else {
      record = state.templates[idx];
      record.name = name;
      record.type = type;
      record.brand = brand;
      record.journeyStep = journeyStep;
      record.updatedAt = nowIso();

      const current = currentRevision(record);
      if (!current || !bodiesEqual(current, body)) {
        const nextVersion = record.currentVersion + 1;
        record.revisions.push(makeRevision(body, actorRole, safe.note, nextVersion));
        record.currentVersion = nextVersion;
        revisionAdded = true;
        // A new revision invalidates a prior legal approval.
        if (record.legalReviewStatus === 'approved') {
          record.legalReviewStatus = 'pending';
          record.legalReview = {
            ...record.legalReview,
            status: 'pending',
          };
        }
      }
    }

    await save();

    if (auditLog) {
      auditLog.append({
        action: created ? 'cco.template.create' : 'cco.template.update',
        actor: { role: actorRole, userId: actor?.userId || null },
        target: { kind: 'template', id },
        detail: { type: record.type, version: record.currentVersion, revisionAdded },
      });
    }

    return cloneTemplate(record);
  }

  async function setLegalReviewStatus(id, status, opts = {}) {
    const idx = findIndex(id);
    if (idx === -1) throw notFound('Mallen hittades inte.');
    const nextStatus = normalizeEnum(status, LEGAL_REVIEW_STATUSES, '');
    if (!nextStatus) {
      throw badRequest(`Ogiltig status. Tillåtna: ${LEGAL_REVIEW_STATUSES.join(', ')}.`);
    }

    const record = state.templates[idx];
    const actorRole = normalizeText(opts?.role) || 'system';
    const ts = nowIso();

    record.legalReviewStatus = nextStatus;
    record.legalReview = {
      status: nextStatus,
      reviewer: normalizeText(opts?.reviewer) || null,
      externalRef: normalizeText(opts?.externalRef) || null,
      reviewedAt: ts,
      reviewedVersion: record.currentVersion,
    };
    record.updatedAt = ts;
    await save();

    if (auditLog) {
      auditLog.append({
        action: 'cco.template.legal_review',
        actor: { role: actorRole, userId: opts?.userId || null },
        target: { kind: 'template', id: record.id },
        detail: { status: nextStatus, version: record.currentVersion },
      });
    }

    return cloneTemplate(record);
  }

  function snapshotForSend(id, lang = DEFAULT_LANG) {
    const idx = findIndex(id);
    if (idx === -1) throw notFound('Mallen hittades inte.');
    const record = state.templates[idx];
    const revision = currentRevision(record);
    if (!revision) throw badRequest('Mallen saknar revisioner.');

    const wantLang = normalizeKey(lang) || DEFAULT_LANG;
    const snapshot = {
      templateId: record.id,
      name: record.name,
      type: record.type,
      brand: record.brand,
      journeyStep: record.journeyStep,
      version: revision.version,
      lang: revision.lang || wantLang,
      requestedLang: wantLang,
      subject: revision.subject,
      body: revision.body,
      legalReviewStatus: record.legalReviewStatus,
      legalApproved: record.legalReviewStatus === 'approved',
      snapshotAt: nowIso(),
      snapshotId: crypto.randomUUID(),
    };
    return Object.freeze(snapshot);
  }

  function stats() {
    const byType = {};
    for (const t of TEMPLATE_TYPES) byType[t] = 0;
    const byLegalReviewStatus = {};
    for (const s of LEGAL_REVIEW_STATUSES) byLegalReviewStatus[s] = 0;
    let totalRevisions = 0;
    for (const t of state.templates) {
      byType[t.type] = (byType[t.type] || 0) + 1;
      byLegalReviewStatus[t.legalReviewStatus] =
        (byLegalReviewStatus[t.legalReviewStatus] || 0) + 1;
      totalRevisions += t.revisions.length;
    }
    return {
      total: state.templates.length,
      totalRevisions,
      byType,
      byLegalReviewStatus,
    };
  }

  return {
    list,
    stats,
    get,
    getRevisions,
    upsert,
    setLegalReviewStatus,
    snapshotForSend,
  };
}

module.exports = {
  TEMPLATE_TYPES,
  LEGAL_REVIEW_STATUSES,
  createCcoTemplateRegistry,
};
