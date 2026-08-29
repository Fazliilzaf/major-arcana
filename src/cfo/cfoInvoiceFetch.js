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

const { validatePdfAttachment } = require('./cfoInvoiceValidator');

const AMOUNT_TOLERANCE = 1.0;
const DATE_TOLERANCE_DAYS = 14;
const STRICT_AUTO_DATE_TOLERANCE_DAYS = 3;
const DEFAULT_BULK_THRESHOLD = 1000;

// MIME-fallback skyddar mot minnes- och timeout-problem när Graphs
// attachment-API misslyckas och vi istället hämtar hela mejlet.
const MAX_MIME_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = Math.max(
  1024 * 1024,
  Number(process.env.CFO_MAX_ATTACHMENT_BYTES) || 10 * 1024 * 1024
);

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

function wordBoundaryIncludes(haystack, needle) {
  // ORD-102h: substring-matchning ger falskpositiv för korta tokens
  // (t.ex. "sj" matchar "transplantasjon"). Kräv helordsgräns.
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|[^a-z0-9åäö])${escaped}(?:[^a-z0-9åäö]|$)`, 'i');
  return re.test(haystack);
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

// ORD-117b: generera vanliga textrepresentationer av beloppet så vi kan söka
// efter det i mailets ämne/body. Täcker in 265,00 / 265.00 / 265 / 265,0 / 265 kr.
function amountTextVariations(amountSek) {
  const n = Number(amountSek);
  if (!Number.isFinite(n)) return [];
  const abs = Math.abs(n);
  const ints = [String(Math.round(abs)), String(Math.floor(abs))];
  const withDecimals = [abs.toFixed(2), abs.toFixed(1)];
  const swedish = [abs.toFixed(2).replace('.', ','), abs.toFixed(1).replace('.', ',')];
  const parts = [...new Set([...ints, ...withDecimals, ...swedish, String(abs)])];
  return parts.filter((s) => s.length > 0);
}

// ORD-117b: kräv att transaktionsbeloppet syns i mailets ämne eller bodyPreview.
// Detta stoppar att ett generiskt leverantörs-mail (t.ex. en nyhetsbrev/footer
// med "SJ" eller ett patientavtal som citerar flera leverantörer) kopplas till
// en kortdragning med helt annat belopp.
function messageAmountMatches(tx, message) {
  const amountSek = Number(tx?.amountSek);
  if (!Number.isFinite(amountSek)) return false;
  const haystack = normalizeText(`${message.subject || ''} ${message.bodyPreview || ''}`);
  if (!haystack) return false;
  const variations = amountTextVariations(amountSek);
  for (const v of variations) {
    // Kräv helordsgräns för beloppet så "265" inte matchar "2650".
    if (wordBoundaryIncludes(haystack, v)) return true;
  }
  return false;
}

const ALL_SUPPLIER_TOKENS = new Set([
  ...Object.keys(SUPPLIER_ALIASES),
  ...Object.values(SUPPLIER_ALIASES),
]);

function txSupplierTokens(tx) {
  // ORD-102h: använd endast kända leverantörsalias/kanoniska namn som
  // canonical tokens. Annars blir ord ur ort/beskrivning (t.ex. "san" i
  // "San Francisco") matchningskriterium och ger falskpositiv i subject.
  const raw = tokenSet(tx.description || '');
  return new Set([...raw].filter((t) => ALL_SUPPLIER_TOKENS.has(t)));
}

function recordDateMatches(record, tx, tolerance = DATE_TOLERANCE_DAYS) {
  if (!tx.date) return false;
  const d = normalizeText(record.date || record.dueDate || '');
  if (!d) return false;
  return daysBetween(d.slice(0, 10), tx.date) <= tolerance;
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
// includePromoted: vid REPARATION (inte ny-promote) ska även redan promotade
// poster matcha — vi återanvänder bara dokumentet som underlag.
function findCmRecord({ tx, cmStore, includePromoted = false }) {
  if (!cmStore) return null;
  const records = [
    ...(cmStore.getInvoices?.() || []),
    ...(cmStore.getReceipts?.() || []),
    ...(cmStore.getTravel?.() || []),
  ];

  // ORD-117: auto-fetch får bara plocka records inom 3 dagar från transaktionsdatumet
  // för att undvika att samma belopp på olika datum kopplas fel. Mänsklig granskning
  // tar de som ligger längre ifrån.
  const open = records.filter((r) => {
    if (r.approvalStatus === 'rejected') return false;
    if (!includePromoted && (r.bookkeepingStatus === 'handed_off' || r.cfoExpenseId)) return false; // redan promotad
    if (!amountMatches(r.amountIncVat, tx.amountSek)) return false;
    if (!recordDateMatches(r, tx, STRICT_AUTO_DATE_TOLERANCE_DAYS)) return false;
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

  // ORD-102g: kräv att minst ett kanoniskt leverantörstoken syns i ämne
  // eller bodyPreview. Annars matchar vi lätt på brödtextbrus (t.ex. "google"
  // i en HTML-footer eller Google Fonts-länk) och får felaktiga träffar.
  const canonicalTokens = new Set(tokens);

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

    // ORD-102h: kräv att ett kanoniskt leverantörstoken syns i ämnesraden.
    // Body preview och brödtext är för lättmanipulerade (signaturer,
    // citat, HTML-länkar) och har gett mängder av falskpositiva träffar
    // (t.ex. ett Besteller-mail som citerar gamla köp träffade på tio
    // olika transaktioner). Kvittot/fakturan ska ha leverantören i ämnet.
    const subject = normalizeText(m.subject || '').toLowerCase();
    let canonicalHit = false;
    for (const t of canonicalTokens) {
      if (wordBoundaryIncludes(subject, t)) {
        canonicalHit = true;
        break;
      }
    }
    if (!canonicalHit) continue;

    const fullHaystack = `${m.subject || ''} ${m.bodyPreview || ''}`.toLowerCase();
    let fullHit = false;
    for (const t of searchTokens) {
      if (wordBoundaryIncludes(fullHaystack, t)) {
        fullHit = true;
        break;
      }
    }
    if (!fullHit) continue;

    // ORD-117b: belöna kandidater där transaktionsbeloppet syns i ämnet eller
    // bodyPreview — det är ett starkt tecken på att mailet faktiskt handlar om
    // den aktuella köpet. Har mailet ingen summa synlig förlitar vi oss på
    // PDF-valideringen i nästa steg istället.
    const amountInBody = messageAmountMatches(tx, m);
    const hasPdfAttachment = Boolean(
      m.attachmentNames?.some((n) => String(n).toLowerCase().endsWith('.pdf')) ||
      m.attachments?.some((a) =>
        String(a?.name || '')
          .toLowerCase()
          .endsWith('.pdf')
      )
    );

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
      hasPdfAttachment,
      amountInBody,
      score: (hasPdfAttachment ? 10 : 0) + (amountInBody ? 5 : 0),
    });
  }

  // Föredra meddelande med PDF-bilaga och helst även belopp i ämne/body.
  all.sort((a, b) => b.score - a.score);
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
  // ORD-117: välj och validera rätt bilaga bland alla dokument kopplade till
  // record.rawItemId, inte bara record.documentId.
  const { resolveBestAttachmentForRecord } = require('../cm/cmRecordAttachmentResolver');
  const resolved = await resolveBestAttachmentForRecord({
    record,
    cmStore,
    secureStorage,
    tx,
    includeOriginalMail: true,
  });
  if (!resolved.ok) {
    // Behåll de gamla orsakskoderna så befintliga tester och loggar förstår resultatet.
    const legacyReason =
      resolved.reason === 'validation_failed'
        ? 'cm_document_validation_failed'
        : resolved.reason === 'no_documents_or_original' ||
            resolved.reason === 'best_attachment_unreadable'
          ? 'cm_record_found_but_document_missing'
          : `cm_attachment_resolution_failed:${resolved.reason}`;
    return {
      created: false,
      reason: legacyReason,
      validation: resolved.validation,
      resolution: resolved,
    };
  }
  const buffer = await (async () => {
    const obj = await secureStorage.getObject(resolved.storagePath);
    return obj?.buffer || null;
  })();
  if (!buffer) {
    return { created: false, reason: 'cm_record_found_but_document_missing' };
  }

  const doc =
    cmStore.getDocumentById?.(resolved.documentId) || cmStore.getDocumentById?.(record.documentId);
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
      attachmentKeys: resolved.attachmentKeys || [],
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
async function fetchMailboxPdfAttachmentViaMime({
  userId,
  messageId,
  graphReadConnector,
  maxAttachmentBytes = MAX_ATTACHMENT_BYTES,
}) {
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
    if (Buffer.byteLength(rawMime, 'utf8') > MAX_MIME_BYTES) {
      console.warn(
        '[cfoInvoiceFetch] MIME-fallback hoppar över för stort mejl:',
        userId,
        messageId,
        Buffer.byteLength(rawMime, 'utf8')
      );
      return null;
    }
    const parsed = await simpleParser(rawMime);
    const candidates = Array.isArray(parsed.attachments) ? parsed.attachments : [];
    const pdf = candidates.find((a) => {
      if (!a || a.related === true) return false;
      const contentType = normalizeText(a.contentType).toLowerCase();
      const filename = normalizeText(a.filename).toLowerCase();
      return contentType.includes('pdf') || filename.endsWith('.pdf');
    });
    if (!pdf?.content || !Buffer.isBuffer(pdf.content)) return null;
    if (pdf.content.length > maxAttachmentBytes) {
      console.warn(
        '[cfoInvoiceFetch] MIME-fallback hoppar över för stor PDF-bilaga:',
        userId,
        messageId,
        pdf.content.length
      );
      return null;
    }
    return {
      buffer: pdf.content,
      name: normalizeText(pdf.filename) || 'underlag.pdf',
      contentType: 'application/pdf',
    };
  } catch (err) {
    const msg = normalizeText(err?.message) || 'MIME-fallback misslyckades';
    console.warn('[cfoInvoiceFetch] MIME-fallback misslyckades:', userId, messageId, msg);
    return { error: msg };
  }
}

// ─── Hjälpare: hämta bästa icke-inline PDF-bilagan ur mailbox truth ─────────
// ORD-117b: prova alla PDF-bilagor och välj den som validerar mot transaktionen.
// Tidigare plockades bara den första PDF:en, vilket ledde till att t.ex.
// patientavtal eller andra dokument felaktigt kopplades till korttransaktioner.
async function fetchMailboxPdfAttachment({ message, graphReadConnector, tx = null }) {
  if (!graphReadConnector) return { error: 'Graph-connector saknas' };
  const safeUserId = normalizeText(
    message.userPrincipalName || message.mailboxAddress || message.mailboxId
  );
  const safeMessageId = normalizeText(message.graphMessageId || message.messageId || message.id);
  if (!safeUserId || !safeMessageId) return { error: 'saknar userId eller messageId' };

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
    const msg = normalizeText(err?.message) || 'kunde inte lista bilagor';
    console.warn('[cfoInvoiceFetch] kunde inte lista bilagor:', safeUserId, safeMessageId, msg);
    return { error: msg };
  }

  const pdfs = attachments.filter(
    (a) => !a.isInline && (/pdf/i.test(a.contentType || '') || /\.pdf$/i.test(a.name || ''))
  );
  if (!pdfs.length) return { error: 'ingen PDF-bilaga hittades' };

  // Sortera kandidater så att filnamn som matchar leverantör/belopp provas först.
  const scoredPdfs = pdfs.map((a) => {
    let score = 0;
    const name = normalizeText(a.name).toLowerCase();
    const supplier = normalizeText(tx?.description || '');
    if (supplier) {
      const supplierTokens = [...txSupplierTokens(tx)];
      for (const t of supplierTokens) {
        if (name.includes(t)) score += 2;
      }
    }
    const variations = amountTextVariations(tx?.amountSek);
    for (const v of variations) {
      if (name.includes(v)) score += 1;
    }
    return { ...a, score };
  });
  scoredPdfs.sort((a, b) => b.score - a.score);

  const errors = [];
  let bestFailed = null;
  for (const pdf of scoredPdfs) {
    if (pdf.size && pdf.size > MAX_ATTACHMENT_BYTES) {
      errors.push(`${pdf.id}: för stor (${pdf.size} bytes)`);
      continue;
    }

    let fetched = null;
    try {
      fetched = await graphReadConnector.fetchMessageAttachmentContent({
        userId: safeUserId,
        messageId: safeMessageId,
        attachmentId: pdf.id,
      });
      if (!fetched?.buffer?.length) {
        errors.push(`${pdf.id}: Graph returnerade tom buffer`);
        continue;
      }
    } catch (err) {
      const msg = normalizeText(err?.message) || 'okänt fel vid hämtning av bilaga';
      console.warn(
        '[cfoInvoiceFetch] kunde inte hämta bilaga, provar MIME-fallback:',
        safeUserId,
        safeMessageId,
        pdf.id,
        msg
      );
      const fallback = await fetchMailboxPdfAttachmentViaMime({
        userId: safeUserId,
        messageId: safeMessageId,
        graphReadConnector,
      });
      if (fallback?.buffer) {
        fetched = {
          buffer: fallback.buffer,
          name: fallback.name || pdf.name || 'underlag.pdf',
          contentType: fallback.contentType || pdf.contentType || 'application/pdf',
        };
      } else {
        errors.push(`${pdf.id}: ${fallback?.error || `Graph-fel: ${msg}`}`);
        continue;
      }
    }

    // ORD-117b: validera varje kandidat mot transaktionen; returnera första som passar.
    if (tx && typeof validatePdfAttachment === 'function') {
      const validation = await validatePdfAttachment({ buffer: fetched.buffer, tx });
      if (validation.ok) {
        return {
          buffer: fetched.buffer,
          name: fetched.name || pdf.name || 'underlag.pdf',
          contentType: fetched.contentType || pdf.contentType || 'application/pdf',
          validation,
        };
      }
      if (!bestFailed || validation.score > bestFailed.validation.score) {
        bestFailed = { fetched, pdf, validation };
      }
      errors.push(
        `${pdf.id}: validering misslyckades (${validation.reasons?.join(', ') || 'low score'})`
      );
      continue;
    }

    // Fallback om ingen tx/validator finns: returnera första hämtade.
    return {
      buffer: fetched.buffer,
      name: fetched.name || pdf.name || 'underlag.pdf',
      contentType: fetched.contentType || pdf.contentType || 'application/pdf',
    };
  }

  // Ingen PDF-bilaga klarade valideringen — skapa INTE kvitto av felaktigt underlag.
  const summary = bestFailed
    ? `bästa kandidat ${bestFailed.pdf.id} misslyckades (${bestFailed.validation.reasons?.join(', ') || 'low score'})`
    : 'inga kandidater hämtades';
  return {
    error: `ingen PDF-bilaga kunde valideras: ${summary}; ${errors.join('; ')}`,
    bestFailed: bestFailed
      ? {
          buffer: bestFailed.fetched.buffer,
          name: bestFailed.fetched.name || bestFailed.pdf.name || 'underlag.pdf',
          contentType:
            bestFailed.fetched.contentType || bestFailed.pdf.contentType || 'application/pdf',
          pdfId: bestFailed.pdf.id,
          score: bestFailed.validation.score,
          reasons: bestFailed.validation.reasons,
        }
      : null,
  };
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
  const attachment = await fetchMailboxPdfAttachment({ message, graphReadConnector, tx });
  if (!attachment?.buffer) {
    return {
      created: false,
      reason: 'mailbox_attachment_fetch_failed',
      fetchError: attachment?.error || 'okänt fel',
    };
  }

  // ORD-117: validera mailbox-bilagan mot transaktionen innan kvitto skapas.
  const validation = await validatePdfAttachment({ buffer: attachment.buffer, tx });
  if (!validation.ok) {
    return {
      created: false,
      reason: 'mailbox_attachment_validation_failed',
      validation,
    };
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

// ─── Hjälpare: kontrollera att en expense inte redan är matchad mot annan tx ─
function isExpenseAlreadyMatched({ expenseId, reconciliation, currentTxId }) {
  if (!reconciliation || !expenseId) return false;
  const all = reconciliation.listTransactions?.({ status: 'matched', limit: 10000 }) || [];
  return all.some((t) => t.id !== currentTxId && t.matchedExpenseId === expenseId);
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
    reconciliation,
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
  if (
    existingExpense &&
    !isExpenseAlreadyMatched({
      expenseId: existingExpense.id,
      reconciliation,
      currentTxId: tx.id,
    })
  ) {
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
      result.evidence = { ...message, reason: created.reason, fetchError: created.fetchError };
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
        reconciliation,
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
        const confirmed = await reconciliation.confirmMatch(tx.id, r.expenseId, { actor });
        if (confirmed && confirmed.error) {
          r.matchConfirmed = false;
          r.matchError = confirmed.error;
        } else {
          r.matchConfirmed = true;
        }
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
  loadCmDocumentBuffer,
  findMailboxMessage,
  fetchMailboxPdfAttachment,
  createExpenseFromMailboxMessage,
  supplierDisplayName,
  normalizeCfoCategory,
  DEFAULT_BULK_THRESHOLD,
};
