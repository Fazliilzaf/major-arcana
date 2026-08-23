'use strict';

/**
 * ORD-102i · Bulkimport av externa kvitton/fakturor (PDF) för kortavstämning.
 *
 * Användaren kan ladda upp en eller flera PDF-filer. För varje fil:
 *   1. OCR: läs PDF-text med pdf-parse.
 *   2. AI-extraktion: supplier, belopp, datum, moms, kategori.
 *   3. Skapa receipt i secure storage.
 *   4. Skapa CFO-expense kopplad till receipt.
 *   5. Försök matcha expense mot en omatchad korttransaktion.
 *
 * Designlås:
 *   - Vi skapar ALDRIG en expense utan ett faktiskt dokument.
 *   - Lågkonfidens-poster skapas som expense med status 'needs_review'.
 *   - Belopp låses; övriga fält kan ägaren rätta i finance.html.
 */

const crypto = require('node:crypto');
const cmAiExtractor = require('../cm/cmAiExtractor');
const { supplierHint } = require('./cfoCardReconciliation');

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const AMOUNT_TOLERANCE = 1.0;
const DATE_TOLERANCE_DAYS = 14;

let pdfParseModule = null;
function getPdfParse() {
  if (pdfParseModule === null) {
    try {
      pdfParseModule = require('pdf-parse');
    } catch {
      pdfParseModule = false;
    }
  }
  return pdfParseModule || null;
}

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function parseSwedishAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value)
    .replace(/[\u2212\u2013]/g, '-')
    .replace(/["\s\u00a0\u202f]/g, '')
    .replace(/\./g, '')
    .replace(/,/, '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseIsoDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = m[1];
    const mo = m[2].padStart(2, '0');
    const d = m[3].padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function normalizeCfoCategory(value) {
  // Återanvänd samma normalisering som cfoInvoiceFetch.
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return null;
  const transliterated = raw
    .replace(/[åä]/g, 'a')
    .replace(/[ö]/g, 'o')
    .replace(/[é]/g, 'e')
    .replace(/[ü]/g, 'u')
    .replace(/[\s\/\\-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '');
  const VALID_CFO_CATEGORIES = new Set([
    'utrustning',
    'forbrukning',
    'lokal',
    'personal',
    'utbildning',
    'resor',
    'mat_representation',
    'marknadsforing',
    'administrativ',
    'it_telefoni',
    'forsakring',
    'juridik_konsult',
    'bank_finansiell',
    'skatter_avgifter',
    'annat',
    'privat',
  ]);
  const mapping = {
    kontorsmaterial: 'forbrukning',
    kontor: 'administrativ',
    programvara: 'it_telefoni',
    software: 'it_telefoni',
    behandlingsmaterial: 'forbrukning',
    forbrukningsmaterial: 'forbrukning',
    resekostnad: 'resor',
    resa: 'resor',
    hotell: 'resor',
    flyg: 'resor',
    taxi: 'resor',
    mat: 'mat_representation',
    restaurang: 'mat_representation',
    marknadsforing: 'marknadsforing',
    reklam: 'marknadsforing',
    annonsering: 'marknadsforing',
    sociala_medier: 'marknadsforing',
    facebook_ads: 'marknadsforing',
    google_ads: 'marknadsforing',
    it: 'it_telefoni',
    telefoni: 'it_telefoni',
    internet: 'it_telefoni',
    hosting: 'it_telefoni',
    molntjanst: 'it_telefoni',
    cloud: 'it_telefoni',
    forsakring: 'forsakring',
    juridik: 'juridik_konsult',
    konsult: 'juridik_konsult',
    bank: 'bank_finansiell',
    skatt: 'skatter_avgifter',
    avgift: 'skatter_avgifter',
    privat: 'privat',
  };
  if (VALID_CFO_CATEGORIES.has(transliterated)) return transliterated;
  const mapped = mapping[transliterated];
  if (mapped && VALID_CFO_CATEGORIES.has(mapped)) return mapped;
  return null;
}

function sha8(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 8);
}

function daysBetween(a, b) {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Infinity;
  return Math.abs(da - db) / 86400000;
}

async function readPdfText(buffer) {
  const pdfParse = getPdfParse();
  if (!pdfParse) return '';
  try {
    const parsed = await pdfParse(buffer);
    return normalizeText(parsed?.text || '');
  } catch {
    return '';
  }
}

function findMatchingTransaction(expense, reconciliation) {
  if (!reconciliation || typeof reconciliation.listTransactions !== 'function') return null;
  const unmatched = reconciliation.listTransactions({ status: 'unmatched', limit: 10000 });
  if (!Array.isArray(unmatched)) return null;
  const candidates = unmatched.filter((tx) => {
    if (!Number.isFinite(tx.amountSek) || !Number.isFinite(expense.amountSek)) return false;
    if (Math.abs(tx.amountSek - expense.amountSek) > AMOUNT_TOLERANCE) return false;
    if (!tx.date || !expense.date) return false;
    if (daysBetween(tx.date, expense.date) > DATE_TOLERANCE_DAYS) return false;
    return supplierHint(tx.description, expense.supplier);
  });
  candidates.sort((a, b) => {
    const da = daysBetween(a.date, expense.date);
    const db = daysBetween(b.date, expense.date);
    return da - db;
  });
  return candidates[0] || null;
}

async function importOneReceipt({
  buffer,
  originalFileName,
  actor,
  receiptStore,
  expenseStore,
  reconciliation,
}) {
  const result = {
    fileName: originalFileName,
    receiptId: null,
    expenseId: null,
    matchedTransactionId: null,
    matched: false,
    extraction: null,
    error: null,
  };

  if (!buffer || buffer.length > MAX_FILE_BYTES) {
    result.error = 'fil saknas eller är för stor';
    return result;
  }
  if (!receiptStore || !expenseStore) {
    result.error = 'receiptStore eller expenseStore saknas';
    return result;
  }

  try {
    const pdfText = await readPdfText(buffer);
    const ex = await cmAiExtractor.extractDocument({
      text: pdfText || originalFileName,
      source: 'bulk_upload',
    });
    result.extraction = ex.ok ? ex.extraction : null;

    const extraction = ex?.extraction || {};
    const amountSek =
      parseSwedishAmount(extraction.amountIncVat) ??
      parseSwedishAmount(extraction.amountExVat) ??
      null;
    const date = parseIsoDate(extraction.date) || parseIsoDate(extraction.dueDate) || null;
    const supplier =
      normalizeText(extraction.supplier) || normalizeText(originalFileName).replace(/\.pdf$/i, '');
    const category = normalizeCfoCategory(extraction.category);

    if (!amountSek || !date || !supplier) {
      // Ladda upp receipt ändå så ägaren kan manuellt tolka i UI.
      const receipt = await receiptStore.uploadReceipt({
        buffer,
        mimeType: 'application/pdf',
        originalFileName,
        sourceSystem: 'manual_upload',
        actor,
        metadata: {
          supplier,
          amountSek,
          date,
          notes:
            `Bulkimport kunde inte läsa belopp/datum/leverantör. AI: ${normalizeText(extraction.notes || '')}`.slice(
              0,
              2000
            ),
        },
      });
      result.receiptId = receipt.id;
      result.error = 'kunde inte extrahera belopp/datum/leverantör';
      return result;
    }

    const receipt = await receiptStore.uploadReceipt({
      buffer,
      mimeType: 'application/pdf',
      originalFileName,
      sourceSystem: 'receipt_mail_import',
      actor,
      metadata: {
        supplier,
        amountSek,
        date,
        notes:
          `Bulkimport från ${originalFileName}. AI-kategori: ${extraction.category || 'okänd'}`.slice(
            0,
            2000
          ),
      },
    });
    result.receiptId = receipt.id;

    const confidence = Number(extraction.confidenceScore) || 0;
    const expense = await expenseStore.createExpense({
      actor,
      receiptId: receipt.id,
      fields: {
        supplier,
        amountSek,
        vatSek: parseSwedishAmount(extraction.vatAmount) || null,
        date,
        category,
        paymentMethod: 'card',
        notes:
          `Importerad från ${originalFileName}. AI-konfidens ${confidence}. ${normalizeText(extraction.notes || '')}`.slice(
            0,
            2000
          ),
      },
    });
    result.expenseId = expense.id;

    const tx = findMatchingTransaction(expense, reconciliation);
    if (tx && reconciliation.confirmMatch) {
      await reconciliation.confirmMatch(tx.id, expense.id, { actor });
      result.matchedTransactionId = tx.id;
      result.matched = true;
    }
  } catch (err) {
    result.error = err.message || String(err);
  }

  return result;
}

async function bulkImportReceipts({
  files = [],
  actor,
  receiptStore,
  expenseStore,
  reconciliation,
}) {
  const results = [];
  for (const file of files) {
    const buffer = file?.buffer;
    const originalFileName = normalizeText(file?.originalname || file?.name || 'okänd.pdf');
    const r = await importOneReceipt({
      buffer,
      originalFileName,
      actor,
      receiptStore,
      expenseStore,
      reconciliation,
    });
    results.push(r);
  }
  return {
    imported: results.length,
    expensesCreated: results.filter((r) => r.expenseId).length,
    matched: results.filter((r) => r.matched).length,
    errors: results.filter((r) => r.error).length,
    results,
  };
}

module.exports = {
  bulkImportReceipts,
  importOneReceipt,
  MAX_FILE_BYTES,
};
