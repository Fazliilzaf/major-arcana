'use strict';

/**
 * ORD-102 · Kortavstämning — Amex-CSV in, matchning mot cfoExpenses.
 *
 * Ägar-GO 2026-08-21: kortens CSV-export (SAS Elite ····86005 + Platinum
 * ····61008, hela 2026) ska stämmas av mot utgifterna i CFO så revisorn får
 * komplett kort-mot-kvitto-avstämning och omatchade dragningar flaggas som
 * "saknar kvitto".
 *
 * Design-lås:
 *  - Importen skapar ALDRIG utgifter — bara kortdragningar + matchstatus.
 *  - Auto-match endast vid entydig träff (belopp ±1 kr, datum ±7 dagar,
 *    exakt en kandidat). Allt annat blir förslag som ägaren bekräftar.
 *  - Dedupe på (kort, datum, beskrivning, belopp, ordinal) — samma fil kan
 *    importeras om utan dubbletter; nya rader i en senare export kommer med.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MATCH_AMOUNT_TOLERANCE_SEK = 1.0;
const MATCH_DATE_TOLERANCE_DAYS = 7;
const SUGGEST_DATE_TOLERANCE_DAYS = 14;

function nowIso() {
  return new Date().toISOString();
}
function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function sha12(v) {
  return crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 12);
}

/** "2 404,95" / "-52 166,47" / "19,00" → Number (SEK). */
function parseSwedishAmount(raw) {
  const cleaned = String(raw || '')
    .replace(/["\s  ]/g, '')
    .replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Amex-datum MM/DD/YYYY → YYYY-MM-DD. */
function parseAmexDate(raw) {
  const m = String(raw || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1]}-${m[2]}`;
}

/** Enkel CSV-radsplit som respekterar citattecken (Amex citerar beloppet). */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Parsa Amex aktivitets-CSV ("Datum,Beskrivning,Belopp").
 * Returnerar { transactions, skipped } — betalningar/krediter (negativa
 * belopp) blir type 'credit' och deltar inte i matchningen.
 */
function parseAmexCsv(csvText, { cardRef } = {}) {
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const transactions = [];
  let skipped = 0;
  const ordinalSeen = new Map();
  for (const line of lines) {
    if (/^datum,/i.test(line)) continue; // header
    const cols = splitCsvLine(line);
    if (cols.length < 3) {
      skipped++;
      continue;
    }
    const date = parseAmexDate(cols[0]);
    const description = normalizeText(cols[1]).replace(/\s{2,}/g, ' ');
    const amountSek = parseSwedishAmount(cols[cols.length - 1]);
    if (!date || !description || amountSek === null) {
      skipped++;
      continue;
    }
    const baseKey = `${cardRef}|${date}|${description}|${amountSek.toFixed(2)}`;
    const ordinal = (ordinalSeen.get(baseKey) || 0) + 1;
    ordinalSeen.set(baseKey, ordinal);
    transactions.push({
      cardRef: normalizeText(cardRef) || 'okänt-kort',
      date,
      description,
      amountSek,
      type: amountSek < 0 ? 'credit' : 'charge',
      dedupeKey: sha12(`${baseKey}|${ordinal}`),
    });
  }
  return { transactions, skipped };
}

function daysBetween(a, b) {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Infinity;
  return Math.abs(da - db) / 86400000;
}

function normalizeSupplier(v) {
  return normalizeText(v)
    .toLowerCase()
    .replace(/[^a-zåäö0-9]+/g, ' ')
    .trim();
}

/** Grov leverantörslikhet: något ord (≥4 tecken) förekommer i båda. */
function supplierHint(txDescription, supplier) {
  const a = normalizeSupplier(txDescription);
  const b = normalizeSupplier(supplier);
  if (!a || !b) return false;
  const words = b.split(' ').filter((w) => w.length >= 4);
  return words.some((w) => a.includes(w));
}

function createCardReconciliation({ filePath, expenseStore }) {
  if (!filePath) throw new Error('filePath krävs');
  let state = { version: 1, createdAt: nowIso(), updatedAt: nowIso(), transactions: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (raw && Array.isArray(raw.transactions)) state = raw;
  } catch {
    /* ny store */
  }

  async function persist() {
    state.updatedAt = nowIso();
    const tmp = `${filePath}.tmp`;
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(tmp, JSON.stringify(state), 'utf8');
    await fs.promises.rename(tmp, filePath);
  }

  function listExpensesForMatching() {
    const all =
      typeof expenseStore.listExpenses === 'function'
        ? expenseStore.listExpenses({ limit: 1000 })
        : [];
    const rows = Array.isArray(all) ? all : all?.items || [];
    return rows.filter((e) => e && e.status !== 'rejected' && Number.isFinite(Number(e.amountSek)));
  }

  function findCandidates(tx, expenses, matchedExpenseIds) {
    return expenses.filter((e) => {
      if (matchedExpenseIds.has(e.id)) return false;
      const amountOk = Math.abs(Number(e.amountSek) - tx.amountSek) <= MATCH_AMOUNT_TOLERANCE_SEK;
      if (!amountOk) return false;
      const d = normalizeText(e.date);
      if (!d) return true; // utgift utan datum: beloppsträff räcker som kandidat
      return daysBetween(d, tx.date) <= SUGGEST_DATE_TOLERANCE_DAYS;
    });
  }

  /** Importera parsade transaktioner. Dedupe på dedupeKey. */
  async function importTransactions(transactions) {
    const existing = new Set(state.transactions.map((t) => t.dedupeKey));
    let imported = 0;
    let duplicates = 0;
    for (const tx of transactions) {
      if (existing.has(tx.dedupeKey)) {
        duplicates++;
        continue;
      }
      existing.add(tx.dedupeKey);
      state.transactions.push({
        id: crypto.randomUUID(),
        ...tx,
        matchStatus: tx.type === 'credit' ? 'ignored' : 'unmatched',
        matchedExpenseId: null,
        matchKind: null,
        ignoreReason: tx.type === 'credit' ? 'kredit/betalning — ingår ej i avstämning' : null,
        importedAt: nowIso(),
      });
      imported++;
    }
    await persist();
    return { imported, duplicates };
  }

  /**
   * Kör matchning: entydiga träffar auto-matchas, flera kandidater blir
   * förslag (suggestions). Redan matchade rader och krediter lämnas orörda.
   */
  async function runMatching() {
    const expenses = listExpensesForMatching();
    const matchedExpenseIds = new Set(
      state.transactions.filter((t) => t.matchedExpenseId).map((t) => t.matchedExpenseId)
    );
    let autoMatched = 0;
    let suggested = 0;
    for (const tx of state.transactions) {
      if (tx.matchStatus !== 'unmatched') continue;
      const candidates = findCandidates(tx, expenses, matchedExpenseIds);
      const strong = candidates.filter(
        (e) => normalizeText(e.date) && daysBetween(e.date, tx.date) <= MATCH_DATE_TOLERANCE_DAYS
      );
      if (strong.length === 1) {
        tx.matchStatus = 'matched';
        tx.matchedExpenseId = strong[0].id;
        tx.matchKind = 'auto';
        tx.matchedAt = nowIso();
        matchedExpenseIds.add(strong[0].id);
        autoMatched++;
      } else if (candidates.length > 0) {
        tx.suggestions = candidates.slice(0, 5).map((e) => ({
          expenseId: e.id,
          supplier: e.supplier || null,
          amountSek: e.amountSek,
          date: e.date || null,
          supplierHint: supplierHint(tx.description, e.supplier || ''),
        }));
        suggested++;
      }
    }
    await persist();
    return { autoMatched, suggested };
  }

  async function confirmMatch(txId, expenseId, { actor } = {}) {
    const tx = state.transactions.find((t) => t.id === txId);
    if (!tx) return null;
    tx.matchStatus = 'matched';
    tx.matchedExpenseId = normalizeText(expenseId);
    tx.matchKind = 'manual';
    tx.matchedBy = actor || null;
    tx.matchedAt = nowIso();
    delete tx.suggestions;
    await persist();
    return tx;
  }

  async function ignoreTransaction(txId, { reason, actor } = {}) {
    const tx = state.transactions.find((t) => t.id === txId);
    if (!tx) return null;
    tx.matchStatus = 'ignored';
    tx.ignoreReason = normalizeText(reason) || 'ägar-beslut';
    tx.matchedBy = actor || null;
    delete tx.suggestions;
    await persist();
    return tx;
  }

  function stats() {
    const charges = state.transactions.filter((t) => t.type === 'charge');
    const by = (s) => charges.filter((t) => t.matchStatus === s);
    const sum = (rows) => Math.round(rows.reduce((a, t) => a + t.amountSek, 0) * 100) / 100;
    const unmatched = by('unmatched');
    return {
      totalCharges: charges.length,
      matched: by('matched').length,
      unmatched: unmatched.length,
      ignored: by('ignored').length,
      unmatchedSumSek: sum(unmatched),
      cards: [...new Set(state.transactions.map((t) => t.cardRef))],
    };
  }

  function listTransactions({ status = null, limit = 200 } = {}) {
    let rows = state.transactions.filter((t) => t.type === 'charge');
    if (status) rows = rows.filter((t) => t.matchStatus === status);
    return rows
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, Math.max(1, limit));
  }

  return {
    importTransactions,
    runMatching,
    confirmMatch,
    ignoreTransaction,
    stats,
    listTransactions,
    persist,
  };
}

module.exports = { createCardReconciliation, parseAmexCsv, parseSwedishAmount, parseAmexDate };
