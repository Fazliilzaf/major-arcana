function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeContentType(value = '') {
  return normalizeText(value).toLowerCase();
}

function normalizeInlineCidValue(value = '') {
  const normalized = normalizeText(value)
    .replace(/^cid:/i, '')
    .replace(/^<|>$/g, '')
    .trim()
    .toLowerCase();
  if (!normalized) return [];
  const candidates = new Set([normalized]);
  if (normalized.includes('/')) {
    candidates.add(normalized.split('/')[0]);
  }
  return Array.from(candidates).filter(Boolean);
}

function extractDataImageContentType(value = '') {
  const match = normalizeText(value).match(/^data:([^;,]+)[;,]/i);
  return normalizeContentType(match?.[1]);
}

function getCanonicalMailAssetFamily(asset = {}) {
  const disposition = normalizeText(asset?.disposition).toLowerCase();
  const kind = normalizeText(asset?.kind).toLowerCase();
  const contentType = normalizeContentType(asset?.contentType);
  const renderState = normalizeText(asset?.render?.state).toLowerCase();
  const renderMode = normalizeText(asset?.render?.mode).toLowerCase();
  if (renderState === 'external_https' || renderMode === 'external_url') {
    return 'external';
  }
  if (disposition === 'attachment') return 'attachment';
  if (disposition === 'inline' && (kind === 'image' || contentType.startsWith('image/'))) {
    return 'inline';
  }
  if (disposition === 'inline') return 'inline';
  if (kind === 'attachment') return 'attachment';
  return 'inline';
}

function withCanonicalMailAssetTruth(asset = {}) {
  if (!asset || typeof asset !== 'object') return null;
  return {
    ...asset,
    family: getCanonicalMailAssetFamily(asset),
  };
}

function countCanonicalMailAssetFamilies(assets = []) {
  return asArray(assets).reduce(
    (summary, asset) => {
      const family = getCanonicalMailAssetFamily(asset);
      if (family === 'attachment' || family === 'inline' || family === 'external') {
        summary[family] += 1;
      }
      return summary;
    },
    {
      attachment: 0,
      inline: 0,
      external: 0,
    }
  );
}

function extractInlineAssetReferences(bodyHtml = '') {
  const html = normalizeText(bodyHtml);
  if (!html) return [];
  const matches = Array.from(
    html.matchAll(/<img\b([^>]*)\bsrc\s*=\s*(["'])(.*?)\2([^>]*)>/gi)
  );
  return matches.map((match, index) => {
    const attrs = `${match?.[1] || ''} ${match?.[4] || ''}`;
    const src = normalizeText(match?.[3]);
    const alt = normalizeText(attrs.match(/\balt\s*=\s*(["'])(.*?)\1/i)?.[2]);
    const type = /^data:image\//i.test(src)
      ? 'embedded_data_url'
      : /^https:\/\//i.test(src)
        ? 'external_https'
        : /^cid:/i.test(src)
          ? 'cid_reference'
          : 'other';
    return {
      referenceId: `inline-ref-${index + 1}`,
      referenceType: type,
      src,
      alt: alt || null,
      cidCandidates: type === 'cid_reference' ? normalizeInlineCidValue(src) : [],
      contentType: type === 'embedded_data_url' ? extractDataImageContentType(src) || null : null,
    };
  });
}

function normalizeAttachmentMetadata(attachment = {}) {
  const id = normalizeText(attachment?.id);
  const name = normalizeText(attachment?.name);
  const contentType = normalizeContentType(attachment?.contentType);
  const contentId = normalizeText(attachment?.contentId);
  const size = Number(attachment?.size || 0);
  const contentBytesAvailable =
    attachment?.contentBytesAvailable === true || normalizeText(attachment?.contentBytes).length > 0;
  if (!id && !name && !contentType && !contentId && !size) return null;
  return {
    id: id || null,
    name: name || null,
    contentType: contentType || null,
    contentId: contentId || null,
    isInline: attachment?.isInline === true,
    size: Number.isFinite(size) && size > 0 ? size : 0,
    contentBytesAvailable,
    sourceType: normalizeText(attachment?.sourceType || 'message_attachment') || 'message_attachment',
  };
}

function createAttachmentAsset(attachment = {}, context = {}, index = 0) {
  const safeAttachment = normalizeAttachmentMetadata(attachment);
  if (!safeAttachment) return null;
  const contentType = normalizeContentType(safeAttachment.contentType);
  const isImage = contentType.startsWith('image/');
  const renderState = safeAttachment.isInline
    ? safeAttachment.contentBytesAvailable
      ? 'attachment_content_available'
      : safeAttachment.contentId
        ? 'cid_attachment_metadata_only'
        : 'inline_attachment_metadata_only'
    : 'not_renderable';
  return {
    assetId:
      normalizeText(safeAttachment.id) ||
      normalizeText(safeAttachment.contentId) ||
      normalizeText(safeAttachment.name) ||
      `attachment-${normalizeText(context?.messageId || context?.graphMessageId || 'message') || 'message'}-${index + 1}`,
    messageId: normalizeText(context?.messageId) || null,
    graphMessageId: normalizeText(context?.graphMessageId) || null,
    sourceStore: normalizeText(context?.sourceStore) || 'unknown',
    kind: isImage ? 'image' : 'attachment',
    disposition: safeAttachment.isInline ? 'inline' : 'attachment',
    sourceType: safeAttachment.sourceType,
    attachmentId: safeAttachment.id,
    name: safeAttachment.name,
    contentType: safeAttachment.contentType,
    contentId: safeAttachment.contentId,
    size: safeAttachment.size,
    render: {
      state: renderState,
      mode:
        renderState === 'attachment_content_available'
          ? 'attachment_content'
          : renderState === 'not_renderable'
            ? 'none'
            : 'cid_pending',
      safe: renderState === 'attachment_content_available',
      externalUrl: null,
    },
    download: {
      state: safeAttachment.id ? 'graph_attachment' : 'unavailable',
      available: Boolean(safeAttachment.id),
      attachmentId: safeAttachment.id,
    },
    references: [],
  };
}

function createInlineReferenceAsset(reference = {}, context = {}) {
  const safeType = normalizeText(reference?.referenceType);
  const safeSrc = normalizeText(reference?.src);
  if (!safeType || !safeSrc) return null;
  const assetId = `html-inline-${normalizeText(reference?.referenceId) || Math.random().toString(36).slice(2, 10)}`;
  const contentType =
    safeType === 'embedded_data_url'
      ? extractDataImageContentType(safeSrc) || null
      : normalizeContentType(reference?.contentType) || null;
  return {
    assetId,
    messageId: normalizeText(context?.messageId) || null,
    graphMessageId: normalizeText(context?.graphMessageId) || null,
    sourceStore: normalizeText(context?.sourceStore) || 'unknown',
    kind: 'image',
    disposition: 'inline',
    sourceType: 'body_html_inline',
    attachmentId: null,
    name: normalizeText(reference?.alt) || null,
    contentType,
    contentId: null,
    size: 0,
    render: {
      state:
        safeType === 'embedded_data_url'
          ? 'embedded_in_body_html'
          : safeType === 'external_https'
            ? 'external_https'
            : safeType === 'cid_reference'
              ? 'cid_unresolved'
              : 'not_renderable',
      mode:
        safeType === 'embedded_data_url'
          ? 'body_html'
          : safeType === 'external_https'
            ? 'external_url'
            : 'none',
      safe: safeType === 'embedded_data_url' || safeType === 'external_https',
      externalUrl: safeType === 'external_https' ? safeSrc : null,
    },
    download: {
      state: 'unavailable',
      available: false,
      attachmentId: null,
    },
    references: [
      {
        type: 'img_src',
        referenceType: safeType,
        src: safeSrc,
      },
    ],
  };
}

function buildCanonicalMailAssets({
  messageId = '',
  graphMessageId = '',
  bodyHtml = '',
  attachments = [],
  sourceStore = 'unknown',
} = {}) {
  const context = {
    messageId,
    graphMessageId,
    sourceStore,
  };
  const normalizedAttachments = asArray(attachments)
    .map(normalizeAttachmentMetadata)
    .filter(Boolean);
  const attachmentAssets = normalizedAttachments
    .map((attachment, index) => createAttachmentAsset(attachment, context, index))
    .filter(Boolean);
  const attachmentByCid = new Map();
  attachmentAssets.forEach((asset) => {
    const cidCandidates = [
      ...normalizeInlineCidValue(asset?.contentId),
      ...normalizeInlineCidValue(asset?.attachmentId),
      ...normalizeInlineCidValue(asset?.name),
    ];
    cidCandidates.forEach((candidate) => {
      if (!attachmentByCid.has(candidate)) attachmentByCid.set(candidate, asset);
    });
  });

  const inlineReferenceAssets = [];
  extractInlineAssetReferences(bodyHtml).forEach((reference) => {
    if (reference.referenceType === 'cid_reference') {
      const matched = reference.cidCandidates
        .map((candidate) => attachmentByCid.get(candidate))
        .find(Boolean);
      if (matched) {
        matched.disposition = 'inline';
        matched.references = [
          ...asArray(matched.references),
          {
            type: 'img_src',
            referenceType: 'cid_reference',
            src: reference.src,
          },
        ];
        if (/data:image\//i.test(bodyHtml)) {
          matched.render = {
            state: 'embedded_in_body_html',
            mode: 'body_html',
            safe: true,
            externalUrl: null,
          };
        }
        return;
      }
    }
    const asset = createInlineReferenceAsset(reference, context);
    if (asset) inlineReferenceAssets.push(asset);
  });

  const attachmentAssetIds = new Set(
    attachmentAssets.map((asset) => normalizeText(asset?.assetId)).filter(Boolean)
  );
  const allAssets = [...attachmentAssets, ...inlineReferenceAssets]
    .map(withCanonicalMailAssetTruth)
    .filter(Boolean);
  const assetRegistry = allAssets.reduce((registry, asset) => {
    if (!asset?.assetId) return registry;
    registry[asset.assetId] = asset;
    return registry;
  }, {});
  const inlineAssets = allAssets.filter((asset) => asset?.disposition === 'inline');
  const attachmentList = allAssets.filter((asset) => attachmentAssetIds.has(normalizeText(asset?.assetId)));
  const familyCounts = countCanonicalMailAssetFamilies(allAssets);

  return {
    assets: allAssets,
    attachments: attachmentList,
    inlineAssets,
    assetRegistry,
    assetSummary: {
      assetCount: allAssets.length,
      attachmentCount: attachmentList.length,
      inlineAssetCount: inlineAssets.length,
      familyCounts,
      downloadableCount: allAssets.filter((asset) => asset?.download?.available === true).length,
      renderableInlineCount: inlineAssets.filter((asset) => asset?.render?.safe === true).length,
      unresolvedInlineCount: inlineAssets.filter((asset) =>
        ['cid_unresolved', 'cid_attachment_metadata_only', 'inline_attachment_metadata_only'].includes(
          normalizeText(asset?.render?.state)
        )
      ).length,
    },
  };
}

module.exports = {
  buildCanonicalMailAssets,
  extractInlineAssetReferences,
  getCanonicalMailAssetFamily,
};
