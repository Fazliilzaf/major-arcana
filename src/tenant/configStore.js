const fs = require('node:fs/promises');
const path = require('node:path');
const { TEMPLATE_CATEGORIES, normalizeCategory, isValidCategory } = require('../templates/constants');
const { VARIABLE_WHITELIST_BY_CATEGORY } = require('../templates/variables');

function nowIso() {
  return new Date().toISOString();
}

function normalizeTenantId(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeRiskModifier(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(-10, Math.min(10, Number(num.toFixed(2))));
}

const TEMPLATE_SIGNATURE_CHANNELS = Object.freeze(['email', 'sms', 'internal']);
const MAX_VARIABLES_PER_CATEGORY = 120;
const MAX_SIGNATURE_LENGTH = 2000;
const VARIABLE_NAME_REGEX = /^[a-z][a-z0-9_]{1,49}$/;
const BRAND_COLOR_PALETTE_PRIMARY = Object.freeze([
  '#1A73E8',
  '#2B7FFF',
  '#2563EB',
  '#3B82F6',
]);
const BRAND_COLOR_PALETTE_ACCENT = Object.freeze([
  '#A855F7',
  '#9333EA',
  '#8B5CF6',
  '#C084FC',
]);
const DEFAULT_BRAND_PRIMARY_COLOR = '#1A73E8';
const DEFAULT_BRAND_ACCENT_COLOR = '#A855F7';
const MAX_BRAND_LOGO_URL_LENGTH = 500;

function emptyState() {
  return { tenants: {} };
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

function cloneCategoryMap(input) {
  const output = {};
  const source =
    input && typeof input === 'object' && !Array.isArray(input)
      ? input
      : {};
  for (const category of TEMPLATE_CATEGORIES) {
    const values = Array.isArray(source[category]) ? source[category] : [];
    output[category] = [...values];
  }
  return output;
}

function normalizeVariableName(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return '';
  if (!VARIABLE_NAME_REGEX.test(normalized)) {
    throw new Error(
      `Ogiltigt variabelnamn "${value}". Tillåtet format: a-z, 0-9, underscore (2-50 tecken).`
    );
  }
  return normalized;
}

function normalizeBrandLogoUrl(value) {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  if (normalized.length > MAX_BRAND_LOGO_URL_LENGTH) {
    throw new Error(`brandLogoUrl är för lång (max ${MAX_BRAND_LOGO_URL_LENGTH} tecken).`);
  }
  if (!/^https?:\/\//i.test(normalized) && !normalized.startsWith('/')) {
    throw new Error('brandLogoUrl måste börja med http(s):// eller /.');
  }
  return normalized;
}

function normalizeBrandColor(value, {
  fieldName,
  palette,
  fallback,
  strict = true,
} = {}) {
  const normalized = normalizeText(value).toUpperCase();
  if (!normalized) return fallback;
  if (!Array.isArray(palette) || !palette.includes(normalized)) {
    if (strict) {
      throw new Error(
        `${fieldName} måste vara en av: ${Array.isArray(palette) ? palette.join(', ') : ''}`
      );
    }
    return fallback;
  }
  return normalized;
}

function normalizeVariableList(list = [], { fieldName = 'variables', category = '' } = {}) {
  if (!Array.isArray(list)) {
    throw new Error(`${fieldName}.${category || 'category'} måste vara en array.`);
  }
  const output = [];
  const seen = new Set();
  for (const rawValue of list) {
    const normalized = normalizeVariableName(rawValue);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  if (output.length > MAX_VARIABLES_PER_CATEGORY) {
    throw new Error(`${fieldName}.${category} får max innehålla ${MAX_VARIABLES_PER_CATEGORY} variabler.`);
  }
  return output;
}

function normalizeCategoryVariableMap(value, { fieldName, fallbackMap = null, strict = true } = {}) {
  const output = cloneCategoryMap(fallbackMap);
  if (value === undefined || value === null) return output;

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (strict) {
      throw new Error(`${fieldName} måste vara ett objekt per kategori.`);
    }
    return output;
  }

  for (const [rawCategory, rawList] of Object.entries(value)) {
    const category = normalizeCategory(rawCategory);
    if (!isValidCategory(category)) {
      if (strict) {
        throw new Error(`Ogiltig kategori i ${fieldName}: ${rawCategory}`);
      }
      continue;
    }
    if (rawList === null) {
      output[category] = [];
      continue;
    }
    output[category] = normalizeVariableList(rawList, { fieldName, category });
  }

  return output;
}

function cloneSignatures(input) {
  const output = {};
  const source =
    input && typeof input === 'object' && !Array.isArray(input)
      ? input
      : {};
  for (const channel of TEMPLATE_SIGNATURE_CHANNELS) {
    output[channel] = normalizeText(source[channel]);
  }
  return output;
}

function normalizeSignaturesMap(value, { fieldName, fallbackMap = null, strict = true } = {}) {
  const output = cloneSignatures(fallbackMap);
  if (value === undefined || value === null) return output;

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (strict) {
      throw new Error(`${fieldName} måste vara ett objekt per kanal.`);
    }
    return output;
  }

  for (const [rawChannel, rawSignature] of Object.entries(value)) {
    const channel = normalizeText(rawChannel).toLowerCase();
    if (!TEMPLATE_SIGNATURE_CHANNELS.includes(channel)) {
      if (strict) {
        throw new Error(`Ogiltig kanal i ${fieldName}: ${rawChannel}`);
      }
      continue;
    }
    const signature = normalizeText(rawSignature);
    if (signature.length > MAX_SIGNATURE_LENGTH) {
      throw new Error(`${fieldName}.${channel} är för lång (max ${MAX_SIGNATURE_LENGTH} tecken).`);
    }
    output[channel] = signature;
  }

  return output;
}

function validateRequiredVariablesAgainstAllowed({
  allowlistByCategory,
  requiredByCategory,
}) {
  for (const category of TEMPLATE_CATEGORIES) {
    const allowed = new Set([
      ...(VARIABLE_WHITELIST_BY_CATEGORY[category] || []),
      ...(Array.isArray(allowlistByCategory?.[category]) ? allowlistByCategory[category] : []),
    ]);
    const required = Array.isArray(requiredByCategory?.[category]) ? requiredByCategory[category] : [];
    const invalid = required.filter((name) => !allowed.has(name));
    if (invalid.length) {
      throw new Error(
        `templateRequiredVariablesByCategory.${category} innehåller otillåtna variabler: ${invalid.join(', ')}`
      );
    }
  }
}

function buildDefaultTemplateVariableAllowlistByCategory() {
  return cloneCategoryMap({});
}

function buildDefaultTemplateRequiredVariablesByCategory() {
  return cloneCategoryMap({});
}

function buildDefaultTemplateSignaturesByChannel() {
  return cloneSignatures({});
}

function sanitizeTenantConfig(config) {
  if (!config) return null;
  return {
    tenantId: config.tenantId,
    assistantName: config.assistantName,
    toneStyle: config.toneStyle,
    brandProfile: config.brandProfile,
    brandLogoUrl: config.brandLogoUrl || '',
    brandPrimaryColor: config.brandPrimaryColor || DEFAULT_BRAND_PRIMARY_COLOR,
    brandAccentColor: config.brandAccentColor || DEFAULT_BRAND_ACCENT_COLOR,
    riskSensitivityModifier: config.riskSensitivityModifier,
    templateVariableAllowlistByCategory: cloneCategoryMap(
      config.templateVariableAllowlistByCategory
    ),
    templateRequiredVariablesByCategory: cloneCategoryMap(
      config.templateRequiredVariablesByCategory
    ),
    templateSignaturesByChannel: cloneSignatures(config.templateSignaturesByChannel),
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy || null,
  };
}

function buildDefaultConfig({
  tenantId,
  defaultBrand = '',
}) {
  const ts = nowIso();
  return {
    tenantId,
    assistantName: 'Arcana',
    toneStyle: 'professional-warm',
    brandProfile: normalizeText(defaultBrand) || tenantId,
    brandLogoUrl: '',
    brandPrimaryColor: DEFAULT_BRAND_PRIMARY_COLOR,
    brandAccentColor: DEFAULT_BRAND_ACCENT_COLOR,
    riskSensitivityModifier: 0,
    templateVariableAllowlistByCategory: buildDefaultTemplateVariableAllowlistByCategory(),
    templateRequiredVariablesByCategory: buildDefaultTemplateRequiredVariablesByCategory(),
    templateSignaturesByChannel: buildDefaultTemplateSignaturesByChannel(),
    createdAt: ts,
    updatedAt: ts,
    updatedBy: null,
  };
}

function hydrateTenantConfig(rawConfig, { tenantId, defaultBrand }) {
  const fallback = buildDefaultConfig({ tenantId, defaultBrand });
  const source = rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
    ? rawConfig
    : {};

  const hydrated = {
    tenantId: normalizeTenantId(source.tenantId) || fallback.tenantId,
    assistantName: normalizeText(source.assistantName) || fallback.assistantName,
    toneStyle: normalizeText(source.toneStyle) || fallback.toneStyle,
    brandProfile: normalizeText(source.brandProfile) || fallback.brandProfile,
    brandLogoUrl: (() => {
      try {
        return normalizeBrandLogoUrl(source.brandLogoUrl);
      } catch {
        return fallback.brandLogoUrl;
      }
    })(),
    brandPrimaryColor: normalizeBrandColor(source.brandPrimaryColor, {
      fieldName: 'brandPrimaryColor',
      palette: BRAND_COLOR_PALETTE_PRIMARY,
      fallback: fallback.brandPrimaryColor,
      strict: false,
    }),
    brandAccentColor: normalizeBrandColor(source.brandAccentColor, {
      fieldName: 'brandAccentColor',
      palette: BRAND_COLOR_PALETTE_ACCENT,
      fallback: fallback.brandAccentColor,
      strict: false,
    }),
    riskSensitivityModifier: normalizeRiskModifier(source.riskSensitivityModifier),
    templateVariableAllowlistByCategory: normalizeCategoryVariableMap(
      source.templateVariableAllowlistByCategory,
      {
        fieldName: 'templateVariableAllowlistByCategory',
        fallbackMap: fallback.templateVariableAllowlistByCategory,
        strict: false,
      }
    ),
    templateRequiredVariablesByCategory: normalizeCategoryVariableMap(
      source.templateRequiredVariablesByCategory,
      {
        fieldName: 'templateRequiredVariablesByCategory',
        fallbackMap: fallback.templateRequiredVariablesByCategory,
        strict: false,
      }
    ),
    templateSignaturesByChannel: normalizeSignaturesMap(source.templateSignaturesByChannel, {
      fieldName: 'templateSignaturesByChannel',
      fallbackMap: fallback.templateSignaturesByChannel,
      strict: false,
    }),
    createdAt: normalizeText(source.createdAt) || fallback.createdAt,
    updatedAt: normalizeText(source.updatedAt) || fallback.updatedAt,
    updatedBy: source.updatedBy || null,
  };

  validateRequiredVariablesAgainstAllowed({
    allowlistByCategory: hydrated.templateVariableAllowlistByCategory,
    requiredByCategory: hydrated.templateRequiredVariablesByCategory,
  });

  return hydrated;
}

async function createTenantConfigStore({
  filePath,
  defaultBrand = '',
}) {
  const rawState = await readJson(filePath, emptyState());
  const state = {
    tenants:
      rawState &&
      rawState.tenants &&
      typeof rawState.tenants === 'object' &&
      !Array.isArray(rawState.tenants)
        ? rawState.tenants
        : {},
  };

  async function save() {
    await writeJsonAtomic(filePath, state);
  }

  async function getTenantConfig(tenantId) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    if (!normalizedTenantId) throw new Error('tenantId saknas.');

    let config = state.tenants[normalizedTenantId];
    let changed = false;
    if (!config) {
      config = buildDefaultConfig({
        tenantId: normalizedTenantId,
        defaultBrand,
      });
      state.tenants[normalizedTenantId] = config;
      changed = true;
    } else {
      const hydrated = hydrateTenantConfig(config, {
        tenantId: normalizedTenantId,
        defaultBrand,
      });
      if (JSON.stringify(config) !== JSON.stringify(hydrated)) {
        state.tenants[normalizedTenantId] = hydrated;
        config = hydrated;
        changed = true;
      }
    }
    if (changed) {
      await save();
    }

    return sanitizeTenantConfig(state.tenants[normalizedTenantId]);
  }

  async function updateTenantConfig({
    tenantId,
    patch = {},
    actorUserId = null,
  }) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    if (!normalizedTenantId) throw new Error('tenantId saknas.');

    const existing = (await getTenantConfig(normalizedTenantId)) || null;
    if (!existing) throw new Error('tenant config kunde inte laddas.');

    const rawConfig = state.tenants[normalizedTenantId];
    let changed = false;

    if (Object.prototype.hasOwnProperty.call(patch, 'assistantName')) {
      const value = normalizeText(patch.assistantName);
      if (!value) throw new Error('assistantName får inte vara tom.');
      if (value.length > 80) throw new Error('assistantName är för långt (max 80).');
      if (rawConfig.assistantName !== value) {
        rawConfig.assistantName = value;
        changed = true;
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'toneStyle')) {
      const value = normalizeText(patch.toneStyle);
      if (!value) throw new Error('toneStyle får inte vara tom.');
      if (value.length > 120) throw new Error('toneStyle är för långt (max 120).');
      if (rawConfig.toneStyle !== value) {
        rawConfig.toneStyle = value;
        changed = true;
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'brandProfile')) {
      const value = normalizeText(patch.brandProfile);
      if (!value) throw new Error('brandProfile får inte vara tom.');
      if (value.length > 120) throw new Error('brandProfile är för långt (max 120).');
      if (rawConfig.brandProfile !== value) {
        rawConfig.brandProfile = value;
        changed = true;
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'brandLogoUrl')) {
      const value = normalizeBrandLogoUrl(patch.brandLogoUrl);
      if (rawConfig.brandLogoUrl !== value) {
        rawConfig.brandLogoUrl = value;
        changed = true;
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'brandPrimaryColor')) {
      const value = normalizeBrandColor(patch.brandPrimaryColor, {
        fieldName: 'brandPrimaryColor',
        palette: BRAND_COLOR_PALETTE_PRIMARY,
        fallback: DEFAULT_BRAND_PRIMARY_COLOR,
        strict: true,
      });
      if (rawConfig.brandPrimaryColor !== value) {
        rawConfig.brandPrimaryColor = value;
        changed = true;
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'brandAccentColor')) {
      const value = normalizeBrandColor(patch.brandAccentColor, {
        fieldName: 'brandAccentColor',
        palette: BRAND_COLOR_PALETTE_ACCENT,
        fallback: DEFAULT_BRAND_ACCENT_COLOR,
        strict: true,
      });
      if (rawConfig.brandAccentColor !== value) {
        rawConfig.brandAccentColor = value;
        changed = true;
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'riskSensitivityModifier')) {
      const nextValue = normalizeRiskModifier(patch.riskSensitivityModifier);
      if (rawConfig.riskSensitivityModifier !== nextValue) {
        rawConfig.riskSensitivityModifier = nextValue;
        changed = true;
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'templateVariableAllowlistByCategory')) {
      const nextValue = normalizeCategoryVariableMap(patch.templateVariableAllowlistByCategory, {
        fieldName: 'templateVariableAllowlistByCategory',
        fallbackMap: rawConfig.templateVariableAllowlistByCategory,
        strict: true,
      });
      if (
        JSON.stringify(rawConfig.templateVariableAllowlistByCategory) !==
        JSON.stringify(nextValue)
      ) {
        rawConfig.templateVariableAllowlistByCategory = nextValue;
        changed = true;
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'templateRequiredVariablesByCategory')) {
      const nextValue = normalizeCategoryVariableMap(patch.templateRequiredVariablesByCategory, {
        fieldName: 'templateRequiredVariablesByCategory',
        fallbackMap: rawConfig.templateRequiredVariablesByCategory,
        strict: true,
      });
      if (
        JSON.stringify(rawConfig.templateRequiredVariablesByCategory) !==
        JSON.stringify(nextValue)
      ) {
        rawConfig.templateRequiredVariablesByCategory = nextValue;
        changed = true;
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'templateSignaturesByChannel')) {
      const nextValue = normalizeSignaturesMap(patch.templateSignaturesByChannel, {
        fieldName: 'templateSignaturesByChannel',
        fallbackMap: rawConfig.templateSignaturesByChannel,
        strict: true,
      });
      if (JSON.stringify(rawConfig.templateSignaturesByChannel) !== JSON.stringify(nextValue)) {
        rawConfig.templateSignaturesByChannel = nextValue;
        changed = true;
      }
    }

    validateRequiredVariablesAgainstAllowed({
      allowlistByCategory: rawConfig.templateVariableAllowlistByCategory,
      requiredByCategory: rawConfig.templateRequiredVariablesByCategory,
    });

    if (changed) {
      rawConfig.updatedAt = nowIso();
      rawConfig.updatedBy = actorUserId || null;
      await save();
    }

    return sanitizeTenantConfig(rawConfig);
  }

  return {
    filePath,
    getTenantConfig,
    updateTenantConfig,
  };
}

module.exports = {
  createTenantConfigStore,
};
