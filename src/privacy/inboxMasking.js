function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function capText(value, maxLength = 360) {
  const text = normalizeText(value).replace(/\s+/g, ' ');
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 3)).trim()}...`;
}

function maskInboxText(value, maxLength = 360) {
  let text = normalizeText(value);
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
