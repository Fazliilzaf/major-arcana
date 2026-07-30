const {
  extractEmail,
  normalizeCounterpartyDirection,
  resolveCounterpartyIdentity,
} = require('./ccoCounterpartyTruth');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function toSafeAttachmentMetadata(value = []) {
  return asArray(value)
    .map((item) => {
      const safeItem = asObject(item);
      const id = normalizeText(safeItem.id);
      const name = normalizeText(safeItem.name);
      const contentType = normalizeText(safeItem.contentType);
      const contentId = normalizeText(safeItem.contentId);
      const sourceType = normalizeText(safeItem.sourceType);
      const size = Number(safeItem.size);
      const isInline = safeItem.isInline === true;
      const contentBytesAvailable = safeItem.contentBytesAvailable === true;
      if (
        !id &&
        !name &&
        !contentType &&
        !contentId &&
        !sourceType &&
        !(Number.isFinite(size) && size > 0)
      ) {
        return null;
      }
      return {
        id: id || null,
        name: name || null,
        contentType: contentType || null,
        contentId: contentId || null,
        isInline,
        size: Number.isFinite(size) ? Math.max(0, size) : 0,
        sourceType: sourceType || null,
        contentBytesAvailable,
      };
    })
    .filter(Boolean);
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeMailboxId(value = '') {
  return normalizeText(value).toLowerCase();
}

function normalizeFolderType(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['inbox', 'sent', 'drafts', 'deleted'].includes(normalized)) return normalized;
  return 'unknown';
}

function normalizeContentId(value = '') {
  return normalizeText(value).replace(/^<|>$/g, '').toLowerCase();
}

function listReferencedContentIds(bodyHtml = '') {
  return Array.from(
    new Set(
      Array.from(normalizeText(bodyHtml).matchAll(/\bcid:([^\s"'>]+)/gi))
        .map((match) => normalizeContentId(match[1]))
        .filter(Boolean)
    )
  );
}

function deriveFidelityMessageType(message = {}) {
  const declaredDirection = normalizeText(asObject(message).direction).toLowerCase();
  if (declaredDirection === 'inbound' || declaredDirection === 'outbound') {
    return declaredDirection;
  }
  const folderType = normalizeFolderType(asObject(message).folderType);
  if (folderType === 'inbox') return 'inbound';
  if (folderType === 'sent') return 'outbound';
  if (folderType === 'drafts') return 'outbound_draft';
  return 'unknown';
}

function toFidelityParticipantLabel(participant) {
  const safe = asObject(participant);
  const name = normalizeText(safe.name);
  const address = normalizeText(safe.address).toLowerCase();
  if (name && address) return `${name} <${address}>`;
  return name || address || null;
}

/**
 * Ett fidelity-gap-prov utan motpart går inte att slå upp — operatören ser
 * bara ett messageId utan kontext. Inkommande mejl pekar ut avsändaren,
 * utgående/utkast den första mottagaren.
 */
function deriveFidelityCounterparty(message = {}) {
  const safe = asObject(message);
  const messageType = deriveFidelityMessageType(safe);
  if (messageType === 'inbound') {
    return (
      toFidelityParticipantLabel(safe.from) ||
      toFidelityParticipantLabel(asArray(safe.toRecipients)[0])
    );
  }
  return (
    toFidelityParticipantLabel(asArray(safe.toRecipients)[0]) ||
    toFidelityParticipantLabel(safe.from)
  );
}

function matchesMailboxAddressAlias(target = '', candidates = []) {
  const safeTarget = extractEmail(target);
  if (!safeTarget) return false;
  return asArray(candidates).some((candidate) => extractEmail(candidate) === safeTarget);
}

function normalizeHistoryQueryTokens(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toMessageSortIso(message = {}) {
  return (
    toIso(message.lastModifiedAt) ||
    toIso(message.receivedAt) ||
    toIso(message.sentAt) ||
    toIso(message.createdAt) ||
    null
  );
}

function deriveHistoryDirection(message = {}) {
  const safeMessage = asObject(message);
  const declaredDirection = normalizeCounterpartyDirection(safeMessage.direction);
  if (declaredDirection !== 'unknown') return declaredDirection;

  const mailboxIds = new Set(
    [safeMessage.mailboxId, safeMessage.mailboxAddress, safeMessage.userPrincipalName]
      .map((item) => extractEmail(item))
      .filter(Boolean)
  );
  const senderEmail = extractEmail(safeMessage.from?.address);
  if (senderEmail && mailboxIds.has(senderEmail)) return 'outbound';
  return 'inbound';
}

function deriveCounterparty(message = {}) {
  const safeMessage = asObject(message);
  const direction = deriveHistoryDirection(safeMessage);
  const counterparty = resolveCounterpartyIdentity(safeMessage, {
    direction,
  });
  return {
    email: counterparty.email || null,
    name: counterparty.displayName || null,
    rawName: counterparty.rawName || null,
    fallbackLabel: counterparty.fallbackLabel || null,
  };
}

function buildFallbackConversationKey(message = {}) {
  const safeMessage = asObject(message);
  const mailboxId = normalizeMailboxId(
    safeMessage.mailboxId || safeMessage.mailboxAddress || safeMessage.userPrincipalName
  );
  const counterparty = deriveCounterparty(safeMessage);
  const customerEmail = extractEmail(counterparty.email) || 'okand-kund';
  const subjectKey = normalizeText(safeMessage.subject).toLowerCase() || '(utan ämne)';
  if (!mailboxId) return '';
  return `${mailboxId}:${customerEmail}:${subjectKey}`;
}

function normalizeHistoryConversationId(value = '') {
  const safeValue = normalizeText(value);
  if (!safeValue) return '';
  const delimiterIndex = safeValue.indexOf(':');
  if (delimiterIndex <= 0) return safeValue;
  const prefix = safeValue.slice(0, delimiterIndex);
  const suffix = safeValue.slice(delimiterIndex + 1);
  if (!prefix.includes('@')) return safeValue;
  return `${prefix.toLowerCase()}:${suffix}`;
}

function toHistoryMessage(message = {}) {
  const safeMessage = asObject(message);
  const direction = deriveHistoryDirection(safeMessage);
  const counterparty = deriveCounterparty(safeMessage);
  const sentAt = toMessageSortIso(safeMessage);
  return {
    messageId: normalizeText(safeMessage.graphMessageId) || null,
    graphMessageId: normalizeText(safeMessage.graphMessageId) || null,
    mailboxConversationId: normalizeText(safeMessage.mailboxConversationId) || null,
    conversationId:
      normalizeText(safeMessage.conversationId) ||
      normalizeText(safeMessage.mailboxConversationId) ||
      buildFallbackConversationKey(safeMessage) ||
      null,
    subject: normalizeText(safeMessage.subject) || '(utan ämne)',
    normalizedSubject: normalizeText(safeMessage.subject) || '(utan ämne)',
    customerEmail: counterparty.email || null,
    counterpartyEmail: counterparty.email || null,
    counterpartyName: counterparty.name || null,
    sentAt,
    receivedAt: toIso(safeMessage.receivedAt),
    createdAt: toIso(safeMessage.createdAt),
    lastModifiedAt: toIso(safeMessage.lastModifiedAt),
    direction,
    bodyPreview: normalizeText(safeMessage.bodyPreview) || '',
    bodyHtml: normalizeText(safeMessage.bodyHtml) || null,
    senderEmail: extractEmail(safeMessage.from?.address) || null,
    senderName: normalizeText(safeMessage.from?.name) || null,
    recipients: asArray(safeMessage.toRecipients)
      .map((item) => extractEmail(item?.address))
      .filter(Boolean),
    replyToRecipients: asArray(safeMessage.replyToRecipients)
      .map((item) => extractEmail(item?.address))
      .filter(Boolean),
    internetMessageId: normalizeText(safeMessage.internetMessageId).toLowerCase() || null,
    mailboxId: normalizeMailboxId(safeMessage.mailboxId) || null,
    mailboxAddress: normalizeMailboxId(safeMessage.mailboxAddress || safeMessage.mailboxId) || null,
    userPrincipalName:
      normalizeMailboxId(
        safeMessage.userPrincipalName || safeMessage.mailboxAddress || safeMessage.mailboxId
      ) || null,
    folderType: normalizeFolderType(safeMessage.folderType),
    hasAttachments: safeMessage.hasAttachments === true,
    attachments: toSafeAttachmentMetadata(safeMessage.attachments),
    isRead: typeof safeMessage.isRead === 'boolean' ? safeMessage.isRead : null,
  };
}

function doesHistoryMessageMatch(message = {}, { conversationId = '', customerEmail = '' } = {}) {
  const safeConversationId = normalizeHistoryConversationId(conversationId);
  const safeCustomerEmail = extractEmail(customerEmail);
  if (safeConversationId) {
    const candidates = [
      normalizeHistoryConversationId(message.conversationId),
      normalizeHistoryConversationId(message.mailboxConversationId),
      normalizeHistoryConversationId(buildFallbackConversationKey(message)),
    ].filter(Boolean);
    if (candidates.includes(safeConversationId)) return true;
  }
  if (
    safeCustomerEmail &&
    matchesMailboxAddressAlias(safeCustomerEmail, [
      message.customerEmail,
      message.counterpartyEmail,
      message.senderEmail,
      ...asArray(message.recipients),
      ...asArray(message.replyToRecipients),
    ])
  ) {
    return true;
  }
  return !safeConversationId && !safeCustomerEmail;
}

function buildHistoryEvent(message = {}) {
  const safeMessage = asObject(message);
  const folderType = normalizeFolderType(safeMessage.folderType);
  const direction = deriveHistoryDirection(safeMessage);
  let title = direction === 'outbound' ? 'E-post skickat' : 'E-post mottaget';
  if (folderType === 'drafts') title = 'Utkast sparat';
  if (folderType === 'deleted') title = 'Mail i papperskorg';
  return {
    resultType: 'message',
    actionType: null,
    outcomeCode: null,
    title,
    summary:
      normalizeText(safeMessage.bodyPreview) ||
      normalizeText(safeMessage.subject) ||
      'Historikhändelse',
    detail:
      normalizeText(safeMessage.bodyPreview) ||
      normalizeText(safeMessage.subject) ||
      'Historikhändelse',
    recordedAt: normalizeText(safeMessage.sentAt) || null,
    mailboxId: normalizeMailboxId(safeMessage.mailboxId || safeMessage.mailboxAddress) || null,
    customerEmail:
      extractEmail(
        safeMessage.customerEmail || safeMessage.counterpartyEmail || safeMessage.senderEmail
      ) || null,
    conversationId:
      normalizeText(safeMessage.conversationId) ||
      normalizeText(safeMessage.mailboxConversationId) ||
      buildFallbackConversationKey(safeMessage) ||
      null,
    direction,
    folderType,
    graphMessageId: normalizeText(safeMessage.graphMessageId || safeMessage.messageId) || null,
  };
}

function createCcoMailboxTruthReadAdapter({ store = null } = {}) {
  if (
    !store ||
    typeof store.listMessages !== 'function' ||
    typeof store.getCompletenessReport !== 'function'
  ) {
    return null;
  }

  function listHistoryMessages({
    mailboxIds = [],
    sinceIso = null,
    untilIso = null,
    customerEmail = '',
    conversationId = '',
    limit = 0,
    includeBodyHtml = true,
  } = {}) {
    const messages = store
      .listMessages({
        mailboxIds,
        sinceIso: normalizeText(conversationId) ? null : sinceIso,
        untilIso: normalizeText(conversationId) ? null : untilIso,
      })
      .map(toHistoryMessage)
      .filter((message) =>
        doesHistoryMessageMatch(message, {
          conversationId,
          customerEmail,
        })
      )
      .sort((left, right) => String(right?.sentAt || '').localeCompare(String(left?.sentAt || '')));
    const limitedMessages = limit > 0 ? messages.slice(0, limit) : messages;
    if (includeBodyHtml !== false) {
      return limitedMessages;
    }
    return limitedMessages.map((message) => ({
      ...message,
      bodyHtml: null,
    }));
  }

  function searchHistoryMessages({
    mailboxIds = [],
    sinceIso = null,
    untilIso = null,
    customerEmail = '',
    conversationId = '',
    q = '',
    limit = 50,
  } = {}) {
    const queryTokens = normalizeHistoryQueryTokens(q);
    const messages = listHistoryMessages({
      mailboxIds,
      sinceIso,
      untilIso,
      customerEmail,
      conversationId,
    }).filter((message) => {
      if (queryTokens.length === 0) return true;
      const haystack = [
        message.subject,
        message.bodyPreview,
        message.customerEmail,
        message.counterpartyName,
        message.senderEmail,
      ]
        .map((item) => normalizeText(item).toLowerCase())
        .join(' ');
      return queryTokens.every((token) => haystack.includes(token));
    });

    return messages.slice(0, Math.max(1, Math.min(250, Number(limit) || 50))).map((message) => ({
      resultType: 'message',
      messageId: message.messageId,
      graphMessageId: message.graphMessageId,
      conversationId: message.conversationId,
      mailboxId: message.mailboxId,
      customerEmail: message.customerEmail,
      title: message.subject,
      subject: message.subject,
      summary: message.bodyPreview,
      detail: message.bodyPreview,
      recordedAt: message.sentAt,
      direction: message.direction,
      folderType: message.folderType,
      nextActionLabel: null,
      nextActionSummary: null,
    }));
  }

  function listHistoryEvents(options = {}) {
    return listHistoryMessages(options)
      .map(buildHistoryEvent)
      .sort((left, right) =>
        String(right?.recordedAt || '').localeCompare(String(left?.recordedAt || ''))
      );
  }

  function getHistoryCoverage({ mailboxIds = [] } = {}) {
    const completeness = store.getCompletenessReport({ mailboxIds });
    const mailboxes = asArray(completeness?.accountReports).map((account) => {
      const folderStatuses = asObject(account?.statusByFolderType);
      const folderReasons = asObject(account?.reasonByFolderType);
      const folderDetails = asObject(account?.detailByFolderType);
      const folderCounts = asArray(account?.folderCounts);
      const missingFolders = ['inbox', 'sent', 'drafts', 'deleted']
        .filter((folderType) => normalizeText(folderStatuses[folderType]) !== 'VERIFIED')
        .map((folderType) => ({
          folderType,
          status: normalizeText(folderStatuses[folderType]) || 'NOT VERIFIED',
          reason: normalizeText(folderReasons[folderType]) || 'unknown',
          detail: normalizeText(folderDetails[folderType]) || '',
        }));
      const messageCount = store.listMessages({
        mailboxIds: [account.mailboxId],
      }).length;
      return {
        mailboxId: account.mailboxId,
        mailbox: {
          mailboxId: account.mailboxId,
          mailboxAddress: normalizeMailboxId(account.mailboxAddress || account.mailboxId) || null,
          messageCount,
          completenessStatus: normalizeText(account.accountStatus) || 'NOT VERIFIED',
        },
        folderStatuses: folderStatuses,
        coverage: {
          source: 'mailbox_truth_store',
          missingWindowCount: missingFolders.length,
          missingWindowsPreview: missingFolders.slice(0, 6),
          complete: missingFolders.length === 0,
        },
        folderCounts,
      };
    });
    const missingWindowCount = mailboxes.reduce(
      (sum, mailbox) => sum + Number(mailbox?.coverage?.missingWindowCount || 0),
      0
    );
    return {
      source: 'mailbox_truth_store',
      mailboxes,
      coverage: {
        missingWindowCount,
        missingWindowsPreview: mailboxes
          .flatMap((mailbox) =>
            asArray(mailbox?.coverage?.missingWindowsPreview).map((item) => ({
              mailboxId: mailbox.mailboxId,
              folderType: item.folderType,
              status: item.status,
              reason: item.reason,
              detail: item.detail,
            }))
          )
          .slice(0, 6),
        complete: missingWindowCount === 0,
      },
    };
  }

  function getFidelityInventory({ mailboxIds = [], sampleLimit = 20, deepScan = false } = {}) {
    if (typeof store.getFidelityInventory === 'function') {
      return store.getFidelityInventory({ mailboxIds, sampleLimit, deepScan });
    }

    // Fallbacken behåller adaptern testbar med enklare read-only stores.
    // Produktionsstoren räknar direkt över sin lokala state utan att skapa
    // en full kopia av meddelandena.
    const safeSampleLimit = Math.max(0, Math.min(50, Number(sampleLimit) || 0));
    const summary = {
      messages: 0,
      htmlBodies: 0,
      inlineImageTags: 0,
      inlineCidReferences: 0,
      mimeAvailable: 0,
      declaredAttachments: 0,
      attachmentMetadata: 0,
      declaredAttachmentsWithoutMetadata: 0,
      cidWithoutAttachmentMetadata: 0,
      richCandidatesWithoutMime: 0,
      fidelityGapCount: 0,
    };
    const samples = [];
    const addSample = (sample) => {
      if (safeSampleLimit === 0) return;
      samples.push(sample);
      samples.sort((left, right) =>
        String(left.observedAt || '').localeCompare(String(right.observedAt || ''))
      );
      if (samples.length > safeSampleLimit) samples.pop();
    };

    for (const rawMessage of store.listMessages({ mailboxIds })) {
      const message = asObject(rawMessage);
      const bodyHtml = normalizeText(message.bodyHtml);
      const attachments = asArray(message.attachments);
      const mimeAvailable = asObject(message.mime).available === true;
      const hasInlineImage = /<img\b/i.test(bodyHtml);
      const referencedCids = listReferencedContentIds(bodyHtml);
      const attachmentCids = new Set(
        attachments
          .map((attachment) => normalizeContentId(asObject(attachment).contentId))
          .filter(Boolean)
      );
      const hasDeclaredAttachments = message.hasAttachments === true;
      const missingAttachmentMetadata = hasDeclaredAttachments && attachments.length === 0;
      const missingCidMetadata = referencedCids.some((contentId) => !attachmentCids.has(contentId));
      // Remote image tags can render without a locally stored MIME document. Only
      // attachments or CID references make a missing MIME document a fidelity gap.
      const richCandidate = hasDeclaredAttachments || referencedCids.length > 0;
      const reasons = [];

      summary.messages += 1;
      if (bodyHtml) summary.htmlBodies += 1;
      if (hasInlineImage) summary.inlineImageTags += 1;
      if (referencedCids.length > 0) summary.inlineCidReferences += 1;
      if (mimeAvailable) summary.mimeAvailable += 1;
      if (hasDeclaredAttachments) summary.declaredAttachments += 1;
      summary.attachmentMetadata += attachments.length;
      if (missingAttachmentMetadata) {
        summary.declaredAttachmentsWithoutMetadata += 1;
        reasons.push('declared_attachment_without_metadata');
      }
      if (missingCidMetadata) {
        summary.cidWithoutAttachmentMetadata += 1;
        reasons.push('cid_without_attachment_metadata');
      }
      if (richCandidate && !mimeAvailable) {
        summary.richCandidatesWithoutMime += 1;
      }
      if (reasons.length > 0) {
        summary.fidelityGapCount += 1;
        addSample({
          messageId: normalizeText(message.graphMessageId || message.messageId) || null,
          mailboxId: normalizeMailboxId(message.mailboxId || message.mailboxAddress) || null,
          folderType: normalizeFolderType(message.folderType),
          observedAt: toMessageSortIso(message),
          subject: normalizeText(message.subject) || null,
          counterparty: deriveFidelityCounterparty(message),
          reasons,
        });
      }
    }

    return {
      mailboxIds: asArray(mailboxIds).map(normalizeMailboxId).filter(Boolean),
      sampleLimit: safeSampleLimit,
      summary,
      samples,
    };
  }

  function getCidFidelityManifest({ mailboxIds = [], limit = 1000, deepScan = false } = {}) {
    if (typeof store.getCidFidelityManifest === 'function') {
      return store.getCidFidelityManifest({ mailboxIds, limit, deepScan });
    }

    const safeMailboxIds = asArray(mailboxIds).map(normalizeMailboxId).filter(Boolean);
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 1000));
    const entries = [];
    const summary = {
      messagesWithMissingCidMetadata: 0,
      cidReferencesWithoutAttachmentMetadata: 0,
      entriesReturned: 0,
      truncated: false,
      byFolderType: {},
      byMessageType: {},
    };
    for (const rawMessage of store.listMessages({ mailboxIds: safeMailboxIds })) {
      const message = asObject(rawMessage);
      const referencedCids = listReferencedContentIds(message.bodyHtml);
      const attachmentCids = new Set(
        asArray(message.attachments)
          .map((attachment) => normalizeContentId(asObject(attachment).contentId))
          .filter(Boolean)
      );
      const missingCids = referencedCids.filter((contentId) => !attachmentCids.has(contentId));
      if (missingCids.length === 0) continue;
      const folderType = normalizeFolderType(message.folderType);
      const messageType = deriveFidelityMessageType(message);
      summary.messagesWithMissingCidMetadata += 1;
      for (const cid of missingCids) {
        summary.cidReferencesWithoutAttachmentMetadata += 1;
        summary.byFolderType[folderType] = Number(summary.byFolderType[folderType] || 0) + 1;
        summary.byMessageType[messageType] = Number(summary.byMessageType[messageType] || 0) + 1;
        if (entries.length >= safeLimit) {
          summary.truncated = true;
          continue;
        }
        entries.push({
          messageId: normalizeText(message.graphMessageId || message.messageId) || null,
          mailboxId: normalizeMailboxId(message.mailboxId || message.mailboxAddress) || null,
          folderType,
          messageType,
          observedAt: toMessageSortIso(message),
          attachmentId: null,
          cid,
          htmlReferencesCid: true,
          localAttachmentMetadata: null,
          localBlob: {
            available: null,
            state: 'not_addressable_without_attachment_metadata',
          },
        });
      }
    }
    entries.sort((left, right) =>
      String(right.observedAt || '').localeCompare(String(left.observedAt || ''))
    );
    summary.entriesReturned = entries.length;
    return { mailboxIds: safeMailboxIds, limit: safeLimit, summary, entries };
  }

  function findMessage({ mailboxId = '', messageId = '' } = {}) {
    if (typeof store.findMessage === 'function') {
      return store.findMessage({ mailboxId, messageId });
    }
    const safeMailboxId = normalizeMailboxId(mailboxId);
    const safeMessageId = normalizeText(messageId);
    return (
      store
        .listMessages({ mailboxIds: safeMailboxId ? [safeMailboxId] : [] })
        .find(
          (message) =>
            normalizeText(asObject(message).graphMessageId || asObject(message).messageId) ===
            safeMessageId
        ) || null
    );
  }

  return {
    getHistoryCoverage,
    getFidelityInventory,
    getCidFidelityManifest,
    findMessage,
    listHistoryMessages,
    listHistoryEvents,
    searchHistoryMessages,
  };
}

module.exports = {
  createCcoMailboxTruthReadAdapter,
};
