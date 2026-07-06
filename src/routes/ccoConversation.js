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
const { extractTextFromHtml } = require('../ops/ccoMailContentParser');
const {
  messageMatchesContactFormScope,
  normalizeEmail,
  parseContactFormScopedConversationKey,
} = require('../ops/ccoContactFormIdentity');
const { toCanonicalMailboxConversationKey } = require('../ops/ccoMailboxTruthWorklistReadModel');
const { computeReplyConfidence } = require('../ops/replyConfidencePanel');
const { requirePermission } = require('../security/ccoRbac');

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

function deriveDir(folderType) {
  const ft = String(folderType || '').toLowerCase();
  if (ft === 'sent' || ft.includes('sent')) return 'outbound';
  if (ft === 'drafts' || ft.includes('draft')) return 'draft';
  return 'inbound';
}

function deriveFromName(message) {
  const safe = asObject(message);
  const candidates = [
    safe.senderName,
    safe.fromName,
    asObject(asObject(safe.from).emailAddress).name,
    asObject(safe.from).name,
    asObject(asObject(safe.sender).emailAddress).name,
  ];
  for (const c of candidates) {
    const t = normalizeText(c);
    if (t) return t;
  }
  const emailFallback =
    normalizeText(safe.senderEmail) ||
    normalizeText(safe.fromAddress) ||
    normalizeText(asObject(asObject(safe.from).emailAddress).address);
  return emailFallback || '(okänd avsändare)';
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

function deriveTime(message) {
  const safe = asObject(message);
  return (
    normalizeText(safe.sentAt) ||
    normalizeText(safe.receivedAt) ||
    normalizeText(safe.lastModifiedAt) ||
    ''
  );
}

function normalizeBodyText(value = '') {
  return normalizeText(value)
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function addBodyCandidate(candidates, source, text, { previewLike = false, rank = 0 } = {}) {
  const normalized = normalizeBodyText(text);
  if (!normalized) return;
  candidates.push({ source, text: normalized, previewLike, rank });
}

function pickBestBodyCandidate(candidates = [], preview = '') {
  const normalizedPreview = normalizeBodyText(preview);
  const seen = new Set();
  const unique = [];
  for (const candidate of candidates) {
    const key = candidate.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  if (!unique.length) return '';
  unique.sort((a, b) => {
    const aPreviewLike =
      a.previewLike ||
      (normalizedPreview &&
        a.text.length <= normalizedPreview.length + 12 &&
        normalizedPreview.startsWith(a.text.slice(0, Math.min(24, a.text.length))));
    const bPreviewLike =
      b.previewLike ||
      (normalizedPreview &&
        b.text.length <= normalizedPreview.length + 12 &&
        normalizedPreview.startsWith(b.text.slice(0, Math.min(24, b.text.length))));
    if (aPreviewLike !== bPreviewLike) return aPreviewLike ? 1 : -1;
    if (a.rank !== b.rank) return b.rank - a.rank;
    return b.text.length - a.text.length;
  });
  return unique[0].text;
}

function deriveBody(message) {
  const safe = asObject(message);
  const body = asObject(safe.body);
  const rawJson = asObject(safe.rawJson);
  const rawBody = asObject(rawJson.body);
  const rawUniqueBody = asObject(rawJson.uniqueBody);
  const uniqueBody = asObject(safe.uniqueBody);
  const mailDocument = asObject(safe.mailDocument);
  const preview =
    normalizeText(safe.bodyPreview) ||
    normalizeText(safe.preview) ||
    normalizeText(safe.snippet) ||
    normalizeText(rawJson.bodyPreview);
  const candidates = [];
  addBodyCandidate(candidates, 'mailDocument.primaryBodyText', mailDocument.primaryBodyText, {
    rank: 9,
  });
  addBodyCandidate(
    candidates,
    'mailDocument.primaryBodyHtml',
    extractTextFromHtml(mailDocument.primaryBodyHtml),
    { rank: 9 }
  );
  addBodyCandidate(candidates, 'rawJson.body.content', extractTextFromHtml(rawBody.content), {
    rank: 8,
  });
  addBodyCandidate(
    candidates,
    'rawJson.uniqueBody.content',
    extractTextFromHtml(rawUniqueBody.content),
    { rank: 8 }
  );
  addBodyCandidate(candidates, 'safe.body.content', extractTextFromHtml(body.content), {
    rank: 7,
  });
  addBodyCandidate(candidates, 'safe.uniqueBody.content', extractTextFromHtml(uniqueBody.content), {
    rank: 7,
  });
  addBodyCandidate(candidates, 'safe.bodyHtml', extractTextFromHtml(safe.bodyHtml), { rank: 7 });
  addBodyCandidate(candidates, 'safe.body_html', extractTextFromHtml(safe.body_html), { rank: 7 });
  addBodyCandidate(candidates, 'rawJson.bodyHtml', extractTextFromHtml(rawJson.bodyHtml), {
    rank: 7,
  });
  addBodyCandidate(candidates, 'rawJson.body_html', extractTextFromHtml(rawJson.body_html), {
    rank: 7,
  });
  addBodyCandidate(candidates, 'safe.bodyText', safe.bodyText, { rank: 5 });
  addBodyCandidate(candidates, 'safe.body_text', safe.body_text, { rank: 5 });
  addBodyCandidate(candidates, 'safe.text', safe.text, { rank: 5 });
  addBodyCandidate(candidates, 'rawJson.bodyText', rawJson.bodyText, { rank: 5 });
  addBodyCandidate(candidates, 'rawJson.body_text', rawJson.body_text, { rank: 5 });
  addBodyCandidate(candidates, 'safe.bodyString', typeof safe.body === 'string' ? safe.body : '', {
    rank: 4,
  });
  addBodyCandidate(
    candidates,
    'rawJson.bodyString',
    typeof rawJson.body === 'string' ? rawJson.body : '',
    { rank: 4 }
  );
  addBodyCandidate(candidates, 'preview', preview, { previewLike: true, rank: 1 });
  return pickBestBodyCandidate(candidates, preview);
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

function parseConversationContactScopeQuery(query = {}) {
  const email = normalizeEmail(
    query.customerEmail ||
      query.contactEmail ||
      query.counterpartyEmail ||
      query.email ||
      query.customer_email ||
      ''
  );
  return email ? { contactEmail: email } : {};
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

function fetchSortedConversationMessagesForKeys(store, keys = [], options = {}) {
  const safeKeys = Array.from(
    new Set(
      asArray(keys)
        .map((key) => normalizeText(key))
        .filter(Boolean)
    )
  );
  if (!safeKeys.length) return [];
  return fetchSortedConversationMessages(store, safeKeys[0], safeKeys.slice(1), options);
}

function buildConversationLookupScopes(keys = [], options = {}) {
  const safeOptions = asObject(options);
  const fallbackContactEmail = normalizeEmail(
    safeOptions.contactEmail || safeOptions.customerEmail || safeOptions.email
  );
  const fallbackContactReference = normalizeText(
    safeOptions.contactReference || safeOptions.customerReference || safeOptions.reference
  ).toLowerCase();
  const scopes = asArray(keys)
    .map((rawKey) => {
      const requestedKey = normalizeText(rawKey);
      if (!requestedKey) return null;
      const scopedKey = parseContactFormScopedConversationKey(requestedKey);
      return {
        requestedKey,
        baseKey: normalizeText(scopedKey.baseKey || requestedKey),
        contactEmail: normalizeText(scopedKey.email).toLowerCase(),
        contactReference: normalizeText(scopedKey.reference).toLowerCase(),
      };
    })
    .filter(Boolean);
  const contactEmailByBaseKey = new Map();
  const contactReferenceByBaseKey = new Map();
  for (const scope of scopes) {
    if (scope.baseKey && scope.contactEmail && !contactEmailByBaseKey.has(scope.baseKey)) {
      contactEmailByBaseKey.set(scope.baseKey, scope.contactEmail);
    }
    if (scope.baseKey && scope.contactReference && !contactReferenceByBaseKey.has(scope.baseKey)) {
      contactReferenceByBaseKey.set(scope.baseKey, scope.contactReference);
    }
  }
  if (
    contactEmailByBaseKey.size === 0 &&
    contactReferenceByBaseKey.size === 0 &&
    !fallbackContactEmail &&
    !fallbackContactReference
  ) {
    return scopes;
  }
  return scopes.map((scope) => {
    const scopedContactEmail = contactEmailByBaseKey.get(scope.baseKey);
    const scopedContactReference = contactReferenceByBaseKey.get(scope.baseKey);
    if (scopedContactEmail && !scope.contactEmail) {
      return { ...scope, contactEmail: scopedContactEmail };
    }
    if (scopedContactReference && !scope.contactEmail && !scope.contactReference) {
      return { ...scope, contactReference: scopedContactReference };
    }
    if (fallbackContactEmail && !scope.contactEmail) {
      return { ...scope, contactEmail: fallbackContactEmail };
    }
    if (fallbackContactReference && !scope.contactEmail && !scope.contactReference) {
      return { ...scope, contactReference: fallbackContactReference };
    }
    return scope;
  });
}

function conversationMessageMatchesScopes(message = {}, scopes = []) {
  if (!scopes.length) return false;
  const aliases = buildConversationAliases(message);
  return scopes.some((scope) => {
    const aliasMatches = aliases.has(scope.requestedKey) || aliases.has(scope.baseKey);
    if (!aliasMatches) return false;
    if (!scope.contactEmail && !scope.contactReference) return true;
    return messageMatchesContactFormScope(message, {
      email: scope.contactEmail,
      reference: scope.contactReference,
    });
  });
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
function fetchSortedConversationMessages(store, key, memberKeys = [], options = {}) {
  if (!store || typeof store.listMessages !== 'function') return [];
  const safeMemberKeys = Array.isArray(memberKeys) ? memberKeys : [];
  const scopes = buildConversationLookupScopes([key, ...safeMemberKeys], options);
  if (!scopes.length) return [];
  const all = store.listMessages({});
  const matches = all.filter((m) => conversationMessageMatchesScopes(asObject(m), scopes));
  return [...matches].sort((a, b) => String(deriveTime(a)).localeCompare(String(deriveTime(b))));
}

function buildConversationAliases(message = {}) {
  const safe = asObject(message);
  const mailboxId =
    normalizeText(safe.mailboxId) ||
    normalizeText(safe.mailboxAddress) ||
    normalizeText(safe.userPrincipalName);
  return new Set(
    [
      normalizeText(safe.mailboxConversationId),
      normalizeText(safe.conversationId),
      normalizeText(safe.graphMessageId),
      normalizeText(safe.immutableGraphId),
      normalizeText(safe.messageId),
      normalizeText(safe.rawMessageId),
      toCanonicalMailboxConversationKey({
        mailboxId,
        conversationId: safe.conversationId,
        mailboxConversationId: safe.mailboxConversationId,
        messageId: safe.graphMessageId || safe.messageId || safe.rawMessageId,
      }),
    ].filter(Boolean)
  );
}

function toConversationMessageFromRaw(raw = {}) {
  const safe = asObject(raw);
  const rawJson = asObject(safe.rawJson);
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
  const toAddresses = Array.isArray(safe.toAddresses) ? safe.toAddresses : safe.to || [];
  return {
    ...safe,
    graphMessageId:
      normalizeText(safe.graphMessageId) ||
      normalizeText(safe.messageId) ||
      normalizeText(safe.rawMessageId) ||
      normalizeText(safe.id),
    messageId:
      normalizeText(safe.messageId) || normalizeText(safe.rawMessageId) || normalizeText(safe.id),
    mailboxConversationId:
      normalizeText(safe.mailboxConversationId) || normalizeText(safe.conversationId),
    mailboxAddress: normalizeText(safe.mailboxAddress) || normalizeText(safe.mailboxId),
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
      normalizeText(safe.persistedAt),
    toRecipients: asArray(toAddresses)
      .map((address) => ({ address: normalizeText(address) }))
      .filter((item) => item.address),
  };
}

function fetchSortedIngestionConversationMessages(store, key, options = {}) {
  if (!store || typeof store.getState !== 'function') return [];
  const scopes = buildConversationLookupScopes([key], options);
  if (!scopes.length) return [];
  const state = asObject(store.getState());
  const rawMessages = Object.values(asObject(state.mailRawMessages));
  const matches = rawMessages
    .map(toConversationMessageFromRaw)
    .filter((message) => conversationMessageMatchesScopes(message, scopes));
  return [...matches].sort((a, b) => String(deriveTime(a)).localeCompare(String(deriveTime(b))));
}

function fetchSortedIngestionConversationMessagesForKeys(store, keys = [], options = {}) {
  if (!store || typeof store.getState !== 'function') return [];
  const safeKeys = Array.from(
    new Set(
      asArray(keys)
        .map((key) => normalizeText(key))
        .filter(Boolean)
    )
  );
  const scopes = buildConversationLookupScopes(safeKeys, options);
  if (!scopes.length) return [];
  const state = asObject(store.getState());
  const rawMessages = Object.values(asObject(state.mailRawMessages));
  const matches = rawMessages
    .map(toConversationMessageFromRaw)
    .filter((message) => conversationMessageMatchesScopes(message, scopes));
  return dedupeConversationMessages(matches).sort((a, b) =>
    String(deriveTime(a)).localeCompare(String(deriveTime(b)))
  );
}

function buildIngestionMessageLookup(store) {
  if (!store || typeof store.getState !== 'function') return new Map();
  const state = asObject(store.getState());
  const lookup = new Map();
  Object.values(asObject(state.mailRawMessages)).forEach((raw) => {
    const message = toConversationMessageFromRaw(raw);
    buildConversationAliases(message).forEach((alias) => {
      if (alias && !lookup.has(alias)) lookup.set(alias, message);
    });
  });
  return lookup;
}

function bodyTextLooksLikePreview(text = '', preview = '') {
  const safeText = normalizeBodyText(text);
  const safePreview = normalizeBodyText(preview);
  if (!safeText || !safePreview) return false;
  if (safeText.length > safePreview.length + 12) return false;
  return safePreview.startsWith(safeText.slice(0, Math.min(24, safeText.length)));
}

function chooseRicherBodyText(existing = '', candidate = '', preview = '') {
  const safeExisting = normalizeBodyText(existing);
  const safeCandidate = normalizeBodyText(candidate);
  if (!safeExisting) return safeCandidate;
  if (!safeCandidate) return safeExisting;

  const existingPreviewLike = bodyTextLooksLikePreview(safeExisting, preview);
  const candidatePreviewLike = bodyTextLooksLikePreview(safeCandidate, preview);
  if (existingPreviewLike !== candidatePreviewLike) {
    return existingPreviewLike ? safeCandidate : safeExisting;
  }
  if (safeCandidate.length > safeExisting.length + 24) return safeCandidate;
  return safeExisting;
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

function enrichConversationMessagesWithIngestion(messages, store) {
  const lookup = buildIngestionMessageLookup(store);
  if (!lookup.size) return messages;
  return messages.map((message) => {
    const raw = [...buildConversationAliases(message)]
      .map((alias) => lookup.get(alias))
      .find(Boolean);
    if (!raw) return message;
    const preview =
      normalizeText(message.bodyPreview) ||
      normalizeText(message.preview) ||
      normalizeText(message.snippet) ||
      normalizeText(raw.bodyPreview) ||
      normalizeText(raw.preview) ||
      normalizeText(raw.snippet);
    const mergedBodyText = chooseRicherBodyText(deriveBody(message), deriveBody(raw), preview);
    return {
      ...message,
      bodyText: mergedBodyText || chooseRicherBodyText(message.bodyText, raw.bodyText, preview),
      body_text: chooseRicherBodyText(message.body_text, raw.body_text, preview),
      bodyHtml: chooseRicherHtml(message.bodyHtml, raw.bodyHtml),
      body_html: chooseRicherHtml(message.body_html, raw.body_html),
      text: chooseRicherBodyText(message.text, raw.text, preview),
      rawJson: Object.keys(asObject(message.rawJson)).length ? message.rawJson : raw.rawJson,
      mailDocument: Object.keys(asObject(message.mailDocument)).length
        ? message.mailDocument
        : raw.mailDocument,
      body: Object.keys(asObject(message.body)).length ? message.body : raw.body,
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
function evaluateConversationBulkItem(store, item, action) {
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
  const sorted = fetchSortedConversationMessages(store, conversationKey);
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
function toSummarizeInputMessage(m) {
  const safe = asObject(m);
  const dir = deriveDir(safe.folderType);
  // SummarizeThread förväntar 'direction' = 'inbound' eller 'outbound'
  const direction = dir === 'outbound' ? 'outbound' : 'inbound';
  return {
    direction,
    body: deriveBody(safe),
    bodyPreview: normalizeText(safe.bodyPreview) || '',
    sentAt: deriveTime(safe),
    recordedAt: deriveTime(safe),
    from: deriveFromName(safe),
  };
}

async function safeAuditConversation(authStore, event) {
  if (!authStore || typeof authStore.addAuditEvent !== 'function') return;
  await authStore.addAuditEvent(event);
}

function createCcoConversationRouter({
  ccoMailboxTruthStore,
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
  syncLookbackDays = 14,
  ccoConversationStateStore = null,
  ccoConversationNotesStore = null,
  ccoMailTemplateStore = null,
  clientoBookingStore = null,
  defaultTenantId = 'cco',
  authStore = null,
} = {}) {
  const router = express.Router();
  const authMiddleware =
    typeof requireAuth === 'function' ? requireAuth : (_req, _res, next) => next();

  router.get(
    '/cco/runtime/conversation/:key/messages',
    authMiddleware,
    requirePermission('mail.read'),
    (req, res) => {
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
        const truthMessages = fetchSortedConversationMessages(
          ccoMailboxTruthStore,
          key,
          memberKeys,
          contactScope
        );
        const sorted = truthMessages.length
          ? enrichConversationMessagesWithIngestion(truthMessages, mailIngestionStore)
          : fetchSortedIngestionConversationMessagesForKeys(
              mailIngestionStore,
              lookupKeys,
              contactScope
            );
        const messages = sorted.map((m) => {
          const safe = asObject(m);
          const from = deriveFromName(safe);
          const senderEmail = deriveSenderEmail(safe);
          const mailboxId = normalizeText(safe.mailboxId) || null;
          const mailboxAddress = normalizeText(safe.mailboxAddress) || mailboxId;
          return {
            id: normalizeText(safe.graphMessageId) || normalizeText(safe.messageId) || null,
            from,
            senderEmail: senderEmail || null,
            fromEmail: senderEmail || null,
            initials: deriveInitials(from),
            dir: deriveDir(safe.folderType),
            time: deriveTime(safe),
            body: deriveBody(safe),
            subject: normalizeText(safe.subject) || null,
            mailboxId,
            mailboxAddress: mailboxAddress || null,
            folderType: normalizeText(safe.folderType) || null,
          };
        });
        return res.json({
          ok: true,
          conversationKey: key,
          messageCount: messages.length,
          messages,
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
        const sorted = fetchSortedConversationMessages(ccoMailboxTruthStore, key);
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
        return res.json({
          ok: true,
          conversationKey: key,
          summary: {
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
          },
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

  // ----- Cliento-bokningar: kund-historik + föreslagna lediga tider -----
  // GET /cco/runtime/conversation/:key/bookings  → { existingBookings, suggestedSlots }
  router.get(
    '/cco/runtime/conversation/:key/bookings',
    authMiddleware,
    requirePermission('mail.read'),
    (req, res) => {
      try {
        if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.listMessages !== 'function') {
          return res.status(503).json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) return res.status(400).json({ ok: false, error: 'missing_conversation_key' });
        const sorted = fetchSortedConversationMessages(ccoMailboxTruthStore, key);
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
        const sorted = fetchSortedConversationMessages(ccoMailboxTruthStore, key);
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
        const sorted = fetchSortedConversationMessages(ccoMailboxTruthStore, key);
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
        const bodyHtml = normalizeText(asObject(req.body).bodyHtml);
        if (!body) {
          return res.status(400).json({ ok: false, error: 'missing_body' });
        }
        const sorted = fetchSortedConversationMessages(ccoMailboxTruthStore, key);
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
        if (!['handled', 'reply_later', 'reopen'].includes(action)) {
          return res.status(400).json({
            ok: false,
            error: 'invalid_action',
            detail: 'action måste vara handled | reply_later | reopen',
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

        // Verifiera att konversationen finns och att customerId matchar — gäller alla actions
        const sorted = fetchSortedConversationMessages(ccoMailboxTruthStore, key);
        if (sorted.length === 0) {
          return res.status(404).json({
            ok: false,
            error: 'conversation_not_found',
            detail: 'Ingen konversation hittades för angivet konversationsnyckel',
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

        const actionState = action; // 'handled' | 'reply_later'
        const needsReplyStatusOverride = action === 'handled' ? 'handled' : 'needs_reply';
        const nextActionLabel = action === 'handled' ? 'Markerad som klar' : 'Påminnelse senare';

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
    (req, res) => {
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
        const rows = items.map((item) =>
          evaluateConversationBulkItem(ccoMailboxTruthStore, item, action)
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
          const evaluation = evaluateConversationBulkItem(ccoMailboxTruthStore, item, action);
          if (!evaluation.eligible) {
            skipped.push({
              conversationKey: evaluation.conversationKey,
              warnings: evaluation.warnings,
            });
            continue;
          }
          try {
            const sorted = fetchSortedConversationMessages(
              ccoMailboxTruthStore,
              evaluation.conversationKey
            );
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
        const notes = ccoConversationNotesStore.listNotes({ conversationKey: key });
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
        const note = await ccoConversationNotesStore.addNote({
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
        const reqMailboxIds = Array.isArray(asObject(req.body).mailboxIds)
          ? req.body.mailboxIds.map((s) => normalizeText(s).toLowerCase()).filter(Boolean)
          : [];
        const mailboxIds = reqMailboxIds.length > 0 ? reqMailboxIds : mailboxIdsForSync || [];
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
            const { runGraphBackfill } = require('../ops/bootstrapRunner');
            const result = await runGraphBackfill({
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

  // ----- Mailbox health (PUBLIC, ingen auth — bara aggregat-counts) -----
  // GET /cco/runtime/health/mailboxes
  // Visar antal mejl per mailbox + senaste mejlets timestamp.
  // Inga email-bodies eller customer-data exponeras — bara counts.
  router.get('/cco/runtime/health/mailboxes', (_req, res) => {
    try {
      if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.listMessages !== 'function') {
        return res.status(503).json({ ok: false, error: 'mailbox_truth_store_unavailable' });
      }
      const all = ccoMailboxTruthStore.listMessages({});
      const byMailbox = {};
      for (const raw of all) {
        const m = asObject(raw);
        const mb = normalizeText(m.mailboxAddress) || normalizeText(m.mailboxId) || 'unknown';
        if (!byMailbox[mb]) byMailbox[mb] = { mailboxId: mb, count: 0, latestAt: null };
        byMailbox[mb].count += 1;
        const tIso =
          normalizeText(m.sentAt) || normalizeText(m.receivedAt) || normalizeText(m.lastModifiedAt);
        if (tIso) {
          const cur = byMailbox[mb].latestAt ? Date.parse(byMailbox[mb].latestAt) : 0;
          if (Date.parse(tIso) > cur) byMailbox[mb].latestAt = tIso;
        }
      }
      return res.json({
        ok: true,
        totalMessages: all.length,
        mailboxes: Object.values(byMailbox).sort((a, b) => b.count - a.count),
        generatedAt: new Date().toISOString(),
        graphReadEnabled: process.env.ARCANA_GRAPH_READ_ENABLED === 'true',
        syncEnabled: Boolean(graphReadConnector),
      });
    } catch (err) {
      return res
        .status(500)
        .json({ ok: false, error: 'internal_error', detail: String((err && err.message) || err) });
    }
  });

  // ----- Dashboard: KPI-aggregat -----
  // GET /cco/runtime/dashboard?days=7
  router.get('/cco/runtime/dashboard', authMiddleware, (req, res) => {
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
          perMailboxCount[mailboxAddr] = { total: 0, inbound: 0, outbound: 0 };
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

      // Snitt-svartid: för varje konversation, hitta första outbound efter senaste inbound
      const conversationLatest = {};
      for (const raw of allMessages) {
        const m = asObject(raw);
        const key = normalizeText(m.mailboxConversationId);
        if (!key) continue;
        const tMs = Date.parse(m.sentAt || m.receivedAt || m.lastModifiedAt || '');
        if (!Number.isFinite(tMs)) continue;
        if (!conversationLatest[key]) conversationLatest[key] = { inbounds: [], outbounds: [] };
        const dir = deriveDir(m.folderType);
        if (dir === 'inbound') conversationLatest[key].inbounds.push(tMs);
        else if (dir === 'outbound') conversationLatest[key].outbounds.push(tMs);
      }
      const responseTimes = [];
      for (const key of Object.keys(conversationLatest)) {
        const { inbounds, outbounds } = conversationLatest[key];
        if (!inbounds.length || !outbounds.length) continue;
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
        perMailbox: perMailboxCount,
        topCustomers,
        volumeChart,
      });
    } catch (err) {
      return res
        .status(500)
        .json({ ok: false, error: 'internal_error', detail: String((err && err.message) || err) });
    }
  });

  // ----- Settings-info: mailboxar + AI-konfiguration -----
  // GET /cco/runtime/settings/info
  router.get('/cco/runtime/settings/info', authMiddleware, (_req, res) => {
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
      return res
        .status(500)
        .json({ ok: false, error: 'internal_error', detail: String((err && err.message) || err) });
    }
  });

  // ----- Mejl-mallar -----
  // GET /cco/runtime/mail-templates                          → lista alla
  // POST /cco/runtime/mail-templates                         → upsert (templateId optional)
  // DELETE /cco/runtime/mail-templates/:templateId           → ta bort
  router.get('/cco/runtime/mail-templates', authMiddleware, (_req, res) => {
    try {
      if (!ccoMailTemplateStore) {
        return res.status(503).json({ ok: false, error: 'template_store_unavailable' });
      }
      const templates = ccoMailTemplateStore.listTemplates();
      return res.json({ ok: true, count: templates.length, templates });
    } catch (err) {
      return res
        .status(500)
        .json({ ok: false, error: 'internal_error', detail: String((err && err.message) || err) });
    }
  });
  router.post(
    '/cco/runtime/mail-templates',
    authMiddleware,
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
  router.delete('/cco/runtime/mail-templates/:templateId', authMiddleware, async (req, res) => {
    try {
      if (!ccoMailTemplateStore) {
        return res.status(503).json({ ok: false, error: 'template_store_unavailable' });
      }
      const ok = await ccoMailTemplateStore.deleteTemplate(req.params.templateId);
      if (!ok) return res.status(404).json({ ok: false, error: 'not_found' });
      return res.json({ ok: true });
    } catch (err) {
      return res
        .status(500)
        .json({ ok: false, error: 'internal_error', detail: String((err && err.message) || err) });
    }
  });

  return router;
}

module.exports = {
  createCcoConversationRouter,
  // Exponerad för tester: rollup-medveten trådhämtning ur lokala truth-storen.
  fetchSortedConversationMessages,
  fetchSortedConversationMessagesForKeys,
  fetchSortedIngestionConversationMessagesForKeys,
  enrichConversationMessagesWithIngestion,
  // Exponerad för D1-tester (bulk preview-utvärdering, ren/ingen mutation).
  evaluateConversationBulkItem,
};
