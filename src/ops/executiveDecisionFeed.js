'use strict';

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

function createExecutiveDecisionFeed({ maxEntries = 200 } = {}) {
  const entries = [];

  function add(entry) {
    const normalized = createDecisionFeedEntry(entry);
    entries.unshift(normalized);
    if (entries.length > maxEntries) entries.length = maxEntries;
    return normalized;
  }

  function addFromAgentOutput({ agent, output, tenantId } = {}) {
    const data = output?.data || output || {};
    const items = [];

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
          actionType: 'review_templates',
          context: { tenantId, violations, nonCompliant },
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
      const campaigns = asArray(data.campaigns);
      const ready = campaigns.filter((c) => c.readiness === 'ready');
      if (ready.length > 0) {
        items.push(add({
          agent: 'CMO',
          severity: 'info',
          recommendation: `${ready.length} kampanjer redo att lansera — godkänn före publicering.`,
          rationale: normalizeText(data.executiveSummary).slice(0, 300),
          requiredOwnerAction: true,
          actionType: 'approve_campaigns',
          context: { tenantId, readyCount: ready.length },
        }));
      }
    }

    return items;
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
    list,
    resolve,
    getSummary,
  };
}

module.exports = {
  createExecutiveDecisionFeed,
  createDecisionFeedEntry,
};
