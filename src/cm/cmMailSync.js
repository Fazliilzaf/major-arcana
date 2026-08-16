'use strict';

/**
 * CM Mail Sync v3 — ORD-64 (delta-sync) + ORD-67f (ImmutableId) + ORD-68.
 *
 * ORD-68 (2026-07-13, ägar-beställning: "agenten måste läsa själva
 * mail-innehållet, inte bara PDF-filer"):
 *  - KOMBINERAD extraktion: ämne + mailtext + PDF-text skickas i SAMMA
 *    AI-anrop (tidigare valdes EN källa — belopp i mailtexten tappades när
 *    en PDF fanns, och tvärtom). Bild-kvitton går fortsatt vision-vägen.
 *  - Strukturbevarande HTML→text: tabellrader/stycken blir egna rader så
 *    belopp behåller sitt sammanhang.
 *  - REPROCESS: rawItems utan expense-record kan läsas om (t.ex. de 19
 *    första kvitto@-mailen vars bilagor 400:ade före ORD-67f) — hämtar
 *    bilagor i efterhand och kör om extraktionen. Ledger spårar försöken.
 *
 * Read-only mot Graph. Original raderas aldrig (BFN 7 år).
 */

const crypto = require('node:crypto');
const { extractDocument } = require('./cmAiExtractor');

// v4 (ORD-72c): full mailbody hämtas när delta bara gav preview — bumpen
// nollar reextract-attempt-markörer så alla poster får omtag med fullt underlag.
const CM_PROCESSOR_VERSION = 4;
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

// ORD-68: bevara radstruktur — tabellrader/stycken blir egna rader så belopp
// inte tappar sitt sammanhang när HTML-mail plattas till text.
function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<td[^>]*>/gi, ' | ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ORD-68: allt underlag i samma AI-anrop. PDF-texten är oftast rikast —
// mailtexten kortas när PDF finns så båda ryms i extraktorns 8000-fönster.
function buildCombinedText({ subject, bodyText, pdfText }) {
  const parts = [];
  const safeSubject = normalizeText(subject);
  const safeBody = normalizeText(bodyText);
  const safePdf = normalizeText(pdfText);
  if (safeSubject) parts.push(`Ämne: ${safeSubject}`);
  if (safeBody)
    parts.push(`Mailtext:\n${safePdf ? safeBody.slice(0, 2500) : safeBody.slice(0, 6000)}`);
  if (safePdf) parts.push(`Bilaga (PDF-text):\n${safePdf.slice(0, 5000)}`);
  return parts.join('\n\n').slice(0, 8000);
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

// ORD-76 · Backlog-städning: mailet ser ekonomiskt ut men innehåller inget
// belopp (t.ex. bokningsbekräftelser, leveranskvitton, Kivra-aviseringar).
const NON_ECONOMIC_PATTERNS = [
  {
    regex:
      /\b(bokningsbekräftelse|booking confirmation|bekräftelse\b.*\b(bokning|reservation|order)|confirmation of (new )?flight details|flight confirmation|ticket confirmation|dina biljetter|biljetter till bokning)\b/i,
    reason: 'booking_confirmation_no_amount',
  },
  {
    regex:
      /\b(ditt inlämningskvitto|inlämningskvitto|paket\s+(är|har)|leveransbekräftelse|ditt paket|track your package|tracking|paketet har|paketet är|ditt paket har skickats|leverans)\b/i,
    reason: 'delivery_receipt_no_amount',
  },
  {
    regex:
      /\b(ny faktura i kivra|ny faktura från|fakturan från .* förfaller|förfaller snart|betala den i kivra|fakturaavisering|fakturapåminnelse)\b/i,
    reason: 'invoice_notification_portal',
  },
  {
    regex:
      /\b(bokningen lyckades|din bokning har bekräftats|din bokning är bekräftad|tack för din beställning|tack för ditt köp|tack för din betalning|orderbekräftelse)\b/i,
    reason: 'purchase_confirmation_no_amount',
  },
];

function classifyNonEconomicMail({ subject = '', body = '', expenseType = '' } = {}) {
  const hay =
    `${normalizeText(subject)} ${normalizeText(body)} ${normalizeText(expenseType)}`.toLowerCase();
  for (const p of NON_ECONOMIC_PATTERNS) {
    if (p.regex.test(hay)) return p.reason;
  }
  return null;
}

function createCmMailSync({
  graphReadConnector,
  cmStore,
  secureStorage = null,
  cfoExpenseStore = null, // ORD-72: backfill av belopp på redan promotade utgifter
  fetchImpl = globalThis.fetch,
  extractDocumentImpl = extractDocument, // ORD-72: injicerbar för tester
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
        // ORD-67f: delta-sidorna hämtas med immutable-IDs — samma Prefer-header
        // KRÄVS här, annars Graph 400 på id:t (verifierat live 2026-07-13).
        Prefer: 'IdType="ImmutableId"',
      },
    });
    if (!res.ok) throw new Error(`Graph attachments-list ${res.status}`);
    const data = await res.json();
    return Array.isArray(data?.value) ? data.value : [];
  }

  // ORD-72c: Graph-delta levererar ofta bara bodyPreview (~200 tecken) —
  // "läs mailinnehållet" kräver fulla body:n. Rått follow-up-anrop per
  // meddelande (samma mönster + ImmutableId-Prefer som attachments-listan).
  async function fetchFullMessageBody(mailboxId, messageId) {
    const accessToken = await graphReadConnector.fetchAccessToken();
    const url =
      `${graphReadConnector.graphBaseUrl}/users/${encodeURIComponent(mailboxId)}` +
      `/messages/${encodeURIComponent(messageId)}?$select=subject,body,bodyPreview`;
    const res = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'IdType="ImmutableId"',
      },
    });
    if (!res.ok) throw new Error(`Graph message-fetch ${res.status}`);
    const data = await res.json();
    return stripHtml(data?.body?.content || data?.bodyPreview || '');
  }

  // ORD-72d: äldre rawItems saknar mailMessageId (graphMessageId-aliasbuggen) —
  // slå upp Graph-id via internetMessageId så full-body/bilagor kan hämtas.
  async function findMessageIdByInternetMessageId(mailboxId, internetMessageId) {
    let imid = normalizeText(internetMessageId);
    if (!imid) return null;
    // Connectorn lagrar imid UTAN vinkelparenteser — Graph-$filter kräver dem
    // (verifierat i prod 2026-07-13: utan <> noll träffar, med <> träff +
    // 30 648 tecken body mot 177 i preview).
    if (!imid.startsWith('<')) imid = `<${imid}>`;
    const accessToken = await graphReadConnector.fetchAccessToken();
    const filter = encodeURIComponent(`internetMessageId eq '${imid.replace(/'/g, "''")}'`);
    const url =
      `${graphReadConnector.graphBaseUrl}/users/${encodeURIComponent(mailboxId)}` +
      `/messages?$filter=${filter}&$select=id&$top=1`;
    const res = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'IdType="ImmutableId"',
      },
    });
    if (!res.ok) throw new Error(`Graph message-lookup ${res.status}`);
    const data = await res.json();
    return normalizeText(data?.value?.[0]?.id) || null;
  }

  async function archiveOriginal(message) {
    if (!secureStorage?.putObject) return null;
    const ym = new Date().toISOString().slice(0, 7);
    const key = `cm/raw-mail/${ym}/${sha8(message.id || message.graphMessageId || message.internetMessageId || Math.random())}.json`;
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

  // ORD-75c · IMAP-källor har redan bilagor sparade i secureStorage vid
  // import. Vid reextract kan vi läsa dem direkt utan att gå ut mot Graph.
  function isImapSource(rawItem) {
    return /^imap:\d+$/i.test(normalizeText(rawItem?.mailMessageId));
  }

  async function harvestImapAttachments({ rawItem, errors }) {
    const out = { pdfText: null, imageInput: null, firstDocument: null };
    if (!secureStorage?.getObject || !rawItem?.id) return out;

    const docs = (cmStore.getDocumentsByRawItemId?.(rawItem.id) || []).filter((d) =>
      normalizeText(d.storagePath)
    );
    const usable = docs.slice(0, MAX_ATTACHMENTS_PER_MESSAGE);

    for (const doc of usable) {
      try {
        const obj = await secureStorage.getObject(doc.storagePath);
        const buffer = obj?.buffer;
        if (!buffer || buffer.length > MAX_ATTACHMENT_BYTES) continue;
        if (!out.firstDocument) out.firstDocument = doc;

        const isPdf = /pdf/i.test(doc.mimeType || obj.mimeType || '');
        const isImage = /^image\//i.test(doc.mimeType || obj.mimeType || '');
        if (isPdf && !out.pdfText) {
          const pdfParse = getPdfParse();
          if (pdfParse) {
            const parsed = await pdfParse(buffer).catch(() => null);
            const text = normalizeText(parsed?.text);
            if (text.length > 40) out.pdfText = text;
          }
        } else if (isImage && !out.imageInput) {
          out.imageInput = {
            imageBase64: buffer.toString('base64'),
            mimeType: doc.mimeType || obj.mimeType || 'image/jpeg',
          };
        }
      } catch (err) {
        errors.push({ rawItemId: rawItem.id, error: `imap-attachment: ${err.message}` });
      }
    }
    return out;
  }

  // ORD-68: gemensam bilage-skörd för sync + reprocess. Returnerar PDF-text,
  // ev. bild-input och första dokumentet. Muterar rawItem-flaggor vid fel.
  async function harvestAttachments({ mailboxId, messageId, rawItem, errors }) {
    const out = { pdfText: null, imageInput: null, firstDocument: null };
    if (!messageId || !secureStorage?.putObject) return out;
    let attachments = [];
    try {
      attachments = await listMessageAttachments(mailboxId, messageId);
    } catch (err) {
      if (!rawItem.flags.includes('ATTACHMENT_UNREADABLE'))
        rawItem.flags.push('ATTACHMENT_UNREADABLE');
      errors.push({ messageId, error: `attachments-list: ${err.message}` });
      return out;
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
        stored = await storeAttachment(mailboxId, messageId, att);
      } catch (err) {
        if (!rawItem.flags.includes('ATTACHMENT_UNREADABLE'))
          rawItem.flags.push('ATTACHMENT_UNREADABLE');
        errors.push({ messageId, error: `attachment: ${err.message}` });
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
      if (!out.firstDocument) out.firstDocument = doc;

      if (isPdf && !out.pdfText) {
        const pdfParse = getPdfParse();
        if (pdfParse) {
          const parsed = await pdfParse(stored.buffer).catch(() => null);
          const text = normalizeText(parsed?.text);
          if (text.length > 40) out.pdfText = text;
        }
      } else if (!isPdf && !out.imageInput) {
        out.imageInput = {
          imageBase64: stored.buffer.toString('base64'),
          mimeType: stored.contentType || 'image/jpeg',
        };
      }
    }
    return out;
  }

  // ORD-68: en extraktion, alla källor. Bild-kvitto utan PDF → vision;
  // annars kombinerad text (ämne + mailtext + PDF-text).
  async function runExtraction({ subject, bodyText, pdfText, imageInput }) {
    if (imageInput && !pdfText) {
      return extractDocumentImpl({ ...imageInput, source: 'email' });
    }
    const combined = buildCombinedText({ subject, bodyText, pdfText });
    if (combined.length <= 40) {
      // ORD-74c: tomt mail är deterministiskt otydbart — retry hjälper aldrig.
      // "Läst men ingen köpdata" → olöst-kön i stället för evig reprocess.
      return { ok: true, extraction: { documentType: 'unknown', confidenceScore: 0 } };
    }
    return extractDocumentImpl({ text: combined, source: 'email' });
  }

  // ORD-CM-23 · Z-rapport/eget-bolag-detektor (utgiftskandidat-exkludering).
  function isOwnCompanyOrZReport(rawItem, extraction) {
    const subject = String(rawItem?.subject || '');
    if (/z[- ]?rapport/i.test(subject)) return true;
    const supplier = String(extraction?.supplierName || '');
    if (/hair\s*tp\s*clinic/i.test(supplier)) return true;
    return false;
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

  async function processMessage({ mailboxId, folderType, message, results, budget }) {
    // ORD-CM-4 (ägar-regel "varje mail räknas", samma som IMAP-vägen sedan
    // ORD-74): inget skippas — icke-ekonomimail importeras och hamnar i
    // olöst-kön om AI:n inte hittar köpdata. skipped behålls som statistik.
    if (!isEconomyCandidate(message)) {
      results.skipped++;
    }

    // ORD-72d: connectorns normaliserade delta-meddelanden bär graphMessageId
    // (inte Graph-råformatets id) — utan denna alias blev mailMessageId tomt
    // på ALLA rawItems, och varken bilagor eller full-body kunde hämtas.
    const messageId = normalizeText(message.id || message.graphMessageId);

    // ORD-72c: delta ger ofta bara bodyPreview (~200 tecken) — hämta fulla
    // body:n innan import så extraktionen får hela mailinnehållet (belopp
    // ligger ofta långt ner i kvitto-HTML). Fail-open till preview vid fel.
    let bodyText = stripHtml(message.body?.content || message.bodyPreview || '').slice(0, 6000);
    if (!message.body?.content && messageId) {
      try {
        const fullBody = await fetchFullMessageBody(mailboxId, messageId);
        if (fullBody) bodyText = fullBody.slice(0, 6000);
      } catch (err) {
        results.errors.push({ messageId, error: `full-body: ${err.message}` });
      }
    }
    const importResult = cmStore.importRawItem({
      sourceType: 'email',
      sourceId: mailboxId,
      mailMessageId: messageId,
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

      let harvest = { pdfText: null, imageInput: null, firstDocument: null };
      if (message.hasAttachments === true) {
        harvest = await harvestAttachments({
          mailboxId,
          messageId,
          rawItem,
          errors: results.errors,
        });
      }

      let record = null;
      if (budget.remaining > 0) {
        budget.remaining -= 1;
        const ex = await runExtraction({
          subject: rawItem.subject,
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
          // ORD-CM-23: Z-rapporter/eget bolag = intäkts-/internunderlag,
          // aldrig utgiftskandidat (källgranskning 2026-07-18). Original bevaras.
          if (isOwnCompanyOrZReport(rawItem, ex.extraction)) {
            results.zReports = (results.zReports || 0) + 1;
            return results;
          }
          record = createRecordFromExtraction(ex.extraction, {
            documentId: harvest.firstDocument?.id,
            rawItemId: rawItem.id,
          });
          results.records++;
          // ORD-CM-5: mail ur "Klara fortnox"-mappar är REDAN manuellt
          // bokförda — märk exported direkt (dubblettskydd mot skarp sync).
          if (/klara[ _-]?fortnox|bokf(ö|o)rd/i.test(folderType || '')) {
            cmStore.markExported(record.id, { externalAccountingId: 'pre-fortnox-manuell' });
            results.preBooked = (results.preBooked || 0) + 1;
          }
        } else if (ex.ok) {
          // ORD-CM-4: "kan vi inte tyda ska vi inte hoppa" — olöst record i
          // granska-kön (samma som reprocess/IMAP sedan ORD-74).
          record = cmStore.createExpenseRecord({
            rawItemId: rawItem.id,
            documentId: harvest.firstDocument?.id || null,
            expenseType: 'unknown',
            supplierName: rawItem.fromEmail,
            date: (rawItem.receivedAt || '').slice(0, 10),
            confidenceScore: 0,
            flags: ['NEEDS_MANUAL_REVIEW', 'LOW_CONFIDENCE_EXTRACTION'],
          });
          results.unresolved = (results.unresolved || 0) + 1;
        } else {
          results.errors.push({ messageId, error: `extract: ${ex.error}` });
        }
      }

      cmStore.completeLedgerEntry(ledger.id, {
        status: 'done',
        documentId: harvest.firstDocument?.id || null,
        expenseRecordId: record?.id || null,
      });
      results.imported++;
    } catch (err) {
      cmStore.completeLedgerEntry(ledger.id, { status: 'failed', errorMessage: err.message });
      results.errors.push({ messageId, error: err.message });
    }
  }

  // ORD-68: läs om rawItems som saknar expense-record — hämtar bilagor i
  // efterhand (t.ex. mail synkade före ORD-67f) och kör om extraktionen på
  // kombinerat underlag. Manuella items utan mail-id körs body-only.
  async function reprocessUnprocessed({ limit = 10 } = {}) {
    const results = {
      ok: true,
      candidates: 0,
      reprocessed: 0,
      records: 0,
      errors: [],
      syncedAt: nowIso(),
    };
    const budget = { remaining: Math.min(maxExtractPerSync, limit) };
    const items = cmStore.listUnprocessedRawItems({ limit });
    results.candidates = items.length;

    for (const rawItem of items) {
      if (budget.remaining <= 0) break;
      const ledger = cmStore.addLedgerEntry({
        rawItemId: rawItem.id,
        processorVersion: CM_PROCESSOR_VERSION,
        filterVersion: CM_FILTER_VERSION,
        status: 'reprocessing',
      });
      try {
        // ORD-72d: äldre rawItems saknar mailMessageId — slå upp via
        // internetMessageId och spara så bilagor + full body kan hämtas.
        if (!rawItem.mailMessageId && rawItem.internetMessageId && rawItem.sourceId) {
          try {
            const foundId = await findMessageIdByInternetMessageId(
              rawItem.sourceId,
              rawItem.internetMessageId
            );
            if (foundId) rawItem.mailMessageId = foundId;
          } catch (err) {
            results.errors.push({ rawItemId: rawItem.id, error: `id-lookup: ${err.message}` });
          }
        }
        let harvest = { pdfText: null, imageInput: null, firstDocument: null };
        if (rawItem.hasAttachments && rawItem.mailMessageId && rawItem.sourceId) {
          harvest = await harvestAttachments({
            mailboxId: rawItem.sourceId,
            messageId: rawItem.mailMessageId,
            rawItem,
            errors: results.errors,
          });
        }
        // ORD-72c: kort rawBodyText = delta gav bara preview — hämta hela mailet
        let bodyText = rawItem.rawBodyText || '';
        if (bodyText.length < 500 && rawItem.mailMessageId && rawItem.sourceId) {
          try {
            const fullBody = await fetchFullMessageBody(rawItem.sourceId, rawItem.mailMessageId);
            // Fulla kroppen vinner alltid när den finns — strippad HTML kan
            // vara KORTARE än previewn fast den innehåller beloppet.
            if (fullBody) {
              bodyText = fullBody.slice(0, 6000);
              rawItem.rawBodyText = bodyText;
            }
          } catch (err) {
            results.errors.push({ rawItemId: rawItem.id, error: `full-body: ${err.message}` });
          }
        }
        budget.remaining -= 1;
        const ex = await runExtraction({
          subject: rawItem.subject,
          bodyText,
          pdfText: harvest.pdfText,
          imageInput: harvest.imageInput,
        });
        let record = null;
        if (
          ex.ok &&
          ex.extraction &&
          ex.extraction.documentType !== 'unknown' &&
          (Number(ex.extraction.confidenceScore) || 0) >= 50
        ) {
          // ORD-CM-23: Z-rapporter/eget bolag = intäkts-/internunderlag,
          // aldrig utgiftskandidat (källgranskning 2026-07-18). Original bevaras.
          if (isOwnCompanyOrZReport(rawItem, ex.extraction)) {
            results.zReports = (results.zReports || 0) + 1;
            return results;
          }
          record = createRecordFromExtraction(ex.extraction, {
            documentId: harvest.firstDocument?.id,
            rawItemId: rawItem.id,
          });
          results.records++;
        } else if (ex.ok) {
          // ORD-74 (ägar-krav): "kan vi inte tyda ska vi inte hoppa" — AI:n
          // läste mailet men fann ingen köpdata → olöst record i granska-kön
          // så ägaren dömer själv. (Tekniska AI-fel retryas i stället.)
          record = cmStore.createExpenseRecord({
            rawItemId: rawItem.id,
            documentId: harvest.firstDocument?.id || null,
            expenseType: 'unknown',
            supplierName: rawItem.fromEmail,
            date: (rawItem.receivedAt || '').slice(0, 10),
            confidenceScore: 0,
            flags: ['NEEDS_MANUAL_REVIEW', 'LOW_CONFIDENCE_EXTRACTION'],
          });
          results.unresolved = (results.unresolved || 0) + 1;
        } else {
          results.errors.push({ rawItemId: rawItem.id, error: `extract: ${ex.error}` });
        }
        cmStore.completeLedgerEntry(ledger.id, {
          status: 'done',
          documentId: harvest.firstDocument?.id || null,
          expenseRecordId: record?.id || null,
        });
        results.reprocessed++;
      } catch (err) {
        cmStore.completeLedgerEntry(ledger.id, { status: 'failed', errorMessage: err.message });
        results.errors.push({ rawItemId: rawItem.id, error: err.message });
      }
    }

    await cmStore.persist();
    return results;
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
    // ORD-CM-5: användarskapade mappar (AMEX, "Klara fortnox", …) synkas
    // också — fakturor sorteras ofta undan från inkorgen.
    try {
      const custom = await syncCustomFolders(mailboxId);
      for (const r of custom) {
        all.folders.push(r);
        all.totalImported += r.imported || 0;
        all.totalDuplicates += r.duplicates || 0;
        all.totalRecords += r.records || 0;
      }
    } catch (err) {
      all.folders.push({ ok: false, folderType: 'custom', error: err.message });
    }
    return all;
  }

  // ORD-CM-5 · Standardmappar som INTE är inköpskällor (sv + en).
  const EXCLUDED_FOLDERS =
    /^(inbox|inkorg|sent items?|skickat|deleted items?|borttagna objekt|drafts?|utkast|junk e?-?mail|skräppost|outbox|utkorg|archive|arkiv|conversation history|konversationshistorik|notes|anteckningar|sync issues|synkroniseringsproblem)$/i;

  async function listCustomFolders(mailboxId) {
    const accessToken = await graphReadConnector.fetchAccessToken();
    const url =
      `${graphReadConnector.graphBaseUrl}/users/${encodeURIComponent(mailboxId)}` +
      `/mailFolders?$top=100&$select=id,displayName,totalItemCount`;
    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'IdType="ImmutableId"' },
    });
    if (!res.ok) throw new Error(`Graph mailFolders ${res.status}`);
    const data = await res.json();
    return (data?.value || []).filter(
      (f) => f.totalItemCount > 0 && !EXCLUDED_FOLDERS.test(normalizeText(f.displayName))
    );
  }

  // Delta-synk per användarmapp — rått Graph-anrop (connectorns delta-API
  // stödjer bara standardmappar). Cursor per mapp i syncState.
  async function syncCustomFolder(mailboxId, folder) {
    const results = {
      ok: true,
      folderType: folder.displayName,
      imported: 0,
      duplicates: 0,
      records: 0,
      skipped: 0,
      errors: [],
    };
    const stateKey = `custom:${folder.id}`;
    const syncState = cmStore.getSyncState(mailboxId, stateKey) || {};
    const accessToken = await graphReadConnector.fetchAccessToken();
    let url =
      syncState.deltaLink ||
      `${graphReadConnector.graphBaseUrl}/users/${encodeURIComponent(mailboxId)}` +
        `/mailFolders/${encodeURIComponent(folder.id)}/messages/delta?$top=25`;
    const budget = { remaining: maxExtractPerSync };
    let pages = 0;
    try {
      while (url && pages < MAX_PAGES_PER_RUN) {
        pages++;
        const res = await fetchImpl(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Prefer: 'IdType="ImmutableId"',
          },
        });
        if (!res.ok) {
          if (res.status === 410) {
            cmStore.setSyncState(mailboxId, stateKey, { deltaLink: null });
            results.errors.push({
              error: 'delta-token ogiltig — nollställd, tas om nästa körning',
            });
            break;
          }
          throw new Error(`Graph folder-delta ${res.status}`);
        }
        const data = await res.json();
        for (const message of data?.value || []) {
          if (message['@removed']) continue;
          await processMessage({
            mailboxId,
            folderType: folder.displayName,
            message,
            results,
            budget,
          });
        }
        if (data['@odata.deltaLink']) {
          cmStore.setSyncState(mailboxId, stateKey, { deltaLink: data['@odata.deltaLink'] });
          url = null;
        } else {
          url = data['@odata.nextLink'] || null;
          if (!url) break;
        }
      }
      await cmStore.persist();
      return results;
    } catch (err) {
      results.ok = false;
      results.errors.push({ error: err.message });
      return results;
    }
  }

  async function syncCustomFolders(mailboxId) {
    const folders = await listCustomFolders(mailboxId);
    const out = [];
    for (const folder of folders) {
      out.push(await syncCustomFolder(mailboxId, folder));
    }
    return out;
  }

  // ORD-72 (ägar-beställning: "läs av beloppet i inkommande mail"):
  // records som saknar totalbelopp läses om ur det SPARADE källmailet
  // (rawBodyText + ev. bilagor) — fyller endast tomma fält, skriver aldrig
  // över befintliga värden. Redan promotade utgifter i CFO backfillas om
  // deras amountSek fortfarande är tomt.
  async function reextractMissingAmounts({ limit = 10, force = false, debug = false } = {}) {
    const results = {
      ok: true,
      candidates: 0,
      attempted: 0,
      updatedRecords: 0,
      updatedCfo: 0,
      skippedNoSource: 0,
      skippedAlreadyTried: 0,
      errors: [],
      syncedAt: nowIso(),
    };
    if (debug) results.diagnostics = [];
    const budget = { remaining: Math.min(maxExtractPerSync, limit) };
    // ORD-72b: om-försök inte samma record varje schemakörning — attempt-
    // markören på recordet minns processorversionen. force=true (UI-knappen)
    // kör om ändå. Utan detta bränns AI-budgeten på samma poster för evigt
    // och kön bakom dem nås aldrig.
    const records = cmStore
      .listRecordsMissingAmount({ limit: limit * 4 })
      .filter((r) => force || r.reextractAttemptVersion !== CM_PROCESSOR_VERSION)
      .slice(0, Math.max(1, limit));
    results.skippedAlreadyTried = force
      ? 0
      : cmStore
          .listRecordsMissingAmount({ limit: limit * 4 })
          .filter((r) => r.reextractAttemptVersion === CM_PROCESSOR_VERSION).length;
    results.candidates = records.length;

    for (const record of records) {
      if (budget.remaining <= 0) break;

      const diag = debug
        ? {
            recordId: record.id,
            rawItemId: record.rawItemId || null,
            documentId: record.documentId || null,
            current: {
              amountIncVat: record.amountIncVat || null,
              amountExVat: record.amountExVat || null,
              vatAmount: record.vatAmount || null,
              supplierName: record.supplierName || null,
              date: record.date || null,
              expenseType: record.expenseType || null,
              flags: [...(record.flags || [])],
            },
          }
        : null;

      // Källmail: direkt via record.rawItemId, annars via dokumentets koppling
      // (pre-ORD-68-records saknar rawItemId men kan ha dokument).
      let rawItem = record.rawItemId ? cmStore.getRawItemById(record.rawItemId) : null;
      if (!rawItem && record.documentId) {
        const doc = cmStore.getDocumentById(record.documentId);
        if (doc?.rawItemId) rawItem = cmStore.getRawItemById(doc.rawItemId);
      }
      if (diag && rawItem) {
        diag.source = {
          sourceType: rawItem.sourceType,
          sourceId: rawItem.sourceId,
          mailMessageId: rawItem.mailMessageId || null,
          internetMessageId: rawItem.internetMessageId || null,
          fromEmail: rawItem.fromEmail || null,
          subject: rawItem.subject || null,
          isImap: isImapSource(rawItem),
          hasRawBodyText: Boolean(normalizeText(rawItem.rawBodyText)),
          rawBodyTextLength: normalizeText(rawItem.rawBodyText).length,
          hasAttachments: rawItem.hasAttachments,
          hasPdf: rawItem.hasPdf,
          hasImage: rawItem.hasImage,
        };
      }
      if (!rawItem || (!normalizeText(rawItem.rawBodyText) && !rawItem.hasAttachments)) {
        results.skippedNoSource++;
        if (diag) {
          diag.outcome = 'skipped_no_source';
          results.diagnostics.push(diag);
        }
        // Inget källmail → kan aldrig lyckas på denna version; markera så
        // posten inte blockerar kön varje körning.
        cmStore.markReextractAttempt?.(record.id, CM_PROCESSOR_VERSION);
        continue;
      }

      const ledger = cmStore.addLedgerEntry({
        rawItemId: rawItem.id,
        processorVersion: CM_PROCESSOR_VERSION,
        filterVersion: CM_FILTER_VERSION,
        status: 'reextracting',
      });
      try {
        let harvest = { pdfText: null, imageInput: null, firstDocument: null };
        let bodyText = rawItem.rawBodyText || '';

        if (isImapSource(rawItem)) {
          // ORD-75c: IMAP-poster har redan bodyText + bilagor sparade lokalt.
          // Använd dem direkt — ingen Graph-lookup behövs.
          if (rawItem.hasAttachments) {
            harvest = await harvestImapAttachments({ rawItem, errors: results.errors });
          }
        } else {
          // ORD-72d: äldre rawItems saknar mailMessageId — slå upp via
          // internetMessageId och spara så bilagor + full body kan hämtas.
          if (!rawItem.mailMessageId && rawItem.internetMessageId && rawItem.sourceId) {
            try {
              const foundId = await findMessageIdByInternetMessageId(
                rawItem.sourceId,
                rawItem.internetMessageId
              );
              if (foundId) rawItem.mailMessageId = foundId;
            } catch (err) {
              results.errors.push({ rawItemId: rawItem.id, error: `id-lookup: ${err.message}` });
            }
          }
          if (rawItem.hasAttachments && rawItem.mailMessageId && rawItem.sourceId) {
            harvest = await harvestAttachments({
              mailboxId: rawItem.sourceId,
              messageId: rawItem.mailMessageId,
              rawItem,
              errors: results.errors,
            });
          }
          // ORD-72c: kort rawBodyText = delta gav bara preview — hämta hela
          // mailet och uppgradera rawItem så framtida körningar slipper anropet.
          if (bodyText.length < 500 && rawItem.mailMessageId && rawItem.sourceId) {
            try {
              const fullBody = await fetchFullMessageBody(rawItem.sourceId, rawItem.mailMessageId);
              // Fulla kroppen vinner alltid när den finns — strippad HTML kan
              // vara KORTARE än previewn fast den innehåller beloppet.
              if (fullBody) {
                bodyText = fullBody.slice(0, 6000);
                rawItem.rawBodyText = bodyText;
              }
            } catch (err) {
              results.errors.push({ recordId: record.id, error: `full-body: ${err.message}` });
            }
          }
        }
        budget.remaining -= 1;
        results.attempted++;
        cmStore.markReextractAttempt?.(record.id, CM_PROCESSOR_VERSION);

        if (diag) {
          const docs = cmStore.getDocumentsByRawItemId(rawItem.id) || [];
          diag.documents = {
            count: docs.length,
            mimeTypes: docs.map((d) => d.mimeType).filter(Boolean),
            hasPdfText: Boolean(harvest.pdfText),
            hasImageInput: Boolean(harvest.imageInput),
            firstDocumentId: harvest.firstDocument?.id || null,
          };
          diag.harvest = {
            isImap: isImapSource(rawItem),
            bodyTextLength: normalizeText(bodyText).length,
            pdfTextLength: harvest.pdfText ? harvest.pdfText.length : 0,
          };
        }

        const ex = await runExtraction({
          subject: rawItem.subject,
          bodyText,
          pdfText: harvest.pdfText,
          imageInput: harvest.imageInput,
        });

        if (diag) {
          diag.extraction = {
            ok: ex.ok,
            error: ex.error || null,
            documentType: ex.extraction?.documentType || null,
            confidenceScore: ex.extraction?.confidenceScore || null,
            amountIncVat: ex.extraction?.amountIncVat || null,
            amountExVat: ex.extraction?.amountExVat || null,
            vatAmount: ex.extraction?.vatAmount || null,
            supplierName: ex.extraction?.supplier || null,
            date: ex.extraction?.date || null,
            notes: ex.extraction?.notes || null,
          };
        }

        if (!ex.ok || !ex.extraction) {
          if (!ex.ok) results.errors.push({ recordId: record.id, error: `extract: ${ex.error}` });
          cmStore.completeLedgerEntry(ledger.id, { status: 'failed', errorMessage: ex.error });
          if (diag) {
            diag.outcome = 'extraction_failed';
            results.diagnostics.push(diag);
          }
          continue;
        }

        const applied = cmStore.applyReextraction(record.id, {
          amountIncVat: ex.extraction.amountIncVat,
          amountExVat: ex.extraction.amountExVat,
          vatAmount: ex.extraction.vatAmount,
          date: ex.extraction.date,
          dueDate: ex.extraction.dueDate,
          supplierName: ex.extraction.supplier,
          invoiceNumber: ex.extraction.invoiceNumber,
          receiptNumber: ex.extraction.receiptNumber,
        });

        if (diag) {
          diag.applied = applied
            ? {
                changed: applied.changed || [],
                after: applied.record
                  ? {
                      amountIncVat: applied.record.amountIncVat,
                      vatAmount: applied.record.vatAmount,
                    }
                  : null,
              }
            : null;
          diag.outcome = applied?.changed?.length ? 'updated' : 'no_change';
          results.diagnostics.push(diag);
        }

        if (applied?.changed?.length) {
          results.updatedRecords++;

          // Backfill i CFO: fyll ENDAST om utgiftens belopp fortfarande är tomt.
          if (record.cfoExpenseId && cfoExpenseStore?.getById) {
            try {
              const expense = await cfoExpenseStore.getById(record.cfoExpenseId);
              if (expense && !expense.amountSek && applied.record.amountIncVat) {
                await cfoExpenseStore.updateExpense({
                  id: record.cfoExpenseId,
                  patch: {
                    amountSek: applied.record.amountIncVat,
                    ...(expense.vatSek || !applied.record.vatAmount
                      ? {}
                      : { vatSek: applied.record.vatAmount }),
                  },
                  actor: 'cm-reextract',
                });
                results.updatedCfo++;
              }
            } catch (err) {
              results.errors.push({ recordId: record.id, error: `cfo-backfill: ${err.message}` });
            }
          }
        }
        cmStore.completeLedgerEntry(ledger.id, {
          status: 'done',
          expenseRecordId: record.id,
        });
      } catch (err) {
        cmStore.completeLedgerEntry(ledger.id, { status: 'failed', errorMessage: err.message });
        results.errors.push({ recordId: record.id, error: err.message });
        if (diag) {
          diag.outcome = 'exception';
          diag.error = err.message;
          results.diagnostics.push(diag);
        }
      }
    }

    await cmStore.persist();
    return results;
  }

  // ORD-76 · Städa bort mail som ser ut som ekonomiska men saknar belopp
  // (bokningsbekräftelser, leveransnotiser, Kivra-påminnelser etc.).
  async function classifyNonEconomicRecords({ limit = 100, dryRun = true } = {}) {
    const results = {
      ok: true,
      dryRun,
      scanned: 0,
      classified: 0,
      skipped: 0,
      errors: [],
      items: [],
    };

    const records = cmStore
      .listRecordsMissingAmount({ limit: Math.max(1, limit * 2) })
      .filter((r) => r.approvalStatus === 'pending');
    results.scanned = records.length;

    for (const record of records) {
      if (results.classified >= limit) break;

      const rawItem = record.rawItemId ? cmStore.getRawItemById(record.rawItemId) : null;
      const reason = classifyNonEconomicMail({
        subject: rawItem?.subject || '',
        body: rawItem?.rawBodyText || rawItem?.bodyPreview || '',
        expenseType: record.expenseType || '',
      });

      if (!reason) {
        results.skipped++;
        continue;
      }

      const item = {
        recordId: record.id,
        supplierName: record.supplierName || rawItem?.fromEmail || null,
        subject: String(rawItem?.subject || '').slice(0, 200),
        reason,
      };

      if (dryRun) {
        results.classified++;
        results.items.push(item);
        continue;
      }

      try {
        const rejected = cmStore.reject(record.id, {
          rejectedBy: 'system:auto-classifier',
          reason: `auto_classified_non_economic_mail: ${reason}`,
        });
        if (rejected) {
          cmStore.markReextractAttempt?.(record.id, CM_PROCESSOR_VERSION);
          results.classified++;
          results.items.push(item);
        } else {
          results.errors.push({ recordId: record.id, error: 'reject returned null' });
        }
      } catch (err) {
        results.errors.push({ recordId: record.id, error: err.message });
      }
    }

    if (!dryRun && results.classified > 0) await cmStore.persist();
    return results;
  }

  return {
    syncFolder,
    syncAll,
    reprocessUnprocessed,
    reextractMissingAmounts,
    classifyNonEconomicRecords,
    listMessageAttachments,
    buildCombinedText,
    stripHtml,
    CM_PROCESSOR_VERSION,
    CM_FILTER_VERSION,
  };
}

module.exports = {
  createCmMailSync,
  DEFAULT_FOLDER_TYPES,
  CM_PROCESSOR_VERSION,
  CM_FILTER_VERSION,
  buildCombinedText,
  stripHtml,
};
