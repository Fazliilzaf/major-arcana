// @ts-nocheck
const fs = require('node:fs');
const path = require('node:path');

const RENDER_RUNTIME_DEFAULTS = Object.freeze({
  ARCANA_STATE_ROOT: '/var/data',
  ARCANA_CCO_BOOKING_STORE_PATH: '/var/data/cco-booking.json',
  ARCANA_CCO_BOOKING_ENGINE_STORE_PATH: '/var/data/cco-booking-engine.json',
  PLAYWRIGHT_BROWSERS_PATH: '/var/data/playwright-browsers',
  NODE_ENV: 'production',
  TRUST_PROXY: 'true',
  ARCANA_AI_PROVIDER: 'fallback',
  ARCANA_GRAPH_READ_ENABLED: 'false',
  ARCANA_GRAPH_SEND_ENABLED: 'false',
  ARCANA_GRAPH_FULL_TENANT: 'true',
  ARCANA_GRAPH_USER_SCOPE: 'all',
  ARCANA_STAFF_JOURNAL_OPEN_ACCESS: 'true',
  PUBLIC_BASE_URL: 'https://arcana.hairtpclinic.se',
  ARCANA_BOOTSTRAP_MAILBOX_BACKFILL: 'true',
  ARCANA_BOOTSTRAP_MAILBOX_LOOKBACK_DAYS: '14',
  ARCANA_BOOTSTRAP_PREFERRED_MAILBOX: 'contact@hairtpclinic.com',
  ARCANA_BOOTSTRAP_TENANT_ID: 'hair-tp-clinic',
  ARCANA_BOOTSTRAP_DELAY_MS: '5000',
  ARCANA_PUBLIC_WEB_BOOKING_ENABLED: 'true',
  ARCANA_CLIENTO_INTEGRATION_ENABLED: 'false',
  ARCANA_AUTH_OWNER_MFA_REQUIRED: 'false',
  ARCANA_PREFLIGHT_READINESS_CHECKS: 'cors_strict',
  ARCANA_BOOTSTRAP_RESET_OWNER_MFA: 'false',
  ARCANA_MARKETING_CONNECTORS_ENABLED: 'true',
  ARCANA_MARKETING_CONNECTORS_MODE: 'live',
  ARCANA_MARKETING_CONNECTORS_LIVE_FETCH: 'true',
  ARCANA_MARKETING_GOOGLE_ADS_ENABLED: 'true',
  ARCANA_MARKETING_META_ENABLED: 'true',
  ARCANA_MARKETING_LINKEDIN_ENABLED: 'true',
});

function isRenderRuntime() {
  return asBool(process.env.RENDER, false);
}

function applyRenderRuntimeDefaults() {
  if (!isRenderRuntime()) return { applied: [], skipped: true };
  const applied = [];
  for (const [key, value] of Object.entries(RENDER_RUNTIME_DEFAULTS)) {
    if (!asNonEmptyString(process.env[key])) {
      process.env[key] = value;
      applied.push(key);
    }
  }
  return { applied, skipped: false };
}

const renderRuntimeDefaults = applyRenderRuntimeDefaults();

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
        return parsed.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean);
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
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
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
const publicBaseUrl = asNonEmptyString(process.env.PUBLIC_BASE_URL, `http://localhost:${port}`);
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
const defaultLegacyHostRedirects = {
  'arcana.hairtpclinic.se': 'https://arcana.hairtpclinic.com',
  'ma.hairtpclinic.se': 'https://arcana.hairtpclinic.com',
};
const nodeEnv = asNonEmptyString(process.env.NODE_ENV, 'development').toLowerCase();
const isProduction = nodeEnv === 'production';
const aiProviderDefault =
  isProduction && !asNonEmptyString(process.env.OPENAI_API_KEY) ? 'fallback' : 'openai';
const stateRoot = resolveDirectoryPath(
  process.env.ARCANA_STATE_ROOT,
  path.join(process.cwd(), 'data')
);

const brand = asNonEmptyString(process.env.ARCANA_BRAND, 'hair-tp-clinic');
const brandByHost = asJsonObject(process.env.ARCANA_BRAND_BY_HOST, null);

// S3: Multi-tenant default-mailbox alias. Default-värde överrids via env:
//   • CCO_DEFAULT_MAILBOX (eller ARCANA_DEFAULT_MAILBOX)
// defaultTenantId definieras nedan i config-objektet med samma alias-stöd.
const defaultMailbox = asNonEmptyString(
  process.env.CCO_DEFAULT_MAILBOX || process.env.ARCANA_DEFAULT_MAILBOX,
  asNonEmptyString(process.env.ARCANA_SCHEDULER_CCO_HISTORY_MAILBOX_ID, 'kons@hairtpclinic.com')
);

const config = {
  renderRuntimeDefaults,
  port,
  publicBaseUrl,
  ccoNextCanonicalOrigin,
  ccoNextRedirectHosts,
  legacySeHostRedirectEnabled: asBool(
    process.env.ARCANA_LEGACY_SE_HOST_REDIRECT_ENABLED,
    isProduction
  ),
  legacyHostRedirects: asJsonObject(
    process.env.ARCANA_LEGACY_HOST_REDIRECTS,
    defaultLegacyHostRedirects
  ),
  brand,
  brandByHost,
  defaultMailbox,
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
  aiProvider: normalizeAiProvider(process.env.ARCANA_AI_PROVIDER, aiProviderDefault),
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
  webBridgeAuditStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_WEB_BRIDGE_AUDIT_STORE_PATH,
    stateRoot,
    fileName: 'web-bridge-audit.json',
  }),
  turnstileSecret: (process.env.TURNSTILE_SECRET || '').trim(),
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
  // Sharded store reads per-mailbox files on disk. Lazy preload avoids OOM on boot.
  ccoMailboxTruthSharded: asBool(process.env.ARCANA_CCO_MAILBOX_TRUTH_SHARDED, true),
  ccoMailboxTruthLazyPreload: asBool(process.env.ARCANA_CCO_MAILBOX_TRUTH_LAZY_PRELOAD, true),
  ccoMailboxTruthShardDir: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_MAILBOX_TRUTH_SHARD_DIR,
    stateRoot,
    fileName: 'cco-mailbox-truth',
  }),
  ccoMailIngestionStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_MAIL_INGESTION_STORE_PATH,
    stateRoot,
    fileName: 'cco-mail-ingestion.json',
  }),
  ccoMailIngestionEnabled: asBool(process.env.ARCANA_CCO_MAIL_INGESTION_ENABLED, true),
  ccoMailIngestionMode: asNonEmptyString(process.env.ARCANA_CCO_MAIL_INGESTION_MODE, 'read_only'),
  ccoMailIngestionDefaultMailbox: asNonEmptyString(
    process.env.ARCANA_CCO_MAIL_INGESTION_DEFAULT_MAILBOX,
    'contact@hairtpclinic.com'
  ),
  ccoMailIngestionMaxProcessPerCycle: asInt(
    process.env.ARCANA_CCO_MAIL_INGESTION_MAX_PROCESS_PER_CYCLE,
    25
  ),
  ccoMailIngestionQueueBatchSize: asInt(process.env.ARCANA_CCO_MAIL_INGESTION_QUEUE_BATCH_SIZE, 75),
  ccoMailIngestionStartupResumeDelayMs: asInt(
    process.env.ARCANA_CCO_MAIL_INGESTION_STARTUP_RESUME_DELAY_MS,
    120000
  ),
  ccoHalsoMailboxEmail: asNonEmptyString(
    process.env.ARCANA_CCO_HALSO_MAILBOX_EMAIL,
    'halso@hairtpclinic.com'
  ),
  ccoHalsoHealthDeclarationIngestEnabled: asBool(
    process.env.ARCANA_CCO_HALSO_HD_INGEST_ENABLED,
    false
  ),
  ccoHalsoHealthDeclarationDedupStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_HALSO_HD_DEDUP_STORE_PATH,
    stateRoot,
    fileName: 'cco-halso-health-declaration-ingest.json',
  }),
  ccoHalsoHdSchedulerStatePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_HALSO_HD_SCHEDULER_STATE_PATH,
    stateRoot,
    fileName: 'cco-halso-hd-scheduler-state.json',
  }),
  schedulerCcoHalsoHdMailboxIngestIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_CCO_HALSO_HD_MAILBOX_INGEST_INTERVAL_HOURS,
    8
  ),
  schedulerCcoHalsoHdLookbackDays: asInt(
    process.env.ARCANA_SCHEDULER_CCO_HALSO_HD_LOOKBACK_DAYS,
    3
  ),
  schedulerCcoMailIngestionQueueIntervalMinutes: asInt(
    process.env.ARCANA_SCHEDULER_CCO_MAIL_INGESTION_QUEUE_INTERVAL_MINUTES,
    1
  ),
  graphChangeNotificationsEnabled: asBool(
    process.env.ARCANA_GRAPH_CHANGE_NOTIFICATIONS_ENABLED,
    false
  ),
  graphChangeNotificationClientState: asNonEmptyString(
    process.env.ARCANA_GRAPH_CHANGE_NOTIFICATION_CLIENT_STATE,
    'arcana-cco-mail-ingestion'
  ),
  graphBaseUrl: asNonEmptyString(
    process.env.ARCANA_GRAPH_BASE_URL,
    'https://graph.microsoft.com/v1.0'
  ),
  ccoConversationStateStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_CONVERSATION_STATE_STORE_PATH,
    stateRoot,
    fileName: 'cco-conversation-state.json',
  }),
  ccoConversationNotesStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_CONVERSATION_NOTES_STORE_PATH,
    stateRoot,
    fileName: 'cco-conversation-notes.json',
  }),
  ccoMailTemplateStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_MAIL_TEMPLATE_STORE_PATH,
    stateRoot,
    fileName: 'cco-mail-templates.json',
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
  ccoBookingStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_BOOKING_STORE_PATH,
    stateRoot,
    fileName: 'cco-bookings.json',
  }),
  postOpReviewStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_POST_OP_REVIEW_STORE_PATH,
    stateRoot,
    fileName: 'post-op-reviews.json',
  }),
  adminTasksStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_ADMIN_TASKS_STORE_PATH || process.env.ADMIN_TASKS_STORE_PATH,
    stateRoot,
    fileName: 'admin-tasks.json',
  }),
  // Fotofilerna ligger separat från JSON-storen (foton kan vara stora;
  // JSON läses ofta). Default: <stateRoot>/post-op-photos/<submissionId>/<photoId>.jpg
  postOpPhotosDir: process.env.ARCANA_POST_OP_PHOTOS_DIR
    ? String(process.env.ARCANA_POST_OP_PHOTOS_DIR).trim()
    : require('path').join(stateRoot, 'post-op-photos'),
  // GDPR-retention för foton submittade utan publicerings-consent.
  // Default 365 dagar (12 mån) per Hair TP:s sekretesspolicy.
  postOpPhotoRetentionDays:
    Number(process.env.ARCANA_POST_OP_PHOTO_RETENTION_DAYS) > 0
      ? Number(process.env.ARCANA_POST_OP_PHOTO_RETENTION_DAYS)
      : 365,
  // Journal / medicinsk data — svensk lag 10 år (Patientdatalagen).
  journalRetentionYears: asInt(process.env.ARCANA_JOURNAL_RETENTION_YEARS, 10),
  // Cron-interval för pruneNoConsentPhotos (default 24h).
  schedulerPostOpPhotoPruneIntervalHours:
    Number(process.env.ARCANA_SCHED_POST_OP_PHOTO_PRUNE_HOURS) > 0
      ? Number(process.env.ARCANA_SCHED_POST_OP_PHOTO_PRUNE_HOURS)
      : 24,
  schedulerPostOpAutoTriggerIntervalHours:
    Number(process.env.ARCANA_SCHED_POST_OP_AUTO_TRIGGER_HOURS) > 0
      ? Number(process.env.ARCANA_SCHED_POST_OP_AUTO_TRIGGER_HOURS)
      : 6,
  postOpAutoTriggerGraceHours:
    Number(process.env.ARCANA_POST_OP_AUTO_TRIGGER_GRACE_HOURS) >= 0
      ? Number(process.env.ARCANA_POST_OP_AUTO_TRIGGER_GRACE_HOURS)
      : 24,
  // Sender-mailbox för auto-send av post-op review-email via M365 Graph.
  // Locked default per docs/strategy/u4-post-op-decisions.md (U4.5).
  postOpReviewFromMailbox: asNonEmptyString(
    process.env.ARCANA_POST_OP_REVIEW_FROM_MAILBOX,
    'kons@hairtpclinic.com'
  ),
  // Dokumenterad kanal — kodväg är Graph send idag (ej SMS/Resend för post-op).
  postOpNotificationChannel: asNonEmptyString(
    process.env.ARCANA_POST_OP_NOTIFICATION_CHANNEL,
    'graph_email'
  ),
  ccoBookingEngineStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_BOOKING_ENGINE_STORE_PATH,
    stateRoot,
    fileName: 'cco-booking-engine.json',
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
  ccoFortnoxStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_FORTNOX_STORE_PATH,
    stateRoot,
    fileName: 'cco-fortnox.json',
  }),
  ccoSwishStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_SWISH_STORE_PATH,
    stateRoot,
    fileName: 'cco-swish.json',
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
  ccoPatientMasterStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_PATIENT_MASTER_STORE_PATH,
    stateRoot,
    fileName: 'cco-patient-master.json',
  }),
  ccoDocumentInstanceStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_DOCUMENT_INSTANCE_STORE_PATH,
    stateRoot,
    fileName: 'cco-document-instances.json',
  }),
  ccoJournalStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_JOURNAL_STORE_PATH,
    stateRoot,
    fileName: 'cco-journal.json',
  }),
  ccoTreatmentEncounterStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_TREATMENT_ENCOUNTER_STORE_PATH,
    stateRoot,
    fileName: 'cco-treatment-encounters.json',
  }),
  ccoMigrationIndexStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_MIGRATION_INDEX_STORE_PATH,
    stateRoot,
    fileName: 'migration-index.json',
  }),
  ccoPatientAssetsPath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_PATIENT_ASSETS_PATH,
    stateRoot,
    fileName: 'cco-patient-assets.json',
  }),
  ccoAssetImportRunsPath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_ASSET_IMPORT_RUNS_PATH,
    stateRoot,
    fileName: 'cco-asset-import-runs.json',
  }),
  ccoAssetReviewQueuePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_ASSET_REVIEW_QUEUE_PATH,
    stateRoot,
    fileName: 'cco-asset-review-queue.json',
  }),
  ccoPatientSystemStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_PATIENT_SYSTEM_STORE_PATH,
    stateRoot,
    fileName: 'cco-patient-system.json',
  }),
  ccoConsultationStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_CONSULTATION_STORE_PATH,
    stateRoot,
    fileName: 'cco-consultations.json',
  }),
  ccoCommercialStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_COMMERCIAL_STORE_PATH,
    stateRoot,
    fileName: 'cco-commercial.json',
  }),
  ccoTreatmentAgreementStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_TREATMENT_AGREEMENT_STORE_PATH,
    stateRoot,
    fileName: 'cco-treatment-agreements.json',
  }),
  ccoTemplateVersionApprovalStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_TEMPLATE_VERSION_APPROVAL_STORE_PATH,
    stateRoot,
    fileName: 'cco-template-version-approvals.json',
  }),
  ccoPatientCareStateStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_PATIENT_CARE_STATE_STORE_PATH,
    stateRoot,
    fileName: 'cco-patient-care-state.json',
  }),
  maintenanceWindowStart: asNonEmptyString(process.env.ARCANA_MAINTENANCE_WINDOW_START),
  maintenanceWindowEnd: asNonEmptyString(process.env.ARCANA_MAINTENANCE_WINDOW_END),
  maintenanceWindowMessage: asNonEmptyString(process.env.ARCANA_MAINTENANCE_WINDOW_MESSAGE),
  offerDocumentsDir: process.env.ARCANA_OFFER_DOCUMENTS_DIR
    ? String(process.env.ARCANA_OFFER_DOCUMENTS_DIR).trim()
    : path.join(stateRoot, 'offer-documents'),
  ccoAftercareStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_AFTERCARE_STORE_PATH,
    stateRoot,
    fileName: 'cco-aftercare.json',
  }),
  ccoOperationStorePath: resolveStatePath({
    explicitPath: process.env.ARCANA_CCO_OPERATION_STORE_PATH,
    stateRoot,
    fileName: 'cco-operations.json',
  }),
  migrationDataRoot: process.env.ARCANA_MIGRATION_ROOT
    ? String(process.env.ARCANA_MIGRATION_ROOT).trim()
    : path.resolve(process.cwd(), '..'),
  journalPhotosDir: process.env.ARCANA_JOURNAL_PHOTOS_DIR
    ? String(process.env.ARCANA_JOURNAL_PHOTOS_DIR).trim()
    : path.join(stateRoot, 'journal-photos'),
  journalPhotosBackupRetentionMaxFiles: asInt(
    process.env.ARCANA_JOURNAL_PHOTOS_BACKUP_RETENTION_MAX_FILES,
    14
  ),
  journalPhotosBackupRetentionMaxAgeDays: asInt(
    process.env.ARCANA_JOURNAL_PHOTOS_BACKUP_RETENTION_MAX_AGE_DAYS,
    30
  ),
  capabilityAnalysisMaxEntries: asInt(process.env.ARCANA_CAPABILITY_ANALYSIS_MAX_ENTRIES, 15000),
  marketingCampaignDraftsPath: resolveStatePath({
    explicitPath: process.env.ARCANA_MARKETING_CAMPAIGN_DRAFTS_PATH,
    stateRoot,
    fileName: 'marketing-campaign-drafts.json',
  }),
  marketingClaimsWhitelistPath: resolveStatePath({
    explicitPath: process.env.ARCANA_MARKETING_CLAIMS_WHITELIST_PATH,
    stateRoot,
    fileName: 'marketing-claims-whitelist.json',
  }),
  marketingContentAssetsPath: resolveStatePath({
    explicitPath: process.env.ARCANA_MARKETING_CONTENT_ASSETS_PATH,
    stateRoot,
    fileName: 'marketing-content-assets.json',
  }),
  marketingConnectorsEnabled: asBool(process.env.ARCANA_MARKETING_CONNECTORS_ENABLED, true),
  marketingConnectorsMode: asNonEmptyString(process.env.ARCANA_MARKETING_CONNECTORS_MODE, 'live'),
  marketingConnectorsLiveFetch: asBool(process.env.ARCANA_MARKETING_CONNECTORS_LIVE_FETCH, true),
  marketingPublishPilotEnabled: asBool(process.env.ARCANA_MARKETING_PUBLISH_PILOT_ENABLED, true),
  marketingAutoPublishPilotChannels: asStringArray(
    process.env.ARCANA_MARKETING_AUTO_PUBLISH_PILOT_CHANNELS
  ),
  marketingPublishPilotMaxRiskLevel: asInt(
    process.env.ARCANA_MARKETING_PUBLISH_PILOT_MAX_RISK_LEVEL,
    3
  ),
  marketingPublishLiveEnabled: asBool(process.env.ARCANA_MARKETING_PUBLISH_LIVE_ENABLED, false),
  marketingPublishSandbox: asBool(process.env.ARCANA_MARKETING_PUBLISH_SANDBOX, true),
  marketingConnectorsCacheTtlMs: asInt(
    process.env.ARCANA_MARKETING_CONNECTORS_CACHE_TTL_MS,
    300000
  ),
  marketingBridgeToken: asNonEmptyString(process.env.ARCANA_MARKETING_BRIDGE_TOKEN),
  marketingConnectorHealthStatePath: resolveStatePath({
    explicitPath: process.env.ARCANA_MARKETING_CONNECTOR_HEALTH_STATE_PATH,
    stateRoot,
    fileName: 'cmo-connector-health-state.json',
  }),
  marketingConnectorAlertAfterMs: asInt(
    process.env.ARCANA_MARKETING_CONNECTOR_ALERT_AFTER_MS,
    900000
  ),
  marketingConnectors: {
    google_ads: {
      enabled: asBool(process.env.ARCANA_MARKETING_GOOGLE_ADS_ENABLED, false),
      apiKey: asNonEmptyString(process.env.ARCANA_MARKETING_GOOGLE_ADS_API_KEY),
      accessToken: asNonEmptyString(process.env.ARCANA_MARKETING_GOOGLE_ADS_ACCESS_TOKEN),
      developerToken: asNonEmptyString(process.env.ARCANA_MARKETING_GOOGLE_ADS_DEVELOPER_TOKEN),
      customerId: asNonEmptyString(process.env.ARCANA_MARKETING_GOOGLE_ADS_CUSTOMER_ID),
      loginCustomerId: asNonEmptyString(process.env.ARCANA_MARKETING_GOOGLE_ADS_LOGIN_CUSTOMER_ID),
      apiBaseUrl: asNonEmptyString(process.env.ARCANA_MARKETING_GOOGLE_ADS_API_BASE_URL),
      metricsPath: asNonEmptyString(
        process.env.ARCANA_MARKETING_GOOGLE_ADS_METRICS_PATH,
        '/metrics'
      ),
      mode: asNonEmptyString(process.env.ARCANA_MARKETING_GOOGLE_ADS_MODE),
      liveFetch: asBool(process.env.ARCANA_MARKETING_GOOGLE_ADS_LIVE_FETCH, false),
      fixtureId: asNonEmptyString(process.env.ARCANA_MARKETING_GOOGLE_ADS_FIXTURE_ID, 'google_ads'),
    },
    meta: {
      enabled: asBool(process.env.ARCANA_MARKETING_META_ENABLED, false),
      apiKey: asNonEmptyString(process.env.ARCANA_MARKETING_META_API_KEY),
      accessToken: asNonEmptyString(process.env.ARCANA_MARKETING_META_ACCESS_TOKEN),
      adAccountId: asNonEmptyString(process.env.ARCANA_MARKETING_META_AD_ACCOUNT_ID),
      apiBaseUrl: asNonEmptyString(process.env.ARCANA_MARKETING_META_API_BASE_URL),
      metricsPath: asNonEmptyString(process.env.ARCANA_MARKETING_META_METRICS_PATH, '/metrics'),
      mode: asNonEmptyString(process.env.ARCANA_MARKETING_META_MODE),
      liveFetch: asBool(process.env.ARCANA_MARKETING_META_LIVE_FETCH, false),
      fixtureId: asNonEmptyString(process.env.ARCANA_MARKETING_META_FIXTURE_ID, 'meta'),
    },
    linkedin: {
      enabled: asBool(process.env.ARCANA_MARKETING_LINKEDIN_ENABLED, false),
      apiKey: asNonEmptyString(process.env.ARCANA_MARKETING_LINKEDIN_API_KEY),
      accessToken: asNonEmptyString(process.env.ARCANA_MARKETING_LINKEDIN_ACCESS_TOKEN),
      adAccountId: asNonEmptyString(process.env.ARCANA_MARKETING_LINKEDIN_AD_ACCOUNT_ID),
      apiBaseUrl: asNonEmptyString(process.env.ARCANA_MARKETING_LINKEDIN_API_BASE_URL),
      metricsPath: asNonEmptyString(process.env.ARCANA_MARKETING_LINKEDIN_METRICS_PATH, '/metrics'),
      mode: asNonEmptyString(process.env.ARCANA_MARKETING_LINKEDIN_MODE),
      liveFetch: asBool(process.env.ARCANA_MARKETING_LINKEDIN_LIVE_FETCH, false),
      fixtureId: asNonEmptyString(process.env.ARCANA_MARKETING_LINKEDIN_FIXTURE_ID, 'linkedin'),
    },
    mail: {
      enabled: asBool(process.env.ARCANA_MARKETING_MAIL_ENABLED, false),
      apiKey: asNonEmptyString(process.env.ARCANA_MARKETING_MAIL_API_KEY),
      accessToken: asNonEmptyString(process.env.ARCANA_MARKETING_MAIL_ACCESS_TOKEN),
      apiBaseUrl: asNonEmptyString(process.env.ARCANA_MARKETING_MAIL_API_BASE_URL),
      metricsPath: asNonEmptyString(process.env.ARCANA_MARKETING_MAIL_METRICS_PATH, '/metrics'),
      mode: asNonEmptyString(process.env.ARCANA_MARKETING_MAIL_MODE),
      liveFetch: asBool(process.env.ARCANA_MARKETING_MAIL_LIVE_FETCH, false),
      fixtureId: asNonEmptyString(process.env.ARCANA_MARKETING_MAIL_FIXTURE_ID, 'mail'),
    },
  },
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
  schedulerSloTicketStoreMaxEntries: asInt(process.env.ARCANA_SLO_TICKET_STORE_MAX_ENTRIES, 3000),
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
  startupCcoMailboxTruthStoreMaxBytes: asInt(
    process.env.ARCANA_STARTUP_CCO_MAILBOX_TRUTH_STORE_MAX_BYTES,
    2 * 1024 * 1024 * 1024
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
  // Sessioner håller 7 dagar absolut + 24h idle-timeout. Override via env för kortare/längre.
  authSessionTtlHours: asInt(process.env.AUTH_SESSION_TTL_HOURS, 168),
  authSessionIdleMinutes: asInt(process.env.AUTH_SESSION_IDLE_MINUTES, 1440),
  authLoginTicketTtlMinutes: asInt(process.env.AUTH_LOGIN_TICKET_TTL_MINUTES, 10),
  authAuditMaxEntries: asInt(process.env.AUTH_AUDIT_MAX_ENTRIES, 5000),
  authAuditAppendOnly: isProduction ? true : asBool(process.env.AUTH_AUDIT_APPEND_ONLY, true),
  authLoginRateLimitWindowSec: asInt(process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_SEC, 900),
  authLoginRateLimitMax: asInt(process.env.AUTH_LOGIN_RATE_LIMIT_MAX, 5),
  authSelectTenantRateLimitMax: asInt(process.env.AUTH_SELECT_TENANT_RATE_LIMIT_MAX, 30),
  authOwnerMfaRequired: asBool(process.env.ARCANA_AUTH_OWNER_MFA_REQUIRED, false),
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
  distributedBackend: normalizeDistributedBackend(process.env.ARCANA_DISTRIBUTED_BACKEND, 'memory'),
  redisUrl: asNonEmptyString(process.env.ARCANA_REDIS_URL),
  redisRequired: asBool(process.env.ARCANA_REDIS_REQUIRED, false),
  redisConnectTimeoutMs: asInt(process.env.ARCANA_REDIS_CONNECT_TIMEOUT_MS, 4000),
  redisKeyPrefix: asNonEmptyString(process.env.ARCANA_REDIS_KEY_PREFIX, 'arcana'),
  gatewayQueueLockTtlMs: asInt(process.env.ARCANA_GATEWAY_QUEUE_LOCK_TTL_MS, 30000),
  gatewayQueueAcquireTimeoutMs: asInt(process.env.ARCANA_GATEWAY_QUEUE_ACQUIRE_TIMEOUT_MS, 10000),
  gatewayQueuePollIntervalMs: asInt(process.env.ARCANA_GATEWAY_QUEUE_POLL_INTERVAL_MS, 80),
  apiRateLimitWindowSec: asInt(process.env.ARCANA_API_RATE_LIMIT_WINDOW_SEC, 60),
  apiRateLimitReadMax: asInt(process.env.ARCANA_API_RATE_LIMIT_READ_MAX, 300),
  apiRateLimitWriteMax: asInt(process.env.ARCANA_API_RATE_LIMIT_WRITE_MAX, 120),
  riskRateLimitMax: asInt(process.env.ARCANA_RISK_RATE_LIMIT_MAX, 120),
  orchestratorRateLimitMax: asInt(process.env.ARCANA_ORCHESTRATOR_RATE_LIMIT_MAX, 80),
  publicRateLimitWindowSec: asInt(process.env.ARCANA_PUBLIC_RATE_LIMIT_WINDOW_SEC, 60),
  publicClinicRateLimitMax: asInt(process.env.ARCANA_PUBLIC_CLINIC_RATE_LIMIT_MAX, 180),
  publicWebBookingEnabled: asBool(process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED, true),
  clientoIntegrationEnabled: asBool(process.env.ARCANA_CLIENTO_INTEGRATION_ENABLED, false),
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
  defaultTenantId: asNonEmptyString(
    process.env.CCO_DEFAULT_TENANT_ID ||
      process.env.ARCANA_DEFAULT_TENANT_ID ||
      process.env.ARCANA_DEFAULT_TENANT,
    brand
  ),
  bootstrapOwnerEmail: asNonEmptyString(process.env.ARCANA_OWNER_EMAIL),
  bootstrapOwnerPassword: asNonEmptyString(process.env.ARCANA_OWNER_PASSWORD),
  bootstrapOwnerResetPassword: asBool(process.env.ARCANA_BOOTSTRAP_RESET_OWNER_PASSWORD, false),
  bootstrapOwnerResetMfa: asBool(process.env.ARCANA_BOOTSTRAP_RESET_OWNER_MFA, false),
  /** When true, GET /api/v1/auth/preview-bootstrap-session can mint a session for ARCANA_OWNER_* on allowlisted hosts only (staging-style convenience; off by default). */
  majorArcanaPreviewAutoAuth: asBool(process.env.ARCANA_MAJOR_ARCANA_PREVIEW_AUTO_AUTH, false),
  majorArcanaPreviewAutoAuthHosts: asStringArray(
    process.env.ARCANA_MAJOR_ARCANA_PREVIEW_AUTO_AUTH_HOSTS
  ),
  /** Byggfas: öppen åtkomst till kundregister/journal/offert-API utan inloggning. Sätt false före go-live. */
  staffJournalOpenAccess: asBool(process.env.ARCANA_STAFF_JOURNAL_OPEN_ACCESS, true),
  /** Kommaseparerade patientId för pilot — filtrerar kundlistan i staff-vyn när satt. */
  pilotPatientIds: asStringArray(process.env.ARCANA_PILOT_PATIENT_IDS),

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
  // Allowlist for schemalagda jobb: kommaseparerade jobb-id:n (se jobDefinitions i src/ops/scheduler.js).
  // Tom lista = alla jobb tillatna (bakatkompatibelt). Anvands for kontrollerat pa-slag vid lackjakt.
  schedulerJobsAllowlist: asStringArray(process.env.ARCANA_SCHEDULER_JOBS),
  graphReadEnabled: asBool(process.env.ARCANA_GRAPH_READ_ENABLED, false),
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
  schedulerCcoClientoCustomerDeltaSyncIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_CCO_CLIENTO_CUSTOMER_DELTA_SYNC_INTERVAL_HOURS,
    24
  ),
  schedulerCcoHistorySyncIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_CCO_HISTORY_SYNC_INTERVAL_HOURS,
    6
  ),
  schedulerCcoTruthDeltaIntervalMinutes: asInt(
    process.env.ARCANA_SCHEDULER_CCO_TRUTH_DELTA_INTERVAL_MINUTES,
    3
  ),
  schedulerCcoInboxBootstrapOnStart: asBool(
    process.env.ARCANA_SCHEDULER_CCO_INBOX_BOOTSTRAP_ON_START,
    true
  ),
  schedulerCcoInboxEnrichmentMaxAgeHours: asInt(
    process.env.ARCANA_SCHEDULER_CCO_INBOX_ENRICHMENT_MAX_AGE_HOURS,
    24
  ),
  schedulerCcoInboxBootstrapIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_CCO_INBOX_BOOTSTRAP_INTERVAL_HOURS,
    24
  ),
  schedulerCcoInboxBootstrapLookbackDays: asInt(
    process.env.ARCANA_SCHEDULER_CCO_INBOX_BOOTSTRAP_LOOKBACK_DAYS,
    90
  ),
  schedulerCcoInboxScopedLookbackDays: asInt(
    process.env.ARCANA_SCHEDULER_CCO_INBOX_SCOPED_LOOKBACK_DAYS,
    3
  ),
  schedulerCcoInboxScopedMaxMessagesPerUser: asInt(
    process.env.ARCANA_SCHEDULER_CCO_INBOX_SCOPED_MAX_MESSAGES_PER_USER,
    20
  ),
  schedulerCcoGraphSubscriptionRenewalIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_CCO_GRAPH_SUBSCRIPTION_RENEWAL_INTERVAL_HOURS,
    24
  ),
  schedulerCcoInboxFullBackfillBatchSize: asInt(
    process.env.ARCANA_SCHEDULER_CCO_INBOX_FULL_BACKFILL_BATCH_SIZE,
    15
  ),
  schedulerCcoInboxFullBackfillMaxStallRounds: asInt(
    process.env.ARCANA_SCHEDULER_CCO_INBOX_FULL_BACKFILL_MAX_STALL_ROUNDS,
    8
  ),
  schedulerCcoInboxFullBackfillMaxBatchRounds: asInt(
    process.env.ARCANA_SCHEDULER_CCO_INBOX_FULL_BACKFILL_MAX_BATCH_ROUNDS,
    200
  ),
  schedulerCcoInboxBootstrapMaxMessagesPerUser: asInt(
    process.env.ARCANA_SCHEDULER_CCO_INBOX_BOOTSTRAP_MAX_MESSAGES_PER_USER,
    200
  ),
  schedulerCcoInboxFullBackfillLookbackDays: asInt(
    process.env.ARCANA_SCHEDULER_CCO_INBOX_FULL_BACKFILL_LOOKBACK_DAYS,
    365
  ),
  schedulerCcoInboxFullBackfillIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_CCO_INBOX_FULL_BACKFILL_INTERVAL_HOURS,
    168
  ),
  schedulerCcoInboxFullBackfillOnStart: asBool(
    process.env.ARCANA_SCHEDULER_CCO_INBOX_FULL_BACKFILL_ON_START,
    true
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
      : [
          'kons@hairtpclinic.com',
          'info@hairtpclinic.com',
          'contact@hairtpclinic.com',
          'halso@hairtpclinic.com',
          'egzona@hairtpclinic.com',
          'fazli@hairtpclinic.com',
          'marknad@hairtpclinic.com',
          'receipt@hairtpclinic.com',
        ];
  })(),
  schedulerCcoHistoryRecentWindowDays: asInt(
    process.env.ARCANA_SCHEDULER_CCO_HISTORY_RECENT_WINDOW_DAYS,
    30
  ),
  // Sänkt 2026-05-14 från 1095 (3 år) — orsakade SIGABRT 134 OOM-loop på
  // Render Standard (2 GB RAM). Backfill-job processar lookbackDays i
  // 30-day chunks per mailbox: 1095/30 × 6 mailboxar = 218 chunks per
  // cykel × Graph API-payload = OOM. 90 dagar = 18 chunks total. Räcker
  // för normal use case (recent history); för längre historik finns
  // streaming endpoints separat.
  schedulerCcoHistoryBackfillLookbackDays: asInt(
    process.env.ARCANA_SCHEDULER_CCO_HISTORY_BACKFILL_LOOKBACK_DAYS,
    90
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
  schedulerCcoShadowLookbackDays: asInt(process.env.ARCANA_SCHEDULER_CCO_SHADOW_LOOKBACK_DAYS, 14),
  schedulerCcoShadowReviewLookbackDays: asInt(
    process.env.ARCANA_SCHEDULER_CCO_SHADOW_REVIEW_LOOKBACK_DAYS,
    14
  ),
  schedulerReportIntervalHours: asInt(process.env.ARCANA_SCHEDULER_REPORT_INTERVAL_HOURS, 24),
  schedulerBackupIntervalHours: asInt(process.env.ARCANA_SCHEDULER_BACKUP_INTERVAL_HOURS, 24),
  schedulerJournalPhotosBackupIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_JOURNAL_PHOTOS_BACKUP_INTERVAL_HOURS,
    24
  ),
  schedulerCcoMissingFormsReportIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_CCO_MISSING_FORMS_REPORT_INTERVAL_HOURS,
    24
  ),
  schedulerCcoJournalDraftIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_CCO_JOURNAL_DRAFT_INTERVAL_HOURS,
    24
  ),
  schedulerCcoFollowupDraftIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_CCO_FOLLOWUP_DRAFT_INTERVAL_HOURS,
    24
  ),
  schedulerCcoFollowupDraftLeadDays: asInt(
    process.env.ARCANA_SCHEDULER_CCO_FOLLOWUP_DRAFT_LEAD_DAYS,
    30
  ),
  schedulerCcoCustomerRemindersIntervalHours: asInt(
    process.env.ARCANA_SCHEDULER_CCO_CUSTOMER_REMINDERS_INTERVAL_HOURS,
    6
  ),
  ccoCareReminderDigestEmail: asNonEmptyString(
    process.env.ARCANA_CCO_CARE_REMINDER_DIGEST_EMAIL,
    'kons@hairtpclinic.com'
  ),
  ccoCareReminderFromEmail: asNonEmptyString(
    process.env.ARCANA_CCO_CARE_REMINDER_FROM_EMAIL,
    'kons@hairtpclinic.com'
  ),
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
  schedulerSecretRotationDryRun: asBool(process.env.ARCANA_SCHEDULER_SECRET_ROTATION_DRY_RUN, true),
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
  monitorPilotReportMaxAgeHours: asInt(process.env.ARCANA_MONITOR_PILOT_REPORT_MAX_AGE_HOURS, 36),
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
  fortnoxEnabled: asBool(process.env.ARCANA_FORTNOX_ENABLED, false),
  fortnoxClientId: asNonEmptyString(process.env.FORTNOX_CLIENT_ID),
  fortnoxClientSecret: asNonEmptyString(process.env.FORTNOX_CLIENT_SECRET),
  fortnoxScope: asNonEmptyString(process.env.FORTNOX_SCOPE, 'customer invoice'),
  fortnoxRedirectUri: asNonEmptyString(
    process.env.FORTNOX_REDIRECT_URI,
    `${asNonEmptyString(process.env.PUBLIC_BASE_URL, 'http://localhost:3000')}/api/v1/cco-fortnox/oauth/callback`
  ),
  // Sätt till 'service' om OAuth-appen har Service Account aktiverat i Fortnox Dev Portal.
  // Då skickas account_type=service med i auth-URL:en, vilket triggar att Fortnox
  // skapar/återanvänder ett service-konto (robot-användare) frikopplat från specifik
  // user-license. Krävs för att undvika error_missing_license.
  fortnoxAccountType: asNonEmptyString(process.env.FORTNOX_ACCOUNT_TYPE),
  swishEnabled: asBool(process.env.ARCANA_SWISH_ENABLED, false),
  swishApiBaseUrl: asNonEmptyString(
    process.env.SWISH_API_BASE_URL,
    'https://mss.cpc.getswish.net/swish-cpcapi'
  ),
  swishCertPath: asNonEmptyString(process.env.SWISH_CERT_PATH),
  swishKeyPath: asNonEmptyString(process.env.SWISH_KEY_PATH),
  swishP12Path: asNonEmptyString(process.env.SWISH_P12_PATH),
  swishCertPassphrase: asNonEmptyString(process.env.SWISH_CERT_PASSPHRASE),
  swishCaPath: asNonEmptyString(process.env.SWISH_CA_PATH),
  swishCallbackUrl: asNonEmptyString(
    process.env.SWISH_CALLBACK_URL,
    `${asNonEmptyString(process.env.PUBLIC_BASE_URL, 'http://localhost:3000')}/api/v1/cco-swish/callback`
  ),

  enableCcoOperatorCanary: asBool(process.env.ENABLE_CCO_OPERATOR_CANARY, false),
  enablePhotoReviewWrite: (() => {
    const requested = asBool(process.env.ENABLE_PHOTO_REVIEW_WRITE, false);
    if (!requested) return false;
    const allowProd = asBool(process.env.ENABLE_PHOTO_REVIEW_CANARY_ON_PROD, false);
    const blockedHosts = asStringArray(process.env.PHOTO_REVIEW_WRITE_BLOCKED_HOSTS).length
      ? asStringArray(process.env.PHOTO_REVIEW_WRITE_BLOCKED_HOSTS)
      : ['arcana.hairtpclinic.com', 'arcana.hairtpclinic.se', 'arcana-cco.onrender.com'];
    const hosts = [];
    for (const u of [process.env.PUBLIC_BASE_URL, process.env.RENDER_EXTERNAL_URL]) {
      if (!u) continue;
      try {
        hosts.push(new URL(u).hostname);
      } catch {
        /* skip */
      }
    }
    if (process.env.RENDER_EXTERNAL_HOSTNAME) hosts.push(process.env.RENDER_EXTERNAL_HOSTNAME);
    const onBlocked = hosts.some((h) => blockedHosts.some((b) => h === b || h.endsWith(`.${b}`)));
    if (onBlocked && !allowProd) return false;
    return true;
  })(),
  photoReviewFullCohort: asBool(process.env.PHOTO_REVIEW_FULL_COHORT, false),
  photoReviewCanaryMax: asInt(process.env.PHOTO_REVIEW_CANARY_MAX_DECISIONS, 25),
  enableDriveJournalNativePilot: asBool(process.env.ENABLE_DRIVE_JOURNAL_NATIVE_PILOT, false),
  driveJournalNativePilotPatientIds: asStringArray(
    process.env.DRIVE_JOURNAL_NATIVE_PILOT_PATIENT_IDS
  ),
  driveJournalNativePilotManifestPath: asNonEmptyString(
    process.env.DRIVE_JOURNAL_NATIVE_PILOT_MANIFEST_PATH,
    path.join(process.cwd(), 'data/drive-journal-native-pilot-patients.json')
  ),
  driveJournalNativePilotMaxPatients: asInt(
    process.env.DRIVE_JOURNAL_NATIVE_PILOT_MAX_PATIENTS,
    50
  ),
  enableImportReviewWrite: (() => {
    const master = asBool(process.env.ENABLE_CCO_OPERATOR_CANARY, false);
    return master && asBool(process.env.ENABLE_IMPORT_REVIEW_WRITE, false);
  })(),
  importReviewCanaryMax: asInt(process.env.IMPORT_REVIEW_CANARY_MAX_DECISIONS, 25),
  enableMailReviewCanary: (() => {
    const master = asBool(process.env.ENABLE_CCO_OPERATOR_CANARY, false);
    return master && asBool(process.env.ENABLE_MAIL_REVIEW_CANARY, false);
  })(),
  mailReviewCanaryMax: asInt(process.env.MAIL_REVIEW_CANARY_MAX_DECISIONS, 25),
};

if (
  config.aiProvider === 'openai' &&
  !config.openaiApiKey &&
  String(process.env.NODE_ENV || '')
    .trim()
    .toLowerCase() === 'production'
) {
  throw new Error('Missing env var: OPENAI_API_KEY');
}

module.exports = {
  config,
  applyRenderRuntimeDefaults,
  isRenderRuntime,
  renderRuntimeDefaults,
};
