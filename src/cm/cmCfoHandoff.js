'use strict';

/**
 * ORD-63 · CM→CFO expense-handoff.
 *
 * CM är intagsmotorn (mail/foto/uppladdning → kandidat). CFO (cfoExpenseStore)
 * äger hela livscykeln (granska → godkänn → exportera → rapport → Fortnox).
 * Denna modul äger fältmappningen CM-kandidat → cfoExpense.
 *
 * Kontrakt: docs/handover/ORDERS/ORD-63-cm-cfo-expense-kontrakt.md
 * Ingen auto-promote — människa godkänner (CEM-principen).
 */

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

// Fritext-kategori från AI-extraktionen → cfoExpenseStore.VALID_CATEGORIES.
// Ingen träff → null (CFO sätter status new/needs_review och människan kategoriserar).
const CATEGORY_SYNONYMS = Object.freeze({
  resor: 'resor',
  resa: 'resor',
  travel: 'resor',
  taxi: 'resor',
  flyg: 'resor',
  hotell: 'resor',
  hotel: 'resor',
  tag: 'resor',
  parkering: 'resor',
  programvara: 'it_telefoni',
  mjukvara: 'it_telefoni',
  software: 'it_telefoni',
  it: 'it_telefoni',
  telefoni: 'it_telefoni',
  telefon: 'it_telefoni',
  abonnemang: 'it_telefoni',
  subscription: 'it_telefoni',
  saas: 'it_telefoni',
  kontorsmaterial: 'forbrukning',
  forbrukning: 'forbrukning',
  forbrukningsmaterial: 'forbrukning',
  behandlingsmaterial: 'forbrukning',
  material: 'forbrukning',
  utrustning: 'utrustning',
  equipment: 'utrustning',
  verktyg: 'utrustning',
  lokal: 'lokal',
  hyra: 'lokal',
  el: 'lokal',
  stadning: 'lokal',
  marknadsforing: 'marknadsforing',
  marketing: 'marknadsforing',
  annonsering: 'marknadsforing',
  reklam: 'marknadsforing',
  ads: 'marknadsforing',
  utbildning: 'utbildning',
  kurs: 'utbildning',
  konferens: 'utbildning',
  mat: 'mat_representation',
  representation: 'mat_representation',
  lunch: 'mat_representation',
  restaurang: 'mat_representation',
  fika: 'mat_representation',
  forsakring: 'forsakring',
  juridik: 'juridik_konsult',
  konsult: 'juridik_konsult',
  advokat: 'juridik_konsult',
  revision: 'juridik_konsult',
  redovisning: 'juridik_konsult',
  bank: 'bank_finansiell',
  bankavgift: 'bank_finansiell',
  ranta: 'bank_finansiell',
  skatt: 'skatter_avgifter',
  avgift: 'skatter_avgifter',
  moms: 'skatter_avgifter',
  administration: 'administrativ',
  administrativ: 'administrativ',
  porto: 'administrativ',
  personal: 'personal',
  lon: 'personal',
});

function foldSwedish(value) {
  return normalizeText(value).toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o');
}

function mapCategory(rawCategory, validCategories) {
  const folded = foldSwedish(rawCategory);
  if (!folded) return null;
  if (validCategories.includes(folded)) return folded;
  if (CATEGORY_SYNONYMS[folded]) return CATEGORY_SYNONYMS[folded];
  // Ordvis matchning ("resor och logi" → resor)
  for (const word of folded.split(/[^a-z_]+/)) {
    if (validCategories.includes(word)) return word;
    if (CATEGORY_SYNONYMS[word]) return CATEGORY_SYNONYMS[word];
  }
  return null;
}

/**
 * Bygg cfoExpense-fields ur ett CM-expense-record (+ ev. kopplade dokument).
 * validCategories = cfoExpenseStore.VALID_CATEGORIES (skickas in för att slippa hård koppling).
 */
function buildCfoExpenseFields({ record, documents = [], validCategories = [] } = {}) {
  if (!record || typeof record !== 'object') throw new Error('record krävs');

  const amountSek =
    record.amountIncVat || (record.amountExVat || 0) + (record.vatAmount || 0) || null;

  const attachmentKeys = documents.map((d) => normalizeText(d?.storagePath)).filter(Boolean);

  const refParts = [
    record.expenseType ? `typ ${record.expenseType}` : null,
    record.invoiceNumber ? `faktura ${record.invoiceNumber}` : null,
    record.receiptNumber ? `kvitto ${record.receiptNumber}` : null,
    record.orderNumber ? `order ${record.orderNumber}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const notes =
    `CM-import: ${refParts || 'utan referens'} · cm-record ${record.id}` +
    ` · confidence ${Number(record.confidenceScore) || 0}`;

  return {
    supplier: normalizeText(record.supplierName) || null,
    amountSek: amountSek === null ? null : Number(amountSek),
    vatSek:
      record.vatAmount === undefined || record.vatAmount === null
        ? null
        : Number(record.vatAmount) || null,
    date: normalizeText(record.date) || null,
    category: mapCategory(record.category, validCategories),
    notes,
    attachmentKeys,
  };
}

/**
 * Recovery-lookup (Bugbot HIGH, PR #831): notes-fältet bär `cm-record <id>` —
 * finns redan en CFO-expense för recordet (t.ex. efter persist-krasch mellan
 * createExpense och markHandedOff) återanvänds den i stället för att dubblera.
 */
async function findExistingCfoExpenseForRecord({ record, cfoExpenseStore }) {
  if (typeof cfoExpenseStore?.listExpenses !== 'function') return null;
  const marker = `cm-record ${record.id}`;
  const listed = await cfoExpenseStore.listExpenses({});
  const rows = Array.isArray(listed) ? listed : listed?.expenses || [];
  return rows.find((e) => typeof e?.notes === 'string' && e.notes.includes(marker)) || null;
}

/**
 * Promota ett CM-record till CFO. Idempotent två vägar:
 *  1. record.cfoExpenseId satt → already_promoted.
 *  2. CFO-expense med `cm-record <id>` i notes finns redan → återanvänds
 *     (reused: true) i stället för att skapa dubblett.
 * Muterar INTE CM-storen — anroparen (routen) sätter handed_off via cmStore.markHandedOff.
 */
async function promoteRecordToCfo({
  record,
  documents = [],
  cfoExpenseStore,
  actor,
  validCategories: providedCategories,
} = {}) {
  if (!cfoExpenseStore || typeof cfoExpenseStore.createExpense !== 'function') {
    return { ok: false, error: 'cfoExpenseStore saknas — promote kräver CFO-storen' };
  }
  if (record.cfoExpenseId) {
    return { ok: false, error: 'already_promoted', cfoExpenseId: record.cfoExpenseId };
  }
  const existing = await findExistingCfoExpenseForRecord({ record, cfoExpenseStore });
  if (existing) {
    return { ok: true, cfoExpense: existing, reused: true };
  }
  const validCategories =
    Array.isArray(providedCategories) && providedCategories.length
      ? providedCategories
      : Array.isArray(cfoExpenseStore.VALID_CATEGORIES)
        ? cfoExpenseStore.VALID_CATEGORIES
        : [];
  const fields = buildCfoExpenseFields({ record, documents, validCategories });
  const cfoExpense = await cfoExpenseStore.createExpense({ actor, fields });
  return { ok: true, cfoExpense, fields, reused: false };
}

module.exports = {
  buildCfoExpenseFields,
  promoteRecordToCfo,
  findExistingCfoExpenseForRecord,
  mapCategory,
  CATEGORY_SYNONYMS,
};
