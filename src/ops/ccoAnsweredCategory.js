'use strict';

// Domän-semantik för "Besvarad i CCO"-taggen som sätts på originalmailet i
// Outlook/Mac efter att en operatör svarat kunden i CCO. Syftet: kollegor som
// sitter i den delade brevlådan (utan CCO-åtkomst) ska se att — och av vem —
// kunden är besvarad. Ren och testbar; connectorn förblir domän-agnostisk.

const ANSWERED_CATEGORY_PREFIX = 'Besvarad i CCO';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// Härled ett visningsnamn för operatören. Föredra riktigt namn, annars
// e-postens lokala del snyggad ("egzona.k@..." → "Egzona K"), annars "CCO".
function deriveAnsweredByName({ actorName = '', actorEmail = '' } = {}) {
  const name = normalizeText(actorName);
  if (name) return name;
  const local = normalizeText(actorEmail).toLowerCase().split('@')[0] || '';
  const pretty = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return pretty || 'CCO';
}

function buildAnsweredCategory(opts = {}) {
  return `${ANSWERED_CATEGORY_PREFIX} – ${deriveAnsweredByName(opts)}`;
}

function isAnsweredCategory(value = '') {
  return normalizeText(value).startsWith(ANSWERED_CATEGORY_PREFIX);
}

// Läses av svar-routen. Default av = ingen kategori sätts (Coworker slår på
// efter skarp verifiering mot kons@).
function markAnsweredCategoryEnabled(env = process.env) {
  return normalizeText(env.ARCANA_CCO_MARK_ANSWERED_CATEGORY).toLowerCase() === 'true';
}

module.exports = {
  ANSWERED_CATEGORY_PREFIX,
  deriveAnsweredByName,
  buildAnsweredCategory,
  isAnsweredCategory,
  markAnsweredCategoryEnabled,
};
