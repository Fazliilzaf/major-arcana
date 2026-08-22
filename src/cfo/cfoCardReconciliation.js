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
const STRICT_AUTO_AMOUNT_TOLERANCE_SEK = 0.005;
const STRICT_AUTO_DATE_TOLERANCE_DAYS = 3;

function nowIso() {
  return new Date().toISOString();
}
function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function sha12(v) {
  return crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 12);
}

/**
 * "2 404,95" / "-52 166,47" / "10.099,19" / "19,00" → Number (SEK).
 * Bugbot PR #1466: punkt är TUSENTAL i svensk Amex-export när decimalkomma
 * finns — strippas då (samma som cmAmexMatch/ORD-CM-26). Utan komma tolkas
 * punkt som decimal.
 */
function parseSwedishAmount(raw) {
  // Amex använder Unicode-minus (U+2212) på betalningsrader — normalisera,
  // annars skippas krediterna tyst i stället för att registreras.
  let cleaned = String(raw || '')
    .replace(/[\u2212\u2013]/g, '-')
    .replace(/["\s\u00a0\u202f]/g, '');
  if (cleaned.includes(',')) cleaned = cleaned.replace(/\./g, '').replace(',', '.');
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

/**
 * Alias-tabell för vanliga betalningsbeskrivningar → kanoniskt leverantörsord.
 * Gör att t.ex. FACEBK, UBER TRIP, PAYPAL *VOITECHNOLO, APPLE.COM/BILL
 * matchar utgifternas leverantörsnamn (Meta/Facebook, Uber, Voi, Apple).
 */
const SUPPLIER_ALIASES = {
  facebk: 'facebook',
  facebook: 'facebook',
  meta: 'facebook',
  uber: 'uber',
  ubereats: 'uber',
  ubertrip: 'uber',
  voitechnolo: 'voi',
  voi: 'voi',
  apple: 'apple',
  applecom: 'apple',
  github: 'github',
  anthropic: 'anthropic',
  claude: 'anthropic',
  openai: 'openai',
  chatgpt: 'openai',
  google: 'google',
  googleone: 'google',
  googleads: 'google',
  googlecloud: 'google',
  zapier: 'zapier',
  cursor: 'cursor',
  microsoft: 'microsoft',
  msbill: 'microsoft',
  adobe: 'adobe',
  canva: 'canva',
  elevenlabs: 'elevenlabs',
  booking: 'booking',
  book: 'booking',
  sj: 'sj',
  hemkop: 'hemkop',
  hemkoep: 'hemkop',
  willys: 'willys',
  bolt: 'bolt',
  pipedrive: 'pipedrive',
  figma: 'figma',
  render: 'render',
  klm: 'klm',
  faire: 'faire',
  swiss: 'swiss',
  liseberg: 'liseberg',
  kontorsgrossisten: 'kontorsgrossisten',
};

function normalizeForTokens(v) {
  return normalizeText(v)
    .toLowerCase()
    .replace(/[^a-zåäö0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(text) {
  const raw = normalizeForTokens(text);
  const tokens = new Set();
  for (const w of raw.split(' ')) {
    if (!w) continue;
    tokens.add(SUPPLIER_ALIASES[w] || w);
  }
  // Mönsterbaserade tillägg för förkortningar som normaliseringen missar
  const lowered = normalizeText(text).toLowerCase();
  if (/\bfacebk\b|\bfacebook\b/.test(lowered)) tokens.add('facebook');
  if (/\bmeta\b|\bmeta platforms\b|\bmeta for business\b/.test(lowered)) tokens.add('facebook');
  if (/\buber\b/.test(lowered)) tokens.add('uber');
  if (/\bapple\b|\bapple\.com\b/.test(lowered)) tokens.add('apple');
  if (/\bgoogle\b|\bgoogle one\b|\bgoogle ads\b|\bgoogle cloud\b/.test(lowered))
    tokens.add('google');
  if (/\bvoi\b|\bvoitechnolo\b/.test(lowered)) tokens.add('voi');
  if (/\bgithub\b/.test(lowered)) tokens.add('github');
  if (/\banthropic\b|\bclaude\b/.test(lowered)) tokens.add('anthropic');
  if (/\bopenai\b|\bchatgpt\b/.test(lowered)) tokens.add('openai');
  if (/\bmicrosoft\b|\bmsbill\.info\b/.test(lowered)) tokens.add('microsoft');
  if (/\bkontorsgrossisten\b/.test(lowered)) tokens.add('kontorsgrossisten');
  return tokens;
}

/** Leverantörslikhet baserat på alias-normerade nyckelord. */
function supplierHint(txDescription, supplier) {
  const a = tokenSet(txDescription);
  const b = tokenSet(supplier || '');
  if (!a.size || !b.size) return false;
  for (const t of b) {
    if (a.has(t)) return true;
  }
  return false;
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
    return rows.filter(
      (e) =>
        e &&
        e.status !== 'rejected' &&
        e.status !== 'exported' &&
        e.status !== 'ready_for_export' &&
        Number.isFinite(Number(e.amountSek))
    );
  }

  function findCandidates(tx, expenses, matchedExpenseIds) {
    return expenses.filter((e) => {
      if (matchedExpenseIds.has(e.id)) return false;
      // Kräv leverantörshint för att inte föreslå slumpmässiga beloppsträffar
      if (!supplierHint(tx.description, e.supplier)) return false;
      const amountOk = Math.abs(Number(e.amountSek) - tx.amountSek) <= MATCH_AMOUNT_TOLERANCE_SEK;
      if (!amountOk) return false;
      const d = normalizeText(e.date);
      if (!d) return true; // utgift utan datum: beloppsträff räcker om leverantören stämmer
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
        pruneSuggestionsFor(strong[0].id);
        delete tx.suggestions;
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
      } else {
        // Inga giltiga kandidater längre — rensa gamla/stale förslag
        delete tx.suggestions;
      }
    }

    // Defensiv auto-accept: när det finns exakt ett förslag som uppfyller
    // stränga kriterier (exakt belopp, datum ±3 dagar, leverantörshint).
    for (const tx of state.transactions) {
      if (tx.matchStatus !== 'unmatched') continue;
      const candidates = findCandidates(tx, expenses, matchedExpenseIds);
      const strict = candidates.filter((e) => {
        const amountOk =
          Math.abs(Number(e.amountSek) - tx.amountSek) <= STRICT_AUTO_AMOUNT_TOLERANCE_SEK;
        if (!amountOk) return false;
        const d = normalizeText(e.date);
        if (!d) return false;
        return daysBetween(d, tx.date) <= STRICT_AUTO_DATE_TOLERANCE_DAYS;
      });
      if (strict.length === 1) {
        tx.matchStatus = 'matched';
        tx.matchedExpenseId = strict[0].id;
        tx.matchKind = 'auto';
        tx.matchedAt = nowIso();
        matchedExpenseIds.add(strict[0].id);
        pruneSuggestionsFor(strict[0].id);
        delete tx.suggestions;
        autoMatched++;
      }
    }

    await persist();
    return { autoMatched, suggested };
  }

  // Bugbot PR #1466: en utgift får bara matchas av EN dragning — och när en
  // utgift tas rensas den ur alla andra raders förslag (annars kan UI:t
  // erbjuda stale förslag och korrumpera kort-mot-kvitto).
  function pruneSuggestionsFor(expenseId) {
    for (const t of state.transactions) {
      if (!Array.isArray(t.suggestions)) continue;
      t.suggestions = t.suggestions.filter((s) => s.expenseId !== expenseId);
      if (t.suggestions.length === 0) delete t.suggestions;
    }
  }

  async function confirmMatch(txId, expenseId, { actor } = {}) {
    const tx = state.transactions.find((t) => t.id === txId);
    if (!tx) return null;
    const cleanId = normalizeText(expenseId);
    const taken = state.transactions.find((t) => t.id !== txId && t.matchedExpenseId === cleanId);
    if (taken) {
      return {
        error: `utgiften är redan matchad mot dragningen ${taken.description} ${taken.date}`,
      };
    }
    tx.matchStatus = 'matched';
    tx.matchedExpenseId = cleanId;
    tx.matchKind = 'manual';
    tx.matchedBy = actor || null;
    tx.matchedAt = nowIso();
    delete tx.suggestions;
    pruneSuggestionsFor(cleanId);
    await persist();
    return tx;
  }

  async function unmatchTransaction(txId, { actor, reason } = {}) {
    const tx = state.transactions.find((t) => t.id === txId);
    if (!tx) return null;
    if (tx.matchStatus !== 'matched') {
      return { error: 'transaktionen är inte matchad' };
    }
    const previousExpenseId = tx.matchedExpenseId;
    tx.matchStatus = 'unmatched';
    tx.matchedExpenseId = null;
    tx.matchKind = null;
    tx.matchedBy = actor || null;
    tx.matchedAt = null;
    tx.unmatchedAt = nowIso();
    tx.unmatchReason = normalizeText(reason) || null;
    delete tx.suggestions;
    if (previousExpenseId) pruneSuggestionsFor(previousExpenseId);
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

  // ORD-102c · Pyramid i CM-mönstret (jfr /cm/groups-tree): öppna poster
  // (unmatched + rader med förslag) grupperade år → månad → leverantör,
  // så att granskningen kan ske klumpvis i stället för rad för rad.
  function supplierLabel(text) {
    const words = normalizeText(text)
      .replace(/\s{2,}/g, ' ')
      .split(' ');
    return words.slice(0, 2).join(' ') || 'Okänd';
  }
  function groupsTree() {
    const open = state.transactions.filter(
      (t) => t.type === 'charge' && t.matchStatus === 'unmatched'
    );
    const years = new Map();
    for (const t of open) {
      const year = String(t.date || '').slice(0, 4) || 'okänt';
      const month = String(t.date || '').slice(5, 7) || '??';
      const label = supplierLabel(t.description);
      if (!years.has(year)) years.set(year, new Map());
      const months = years.get(year);
      if (!months.has(month)) months.set(month, new Map());
      const groups = months.get(month);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(t);
    }
    const round = (n) => Math.round(n * 100) / 100;
    const out = [...years.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([year, months]) => {
        const monthsOut = [...months.entries()]
          .sort((a, b) => (a[0] < b[0] ? 1 : -1))
          .map(([month, groups]) => {
            const groupsOut = [...groups.entries()]
              .map(([label, txs]) => ({
                label,
                count: txs.length,
                sum: round(txs.reduce((a, t) => a + t.amountSek, 0)),
                withSuggestions: txs.filter((t) => (t.suggestions || []).length > 0).length,
                transactions: txs
                  .slice()
                  .sort((a, b) => (a.date < b.date ? 1 : -1))
                  .map((t) => ({
                    id: t.id,
                    date: t.date,
                    description: t.description,
                    amountSek: t.amountSek,
                    cardRef: t.cardRef,
                    suggestions: t.suggestions || [],
                  })),
              }))
              .sort((a, b) => b.sum - a.sum);
            return {
              month,
              count: groupsOut.reduce((a, g) => a + g.count, 0),
              sum: round(groupsOut.reduce((a, g) => a + g.sum, 0)),
              groups: groupsOut,
            };
          });
        return {
          year,
          count: monthsOut.reduce((a, m) => a + m.count, 0),
          sum: round(monthsOut.reduce((a, m) => a + m.sum, 0)),
          months: monthsOut,
        };
      });
    return { totalOpen: open.length, years: out };
  }

  return {
    importTransactions,
    runMatching,
    confirmMatch,
    unmatchTransaction,
    ignoreTransaction,
    stats,
    listTransactions,
    groupsTree,
    persist,
  };
}

module.exports = { createCardReconciliation, parseAmexCsv, parseSwedishAmount, parseAmexDate };
