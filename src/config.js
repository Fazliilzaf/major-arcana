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

function normalizeDistributedBackend(value, fallback = 'memory') {
  const normalized = asNonEmptyString(value, fallback).toLowerCase();
  if (['memory', 'redis'].includes(normalized)) return normalized;
  return fallback;
}

function normalizeSemanticMode(value, fallback = 'heuristic') {
  const normalized = asNonEmptyString(value, fallback).toLowerCase();
  if (['heuristic', 'linear', 'hybrid'].includes(normalized)) return normalized;
  return fallback;
}

function normalizeHost(value) {
  const raw = asNonEmptyString(value).toLowerCase();
  if (!raw) return '';
  const withoutScheme = raw.replace(/^https?:\/\//, '');
  const first = withoutScheme.split('/')[0] || '';
  return (first.split(':')[0] || '').trim();
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
const ccoNextCanonicalOrigin = asNonEmptyString(
  process.env.ARCANA_CCO_NEXT_CANONICAL_ORIGIN,
  'https://arcana-cco.onrender.com'
);
const ccoNextRedirectHosts = (() => {
  const configured = asStringArray(process.env.ARCANA_CCO_NEXT_REDIRECT_HOSTS)
    .map((value) => normalizeHost(value))
    .filter(Boolean);
  return configured.length > 0 ? configured : ['arcana-qsiu.onrender.com'];
})();
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
  ccoNextCanonicalOrigin,
  ccoNextRedirectHosts,
  brand,
  brandByHost,
  publicClinicIdAliases: asJsonObject(process.env.ARCANA_PUBLIC_CLINIC_ALIASES, null),
  nodeEnv,
  isProduction,
  trustProxy: asBool(process.env.TRUST_PROXY, false),
  corsStrict: asBool(process.env.CORS_STRICT, true),
  corsAllowedOrigins: asStringArray(process.env.CORS_ALLOWED_ORIGINS),
  corsAllowNoOrigin: asBool(process.env.CORS_ALLOW_NO_ORIGIN, false),
  corsAllowCredentials: asBool(process.env.CORS_ALLOW_CREDENTIALS, false),

  openaiApiKey: asNonEmptyString(process.env.OPENAI_API_KEY),
  openaiModel: asNonEmptyString(process.env.OPENAI_MODEL, 'gpt-4o-mini'),
  aiProvider: normalizeAiProvider(process.env.ARCANA_AI_PROVIDER, 'openai'),
  semanticModelMode: normalizeSemanticMode(process.env.ARCANA_SEMANTIC_MODEL_MODE, 'heuristic'),

  stateRoot,

  memoryStorePath: resolveStatePath({
    explicitPath: process.env.MEMORY_STORE_PATH,
    stateRoot,
    fileName: 'memory.json',
  }),
  memoryTtlDays: asInt(process.env.MEMORY_TTL_DAYS, 30),
  patientSignalStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_PATIENT_SIGNAL_STORE_PATH,
    stateRoot,
    fileName: 'patient-signals.json',
  }),
  capabilityAnalysisStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CAPABILITY_ANALYSIS_STORE_PATH,
    stateRoot,
    fileName: 'capability-analysis.json',
  }),
  ccoHistoryStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_HISTORY_STORE_PATH,
    stateRoot,
    fileName: 'cco-history.json',
  }),
  ccoMailboxTruthStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_MAILBOX_TRUTH_STORE_PATH,
    stateRoot,
    fileName: 'cco-mailbox-truth.json',
  }),
  ccoConversationStateStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_CONVERSATION_STATE_STORE_PATH,
    stateRoot,
    fileName: 'cco-conversation-state.json',
  }),
  ccoNoteStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_NOTE_STORE_PATH,
    stateRoot,
    fileName: 'cco-notes.json',
  }),
  ccoFollowUpStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_FOLLOWUP_STORE_PATH,
    stateRoot,
    fileName: 'cco-followups.json',
  }),
  ccoWorkspacePrefsStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_WORKSPACE_PREFS_STORE_PATH,
    stateRoot,
    fileName: 'cco-workspace-prefs.json',
  }),
  ccoIntegrationStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_INTEGRATION_STORE_PATH,
    stateRoot,
    fileName: 'cco-integrations.json',
  }),
  ccoSettingsStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_SETTINGS_STORE_PATH,
    stateRoot,
    fileName: 'cco-settings.json',
  }),
  ccoMacroStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_MACRO_STORE_PATH,
    stateRoot,
    fileName: 'cco-macros.json',
  }),
  ccoCustomerStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_CUSTOMER_STORE_PATH,
    stateRoot,
    fileName: 'cco-customers.json',
  }),
  capabilityAnalysisMaxEntries: asInt(process.env.ARCANA_CAPABILITY_ANALYSIS_MAX_ENTRIES, 15000),
  sloTicketStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_SLO_TICKET_STORE_PATH,
    stateRoot,
    fileName: 'slo-tickets.json',
  }),
  releaseGovernanceStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_RELEASE_GOVERNANCE_STORE_PATH,
    stateRoot,
    fileName: 'release-governance.json',
  }),
  patientSignalMaxEvents: asInt(process.env.ARCANA_PATIENT_SIGNAL_MAX_EVENTS, 20000),
  patientSignalRetentionDays: asInt(process.env.ARCANA_PATIENT_SIGNAL_RETENTION_DAYS, 180),
  patientSignalWindowDays: asInt(process.env.ARCANA_PATIENT_SIGNAL_WINDOW_DAYS, 14),
  patientSignalFreshnessHours: asInt(process.env.ARCANA_PATIENT_SIGNAL_FRESHNESS_HOURS, 72),
  schedulerSloAutoTicketingEnabled: asBool(
    process.env.ARCANA_SCHEDULER_SLO_AUTO_TICKETING_ENABLED,
    true
  ),
  schedulerSloTicketMaxPerRun: asInt(process.env.ARCANA_SCHEDULER_SLO_TICKET_MAX_PER_RUN, 8),
  schedulerSloTicketStoreMaxEntries: asInt(
    process.env.ARCANA_SLO_TICKET_STORE_MAX_ENTRIES,
    3000
  ),
  releaseGovernanceMaxCycles: asInt(process.env.ARCANA_RELEASE_GOVERNANCE_MAX_CYCLES, 400),
  releaseNoGoFreeDays: asInt(process.env.ARCANA_RELEASE_NO_GO_FREE_DAYS, 14),
  releasePentestMaxAgeDays: asInt(process.env.ARCANA_RELEASE_PENTEST_MAX_AGE_DAYS, 120),
  releaseRequirePentestEvidence: asBool(
    process.env.ARCANA_RELEASE_REQUIRE_PENTEST_EVIDENCE,
    isProduction
  ),
  releaseRequireDistinctSignoffUsers: asBool(
    process.env.ARCANA_RELEASE_REQUIRE_DISTINCT_SIGNOFF_USERS,
    true
  ),
  releasePostLaunchReviewWindowDays: asInt(
    process.env.ARCANA_RELEASE_POST_LAUNCH_REVIEW_WINDOW_DAYS,
    30
  ),
  releasePostLaunchStabilizationDays: asInt(
    process.env.ARCANA_RELEASE_POST_LAUNCH_STABILIZATION_DAYS,
    14
  ),
  releaseEnforcePostLaunchStabilization: asBool(
    process.env.ARCANA_RELEASE_ENFORCE_POST_LAUNCH_STABILIZATION,
    false
  ),
  releaseRealityAuditIntervalDays: asInt(
    process.env.ARCANA_RELEASE_REALITY_AUDIT_INTERVAL_DAYS,
    90
  ),
  releaseRequireFinalLiveSignoff: asBool(
    process.env.ARCANA_RELEASE_REQUIRE_FINAL_LIVE_SIGNOFF,
    false
  ),
  startupStateFileGuardEnabled: asBool(process.env.ARCANA_STARTUP_STATE_FILE_GUARD_ENABLED, true),
  startupAuthStoreMaxBytes: asInt(
    process.env.ARCANA_STARTUP_AUTH_STORE_MAX_BYTES,
    12 * 1024 * 1024
  ),
  startupMemoryStoreMaxBytes: asInt(
    process.env.ARCANA_STARTUP_MEMORY_STORE_MAX_BYTES,
    24 * 1024 * 1024
  ),
  startupCapabilityAnalysisStoreMaxBytes: asInt(
    process.env.ARCANA_STARTUP_CAP_ANALYSIS_STORE_MAX_BYTES,
    32 * 1024 * 1024
  ),
  startupCcoHistoryStoreMaxBytes: asInt(
    process.env.ARCANA_STARTUP_CCO_HISTORY_STORE_MAX_BYTES,
    250 * 1024 * 1024
  ),
  startupCcoNoteStoreMaxBytes: asInt(
    process.env.ARCANA_STARTUP_CCO_NOTE_STORE_MAX_BYTES,
    12 * 1024 * 1024
  ),
  startupCcoFollowUpStoreMaxBytes: asInt(
    process.env.ARCANA_STARTUP_CCO_FOLLOWUP_STORE_MAX_BYTES,
    12 * 1024 * 1024
  ),
  startupCcoWorkspacePrefsStoreMaxBytes: asInt(
    process.env.ARCANA_STARTUP_CCO_WORKSPACE_PREFS_STORE_MAX_BYTES,
    4 * 1024 * 1024
  ),
  startupTemplateStoreMaxBytes: asInt(
    process.env.ARCANA_STARTUP_TEMPLATE_STORE_MAX_BYTES,
    24 * 1024 * 1024
  ),
  startupTenantConfigStoreMaxBytes: asInt(
    process.env.ARCANA_STARTUP_TENANT_CONFIG_STORE_MAX_BYTES,
    8 * 1024 * 1024
  ),
  startupPatientSignalStoreMaxBytes: asInt(
    process.env.ARCANA_STARTUP_PATIENT_SIGNAL_STORE_MAX_BYTES,
    20 * 1024 * 1024
  ),
  startupSloTicketStoreMaxBytes: asInt(
    process.env.ARCANA_STARTUP_SLO_TICKET_STORE_MAX_BYTES,
    8 * 1024 * 1024
  ),
  startupReleaseGovernanceStoreMaxBytes: asInt(
    process.env.ARCANA_STARTUP_RELEASE_GOVERNANCE_STORE_MAX_BYTES,
    8 * 1024 * 1024
  ),
  startupSecretRotationStoreMaxBytes: asInt(
    process.env.ARCANA_STARTUP_SECRET_ROTATION_STORE_MAX_BYTES,
    4 * 1024 * 1024
  ),

  authStorePath: resolveStatePath({
    explicitPath: process.env.AUTH_STORE_PATH,
    stateRoot,
    fileName: 'auth.json',
  }),
  authSessionTtlHours: asInt(process.env.AUTH_SESSION_TTL_HOURS, 12),
  authSessionIdleMinutes: asInt(process.env.AUTH_SESSION_IDLE_MINUTES, 180),
  authLoginTicketTtlMinutes: asInt(process.env.AUTH_LOGIN_TICKET_TTL_MINUTES, 10),
  authAuditMaxEntries: asInt(process.env.AUTH_AUDIT_MAX_ENTRIES, 5000),
  authAuditAppendOnly: isProduction ? true : asBool(process.env.AUTH_AUDIT_APPEND_ONLY, true),
  authLoginRateLimitWindowSec: asInt(process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_SEC, 60),
  authLoginRateLimitMax: asInt(process.env.AUTH_LOGIN_RATE_LIMIT_MAX, 20),
  authSelectTenantRateLimitMax: asInt(process.env.AUTH_SELECT_TENANT_RATE_LIMIT_MAX, 30),
  authOwnerMfaRequired: asBool(process.env.ARCANA_AUTH_OWNER_MFA_REQUIRED, true),
  authOwnerMfaBypassHosts: (() => {
    const defaults = ['arcana-staging.onrender.com', 'localhost', '127.0.0.1'];
    const configured = asStringArray(process.env.ARCANA_AUTH_OWNER_MFA_BYPASS_HOSTS);
    const merged = Array.from(new Set([...configured, ...defaults]));
    const deniedHosts = new Set([
      'arcana.hairtpclinic.se',
      'arcana.hairtpclinic.com',
      'ma.hairtpclinic.se',
      'ma.hairtpclinic.com',
    ]);
    return merged.filter((item) => {
      const host = normalizeHost(item);
      return host && !deniedHosts.has(host);
    });
  })(),
  authOwnerCredentialSelfHeal: asBool(process.env.AUTH_OWNER_CREDENTIAL_SELF_HEAL, true),
  authLoginSessionRotationScope: normalizeSessionRotationScope(
    process.env.AUTH_LOGIN_SESSION_ROTATION,
    'tenant'
  ),
  distributedBackend: normalizeDistributedBackend(
    process.env.ARCANA_DISTRIBUTED_BACKEND,
    'memory'
  ),
  redisUrl: asNonEmptyString(process.env.ARCANA_REDIS_URL),
  redisRequired: asBool(process.env.ARCANA_REDIS_REQUIRED, false),
  redisConnectTimeoutMs: asInt(process.env.ARCANA_REDIS_CONNECT_TIMEOUT_MS, 4000),
  redisKeyPrefix: asNonEmptyString(process.env.ARCANA_REDIS_KEY_PREFIX, 'arcana'),
  gatewayQueueLockTtlMs: asInt(process.env.ARCANA_GATEWAY_QUEUE_LOCK_TTL_MS, 30000),
  gatewayQueueAcquireTimeoutMs: asInt(
    process.env.ARCANA_GATEWAY_QUEUE_ACQUIRE_TIMEOUT_MS,
    10000
  ),
  gatewayQueuePollIntervalMs: asInt(process.env.ARCANA_GATEWAY_QUEUE_POLL_INTERVAL_MS, 80),
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
  publicChatKillSwitch: asBool(process.env.ARCANA_PUBLIC_CHAT_KILL_SWITCH, false),
  publicChatKillSwitchMessage: asNonEmptyString(
    process.env.ARCANA_PUBLIC_CHAT_KILL_SWITCH_MESSAGE,
    'Patientchatten är tillfälligt pausad. Kontakta kliniken via telefon eller e-post.'
  ),
  publicChatMaxTurns: asInt(process.env.ARCANA_PUBLIC_CHAT_MAX_TURNS, 12),
  publicChatPromptInjectionFilterEnabled: asBool(
    process.env.ARCANA_PUBLIC_CHAT_PROMPT_INJECTION_FILTER_ENABLED,
    true
  ),
  publicChatPromptInjectionMessage: asNonEmptyString(
    process.env.ARCANA_PUBLIC_CHAT_PROMPT_INJECTION_MESSAGE,
    'Jag kan inte hjälpa till med den typen av instruktion. Kontakta kliniken direkt för fortsatt hjälp.'
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
  riskDualSignoffRequired: asBool(process.env.ARCANA_RISK_DUAL_SIGNOFF_REQUIRED, false),

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
  schedulerCcoWeeklyBriefIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_CCO_WEEKLY_BRIEF_INTERVAL_HOURS,
    24
  ),
  schedulerCcoMonthlyRiskIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_CCO_MONTHLY_RISK_INTERVAL_HOURS,
    24
  ),
  schedulerCcoForwardOutlookIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_CCO_FORWARD_OUTLOOK_INTERVAL_HOURS,
    6
  ),
  schedulerCcoClientoBackfillIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_CCO_CLIENTO_BACKFILL_INTERVAL_HOURS,
    24
  ),
  schedulerCcoClientoBackfillCsvPath: asNonEmptyString(
    process.env.ARCANA_SCHEDULER_CCO_CLIENTO_BACKFILL_CSV_PATH
  ),
  schedulerCcoHistorySyncIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_CCO_HISTORY_SYNC_INTERVAL_HOURS,
    6
  ),
  schedulerCcoHistoryMailboxId: asNonEmptyString(
    process.env.ARCANA_SCHEDULER_CCO_HISTORY_MAILBOX_ID,
    'kons@hairtpclinic.com'
  ),
  schedulerCcoHistoryMailboxIds: (() => {
    const configured = asStringArray(process.env.ARCANA_SCHEDULER_CCO_HISTORY_MAILBOX_IDS)
      .map((value) => asNonEmptyString(value).toLowerCase())
      .filter(Boolean);
    return configured.length > 0
      ? configured
      : ['kons@hairtpclinic.com', 'info@hairtpclinic.com', 'contact@hairtpclinic.com', 'egzona@hairtpclinic.com'];
  })(),
  schedulerCcoHistoryRecentWindowDays: asInt(
    process.env.ARCANA_SCHEDULER_CCO_HISTORY_RECENT_WINDOW_DAYS,
    30
  ),
  schedulerCcoHistoryBackfillLookbackDays: asInt(
    process.env.ARCANA_SCHEDULER_CCO_HISTORY_BACKFILL_LOOKBACK_DAYS,
    1095
  ),
  schedulerCcoHistoryBackfillChunkDays: asInt(
    process.env.ARCANA_SCHEDULER_CCO_HISTORY_BACKFILL_CHUNK_DAYS,
    30
  ),
  schedulerCcoShadowRunIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_CCO_SHADOW_RUN_INTERVAL_HOURS,
    6
  ),
  schedulerCcoShadowReviewIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_CCO_SHADOW_REVIEW_INTERVAL_HOURS,
    24
  ),
  schedulerCcoShadowMailboxIds: (() => {
    const configured = asStringArray(process.env.ARCANA_SCHEDULER_CCO_SHADOW_MAILBOX_IDS)
      .map((value) => asNonEmptyString(value).toLowerCase())
      .filter(Boolean);
    return configured.length > 0 ? configured : ['kons@hairtpclinic.com'];
  })(),
  schedulerCcoShadowLookbackDays: asInt(
    process.env.ARCANA_SCHEDULER_CCO_SHADOW_LOOKBACK_DAYS,
    14
  ),
  schedulerCcoShadowReviewLookbackDays: asInt(
    process.env.ARCANA_SCHEDULER_CCO_SHADOW_REVIEW_LOOKBACK_DAYS,
    14
  ),
  schedulerReportIntervalHours: asInt(process.env.ARCANA_SCHEDULER_REPORT_INTERVAL_HOURS, 24),
  schedulerBackupIntervalHours: asInt(process.env.ARCANA_SCHEDULER_BACKUP_INTERVAL_HOURS, 24),
  schedulerRestoreDrillIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_RESTORE_DRILL_INTERVAL_HOURS,
    168
  ),
  schedulerRestoreDrillFullIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_RESTORE_DRILL_FULL_INTERVAL_HOURS,
    720
  ),
  schedulerAuditIntegrityIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_AUDIT_INTEGRITY_INTERVAL_HOURS,
    24
  ),
  schedulerSecretRotationIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_SECRET_ROTATION_INTERVAL_HOURS,
    24
  ),
  schedulerReleaseGovernanceIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_RELEASE_GOVERNANCE_INTERVAL_HOURS,
    24
  ),
  schedulerReleaseGovernanceAutoReviewEnabled: asBool(
    process.env.ARCANA_SCHEDULER_RELEASE_GOVERNANCE_AUTO_REVIEW_ENABLED,
    true
  ),
  schedulerSecretRotationDryRun: asBool(
    process.env.ARCANA_SCHEDULER_SECRET_ROTATION_DRY_RUN,
    true
  ),
  schedulerSecretRotationNote: asNonEmptyString(
    process.env.ARCANA_SCHEDULER_SECRET_ROTATION_NOTE,
    'Scheduled secret rotation snapshot'
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
  clientoServiceFilters: asStringArray(process.env.CLIENTO_SERVICE_FILTERS),
  clientoMergeLocations: asBool(process.env.CLIENTO_MERGE_LOCATIONS, false),
  clientoLocale: asNonEmptyString(process.env.CLIENTO_LOCALE, 'sv'),
  clientoPartnerId: asNonEmptyString(process.env.CLIENTO_PARTNER_ID),
  clientoApiBaseUrl: asNonEmptyString(
    process.env.CLIENTO_API_BASE_URL,
    'https://cliento.com/api/v2/partner/cliento'
  ),
  clientoApiKey: asNonEmptyString(process.env.CLIENTO_API_KEY),
  clientoApiAuthHeader: asNonEmptyString(process.env.CLIENTO_API_AUTH_HEADER, 'Authorization'),
  clientoApiAuthScheme: asNonEmptyString(process.env.CLIENTO_API_AUTH_SCHEME, 'Bearer'),
  clientoApiTimeoutMs: asInt(process.env.CLIENTO_API_TIMEOUT_MS, 10000),
};

if (config.aiProvider === 'openai' && !config.openaiApiKey) {
  throw new Error('Missing env var: OPENAI_API_KEY');
}

module.exports = { config };
