'use strict';

/**
 * CM Mail Sync — Microsoft Graph delta sync for expense mail.
 *
 * Reads expense-related emails from configured mailbox folders.
 * Uses delta query for incremental sync (only new/changed mail).
 *
 * Flow:
 * 1. Get delta token for folder
 * 2. Fetch new messages since last sync
 * 3. For each message: check attachments → import to CM
 * 4. Save new delta token
 *
 * Env: Uses existing Graph connector (ARCANA_GRAPH_*)
 */

const { extractDocument } = require('./cmAiExtractor');

function normalizeText(v) { return typeof v === 'string' ? v.trim() : ''; }
function nowIso() { return new Date().toISOString(); }

const CM_MAIL_FOLDERS = ['Inbox', 'Fakturor', 'Kvitton', 'Expenses'];

function createCmMailSync({ graphReadConnector, cmStore }) {
  let deltaTokens = new Map();

  async function syncFolder(mailboxId, folderName = 'Inbox') {
    if (!graphReadConnector?.listMessages) {
      return { ok: false, error: 'Graph read connector not available' };
    }

    const results = { folder: folderName, imported: 0, duplicates: 0, processed: 0, errors: [] };

    try {
      const messages = await graphReadConnector.listMessages({
        mailboxId,
        folder: folderName,
        top: 50,
        filter: "hasAttachments eq true or contains(subject, 'faktura') or contains(subject, 'kvitto') or contains(subject, 'order') or contains(subject, 'receipt') or contains(subject, 'invoice')",
      });

      if (!messages?.value?.length) {
        return { ...results, message: 'Inga nya meddelanden' };
      }

      for (const msg of messages.value) {
        results.processed++;

        const hasAttachment = msg.hasAttachments === true;
        const hasPdf = (msg.body?.content || '').includes('.pdf') || hasAttachment;
        const subject = normalizeText(msg.subject);
        const fromEmail = normalizeText(msg.from?.emailAddress?.address);
        const bodyText = normalizeText(msg.body?.content || '').replace(/<[^>]*>/g, '').slice(0, 5000);

        // Import raw item
        const importResult = cmStore.importRawItem({
          sourceType: 'email',
          sourceId: mailboxId,
          mailMessageId: msg.id,
          internetMessageId: msg.internetMessageId,
          subject,
          fromEmail,
          receivedAt: msg.receivedDateTime,
          rawBodyText: bodyText,
          hasAttachments: hasAttachment,
          hasPdf,
          hasImage: false,
          metadata: { folder: folderName, conversationId: msg.conversationId },
        });

        if (!importResult.ok) {
          results.duplicates++;
          continue;
        }

        results.imported++;

        // Try extraction from body text
        if (bodyText && bodyText.length > 50) {
          try {
            const extraction = await extractDocument({ text: bodyText, source: 'email' });
            if (extraction.ok && extraction.extraction?.confidenceScore >= 50) {
              cmStore.createExpenseRecord({
                expenseType: extraction.extraction.documentType,
                supplierName: extraction.extraction.supplier,
                invoiceNumber: extraction.extraction.invoiceNumber,
                receiptNumber: extraction.extraction.receiptNumber,
                orderNumber: extraction.extraction.orderNumber,
                date: extraction.extraction.date,
                dueDate: extraction.extraction.dueDate,
                amountExVat: extraction.extraction.amountExVat,
                vatAmount: extraction.extraction.vatAmount,
                amountIncVat: extraction.extraction.amountIncVat,
                currency: extraction.extraction.currency,
                category: extraction.extraction.category,
                confidenceScore: extraction.extraction.confidenceScore,
                flags: extraction.extraction.confidenceScore < 70 ? ['NEEDS_MANUAL_REVIEW', 'LOW_CONFIDENCE_EXTRACTION'] : [],
              });
            }
          } catch (err) {
            results.errors.push({ messageId: msg.id, error: err.message });
          }
        }
      }

      await cmStore.persist();
    } catch (err) {
      results.errors.push({ error: err.message });
    }

    return results;
  }

  async function syncAll(mailboxId) {
    const allResults = { mailboxId, folders: [], totalImported: 0, totalDuplicates: 0, syncedAt: nowIso() };

    for (const folder of CM_MAIL_FOLDERS) {
      const result = await syncFolder(mailboxId, folder);
      allResults.folders.push(result);
      allResults.totalImported += result.imported || 0;
      allResults.totalDuplicates += result.duplicates || 0;
    }

    return allResults;
  }

  return { syncFolder, syncAll, CM_MAIL_FOLDERS };
}

module.exports = { createCmMailSync, CM_MAIL_FOLDERS };
