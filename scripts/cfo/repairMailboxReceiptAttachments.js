#!/usr/bin/env node
'use strict';

/**
 * repairMailboxReceiptAttachments — återhämta saknade eller felaktiga kvitto-PDF:er
 * från mailbox truth.
 *
 * För varje kvitto som antingen saknar fil, har nollbyte-fil, eller inte klarar
 * valideringen mot underliggande transaktion, letar vi upp originalmailet i
 * mailbox truth och hämtar en giltig PDF med den nya validerande logiken.
 * Hittas en giltig bilaga skapas ett nytt kvitto, utgiften pekas om, och det
 * gamla kvittot avvisas.
 *
 * Kör torrkokning som standard — sätt DRY_RUN=false för att skriva.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Höj shard-cache så alla brevlådor får plats samtidigt under sökningen.
process.env.ARCANA_CCO_MAILBOX_TRUTH_MAX_LOADED_SHARDS = String(
  process.env.ARCANA_CCO_MAILBOX_TRUTH_MAX_LOADED_SHARDS || 20
);

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
const defaultMailbox = process.env.CM_MAIL_ACCOUNT || 'kvitto@hairtpclinic.com';
const sleepMs = Number(process.env.REPAIR_SLEEP_MS || 200);
const limit = Number(process.env.LIMIT || 0);
const targetReceiptId = process.env.RECEIPT_ID || null;

async function main() {
  console.log(
    `[repair] start — dryRun=${dryRun}, stateRoot=${stateRoot}, defaultMailbox=${defaultMailbox}, target=${targetReceiptId || '(all)'}`
  );

  // Sätt roten innan config.js laddas så att secure storage provider får rätt path.
  process.env.ARCANA_CCO_SECURE_STORAGE_ROOT = secureStorageRoot;

  const { createSecureStorageProvider } = require('../../src/ops/ccoSecureStorageProvider');
  const { createCfoReceiptStore } = require('../../src/cfo/cfoReceiptStore');
  const { createCfoExpenseStore } = require('../../src/cfo/cfoExpenseStore');
  const { validatePdfAttachment } = require('../../src/cfo/cfoInvoiceValidator');
  const {
    findMailboxMessage,
    fetchMailboxPdfAttachment,
  } = require('../../src/cfo/cfoInvoiceFetch');
  const {
    createConfiguredCcoMailboxTruthStore,
  } = require('../../src/ops/ccoMailboxTruthStoreFactory');
  const {
    createMicrosoftGraphReadConnector,
  } = require('../../src/infra/microsoftGraphReadConnector');
  const { config } = require('../../src/config');

  const secureStorage = createSecureStorageProvider({ provider: 'local' });
  const receiptStore = await createCfoReceiptStore({ filePath: receiptStorePath, secureStorage });
  const expenseStore = await createCfoExpenseStore({ filePath: expenseStorePath, secureStorage });

  const mailboxTruthStore = await createConfiguredCcoMailboxTruthStore(config);
  const configuredMailboxes = Array.isArray(config.schedulerCcoHistoryMailboxIds)
    ? config.schedulerCcoHistoryMailboxIds
    : [];
  for (const mb of configuredMailboxes) {
    await mailboxTruthStore.ensureMailboxLoaded?.(mb);
  }
  const loadedMailboxes = Array.isArray(mailboxTruthStore.listLoadedMailboxes?.())
    ? mailboxTruthStore.listLoadedMailboxes()
    : [];
  console.log(`[repair] loaded mailboxes: ${loadedMailboxes.join(', ') || '(none yet)'}`);

  const graphReadConnector = createMicrosoftGraphReadConnector({
    tenantId: process.env.ARCANA_GRAPH_TENANT_ID,
    clientId: process.env.ARCANA_GRAPH_CLIENT_ID,
    clientSecret: process.env.ARCANA_GRAPH_CLIENT_SECRET,
    userId: process.env.ARCANA_GRAPH_USER_ID || '',
    fullTenant: true,
    userScope: 'all',
    mailAssetCache: null,
  });

  // Ladda transaktioner direkt från filen.
  const cardData = JSON.parse(fs.readFileSync(cardReconciliationPath, 'utf8'));
  const transactions = Array.isArray(cardData.transactions) ? cardData.transactions : [];
  const expenseIdToTx = new Map();
  for (const tx of transactions) {
    if (tx.matchedExpenseId) expenseIdToTx.set(tx.matchedExpenseId, tx);
  }

  const receipts = receiptStore.listReceipts({ limit: 10000 });
  const expenses = expenseStore.listExpenses({ limit: 10000 });
  const receiptIdToExpense = new Map();
  for (const e of expenses) {
    if (e.receiptId) receiptIdToExpense.set(e.receiptId, e);
  }

  let candidateReceipts = receipts;
  if (targetReceiptId) {
    candidateReceipts = receipts.filter((r) => r.id === targetReceiptId);
  } else if (limit > 0) {
    candidateReceipts = receipts.slice(0, limit);
  }
  console.log(
    `[repair] candidates=${candidateReceipts.length} (limit=${limit || 'none'}, target=${targetReceiptId || 'none'})`
  );

  const actor = { userId: 'system', role: 'system' };
  const report = {
    runAt: new Date().toISOString(),
    dryRun,
    inspected: 0,
    skippedOk: 0,
    skippedLocked: 0,
    repaired: [],
    failed: [],
    markedNeedsReview: [],
  };

  for (const receipt of candidateReceipts) {
    // Hoppa över exporterade kvitton — de är redan bokförda.
    if (receipt.status === 'exported') {
      report.skippedLocked += 1;
      continue;
    }

    report.inspected += 1;
    const expense = receiptIdToExpense.get(receipt.id);
    const tx = expenseIdToTx.get(expense?.id);
    const syntheticTx = buildSyntheticTx({ receipt, expense, tx });

    let buffer = null;
    let fetchError = null;
    let currentValidation = null;
    try {
      const obj = await secureStorage.getObject(receipt.storageKey);
      buffer = obj?.buffer || obj;
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        fetchError = 'tom eller saknad buffer';
      }
    } catch (err) {
      fetchError = err?.message || 'secure storage error';
    }

    if (buffer && buffer.length > 0) {
      currentValidation = await validatePdfAttachment({ buffer, tx: syntheticTx });
      if (currentValidation.ok && currentValidation.score >= minScore) {
        report.skippedOk += 1;
        continue;
      }
    }

    const problem = fetchError
      ? `missing_or_empty: ${fetchError}`
      : `validation_failed: ${(currentValidation.reasons || []).slice(0, 3).join(',')}`;

    console.log(
      `[repair] ${receipt.id} ${receipt.supplier || '(no supplier)'} ${receipt.amountSek || 0}kr — ${problem}`
    );

    // Försök först exakt återhämtning via message key i notes.
    let message = null;
    let attachment = null;
    const notesMailboxId = extractMailboxFromNotes(receipt.notes) || defaultMailbox;
    const messageKey = extractMessageKeyFromNotes(expense?.notes || receipt.notes);
    if (messageKey) {
      message = await findMessageByKey({ mailboxTruthStore, messageKey });
      if (message) {
        attachment = await fetchAttachmentByChecksum({
          message,
          graphReadConnector,
          receipt,
        });
        if (attachment?.buffer) {
          console.log(
            `[repair] ${receipt.id} exakt återhämtning via message key ${messageKey.mailboxId}:${messageKey.receivedAt}`
          );
        }
      }
    }

    // Fallback: sök efter leverantör/belopp/datum.
    if (!attachment?.buffer) {
      message = await findMailboxMessage({
        tx: syntheticTx,
        mailboxTruthStore,
        opts: { mailboxIds: [notesMailboxId] },
      });
      if (!message && configuredMailboxes.length > 1) {
        const fallbackMailboxes = configuredMailboxes.filter((mb) => mb !== notesMailboxId);
        message = await findMailboxMessage({
          tx: syntheticTx,
          mailboxTruthStore,
          opts: { mailboxIds: fallbackMailboxes },
        });
        if (message) {
          console.log(
            `[repair] ${receipt.id} hittades i brevlåda ${message.mailboxId} (notes sa ${notesMailboxId})`
          );
        }
      }

      if (!message) {
        report.failed.push({
          receiptId: receipt.id,
          supplier: receipt.supplier,
          amountSek: receipt.amountSek,
          date: receipt.date,
          reason: 'mailbox_message_not_found',
          problem,
        });
        await markNeedsReview({
          receiptStore,
          expenseStore,
          receipt,
          expense,
          problem,
          actor,
          report,
        });
        if (sleepMs > 0) await sleep(sleepMs);
        continue;
      }

      attachment = await fetchMailboxPdfAttachment({
        message,
        graphReadConnector,
        tx: syntheticTx,
      });
    }

    if (!attachment?.buffer) {
      report.failed.push({
        receiptId: receipt.id,
        supplier: receipt.supplier,
        amountSek: receipt.amountSek,
        date: receipt.date,
        reason: attachment?.error || 'mailbox_pdf_fetch_failed',
        problem,
      });
      await markNeedsReview({
        receiptStore,
        expenseStore,
        receipt,
        expense,
        problem,
        actor,
        report,
      });
      if (sleepMs > 0) await sleep(sleepMs);
      continue;
    }

    if (dryRun) {
      report.repaired.push({
        receiptId: receipt.id,
        supplier: receipt.supplier,
        amountSek: receipt.amountSek,
        date: receipt.date,
        dryRun: true,
        message: message.subject,
        messageId: message.id,
        attachmentName: attachment.name,
        validationScore: attachment.validation?.score || null,
        matchedByChecksum: attachment.matchedByChecksum || false,
      });
      if (sleepMs > 0) await sleep(sleepMs);
      continue;
    }

    // Skapa nytt kvitto med korrekt underlag.
    try {
      const newReceipt = await receiptStore.uploadReceipt({
        buffer: attachment.buffer,
        mimeType: attachment.contentType || 'application/pdf',
        originalFileName: attachment.name,
        sourceSystem: 'receipt_mail_import',
        actor,
        metadata: {
          supplier: receipt.supplier,
          amountSek: receipt.amountSek,
          date: receipt.date,
          category: receipt.category,
          notes: appendNote(
            receipt.notes,
            `[REPAIR] Återhämtad ur mailbox ${messageKey ? messageKey.mailboxId : notesMailboxId} ${new Date().toISOString()}`
          ),
        },
      });

      if (expense) {
        await expenseStore.updateExpense({
          id: expense.id,
          patch: {
            receiptId: newReceipt.id,
            notes: appendNote(
              expense.notes,
              `[REPAIR] nytt kvitto ${newReceipt.id} för ${receipt.id}`
            ),
          },
          actor,
        });
      }

      await receiptStore.transitionStatus({
        id: receipt.id,
        newStatus: 'rejected',
        reason: `replaced_by_repair: ${newReceipt.id}`,
        actor,
      });

      report.repaired.push({
        oldReceiptId: receipt.id,
        newReceiptId: newReceipt.id,
        supplier: receipt.supplier,
        amountSek: receipt.amountSek,
        date: receipt.date,
        messageId: message.id,
        attachmentName: attachment.name,
        validationScore: attachment.validation?.score || null,
        matchedByChecksum: attachment.matchedByChecksum || false,
      });
    } catch (err) {
      report.failed.push({
        receiptId: receipt.id,
        supplier: receipt.supplier,
        amountSek: receipt.amountSek,
        date: receipt.date,
        reason: 'repair_write_failed',
        error: err.message,
      });
      await markNeedsReview({
        receiptStore,
        expenseStore,
        receipt,
        expense,
        problem,
        actor,
        report,
      });
    }

    if (sleepMs > 0) await sleep(sleepMs);
  }

  const reportPath = path.join(
    stateRoot,
    `receipt-repair-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`[repair] report written to: ${reportPath}`);
  console.log(
    `[repair] inspected=${report.inspected}, skippedOk=${report.skippedOk}, skippedLocked=${report.skippedLocked}, repaired=${report.repaired.length}, failed=${report.failed.length}, needsReview=${report.markedNeedsReview.length}`
  );
  process.exit(0);
}

function buildSyntheticTx({ receipt, expense, tx }) {
  if (tx) {
    return {
      description: tx.description || receipt.supplier || '',
      amountSek: tx.amountSek,
      date: tx.date,
      cardRef: tx.cardRef,
    };
  }
  if (expense?.notes) {
    const parsed = parseCardNote(expense.notes);
    if (parsed) {
      return {
        description: parsed.description || receipt.supplier || '',
        amountSek: receipt.amountSek,
        date: parsed.date || receipt.date,
      };
    }
  }
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
  return { cardRef: m[1], date: m[2], description: m[3].trim() };
}

function extractMailboxFromNotes(notes) {
  const m = String(notes).match(/ur mailbox\s+(\S+)/i);
  return m ? m[1].trim() : null;
}

function appendNote(current, addition) {
  const base = String(current || '').trim();
  if (base.includes(addition)) return base;
  return base ? `${base}\n${addition}` : addition;
}

async function markNeedsReview({
  receiptStore,
  expenseStore,
  receipt,
  expense,
  problem,
  actor,
  report,
}) {
  report.markedNeedsReview.push({
    receiptId: receipt.id,
    supplier: receipt.supplier,
    amountSek: receipt.amountSek,
    date: receipt.date,
    problem,
  });
  if (dryRun) return;
  try {
    await receiptStore.updateReceipt({
      id: receipt.id,
      patch: { notes: appendNote(receipt.notes, `[AUDIT] ${problem}`) },
      actor,
    });
    if (receipt.status !== 'needs_review' && receipt.status !== 'rejected') {
      await receiptStore.transitionStatus({
        id: receipt.id,
        newStatus: 'needs_review',
        reason: problem,
        actor,
      });
    }
    if (expense && expense.status !== 'needs_review' && expense.status !== 'rejected') {
      await expenseStore.updateExpense({
        id: expense.id,
        patch: { notes: appendNote(expense.notes, `[AUDIT] kvitto ${receipt.id}: ${problem}`) },
        actor,
      });
    }
  } catch (err) {
    console.warn(`[repair] kunde inte markera ${receipt.id}: ${err.message}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function extractMessageKeyFromNotes(notes = '') {
  // Format: "Underlag från mailbox: <mailboxId> / <mailboxId>:<ISO-timestamp>"
  const m = String(notes).match(
    /\s(\S+@[^\s/]+):(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)/
  );
  if (!m) return null;
  return { mailboxId: m[1], receivedAt: m[2] };
}

async function findMessageByKey({ mailboxTruthStore, messageKey }) {
  if (!mailboxTruthStore || typeof mailboxTruthStore.ensureMailboxLoaded !== 'function')
    return null;
  await mailboxTruthStore.ensureMailboxLoaded(messageKey.mailboxId);
  const rows = mailboxTruthStore.listMessages({
    mailboxIds: [messageKey.mailboxId],
    limit: 0,
  });
  return (
    rows.find((m) => {
      const received = m.receivedAt || m.sentAt || m.lastModifiedAt || '';
      return received === messageKey.receivedAt;
    }) || null
  );
}

async function fetchAttachmentByChecksum({ message, graphReadConnector, receipt }) {
  if (!graphReadConnector || !message?.attachments?.length) return null;
  const pdfs = message.attachments.filter((a) => {
    const contentType = String(a?.contentType || '').toLowerCase();
    const name = String(a?.name || '').toLowerCase();
    return contentType.includes('pdf') || name.endsWith('.pdf');
  });
  if (!pdfs.length) return null;

  const userId = message.userPrincipalName || message.mailboxAddress || message.mailboxId;
  const messageId = message.graphMessageId || message.messageId || message.id;
  const targetChecksum = String(receipt.checksum || '').toLowerCase();

  let firstFetched = null;
  const errors = [];
  for (const pdf of pdfs) {
    try {
      const fetched = await graphReadConnector.fetchMessageAttachmentContent({
        userId,
        messageId,
        attachmentId: pdf.id,
      });
      if (!fetched?.buffer?.length) {
        errors.push(`${pdf.id}: tom buffer`);
        continue;
      }
      if (!firstFetched) {
        firstFetched = {
          buffer: fetched.buffer,
          name: fetched.name || pdf.name || 'underlag.pdf',
          contentType: fetched.contentType || pdf.contentType || 'application/pdf',
        };
      }
      if (targetChecksum && sha256(fetched.buffer) === targetChecksum) {
        return {
          buffer: fetched.buffer,
          name: fetched.name || pdf.name || 'underlag.pdf',
          contentType: fetched.contentType || pdf.contentType || 'application/pdf',
          matchedByChecksum: true,
        };
      }
    } catch (err) {
      errors.push(`${pdf.id}: ${err.message}`);
    }
  }

  // Ingen checksum-match — returnera första hämtade PDF:n så länge vi inte
  // har något bättre att gå på. Den får granskas manuellt i UI.
  if (firstFetched) {
    return { ...firstFetched, matchedByChecksum: false, checksumErrors: errors };
  }
  return { error: `kunde inte hämta någon PDF-bilaga: ${errors.join('; ')}` };
}

main().catch((err) => {
  console.error('[repair] fatal:', err);
  process.exit(1);
});
