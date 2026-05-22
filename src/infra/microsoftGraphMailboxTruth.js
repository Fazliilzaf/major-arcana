const crypto = require('node:crypto');

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
      const size = toNumber(safeItem.size, 0);
      const isInline = safeItem.isInline === true;
      const contentBytesAvailable = safeItem.contentBytesAvailable === true;
      if (!id && !name && !contentType && !contentId && !sourceType && size <= 0) {
        return null;
      }
      return {
        id: id || null,
        name: name || null,
        contentType: contentType || null,
        contentId: contentId || null,
        isInline,
        size,
        sourceType: sourceType || null,
        contentBytesAvailable,
      };
    })
    .filter(Boolean);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeHeaderMessageId(value = '') {
  const raw = normalizeText(value);
  if (!raw) return '';
  const match = raw.match(/<([^>]+)>/);
  const normalized = match ? match[1] : raw;
  return normalizeText(normalized.replace(/[<>]/g, '')).toLowerCase();
}

function normalizeFolderType(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['inbox', 'sent', 'drafts', 'deleted'].includes(normalized)) return normalized;
  return 'unknown';
}

function normalizeMailboxIds(value = []) {
  const tokens = Array.isArray(value)
    ? value
    : String(value || '')
        .split(/[,\s]+/)
        .map((item) => normalizeText(item))
        .filter(Boolean);
  return Array.from(
    new Set(tokens.map((item) => normalizeText(item).toLowerCase()).filter(Boolean))
  );
}

function normalizeDirection(value = '', folderType = 'unknown') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'inbound' || normalized === 'outbound' || normalized === 'draft') {
    return normalized;
  }
  if (folderType === 'inbox') return 'inbound';
  if (folderType === 'sent') return 'outbound';
  if (folderType === 'drafts') return 'draft';
  return 'unknown';
}

function toParticipant(raw = {}) {
  const safe = asObject(raw);
  const address = normalizeText(safe.address).toLowerCase();
  const name = normalizeText(safe.name);
  if (!address && !name) return null;
  return {
    address: address || null,
    name: name || null,
  };
}

function toParticipants(value = []) {
  return asArray(value).map(toParticipant).filter(Boolean);
}

function cloneJson(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function normalizeIdentityCarrier(value = {}) {
  const safeValue = asObject(value);
  const customerIdentity = asObject(safeValue.customerIdentity || safeValue.identity);
  const hardConflictSignals = asArray(safeValue.hardConflictSignals).filter(
    (item) => item !== null && item !== undefined
  );
  const mergeReviewDecisionsByPairId = asObject(safeValue.mergeReviewDecisionsByPairId);
  const identityProvenance = asObject(safeValue.identityProvenance || safeValue.provenance);

  return {
    customerIdentity: Object.keys(customerIdentity).length ? cloneJson(customerIdentity) : null,
    hardConflictSignals: hardConflictSignals.length ? cloneJson(hardConflictSignals) : [],
    mergeReviewDecisionsByPairId: Object.keys(mergeReviewDecisionsByPairId).length
      ? cloneJson(mergeReviewDecisionsByPairId)
      : {},
    identityProvenance: Object.keys(identityProvenance).length ? cloneJson(identityProvenance) : null,
  };
}

function toMailboxConversationId({ mailboxId = '', conversationId = '', internetMessageId = '', graphMessageId = '' } = {}) {
  const safeMailboxId = normalizeText(mailboxId).toLowerCase();
  const safeConversationId = normalizeText(conversationId);
  const safeInternetMessageId = normalizeHeaderMessageId(internetMessageId);
  const safeGraphMessageId = normalizeText(graphMessageId);
  if (safeMailboxId && safeConversationId) return `${safeMailboxId}:${safeConversationId}`;
  if (safeMailboxId && safeInternetMessageId) return `${safeMailboxId}:message:${safeInternetMessageId}`;
  if (safeMailboxId && safeGraphMessageId) return `${safeMailboxId}:graph:${safeGraphMessageId}`;
  if (safeConversationId) return safeConversationId;
  if (safeInternetMessageId) return `message:${safeInternetMessageId}`;
  if (safeGraphMessageId) return `graph:${safeGraphMessageId}`;
  return `conversation:${crypto.randomUUID()}`;
}

function toLatestMessageAt(message = {}) {
  return (
    toIso(message.lastModifiedAt) ||
    toIso(message.receivedAt) ||
    toIso(message.sentAt) ||
    toIso(message.createdAt) ||
    null
  );
}

function buildMailboxTruthConversations(messages = []) {
  const safeMessages = asArray(messages);
  const conversationsById = new Map();

  for (const normalizedMessage of safeMessages) {
    const safeMessage = asObject(normalizedMessage);
    const graphMessageId = normalizeText(safeMessage.graphMessageId);
    if (!graphMessageId) continue;
    const mailboxConversationId = normalizeText(safeMessage.mailboxConversationId);
    if (!mailboxConversationId) continue;
    const conversation =
      conversationsById.get(mailboxConversationId) ||
      {
        mailboxConversationId,
        mailboxId: normalizeText(safeMessage.mailboxId).toLowerCase() || null,
        mailboxAddress: normalizeText(safeMessage.mailboxAddress).toLowerCase() || null,
        userPrincipalName: normalizeText(safeMessage.userPrincipalName).toLowerCase() || null,
        graphUserId: normalizeText(safeMessage.graphUserId) || null,
        conversationId: normalizeText(safeMessage.conversationId) || null,
        messageIds: [],
        folderTypes: new Set(),
        latestMessageAt: null,
        latestInboundAt: null,
        latestOutboundAt: null,
      };
    conversation.messageIds.push(graphMessageId);
    conversation.folderTypes.add(normalizeFolderType(safeMessage.folderType));
    const latestMessageAt = toLatestMessageAt(safeMessage);
    if (
      latestMessageAt &&
      (!conversation.latestMessageAt || latestMessageAt > conversation.latestMessageAt)
    ) {
      conversation.latestMessageAt = latestMessageAt;
    }
    if (
      normalizeDirection(safeMessage.direction, safeMessage.folderType) === 'inbound' &&
      safeMessage.receivedAt &&
      (!conversation.latestInboundAt || safeMessage.receivedAt > conversation.latestInboundAt)
    ) {
      conversation.latestInboundAt = safeMessage.receivedAt;
    }
    if (
      normalizeDirection(safeMessage.direction, safeMessage.folderType) === 'outbound' &&
      safeMessage.sentAt &&
      (!conversation.latestOutboundAt || safeMessage.sentAt > conversation.latestOutboundAt)
    ) {
      conversation.latestOutboundAt = safeMessage.sentAt;
    }
    conversationsById.set(mailboxConversationId, conversation);
  }

  return Array.from(conversationsById.values())
    .map((conversation) => ({
      mailboxConversationId: conversation.mailboxConversationId,
      mailboxId: conversation.mailboxId,
      mailboxAddress: conversation.mailboxAddress,
      userPrincipalName: conversation.userPrincipalName,
      graphUserId: conversation.graphUserId,
      conversationId: conversation.conversationId,
      messageIds: conversation.messageIds.slice(),
      folderTypes: Array.from(conversation.folderTypes.values()),
      latestMessageAt: conversation.latestMessageAt,
      latestInboundAt: conversation.latestInboundAt,
      latestOutboundAt: conversation.latestOutboundAt,
    }))
    .sort((left, right) =>
      String(right.latestMessageAt || '').localeCompare(String(left.latestMessageAt || ''))
    );
}

function normalizeMailboxTruthSnapshot(snapshot = {}) {
  const safeSnapshot = asObject(snapshot);
  const rawAccounts = asArray(safeSnapshot.accounts);
  const accounts = [];
  const folders = [];
  const messages = [];

  for (const rawAccount of rawAccounts) {
    const safeAccount = asObject(rawAccount);
    const account = {
      graphUserId: normalizeText(safeAccount.graphUserId) || null,
      mailboxId: normalizeText(safeAccount.mailboxId).toLowerCase() || null,
      mailboxAddress: normalizeText(safeAccount.mailboxAddress).toLowerCase() || null,
      userPrincipalName: normalizeText(safeAccount.userPrincipalName).toLowerCase() || null,
      fetchStatus: normalizeText(safeAccount.fetchStatus) || 'success',
      warningCount: asArray(safeAccount.warnings).length,
    };
    accounts.push(account);

    for (const rawFolder of asArray(safeAccount.folders)) {
      const safeFolder = asObject(rawFolder);
      const folderType = normalizeFolderType(safeFolder.folderType);
      const folder = {
        mailboxId: account.mailboxId,
        graphUserId: account.graphUserId,
        folderId: normalizeText(safeFolder.folderId) || null,
        folderName: normalizeText(safeFolder.folderName) || null,
        folderType,
        wellKnownName: normalizeText(safeFolder.wellKnownName) || null,
        fetchStatus: normalizeText(safeFolder.fetchStatus) || 'success',
        totalItemCount: toNumber(safeFolder.totalItemCount, 0),
        unreadItemCount: toNumber(safeFolder.unreadItemCount, 0),
        fetchedMessageCount: toNumber(
          safeFolder.fetchedMessageCount,
          asArray(safeFolder.messages).length
        ),
        truncatedByLimit: safeFolder.truncatedByLimit === true,
      };
      folders.push(folder);

      for (const rawMessage of asArray(safeFolder.messages)) {
        const safeMessage = asObject(rawMessage);
        const graphMessageId =
          normalizeText(safeMessage.graphMessageId || safeMessage.messageId) || null;
        if (!graphMessageId) continue;
        const conversationId = normalizeText(safeMessage.conversationId) || null;
        const internetMessageId = normalizeHeaderMessageId(safeMessage.internetMessageId) || null;
        const mailboxConversationId = toMailboxConversationId({
          mailboxId: account.mailboxId,
          conversationId,
          internetMessageId,
          graphMessageId,
        });
        const normalizedMessage = {
          graphMessageId,
          mailboxId: account.mailboxId,
          mailboxAddress: account.mailboxAddress,
          userPrincipalName: account.userPrincipalName,
          graphUserId: account.graphUserId,
          folderId: folder.folderId,
          folderName: folder.folderName,
          folderType,
          wellKnownName: folder.wellKnownName,
          conversationId,
          mailboxConversationId,
          internetMessageId,
          inReplyTo: normalizeHeaderMessageId(safeMessage.inReplyTo) || null,
          references: asArray(safeMessage.references)
            .map((item) => normalizeHeaderMessageId(item))
            .filter(Boolean),
          subject: normalizeText(safeMessage.subject) || '(utan amne)',
          bodyPreview: normalizeText(safeMessage.bodyPreview) || '',
          bodyHtml: normalizeText(safeMessage.bodyHtml) || null,
          direction: normalizeDirection(safeMessage.direction, folderType),
          isRead: typeof safeMessage.isRead === 'boolean' ? safeMessage.isRead : null,
          hasAttachments: safeMessage.hasAttachments === true,
          attachments: toSafeAttachmentMetadata(safeMessage.attachments),
          isDraft:
            safeMessage.isDraft === true || folderType === 'drafts',
          isDeleted: folderType === 'deleted',
          receivedAt: toIso(safeMessage.receivedAt),
          sentAt: toIso(safeMessage.sentAt),
          createdAt: toIso(safeMessage.createdAt),
          lastModifiedAt: toIso(safeMessage.lastModifiedAt),
          from: toParticipant(safeMessage.from),
          toRecipients: toParticipants(safeMessage.toRecipients),
          ccRecipients: toParticipants(safeMessage.ccRecipients),
          bccRecipients: toParticipants(safeMessage.bccRecipients),
          replyToRecipients: toParticipants(safeMessage.replyToRecipients),
          ...normalizeIdentityCarrier(safeMessage),
        };
        messages.push(normalizedMessage);
      }
    }
  }

  const conversations = buildMailboxTruthConversations(messages);
  const safeMessages = messages;

  return {
    modelVersion: 'cco.mailbox.truth.v1',
    source: normalizeText(safeSnapshot.source) || 'microsoft-graph',
    sourceSnapshotVersion: normalizeText(safeSnapshot.snapshotVersion) || null,
    timestamps: {
      capturedAt: normalizeText(safeSnapshot?.timestamps?.capturedAt) || null,
      sourceGeneratedAt: normalizeText(safeSnapshot?.timestamps?.sourceGeneratedAt) || null,
    },
    accounts,
    folders,
    messages,
    conversations: conversations.map((conversation) => ({
      ...conversation,
      ...normalizeIdentityCarrier(
        safeMessages.find((message) => message.mailboxConversationId === conversation.mailboxConversationId) || {}
      ),
    })),
    metadata: {
      accountCount: accounts.length,
      folderCount: folders.length,
      messageCount: messages.length,
      conversationCount: conversations.length,
      truncatedFolderCount: folders.filter((folder) => folder.truncatedByLimit === true).length,
    },
  };
}

function summarizeMailboxTruthVerification(model = {}, options = {}) {
  const safeModel = asObject(model);
  const folderRows = asArray(safeModel.folders);
  const messages = asArray(safeModel.messages);
  const accounts = asArray(safeModel.accounts);
  const expectedMailboxIds = normalizeMailboxIds(options.expectedMailboxIds);
  const accountSummariesById = new Map();

  function toFolderVerification(folderType, folder) {
    if (!folder) {
      return {
        status: 'NOT VERIFIED',
        reasonCode: 'folder_missing',
        detail: 'Foldern returnerades inte i mailbox truth snapshot.',
      };
    }
    if (normalizeText(folder.fetchStatus) === 'error') {
      return {
        status: 'BROKEN',
        reasonCode: 'fetch_error',
        detail:
          normalizeText(folder.errorMessage) ||
          'Foldern kunde inte hamtas fran Microsoft Graph.',
      };
    }
    const totalItemCount = toNumber(folder.totalItemCount, 0);
    const fetchedMessageCount = toNumber(folder.fetchedMessageCount, 0);
    if (folder.truncatedByLimit === true) {
      return {
        status: 'PARTIAL',
        reasonCode: 'cap_truncated',
        detail: `Foldern ar truth-kopplad men trunkerad av maxMessagesPerFolder (${fetchedMessageCount}/${totalItemCount}).`,
      };
    }
    if (fetchedMessageCount < totalItemCount) {
      return {
        status: 'PARTIAL',
        reasonCode: 'folder_not_fully_materialized',
        detail: `Foldern returnerade ${fetchedMessageCount} av ${totalItemCount} meddelanden utan explicit truncering.`,
      };
    }
    if (totalItemCount === 0 && fetchedMessageCount === 0) {
      return {
        status: 'VERIFIED',
        reasonCode: 'empty_verified',
        detail: 'Foldern ar tom och korrekt verifierad som tom.',
      };
    }
    return {
      status: 'VERIFIED',
      reasonCode: 'verified',
      detail: `Foldern ar komplett materialiserad (${fetchedMessageCount}/${totalItemCount}).`,
    };
  }

  function toAccountStatus(statusByFolderType = {}) {
    const values = Object.values(asObject(statusByFolderType));
    if (values.length === 0) return 'NOT VERIFIED';
    if (values.includes('BROKEN')) return 'BROKEN';
    if (values.includes('PARTIAL')) return 'PARTIAL';
    if (values.includes('NOT VERIFIED')) return 'NOT VERIFIED';
    return 'VERIFIED';
  }

  for (const account of accounts) {
    const mailboxId = normalizeText(account.mailboxId).toLowerCase() || null;
    const accountFolders = folderRows.filter((folder) => normalizeText(folder.mailboxId).toLowerCase() === mailboxId);
    const accountMessages = messages.filter((message) => normalizeText(message.mailboxId).toLowerCase() === mailboxId);
    const statusByFolderType = {};
    const reasonByFolderType = {};
    const detailByFolderType = {};

    for (const folderType of ['inbox', 'sent', 'drafts', 'deleted']) {
      const folder = accountFolders.find((entry) => normalizeFolderType(entry.folderType) === folderType);
      const verification = toFolderVerification(folderType, folder);
      statusByFolderType[folderType] = verification.status;
      reasonByFolderType[folderType] = verification.reasonCode;
      detailByFolderType[folderType] = verification.detail;
    }
    const summary = {
      mailboxId,
      mailboxAddress: normalizeText(account.mailboxAddress).toLowerCase() || null,
      accountStatus: toAccountStatus(statusByFolderType),
      statusByFolderType,
      reasonByFolderType,
      detailByFolderType,
      folderCounts: accountFolders.map((folder) => ({
        folderType: normalizeFolderType(folder.folderType),
        totalItemCount: toNumber(folder.totalItemCount, 0),
        unreadItemCount: toNumber(folder.unreadItemCount, 0),
        fetchedMessageCount: toNumber(folder.fetchedMessageCount, 0),
        truncatedByLimit: folder.truncatedByLimit === true,
        fetchStatus: normalizeText(folder.fetchStatus) || 'success',
      })),
      sampleMessages: accountMessages.slice(0, 4).map((message) => ({
        graphMessageId: message.graphMessageId,
        folderType: normalizeFolderType(message.folderType),
        subject: message.subject,
        direction: normalizeDirection(message.direction, message.folderType),
        receivedAt: message.receivedAt,
        sentAt: message.sentAt,
        isRead: message.isRead,
        hasAttachments: message.hasAttachments === true,
      })),
    };
    accountSummariesById.set(mailboxId, summary);
  }

  for (const mailboxId of expectedMailboxIds) {
    if (accountSummariesById.has(mailboxId)) continue;
    const statusByFolderType = {
      inbox: 'NOT VERIFIED',
      sent: 'NOT VERIFIED',
      drafts: 'NOT VERIFIED',
      deleted: 'NOT VERIFIED',
    };
    accountSummariesById.set(mailboxId, {
      mailboxId,
      mailboxAddress: mailboxId,
      accountStatus: 'NOT VERIFIED',
      statusByFolderType,
      reasonByFolderType: {
        inbox: 'account_not_returned',
        sent: 'account_not_returned',
        drafts: 'account_not_returned',
        deleted: 'account_not_returned',
      },
      detailByFolderType: {
        inbox: 'Kontot returnerades inte av connectorn i denna verification-run.',
        sent: 'Kontot returnerades inte av connectorn i denna verification-run.',
        drafts: 'Kontot returnerades inte av connectorn i denna verification-run.',
        deleted: 'Kontot returnerades inte av connectorn i denna verification-run.',
      },
      folderCounts: [],
      sampleMessages: [],
    });
  }

  const orderedMailboxIds = Array.from(
    new Set([
      ...expectedMailboxIds,
      ...Array.from(accountSummariesById.keys()).filter(Boolean),
    ])
  );
  const accountSummaries = orderedMailboxIds
    .map((mailboxId) => accountSummariesById.get(mailboxId))
    .filter(Boolean);

  return {
    modelVersion: normalizeText(safeModel.modelVersion) || 'cco.mailbox.truth.v1',
    accountSummaries,
    overallStatus:
      accountSummaries.every((account) =>
        ['inbox', 'sent', 'drafts', 'deleted'].every(
          (folderType) => account.statusByFolderType[folderType] === 'VERIFIED'
        )
      )
        ? 'VERIFIED'
        : accountSummaries.some((account) =>
              Object.values(asObject(account.statusByFolderType)).includes('BROKEN')
            )
          ? 'BROKEN'
          : accountSummaries.some((account) =>
                Object.values(asObject(account.statusByFolderType)).includes('PARTIAL')
              )
            ? 'PARTIAL'
            : 'NOT VERIFIED',
  };
}

module.exports = {
  buildMailboxTruthConversations,
  normalizeMailboxTruthSnapshot,
  summarizeMailboxTruthVerification,
  toMailboxConversationId,
};
