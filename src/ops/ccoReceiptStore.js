/**
 * ccoReceiptStore — Sprint CF.2 (MVP 1)
 *
 * Kvitto-store för Chief of Finance.
 * Receipts hamnar ALDRIG i repo — bara secure storage + JSON-metadata i data/cco/.
 *
 * Status-machine: new → needs_review → categorized → exported
 *                                 ↓
 *                              rejected
 *
 * Audit-kinds:
 *  - cf.receipt.uploaded
 *  - cf.receipt.updated
 *  - cf.receipt.categorized
 *  - cf.receipt.rejected
 *  - cf.receipt.exported
 *
 * sourceSystem-värden:
 *  - manual_upload
 *  - mobile_photo
 *  - receipt_mail_import   (Cursor framåt — inte aktivt nu)
 *  - drive_import          (Cursor framåt)
 *  - fortnox_import        (framåt)
 *  - bank_csv_import       (framåt)
 *  - swish_import          (framåt)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = '1.0.0';

const VALID_STATUSES = Object.freeze([
  'new',
  'needs_review',
  'categorized',
  'exported',
  'rejected',
]);

const VALID_SOURCE_SYSTEMS = Object.freeze([
  'manual_upload',
  'mobile_photo',
  'receipt_mail_import',
  'drive_import',
  'fortnox_import',
  'bank_csv_import',
  'swish_import',
]);

const VALID_CATEGORIES = Object.freeze([
  'utrustning',           // Equipment
  'forbrukning',          // Consumables
  'lokal',                // Rent / facility
  'personal',             // Staff-related (not salary)
  'utbildning',           // Training
  'resor',                // Travel
  'mat_representation',   // Meals / entertainment
  'marknadsforing',       // Marketing
  'administrativ',        // Office / admin
  'it_telefoni',          // IT / telecom
  'forsakring',           // Insurance
  'juridik_konsult',      // Legal / consulting
  'bank_finansiell',      // Bank fees
  'skatter_avgifter',     // Taxes / fees
  'annat',                // Other
]);

function nowIso() { return new Date().toISOString(); }
function newId() { return 'rcpt_' + crypto.randomBytes(8).toString('hex'); }

async function createCcoReceiptStore({ filePath, auditLog = null, secureStorage = null } = {}) {
  if (!filePath) throw new Error('filePath krävs');
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

  let data = { schemaVersion: SCHEMA_VERSION, createdAt: nowIso(), updatedAt: nowIso(), receipts: [] };
  try {
    if (fs.existsSync(filePath)) {
      data = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
      if (!Array.isArray(data.receipts)) data.receipts = [];
    }
  } catch (err) {
    console.warn('[ccoReceiptStore] kunde inte läsa:', err.message);
  }

  async function persist() {
    data.updatedAt = nowIso();
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  function audit(kind, detail) {
    try {
      auditLog?.append?.({
        // CF.3 P2-C workaround: ccoAuditLog läser action; vi skickar båda.
        action: kind, kind,
        surface: 'cco.cf.receipt',
        ts: nowIso(),
        actor: detail?.actor || { role: 'system' },
        target: { kind: 'receipt', id: detail?.receiptId },
        detail,
      });
    } catch {}
  }

  /**
   * Lägg upp nytt kvitto.
   * @param {object} input
   * @param {Buffer} input.buffer — filinnehåll (sparas i secure storage)
   * @param {string} input.mimeType — t.ex. 'application/pdf' eller 'image/jpeg'
   * @param {string} input.originalFileName
   * @param {object} input.actor — { userId, role }
   * @param {string} [input.sourceSystem='manual_upload']
   * @param {object} [input.metadata] — { supplier, amountSek, date, vatSek, category, notes, customerId, encounterId, treatmentId }
   */
  async function uploadReceipt({ buffer, mimeType, originalFileName, actor, sourceSystem = 'manual_upload', metadata = {} } = {}) {
    if (!buffer || !(Buffer.isBuffer(buffer))) throw new Error('buffer krävs');
    if (!secureStorage) throw new Error('secureStorage krävs för uppladdning');
    if (!VALID_SOURCE_SYSTEMS.includes(sourceSystem)) {
      throw new Error(`Okänd sourceSystem: ${sourceSystem}`);
    }
    const sha = crypto.createHash('sha256').update(buffer).digest('hex');
    const ext = (mimeType || '').toLowerCase().includes('pdf') ? 'pdf'
      : (mimeType || '').toLowerCase().includes('png') ? 'png'
      : (mimeType || '').toLowerCase().includes('webp') ? 'webp' : 'jpg';
    const id = newId();
    const ym = new Date().toISOString().slice(0, 7);
    const storageKey = `receipts/${ym}/${sha.slice(0, 8)}-${id}.${ext}`;
    await secureStorage.putObject(storageKey, buffer, { mimeType });

    const receipt = {
      id,
      status: 'new',
      sourceSystem,
      storageKey,
      checksum: sha,
      sizeBytes: buffer.length,
      mimeType: mimeType || 'application/octet-stream',
      originalFileName: String(originalFileName || '').slice(0, 200),
      supplier: metadata.supplier || null,
      amountSek: typeof metadata.amountSek === 'number' ? metadata.amountSek : null,
      vatSek: typeof metadata.vatSek === 'number' ? metadata.vatSek : null,
      date: metadata.date || null,
      category: metadata.category && VALID_CATEGORIES.includes(metadata.category) ? metadata.category : null,
      notes: String(metadata.notes || '').slice(0, 2000),
      customerId: metadata.customerId || null,
      encounterId: metadata.encounterId || null,
      treatmentId: metadata.treatmentId || null,
      offerId: metadata.offerId || null,
      uploadedAt: nowIso(),
      uploadedBy: actor || null,
      updatedAt: nowIso(),
      history: [{ status: 'new', at: nowIso(), by: actor }],
    };
    data.receipts.push(receipt);
    await persist();
    audit('cf.receipt.uploaded', { receiptId: id, sourceSystem, sha256: sha, sizeBytes: buffer.length, actor });
    return { ...receipt };
  }

  async function updateReceipt({ id, patch = {}, actor } = {}) {
    const r = data.receipts.find((x) => x.id === id);
    if (!r) throw new Error('receipt finns ej');
    const allowed = ['supplier', 'amountSek', 'vatSek', 'date', 'category', 'notes', 'customerId', 'encounterId', 'treatmentId', 'offerId'];
    // CF.2-fix 2026-06-01 (Extra P3): validera category mot VALID_CATEGORIES
    // på samma sätt som uploadReceipt — annars kan UI:t skriva fritext som
    // category vilket skulle bryta byCategory-summary.
    if ('category' in patch && patch.category !== null && !VALID_CATEGORIES.includes(patch.category)) {
      throw new Error(`Okänd category: ${patch.category}. Tillåtna: ${VALID_CATEGORIES.join(', ')}`);
    }
    for (const k of allowed) {
      if (k in patch) r[k] = patch[k];
    }
    if (r.category && r.status === 'new') {
      r.status = 'categorized';
      r.history.push({ status: 'categorized', at: nowIso(), by: actor });
      audit('cf.receipt.categorized', { receiptId: id, category: r.category, actor });
    }
    r.updatedAt = nowIso();
    await persist();
    audit('cf.receipt.updated', { receiptId: id, fields: Object.keys(patch), actor });
    return { ...r };
  }

  async function transitionStatus({ id, newStatus, reason, actor } = {}) {
    if (!VALID_STATUSES.includes(newStatus)) throw new Error('okänd status: ' + newStatus);
    const r = data.receipts.find((x) => x.id === id);
    if (!r) throw new Error('receipt finns ej');
    const oldStatus = r.status;
    r.status = newStatus;
    r.updatedAt = nowIso();
    r.history.push({ status: newStatus, at: nowIso(), by: actor, reason: reason || null });
    await persist();
    if (newStatus === 'rejected') audit('cf.receipt.rejected', { receiptId: id, oldStatus, reason, actor });
    else if (newStatus === 'exported') audit('cf.receipt.exported', { receiptId: id, oldStatus, actor });
    else audit('cf.receipt.updated', { receiptId: id, oldStatus, newStatus, actor });
    return { ...r };
  }

  function listReceipts({ status, sourceSystem, customerId, limit = 200 } = {}) {
    let list = [...data.receipts];
    if (status) list = list.filter((r) => r.status === status);
    if (sourceSystem) list = list.filter((r) => r.sourceSystem === sourceSystem);
    if (customerId) list = list.filter((r) => r.customerId === customerId);
    list.sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
    return list.slice(0, Math.max(1, Math.min(1000, limit)));
  }

  function getById(id) { return data.receipts.find((r) => r.id === id) || null; }

  function summary() {
    const byStatus = {};
    const byCategory = {};
    const bySource = {};
    let totalAmount = 0;
    for (const r of data.receipts) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      if (r.category) byCategory[r.category] = (byCategory[r.category] || 0) + 1;
      bySource[r.sourceSystem] = (bySource[r.sourceSystem] || 0) + 1;
      if (typeof r.amountSek === 'number') totalAmount += r.amountSek;
    }
    return {
      total: data.receipts.length,
      byStatus, byCategory, bySource,
      totalAmountSek: totalAmount,
      needsReviewCount: (byStatus.new || 0) + (byStatus.needs_review || 0),
    };
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    VALID_STATUSES, VALID_SOURCE_SYSTEMS, VALID_CATEGORIES,
    uploadReceipt, updateReceipt, transitionStatus,
    listReceipts, getById, summary,
  };
}

module.exports = {
  createCcoReceiptStore,
  VALID_STATUSES,
  VALID_SOURCE_SYSTEMS,
  VALID_CATEGORIES,
  SCHEMA_VERSION,
};
