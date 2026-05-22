const { parseMailMime } = require('./ccoMailMimeParser');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values = []) {
  return Array.from(new Set(asArray(values).map((value) => normalizeText(value)).filter(Boolean)));
}

function getMailMimeTriggerReasons(message = {}) {
  const bodyHtml = normalizeText(message?.bodyHtml);
  const reasons = [];

  if (!bodyHtml) return reasons;
  if (/<table\b/i.test(bodyHtml)) reasons.push('tabular_html');
  if (/<img\b/i.test(bodyHtml)) reasons.push('html_images');
  if (/cid:/i.test(bodyHtml)) reasons.push('inline_cid_reference');
  if (/<blockquote\b/i.test(bodyHtml)) reasons.push('quoted_html');
  if (/<[^>]+\sstyle=|<style\b|<section\b|<article\b|<header\b|<footer\b/i.test(bodyHtml)) {
    reasons.push('rich_layout_html');
  }
  if (message?.hasAttachments === true && /<img\b|cid:/i.test(bodyHtml)) {
    reasons.push('attachment_backed_html');
  }
  if (bodyHtml.length >= 4000) reasons.push('long_html_body');

  return unique(reasons);
}

function shouldFetchMimeForOpenMail(message = {}) {
  return getMailMimeTriggerReasons(message).length > 0;
}

function summarizeRawMime(rawMime = '') {
  const source = normalizeText(rawMime);
  if (!source) {
    return {
      sizeBytes: 0,
      signals: {
        hasMimeVersion: false,
        hasMultipart: false,
        hasTextHtmlPart: false,
        hasTextPlainPart: false,
        hasInlineCidReferences: false,
        hasInlineDisposition: false,
        hasAttachmentDisposition: false,
      },
    };
  }

  return {
    sizeBytes: Buffer.byteLength(source, 'utf8'),
    signals: {
      hasMimeVersion: /^mime-version:/im.test(source),
      hasMultipart: /^content-type:\s*multipart\//im.test(source),
      hasTextHtmlPart: /^content-type:\s*text\/html\b/im.test(source),
      hasTextPlainPart: /^content-type:\s*text\/plain\b/im.test(source),
      hasInlineCidReferences: /\bcid:/i.test(source) || /^content-id:/im.test(source),
      hasInlineDisposition: /^content-disposition:\s*inline\b/im.test(source),
      hasAttachmentDisposition: /^content-disposition:\s*attachment\b/im.test(source),
    },
  };
}

function buildCanonicalMailMimeMetadata({
  rawMime = '',
  contentType = '',
  fetchState = 'unrequested',
  triggerReasons = [],
  errorCode = '',
  errorMessage = '',
} = {}) {
  const normalizedFetchState = normalizeText(fetchState).toLowerCase() || 'unrequested';
  const normalizedMime = normalizeText(rawMime);
  const normalizedContentType = normalizeText(contentType).toLowerCase() || null;
  const summary = summarizeRawMime(normalizedMime);
  const parsedMime = normalizedMime ? parseMailMime(normalizedMime) : null;

  return {
    version: parsedMime ? 'phase_b' : 'phase_a',
    kind: 'mail_mime_metadata',
    source: 'graph_message_mime',
    fetchState: normalizedFetchState,
    available: Boolean(normalizedMime),
    mimeBacked: Boolean(normalizedMime),
    contentType: normalizedContentType,
    triggerReasons: unique(triggerReasons),
    sizeBytes: summary.sizeBytes,
    signals: summary.signals,
    parsed: parsedMime
      ? {
          preferredBodyKind: normalizeText(parsedMime?.preferredBodyKind) || 'empty',
          body:
            parsedMime?.body && typeof parsedMime.body === 'object'
              ? {
                  preferredHtml: normalizeText(parsedMime.body.preferredHtml) || null,
                  preferredText: normalizeText(parsedMime.body.preferredText) || '',
                  htmlPartId: normalizeText(parsedMime.body.htmlPartId) || null,
                  textPartId: normalizeText(parsedMime.body.textPartId) || null,
                }
              : {
                  preferredHtml: null,
                  preferredText: '',
                  htmlPartId: null,
                  textPartId: null,
                },
          assets:
            parsedMime?.assets && typeof parsedMime.assets === 'object'
              ? {
                  inlineAssets: asArray(parsedMime.assets.inlineAssets).map((asset) => ({
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
                  })),
                  attachments: asArray(parsedMime.assets.attachments).map((asset) => ({
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
                  })),
                  htmlCidReferences: asArray(parsedMime.assets.htmlCidReferences)
                    .map((value) => normalizeText(value).toLowerCase())
                    .filter(Boolean),
                }
              : {
                  inlineAssets: [],
                  attachments: [],
                  htmlCidReferences: [],
                },
          diagnostics:
            parsedMime?.diagnostics && typeof parsedMime.diagnostics === 'object'
              ? {
                  partCount: Number(parsedMime.diagnostics.partCount) || 0,
                  htmlPartCount: Number(parsedMime.diagnostics.htmlPartCount) || 0,
                  textPartCount: Number(parsedMime.diagnostics.textPartCount) || 0,
                  inlineAssetCount: Number(parsedMime.diagnostics.inlineAssetCount) || 0,
                  attachmentCount: Number(parsedMime.diagnostics.attachmentCount) || 0,
                }
              : {
                  partCount: 0,
                  htmlPartCount: 0,
                  textPartCount: 0,
                  inlineAssetCount: 0,
                  attachmentCount: 0,
                },
        }
      : null,
    errorCode: normalizeText(errorCode) || null,
    errorMessage: normalizeText(errorMessage) || null,
  };
}

module.exports = {
  buildCanonicalMailMimeMetadata,
  getMailMimeTriggerReasons,
  shouldFetchMimeForOpenMail,
};
