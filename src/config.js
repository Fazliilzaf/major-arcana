const path = require('node:path');

function asInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asFloat(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? ''));
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

function resolveDirectoryPath(value, fallbackPath) {
  const resolved = asNonEmptyString(value, fallbackPath);
  return path.resolve(resolved);
}

function resolveStatePath({ explicitPath, stateRoot, fileName }) {
  const normalizedExplicitPath = asNonEmptyString(explicitPath);
  if (normalizedExplicitPath) {
    return path.resolve(normalizedExplicitPath);
  }
  return path.join(stateRoot, fileName);
}

const port = asInt(process.env.PORT, 3000);
const publicBaseUrl = asNonEmptyString(
  process.env.PUBLIC_BASE_URL,
  `http://localhost:${port}`
);
const nodeEnv = asNonEmptyString(process.env.NODE_ENV, 'development').toLowerCase();
const isProduction = nodeEnv === 'production';
const stateRoot = resolveDirectoryPath(
  process.env.ARCANA_STATE_ROOT,
  path.join(process.cwd(), 'data')
);

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

  stateRoot,

  memoryStorePath: resolveStatePath({
    explicitPath: process.env.MEMORY_STORE_PATH,
    stateRoot,
    fileName: 'memory.json',
  }),
  memoryTtlDays: asInt(process.env.MEMORY_TTL_DAYS, 30),

  authStorePath: resolveStatePath({
    explicitPath: process.env.AUTH_STORE_PATH,
    stateRoot,
    fileName: 'auth.json',
  }),
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
  riskRateLimitMax: asInt(process.env.ARCANA_RISK_RATE_LIMIT_MAX, 120),
  orchestratorRateLimitMax: asInt(process.env.ARCANA_ORCHESTRATOR_RATE_LIMIT_MAX, 80),
  publicRateLimitWindowSec: asInt(process.env.ARCANA_PUBLIC_RATE_LIMIT_WINDOW_SEC, 60),
  publicClinicRateLimitMax: asInt(process.env.ARCANA_PUBLIC_CLINIC_RATE_LIMIT_MAX, 180),
  publicChatRateLimitMax: asInt(process.env.ARCANA_PUBLIC_CHAT_RATE_LIMIT_MAX, 90),
  publicChatBetaEnabled: asBool(process.env.ARCANA_PUBLIC_CHAT_BETA_ENABLED, false),
  publicChatBetaHeader: asNonEmptyString(
    process.env.ARCANA_PUBLIC_CHAT_BETA_HEADER,
    'x-arcana-beta-key'
  ).toLowerCase(),
  publicChatBetaKey: asNonEmptyString(process.env.ARCANA_PUBLIC_CHAT_BETA_KEY),
  publicChatBetaAllowHosts: asStringArray(process.env.ARCANA_PUBLIC_CHAT_BETA_ALLOW_HOSTS),
  publicChatBetaAllowLocalhost: asBool(process.env.ARCANA_PUBLIC_CHAT_BETA_ALLOW_LOCALHOST, true),
  publicChatBetaDenyMessage: asNonEmptyString(
    process.env.ARCANA_PUBLIC_CHAT_BETA_DENY_MESSAGE,
    'Den här chatten är i begränsad beta. Kontakta kliniken för åtkomst.'
  ),
  defaultTenantId: asNonEmptyString(process.env.ARCANA_DEFAULT_TENANT, brand),
  bootstrapOwnerEmail: asNonEmptyString(process.env.ARCANA_OWNER_EMAIL),
  bootstrapOwnerPassword: asNonEmptyString(process.env.ARCANA_OWNER_PASSWORD),
  bootstrapOwnerResetPassword: asBool(process.env.ARCANA_BOOTSTRAP_RESET_OWNER_PASSWORD, false),
  bootstrapOwnerResetMfa: asBool(process.env.ARCANA_BOOTSTRAP_RESET_OWNER_MFA, false),

  templateStorePath: resolveStatePath({
    explicitPath: process.env.TEMPLATE_STORE_PATH,
    stateRoot,
    fileName: 'templates.json',
  }),
  templateEvalMaxEntries: asInt(process.env.TEMPLATE_EVAL_MAX_ENTRIES, 10000),

  tenantConfigStorePath: resolveStatePath({
    explicitPath: process.env.TENANT_CONFIG_STORE_PATH,
    stateRoot,
    fileName: 'tenant-config.json',
  }),
  backupDir: resolveStatePath({
    explicitPath: process.env.ARCANA_BACKUP_DIR,
    stateRoot,
    fileName: 'backups',
  }),
  backupRetentionMaxFiles: asInt(process.env.ARCANA_BACKUP_RETENTION_MAX_FILES, 50),
  backupRetentionMaxAgeDays: asInt(process.env.ARCANA_BACKUP_RETENTION_MAX_AGE_DAYS, 30),
  reportsDir: resolveStatePath({
    explicitPath: process.env.ARCANA_REPORTS_DIR,
    stateRoot,
    fileName: 'reports',
  }),
  reportRetentionMaxFiles: asInt(process.env.ARCANA_REPORT_RETENTION_MAX_FILES, 60),
  reportRetentionMaxAgeDays: asInt(process.env.ARCANA_REPORT_RETENTION_MAX_AGE_DAYS, 45),

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
  schedulerIncidentAutoEscalationEnabled: asBool(
    process.env.ARCANA_SCHEDULER_INCIDENT_AUTO_ESCALATION_ENABLED,
    true
  ),
  schedulerIncidentAutoEscalationLimit: asInt(
    process.env.ARCANA_SCHEDULER_INCIDENT_AUTO_ESCALATION_LIMIT,
    25
  ),
  schedulerIncidentAutoAssignOwnerEnabled: asBool(
    process.env.ARCANA_SCHEDULER_INCIDENT_AUTO_ASSIGN_OWNER_ENABLED,
    true
  ),
  schedulerIncidentAutoAssignOwnerLimit: asInt(
    process.env.ARCANA_SCHEDULER_INCIDENT_AUTO_ASSIGN_OWNER_LIMIT,
    100
  ),
  alertWebhookUrl: asNonEmptyString(process.env.ARCANA_ALERT_WEBHOOK_URL),
  alertWebhookSecret: asNonEmptyString(process.env.ARCANA_ALERT_WEBHOOK_SECRET),
  alertWebhookTimeoutMs: asInt(process.env.ARCANA_ALERT_WEBHOOK_TIMEOUT_MS, 4000),
  secretRotationStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_SECRET_ROTATION_STORE_PATH,
    stateRoot,
    fileName: 'secret-rotation.json',
  }),
  secretRotationMaxAgeDays: asInt(process.env.ARCANA_SECRET_ROTATION_MAX_AGE_DAYS, 90),
  schedulerStartupDelaySec: asInt(process.env.ARCANA_SCHEDULER_STARTUP_DELAY_SEC, 8),
  schedulerJitterSec: asInt(process.env.ARCANA_SCHEDULER_JITTER_SEC, 4),
  schedulerRunOnStartup: asBool(process.env.ARCANA_SCHEDULER_RUN_ON_STARTUP, false),
  monitorRestoreDrillMaxAgeDays: asInt(process.env.ARCANA_MONITOR_RESTORE_DRILL_MAX_AGE_DAYS, 30),
  monitorPilotReportMaxAgeHours: asInt(
    process.env.ARCANA_MONITOR_PILOT_REPORT_MAX_AGE_HOURS,
    36
  ),
  metricsMaxSamples: asInt(process.env.ARCANA_METRICS_MAX_SAMPLES, 5000),
  metricsSlowRequestMs: asInt(process.env.ARCANA_METRICS_SLOW_REQUEST_MS, 1500),
  observabilityAlertMaxErrorRatePct: asFloat(
    process.env.ARCANA_OBSERVABILITY_ALERT_MAX_ERROR_RATE_PCT,
    2.5
  ),
  observabilityAlertMaxP95Ms: asInt(process.env.ARCANA_OBSERVABILITY_ALERT_MAX_P95_MS, 1800),
  observabilityAlertMaxSlowRequests: asInt(
    process.env.ARCANA_OBSERVABILITY_ALERT_MAX_SLOW_REQUESTS,
    25
  ),

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
