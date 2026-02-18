const path = require('node:path');

function asInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

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

function asStringArray(value) {
  if (value === undefined || value === null) return [];
  const raw = String(value).trim();
  if (!raw) return [];

  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((v) => (typeof v === 'string' ? v.trim() : ''))
          .filter(Boolean);
      }
    } catch {
      // fall through
    }
  }

  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function asJsonObject(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  let raw = String(value).trim();
  if (!raw) return fallback;
  if (
    (raw.startsWith("'") && raw.endsWith("'")) ||
    (raw.startsWith('"') && raw.endsWith('"'))
  ) {
    raw = raw.slice(1, -1).trim();
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return fallback;
}

const port = asInt(process.env.PORT, 3000);
const publicBaseUrl = asNonEmptyString(
  process.env.PUBLIC_BASE_URL,
  `http://localhost:${port}`
);

const brand = asNonEmptyString(process.env.ARCANA_BRAND, 'hair-tp-clinic');
const brandByHost = asJsonObject(process.env.ARCANA_BRAND_BY_HOST, null);

const config = {
  port,
  publicBaseUrl,
  brand,
  brandByHost,
  trustProxy: asBool(process.env.TRUST_PROXY, false),

  openaiApiKey: asNonEmptyString(process.env.OPENAI_API_KEY),
  openaiModel: asNonEmptyString(process.env.OPENAI_MODEL, 'gpt-4o-mini'),

  memoryStorePath: asNonEmptyString(
    process.env.MEMORY_STORE_PATH,
    path.join(process.cwd(), 'data', 'memory.json')
  ),
  memoryTtlDays: asInt(process.env.MEMORY_TTL_DAYS, 30),

  knowledgeDir: asNonEmptyString(
    process.env.KNOWLEDGE_DIR,
    path.join(process.cwd(), 'knowledge', brand)
  ),

  clientoAccountIds: asStringArray(process.env.CLIENTO_ACCOUNT_IDS),
  clientoBookingUrl: asNonEmptyString(process.env.CLIENTO_BOOKING_URL),
  clientoWidgetSrc: asNonEmptyString(
    process.env.CLIENTO_WIDGET_SRC,
    'https://cliento.com/widget-v2/cliento.js'
  ),
  clientoMergeLocations: asBool(process.env.CLIENTO_MERGE_LOCATIONS, false),
  clientoLocale: asNonEmptyString(process.env.CLIENTO_LOCALE, 'sv'),
};

if (!config.openaiApiKey) {
  throw new Error('Missing env var: OPENAI_API_KEY');
}

module.exports = { config };
