'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

const CMO_DRAFT_DISCLAIMER =
  'Utkast only — kräver OWNER-godkännande före publicering, annonsbudget eller utskick.';

const SOCIAL_PLATFORMS = Object.freeze([
  { id: 'linkedin', label: 'LinkedIn', maxLength: 3000 },
  { id: 'instagram', label: 'Instagram', maxLength: 2200 },
  { id: 'facebook', label: 'Facebook', maxLength: 5000 },
  { id: 'x', label: 'X/Twitter', maxLength: 280 },
  { id: 'tiktok', label: 'TikTok', maxLength: 4000 },
]);

const TONE_MODIFIERS = Object.freeze({
  professional: 'Tydlig, trovärdig och saklig ton.',
  personal: 'Varm, nära och personlig ton.',
  sales: 'Konverteringsdriven med tydlig CTA.',
  educational: 'Utbildande och lätt att förstå.',
});

function pickTopics(snapshot = {}, max = 5) {
  const fromBrief = asArray(snapshot.contentTopics);
  if (fromBrief.length) {
    return fromBrief.slice(0, max).map((item) => ({
      topic: normalizeText(item?.topic || item),
      format: normalizeText(item?.suggestedFormat) || 'artikel',
      rationale: normalizeText(item?.rationale) || '',
    }));
  }
  const legacy = asArray(snapshot.topics);
  if (legacy.length) {
    return legacy.slice(0, max).map((item) => ({
      topic: normalizeText(item?.topic || item),
      format: normalizeText(item?.suggestedFormat) || 'artikel',
      rationale: normalizeText(item?.rationale) || '',
    }));
  }
  return [
    {
      topic: 'Trygg digital vårdadministration med Arcana',
      format: 'artikel',
      rationale: 'Standardämne när inga topics finns i snapshot.',
    },
  ];
}

function brandLabel(snapshot = {}) {
  const tenantConfig = asObject(snapshot.tenantConfig);
  const brand = asObject(tenantConfig.brand || tenantConfig.marketing);
  return normalizeText(brand.displayName || brand.name) || 'Arcana';
}

function toneHint(snapshot = {}, input = {}) {
  const tone = normalizeText(input.tone).toLowerCase() || 'professional';
  return TONE_MODIFIERS[tone] || TONE_MODIFIERS.professional;
}

function targetAudienceLabel(snapshot = {}, input = {}) {
  return (
    normalizeText(input.targetAudience) ||
    normalizeText(snapshot.targetAudience) ||
    'klinikledning och vårdverksamhet'
  );
}

function capabilityMeta(CapabilityClass, safeContext = {}) {
  return {
    capability: CapabilityClass.name,
    version: CapabilityClass.version,
    channel: normalizeText(safeContext.channel) || 'admin',
    tenantId: normalizeText(safeContext.tenantId) || 'unknown',
    requiresOwnerApproval: true,
    autoPublish: false,
  };
}

module.exports = {
  normalizeText,
  toNumber,
  asArray,
  asObject,
  CMO_DRAFT_DISCLAIMER,
  SOCIAL_PLATFORMS,
  TONE_MODIFIERS,
  pickTopics,
  brandLabel,
  toneHint,
  targetAudienceLabel,
  capabilityMeta,
};
