'use strict';

/**
 * CCO Conversation messages — full tråd-historik för en given conversation key.
 *
 * Endpoint: GET /api/v1/cco/runtime/conversation/:key/messages
 *
 * Frontend (/cco/) anropar detta när en tråd väljs i listan. Worklist-consumer
 * returnerar bara metadata + senaste preview — denna endpoint ger alla
 * messages med body, from, time och dir så att tråd-vyn visar hela historiken.
 *
 * Datakälla: ccoMailboxTruthStore.listMessages() filtrerat på samma aliasfamilj som
 * worklist-consumer använder (rå mailboxConversationId + scoped canonical key).
 *
 * Designprinciper:
 *   • Read-only — påverkar inget state.
 *   • Sorterad äldst-först (kronologisk läsordning).
 *   • Returnerar minimal shape som /cco/ förväntar: { from, dir, time, body, initials }.
 *   • Inga personliga uppgifter (ID:n) exponeras utöver vad som redan finns i worklist.
 */

const crypto = require('crypto');
const express = require('express');
const { runSummarizeThreadCapability } = require('../capabilities/summarizeThread');
const {
  deriveDir,
  deriveFromName,
  deriveTime,
  deriveBody,
  firstNormalizedText,
  chooseRicherBodyText,
  normalizeBodyText,
  addBodyCandidate,
  pickBestBodyCandidate,
  buildConversationLookupScopes,
  conversationMessageMatchesScopes,
  buildConversationAliases,
  fetchSortedConversationMessagesForKeys,
  toSummarizeInputMessage,
} = require('../ops/ccoAiThreadSummary');
const {
  buildCanonicalMailContentSections,
  extractTextFromHtml,
} = require('../ops/ccoMailContentParser');
const {
  messageMatchesContactFormScope,
  normalizeEmail,
  parseContactFormScopedConversationKey,
} = require('../ops/ccoContactFormIdentity');
const { toCanonicalMailboxConversationKey } = require('../ops/ccoMailboxTruthWorklistReadModel');
const { computeReplyConfidence } = require('../ops/replyConfidencePanel');
const { normalizeCidCandidates, rewriteCidImageReferences } = require('../ops/ccoCidImageRewrite');
const {
  ANSWERED_CATEGORY_PREFIX,
  ANSWERED_CATEGORY_COLOR,
  buildAnsweredCategory,
  markAnsweredCategoryEnabled,
} = require('../ops/ccoAnsweredCategory');
const { attachRole, requirePermission } = require('../security/ccoRbac');

// Heuristisk fallback om OpenAI inte är konfigurerad — säker, generisk
function buildHeuristicDraft({ customerName, latestInboundBody, ownerName }) {
  const greeting = customerName ? `Hej ${customerName.split(/\s+/)[0]}!` : 'Hej!';
  const sign = ownerName ? `Mvh,\n${ownerName}\nHair TP Clinic` : 'Mvh,\nHair TP Clinic';
  return `${greeting}\n\nTack för ditt mejl. Vi återkommer skyndsamt med nästa steg.\n\n${sign}`;
}

// Generera nästa N lediga slots (heuristisk — antar arbetsdagar mån-fre 09-17 med lunch 12-13).
// Hoppar över datum då kunden redan har en bokning.
function generateSuggestedSlots({
  existingBookings = [],
  count = 6,
  startFromIso = null,
  slotMinutes = 30,
} = {}) {
  const startMs = startFromIso ? Date.parse(startFromIso) : Date.now();
  const safeStart = Number.isFinite(startMs) ? startMs : Date.now();
  // Börja från nästa heltimme + minst 24h framåt (klinik behöver ledtid)
  const ledtidMs = 24 * 60 * 60 * 1000;
  const cursor = new Date(safeStart + ledtidMs);
  cursor.setMinutes(0, 0, 0);
  const slotsPerDay = ['09:00', '11:00', '13:30', '15:00'];
  const existingDays = new Set(
    (existingBookings || [])
      .map((b) => normalizeText(b?.startsAt))
      .filter(Boolean)
      .map((iso) => iso.slice(0, 10))
  );
  const out = [];
  let safety = 0;
  while (out.length < count && safety < 60) {
    safety += 1;
    const day = cursor.getDay(); // 0=söndag, 6=lördag
    if (day === 0 || day === 6) {
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }
    const dayKey = cursor.toISOString().slice(0, 10);
    if (existingDays.has(dayKey)) {
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }
    for (const slotTime of slotsPerDay) {
      if (out.length >= count) break;
      const [hh, mm] = slotTime.split(':').map(Number);
      const slot = new Date(cursor);
      slot.setHours(hh, mm, 0, 0);
      if (slot.getTime() <= Date.now() + ledtidMs) continue;
      out.push({
        startsAt: slot.toISOString(),
        durationMinutes: slotMinutes,
        weekday: ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'][slot.getDay()],
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function describeSlotSv(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const wd = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'][d.getDay()];
  const day = d.getDate();
  const mon = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'][
    d.getMonth()
  ];
  const time = d.toLocaleTimeString('sv', { hour: '2-digit', minute: '2-digit' });
  return `${wd} ${day} ${mon} kl ${time}`;
}

async function generateOpenAIReply({
  openai,
  model,
  messages,
  customerName,
  ownerName,
  subject,
  tone = 'warm',
}) {
  if (!openai || !model) return null;
  const toneInstruction = (() => {
    if (tone === 'concise') return 'Skriv kort och rakt på sak. Max 4 meningar.';
    if (tone === 'professional') return 'Skriv professionellt och formellt. Inga utropstecken.';
    return 'Skriv varmt och empatiskt. Använd kundens förnamn naturligt.';
  })();
  const safeMessages = (Array.isArray(messages) ? messages : [])
    .slice(-12) // bara senaste 12 för att hålla prompten kort
    .map((m) => {
      const dir =
        String(m.direction || m.dir || '').toLowerCase() === 'outbound' ? 'KLINIK' : 'KUND';
      const time = String(m.sentAt || m.recordedAt || m.time || '').slice(0, 19);
      const body = String(m.body || m.bodyPreview || m.text || '').slice(0, 1200);
      return `[${dir} · ${time}] ${body}`;
    })
    .filter(Boolean)
    .join('\n\n');
  const sys = `Du är AI-assistent för Hair TP Clinic, en hårtransplantation-klinik i Sverige. Du svarar på kundmejl på svenska. Behåll klinikens röst: kunnig, varm, professionell. Hitta INTE på fakta som inte finns i tråden (priser, datum, tider). Om tråden frågar om något du inte vet — föreslå att kunden bokar konsultation.`;
  const user = `Kund: ${customerName || '(okänd)'}\nÄmne: ${subject || '(utan ämne)'}\nMejlhistorik (kronologisk):\n\n${safeMessages || '(tom)'}\n\nUppgift: Skriv ett komplett svarsmejl från kliniken till kunden. ${toneInstruction} Avsluta med: "Mvh, ${ownerName || 'Hair TP Clinic'}". Returnera ENDAST mejltext (ingen ämnesrad, inga citat, ingen markdown).`;
  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.4,
      max_tokens: 600,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
    });
    const draft = completion?.choices?.[0]?.message?.content;
    return typeof draft === 'string' && draft.trim() ? draft.trim() : null;
  } catch (err) {
    return null;
  }
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Sanerar HTML som skickas iväg som svarsmejl. Tillåter enbart ett begränsat
 * tagg-vitlistat och tar bort event handlers, farliga URL-scheman och
 * inbäddade script/iframe/object etc. Används i /reply innan bodyHtml når
 * Graph-connector.
 */
function sanitizeReplyHtml(html) {
  const input = normalizeText(html);
  if (!input) return '';

  let safe = input;

  // 1. Ta bort HTML-kommentarer.
  safe = safe.replace(/<!--[\s\S]*?-->/g, '');

  // 2. Ta bort farliga taggar och allt deras innehåll.
  const dangerousTags = [
    'script',
    'style',
    'iframe',
    'object',
    'embed',
    'form',
    'meta',
    'link',
    'base',
    'head',
    'body',
    'html',
    'svg',
    'math',
    'canvas',
    'video',
    'audio',
  ];
  for (const tag of dangerousTags) {
    safe = safe.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'gi'), '');
    safe = safe.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '');
  }

  // 3. Ta bort event handlers och style-attribut globalt.
  safe = safe.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  safe = safe.replace(/\s+style\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // 4. Tillåt bara säkra URL-scheman i href/src.
  const allowedUrlScheme = /^(https?:|mailto:|tel:|#|cid:)/i;
  safe = safe.replace(
    /\s+(href|src|xlink:href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
    (match, attr, value) => {
      const raw = value.replace(/^["']|["']$/g, '');
      if (!raw || allowedUrlScheme.test(raw)) return ` ${attr}=${value}`;
      return '';
    }
  );

  // 5. Ta bort övriga data-/xml-attribut som kan bära payload.
  safe = safe.replace(
    /\s+(data-[a-zA-Z0-9-]+|jsaction|xmlns(:[a-zA-Z0-9-]+)?)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
    ''
  );

  // 6. Vitlista taggar — ta bort otillåtna taggar men behåll innehållet.
  const allowed = new Set([
    'a',
    'b',
    'blockquote',
    'br',
    'code',
    'div',
    'em',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'i',
    'li',
    'ol',
    'p',
    'pre',
    'span',
    'strong',
    'table',
    'tbody',
    'td',
    'th',
    'thead',
    'tr',
    'u',
    'ul',
  ]);
  safe = safe.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g, (match, tag) => {
    if (allowed.has(tag.toLowerCase())) return match;
    return '';
  });

  return safe.trim();
}

function deriveSenderEmail(message) {
  const safe = asObject(message);
  return (
    normalizeText(asObject(asObject(safe.from).emailAddress).address) ||
    normalizeText(safe.senderEmail) ||
    normalizeText(safe.fromAddress) ||
    normalizeText(asObject(asObject(safe.sender).emailAddress).address)
  ).toLowerCase();
}

function deriveBodyHtml(message) {
  const safe = asObject(message);
  const body = asObject(safe.body);
  const uniqueBody = asObject(safe.uniqueBody);
  const rawJson = asObject(safe.rawJson);
  const rawBody = asObject(rawJson.body);
  const rawUniqueBody = asObject(rawJson.uniqueBody);
  const mailDocument = asObject(safe.mailDocument);
  const candidates = [
    safe.bodyHtml,
    safe.body_html,
    body.contentType && /html/i.test(String(body.contentType)) ? body.content : '',
    uniqueBody.contentType && /html/i.test(String(uniqueBody.contentType))
      ? uniqueBody.content
      : '',
    mailDocument.primaryBodyHtml,
    rawJson.bodyHtml,
    rawJson.body_html,
    rawBody.contentType && /html/i.test(String(rawBody.contentType)) ? rawBody.content : '',
    rawUniqueBody.contentType && /html/i.test(String(rawUniqueBody.contentType))
      ? rawUniqueBody.content
      : '',
  ];
  return candidates.reduce((best, candidate) => chooseRicherHtml(best, candidate), '');
}

// A reply often carries its earlier correspondence below the new message. The
// thread already renders those earlier messages as their own bubbles, so the
// read surface must use the existing canonical sectioner instead of returning
// the complete raw reply HTML again. Keep the signature in the same bubble.
function deriveDisplayMailBody(message) {
  const sourceHtml = deriveBodyHtml(message);
  const sourceText = deriveBody(message);
  const sections = buildCanonicalMailContentSections({
    primaryBodyHtml: sourceHtml,
    sourceText,
  });
  const primaryText = normalizeText(sections?.primaryBody?.text);
  const signatureText = normalizeText(sections?.signatureBlock?.text);
  const primaryHtml = normalizeText(sections?.primaryBody?.html);
  const signatureHtml = normalizeText(sections?.signatureBlock?.html);

  return {
    text: [primaryText, signatureText].filter(Boolean).join('\n\n') || sourceText,
    html: [primaryHtml, signatureHtml].filter(Boolean).join('') || sourceHtml,
  };
}

function buildMailAssetContentUrl({
  mailboxId = '',
  messageId = '',
  attachmentId = '',
  fileName = '',
  mode = 'open',
}) {
  const safeMailboxId = normalizeText(mailboxId);
  const safeMessageId = normalizeText(messageId);
  const safeAttachmentId = normalizeText(attachmentId);
  if (!safeMailboxId || !safeMessageId || !safeAttachmentId) return '';
  const query = [
    ['mailboxId', safeMailboxId],
    ['messageId', safeMessageId],
    ['attachmentId', safeAttachmentId],
    ['mode', mode],
    ['fileName', normalizeText(fileName)],
  ]
    .filter(([, value]) => value)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `/api/v1/cco/runtime/mail-asset/content?${query}`;
}

function normalizeConversationAttachment(attachment = {}, message = {}) {
  const safe = asObject(attachment);
  const context = asObject(message);
  const rawJson = asObject(context.rawJson);
  const mailDocument = asObject(context.mailDocument);
  const id =
    normalizeText(safe.id) ||
    normalizeText(safe.assetId) ||
    normalizeText(safe.mailAssetId) ||
    normalizeText(safe.attachmentId) ||
    normalizeText(safe.contentId) ||
    normalizeText(safe.name) ||
    normalizeText(safe.filename);
  const rawName =
    normalizeText(safe.name) || normalizeText(safe.fileName) || normalizeText(safe.filename);
  if (!id && !rawName) return null;
  const name = rawName || 'Bilaga';
  const sizeValue = Number(safe.size || safe.contentLength || safe.length || 0);
  const attachmentId =
    normalizeText(safe.attachmentId) ||
    normalizeText(safe.id) ||
    normalizeText(safe.assetId) ||
    normalizeText(safe.mailAssetId) ||
    normalizeText(safe.contentId) ||
    id;
  const mailboxId = firstNormalizedText(
    safe.mailboxId,
    context.mailboxId,
    context.mailboxAddress,
    mailDocument.mailboxId,
    mailDocument.mailboxAddress,
    rawJson.mailboxId,
    rawJson.mailboxAddress
  );
  const messageId = firstNormalizedText(
    safe.messageId,
    safe.graphMessageId,
    context.graphMessageId,
    context.messageId,
    context.rawMessageId,
    context.id,
    mailDocument.messageId,
    mailDocument.graphMessageId,
    mailDocument.id,
    rawJson.id,
    rawJson.messageId,
    rawJson.graphMessageId,
    rawJson.internetMessageId
  );
  const openUrl =
    normalizeText(safe.openUrl) ||
    normalizeText(safe.url) ||
    normalizeText(safe.href) ||
    normalizeText(safe.contentUrl) ||
    normalizeText(asObject(safe.render).url) ||
    buildMailAssetContentUrl({ mailboxId, messageId, attachmentId, fileName: name, mode: 'open' });
  const downloadUrl =
    normalizeText(safe.downloadUrl) ||
    normalizeText(asObject(safe.download).url) ||
    normalizeText(asObject(safe.download).href) ||
    buildMailAssetContentUrl({
      mailboxId,
      messageId,
      attachmentId,
      fileName: name,
      mode: 'download',
    });
  const contentType = normalizeText(safe.contentType) || normalizeText(safe.mimeType) || null;
  const isInline = Boolean(safe.isInline || safe.inline || safe.disposition === 'inline');
  return {
    id: id || name,
    attachmentId: attachmentId || null,
    name,
    contentType,
    size: Number.isFinite(sizeValue) && sizeValue > 0 ? sizeValue : null,
    isInline,
    contentId: normalizeText(safe.contentId) || null,
    contentLocation: normalizeText(safe.contentLocation) || null,
    openUrl: openUrl || null,
    downloadUrl: downloadUrl || null,
    inlineUrl:
      /^image\//i.test(contentType || '') && (isInline || openUrl) ? openUrl || null : null,
    family: normalizeText(safe.family) || normalizeText(safe.disposition) || null,
    render:
      safe.render && typeof safe.render === 'object'
        ? {
            safe: safe.render.safe === true,
            state: normalizeText(safe.render.state) || null,
          }
        : null,
    download:
      safe.download && typeof safe.download === 'object'
        ? {
            available: safe.download.available === true,
            state: normalizeText(safe.download.state) || null,
          }
        : null,
  };
}

function collectConversationAttachments(message = {}) {
  const safe = asObject(message);
  const rawJson = asObject(safe.rawJson);
  const mailDocument = asObject(safe.mailDocument);
  const candidates = [
    ...asArray(safe.attachments),
    ...asArray(safe.fileAttachments),
    ...asArray(mailDocument.attachments),
    ...asArray(mailDocument.inlineAssets),
    ...asArray(mailDocument.assets),
    ...asArray(rawJson.attachments),
    ...asArray(rawJson.fileAttachments),
  ];
  const seen = new Set();
  return candidates
    .map((attachment) => normalizeConversationAttachment(attachment, safe))
    .filter(Boolean)
    .filter((attachment) => {
      const key = [
        normalizeText(attachment.id),
        normalizeText(attachment.contentId),
        normalizeText(attachment.name),
      ]
        .filter(Boolean)
        .join(':')
        .toLowerCase();
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function mergeConversationAttachments(...messages) {
  const seen = new Set();
  const merged = [];
  messages.forEach((message) => {
    collectConversationAttachments(message).forEach((attachment) => {
      const key = [
        normalizeText(attachment.attachmentId),
        normalizeText(attachment.id),
        normalizeText(attachment.contentId),
        normalizeText(attachment.name),
      ]
        .filter(Boolean)
        .join(':')
        .toLowerCase();
      if (key && seen.has(key)) return;
      if (key) seen.add(key);
      merged.push(attachment);
    });
  });
  return merged;
}

// Tunn wrapper: resten av filen (t.ex. hasCidWithoutLocalAsset) förväntar sig
// en enda nyckel, inte kandidatlistan rewriteMailCidImageSources behöver.
function normalizeContentId(value = '') {
  return normalizeCidCandidates(value)[0] || '';
}

function buildInlineAttachmentUrlMap(attachments = []) {
  const map = new Map();
  asArray(attachments).forEach((attachment) => {
    const safe = asObject(attachment);
    const url =
      normalizeText(safe.inlineUrl) ||
      normalizeText(safe.openUrl) ||
      normalizeText(safe.url) ||
      normalizeText(safe.href);
    if (!url) return;
    [safe.contentId, safe.id, safe.attachmentId, safe.name]
      .flatMap((field) => normalizeCidCandidates(field))
      .filter(Boolean)
      .forEach((key) => {
        if (!map.has(key)) map.set(key, url);
      });
  });
  return map;
}

function rewriteMailCidImageSources(html = '', attachments = []) {
  const cidMap = buildInlineAttachmentUrlMap(attachments);
  const inlineImages = asArray(attachments).filter(
    (attachment) =>
      attachment?.isInline === true && /^image\//i.test(normalizeText(attachment?.contentType))
  );
  const fallbackInlineUrl =
    inlineImages.length === 1
      ? normalizeText(inlineImages[0].inlineUrl || inlineImages[0].openUrl)
      : '';
  return rewriteCidImageReferences(html, cidMap, { fallbackInlineUrl, handleAboutBlank: true });
}

function objectHasKeys(value) {
  return Object.keys(asObject(value)).length > 0;
}

function parseConversationAliasQuery(query = {}) {
  const raw = query.aliases || query.alias || query.keys || query.key;
  return Array.from(
    new Set(
      String(raw || '')
        .split(',')
        .map((item) => normalizeText(item))
        .filter(Boolean)
    )
  ).slice(0, 12);
}

function parseConversationMemberKeysQuery(query = {}) {
  return Array.from(
    new Set(
      [
        ...String(query.memberKeys || '')
          .split(',')
          .map((item) => normalizeText(item)),
        ...parseConversationAliasQuery(query),
      ].filter(Boolean)
    )
  ).slice(0, 50);
}

// Mailbox-hint från klienten (trådens mailboxAddress/mailboxId). Används för att
// scopa truth-läsningen när konversationsnyckeln inte bär mailbox-prefix — annars
// läses ALLA shards per trådöppning (combine+sort av hela storen), vilket ger
// sekunders latens ("Laddar från CCO-pipelinen").
function parseConversationMailboxHintQuery(query = {}) {
  const safeQuery = asObject(query);
  const raw = safeQuery.mailboxId || safeQuery.mailbox || safeQuery.mailboxAddress || '';
  return Array.from(
    new Set(
      String(raw)
        .split(',')
        .map((item) => normalizeEmail(item))
        .filter(Boolean)
    )
  ).slice(0, 10);
}

const DEFAULT_MESSAGES_LIMIT = 100;
const MAX_MESSAGES_LIMIT = 500;

function parsePagination(query = {}) {
  const safeQuery = asObject(query);
  const wantsAll = /^(true|1|yes)$/.test(
    String(safeQuery.all || '')
      .trim()
      .toLowerCase()
  );
  if (wantsAll) return { limit: null, offset: 0 };

  let limit = Number.isFinite(Number(safeQuery.limit))
    ? Number(safeQuery.limit)
    : DEFAULT_MESSAGES_LIMIT;
  if (!Number.isFinite(limit) || Number.isNaN(limit)) limit = DEFAULT_MESSAGES_LIMIT;
  limit = Math.max(1, Math.min(MAX_MESSAGES_LIMIT, Math.floor(limit)));

  let offset = Number.isFinite(Number(safeQuery.offset)) ? Number(safeQuery.offset) : 0;
  if (!Number.isFinite(offset) || Number.isNaN(offset)) offset = 0;
  offset = Math.max(0, Math.floor(offset));

  return { limit, offset };
}

function parseConversationContactScopeQuery(query = {}) {
  const email = normalizeEmail(
    query.customerEmail ||
      query.contactEmail ||
      query.counterpartyEmail ||
      query.email ||
      query.customer_email ||
      ''
  );
  const reference = normalizeText(
    query.contactReference ||
      query.customerReference ||
      query.reference ||
      query.contactName ||
      query.customerName ||
      ''
  ).toLowerCase();
  return {
    ...(email ? { contactEmail: email } : {}),
    ...(reference ? { contactReference: reference } : {}),
  };
}

function dedupeConversationMessages(messages = []) {
  const seen = new Set();
  return (Array.isArray(messages) ? messages : []).filter((message) => {
    const safe = asObject(message);
    const key =
      normalizeText(safe.graphMessageId) ||
      normalizeText(safe.messageId) ||
      normalizeText(safe.rawMessageId) ||
      normalizeText(safe.id) ||
      [
        normalizeText(safe.mailboxId || safe.mailboxAddress),
        normalizeText(safe.conversationId || safe.mailboxConversationId),
        normalizeText(safe.sentAt || safe.receivedAt),
        normalizeText(safe.bodyPreview || safe.preview || safe.snippet).slice(0, 120),
      ]
        .filter(Boolean)
        .join(':');
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deriveInternetMessageId(message = {}) {
  const safe = asObject(message);
  return (
    normalizeText(safe.internetMessageId) ||
    normalizeText(asObject(safe.rawJson).internetMessageId) ||
    normalizeText(asObject(safe.mailDocument).internetMessageId)
  );
}

// Innehålls-signatur för att bara fälla ihop EXAKT identiska kopior: samma mailbox
// + riktning + avsändare + ämne + minut + verifierad hel kropp. Detta fångar identiska
// kopior även när de har OLIKA Message-ID (t.ex. ett kontaktformulär som gör tre
// separata sändningar med varsitt Message-ID men samma innehåll). Hela kroppen
// jämförs (inte bara början) så två olika patient-mail ALDRIG slås ihop av misstag
// — vi får aldrig missa patientinformation. Rollup-funktionen (samla alla kundens
// trådar till en) är en separat mekanism uppströms och påverkas inte av detta.
function duplicateContentSignature(message = {}) {
  const safe = asObject(message);
  const body = normalizeBodyText(safe.bodyText || safe.body);
  const preview = normalizeBodyText(safe.bodyPreview || safe.preview);
  const subject = normalizeText(safe.subject).toLowerCase();
  // Om body bara är samma korta preview har vi inte en verifierad hel kropp.
  // Då får olika Message-ID inte fällas ihop via innehållssignatur.
  if (!body || (preview && body.toLowerCase() === preview.toLowerCase())) return '';
  const parts = [
    normalizeEmail(safe.mailboxAddress || safe.mailboxId),
    normalizeText(safe.dir),
    normalizeText(safe.from || safe.senderEmail || safe.fromEmail).toLowerCase(),
    normalizeText(safe.time || safe.receivedAt || safe.sentAt).slice(0, 16),
    subject,
    body,
  ].filter(Boolean);
  return `sig:${parts.join('|')}`;
}

// Fäller ihop identiska kopior till ETT meddelande men bevarar spåret: duplicateCount
// (hur många gånger) + duplicates[] (när/var/vilken folder per kopia). Två kopior slås
// ihop om de delar Message-ID ELLER innehålls-signatur — så tre separata formulär-
// sändningar med olika Message-ID men identiskt innehåll blir ett. Äkta separata mail
// (annat ämne/kropp) rörs inte. Ordningen bevaras (första förekomsten = representant).
function collapseDuplicateMessages(messages = []) {
  const byMessageId = new Map();
  const bySignature = new Map();
  const result = [];
  for (const raw of asArray(messages)) {
    const message = asObject(raw);
    const messageId = deriveInternetMessageId(message).toLowerCase();
    const signature = duplicateContentSignature(message);
    const occurrence = {
      // Ankomsttid (receivedAt) för spåret — inte sentAt. Faller tillbaka till time.
      time: message.receivedAt || message.time || null,
      mailboxAddress: message.mailboxAddress || message.mailboxId || null,
      folderType: message.folderType || null,
    };
    const rep =
      (messageId && byMessageId.get(messageId)) ||
      (signature && bySignature.get(signature)) ||
      null;
    if (rep) {
      rep.duplicateCount += 1;
      rep.duplicates.push(occurrence);
    } else {
      const created = { ...message, duplicateCount: 1, duplicates: [occurrence] };
      result.push(created);
      if (messageId) byMessageId.set(messageId, created);
      if (signature) bySignature.set(signature, created);
      continue;
    }
    // Registrera båda nycklarna på representanten så efterföljande kopior som bara
    // matchar den ena vägen ändå landar rätt.
    if (messageId && !byMessageId.has(messageId)) byMessageId.set(messageId, rep);
    if (signature && !bySignature.has(signature)) bySignature.set(signature, rep);
  }
  return result;
}

function deriveInitials(name) {
  const parts = String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return '?';
  return parts
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

/* Rollup-rader (kund med flera Graph-konversationer) bär en identitets-/
 * primärnyckel — enkelnyckel gav "0 meddelanden"/halva tråden. memberKeys
 * (rollup.underlyingConversationKeys från UI:t) unioneras därför in utöver
 * alias-matchningen. Läser enbart lokala truth-storen. */
/* Härleder klinik-mailbox-id (t.ex. kons@hairtpclinic.com) ur trådens lookup-
 * nycklar — mailboxen är alltid prefixet före första kolon. Används för att
 * scopa listMessages till RÄTT shard i stället för att ladda HELA storen (alla
 * shards, ~alla mejl) per request. Det senare spikade heapen > 4 GB (Render-OOM,
 * "Ran out of memory") för kontaktformulär-trådar med många memberKeys.
 * Kund-e-post som inte matchar en shard hoppas över av storen. */
function deriveMailboxIdsFromLookupKeys(keys = []) {
  const ids = new Set();
  for (const raw of asArray(keys)) {
    const key = normalizeText(raw);
    if (!key) continue;
    const colon = key.indexOf(':');
    const candidate = colon > 0 ? key.slice(0, colon) : key;
    if (/^[^\s:@]+@[^\s:@]+\.[^\s:@]+$/.test(candidate)) {
      ids.add(candidate.toLowerCase());
    }
  }
  return [...ids];
}

async function fetchSortedConversationMessages(store, key, memberKeys = [], options = {}) {
  if (!store || typeof store.listMessages !== 'function') return [];
  const safeMemberKeys = Array.isArray(memberKeys) ? memberKeys : [];
  const scopes = buildConversationLookupScopes([key, ...safeMemberKeys], options);
  if (!scopes.length) return [];
  // Scopa till trådens mailbox(ar) så bara relevant shard laddas — inte hela
  // storen. Nycklarna ger inte alltid ett mailbox-prefix (kontaktformulär/rollup);
  // då används klientens mailbox-hint (options.mailboxHints). Unionen är alltid en
  // delmängd av trådens egna mailboxar, så inga legitima meddelanden tappas. Utan
  // både prefix OCH hint faller vi tillbaka till allt (oförändrat beteende).
  const keyMailboxIds = deriveMailboxIdsFromLookupKeys([key, ...safeMemberKeys]);
  const hintMailboxIds = asArray(asObject(options).mailboxHints)
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
  // `mailboxIdsOverride` låter anroparen läsa EN brevlåda i taget. Används av
  // fetchConversationMessagesLoadingEachMailbox nedan, som måste kunna ladda
  // och läsa i samma steg — LRU-taket är 2, så en tredje laddning vräker ut
  // den första innan en samlad läsning ens börjar.
  const overrideMailboxIds = asArray(asObject(options).mailboxIdsOverride)
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
  const mailboxIds = overrideMailboxIds.length
    ? overrideMailboxIds
    : Array.from(new Set([...keyMailboxIds, ...hintMailboxIds]));
  const all = store.listMessages(mailboxIds.length ? { mailboxIds } : {});
  const matches = all.filter((m) => conversationMessageMatchesScopes(asObject(m), scopes));
  // ORD-98, fjärde och femte kodvägen: /summary, /booking-confirm och /draft
  // läste alla via den här funktionen utan att hydrera — samma avhuggna
  // bodyPreview matades rakt in i AI-sammanfattningen och utkasten.
  // Hydreringen sker HÄR, en gång, i stället för i varje anropsställe, så
  // ett nytt anrop inte kan glömma den — det var precis så de tre första
  // instanserna av samma bugg uppstod.
  const hydrated =
    typeof store.hydrateMessageBodies === 'function'
      ? await store.hydrateMessageBodies(matches)
      : matches;
  return [...hydrated].sort((a, b) => String(deriveTime(a)).localeCompare(String(deriveTime(b))));
}

/**
 * LADDA OCH LÄS PER BREVLÅDA, I SAMMA STEG.
 *
 * Första versionen laddade ALLA brevlådor i en loop och läste dem sedan i ett
 * svep. Med `maxLoadedShards = 2` vräks den första ut så snart en tredje
 * laddas — innan läsningen ens börjar. Alexander-fallet hade två brevlådor,
 * alltså precis under taket, och missade det helt.
 *
 * Rollup-trådar och kontaktformulär kan spänna över fler; det var där det
 * historiska OOM:et satt. Så det är just det fallet som behöver skyddet, och
 * just det fallet som inte prövades.
 *
 * Brevlåde-id:n härleds med `deriveMailboxIdsFromLookupKeys` — samma funktion
 * som läsningen redan använder. Två härledningar av samma sak är ett brutet
 * kontrakt även när båda råkar ge samma svar.
 */
async function fetchConversationMessagesLoadingEachMailbox(
  store,
  key,
  memberKeys = [],
  options = {}
) {
  if (!store || typeof store.listMessages !== 'function') return [];
  const safeMemberKeys = Array.isArray(memberKeys) ? memberKeys : [];
  const keyMailboxIds = deriveMailboxIdsFromLookupKeys([key, ...safeMemberKeys]);
  const hintMailboxIds = asArray(asObject(options).mailboxHints)
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
  const requestedMailboxIds = Array.from(new Set([...keyMailboxIds, ...hintMailboxIds]));

  // ALLOWLISTEN MÅSTE TÄCKA LADDNINGEN, INTE BARA LÄSNINGEN.
  //
  // `allowedMailboxIds` filtrerade ingestion-fallbacken men aldrig
  // truth-läsningen. Det var latent ofarligt så länge en olistad brevlåda
  // ändå var OLADDAD och därför svarade tomt — men laddningssteget ovan gör
  // bypassen verklig: en klient som namnger en brevlåda i `mailboxHints`
  // eller i nyckelprefixet skulle annars få den laddad OCH läst, oavsett
  // CCO-scope.
  //
  // En skyddsmekanism som vilar på att data råkar vara otillgänglig är ingen
  // skyddsmekanism. Den ska säga nej, inte tomt.
  const allowedMailboxIds = normalizeConfiguredMailboxIds(asObject(options).allowedMailboxIds);
  const mailboxIds = allowedMailboxIds.length
    ? requestedMailboxIds.filter((mailboxId) => allowedMailboxIds.includes(mailboxId))
    : requestedMailboxIds;

  // Utan brevlåde-id faller vi tillbaka på oförändrat beteende: läs allt som
  // råkar vara laddat. Att ladda "alla" här vore att gissa.
  if (!mailboxIds.length) {
    return fetchSortedConversationMessages(store, key, safeMemberKeys, options);
  }

  const seen = new Set();
  const merged = [];
  for (const mailboxId of mailboxIds) {
    if (typeof store.ensureMailboxLoaded === 'function') {
      try {
        await store.ensureMailboxLoaded(mailboxId);
      } catch (error) {
        console.warn('[cco-conversation] kunde inte ladda', mailboxId, error?.message);
        continue;
      }
    }
    const rows = await fetchSortedConversationMessages(store, key, safeMemberKeys, {
      ...options,
      mailboxIdsOverride: [mailboxId],
    });
    for (const row of rows) {
      const safe = asObject(row);
      // PRÖVA KOMPONENTERNA FÖRE SAMMANSLAGNINGEN.
      //
      // `\`...\` || fallback` kan aldrig nå fallbacken: en mall-sträng är
      // alltid sann, även när den bara är ":". Saknar ett meddelande både
      // mailboxId och id blir nyckeln ":" — delad av VARJE sådant meddelande
      // från vilken brevlåda som helst, så det andra och alla följande
      // kastades tyst som "redan sett".
      //
      // Samma familj som `??` mot `||` i ORD-85: en operator som ser lyckad ut
      // men prövar fel sak. Skillnaden är att `||` här inte ens KAN falla ut.
      const hasIdentity = Boolean(safe.mailboxId || safe.graphMessageId || safe.id);
      const dedupeKey = hasIdentity
        ? `${normalizeEmail(safe.mailboxId)}:${normalizeText(safe.graphMessageId || safe.id)}`
        : JSON.stringify(safe);
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      merged.push(row);
    }
  }
  return merged.sort((a, b) => String(deriveTime(a)).localeCompare(String(deriveTime(b))));
}

function toConversationMessageFromRaw(raw = {}) {
  const safe = asObject(raw);
  const rawJson = asObject(safe.rawJson);
  const mailDocument = asObject(safe.mailDocument);
  const fromEmail =
    normalizeText(safe.fromEmail) ||
    normalizeText(safe.fromAddress) ||
    normalizeText(asObject(safe.from).address) ||
    normalizeText(asObject(asObject(rawJson.from).emailAddress).address);
  const fromName =
    normalizeText(safe.fromName) ||
    normalizeText(asObject(safe.from).name) ||
    normalizeText(asObject(asObject(rawJson.from).emailAddress).name) ||
    fromEmail;
  const toAddresses = Array.isArray(safe.toAddresses)
    ? safe.toAddresses
    : safe.to || rawJson.toRecipients || [];
  const mailboxId = firstNormalizedText(
    safe.mailboxId,
    safe.mailboxAddress,
    safe.userPrincipalName,
    mailDocument.mailboxId,
    mailDocument.mailboxAddress,
    rawJson.mailboxId,
    rawJson.mailboxAddress,
    rawJson.userPrincipalName
  );
  const conversationId = firstNormalizedText(
    safe.conversationId,
    mailDocument.conversationId,
    rawJson.conversationId
  );
  const graphMessageId = firstNormalizedText(
    safe.graphMessageId,
    safe.immutableGraphId,
    safe.messageId,
    safe.rawMessageId,
    safe.id,
    mailDocument.graphMessageId,
    mailDocument.messageId,
    mailDocument.internetMessageId,
    mailDocument.id,
    rawJson.graphMessageId,
    rawJson.immutableGraphId,
    rawJson.immutableId,
    rawJson.messageId,
    rawJson.rawMessageId,
    rawJson.internetMessageId,
    rawJson.id
  );
  const mailboxConversationId = firstNormalizedText(
    safe.mailboxConversationId,
    mailDocument.mailboxConversationId,
    rawJson.mailboxConversationId,
    conversationId
  );
  const bodyText = deriveBody(safe);
  const bodyHtml = deriveBodyHtml(safe);
  return {
    ...safe,
    graphMessageId,
    messageId: graphMessageId,
    conversationId,
    mailboxConversationId,
    mailboxId,
    mailboxAddress: firstNormalizedText(safe.mailboxAddress, safe.mailboxId, mailboxId),
    folderType: normalizeText(safe.folderType) || 'unknown',
    senderEmail: fromEmail,
    fromAddress: fromEmail,
    from: { name: fromName, address: fromEmail },
    sentAt:
      normalizeText(safe.sentAt) ||
      normalizeText(safe.sentDateTime) ||
      normalizeText(safe.receivedAt) ||
      normalizeText(safe.receivedDateTime) ||
      normalizeText(safe.persistedAt),
    receivedAt:
      normalizeText(safe.receivedAt) ||
      normalizeText(safe.receivedDateTime) ||
      normalizeText(rawJson.receivedDateTime) ||
      normalizeText(safe.persistedAt),
    bodyText,
    body_text: bodyText,
    text: bodyText,
    bodyHtml: bodyHtml || null,
    body_html: bodyHtml || null,
    html: bodyHtml || null,
    attachments: collectConversationAttachments(safe),
    toRecipients: asArray(toAddresses)
      .map((address) => {
        const item = asObject(address);
        return {
          address:
            normalizeText(address) ||
            normalizeText(item.address) ||
            normalizeText(asObject(item.emailAddress).address),
        };
      })
      .filter((item) => item.address),
  };
}

// Läs råmeddelanden UTAN att djup-klona hela ingestion-staten. store.getState()
// klonar hela storen (varje råmeddelande bär rawJson = hela mailkroppen) per
// anrop — på den heta messages-vägen räckte det för att spika heapen > RAM och
// trigga OOM. Föredra den icke-klonande listRawMessages() när den finns; faller
// tillbaka till getState() för äldre store-instanser (t.ex. i test).
function readIngestionRawMessages(store) {
  if (!store) return [];
  if (typeof store.listRawMessages === 'function') {
    return asArray(store.listRawMessages());
  }
  if (typeof store.getState === 'function') {
    return Object.values(asObject(asObject(store.getState()).mailRawMessages));
  }
  return [];
}

function storeCanReadIngestion(store) {
  return Boolean(
    store && (typeof store.listRawMessages === 'function' || typeof store.getState === 'function')
  );
}

function fetchSortedIngestionConversationMessages(store, key, options = {}) {
  if (!storeCanReadIngestion(store)) return [];
  const scopes = buildConversationLookupScopes([key], options);
  if (!scopes.length) return [];
  const allowedMailboxIds = normalizeConfiguredMailboxIds(asObject(options).allowedMailboxIds);
  const rawMessages = allowedMailboxIds.length
    ? readScopedIngestionConversationMessages(store, new Set(allowedMailboxIds), {
        excludeUnscoped: true,
      })
    : readIngestionRawMessages(store).map(toConversationMessageFromRaw);
  const matches = rawMessages.filter((message) =>
    conversationMessageMatchesScopes(message, scopes)
  );
  return [...matches].sort((a, b) => String(deriveTime(a)).localeCompare(String(deriveTime(b))));
}

function fetchSortedIngestionConversationMessagesForKeys(store, keys = [], options = {}) {
  if (!storeCanReadIngestion(store)) return [];
  const safeKeys = Array.from(
    new Set(
      asArray(keys)
        .map((key) => normalizeText(key))
        .filter(Boolean)
    )
  );
  const scopes = buildConversationLookupScopes(safeKeys, options);
  if (!scopes.length) return [];
  const allowedMailboxIds = normalizeConfiguredMailboxIds(asObject(options).allowedMailboxIds);
  const rawMessages = allowedMailboxIds.length
    ? readScopedIngestionConversationMessages(store, new Set(allowedMailboxIds), {
        excludeUnscoped: true,
      })
    : readIngestionRawMessages(store).map(toConversationMessageFromRaw);
  const matches = rawMessages.filter((message) =>
    conversationMessageMatchesScopes(message, scopes)
  );
  return dedupeConversationMessages(matches).sort((a, b) =>
    String(deriveTime(a)).localeCompare(String(deriveTime(b)))
  );
}

// Härled trådens mailbox(ar) ur truth-meddelandena så ingestion-läsningen kan
// scopas till rätt shard i stället för att svepa hela korpusen.
function deriveMailboxIdsFromConversationMessages(messages = []) {
  const ids = new Set();
  for (const message of asArray(messages)) {
    const mailbox = deriveMailboxForMatch(message);
    if (mailbox) ids.add(mailbox);
  }
  return ids;
}

// Läs + mappa ingestion-råmeddelanden EN gång, scopat till angivna mailbox(ar).
// Råmeddelanden utan mailbox tas alltid med (säkerhet). Ersätter de tidigare
// hela-korpus-passen som körde per trådöppning.
function readScopedIngestionConversationMessages(
  store,
  mailboxIds = null,
  { excludeUnscoped = false } = {}
) {
  if (!storeCanReadIngestion(store)) return [];
  const scope = mailboxIds instanceof Set && mailboxIds.size ? mailboxIds : null;
  const out = [];
  for (const raw of readIngestionRawMessages(store)) {
    if (scope) {
      const mailbox = deriveMailboxForMatch(raw);
      if (!mailbox && excludeUnscoped) continue;
      if (mailbox && !scope.has(mailbox)) continue;
    }
    out.push(toConversationMessageFromRaw(raw));
  }
  return out;
}

function buildIngestionAliasLookup(conversationMessages = []) {
  const lookup = new Map();
  for (const message of conversationMessages) {
    buildConversationAliases(message).forEach((alias) => {
      if (alias && !lookup.has(alias)) lookup.set(alias, message);
    });
  }
  return lookup;
}

function bodyTextLooksLikePreview(text = '', preview = '') {
  const safeText = normalizeBodyText(text);
  const safePreview = normalizeBodyText(preview);
  if (!safeText || !safePreview) return false;
  if (safeText.length > safePreview.length + 12) return false;
  return safePreview.startsWith(safeText.slice(0, Math.min(24, safeText.length)));
}

function chooseRicherHtml(existing = '', candidate = '') {
  const safeExisting = normalizeText(existing);
  const safeCandidate = normalizeText(candidate);
  if (!safeExisting) return safeCandidate;
  if (!safeCandidate) return safeExisting;
  const existingTextLength = normalizeBodyText(extractTextFromHtml(safeExisting)).length;
  const candidateTextLength = normalizeBodyText(extractTextFromHtml(safeCandidate)).length;
  if (candidateTextLength > existingTextLength + 24) return safeCandidate;
  return safeExisting;
}

function isIncompleteMailHtml(value = '') {
  const html = normalizeText(value);
  if (!html) return false;
  // Graph/truth can contain a document shell that was cut off during an older
  // ingestion pass. In that case the local ingestion copy is the safer rich
  // source, provided it is complete.
  if (/<(?:html|body)\b/i.test(html) && !/<\/(?:html|body)>/i.test(html)) return true;
  return /<img\b[^>]*\bsrc\s*=\s*["'][^"']*$/i.test(html);
}

function chooseRuntimeMailHtml(canonical = '', fallback = '') {
  const safeCanonical = normalizeText(canonical);
  const safeFallback = normalizeText(fallback);
  if (!safeCanonical) return safeFallback;
  if (!safeFallback) return safeCanonical;
  if (isIncompleteMailHtml(safeCanonical) && !isIncompleteMailHtml(safeFallback)) {
    return safeFallback;
  }
  return safeCanonical;
}

// Truth-storen är den kanoniska lokala kopian. När den redan har en hel HTML-
// kropp och ett verkligt meddelandeinnehåll finns inget att vinna på att även
// synkront svepa rå-ingestionen. Det svepet är den dyra delen av trådöppning.
// Äldre/tunna poster fortsätter däremot exakt som tidigare genom samma
// ingestion-fidelity-väg, så vi tappar inte signaturer eller inline-assets.
function messageNeedsIngestionEnrichment(message = {}) {
  const safe = asObject(message);
  const preview =
    normalizeText(safe.bodyPreview) || normalizeText(safe.preview) || normalizeText(safe.snippet);
  const bodyText = deriveBody(safe);
  const bodyHtml = boundRuntimeBodyHtml(deriveBodyHtml(safe));
  if (!bodyText || bodyTextLooksLikePreview(bodyText, preview)) return true;
  if (!bodyHtml || isIncompleteMailHtml(bodyHtml)) return true;

  // Ett cid i den kanoniska HTML-kroppen måste ha en lokal tillgång. Saknas den
  // får den befintliga berikningen försöka komplettera från ingestion.
  const attachmentContentIds = new Set(
    collectConversationAttachments(safe)
      .map((attachment) => normalizeContentId(attachment.contentId))
      .filter(Boolean)
  );
  for (const match of bodyHtml.matchAll(/\bcid:([^\s"'>]+)/gi)) {
    if (!attachmentContentIds.has(normalizeContentId(match[1]))) return true;
  }
  return false;
}

// Inline data-images are removed or rebound to local asset URLs before this
// response is built. Keep the existing rich-mail budget so signature text
// following a large GIF/logo is not cut off at the old 24k boundary.
const MAX_RUNTIME_BODY_HTML_CHARS = 240000;

function boundRuntimeBodyHtml(value = '') {
  let html = normalizeText(value);
  if (!html) return '';
  // A legacy ingestion row can contain a truncated data-URI image. Remove that
  // unsafe payload before bounding the response; new truth rows use local CID
  // assets and therefore keep the actual image without inflating the JSON.
  if (html.length > MAX_RUNTIME_BODY_HTML_CHARS && /data:image\//i.test(html)) {
    html = html.replace(/data:image\/[^;,]+;base64,[^"')\s>]+/gi, 'about:blank');
  }
  // Older truth rows may already have been truncated inside an <img> src.
  // Close that final tag after removing the oversized payload so the image can
  // be rebound to its local cached asset below.
  const lastImageStart = html.toLowerCase().lastIndexOf('<img');
  if (lastImageStart >= 0 && html.lastIndexOf('>') < lastImageStart) html += '">';
  return html.slice(0, MAX_RUNTIME_BODY_HTML_CHARS);
}

function deriveMailboxForMatch(message = {}) {
  const safe = asObject(message);
  const rawJson = asObject(safe.rawJson);
  const mailDocument = asObject(safe.mailDocument);
  return normalizeEmail(
    safe.mailboxId ||
      safe.mailboxAddress ||
      safe.userPrincipalName ||
      mailDocument.mailboxId ||
      mailDocument.mailboxAddress ||
      rawJson.mailboxId ||
      rawJson.mailboxAddress ||
      rawJson.userPrincipalName
  );
}

function bodyTextsOverlapForFallback(left = '', right = '') {
  const a = normalizeBodyText(left);
  const b = normalizeBodyText(right);
  if (!a || !b) return false;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  const probe = shorter.slice(0, Math.min(96, Math.max(32, shorter.length)));
  return probe.length >= 24 && longer.includes(probe);
}

function deriveScopedIngestionFallbackScope(options = {}) {
  const safe = asObject(options);
  const email = normalizeEmail(safe.contactEmail || safe.email || safe.customerEmail);
  const reference = normalizeText(safe.contactReference || safe.reference);
  if (!email && !reference) return null;
  return { email, reference };
}

function findScopedIngestionFallback(message = {}, rawMessages = [], options = {}) {
  const scope = deriveScopedIngestionFallbackScope(options);
  if (!scope) return null;
  const mailbox = deriveMailboxForMatch(message);
  const messageBody = deriveBody(message);
  const preview =
    normalizeText(message.bodyPreview) ||
    normalizeText(message.preview) ||
    normalizeText(message.snippet) ||
    messageBody;
  const subject = normalizeText(message.subject);
  const time = normalizeText(deriveTime(message));
  const candidates = rawMessages
    .filter((raw) => {
      const rawMailbox = deriveMailboxForMatch(raw);
      if (mailbox && rawMailbox && rawMailbox !== mailbox) return false;
      if (!messageMatchesContactFormScope(raw, scope)) return false;
      const rawBody = deriveBody(raw);
      const rawSubject = normalizeText(raw.subject);
      const rawTime = normalizeText(deriveTime(raw));
      return (
        bodyTextsOverlapForFallback(messageBody, rawBody) ||
        bodyTextsOverlapForFallback(preview, rawBody) ||
        (subject && rawSubject && subject === rawSubject) ||
        (time && rawTime && time === rawTime)
      );
    })
    .map((raw) => ({
      raw,
      score:
        normalizeBodyText(deriveBody(raw)).length +
        (normalizeText(deriveTime(raw)) === time ? 1000 : 0) +
        (normalizeText(raw.subject) === subject ? 500 : 0),
    }))
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.raw || null;
}

function enrichConversationMessagesWithIngestion(messages, store, options = {}) {
  if (!storeCanReadIngestion(store)) return messages;
  if (!asArray(messages).some((message) => messageNeedsIngestionEnrichment(message))) {
    return messages;
  }
  // Scopa ingestion-läsningen till trådens mailbox(ar) och läs korpusen EN gång.
  // Tidigare byggdes lookup + fallback över HELA ingestion-korpusen (två fulla
  // pass + en O(M×N)-fallback) per trådöppning — synkront på event-loopen. Med
  // en stor korpus blev det sekunders block ("Laddar från CCO-pipelinen" hängde
  // ~30s). Peak-arbetet blir nu trådens shard, inte hela storen.
  const configuredMailboxIds = normalizeConfiguredMailboxIds(asObject(options).allowedMailboxIds);
  const mailboxIds = configuredMailboxIds.length
    ? configuredMailboxIds
    : deriveMailboxIdsFromConversationMessages(messages);
  const rawMessages = readScopedIngestionConversationMessages(store, new Set(mailboxIds), {
    excludeUnscoped: configuredMailboxIds.length > 0,
  });
  if (!rawMessages.length) return messages;
  const lookup = buildIngestionAliasLookup(rawMessages);
  const fallbackScope = deriveScopedIngestionFallbackScope(options);
  return messages.map((message) => {
    const rawFromAlias = [...buildConversationAliases(message)]
      .map((alias) => lookup.get(alias))
      .find((candidate) => {
        if (!candidate) return false;
        if (!fallbackScope) return true;
        return messageMatchesContactFormScope(candidate, fallbackScope);
      });
    const raw = rawFromAlias || findScopedIngestionFallback(message, rawMessages, options);
    if (!raw) return message;
    const preview =
      normalizeText(message.bodyPreview) ||
      normalizeText(message.preview) ||
      normalizeText(message.snippet) ||
      normalizeText(raw.bodyPreview) ||
      normalizeText(raw.preview) ||
      normalizeText(raw.snippet);
    const messageBodyText = deriveBody(message);
    const rawBodyText = deriveBody(raw);
    const mergedBodyText = chooseRicherBodyText(messageBodyText, rawBodyText, preview);
    const messageBodyHtml = boundRuntimeBodyHtml(deriveBodyHtml(message));
    const rawBodyHtml = boundRuntimeBodyHtml(deriveBodyHtml(raw));
    // Truth is canonical. If that copy is structurally truncated, use the
    // complete local ingestion copy instead; never fall back merely because it
    // is longer or contains legacy base64.
    const mergedBodyHtml = chooseRuntimeMailHtml(messageBodyHtml, rawBodyHtml);
    const mergedAttachments = mergeConversationAttachments(message, raw);
    return {
      ...message,
      bodyText: mergedBodyText || chooseRicherBodyText(message.bodyText, raw.bodyText, preview),
      body_text: mergedBodyText || chooseRicherBodyText(message.body_text, raw.body_text, preview),
      bodyHtml: mergedBodyHtml || null,
      body_html: mergedBodyHtml || null,
      html:
        mergedBodyHtml ||
        boundRuntimeBodyHtml(normalizeText(message.html) || normalizeText(raw.html)) ||
        null,
      text: mergedBodyText || chooseRicherBodyText(message.text, raw.text, preview),
      attachments: mergedAttachments,
      rawJson: objectHasKeys(message.rawJson) ? message.rawJson : raw.rawJson,
      mailDocument: objectHasKeys(message.mailDocument) ? message.mailDocument : raw.mailDocument,
      body: objectHasKeys(message.body) ? message.body : raw.body,
      bodyPreview: normalizeText(message.bodyPreview) || normalizeText(raw.bodyPreview),
      preview: normalizeText(message.preview) || normalizeText(raw.preview),
      snippet: normalizeText(message.snippet) || normalizeText(raw.snippet),
    };
  });
}

// ── D1: bulk preview→confirm ────────────────────────────────────────────────
// Systemmail/brus-avsändare får aldrig bulk-behandlas (och ska inte påverka
// needsReply). Samma taxonomi som ccoConversationThreadStore.
const BULK_SYSTEM_SENDER_PATTERN =
  /^(no.?reply|donot.?reply|bounce|postmaster|mailer-daemon|notifications?|auto.?reply|marketing|newsletter)@/i;

function deriveConversationCustomerEmail(msg) {
  const m = asObject(msg);
  return (
    normalizeText(asObject(m.from).emailAddress?.address) ||
    normalizeText(m.senderEmail) ||
    normalizeText(m.fromAddress)
  ).toLowerCase();
}

// En tråd är bulk-behörig endast om den har en BEKRÄFTAD kanonisk kundidentitet
// (matchStatus MATCHED). conflict/suggested/unmatched saknar detta och blockas.
function threadHasConfirmedIdentity(sorted) {
  return sorted.some((m) => {
    const identity = asObject(asObject(m).customerIdentity || asObject(m).identity);
    const matchStatus = normalizeText(
      asObject(identity.identityProvenance).matchStatus
    ).toUpperCase();
    return Boolean(normalizeText(identity.canonicalCustomerId)) && matchStatus === 'MATCHED';
  });
}

// Ren utvärdering (INGEN mutation): returnerar exakt vad som skulle påverkas +
// varningar per tråd. Används av både preview och confirm (confirm re-validerar
// alltid — klienten litas aldrig på).
async function evaluateConversationBulkItem(store, item, action, options = {}) {
  const conversationKey = normalizeText(asObject(item).conversationKey);
  const customerId = normalizeText(asObject(item).customerId).toLowerCase();
  const row = {
    conversationKey: conversationKey || null,
    customerId: customerId || null,
    action,
    mailbox: null,
    customerName: null,
    eligible: false,
    warnings: [],
  };
  if (!conversationKey) {
    row.warnings.push('missing_conversation_key');
    return row;
  }
  if (!customerId) {
    row.warnings.push('missing_customer_id');
    return row;
  }
  // Samma resolution som single-action-routen: mailbox-truth först, sedan
  // mail-ingestion-storen (web-form-/ingesterade trådar ligger inte i truth-storen).
  const { ingestionStore = null, scopeOptions = {} } = asObject(options);
  let sorted = await fetchSortedConversationMessages(store, conversationKey, [], scopeOptions);
  if (sorted.length === 0 && ingestionStore) {
    sorted = fetchSortedIngestionConversationMessagesForKeys(
      ingestionStore,
      [conversationKey],
      scopeOptions
    );
  }
  if (sorted.length === 0) {
    row.warnings.push('conversation_not_found');
    return row;
  }
  const firstMsg = sorted.find((m) => deriveDir(asObject(m).folderType) === 'inbound') || sorted[0];
  row.mailbox = normalizeText(asObject(firstMsg).mailboxId).toLowerCase() || null;
  row.customerName = deriveFromName(firstMsg) || null;
  const conversationCustomerId = deriveConversationCustomerEmail(firstMsg);
  if (BULK_SYSTEM_SENDER_PATTERN.test(conversationCustomerId)) {
    row.warnings.push('system_mail');
    return row;
  }
  if (conversationCustomerId && customerId !== conversationCustomerId) {
    row.warnings.push('customer_mismatch');
    return row;
  }
  if (!threadHasConfirmedIdentity(sorted)) {
    // conflict / suggested / unmatched → aldrig bulk
    row.warnings.push('unconfirmed_identity');
    return row;
  }
  row.eligible = true;
  return row;
}

// Delad state-mutation för en enskild tråd (återanvänds av bulk-confirm).
// Auditar INTE — anroparen loggar (bulk loggar en batch-post).
async function applyConversationActionState({
  ccoConversationStateStore,
  tenantId,
  key,
  action,
  note = '',
  followUpDueAt = null,
  sorted = [],
  actorUserId = '',
  actorEmail = '',
}) {
  if (action === 'reopen') {
    if (typeof ccoConversationStateStore.supersedeConversationState !== 'function') {
      throw new Error('supersede_unavailable');
    }
    const state = await ccoConversationStateStore.supersedeConversationState({
      tenantId,
      canonicalConversationKey: key,
      supersededReason: 'manual_clear',
    });
    return { state: state || null, actionAt: new Date().toISOString(), followUpDueAt: null };
  }
  const firstMessage = asObject(sorted[0] || {});
  const underlyingMailboxIds = sorted
    .map((m) => normalizeText(asObject(m).mailboxId))
    .filter(Boolean);
  const underlyingConversationIds = sorted
    .map((m) => normalizeText(asObject(m).conversationId))
    .filter(Boolean);
  const primaryConversationId =
    normalizeText(firstMessage.conversationId) || normalizeText(firstMessage.mailboxConversationId);
  let resolvedFollowUp = null;
  if (action === 'reply_later') {
    resolvedFollowUp =
      followUpDueAt && !Number.isNaN(Date.parse(followUpDueAt))
        ? new Date(Date.parse(followUpDueAt)).toISOString()
        : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  }
  const actionAt = new Date().toISOString();
  const state = await ccoConversationStateStore.writeConversationState({
    tenantId,
    canonicalConversationKey: key,
    canonicalConversationSource: 'mailbox_conversation_fallback',
    canonicalConversationType: 'conversationKey',
    primaryConversationId: primaryConversationId || null,
    underlyingConversationIds: [...new Set(underlyingConversationIds)],
    underlyingMailboxIds: [...new Set(underlyingMailboxIds.map((id) => id.toLowerCase()))],
    actionState: action,
    needsReplyStatusOverride: action === 'handled' ? 'handled' : 'needs_reply',
    followUpDueAt: resolvedFollowUp,
    waitingOn: action === 'reply_later' ? 'customer' : null,
    nextActionLabel: action === 'handled' ? 'Markerad som klar' : 'Påminnelse senare',
    nextActionSummary: note || null,
    actionAt,
    actionByUserId: actorUserId || null,
    actionByEmail: actorEmail || null,
  });
  return { state: state || null, actionAt, followUpDueAt: resolvedFollowUp };
}

// Mappa lagrade meddelanden → SummarizeThread input-shape
async function safeAuditConversation(authStore, event) {
  if (!authStore || typeof authStore.addAuditEvent !== 'function') return;
  await authStore.addAuditEvent(event);
}

function normalizeConfiguredMailboxIds(mailboxIds = []) {
  return Array.from(
    new Set(
      asArray(mailboxIds)
        .map((mailboxId) => normalizeEmail(mailboxId))
        .filter(Boolean)
    )
  );
}

function createMailboxScopedTruthStore(store, mailboxIds = []) {
  const allowedMailboxIds = normalizeConfiguredMailboxIds(mailboxIds);
  if (!store || typeof store.listMessages !== 'function' || allowedMailboxIds.length === 0) {
    return store;
  }

  const allowedMailboxIdSet = new Set(allowedMailboxIds);
  const scopedStore = Object.create(store);
  scopedStore.listMessages = (options = {}) => {
    const safeOptions = asObject(options);
    const hasMailboxScope = Object.prototype.hasOwnProperty.call(safeOptions, 'mailboxIds');
    const requestedMailboxIds = normalizeConfiguredMailboxIds(safeOptions.mailboxIds);
    const scopedMailboxIds = hasMailboxScope
      ? requestedMailboxIds.filter((mailboxId) => allowedMailboxIdSet.has(mailboxId))
      : allowedMailboxIds;
    // An empty mailboxIds array means "all mailboxes" to the backing store.
    // Return no rows instead when a caller explicitly requested only off-scope
    // mailboxes, so an invalid hint can never widen a read.
    if (hasMailboxScope && scopedMailboxIds.length === 0) return [];
    return store.listMessages({ ...safeOptions, mailboxIds: scopedMailboxIds });
  };
  return scopedStore;
}

function createTenantScopeMiddleware(tenantScopeId = '') {
  const expectedTenantId = normalizeText(tenantScopeId).toLowerCase();
  return (req, res, next) => {
    if (!expectedTenantId) return next();
    const actualTenantId = normalizeText(req.auth?.tenantId).toLowerCase();
    if (actualTenantId === expectedTenantId) return next();
    return res.status(403).json({
      error: 'tenant_scope_forbidden',
      detail: 'CCO-konversationer kan bara lasas inom den aktiva klinikens tenant.',
    });
  };
}

function createCcoConversationRouter({
  ccoMailboxTruthStore: rawCcoMailboxTruthStore,
  mailIngestionStore = null,
  requireAuth,
  openai = null,
  openaiModel = '',
  graphSendConnector = null,
  graphReadConnector = null,
  // E1 steg 1 — shadow/dry-run. När true körs hela reply-flödet (validering,
  // mottagar- och metadata-upplösning) men själva Graph-sändningen hoppas över:
  // endpointen returnerar det som SKULLE skickats (wouldSend) och loggar det,
  // utan att röra graphSendConnector. Säkert att slå på i skarp miljö — inget
  // mejl går ut. Skarpt utskick kräver fortfarande shadow=false + connector.
  shadowSendEnabled = false,
  // E1 steg 2 — skarpt utskick omdirigerat till en ägar-testadress. När satt
  // (och shadow är av) sker en RIKTIG Graph-sändning, men mottagaren tvingas
  // till denna adress oavsett kundens adress. Ingen riktig kund kan nås i det
  // här läget — det är till för att verifiera skarp sändning end-to-end mot en
  // adress ägaren själv kontrollerar. Full live till kund kräver att detta är
  // tomt (och separat GO).
  sendTestRecipient = '',
  runtimeStreamRouter = null,
  mailboxIdsForSync = [],
  // Manuell Graph-sync får aldrig ärva runtime-listan, eftersom den även kan
  // innehålla externa IMAP-mailboxar. Servern skickar därför in en separat
  // Graph-allowlist som är den enda default- och request-scopen för denna route.
  graphMailboxIdsForSync = [],
  mailboxRuntimeStatusProvider = null,
  syncLookbackDays = 14,
  ccoConversationStateStore = null,
  ccoConversationNotesStore = null,
  ccoMailTemplateStore = null,
  clientoBookingStore = null,
  postSendMailboxSync = null,
  manualGraphBackfillRunner = null,
  defaultTenantId = 'cco',
  tenantScopeId = '',
  authStore = null,
} = {}) {
  const router = express.Router();
  const authMiddleware =
    typeof requireAuth === 'function' ? requireAuth : (_req, _res, next) => next();
  const configuredMailboxIds = normalizeConfiguredMailboxIds(mailboxIdsForSync);
  const configuredGraphMailboxIds = normalizeConfiguredMailboxIds(graphMailboxIdsForSync);
  const configuredGraphMailboxIdSet = new Set(configuredGraphMailboxIds);
  const runManualGraphBackfill =
    typeof manualGraphBackfillRunner === 'function'
      ? manualGraphBackfillRunner
      : async (input) => {
          const { runGraphBackfill } = require('../ops/bootstrapRunner');
          return runGraphBackfill(input);
        };
  const ccoMailboxTruthStore = createMailboxScopedTruthStore(
    rawCcoMailboxTruthStore,
    configuredMailboxIds
  );
  const requireTenantScope = createTenantScopeMiddleware(tenantScopeId);

  // The conversation store is shared at process level. All direct conversation
  // routes must therefore carry the verified tenant fence before any local data
  // is read; individual routes retain their existing permission checks below.
  router.use('/cco/runtime/conversation', authMiddleware, requireTenantScope);

  router.get(
    '/cco/runtime/conversation/:key/messages',
    authMiddleware,
    requirePermission('mail.read'),
    async (req, res) => {
      try {
        if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.listMessages !== 'function') {
          return res.status(503).json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) {
          return res.status(400).json({ ok: false, error: 'missing_conversation_key' });
        }
        // Rollup-rader: UI:t skickar med medlemsnycklarna (underlyingConversationKeys)
        // så hela kundtråden hämtas ur lokala truth-storen i ett svep.
        // Äldre klienter/tester kan fortfarande skicka aliases; de unioneras in här.
        const memberKeys = parseConversationMemberKeysQuery(req.query);
        const lookupKeys = [key, ...memberKeys];
        const contactScope = parseConversationContactScopeQuery(req.query);
        const mailboxHints = parseConversationMailboxHintQuery(req.query);
        // Mailbox-hinten scopar truth-läsningen till trådens shard även när nyckeln
        // saknar mailbox-prefix — undviker att läsa alla shards per trådöppning.
        const scopeOptions = {
          ...contactScope,
          ...(mailboxHints.length ? { mailboxHints } : {}),
          ...(configuredMailboxIds.length ? { allowedMailboxIds: configuredMailboxIds } : {}),
        };
        // Lättviktig fas-timing (diagnostik) för att lokalisera trådöppnings-
        // latensen. hrtime → ms med 1 decimal. Klienten loggar server- vs nätverks-
        // tid från timings-fältet nedan.
        const tStart = process.hrtime.bigint();
        // ORD-97: laddar och läser per brevlåda i samma steg — se
        // fetchConversationMessagesLoadingEachMailbox.
        const truthMessages = await fetchConversationMessagesLoadingEachMailbox(
          ccoMailboxTruthStore,
          key,
          memberKeys,
          scopeOptions
        );
        const tTruth = process.hrtime.bigint();
        // ORD-98: brödtexten hydreras nu INUTI fetchSortedConversationMessages
        // (via fetchConversationMessagesLoadingEachMailbox ovan), en gång, i
        // stället för här igen ovanpå en redan hydrerad lista. Efter ORD-89
        // ligger brödtexten i sidofiler och shardens fält är tomt — utan
        // hydreringen faller `deriveBodyHtml`/`deriveBody` tillbaka på
        // `bodyPreview` (capad till 500 tecken) och operatören ser en
        // avhuggen skiva av mejlet i stället för hela.
        const sorted = truthMessages.length
          ? enrichConversationMessagesWithIngestion(truthMessages, mailIngestionStore, scopeOptions)
          : fetchSortedIngestionConversationMessagesForKeys(
              mailIngestionStore,
              lookupKeys,
              scopeOptions
            );
        const tEnrich = process.hrtime.bigint();
        const messages = sorted.map((m) => {
          const safe = asObject(m);
          const from = deriveFromName(safe);
          const senderEmail = deriveSenderEmail(safe);
          const mailboxId = normalizeText(safe.mailboxId) || null;
          const mailboxAddress = normalizeText(safe.mailboxAddress) || mailboxId;
          const attachments = collectConversationAttachments(safe);
          const displayBody = deriveDisplayMailBody(safe);
          const boundedBodyHtml = boundRuntimeBodyHtml(displayBody.html);
          const bodyHtml = rewriteMailCidImageSources(boundedBodyHtml, attachments);
          const derivedBodyText = displayBody.text;
          const bodyText =
            (derivedBodyText.length > 50000 ||
              /<img\b[^>]*(?:data:image|about:blank)/i.test(derivedBodyText)) &&
            bodyHtml
              ? extractTextFromHtml(boundedBodyHtml)
              : derivedBodyText;
          const bodyPreview =
            normalizeText(safe.bodyPreview) ||
            normalizeText(safe.preview) ||
            normalizeText(safe.snippet) ||
            normalizeText(asObject(safe.rawJson).bodyPreview);
          return {
            id: normalizeText(safe.graphMessageId) || normalizeText(safe.messageId) || null,
            from,
            senderEmail: senderEmail || null,
            fromEmail: senderEmail || null,
            initials: deriveInitials(from),
            dir: deriveDir(safe.folderType),
            time: deriveTime(safe),
            body: bodyText,
            bodyText,
            body_text: bodyText,
            text: bodyText,
            bodyHtml: bodyHtml || null,
            body_html: bodyHtml || null,
            html: bodyHtml || null,
            bodyPreview: bodyPreview || null,
            preview: bodyPreview || null,
            subject: normalizeText(safe.subject) || null,
            internetMessageId: deriveInternetMessageId(safe) || null,
            // Faktisk ankomsttid (när mailet landade i inkorgen) för dubblett-
            // spåret — skiljer sig från time/sentAt (när formuläret skickade).
            receivedAt: normalizeText(safe.receivedAt) || null,
            mailboxId,
            mailboxAddress: mailboxAddress || null,
            folderType: normalizeText(safe.folderType) || null,
            hasAttachments: attachments.length > 0,
            attachments,
          };
        });
        // Fäll ihop identiska kopior (samma mail levererat/lagrat flera gånger) till
        // ett meddelande. Varje behållet meddelande bär duplicateCount + duplicates[]
        // så klienten kan markera "mottogs N ggr" med när/var. Äkta separata mail
        // (olika Message-ID/innehåll) rörs inte.
        const collapsedMessages = collapseDuplicateMessages(messages);
        const totalCount = collapsedMessages.length;
        const { limit, offset } = parsePagination(req.query);
        const paginatedMessages =
          limit === null ? collapsedMessages : collapsedMessages.slice(offset, offset + limit);
        const tMap = process.hrtime.bigint();
        const toMs = (a, b) => Math.round((Number(b - a) / 1e6) * 10) / 10;
        return res.json({
          ok: true,
          conversationKey: key,
          messageCount: paginatedMessages.length,
          totalMessageCount: totalCount,
          messages: paginatedMessages,
          pagination: {
            limit,
            offset,
            totalCount,
            returnedCount: paginatedMessages.length,
            hasMore: limit !== null && offset + paginatedMessages.length < totalCount,
          },
          timings: {
            truthMs: toMs(tStart, tTruth),
            enrichMs: toMs(tTruth, tEnrich),
            mapMs: toMs(tEnrich, tMap),
            totalMs: toMs(tStart, tMap),
            usedIngestionFallback: truthMessages.length === 0,
            truthCount: truthMessages.length,
          },
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'internal_error',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- AI-summary + nextBestAction -----
  // GET /cco/runtime/conversation/:key/summary
  // Kör SummarizeThread-capabilityn på trådens meddelanden och returnerar
  // headline + bullets + nextBestAction + sentiment + intent. Frontend kan
  // använda detta för att fylla AI-summary-blocket samt risk/nästa-steg.
  router.get(
    '/cco/runtime/conversation/:key/summary',
    authMiddleware,
    requirePermission('mail.read'),
    async (req, res) => {
      try {
        if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.listMessages !== 'function') {
          return res.status(503).json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) {
          return res.status(400).json({ ok: false, error: 'missing_conversation_key' });
        }
        const sorted = await fetchSortedConversationMessages(ccoMailboxTruthStore, key);
        if (sorted.length === 0) {
          return res.json({
            ok: true,
            conversationKey: key,
            summary: null,
            note: 'no_messages',
          });
        }
        // Härled customerName + subject från första inkommande meddelandet
        const firstInbound =
          sorted.find((m) => deriveDir(asObject(m).folderType) === 'inbound') || sorted[0];
        const customerName = deriveFromName(firstInbound);
        const subject = normalizeText(asObject(firstInbound).subject) || '';

        const inputMessages = sorted.map(toSummarizeInputMessage);

        const result = await runSummarizeThreadCapability({
          channel: 'admin',
          tenantId: normalizeText(req.tenantId) || 'cco',
          // OpenAI passas in om servern har en konfigurerad client; annars
          // faller capabilityn tillbaka på heuristiken automatiskt.
          openai: openai || null,
          openaiModel: normalizeText(openaiModel) || '',
          input: {
            conversationId: key,
            customerName,
            subject,
            messages: inputMessages,
          },
        });
        const data = asObject(result?.data);
        const nba = asObject(data.nextBestAction);
        const primary = asObject(nba.primaryAction);
        // Bygg en kort risk-text baserat på sentiment + intent + anomalies
        const sentimentLabel = normalizeText(asObject(data.sentiment).label);
        const intentLabel = normalizeText(asObject(data.intent).label);
        const anomalies = Array.isArray(data.anomalies) ? data.anomalies : [];
        const riskParts = [];
        if (sentimentLabel && sentimentLabel.toLowerCase() !== 'neutral') {
          riskParts.push(`Stämning: ${sentimentLabel}`);
        }
        if (intentLabel && intentLabel.toLowerCase() !== 'oklart') {
          riskParts.push(`Avsikt: ${intentLabel}`);
        }
        if (anomalies.length > 0) {
          riskParts.push(
            `${anomalies.length} avvikelse${anomalies.length === 1 ? '' : 'r'} upptäckta`
          );
        }
        const risk = riskParts.length > 0 ? riskParts.join(' · ') : '';
        // nextStep = primaryButton + ev. första-reasoning som förklaring
        const nextStepLabel = normalizeText(primary.primaryButton) || normalizeText(primary.label);
        const reasoning = Array.isArray(primary.reasoning) ? primary.reasoning : [];
        const nextStep = nextStepLabel
          ? reasoning.length > 0
            ? `${nextStepLabel} — ${reasoning[0]}`
            : nextStepLabel
          : '';
        const summary = {
          headline: normalizeText(data.headline),
          bullets: Array.isArray(data.bullets) ? data.bullets.filter(Boolean) : [],
          risk,
          nextStep,
          sentiment: data.sentiment || null,
          intent: data.intent || null,
          primaryAction: primary || null,
          secondaryActions: Array.isArray(nba.secondaryActions) ? nba.secondaryActions : [],
          source: normalizeText(data.source) || 'heuristic',
          generatedAt: normalizeText(data.generatedAt),
        };
        if (
          ccoConversationStateStore &&
          typeof ccoConversationStateStore.writeConversationState === 'function'
        ) {
          try {
            await ccoConversationStateStore.writeConversationState({
              tenantId: normalizeText(req.tenantId) || defaultTenantId,
              canonicalConversationKey: key,
              actionState: 'handled',
              needsReplyStatusOverride: 'handled',
              actionByUserId: normalizeText(req.auth?.userId) || 'system',
              nextActionLabel: 'ai_summary',
              nextActionSummary: summary.headline || 'AI-sammanfattning genererad',
              aiSummary: {
                headline: summary.headline,
                risk: summary.risk,
                nextStep: summary.nextStep,
                sentiment: summary.sentiment,
                intent: summary.intent,
                generatedAt: summary.generatedAt,
              },
            });
          } catch (persistErr) {
            // Persistens av AI-summary får inte blockera svaret.
            console.error('AI-summary persist failed:', persistErr);
          }
        }
        return res.json({
          ok: true,
          conversationKey: key,
          summary,
          warnings: Array.isArray(result?.warnings) ? result.warnings : [],
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'internal_error',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- Trådidentitet (CCO Konversationer Fas 1.2) -----
  // GET /cco/runtime/conversation/:key/identity
  // Returnerar persistent kanonisk patientId för tråden, baserat på
  // mail-ingestion-storen. `identityConflict: true` betyder att olika
  // meddelanden i samma tråd är länkade till olika patienter.
  router.get(
    '/cco/runtime/conversation/:key/identity',
    authMiddleware,
    requirePermission('mail.read'),
    async (req, res) => {
      try {
        if (!mailIngestionStore || typeof mailIngestionStore.getThreadIdentity !== 'function') {
          return res.status(503).json({ ok: false, error: 'mail_ingestion_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) {
          return res.status(400).json({ ok: false, error: 'missing_conversation_key' });
        }
        const identity = mailIngestionStore.getThreadIdentity(key);
        return res.json({
          ok: true,
          conversationKey: key,
          identity: identity
            ? {
                canonicalPatientId: identity.canonicalPatientId || null,
                identityConflict: identity.identityConflict || false,
                linkedAt: identity.linkedAt || null,
                linkedBy: identity.linkedBy || null,
                patientIds: Array.isArray(identity.patientIds) ? identity.patientIds : [],
                messageCount: Array.isArray(identity.rawMessageIds)
                  ? identity.rawMessageIds.length
                  : 0,
              }
            : null,
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'internal_error',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- Cliento-bokningar: kund-historik + föreslagna lediga tider -----
  // GET /cco/runtime/conversation/:key/bookings  → { existingBookings, suggestedSlots }
  router.get(
    '/cco/runtime/conversation/:key/bookings',
    authMiddleware,
    requirePermission('mail.read'),
    async (req, res) => {
      try {
        if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.listMessages !== 'function') {
          return res.status(503).json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) return res.status(400).json({ ok: false, error: 'missing_conversation_key' });
        const sorted = await fetchSortedConversationMessages(ccoMailboxTruthStore, key);
        const firstInbound =
          sorted.find((m) => deriveDir(asObject(m).folderType) === 'inbound') || sorted[0] || {};
        const customerEmail =
          normalizeText(asObject(asObject(firstInbound).from).emailAddress?.address) ||
          normalizeText(firstInbound.senderEmail) ||
          normalizeText(firstInbound.fromAddress) ||
          '';
        let existingBookings = [];
        if (
          clientoBookingStore &&
          typeof clientoBookingStore.getBookingsForCustomer === 'function' &&
          customerEmail
        ) {
          existingBookings =
            clientoBookingStore.getBookingsForCustomer({
              tenantId: defaultTenantId,
              customerEmail,
            }) || [];
        }
        const suggestedSlots = generateSuggestedSlots({
          existingBookings,
          count: 6,
          slotMinutes: 30,
        }).map((s) => ({
          ...s,
          label: describeSlotSv(s.startsAt),
        }));
        // Sortera existerande bokningar — kommande först (status='upcoming' eller startsAt > now)
        const nowMs = Date.now();
        const sortedBookings = [...existingBookings]
          .map((b) => ({
            bookingId: normalizeText(b.bookingId),
            startsAt: normalizeText(b.startsAt),
            durationMinutes: Number(b.durationMinutes) || null,
            service: normalizeText(b.service) || normalizeText(b.serviceType) || null,
            staff: normalizeText(b.staff) || normalizeText(b.staffName) || null,
            status: normalizeText(b.status) || 'unknown',
            label: describeSlotSv(b.startsAt),
            isUpcoming: b.startsAt && Date.parse(b.startsAt) > nowMs && b.status !== 'cancelled',
          }))
          .sort((a, b) => {
            // upcoming först (asc), sen past (desc)
            if (a.isUpcoming && !b.isUpcoming) return -1;
            if (!a.isUpcoming && b.isUpcoming) return 1;
            return String(a.isUpcoming ? a.startsAt : b.startsAt).localeCompare(
              String(a.isUpcoming ? b.startsAt : a.startsAt)
            );
          });
        return res.json({
          ok: true,
          conversationKey: key,
          customerEmail: customerEmail || null,
          existingBookings: sortedBookings,
          suggestedSlots,
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'internal_error',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- Generera bekräftelse-utkast med vald tid -----
  // POST /cco/runtime/conversation/:key/booking-confirm  body: { slot: ISO }
  // Returnerar AI-utkast som bekräftar tiden — operatören kan justera + skicka
  router.post(
    '/cco/runtime/conversation/:key/booking-confirm',
    authMiddleware,
    // Compose-only: läser tråden + genererar bekräftelsetext via AI, persisterar
    // inget state → mail.read räcker (samma nivå som övriga läs/utkast-hjälpare).
    requirePermission('mail.read'),
    express.json({ limit: '8kb' }),
    async (req, res) => {
      try {
        if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.listMessages !== 'function') {
          return res.status(503).json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) return res.status(400).json({ ok: false, error: 'missing_conversation_key' });
        const slotIso = normalizeText(asObject(req.body).slot);
        if (!slotIso || Number.isNaN(Date.parse(slotIso))) {
          return res
            .status(400)
            .json({ ok: false, error: 'invalid_slot', detail: 'slot måste vara giltig ISO-tid.' });
        }
        const sorted = await fetchSortedConversationMessages(ccoMailboxTruthStore, key);
        if (sorted.length === 0) {
          return res.status(404).json({ ok: false, error: 'conversation_not_found' });
        }
        const firstInbound =
          sorted.find((m) => deriveDir(asObject(m).folderType) === 'inbound') || sorted[0];
        const customerName = deriveFromName(firstInbound);
        const subject = normalizeText(asObject(firstInbound).subject) || '';
        const lastOutbound = [...sorted]
          .reverse()
          .find((m) => deriveDir(asObject(m).folderType) === 'outbound');
        const ownerName = lastOutbound ? deriveFromName(lastOutbound) : '';
        const inputMessages = sorted.map(toSummarizeInputMessage);
        const slotLabel = describeSlotSv(slotIso);

        // Bygg en mer specifik prompt — be GPT bekräfta valda tiden
        let draft = null;
        if (openai && openaiModel) {
          const sys =
            'Du är AI-assistent för Hair TP Clinic. Skriv ett kort bekräftelse-mejl på svenska som bekräftar en föreslagen bokningstid. Behåll varm och professionell ton. Skriv inget om priser eller behandlingsdetaljer som inte står i tråden.';
          const userMsg = `Kund: ${customerName}\nÄmne: ${subject || '(utan ämne)'}\nKundens senaste mejl: ${deriveBody(firstInbound).slice(0, 600)}\n\nUppgift: Skriv ett bekräftelse-mejl till kunden. Föreslå tiden: ${slotLabel}. Be kunden bekräfta. Avsluta med "Mvh, ${ownerName || 'Hair TP Clinic'}". Returnera ENDAST mejltext (max 5 meningar, ingen ämnesrad).`;
          try {
            const completion = await openai.chat.completions.create({
              model: openaiModel,
              temperature: 0.3,
              max_tokens: 350,
              messages: [
                { role: 'system', content: sys },
                { role: 'user', content: userMsg },
              ],
            });
            const text = completion?.choices?.[0]?.message?.content;
            if (typeof text === 'string' && text.trim()) draft = text.trim();
          } catch (_e) {
            /* fall through */
          }
        }
        if (!draft) {
          // Heuristisk fallback
          const greeting = customerName ? `Hej ${customerName.split(/\s+/)[0]}!` : 'Hej!';
          const sign = ownerName ? `Mvh,\n${ownerName}\nHair TP Clinic` : 'Mvh,\nHair TP Clinic';
          draft = `${greeting}\n\nTack för ditt mejl. Vi har en ledig tid ${slotLabel} — passar det dig? Bekräfta gärna så bokar vi in dig.\n\n${sign}`;
        }
        return res.json({
          ok: true,
          conversationKey: key,
          slot: slotIso,
          slotLabel,
          draft,
          source: openai && openaiModel ? 'openai' : 'heuristic',
          generatedAt: new Date().toISOString(),
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'booking_confirm_failed',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- AI-utkast (genererar svar från noll baserat på tråden) -----
  // POST /cco/runtime/conversation/:key/draft   body: { tone?: 'warm'|'concise'|'professional' }
  router.post(
    '/cco/runtime/conversation/:key/draft',
    authMiddleware,
    // Compose-only: läser tråden + genererar AI-utkast, persisterar inget
    // state (utkast sparas separat via ccoCommDraft) → mail.read räcker.
    requirePermission('mail.read'),
    express.json({ limit: '8kb' }),
    async (req, res) => {
      try {
        if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.listMessages !== 'function') {
          return res.status(503).json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) return res.status(400).json({ ok: false, error: 'missing_conversation_key' });
        const sorted = await fetchSortedConversationMessages(ccoMailboxTruthStore, key);
        if (sorted.length === 0) {
          return res.status(404).json({ ok: false, error: 'conversation_not_found' });
        }
        const firstInbound =
          sorted.find((m) => deriveDir(asObject(m).folderType) === 'inbound') || sorted[0];
        const customerName = deriveFromName(firstInbound);
        const subject = normalizeText(asObject(firstInbound).subject) || '';
        // Hitta ägaren av aktuell mailbox (sista skickade meddelandet visar oftast vem som svarar)
        const lastOutbound = [...sorted]
          .reverse()
          .find((m) => deriveDir(asObject(m).folderType) === 'outbound');
        const ownerName = lastOutbound ? deriveFromName(lastOutbound) : '';
        const tone = normalizeText(asObject(req.body).tone).toLowerCase() || 'warm';
        const inputMessages = sorted.map(toSummarizeInputMessage);

        let draft = null;
        let source = 'heuristic';
        if (openai && openaiModel) {
          draft = await generateOpenAIReply({
            openai,
            model: openaiModel,
            messages: inputMessages,
            customerName,
            ownerName,
            subject,
            tone: ['warm', 'concise', 'professional'].includes(tone) ? tone : 'warm',
          });
          if (draft) source = 'openai';
        }
        if (!draft) {
          const latestInbound =
            [...sorted].reverse().find((m) => deriveDir(asObject(m).folderType) === 'inbound') ||
            firstInbound;
          draft = buildHeuristicDraft({
            customerName,
            latestInboundBody: deriveBody(latestInbound),
            ownerName,
          });
          source = 'heuristic';
        }
        // Reply Confidence Panel — advisory confidence/risk/tone for the operator.
        // Additive field; the draft itself is unchanged. No journal content leaves here.
        const latestInboundForConfidence =
          [...sorted].reverse().find((m) => deriveDir(asObject(m).folderType) === 'inbound') ||
          firstInbound;
        const confidence = computeReplyConfidence({
          thread: { customerName, latestInboundBody: deriveBody(latestInboundForConfidence) },
          draft: { body: draft },
          conversationHistory: sorted,
          templateMatched: false,
        });
        return res.json({
          ok: true,
          conversationKey: key,
          draft,
          source,
          tone,
          confidence,
          generatedAt: new Date().toISOString(),
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'draft_failed',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- Skicka svar (reply) via Microsoft Graph -----
  // POST /cco/runtime/conversation/:key/reply { body, bodyHtml? }
  // Hittar senaste inkommande meddelandet i tråden, använder det som
  // replyToMessageId och låter graphSendConnector skicka svaret.
  router.post(
    '/cco/runtime/conversation/:key/reply',
    authMiddleware,
    // Faktisk Graph-live-send. Owner-only grind (mail.live_send). Detta AKTIVERAR
    // inget utskick — connector-grinden (graphSendConnector/ARCANA_GRAPH_SEND_ENABLED)
    // är kvar och blockerar fortfarande; RBAC skärper bara vem som ens får försöka.
    requirePermission('mail.live_send'),
    express.json({ limit: '64kb' }),
    async (req, res) => {
      try {
        const shadowMode = shadowSendEnabled === true;
        // I shadow-läge behövs ingen connector — vi skickar aldrig skarpt.
        if (
          !shadowMode &&
          (!graphSendConnector || typeof graphSendConnector.sendReply !== 'function')
        ) {
          return res.status(503).json({
            ok: false,
            error: 'graph_send_unavailable',
            detail:
              'ARCANA_GRAPH_SEND_ENABLED måste vara true och Graph-credentials konfigurerade.',
          });
        }
        if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.listMessages !== 'function') {
          return res.status(503).json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) {
          return res.status(400).json({ ok: false, error: 'missing_conversation_key' });
        }
        const body = normalizeText(asObject(req.body).body);
        const rawBodyHtml = normalizeText(asObject(req.body).bodyHtml);
        const bodyHtml = sanitizeReplyHtml(rawBodyHtml);
        if (!body) {
          return res.status(400).json({ ok: false, error: 'missing_body' });
        }
        const sorted = await fetchSortedConversationMessages(ccoMailboxTruthStore, key);
        if (sorted.length === 0) {
          return res.status(404).json({ ok: false, error: 'conversation_not_found' });
        }
        // Hitta senaste inkommande meddelande — det är vad vi svarar på
        const latestInbound = [...sorted]
          .reverse()
          .find((m) => deriveDir(asObject(m).folderType) === 'inbound');
        if (!latestInbound) {
          return res.status(409).json({
            ok: false,
            error: 'no_inbound_message',
            detail: 'Tråden saknar inkommande meddelande att svara på.',
          });
        }
        const target = asObject(latestInbound);
        const senderMailboxId =
          normalizeText(target.mailboxId) || normalizeText(target.mailboxAddress);
        const replyToMessageId =
          normalizeText(target.graphMessageId) || normalizeText(target.messageId);
        const conversationId =
          normalizeText(target.conversationId) || normalizeText(target.mailboxConversationId);
        if (!senderMailboxId || !replyToMessageId) {
          return res.status(409).json({
            ok: false,
            error: 'missing_send_metadata',
            detail: 'Saknar mailboxId eller graphMessageId i tråden.',
          });
        }
        // Resolve customer email (recipient) — för säkerhets skull även när
        // sendReply mest använder replyToMessageId i samma mailbox
        const customerEmail =
          normalizeText(asObject(asObject(target.from).emailAddress).address) ||
          normalizeText(target.senderEmail) ||
          normalizeText(target.fromAddress);
        const actorUserId = normalizeText(
          req?.user?.id || req?.user?.userId || req?.session?.userId
        );
        const actorEmail = normalizeText(req?.user?.email || req?.session?.email).toLowerCase();

        // E1 steg 1 — shadow/dry-run: allt är upplöst och validerat, men vi
        // skickar INTE. Returnera exakt det som skulle skickats och logga det.
        if (shadowMode) {
          const wouldSend = {
            mailboxId: senderMailboxId,
            conversationId: conversationId || null,
            replyToMessageId,
            recipient: customerEmail || null,
            subject: normalizeText(target.subject) || null,
            bodyPreview: body.slice(0, 200),
            bodyLength: body.length,
            htmlProvided: Boolean(bodyHtml),
          };
          console.info(
            '[cco-reply] SHADOW dry-run — inget mejl skickat',
            JSON.stringify({ conversationKey: key, ...wouldSend })
          );
          await safeAuditConversation(authStore, {
            action: 'cco.conversation.reply_shadow',
            tenantId: defaultTenantId,
            metadata: {
              conversationKey: key,
              mailboxId: senderMailboxId,
              intendedRecipient: customerEmail || null,
              subject: normalizeText(target.subject) || null,
              mode: 'shadow',
              sent: false,
              replyToMessageId,
              actorUserId: actorUserId || null,
              actorEmail: actorEmail || null,
              sentAt: new Date().toISOString(),
            },
          });
          return res.json({
            ok: true,
            mode: 'shadow',
            sent: false,
            conversationKey: key,
            replyToMessageId,
            mailboxId: senderMailboxId,
            recipient: customerEmail || null,
            wouldSend,
          });
        }

        // E1 steg 2 — test-redirect: riktig sändning men tvingad mottagare till
        // ägar-testadressen. Kunden nås aldrig; ämnet märks så det syns i
        // testinkorgen vem svaret egentligen var avsett för.
        const testRecipient = normalizeText(sendTestRecipient);
        const redirectToTest = Boolean(testRecipient);
        const subject = normalizeText(target.subject);
        const sendSubject = redirectToTest
          ? `[ARCANA TEST → ${customerEmail || 'okänd mottagare'}] ${subject}`.trim()
          : subject;
        const recipient = redirectToTest ? testRecipient : customerEmail;

        const result = await graphSendConnector.sendReply({
          // ORD-221 — svaret går till customerEmail om inte
          // ARCANA_MAIL_SEND_TEST_RECIPIENT styr om det. Den var inte satt i
          // prod, och rutten hade ingen kundutskicksgrind.
          audience: 'customer',
          mailboxId: senderMailboxId,
          sourceMailboxId: senderMailboxId,
          conversationId,
          replyToMessageId,
          body,
          bodyHtml: bodyHtml || undefined,
          subject: sendSubject,
          to: recipient ? [recipient] : [],
        });
        if (redirectToTest) {
          console.info(
            '[cco-reply] LIVE_TEST — skarpt utskick omdirigerat till testadress',
            JSON.stringify({
              conversationKey: key,
              testRecipient,
              intendedRecipient: customerEmail || null,
            })
          );
        }
        const sentAt = new Date().toISOString();

        // Sätt "Besvarad i CCO – <namn>"-kategori på originalmailet så kollegor
        // som sitter i den delade brevlådan i Outlook/Mac ser att — och av vem —
        // kunden är besvarad. Best-effort: får ALDRIG fälla svaret som redan
        // gått iväg. Endast skarpa utskick (inte testomdirigering), och bakom
        // flagga tills Coworker verifierat mot kons@.
        if (
          !redirectToTest &&
          markAnsweredCategoryEnabled() &&
          typeof graphSendConnector.markMessageAnswered === 'function'
        ) {
          try {
            await graphSendConnector.markMessageAnswered({
              mailboxId: senderMailboxId,
              messageId: replyToMessageId,
              category: buildAnsweredCategory({
                actorName: normalizeText(req?.user?.name || req?.user?.displayName),
                actorEmail,
              }),
              replacePrefix: ANSWERED_CATEGORY_PREFIX,
              color: ANSWERED_CATEGORY_COLOR,
            });
          } catch (markErr) {
            console.warn(
              '[cco-reply] markMessageAnswered misslyckades (best-effort, svaret är skickat)',
              String((markErr && markErr.message) || markErr)
            );
          }
        }

        await safeAuditConversation(authStore, {
          action: redirectToTest
            ? 'cco.conversation.reply_test_send'
            : 'cco.conversation.reply_sent',
          tenantId: defaultTenantId,
          metadata: {
            conversationKey: key,
            mailboxId: senderMailboxId,
            recipient: recipient || null,
            // tråd/kund-koppling: intendedRecipient = den verkliga kunden även
            // när utskicket omdirigerats till testadressen.
            intendedRecipient: redirectToTest ? customerEmail || null : recipient || null,
            testRedirect: redirectToTest,
            subject: sendSubject || null,
            mode: redirectToTest ? 'live_test' : 'live',
            sent: true,
            replyToMessageId,
            actorUserId: actorUserId || null,
            actorEmail: actorEmail || null,
            sentAt,
          },
        });
        if (typeof postSendMailboxSync === 'function') {
          postSendMailboxSync({
            mailboxId: senderMailboxId,
            source: redirectToTest ? 'cco_reply_test_send' : 'cco_reply_sent',
            conversationKey: key,
          });
        }
        return res.json({
          ok: true,
          mode: redirectToTest ? 'live_test' : 'live',
          sent: true,
          testRedirect: redirectToTest,
          conversationKey: key,
          replyToMessageId,
          mailboxId: senderMailboxId,
          recipient: recipient || null,
          intendedRecipient: redirectToTest ? customerEmail || null : undefined,
          sendResult: result || null,
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'send_failed',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  /**
   * ORD-218 — POST /cco/runtime/conversation/:key/assign
   *
   * TODO 6.3 var öppen sedan länge och beskrev exakt det här: frontend hade
   * "Tilldela"-knappar, backend hade ingenting som lagrade vem en konversation
   * tillhörde. `ccoConversationStateStore` sparade bara vem som UTFÖRDE en
   * åtgärd, aldrig vem som ÄGER tråden.
   *
   * Det affärsbeslut som TODO:n väntade på: **vem som helst får ta över**.
   * Fazli 2026-09-04, i linje med ORD-198 ("personalen oavsett vem ska kunna
   * kommunicera med alla kunder"). Ett övertagande nekas därför aldrig — men
   * det syns: föregående ägare hamnar i historiken och i auditloggen.
   *
   * Den andra rimliga regeln — bara ägaren får lämna ifrån sig tråden — valdes
   * bort därför att en tvåpersonsklinik där den ena är sjuk inte ska behöva en
   * administratör för att svara en patient.
   *
   * `assignedToEmail: null` avtilldelar. Behörighet: mail.write, samma som
   * Klar/Senare — tilldelning ändrar delad trådstatus.
   */
  router.post(
    '/cco/runtime/conversation/:key/assign',
    authMiddleware,
    requirePermission('mail.write'),
    express.json({ limit: '8kb' }),
    async (req, res) => {
      try {
        if (
          !ccoConversationStateStore ||
          typeof ccoConversationStateStore.assignConversation !== 'function'
        ) {
          return res.status(503).json({ ok: false, error: 'conversation_state_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) {
          return res.status(400).json({ ok: false, error: 'missing_conversation_key' });
        }
        const body = asObject(req.body);

        /**
         * TOM STRÄNG OCH SAKNAT FÄLT ÄR OLIKA SAKER.
         *
         * `{ assignedToEmail: null }` = avtilldela, ett medvetet val.
         * Utelämnat fält = anroparen sa inget, och då är förfrågan meningslös
         * — den skulle tyst inte göra något. Den avvisas hellre.
         */
        if (!Object.prototype.hasOwnProperty.call(body, 'assignedToEmail')) {
          return res.status(400).json({
            ok: false,
            error: 'missing_assignee',
            detail: 'assignedToEmail krävs. Skicka null för att ta bort tilldelningen.',
          });
        }
        const till = normalizeText(body.assignedToEmail).toLowerCase();
        if (till && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(till)) {
          return res.status(400).json({
            ok: false,
            error: 'invalid_assignee',
            detail: 'assignedToEmail måste vara en e-postadress eller null.',
          });
        }

        const actorUserId = normalizeText(
          req?.user?.id || req?.user?.userId || req?.session?.userId
        );
        const actorEmail = normalizeText(req?.user?.email || req?.session?.email).toLowerCase();

        const foregaende =
          ccoConversationStateStore.getConversationState?.({
            tenantId: defaultTenantId,
            canonicalConversationKey: key,
          })?.assignedToEmail || null;

        const state = await ccoConversationStateStore.assignConversation({
          tenantId: defaultTenantId,
          canonicalConversationKey: key,
          assignedToEmail: till || null,
          assignedToUserId: normalizeText(body.assignedToUserId) || null,
          assignedByEmail: actorEmail || null,
          assignedByUserId: actorUserId || null,
          note: normalizeText(body.note),
        });

        const overtagande = Boolean(foregaende && till && foregaende !== till);
        await safeAuditConversation(authStore, {
          // Egna auditnycklar per utfall. En gemensam nyckel hade gjort det
          // omöjligt att i efterhand skilja "fick ansvar" från "blev av med
          // ansvar" utan att läsa metadata.
          action: till
            ? overtagande
              ? 'cco.conversation.assign.takeover'
              : 'cco.conversation.assign'
            : 'cco.conversation.unassign',
          tenantId: defaultTenantId,
          metadata: {
            conversationKey: key,
            assignedToEmail: till || null,
            previousAssigneeEmail: foregaende,
            takeover: overtagande,
            actorUserId: actorUserId || null,
            actorEmail: actorEmail || null,
            note: normalizeText(body.note).slice(0, 260) || null,
            assignedAt: new Date().toISOString(),
          },
        });

        return res.json({
          ok: true,
          conversationKey: key,
          assignedToEmail: till || null,
          previousAssigneeEmail: foregaende,
          takeover: overtagande,
          state: state || null,
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'assign_failed',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- Klar / Senare / Schemalägg — uppdatera tråd-status -----
  // POST /cco/runtime/conversation/:key/action
  // Body: { action: 'handled' | 'reply_later' | 'reopen', followUpDueAt?: ISO, note?: string }
  //   handled        → tråd markerad som klar (försvinner från Olast/Agera-listan)
  //   reply_later    → "Senare", kräver followUpDueAt (om saknas: nu+24h)
  //   reopen         → ångra en tidigare action (superseder befintligt state)
  router.post(
    '/cco/runtime/conversation/:key/action',
    authMiddleware,
    // Klar/Senare/Återöppna muterar delad trådstatus → mail.write (owner+operator).
    requirePermission('mail.write'),
    express.json({ limit: '32kb' }),
    async (req, res) => {
      try {
        if (
          !ccoConversationStateStore ||
          typeof ccoConversationStateStore.writeConversationState !== 'function'
        ) {
          return res.status(503).json({ ok: false, error: 'conversation_state_store_unavailable' });
        }
        if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.listMessages !== 'function') {
          return res.status(503).json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) {
          return res.status(400).json({ ok: false, error: 'missing_conversation_key' });
        }
        const body = asObject(req.body);
        const action = normalizeText(body.action).toLowerCase();
        if (!['handled', 'reply_later', 'reopen', 'archive'].includes(action)) {
          return res.status(400).json({
            ok: false,
            error: 'invalid_action',
            detail: 'action måste vara handled | reply_later | reopen | archive',
          });
        }
        const customerId = normalizeText(body.customerId).toLowerCase();
        if (!customerId) {
          return res.status(400).json({
            ok: false,
            error: 'missing_customer_id',
            detail: 'customerId krävs för att skydda mot fel kund',
          });
        }
        const note = normalizeText(body.note).slice(0, 260);
        const actorUserId = normalizeText(
          req?.user?.id || req?.user?.userId || req?.session?.userId
        );
        const actorEmail = normalizeText(req?.user?.email || req?.session?.email).toLowerCase();

        // Verifiera att konversationen finns och att customerId matchar — gäller alla actions.
        // Spegla /messages-routens resolution: mailbox-truth-storen FÖRST, sedan
        // mail-ingestion-storen. Web-form-/ingesterade trådar (t.ex. web-leads)
        // ligger INTE i mailbox-truth-storen utan i ingestion-storen — utan den
        // här fallbacken 404:ade Klar/Senare/Återöppna på varje sådan tråd trots
        // att /messages visar den. memberKeys/mailbox-hint tas från bodyn om
        // klienten skickar dem (rollup-trådar); annars räcker den kanoniska nyckeln.
        const memberKeys = parseConversationMemberKeysQuery(body);
        const mailboxHints = parseConversationMailboxHintQuery(body);
        const actionScopeOptions = {
          ...parseConversationContactScopeQuery(body),
          ...(mailboxHints.length ? { mailboxHints } : {}),
          ...(configuredMailboxIds.length ? { allowedMailboxIds: configuredMailboxIds } : {}),
        };
        let sorted = await fetchSortedConversationMessages(
          ccoMailboxTruthStore,
          key,
          memberKeys,
          actionScopeOptions
        );
        if (sorted.length === 0) {
          sorted = fetchSortedIngestionConversationMessagesForKeys(
            mailIngestionStore,
            [key, ...memberKeys],
            actionScopeOptions
          );
        }
        if (sorted.length === 0) {
          return res.status(404).json({
            ok: false,
            error: 'conversation_not_found',
            detail: 'Ingen underliggande konversation hittades att åtgärda för den här tråden.',
          });
        }
        const firstInboundMsg =
          sorted.find((m) => deriveDir(asObject(m).folderType) === 'inbound') || sorted[0];
        const conversationCustomerId = (
          normalizeText(asObject(asObject(firstInboundMsg).from).emailAddress?.address) ||
          normalizeText(asObject(firstInboundMsg).senderEmail) ||
          normalizeText(asObject(firstInboundMsg).fromAddress)
        ).toLowerCase();
        if (conversationCustomerId && customerId !== conversationCustomerId) {
          return res.status(409).json({
            ok: false,
            error: 'customer_mismatch',
            detail: 'customerId matchar inte konversationens kund',
          });
        }

        // Reopen → supersede existing state
        if (action === 'reopen') {
          if (typeof ccoConversationStateStore.supersedeConversationState !== 'function') {
            return res.status(503).json({ ok: false, error: 'supersede_unavailable' });
          }
          const result = await ccoConversationStateStore.supersedeConversationState({
            tenantId: defaultTenantId,
            canonicalConversationKey: key,
            supersededReason: 'manual_clear',
          });
          await safeAuditConversation(authStore, {
            action: 'cco.conversation.reopen',
            tenantId: defaultTenantId,
            metadata: {
              conversationKey: key,
              customerId,
              action,
              actorUserId: actorUserId || null,
              actorEmail: actorEmail || null,
              actionAt: new Date().toISOString(),
            },
          });
          return res.json({ ok: true, action, conversationKey: key, state: result || null });
        }

        // Hitta första meddelandet i tråden för att lista
        // underlying mailbox/conversation IDs
        const firstMessage = asObject(sorted[0] || {});
        const underlyingMailboxIds = sorted
          .map((m) => normalizeText(asObject(m).mailboxId))
          .filter(Boolean);
        const underlyingConversationIds = sorted
          .map((m) => normalizeText(asObject(m).conversationId))
          .filter(Boolean);
        const primaryConversationId =
          normalizeText(firstMessage.conversationId) ||
          normalizeText(firstMessage.mailboxConversationId);

        // followUpDueAt: använd från body om finns, annars nu+24h för reply_later
        let followUpDueAt = null;
        if (action === 'reply_later') {
          const requested = normalizeText(body.followUpDueAt);
          if (requested && !Number.isNaN(Date.parse(requested))) {
            followUpDueAt = new Date(Date.parse(requested)).toISOString();
          } else {
            followUpDueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          }
        }

        /**
         * ORD-217 — arkivera.
         *
         * `archive` är en EGEN handling men samma mekanik som `handled`: tråden
         * lämnar arbetslistan. Skillnaden är vad den betyder, och det syns i
         * audit och i etiketten. Klar = besvarad. Arkiverad = undanlagd utan
         * att ha besvarats — reklam, felskickat, en tråd som inte kräver svar.
         *
         * Att slå ihop dem hade gjort uppföljning omöjlig: "hur många ärenden
         * besvarade vi?" kan inte besvaras om undanlagt räknas som besvarat.
         *
         * SÄKERHETEN LIGGER I shouldSuppressOperatorState (läsmodellen): kommer
         * det ett inkommande meddelande efter actionAt ignoreras staten och
         * tråden dyker upp igen. Arkivering kan därför inte tysta en kund som
         * skriver på nytt.
         */
        const actionState = action === 'archive' ? 'archived' : action;
        const doljerTraden = action === 'handled' || action === 'archive';
        const needsReplyStatusOverride = doljerTraden ? 'handled' : 'needs_reply';
        const nextActionLabel =
          action === 'handled'
            ? 'Markerad som klar'
            : action === 'archive'
              ? 'Arkiverad'
              : 'Påminnelse senare';

        const actionAt = new Date().toISOString();
        const result = await ccoConversationStateStore.writeConversationState({
          tenantId: defaultTenantId,
          canonicalConversationKey: key,
          canonicalConversationSource: 'mailbox_conversation_fallback',
          canonicalConversationType: 'conversationKey',
          primaryConversationId: primaryConversationId || null,
          underlyingConversationIds: [...new Set(underlyingConversationIds)],
          underlyingMailboxIds: [...new Set(underlyingMailboxIds.map((id) => id.toLowerCase()))],
          actionState,
          needsReplyStatusOverride,
          followUpDueAt,
          waitingOn: action === 'reply_later' ? 'customer' : null,
          nextActionLabel,
          nextActionSummary: note || null,
          actionAt,
          actionByUserId: actorUserId || null,
          actionByEmail: actorEmail || null,
        });
        await safeAuditConversation(authStore, {
          action: `cco.conversation.${action}`,
          tenantId: defaultTenantId,
          metadata: {
            conversationKey: key,
            customerId,
            action,
            followUpDueAt: followUpDueAt || null,
            actorUserId: actorUserId || null,
            actorEmail: actorEmail || null,
            actionAt,
          },
        });
        return res.json({
          ok: true,
          action,
          conversationKey: key,
          state: result || null,
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'action_failed',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- Bulk: preview → confirm (D1) -----
  // Bulk-actions får ALDRIG mutera direkt. Först /bulk/preview (read-only) som
  // visar exakt vilka trådar som påverkas + varningar, sedan /bulk/confirm som
  // muterar först efter explicit confirm=true. Confirm re-validerar alltid varje
  // tråd (klienten litas aldrig på). Conflict/suggested/unmatched + systemmail
  // blockas. RBAC: mail.write (#496).
  const MAX_BULK_ITEMS = 200;

  function parseBulkRequest(body) {
    const safe = asObject(body);
    const action = normalizeText(safe.action).toLowerCase();
    const items = Array.isArray(safe.items) ? safe.items : [];
    return { action, items };
  }

  router.post(
    '/cco/runtime/conversation/bulk/preview',
    authMiddleware,
    requirePermission('mail.write'),
    express.json({ limit: '128kb' }),
    async (req, res) => {
      try {
        if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.listMessages !== 'function') {
          return res.status(503).json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        const { action, items } = parseBulkRequest(req.body);
        if (!['handled', 'reply_later', 'reopen'].includes(action)) {
          return res.status(400).json({ ok: false, error: 'invalid_action' });
        }
        if (items.length === 0) {
          return res.status(400).json({ ok: false, error: 'no_items' });
        }
        if (items.length > MAX_BULK_ITEMS) {
          return res.status(400).json({ ok: false, error: 'too_many_items', max: MAX_BULK_ITEMS });
        }
        const rows = await Promise.all(
          items.map((item) =>
            evaluateConversationBulkItem(ccoMailboxTruthStore, item, action, {
              ingestionStore: mailIngestionStore,
              scopeOptions: configuredMailboxIds.length
                ? { allowedMailboxIds: configuredMailboxIds }
                : {},
            })
          )
        );
        const eligible = rows.filter((r) => r.eligible);
        const batchId = crypto.randomUUID();
        // Preview muterar INGET state.
        return res.json({
          ok: true,
          batchId,
          action,
          summary: {
            requested: rows.length,
            eligible: eligible.length,
            ineligible: rows.length - eligible.length,
          },
          items: rows,
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'bulk_preview_failed',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  router.post(
    '/cco/runtime/conversation/bulk/confirm',
    authMiddleware,
    requirePermission('mail.write'),
    express.json({ limit: '128kb' }),
    async (req, res) => {
      try {
        if (
          !ccoConversationStateStore ||
          typeof ccoConversationStateStore.writeConversationState !== 'function'
        ) {
          return res.status(503).json({ ok: false, error: 'conversation_state_store_unavailable' });
        }
        if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.listMessages !== 'function') {
          return res.status(503).json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        const { action, items } = parseBulkRequest(req.body);
        const body = asObject(req.body);
        const batchId = normalizeText(body.batchId);
        if (!['handled', 'reply_later', 'reopen'].includes(action)) {
          return res.status(400).json({ ok: false, error: 'invalid_action' });
        }
        if (body.confirm !== true) {
          return res.status(400).json({
            ok: false,
            error: 'confirmation_required',
            detail: 'confirm måste vara true för att bulk-mutation ska köras',
          });
        }
        if (!batchId) {
          return res.status(400).json({ ok: false, error: 'missing_batch_id' });
        }
        if (items.length === 0) {
          return res.status(400).json({ ok: false, error: 'no_items' });
        }
        if (items.length > MAX_BULK_ITEMS) {
          return res.status(400).json({ ok: false, error: 'too_many_items', max: MAX_BULK_ITEMS });
        }
        const actorUserId = normalizeText(
          req?.user?.id || req?.user?.userId || req?.session?.userId
        );
        const actorEmail = normalizeText(req?.user?.email || req?.session?.email).toLowerCase();
        const note = normalizeText(body.note).slice(0, 260);
        const followUpDueAt = normalizeText(body.followUpDueAt);

        const applied = [];
        const skipped = [];
        const failed = [];
        for (const item of items) {
          // Re-validera varje tråd — confirm litar aldrig på klientens preview.
          const evaluation = await evaluateConversationBulkItem(
            ccoMailboxTruthStore,
            item,
            action,
            {
              ingestionStore: mailIngestionStore,
              scopeOptions: configuredMailboxIds.length
                ? { allowedMailboxIds: configuredMailboxIds }
                : {},
            }
          );
          if (!evaluation.eligible) {
            skipped.push({
              conversationKey: evaluation.conversationKey,
              warnings: evaluation.warnings,
            });
            continue;
          }
          try {
            // Samma resolution som eligibility-checken och single-action-routen:
            // truth först, sedan ingestion-fallback. Utan detta skrevs state för
            // en web-form-/ingesterad tråd (som blev eligible via ingestion) med
            // en TOM sorted → utan underliggande conversation-/mailbox-IDn.
            const bulkScopeOptions = configuredMailboxIds.length
              ? { allowedMailboxIds: configuredMailboxIds }
              : {};
            let sorted = await fetchSortedConversationMessages(
              ccoMailboxTruthStore,
              evaluation.conversationKey,
              [],
              bulkScopeOptions
            );
            if (sorted.length === 0) {
              sorted = fetchSortedIngestionConversationMessagesForKeys(
                mailIngestionStore,
                [evaluation.conversationKey],
                bulkScopeOptions
              );
            }
            await applyConversationActionState({
              ccoConversationStateStore,
              tenantId: defaultTenantId,
              key: evaluation.conversationKey,
              action,
              note,
              followUpDueAt,
              sorted,
              actorUserId,
              actorEmail,
            });
            applied.push(evaluation.conversationKey);
          } catch (mutationErr) {
            // Partial failure: en tråds fel stoppar inte övriga.
            failed.push({
              conversationKey: evaluation.conversationKey,
              error: String((mutationErr && mutationErr.message) || mutationErr),
            });
          }
        }

        // En audit-post per batch (inte per tråd).
        await safeAuditConversation(authStore, {
          action: `cco.conversation.bulk_${action}`,
          tenantId: defaultTenantId,
          metadata: {
            batchId,
            action,
            actorUserId: actorUserId || null,
            actorEmail: actorEmail || null,
            requestedCount: items.length,
            appliedCount: applied.length,
            skippedCount: skipped.length,
            failedCount: failed.length,
            affectedThreadIds: applied,
            actionAt: new Date().toISOString(),
          },
        });

        return res.json({
          ok: true,
          batchId,
          action,
          summary: {
            requested: items.length,
            applied: applied.length,
            skipped: skipped.length,
            failed: failed.length,
          },
          applied,
          skipped,
          failed,
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'bulk_confirm_failed',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- Anteckningar (interna, per tråd) -----
  // GET  /cco/runtime/conversation/:key/notes        → lista nyaste först
  // POST /cco/runtime/conversation/:key/notes { body }  → lägg till anteckning
  router.get(
    '/cco/runtime/conversation/:key/notes',
    authMiddleware,
    requirePermission('mail.read'),
    (req, res) => {
      try {
        if (
          !ccoConversationNotesStore ||
          typeof ccoConversationNotesStore.listNotes !== 'function'
        ) {
          return res.status(503).json({ ok: false, error: 'notes_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) return res.status(400).json({ ok: false, error: 'missing_conversation_key' });
        // ORD-222 — samma verifierade tenant som skrivvägen. Se kommentaren i
        // POST-rutten för varför den inte får falla tillbaka på defaultTenantId.
        const tenantId = normalizeText(req.auth?.tenantId);
        if (!tenantId) {
          return res.status(401).json({ ok: false, error: 'missing_tenant' });
        }
        const notes = ccoConversationNotesStore.listNotes({
          tenantId,
          conversationKey: key,
        });
        return res.json({ ok: true, conversationKey: key, count: notes.length, notes });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'internal_error',
          detail: String((err && err.message) || err),
        });
      }
    }
  );
  router.post(
    '/cco/runtime/conversation/:key/notes',
    authMiddleware,
    // Intern trådnotis persisteras → mail.write (owner+operator).
    requirePermission('mail.write'),
    express.json({ limit: '8kb' }),
    async (req, res) => {
      try {
        if (!ccoConversationNotesStore || typeof ccoConversationNotesStore.addNote !== 'function') {
          return res.status(503).json({ ok: false, error: 'notes_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) return res.status(400).json({ ok: false, error: 'missing_conversation_key' });
        const body = normalizeText(asObject(req.body).body);
        if (!body) return res.status(400).json({ ok: false, error: 'missing_body' });
        const authorEmail = normalizeText(req?.user?.email || req?.session?.email);
        const authorName = normalizeText(req?.user?.name || req?.session?.name);
        /**
         * ORD-222 — tenant kommer från den VERIFIERADE sessionen, inte från
         * anropet. `req.auth.tenantId` är samma värde requireTenantScope
         * jämför mot; att i stället läsa ett fält ur body hade gjort
         * klinikgränsen till något anroparen bestämmer.
         *
         * INGEN FALLBACK PÅ defaultTenantId, och det är mätt fram.
         *
         * Första versionen skrev `|| defaultTenantId`, som ser oskyldigt ut.
         * Men server.js:12676 skickar `defaultTenantId: 'cco'` till just den
         * här routern — inte config.defaultTenantId. Fallbacken hade alltså
         * lagt anteckningar i en hink som heter `cco::`, en klinik som inte
         * finns, och de hade varit osynliga för både Hair TP och Curatiio utan
         * att något felmeddelande skrivits.
         *
         * 401 i stället. En anteckning som inte kan knytas till en klinik ska
         * inte skrivas alls.
         */
        const tenantId = normalizeText(req.auth?.tenantId);
        if (!tenantId) {
          return res.status(401).json({ ok: false, error: 'missing_tenant' });
        }
        const note = await ccoConversationNotesStore.addNote({
          tenantId,
          conversationKey: key,
          body,
          authorEmail,
          authorName,
        });
        return res.json({ ok: true, conversationKey: key, note });
      } catch (err) {
        const message = String((err && err.message) || err);
        const isTooLong = message.toLowerCase().includes('för lång');
        return res.status(isTooLong ? 400 : 500).json({
          ok: false,
          error: isTooLong ? 'too_long' : 'internal_error',
          detail: message,
        });
      }
    }
  );

  // ----- Manuell mailbox-sync trigger -----
  // POST /cco/runtime/sync   (body: { mailboxIds?: string[], lookbackDays?: number })
  // Triggar Microsoft Graph mailbox-backfill för de angivna mailboxarna
  // (eller defaults). När det är klart: broadcasta ett SSE-event så att
  // frontend refreshar worklisten.
  let syncInFlight = false;
  router.post(
    '/cco/runtime/sync',
    authMiddleware,
    requireTenantScope,
    attachRole,
    requirePermission('mailbox.admin'),
    express.json({ limit: '8kb' }),
    async (req, res) => {
      try {
        if (syncInFlight) {
          return res
            .status(429)
            .json({ ok: false, error: 'sync_in_flight', detail: 'En sync pågår redan.' });
        }
        if (!graphReadConnector) {
          return res.status(503).json({
            ok: false,
            error: 'graph_read_unavailable',
            detail: 'ARCANA_GRAPH_READ_ENABLED måste vara true.',
          });
        }
        if (!ccoMailboxTruthStore) {
          return res.status(503).json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        if (configuredGraphMailboxIds.length === 0) {
          return res.status(503).json({
            ok: false,
            error: 'graph_mailbox_scope_unavailable',
            detail: 'Ingen Graph-mailbox ar konfigurerad for manuell sync.',
          });
        }
        const requestBody = asObject(req.body);
        const hasMailboxIds = Object.prototype.hasOwnProperty.call(requestBody, 'mailboxIds');
        if (hasMailboxIds && !Array.isArray(requestBody.mailboxIds)) {
          return res.status(400).json({
            ok: false,
            error: 'invalid_mailbox_ids',
            detail: 'mailboxIds maste vara en lista med mailboxadresser.',
          });
        }
        const rawRequestedMailboxIds = hasMailboxIds ? requestBody.mailboxIds : [];
        const normalizedRequestedMailboxIds = rawRequestedMailboxIds.map((mailboxId) =>
          normalizeEmail(mailboxId)
        );
        const invalidMailboxIds = normalizedRequestedMailboxIds.filter((mailboxId) => !mailboxId);
        const requestedMailboxIds = Array.from(
          new Set(normalizedRequestedMailboxIds.filter(Boolean))
        );
        const offScopeMailboxIds = requestedMailboxIds.filter(
          (mailboxId) => !configuredGraphMailboxIdSet.has(mailboxId)
        );
        if (invalidMailboxIds.length > 0 || offScopeMailboxIds.length > 0) {
          return res.status(403).json({
            ok: false,
            error: 'mailbox_scope_forbidden',
            detail: 'Manuell Graph-sync far bara koras for tillatna Graph-mailboxar.',
          });
        }
        const mailboxIds =
          requestedMailboxIds.length > 0 ? requestedMailboxIds : configuredGraphMailboxIds;
        if (mailboxIds.length === 0) {
          return res
            .status(400)
            .json({ ok: false, error: 'no_mailboxes', detail: 'Inga mailboxar att synca.' });
        }
        const lookbackDays = Math.max(
          1,
          Math.min(90, Number(asObject(req.body).lookbackDays) || syncLookbackDays || 14)
        );
        syncInFlight = true;
        const startedAt = new Date().toISOString();
        // Kör bakgrundskörningen — vi väntar inte på fullt resultat innan
        // vi svarar (kan ta minuter); vi svarar omedelbart med "started"
        // och broadcastar ett event när det är klart.
        const runPromise = (async () => {
          try {
            const result = await runManualGraphBackfill({
              graphReadConnector,
              ccoMailboxTruthStore,
              mailboxIds,
              lookbackDays,
              logger: console,
            });
            if (runtimeStreamRouter && typeof runtimeStreamRouter.broadcast === 'function') {
              runtimeStreamRouter.broadcast('worklist_updated', {
                source: 'manual_sync',
                mailboxIds,
                folderCount: result?.folderCount || 0,
                completedAt: new Date().toISOString(),
              });
            }
          } catch (err) {
            console.warn('[cco-sync] backfill misslyckades', err?.message);
            if (runtimeStreamRouter && typeof runtimeStreamRouter.broadcast === 'function') {
              runtimeStreamRouter.broadcast('worklist_sync_failed', {
                error: String(err?.message || err),
                completedAt: new Date().toISOString(),
              });
            }
          } finally {
            syncInFlight = false;
          }
        })();
        // Don't block the response on the async runPromise — handle 'unhandled rejection' silently above
        runPromise.catch(() => {});
        return res.json({
          ok: true,
          started: true,
          startedAt,
          mailboxIds,
          lookbackDays,
        });
      } catch (err) {
        syncInFlight = false;
        return res.status(500).json({
          ok: false,
          error: 'sync_failed',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- Mailbox health (RBAC-grindad aggregatstatus) -----
  // GET /cco/runtime/health/mailboxes
  // Visar antal mejl per mailbox + senaste mejlets timestamp.
  // Inga email-bodies eller customer-data exponeras — bara counts.
  router.get(
    '/cco/runtime/health/mailboxes',
    authMiddleware,
    requireTenantScope,
    requirePermission('mail.read'),
    (_req, res) => {
      try {
        if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.listMessages !== 'function') {
          return res.status(503).json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        // Iterera per mailbox så bara EN shard materialiseras åt gången, i stället
        // för att bygga + sortera en array av HELA storen (listMessages({})). Skalar
        // med antal konton utan minnesspik. Faller tillbaka till allt om mailbox-
        // listan inte kan härledas. Counts/latest är oförändrade.
        const report =
          typeof ccoMailboxTruthStore.getCompletenessReport === 'function'
            ? ccoMailboxTruthStore.getCompletenessReport({ mailboxIds: configuredMailboxIds })
            : null;
        const mailboxIds = report
          ? asArray(report.accountReports)
              .map((account) => normalizeText(account.mailboxId))
              .filter(Boolean)
          : configuredMailboxIds;
        const scopeList = mailboxIds.length ? mailboxIds.map((id) => ({ mailboxIds: [id] })) : [{}];
        const byMailbox = {};
        let totalMessages = 0;
        for (const scope of scopeList) {
          for (const raw of ccoMailboxTruthStore.listMessages(scope)) {
            const m = asObject(raw);
            const mb = normalizeText(m.mailboxAddress) || normalizeText(m.mailboxId) || 'unknown';
            if (!byMailbox[mb]) byMailbox[mb] = { mailboxId: mb, count: 0, latestAt: null };
            byMailbox[mb].count += 1;
            totalMessages += 1;
            const tIso =
              normalizeText(m.sentAt) ||
              normalizeText(m.receivedAt) ||
              normalizeText(m.lastModifiedAt);
            if (tIso) {
              const cur = byMailbox[mb].latestAt ? Date.parse(byMailbox[mb].latestAt) : 0;
              if (Date.parse(tIso) > cur) byMailbox[mb].latestAt = tIso;
            }
          }
        }
        return res.json({
          ok: true,
          totalMessages,
          mailboxes: Object.values(byMailbox).sort((a, b) => b.count - a.count),
          generatedAt: new Date().toISOString(),
          graphReadEnabled: process.env.ARCANA_GRAPH_READ_ENABLED === 'true',
          syncEnabled: Boolean(graphReadConnector),
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'internal_error',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- Mailbox-väljarens status-spegel (RBAC-grindad aggregatstatus) -----
  // GET /cco/runtime/mailboxes
  // Frontendens vänsterräls behöver per mailbox visa vad som faktiskt kan
  // väljas. Läs endast completeness-rapporten: den materialiserar inte alla
  // mejl och exponerar inga adresser, ämnen eller bodies.
  router.get(
    '/cco/runtime/mailboxes',
    authMiddleware,
    requireTenantScope,
    requirePermission('mail.read'),
    (_req, res) => {
      try {
        const report =
          ccoMailboxTruthStore && typeof ccoMailboxTruthStore.getCompletenessReport === 'function'
            ? ccoMailboxTruthStore.getCompletenessReport({ mailboxIds: configuredMailboxIds })
            : null;
        const reportByMailboxId = new Map(
          asArray(report?.accountReports).map((account) => [
            normalizeText(account?.mailboxId).toLowerCase(),
            asObject(account),
          ])
        );
        const deltaReport =
          ccoMailboxTruthStore && typeof ccoMailboxTruthStore.getDeltaSyncReport === 'function'
            ? ccoMailboxTruthStore.getDeltaSyncReport({ mailboxIds: configuredMailboxIds })
            : null;
        const deltaByMailboxId = new Map(
          asArray(deltaReport?.accountReports).map((account) => [
            normalizeText(account?.mailboxId).toLowerCase(),
            asObject(account),
          ])
        );
        const latestIso = (values = []) => {
          const timestamps = asArray(values)
            .map((value) => normalizeText(value))
            .filter((value) => Number.isFinite(Date.parse(value)));
          return timestamps.sort((left, right) => Date.parse(right) - Date.parse(left))[0] || null;
        };
        const mailboxes = configuredMailboxIds.map((mailboxId) => {
          const runtimeStatus =
            typeof mailboxRuntimeStatusProvider === 'function'
              ? asObject(mailboxRuntimeStatusProvider({ mailboxId }))
              : {};
          const isExternalMailbox = normalizeText(runtimeStatus.provider) === 'imap';
          const account = reportByMailboxId.get(mailboxId) || {};
          const deltaAccount = deltaByMailboxId.get(mailboxId) || {};
          const counts = {};
          for (const folder of asArray(account.folderCounts)) {
            const folderType = normalizeText(folder?.folderType).toLowerCase();
            if (folderType === 'inbox' || folderType === 'sent') {
              counts[folderType] = Math.max(0, Number(folder?.totalItemCount) || 0);
            }
          }
          const checkpoints = Object.entries(asObject(deltaAccount.checkpointsByFolderType))
            .filter(([folderType]) => ['inbox', 'sent'].includes(normalizeText(folderType)))
            .map(([, checkpoint]) => asObject(checkpoint))
            .filter((checkpoint) => Object.keys(checkpoint).length > 0);
          const failedCheckpoint = checkpoints.find((checkpoint) =>
            ['error', 'resync_required'].includes(
              normalizeText(checkpoint.syncStatus).toLowerCase()
            )
          );
          return {
            id: mailboxId,
            mailboxId,
            // Keep the established Graph response contract unchanged. Only the
            // server-declared external mailbox carries provider/label metadata
            // for the CCO selector to add it at runtime.
            ...(isExternalMailbox
              ? {
                  label: normalizeText(runtimeStatus.label) || null,
                  provider: 'imap',
                }
              : {}),
            active: isExternalMailbox ? runtimeStatus.active === true : Boolean(graphReadConnector),
            status: isExternalMailbox
              ? normalizeText(runtimeStatus.status) ||
                (runtimeStatus.active === true ? 'active' : 'inactive')
              : graphReadConnector
                ? 'active'
                : 'inactive',
            completenessStatus: normalizeText(account.accountStatus) || 'NOT VERIFIED',
            deltaStatus: normalizeText(deltaAccount.accountStatus) || 'NOT STARTED',
            lastSyncAt: latestIso(
              checkpoints.flatMap((checkpoint) => [
                checkpoint.lastSuccessfulAt,
                checkpoint.lastCompletedAt,
                checkpoint.lastUpdatedAt,
              ])
            ),
            lastAttemptAt: latestIso(checkpoints.map((checkpoint) => checkpoint.lastAttemptedAt)),
            error: failedCheckpoint
              ? {
                  code: normalizeText(failedCheckpoint.lastErrorCode) || 'delta_sync_error',
                  message:
                    normalizeText(failedCheckpoint.lastErrorMessage) || 'Delta-synk misslyckades.',
                  lastAttemptAt: normalizeText(failedCheckpoint.lastAttemptedAt) || null,
                }
              : null,
            counts: {
              // Saknas folderCounts helt betyder det att status-spegeln inte har
              // lokala siffror ännu - det är inte samma sak som en tom mailbox.
              inbox: counts.inbox ?? null,
              sent: counts.sent ?? null,
            },
          };
        });
        return res.json({
          ok: true,
          syncEnabled:
            Boolean(graphReadConnector) ||
            configuredMailboxIds.some((mailboxId) => {
              const runtimeStatus =
                typeof mailboxRuntimeStatusProvider === 'function'
                  ? asObject(mailboxRuntimeStatusProvider({ mailboxId }))
                  : {};
              return runtimeStatus.active === true;
            }),
          mailboxes,
          generatedAt: new Date().toISOString(),
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'internal_error',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- Dashboard: KPI-aggregat -----
  // GET /cco/runtime/dashboard?days=7
  router.get(
    '/cco/runtime/dashboard',
    authMiddleware,
    requireTenantScope,
    requirePermission('mail.read'),
    async (req, res) => {
      try {
        if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.listMessages !== 'function') {
          return res.status(503).json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        const days = Math.max(1, Math.min(90, Number(req.query.days) || 7));
        const nowMs = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;
        const startMs = nowMs - days * dayMs;
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const yesterdayStart = todayStart.getTime() - dayMs;

        const allMessages = ccoMailboxTruthStore.listMessages({});
        // Filter: alla i intervallet
        const inWindow = allMessages.filter((m) => {
          const safe = asObject(m);
          const t = Date.parse(safe.sentAt || safe.receivedAt || safe.lastModifiedAt || '');
          return Number.isFinite(t) && t >= startMs;
        });

        // Volym per dag (senaste N dagar) — för chart
        const volumePerDay = {};
        for (let i = 0; i < days; i += 1) {
          const dKey = new Date(nowMs - i * dayMs).toISOString().slice(0, 10);
          volumePerDay[dKey] = { inbound: 0, outbound: 0 };
        }
        let inboundCount = 0;
        let outboundCount = 0;
        let todayInboundCount = 0;
        let yesterdayInboundCount = 0;
        const perMailboxCount = {};
        const customerActivity = {};
        for (const raw of inWindow) {
          const m = asObject(raw);
          const tIso = m.sentAt || m.receivedAt || m.lastModifiedAt || '';
          const tMs = Date.parse(tIso);
          if (!Number.isFinite(tMs)) continue;
          const dir = deriveDir(m.folderType);
          const dKey = new Date(tMs).toISOString().slice(0, 10);
          if (!volumePerDay[dKey]) volumePerDay[dKey] = { inbound: 0, outbound: 0 };
          if (dir === 'outbound') {
            volumePerDay[dKey].outbound += 1;
            outboundCount += 1;
          } else if (dir === 'inbound') {
            volumePerDay[dKey].inbound += 1;
            inboundCount += 1;
            if (tMs >= todayStart.getTime()) todayInboundCount += 1;
            else if (tMs >= yesterdayStart) yesterdayInboundCount += 1;
          }
          // Per mailbox (sender mailbox)
          const mailboxAddr =
            normalizeText(m.mailboxAddress) || normalizeText(m.mailboxId) || 'okänd';
          if (!perMailboxCount[mailboxAddr])
            perMailboxCount[mailboxAddr] = { total: 0, inbound: 0, outbound: 0, unanswered: 0 };
          perMailboxCount[mailboxAddr].total += 1;
          if (dir === 'outbound') perMailboxCount[mailboxAddr].outbound += 1;
          else if (dir === 'inbound') perMailboxCount[mailboxAddr].inbound += 1;
          // Per kund (customer email)
          const customerEmail =
            normalizeText(asObject(asObject(m.from).emailAddress).address) ||
            normalizeText(m.senderEmail) ||
            normalizeText(m.fromAddress);
          if (customerEmail && dir === 'inbound') {
            const fromName =
              normalizeText(asObject(asObject(m.from).emailAddress).name) ||
              normalizeText(m.senderName) ||
              customerEmail;
            if (!customerActivity[customerEmail])
              customerActivity[customerEmail] = {
                email: customerEmail,
                name: fromName,
                count: 0,
                lastAt: null,
              };
            customerActivity[customerEmail].count += 1;
            const cur = customerActivity[customerEmail].lastAt
              ? Date.parse(customerActivity[customerEmail].lastAt)
              : 0;
            if (tMs > cur) customerActivity[customerEmail].lastAt = tIso;
          }
        }

        // Snitt-svartid + obesvarade trådar: för varje konversation, spara senaste inbound/outbound
        const conversationLatest = {};
        for (const raw of allMessages) {
          const m = asObject(raw);
          const key = normalizeText(m.mailboxConversationId);
          if (!key) continue;
          const tMs = Date.parse(m.sentAt || m.receivedAt || m.lastModifiedAt || '');
          if (!Number.isFinite(tMs)) continue;
          if (!conversationLatest[key]) {
            conversationLatest[key] = {
              inbounds: [],
              outbounds: [],
              lastInboundMs: 0,
              lastInboundMailbox: '',
              lastOutboundMs: 0,
            };
          }
          const dir = deriveDir(m.folderType);
          const mailboxAddr =
            normalizeText(m.mailboxAddress) || normalizeText(m.mailboxId) || 'okänd';
          if (dir === 'inbound') {
            conversationLatest[key].inbounds.push(tMs);
            if (tMs > conversationLatest[key].lastInboundMs) {
              conversationLatest[key].lastInboundMs = tMs;
              conversationLatest[key].lastInboundMailbox = mailboxAddr;
            }
          } else if (dir === 'outbound') {
            conversationLatest[key].outbounds.push(tMs);
            if (tMs > conversationLatest[key].lastOutboundMs) {
              conversationLatest[key].lastOutboundMs = tMs;
            }
          }
        }
        const responseTimes = [];
        let unansweredThreads = 0;
        let slaRiskThreads = 0;
        const SLA_THRESHOLD_MS = 24 * 60 * 60 * 1000;
        for (const key of Object.keys(conversationLatest)) {
          const { inbounds, outbounds, lastInboundMs, lastInboundMailbox, lastOutboundMs } =
            conversationLatest[key];
          if (!inbounds.length) continue;
          inbounds.sort((a, b) => a - b);
          outbounds.sort((a, b) => a - b);
          for (const inb of inbounds) {
            const reply = outbounds.find((o) => o > inb);
            if (reply) {
              const diffH = (reply - inb) / 3600000;
              if (diffH >= 0 && diffH < 168) responseTimes.push(diffH);
              break;
            }
          }
          // Obesvarad = senaste meddelande är inbound och inget outbound efter det
          const isUnanswered =
            lastInboundMs > 0 && (lastOutboundMs === 0 || lastInboundMs > lastOutboundMs);
          if (isUnanswered) {
            unansweredThreads += 1;
            if (lastInboundMailbox) {
              if (!perMailboxCount[lastInboundMailbox])
                perMailboxCount[lastInboundMailbox] = {
                  total: 0,
                  inbound: 0,
                  outbound: 0,
                  unanswered: 0,
                };
              perMailboxCount[lastInboundMailbox].unanswered += 1;
            }
            if (nowMs - lastInboundMs > SLA_THRESHOLD_MS) {
              slaRiskThreads += 1;
            }
          }
        }
        responseTimes.sort((a, b) => a - b);
        const avgResponseHours = responseTimes.length
          ? responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length
          : null;
        const medianResponseHours = responseTimes.length
          ? responseTimes[Math.floor(responseTimes.length / 2)]
          : null;

        // Topp-kunder (efter aktivitet senaste N dagar)
        const topCustomers = Object.values(customerActivity)
          .sort((a, b) => b.count - a.count)
          .slice(0, 8);

        // Volume-array (sorterad äldst → nyast för chart)
        const volumeChart = Object.entries(volumePerDay)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, counts]) => ({ date, ...counts }));

        // SLA-breach-trend: obesvarade trådar grupperade efter senaste inbound-dag,
        // med antal som passerat 24h (breach) samma dag.
        const slaTrend = {};
        for (const key of Object.keys(conversationLatest)) {
          const { lastInboundMs, lastOutboundMs } = conversationLatest[key];
          if (!lastInboundMs) continue;
          const isUnanswered = lastOutboundMs === 0 || lastInboundMs > lastOutboundMs;
          if (!isUnanswered) continue;
          const dKey = new Date(lastInboundMs).toISOString().slice(0, 10);
          if (!slaTrend[dKey]) slaTrend[dKey] = { total: 0, breach: 0 };
          slaTrend[dKey].total += 1;
          if (nowMs - lastInboundMs > SLA_THRESHOLD_MS) slaTrend[dKey].breach += 1;
        }
        const slaTrendChart = Object.entries(slaTrend)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, counts]) => ({ date, ...counts }));

        // Sentimentfördelning från persistenta AI-sammanfattningar i conversation state store.
        const sentimentDistribution = {};
        if (
          ccoConversationStateStore &&
          typeof ccoConversationStateStore.getActiveStatesForTenant === 'function'
        ) {
          try {
            const states = await ccoConversationStateStore.getActiveStatesForTenant({
              tenantId: normalizeText(req.tenantId) || defaultTenantId,
            });
            for (const state of states) {
              const tone = normalizeText(state.aiSummary?.sentiment?.tone).toLowerCase();
              const label = normalizeText(state.aiSummary?.sentiment?.label).toLowerCase();
              const bucket = tone || label || 'unknown';
              sentimentDistribution[bucket] = (sentimentDistribution[bucket] || 0) + 1;
            }
          } catch (sentimentErr) {
            // Sentiment-aggregering får inte blockera svaret.
            console.error('Dashboard sentiment aggregation failed:', sentimentErr);
          }
        }

        return res.json({
          ok: true,
          windowDays: days,
          generatedAt: new Date().toISOString(),
          today: { inboundCount: todayInboundCount },
          yesterday: { inboundCount: yesterdayInboundCount },
          totals: {
            inbound: inboundCount,
            outbound: outboundCount,
            total: inboundCount + outboundCount,
          },
          responseTime: {
            count: responseTimes.length,
            avgHours: avgResponseHours,
            medianHours: medianResponseHours,
          },
          unansweredThreads,
          slaRiskThreads,
          slaThresholdHours: 24,
          perMailbox: perMailboxCount,
          topCustomers,
          volumeChart,
          slaTrendChart,
          sentimentDistribution,
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'internal_error',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- Settings-info: mailboxar + AI-konfiguration -----
  // GET /cco/runtime/settings/info
  router.get(
    '/cco/runtime/settings/info',
    authMiddleware,
    requireTenantScope,
    requirePermission('settings.read'),
    (_req, res) => {
      try {
        // Sammanställ mailbox-info från allowlist + senaste sync
        const allowlistRaw = String(process.env.ARCANA_MAILBOX_ALLOWLIST || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const mailboxIds = allowlistRaw.length > 0 ? allowlistRaw : mailboxIdsForSync || [];
        const ai = {
          provider: openai && openaiModel ? 'openai' : 'heuristic',
          model: openai && openaiModel ? openaiModel : null,
          status: openai && openaiModel ? 'aktiv' : 'fallback',
        };
        const liveSendReady = Boolean(
          graphSendConnector && typeof graphSendConnector.sendReply === 'function'
        );
        const testRedirectActive =
          shadowSendEnabled !== true && liveSendReady && Boolean(normalizeText(sendTestRecipient));
        const sendMode =
          shadowSendEnabled === true
            ? 'shadow'
            : !liveSendReady
              ? 'off'
              : testRedirectActive
                ? 'live_test'
                : 'live';
        const send = {
          // enabled = skarp sändning möjlig. Shadow räknas inte som skarpt.
          enabled: liveSendReady,
          shadow: shadowSendEnabled === true,
          testRedirect: testRedirectActive,
          mode: sendMode,
          status:
            sendMode === 'shadow'
              ? 'shadow (dry-run)'
              : sendMode === 'live_test'
                ? 'live (test-redirect)'
                : sendMode === 'live'
                  ? 'aktiv'
                  : 'avstängd',
        };
        const sync = {
          enabled: Boolean(graphReadConnector),
          status: graphReadConnector ? 'aktiv' : 'avstängd',
          lookbackDays: syncLookbackDays || 14,
        };
        return res.json({
          ok: true,
          mailboxes: mailboxIds.map((id) => ({ mailboxId: id, mailboxAddress: id })),
          ai,
          send,
          sync,
          tenantId: defaultTenantId,
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'internal_error',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- Mejl-mallar -----
  // GET /cco/runtime/mail-templates                          → lista alla
  // POST /cco/runtime/mail-templates                         → upsert (templateId optional)
  // DELETE /cco/runtime/mail-templates/:templateId           → ta bort
  router.get(
    '/cco/runtime/mail-templates',
    authMiddleware,
    requireTenantScope,
    requirePermission('templates.read'),
    (req, res) => {
      try {
        if (!ccoMailTemplateStore) {
          return res.status(503).json({ ok: false, error: 'template_store_unavailable' });
        }
        /**
         * ORD-216 — mallistan filtreras per klinik.
         *
         * Kommunikationspanelen skickade redan `?brand=` mot en route som inte
         * fanns; parametern var ett löfte utan mottagare. Nu tas den emot.
         *
         * Utan `brand` returneras allt, som förut. Med `brand` returneras
         * klinikens egna mallar plus de gemensamma — aldrig den andra
         * klinikens. `appliedBrand` skickas med i svaret så att den som läser
         * listan kan se VILKEN filtrering som gällde; ett tyst filter är
         * omöjligt att skilja från en kort lista.
         */
        const brand = ccoMailTemplateStore.normalizeBrand
          ? ccoMailTemplateStore.normalizeBrand(req.query && req.query.brand)
          : null;
        const templates = ccoMailTemplateStore.listTemplates({ brand });
        return res.json({ ok: true, count: templates.length, appliedBrand: brand, templates });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'internal_error',
          detail: String((err && err.message) || err),
        });
      }
    }
  );
  router.post(
    '/cco/runtime/mail-templates',
    authMiddleware,
    requireTenantScope,
    requirePermission('templates.write'),
    express.json({ limit: '32kb' }),
    async (req, res) => {
      try {
        if (!ccoMailTemplateStore) {
          return res.status(503).json({ ok: false, error: 'template_store_unavailable' });
        }
        const body = asObject(req.body);
        const saved = await ccoMailTemplateStore.saveTemplate({
          templateId: normalizeText(body.templateId) || undefined,
          label: normalizeText(body.label),
          icon: normalizeText(body.icon),
          body: normalizeText(body.body),
        });
        return res.json({ ok: true, template: saved });
      } catch (err) {
        const msg = String((err && err.message) || err);
        const isValidation = /krävs|max/.test(msg);
        return res.status(isValidation ? 400 : 500).json({
          ok: false,
          error: isValidation ? 'validation' : 'internal_error',
          detail: msg,
        });
      }
    }
  );
  router.delete(
    '/cco/runtime/mail-templates/:templateId',
    authMiddleware,
    requireTenantScope,
    requirePermission('templates.write'),
    async (req, res) => {
      try {
        if (!ccoMailTemplateStore) {
          return res.status(503).json({ ok: false, error: 'template_store_unavailable' });
        }
        const ok = await ccoMailTemplateStore.deleteTemplate(req.params.templateId);
        if (!ok) return res.status(404).json({ ok: false, error: 'not_found' });
        return res.json({ ok: true });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'internal_error',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  return router;
}

module.exports = {
  createCcoConversationRouter,
  // Exponerad för tester: HTML-kropp för sandboxad trådrendering.
  deriveBodyHtml,
  // Exponerad för tester: en bubbla ska bära ett mejl, inte citerad historik.
  deriveDisplayMailBody,
  // Exponerad för tester: rollup-medveten trådhämtning ur lokala truth-storen.
  fetchSortedConversationMessages,
  fetchSortedConversationMessagesForKeys,
  fetchSortedIngestionConversationMessagesForKeys,
  enrichConversationMessagesWithIngestion,
  parseConversationContactScopeQuery,
  rewriteMailCidImageSources,
  deriveBody,
  collectConversationAttachments,
  // Exponerad för tester: fäller ihop identiska mailkopior (dubbletter) till ett.
  collapseDuplicateMessages,
  // Exponerad för D1-tester (bulk preview-utvärdering, ren/ingen mutation).
  evaluateConversationBulkItem,
  // Exponerad för tester: sanering av svarsmejl-HTML innan Graph-sändning.
  sanitizeReplyHtml,
};
