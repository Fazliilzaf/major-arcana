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
    [
      safeMessage.mailboxId,
      safeMessage.mailboxAddress,
      safeMessage.userPrincipalName,
    ]
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
      normalizeMailboxId(safeMessage.userPrincipalName || safeMessage.mailboxAddress || safeMessage.mailboxId) ||
      null,
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
  if (safeCustomerEmail && matchesMailboxAddressAlias(safeCustomerEmail, [
    message.customerEmail,
    message.counterpartyEmail,
    message.senderEmail,
    ...asArray(message.recipients),
    ...asArray(message.replyToRecipients),
  ])) {
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
    summary: normalizeText(safeMessage.bodyPreview) || normalizeText(safeMessage.subject) || 'Historikhändelse',
    detail: normalizeText(safeMessage.bodyPreview) || normalizeText(safeMessage.subject) || 'Historikhändelse',
    recordedAt: normalizeText(safeMessage.sentAt) || null,
    mailboxId: normalizeMailboxId(safeMessage.mailboxId || safeMessage.mailboxAddress) || null,
    customerEmail: extractEmail(safeMessage.customerEmail || safeMessage.counterpartyEmail || safeMessage.senderEmail) || null,
    conversationId: normalizeText(safeMessage.conversationId) || normalizeText(safeMessage.mailboxConversationId) || buildFallbackConversationKey(safeMessage) || null,
    direction,
    folderType,
    graphMessageId: normalizeText(safeMessage.graphMessageId || safeMessage.messageId) || null,
  };
}

function createCcoMailboxTruthReadAdapter({ store = null } = {}) {
  if (!store || typeof store.listMessages !== 'function' || typeof store.getCompletenessReport !== 'function') {
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
      .sort((left, right) => String(right?.recordedAt || '').localeCompare(String(left?.recordedAt || '')));
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
        missingWindowsPreview: mailboxes.flatMap((mailbox) =>
          asArray(mailbox?.coverage?.missingWindowsPreview).map((item) => ({
            mailboxId: mailbox.mailboxId,
            folderType: item.folderType,
            status: item.status,
            reason: item.reason,
            detail: item.detail,
          }))
        ).slice(0, 6),
        complete: missingWindowCount === 0,
      },
    };
  }

  return {
    getHistoryCoverage,
    listHistoryMessages,
    listHistoryEvents,
    searchHistoryMessages,
  };
}

module.exports = {
  createCcoMailboxTruthReadAdapter,
};
