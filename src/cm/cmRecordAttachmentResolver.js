'use strict';

/**
 * ORD-117 · Välj och validera rätt bilaga för ett CM-expense-record.
 *
 * Ett mail kan innehålla flera dokument (t.ex. patientavtal + kvitto).
 * Historiskt har systemet plockat den första bilagan eller bara record.documentId,
 * vilket lett till felaktiga underlag på CFO-utgifterna.
 *
 * Denna modul:
 *  1. Hämtar alla dokument kopplade till record.rawItemId.
 *  2. Extraherar text ur PDF-bilagor.
 *  3. Väljer den bilaga som bäst matchar recordets leverantör, belopp och ämne.
 *  4. Validerar valet mot valideringsreglerna (stoppa patientavtal, lönespecar etc.).
 *  5. Returnerar storagePath + attachmentKeys redo att läggas på CFO-expense.
 */

const { scoreAttachment } = require('./cmAttachmentPicker');
const { validatePdfAttachment } = require('../cfo/cfoInvoiceValidator');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

async function extractPdfText(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null;
  let pdfParse;
  try {
    pdfParse = require('pdf-parse');
  } catch {
    return null;
  }
  try {
    const parsed = await pdfParse(buffer);
    return normalizeText(parsed?.text || '');
  } catch {
    return null;
  }
}

async function fetchDocumentBuffer({ doc, secureStorage }) {
  if (!doc?.storagePath || !secureStorage?.getObject) return null;
  try {
    const obj = await secureStorage.getObject(doc.storagePath);
    return obj?.buffer || null;
  } catch {
    return null;
  }
}

async function scoreDocument({ doc, secureStorage, record, rawItem }) {
  const buffer = await fetchDocumentBuffer({ doc, secureStorage });
  const text = buffer ? await extractPdfText(buffer) : '';
  const scoreResult = scoreAttachment({
    text: text || '',
    fileName: doc.fileName || '',
    subject: rawItem?.subject || '',
    bodyText: rawItem?.bodyText || rawItem?.bodyPreview || '',
    supplier: record.supplierName,
    amountIncVat: record.amountIncVat,
  });
  return {
    doc,
    buffer,
    text: text || '',
    score: scoreResult.score,
    reasons: scoreResult.reasons,
  };
}

function collectDocuments({ record, cmStore }) {
  const docs = [];
  const seen = new Set();
  if (record.documentId) {
    const doc = cmStore.getDocumentById?.(record.documentId);
    if (doc) {
      docs.push(doc);
      seen.add(doc.id);
    }
  }
  if (record.rawItemId && typeof cmStore.getDocumentsByRawItemId === 'function') {
    for (const doc of cmStore.getDocumentsByRawItemId(record.rawItemId)) {
      if (!seen.has(doc.id)) {
        docs.push(doc);
        seen.add(doc.id);
      }
    }
  }
  return docs;
}

async function resolveBestAttachmentForRecord({
  record,
  cmStore,
  secureStorage,
  tx = null,
  includeOriginalMail = true,
} = {}) {
  if (!record || typeof record !== 'object') {
    return { ok: false, reason: 'record_missing' };
  }
  if (!cmStore || typeof cmStore.getDocumentById !== 'function') {
    return { ok: false, reason: 'cmStore_missing' };
  }
  if (!secureStorage || typeof secureStorage.getObject !== 'function') {
    return { ok: false, reason: 'secureStorage_missing' };
  }

  const rawItem = record.rawItemId ? cmStore.getRawItemById?.(record.rawItemId) : null;
  const docs = collectDocuments({ record, cmStore });

  if (docs.length === 0) {
    const originalKey = normalizeText(rawItem?.originalStorageKey);
    if (originalKey) {
      return {
        ok: true,
        storagePath: originalKey,
        attachmentKeys: includeOriginalMail ? [originalKey] : [],
        documentId: null,
        source: 'original_mail_only',
      };
    }
    return { ok: false, reason: 'no_documents_or_original' };
  }

  const scored = await Promise.all(
    docs.map((doc) => scoreDocument({ doc, secureStorage, record, rawItem }))
  );
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const MIN_SCORE = 15;
  if (!best || best.score < MIN_SCORE) {
    // Om det bara finns ett enda dokument ska vi ändå försöka validera det
    // (stoppa t.ex. patientavtal) — resultatet blir tydligare för CFO-flödet.
    if (docs.length === 1) {
      const singleBuffer = await fetchDocumentBuffer({ doc: docs[0], secureStorage });
      if (!singleBuffer) {
        return {
          ok: false,
          reason: 'best_attachment_unreadable',
          documentId: docs[0].id,
        };
      }
      const singleValidation = await validatePdfAttachment({
        buffer: singleBuffer,
        record,
        tx,
      });
      if (!singleValidation.ok) {
        return {
          ok: false,
          reason: 'validation_failed',
          validation: singleValidation,
          documentId: docs[0].id,
          storagePath: docs[0].storagePath,
        };
      }
      const attachmentKeys = [docs[0].storagePath];
      if (includeOriginalMail) {
        const originalKey = normalizeText(rawItem?.originalStorageKey);
        if (originalKey && !attachmentKeys.includes(originalKey)) attachmentKeys.push(originalKey);
      }
      return {
        ok: true,
        storagePath: docs[0].storagePath,
        attachmentKeys,
        documentId: docs[0].id,
        source: 'single_doc_fallback',
        review: true,
        score: best?.score ?? 0,
        validation: singleValidation,
      };
    }
    return {
      ok: false,
      reason: 'no_attachment_met_minimum_score',
      candidates: scored.map((s) => ({
        id: s.doc.id,
        fileName: s.doc.fileName,
        score: s.score,
        reasons: s.reasons,
      })),
    };
  }

  if (!best.buffer) {
    return {
      ok: false,
      reason: 'best_attachment_unreadable',
      documentId: best.doc.id,
    };
  }

  const validation = await validatePdfAttachment({ buffer: best.buffer, record, tx });
  if (!validation.ok) {
    return {
      ok: false,
      reason: 'validation_failed',
      validation,
      documentId: best.doc.id,
      storagePath: best.doc.storagePath,
    };
  }

  const attachmentKeys = [best.doc.storagePath];
  if (includeOriginalMail) {
    const originalKey = normalizeText(rawItem?.originalStorageKey);
    if (originalKey && !attachmentKeys.includes(originalKey)) {
      attachmentKeys.push(originalKey);
    }
  }

  return {
    ok: true,
    storagePath: best.doc.storagePath,
    attachmentKeys,
    documentId: best.doc.id,
    source: 'validated_best_document',
    score: best.score,
    validation,
  };
}

module.exports = {
  resolveBestAttachmentForRecord,
};
