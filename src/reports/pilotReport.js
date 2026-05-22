function parsePilotReportDays(value, fallback = 14) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(90, parsed));
}

function parseIso(value) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function isSince(value, sinceDate) {
  const parsed = parseIso(value);
  if (!parsed) return false;
  return parsed >= sinceDate;
}

function countBy(items, getKey) {
  const result = {};
  for (const item of items) {
    const key = String(getKey(item) || 'unknown');
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function requiresOwnerAction(evaluation) {
  const decision = String(evaluation?.decision || 'allow').toLowerCase();
  return decision === 'review_required' || decision === 'blocked';
}

async function buildPilotReport({
  templateStore,
  authStore,
  tenantId,
  days = 14,
  evaluationLimit = 500,
  auditLimit = 500,
  generatedAt = new Date(),
}) {
  const safeDays = parsePilotReportDays(days, 14);
  const generatedAtDate =
    generatedAt instanceof Date ? generatedAt : new Date(generatedAt || Date.now());
  const generatedAtIso = generatedAtDate.toISOString();
  const sinceDate = new Date(generatedAtDate.getTime() - safeDays * 24 * 60 * 60 * 1000);

  const [templatesRaw, evaluationsRaw, riskSummaryRaw, membersRaw, auditEventsRaw] =
    await Promise.all([
      templateStore.listTemplates({ tenantId, includeVersions: true }),
      templateStore.listEvaluations({
        tenantId,
        minRiskLevel: 1,
        limit: evaluationLimit,
      }),
      templateStore.summarizeRisk({ tenantId, minRiskLevel: 1 }),
      authStore.listTenantMembers(tenantId),
      authStore.listAuditEvents({ tenantId, limit: auditLimit }),
    ]);

  const templates = asArray(templatesRaw);
  const evaluations = asArray(evaluationsRaw);
  const members = asArray(membersRaw);
  const auditEvents = asArray(auditEventsRaw);
  const riskSummary = riskSummaryRaw && typeof riskSummaryRaw === 'object' ? riskSummaryRaw : {};

  const windowEvaluations = evaluations.filter((item) => isSince(item.evaluatedAt, sinceDate));
  const windowAuditEvents = auditEvents.filter((item) => isSince(item.ts, sinceDate));

  let draftsCount = 0;
  let archivedCount = 0;
  for (const template of templates) {
    for (const version of Array.isArray(template.versions) ? template.versions : []) {
      if (version.state === 'draft') draftsCount += 1;
      if (version.state === 'archived') archivedCount += 1;
    }
  }

  const highCriticalWindow = windowEvaluations.filter((item) => Number(item.riskLevel || 0) >= 4);
  const ownerActionRequiredWindow = windowEvaluations.filter(requiresOwnerAction);
  const ownerPendingWindow = ownerActionRequiredWindow.filter(
    (item) => String(item.ownerDecision || 'pending') === 'pending'
  );

  const staffActive = members.filter(
    (item) => item?.membership?.role === 'STAFF' && item?.membership?.status === 'active'
  ).length;
  const staffDisabled = members.filter(
    (item) => item?.membership?.role === 'STAFF' && item?.membership?.status === 'disabled'
  ).length;

  const ownerActionResolved = Math.max(0, ownerActionRequiredWindow.length - ownerPendingWindow.length);
  const ownerActionCoveragePct =
    ownerActionRequiredWindow.length > 0
      ? Number(((ownerActionResolved / ownerActionRequiredWindow.length) * 100).toFixed(2))
      : 100;

  const activationEvents = windowAuditEvents.filter(
    (item) => item.action === 'templates.activate_version'
  ).length;

  return {
    tenantId,
    windowDays: safeDays,
    since: sinceDate.toISOString(),
    generatedAt: generatedAtIso,
    kpis: {
      templatesTotal: templates.length,
      templatesWithActiveVersion: templates.filter((item) => item.currentActiveVersionId).length,
      draftsCount,
      archivedCount,
      evaluationsTotal: windowEvaluations.length,
      highCriticalTotal: highCriticalWindow.length,
      ownerDecisionPending: ownerPendingWindow.length,
      ownerActionRequired: ownerActionRequiredWindow.length,
      ownerActionResolved,
      staffActive,
      staffDisabled,
      auditEventsCount: windowAuditEvents.length,
      activationEvents,
    },
    risk: {
      byLevel: countBy(windowEvaluations, (item) => item.riskLevel),
      byDecision: countBy(windowEvaluations, (item) => item.decision),
      byOwnerDecision: countBy(ownerActionRequiredWindow, (item) => item.ownerDecision || 'pending'),
      highCriticalOpen: riskSummary?.highCriticalOpen || [],
    },
    quality: {
      ownerActionCoveragePct,
      policyAdjustedCount: windowEvaluations.filter(
        (item) => Array.isArray(item.policyAdjustments) && item.policyAdjustments.length > 0
      ).length,
    },
    operational: {
      recentAuditEvents: windowAuditEvents.slice(0, 50),
    },
  };
}

module.exports = {
  parsePilotReportDays,
  buildPilotReport,
  requiresOwnerAction,
};
