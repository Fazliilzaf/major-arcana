const { buildCanonicalMailAssets } = require('./ccoMailAssetLayer');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeDirection(value = '') {
  return normalizeText(value).toLowerCase() === 'outbound' ? 'outbound' : 'inbound';
}

function normalizeEmail(value = '') {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return '';
  const match = raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].toLowerCase() : '';
}

function decodeHtmlEntities(value = '') {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => {
      const parsed = Number.parseInt(code, 16);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : ' ';
    })
    .replace(/&#([0-9]+);/g, (_match, code) => {
      const parsed = Number.parseInt(code, 10);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : ' ';
    });
}

function extractTextFromHtml(value = '') {
  const html = normalizeText(value);
  if (!html) return '';
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|li|tr|table|ul|ol|section|article|header|footer|blockquote)>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function toParticipant(input = {}) {
  if (typeof input === 'string') {
    const email = normalizeEmail(input);
    return email
      ? {
          email,
          name: null,
        }
      : null;
  }
  const email = normalizeEmail(input?.address || input?.email);
  const name = normalizeText(input?.name);
  if (!email && !name) return null;
  return {
    email: email || null,
    name: name || null,
  };
}

function toParticipantList(values = [], maxItems = 20) {
  return asArray(values)
    .map((item) =>
      typeof item === 'string'
        ? toParticipant(item)
        : toParticipant({
            address: item?.address || item?.emailAddress?.address || item?.email,
            name: item?.name || item?.emailAddress?.name,
          })
    )
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeMimeMetadata(input = null) {
  if (!input || typeof input !== 'object') return null;
  const parsed =
    input?.parsed && typeof input.parsed === 'object'
      ? {
          preferredBodyKind: normalizeText(input?.parsed?.preferredBodyKind) || 'empty',
          body:
            input?.parsed?.body && typeof input.parsed.body === 'object'
              ? {
                  preferredHtml: normalizeText(input.parsed.body.preferredHtml) || null,
                  preferredText: normalizeText(input.parsed.body.preferredText) || '',
                  htmlPartId: normalizeText(input.parsed.body.htmlPartId) || null,
                  textPartId: normalizeText(input.parsed.body.textPartId) || null,
                }
              : {
                  preferredHtml: null,
                  preferredText: '',
                  htmlPartId: null,
                  textPartId: null,
                },
          assets:
            input?.parsed?.assets && typeof input.parsed.assets === 'object'
              ? {
                  inlineAssets: asArray(input.parsed.assets.inlineAssets)
                    .map((asset) =>
                      asset && typeof asset === 'object'
                        ? {
                            partId: normalizeText(asset?.partId) || null,
                            contentType: normalizeText(asset?.contentType).toLowerCase() || null,
                            disposition: normalizeText(asset?.disposition).toLowerCase() || null,
                            filename: normalizeText(asset?.filename) || null,
                            contentId: normalizeText(asset?.contentId) || null,
                            transferEncoding:
                              normalizeText(asset?.transferEncoding).toLowerCase() || null,
                            decodedSizeBytes: Number(asset?.decodedSizeBytes) || 0,
                            referencedInPreferredHtml: asset?.referencedInPreferredHtml === true,
                            sourceType: normalizeText(asset?.sourceType) || 'mime_part_inline',
                          }
                        : null
                    )
                    .filter(Boolean),
                  attachments: asArray(input.parsed.assets.attachments)
                    .map((asset) =>
                      asset && typeof asset === 'object'
                        ? {
                            partId: normalizeText(asset?.partId) || null,
                            contentType: normalizeText(asset?.contentType).toLowerCase() || null,
                            disposition: normalizeText(asset?.disposition).toLowerCase() || null,
                            filename: normalizeText(asset?.filename) || null,
                            contentId: normalizeText(asset?.contentId) || null,
                            transferEncoding:
                              normalizeText(asset?.transferEncoding).toLowerCase() || null,
                            decodedSizeBytes: Number(asset?.decodedSizeBytes) || 0,
                            referencedInPreferredHtml: asset?.referencedInPreferredHtml === true,
                            sourceType: normalizeText(asset?.sourceType) || 'mime_part_attachment',
                          }
                        : null
                    )
                    .filter(Boolean),
                  htmlCidReferences: asArray(input.parsed.assets.htmlCidReferences)
                    .map((value) => normalizeText(value).toLowerCase())
                    .filter(Boolean),
                }
              : {
                  inlineAssets: [],
                  attachments: [],
                  htmlCidReferences: [],
                },
          diagnostics:
            input?.parsed?.diagnostics && typeof input.parsed.diagnostics === 'object'
              ? {
                  partCount: Number(input.parsed.diagnostics.partCount) || 0,
                  htmlPartCount: Number(input.parsed.diagnostics.htmlPartCount) || 0,
                  textPartCount: Number(input.parsed.diagnostics.textPartCount) || 0,
                  inlineAssetCount: Number(input.parsed.diagnostics.inlineAssetCount) || 0,
                  attachmentCount: Number(input.parsed.diagnostics.attachmentCount) || 0,
                }
              : {
                  partCount: 0,
                  htmlPartCount: 0,
                  textPartCount: 0,
                  inlineAssetCount: 0,
                  attachmentCount: 0,
                },
        }
      : null;
  return {
    version: normalizeText(input?.version) || 'phase_a',
    kind: normalizeText(input?.kind) || 'mail_mime_metadata',
    source: normalizeText(input?.source) || 'graph_message_mime',
    fetchState: normalizeText(input?.fetchState) || 'unrequested',
    available: input?.available === true,
    mimeBacked: input?.mimeBacked === true || input?.available === true,
    contentType: normalizeText(input?.contentType) || null,
    triggerReasons: asArray(input?.triggerReasons)
      .map((reason) => normalizeText(reason))
      .filter(Boolean),
    sizeBytes: Number.isFinite(Number(input?.sizeBytes)) ? Number(input.sizeBytes) : 0,
    signals:
      input?.signals && typeof input.signals === 'object'
        ? {
            hasMimeVersion: input.signals.hasMimeVersion === true,
            hasMultipart: input.signals.hasMultipart === true,
            hasTextHtmlPart: input.signals.hasTextHtmlPart === true,
            hasTextPlainPart: input.signals.hasTextPlainPart === true,
            hasInlineCidReferences: input.signals.hasInlineCidReferences === true,
            hasInlineDisposition: input.signals.hasInlineDisposition === true,
            hasAttachmentDisposition: input.signals.hasAttachmentDisposition === true,
          }
        : {
            hasMimeVersion: false,
            hasMultipart: false,
            hasTextHtmlPart: false,
            hasTextPlainPart: false,
            hasInlineCidReferences: false,
            hasInlineDisposition: false,
            hasAttachmentDisposition: false,
          },
    parsed,
    errorCode: normalizeText(input?.errorCode) || null,
    errorMessage: normalizeText(input?.errorMessage) || null,
  };
}

function toMimeAttachmentMetadata(mime = null) {
  const parsed = mime?.parsed && typeof mime.parsed === 'object' ? mime.parsed : null;
  if (!parsed) return [];
  const inlineAssets = asArray(parsed?.assets?.inlineAssets).map((asset) => ({
    id: null,
    name: normalizeText(asset?.filename) || null,
    contentType: normalizeText(asset?.contentType).toLowerCase() || null,
    contentId: normalizeText(asset?.contentId) || null,
    isInline: true,
    size: Number(asset?.decodedSizeBytes) || 0,
    contentBytesAvailable: false,
    sourceType: normalizeText(asset?.sourceType) || 'mime_part_inline',
  }));
  const attachments = asArray(parsed?.assets?.attachments).map((asset) => ({
    id: null,
    name: normalizeText(asset?.filename) || null,
    contentType: normalizeText(asset?.contentType).toLowerCase() || null,
    contentId: normalizeText(asset?.contentId) || null,
    isInline: normalizeText(asset?.disposition).toLowerCase() === 'inline',
    size: Number(asset?.decodedSizeBytes) || 0,
    contentBytesAvailable: false,
    sourceType: normalizeText(asset?.sourceType) || 'mime_part_attachment',
  }));
  return [...inlineAssets, ...attachments];
}

function mergeAttachmentMetadata(primary = [], secondary = []) {
  const merged = [];
  const seen = new Set();
  [...asArray(primary), ...asArray(secondary)].forEach((attachment) => {
    if (!attachment || typeof attachment !== 'object') return;
    const disposition = attachment?.isInline === true ? 'inline' : 'attachment';
    const signatures = [
      normalizeText(attachment?.contentId)
        ? `cid::${normalizeText(attachment?.contentId).toLowerCase()}::${disposition}`
        : '',
      normalizeText(attachment?.name) && normalizeText(attachment?.contentType)
        ? `name::${normalizeText(attachment?.name).toLowerCase()}::${normalizeText(
            attachment?.contentType
          ).toLowerCase()}::${disposition}`
        : '',
      normalizeText(attachment?.id) ? `id::${normalizeText(attachment?.id)}` : '',
    ].filter(Boolean);
    if (!signatures.length || signatures.some((signature) => seen.has(signature))) return;
    signatures.forEach((signature) => seen.add(signature));
    merged.push(attachment);
  });
  return merged;
}

function resolveCidInHtml(html = '', attachments = [], message = {}) {
  const source = normalizeText(html);
  if (!source || !/\bcid:/i.test(source)) return source;

  const cidMap = new Map();

  for (const att of asArray(attachments)) {
    const contentType = normalizeText(att?.contentType).toLowerCase();
    const contentId = normalizeText(att?.contentId).toLowerCase();
    const contentBytes = normalizeText(att?.contentBytes);
    const name = normalizeText(att?.name);
    const id = normalizeText(att?.id);
    if (!contentId && !name && !id) continue;

    const candidates = [contentId, name?.toLowerCase(), id?.toLowerCase()].filter(Boolean);
    let replacement = '';

    if (contentType.startsWith('image/') && contentBytes) {
      replacement = `data:${contentType};base64,${contentBytes}`;
    } else if (id) {
      const mailboxId = normalizeText(
        message?.mailboxId || message?.mailboxAddress || message?.userPrincipalName
      );
      const messageId = normalizeText(message?.graphMessageId || message?.messageId);
      if (mailboxId && messageId) {
        const params = new URLSearchParams({
          mailboxId,
          messageId,
          attachmentId: id,
          mode: 'open',
        });
        if (name) params.set('fileName', name);
        replacement = `/api/v1/cco/runtime/mail-asset/content?${params.toString()}`;
      }
    }

    if (replacement) {
      candidates.forEach((c) => {
        if (!cidMap.has(c)) cidMap.set(c, replacement);
      });
    }
  }

  if (cidMap.size === 0) return source;

  return source.replace(
    /(<img\b[^>]*\bsrc\s*=\s*['"])\s*cid:([^'"]+)(['"][^>]*>)/gi,
    (match, prefix, rawCid, suffix) => {
      const candidates = [
        normalizeText(rawCid).toLowerCase(),
        normalizeText(rawCid).toLowerCase().replace(/^<|>$/g, ''),
      ].filter(Boolean);
      const resolved = candidates.find((c) => cidMap.has(c));
      if (!resolved) return match;
      return `${prefix}${cidMap.get(resolved)}${suffix}`;
    }
  );
}

function buildCanonicalMailDocument(message = {}, { sourceStore = 'unknown' } = {}) {
  const mime = normalizeMimeMetadata(message?.mime);
  const mimePreferredHtml = normalizeText(mime?.parsed?.body?.preferredHtml);
  const mimePreferredText = normalizeText(mime?.parsed?.body?.preferredText);
  const primaryBodyHtmlBeforeCidResolve = mimePreferredHtml || normalizeText(message?.bodyHtml);
  const explicitBodyText =
    mimePreferredText ||
    normalizeText(message?.body || message?.detail || message?.summary || message?.content);
  const previewText = normalizeText(
    message?.bodyPreview || message?.preview || message?.snippet || message?.summary
  );
  const htmlDerivedText = extractTextFromHtml(primaryBodyHtmlBeforeCidResolve);
  const primaryBodyText = explicitBodyText || htmlDerivedText || previewText;
  const hasStructuredHtml = /<table\b|<img\b|<a\b|<div\b|<p\b|<ul\b|<ol\b|style=/i.test(
    primaryBodyHtmlBeforeCidResolve
  );
  const mergedAttachments = mergeAttachmentMetadata(
    asArray(message?.attachments),
    toMimeAttachmentMetadata(mime)
  );
  const canonicalAssets = buildCanonicalMailAssets({
    messageId: normalizeText(message?.messageId || message?.graphMessageId),
    graphMessageId: normalizeText(message?.graphMessageId || message?.messageId),
    bodyHtml: primaryBodyHtmlBeforeCidResolve,
    attachments: mergedAttachments,
    sourceStore,
  });
  const primaryBodyHtml = resolveCidInHtml(
    primaryBodyHtmlBeforeCidResolve,
    asArray(message?.attachments),
    message
  );
  const attachments = canonicalAssets.attachments;
  const inlineAssets = canonicalAssets.inlineAssets;
  const assets = canonicalAssets.assets;
  const declaredHasAttachments = message?.hasAttachments === true;
  const hasAttachmentMetadata = attachments.length > 0;
  const sourceDepth =
    mime?.available === true
      ? 'mime'
      : primaryBodyHtml
        ? 'html'
        : primaryBodyText
          ? 'text'
          : 'empty';

  return {
    version: 'phase_2',
    kind: 'mail_document',
    sourceStore: normalizeText(sourceStore) || 'unknown',
    messageId: normalizeText(message?.messageId || message?.graphMessageId) || null,
    graphMessageId: normalizeText(message?.graphMessageId || message?.messageId) || null,
    conversationId:
      normalizeText(message?.conversationId || message?.mailboxConversationId) || null,
    mailboxId:
      normalizeEmail(message?.mailboxId || message?.mailboxAddress || message?.userPrincipalName) ||
      null,
    mailboxAddress:
      normalizeEmail(message?.mailboxAddress || message?.mailboxId || message?.userPrincipalName) ||
      null,
    userPrincipalName:
      normalizeEmail(message?.userPrincipalName || message?.mailboxAddress || message?.mailboxId) ||
      null,
    subject: normalizeText(message?.subject) || '(utan ämne)',
    direction: normalizeDirection(message?.direction),
    sentAt:
      normalizeText(
        message?.sentAt || message?.receivedAt || message?.createdAt || message?.lastModifiedAt
      ) || null,
    from: toParticipant({
      address: message?.senderEmail || message?.from?.address,
      name: message?.senderName || message?.from?.name,
    }),
    to: toParticipantList(message?.toRecipients || message?.recipients),
    cc: toParticipantList(message?.ccRecipients),
    replyTo: toParticipantList(message?.replyToRecipients),
    previewText: previewText || '',
    primaryBodyText: primaryBodyText || '',
    primaryBodyHtml: primaryBodyHtml || null,
    sourceDepth,
    mimeAvailable: mime?.available === true,
    mimeBacked: mime?.mimeBacked === true,
    mime,
    quotedBlocks: [],
    signatureBlock: null,
    systemBlocks: [],
    declaredHasAttachments,
    hasAttachments: hasAttachmentMetadata,
    assets,
    attachments,
    inlineAssets,
    assetRegistry: canonicalAssets.assetRegistry,
    assetSummary: {
      ...canonicalAssets.assetSummary,
      metadataAttachmentCount: attachments.length,
      declaredHasAttachments,
      declaredHasAttachmentsWithoutMetadata:
        declaredHasAttachments === true && hasAttachmentMetadata === false,
    },
    fidelity: {
      bodyDepth: primaryBodyHtml ? 'html' : primaryBodyText ? 'text' : 'empty',
      sourceDepth,
      hasHtmlBody: Boolean(primaryBodyHtml),
      hasStructuredHtml,
      hasInlineAssets: inlineAssets.length > 0,
      hasRenderableInlineAssets:
        Number(canonicalAssets.assetSummary?.renderableInlineCount || 0) > 0,
      mimeAvailable: mime?.available === true,
      mimeBacked: mime?.mimeBacked === true,
      mimePreferredBodyKind: normalizeText(mime?.parsed?.preferredBodyKind) || 'empty',
    },
  };
}

module.exports = {
  buildCanonicalMailDocument,
  extractTextFromHtml,
};
