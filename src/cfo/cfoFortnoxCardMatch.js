'use strict';

/**
 * ORD-102 steg 3 · Fortnox "läs redan bokat" för kortavstämning.
 *
 * Läser verifikat från Fortnox och matchar dem mot omatchade korttransaktioner.
 * Återanvänder mönstret från cfoBankReconciliation men anpassat för Amex-dragningar.
 *
 * Design-lås:
 * - Inga Fortnox-writes.
 * - Korttransaktioner blir aldrig nya utgifter — de markeras bara som hanterade.
 * - Ett verifikat matchas mot max EN kortdragning.
 * - Osäkra/trubbiga träffar lämnas kvar som omatchade.
 */

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withFortnoxRetry(fn, { maxRetries = 5, baseDelayMs = 2000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const statusCode = Number(error?.statusCode || error?.metadata?.statusCode);
      const isRateLimit = statusCode === 429;
      if (!isRateLimit || attempt === maxRetries) {
        throw error;
      }
      const delay = Math.min(baseDelayMs * 2 ** attempt, 30000);
      await sleep(delay);
    }
  }
  throw lastError;
}

function parseDate(value) {
  const str = normalizeText(value);
  if (!str) return null;
  const iso = str.replace(/\//g, '-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return iso;
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function deriveDateWindow(transactions, { marginDays = 7, maxLookbackDays = 30 } = {}) {
  const unmatched = (transactions || []).filter((t) => t.matchStatus === 'unmatched' && t.date);
  if (unmatched.length === 0) return null;
  const dates = unmatched.map((t) => t.date).sort();
  const maxDate = dates[dates.length - 1];
  const minDate = dates[0];
  const earliestAllowed = addDays(maxDate, -maxLookbackDays);
  return {
    fromDate: addDays(minDate < earliestAllowed ? earliestAllowed : minDate, -marginDays),
    toDate: addDays(maxDate, marginDays),
  };
}

async function fetchFortnoxVouchers(
  fortnoxClient,
  {
    financialYearDate,
    fromDate = null,
    toDate = null,
    bankAccount = '1930',
    throttleMs = 700,
    onProgress,
  } = {}
) {
  if (!fortnoxClient || typeof fortnoxClient.listVouchers !== 'function') {
    return { ok: false, error: 'fortnoxClient saknas eller saknar listVouchers' };
  }
  if (!fortnoxClient.getVoucher) {
    return { ok: false, error: 'fortnoxClient saknar getVoucher' };
  }

  const reportProgress = (update) => {
    if (typeof onProgress === 'function') onProgress(update);
  };

  const vouchers = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= 100) {
    const res = await withFortnoxRetry(() =>
      fortnoxClient.listVouchers({ financialYearDate, page, limit: 100 })
    );
    const pageVouchers = Array.isArray(res?.Vouchers) ? res.Vouchers : [];
    vouchers.push(...pageVouchers);
    hasMore = pageVouchers.length === 100;
    page++;
  }

  const windowFrom = parseDate(fromDate);
  const windowTo = parseDate(toDate);

  const inWindow = (v) => {
    if (!windowFrom || !windowTo) return true;
    const d = parseDate(v.TransactionDate);
    return d !== null && d >= windowFrom && d <= windowTo;
  };

  const detailTargets = vouchers.filter(inWindow);
  const MAX_DETAILS = 1500;
  if (detailTargets.length > MAX_DETAILS) {
    return {
      ok: false,
      error: `för många verifikat i fönstret (${detailTargets.length} > ${MAX_DETAILS}) — ange fromDate/toDate`,
    };
  }

  reportProgress({ vouchersTotal: detailTargets.length, vouchersRead: 0 });

  const detailByKey = new Map();
  let detailErrors = 0;

  for (let i = 0; i < detailTargets.length; i++) {
    const v = detailTargets[i];
    console.log(
      `[fortnox-card-match] fetching detail ${i + 1}/${detailTargets.length} ${v.VoucherSeries}|${v.VoucherNumber}`
    );
    try {
      const detail = await withFortnoxRetry(() =>
        fortnoxClient.getVoucher(v.VoucherSeries, v.VoucherNumber, financialYearDate)
      );
      console.log(`[fortnox-card-match] detail ${i + 1} ok`);
      reportProgress({ vouchersRead: i + 1 });
      const rows = Array.isArray(detail?.Voucher?.VoucherRows) ? detail.Voucher.VoucherRows : [];
      if (rows.length === 0) {
        console.warn(
          `[fortnox-card-match] detail ${i + 1}/${detailTargets.length} ${v.VoucherSeries}|${v.VoucherNumber} has no VoucherRows (keys: ${Object.keys(detail || {}).join(',')})`
        );
      }
      const bankRows = rows.filter((r) => String(r.Account) === String(bankAccount));

      let signedAmount = null;
      if (bankRows.length > 0) {
        signedAmount = bankRows.reduce(
          (sum, r) => sum + (Number(r.Debit) || 0) - (Number(r.Credit) || 0),
          0
        );
      } else {
        // Fallback: om inget bankkonto finns i raderna, summera kostnadsradernas belopp
        // och anta att det motsvarar kortdragningen.
        signedAmount = rows.reduce((sum, r) => {
          const debit = Number(r.Debit) || 0;
          const credit = Number(r.Credit) || 0;
          // Kostnadsrader är typiskt debet; momsrader kredit.
          // Vi tar netto debet-kredit som proxy.
          return sum + (debit - credit);
        }, 0);
      }

      detailByKey.set(`${v.VoucherSeries}|${v.VoucherNumber}`, {
        amount: Math.round(Math.abs(signedAmount) * 100) / 100,
        signedAmount: Math.round(signedAmount * 100) / 100,
        description: normalizeText(v.Description),
        transactionDate: parseDate(v.TransactionDate),
        voucherSeries: v.VoucherSeries,
        voucherNumber: v.VoucherNumber,
        voucherId: v.VoucherId || `${v.VoucherSeries}|${v.VoucherNumber}`,
        hasBankRow: bankRows.length > 0,
      });
    } catch (err) {
      detailErrors++;
      console.error(
        `[fortnox-card-match] detail ${i + 1}/${detailTargets.length} ${v.VoucherSeries}|${v.VoucherNumber} failed: ${err?.message || err} (status=${err?.statusCode || '?'})`
      );
    }
    if (throttleMs > 0) {
      await new Promise((r) => setTimeout(r, throttleMs));
    }
  }

  const resultVouchers = detailTargets
    .map((v) => {
      const key = `${v.VoucherSeries}|${v.VoucherNumber}`;
      const detail = detailByKey.get(key);
      if (!detail) return null;
      return detail;
    })
    .filter(Boolean);

  return {
    ok: true,
    vouchers: resultVouchers,
    totalListed: vouchers.length,
    inWindow: detailTargets.length,
    withDetails: resultVouchers.length,
    detailErrors,
  };
}

function daysBetween(a, b) {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Infinity;
  return Math.abs(da - db) / 86400000;
}

function matchCardTransactions(
  transactions,
  vouchers,
  { amountTolerance = 1, dateToleranceDays = 7 } = {}
) {
  const unmatched = (transactions || []).filter(
    (t) => t.type !== 'credit' && t.matchStatus === 'unmatched'
  );
  const usedVoucherIds = new Set();
  const matches = [];
  const suggestions = [];

  for (const tx of unmatched) {
    const candidates = vouchers
      .filter((v) => {
        if (usedVoucherIds.has(v.voucherId)) return false;
        if (!v.transactionDate || !tx.date) return false;
        if (daysBetween(v.transactionDate, tx.date) > dateToleranceDays) return false;
        return Math.abs(v.amount - tx.amountSek) <= amountTolerance;
      })
      .map((v) => ({ ...v, amountDiff: Math.abs(v.amount - tx.amountSek) }))
      .sort((a, b) => a.amountDiff - b.amountDiff);

    if (candidates.length === 1) {
      const c = candidates[0];
      usedVoucherIds.add(c.voucherId);
      matches.push({
        transactionId: tx.id,
        transactionDate: tx.date,
        transactionDescription: tx.description,
        transactionAmountSek: tx.amountSek,
        voucherId: c.voucherId,
        voucherSeries: c.voucherSeries,
        voucherNumber: c.voucherNumber,
        voucherDescription: c.description,
        voucherDate: c.transactionDate,
        voucherAmountSek: c.amount,
        amountDiff: c.amountDiff,
      });
    } else if (candidates.length > 1) {
      suggestions.push({
        transactionId: tx.id,
        transactionDate: tx.date,
        transactionDescription: tx.description,
        transactionAmountSek: tx.amountSek,
        candidates: candidates.slice(0, 5).map((c) => ({
          voucherId: c.voucherId,
          voucherSeries: c.voucherSeries,
          voucherNumber: c.voucherNumber,
          voucherDescription: c.description,
          voucherDate: c.transactionDate,
          voucherAmountSek: c.amount,
          amountDiff: c.amountDiff,
        })),
      });
    }
  }

  return { matches, suggestions };
}

async function applyMatches(
  reconciliation,
  matches,
  { actor, reason = 'redan bokad i Fortnox' } = {}
) {
  let applied = 0;
  const details = [];
  for (const m of matches) {
    const all = reconciliation.listTransactions({ limit: 10000 });
    const tx = all.find((t) => t.id === m.transactionId);
    if (!tx || tx.matchStatus !== 'unmatched') continue;
    tx.matchStatus = 'matched';
    tx.matchedExpenseId = null;
    tx.matchKind = 'fortnox';
    tx.matchedBy = actor || null;
    tx.matchedAt = nowIso();
    tx.fortnoxVoucherId = m.voucherId;
    tx.fortnoxVoucherSeries = m.voucherSeries;
    tx.fortnoxVoucherNumber = m.voucherNumber;
    tx.fortnoxVoucherDescription = m.voucherDescription;
    tx.ignoreReason = reason;
    applied++;
    details.push({
      transactionId: m.transactionId,
      voucherId: m.voucherId,
      voucherSeries: m.voucherSeries,
      voucherNumber: m.voucherNumber,
      amountSek: m.transactionAmountSek,
      date: m.transactionDate,
    });
  }
  if (applied > 0) {
    await reconciliation.persist();
  }
  return { applied, details };
}

async function runFortnoxCardMatch({
  fortnoxClient,
  reconciliation,
  financialYearDate,
  fromDate,
  toDate,
  dryRun = true,
  autoApply = false,
  actor = null,
  amountTolerance = 1,
  dateToleranceDays = 7,
  bankAccount = '1930',
  throttleMs = 700,
  onProgress,
} = {}) {
  if (!reconciliation) {
    return { ok: false, error: 'reconciliation saknas' };
  }

  const reportProgress = (update) => {
    if (typeof onProgress === 'function') onProgress(update);
  };

  const unmatchedTransactions = reconciliation.listTransactions({
    status: 'unmatched',
    limit: 10000,
  });
  if (unmatchedTransactions.length === 0) {
    console.log(`[fortnox-card-match] inga omatchade transaktioner — avslutar.`);
    return {
      ok: true,
      dryRun,
      autoApplied: 0,
      matched: 0,
      suggestions: 0,
      unmatched: 0,
      vouchersRead: 0,
      details: [],
      suggestionDetails: [],
    };
  }

  let windowFrom = normalizeText(fromDate) || null;
  let windowTo = normalizeText(toDate) || null;
  if (!windowFrom || !windowTo) {
    const derived = deriveDateWindow(unmatchedTransactions);
    if (derived) {
      windowFrom = windowFrom || derived.fromDate;
      windowTo = windowTo || derived.toDate;
    }
  }

  // Om inget räkenskapsårsdatum angivits, använd senaste omatchade transaktionsdatumet
  // så Fortnox bara listar verifikat för det aktuella året.
  let effectiveFinancialYearDate = normalizeText(financialYearDate) || null;
  if (!effectiveFinancialYearDate && unmatchedTransactions.length > 0) {
    const dates = unmatchedTransactions
      .map((t) => t.date)
      .filter(Boolean)
      .sort();
    effectiveFinancialYearDate = dates[dates.length - 1] || null;
  }

  console.log(
    `[fortnox-card-match] start dryRun=${dryRun} unmatched=${unmatchedTransactions.length} window=${windowFrom}..${windowTo} year=${effectiveFinancialYearDate}`
  );

  const fetchResult = await fetchFortnoxVouchers(fortnoxClient, {
    financialYearDate: effectiveFinancialYearDate || undefined,
    fromDate: windowFrom || undefined,
    toDate: windowTo || undefined,
    bankAccount,
    throttleMs,
    onProgress,
  });
  if (!fetchResult.ok) {
    console.error(`[fortnox-card-match] fetch error: ${fetchResult.error}`);
    return { ok: false, error: fetchResult.error };
  }

  console.log(
    `[fortnox-card-match] fetched ${fetchResult.withDetails} verifikat (listed ${fetchResult.totalListed}, inWindow ${fetchResult.inWindow}, errors ${fetchResult.detailErrors})`
  );

  const { matches, suggestions } = matchCardTransactions(
    unmatchedTransactions,
    fetchResult.vouchers,
    {
      amountTolerance,
      dateToleranceDays,
    }
  );

  reportProgress({ matched: matches.length, suggestions: suggestions.length });

  let applied = { applied: 0, details: [] };
  if (autoApply && !dryRun) {
    applied = await applyMatches(reconciliation, matches, { actor });
    console.log(`[fortnox-card-match] applied ${applied.applied} matches.`);
  }

  console.log(
    `[fortnox-card-match] result matched=${matches.length} suggestions=${suggestions.length} unmatched=${unmatchedTransactions.length - matches.length - suggestions.length}`
  );

  return {
    ok: true,
    dryRun: dryRun || !autoApply,
    autoApplied: autoApply && !dryRun ? applied.applied : 0,
    matched: matches.length,
    suggestions: suggestions.length,
    unmatched: unmatchedTransactions.length - matches.length - suggestions.length,
    vouchersRead: fetchResult.withDetails,
    details: autoApply && !dryRun ? applied.details : matches,
    suggestionDetails: suggestions,
  };
}

module.exports = {
  fetchFortnoxVouchers,
  matchCardTransactions,
  applyMatches,
  runFortnoxCardMatch,
};
