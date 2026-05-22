const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const { normalizeCcoMailFoundation } = require('./ccoMailboxSettingsDocument');

const DEFAULT_TOGGLES = Object.freeze({
  googleCalendarSync: true,
  outlookIntegration: false,
  automaticBookingConfirmation: true,
  paymentReminders: true,
  stripeIntegration: true,
  swishPayments: false,
  emailSignature: true,
  readReceipts: false,
  outOfOfficeAutoReplies: true,
  weeklySummary: true,
  customerBehaviorTracking: true,
  exportToExcel: true,
  smartReplySuggestions: true,
  automaticPrioritization: true,
  churnPrediction: true,
  desktopNotifications: true,
  soundAlerts: false,
  slaAlerts: true,
  teamMentions: true,
  twoFactorAuth: false,
  activityLogging: true,
  compactConversationView: true,
  colorCodedPriorities: true,
  advancedFilters: false,
});

const THEME_ALIASES = Object.freeze({
  mist: 'mist',
  light: 'mist',
  ink: 'ink',
  dark: 'ink',
  auto: 'auto',
});

const DENSITY_ALIASES = Object.freeze({
  compact: 'compact',
  comfortable: 'balanced',
  balanced: 'balanced',
  spacious: 'airy',
  airy: 'airy',
});

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    tenants: {},
  };
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
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function defaultSidebarSections() {
  return [
    { id: 'ai-prediction', label: 'AI-förutsägelse', enabled: true, order: 1 },
    { id: 'metrics', label: 'Mätvärden', enabled: true, order: 2 },
    { id: 'templates', label: 'Mallar', enabled: true, order: 3 },
    { id: 'scheduling', label: 'Smart schemaläggning', enabled: true, order: 4 },
    { id: 'upsell', label: 'Merförsäljningsmöjligheter', enabled: false, order: 5 },
    { id: 'assignment', label: 'Auto-tilldela', enabled: true, order: 6 },
  ];
}

function normalizeSidebarSections(values) {
  const fallback = defaultSidebarSections();
  const list = Array.isArray(values) ? values : fallback;
  return list
    .map((item, index) => ({
      id: normalizeKey(item?.id) || fallback[index]?.id || `section-${index + 1}`,
      label: normalizeText(item?.label) || fallback[index]?.label || `Section ${index + 1}`,
      enabled: normalizeBoolean(item?.enabled, fallback[index]?.enabled !== false),
      order:
        Number.isFinite(Number(item?.order)) && Number(item.order) > 0
          ? Number(item.order)
          : index + 1,
    }))
    .slice(0, 12);
}

function normalizeToggles(values) {
  const normalized = { ...DEFAULT_TOGGLES };
  if (values && typeof values === 'object') {
    for (const key of Object.keys(DEFAULT_TOGGLES)) {
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        normalized[key] = normalizeBoolean(values[key], DEFAULT_TOGGLES[key]);
      }
    }
  }
  return normalized;
}

function buildDefaultSettings() {
  return {
    theme: 'mist',
    density: 'compact',
    sidebarSections: defaultSidebarSections(),
    profileName: 'Ditt namn',
    profileEmail: 'din.email@hairtp.com',
    toggles: { ...DEFAULT_TOGGLES },
    mailFoundation: normalizeCcoMailFoundation(),
    deleteRequestedAt: null,
  };
}

function normalizeSettingsRecord(input = {}, previousRecord = {}) {
  const defaults = buildDefaultSettings();
  const normalizedTheme = THEME_ALIASES[normalizeKey(input.theme)] || defaults.theme;
  const normalizedDensity = DENSITY_ALIASES[normalizeKey(input.density)] || defaults.density;
  const previousSettings = previousRecord && typeof previousRecord === 'object' ? previousRecord : {};
  const previousMailFoundation = normalizeCcoMailFoundation(previousSettings.mailFoundation);
  const nextMailFoundation = Object.prototype.hasOwnProperty.call(input, 'mailFoundation')
    ? normalizeCcoMailFoundation(input.mailFoundation)
    : previousMailFoundation;
  return {
    theme: normalizedTheme,
    density: normalizedDensity,
    sidebarSections: normalizeSidebarSections(input.sidebarSections),
    profileName: normalizeText(input.profileName) || defaults.profileName,
    profileEmail: normalizeText(input.profileEmail) || defaults.profileEmail,
    toggles: normalizeToggles(input.toggles),
    mailFoundation: nextMailFoundation,
    deleteRequestedAt: normalizeText(input.deleteRequestedAt) || null,
    updatedAt: normalizeText(input.updatedAt) || nowIso(),
  };
}

async function createCcoSettingsStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoSettingsStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    tenants:
      state && typeof state.tenants === 'object' && state.tenants
        ? state.tenants
        : {},
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function ensureTenantState(tenantId) {
    const normalizedTenantId = normalizeText(tenantId);
    if (!normalizedTenantId) {
      throw new Error('tenantId krävs.');
    }
    if (!state.tenants[normalizedTenantId]) {
      state.tenants[normalizedTenantId] = {
        settings: buildDefaultSettings(),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
    }
    return state.tenants[normalizedTenantId];
  }

  async function getTenantSettings({ tenantId }) {
    const tenantState = ensureTenantState(tenantId);
    tenantState.settings = normalizeSettingsRecord(tenantState.settings, tenantState.settings);
    return { ...tenantState.settings };
  }

  async function saveTenantSettings({ tenantId, settings }) {
    const tenantState = ensureTenantState(tenantId);
    tenantState.settings = normalizeSettingsRecord(settings, tenantState.settings);
    tenantState.updatedAt = nowIso();
    await save();
    return { ...tenantState.settings };
  }

  async function requestDeleteAccount({ tenantId, actorUserId }) {
    const tenantState = ensureTenantState(tenantId);
    tenantState.settings = normalizeSettingsRecord({
      ...tenantState.settings,
      deleteRequestedAt: nowIso(),
      updatedAt: nowIso(),
    }, tenantState.settings);
    tenantState.updatedAt = nowIso();
    await save();
    return {
      deleteRequestedAt: tenantState.settings.deleteRequestedAt,
      actorUserId: normalizeText(actorUserId) || null,
    };
  }

  return {
    getTenantSettings,
    saveTenantSettings,
    requestDeleteAccount,
  };
}

module.exports = {
  createCcoSettingsStore,
};
