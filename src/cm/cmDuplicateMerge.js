'use strict';

/**
 * cmDuplicateMerge — bulk-merge helper for CM duplicate pairs.
 *
 * Each pair is assumed to come from cmStore.getDuplicates(), which already
 * filters out pairs where both records are rejected. This helper focuses on
 * pairs where both records are still pending and both have been handed off
 * to CFO, producing two CFO expenses for the same transaction.
 */

function nowIso() {
  return new Date().toISOString();
}

function isDeletableCfo(expense) {
  if (!expense) return false;
  if (expense.status === 'exported') return false;
  if (expense.fortnoxSyncStatus === 'synced') return false;
  return true;
}

function chooseCanonical(pair) {
  const [a, b] = pair;
  const score = (r) => {
    let s = 0;
    if (r.rawItemId) s += 10;
    if (r.externalAccountingId) s += 20;
    if (r.cfoExpenseId) s += 5;
    return s;
  };
  const aScore = score(a);
  const bScore = score(b);
  if (aScore !== bScore)
    return aScore > bScore ? { canonical: a, duplicate: b } : { canonical: b, duplicate: a };
  if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt
      ? { canonical: a, duplicate: b }
      : { canonical: b, duplicate: a };
  }
  return { canonical: a, duplicate: b };
}

async function bulkMergeDuplicatePairs({ cmStore, cfoExpenseStore, actor, dryRun = true }) {
  const pairs = cmStore.getDuplicates();
  const scanned = pairs.length;
  const merged = [];
  const manualReview = [];
  const skipped = [];
  const errors = [];

  for (const pair of pairs) {
    try {
      const { canonical, duplicate } = chooseCanonical(pair);
      if (canonical.approvalStatus !== 'pending' || duplicate.approvalStatus !== 'pending') {
        skipped.push({
          canonicalId: canonical.id,
          duplicateId: duplicate.id,
          reason: 'minst en post är inte pending',
        });
        continue;
      }
      if (!canonical.cfoExpenseId || !duplicate.cfoExpenseId) {
        skipped.push({
          canonicalId: canonical.id,
          duplicateId: duplicate.id,
          reason: 'saknar CFO-koppling',
        });
        continue;
      }

      const canonicalCfo = cfoExpenseStore.getById(canonical.cfoExpenseId);
      const duplicateCfo = cfoExpenseStore.getById(duplicate.cfoExpenseId);
      if (!canonicalCfo || !duplicateCfo) {
        skipped.push({
          canonicalId: canonical.id,
          duplicateId: duplicate.id,
          reason: 'CFO-expense saknas',
        });
        continue;
      }

      if (dryRun) {
        merged.push({
          canonicalId: canonical.id,
          duplicateId: duplicate.id,
          canonicalCfoId: canonicalCfo.id,
          duplicateCfoId: duplicateCfo.id,
          supplier: canonical.supplierName,
          amount: canonical.amountIncVat,
          action: isDeletableCfo(duplicateCfo) ? 'reject_cm_and_delete_cfo' : 'reject_cm_keep_cfo',
        });
        continue;
      }

      // Reject duplicate CM record
      cmStore.reject(duplicate.id, {
        rejectedBy: actor,
        reason: 'Bulk-merge: dubblett av ' + canonical.id,
      });

      if (isDeletableCfo(duplicateCfo)) {
        await cfoExpenseStore.transitionStatus({
          id: duplicateCfo.id,
          newStatus: 'rejected',
          reason: 'Bulk-merge: dubblett av ' + canonicalCfo.id,
          actor,
        });
        await cfoExpenseStore.deleteExpense({ id: duplicateCfo.id, actor });

        // Om canonical saknar anteckningar och duplicate har några, kopiera över.
        if (!canonicalCfo.notes && duplicateCfo.notes) {
          await cfoExpenseStore.updateExpense({
            id: canonicalCfo.id,
            patch: { notes: duplicateCfo.notes },
            actor: { userId: actor, role: 'owner', via: 'cm-bulk-merge' },
          });
        }

        merged.push({
          canonicalId: canonical.id,
          duplicateId: duplicate.id,
          canonicalCfoId: canonicalCfo.id,
          duplicateCfoId: duplicateCfo.id,
          supplier: canonical.supplierName,
          amount: canonical.amountIncVat,
          action: 'deleted_duplicate_cfo',
        });
      } else {
        manualReview.push({
          canonicalId: canonical.id,
          duplicateId: duplicate.id,
          canonicalCfoId: canonicalCfo.id,
          duplicateCfoId: duplicateCfo.id,
          supplier: canonical.supplierName,
          amount: canonical.amountIncVat,
          reason: 'CFO-expense redan exporterad/synkad',
        });
      }
    } catch (err) {
      errors.push({ pair: pair.map((r) => r.id), error: err.message });
    }
  }

  return { ok: true, dryRun, scanned, merged, manualReview, skipped, errors };
}

module.exports = {
  chooseCanonical,
  bulkMergeDuplicatePairs,
};
