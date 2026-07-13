'use strict';

/**
 * CM Mail Sync v2 — ORD-64 (2026-07-12).
 *
 * Omskriven på microsoftGraphReadConnectors FAKTISKA API. v1 anropade
 * `listMessages` som aldrig funnits på connectorn → syncen var död kod.
 *
 * v2:
 *  - Äkta delta-sync via fetchMailboxTruthFolderDeltaPage; cursor (deltaLink)
 *    persisteras per mailbox+folderType i cmStore.syncState.
 *  - Original (hela Graph-meddelandet som JSON) arkiveras i secure storage
 *    innan processning — raderas aldrig (BFN 7 år).
 *  - Bilagor: PDF/bild (ej inline, ≤10 MB) hämtas via
 *    fetchMessageAttachmentContent → secure storage → cmStore.createDocument.
 *  - Extraktion: PDF-text via pdf-parse → AI · bild → vision · annars body-text.
 *    Kostnadstak: CM_MAX_EXTRACT_PER_SYNC extraktioner per körning (default 10).
 *  - Processing ledger per item (processorVersion/filterVersion) — reprocess-underlag.
 *
 * Read-only mot Graph. Ingen mailbox-write. Order: ORD-64-cm-pipeline-hardening.md
 */

const crypto = require('node:crypto');
const { extractDocument } = require('./cmAiExtractor');

const CM_PROCESSOR_VERSION = 2;
const CM_FILTER_VERSION = 1;
const DEFAULT_FOLDER_TYPES = ['inbox'];
const MAX_PAGES_PER_RUN = 3;
const MAX_ATTACHMENTS_PER_MESSAGE = 3;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ECONOMY_KEYWORDS =
  /(faktura|fakturor|kvitto|invoice|receipt|order|betalning|payment|prenumeration|subscription|biljett|booking|bokningsbekr)/i;

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function nowIso() {
  return new Date().toISOString();
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sha8(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 8);
}

function safeFileName(name) {
  const cleaned = normalizeText(name)
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 80);
  return cleaned || 'bilaga';
}

let pdfParseModule = null;
function getPdfParse() {
  if (pdfParseModule === null) {
    try {
      pdfParseModule = require('pdf-parse');
    } catch {
      pdfParseModule = false;
    }
  }
  return pdfParseModule || null;
}

function isEconomyCandidate(message) {
  if (message?.hasAttachments === true) return true;
  const hay = `${normalizeText(message?.subject)} ${normalizeText(message?.bodyPreview)}`;
  return ECONOMY_KEYWORDS.test(hay);
}

function createCmMailSync({
  graphReadConnector,
  cmStore,
  secureStorage = null,
  fetchImpl = globalThis.fetch,
  maxExtractPerSync = Math.max(0, Number(process.env.CM_MAX_EXTRACT_PER_SYNC) || 10),
} = {}) {
  // Connectorn exponerar ingen list-metod för bilagor — rått Graph-anrop via
  // connectorns egen token. Read-only ($select på metadata).
  async function listMessageAttachments(mailboxId, messageId) {
    const accessToken = await graphReadConnector.fetchAccessToken();
    const url =
      `${graphReadConnector.graphBaseUrl}/users/${encodeURIComponent(mailboxId)}` +
      `/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size,isInline`;
    const res = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // ORD-67f: delta-sidorna hämtas med immutable-IDs (preferImmutableIds i
        // connectorn) — samma Prefer-header KRÄVS här, annars Graph 400 på id:t.
        // Verifierat live mot kvitto@ 2026-07-13 (alla attachments-list gav 400).
        Prefer: 'IdType="ImmutableId"',
      },
    });
    if (!res.ok) throw new Error(`Graph attachments-list ${res.status}`);
    const data = await res.json();
    return Array.isArray(data?.value) ? data.value : [];
  }

  async function archiveOriginal(message) {
    if (!secureStorage?.putObject) return null;
    const ym = new Date().toISOString().slice(0, 7);
    const key = `cm/raw-mail/${ym}/${sha8(message.id || message.internetMessageId || Math.random())}.json`;
    const put = await secureStorage.putObject({
      key,
      body: JSON.stringify(message),
      contentType: 'application/json',
      metadata: { source: 'cm-mail-original' },
    });
    return put?.storageKey || key;
  }

  async function storeAttachment(mailboxId, messageId, att) {
    const content = await graphReadConnector.fetchMessageAttachmentContent({
      userId: mailboxId,
      messageId,
      attachmentId: att.id,
    });
    if (!content?.buffer?.length) return null;
    const ym = new Date().toISOString().slice(0, 7);
    const key = `cm/receipts/${ym}/${sha8(`${messageId}:${att.id}`)}-${safeFileName(content.name || att.name)}`;
    const put = await secureStorage.putObject({
      key,
      body: content.buffer,
      contentType: content.contentType || att.contentType || 'application/octet-stream',
      metadata: {
        source: 'cm-mail-attachment',
        originalFileName: content.name || att.name || null,
      },
    });
    return {
      storageKey: put?.storageKey || key,
      checksum: put?.checksum || null,
      name: content.name || att.name || null,
      contentType: content.contentType || att.contentType || null,
      buffer: content.buffer,
    };
  }

  async function processMessage({ mailboxId, folderType, message, results, budget }) {
    if (!isEconomyCandidate(message)) {
      results.skipped++;
      return;
    }

    const bodyText = stripHtml(message.body?.content || message.bodyPreview || '').slice(0, 5000);
    const importResult = cmStore.importRawItem({
      sourceType: 'email',
      sourceId: mailboxId,
      mailMessageId: message.id,
      internetMessageId: message.internetMessageId,
      subject: normalizeText(message.subject),
      fromEmail: normalizeText(message.from?.emailAddress?.address),
      receivedAt: message.receivedDateTime,
      rawBodyText: bodyText,
      hasAttachments: message.hasAttachments === true,
      hasPdf: false,
      hasImage: false,
      metadata: { folderType, conversationId: message.conversationId || null },
    });
    if (!importResult.ok) {
      results.duplicates++;
      return;
    }

    const rawItem = importResult.rawItem;
    const ledger = cmStore.addLedgerEntry({
      rawItemId: rawItem.id,
      processorVersion: CM_PROCESSOR_VERSION,
      filterVersion: CM_FILTER_VERSION,
    });

    try {
      const originalKey = await archiveOriginal(message).catch(() => null);
      if (originalKey) rawItem.originalStorageKey = originalKey;

      let extractInput = null;
      let firstDocument = null;

      if (message.hasAttachments === true && secureStorage?.putObject) {
        let attachments = [];
        try {
          attachments = await listMessageAttachments(mailboxId, message.id);
        } catch (err) {
          rawItem.flags.push('ATTACHMENT_UNREADABLE');
          results.errors.push({ messageId: message.id, error: `attachments-list: ${err.message}` });
        }
        const usable = attachments
          .filter(
            (a) =>
              a &&
              !a.isInline &&
              (Number(a.size) || 0) <= MAX_ATTACHMENT_BYTES &&
              /(pdf|image\/)/i.test(normalizeText(a.contentType))
          )
          .slice(0, MAX_ATTACHMENTS_PER_MESSAGE);

        for (const att of usable) {
          let stored = null;
          try {
            stored = await storeAttachment(mailboxId, message.id, att);
          } catch (err) {
            rawItem.flags.push('ATTACHMENT_UNREADABLE');
            results.errors.push({ messageId: message.id, error: `attachment: ${err.message}` });
          }
          if (!stored) continue;
          const isPdf = /pdf/i.test(normalizeText(stored.contentType));
          if (isPdf) rawItem.hasPdf = true;
          else rawItem.hasImage = true;
          const doc = cmStore.createDocument({
            rawItemId: rawItem.id,
            documentType: 'unknown',
            fileName: stored.name || '',
            mimeType: stored.contentType || '',
            storagePath: stored.storageKey,
            fileHash: stored.checksum || '',
            source: isPdf ? 'pdf' : 'image',
          });
          if (!firstDocument) firstDocument = doc;

          if (!extractInput) {
            if (isPdf) {
              const pdfParse = getPdfParse();
              if (pdfParse) {
                const parsed = await pdfParse(stored.buffer).catch(() => null);
                const text = normalizeText(parsed?.text).slice(0, 8000);
                if (text.length > 40) extractInput = { text };
              }
            } else {
              extractInput = {
                imageBase64: stored.buffer.toString('base64'),
                mimeType: stored.contentType || 'image/jpeg',
              };
            }
          }
        }
      }

      if (!extractInput && bodyText.length > 40) extractInput = { text: bodyText };

      let record = null;
      if (extractInput && budget.remaining > 0) {
        budget.remaining -= 1;
        const ex = await extractDocument({ ...extractInput, source: 'email' });
        if (
          ex.ok &&
          ex.extraction &&
          ex.extraction.documentType !== 'unknown' &&
          (Number(ex.extraction.confidenceScore) || 0) >= 50
        ) {
          const confidence = Number(ex.extraction.confidenceScore) || 0;
          record = cmStore.createExpenseRecord({
            documentId: firstDocument?.id || null,
            expenseType: ex.extraction.documentType,
            supplierName: ex.extraction.supplier,
            invoiceNumber: ex.extraction.invoiceNumber,
            receiptNumber: ex.extraction.receiptNumber,
            orderNumber: ex.extraction.orderNumber,
            date: ex.extraction.date,
            dueDate: ex.extraction.dueDate,
            amountExVat: ex.extraction.amountExVat,
            vatAmount: ex.extraction.vatAmount,
            amountIncVat: ex.extraction.amountIncVat,
            currency: ex.extraction.currency,
            category: ex.extraction.category,
            confidenceScore: confidence,
            flags: confidence < 70 ? ['NEEDS_MANUAL_REVIEW', 'LOW_CONFIDENCE_EXTRACTION'] : [],
          });
          results.records++;
        } else if (!ex.ok) {
          results.errors.push({ messageId: message.id, error: `extract: ${ex.error}` });
        }
      }

      cmStore.completeLedgerEntry(ledger.id, {
        status: 'done',
        documentId: firstDocument?.id || null,
        expenseRecordId: record?.id || null,
      });
      results.imported++;
    } catch (err) {
      cmStore.completeLedgerEntry(ledger.id, { status: 'failed', errorMessage: err.message });
      results.errors.push({ messageId: message.id, error: err.message });
    }
  }

  async function syncFolder(mailboxId, folderType = 'inbox') {
    if (typeof graphReadConnector?.fetchMailboxTruthFolderDeltaPage !== 'function') {
      return {
        ok: false,
        folderType,
        error: 'Graph read connector saknar delta-API (fetchMailboxTruthFolderDeltaPage)',
      };
    }
    const results = {
      ok: true,
      folderType,
      pages: 0,
      processed: 0,
      imported: 0,
      duplicates: 0,
      records: 0,
      skipped: 0,
      errors: [],
    };
    const budget = { remaining: maxExtractPerSync };
    let cursorUrl = normalizeText(cmStore.getSyncState(mailboxId, folderType)?.deltaLink) || null;
    let retriedFresh = false;

    for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
      let pageResult;
      try {
        pageResult = await graphReadConnector.fetchMailboxTruthFolderDeltaPage({
          userId: mailboxId,
          folderType,
          pageSize: 50,
          cursorUrl,
        });
      } catch (err) {
        const invalidToken =
          err?.code === 'GRAPH_DELTA_TOKEN_INVALID' ||
          /delta token invalid/i.test(normalizeText(err?.message));
        if (invalidToken && !retriedFresh) {
          retriedFresh = true;
          cursorUrl = null;
          cmStore.setSyncState(mailboxId, folderType, { deltaLink: null, resetAt: nowIso() });
          page -= 1;
          continue;
        }
        results.ok = false;
        results.errors.push({ error: err.message });
        break;
      }

      results.pages++;
      const upserts = (pageResult.changes || [])
        .filter((c) => c?.changeType === 'upsert' && c.message)
        .map((c) => c.message);
      for (const message of upserts) {
        results.processed++;
        await processMessage({ mailboxId, folderType, message, results, budget });
      }

      const nextPageUrl = normalizeText(pageResult.page?.nextPageUrl) || null;
      const deltaLink = normalizeText(pageResult.page?.deltaLink) || null;
      cmStore.setSyncState(mailboxId, folderType, {
        deltaLink: deltaLink || nextPageUrl || cursorUrl,
        lastSyncAt: nowIso(),
        lastResult: {
          imported: results.imported,
          duplicates: results.duplicates,
          records: results.records,
        },
      });
      if (!nextPageUrl) break;
      cursorUrl = nextPageUrl;
    }

    await cmStore.persist();
    return results;
  }

  async function syncAll(mailboxId, folderTypes = DEFAULT_FOLDER_TYPES) {
    const all = {
      mailboxId,
      folders: [],
      totalImported: 0,
      totalDuplicates: 0,
      totalRecords: 0,
      syncedAt: nowIso(),
    };
    for (const folderType of folderTypes) {
      const result = await syncFolder(mailboxId, folderType);
      all.folders.push(result);
      all.totalImported += result.imported || 0;
      all.totalDuplicates += result.duplicates || 0;
      all.totalRecords += result.records || 0;
    }
    return all;
  }

  return { syncFolder, syncAll, listMessageAttachments, CM_PROCESSOR_VERSION, CM_FILTER_VERSION };
}

module.exports = {
  createCmMailSync,
  DEFAULT_FOLDER_TYPES,
  CM_PROCESSOR_VERSION,
  CM_FILTER_VERSION,
};
