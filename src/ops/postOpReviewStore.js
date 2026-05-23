'use strict';

/**
 * Post-op Review Store — persistent JSON-store för efter-bilder + GBP-omdöme-flow
 * efter sista uppföljningsbesöket. Spec: docs/strategy/post-op-review-photo-flow.md
 *
 * Strukturen:
 * {
 *   version: 1,
 *   submissions: [
 *     {
 *       submissionId: uuid,
 *       bookingCaseId: ref till cco-bookings.json cases[].bookingCaseId,
 *       tenantId: 'hair-tp-clinic',
 *       patientName: string,
 *       tokenHash: SHA-256 av token (klartext-token bara i URL till patienten),
 *       createdAt: ISO8601,
 *       expiresAt: ISO8601 (default +90 dagar från createdAt),
 *       sentAt: ISO8601 | null,  // när e-post skickades via gateway
 *       submittedAt: ISO8601 | null,  // när patient submittade foton
 *       consentToPublish: boolean | null,
 *       patientNote: string | null,
 *       photos: [{ photoId, filename, size, uploadedAt }],
 *       reviewClicked: boolean,
 *       reviewClickedAt: ISO8601 | null,
 *       photosDeletedAt: ISO8601 | null,  // när cron rensat no-consent-foton
 *     }
 *   ]
 * }
 *
 * Foton lagras på filsystem under data/post-op-photos/[submissionId]/[photoId].webp
 * (gitignored), inte i JSON. Endast metadata + tokenHash i JSON.
 *
 * Token-säkerhet:
 *   - Klartext-token: crypto.randomBytes(32).toString('base64url') (43 tecken)
 *   - Bara hashen lagras → även om JSON läcker kan ingen rekonstruera URL:n
 *   - Verify: hash inkommande token med samma algoritm, jämför med stored hash
 */

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_TOKEN_TTL_DAYS = 90;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function uuid() {
  // Använd inbyggd om Node 20+
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Fallback
  return crypto.randomBytes(16).toString('hex');
}

function generateToken() {
  // 32 bytes → 43 base64url tecken. Klartext, returneras till caller.
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function toIso(date) {
  if (date instanceof Date) return date.toISOString();
  if (typeof date === 'string' && date) return date;
  return new Date().toISOString();
}

function plusDays(days, fromMs = Date.now()) {
  return new Date(fromMs + days * 24 * 3600 * 1000).toISOString();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// ─────── Fil-IO ──────────────────────────────────────────────────────────

async function readStoreFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeStore(parsed);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return emptyStore();
    }
    throw err;
  }
}

async function writeStoreFile(filePath, store) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.${Date.now()}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8');
  await fs.rename(tmp, filePath);
}

function emptyStore() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    submissions: [],
  };
}

function normalizeStore(value) {
  const safe = asObject(value);
  return {
    version: 1,
    createdAt: normalizeText(safe.createdAt) || new Date().toISOString(),
    updatedAt: normalizeText(safe.updatedAt) || new Date().toISOString(),
    submissions: asArray(safe.submissions).map(normalizeSubmission),
  };
}

function normalizeSubmission(value) {
  const safe = asObject(value);
  return {
    submissionId: normalizeText(safe.submissionId) || uuid(),
    bookingCaseId: normalizeText(safe.bookingCaseId),
    tenantId: normalizeText(safe.tenantId),
    patientName: normalizeText(safe.patientName),
    tokenHash: normalizeText(safe.tokenHash),
    createdAt: normalizeText(safe.createdAt) || new Date().toISOString(),
    expiresAt: normalizeText(safe.expiresAt),
    sentAt: normalizeText(safe.sentAt) || null,
    submittedAt: normalizeText(safe.submittedAt) || null,
    consentToPublish:
      typeof safe.consentToPublish === 'boolean' ? safe.consentToPublish : null,
    patientNote: normalizeText(safe.patientNote) || null,
    photos: asArray(safe.photos).map((p) => ({
      photoId: normalizeText(p?.photoId) || uuid(),
      filename: normalizeText(p?.filename),
      size: Number(p?.size) || 0,
      uploadedAt: normalizeText(p?.uploadedAt) || new Date().toISOString(),
    })),
    reviewClicked: Boolean(safe.reviewClicked),
    reviewClickedAt: normalizeText(safe.reviewClickedAt) || null,
    photosDeletedAt: normalizeText(safe.photosDeletedAt) || null,
  };
}

// ─────── Factory ─────────────────────────────────────────────────────────

async function createPostOpReviewStore({
  filePath,
  photosDir = '',
  tokenTtlDays = DEFAULT_TOKEN_TTL_DAYS,
} = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('createPostOpReviewStore requires filePath');
  }

  // Skapa fil om saknad så vi får atomisk skrivning fungera
  let store = await readStoreFile(filePath);

  async function persist() {
    store.updatedAt = new Date().toISOString();
    await writeStoreFile(filePath, store);
  }

  // ─── Public API ────────────────────────────────────────────────────────

  /**
   * Skapa en ny submission-rad + generera token. Returnerar klartext-token
   * (bara här, en gång) plus full submission-rad.
   */
  async function createSubmission({
    bookingCaseId,
    tenantId,
    patientName,
  } = {}) {
    if (!normalizeText(bookingCaseId)) {
      throw new Error('createSubmission requires bookingCaseId');
    }
    if (!normalizeText(tenantId)) {
      throw new Error('createSubmission requires tenantId');
    }

    const token = generateToken();
    const tokenHash = hashToken(token);
    const createdAt = new Date().toISOString();
    const expiresAt = plusDays(tokenTtlDays);

    const submission = normalizeSubmission({
      submissionId: uuid(),
      bookingCaseId: normalizeText(bookingCaseId),
      tenantId: normalizeText(tenantId),
      patientName: normalizeText(patientName),
      tokenHash,
      createdAt,
      expiresAt,
    });

    store.submissions.push(submission);
    await persist();

    return { submission, token };
  }

  /**
   * Slå upp en submission via klartext-token. Returnerar null om okänd/utgången.
   */
  function findByToken(token) {
    const tokenHash = hashToken(token);
    const found = store.submissions.find((s) => s.tokenHash === tokenHash);
    if (!found) return null;
    if (found.expiresAt && Date.parse(found.expiresAt) < Date.now()) return null;
    return found;
  }

  function findById(submissionId) {
    const id = normalizeText(submissionId);
    if (!id) return null;
    return store.submissions.find((s) => s.submissionId === id) || null;
  }

  function findByBookingCaseId(bookingCaseId) {
    const id = normalizeText(bookingCaseId);
    if (!id) return null;
    return store.submissions.find((s) => s.bookingCaseId === id) || null;
  }

  /**
   * Markera att e-post är skickad till patienten via ExecutionGateway.
   */
  async function markSent(submissionId, sentAt) {
    const submission = findById(submissionId);
    if (!submission) throw new Error(`markSent: unknown submissionId ${submissionId}`);
    submission.sentAt = toIso(sentAt);
    await persist();
    return submission;
  }

  /**
   * Lägg till uppladdat foto-metadata. Den faktiska filen lagras separat på FS.
   */
  async function addPhoto(submissionId, { filename, size }) {
    const submission = findById(submissionId);
    if (!submission) throw new Error(`addPhoto: unknown submissionId ${submissionId}`);

    if (submission.photos.length >= 6) {
      throw new Error('addPhoto: max 6 photos per submission');
    }

    const photoId = uuid();
    submission.photos.push({
      photoId,
      filename: normalizeText(filename),
      size: Number(size) || 0,
      uploadedAt: new Date().toISOString(),
    });
    await persist();
    return { submission, photoId };
  }

  /**
   * Patient bekräftar inlämning (sätter consent + ev. note + submittedAt).
   * Idempotent: andra anrop returnerar befintlig submission utan att skriva om.
   */
  async function submit(submissionId, { consentToPublish, patientNote } = {}) {
    const submission = findById(submissionId);
    if (!submission) throw new Error(`submit: unknown submissionId ${submissionId}`);

    if (submission.submittedAt) {
      // Idempotent
      return submission;
    }

    submission.consentToPublish =
      typeof consentToPublish === 'boolean' ? consentToPublish : false;
    submission.patientNote = normalizeText(patientNote) || null;
    submission.submittedAt = new Date().toISOString();
    await persist();
    return submission;
  }

  /**
   * Beacon från patient — kallas när patienten klickar GBP-länken.
   */
  async function markReviewClicked(submissionId) {
    const submission = findById(submissionId);
    if (!submission) throw new Error(`markReviewClicked: unknown submissionId ${submissionId}`);
    if (submission.reviewClicked) return submission; // idempotent
    submission.reviewClicked = true;
    submission.reviewClickedAt = new Date().toISOString();
    await persist();
    return submission;
  }

  /**
   * GDPR-radering på begäran från patient.
   * Tar även bort foto-mapp på disk om photosDir är konfigurerad.
   */
  async function deleteSubmission(submissionId) {
    const idx = store.submissions.findIndex((s) => s.submissionId === submissionId);
    if (idx < 0) return false;
    store.submissions.splice(idx, 1);
    await persist();
    const dir = normalizeText(photosDir);
    if (dir) {
      const submissionDir = path.join(dir, submissionId);
      await fs.rm(submissionDir, { recursive: true, force: true }).catch(() => {});
    }
    return true;
  }

  /**
   * Cron-rensa foto-metadata för no-consent som passerat TTL (default 365 dagar).
   * Returnerar listan submissions där photosDeletedAt sattes så caller kan rensa
   * själva FS-fil-mapparna.
   */
  async function pruneNoConsentPhotos({ ttlDays = 365 } = {}) {
    const cutoff = Date.now() - ttlDays * 24 * 3600 * 1000;
    const pruned = [];
    for (const s of store.submissions) {
      if (s.consentToPublish === false && s.submittedAt && !s.photosDeletedAt) {
        if (Date.parse(s.submittedAt) < cutoff) {
          s.photos = [];
          s.photosDeletedAt = new Date().toISOString();
          pruned.push(s);
        }
      }
    }
    if (pruned.length) await persist();
    return pruned;
  }

  function listSubmissions(filter = {}) {
    return store.submissions.filter((s) => {
      if (filter.tenantId && s.tenantId !== filter.tenantId) return false;
      if (filter.bookingCaseId && s.bookingCaseId !== filter.bookingCaseId) return false;
      if (typeof filter.submitted === 'boolean') {
        if (filter.submitted && !s.submittedAt) return false;
        if (!filter.submitted && s.submittedAt) return false;
      }
      return true;
    });
  }

  function count() {
    return store.submissions.length;
  }

  return {
    createSubmission,
    findByToken,
    findById,
    findByBookingCaseId,
    markSent,
    addPhoto,
    submit,
    markReviewClicked,
    deleteSubmission,
    pruneNoConsentPhotos,
    listSubmissions,
    count,
    // Exponera för tester
    _hashToken: hashToken,
  };
}

module.exports = {
  createPostOpReviewStore,
  // Exponera helpers för tester + capability
  generateToken,
  hashToken,
  DEFAULT_TOKEN_TTL_DAYS,
};
