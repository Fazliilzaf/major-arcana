'use strict';

/**
 * ORD-103d · Automatisk bokföring av bankinkomster i Fortnox.
 *
 * När Handelsbanken-CSV importeras identifieras omatchade inkomster
 * (positiva belopp i Handelsbankens "Insättning/Uttag"-kolumn) och
 * skapas som verifikat i Fortnox med motsvarande intäktskonto.
 *
 * Fail-closed:
 *  - Default AV (kräver ARCANA_CFO_BANK_INCOME_AUTO_BOOK_ENABLED=true).
 *  - Fortnox måste vara anslutet med ett scope som inkluderar `bookkeeping`.
 *  - Inga writes om dryRun=true.
 *  - Varje transaktion bokförs max en gång (autoBookedVoucherNumber).
 *
 * Kontoplan (BAS, ändras via env):
 *  - Swish-inkomst     → Debet 1930 / Kredit 3001
 *  - Kort-inkomst      → Debet 1930 / Kredit 3020
 *  - Banköverföring    → Debet 1930 / Kredit 1510 (kundfordran) alternativt 3001
 *  - Övrig inkomst     → Debet 1930 / Kredit 3001
 */

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasScopeBookkeeping(connection) {
  const scope = normalizeText(connection?.scope || '');
  if (!scope) return false;
  // Fortnox scopes är mellanslagsseparerade.
  return scope.split(/\s+/).includes('bookkeeping');
}

function detectIncomeSubtype(tx) {
  const ref = normalizeText(tx.reference).toUpperCase();
  const swishRef = normalizeText(tx.swishReference).toUpperCase();

  if (swishRef || ref.includes('SWISH')) return 'swish';
  if (
    ref.includes('KORTBETALNING') ||
    ref.includes('KORTINBETALNING') ||
    ref.includes('TERMINAL')
  ) {
    return 'card';
  }
  if (ref.includes('KORT')) return 'card';
  if (ref.includes('BETALNING MOTTAGEN') || ref.includes('INBETALNING') || ref.includes('BG-')) {
    return 'bank_transfer';
  }
  return 'unknown';
}

function buildVoucherPayload(tx, { accounts, series = 'A' } = {}) {
  const ref = normalizeText(tx.reference)
    .replace(/[^a-zA-Z0-9åäöÅÄÖéÉüÜ .,()\-/&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const description = `AUTO INKOMST ${ref}`.slice(0, 100);
  const amount = Math.abs(Number(tx.amountSek) || 0);
  const subtype = detectIncomeSubtype(tx);
  const incomeAccount = accounts?.[subtype]?.credit || accounts?.unknown?.credit || 3001;
  const bankAccount = accounts?.bank || 1930;

  return {
    Voucher: {
      Description: description,
      TransactionDate: tx.bookingDay || nowIso().slice(0, 10),
      VoucherSeries: series,
      VoucherRows: [
        { Account: bankAccount, Debit: amount, Credit: 0 },
        { Account: incomeAccount, Debit: 0, Credit: amount },
      ],
    },
    meta: {
      txId: tx.id,
      subtype,
      amount,
      incomeAccount,
      bankAccount,
      reference: tx.reference,
    },
  };
}

async function ensureAccountActiveForDate(fortnoxClient, accountNumber, transactionDate) {
  if (!accountNumber || !transactionDate || !fortnoxClient?.listFinancialYears) return;
  try {
    const yearsRes = await fortnoxClient.listFinancialYears();
    const years = yearsRes?.FinancialYears || [];
    const dateStr = String(transactionDate).slice(0, 10);
    const year = years.find((y) => {
      const from = y?.FromDate ? String(y.FromDate).slice(0, 10) : null;
      const to = y?.ToDate ? String(y.ToDate).slice(0, 10) : null;
      if (!from || !to) return false;
      return dateStr >= from && dateStr <= to;
    });
    if (!year) return;
    const yearParam = String(year.Id || '');
    if (!yearParam) return;
    const account = await fortnoxClient.getAccount(accountNumber, { financialYear: yearParam });
    if (account?.Account?.Active) return;
    await fortnoxClient.activateAccount(accountNumber, { financialYear: yearParam });
  } catch (err) {
    // Fortnox ger tydligt fel om kontot fortfarande är inaktivt.
    console.warn(
      `[bank-income-auto-book] account ${accountNumber} activation check failed: ${err?.message || err}`
    );
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createIncomeVouchers({
  reconciliation,
  fortnoxClient,
  connection,
  accounts,
  series = 'A',
  dryRun = true,
  auditLog = null,
  onProgress = null,
} = {}) {
  if (!reconciliation) {
    return { ok: false, reason: 'reconciliation_missing', created: [], skipped: [], errors: [] };
  }
  if (!fortnoxClient || typeof fortnoxClient.createVoucher !== 'function') {
    return {
      ok: false,
      reason: 'fortnox_client_missing_createVoucher',
      created: [],
      skipped: [],
      errors: [],
    };
  }
  if (!connection || (!connection.connected && !connection.accessToken)) {
    return { ok: false, reason: 'fortnox_not_connected', created: [], skipped: [], errors: [] };
  }
  if (!hasScopeBookkeeping(connection)) {
    return {
      ok: false,
      reason: 'fortnox_scope_missing_bookkeeping',
      created: [],
      skipped: [],
      errors: [],
    };
  }

  function audit(kind, detail) {
    try {
      auditLog?.append?.({
        action: kind,
        kind,
        surface: 'cco.cf.bank_income_auto_book',
        ts: nowIso(),
        detail,
      });
    } catch {
      /* best effort */
    }
  }

  const defaultAccounts = {
    swish: { credit: 3001 },
    card: { credit: 3020 },
    bank_transfer: { credit: 1510 },
    unknown: { credit: 3001 },
    bank: 1930,
  };
  const resolvedAccounts = {
    ...defaultAccounts,
    ...(accounts || {}),
  };

  const candidates = reconciliation
    .listTransactions({ status: 'unmatched', limit: 10000 })
    .filter((tx) => tx.type === 'income' && !tx.autoBookedVoucherNumber);

  const created = [];
  const skipped = [];
  const errors = [];

  for (let i = 0; i < candidates.length; i++) {
    const tx = candidates[i];
    try {
      if (Number(tx.amountSek) === 0) {
        skipped.push({ txId: tx.id, reason: 'zero_amount' });
        continue;
      }

      const payload = buildVoucherPayload(tx, { accounts: resolvedAccounts, series });
      const voucherPayload = payload.Voucher;

      onProgress?.({
        step: 'building',
        index: i + 1,
        total: candidates.length,
        txId: tx.id,
      });

      if (dryRun) {
        created.push({
          txId: tx.id,
          dryRun: true,
          voucherPayload,
          meta: payload.meta,
        });
        continue;
      }

      // Aktivera konton i aktuellt räkenskapsår innan write.
      const txDate = voucherPayload.TransactionDate;
      const accountsInRows = [
        ...new Set((voucherPayload.VoucherRows || []).map((r) => r.Account).filter(Boolean)),
      ];
      for (const acc of accountsInRows) {
        await ensureAccountActiveForDate(fortnoxClient, acc, txDate);
      }

      // Fortnox rate-limit ~4 anrop/s — throttla writes.
      if (i > 0) await sleep(250);

      let response;
      try {
        response = await fortnoxClient.createVoucher(voucherPayload);
      } catch (err) {
        if (err && err.statusCode === 429) {
          await sleep(20000);
          response = await fortnoxClient.createVoucher(voucherPayload);
        } else {
          throw err;
        }
      }

      const voucherNumber = response?.Voucher?.VoucherNumber || null;
      const voucherSeries = response?.Voucher?.VoucherSeries || series;
      if (!voucherNumber) {
        throw new Error('voucher_number_missing_in_response');
      }

      tx.autoBookedVoucherNumber = String(voucherNumber);
      tx.autoBookedVoucherSeries = String(voucherSeries);
      tx.autoBookedVoucherId = `${voucherSeries}|${voucherNumber}`;
      tx.autoBookedAt = nowIso();
      tx.autoBookedStatus = 'booked';
      tx.matchStatus = 'auto_booked';

      const result = {
        txId: tx.id,
        dryRun: false,
        voucherNumber: String(voucherNumber),
        voucherSeries: String(voucherSeries),
        amount: payload.meta.amount,
        subtype: payload.meta.subtype,
        incomeAccount: payload.meta.incomeAccount,
      };
      created.push(result);
      audit('cf.bank_income_auto_book.created', result);
      onProgress?.({ step: 'created', index: i + 1, total: candidates.length, ...result });
    } catch (err) {
      const error = err?.message || String(err);
      errors.push({ txId: tx.id, error, reference: tx.reference, amountSek: tx.amountSek });
      audit('cf.bank_income_auto_book.error', { txId: tx.id, error, reference: tx.reference });
      onProgress?.({ step: 'error', index: i + 1, total: candidates.length, txId: tx.id, error });
    }
  }

  return { ok: true, dryRun, created, skipped, errors, count: created.length };
}

module.exports = {
  createIncomeVouchers,
  buildVoucherPayload,
  detectIncomeSubtype,
  hasScopeBookkeeping,
};
