/**
 * ccoFinanceReviewStore — Sprint CF.8 (MVP 7)
 *
 * Revisor-review-status per export-batch. Revisor får INTE ändra original-expense —
 * den lämnar bara review-status + notes på batch-nivå. Owner/finance gör eventuella
 * korrigeringar efteråt baserat på revisor-feedback.
 *
 * Status-machine per batch-review:
 *   pending → reviewed → accepted_for_bookkeeping (final)
 *           ↘
 *             needs_correction (kräver owner/finance-action)
 *           ↘
 *             rejected_with_reason (final)
 *
 * Audit-kinds:
 *  - cf.review.opened
 *  - cf.review.export_downloaded
 *  - cf.review.marked_reviewed
 *  - cf.review.needs_correction
 *  - cf.review.accepted_for_bookkeeping
 *  - cf.review.rejected
 *  - cf.review.note_added
 *
 * Säkerhet:
 *  - Persisteras i data/cco/finance-reviews.json (gitignored)
 *  - Inga AI/OCR-anrop · ingen Fortnox-write
 *  - RBAC enforced i server.js
 *  - Revisor får READ allt CF-data + WRITE bara på review-objekt (denna store)
 *  - Original-expense-objektet är immutable för revisor
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = '1.0.0';

const VALID_REVIEW_STATUSES = Object.freeze([
  'pending',
  'reviewed',
  'needs_correction',
  'accepted_for_bookkeeping',
  'rejected_with_reason',
]);

function nowIso() { return new Date().toISOString(); }
function newId() { return 'rev_' + crypto.randomBytes(8).toString('hex'); }

async function createCcoFinanceReviewStore({ filePath, auditLog = null } = {}) {
  if (!filePath) throw new Error('filePath krävs');
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

  let data = {
    schemaVersion: SCHEMA_VERSION,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    reviews: [], // ett review-objekt per export-batch (1:1)
  };

  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        data.schemaVersion = parsed.schemaVersion || SCHEMA_VERSION;
        data.createdAt = parsed.createdAt || data.createdAt;
        data.updatedAt = parsed.updatedAt || data.updatedAt;
        data.reviews = Array.isArray(parsed.reviews) ? parsed.reviews : [];
      }
    }
  } catch (err) {
    console.warn('[ccoFinanceReviewStore] kunde inte läsa:', err.message);
  }

  async function persist() {
    data.updatedAt = nowIso();
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  function audit(action, detail) {
    try {
      auditLog?.append?.({
        action, kind: action,
        surface: 'cco.cf.review',
        ts: nowIso(),
        actor: detail?.actor || { role: 'system' },
        target: { kind: 'review', id: detail?.reviewId, batchId: detail?.batchId },
        detail,
      });
    } catch {}
  }

  /**
   * Hämta eller skapa review för en export-batch.
   * Auto-skapar med status=pending vid första åtkomst.
   */
  async function getOrCreateForBatch({ batchId, actor } = {}) {
    if (!batchId) throw new Error('batchId krävs');
    let r = data.reviews.find((x) => x.batchId === batchId);
    if (!r) {
      r = {
        id: newId(),
        batchId,
        status: 'pending',
        reviewer: null,
        reviewedAt: null,
        decidedAt: null,
        notes: [],
        manifestKey: null,
        packageKey: null,
        attachmentKeys: [],
        history: [{ at: nowIso(), action: 'created', by: actor, status: 'pending' }],
        createdAt: nowIso(),
        createdBy: actor || null,
        updatedAt: nowIso(),
      };
      data.reviews.push(r);
      await persist();
      audit('cf.review.opened', { reviewId: r.id, batchId, actor });
    }
    return { ...r };
  }

  async function setStatus({ batchId, newStatus, reason = null, actor } = {}) {
    if (!VALID_REVIEW_STATUSES.includes(newStatus)) {
      throw new Error(`Okänd review-status: ${newStatus}. Tillåtna: ${VALID_REVIEW_STATUSES.join(', ')}`);
    }
    const r = data.reviews.find((x) => x.batchId === batchId);
    if (!r) throw new Error('review finns ej för batch');
    // Final statuses kan inte ändras
    if (r.status === 'accepted_for_bookkeeping' || r.status === 'rejected_with_reason') {
      throw new Error(`review är final (${r.status}) — kan inte ändras`);
    }
    const oldStatus = r.status;
    r.status = newStatus;
    r.reviewer = actor || null;
    r.reviewedAt = r.reviewedAt || nowIso();
    if (newStatus === 'accepted_for_bookkeeping' || newStatus === 'rejected_with_reason') {
      r.decidedAt = nowIso();
    }
    r.updatedAt = nowIso();
    r.history.push({ at: nowIso(), action: 'status_changed', by: actor, oldStatus, newStatus, reason });
    if (reason) r.notes.push({ at: nowIso(), by: actor, text: String(reason).slice(0, 2000), context: 'status_change' });
    await persist();
    if (newStatus === 'reviewed') audit('cf.review.marked_reviewed', { reviewId: r.id, batchId, oldStatus, actor });
    else if (newStatus === 'needs_correction') audit('cf.review.needs_correction', { reviewId: r.id, batchId, reason, actor });
    else if (newStatus === 'accepted_for_bookkeeping') audit('cf.review.accepted_for_bookkeeping', { reviewId: r.id, batchId, actor });
    else if (newStatus === 'rejected_with_reason') audit('cf.review.rejected', { reviewId: r.id, batchId, reason, actor });
    return { ...r };
  }

  async function addNote({ batchId, text, actor } = {}) {
    const r = data.reviews.find((x) => x.batchId === batchId);
    if (!r) throw new Error('review finns ej för batch');
    if (!text || !String(text).trim()) throw new Error('text krävs');
    const note = { at: nowIso(), by: actor, text: String(text).slice(0, 5000), context: 'note' };
    r.notes.push(note);
    r.updatedAt = nowIso();
    await persist();
    audit('cf.review.note_added', { reviewId: r.id, batchId, noteLength: note.text.length, actor });
    return { ...r };
  }

  async function recordDownload({ batchId, fileType, sizeBytes, actor } = {}) {
    const r = data.reviews.find((x) => x.batchId === batchId);
    if (!r) {
      // Skapa stub på download-tid om review ej finns ännu
      await getOrCreateForBatch({ batchId, actor });
    }
    audit('cf.review.export_downloaded', { batchId, fileType, sizeBytes, actor });
    return { ok: true };
  }

  async function attachManifest({ batchId, manifestKey, packageKey, attachmentKeys, actor } = {}) {
    const r = data.reviews.find((x) => x.batchId === batchId);
    if (!r) throw new Error('review finns ej för batch');
    r.manifestKey = manifestKey || r.manifestKey;
    r.packageKey = packageKey || r.packageKey;
    if (Array.isArray(attachmentKeys)) r.attachmentKeys = [...attachmentKeys];
    r.updatedAt = nowIso();
    await persist();
    return { ...r };
  }

  function getByBatchId(batchId) {
    return data.reviews.find((r) => r.batchId === batchId) || null;
  }

  function listReviews({ status, reviewerId, batchId, limit = 500 } = {}) {
    let list = [...data.reviews];
    if (status) list = list.filter((r) => r.status === status);
    if (batchId) list = list.filter((r) => r.batchId === batchId);
    if (reviewerId) list = list.filter((r) => r.reviewer?.userId === reviewerId);
    list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return list.slice(0, Math.max(1, Math.min(2000, limit)));
  }

  function summary() {
    const byStatus = {};
    let total = 0;
    let pendingCount = 0;
    let acceptedCount = 0;
    let needsCorrectionCount = 0;
    let rejectedCount = 0;
    let reviewedCount = 0;
    let latestActivityAt = null;
    for (const r of data.reviews) {
      total += 1;
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      if (r.status === 'pending') pendingCount += 1;
      else if (r.status === 'reviewed') reviewedCount += 1;
      else if (r.status === 'accepted_for_bookkeeping') acceptedCount += 1;
      else if (r.status === 'needs_correction') needsCorrectionCount += 1;
      else if (r.status === 'rejected_with_reason') rejectedCount += 1;
      if (!latestActivityAt || r.updatedAt > latestActivityAt) latestActivityAt = r.updatedAt;
    }
    return {
      total, byStatus,
      pendingCount, reviewedCount, acceptedCount,
      needsCorrectionCount, rejectedCount,
      latestActivityAt,
    };
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    VALID_REVIEW_STATUSES,
    getOrCreateForBatch, setStatus, addNote,
    recordDownload, attachManifest,
    getByBatchId, listReviews, summary,
  };
}

module.exports = {
  createCcoFinanceReviewStore,
  VALID_REVIEW_STATUSES,
  SCHEMA_VERSION,
};
