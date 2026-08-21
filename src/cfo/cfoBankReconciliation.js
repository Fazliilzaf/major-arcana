'use strict';

/**
 * ORD-103 · Bankavstämning Handelsbanken mot Fortnox-verifikat.
 *
 * Parser + store + matchningsmotor. Läser Handelsbanken-CSV, hämtar verifikat
 * från Fortnox, och matchar banktransaktioner mot verifikat på belopp + datum.
 *
 * Design-lås:
 * - Skapar aldrig verifikat i Fortnox — endast läsning.
 * - Ingen bankdata i GitHub.
 * - Osäkra matchningar lämnas som förslag eller unmatched.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseAmountSek(value) {
  if (value === null || value === undefined) return NaN;
  const cleaned = String(value).replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '.');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : NaN;
}

function parseDate(value) {
  const str = normalizeText(value);
  if (!str) return null;
  const iso = normalizeText(str).replace(/\//g, '-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return iso;
}

function computeDedupeKey(tx) {
  const raw = [tx.date, tx.reference, tx.amountSek, tx.bookingDay].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function classifyTransaction(tx) {
  const ref = normalizeText(tx.reference).toUpperCase();
  if (tx.amountSek > 0) return 'income';
  if (tx.amountSek < 0) {
    const expenseSignals = [
      'HB KORT',
      'INTERNET BET',
      'FIL BET',
      'BANKAVG',
      'BANKAVGIFTER',
      'UTLÄGG',
    ];
    if (expenseSignals.some((s) => ref.includes(s))) return 'expense';
    return 'expense';
  }
  return 'unknown';
}

function parseHandelsbankenCsv(csvText) {
  if (!csvText || typeof csvText !== 'string') {
    throw new Error('csvText krävs');
  }
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    throw new Error('CSV:n är för kort');
  }
  const transactions = [];
  // Rad 1: sep=;  Rad 2: header
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = line.split(';').map(normalizeText);
    // En Handelsbanken-rad har minst 15 kolumner. Den första transaktionsraden
    // efter headern är ofta ett summarad utan bokföringsdag — hoppa över den.
    const bookingDay = parseDate(cols[9]);
    if (!bookingDay) continue;
    const amount = parseAmountSek(cols[13]);
    if (!Number.isFinite(amount)) continue;

    const tx = {
      accountHolder: cols[0] || '',
      accountNumber: cols[1] || '',
      iban: cols[2] || '',
      bic: cols[3] || '',
      accountType: cols[4] || '',
      currency: cols[5] || 'SEK',
      bookingDay,
      ledgerDay: parseDate(cols[10]) || bookingDay,
      valueDay: parseDate(cols[11]) || bookingDay,
      reference: cols[12] || '',
      amountSek: amount,
      balanceBooked: parseAmountSek(cols[14]) || 0,
      balanceCurrent: parseAmountSek(cols[15]) || 0,
      balanceValue: parseAmountSek(cols[16]) || 0,
      swishReference: cols[17] || '',
      swishSenderId: cols[18] || '',
    };
    tx.type = classifyTransaction(tx);
    tx.dedupeKey = computeDedupeKey(tx);
    transactions.push(tx);
  }
  return transactions;
}

function createCfoBankReconciliation({
  filePath,
  stateRoot,
  secureStorage = null,
  auditLog = null,
} = {}) {
  const resolvedPath =
    filePath ||
    (stateRoot
      ? path.join(stateRoot, 'cfo-bank-reconciliation.json')
      : './data/cfo-bank-reconciliation.json');

  const state = { transactions: [], vouchers: [], importedAt: null };

  function audit(kind, detail) {
    try {
      auditLog?.append?.({
        action: kind,
        kind,
        surface: 'cco.cf.bank_reconciliation',
        ts: nowIso(),
        detail,
      });
    } catch {
      /* best effort */
    }
  }

  function load() {
    if (!fs.existsSync(resolvedPath)) return;
    try {
      const raw = fs.readFileSync(resolvedPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        state.transactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];
        state.vouchers = Array.isArray(parsed.vouchers) ? parsed.vouchers : [];
        state.importedAt = parsed.importedAt || null;
      }
    } catch (err) {
      console.warn('[bank-reconciliation] load failed:', err?.message);
    }
  }

  async function persist() {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(resolvedPath, JSON.stringify(state, null, 2));
  }

  function importTransactions(transactions) {
    if (!Array.isArray(transactions))
      return { ok: false, error: 'transactions måste vara en array' };
    let added = 0;
    let skipped = 0;
    for (const tx of transactions) {
      if (state.transactions.some((t) => t.dedupeKey === tx.dedupeKey)) {
        skipped++;
        continue;
      }
      state.transactions.push({
        id: crypto.randomUUID(),
        ...tx,
        matchStatus: 'unmatched',
        matchedVoucherId: null,
        matchedVoucherNumber: null,
        matchedVoucherSeries: null,
        matchKind: null,
        suggestions: [],
        ignoreReason: null,
        importedAt: nowIso(),
      });
      added++;
    }
    state.importedAt = nowIso();
    audit('cf.bank_reconciliation.imported', { added, skipped, total: state.transactions.length });
    return { ok: true, added, skipped, total: state.transactions.length };
  }

  // ORD-103b: Fortnox voucher-LISTAN saknar beloppsfält (Amount finns inte i
  // list-svaret) — utan detaljhämtning blir alla belopp 0 och inget matchar.
  // Fix: för verifikat inom transaktionernas datumfönster hämtas raderna via
  // getVoucher och bankrörelsen beräknas som Σ(Debit) − Σ(Credit) på bank-
  // kontot (default 1930). Beloppet är då TECKNAT som kontoutdraget.
  // Fallback: om klienten saknar getVoucher (t.ex. tester) används v.Amount.
  // merge=true: uppdatera endast verifikat i fönstret och behåll övriga —
  // gör att stora perioder kan hämtas i bitar utan att LB-timeout (~100 s)
  // kastar bort allt (ORD-103b prod-lärdom: helårshämtning tar >10 min).
  async function fetchVouchers(
    fortnoxClient,
    { financialYearDate, bankAccount = '1930', fromDate = null, toDate = null, merge = false } = {}
  ) {
    if (!fortnoxClient || typeof fortnoxClient.listVouchers !== 'function') {
      return { ok: false, error: 'fortnoxClient saknas eller saknar listVouchers' };
    }
    const vouchers = [];
    let page = 1;
    let hasMore = true;
    while (hasMore && page <= 100) {
      const res = await fortnoxClient.listVouchers({ financialYearDate, page, limit: 100 });
      const pageVouchers = Array.isArray(res?.Vouchers) ? res.Vouchers : [];
      vouchers.push(...pageVouchers);
      hasMore = pageVouchers.length === 100;
      page++;
    }

    // Datumfönster: uttryckligt, annars härlett från importerade transaktioner ±7 dagar.
    let windowFrom = parseDate(fromDate);
    let windowTo = parseDate(toDate);
    if ((!windowFrom || !windowTo) && state.transactions.length > 0) {
      const days = state.transactions
        .map((t) => t.bookingDay)
        .filter(Boolean)
        .sort();
      if (days.length > 0) {
        const pad = (iso, deltaDays) => {
          const d = new Date(iso);
          d.setDate(d.getDate() + deltaDays);
          return d.toISOString().slice(0, 10);
        };
        windowFrom = windowFrom || pad(days[0], -7);
        windowTo = windowTo || pad(days[days.length - 1], 7);
      }
    }
    const inWindow = (v) => {
      if (!windowFrom || !windowTo) return true;
      const d = parseDate(v.TransactionDate);
      return d !== null && d >= windowFrom && d <= windowTo;
    };

    const canFetchRows = typeof fortnoxClient.getVoucher === 'function';
    const detailTargets = canFetchRows ? vouchers.filter(inWindow) : [];
    const MAX_DETAILS = 1500;
    if (detailTargets.length > MAX_DETAILS) {
      return {
        ok: false,
        error: `för många verifikat i fönstret (${detailTargets.length} > ${MAX_DETAILS}) — ange fromDate/toDate`,
      };
    }

    const detailByKey = new Map();
    let detailErrors = 0;
    for (const v of detailTargets) {
      try {
        const detail = await fortnoxClient.getVoucher(
          v.VoucherSeries,
          v.VoucherNumber,
          financialYearDate
        );
        const rows = Array.isArray(detail?.Voucher?.VoucherRows) ? detail.Voucher.VoucherRows : [];
        const bankRows = rows.filter((r) => String(r.Account) === String(bankAccount));
        if (bankRows.length > 0) {
          const amount = bankRows.reduce(
            (sum, r) => sum + (Number(r.Debit) || 0) - (Number(r.Credit) || 0),
            0
          );
          detailByKey.set(`${v.VoucherSeries}|${v.VoucherNumber}`, Math.round(amount * 100) / 100);
        }
      } catch {
        detailErrors++;
      }
      // Fortnox rate limit ~4 anrop/s — throttla.
      await new Promise((r) => setTimeout(r, 260));
    }

    const sourceVouchers = merge ? vouchers.filter(inWindow) : vouchers;
    const mapped = sourceVouchers.map((v) => {
      const key = `${v.VoucherSeries}|${v.VoucherNumber}`;
      const signedAmount = detailByKey.has(key) ? detailByKey.get(key) : null;
      return {
        voucherId: v.VoucherId || key,
        voucherNumber: v.VoucherNumber || null,
        voucherSeries: v.VoucherSeries || null,
        transactionDate: v.TransactionDate || null,
        description: v.Description || '',
        // signed=true → amount är tecknad bankrörelse (1930-rader); annars fallback.
        amount: signedAmount !== null ? signedAmount : Number(v.Amount) || 0,
        signed: signedAmount !== null,
        hasBankRow: canFetchRows ? signedAmount !== null : Number(v.Amount) !== 0,
      };
    });
    if (merge) {
      const newKeys = new Set(mapped.map((v) => v.voucherId));
      state.vouchers = [...state.vouchers.filter((v) => !newKeys.has(v.voucherId)), ...mapped];
    } else {
      state.vouchers = mapped;
    }
    audit('cf.bank_reconciliation.vouchers_loaded', {
      count: state.vouchers.length,
      withBankRows: state.vouchers.filter((v) => v.hasBankRow).length,
      detailErrors,
      bankAccount,
      windowFrom,
      windowTo,
    });
    return {
      ok: true,
      count: state.vouchers.length,
      withBankRows: state.vouchers.filter((v) => v.hasBankRow).length,
      detailErrors,
    };
  }

  function runMatching({ amountTolerance = 1, dateToleranceDays = 7 } = {}) {
    let matched = 0;
    let suggestions = 0;
    // ORD-103b: ett verifikat får bara matchas mot EN banktransaktion.
    const usedVoucherIds = new Set(
      state.transactions.filter((t) => t.matchedVoucherId).map((t) => t.matchedVoucherId)
    );
    for (const tx of state.transactions) {
      if (tx.matchStatus === 'ignored' || tx.matchStatus === 'matched') continue;
      const candidates = state.vouchers
        .filter((v) => {
          if (v.hasBankRow === false) return false;
          if (usedVoucherIds.has(v.voucherId)) return false;
          if (!v.transactionDate || !tx.bookingDay) return false;
          const vDate = new Date(v.transactionDate);
          const txDate = new Date(tx.bookingDay);
          const diffMs = Math.abs(vDate.getTime() - txDate.getTime());
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          return diffDays <= dateToleranceDays;
        })
        .map((v) => ({
          ...v,
          // signed=true → jämför MED tecken (1930-rörelse = kontoutdragets tecken);
          // fallback (osignerat listbelopp) jämförs mot |belopp| som tidigare.
          amountDiff: v.signed
            ? Math.abs((v.amount || 0) - tx.amountSek)
            : Math.abs((v.amount || 0) - Math.abs(tx.amountSek)),
        }))
        .filter((v) => v.amountDiff <= amountTolerance)
        .sort((a, b) => a.amountDiff - b.amountDiff);

      if (candidates.length === 1) {
        const c = candidates[0];
        tx.matchStatus = 'matched';
        tx.matchedVoucherId = c.voucherId;
        tx.matchedVoucherNumber = c.voucherNumber;
        tx.matchedVoucherSeries = c.voucherSeries;
        tx.matchKind = 'auto';
        tx.suggestions = [];
        usedVoucherIds.add(c.voucherId);
        matched++;
      } else if (candidates.length > 1) {
        tx.matchStatus = 'suggestion';
        tx.suggestions = candidates.slice(0, 5).map((c) => ({
          voucherId: c.voucherId,
          voucherNumber: c.voucherNumber,
          voucherSeries: c.voucherSeries,
          transactionDate: c.transactionDate,
          description: c.description,
          amount: c.amount,
          amountDiff: c.amountDiff,
        }));
        suggestions++;
      } else {
        tx.matchStatus = 'unmatched';
        tx.suggestions = [];
      }
    }
    audit('cf.bank_reconciliation.matching_run', {
      matched,
      suggestions,
      unmatched: stats().unmatched,
    });
    return { matched, suggestions };
  }

  function confirmMatch(txId, voucherId, { actor = null } = {}) {
    const tx = state.transactions.find((t) => t.id === txId);
    if (!tx) return null;
    const voucher = state.vouchers.find((v) => v.voucherId === voucherId);
    if (!voucher) return { error: 'verifikat finns inte' };
    // ORD-103b: verifikat som redan matchats mot en annan transaktion får inte återanvändas.
    const taken = state.transactions.find((t) => t.id !== txId && t.matchedVoucherId === voucherId);
    if (taken) {
      return {
        error: `verifikatet är redan matchat mot en annan transaktion (${taken.bookingDay} ${taken.amountSek} kr)`,
      };
    }
    tx.matchStatus = 'matched';
    tx.matchedVoucherId = voucher.voucherId;
    tx.matchedVoucherNumber = voucher.voucherNumber;
    tx.matchedVoucherSeries = voucher.voucherSeries;
    tx.matchKind = 'manual';
    tx.suggestions = [];
    audit('cf.bank_reconciliation.match_confirmed', { txId, voucherId, actor });
    return tx;
  }

  function ignoreTransaction(txId, { reason, actor = null } = {}) {
    const tx = state.transactions.find((t) => t.id === txId);
    if (!tx) return null;
    tx.matchStatus = 'ignored';
    tx.ignoreReason = normalizeText(reason) || 'manuellt ignorerad';
    audit('cf.bank_reconciliation.ignored', { txId, reason: tx.ignoreReason, actor });
    return tx;
  }

  function listTransactions({ status = null, limit = 200 } = {}) {
    let rows = state.transactions;
    if (status) rows = rows.filter((t) => t.matchStatus === status);
    return rows.slice(0, limit);
  }

  function stats() {
    const total = state.transactions.length;
    const matched = state.transactions.filter((t) => t.matchStatus === 'matched').length;
    const unmatched = state.transactions.filter((t) => t.matchStatus === 'unmatched').length;
    const suggestions = state.transactions.filter((t) => t.matchStatus === 'suggestion').length;
    const ignored = state.transactions.filter((t) => t.matchStatus === 'ignored').length;
    const unmatchedSumSek = state.transactions
      .filter((t) => t.matchStatus === 'unmatched')
      .reduce((sum, t) => sum + Math.abs(t.amountSek || 0), 0);
    return { total, matched, unmatched, suggestions, ignored, unmatchedSumSek };
  }

  load();

  return {
    parseHandelsbankenCsv,
    importTransactions,
    fetchVouchers,
    runMatching,
    confirmMatch,
    ignoreTransaction,
    listTransactions,
    stats,
    persist,
    _state: () => state,
  };
}

module.exports = {
  parseHandelsbankenCsv,
  createCfoBankReconciliation,
};
