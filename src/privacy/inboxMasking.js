function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function capText(value, maxLength = 360) {
  const text = normalizeText(value).replace(/\s+/g, ' ');
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 3)).trim()}...`;
}

function stripCssNoise(value = '') {
  let text = String(value || '');
  if (!text) return '';
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/(^|\s)(?:[#.][^{}]{0,120})\{[^{}]{0,300}\}/gi, ' ');
  text = text.replace(/\b[a-z-]+\s*:\s*#[0-9a-f]{3,8}\s*;/gi, ' ');
  text = text.replace(/\b[a-z-]+\s*:\s*[^;]{1,80};/gi, (match) => {
    const normalized = String(match || '').toLowerCase();
    if (
      normalized.includes('background') ||
      normalized.includes('font-') ||
      normalized.includes('color') ||
      normalized.includes('border') ||
      normalized.includes('padding') ||
      normalized.includes('margin') ||
      normalized.includes('display') ||
      normalized.includes('line-height')
    ) {
      return ' ';
    }
    return match;
  });
  return text;
}

function maskInboxText(value, maxLength = 360) {
  let text = normalizeText(stripCssNoise(value));
  if (!text) return '';
  text = text.replace(/https?:\/\/\S+/gi, '[lank]');
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]');
  text = text.replace(/\b(?:19|20)\d{10}\b/g, '[id]');
  text = text.replace(/\b\d{6,8}[-+ ]\d{4}\b/g, '[id]');
  text = text.replace(/\+?\d[\d\s\-()]{6,}\d/g, '[telefon]');
  return capText(text, maxLength);
}

module.exports = {
  maskInboxText,
};
