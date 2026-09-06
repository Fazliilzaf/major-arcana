'use strict';

/**
 * ccoAiThreadSummary — återanvändbara byggblock för AI-sammanfattning av
 * konversationstrådar. Ursprungligen bodde dessa funktioner i routes/ccoConversation.js;
 * de har extraherats så att både /summary-routen och nya context-service kan
 * använda samma logik utan duplicering.
 */

const { runSummarizeThreadCapability } = require('../capabilities/summarizeThread');
const { extractTextFromHtml } = require('../ops/ccoMailContentParser');
const {
  messageMatchesContactFormScope,
  normalizeEmail,
  parseContactFormScopedConversationKey,
} = require('../ops/ccoContactFormIdentity');
const { toCanonicalMailboxConversationKey } = require('../ops/ccoMailboxTruthWorklistReadModel');
const { canonicalTenantId, HAIR_TP_CANONICAL } = require('../tenant/tenantIdCanonical');

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
  return unique.reduce(
    (best, candidate) => chooseRicherBodyText(best, candidate.text, normalizedPreview),
    ''
  );
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

function firstNormalizedText(...values) {
  return values.map((value) => normalizeText(value)).find(Boolean) || '';
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
  const primaryScope = scopes[0] || {};
  const primaryContactEmail = normalizeText(primaryScope.contactEmail).toLowerCase();
  const primaryContactReference = normalizeText(primaryScope.contactReference).toLowerCase();
  if (
    contactEmailByBaseKey.size === 0 &&
    contactReferenceByBaseKey.size === 0 &&
    !primaryContactEmail &&
    !primaryContactReference &&
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
    if (primaryContactEmail && !scope.contactEmail) {
      return { ...scope, contactEmail: primaryContactEmail };
    }
    if (primaryContactReference && !scope.contactEmail && !scope.contactReference) {
      return { ...scope, contactReference: primaryContactReference };
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
  const keyMailboxIds = deriveMailboxIdsFromLookupKeys([key, ...safeMemberKeys]);
  const hintMailboxIds = asArray(asObject(options).mailboxHints)
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
  const overrideMailboxIds = asArray(asObject(options).mailboxIdsOverride)
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
  const mailboxIds = overrideMailboxIds.length
    ? overrideMailboxIds
    : Array.from(new Set([...keyMailboxIds, ...hintMailboxIds]));
  const all = store.listMessages(mailboxIds.length ? { mailboxIds } : {});
  const matches = all.filter((m) => conversationMessageMatchesScopes(asObject(m), scopes));
  const hydrated =
    typeof store.hydrateMessageBodies === 'function'
      ? await store.hydrateMessageBodies(matches)
      : matches;
  return [...hydrated].sort((a, b) => String(deriveTime(a)).localeCompare(String(deriveTime(b))));
}

async function fetchSortedConversationMessagesForKeys(store, keys = [], options = {}) {
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

function buildConversationAliases(message = {}) {
  const safe = asObject(message);
  const rawJson = asObject(safe.rawJson);
  const mailDocument = asObject(safe.mailDocument);
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
  const mailboxConversationId = firstNormalizedText(
    safe.mailboxConversationId,
    mailDocument.mailboxConversationId,
    rawJson.mailboxConversationId
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
  return new Set(
    [
      mailboxConversationId,
      conversationId,
      graphMessageId,
      normalizeText(safe.graphMessageId),
      normalizeText(safe.immutableGraphId),
      normalizeText(safe.messageId),
      normalizeText(safe.rawMessageId),
      normalizeText(rawJson.id),
      normalizeText(rawJson.internetMessageId),
      toCanonicalMailboxConversationKey({
        mailboxId,
        conversationId,
        mailboxConversationId,
        messageId: graphMessageId,
      }),
    ].filter(Boolean)
  );
}

function toSummarizeInputMessage(m) {
  const safe = asObject(m);
  const dir = deriveDir(safe.folderType);
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

async function summarizeThread({
  mailboxTruthStore,
  openai = null,
  openaiModel = '',
  conversationKey,
  tenantId = HAIR_TP_CANONICAL,
} = {}) {
  if (!mailboxTruthStore || typeof mailboxTruthStore.listMessages !== 'function') {
    throw new Error('mailbox_truth_store_unavailable');
  }
  const key = normalizeText(conversationKey);
  if (!key) {
    throw new Error('missing_conversation_key');
  }
  const sorted = await fetchSortedConversationMessages(mailboxTruthStore, key);
  if (sorted.length === 0) {
    return null;
  }
  const firstInbound =
    sorted.find((m) => deriveDir(asObject(m).folderType) === 'inbound') || sorted[0];
  const customerName = deriveFromName(firstInbound);
  const subject = normalizeText(asObject(firstInbound).subject) || '';
  const inputMessages = sorted.map(toSummarizeInputMessage);

  const result = await runSummarizeThreadCapability({
    channel: 'admin',
    tenantId: canonicalTenantId(normalizeText(tenantId)) || HAIR_TP_CANONICAL,
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
    riskParts.push(`${anomalies.length} avvikelse${anomalies.length === 1 ? '' : 'r'} upptäckta`);
  }
  const risk = riskParts.length > 0 ? riskParts.join(' · ') : '';
  return {
    sentiment: data.sentiment || null,
    intent: data.intent || null,
    risk,
  };
}

module.exports = {
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
  deriveMailboxIdsFromLookupKeys,
  fetchSortedConversationMessages,
  fetchSortedConversationMessagesForKeys,
  toSummarizeInputMessage,
  summarizeThread,
};
