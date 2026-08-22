'use strict';

/**
 * cfoInvoiceFetch — Auto-hämta underlag för omatchade korttransaktioner.
 *
 * ORD-102d: för stora omatchade kortdragningar ska systemet leta redan
 * synkat material (CFO-expenses, CM-records, mailbox truth) och antingen
 * (a) skapa en CFO-expense + kvitto ur ett CM-dokument och matcha, eller
 * (b) rapportera var underlaget finns så ägaren kan importera det.
 *
 * Designlås: vi skapar ALDRIG en expense ur en kortrad utan underlag.
 * Kvittot/fakturan är underlaget; kortraden är bara bevis på betalning.
 */

const { simpleParser } = require('mailparser');

const {
  tokenSet,
  supplierHint,
  normalizeSupplier,
  parseSwedishAmount,
  normalizeForTokens,
  SUPPLIER_ALIASES,
} = require('./cfoCardReconciliation');

const AMOUNT_TOLERANCE = 1.0;
const DATE_TOLERANCE_DAYS = 14;
const DEFAULT_BULK_THRESHOLD = 1000;

function nowIso() {
  return new Date().toISOString();
}

function daysBetween(a, b) {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Infinity;
  return Math.abs(da - db) / 86400000;
}

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

// ORD-102e: AI-extraktionen kan returnera svenska kategorier med åäö och
// mellanslag (t.ex. "marknadsföring"), men CFO-fältet kräver snake_case utan
// diakritiska tecken. Normalisera hårt och fall tillbaka till null vid osäkerhet.
const VALID_CFO_CATEGORIES = new Set([
  'utrustning',
  'forbrukning',
  'lokal',
  'personal',
  'utbildning',
  'resor',
  'mat_representation',
  'marknadsforing',
  'administrativ',
  'it_telefoni',
  'forsakring',
  'juridik_konsult',
  'bank_finansiell',
  'skatter_avgifter',
  'annat',
  'privat',
]);

function normalizeCfoCategory(value) {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return null;
  const transliterated = raw
    .replace(/[åä]/g, 'a')
    .replace(/[ö]/g, 'o')
    .replace(/[é]/g, 'e')
    .replace(/[ü]/g, 'u')
    .replace(/[\s\/\\-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '');
  if (VALID_CFO_CATEGORIES.has(transliterated)) return transliterated;
  const mapping = {
    kontorsmaterial: 'forbrukning',
    kontor: 'administrativ',
    programvara: 'it_telefoni',
    software: 'it_telefoni',
    behandlingsmaterial: 'forbrukning',
    forbrukningsmaterial: 'forbrukning',
    resekostnad: 'resor',
    resa: 'resor',
    hotell: 'resor',
    flyg: 'resor',
    taxi: 'resor',
    mat: 'mat_representation',
    restaurang: 'mat_representation',
    marknadsforing: 'marknadsforing',
    reklam: 'marknadsforing',
    annonsering: 'marknadsforing',
    sociala_medier: 'marknadsforing',
    facebook_ads: 'marknadsforing',
    google_ads: 'marknadsforing',
    it: 'it_telefoni',
    telefoni: 'it_telefoni',
    internet: 'it_telefoni',
    hosting: 'it_telefoni',
    molntjanst: 'it_telefoni',
    cloud: 'it_telefoni',
    forsakring: 'forsakring',
    juridik: 'juridik_konsult',
    konsult: 'juridik_konsult',
    bank: 'bank_finansiell',
    skatt: 'skatter_avgifter',
    avgift: 'skatter_avgifter',
    privat: 'privat',
  };
  const mapped = mapping[transliterated];
  if (mapped && VALID_CFO_CATEGORIES.has(mapped)) return mapped;
  return null;
}

function amountMatches(a, b, tolerance = AMOUNT_TOLERANCE) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  return Math.abs(na - nb) <= tolerance;
}

function txSupplierTokens(tx) {
  return tokenSet(tx.description || '');
}

function recordDateMatches(record, tx) {
  if (!tx.date) return false;
  const d = normalizeText(record.date || record.dueDate || '');
  if (!d) return false;
  return daysBetween(d.slice(0, 10), tx.date) <= DATE_TOLERANCE_DAYS;
}

// ─── 1. Sök befintliga CFO-expenses (t.ex. manuellt skapade) ────────────────
function findCfoExpense({ tx, expenseStore }) {
  const from = tx.date ? addDays(tx.date, -DATE_TOLERANCE_DAYS) : null;
  const to = tx.date ? addDays(tx.date, DATE_TOLERANCE_DAYS) : null;
  const candidates = expenseStore.listExpenses({ fromDate: from, toDate: to, limit: 1000 });
  const matched = candidates.filter((e) => {
    if (e.status === 'rejected') return false;
    if (!amountMatches(e.amountSek, tx.amountSek)) return false;
    return supplierHint(tx.description, e.supplier);
  });
  // Välj den med bäst datumnärhet; utan datum kommer sist.
  matched.sort((a, b) => {
    const da = daysBetween(a.date || '9999-12-31', tx.date);
    const db = daysBetween(b.date || '9999-12-31', tx.date);
    return da - db;
  });
  return matched[0] || null;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ─── 2. Sök CM expense records (inklusive dokument) ────────────────────────
function findCmRecord({ tx, cmStore }) {
  if (!cmStore) return null;
  const records = [
    ...(cmStore.getInvoices?.() || []),
    ...(cmStore.getReceipts?.() || []),
    ...(cmStore.getTravel?.() || []),
  ];
  const open = records.filter((r) => {
    if (r.approvalStatus === 'rejected') return false;
    if (r.bookkeepingStatus === 'handed_off' || r.cfoExpenseId) return false; // redan promotad
    if (!amountMatches(r.amountIncVat, tx.amountSek)) return false;
    if (!recordDateMatches(r, tx)) return false;
    return supplierHint(tx.description, r.supplierName);
  });
  open.sort((a, b) => {
    const da = daysBetween(a.date || a.dueDate || '9999-12-31', tx.date);
    const db = daysBetween(b.date || b.dueDate || '9999-12-31', tx.date);
    return da - db;
  });
  return open[0] || null;
}

async function loadCmDocumentBuffer({ record, cmStore, secureStorage }) {
  const docId = record.documentId;
  if (!docId) return null;
  const doc = cmStore.getDocumentById?.(docId);
  if (!doc || !doc.storagePath) return null;
  try {
    const obj = await secureStorage.getObject(doc.storagePath);
    return obj?.buffer || null;
  } catch (err) {
    console.warn('[cfoInvoiceFetch] kunde inte läsa CM-dokument:', doc.storagePath, err?.message);
    return null;
  }
}

// ─── 3. Sök mailbox truth ────────────────────────────────────────────────────
async function findMailboxMessage({ tx, mailboxTruthStore, opts = {} }) {
  if (!mailboxTruthStore || typeof mailboxTruthStore.listMessages !== 'function') return null;
  const tokens = txSupplierTokens(tx);
  // Sök både efter alias-normerade tokens (t.ex. "facebook") och råa tokens
  // (t.ex. "meta") så att subject/body-preview med leverantörens riktiga namn
  // fortfarande träffar. Bygg en reverse-lookup från kanoniskt token till alla
  // alias-nycklar (t.ex. facebook → facebk, facebook, meta).
  const aliasGroups = new Map();
  for (const [alias, canonical] of Object.entries(SUPPLIER_ALIASES)) {
    if (!aliasGroups.has(canonical)) aliasGroups.set(canonical, new Set());
    aliasGroups.get(canonical).add(alias);
  }
  const rawTokens = new Set(
    normalizeForTokens(tx.description || '')
      .split(' ')
      .filter((w) => w.length >= 2)
  );
  const searchTokens = new Set([...tokens, ...rawTokens]);
  for (const t of tokens) {
    for (const alias of aliasGroups.get(t) || []) searchTokens.add(alias);
  }
  if (!searchTokens.size) return null;
  const from = tx.date ? addDays(tx.date, -DATE_TOLERANCE_DAYS) : null;
  const to = tx.date ? addDays(tx.date, DATE_TOLERANCE_DAYS) : null;

  // Ladda alla laddade shards. Användaren kan ha fler — då måste
  // ensureMailboxLoaded köras först, men vi vet inte vilka som är aktiva.
  // Routen skickar med mailboxIds om den vet dem.
  const mailboxIds =
    Array.isArray(opts.mailboxIds) && opts.mailboxIds.length
      ? opts.mailboxIds
      : mailboxTruthStore.listLoadedMailboxes?.() || [];

  const all = [];
  for (const mailboxId of mailboxIds) {
    await mailboxTruthStore.ensureMailboxLoaded?.(mailboxId);
  }
  const rows = mailboxTruthStore.listMessages({ mailboxIds, limit: 0 });

  for (const m of rows) {
    const received = normalizeText(m.receivedAt || m.sentAt || m.lastModifiedAt || '');
    if (!received) continue;
    const receivedDate = received.slice(0, 10);
    if (from && (receivedDate < from || receivedDate > to)) continue;

    const haystack = `${m.subject || ''} ${m.bodyPreview || ''}`.toLowerCase();
    let hit = false;
    for (const t of searchTokens) {
      if (haystack.includes(t)) {
        hit = true;
        break;
      }
    }
    if (!hit) continue;

    // Försök hydrera brödtext om vi har en träff men bodyPreview är kort
    let bodyText = m.bodyText || '';
    if (!bodyText && mailboxTruthStore.hydrateMessageBodies && m.messageKey) {
      try {
        const [hydrated] = await mailboxTruthStore.hydrateMessageBodies([m]);
        bodyText = hydrated?.bodyText || '';
      } catch {}
    }

    const fullHaystack = `${m.subject || ''} ${m.bodyPreview || ''} ${bodyText}`.toLowerCase();
    let fullHit = false;
    for (const t of searchTokens) {
      if (fullHaystack.includes(t)) {
        fullHit = true;
        break;
      }
    }
    if (!fullHit) continue;

    all.push({
      mailboxId: m.mailboxId,
      mailboxAddress: m.mailboxAddress || m.mailboxId,
      userPrincipalName: m.userPrincipalName || m.mailboxAddress || m.mailboxId,
      id: m.id,
      messageId: m.messageId,
      graphMessageId: m.graphMessageId,
      messageKey: m.messageKey || m.id || `${m.mailboxId}:${received}`,
      subject: m.subject,
      receivedAt: received,
      hasAttachments: Boolean(m.hasAttachments || m.attachmentCount > 0),
      attachments: m.attachments,
      attachmentNames: m.attachmentNames,
      hasPdfAttachment: Boolean(
        m.attachmentNames?.some((n) => String(n).toLowerCase().endsWith('.pdf')) ||
        m.attachments?.some((a) =>
          String(a?.name || '')
            .toLowerCase()
            .endsWith('.pdf')
        )
      ),
    });
  }

  // Föredra meddelande med PDF-bilaga
  all.sort((a, b) => Number(b.hasPdfAttachment) - Number(a.hasPdfAttachment));
  return all[0] || null;
}

// ─── Skapa CFO-expense + kvitto från CM-dokument ─────────────────────────────
async function createExpenseFromCmRecord({
  tx,
  record,
  cmStore,
  secureStorage,
  expenseStore,
  receiptStore,
  actor,
}) {
  const buffer = await loadCmDocumentBuffer({ record, cmStore, secureStorage });
  if (!buffer) {
    return { created: false, reason: 'cm_record_found_but_document_missing' };
  }

  const doc = cmStore.getDocumentById?.(record.documentId);
  const mimeType = doc?.mimeType || 'application/pdf';
  const ext = mimeType.toLowerCase().includes('pdf') ? 'pdf' : 'jpg';
  const fileName = doc?.fileName || `${normalizeSupplier(tx.description) || 'underlag'}.${ext}`;

  let receipt = null;
  if (receiptStore && typeof receiptStore.uploadReceipt === 'function') {
    receipt = await receiptStore.uploadReceipt({
      buffer,
      mimeType,
      originalFileName: fileName,
      sourceSystem: 'receipt_mail_import',
      actor,
      metadata: {
        supplier: record.supplierName || normalizeSupplier(tx.description),
        amountSek: Number(tx.amountSek) || record.amountIncVat,
        date: tx.date,
        notes: `Auto-hämtat ur CM för korttransaktion ${tx.description} ${tx.date}`,
      },
    });
  }

  const expense = await expenseStore.createExpense({
    actor,
    receiptId: receipt?.id || null,
    fields: {
      supplier: record.supplierName || normalizeSupplier(tx.description),
      amountSek: Number(tx.amountSek) || record.amountIncVat,
      vatSek: record.vatAmount || null,
      date: tx.date,
      category: normalizeCfoCategory(record.category),
      paymentMethod: 'card',
      notes: `Kortdragning ${tx.cardRef} ${tx.date} ${tx.description}. Underlag från CM: ${record.id}`,
    },
  });

  return { created: true, expense, receipt, source: 'cm_document' };
}

// ─── Hjälpare: välj läsbart leverantörsnamn från kortbeskrivningen ──────────
function supplierDisplayName(description) {
  const tokens = tokenSet(description || '');
  const DISPLAY_NAMES = {
    facebook: 'Meta / Facebook',
    uber: 'Uber',
    ubereats: 'Uber Eats',
    ubertrip: 'Uber',
    voi: 'Voi Technology',
    apple: 'Apple',
    github: 'GitHub',
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    google: 'Google',
    googleads: 'Google Ads',
    googlecloud: 'Google Cloud',
    googleone: 'Google One',
    zapier: 'Zapier',
    cursor: 'Cursor',
    microsoft: 'Microsoft',
    adobe: 'Adobe',
    canva: 'Canva',
    elevenlabs: 'Elevenlabs',
    booking: 'Booking.com',
    sj: 'SJ',
    hemkop: 'Hemköp',
    willys: 'Willys',
    bolt: 'Bolt',
    pipedrive: 'Pipedrive',
    figma: 'Figma',
    render: 'Render',
    klm: 'KLM',
    faire: 'Faire',
    swiss: 'Swiss',
  };
  for (const t of tokens) {
    if (DISPLAY_NAMES[t]) return DISPLAY_NAMES[t];
  }
  return normalizeSupplier(description) || 'Okänd leverantör';
}

// ─── Hjälpare: hämta första icke-inline PDF-bilaga via MIME-fallback ──────────
// ORD-102f: Graphs attachment-API kan returnera 404 för vissa bilagor (t.ex.
// gamla kvitton i kvitto@). Då provar vi hämta hela mejlet som MIME och plocka
// ut PDF:n med mailparser istället.
async function fetchMailboxPdfAttachmentViaMime({ userId, messageId, graphReadConnector }) {
  if (!graphReadConnector || typeof graphReadConnector.fetchMessageMimeContent !== 'function') {
    return null;
  }
  try {
    const mime = await graphReadConnector.fetchMessageMimeContent({
      userId,
      messageId,
      label: 'CFO auto-fetch MIME fallback',
      timeoutMs: 15000,
    });
    const rawMime = normalizeText(mime?.rawMime);
    if (!rawMime) return null;
    const parsed = await simpleParser(rawMime);
    const candidates = Array.isArray(parsed.attachments) ? parsed.attachments : [];
    const pdf = candidates.find((a) => {
      if (!a || a.related === true) return false;
      const contentType = normalizeText(a.contentType).toLowerCase();
      const filename = normalizeText(a.filename).toLowerCase();
      return contentType.includes('pdf') || filename.endsWith('.pdf');
    });
    if (!pdf?.content || !Buffer.isBuffer(pdf.content)) return null;
    return {
      buffer: pdf.content,
      name: normalizeText(pdf.filename) || 'underlag.pdf',
      contentType: 'application/pdf',
    };
  } catch (err) {
    console.warn('[cfoInvoiceFetch] MIME-fallback misslyckades:', userId, messageId, err?.message);
    return null;
  }
}

// ─── Hjälpare: hämta första icke-inline PDF-bilaga ur mailbox truth ─────────
async function fetchMailboxPdfAttachment({ message, graphReadConnector }) {
  if (!graphReadConnector) return null;
  const safeUserId = normalizeText(
    message.userPrincipalName || message.mailboxAddress || message.mailboxId
  );
  const safeMessageId = normalizeText(message.graphMessageId || message.messageId || message.id);
  if (!safeUserId || !safeMessageId) return null;

  let attachments = [];
  try {
    if (Array.isArray(message.attachments) && message.attachments.length) {
      attachments = message.attachments
        .map((a) => ({
          id: normalizeText(a?.id || a?.attachmentId),
          name: normalizeText(a?.name),
          contentType: normalizeText(a?.contentType),
          isInline: a?.isInline === true,
          size: Number(a?.size) || 0,
        }))
        .filter((a) => a.id);
    } else if (typeof graphReadConnector.probeMessageAttachments === 'function') {
      attachments = await graphReadConnector.probeMessageAttachments({
        userId: safeUserId,
        messageId: safeMessageId,
      });
    }
  } catch (err) {
    console.warn(
      '[cfoInvoiceFetch] kunde inte lista bilagor:',
      safeUserId,
      safeMessageId,
      err?.message
    );
    return null;
  }

  const pdf = attachments.find((a) => !a.isInline && /pdf/i.test(a.contentType || a.name || ''));
  if (!pdf) return null;

  try {
    const fetched = await graphReadConnector.fetchMessageAttachmentContent({
      userId: safeUserId,
      messageId: safeMessageId,
      attachmentId: pdf.id,
    });
    if (!fetched?.buffer?.length) return null;
    return {
      buffer: fetched.buffer,
      name: fetched.name || pdf.name || 'underlag.pdf',
      contentType: fetched.contentType || pdf.contentType || 'application/pdf',
    };
  } catch (err) {
    console.warn(
      '[cfoInvoiceFetch] kunde inte hämta bilaga, provar MIME-fallback:',
      safeUserId,
      safeMessageId,
      pdf.id,
      err?.message
    );
    return fetchMailboxPdfAttachmentViaMime({
      userId: safeUserId,
      messageId: safeMessageId,
      graphReadConnector,
    });
  }
}

// ─── Skapa CFO-expense + kvitto från mailbox-bilaga ───────────────────────────
async function createExpenseFromMailboxMessage({
  tx,
  message,
  receiptStore,
  expenseStore,
  graphReadConnector,
  actor,
}) {
  const attachment = await fetchMailboxPdfAttachment({ message, graphReadConnector });
  if (!attachment) {
    return { created: false, reason: 'mailbox_attachment_fetch_failed' };
  }

  let receipt = null;
  if (receiptStore && typeof receiptStore.uploadReceipt === 'function') {
    receipt = await receiptStore.uploadReceipt({
      buffer: attachment.buffer,
      mimeType: attachment.contentType,
      originalFileName: attachment.name,
      sourceSystem: 'receipt_mail_import',
      actor,
      metadata: {
        supplier: supplierDisplayName(tx.description),
        amountSek: Number(tx.amountSek),
        date: tx.date,
        notes: `Auto-hämtat ur mailbox ${message.mailboxId} för korttransaktion ${tx.description} ${tx.date}`,
      },
    });
  }

  const expense = await expenseStore.createExpense({
    actor,
    receiptId: receipt?.id || null,
    fields: {
      supplier: supplierDisplayName(tx.description),
      amountSek: Number(tx.amountSek),
      date: tx.date,
      paymentMethod: 'card',
      notes: `Kortdragning ${tx.cardRef} ${tx.date} ${tx.description}. Underlag från mailbox: ${message.mailboxId} / ${message.messageKey}`,
    },
  });

  return { created: true, expense, receipt, source: 'mailbox_attachment' };
}

// ─── Huvudfunktion: leta + (om möjligt) skapa/matcha ─────────────────────────
async function findInvoiceForTransaction(
  tx,
  {
    expenseStore,
    receiptStore,
    cmStore,
    secureStorage,
    mailboxTruthStore,
    graphReadConnector,
    actor,
    mailboxIds,
  } = {}
) {
  const result = {
    tx,
    matched: false,
    source: null,
    expenseId: null,
    receiptId: null,
    message: null,
    evidence: null,
  };

  // 1. Finns redan en CFO-expense?
  const existingExpense = findCfoExpense({ tx, expenseStore });
  if (existingExpense) {
    result.matched = true;
    result.source = 'cfo_expense';
    result.expenseId = existingExpense.id;
    result.message = 'Matchade mot befintlig CFO-expense';
    return result;
  }

  // 2. Finns det ett CM-record med dokument?
  const cmRecord = findCmRecord({ tx, cmStore });
  if (cmRecord) {
    const created = await createExpenseFromCmRecord({
      tx,
      record: cmRecord,
      cmStore,
      secureStorage,
      expenseStore,
      receiptStore,
      actor,
    });
    if (created.created) {
      result.matched = true;
      result.source = created.source;
      result.expenseId = created.expense.id;
      result.receiptId = created.receipt?.id;
      result.message = 'Skapade CFO-expense + kvitto från CM-underlag';
    } else {
      result.source = 'cm_record';
      result.evidence = { cmRecordId: cmRecord.id, reason: created.reason };
      result.message = 'CM-post hittades men dokumentet kunde inte läsas';
    }
    return result;
  }

  // 3. Finns det i mailbox truth?
  const message = await findMailboxMessage({ tx, mailboxTruthStore, opts: { mailboxIds } });
  if (message) {
    // ORD-102e: om träffen har en PDF-bilaga, försök hämta och skapa expense direkt.
    const canCreate =
      expenseStore &&
      typeof expenseStore.createExpense === 'function' &&
      receiptStore &&
      typeof receiptStore.uploadReceipt === 'function';
    if (message.hasPdfAttachment && canCreate && graphReadConnector) {
      const created = await createExpenseFromMailboxMessage({
        tx,
        message,
        receiptStore,
        expenseStore,
        graphReadConnector,
        actor,
      });
      if (created.created) {
        result.matched = true;
        result.source = created.source;
        result.expenseId = created.expense.id;
        result.receiptId = created.receipt?.id;
        result.message = 'Skapade CFO-expense + kvitto från mailbox-bilaga';
        return result;
      }
      result.source = 'mailbox_truth';
      result.evidence = { ...message, reason: created.reason };
      result.message = 'Träff i mailboxen med PDF, men bilagan kunde inte hämtas';
      return result;
    }
    result.source = 'mailbox_truth';
    result.evidence = message;
    result.message = message.hasAttachments
      ? 'Underlag troligen i mailboxen — kräver import av bilaga'
      : 'Träff i mailboxen utan bilaga — kräver manuell granskning';
    return result;
  }

  result.message = 'Inget underlag hittades i CFO, CM eller mailbox';
  return result;
}

// ─── Bulk-variant för omatchade transaktioner över tröskel ───────────────────
async function autoFetchInvoices({
  reconciliation,
  expenseStore,
  receiptStore,
  cmStore,
  secureStorage,
  mailboxTruthStore,
  graphReadConnector,
  actor,
  threshold = DEFAULT_BULK_THRESHOLD,
  mailboxIds,
} = {}) {
  const unmatched = reconciliation.listTransactions({ status: 'unmatched', limit: 10000 });
  const targets = unmatched.filter((t) => Number(t.amountSek) >= threshold);
  const results = [];
  for (const tx of targets) {
    let r;
    try {
      r = await findInvoiceForTransaction(tx, {
        expenseStore,
        receiptStore,
        cmStore,
        secureStorage,
        mailboxTruthStore,
        graphReadConnector,
        actor,
        mailboxIds,
      });
    } catch (err) {
      r = {
        tx,
        matched: false,
        source: null,
        expenseId: null,
        receiptId: null,
        message: `Fel vid sökning: ${err.message}`,
        evidence: null,
        error: err.message,
      };
    }
    if (r.matched) {
      try {
        await reconciliation.confirmMatch(tx.id, r.expenseId, { actor });
        r.matchConfirmed = true;
      } catch (err) {
        r.matchConfirmed = false;
        r.matchError = err.message;
      }
    }
    results.push(r);
  }
  return {
    threshold,
    scanned: targets.length,
    matched: results.filter((r) => r.matched).length,
    mailboxHints: results.filter((r) => r.source === 'mailbox_truth').length,
    results,
  };
}

module.exports = {
  findInvoiceForTransaction,
  autoFetchInvoices,
  findCfoExpense,
  findCmRecord,
  findMailboxMessage,
  fetchMailboxPdfAttachment,
  createExpenseFromMailboxMessage,
  supplierDisplayName,
  normalizeCfoCategory,
  DEFAULT_BULK_THRESHOLD,
};
