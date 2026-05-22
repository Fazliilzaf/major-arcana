const {
  buildCanonicalMailContentSections,
  extractTextFromHtml,
} = require('./ccoMailContentParser');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function compareIsoDesc(left = '', right = '') {
  return String(right || '').localeCompare(String(left || ''));
}

function buildPresentationText({
  primaryBodyText = '',
  signatureBlock = null,
} = {}) {
  return [normalizeText(primaryBodyText), normalizeText(signatureBlock?.text)]
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function hydrateThreadMessage(message = {}, { sourceStore = 'unknown' } = {}) {
  const mailDocument =
    message?.mailDocument && typeof message.mailDocument === 'object' ? message.mailDocument : null;
  const rawPrimaryBodyHtml = normalizeText(mailDocument?.primaryBodyHtml || message?.bodyHtml);
  const sourceText = normalizeText(
    mailDocument?.primaryBodyText ||
      message?.body ||
      message?.detail ||
      message?.summary ||
      extractTextFromHtml(rawPrimaryBodyHtml)
  );
  const contentSections = buildCanonicalMailContentSections({
    primaryBodyHtml: rawPrimaryBodyHtml,
    sourceText,
  });
  const primaryBodyText = normalizeText(contentSections?.primaryBody?.text);
  const structuredPrimaryBodyHtml = normalizeText(
    contentSections?.primaryBody?.html || rawPrimaryBodyHtml
  );
  const signatureBlock = contentSections?.signatureBlock || null;
  const presentationText = buildPresentationText({
    primaryBodyText,
    signatureBlock,
  });
  const quotedBlocks = asArray(contentSections?.quotedBlocks);
  const systemBlocks = asArray(contentSections?.systemBlocks);
  const attachmentIds = asArray(mailDocument?.attachments)
    .map((asset) => normalizeText(asset?.assetId || asset?.attachmentId || asset?.id))
    .filter(Boolean);
  const inlineAssetIds = asArray(mailDocument?.inlineAssets)
    .map((asset) => normalizeText(asset?.assetId || asset?.attachmentId || asset?.id))
    .filter(Boolean);
  const assetSummary =
    mailDocument?.assetSummary && typeof mailDocument.assetSummary === 'object'
      ? mailDocument.assetSummary
      : null;
  const familyCounts =
    assetSummary?.familyCounts && typeof assetSummary.familyCounts === 'object'
      ? {
          attachment: Number(assetSummary.familyCounts.attachment) || 0,
          inline: Number(assetSummary.familyCounts.inline) || 0,
          external: Number(assetSummary.familyCounts.external) || 0,
        }
      : {
          attachment: 0,
          inline: 0,
          external: 0,
        };
  const sourceDepth =
    normalizeText(mailDocument?.sourceDepth) ||
    (structuredPrimaryBodyHtml ? 'html' : sourceText ? 'text' : 'empty');
  const mime = mailDocument?.mime && typeof mailDocument.mime === 'object' ? mailDocument.mime : null;
  const mimePreferredBodyKind =
    normalizeText(mailDocument?.fidelity?.mimePreferredBodyKind) ||
    normalizeText(mime?.parsed?.preferredBodyKind);

  return {
    version: 'phase_3',
    kind: 'mail_thread_message',
    sourceStore: normalizeText(sourceStore) || normalizeText(mailDocument?.sourceStore) || 'unknown',
    messageId: normalizeText(mailDocument?.messageId || message?.messageId) || null,
    graphMessageId: normalizeText(mailDocument?.graphMessageId || message?.graphMessageId) || null,
    conversationId: normalizeText(mailDocument?.conversationId || message?.conversationId) || null,
    mailboxId:
      normalizeText(mailDocument?.mailboxId || message?.mailboxId || message?.mailboxAddress) || null,
    direction: normalizeText(mailDocument?.direction || message?.direction).toLowerCase() === 'outbound'
      ? 'outbound'
      : 'inbound',
    sentAt: normalizeText(mailDocument?.sentAt || message?.sentAt) || null,
    subject: normalizeText(mailDocument?.subject || message?.subject) || '(utan ämne)',
    previewText:
      normalizeText(mailDocument?.previewText || message?.bodyPreview || message?.preview) || '',
    sourceDepth,
    mimeAvailable: mime?.available === true,
    mimeBacked: mime?.mimeBacked === true,
    mime,
    primaryBody: {
      text: primaryBodyText || '',
      html: normalizeText(contentSections?.primaryBody?.html) || structuredPrimaryBodyHtml || null,
    },
    quotedBlocks,
    signatureBlock,
    systemBlocks,
    contentSections: {
      mode: normalizeText(contentSections?.mode) || 'text_fallback',
      source:
        mime?.available === true
          ? 'mime_backed'
          : structuredPrimaryBodyHtml
            ? 'html'
            : sourceText
              ? 'text'
              : 'empty',
      diagnostics:
        contentSections?.diagnostics && typeof contentSections.diagnostics === 'object'
          ? contentSections.diagnostics
          : {
              blockCount: 0,
              htmlSectioned: false,
            },
      mimePreferredBodyKind: mimePreferredBodyKind || 'empty',
    },
    assets: {
      assetCount:
        Number(assetSummary?.assetCount) ||
        Array.from(new Set([...attachmentIds, ...inlineAssetIds])).length,
      familyCounts,
      attachmentIds,
      inlineAssetIds,
      mimeInlineAssetCount: Array.isArray(mime?.parsed?.assets?.inlineAssets)
        ? mime.parsed.assets.inlineAssets.length
        : 0,
      mimeAttachmentCount: Array.isArray(mime?.parsed?.assets?.attachments)
        ? mime.parsed.assets.attachments.length
        : 0,
    },
    presentation: {
      previewText:
        normalizeText(mailDocument?.previewText || message?.bodyPreview || presentationText) || '',
      conversationText: presentationText || normalizeText(mailDocument?.previewText || message?.bodyPreview),
      conversationHtml: structuredPrimaryBodyHtml || null,
    },
  };
}

function buildCanonicalMailThreadDocument(messages = [], context = {}) {
  const sourceStore = normalizeText(context?.sourceStore) || 'unknown';
  const hydratedMessages = asArray(messages).map((message) => {
    const mailDocument =
      message?.mailDocument && typeof message.mailDocument === 'object' ? message.mailDocument : null;
    return {
      ...message,
      mailThreadMessage: hydrateThreadMessage(message, {
        sourceStore: normalizeText(mailDocument?.sourceStore || sourceStore) || sourceStore,
      }),
    };
  });
  const sortedHydratedMessages = hydratedMessages
    .slice()
    .sort((left, right) =>
      compareIsoDesc(left?.mailThreadMessage?.sentAt || left?.sentAt, right?.mailThreadMessage?.sentAt || right?.sentAt)
    );
  const firstMessage = sortedHydratedMessages[0]?.mailThreadMessage || null;
  const mailboxIds = Array.from(
    new Set(
      hydratedMessages
        .map(
          (message) =>
            normalizeText(
              message?.mailThreadMessage?.mailboxId ||
                message?.mailDocument?.mailboxId ||
                message?.mailboxId ||
                message?.mailboxAddress
            ).toLowerCase()
        )
        .filter(Boolean)
    )
  );

  return {
    version: 'phase_3',
    kind: 'mail_thread_document',
    sourceStore,
    conversationId:
      normalizeText(context?.conversationId || firstMessage?.conversationId || hydratedMessages[0]?.conversationId) ||
      null,
    mailboxIds,
    customerEmail: normalizeText(context?.customerEmail).toLowerCase() || null,
    messageCount: hydratedMessages.length,
    latestMessageId: normalizeText(firstMessage?.messageId) || null,
    hasMimeBackedMessages: hydratedMessages.some(
      (message) => message?.mailThreadMessage?.mimeBacked === true
    ),
    hasQuotedContent: hydratedMessages.some(
      (message) => asArray(message?.mailThreadMessage?.quotedBlocks).length > 0
    ),
    hasSignatureBlocks: hydratedMessages.some(
      (message) => normalizeText(message?.mailThreadMessage?.signatureBlock?.text).length > 0
    ),
    hasSystemBlocks: hydratedMessages.some(
      (message) => asArray(message?.mailThreadMessage?.systemBlocks).length > 0
    ),
    messages: sortedHydratedMessages.map((message) => message.mailThreadMessage),
  };
}

module.exports = {
  buildCanonicalMailThreadDocument,
};
