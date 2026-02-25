const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');

const { evaluateGoldSetFile } = require('../risk/goldSet');
const { getPolicyFloorDefinition } = require('../policy/floor');
const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { listSchedulerPilotReports } = require('../ops/pilotReports');

const RISK_GOLD_SET_DEFAULT_PATH = path.join(process.cwd(), 'docs', 'risk', 'gold-set-v1.json');
const REQUIRED_SCHEDULER_JOBS = Object.freeze([
  'nightly_pilot_report',
  'backup_prune',
  'restore_drill_preview',
  'alert_probe',
]);
const READINESS_BANDS = Object.freeze({
  noGoMaxExclusive: 75,
  limitedBetaMaxExclusive: 85,
});
const OWNER_DECISIONS_ALLOW_ACTIVATION = new Set(['approved_exception', 'false_positive']);
const DECISIONS_REQUIRING_OWNER_OVERRIDE = new Set(['review_required', 'blocked']);
const REMEDIATION_PRIORITY_ORDER = Object.freeze({
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
});
const REMEDIATION_GUIDANCE_BY_NOGO = Object.freeze({
  output_without_risk_policy_gate: {
    owner: 'release_owner',
    playbook: 'Verifiera att alla aktiva versioner har output-risk + policy metadata före aktivering.',
  },
  policy_floor_bypass: {
    owner: 'risk_owner',
    playbook: 'Stoppa aktiveringar som bryter policy floor och kör om risk-evaluering.',
  },
  l5_without_manual_intervention: {
    owner: 'owner',
    playbook: 'Kräv owner action (approve_exception/mark_false_positive) innan L5 aktiveras.',
  },
  restore_drill_unverified_30d: {
    owner: 'ops_owner',
    playbook: 'Kör restore_drill_preview och verifiera success i scheduler + audit.',
  },
  nightly_pilot_report_unverified: {
    owner: 'ops_owner',
    playbook:
      'Kör nightly_pilot_report och verifiera success i scheduler + rapportfil i /ops/reports.',
  },
  audit_chain_not_immutable: {
    owner: 'security_owner',
    playbook: 'Aktivera append-only audit och fixa hash-chain integrity-fel.',
  },
  tenant_isolation_unverified: {
    owner: 'security_owner',
    playbook: 'Kör tenant access-check regelbundet och verifiera i audit-loggen.',
  },
});
const REMEDIATION_GUIDANCE_BY_CHECK = Object.freeze({
  owner_mfa_enforced: {
    owner: 'security_owner',
    playbook: 'Sätt MFA required/configured för samtliga aktiva OWNER-konton.',
  },
  cors_strict: {
    owner: 'platform_owner',
    playbook: 'Sätt strict CORS med explicit allowlist och blockera no-origin.',
  },
  rate_limits_configured: {
    owner: 'platform_owner',
    playbook: 'Sätt alla auth/api/risk/public rate limits till > 0 i config.',
  },
  audit_append_only: {
    owner: 'security_owner',
    playbook: 'Sätt AUTH_AUDIT_APPEND_ONLY=true i runtime-konfigurationen.',
  },
  audit_integrity: {
    owner: 'security_owner',
    playbook: 'Kör audit integrity-check och reparera kedjebrott innan go-live.',
  },
  secrets_rotation: {
    owner: 'security_owner',
    playbook: 'Rotera stale required secrets och ta ned pending rotation till 0.',
  },
  incident_model_available: {
    owner: 'ops_owner',
    playbook: 'Säkerställ incidents API/store är aktiverat för tenant.',
  },
  high_critical_incident_link: {
    owner: 'risk_owner',
    playbook: 'Skapa incidents för alla high/critical risk-fall.',
  },
  open_incidents_owned: {
    owner: 'ops_owner',
    playbook: 'Tilldela owner på samtliga öppna incidents.',
  },
  sla_breach_control: {
    owner: 'ops_owner',
    playbook: 'Minska breached incidents via prioriterad triage och eskalering.',
  },
  auto_escalation_evidence: {
    owner: 'ops_owner',
    playbook: 'Verifiera alert_probe/auto escalation senaste 30 dagar.',
  },
  auto_assignment_evidence: {
    owner: 'ops_owner',
    playbook: 'Verifiera alert_probe auto owner assignment senaste 30 dagar.',
  },
  scheduler_enabled_started: {
    owner: 'ops_owner',
    playbook: 'Starta scheduler och verifiera enabled=true + started=true.',
  },
  scheduler_required_jobs_enabled: {
    owner: 'ops_owner',
    playbook: 'Aktivera nightly_pilot_report, backup_prune, restore_drill_preview och alert_probe.',
  },
  scheduler_job_freshness: {
    owner: 'ops_owner',
    playbook: 'Kör/övervaka scheduler-jobb tills freshness är inom target.',
  },
  restore_drill_30d: {
    owner: 'ops_owner',
    playbook: 'Kör restore drill och säkerställ success <= 30 dagar.',
  },
  nightly_pilot_report_freshness: {
    owner: 'ops_owner',
    playbook: 'Kör nightly_pilot_report och säkerställ att senaste success-run är färsk.',
  },
  gold_set_coverage: {
    owner: 'risk_owner',
    playbook: 'Öka gold-set till minst 150 cases.',
  },
  band_accuracy: {
    owner: 'risk_owner',
    playbook: 'Kalibrera riskregler/modifier tills band accuracy >= 95%.',
  },
  level_accuracy: {
    owner: 'risk_owner',
    playbook: 'Kalibrera riskregler/modifier tills level accuracy >= 90%.',
  },
  threshold_versioning: {
    owner: 'risk_owner',
    playbook: 'Säkerställ threshold version/history är aktiv och spårbar.',
  },
  owner_governed_calibration: {
    owner: 'risk_owner',
    playbook: 'Kör owner-godkänd calibration update med actorUserId i audit.',
  },
  policy_floor_loaded: {
    owner: 'risk_owner',
    playbook: 'Ladda policy floor-definition med minst en aktiv regel.',
  },
});

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

async function readFileMeta(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return {
      path: filePath,
      exists: true,
      sizeBytes: stat.size,
      updatedAt: stat.mtime.toISOString(),
    };
  } catch {
    return {
      path: filePath,
      exists: false,
      sizeBytes: 0,
      updatedAt: null,
    };
  }
}

function mb(value) {
  return Number((Number(value || 0) / 1024 / 1024).toFixed(2));
}

function toAgeDaysSince(isoTs, nowMs = Date.now()) {
  const ts = Date.parse(String(isoTs || ''));
  if (!Number.isFinite(ts)) return null;
  if (ts > nowMs) return 0;
  return Number(((nowMs - ts) / (24 * 60 * 60 * 1000)).toFixed(2));
}

function toAgeHoursSince(isoTs, nowMs = Date.now()) {
  const ts = Date.parse(String(isoTs || ''));
  if (!Number.isFinite(ts)) return null;
  if (ts > nowMs) return 0;
  return Number(((nowMs - ts) / (60 * 60 * 1000)).toFixed(2));
}

function parseDays(value, fallback = 90) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(7, Math.min(3650, parsed));
}

function statusScore(status) {
  switch (status) {
    case 'green':
      return 100;
    case 'yellow':
      return 70;
    case 'red':
      return 0;
    case 'unknown':
      return 40;
    default:
      return 40;
  }
}

function normalizeStatus(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (['green', 'yellow', 'red', 'unknown'].includes(normalized)) {
    return normalized;
  }
  return 'unknown';
}

function buildCheck({
  id,
  label,
  status = 'unknown',
  required = true,
  value = null,
  target = '',
  evidence = '',
  inferred = false,
} = {}) {
  return {
    id: normalizeText(id),
    label: normalizeText(label),
    status: normalizeStatus(status),
    required: Boolean(required),
    score: statusScore(status),
    target: normalizeText(target) || null,
    value,
    evidence: normalizeText(evidence) || null,
    inferred: Boolean(inferred),
  };
}

function evaluateCategory({
  id,
  label,
  weight = 25,
  checks = [],
} = {}) {
  const safeChecks = Array.isArray(checks) ? checks : [];
  const hasRequiredRed = safeChecks.some((check) => check.required && check.status === 'red');
  const hasAnyRed = safeChecks.some((check) => check.status === 'red');
  const hasAnyYellow = safeChecks.some((check) => check.status === 'yellow');
  const hasRequiredUnknown = safeChecks.some((check) => check.required && check.status === 'unknown');
  const avgScore =
    safeChecks.length > 0
      ? safeChecks.reduce((sum, check) => sum + Number(check.score || 0), 0) / safeChecks.length
      : 0;

  let status = 'green';
  if (hasRequiredRed || avgScore < 60) {
    status = 'red';
  } else if (hasAnyRed || hasAnyYellow || hasRequiredUnknown || avgScore < 85) {
    status = 'yellow';
  }

  return {
    id,
    label,
    weight: Number(weight),
    status,
    score: Number(avgScore.toFixed(2)),
    checks: safeChecks,
  };
}

function pickReadinessBand(score) {
  if (score < READINESS_BANDS.noGoMaxExclusive) return 'no_go';
  if (score < READINESS_BANDS.limitedBetaMaxExclusive) return 'limited_beta';
  return 'controlled_go';
}

function statusFromPercentTarget(value, target, { yellowDelta = 1 } = {}) {
  const safeValue = Number(value);
  const safeTarget = Number(target);
  if (!Number.isFinite(safeValue) || !Number.isFinite(safeTarget)) return 'unknown';
  if (safeValue >= safeTarget) return 'green';
  if (safeValue >= safeTarget - Math.max(0, Number(yellowDelta) || 0)) return 'yellow';
  return 'red';
}

function worstStatus(statuses = []) {
  const list = Array.isArray(statuses) ? statuses : [];
  if (list.includes('red')) return 'red';
  if (list.includes('yellow')) return 'yellow';
  if (list.includes('unknown')) return 'unknown';
  return 'green';
}

function isRecentWithinDays(isoTs, maxDays, nowMs = Date.now()) {
  const ageDays = toAgeDaysSince(isoTs, nowMs);
  return ageDays !== null && ageDays <= maxDays;
}

function findLatestAuditEvent(events = [], { action = '', outcome = '' } = {}) {
  const normalizedAction = normalizeText(action);
  const normalizedOutcome = normalizeText(outcome).toLowerCase();
  for (const item of Array.isArray(events) ? events : []) {
    if (normalizedAction && normalizeText(item?.action) !== normalizedAction) continue;
    if (normalizedOutcome && normalizeText(item?.outcome).toLowerCase() !== normalizedOutcome) continue;
    return item;
  }
  return null;
}

function buildRestoreDrillGate({
  schedulerStatus = null,
  latestRestoreDrillAudit = null,
  monitorRestoreDrillMaxAgeDays = 30,
  nowMs = Date.now(),
} = {}) {
  const schedulerJobs = Array.isArray(schedulerStatus?.jobs) ? schedulerStatus.jobs : [];
  const restoreDrillJob =
    schedulerJobs.find((item) => String(item?.id || '') === 'restore_drill_preview') || null;
  const lastSuccessAt = toIso(latestRestoreDrillAudit?.ts || restoreDrillJob?.lastSuccessAt);
  const ageDays = toAgeDaysSince(lastSuccessAt, nowMs);
  const maxAgeDays = Math.max(1, Math.min(365, Number(monitorRestoreDrillMaxAgeDays || 30)));
  const healthy = ageDays !== null && ageDays <= maxAgeDays;
  const noGo = !schedulerStatus?.enabled || !schedulerStatus?.started || !healthy;
  const healthy30d =
    Boolean(schedulerStatus?.enabled) &&
    Boolean(schedulerStatus?.started) &&
    ageDays !== null &&
    ageDays <= 30;
  return {
    maxAgeDays,
    lastSuccessAt,
    ageDays,
    healthy,
    noGo,
    healthy30d,
    restoreDrillJob,
  };
}

function newestIsoTimestamp(values = []) {
  let bestIso = null;
  let bestMs = null;
  for (const value of Array.isArray(values) ? values : []) {
    const iso = toIso(value);
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) continue;
    if (bestMs === null || ms > bestMs) {
      bestMs = ms;
      bestIso = iso;
    }
  }
  return bestIso;
}

function buildNightlyPilotReportGate({
  schedulerStatus = null,
  latestNightlyReportAudit = null,
  latestReportFile = null,
  monitorPilotReportMaxAgeHours = 36,
  nowMs = Date.now(),
} = {}) {
  const schedulerJobs = Array.isArray(schedulerStatus?.jobs) ? schedulerStatus.jobs : [];
  const nightlyReportJob =
    schedulerJobs.find((item) => String(item?.id || '') === 'nightly_pilot_report') || null;
  const maxAgeHours = Math.max(1, Math.min(720, Number(monitorPilotReportMaxAgeHours || 36)));
  const latestReportUpdatedAt = toIso(latestReportFile?.mtime);
  const lastSuccessAt = newestIsoTimestamp([
    latestNightlyReportAudit?.ts,
    nightlyReportJob?.lastSuccessAt,
    latestReportUpdatedAt,
  ]);
  const ageHours = toAgeHoursSince(lastSuccessAt, nowMs);
  const healthy = ageHours !== null && ageHours <= maxAgeHours;
  const noGo = !schedulerStatus?.enabled || !schedulerStatus?.started || !healthy;
  const healthy24h =
    Boolean(schedulerStatus?.enabled) &&
    Boolean(schedulerStatus?.started) &&
    ageHours !== null &&
    ageHours <= 24;
  return {
    maxAgeHours,
    lastSuccessAt,
    ageHours,
    healthy,
    healthy24h,
    noGo,
    nightlyReportJob,
    latestReport: latestReportFile
      ? {
          fileName: normalizeText(latestReportFile?.fileName) || null,
          updatedAt: latestReportUpdatedAt,
          sizeBytes: Number(latestReportFile?.sizeBytes || 0),
        }
      : null,
  };
}

function buildSchedulerFreshnessCheck(job) {
  if (!job) {
    return buildCheck({
      id: 'scheduler_job_missing',
      label: 'Scheduler-job saknas',
      status: 'red',
      required: true,
      evidence: 'Jobdefinition hittades inte i scheduler status.',
    });
  }

  const intervalHours = Math.max(1, Number(job.intervalMs || 0) / (60 * 60 * 1000));
  const maxAgeHours = Math.max(2, Math.ceil(intervalHours * 2.5));
  const ageHours = toAgeHoursSince(job.lastSuccessAt);
  let status = 'green';
  if (!job.enabled || ageHours === null || ageHours > maxAgeHours) {
    status = 'red';
  } else if (ageHours > maxAgeHours * 0.75) {
    status = 'yellow';
  }

  return buildCheck({
    id: `scheduler_job_freshness_${normalizeText(job.id)}`,
    label: `Scheduler freshness ${job.name || job.id}`,
    status,
    required: true,
    target: `lastSuccess <= ${maxAgeHours}h`,
    value: {
      jobId: job.id,
      enabled: Boolean(job.enabled),
      intervalHours: Number(intervalHours.toFixed(2)),
      lastSuccessAt: toIso(job.lastSuccessAt),
      ageHours,
      lastStatus: normalizeText(job.lastStatus) || null,
    },
    evidence: ageHours === null ? 'Saknar lyckad körning.' : '',
  });
}

function collectActiveTemplateVersions(templates = []) {
  const activeVersions = [];

  for (const template of Array.isArray(templates) ? templates : []) {
    const versions = Array.isArray(template?.versions) ? template.versions : [];
    const activeVersionId = normalizeText(template?.currentActiveVersionId);
    let activeVersion = null;

    if (activeVersionId) {
      activeVersion =
        versions.find((version) => normalizeText(version?.id) === activeVersionId) || null;
    }
    if (!activeVersion) {
      activeVersion =
        versions.find((version) => normalizeText(version?.state).toLowerCase() === 'active') || null;
    }
    if (!activeVersion) continue;

    activeVersions.push({
      templateId: normalizeText(template?.id),
      templateName: normalizeText(template?.name) || null,
      category: normalizeText(template?.category) || null,
      versionId: normalizeText(activeVersion?.id),
      versionNo: Number(activeVersion?.versionNo || 0),
      risk: activeVersion?.risk || null,
      activatedAt: toIso(activeVersion?.activatedAt),
      updatedAt: toIso(activeVersion?.updatedAt),
    });
  }

  return activeVersions;
}

function toNoGoDetails(items = [], limit = 10) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
  return items.slice(0, safeLimit);
}

function buildPolicyRuleFloorMap(policyRules = []) {
  const map = new Map();
  for (const rule of Array.isArray(policyRules) ? policyRules : []) {
    const id = normalizeText(rule?.id);
    if (!id) continue;
    const floor = Math.max(1, Math.min(5, Number(rule?.floor || 1)));
    map.set(id, floor);
  }
  return map;
}

function remediationPriorityRank(priority) {
  const normalized = normalizeText(priority).toUpperCase();
  if (Object.prototype.hasOwnProperty.call(REMEDIATION_PRIORITY_ORDER, normalized)) {
    return REMEDIATION_PRIORITY_ORDER[normalized];
  }
  return 99;
}

function remediationPriorityFromCheck(check) {
  const status = normalizeStatus(check?.status);
  const required = Boolean(check?.required);
  if (status === 'red') return required ? 'P1' : 'P2';
  if (status === 'unknown') return required ? 'P1' : 'P2';
  if (status === 'yellow') return required ? 'P2' : 'P3';
  return 'P3';
}

function buildReadinessRemediation({
  categories = [],
  noGoTriggers = [],
  score = 0,
  band = '',
  goAllowed = false,
  nowIso = new Date().toISOString(),
} = {}) {
  const actions = [];
  const seenIds = new Set();

  for (const trigger of Array.isArray(noGoTriggers) ? noGoTriggers : []) {
    if (normalizeText(trigger?.status).toLowerCase() !== 'triggered') continue;
    const triggerId = normalizeText(trigger?.id);
    if (!triggerId) continue;
    const actionId = `nogo:${triggerId}`;
    if (seenIds.has(actionId)) continue;
    seenIds.add(actionId);

    const guidance = REMEDIATION_GUIDANCE_BY_NOGO[triggerId] || {};
    actions.push({
      id: actionId,
      priority: 'P0',
      source: 'no_go_trigger',
      owner: normalizeText(guidance.owner) || 'owner',
      title: normalizeText(trigger?.label) || triggerId,
      playbook: normalizeText(guidance.playbook) || null,
      currentState: 'triggered',
      targetState: 'clear',
      evidence: normalizeText(trigger?.evidence) || null,
      required: true,
      relatedId: triggerId,
      scoreImpactMax: 0,
      gateImpact: 'go_no_go',
    });
  }

  for (const category of Array.isArray(categories) ? categories : []) {
    const categoryId = normalizeText(category?.id);
    const categoryLabel = normalizeText(category?.label) || categoryId || null;
    const checks = Array.isArray(category?.checks) ? category.checks : [];
    const categoryWeight = Number(category?.weight || 0);
    const checksCount = Math.max(1, checks.length);
    for (const check of checks) {
      const checkStatus = normalizeStatus(check?.status);
      if (checkStatus === 'green') continue;
      const checkId = normalizeText(check?.id);
      if (!checkId) continue;
      const actionId = `check:${categoryId}:${checkId}`;
      if (seenIds.has(actionId)) continue;
      seenIds.add(actionId);

      const priority = remediationPriorityFromCheck(check);
      const guidance = REMEDIATION_GUIDANCE_BY_CHECK[checkId] || {};
      const checkScore = Math.max(0, Math.min(100, Number(check?.score || 0)));
      const scoreImpactMax = Number(
        ((((100 - checkScore) / checksCount) * categoryWeight) / 100).toFixed(2)
      );
      actions.push({
        id: actionId,
        priority,
        source: 'category_check',
        owner: normalizeText(guidance.owner) || 'owner',
        title: normalizeText(check?.label) || checkId,
        playbook: normalizeText(guidance.playbook) || null,
        currentState: checkStatus,
        targetState: 'green',
        evidence: normalizeText(check?.evidence) || null,
        target: normalizeText(check?.target) || null,
        required: Boolean(check?.required),
        relatedId: checkId,
        categoryId: categoryId || null,
        categoryLabel,
        scoreImpactMax,
      });
    }
  }

  actions.sort((a, b) => {
    const byPriority = remediationPriorityRank(a.priority) - remediationPriorityRank(b.priority);
    if (byPriority !== 0) return byPriority;
    const byRequired = Number(Boolean(b.required)) - Number(Boolean(a.required));
    if (byRequired !== 0) return byRequired;
    const byScoreImpact = Number(b.scoreImpactMax || 0) - Number(a.scoreImpactMax || 0);
    if (byScoreImpact !== 0) return byScoreImpact;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  const byPriority = { P0: 0, P1: 0, P2: 0, P3: 0 };
  let potentialScoreGain = 0;
  for (const action of actions) {
    const key = normalizeText(action?.priority).toUpperCase();
    if (Object.prototype.hasOwnProperty.call(byPriority, key)) {
      byPriority[key] += 1;
    }
    potentialScoreGain += Number(action?.scoreImpactMax || 0);
  }
  potentialScoreGain = Number(potentialScoreGain.toFixed(2));

  return {
    generatedAt: nowIso,
    readinessBand: normalizeText(band) || null,
    readinessScore: Number(score || 0),
    goAllowed: Boolean(goAllowed),
    summary: {
      total: actions.length,
      byPriority,
      criticalPath: byPriority.P0,
      potentialScoreGain,
    },
    nextActions: actions.slice(0, 8),
    actions,
  };
}

function createMonitorRouter({
  authStore,
  templateStore,
  tenantConfigStore,
  secretRotationStore = null,
  runtimeMetricsStore = null,
  config,
  scheduler = null,
  requireAuth,
  requireRole,
  runtimeState,
}) {
  const router = express.Router();

  router.get(
    '/monitor/status',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const tenantId = req.auth.tenantId;
        const supportsIncidents = typeof templateStore?.summarizeIncidents === 'function';

        const [
          templates,
          summary,
          incidentSummary,
          members,
          auditEvents,
          latestRestoreDrillAudit,
          latestNightlyReportAudit,
          latestSchedulerReports,
          tenantConfig,
          authFile,
          templateFile,
          tenantFile,
          secretRotationFile,
        ] =
          await Promise.all([
            templateStore.listTemplates({ tenantId }),
            templateStore.summarizeRisk({ tenantId, minRiskLevel: 1 }),
            supportsIncidents
              ? templateStore.summarizeIncidents({ tenantId })
              : Promise.resolve(null),
            authStore.listTenantMembers(tenantId),
            authStore.listAuditEvents({ tenantId, limit: 300 }),
            typeof authStore.getLatestAuditEvent === 'function'
              ? authStore.getLatestAuditEvent({
                  tenantId,
                  action: 'scheduler.job.restore_drill_preview.run',
                  outcome: 'success',
                })
              : Promise.resolve(null),
            typeof authStore.getLatestAuditEvent === 'function'
              ? authStore.getLatestAuditEvent({
                  tenantId,
                  action: 'scheduler.job.nightly_pilot_report.run',
                  outcome: 'success',
                })
              : Promise.resolve(null),
            listSchedulerPilotReports({
              reportsDir: config?.reportsDir,
              limit: 1,
            }),
            tenantConfigStore.getTenantConfig(tenantId),
            readFileMeta(authStore.filePath),
            readFileMeta(templateStore.filePath),
            readFileMeta(tenantConfigStore.filePath),
            readFileMeta(config?.secretRotationStorePath),
          ]);

        const now = Date.now();
        const dayAgo = now - 24 * 60 * 60 * 1000;
        const recentAuditCount = auditEvents.filter((item) => {
          const ts = Date.parse(item.ts || '');
          return Number.isFinite(ts) && ts >= dayAgo;
        }).length;

        const activeStaff = members.filter(
          (item) => item?.membership?.role === 'STAFF' && item?.membership?.status === 'active'
        ).length;
        const disabledStaff = members.filter(
          (item) => item?.membership?.role === 'STAFF' && item?.membership?.status === 'disabled'
        ).length;

        const memoryUsage = process.memoryUsage();
        const runtimeMetrics =
          runtimeMetricsStore && typeof runtimeMetricsStore.getSnapshot === 'function'
            ? runtimeMetricsStore.getSnapshot({ areaLimit: 8 })
            : null;
        const activeTemplates = templates.filter((item) => item.currentActiveVersionId).length;
        const schedulerStatus =
          scheduler && typeof scheduler.getStatus === 'function'
            ? scheduler.getStatus()
            : null;
        const restoreDrillGate = buildRestoreDrillGate({
          schedulerStatus,
          latestRestoreDrillAudit,
          monitorRestoreDrillMaxAgeDays: config?.monitorRestoreDrillMaxAgeDays,
          nowMs: now,
        });
        const latestSchedulerReport =
          Array.isArray(latestSchedulerReports) && latestSchedulerReports.length > 0
            ? latestSchedulerReports[0]
            : null;
        const pilotReportGate = buildNightlyPilotReportGate({
          schedulerStatus,
          latestNightlyReportAudit,
          latestReportFile: latestSchedulerReport,
          monitorPilotReportMaxAgeHours: config?.monitorPilotReportMaxAgeHours,
          nowMs: now,
        });

        const secretRotationStatus =
          secretRotationStore && typeof secretRotationStore.getSecretsStatus === 'function'
            ? await secretRotationStore.getSecretsStatus({
                maxAgeDays: parseDays(config?.secretRotationMaxAgeDays, 90),
              })
            : null;

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'monitor.status.read',
          outcome: 'success',
          targetType: 'monitor_status',
          targetId: tenantId,
        });

        return res.json({
          generatedAt: new Date().toISOString(),
          runtime: {
            ready: runtimeState?.ready === true,
            startedAt: toIso(runtimeState?.startedAt),
            uptimeSec: Number(process.uptime().toFixed(1)),
            pid: process.pid,
            nodeVersion: process.version,
            platform: process.platform,
            aiProvider: config?.aiProvider || 'openai',
            aiModel: config?.openaiModel || '',
            memoryMb: {
              rss: mb(memoryUsage.rss),
              heapTotal: mb(memoryUsage.heapTotal),
              heapUsed: mb(memoryUsage.heapUsed),
              external: mb(memoryUsage.external),
            },
            metrics: runtimeMetrics
              ? {
                  p95Ms: Number(runtimeMetrics?.latency?.p95Ms || 0),
                  p99Ms: Number(runtimeMetrics?.latency?.p99Ms || 0),
                  sampledRequests: Number(runtimeMetrics?.totals?.sampledRequests || 0),
                  slowRequests: Number(runtimeMetrics?.totals?.slowRequests || 0),
                }
              : {
                  p95Ms: 0,
                  p99Ms: 0,
                  sampledRequests: 0,
                  slowRequests: 0,
                },
            scheduler: schedulerStatus
              ? {
                  enabled: Boolean(schedulerStatus.enabled),
                  started: Boolean(schedulerStatus.started),
                  startedAt: toIso(schedulerStatus.startedAt),
                  jobsEnabled: Array.isArray(schedulerStatus.jobs)
                    ? schedulerStatus.jobs.filter((item) => item?.enabled).length
                    : 0,
                  restoreDrill: {
                    maxAgeDays: restoreDrillGate.maxAgeDays,
                    lastSuccessAt: restoreDrillGate.lastSuccessAt,
                    ageDays: restoreDrillGate.ageDays,
                    healthy: restoreDrillGate.healthy,
                    noGo: restoreDrillGate.noGo,
                  },
                  pilotReport: {
                    maxAgeHours: pilotReportGate.maxAgeHours,
                    lastSuccessAt: pilotReportGate.lastSuccessAt,
                    ageHours: pilotReportGate.ageHours,
                    healthy: pilotReportGate.healthy,
                    noGo: pilotReportGate.noGo,
                    latestReport: pilotReportGate.latestReport,
                  },
                }
              : {
                  enabled: false,
                  started: false,
                  startedAt: null,
                  jobsEnabled: 0,
                  restoreDrill: {
                    maxAgeDays: restoreDrillGate.maxAgeDays,
                    lastSuccessAt: null,
                    ageDays: null,
                    healthy: false,
                    noGo: true,
                  },
                  pilotReport: {
                    maxAgeHours: pilotReportGate.maxAgeHours,
                    lastSuccessAt: null,
                    ageHours: null,
                    healthy: false,
                    noGo: true,
                    latestReport: pilotReportGate.latestReport,
                  },
                },
          },
          security: {
            cors: {
              strict: Boolean(config?.corsStrict),
              allowNoOrigin: Boolean(config?.corsAllowNoOrigin),
              allowCredentials: Boolean(config?.corsAllowCredentials),
              allowedOrigins: Array.isArray(config?.corsAllowedOrigins)
                ? config.corsAllowedOrigins
                : [],
            },
            sessions: {
              ttlHours: Number(config?.authSessionTtlHours || 0),
              idleTimeoutMinutes: Number(config?.authSessionIdleMinutes || 0),
              loginRotationScope: config?.authLoginSessionRotationScope || 'none',
            },
            rateLimits: {
              loginMax: Number(config?.authLoginRateLimitMax || 0),
              selectTenantMax: Number(config?.authSelectTenantRateLimitMax || 0),
              apiReadMax: Number(config?.apiRateLimitReadMax || 0),
              apiWriteMax: Number(config?.apiRateLimitWriteMax || 0),
              windowSec: Number(config?.apiRateLimitWindowSec || 0),
              riskMax: Number(config?.riskRateLimitMax || 0),
              orchestratorMax: Number(config?.orchestratorRateLimitMax || 0),
              publicWindowSec: Number(config?.publicRateLimitWindowSec || 0),
              publicClinicMax: Number(config?.publicClinicRateLimitMax || 0),
              publicChatMax: Number(config?.publicChatRateLimitMax || 0),
            },
            secrets: {
              trackingEnabled: Boolean(secretRotationStatus),
              maxAgeDays: parseDays(config?.secretRotationMaxAgeDays, 90),
              tracked: Number(secretRotationStatus?.totals?.tracked || 0),
              required: Number(secretRotationStatus?.totals?.required || 0),
              present: Number(secretRotationStatus?.totals?.present || 0),
              staleRequired: Number(secretRotationStatus?.totals?.staleRequired || 0),
              pendingRotation: Number(secretRotationStatus?.totals?.pendingRotation || 0),
            },
          },
          tenant: {
            tenantId,
            assistantName: tenantConfig.assistantName,
            toneStyle: tenantConfig.toneStyle,
            brandProfile: tenantConfig.brandProfile,
            riskSensitivityModifier: tenantConfig.riskSensitivityModifier,
          },
          kpis: {
            templatesTotal: templates.length,
            templatesActive: activeTemplates,
            requestLatencyP95Ms: Number(runtimeMetrics?.latency?.p95Ms || 0),
            requestLatencyP99Ms: Number(runtimeMetrics?.latency?.p99Ms || 0),
            evaluationsTotal: Number(summary?.totals?.evaluations || 0),
            highCriticalOpen: Number(summary?.totals?.highCriticalOpen || 0),
            incidentsTotal: Number(incidentSummary?.totals?.incidents || 0),
            incidentsOpen: Number(incidentSummary?.totals?.openUnresolved || 0),
            incidentsBreachedOpen: Number(incidentSummary?.totals?.breachedOpen || 0),
            restoreDrillAgeDays: restoreDrillGate.ageDays,
            restoreDrillHealthy: restoreDrillGate.healthy,
            pilotReportAgeHours: pilotReportGate.ageHours,
            pilotReportHealthy: pilotReportGate.healthy,
            secretRotationStaleRequired: Number(secretRotationStatus?.totals?.staleRequired || 0),
            secretRotationPending: Number(secretRotationStatus?.totals?.pendingRotation || 0),
            staffActive: activeStaff,
            staffDisabled: disabledStaff,
            auditEvents24h: recentAuditCount,
          },
          gates: {
            restoreDrill: {
              maxAgeDays: restoreDrillGate.maxAgeDays,
              lastSuccessAt: restoreDrillGate.lastSuccessAt,
              ageDays: restoreDrillGate.ageDays,
              healthy: restoreDrillGate.healthy,
              noGo: restoreDrillGate.noGo,
            },
            pilotReport: {
              maxAgeHours: pilotReportGate.maxAgeHours,
              lastSuccessAt: pilotReportGate.lastSuccessAt,
              ageHours: pilotReportGate.ageHours,
              healthy: pilotReportGate.healthy,
              noGo: pilotReportGate.noGo,
              latestReport: pilotReportGate.latestReport,
            },
          },
          stores: {
            auth: authFile,
            templates: templateFile,
            tenantConfig: tenantFile,
            secretRotation: secretRotationFile,
          },
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa monitor-status.' });
      }
    }
  );

  router.get(
    '/monitor/metrics',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      if (!runtimeMetricsStore || typeof runtimeMetricsStore.getSnapshot !== 'function') {
        return res.status(503).json({ error: 'Runtime metrics är inte tillgängliga.' });
      }
      try {
        const areaLimit = Math.max(
          1,
          Math.min(50, Number.parseInt(String(req.query?.areaLimit ?? ''), 10) || 12)
        );
        const snapshot = runtimeMetricsStore.getSnapshot({ areaLimit });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'monitor.metrics.read',
          outcome: 'success',
          targetType: 'monitor_metrics',
          targetId: req.auth.tenantId,
          metadata: {
            requests: Number(snapshot?.totals?.requests || 0),
            sampledRequests: Number(snapshot?.totals?.sampledRequests || 0),
            p95Ms: Number(snapshot?.latency?.p95Ms || 0),
            areaLimit,
          },
        });

        return res.json(snapshot);
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa monitor metrics.' });
      }
    }
  );

  router.get(
    '/monitor/slo',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const tenantId = req.auth.tenantId;
        const schedulerStatus =
          scheduler && typeof scheduler.getStatus === 'function'
            ? scheduler.getStatus()
            : null;
        const [incidentSummary, latestRestoreDrillAudit, latestNightlyReportAudit, latestSchedulerReports] =
          await Promise.all([
          typeof templateStore?.summarizeIncidents === 'function'
            ? templateStore.summarizeIncidents({ tenantId })
            : Promise.resolve(null),
          typeof authStore.getLatestAuditEvent === 'function'
            ? authStore.getLatestAuditEvent({
                tenantId,
                action: 'scheduler.job.restore_drill_preview.run',
                outcome: 'success',
              })
            : Promise.resolve(null),
          typeof authStore.getLatestAuditEvent === 'function'
            ? authStore.getLatestAuditEvent({
                tenantId,
                action: 'scheduler.job.nightly_pilot_report.run',
                outcome: 'success',
              })
            : Promise.resolve(null),
          listSchedulerPilotReports({
            reportsDir: config?.reportsDir,
            limit: 1,
          }),
        ]);

        const runtimeMetrics =
          runtimeMetricsStore && typeof runtimeMetricsStore.getSnapshot === 'function'
            ? runtimeMetricsStore.getSnapshot({ areaLimit: 10 })
            : null;
        const restoreGate = buildRestoreDrillGate({
          schedulerStatus,
          latestRestoreDrillAudit,
          monitorRestoreDrillMaxAgeDays: config?.monitorRestoreDrillMaxAgeDays,
          nowMs: Date.now(),
        });
        const latestSchedulerReport =
          Array.isArray(latestSchedulerReports) && latestSchedulerReports.length > 0
            ? latestSchedulerReports[0]
            : null;
        const pilotReportGate = buildNightlyPilotReportGate({
          schedulerStatus,
          latestNightlyReportAudit,
          latestReportFile: latestSchedulerReport,
          monitorPilotReportMaxAgeHours: config?.monitorPilotReportMaxAgeHours,
          nowMs: Date.now(),
        });

        const sampledRequests = Number(runtimeMetrics?.totals?.sampledRequests || 0);
        const serverErrors = Number(runtimeMetrics?.totals?.statusBuckets?.['5xx'] || 0);
        const availabilityPct =
          sampledRequests > 0
            ? Number((((sampledRequests - serverErrors) / sampledRequests) * 100).toFixed(3))
            : 100;

        const openIncidents = Number(incidentSummary?.totals?.openUnresolved || 0);
        const breachedOpen = Number(incidentSummary?.totals?.breachedOpen || 0);
        const incidentResponsePct =
          openIncidents > 0
            ? Number((((openIncidents - breachedOpen) / openIncidents) * 100).toFixed(3))
            : 100;
        const breachRatePct =
          openIncidents > 0 ? Number(((breachedOpen / openIncidents) * 100).toFixed(3)) : 0;

        const slos = [
          {
            id: 'availability_http',
            label: 'HTTP availability',
            targetPct: 99.5,
            sliPct: availabilityPct,
            status: statusFromPercentTarget(availabilityPct, 99.5, { yellowDelta: 0.5 }),
            evidence: {
              sampledRequests,
              serverErrors,
            },
          },
          {
            id: 'incident_response',
            label: 'Incident response (open incidents utan breach)',
            targetPct: 95,
            sliPct: incidentResponsePct,
            status: statusFromPercentTarget(incidentResponsePct, 95, { yellowDelta: 5 }),
            evidence: {
              openIncidents,
              breachedOpen,
              breachRatePct,
            },
          },
          {
            id: 'restore_drill_recency',
            label: 'Restore drill recency',
            target: '<=30 dagar',
            sliDays: restoreGate.ageDays,
            status: restoreGate.healthy30d
              ? 'green'
              : restoreGate.ageDays !== null && restoreGate.ageDays <= 45
                ? 'yellow'
                : 'red',
            evidence: {
              lastSuccessAt: restoreGate.lastSuccessAt,
              schedulerEnabled: Boolean(schedulerStatus?.enabled),
              schedulerStarted: Boolean(schedulerStatus?.started),
            },
          },
          {
            id: 'pilot_report_recency',
            label: 'Nightly pilot report recency',
            target: '<=24h',
            sliHours: pilotReportGate.ageHours,
            status: pilotReportGate.healthy24h
              ? 'green'
              : pilotReportGate.healthy
                ? 'yellow'
                : 'red',
            evidence: {
              lastSuccessAt: pilotReportGate.lastSuccessAt,
              schedulerEnabled: Boolean(schedulerStatus?.enabled),
              schedulerStarted: Boolean(schedulerStatus?.started),
              latestReport: pilotReportGate.latestReport,
            },
          },
        ];

        const overallStatus = worstStatus(slos.map((item) => item.status));

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'monitor.slo.read',
          outcome: 'success',
          targetType: 'monitor_slo',
          targetId: tenantId,
          metadata: {
            overallStatus,
            availabilityPct,
            incidentResponsePct,
            restoreDrillAgeDays: restoreGate.ageDays,
            pilotReportAgeHours: pilotReportGate.ageHours,
          },
        });

        return res.json({
          generatedAt: new Date().toISOString(),
          tenantId,
          summary: {
            overallStatus,
            sampledRequests,
            openIncidents,
            breachedOpen,
          },
          slos,
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa monitor SLO.' });
      }
    }
  );

  router.get(
    '/monitor/readiness',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const tenantId = req.auth.tenantId;
        const nowMs = Date.now();
        const supportsIncidents = typeof templateStore?.summarizeIncidents === 'function';
        const supportsListIncidents = typeof templateStore?.listIncidents === 'function';
        const supportsActiveVersionSnapshots =
          typeof templateStore?.listActiveVersionSnapshots === 'function';
        const schedulerStatus =
          scheduler && typeof scheduler.getStatus === 'function'
            ? scheduler.getStatus()
            : null;

        const [
          members,
          auditEvents,
          auditIntegrity,
          riskSummary,
          incidentSummary,
          openIncidents,
          latestRestoreDrillAudit,
          latestNightlyReportAudit,
          latestSchedulerReports,
          tenantConfig,
          secretRotationStatus,
          activeVersionSource,
        ] = await Promise.all([
          authStore.listTenantMembers(tenantId),
          authStore.listAuditEvents({ tenantId, limit: 500 }),
          authStore.verifyAuditIntegrity({ maxIssues: 25 }),
          templateStore.summarizeRisk({ tenantId, minRiskLevel: 1 }),
          supportsIncidents ? templateStore.summarizeIncidents({ tenantId }) : Promise.resolve(null),
          supportsIncidents && supportsListIncidents
            ? templateStore.listIncidents({ tenantId, status: 'open', limit: 300 })
            : Promise.resolve([]),
          typeof authStore.getLatestAuditEvent === 'function'
            ? authStore.getLatestAuditEvent({
                tenantId,
                action: 'scheduler.job.restore_drill_preview.run',
                outcome: 'success',
              })
            : Promise.resolve(null),
          typeof authStore.getLatestAuditEvent === 'function'
            ? authStore.getLatestAuditEvent({
                tenantId,
                action: 'scheduler.job.nightly_pilot_report.run',
                outcome: 'success',
              })
            : Promise.resolve(null),
          listSchedulerPilotReports({
            reportsDir: config?.reportsDir,
            limit: 1,
          }),
          tenantConfigStore.getTenantConfig(tenantId),
          secretRotationStore && typeof secretRotationStore.getSecretsStatus === 'function'
            ? secretRotationStore.getSecretsStatus({
                maxAgeDays: parseDays(config?.secretRotationMaxAgeDays, 90),
              })
            : Promise.resolve(null),
          supportsActiveVersionSnapshots
            ? templateStore.listActiveVersionSnapshots({ tenantId })
            : templateStore.listTemplates({ tenantId, includeVersions: true }),
        ]);

        const restoreDrillGate = buildRestoreDrillGate({
          schedulerStatus,
          latestRestoreDrillAudit,
          monitorRestoreDrillMaxAgeDays: config?.monitorRestoreDrillMaxAgeDays,
          nowMs,
        });
        const latestSchedulerReport =
          Array.isArray(latestSchedulerReports) && latestSchedulerReports.length > 0
            ? latestSchedulerReports[0]
            : null;
        const pilotReportGate = buildNightlyPilotReportGate({
          schedulerStatus,
          latestNightlyReportAudit,
          latestReportFile: latestSchedulerReport,
          monitorPilotReportMaxAgeHours: config?.monitorPilotReportMaxAgeHours,
          nowMs,
        });
        const schedulerJobs = Array.isArray(schedulerStatus?.jobs) ? schedulerStatus.jobs : [];
        const schedulerJobMap = new Map(
          schedulerJobs.map((job) => [normalizeText(job?.id), job])
        );
        const schedulerFreshnessChecks = REQUIRED_SCHEDULER_JOBS.map((jobId) =>
          buildSchedulerFreshnessCheck(schedulerJobMap.get(jobId))
        );

        const policyFloor = getPolicyFloorDefinition();
        const policyRules = Array.isArray(policyFloor?.rules) ? policyFloor.rules : [];

        let riskPrecision = null;
        let riskPrecisionError = '';
        try {
          riskPrecision = await evaluateGoldSetFile({
            filePath: RISK_GOLD_SET_DEFAULT_PATH,
            tenantRiskModifier: Number(tenantConfig?.riskSensitivityModifier || 0),
          });
        } catch (error) {
          riskPrecisionError = normalizeText(error?.message || 'okänd risk-precision error');
        }

        const activeOwners = (Array.isArray(members) ? members : []).filter(
          (item) =>
            normalizeText(item?.membership?.role).toUpperCase() === ROLE_OWNER &&
            normalizeText(item?.membership?.status).toLowerCase() === 'active'
        );
        const ownersWithoutMfa = activeOwners.filter(
          (item) => !item?.user?.mfaRequired || !item?.user?.mfaConfigured
        );

        const rateLimitValues = {
          loginMax: Number(config?.authLoginRateLimitMax || 0),
          selectTenantMax: Number(config?.authSelectTenantRateLimitMax || 0),
          apiReadMax: Number(config?.apiRateLimitReadMax || 0),
          apiWriteMax: Number(config?.apiRateLimitWriteMax || 0),
          riskMax: Number(config?.riskRateLimitMax || 0),
          orchestratorMax: Number(config?.orchestratorRateLimitMax || 0),
          publicClinicMax: Number(config?.publicClinicRateLimitMax || 0),
          publicChatMax: Number(config?.publicChatRateLimitMax || 0),
        };
        const allRateLimitsConfigured = Object.values(rateLimitValues).every((value) => value > 0);

        const openIncidentsList = Array.isArray(openIncidents) ? openIncidents : [];
        const unownedOpenIncidents = openIncidentsList.filter(
          (item) => !normalizeText(item?.owner?.userId)
        );
        const breachedOpenIncidents = Number(incidentSummary?.totals?.breachedOpen || 0);
        const incidentsOpenCount = Number(incidentSummary?.totals?.openUnresolved || 0);
        const highCriticalOpenCount = Number(riskSummary?.totals?.highCriticalOpen || 0);
        const incidentsTotal = Number(incidentSummary?.totals?.incidents || 0);

        const latestAutoEscalate = findLatestAuditEvent(auditEvents, {
          action: 'incidents.auto_escalate',
          outcome: 'success',
        });
        const latestAutoAssign = findLatestAuditEvent(auditEvents, {
          action: 'incidents.auto_assign_owner',
          outcome: 'success',
        });
        const latestTenantAccessCheck = findLatestAuditEvent(auditEvents, {
          action: 'tenants.access_check',
          outcome: 'success',
        });
        const tenantIsolationVerified = isRecentWithinDays(
          latestTenantAccessCheck?.ts,
          30,
          nowMs
        );

        const riskVersion = parsePositiveInt(tenantConfig?.riskThresholdVersion) || 0;
        const riskHistoryCount = Array.isArray(tenantConfig?.riskThresholdHistory)
          ? tenantConfig.riskThresholdHistory.length
          : 0;
        const riskChangeEvents = (Array.isArray(auditEvents) ? auditEvents : []).filter((item) =>
          ['risk.settings.update', 'risk.settings.rollback', 'risk.calibration.apply_suggestion'].includes(
            normalizeText(item?.action)
          )
        );
        const nonOwnerGovernedRiskChanges = riskChangeEvents.filter(
          (item) => !normalizeText(item?.actorUserId)
        );

        const riskDatasetCases = Number(riskPrecision?.dataset?.count || 0);
        const bandAccuracyPercent = Number(riskPrecision?.report?.totals?.bandAccuracyPercent || 0);
        const levelAccuracyPercent = Number(riskPrecision?.report?.totals?.levelAccuracyPercent || 0);
        const activeTemplateVersions = supportsActiveVersionSnapshots
          ? (Array.isArray(activeVersionSource) ? activeVersionSource : []).map((item) => ({
              templateId: normalizeText(item?.templateId),
              templateName: normalizeText(item?.templateName) || null,
              category: normalizeText(item?.category) || null,
              versionId: normalizeText(item?.versionId),
              versionNo: Number(item?.versionNo || 0),
              risk: item?.risk || null,
              activatedAt: toIso(item?.activatedAt),
              updatedAt: toIso(item?.updatedAt),
            }))
          : collectActiveTemplateVersions(activeVersionSource);
        const policyRuleFloorMap = buildPolicyRuleFloorMap(policyRules);

        const outputGateViolations = [];
        const policyFloorBypassViolations = [];
        const l5WithoutManualIntervention = [];

        for (const activeVersion of activeTemplateVersions) {
          const risk = activeVersion?.risk && typeof activeVersion.risk === 'object'
            ? activeVersion.risk
            : null;
          const decision = normalizeText(risk?.decision).toLowerCase();
          const ownerDecision = normalizeText(risk?.ownerDecision).toLowerCase();
          const outputEvaluation =
            risk?.output && typeof risk.output === 'object' ? risk.output : null;
          const hasOutputEvaluation =
            Boolean(outputEvaluation) &&
            normalizeText(outputEvaluation?.scope).toLowerCase() === 'output';
          const hasPolicyMetadata =
            hasOutputEvaluation &&
            Array.isArray(outputEvaluation?.policyHits) &&
            Array.isArray(outputEvaluation?.policyAdjustments);
          const requiresOwnerOverride = DECISIONS_REQUIRING_OWNER_OVERRIDE.has(decision);
          const hasOwnerOverride = OWNER_DECISIONS_ALLOW_ACTIVATION.has(ownerDecision);
          const riskLevel = Number(risk?.riskLevel || 0);

          const gateIssues = [];
          if (!risk) gateIssues.push('risk_missing');
          if (!hasOutputEvaluation) gateIssues.push('output_evaluation_missing');
          if (hasOutputEvaluation && !hasPolicyMetadata) gateIssues.push('policy_metadata_missing');
          if (!decision) gateIssues.push('decision_missing');
          if (requiresOwnerOverride && !hasOwnerOverride) gateIssues.push('owner_override_missing');

          if (gateIssues.length > 0) {
            outputGateViolations.push({
              templateId: activeVersion.templateId,
              templateName: activeVersion.templateName,
              versionId: activeVersion.versionId,
              versionNo: activeVersion.versionNo,
              category: activeVersion.category,
              riskLevel,
              decision: decision || null,
              ownerDecision: ownerDecision || null,
              gateIssues,
              activatedAt: activeVersion.activatedAt,
            });
          }

          if (hasPolicyMetadata) {
            const policyHits = Array.isArray(outputEvaluation.policyHits) ? outputEvaluation.policyHits : [];
            for (const hit of policyHits) {
              const policyHitId = normalizeText(hit?.id);
              const floorFromHit = Number(hit?.floor || 0);
              const floorFromRuleMap = Number(policyRuleFloorMap.get(policyHitId) || 0);
              const floor =
                floorFromHit > 0 ? floorFromHit : floorFromRuleMap > 0 ? floorFromRuleMap : 1;
              if (riskLevel < floor) {
                policyFloorBypassViolations.push({
                  reason: 'floor_underflow',
                  templateId: activeVersion.templateId,
                  versionId: activeVersion.versionId,
                  riskLevel,
                  decision: decision || null,
                  policyRuleId: policyHitId || null,
                  policyFloor: floor,
                  activatedAt: activeVersion.activatedAt,
                });
              }
              if (decision === 'allow' && floor >= 4) {
                policyFloorBypassViolations.push({
                  reason: 'allow_despite_policy_floor',
                  templateId: activeVersion.templateId,
                  versionId: activeVersion.versionId,
                  riskLevel,
                  decision: decision || null,
                  policyRuleId: policyHitId || null,
                  policyFloor: floor,
                  activatedAt: activeVersion.activatedAt,
                });
              }
            }
          }

          if (riskLevel >= 5 && !hasOwnerOverride) {
            l5WithoutManualIntervention.push({
              templateId: activeVersion.templateId,
              templateName: activeVersion.templateName,
              versionId: activeVersion.versionId,
              versionNo: activeVersion.versionNo,
              category: activeVersion.category,
              riskLevel,
              decision: decision || null,
              ownerDecision: ownerDecision || null,
              activatedAt: activeVersion.activatedAt,
            });
          }
        }

        const categoryA = evaluateCategory({
          id: 'A',
          label: 'Säkerhetshärdning',
          weight: 30,
          checks: [
            buildCheck({
              id: 'owner_mfa_enforced',
              label: 'OWNER MFA enforcement',
              status:
                activeOwners.length > 0 && ownersWithoutMfa.length === 0 ? 'green' : 'red',
              required: true,
              target: 'Alla aktiva OWNER har MFA required + configured',
              value: {
                activeOwners: activeOwners.length,
                ownersWithoutMfa: ownersWithoutMfa.length,
              },
            }),
            buildCheck({
              id: 'cors_strict',
              label: 'Strict CORS allowlist',
              status:
                config?.corsStrict &&
                !config?.corsAllowNoOrigin &&
                Array.isArray(config?.corsAllowedOrigins) &&
                config.corsAllowedOrigins.length > 0
                  ? 'green'
                  : config?.corsStrict
                    ? 'yellow'
                    : 'red',
              required: true,
              target: 'strict=true, allowNoOrigin=false, minst en origin',
              value: {
                strict: Boolean(config?.corsStrict),
                allowNoOrigin: Boolean(config?.corsAllowNoOrigin),
                allowedOrigins: Array.isArray(config?.corsAllowedOrigins)
                  ? config.corsAllowedOrigins.length
                  : 0,
              },
            }),
            buildCheck({
              id: 'rate_limits_configured',
              label: 'Rate limits konfigurerade',
              status: allRateLimitsConfigured ? 'green' : 'red',
              required: true,
              target: 'Alla limiter-värden > 0',
              value: rateLimitValues,
            }),
            buildCheck({
              id: 'audit_append_only',
              label: 'Audit append-only läge',
              status: config?.authAuditAppendOnly ? 'green' : 'red',
              required: true,
              target: 'AUTH_AUDIT_APPEND_ONLY=true',
              value: { appendOnly: Boolean(config?.authAuditAppendOnly) },
            }),
            buildCheck({
              id: 'audit_integrity',
              label: 'Audit hash-chain integrity',
              status: auditIntegrity?.ok ? 'green' : 'red',
              required: true,
              target: 'audit/integrity ok=true',
              value: {
                ok: Boolean(auditIntegrity?.ok),
                issues: Number(auditIntegrity?.issues?.length || 0),
                checkedEvents: Number(auditIntegrity?.checkedEvents || 0),
              },
            }),
            buildCheck({
              id: 'secrets_rotation',
              label: 'Secrets rotation freshness',
              status:
                !secretRotationStatus
                  ? 'unknown'
                  : Number(secretRotationStatus?.totals?.staleRequired || 0) > 0
                    ? 'red'
                    : Number(secretRotationStatus?.totals?.pendingRotation || 0) > 0
                      ? 'yellow'
                      : 'green',
              required: true,
              target: 'staleRequired=0',
              value: {
                tracked: Number(secretRotationStatus?.totals?.tracked || 0),
                required: Number(secretRotationStatus?.totals?.required || 0),
                staleRequired: Number(secretRotationStatus?.totals?.staleRequired || 0),
                pendingRotation: Number(secretRotationStatus?.totals?.pendingRotation || 0),
              },
              evidence: !secretRotationStatus ? 'Secret rotation store saknas.' : '',
            }),
          ],
        });

        const categoryB = evaluateCategory({
          id: 'B',
          label: 'Incident & SLA-operativ',
          weight: 25,
          checks: [
            buildCheck({
              id: 'incident_model_available',
              label: 'Incidentmodell tillgänglig',
              status: supportsIncidents ? 'green' : 'red',
              required: true,
              target: 'summarizeIncidents finns',
            }),
            buildCheck({
              id: 'high_critical_incident_link',
              label: 'High/Critical kopplar till incidents',
              status:
                highCriticalOpenCount > 0 && incidentsTotal === 0 ? 'red' : 'green',
              required: true,
              value: {
                highCriticalOpen: highCriticalOpenCount,
                incidentsTotal,
              },
            }),
            buildCheck({
              id: 'open_incidents_owned',
              label: 'Öppna incidents har owner',
              status: unownedOpenIncidents.length === 0 ? 'green' : 'red',
              required: true,
              target: 'unownedOpen=0',
              value: {
                openIncidents: incidentsOpenCount,
                unownedOpen: unownedOpenIncidents.length,
              },
            }),
            buildCheck({
              id: 'sla_breach_control',
              label: 'SLA breach-kontroll',
              status:
                breachedOpenIncidents === 0
                  ? 'green'
                  : breachedOpenIncidents <= 2
                    ? 'yellow'
                    : 'red',
              required: true,
              target: 'breachedOpen nära 0',
              value: { breachedOpen: breachedOpenIncidents },
            }),
            buildCheck({
              id: 'auto_escalation_evidence',
              label: 'Auto-eskalering verifierad',
              status:
                breachedOpenIncidents > 0 && !isRecentWithinDays(latestAutoEscalate?.ts, 30, nowMs)
                  ? 'red'
                  : isRecentWithinDays(latestAutoEscalate?.ts, 30, nowMs)
                    ? 'green'
                    : 'yellow',
              required: false,
              target: 'incidents.auto_escalate senaste 30 dagar',
              value: {
                latestSuccessAt: toIso(latestAutoEscalate?.ts),
              },
            }),
            buildCheck({
              id: 'auto_assignment_evidence',
              label: 'Auto owner-assignment verifierad',
              status:
                unownedOpenIncidents.length > 0 && !isRecentWithinDays(latestAutoAssign?.ts, 30, nowMs)
                  ? 'red'
                  : isRecentWithinDays(latestAutoAssign?.ts, 30, nowMs)
                    ? 'green'
                    : 'yellow',
              required: false,
              target: 'incidents.auto_assign_owner senaste 30 dagar',
              value: {
                latestSuccessAt: toIso(latestAutoAssign?.ts),
              },
            }),
          ],
        });

        const requiredJobsEnabled = REQUIRED_SCHEDULER_JOBS.every(
          (jobId) => schedulerJobMap.get(jobId)?.enabled === true
        );
        const staleSchedulerChecks = schedulerFreshnessChecks.filter((item) => item.status === 'red');
        const warnSchedulerChecks = schedulerFreshnessChecks.filter((item) => item.status === 'yellow');

        const categoryC = evaluateCategory({
          id: 'C',
          label: 'Scheduler & automation',
          weight: 25,
          checks: [
            buildCheck({
              id: 'scheduler_enabled_started',
              label: 'Scheduler enabled + started',
              status: schedulerStatus?.enabled && schedulerStatus?.started ? 'green' : 'red',
              required: true,
              value: {
                enabled: Boolean(schedulerStatus?.enabled),
                started: Boolean(schedulerStatus?.started),
              },
            }),
            buildCheck({
              id: 'scheduler_required_jobs_enabled',
              label: 'Obligatoriska jobb aktiva',
              status: requiredJobsEnabled ? 'green' : 'red',
              required: true,
              target: REQUIRED_SCHEDULER_JOBS.join(', '),
              value: REQUIRED_SCHEDULER_JOBS.map((jobId) => ({
                jobId,
                enabled: Boolean(schedulerJobMap.get(jobId)?.enabled),
              })),
            }),
            buildCheck({
              id: 'scheduler_job_freshness',
              label: 'Job-freshness inom intervall',
              status:
                staleSchedulerChecks.length > 0
                  ? 'red'
                  : warnSchedulerChecks.length > 0
                    ? 'yellow'
                    : 'green',
              required: true,
              target: 'Alla obligatoriska jobb har färsk success-run',
              value: {
                staleJobs: staleSchedulerChecks.map((item) => item.id),
                warnJobs: warnSchedulerChecks.map((item) => item.id),
                checks: schedulerFreshnessChecks,
              },
            }),
            buildCheck({
              id: 'restore_drill_30d',
              label: 'Restore drill verifierad senaste 30 dagar',
              status: restoreDrillGate.healthy30d ? 'green' : 'red',
              required: true,
              target: 'restore_drill_preview success <= 30 dagar',
              value: {
                lastSuccessAt: restoreDrillGate.lastSuccessAt,
                ageDays: restoreDrillGate.ageDays,
                healthy30d: restoreDrillGate.healthy30d,
              },
            }),
            buildCheck({
              id: 'nightly_pilot_report_freshness',
              label: 'Nightly pilot report verifierad inom tidsfönster',
              status:
                !pilotReportGate.healthy
                  ? 'red'
                  : pilotReportGate.ageHours !== null &&
                      pilotReportGate.ageHours > pilotReportGate.maxAgeHours * 0.7
                    ? 'yellow'
                    : 'green',
              required: true,
              target: `nightly_pilot_report success <= ${pilotReportGate.maxAgeHours}h`,
              value: {
                lastSuccessAt: pilotReportGate.lastSuccessAt,
                ageHours: pilotReportGate.ageHours,
                maxAgeHours: pilotReportGate.maxAgeHours,
                latestReport: pilotReportGate.latestReport,
              },
              evidence: pilotReportGate.lastSuccessAt
                ? ''
                : 'Ingen lyckad nightly_pilot_report hittad.',
            }),
          ],
        });

        const categoryD = evaluateCategory({
          id: 'D',
          label: 'Risk precision',
          weight: 20,
          checks: [
            buildCheck({
              id: 'gold_set_coverage',
              label: 'Gold set storlek',
              status:
                riskPrecisionError
                  ? 'red'
                  : riskDatasetCases >= 150
                    ? 'green'
                    : riskDatasetCases >= 120
                      ? 'yellow'
                      : 'red',
              required: true,
              target: '>=150 cases',
              value: {
                cases: riskDatasetCases,
                datasetVersion: normalizeText(riskPrecision?.dataset?.version) || null,
              },
              evidence: riskPrecisionError || '',
            }),
            buildCheck({
              id: 'band_accuracy',
              label: 'Band accuracy',
              status:
                riskPrecisionError
                  ? 'red'
                  : bandAccuracyPercent >= 95
                    ? 'green'
                    : bandAccuracyPercent >= 90
                      ? 'yellow'
                      : 'red',
              required: true,
              target: '>=95%',
              value: {
                bandAccuracyPercent,
              },
            }),
            buildCheck({
              id: 'level_accuracy',
              label: 'Level accuracy',
              status:
                riskPrecisionError
                  ? 'red'
                  : levelAccuracyPercent >= 90
                    ? 'green'
                    : levelAccuracyPercent >= 80
                      ? 'yellow'
                      : 'red',
              required: true,
              target: '>=90%',
              value: {
                levelAccuracyPercent,
              },
            }),
            buildCheck({
              id: 'threshold_versioning',
              label: 'Threshold versionering aktiv',
              status: riskVersion >= 1 && riskHistoryCount >= 1 ? 'green' : 'red',
              required: true,
              target: 'riskThresholdVersion>=1 + history>=1',
              value: {
                riskThresholdVersion: riskVersion,
                historyCount: riskHistoryCount,
              },
            }),
            buildCheck({
              id: 'owner_governed_calibration',
              label: 'Owner-governed calibration',
              status:
                nonOwnerGovernedRiskChanges.length > 0
                  ? 'red'
                  : riskChangeEvents.length > 0
                    ? 'green'
                    : 'yellow',
              required: true,
              target: 'Ingen risk threshold-change utan actorUserId',
              value: {
                changeEvents: riskChangeEvents.length,
                nonOwnerGoverned: nonOwnerGovernedRiskChanges.length,
              },
            }),
            buildCheck({
              id: 'policy_floor_loaded',
              label: 'Policy floor regler laddade',
              status: policyRules.length > 0 ? 'green' : 'red',
              required: true,
              target: '>=1 policy floor regel',
              value: { ruleCount: policyRules.length },
            }),
          ],
        });

        const categories = [categoryA, categoryB, categoryC, categoryD];
        const totalWeight = categories.reduce((sum, item) => sum + Number(item.weight || 0), 0) || 1;
        const weightedScore = categories.reduce(
          (sum, item) => sum + Number(item.score || 0) * Number(item.weight || 0),
          0
        );
        const score = Number((weightedScore / totalWeight).toFixed(2));
        const band = pickReadinessBand(score);
        const blockersAllGreen = categories.every((item) => item.status === 'green');
        const outputGateNoGoTriggered = outputGateViolations.length > 0;
        const policyFloorNoGoTriggered =
          policyRules.length === 0 || policyFloorBypassViolations.length > 0;
        const l5NoGoTriggered = l5WithoutManualIntervention.length > 0;

        const noGoTriggers = [
          {
            id: 'output_without_risk_policy_gate',
            label: 'Output kan lämna systemet utan output risk + policy gate',
            status: outputGateNoGoTriggered ? 'triggered' : 'clear',
            inferred: false,
            evidence: outputGateNoGoTriggered
              ? `Hittade ${outputGateViolations.length} aktiva versioner med saknad output risk/policy gate.`
              : `Kontrollerade ${activeTemplateVersions.length} aktiva versioner utan gate-avvikelser.`,
            value: {
              activeTemplateVersions: activeTemplateVersions.length,
              violations: outputGateViolations.length,
              details: toNoGoDetails(outputGateViolations, 12),
            },
          },
          {
            id: 'policy_floor_bypass',
            label: 'Policy floor kan kringgås',
            status: policyFloorNoGoTriggered ? 'triggered' : 'clear',
            inferred: false,
            evidence:
              policyRules.length === 0
                ? 'Policy floor-regler saknas.'
                : policyFloorBypassViolations.length > 0
                  ? `Hittade ${policyFloorBypassViolations.length} policy floor-avvikelser i aktiva versioner.`
                  : `Policy floor kontrollerad i ${activeTemplateVersions.length} aktiva versioner utan avvikelser.`,
            value: {
              policyRules: policyRules.length,
              activeTemplateVersions: activeTemplateVersions.length,
              violations: policyFloorBypassViolations.length,
              details: toNoGoDetails(policyFloorBypassViolations, 12),
            },
          },
          {
            id: 'l5_without_manual_intervention',
            label: 'L5 kan gå live utan manuell intervention',
            status: l5NoGoTriggered ? 'triggered' : 'clear',
            inferred: false,
            evidence: l5NoGoTriggered
              ? `Hittade ${l5WithoutManualIntervention.length} aktiva L5-versioner utan owner override.`
              : 'Inga aktiva L5-versioner saknar manuell owner intervention.',
            value: {
              activeTemplateVersions: activeTemplateVersions.length,
              violations: l5WithoutManualIntervention.length,
              details: toNoGoDetails(l5WithoutManualIntervention, 12),
            },
          },
          {
            id: 'restore_drill_unverified_30d',
            label: 'Restore-test ej verifierat senaste 30 dagar',
            status: restoreDrillGate.healthy30d ? 'clear' : 'triggered',
            inferred: false,
            evidence: restoreDrillGate.lastSuccessAt
              ? `Senaste restore_drill_preview success: ${restoreDrillGate.lastSuccessAt}`
              : 'Ingen lyckad restore_drill_preview hittad.',
          },
          {
            id: 'nightly_pilot_report_unverified',
            label: 'Nattlig pilotrapport ej verifierad inom tidsfönster',
            status: pilotReportGate.healthy ? 'clear' : 'triggered',
            inferred: false,
            evidence: pilotReportGate.lastSuccessAt
              ? `Senaste nightly_pilot_report success: ${pilotReportGate.lastSuccessAt}`
              : 'Ingen lyckad nightly_pilot_report hittad.',
            value: {
              maxAgeHours: pilotReportGate.maxAgeHours,
              ageHours: pilotReportGate.ageHours,
              latestReport: pilotReportGate.latestReport,
            },
          },
          {
            id: 'audit_chain_not_immutable',
            label: 'Auditkedjan är inte immutable',
            status:
              Boolean(config?.authAuditAppendOnly) && Boolean(auditIntegrity?.ok)
                ? 'clear'
                : 'triggered',
            inferred: false,
            evidence: `appendOnly=${Boolean(config?.authAuditAppendOnly)}, integrityOk=${Boolean(
              auditIntegrity?.ok
            )}`,
          },
          {
            id: 'tenant_isolation_unverified',
            label: 'Tenant-isolation saknar edge-case verifiering',
            status: tenantIsolationVerified ? 'clear' : 'triggered',
            inferred: false,
            evidence: latestTenantAccessCheck?.ts
              ? `Senaste tenants.access_check: ${toIso(latestTenantAccessCheck.ts)}`
              : 'Ingen tenants.access_check verifiering hittad senaste perioden.',
          },
        ];

        const triggeredNoGo = noGoTriggers.filter((item) => item.status === 'triggered');
        const goAllowed =
          band === 'controlled_go' && blockersAllGreen && triggeredNoGo.length === 0;
        const remediation = buildReadinessRemediation({
          categories,
          noGoTriggers,
          score,
          band,
          goAllowed,
        });

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'monitor.readiness.read',
          outcome: 'success',
          targetType: 'monitor_readiness',
          targetId: tenantId,
          metadata: {
            score,
            band,
            goAllowed,
            blockersAllGreen,
            triggeredNoGo: triggeredNoGo.length,
            remediationTotal: Number(remediation?.summary?.total || 0),
            remediationP0: Number(remediation?.summary?.byPriority?.P0 || 0),
          },
        });

        return res.json({
          generatedAt: new Date().toISOString(),
          tenantId,
          phase: 'STABILISERA',
          score,
          band,
          thresholds: {
            noGoBelow: 75,
            limitedBetaMin: 75,
            controlledGoMin: 85,
          },
          goNoGo: {
            allowed: goAllowed,
            blockerCategoriesGreen: blockersAllGreen,
            triggeredNoGoCount: triggeredNoGo.length,
            triggeredNoGoIds: triggeredNoGo.map((item) => item.id),
          },
          categories,
          noGoTriggers,
          remediation,
          evidence: {
            restoreDrill: {
              maxAgeDays: restoreDrillGate.maxAgeDays,
              lastSuccessAt: restoreDrillGate.lastSuccessAt,
              ageDays: restoreDrillGate.ageDays,
              healthy: restoreDrillGate.healthy,
              healthy30d: restoreDrillGate.healthy30d,
            },
            pilotReport: {
              maxAgeHours: pilotReportGate.maxAgeHours,
              lastSuccessAt: pilotReportGate.lastSuccessAt,
              ageHours: pilotReportGate.ageHours,
              healthy: pilotReportGate.healthy,
              healthy24h: pilotReportGate.healthy24h,
              latestReport: pilotReportGate.latestReport,
            },
            incidents: {
              total: incidentsTotal,
              open: incidentsOpenCount,
              breachedOpen: breachedOpenIncidents,
              unownedOpen: unownedOpenIncidents.length,
              highCriticalOpen: highCriticalOpenCount,
            },
            riskPrecision: {
              datasetPath: RISK_GOLD_SET_DEFAULT_PATH,
              datasetCases: riskDatasetCases,
              bandAccuracyPercent,
              levelAccuracyPercent,
              error: riskPrecisionError || null,
            },
            audit: {
              appendOnly: Boolean(config?.authAuditAppendOnly),
              integrityOk: Boolean(auditIntegrity?.ok),
              issues: Number(auditIntegrity?.issues?.length || 0),
              latestTenantAccessCheckAt: toIso(latestTenantAccessCheck?.ts),
            },
            releaseGuards: {
              activeTemplateVersions: activeTemplateVersions.length,
              outputRiskPolicyGate: {
                violations: outputGateViolations.length,
                details: toNoGoDetails(outputGateViolations, 12),
              },
              policyFloorBypass: {
                policyRules: policyRules.length,
                violations: policyFloorBypassViolations.length,
                details: toNoGoDetails(policyFloorBypassViolations, 12),
              },
              l5ManualIntervention: {
                violations: l5WithoutManualIntervention.length,
                details: toNoGoDetails(l5WithoutManualIntervention, 12),
              },
            },
          },
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte beräkna readiness.' });
      }
    }
  );

  return router;
}

module.exports = {
  createMonitorRouter,
};
