'use strict';

const { OFFERT_SLUG, normalizePhase } = require('./patientDocumentLiveRegistry');

/** E8 — registryIds som ska signera mot API (BOOKOFF A1–A11, A15). */
const E8_SIGN_REGISTRY_IDS = Object.freeze([
  'haelso_tp_sve',
  'health_tp_eng',
  'friskfoers_tp',
  'offert_tp',
  'offert_prp_hair',
  'offert_prp_skin',
  'offert_microneedling',
  'offert_prf',
  'offert_profilo',
  'samtycke_bokning_2d',
  'samtycke_angerratt',
  'foto_samtycke',
]);

const DEFAULT_TENANT = 'hair_tp';

const BASE_FORM = Object.freeze({
  handler: 'cco_form',
  tenantId: DEFAULT_TENANT,
  requiresPatientId: true,
  autoSign: true,
});

const BASE_AGREEMENT = Object.freeze({
  handler: 'treatment_agreement',
  tenantId: DEFAULT_TENANT,
  requiresPatientId: true,
  requiredAckSelectors: ['#bundle-ack', '#cooling-ack'],
  promptName: 'Kundens namn för signering:',
});

function offertSignConfig(registryId) {
  return {
    ...BASE_AGREEMENT,
    registryId,
    offertSlug: OFFERT_SLUG[registryId] || null,
  };
}

/** @type {Record<string, object>} */
const SIGN_CONFIG_BY_REGISTRY = Object.freeze({
  haelso_tp_sve: {
    ...BASE_FORM,
    formType: 'health_declaration',
    formVariant: 'hair_tp',
    title: 'Hälsodeklaration',
    extraFields: [
      { selector: '#gdpr-lagring', key: 'samtyckeDatalagring', type: 'checkbox' },
      { selector: '#gdpr-mail', key: 'samtyckeMailutskick', type: 'checkbox' },
    ],
  },
  health_tp_eng: {
    ...BASE_FORM,
    formType: 'health_declaration',
    formVariant: 'eng',
    title: 'Health Questionnaire',
  },
  friskfoers_tp: {
    ...BASE_FORM,
    formType: 'fitness_certificate',
    formVariant: 'hair_tp',
    title: 'Friskförsäkran',
  },
  offert_tp: offertSignConfig('offert_tp'),
  offert_prp_hair: offertSignConfig('offert_prp_hair'),
  offert_prp_skin: offertSignConfig('offert_prp_skin'),
  offert_microneedling: offertSignConfig('offert_microneedling'),
  offert_prf: offertSignConfig('offert_prf'),
  offert_profilo: offertSignConfig('offert_profilo'),
  samtycke_bokning_2d: {
    handler: 'consent_journal',
    tenantId: DEFAULT_TENANT,
    requiresPatientId: true,
    journalType: 'consent_bundle',
    title: 'Samtycke vid bokning inom 14 dagar',
    consentKind: 'booking_within_14d',
    consentApiId: 154369,
    requiredAckSelectors: ['#booking-ack'],
    promptName: 'Kundens namn för signering:',
  },
  samtycke_angerratt: {
    handler: 'consent_journal',
    tenantId: DEFAULT_TENANT,
    requiresPatientId: true,
    journalType: 'consent_bundle',
    title: 'Samtycke — behandling under ångerfristen',
    consentKind: 'cooling_off_waiver',
    consentApiId: 170955,
    requiredAckSelectors: ['#cooling-ack'],
    promptName: 'Kundens namn för signering:',
  },
  foto_samtycke: {
    handler: 'photo_consent',
    tenantId: DEFAULT_TENANT,
    requiresPatientId: true,
    photoId: 'scope-hairline-crown',
    scope: 'hairline_crown',
    requiredAckSelectors: ['#photo-ack'],
    promptName: 'Kundens namn för signering:',
  },
});

function isE8SignRegistry(registryId) {
  return E8_SIGN_REGISTRY_IDS.includes(String(registryId || '').trim());
}

/**
 * @param {string} registryId
 * @param {{ phase?: number|string|null }} [options]
 * @returns {object|null}
 */
function resolveSignConfig(registryId, options = {}) {
  const id = String(registryId || '').trim();
  if (!isE8SignRegistry(id)) return null;

  const base = SIGN_CONFIG_BY_REGISTRY[id];
  if (!base) return null;

  if (OFFERT_SLUG[id]) {
    const phase = normalizePhase(options.phase);
    if (phase !== 7) {
      return {
        ...base,
        disabled: true,
        disabledReason: 'Offert steg 5 är visning — signering sker i steg 7.',
        phase,
      };
    }
    return { ...base, phase: 7, signEnabled: true };
  }

  return { ...base, signEnabled: true };
}

function listE8SignRegistryIds() {
  return [...E8_SIGN_REGISTRY_IDS];
}

function buildSignManifest() {
  return listE8SignRegistryIds().map((registryId) => {
    const phase7 = OFFERT_SLUG[registryId]
      ? resolveSignConfig(registryId, { phase: 7 })
      : resolveSignConfig(registryId);
    const phase5 = OFFERT_SLUG[registryId] ? resolveSignConfig(registryId, { phase: 5 }) : null;
    return {
      registryId,
      e8: true,
      handler: phase7?.handler || null,
      signEnabledPhase7: phase7?.signEnabled === true,
      signDisabledPhase5: phase5?.disabled === true,
    };
  });
}

module.exports = {
  E8_SIGN_REGISTRY_IDS,
  DEFAULT_TENANT,
  isE8SignRegistry,
  resolveSignConfig,
  listE8SignRegistryIds,
  buildSignManifest,
};
