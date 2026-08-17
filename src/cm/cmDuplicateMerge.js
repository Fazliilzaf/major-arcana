'use strict';

/**
 * cmDuplicateMerge — bulk-merge helper for CM duplicate pairs.
 *
 * Consumes cmStore.getDuplicates(), which already hides pairs where both
 * records are rejected. This helper merges the remaining pairs by keeping
 * the stronger record as canonical and rejecting the weaker one. When the
 * weaker record has a deletable CFO-expense, that expense is also removed.
 */

function scoreRecord(r) {
  let s = 0;
  // A non-rejected record is always preferred as canonical.
  if (r.approvalStatus !== 'rejected') s += 1000;
  // Existing CFO hand-off is the next strongest signal.
  if (r.cfoExpenseId) s += 500;
  // Already exported/accounted for is even stronger (but rare as canonical).
  if (r.externalAccountingId) s += 200;
  // Tied to a raw mail item.
  if (r.rawItemId) s += 100;
  return s;
}

function chooseCanonical(pair) {
  const [a, b] = pair;
  const aScore = scoreRecord(a);
  const bScore = scoreRecord(b);
  if (aScore !== bScore) {
    return aScore > bScore ? { canonical: a, duplicate: b } : { canonical: b, duplicate: a };
  }
  if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt
      ? { canonical: a, duplicate: b }
      : { canonical: b, duplicate: a };
  }
  return { canonical: a, duplicate: b };
}

function isDeletableCfo(expense) {
  if (!expense) return false;
  if (expense.status === 'exported') return false;
  if (expense.fortnoxSyncStatus === 'synced') return false;
  return true;
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

      const canonicalCfoId = canonical.cfoExpenseId || null;
      const duplicateCfoId = duplicate.cfoExpenseId || null;
      const canonicalCfo = canonicalCfoId ? cfoExpenseStore.getById(canonicalCfoId) : null;
      const duplicateCfo = duplicateCfoId ? cfoExpenseStore.getById(duplicateCfoId) : null;

      // Nothing to do if the weaker record is already rejected.
      if (duplicate.approvalStatus === 'rejected') {
        skipped.push({
          canonicalId: canonical.id,
          duplicateId: duplicate.id,
          reason: 'duplicate redan avvisad',
        });
        continue;
      }

      // Determine the concrete action for reporting / execution.
      let action;
      if (duplicateCfo && isDeletableCfo(duplicateCfo)) {
        action = 'reject_cm_and_delete_cfo';
      } else if (duplicateCfo) {
        action = 'reject_cm_keep_cfo';
      } else {
        action = 'reject_cm_no_cfo';
      }

      if (dryRun) {
        merged.push({
          canonicalId: canonical.id,
          duplicateId: duplicate.id,
          canonicalCfoId: canonicalCfo?.id || null,
          duplicateCfoId: duplicateCfo?.id || null,
          supplier: canonical.supplierName,
          amount: canonical.amountIncVat,
          action,
        });
        continue;
      }

      // Reject the weaker CM record.
      cmStore.reject(duplicate.id, {
        rejectedBy: actor,
        reason: 'Bulk-merge: dubblett av ' + canonical.id,
      });

      if (duplicateCfo && isDeletableCfo(duplicateCfo)) {
        await cfoExpenseStore.transitionStatus({
          id: duplicateCfo.id,
          newStatus: 'rejected',
          reason: 'Bulk-merge: dubblett av ' + (canonicalCfo?.id || canonical.id),
          actor,
        });
        await cfoExpenseStore.deleteExpense({ id: duplicateCfo.id, actor });

        // If the canonical CFO lacks notes and the duplicate had some, copy them over.
        if (canonicalCfo && !canonicalCfo.notes && duplicateCfo.notes) {
          await cfoExpenseStore.updateExpense({
            id: canonicalCfo.id,
            patch: { notes: duplicateCfo.notes },
            actor: { userId: actor, role: 'owner', via: 'cm-bulk-merge' },
          });
        }
      } else if (duplicateCfo) {
        manualReview.push({
          canonicalId: canonical.id,
          duplicateId: duplicate.id,
          canonicalCfoId: canonicalCfo?.id || null,
          duplicateCfoId: duplicateCfo.id,
          supplier: canonical.supplierName,
          amount: canonical.amountIncVat,
          reason: 'CFO-expense redan exporterad/synkad',
        });
      }

      merged.push({
        canonicalId: canonical.id,
        duplicateId: duplicate.id,
        canonicalCfoId: canonicalCfo?.id || null,
        duplicateCfoId: duplicateCfo?.id || null,
        supplier: canonical.supplierName,
        amount: canonical.amountIncVat,
        action,
      });
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
