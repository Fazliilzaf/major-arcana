'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isOpenIncident(incident = {}) {
  const status = normalizeText(incident.status).toLowerCase();
  return status !== 'closed' && status !== 'resolved';
}

function incidentOwnerId(incident = {}) {
  return normalizeText(incident?.owner?.userId || incident?.owner);
}

function incidentSlaState(incident = {}) {
  return normalizeText(incident?.sla?.state).toLowerCase();
}

function buildAdminIncidentAdminView({
  incidents = [],
  incidentSummary = null,
  filters = {},
} = {}) {
  const list = Array.isArray(incidents) ? incidents : [];
  const ownerFilter = normalizeText(filters.owner);
  const severityFilter = normalizeText(filters.severity).toUpperCase();
  const slaRiskFilter = normalizeText(filters.slaRisk).toLowerCase();
  const statusFilter = normalizeText(filters.status).toLowerCase();

  let items = list.filter((incident) => {
    if (statusFilter === 'open') return isOpenIncident(incident);
    if (statusFilter) {
      return normalizeText(incident.status).toLowerCase() === statusFilter;
    }
    return true;
  });

  if (ownerFilter) {
    items = items.filter((incident) =>
      incidentOwnerId(incident).toLowerCase().includes(ownerFilter.toLowerCase())
    );
  }
  if (severityFilter) {
    items = items.filter(
      (incident) => normalizeText(incident.severity).toUpperCase() === severityFilter
    );
  }
  if (slaRiskFilter) {
    items = items.filter((incident) => {
      const slaState = incidentSlaState(incident);
      if (slaRiskFilter === 'breached') return slaState === 'breached';
      if (slaRiskFilter === 'at_risk') return slaState === 'at_risk' || slaState === 'warning';
      return true;
    });
  }

  const openItems = items.filter(isOpenIncident);
  const unowned = openItems.filter((incident) => !incidentOwnerId(incident));
  const breached = openItems.filter((incident) => incidentSlaState(incident) === 'breached');
  const critical = openItems.filter(
    (incident) =>
      Number(incident.riskLevel) >= 4 ||
      ['L4', 'L5'].includes(normalizeText(incident.severity).toUpperCase())
  );

  const summaryFromStore = incidentSummary && typeof incidentSummary === 'object' ? incidentSummary : null;

  return {
    items: items.map((incident) => ({
      id: normalizeText(incident.id),
      severity: normalizeText(incident.severity),
      status: normalizeText(incident.status),
      owner: incidentOwnerId(incident) || null,
      category: normalizeText(incident.category),
      sla: {
        state: incidentSlaState(incident) || null,
        deadline: normalizeText(incident?.sla?.deadline) || null,
      },
      riskLevel: incident.riskLevel ?? null,
      adminActions: [
        !incidentOwnerId(incident) ? 'assign_owner' : null,
        incidentSlaState(incident) === 'breached' ? 'escalate_sla' : null,
        'open_incident_panel',
      ].filter(Boolean),
    })),
    summary: {
      total: items.length,
      open: openItems.length,
      unowned: unowned.length,
      breached: breached.length,
      criticalOpen: critical.length,
      storeOpenUnresolved: Number(summaryFromStore?.totals?.openUnresolved || 0) || openItems.length,
      storeBreachedOpen: Number(summaryFromStore?.totals?.breachedOpen || 0) || breached.length,
      cooAligned: true,
    },
    openCount: openItems.length,
    criticalOpen: critical.length,
    unownedCount: unowned.length,
  };
}

async function loadAdminIncidentAdminView({
  templateStore,
  tenantId,
  filters = {},
  limit = 200,
} = {}) {
  if (!templateStore || typeof templateStore.listIncidents !== 'function') {
    return buildAdminIncidentAdminView({ incidents: [], filters });
  }
  const normalizedTenantId = normalizeText(tenantId);
  const status = normalizeText(filters.status) || 'open';
  const [incidents, incidentSummary] = await Promise.all([
    templateStore.listIncidents({
      tenantId: normalizedTenantId,
      status: status === 'all' ? '' : status,
      limit,
    }),
    typeof templateStore.summarizeIncidents === 'function'
      ? templateStore.summarizeIncidents({ tenantId: normalizedTenantId })
      : Promise.resolve(null),
  ]);
  return buildAdminIncidentAdminView({
    incidents,
    incidentSummary,
    filters,
  });
}

module.exports = {
  buildAdminIncidentAdminView,
  loadAdminIncidentAdminView,
};
