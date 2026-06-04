'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function looksLikeTechnicalPatientName(name) {
  const n = normalizeText(name);
  if (!n) return true;
  if (/\.(pdf|zip|jpe?g|png|heic|webp|gif|tiff?|docx?|xlsx?|mov|mp4)$/i.test(n)) return true;
  if (/^[a-f0-9-]{20,}$/i.test(n)) return true;
  if (
    /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}(_\d+)+(_c)?(\.[a-z0-9]+)?$/i.test(
      n
    )
  ) {
    return true;
  }
  if (/^(IMG|DSC|PXL|Screenshot)[_\s.-]?\d{3,}/i.test(n)) return true;
  if (
    !/\s/.test(n) &&
    n.length >= 18 &&
    /^[\w.-]+$/.test(n) &&
    /[_-]/.test(n) &&
    !/[åäöÅÄÖ]/.test(n)
  ) {
    const alphaWords = n
      .split(/[_\-.]+/)
      .filter((part) => /^[a-z]+$/i.test(part) && part.length > 2);
    if (alphaWords.length === 0) return true;
  }
  return false;
}

function sanitizePatientDisplayName(rawName, { fallback = 'Namn saknas' } = {}) {
  const name = normalizeText(rawName);
  if (!name || looksLikeTechnicalPatientName(name)) return fallback;
  return name;
}

function patientDisplayNameForList(card, { fallback = 'Namn saknas' } = {}) {
  const safe = card && typeof card === 'object' ? card : {};
  const candidates = [
    safe.displayName,
    [safe.firstName, safe.lastName].filter(Boolean).join(' '),
    safe.name,
    safe.fullName,
  ];
  for (const candidate of candidates) {
    const sanitized = sanitizePatientDisplayName(candidate, { fallback: '' });
    if (sanitized) return sanitized;
  }
  return fallback;
}

module.exports = {
  looksLikeTechnicalPatientName,
  normalizeText,
  patientDisplayNameForList,
  sanitizePatientDisplayName,
};
