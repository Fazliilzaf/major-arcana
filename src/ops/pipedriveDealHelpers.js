'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * Normaliserar Pipedrive-affärsstatus från export (sv/en) till won|open|lost|…
 */
function normalizePipedriveDealStatus(status) {
  const key = normalizeKey(status);
  if (!key) return '';
  if (key === 'won' || key === 'vunnen' || key.includes('vunnen')) return 'won';
  if (key === 'open' || key === 'oppna' || key.includes('öppen') || key.includes('open'))
    return 'open';
  if (key === 'lost' || key === 'forlorad' || key.includes('förlor') || key.includes('lost'))
    return 'lost';
  return key;
}

function isPipedriveDealWon(deal) {
  const safe = asObject(deal);
  if (normalizePipedriveDealStatus(safe.status) === 'won') return true;
  return Boolean(normalizeText(safe.wonAt));
}

function parseDealValue(value) {
  const raw = normalizeText(value);
  if (!raw) return 0;
  const digits = raw.replace(/\s/g, '').replace(/[^\d]/g, '');
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

function maxIsoDate(...values) {
  let best = null;
  let bestMs = null;
  for (const value of values) {
    const iso = normalizeText(value);
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) continue;
    if (bestMs == null || ms > bestMs) {
      bestMs = ms;
      best = iso;
    }
  }
  return best;
}

module.exports = {
  normalizePipedriveDealStatus,
  isPipedriveDealWon,
  parseDealValue,
  maxIsoDate,
};
