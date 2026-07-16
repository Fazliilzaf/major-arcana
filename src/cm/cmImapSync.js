'use strict';

/**
 * CM IMAP Sync — ORD-73 (ägar-beställning 2026-07-13: "de flesta onlineköpen
 * finns på info@fazli.se — vi behöver komma åt det mailet framöver").
 *
 * info@fazli.se ligger hos one.com, utanför klinikens M365-tenant — Graph kan
 * inte läsa den. Denna modul hämtar mail via standard-IMAP (imapflow) och
 * matar in dem i SAMMA rawItems→extraktion→kandidat-flöde som kvitto@.
 *
 *  - UID-baserad cursor (cmStore.syncState(user, 'imap-inbox').lastUid) —
 *    historisk backfill från CM_IMAP_SINCE, sedan bara nya mail.
 *  - Fail-closed: utan CM_IMAP_ENABLED + host/user/password görs ingenting.
 *  - Original arkiveras (BFN 7 år), bilagor till secure storage.
 *  - Läs-only mot IMAP: inga flaggor sätts, inget raderas.
 */

const crypto = require('node:crypto');
const { extractDocument } = require('./cmAiExtractor');
const {
  buildCombinedText,
  stripHtml,
  CM_PROCESSOR_VERSION,
  CM_FILTER_VERSION,
} = require('./cmMailSync');

const MAX_MESSAGES_PER_RUN = 25;
const MAX_ATTACHMENTS_PER_MESSAGE = 3;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ECONOMY_KEYWORDS =
  /(faktura|fakturor|kvitto|invoice|receipt|order|betalning|payment|prenumeration|subscription|biljett|booking|bokningsbekr|orderbekr|tack för ditt köp|your purchase)/i;

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function nowIso() {
  return new Date().toISOString();
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

function readImapConfig(env = process.env) {
  return {
    enabled: String(env.CM_IMAP_ENABLED || '').toLowerCase() === 'true',
    host: normalizeText(env.CM_IMAP_HOST) || 'imap.one.com',
    port: Number(env.CM_IMAP_PORT) || 993,
    user: normalizeText(env.CM_IMAP_USER),
    password: env.CM_IMAP_PASSWORD || '',
    // ORD-74 (ägar-krav): minst från 2024-01-01 — mönster kräver flera år
    since: normalizeText(env.CM_IMAP_SINCE) || '2024-01-01',
  };
}

function createCmImapSync({
  cmStore,
  secureStorage = null,
  extractDocumentImpl = extractDocument,
  // Testbarhet: fabrik som ger en ansluten klient med { search, fetchOne, logout }
  imapClientFactory = null,
  // Testbarhet: RFC822-buffer → { subject, from, date, messageId, text, html, attachments }
  parseMessageImpl = null,
  env = process.env,
  maxExtractPerSync = Math.max(0, Number(process.env.CM_MAX_EXTRACT_PER_SYNC) || 10),
} = {}) {
  const cfg = readImapConfig(env);

  async function defaultClientFactory() {
    const { ImapFlow } = require('imapflow');
    const client = new ImapFlow({
      host: cfg.host,
      port: cfg.port,
      secure: true,
      auth: { user: cfg.user, pass: cfg.password },
      logger: false,
    });
    await client.connect();
    await client.mailboxOpen('INBOX', { readOnly: true });
    return client;
  }

  async function defaultParseMessage(sourceBuffer) {
    const { simpleParser } = require('mailparser');
    const parsed = await simpleParser(sourceBuffer);
    return {
      subject: parsed.subject || '',
      from: parsed.from?.value?.[0]?.address || '',
      date: parsed.date ? parsed.date.toISOString() : nowIso(),
      messageId: parsed.messageId || '',
      text: parsed.text || '',
      html: typeof parsed.html === 'string' ? parsed.html : '',
      attachments: (parsed.attachments || []).map((a) => ({
        filename: a.filename || 'bilaga',
        contentType: a.contentType || 'application/octet-stream',
        size: a.size || (a.content ? a.content.length : 0),
        content: a.content,
      })),
    };
  }

  function isEconomyCandidate(parsed) {
    if ((parsed.attachments || []).length > 0) return true;
    return ECONOMY_KEYWORDS.test(`${parsed.subject} ${(parsed.text || '').slice(0, 500)}`);
  }

  async function archiveOriginal(uid, sourceBuffer) {
    if (!secureStorage?.putObject) return null;
    const ym = new Date().toISOString().slice(0, 7);
    const key = `cm/raw-mail/${ym}/imap-${cfg.user}-${uid}-${sha8(sourceBuffer)}.eml`;
    const put = await secureStorage.putObject({
      key,
      body: sourceBuffer,
      contentType: 'message/rfc822',
      metadata: { source: 'cm-imap-original', mailbox: cfg.user },
    });
    return put?.storageKey || key;
  }

  async function harvestAttachments({ uid, parsed, rawItem, errors }) {
    const out = { pdfText: null, imageInput: null, firstDocument: null };
    if (!secureStorage?.putObject) return out;
    const usable = (parsed.attachments || [])
      .filter((a) => a.content && a.size <= MAX_ATTACHMENT_BYTES)
      .slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
    for (const att of usable) {
      try {
        const ym = new Date().toISOString().slice(0, 7);
        const key = `cm/receipts/${ym}/${sha8(`imap:${uid}:${att.filename}`)}-${safeFileName(att.filename)}`;
        await secureStorage.putObject({
          key,
          body: att.content,
          contentType: att.contentType,
          metadata: { source: 'cm-imap-attachment' },
        });
        const isPdf = /pdf/i.test(att.contentType) || /\.pdf$/i.test(att.filename);
        const isImage = /^image\//i.test(att.contentType);
        const doc = cmStore.createDocument({
          rawItemId: rawItem.id,
          fileName: att.filename,
          mimeType: att.contentType,
          storagePath: key,
          fileHash: sha8(att.content),
          source: isPdf ? 'pdf' : 'image',
        });
        if (!out.firstDocument) out.firstDocument = doc;
        if (isPdf && !out.pdfText) {
          const pdfParse = getPdfParse();
          if (pdfParse) {
            try {
              const res = await pdfParse(att.content);
              out.pdfText = normalizeText(res?.text).slice(0, 20000) || null;
            } catch (err) {
              errors.push({ uid, error: `pdf-parse: ${err.message}` });
            }
          }
        } else if (isImage && !out.imageInput && !out.pdfText) {
          out.imageInput = {
            imageBase64: att.content.toString('base64'),
            mimeType: att.contentType,
          };
        }
      } catch (err) {
        errors.push({ uid, error: `attachment: ${err.message}` });
      }
    }
    return out;
  }

  async function runExtraction({ subject, bodyText, pdfText, imageInput }) {
    if (imageInput && !pdfText) {
      return extractDocumentImpl({ ...imageInput, source: 'email' });
    }
    const combined = buildCombinedText({ subject, bodyText, pdfText });
    if (combined.length <= 40) {
      // ORD-74c: tomt/innehållslöst mail är deterministiskt otydbart — retry
      // hjälper aldrig. Behandla som "läst men ingen köpdata" → olöst-kön.
      return { ok: true, extraction: { documentType: 'unknown', confidenceScore: 0 } };
    }
    return extractDocumentImpl({ text: combined, source: 'email' });
  }

  function createRecordFromExtraction(extraction, { documentId, rawItemId }) {
    const confidence = Number(extraction.confidenceScore) || 0;
    return cmStore.createExpenseRecord({
      documentId: documentId || null,
      rawItemId: rawItemId || null,
      expenseType: extraction.documentType,
      supplierName: extraction.supplier,
      invoiceNumber: extraction.invoiceNumber,
      receiptNumber: extraction.receiptNumber,
      orderNumber: extraction.orderNumber,
      date: extraction.date,
      dueDate: extraction.dueDate,
      amountExVat: extraction.amountExVat,
      vatAmount: extraction.vatAmount,
      amountIncVat: extraction.amountIncVat,
      currency: extraction.currency,
      category: extraction.category,
      confidenceScore: confidence,
      flags: confidence < 70 ? ['NEEDS_MANUAL_REVIEW', 'LOW_CONFIDENCE_EXTRACTION'] : [],
    });
  }

  /**
   * Synka INBOX på IMAP-kontot. Backfill: första körningen söker SINCE
   * CM_IMAP_SINCE; därefter UID-cursor. Max MAX_MESSAGES_PER_RUN mail och
   * maxExtractPerSync AI-anrop per körning — autopiloten betar av historiken
   * över flera körningar utan att spränga budgeten.
   */
  async function syncInbox() {
    const results = {
      ok: true,
      mailbox: cfg.user || null,
      scanned: 0,
      imported: 0,
      duplicates: 0,
      skipped: 0,
      records: 0,
      errors: [],
      syncedAt: nowIso(),
    };
    if (!cfg.enabled) return { ...results, ok: false, error: 'CM_IMAP_ENABLED är inte true' };
    if (!cfg.user || !cfg.password) {
      return { ...results, ok: false, error: 'CM_IMAP_USER/CM_IMAP_PASSWORD saknas i env' };
    }

    const factory = imapClientFactory || defaultClientFactory;
    const parse = parseMessageImpl || defaultParseMessage;
    let client = null;
    try {
      client = await factory();
      const syncState = cmStore.getSyncState(cfg.user, 'imap-inbox') || {};
      let lastUid = Number(syncState.lastUid) || 0;

      // ORD-74: om SINCE flyttats BAKÅT (t.ex. 2026→2024) nollas cursorn så
      // hela den äldre historiken skannas om — dedupe skyddar mot dubbletter.
      const storedSince = normalizeText(syncState.backfillSince);
      const rescanNeeded =
        lastUid > 0 && (!storedSince || new Date(cfg.since) < new Date(storedSince));
      if (rescanNeeded) lastUid = 0;

      // UID-lista: cursor-läge (allt efter lastUid) eller backfill (SINCE-datum).
      // ORD-74b: SINCE-datumet följer med ÄVEN i cursor-läget — annars sväljer
      // cursorn hela lådan (16k+ mail före 2024) efter en rescan-batch.
      const searchQuery =
        lastUid > 0
          ? { uid: `${lastUid + 1}:*`, since: new Date(cfg.since) }
          : { since: new Date(cfg.since) };
      const uids = (await client.search(searchQuery, { uid: true })) || [];
      // ':*' matchar alltid sista mailet även när inget nytt finns — filtrera
      const fresh = uids.filter((u) => u > lastUid).sort((a, b) => a - b);
      const batch = fresh.slice(0, MAX_MESSAGES_PER_RUN);

      const budget = { remaining: maxExtractPerSync };
      let highestUid = lastUid;

      for (const uid of batch) {
        results.scanned++;
        highestUid = Math.max(highestUid, uid);
        try {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!msg?.source) continue;
          const parsed = await parse(msg.source);

          // ORD-74 (ägar-krav): VARJE mail importeras — inget hoppas över.
          // Icke-ekonomimail får lägre extraktionsprioritet men sparas och
          // hamnar i olöst-kön om AI:n inte kan tyda dem.
          const looksEconomic = isEconomyCandidate(parsed);
          if (!looksEconomic) results.nonEconomy = (results.nonEconomy || 0) + 1;

          const bodyText = (normalizeText(parsed.text) || stripHtml(parsed.html)).slice(0, 6000);
          const importResult = cmStore.importRawItem({
            sourceType: 'email',
            sourceId: cfg.user,
            mailMessageId: `imap:${uid}`,
            internetMessageId: parsed.messageId,
            subject: normalizeText(parsed.subject),
            fromEmail: normalizeText(parsed.from),
            receivedAt: parsed.date,
            rawBodyText: bodyText,
            hasAttachments: (parsed.attachments || []).length > 0,
            hasPdf: (parsed.attachments || []).some((a) => /pdf/i.test(a.contentType || '')),
            hasImage: (parsed.attachments || []).some((a) => /^image\//i.test(a.contentType || '')),
            metadata: { transport: 'imap', host: cfg.host },
          });
          if (!importResult.ok) {
            results.duplicates++;
            continue;
          }
          const rawItem = importResult.rawItem;
          results.imported++;

          await archiveOriginal(uid, msg.source).catch((err) =>
            results.errors.push({ uid, error: `arkiv: ${err.message}` })
          );

          const harvest = await harvestAttachments({
            uid,
            parsed,
            rawItem,
            errors: results.errors,
          });

          if (budget.remaining <= 0) continue; // rawItem sparad — reprocess tar den senare
          budget.remaining -= 1;
          const ex = await runExtraction({
            subject: parsed.subject,
            bodyText,
            pdfText: harvest.pdfText,
            imageInput: harvest.imageInput,
          });
          if (
            ex.ok &&
            ex.extraction &&
            ex.extraction.documentType !== 'unknown' &&
            (Number(ex.extraction.confidenceScore) || 0) >= 50
          ) {
            createRecordFromExtraction(ex.extraction, {
              documentId: harvest.firstDocument?.id,
              rawItemId: rawItem.id,
            });
            results.records++;
          } else if (ex.ok) {
            // ORD-74: "kan vi inte tyda ska vi inte hoppa" — AI:n läste men
            // fann ingen köpdata → olöst record i granska-kön; ägaren dömer.
            // (Tekniska AI-fel lämnas utan record → reprocess retryar.)
            cmStore.createExpenseRecord({
              rawItemId: rawItem.id,
              documentId: harvest.firstDocument?.id || null,
              expenseType: 'unknown',
              supplierName: normalizeText(parsed.from),
              date: (parsed.date || '').slice(0, 10),
              confidenceScore: 0,
              flags: ['NEEDS_MANUAL_REVIEW', 'LOW_CONFIDENCE_EXTRACTION'],
            });
            results.unresolved = (results.unresolved || 0) + 1;
          } else {
            results.errors.push({ uid, error: `extract: ${ex.error}` });
          }
        } catch (err) {
          results.errors.push({ uid, error: err.message });
        }
      }

      cmStore.setSyncState(cfg.user, 'imap-inbox', {
        lastUid: highestUid,
        backfillSince: cfg.since,
        remainingBacklog: Math.max(0, fresh.length - batch.length),
        lastRunAt: nowIso(),
      });
      await cmStore.persist();
      results.remainingBacklog = Math.max(0, fresh.length - batch.length);
      return results;
    } catch (err) {
      results.ok = false;
      results.error = err.message;
      return results;
    } finally {
      try {
        await client?.logout?.();
      } catch {
        /* stäng tyst */
      }
    }
  }

  return { syncInbox, readImapConfig: () => ({ ...cfg, password: cfg.password ? '***' : '' }) };
}

module.exports = { createCmImapSync, CM_PROCESSOR_VERSION, CM_FILTER_VERSION };
