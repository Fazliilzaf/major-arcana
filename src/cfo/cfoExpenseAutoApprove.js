'use strict';

/**
 * ORD-CM-19 · Ägar-regeln (godkänd 2026-07-18): "du godkänner regeln, inte
 * posterna". En utgift auto-godkänns för bokföring när HELA beviskedjan finns:
 *
 *  1. underlag länkat (attachmentKeys ej tom) — ägarens avdragsregel
 *  2. belopp ur källan (amountSek > 0)
 *  3. kategori satt
 *  4. leverantörs-PREJUDIKAT: samma leverantör har redan bokförts i Fortnox
 *     (fortnoxSyncStatus 'synced') — första gången en leverantör dyker upp
 *     stannar den i Att hantera för ägarens godkännande.
 *
 * Momsläget ärvs från leverantörens senast bokförda post (Meta → rc_eu,
 * Foodora → representation_limited osv). representation_limited utan beräknad
 * avdragsgill moms är en moms-tveksamhet → stannar för granskning.
 * Allt audit-loggas. Ingen Fortnox-write här — bara approved + ready_for_export;
 * själva bokföringen går genom voucher-syncens ordinarie gates.
 */

function normSupplier(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

/** Bygg prejudikat-karta ur redan Fortnox-syncade poster: supplier → vatMode. */
function buildPrecedents(expenses) {
  const map = new Map();
  for (const e of expenses) {
    if (e.fortnoxSyncStatus !== 'synced') continue;
    const key = normSupplier(e.supplier);
    if (!key) continue;
    const prev = map.get(key);
    // Senast uppdaterade vinner (ägarens senaste beslut för leverantören).
    if (!prev || String(e.updatedAt || '') > String(prev.updatedAt || '')) {
      map.set(key, { vatMode: e.vatMode || null, updatedAt: e.updatedAt || '' });
    }
  }
  return map;
}

/**
 * Klassificera en utgift mot regeln. Returnerar { eligible, reason, inheritVatMode }.
 * reason när eligible=false: no_amount | no_category | no_evidence | no_precedent
 * | vat_uncertain | wrong_status.
 */
function classify(expense, precedents) {
  if (!['new', 'categorized'].includes(expense.status))
    return { eligible: false, reason: 'wrong_status' };
  if (!(Number(expense.amountSek) > 0)) return { eligible: false, reason: 'no_amount' };
  if (!expense.category) return { eligible: false, reason: 'no_category' };
  if (!Array.isArray(expense.attachmentKeys) || expense.attachmentKeys.length < 1)
    return { eligible: false, reason: 'no_evidence' };
  const prec = precedents.get(normSupplier(expense.supplier));
  if (!prec) return { eligible: false, reason: 'no_precedent' };
  const vatMode = expense.vatMode || prec.vatMode || null;
  if (
    vatMode === 'representation_limited' &&
    !(expense.deductibleVatSek !== null && expense.deductibleVatSek !== undefined)
  )
    return { eligible: false, reason: 'vat_uncertain' };
  return { eligible: true, inheritVatMode: !expense.vatMode && prec.vatMode ? prec.vatMode : null };
}

/**
 * Kör regeln över hela boken. Muterar via store-API:erna (setVatMode,
 * setExpenseStatus) — aldrig direkt. Returnerar summering.
 */
async function autoApproveExpenses({ expenseStore, actor = 'auto-regel', auditLog = null } = {}) {
  if (!expenseStore) throw new Error('expenseStore krävs');
  const all = expenseStore.listExpenses({ limit: 1000 });
  const precedents = buildPrecedents(all);
  const skipped = {};
  const approvedIds = [];
  for (const e of all) {
    const c = classify(e, precedents);
    if (!c.eligible) {
      if (c.reason !== 'wrong_status') skipped[c.reason] = (skipped[c.reason] || 0) + 1;
      continue;
    }
    if (c.inheritVatMode && typeof expenseStore.setVatMode === 'function') {
      await expenseStore.setVatMode({ id: e.id, vatMode: c.inheritVatMode, actor });
    }
    await expenseStore.transitionStatus({
      id: e.id,
      newStatus: 'approved',
      actor,
      reason: 'auto-regel: underlag+belopp+kategori+leverantörsprejudikat (ägar-GO 2026-07-18)',
    });
    await expenseStore.transitionStatus({ id: e.id, newStatus: 'ready_for_export', actor });
    approvedIds.push(e.id);
    if (auditLog && typeof auditLog.record === 'function') {
      try {
        auditLog.record('cf.expense.auto_approved', { expenseId: e.id, actor });
      } catch {
        /* best-effort */
      }
    }
  }
  return { approved: approvedIds.length, approvedIds, skipped };
}

module.exports = { autoApproveExpenses, buildPrecedents, classify, normSupplier };
