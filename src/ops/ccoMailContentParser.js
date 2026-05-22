function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
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
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

const SYSTEM_BLOCK_PATTERNS = [
  /^Du\s+f[åa]r\s+inte\s+ofta\s+e-post\s+från\s+(?:\[[^\]]+\]|\S+)\.?\s*/i,
  /^Vissa\s+som\s+har\s+f[aå]tt\s+det\s+h[aä]r\s+meddelandet\s+f[aå]r\s+inte\s+ofta\s+e-post\s+från\s+(?:\[[^\]]+\]|\S+)\.?\s*/i,
  /^You\s+don['’]t\s+often\s+get\s+email\s+from\s+\S+\.?\s*/i,
  /^Power up your productivity with Microsoft 365\.?\s*/i,
  /^Get more done with apps like Word\.?\s*/i,
  /^Learn why this is important\.?\s*/i,
  /^L[aä]s om varf[oö]r det h[aä]r [aä]r viktigt\.?\s*/i,
  /^Read more about why this is important\.?\s*/i,
];

const QUOTED_REPLY_PATTERNS = [
  /(?:^|\n)(?:\d{1,2}\s+\S.+?\bskrev\b.+:)[\s\S]*$/i,
  /(?:^|\n)(?:\S+\s+\d{1,2}\s+\S.+?\bskrev\b.+:)[\s\S]*$/i,
  /(?:^|\n)On\s+.+?\bwrote:\s*[\s\S]*$/i,
  /\n(?:Från|From):\s*.+?(?:Datum|Date):\s*.+?(?:Till|To):\s*.+?(?:Ämne|Subject):\s*[\s\S]*$/i,
  /(?:^|\n)_{10,}[\s\S]*$/i,
  /(?:^|\n)(?:Från|From):\s*[\s\S]*$/i,
];

const SIGNATURE_MARKER_PATTERN =
  /^(?:B[aä]sta hälsningar|Med vänlig hälsning|Vänliga hälsningar|Best regards|Regards|Hälsningar|MVH|Mvh|Skickat från Outlook för Mac|Skickat från min iPhone|Sent from Outlook for Mac|Sent from my iPhone)\b/i;

const SIGNATURE_IDENTITY_PATTERN =
  /(?:@[A-Z0-9._%+-]+|https?:\/\/|www\.|\+?\d[\d\s().-]{5,}|Hair TP Clinic|Vasaplatsen|Göteborg)/i;

const BLOCK_SPLIT_SENTINEL = '__ARCANA_MAIL_BLOCK__';

function collectSignatureIdentityTokens(value = '') {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) return [];
  const emailMatches = normalizedValue.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const urlMatches = normalizedValue.match(/https?:\/\/\S+|www\.\S+/gi) || [];
  const phoneMatches = normalizedValue.match(/\+?\d[\d\s().-]{5,}/g) || [];
  return Array.from(
    new Set(
      [...emailMatches, ...urlMatches, ...phoneMatches]
        .map((item) => normalizeText(item).toLowerCase())
        .filter(Boolean)
    )
  );
}

function buildSignatureTruth({ text = '', html = '' } = {}) {
  const signatureText = normalizeText(text);
  const signatureHtml = normalizeText(html);
  if (!signatureText && !signatureHtml) {
    return {
      confidence: 'none',
      visibleInReadSurface: false,
      layoutUnsafe: false,
      layoutHeavy: false,
      hasExplicitGreeting: false,
      hasIdentityCue: false,
      hasVisualCue: false,
      hasTableCue: false,
      label: '',
    };
  }

  const lines = signatureText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const greetingLineCount = lines.filter((line) => SIGNATURE_MARKER_PATTERN.test(line)).length;
  const identityTokens = collectSignatureIdentityTokens(signatureText);
  const hasVisualCue = /<img\b/i.test(signatureHtml);
  const hasTableCue = /<table\b/i.test(signatureHtml);
  const hasExplicitGreeting = greetingLineCount > 0;
  const hasIdentityCue = identityTokens.length > 0 || SIGNATURE_IDENTITY_PATTERN.test(signatureText);
  const isHairTpSignature = /hairtpclinic\.com|Hair TP Clinic|hårspecialist|vasaplatsen/i.test(
    `${signatureText}\n${signatureHtml}`
  );
  const layoutHeavy =
    hasVisualCue ||
    hasTableCue ||
    lines.length >= 6 ||
    signatureText.length >= 220;

  let confidence = 'low';
  if (isHairTpSignature && (hasExplicitGreeting || hasIdentityCue)) {
    confidence = 'high';
  } else if (hasExplicitGreeting && (hasIdentityCue || hasVisualCue || lines.length >= 2)) {
    confidence = 'high';
  } else if (hasIdentityCue && (lines.length >= 2 || hasVisualCue)) {
    confidence = 'medium';
  }

  const layoutUnsafe =
    hasVisualCue ||
    hasTableCue ||
    lines.length > 5 ||
    signatureText.length > 180;

  return {
    confidence,
    visibleInReadSurface: isHairTpSignature ? true : !(confidence !== 'high' || layoutUnsafe),
    layoutUnsafe,
    layoutHeavy,
    hasExplicitGreeting,
    hasIdentityCue,
    hasVisualCue,
    hasTableCue,
    label: confidence === 'high' || isHairTpSignature ? 'Signatur' : 'Avsändarfooter',
  };
}

function matchesPattern(text = '', patterns = []) {
  const normalized = normalizeText(text);
  return Boolean(normalized) && patterns.some((pattern) => pattern.test(normalized));
}

function splitHtmlIntoBlocks(html = '') {
  const normalizedHtml = normalizeText(html);
  if (!normalizedHtml) return [];
  const separatedHtml = normalizedHtml
    .replace(/(?=<(?:p|div|table|section|article|header|footer|ul|ol|li|tr|td)\b)/gi, BLOCK_SPLIT_SENTINEL)
    .replace(/<br\s*\/?>/gi, '<br />')
    .replace(new RegExp(`${BLOCK_SPLIT_SENTINEL}${BLOCK_SPLIT_SENTINEL}+`, 'g'), BLOCK_SPLIT_SENTINEL);
  const parts = separatedHtml
    .split(BLOCK_SPLIT_SENTINEL)
    .map((part) => normalizeText(part))
    .filter(Boolean);
  if (!parts.length) return [];
  return parts.map((part) => ({
    text: extractTextFromHtml(part),
    html: part,
    hasVisualCue: /<img\b/i.test(part),
  }));
}

function stripLeadingSystemBlocksFromText(text = '') {
  let remaining = normalizeText(text);
  const systemBlocks = [];
  let changed = true;
  while (remaining && changed) {
    changed = false;
    for (const pattern of SYSTEM_BLOCK_PATTERNS) {
      const match = remaining.match(pattern);
      if (!match || match.index !== 0) continue;
      const blockText = normalizeText(match[0]);
      if (blockText) {
        systemBlocks.push({
          kind: 'system_block',
          role: 'provider_notice',
          text: blockText,
          html: null,
        });
      }
      remaining = normalizeText(remaining.slice(match[0].length));
      changed = true;
      break;
    }
  }
  return {
    text: remaining,
    systemBlocks,
  };
}

function splitQuotedReplyBlockFromText(text = '') {
  const source = normalizeText(text);
  if (!source) {
    return {
      primaryText: '',
      quotedBlocks: [],
    };
  }
  for (const pattern of QUOTED_REPLY_PATTERNS) {
    const match = source.match(pattern);
    if (!match || typeof match.index !== 'number' || match.index <= 24) continue;
    const quotedText = normalizeText(match[0]);
    return {
      primaryText: normalizeText(source.slice(0, match.index)),
      quotedBlocks: quotedText
        ? [
            {
              kind: 'quoted_block',
              role: 'reply_chain',
              text: quotedText,
              html: null,
            },
          ]
        : [],
    };
  }
  return {
    primaryText: source,
    quotedBlocks: [],
  };
}

function splitSignatureBlockFromText(text = '') {
  const lines = normalizeText(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    return {
      primaryText: '',
      signatureBlock: null,
    };
  }
  const signatureIndex = lines.findIndex(
    (line, index) => index > 0 && SIGNATURE_MARKER_PATTERN.test(line)
  );
  if (signatureIndex < 0) {
    return {
      primaryText: lines.join('\n').trim(),
      signatureBlock: null,
    };
  }
  const primaryText = lines.slice(0, signatureIndex).join('\n').trim();
  const signatureText = lines.slice(signatureIndex).join('\n').trim();
  return {
    primaryText,
    signatureBlock: signatureText
      ? {
          kind: 'signature_block',
          role: 'signature',
          text: signatureText,
          html: null,
          truth: buildSignatureTruth({
            text: signatureText,
            html: '',
          }),
        }
      : null,
  };
}

function buildTextFallbackSections({
  sourceText = '',
  primaryBodyHtml = '',
} = {}) {
  const strippedSystem = stripLeadingSystemBlocksFromText(sourceText);
  const splitQuoted = splitQuotedReplyBlockFromText(strippedSystem.text);
  const splitSignature = splitSignatureBlockFromText(splitQuoted.primaryText);
  const primaryBodyText = normalizeText(splitSignature.primaryText);
  return {
    mode: 'text_fallback',
    primaryBody: {
      text: primaryBodyText || '',
      html: primaryBodyHtml || null,
    },
    signatureBlock: splitSignature.signatureBlock,
    quotedBlocks: splitQuoted.quotedBlocks,
    systemBlocks: strippedSystem.systemBlocks,
    diagnostics: {
      blockCount: 0,
      htmlSectioned: false,
      signatureConfidence: normalizeText(splitSignature.signatureBlock?.truth?.confidence) || 'none',
      signatureVisibleInReadSurface:
        splitSignature.signatureBlock?.truth?.visibleInReadSurface === true,
    },
  };
}

function buildStructuredSections({
  primaryBodyHtml = '',
  sourceText = '',
} = {}) {
  const textFallbackSections = buildTextFallbackSections({
    sourceText,
    primaryBodyHtml,
  });
  const htmlBlocks = splitHtmlIntoBlocks(primaryBodyHtml);
  if (!htmlBlocks.length) {
    return textFallbackSections;
  }

  const systemBlocks = [];
  let index = 0;
  while (index < htmlBlocks.length && matchesPattern(htmlBlocks[index]?.text, SYSTEM_BLOCK_PATTERNS)) {
    systemBlocks.push({
      kind: 'system_block',
      role: 'provider_notice',
      text: normalizeText(htmlBlocks[index]?.text),
      html: normalizeText(htmlBlocks[index]?.html) || null,
    });
    index += 1;
  }

  let quotedIndex = -1;
  for (let candidateIndex = index + 1; candidateIndex < htmlBlocks.length; candidateIndex += 1) {
    const blockText = normalizeText(htmlBlocks[candidateIndex]?.text);
    if (
      matchesPattern(blockText, QUOTED_REPLY_PATTERNS) ||
      /^(?:Från|From|Datum|Date|Till|To|Ämne|Subject):/i.test(blockText)
    ) {
      quotedIndex = candidateIndex;
      break;
    }
  }

  const bodyLimit = quotedIndex >= 0 ? quotedIndex : htmlBlocks.length;
  let signatureIndex = -1;
  for (let candidateIndex = index + 1; candidateIndex < bodyLimit; candidateIndex += 1) {
    const block = htmlBlocks[candidateIndex];
    const blockText = normalizeText(block?.text);
    const isNearTail = candidateIndex >= Math.max(index + 1, bodyLimit - 3);
    const hasSignatureCue =
      SIGNATURE_MARKER_PATTERN.test(blockText) ||
      (isNearTail &&
        candidateIndex > index + 1 &&
        block?.hasVisualCue === true &&
        SIGNATURE_IDENTITY_PATTERN.test(blockText) &&
        blockText.length <= 320);
    if (!hasSignatureCue) continue;
    signatureIndex = candidateIndex;
    break;
  }

  const joinBlockHtml = (blocks = []) =>
    blocks
      .map((block) => normalizeText(block?.html))
      .filter(Boolean)
      .join('');
  const joinBlockText = (blocks = []) =>
    blocks
      .map((block) => normalizeText(block?.text))
      .filter(Boolean)
      .join('\n\n')
      .trim();

  const primaryBlocks = htmlBlocks.slice(index, signatureIndex >= 0 ? signatureIndex : bodyLimit);
  const signatureBlocks = signatureIndex >= 0 ? htmlBlocks.slice(signatureIndex, bodyLimit) : [];
  const quotedBlocks = quotedIndex >= 0 ? htmlBlocks.slice(quotedIndex) : [];

  const primaryText = joinBlockText(primaryBlocks) || normalizeText(sourceText);
  const primaryHtml = joinBlockHtml(primaryBlocks) || normalizeText(primaryBodyHtml) || null;
  const signatureText = joinBlockText(signatureBlocks);
  const signatureHtml = joinBlockHtml(signatureBlocks);
  const quotedText = joinBlockText(quotedBlocks);
  const quotedHtml = joinBlockHtml(quotedBlocks);

  const normalizedSystemBlocks = systemBlocks.length
    ? systemBlocks
    : textFallbackSections.systemBlocks;

  return {
    mode: 'html_structured',
    primaryBody: {
      text: primaryText || '',
      html: primaryHtml,
    },
    signatureBlock: signatureText
      ? {
          kind: 'signature_block',
          role: 'signature',
          text: signatureText,
          html: signatureHtml || null,
          truth: buildSignatureTruth({
            text: signatureText,
            html: signatureHtml || '',
          }),
        }
      : textFallbackSections.signatureBlock,
    quotedBlocks: quotedText
      ? [
          {
            kind: 'quoted_block',
            role: 'reply_chain',
            text: quotedText,
            html: quotedHtml || null,
          },
        ]
      : textFallbackSections.quotedBlocks,
    systemBlocks: normalizedSystemBlocks,
    diagnostics: {
      blockCount: htmlBlocks.length,
      htmlSectioned: true,
      signatureConfidence:
        normalizeText(
          signatureText
            ? buildSignatureTruth({
                text: signatureText,
                html: signatureHtml || '',
              }).confidence
            : textFallbackSections.signatureBlock?.truth?.confidence
        ) || 'none',
      signatureVisibleInReadSurface: signatureText
        ? buildSignatureTruth({
            text: signatureText,
            html: signatureHtml || '',
          }).visibleInReadSurface === true
        : textFallbackSections.signatureBlock?.truth?.visibleInReadSurface === true,
    },
  };
}

function buildCanonicalMailContentSections({
  primaryBodyHtml = '',
  sourceText = '',
} = {}) {
  const normalizedHtml = normalizeText(primaryBodyHtml);
  const normalizedText = normalizeText(sourceText || extractTextFromHtml(normalizedHtml));
  if (!normalizedHtml) {
    return buildTextFallbackSections({
      sourceText: normalizedText,
      primaryBodyHtml: '',
    });
  }
  return buildStructuredSections({
    primaryBodyHtml: normalizedHtml,
    sourceText: normalizedText,
  });
}

module.exports = {
  buildCanonicalMailContentSections,
  extractTextFromHtml,
};
