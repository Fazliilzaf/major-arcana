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

function normalizeAiProvider(value, fallback = 'openai') {
  const normalized = asNonEmptyString(value, fallback).toLowerCase();
  if (['openai', 'fallback'].includes(normalized)) return normalized;
  return fallback;
}

function normalizeSessionRotationScope(value, fallback = 'tenant') {
  const normalized = asNonEmptyString(value, fallback).toLowerCase();
  if (['none', 'tenant', 'user'].includes(normalized)) return normalized;
  return fallback;
}

const port = asInt(process.env.PORT, 3000);
const publicBaseUrl = asNonEmptyString(
  process.env.PUBLIC_BASE_URL,
  `http://localhost:${port}`
);
const nodeEnv = asNonEmptyString(process.env.NODE_ENV, 'development').toLowerCase();
const isProduction = nodeEnv === 'production';

const brand = asNonEmptyString(process.env.ARCANA_BRAND, 'hair-tp-clinic');
const brandByHost = asJsonObject(process.env.ARCANA_BRAND_BY_HOST, null);

const config = {
  port,
  publicBaseUrl,
  brand,
  brandByHost,
  publicClinicIdAliases: asJsonObject(process.env.ARCANA_PUBLIC_CLINIC_ALIASES, null),
  nodeEnv,
  isProduction,
  trustProxy: asBool(process.env.TRUST_PROXY, false),
  corsStrict: asBool(process.env.CORS_STRICT, isProduction),
  corsAllowedOrigins: asStringArray(process.env.CORS_ALLOWED_ORIGINS),
  corsAllowNoOrigin: asBool(process.env.CORS_ALLOW_NO_ORIGIN, !isProduction),
  corsAllowCredentials: asBool(process.env.CORS_ALLOW_CREDENTIALS, false),

  openaiApiKey: asNonEmptyString(process.env.OPENAI_API_KEY),
  openaiModel: asNonEmptyString(process.env.OPENAI_MODEL, 'gpt-4o-mini'),
  aiProvider: normalizeAiProvider(process.env.ARCANA_AI_PROVIDER, 'openai'),

  memoryStorePath: asNonEmptyString(
    process.env.MEMORY_STORE_PATH,
    path.join(process.cwd(), 'data', 'memory.json')
  ),
  memoryTtlDays: asInt(process.env.MEMORY_TTL_DAYS, 30),

  authStorePath: asNonEmptyString(
    process.env.AUTH_STORE_PATH,
    path.join(process.cwd(), 'data', 'auth.json')
  ),
  authSessionTtlHours: asInt(process.env.AUTH_SESSION_TTL_HOURS, 12),
  authSessionIdleMinutes: asInt(process.env.AUTH_SESSION_IDLE_MINUTES, 180),
  authLoginTicketTtlMinutes: asInt(process.env.AUTH_LOGIN_TICKET_TTL_MINUTES, 10),
  authAuditMaxEntries: asInt(process.env.AUTH_AUDIT_MAX_ENTRIES, 5000),
  authAuditAppendOnly: asBool(process.env.AUTH_AUDIT_APPEND_ONLY, true),
  authLoginRateLimitWindowSec: asInt(process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_SEC, 60),
  authLoginRateLimitMax: asInt(process.env.AUTH_LOGIN_RATE_LIMIT_MAX, 20),
  authSelectTenantRateLimitMax: asInt(process.env.AUTH_SELECT_TENANT_RATE_LIMIT_MAX, 30),
  authLoginSessionRotationScope: normalizeSessionRotationScope(
    process.env.AUTH_LOGIN_SESSION_ROTATION,
    'tenant'
  ),
  apiRateLimitWindowSec: asInt(process.env.ARCANA_API_RATE_LIMIT_WINDOW_SEC, 60),
  apiRateLimitReadMax: asInt(process.env.ARCANA_API_RATE_LIMIT_READ_MAX, 300),
  apiRateLimitWriteMax: asInt(process.env.ARCANA_API_RATE_LIMIT_WRITE_MAX, 120),
  defaultTenantId: asNonEmptyString(process.env.ARCANA_DEFAULT_TENANT, brand),
  bootstrapOwnerEmail: asNonEmptyString(process.env.ARCANA_OWNER_EMAIL),
  bootstrapOwnerPassword: asNonEmptyString(process.env.ARCANA_OWNER_PASSWORD),
  bootstrapOwnerResetPassword: asBool(process.env.ARCANA_BOOTSTRAP_RESET_OWNER_PASSWORD, false),

  templateStorePath: asNonEmptyString(
    process.env.TEMPLATE_STORE_PATH,
    path.join(process.cwd(), 'data', 'templates.json')
  ),
  templateEvalMaxEntries: asInt(process.env.TEMPLATE_EVAL_MAX_ENTRIES, 10000),

  tenantConfigStorePath: asNonEmptyString(
    process.env.TENANT_CONFIG_STORE_PATH,
    path.join(process.cwd(), 'data', 'tenant-config.json')
  ),
  backupDir: asNonEmptyString(
    process.env.ARCANA_BACKUP_DIR,
    path.join(process.cwd(), 'data', 'backups')
  ),
  backupRetentionMaxFiles: asInt(process.env.ARCANA_BACKUP_RETENTION_MAX_FILES, 50),
  backupRetentionMaxAgeDays: asInt(process.env.ARCANA_BACKUP_RETENTION_MAX_AGE_DAYS, 30),
  reportsDir: asNonEmptyString(
    process.env.ARCANA_REPORTS_DIR,
    path.join(process.cwd(), 'data', 'reports')
  ),

  schedulerEnabled: asBool(process.env.ARCANA_SCHEDULER_ENABLED, true),
  schedulerReportWindowDays: asInt(process.env.ARCANA_SCHEDULER_REPORT_WINDOW_DAYS, 14),
  schedulerReportIntervalHours: asInt(process.env.ARCANA_SCHEDULER_REPORT_INTERVAL_HOURS, 24),
  schedulerBackupIntervalHours: asInt(process.env.ARCANA_SCHEDULER_BACKUP_INTERVAL_HOURS, 24),
  schedulerRestoreDrillIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_RESTORE_DRILL_INTERVAL_HOURS,
    168
  ),
  schedulerAlertProbeIntervalMinutes: asInt(
    process.env.ARCANA_SCHEDULER_ALERT_PROBE_INTERVAL_MINUTES,
    15
  ),
  schedulerStartupDelaySec: asInt(process.env.ARCANA_SCHEDULER_STARTUP_DELAY_SEC, 8),
  schedulerJitterSec: asInt(process.env.ARCANA_SCHEDULER_JITTER_SEC, 4),
  schedulerRunOnStartup: asBool(process.env.ARCANA_SCHEDULER_RUN_ON_STARTUP, false),

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

if (config.aiProvider === 'openai' && !config.openaiApiKey) {
  throw new Error('Missing env var: OPENAI_API_KEY');
}

module.exports = { config };
