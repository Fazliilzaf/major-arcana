const path = require('node:path');

function asNonEmptyString(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function asInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asStringArray(value) {
  if (value === undefined || value === null) return [];
  const raw = String(value).trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function brandEnvKey(brand) {
  return String(brand ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+/, '')
    .replace(/_+$/, '');
}

function getEnvForBrand(baseName, brand) {
  const key = brandEnvKey(brand);
  if (!key) return '';
  return process.env[`${baseName}_${key}`];
}

function getKnowledgeDirForBrand(brand) {
  const fromEnv = asNonEmptyString(getEnvForBrand('KNOWLEDGE_DIR', brand));
  if (fromEnv) return path.resolve(fromEnv);

  const defaultBrand = asNonEmptyString(process.env.ARCANA_BRAND);
  if (defaultBrand && brandEnvKey(defaultBrand) === brandEnvKey(brand)) {
    const globalDir = asNonEmptyString(process.env.KNOWLEDGE_DIR);
    if (globalDir) return path.resolve(globalDir);
  }

  return path.join(process.cwd(), 'knowledge', brand);
}

function inferClientoPartnerIdFromBookingUrl(bookingUrl) {
  const normalized = asNonEmptyString(bookingUrl);
  if (!normalized) return '';
  const match = normalized.match(/-(\d+)(?:\/)?$/);
  return match?.[1] || '';
}

function getClientoConfigForBrand(brand, baseConfig) {
  const accountIds = asStringArray(
    asNonEmptyString(getEnvForBrand('CLIENTO_ACCOUNT_IDS', brand)) ||
      asNonEmptyString(process.env.CLIENTO_ACCOUNT_IDS)
  );
  const bookingUrl = asNonEmptyString(
    getEnvForBrand('CLIENTO_BOOKING_URL', brand) ||
      process.env.CLIENTO_BOOKING_URL
  );

  const widgetSrc = asNonEmptyString(
    getEnvForBrand('CLIENTO_WIDGET_SRC', brand) ||
      process.env.CLIENTO_WIDGET_SRC ||
      baseConfig?.clientoWidgetSrc ||
      'https://cliento.com/widget-v2/cliento.js'
  );

  const brandServiceFilters = getEnvForBrand('CLIENTO_SERVICE_FILTERS', brand);
  const globalServiceFilters = process.env.CLIENTO_SERVICE_FILTERS;
  const serviceFilters =
    brandServiceFilters || globalServiceFilters
      ? asStringArray(brandServiceFilters || globalServiceFilters)
      : Array.isArray(baseConfig?.clientoServiceFilters)
        ? baseConfig.clientoServiceFilters
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter(Boolean)
        : [];

  const locale = asNonEmptyString(
    getEnvForBrand('CLIENTO_LOCALE', brand) ||
      process.env.CLIENTO_LOCALE ||
      baseConfig?.clientoLocale ||
      'sv'
  );

  const mergeLocations = asBool(
    getEnvForBrand('CLIENTO_MERGE_LOCATIONS', brand) ??
      process.env.CLIENTO_MERGE_LOCATIONS ??
      baseConfig?.clientoMergeLocations,
    false
  );

  return {
    accountIds,
    bookingUrl: bookingUrl || null,
    widgetSrc,
    serviceFilters,
    locale,
    mergeLocations,
  };
}

function getClientoApiConfigForBrand(brand, baseConfig) {
  const accountIds = asStringArray(
    asNonEmptyString(getEnvForBrand('CLIENTO_ACCOUNT_IDS', brand)) ||
      asNonEmptyString(process.env.CLIENTO_ACCOUNT_IDS)
  );

  const bookingUrl = asNonEmptyString(
    getEnvForBrand('CLIENTO_BOOKING_URL', brand) ||
      process.env.CLIENTO_BOOKING_URL ||
      baseConfig?.clientoBookingUrl
  );

  const partnerId = asNonEmptyString(
    getEnvForBrand('CLIENTO_PARTNER_ID', brand) ||
      process.env.CLIENTO_PARTNER_ID ||
      baseConfig?.clientoPartnerId ||
      (accountIds.length === 1 ? accountIds[0] : '') ||
      inferClientoPartnerIdFromBookingUrl(bookingUrl)
  );

  return {
    partnerId,
    apiBaseUrl: asNonEmptyString(
      getEnvForBrand('CLIENTO_API_BASE_URL', brand) ||
        process.env.CLIENTO_API_BASE_URL ||
        baseConfig?.clientoApiBaseUrl ||
        'https://cliento.com/api/v2/partner/cliento'
    ),
    apiKey: asNonEmptyString(
      getEnvForBrand('CLIENTO_API_KEY', brand) ||
        process.env.CLIENTO_API_KEY ||
        baseConfig?.clientoApiKey
    ),
    authHeader: asNonEmptyString(
      getEnvForBrand('CLIENTO_API_AUTH_HEADER', brand) ||
        process.env.CLIENTO_API_AUTH_HEADER ||
        baseConfig?.clientoApiAuthHeader ||
        'Authorization'
    ),
    authScheme: asNonEmptyString(
      getEnvForBrand('CLIENTO_API_AUTH_SCHEME', brand) ||
        process.env.CLIENTO_API_AUTH_SCHEME ||
        baseConfig?.clientoApiAuthScheme ||
        'Bearer'
    ),
    timeoutMs: asInt(
      getEnvForBrand('CLIENTO_API_TIMEOUT_MS', brand) ||
        process.env.CLIENTO_API_TIMEOUT_MS ||
        baseConfig?.clientoApiTimeoutMs,
      10000
    ),
  };
}

module.exports = {
  brandEnvKey,
  getKnowledgeDirForBrand,
  getClientoConfigForBrand,
  getClientoApiConfigForBrand,
  inferClientoPartnerIdFromBookingUrl,
};
