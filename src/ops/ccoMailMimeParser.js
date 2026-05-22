const { extractTextFromHtml } = require('./ccoMailContentParser');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeContentType(value = '') {
  return normalizeText(value).toLowerCase();
}

function unfoldHeaders(source = '') {
  return String(source || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]+/g, ' ');
}

function splitHeaderBody(source = '') {
  const raw = String(source || '');
  const match = raw.match(/\r?\n\r?\n/);
  if (!match || typeof match.index !== 'number') {
    return {
      headerText: raw,
      bodyText: '',
    };
  }
  return {
    headerText: raw.slice(0, match.index),
    bodyText: raw.slice(match.index + match[0].length),
  };
}

function decodeEncodedWord(_match, charset = '', encoding = '', payload = '') {
  const safeCharset = normalizeText(charset).toLowerCase();
  const safeEncoding = normalizeText(encoding).toLowerCase();
  const safePayload = String(payload || '');

  let buffer = null;
  if (safeEncoding === 'b') {
    try {
      buffer = Buffer.from(safePayload, 'base64');
    } catch (_error) {
      return _match;
    }
  } else if (safeEncoding === 'q') {
    buffer = decodeQuotedPrintableToBuffer(safePayload.replace(/_/g, ' '));
  } else {
    return _match;
  }

  return decodeTextBuffer(buffer, safeCharset);
}

function decodeMimeHeaderWords(value = '') {
  const source = String(value || '');
  if (!source.includes('=?')) return source;
  return source.replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, decodeEncodedWord);
}

function parseHeaders(source = '') {
  const unfolded = unfoldHeaders(source);
  const headers = {};
  unfolded
    .split('\n')
    .map((line) => String(line || ''))
    .forEach((line) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex <= 0) return;
      const name = normalizeText(line.slice(0, separatorIndex)).toLowerCase();
      const value = decodeMimeHeaderWords(line.slice(separatorIndex + 1).trim());
      if (!name) return;
      if (headers[name]) {
        headers[name] = `${headers[name]}, ${value}`;
        return;
      }
      headers[name] = value;
    });
  return headers;
}

function stripOuterQuotes(value = '') {
  const source = normalizeText(value);
  if (!source) return '';
  if (
    (source.startsWith('"') && source.endsWith('"')) ||
    (source.startsWith("'") && source.endsWith("'"))
  ) {
    return source.slice(1, -1);
  }
  return source;
}

function parseHeaderParameters(value = '') {
  const source = String(value || '');
  const segments = source.split(';');
  const kind = normalizeContentType(segments.shift());
  const params = {};
  segments.forEach((segment) => {
    const separatorIndex = segment.indexOf('=');
    if (separatorIndex <= 0) return;
    const key = normalizeText(segment.slice(0, separatorIndex)).toLowerCase();
    const paramValue = decodeMimeHeaderWords(stripOuterQuotes(segment.slice(separatorIndex + 1)));
    if (!key || !paramValue) return;
    params[key] = paramValue;
  });
  return {
    kind,
    params,
  };
}

function decodeQuotedPrintableToBuffer(source = '') {
  const normalized = String(source || '')
    .replace(/=\r\n/g, '')
    .replace(/=\n/g, '');
  const bytes = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === '=' && /^[0-9A-Fa-f]{2}$/.test(normalized.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(normalized.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }
    bytes.push(character.charCodeAt(0));
  }
  return Buffer.from(bytes);
}

function decodeTransferBody(bodyText = '', transferEncoding = '') {
  const safeEncoding = normalizeText(transferEncoding).toLowerCase();
  if (safeEncoding === 'base64') {
    try {
      return Buffer.from(String(bodyText || '').replace(/\s+/g, ''), 'base64');
    } catch (_error) {
      return Buffer.from('', 'utf8');
    }
  }
  if (safeEncoding === 'quoted-printable') {
    return decodeQuotedPrintableToBuffer(bodyText);
  }
  return Buffer.from(String(bodyText || ''), 'utf8');
}

function decodeTextBuffer(buffer = Buffer.from(''), charset = 'utf-8') {
  const safeCharset = normalizeText(charset).toLowerCase() || 'utf-8';
  const normalizedCharset =
    safeCharset === 'utf8'
      ? 'utf-8'
      : safeCharset === 'latin1' || safeCharset === 'iso-8859-1' || safeCharset === 'windows-1252'
        ? 'latin1'
        : safeCharset;

  if (normalizedCharset === 'latin1') {
    return buffer.toString('latin1');
  }
  try {
    return new TextDecoder(normalizedCharset, { fatal: false }).decode(buffer);
  } catch (_error) {
    try {
      return buffer.toString('utf8');
    } catch (_innerError) {
      return buffer.toString('latin1');
    }
  }
}

function splitMultipartBody(bodyText = '', boundary = '') {
  const safeBoundary = normalizeText(boundary);
  if (!safeBoundary) return [];
  const normalized = String(bodyText || '').replace(/\r\n/g, '\n');
  const marker = `--${safeBoundary}`;
  const closingMarker = `--${safeBoundary}--`;
  const lines = normalized.split('\n');
  const parts = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === marker) {
      if (current) {
        parts.push(current.join('\n'));
      }
      current = [];
      continue;
    }
    if (trimmed === closingMarker) {
      if (current) {
        parts.push(current.join('\n'));
      }
      current = null;
      break;
    }
    if (current) current.push(line);
  }

  return parts
    .map((part) => part.replace(/^\n+|\n+$/g, ''))
    .filter(Boolean)
    .map((part) => part.replace(/\n/g, '\r\n'));
}

function normalizeContentId(value = '') {
  return normalizeText(value).replace(/^<|>$/g, '').trim();
}

function extractHtmlCidReferences(html = '') {
  const source = normalizeText(html);
  if (!source) return [];
  const matches = Array.from(source.matchAll(/\bcid:([^"'>\s)]+)/gi));
  return Array.from(
    new Set(matches.map((match) => normalizeContentId(match?.[1]).toLowerCase()).filter(Boolean))
  );
}

function walkMimeEntity(source = '', context = {}) {
  const partId = normalizeText(context?.partId) || '1';
  const ancestors = Array.isArray(context?.ancestors) ? context.ancestors.slice() : [];
  const { headerText, bodyText } = splitHeaderBody(source);
  const headers = parseHeaders(headerText);
  const contentType = parseHeaderParameters(headers['content-type'] || 'text/plain; charset=utf-8');
  const disposition = parseHeaderParameters(headers['content-disposition'] || '');
  const transferEncoding = normalizeText(headers['content-transfer-encoding']).toLowerCase();
  const contentId = normalizeContentId(headers['content-id']);
  const filename =
    normalizeText(disposition?.params?.filename) ||
    normalizeText(contentType?.params?.name) ||
    null;
  const charset = normalizeText(contentType?.params?.charset) || 'utf-8';
  const isMultipart = contentType.kind.startsWith('multipart/');
  const parentTypes = ancestors.map((item) => normalizeContentType(item)).filter(Boolean);

  if (isMultipart) {
    const childParts = splitMultipartBody(bodyText, contentType?.params?.boundary).flatMap(
      (partSource, index) =>
        walkMimeEntity(partSource, {
          partId: `${partId}.${index + 1}`,
          ancestors: [...parentTypes, contentType.kind],
        })
    );
    return childParts;
  }

  const decodedBuffer = decodeTransferBody(bodyText, transferEncoding);
  const normalizedContentType = normalizeContentType(contentType.kind || 'application/octet-stream');
  const decodedText =
    normalizedContentType.startsWith('text/')
      ? normalizeText(decodeTextBuffer(decodedBuffer, charset))
      : '';

  return [
    {
      partId,
      contentType: normalizedContentType || 'application/octet-stream',
      disposition: normalizeText(disposition.kind).toLowerCase() || null,
      filename,
      contentId: contentId || null,
      transferEncoding: transferEncoding || null,
      charset: charset || null,
      decodedSizeBytes: decodedBuffer.length,
      ancestors: parentTypes,
      text:
        normalizedContentType === 'text/html' || normalizedContentType === 'text/plain'
          ? decodedText
          : '',
    },
  ];
}

function scoreHtmlPart(part = {}) {
  const html = normalizeText(part?.text);
  const text = extractTextFromHtml(html);
  let score = 0;
  if (part?.contentType === 'text/html') score += 100;
  if (part?.ancestors?.some((value) => value === 'multipart/alternative')) score += 35;
  if (part?.ancestors?.some((value) => value === 'multipart/related')) score += 10;
  if (/<table\b|<img\b|<div\b|<p\b|<blockquote\b|<section\b|style=/i.test(html)) score += 20;
  score += Math.min(text.length, 2000) / 20;
  return score;
}

function scoreTextPart(part = {}) {
  const text = normalizeText(part?.text);
  let score = 0;
  if (part?.contentType === 'text/plain') score += 90;
  if (part?.ancestors?.some((value) => value === 'multipart/alternative')) score += 25;
  score += Math.min(text.length, 2000) / 25;
  return score;
}

function choosePreferredBody(leafParts = []) {
  const htmlParts = leafParts
    .filter((part) => part?.contentType === 'text/html' && normalizeText(part?.text))
    .sort((left, right) => scoreHtmlPart(right) - scoreHtmlPart(left));
  const textParts = leafParts
    .filter((part) => part?.contentType === 'text/plain' && normalizeText(part?.text))
    .sort((left, right) => scoreTextPart(right) - scoreTextPart(left));

  const bestHtml = htmlParts[0] || null;
  const bestText = textParts[0] || null;
  const htmlText = extractTextFromHtml(normalizeText(bestHtml?.text));
  const plainText = normalizeText(bestText?.text);
  const htmlLooksRich =
    /<table\b|<img\b|<div\b|<p\b|<blockquote\b|<section\b|style=/i.test(
      normalizeText(bestHtml?.text)
    ) || htmlText.length >= 48;
  const preferHtml =
    Boolean(bestHtml) &&
    (htmlLooksRich || (!plainText && htmlText) || htmlText.length >= Math.max(48, plainText.length * 0.6));

  if (preferHtml) {
    return {
      preferredKind: 'html',
      preferredHtml: normalizeText(bestHtml?.text) || null,
      preferredText: htmlText || plainText || '',
      htmlPart: bestHtml,
      textPart: bestText,
      htmlPartId: normalizeText(bestHtml?.partId) || null,
      textPartId: normalizeText(bestText?.partId) || null,
    };
  }

  if (bestText) {
    return {
      preferredKind: 'text',
      preferredHtml: normalizeText(bestHtml?.text) || null,
      preferredText: plainText || htmlText || '',
      htmlPart: bestHtml,
      textPart: bestText,
      htmlPartId: normalizeText(bestHtml?.partId) || null,
      textPartId: normalizeText(bestText?.partId) || null,
    };
  }

  if (bestHtml) {
    return {
      preferredKind: 'html',
      preferredHtml: normalizeText(bestHtml?.text) || null,
      preferredText: htmlText || '',
      htmlPart: bestHtml,
      textPart: bestText,
      htmlPartId: normalizeText(bestHtml?.partId) || null,
      textPartId: normalizeText(bestText?.partId) || null,
    };
  }

  return {
    preferredKind: 'empty',
    preferredHtml: null,
    preferredText: '',
    htmlPart: null,
    textPart: null,
    htmlPartId: null,
    textPartId: null,
  };
}

function buildAssetCollections(leafParts = [], preferredBody = {}) {
  const preferredHtml = normalizeText(preferredBody?.preferredHtml);
  const preferredPartIds = new Set(
    [normalizeText(preferredBody?.htmlPartId), normalizeText(preferredBody?.textPartId)].filter(Boolean)
  );
  const htmlCidReferences = extractHtmlCidReferences(preferredHtml);
  const inlineAssets = [];
  const attachments = [];

  for (const part of leafParts) {
    if (!part || preferredPartIds.has(normalizeText(part?.partId))) continue;
    if (part?.contentType === 'text/plain' || part?.contentType === 'text/html') continue;

    const contentId = normalizeContentId(part?.contentId);
    const referencedInPreferredHtml = contentId
      ? htmlCidReferences.includes(contentId.toLowerCase())
      : false;
    const isInline =
      normalizeText(part?.disposition).toLowerCase() === 'inline' ||
      referencedInPreferredHtml ||
      Boolean(contentId);
    const asset = {
      partId: normalizeText(part?.partId) || null,
      contentType: normalizeContentType(part?.contentType) || 'application/octet-stream',
      disposition: isInline ? 'inline' : 'attachment',
      filename: normalizeText(part?.filename) || null,
      contentId: contentId || null,
      transferEncoding: normalizeText(part?.transferEncoding).toLowerCase() || null,
      decodedSizeBytes: Number(part?.decodedSizeBytes) || 0,
      referencedInPreferredHtml,
      sourceType: isInline ? 'mime_part_inline' : 'mime_part_attachment',
    };
    if (isInline) inlineAssets.push(asset);
    else attachments.push(asset);
  }

  return {
    inlineAssets,
    attachments,
    htmlCidReferences,
  };
}

function parseMailMime(rawMime = '') {
  const normalizedMime = String(rawMime || '');
  if (!normalizeText(normalizedMime)) {
    return {
      preferredBodyKind: 'empty',
      body: {
        preferredHtml: null,
        preferredText: '',
        htmlPartId: null,
        textPartId: null,
      },
      assets: {
        inlineAssets: [],
        attachments: [],
        htmlCidReferences: [],
      },
      diagnostics: {
        partCount: 0,
        htmlPartCount: 0,
        textPartCount: 0,
        inlineAssetCount: 0,
        attachmentCount: 0,
      },
    };
  }

  const leafParts = walkMimeEntity(normalizedMime, {
    partId: '1',
    ancestors: [],
  });
  const preferredBody = choosePreferredBody(leafParts);
  const assets = buildAssetCollections(leafParts, preferredBody);

  return {
    preferredBodyKind: preferredBody.preferredKind,
    body: {
      preferredHtml: preferredBody.preferredHtml,
      preferredText: preferredBody.preferredText,
      htmlPartId: preferredBody.htmlPartId,
      textPartId: preferredBody.textPartId,
    },
    assets,
    diagnostics: {
      partCount: leafParts.length,
      htmlPartCount: leafParts.filter((part) => part?.contentType === 'text/html').length,
      textPartCount: leafParts.filter((part) => part?.contentType === 'text/plain').length,
      inlineAssetCount: assets.inlineAssets.length,
      attachmentCount: assets.attachments.length,
    },
  };
}

module.exports = {
  parseMailMime,
};
