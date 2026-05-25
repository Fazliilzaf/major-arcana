'use strict';

const catalog = require('../../migration/meridiq/journal-schema-catalog.json');

const SCHEMA_BY_ID = Object.freeze(
  Object.fromEntries((catalog.schemas || []).map((schema) => [schema.schemaId, Object.freeze(schema)]))
);

const SCHEMAS_BY_TYPE = Object.freeze(
  (catalog.schemas || []).reduce((acc, schema) => {
    const list = acc[schema.journalType] || [];
    list.push(schema);
    acc[schema.journalType] = list;
    return acc;
  }, {})
);

const SERVICE_VARIANT_HINTS = Object.freeze(catalog.serviceBindingHints || []);

const FORM_VARIANTS = Object.freeze({
  health_declaration: Object.freeze(['hair_tp', 'curatiio_bleph', 'curatiio_ortho', 'curatiio_injection', 'eng']),
  fitness_certificate: Object.freeze(['hair_tp', 'curatiio_bleph']),
  tp_treatment: Object.freeze(['hair_tp']),
  prp_treatment: Object.freeze(['tp_post_op', 'prp_skin']),
  follow_up: Object.freeze(['4_manader', '6_manader', '12_manader']),
  bleph_treatment: Object.freeze(['curatiio_bleph']),
});

function normalizeKey(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function schemaId(journalType, formVariant) {
  return `${normalizeKey(journalType)}:${normalizeKey(formVariant)}`;
}

function getSchema(journalType, formVariant) {
  const type = normalizeKey(journalType);
  const variant = normalizeKey(formVariant);
  if (!type || !variant) return null;
  return SCHEMA_BY_ID[schemaId(type, variant)] || null;
}

function listSchemas(journalType) {
  const type = normalizeKey(journalType);
  return Object.freeze([...(SCHEMAS_BY_TYPE[type] || [])]);
}

function defaultFormVariant(journalType) {
  const type = normalizeKey(journalType);
  const variants = FORM_VARIANTS[type];
  return variants?.[0] || 'default';
}

function normalizeFormVariant(journalType, formVariant) {
  const type = normalizeKey(journalType);
  const variant = normalizeKey(formVariant) || defaultFormVariant(type);
  const allowed = FORM_VARIANTS[type];
  if (allowed && !allowed.includes(variant)) {
    return defaultFormVariant(type);
  }
  return variant;
}

function emptyFieldsForSchema(journalType, formVariant) {
  const schema = getSchema(journalType, formVariant);
  if (!schema?.emptyDefaults) return {};
  return { ...schema.emptyDefaults };
}

function resolveFormVariantFromMeridiq({
  journalType,
  formVariant,
  sourceQuestionaryId,
  meridiqServiceApiId,
} = {}) {
  const type = normalizeKey(journalType);
  if (formVariant) {
    return normalizeFormVariant(type, formVariant);
  }
  const qid = Number(sourceQuestionaryId);
  if (Number.isFinite(qid)) {
    const match = (catalog.schemas || []).find(
      (schema) => schema.journalType === type && schema.meridiqQuestionaryId === qid
    );
    if (match) return match.formVariant;
  }
  const serviceId = Number(meridiqServiceApiId);
  if (Number.isFinite(serviceId)) {
    const hint = SERVICE_VARIANT_HINTS.find(
      (item) => item.journalType === type && item.meridiqServiceApiId === serviceId
    );
    if (hint?.formVariant) return hint.formVariant;
  }
  return defaultFormVariant(type);
}

function buildImportMeta(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const meta = {};
  if (safe.sourceSystem) meta.sourceSystem = String(safe.sourceSystem);
  if (safe.sourceQuestionaryId != null) meta.sourceQuestionaryId = Number(safe.sourceQuestionaryId);
  if (safe.sourceResponseId != null) meta.sourceResponseId = String(safe.sourceResponseId);
  if (safe.meridiqServiceApiId != null) meta.meridiqServiceApiId = Number(safe.meridiqServiceApiId);
  return meta;
}

module.exports = {
  catalog,
  FORM_VARIANTS,
  SCHEMA_BY_ID,
  SERVICE_VARIANT_HINTS,
  schemaId,
  getSchema,
  listSchemas,
  defaultFormVariant,
  normalizeFormVariant,
  emptyFieldsForSchema,
  resolveFormVariantFromMeridiq,
  buildImportMeta,
};
