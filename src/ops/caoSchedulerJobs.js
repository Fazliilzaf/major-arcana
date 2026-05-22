'use strict';

const { riskLevelRank } = require('./readinessEvaluator');
const { hydrateCaoSystemSnapshot } = require('../routes/capabilities');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function shouldNotifyOwner({ riskLevel = '', minRiskLevel = 'L4' } = {}) {
  return riskLevelRank(riskLevel) >= riskLevelRank(minRiskLevel);
}

async function appendSchedulerAnalysis({
  capabilityAnalysisStore,
  tenantId,
  capabilityName,
  outputData,
  metadata = {},
}) {
  if (!capabilityAnalysisStore || typeof capabilityAnalysisStore.append !== 'function') {
    return null;
  }
  return capabilityAnalysisStore.append({
    tenantId,
    capability: { name: capabilityName, version: '1.0.0', persistStrategy: 'analysis' },
    decision: 'allow',
    runId: metadata.runId || null,
    capabilityRunId: metadata.capabilityRunId || null,
    correlationId: metadata.correlationId || null,
    actor: { id: 'scheduler', role: 'OWNER' },
    input: metadata.input || {},
    output: outputData,
    riskSummary: {},
    policySummary: { blocked: false, reasonCodes: [] },
    metadata: { ...metadata, source: 'scheduler.cao' },
  });
}

async function notifyOwnerIfNeeded({
  sendAlertNotification,
  executiveDecisionFeed = null,
  tenantId,
  actorUserId = null,
  eventType,
  severity = 'warn',
  payload = {},
  riskLevel = '',
  minRiskLevel = 'L4',
}) {
  let feedEntry = null;
  if (
    executiveDecisionFeed &&
    typeof executiveDecisionFeed.addFromSchedulerNotification === 'function'
  ) {
    feedEntry = executiveDecisionFeed.addFromSchedulerNotification({
      eventType,
      payload,
      tenantId,
      severity,
      riskLevel,
    });
  }

  if (typeof sendAlertNotification !== 'function') {
    return {
      ok: false,
      skipped: true,
      reason: 'notifier_unavailable',
      feedEntryId: feedEntry?.id || null,
    };
  }
  if (!shouldNotifyOwner({ riskLevel, minRiskLevel }) && severity !== 'high') {
    return {
      ok: true,
      skipped: true,
      reason: 'below_notify_threshold',
      feedEntryId: feedEntry?.id || null,
    };
  }
  const alertResult = await sendAlertNotification({
    tenantId,
    actorUserId,
    eventType,
    severity,
    payload,
  });
  return {
    ...alertResult,
    feedEntryId: feedEntry?.id || null,
  };
}

async function buildSchedulerCaoSnapshot({
  tenantId,
  templateStore,
  adminTasksStore,
  authStore,
  tenantConfigStore,
  scheduler,
  config,
}) {
  return hydrateCaoSystemSnapshot({
    tenantId,
    templateStore,
    adminTasksStore,
    authStore,
    tenantConfigStore,
    scheduler,
    config,
    systemStateSnapshot: {},
  });
}

async function runCaoDailyQualityGate({
  tenantId,
  trigger = 'scheduled',
  actorUserId = null,
  capabilityExecutor = null,
  capabilityAnalysisStore = null,
  sendAlertNotification = null,
  executiveDecisionFeed = null,
  minNotifyRiskLevel = 'L4',
  templateStore = null,
  adminTasksStore = null,
  authStore = null,
  tenantConfigStore = null,
  scheduler = null,
  config = null,
}) {
  if (!capabilityExecutor || typeof capabilityExecutor.runAgent !== 'function') {
    throw new Error('capabilityExecutor.runAgent saknas för cao_daily_quality_gate.');
  }

  const systemStateSnapshot = await buildSchedulerCaoSnapshot({
    tenantId,
    templateStore,
    adminTasksStore,
    authStore,
    tenantConfigStore,
    scheduler,
    config,
  });

  const result = await capabilityExecutor.runAgent({
    tenantId,
    actor: { id: actorUserId || 'scheduler', role: 'OWNER' },
    channel: 'admin',
    agentName: 'CAO',
    input: { maxSuggestions: 3, strictDisclaimers: false },
    systemStateSnapshot,
    correlationId: `scheduler-cao-gate-${Date.now()}`,
    idempotencyKey: null,
    requestMetadata: { source: 'scheduler.cao_daily_quality_gate', trigger },
  });

  const gate = result?.output?.data?.adminQualityGate || {};
  const gatePassed = gate.gatePassed === true;
  const flaggedCount = Array.isArray(gate.flaggedTasks) ? gate.flaggedTasks.length : 0;
  const riskLevel = gate.overdue > 0 ? 'L4' : flaggedCount > 0 ? 'L3' : 'L1';

  const outputData = {
    gatePassed,
    summary: normalizeText(gate.summary) || normalizeText(result?.output?.data?.executiveSummary),
    flaggedTasks: flaggedCount,
    generatedAt: new Date().toISOString(),
    trigger,
  };

  await appendSchedulerAnalysis({
    capabilityAnalysisStore,
    tenantId,
    capabilityName: 'CAO.SchedulerQualityGate',
    outputData,
    metadata: { trigger, gatePassed },
  });

  let notification = { skipped: true };
  if (!gatePassed) {
    notification = await notifyOwnerIfNeeded({
      sendAlertNotification,
      executiveDecisionFeed,
      tenantId,
      actorUserId,
      eventType: 'cao.quality_gate_failed',
      severity: 'high',
      riskLevel,
      minRiskLevel: minNotifyRiskLevel,
      payload: outputData,
    });
  }

  return { tenantId, trigger, ...outputData, notification };
}

async function runCaoSlaRiskScan({
  tenantId,
  trigger = 'scheduled',
  actorUserId = null,
  capabilityExecutor = null,
  capabilityAnalysisStore = null,
  sendAlertNotification = null,
  executiveDecisionFeed = null,
  minNotifyRiskLevel = 'L4',
  templateStore = null,
  adminTasksStore = null,
  authStore = null,
  tenantConfigStore = null,
  scheduler = null,
  config = null,
}) {
  if (!capabilityExecutor || typeof capabilityExecutor.runCapability !== 'function') {
    throw new Error('capabilityExecutor.runCapability saknas för cao_sla_risk_scan.');
  }

  const systemStateSnapshot = await buildSchedulerCaoSnapshot({
    tenantId,
    templateStore,
    adminTasksStore,
    authStore,
    tenantConfigStore,
    scheduler,
    config,
  });

  const [summaryRun, unownedRun] = await Promise.all([
    capabilityExecutor.runCapability({
      tenantId,
      actor: { id: actorUserId || 'scheduler', role: 'OWNER' },
      channel: 'admin',
      capabilityName: 'SummarizeIncidentAdmin',
      input: {},
      systemStateSnapshot,
      correlationId: `scheduler-cao-sla-${Date.now()}`,
      requestMetadata: { source: 'scheduler.cao_sla_risk_scan', trigger },
    }),
    capabilityExecutor.runCapability({
      tenantId,
      actor: { id: actorUserId || 'scheduler', role: 'OWNER' },
      channel: 'admin',
      capabilityName: 'FlagUnownedIncidents',
      input: {},
      systemStateSnapshot,
      correlationId: `scheduler-cao-unowned-${Date.now()}`,
      requestMetadata: { source: 'scheduler.cao_sla_risk_scan', trigger },
    }),
  ]);

  const summary = summaryRun?.output?.data || {};
  const unowned = unownedRun?.output?.data || {};
  const criticalOpen = Number(summary.criticalOpen || 0);
  const unownedCount = Number(unowned.unownedCount || 0);
  const riskLevel = criticalOpen > 0 || unownedCount >= 3 ? 'L4' : unownedCount > 0 ? 'L3' : 'L1';

  const outputData = {
    openCount: Number(summary.openCount || 0),
    criticalOpen,
    unownedCount,
    summary: normalizeText(summary.summary) || normalizeText(unowned.summary),
    generatedAt: new Date().toISOString(),
    trigger,
  };

  await appendSchedulerAnalysis({
    capabilityAnalysisStore,
    tenantId,
    capabilityName: 'CAO.SchedulerSlaScan',
    outputData,
    metadata: { trigger },
  });

  const notification = await notifyOwnerIfNeeded({
    sendAlertNotification,
    executiveDecisionFeed,
    tenantId,
    actorUserId,
    eventType: 'cao.sla_risk',
    severity: criticalOpen > 0 ? 'high' : 'warn',
    riskLevel,
    minRiskLevel: minNotifyRiskLevel,
    payload: outputData,
  });

  return { tenantId, trigger, ...outputData, notification };
}

async function runCaoMissingDodScan({
  tenantId,
  trigger = 'scheduled',
  actorUserId = null,
  capabilityExecutor = null,
  capabilityAnalysisStore = null,
  sendAlertNotification = null,
  executiveDecisionFeed = null,
  minNotifyRiskLevel = 'L4',
  templateStore = null,
  adminTasksStore = null,
  authStore = null,
  tenantConfigStore = null,
  scheduler = null,
  config = null,
}) {
  if (!capabilityExecutor || typeof capabilityExecutor.runCapability !== 'function') {
    throw new Error('capabilityExecutor.runCapability saknas för cao_missing_dod_scan.');
  }

  const systemStateSnapshot = await buildSchedulerCaoSnapshot({
    tenantId,
    templateStore,
    adminTasksStore,
    authStore,
    tenantConfigStore,
    scheduler,
    config,
  });

  const gateRun = await capabilityExecutor.runCapability({
    tenantId,
    actor: { id: actorUserId || 'scheduler', role: 'OWNER' },
    channel: 'admin',
    capabilityName: 'AssessAdminQualityGate',
    input: { includeCompleted: false },
    systemStateSnapshot,
    correlationId: `scheduler-cao-dod-${Date.now()}`,
    requestMetadata: { source: 'scheduler.cao_missing_dod_scan', trigger },
  });

  const gate = gateRun?.output?.data || {};
  const missingOwner = Number(gate.missingOwner || 0);
  const missingDod = Number(gate.missingDod || 0);
  const overdue = Number(gate.overdue || 0);
  const riskLevel = overdue > 0 ? 'L4' : missingOwner + missingDod > 3 ? 'L3' : 'L2';

  const outputData = {
    gatePassed: gate.gatePassed === true,
    missingOwner,
    missingDod,
    missingNextStep: Number(gate.missingNextStep || 0),
    overdue,
    summary: normalizeText(gate.summary),
    generatedAt: new Date().toISOString(),
    trigger,
  };

  await appendSchedulerAnalysis({
    capabilityAnalysisStore,
    tenantId,
    capabilityName: 'CAO.SchedulerDodScan',
    outputData,
    metadata: { trigger },
  });

  let notification = { skipped: true };
  if (!outputData.gatePassed || overdue > 0) {
    notification = await notifyOwnerIfNeeded({
      sendAlertNotification,
      executiveDecisionFeed,
      tenantId,
      actorUserId,
      eventType: 'cao.missing_dod',
      severity: overdue > 0 ? 'high' : 'warn',
      riskLevel,
      minRiskLevel: minNotifyRiskLevel,
      payload: outputData,
    });
  }

  return { tenantId, trigger, ...outputData, notification };
}

module.exports = {
  runCaoDailyQualityGate,
  runCaoSlaRiskScan,
  runCaoMissingDodScan,
  notifyOwnerIfNeeded,
};
