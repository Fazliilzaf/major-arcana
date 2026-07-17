'use strict';

/**
 * CF.9 · Fortnox voucher-sync — SCAFFOLD (fail-closed).
 *
 * Byggd 2026-07-12 (svep ORD-63–61). Roadmap: CHIEF-OF-FINANCE-MVP3-ROADMAP §7.1.
 *
 * HÅRDA GATES (i ordning):
 *  1. ARCANA_CFO_FORTNOX_VOUCHER_SYNC_ENABLED måste vara exakt 'true' (default AV).
 *  2. Fortnox OAuth måste vara ansluten (fortnoxStore.getConnection → connected).
 *  3. fortnoxClient måste ha createVoucher — den metoden FINNS INTE ännu i
 *     cfoFortnoxClient (medvetet: ingen write-yta byggs före ägar-GO + grön OAuth).
 *
 * dryRun=true bygger payloads utan någon som helst write — används för att
 * granska kontering innan ägaren godkänner skarp sync.
 *
 * Konto-mappningen nedan är ETT FÖRSLAG (BAS-kontoplan). Ägaren/revisorn ska
 * godkänna per kategori innan skarp körning — därför även payload-fältet
 * `accountSource: 'default_suggestion'`.
 */

function nowIso() {
  return new Date().toISOString();
}

// Förslag: kategori → BAS-konto (kostnadskonto). KRÄVER ägar-/revisorsgodkännande.
const DEFAULT_ACCOUNT_MAP = Object.freeze({
  utrustning: 5410,
  forbrukning: 5460,
  lokal: 5010,
  personal: 7690,
  utbildning: 7610,
  resor: 5800,
  mat_representation: 6071,
  marknadsforing: 5900,
  administrativ: 6110,
  it_telefoni: 6212,
  forsakring: 6310,
  juridik_konsult: 6580,
  bank_finansiell: 6570,
  skatter_avgifter: 6990,
  annat: 6990,
});
const VAT_ACCOUNT = 2641; // Ingående moms
const COUNTER_ACCOUNT = 1930; // Företagskonto (betalning)
const DEFAULT_VOUCHER_SERIES = 'A';

// ORD-CM-14 · Beräknad moms vid omvänd skattskyldighet (EU-tjänsteinköp):
// 2614 = beräknad utgående moms 25 % (momsdeklaration ruta 30),
// 2645 = beräknad ingående moms (ruta 48). Fiktiv moms beräknas på HELA
// fakturabeloppet (Skatteverket/BAS-praxis). Debet 2645 + kredit 2614 tar ut
// varandra — verifikatet balanserar och deklarationen får båda sidor.
const REVERSE_CHARGE_OUT_ACCOUNT = 2614;
const REVERSE_CHARGE_IN_ACCOUNT = 2645;
const REVERSE_CHARGE_RATE = 0.25;

function buildVoucherPayload(
  expense,
  { accountMap = DEFAULT_ACCOUNT_MAP, series = DEFAULT_VOUCHER_SERIES } = {}
) {
  const gross = Number(expense.amountSek) || 0;
  const vat = Number(expense.vatSek) || 0;
  const net = Math.round((gross - vat) * 100) / 100;
  const costAccount = accountMap[expense.category] || accountMap.annat;
  const notes = [];
  let rows;
  let accountSource = 'default_suggestion';
  let balanced;
  if (expense.vatMode === 'reverse_charge_eu') {
    // Ingen moms i fakturan — hela beloppet är kostnad; fiktiv moms 25 % läggs
    // som 2614 K + 2645 D (netto noll, men deklarationen kräver båda raderna).
    const fictiveVat = Math.round(gross * REVERSE_CHARGE_RATE * 100) / 100;
    rows = [
      { Account: costAccount, Debit: gross, Credit: 0 },
      { Account: REVERSE_CHARGE_IN_ACCOUNT, Debit: fictiveVat, Credit: 0 },
      { Account: REVERSE_CHARGE_OUT_ACCOUNT, Debit: 0, Credit: fictiveVat },
      { Account: COUNTER_ACCOUNT, Debit: 0, Credit: gross },
    ];
    accountSource = 'vat_mode_reverse_charge_eu';
    notes.push(
      `Omvänd skattskyldighet EU-tjänst: fiktiv moms 25 % (${fictiveVat} kr) på hela beloppet — 2645 D / 2614 K.`
    );
    balanced = true;
  } else if (
    expense.vatMode === 'representation_limited' &&
    expense.deductibleVatSek !== null &&
    expense.deductibleVatSek !== undefined &&
    Number.isFinite(Number(expense.deductibleVatSek))
  ) {
    // Representation: endast momsen på underlag ≤300 kr/person är avdragsgill.
    // deductibleVatSek kommer från CF.6-beräkningen; resten ligger kvar i kostnaden.
    const dedVat = Math.round(Number(expense.deductibleVatSek) * 100) / 100;
    const cost = Math.round((gross - dedVat) * 100) / 100;
    rows = [
      { Account: costAccount, Debit: cost, Credit: 0 },
      ...(dedVat > 0 ? [{ Account: VAT_ACCOUNT, Debit: dedVat, Credit: 0 }] : []),
      { Account: COUNTER_ACCOUNT, Debit: 0, Credit: gross },
    ];
    accountSource = 'vat_mode_representation_limited';
    notes.push(
      `Representation: avdragsgill moms ${dedVat} kr (underlag max 300 kr/person), resten i kostnaden.`
    );
    balanced = Math.round((cost + dedVat - gross) * 100) === 0;
  } else {
    rows = [{ Account: costAccount, Debit: net, Credit: 0 }];
    if (vat > 0) rows.push({ Account: VAT_ACCOUNT, Debit: vat, Credit: 0 });
    rows.push({ Account: COUNTER_ACCOUNT, Debit: 0, Credit: gross });
    balanced = Math.round((net + vat - gross) * 100) === 0;
    if (expense.vatMode === 'representation_limited') {
      notes.push(
        'Representation utan beräknad avdragsgill moms (deductibleVatSek saknas) — granska momsavdraget manuellt.'
      );
    }
  }
  return {
    Voucher: {
      Description:
        `CF expense ${expense.id}${expense.supplier ? ` · ${expense.supplier}` : ''}`.slice(0, 100),
      TransactionDate: expense.date || nowIso().slice(0, 10),
      VoucherSeries: series,
      VoucherRows: rows,
    },
    meta: {
      expenseId: expense.id,
      category: expense.category || null,
      accountSource,
      balanced,
      ...(notes.length ? { notes } : {}),
    },
  };
}

function createCfoFortnoxVoucherSync({
  expenseStore,
  fortnoxStore = null,
  fortnoxClient = null,
  auditLog = null,
  env = process.env,
} = {}) {
  function audit(kind, detail) {
    try {
      auditLog?.append?.({
        action: kind,
        kind,
        surface: 'cco.cf.fortnox_voucher',
        ts: nowIso(),
        detail,
      });
    } catch {
      /* best effort */
    }
  }

  async function listPendingExpenses() {
    const all =
      typeof expenseStore.listExpenses === 'function' ? await expenseStore.listExpenses({}) : [];
    const rows = Array.isArray(all) ? all : all?.expenses || [];
    return rows.filter(
      (e) =>
        e.status === 'exported' &&
        e.fortnoxExportPending === true &&
        ['pending', 'blocked_integration'].includes(e.fortnoxSyncStatus)
    );
  }

  async function run({ dryRun = true } = {}) {
    const enabled = String(env.ARCANA_CFO_FORTNOX_VOUCHER_SYNC_ENABLED || '') === 'true';
    const pending = await listPendingExpenses();
    const payloads = pending.map((e) => buildVoucherPayload(e));

    if (!enabled) {
      return {
        ok: false,
        reason: 'disabled',
        detail: 'ARCANA_CFO_FORTNOX_VOUCHER_SYNC_ENABLED != true (fail-closed — kräver ägar-GO)',
        pendingCount: pending.length,
        dryRunPayloads: dryRun ? payloads : undefined,
      };
    }
    const connection = fortnoxStore?.getConnection ? await fortnoxStore.getConnection() : null;
    if (!connection?.connected && !connection?.accessToken) {
      return { ok: false, reason: 'fortnox_not_connected', pendingCount: pending.length };
    }
    if (typeof fortnoxClient?.createVoucher !== 'function') {
      return {
        ok: false,
        reason: 'fortnox_client_missing_createVoucher',
        detail:
          'cfoFortnoxClient saknar createVoucher — byggs i CF.9-skarp efter ägar-GO på kontoplanen',
        pendingCount: pending.length,
        dryRunPayloads: dryRun ? payloads : undefined,
      };
    }
    if (dryRun) {
      return { ok: true, dryRun: true, pendingCount: pending.length, payloads };
    }

    const results = [];
    for (const [i, expense] of pending.entries()) {
      try {
        // Bugbot HIGH (PR #835): tvåfas — markera 'syncing' PERSISTERAT före
        // Fortnox-write. Krasch efter write → expensen fastnar i 'syncing'
        // (exkluderas ur nästa run) i stället för att dubbelbokas.
        if (typeof expenseStore.markFortnoxSyncing === 'function') {
          await expenseStore.markFortnoxSyncing({ id: expense.id });
        }
        const response = await fortnoxClient.createVoucher(payloads[i].Voucher);
        const voucherId = response?.Voucher?.VoucherNumber || null;
        if (!voucherId) {
          // Bugbot (PR #835): utan verifikatreferens = INTE synced — felmarkera
          // så avstämning mot Fortnox kan ske manuellt.
          if (typeof expenseStore.markFortnoxError === 'function') {
            await expenseStore.markFortnoxError({
              id: expense.id,
              error: 'voucher_id_missing_in_response',
            });
          }
          audit('cf.fortnox.voucher_sync_error', {
            expenseId: expense.id,
            error: 'voucher_id_missing_in_response',
          });
          results.push({
            expenseId: expense.id,
            ok: false,
            error: 'voucher_id_missing_in_response',
          });
          continue;
        }
        if (typeof expenseStore.markFortnoxSynced === 'function') {
          await expenseStore.markFortnoxSynced({ id: expense.id, fortnoxVoucherId: voucherId });
        }
        audit('cf.fortnox.voucher_synced', { expenseId: expense.id, voucherId });
        results.push({ expenseId: expense.id, ok: true, voucherId });
      } catch (err) {
        if (typeof expenseStore.markFortnoxError === 'function') {
          await expenseStore
            .markFortnoxError({ id: expense.id, error: err.message })
            .catch(() => {});
        }
        audit('cf.fortnox.voucher_sync_error', { expenseId: expense.id, error: err.message });
        results.push({ expenseId: expense.id, ok: false, error: err.message });
      }
    }
    return { ok: true, dryRun: false, results };
  }

  return { run, listPendingExpenses, buildVoucherPayload };
}

module.exports = {
  createCfoFortnoxVoucherSync,
  buildVoucherPayload,
  DEFAULT_ACCOUNT_MAP,
  VAT_ACCOUNT,
  COUNTER_ACCOUNT,
};
