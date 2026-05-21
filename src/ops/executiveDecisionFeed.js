'use strict';

const {
  loadExecutiveFeedEntries,
  saveExecutiveFeedEntries,
} = require('./executiveDecisionFeedStore');

/**
 * Executive Decision Feed — unified format for all agent recommendations.
 *
 * Varje agent skickar rekommendationer i samma struktur:
 * { agent, severity, recommendation, rationale, requiredOwnerAction, auditRef, expiresAt }
 *
 * Feed:n aggregeras och sorteras per severity+tid.
 * OWNER ser "vad kräver mänskligt beslut just nu?" på 60 sekunder.
 */

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

const SEVERITY_ORDER = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3, info: 4 });

function normalizeSeverity(value) {
  const safe = normalizeText(value).toLowerCase();
  return safe in SEVERITY_ORDER ? safe : 'info';
}

function createDecisionFeedEntry({
  agent = '',
  severity = 'info',
  recommendation = '',
  rationale = '',
  requiredOwnerAction = false,
  actionType = 'review',
  actionEndpoint = null,
  context = {},
  auditRef = null,
  expiresAt = null,
} = {}) {
  const now = new Date();
  const defaultExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  return {
    id: `df_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    agent: normalizeText(agent),
    severity: normalizeSeverity(severity),
    recommendation: normalizeText(recommendation),
    rationale: normalizeText(rationale),
    requiredOwnerAction: requiredOwnerAction === true,
    actionType: normalizeText(actionType) || 'review',
    actionEndpoint: normalizeText(actionEndpoint) || null,
    context: context && typeof context === 'object' ? context : {},
    auditRef: normalizeText(auditRef) || null,
    createdAt: now.toISOString(),
    expiresAt: normalizeText(expiresAt) || defaultExpiry,
    status: 'pending',
    resolvedAt: null,
    resolvedBy: null,
  };
}

function createExecutiveDecisionFeed({
  maxEntries = 200,
  initialEntries = null,
  persistPath = null,
  logger = console,
} = {}) {
  const entries = Array.isArray(initialEntries) ? [...initialEntries] : [];

  function schedulePersist() {
    if (!persistPath) return;
    saveExecutiveFeedEntries(persistPath, entries).catch((error) => {
      logger?.error?.('[executive-feed] persist failed', error?.message || error);
    });
  }

  function add(entry) {
    const normalized = createDecisionFeedEntry(entry);
    entries.unshift(normalized);
    if (entries.length > maxEntries) entries.length = maxEntries;
    schedulePersist();
    return normalized;
  }

  function addFromAgentOutput({ agent, output, tenantId, marketingDraftIds = [] } = {}) {
    const data = output?.data || output || {};
    const items = [];
    const syncedDraftIds = asArray(marketingDraftIds)
      .map((id) => normalizeText(id))
      .filter(Boolean);

    if (agent === 'COO') {
      const priority = normalizeText(data.priorityLevel).toLowerCase();
      const tasks = asArray(data.taskPlan?.tasks);
      if (priority === 'high' || tasks.some((t) => t.priority === 'P0')) {
        items.push(add({
          agent: 'COO',
          severity: priority === 'high' ? 'high' : 'medium',
          recommendation: tasks[0]?.title || 'Granska daglig driftöversikt.',
          rationale: normalizeText(data.executiveSummary).slice(0, 300),
          requiredOwnerAction: priority === 'high',
          actionType: 'review_daily_brief',
          context: { tenantId, priorityLevel: priority, taskCount: tasks.length },
        }));
      }
    }

    if (agent === 'CAO') {
      const violations = toNumber(data.disclaimerResults?.violationCount, 0);
      const nonCompliant = toNumber(data.disclaimerResults?.totalCount, 0) - toNumber(data.disclaimerResults?.compliantCount, 0);
      if (violations > 0 || nonCompliant > 0) {
        items.push(add({
          agent: 'CAO',
          severity: violations > 0 ? 'high' : 'medium',
          recommendation: violations > 0
            ? `${violations} regelbrott identifierade i mallar — granska omedelbart.`
            : `${nonCompliant} mallar saknar disclaimers.`,
          rationale: normalizeText(data.executiveSummary).slice(0, 300),
          requiredOwnerAction: violations > 0,
          actionType: 'fix_template',
          context: { tenantId, violations, nonCompliant },
        }));
      }
      const gatePassed = data.adminQualityGate?.gatePassed === true;
      const flaggedTasks = toNumber(data.adminQualityGate?.flaggedTasks?.length, 0);
      if (!gatePassed && flaggedTasks > 0) {
        items.push(add({
          agent: 'CAO',
          severity: toNumber(data.adminQualityGate?.overdue, 0) > 0 ? 'high' : 'medium',
          recommendation: `${flaggedTasks} adminuppgift(er) klarar inte quality gate — tilldela ägare och nästa steg.`,
          rationale: normalizeText(data.adminQualityGate?.summary || data.executiveSummary).slice(0, 300),
          requiredOwnerAction: true,
          actionType: 'assign_owner',
          context: { tenantId, flaggedTasks },
        }));
      }
      const healthScore = toNumber(data.templateLibraryHealth?.healthScore, 100);
      const libraryFlags = toNumber(data.templateLibraryHealth?.flags?.length, 0);
      if (healthScore < 70 || libraryFlags > 0) {
        items.push(add({
          agent: 'CAO',
          severity: healthScore < 50 ? 'high' : 'medium',
          recommendation:
            libraryFlags > 0
              ? `${libraryFlags} mallflaggor i biblioteket — uppdatera eller aktivera versioner.`
              : `Mallbibliotekshälsa ${healthScore}/100 — planera underhåll.`,
          rationale: normalizeText(data.templateLibraryHealth?.summary || data.executiveSummary).slice(
            0,
            300
          ),
          requiredOwnerAction: healthScore < 50,
          actionType: 'review_template_library',
          context: { tenantId, healthScore, libraryFlags },
        }));
      }
      const goNoGoBrief = data.goNoGoBrief || {};
      if (
        goNoGoBrief.goRecommendation === 'no_go_pending_owner' ||
        goNoGoBrief.ownerDecisionRequired === true
      ) {
        items.push(add({
          agent: 'CAO',
          severity: goNoGoBrief.goRecommendation === 'no_go_pending_owner' ? 'high' : 'medium',
          recommendation:
            normalizeText(goNoGoBrief.summary) ||
            'Granska CAO Go/No-Go brief och bekräfta mot monitor readiness.',
          rationale: normalizeText(goNoGoBrief.disclaimer).slice(0, 300),
          requiredOwnerAction: true,
          actionType: 'review_go_nogo',
          context: {
            tenantId,
            score: goNoGoBrief.score,
            band: goNoGoBrief.band,
            goRecommendation: goNoGoBrief.goRecommendation,
          },
        }));
      }
    }

    if (agent === 'CFO') {
      const alerts = asArray(data.alerts);
      for (const alert of alerts.slice(0, 2)) {
        items.push(add({
          agent: 'CFO',
          severity: normalizeText(alert.severity) === 'high' ? 'high' : 'medium',
          recommendation: normalizeText(alert.message),
          rationale: normalizeText(data.executiveSummary).slice(0, 300),
          requiredOwnerAction: normalizeText(alert.severity) === 'high',
          actionType: 'review_costs',
          context: { tenantId },
        }));
      }
    }

    if (agent === 'CMO') {
      const isAnalytics = normalizeText(data.mode).toLowerCase() === 'analytics' ||
        normalizeText(data.outputType).toLowerCase() === 'marketinganalytics';

      const underperformingAds = asArray(data.underperformingAds).length
        ? asArray(data.underperformingAds)
        : asArray(asObject(data.performanceSummary).underperformingAds);
      if (underperformingAds.length > 0) {
        items.push(add({
          agent: 'CMO',
          severity: 'medium',
          recommendation: `${underperformingAds.length} annonskanal(er) underpresterar — överväg paus (OWNER).`,
          rationale: underperformingAds
            .slice(0, 3)
            .map((item) => `${item.channel}: CTR ${item.ctr}, CPC ${item.cpc}`)
            .join('; '),
          requiredOwnerAction: true,
          actionType: 'pause_underperforming_ads',
          context: {
            tenantId,
            channels: underperformingAds.map((item) => normalizeText(item.channel)).filter(Boolean),
          },
        }));
      }

      if (isAnalytics) {
        return items;
      }

      const orchestrationGates = asObject(data.orchestrationGates);
      if (data.pauseAllExternalCampaigns === true || orchestrationGates.incidentPause?.required) {
        items.push(add({
          agent: 'CMO',
          severity: 'critical',
          recommendation:
            normalizeText(orchestrationGates.incidentPause?.recommendation) ||
            'Pausa alla externa kampanjer — P0/P1-incident aktiv.',
          rationale:
            normalizeText(orchestrationGates.incidentPause?.reason) ||
            normalizeText(data.executiveSummary).slice(0, 300),
          requiredOwnerAction: true,
          actionType: 'pause_all_external_campaigns',
          context: {
            tenantId,
            p0Open: Number(orchestrationGates.incidentPause?.p0Open || 0),
            p1Open: Number(orchestrationGates.incidentPause?.p1Open || 0),
          },
        }));
      }

      if (orchestrationGates.budgetGate?.requiresOwnerApproval === true) {
        items.push(add({
          agent: 'CFO',
          severity: 'high',
          recommendation:
            normalizeText(orchestrationGates.budgetGate?.reason) ||
            'Marknadsspend över budgettak — kräver OWNER-godkännande.',
          rationale: normalizeText(data.executiveSummary).slice(0, 300),
          requiredOwnerAction: true,
          actionType: 'approve_marketing_budget',
          context: {
            tenantId,
            cap: orchestrationGates.budgetGate?.cap,
            proposed: orchestrationGates.budgetGate?.proposed,
          },
        }));
      }

      if (orchestrationGates.launchGate?.blocked === true) {
        items.push(add({
          agent: 'CAO',
          severity: 'high',
          recommendation:
            normalizeText(orchestrationGates.launchGate?.reason) ||
            'Launch gate blockerad — operational readiness under tröskel.',
          rationale: normalizeText(data.executiveSummary).slice(0, 300),
          requiredOwnerAction: true,
          actionType: 'review_go_nogo',
          context: {
            tenantId,
            score: orchestrationGates.launchGate?.score,
            band: orchestrationGates.launchGate?.band,
          },
        }));
      }

      const campaigns = asArray(data.campaigns);
      const ready = campaigns.filter(
        (c) => c.readiness === 'ready' || c.readiness === 'needs_compliance_owner'
      );
      const draftIds =
        syncedDraftIds.length > 0
          ? syncedDraftIds
          : ready.map((c) => normalizeText(c.id)).filter(Boolean);
      if (ready.length > 0 || draftIds.length > 0) {
        items.push(add({
          agent: 'CMO',
          severity: 'info',
          recommendation: `${Math.max(ready.length, draftIds.length)} kampanjer redo att lansera — godkänn före publicering.`,
          rationale: normalizeText(data.executiveSummary).slice(0, 300),
          requiredOwnerAction: true,
          actionType: 'approve_campaigns',
          actionEndpoint: '/api/v1/marketing/campaigns',
          context: { tenantId, readyCount: ready.length, draftIds },
        }));
      }

      const productionCounts = asObject(data.productionCounts);
      const socialCount = Number(productionCounts.socialPosts || 0);
      if (socialCount >= 5) {
        items.push(add({
          agent: 'CMO',
          severity: 'info',
          recommendation: `${socialCount} sociala utkast redo — granska och godkänn batch före publicering.`,
          rationale: normalizeText(data.disclaimer).slice(0, 200),
          requiredOwnerAction: true,
          actionType: 'approve_social_batch',
          context: { tenantId, socialCount },
        }));
      }

      const flaggedClaims = asArray(data.flaggedClaims);
      if (flaggedClaims.length > 0) {
        items.push(add({
          agent: 'CMO',
          severity: 'warn',
          recommendation: `${flaggedClaims.length} claims flaggade — granska innan publicering.`,
          rationale: flaggedClaims
            .slice(0, 3)
            .map((item) => normalizeText(item?.label || item?.id))
            .filter(Boolean)
            .join('; '),
          requiredOwnerAction: true,
          actionType: 'review_claims',
          context: { tenantId, count: flaggedClaims.length },
        }));
      }

      const missedPublications = asArray(data.missedPublications);
      if (missedPublications.length > 0) {
        items.push(add({
          agent: 'CMO',
          severity: 'medium',
          recommendation: `${missedPublications.length} planerade publiceringar har passerat datum — granska kalendern.`,
          rationale: missedPublications
            .slice(0, 3)
            .map((item) => normalizeText(item.topic || item.targetDate))
            .filter(Boolean)
            .join('; '),
          requiredOwnerAction: true,
          actionType: 'review_missed_publications',
          context: { tenantId, count: missedPublications.length },
        }));
      }

      const scheduleItems = asArray(data.scheduleItems);
      if (scheduleItems.length >= 5 && data.scheduleAllowed === true) {
        items.push(add({
          agent: 'CMO',
          severity: 'info',
          recommendation: `${scheduleItems.length} publiceringsförslag redo — granska schema före go-live.`,
          rationale: normalizeText(data.executiveSummary).slice(0, 300),
          requiredOwnerAction: true,
          actionType: 'review_publish_schedule',
          context: { tenantId, scheduleCount: scheduleItems.length },
        }));
      }
    }

    return items;
  }

  function addFromSchedulerNotification({
    eventType = '',
    payload = {},
    tenantId = '',
    severity = 'warn',
    riskLevel = '',
  } = {}) {
    const normalizedEvent = normalizeText(eventType);
    const map = {
      'cao.quality_gate_failed': {
        agent: 'CAO',
        actionType: 'assign_owner',
        recommendation: normalizeText(payload.summary) || 'CAO quality gate misslyckades — tilldela ägare och nästa steg.',
        requiredOwnerAction: true,
      },
      'cao.sla_risk': {
        agent: 'CAO',
        actionType: 'escalate_sla',
        recommendation:
          normalizeText(payload.summary) ||
          `SLA-risk: ${Number(payload.criticalOpen || 0)} kritiska, ${Number(payload.unownedCount || 0)} utan ägare.`,
        requiredOwnerAction: Number(payload.criticalOpen || 0) > 0,
      },
      'cao.missing_dod': {
        agent: 'CAO',
        actionType: 'assign_owner',
        recommendation:
          normalizeText(payload.summary) ||
          `Saknad DoD/owner: ${Number(payload.missingOwner || 0)} owner, ${Number(payload.missingDod || 0)} DoD.`,
        requiredOwnerAction: Number(payload.overdue || 0) > 0 || Number(payload.missingOwner || 0) > 0,
      },
      'cmo.weekly_content_plan': {
        agent: 'CMO',
        actionType: 'review_publish_schedule',
        recommendation:
          normalizeText(payload.summary) ||
          'Veckans content-plan är redo — granska kalender och publiceringsschema.',
        requiredOwnerAction: true,
      },
      'cmo.missed_publication': {
        agent: 'CMO',
        actionType: 'review_missed_publications',
        recommendation:
          normalizeText(payload.summary) ||
          `${Number(payload.missedPublications || 0)} missade publiceringar behöver OWNER-granskning.`,
        requiredOwnerAction: Number(payload.missedPublications || 0) > 0,
      },
    };
    const preset = map[normalizedEvent];
    if (!preset) return null;
    const normalizedSeverity =
      severity === 'high' || riskLevelRank(riskLevel) >= 4
        ? 'high'
        : normalizeSeverity(severity);
    return add({
      ...preset,
      severity: normalizedSeverity,
      rationale: `Scheduler event ${normalizedEvent}`,
      context: { tenantId, eventType: normalizedEvent, riskLevel, payload },
      auditRef: `scheduler:${normalizedEvent}`,
    });
  }

  function riskLevelRank(level) {
    const normalized = normalizeText(level).toUpperCase();
    const map = { L1: 1, L2: 2, L3: 3, L4: 4, L5: 5 };
    return map[normalized] || 0;
  }

  function list({ severity, requiredOwnerAction, status = 'pending', limit = 50 } = {}) {
    const now = Date.now();
    return entries
      .filter((e) => {
        if (status && e.status !== status) return false;
        if (severity && e.severity !== normalizeSeverity(severity)) return false;
        if (requiredOwnerAction === true && !e.requiredOwnerAction) return false;
        if (e.expiresAt && new Date(e.expiresAt).getTime() < now) return false;
        return true;
      })
      .sort((a, b) => {
        const bySeverity = (SEVERITY_ORDER[a.severity] || 4) - (SEVERITY_ORDER[b.severity] || 4);
        if (bySeverity !== 0) return bySeverity;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .slice(0, Math.max(1, Math.min(200, limit)));
  }

  function resolve({ entryId, resolvedBy, resolution = 'acknowledged' } = {}) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return null;
    entry.status = normalizeText(resolution) || 'acknowledged';
    entry.resolvedAt = new Date().toISOString();
    entry.resolvedBy = normalizeText(resolvedBy) || 'owner';
    schedulePersist();
    return entry;
  }

  function getSummary() {
    const now = Date.now();
    const active = entries.filter((e) =>
      e.status === 'pending' && (!e.expiresAt || new Date(e.expiresAt).getTime() >= now)
    );
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    const byAgent = {};
    let ownerActionRequired = 0;

    for (const e of active) {
      bySeverity[e.severity] = (bySeverity[e.severity] || 0) + 1;
      byAgent[e.agent] = (byAgent[e.agent] || 0) + 1;
      if (e.requiredOwnerAction) ownerActionRequired += 1;
    }

    return {
      totalActive: active.length,
      ownerActionRequired,
      bySeverity,
      byAgent,
      oldestPending: active[active.length - 1]?.createdAt || null,
      newestPending: active[0]?.createdAt || null,
    };
  }

  return {
    add,
    addFromAgentOutput,
    addFromSchedulerNotification,
    list,
    resolve,
    getSummary,
    persistPath: persistPath || null,
  };
}

async function createPersistentExecutiveDecisionFeed({
  filePath,
  maxEntries = 200,
  logger = console,
} = {}) {
  const persistPath = normalizeText(filePath);
  const initialEntries = persistPath ? await loadExecutiveFeedEntries(persistPath) : [];
  return createExecutiveDecisionFeed({
    maxEntries,
    initialEntries,
    persistPath: persistPath || null,
    logger,
  });
}

module.exports = {
  createExecutiveDecisionFeed,
  createPersistentExecutiveDecisionFeed,
  createDecisionFeedEntry,
};
