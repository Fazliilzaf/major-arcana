const { TEMPLATE_CATEGORIES, normalizeCategory } = require('./constants');

const VARIABLE_WHITELIST_BY_CATEGORY = Object.freeze({
  BOOKING: [
    'first_name',
    'last_name',
    'clinic_name',
    'clinic_phone',
    'clinic_email',
    'booking_link',
    'appointment_date',
    'appointment_time',
    'appointment_type',
    'staff_name',
  ],
  CONSULTATION: [
    'first_name',
    'clinic_name',
    'clinic_phone',
    'clinic_email',
    'consultation_date',
    'consultation_time',
    'consultation_location',
    'preparation_notes',
    'staff_name',
  ],
  AFTERCARE: [
    'first_name',
    'clinic_name',
    'clinic_phone',
    'clinic_email',
    'treatment_name',
    'aftercare_days',
    'warning_signs',
    'followup_date',
    'staff_name',
  ],
  LEAD: [
    'first_name',
    'clinic_name',
    'clinic_phone',
    'clinic_email',
    'lead_source',
    'offer_name',
    'booking_link',
    'staff_name',
  ],
  INTERNAL: [
    'staff_name',
    'clinic_name',
    'internal_deadline',
    'internal_owner',
    'internal_note',
  ],
});

const REQUIRED_VARIABLES_BY_CATEGORY = Object.freeze({
  BOOKING: ['clinic_name'],
  CONSULTATION: ['clinic_name'],
  AFTERCARE: ['clinic_name'],
  LEAD: ['clinic_name'],
  INTERNAL: [],
});

function extractTemplateVariables(content) {
  if (typeof content !== 'string' || !content) return [];
  const regex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  const variables = new Set();
  let match = null;
  while ((match = regex.exec(content)) !== null) {
    const key = String(match[1] || '').trim();
    if (key) variables.add(key);
  }
  return Array.from(variables);
}

function dedupeList(list = []) {
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const key = String(item || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function resolveVariablePolicy({
  category,
  allowlistOverridesByCategory = null,
  requiredOverridesByCategory = null,
} = {}) {
  const normalizedCategory = normalizeCategory(category);
  const defaultsAllowed = VARIABLE_WHITELIST_BY_CATEGORY[normalizedCategory] || [];
  const defaultsRequired = REQUIRED_VARIABLES_BY_CATEGORY[normalizedCategory] || [];

  const tenantAllowed = Array.isArray(allowlistOverridesByCategory?.[normalizedCategory])
    ? allowlistOverridesByCategory[normalizedCategory]
    : [];
  const tenantRequired = Array.isArray(requiredOverridesByCategory?.[normalizedCategory])
    ? requiredOverridesByCategory[normalizedCategory]
    : [];

  const allowedVariables = dedupeList([...defaultsAllowed, ...tenantAllowed]);
  const requiredVariables = dedupeList([...defaultsRequired, ...tenantRequired]);

  return {
    category: normalizedCategory,
    allowedVariables,
    requiredVariables,
  };
}

function buildVariablePolicyMeta({
  allowlistOverridesByCategory = null,
  requiredOverridesByCategory = null,
} = {}) {
  const variableWhitelist = {};
  const requiredVariables = {};

  for (const category of TEMPLATE_CATEGORIES) {
    const resolved = resolveVariablePolicy({
      category,
      allowlistOverridesByCategory,
      requiredOverridesByCategory,
    });
    variableWhitelist[category] = resolved.allowedVariables;
    requiredVariables[category] = resolved.requiredVariables;
  }

  return {
    categories: TEMPLATE_CATEGORIES,
    variableWhitelist,
    requiredVariables,
  };
}

function validateTemplateVariables({
  category,
  content,
  variables,
  allowlistOverridesByCategory = null,
  requiredOverridesByCategory = null,
}) {
  const resolved = resolveVariablePolicy({
    category,
    allowlistOverridesByCategory,
    requiredOverridesByCategory,
  });
  const variableList = Array.isArray(variables) && variables.length
    ? variables
    : extractTemplateVariables(content);

  const unknown = variableList.filter((name) => !resolved.allowedVariables.includes(name));
  const missingRequired = resolved.requiredVariables.filter((name) => !variableList.includes(name));

  return {
    category: resolved.category,
    variablesUsed: variableList,
    allowedVariables: resolved.allowedVariables,
    requiredVariables: resolved.requiredVariables,
    unknownVariables: unknown,
    missingRequiredVariables: missingRequired,
    ok: unknown.length === 0 && missingRequired.length === 0,
  };
}

function applyChannelSignature({ content, channel, signaturesByChannel = null } = {}) {
  const baseContent = typeof content === 'string' ? content.trim() : '';
  if (!baseContent) return baseContent;

  const normalizedChannel = typeof channel === 'string' ? channel.trim().toLowerCase() : '';
  if (!normalizedChannel) return baseContent;

  const signatureRaw =
    signaturesByChannel && typeof signaturesByChannel === 'object'
      ? signaturesByChannel[normalizedChannel]
      : '';
  const signature = typeof signatureRaw === 'string' ? signatureRaw.trim() : '';
  if (!signature) return baseContent;
  if (baseContent.includes(signature)) return baseContent;

  return `${baseContent}\n\n${signature}`;
}

module.exports = {
  VARIABLE_WHITELIST_BY_CATEGORY,
  REQUIRED_VARIABLES_BY_CATEGORY,
  extractTemplateVariables,
  resolveVariablePolicy,
  buildVariablePolicyMeta,
  validateTemplateVariables,
  applyChannelSignature,
};
