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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * VUNNET — pengar som kommit in. Bas för lifetimeValue per kund.
 *
 * Flyttad hit från ccoPatientMasterStore i ORD-87 för att ligga BREDVID
 * sumPipedriveOpenDeals. De två skiljer sig på en rad, och den raden är hela
 * skillnaden mellan "intäkt" och "offert". Låg de i olika filer skulle
 * skillnaden vara osynlig för den som ändrar den ena.
 */
function sumPipedriveWonDeals(pipedrive) {
  const deals = asArray(asObject(pipedrive).deals);
  let total = 0;
  let wonCount = 0;
  for (const deal of deals) {
    if (!isPipedriveDealWon(deal)) continue;
    const n = parseDealValue(asObject(deal).value);
    if (!Number.isFinite(n) || n <= 0) continue;
    total += n;
    wonCount += 1;
  }
  return { total, wonCount };
}

/**
 * ÖPPET — pengar som KAN komma in om offerterna går igenom. Inte intäkt.
 *
 * Samma definition som `potentialValue` i ccoKunderEnrichment, som nu läser
 * härifrån i stället för att räkna själv. Villkoret är exakt: varken vunnen
 * ELLER förlorad. En affär utan status räknas som öppen — det är avsiktligt,
 * eftersom Pipedrive-exporten lämnar statusfältet tomt för nyskapade affärer.
 *
 * OBS: den här summan får ALDRIG presenteras som intäkt. Se ORD-87.
 */
function sumPipedriveOpenDeals(pipedrive) {
  const deals = asArray(asObject(pipedrive).deals);
  let total = 0;
  let openCount = 0;
  for (const deal of deals) {
    const safe = asObject(deal);
    if (isPipedriveDealWon(safe)) continue;
    if (normalizePipedriveDealStatus(safe.status) === 'lost') continue;
    const n = parseDealValue(safe.value);
    if (!Number.isFinite(n) || n <= 0) continue;
    total += n;
    openCount += 1;
  }
  return { total, openCount };
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
  sumPipedriveWonDeals,
  sumPipedriveOpenDeals,
  maxIsoDate,
};
