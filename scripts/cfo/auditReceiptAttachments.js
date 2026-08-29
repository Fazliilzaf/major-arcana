#!/usr/bin/env node
'use strict';

/**
 * auditReceiptAttachments — end-to-end validering av alla CFO-kvitton.
 *
 * Laddar varje kvitto-PDF från secure storage, validerar den mot den
 * underliggande korttransaktionen (via expense → card reconciliation) och
 * markerar misstänkta/misslyckade som "needs_review" med en förklaring.
 *
 * Användning (lokalt):
 *   DRY_RUN=false node scripts/cfo/auditReceiptAttachments.js
 *
 * Användning (Render, från /opt/render/project/src):
 *   ARCANA_STATE_ROOT=/var/data ARCANA_CCO_SECURE_STORAGE_ROOT=/var/data/cco-secure-storage \
 *   DRY_RUN=false node scripts/cfo/auditReceiptAttachments.js
 */

const fs = require('node:fs');
const path = require('node:path');

const dryRun = !['false', '0', 'no'].includes(String(process.env.DRY_RUN || 'true').toLowerCase());
const stateRoot = process.env.ARCANA_STATE_ROOT || '/var/data';
const receiptStorePath =
  process.env.RECEIPT_STORE_PATH || path.join(stateRoot, 'cco', 'receipts.json');
const expenseStorePath =
  process.env.EXPENSE_STORE_PATH || path.join(stateRoot, 'cco', 'expenses.json');
const cardReconciliationPath =
  process.env.CARD_RECONCILIATION_PATH || path.join(stateRoot, 'cfo-card-reconciliation.json');
const secureStorageRoot =
  process.env.ARCANA_CCO_SECURE_STORAGE_ROOT || path.join(stateRoot, 'cco-secure-storage');
const minScore = Number(process.env.MIN_SCORE || 0.75);

async function main() {
  console.log(`[audit] start — dryRun=${dryRun}, stateRoot=${stateRoot}, minScore=${minScore}`);

  const { createSecureStorageProvider } = require('../../src/ops/ccoSecureStorageProvider');
  const { createCfoReceiptStore } = require('../../src/cfo/cfoReceiptStore');
  const { createCfoExpenseStore } = require('../../src/cfo/cfoExpenseStore');
  const { validatePdfAttachment } = require('../../src/cfo/cfoInvoiceValidator');

  const secureStorage = createSecureStorageProvider({ provider: 'local' });
  const receiptStore = await createCfoReceiptStore({
    filePath: receiptStorePath,
    secureStorage,
  });
  const expenseStore = await createCfoExpenseStore({
    filePath: expenseStorePath,
    secureStorage,
  });

  // Ladda transaktioner direkt från filen (store:en har inget sökbart index).
  const cardData = JSON.parse(fs.readFileSync(cardReconciliationPath, 'utf8'));
  const transactions = Array.isArray(cardData.transactions) ? cardData.transactions : [];
  const expenseIdToTx = new Map();
  for (const tx of transactions) {
    if (tx.matchedExpenseId) {
      expenseIdToTx.set(tx.matchedExpenseId, tx);
    }
  }

  const receipts = receiptStore.listReceipts({ limit: 10000 });
  const expenses = expenseStore.listExpenses({ limit: 10000 });
  const receiptIdToExpense = new Map();
  for (const e of expenses) {
    if (e.receiptId) receiptIdToExpense.set(e.receiptId, e);
  }

  const actor = { userId: 'system', role: 'system' };
  const report = {
    runAt: new Date().toISOString(),
    dryRun,
    receiptsAudited: 0,
    ok: [],
    missing: [],
    suspicious: [],
    repaired: [],
    errors: [],
  };

  for (const receipt of receipts) {
    report.receiptsAudited += 1;
    const expense = receiptIdToExpense.get(receipt.id);
    const tx = expenseIdToTx.get(expense?.id);

    const syntheticTx = buildSyntheticTx({ receipt, expense, tx });

    let buffer = null;
    let fetchError = null;
    try {
      const obj = await secureStorage.getObject(receipt.storageKey);
      buffer = obj?.buffer || obj;
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        fetchError = 'secure storage returnerade tom buffer';
      }
    } catch (err) {
      fetchError = err?.message || 'kunde inte läsa från secure storage';
    }

    if (!buffer || fetchError) {
      const reason = `missing_or_unreadable_attachment: ${fetchError}`;
      report.missing.push({
        receiptId: receipt.id,
        supplier: receipt.supplier,
        amountSek: receipt.amountSek,
        date: receipt.date,
        storageKey: receipt.storageKey,
        reason,
      });
      if (!dryRun) {
        try {
          await receiptStore.updateReceipt({
            id: receipt.id,
            patch: { notes: appendNote(receipt.notes, `[AUDIT] ${reason}`) },
            actor,
          });
          if (receipt.status !== 'needs_review' && receipt.status !== 'rejected') {
            await receiptStore.transitionStatus({
              id: receipt.id,
              newStatus: 'needs_review',
              reason,
              actor,
            });
          }
        } catch (e) {
          report.errors.push({ receiptId: receipt.id, phase: 'mark_missing', error: e.message });
        }
      }
      continue;
    }

    const validation = await validatePdfAttachment({ buffer, tx: syntheticTx });

    if (validation.ok && validation.score >= minScore) {
      report.ok.push({
        receiptId: receipt.id,
        supplier: receipt.supplier,
        amountSek: receipt.amountSek,
        date: receipt.date,
        score: validation.score,
      });
      continue;
    }

    const reasons = validation.reasons || [];
    const strongReject = reasons.find((r) => r.startsWith('strong_reject_signal'));
    const reasonSummary = strongReject
      ? `strong_reject:${strongReject}`
      : `validation_failed:${reasons.slice(0, 3).join(',')}`;

    report.suspicious.push({
      receiptId: receipt.id,
      supplier: receipt.supplier,
      amountSek: receipt.amountSek,
      date: receipt.date,
      storageKey: receipt.storageKey,
      score: validation.score,
      reasons,
      tx: syntheticTx,
    });

    if (!dryRun) {
      try {
        await receiptStore.updateReceipt({
          id: receipt.id,
          patch: {
            notes: appendNote(
              receipt.notes,
              `[AUDIT score=${validation.score.toFixed(2)}] ${reasonSummary}`
            ),
          },
          actor,
        });
        if (receipt.status !== 'needs_review' && receipt.status !== 'rejected') {
          await receiptStore.transitionStatus({
            id: receipt.id,
            newStatus: 'needs_review',
            reason: reasonSummary,
            actor,
          });
        }
        if (expense && expense.status !== 'needs_review' && expense.status !== 'rejected') {
          await expenseStore.updateExpense({
            id: expense.id,
            patch: {
              notes: appendNote(
                expense.notes,
                `[AUDIT] kvitto ${receipt.id} underkändes: ${reasonSummary}`
              ),
            },
            actor,
          });
        }
      } catch (e) {
        report.errors.push({ receiptId: receipt.id, phase: 'mark_suspicious', error: e.message });
      }
    }
  }

  const reportPath = path.join(
    stateRoot,
    `receipt-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`[audit] report written to: ${reportPath}`);
  console.log(
    `[audit] ok=${report.ok.length}, missing=${report.missing.length}, suspicious=${report.suspicious.length}, errors=${report.errors.length}`
  );
  process.exit(0);
}

function buildSyntheticTx({ receipt, expense, tx }) {
  // 1. Äkta transaktion från kortreconciliationsfilen är bäst.
  if (tx) {
    return {
      description: tx.description || receipt.supplier || '',
      amountSek: tx.amountSek,
      date: tx.date,
    };
  }
  // 2. Expense.notes innehåller "Kortdragning <cardRef> <date> <description>"
  if (expense?.notes) {
    const parsed = parseCardNote(expense.notes);
    if (parsed) {
      return {
        description: parsed.description || receipt.supplier || '',
        amountSek: parsed.amountSek ?? receipt.amountSek,
        date: parsed.date || receipt.date,
      };
    }
  }
  // 3. Falla tillbaka på kvittots egna metadata.
  return {
    description: receipt.supplier || '',
    amountSek: receipt.amountSek,
    date: receipt.date,
  };
}

function parseCardNote(note) {
  const m = String(note).match(
    /Kortdragning\s+(\S+)\s+(\d{4}-\d{2}-\d{2})\s+(.+?)(?:\.\s+Underlag|$)/
  );
  if (!m) return null;
  return {
    cardRef: m[1],
    date: m[2],
    description: m[3].trim(),
  };
}

function appendNote(current, addition) {
  const base = String(current || '').trim();
  if (base.includes(addition)) return base;
  return base ? `${base}\n${addition}` : addition;
}

main().catch((err) => {
  console.error('[audit] fatal:', err);
  process.exit(1);
});
