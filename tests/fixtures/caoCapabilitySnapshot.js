'use strict';

const { CAO_LIGHT_READINESS_DISCLAIMER } = require('../../src/ops/readinessEvaluator');

function buildCaoCapabilitySnapshot(overrides = {}) {
  const base = {
    templates: [
      {
        id: 'tpl-1',
        name: 'Konsult mall',
        category: 'CONSULTATION',
        state: 'draft',
        updatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    variableWhitelist: { CONSULTATION: ['patient_name'] },
    adminTasks: [
      {
        id: 'task-1',
        title: 'Saknar metadata',
        owner: '',
        status: 'open',
        dod: '',
        nextStep: '',
        deadline: '2020-01-01',
        riskLevel: 'L2',
      },
      {
        id: 'task-2',
        title: 'OK uppgift',
        owner: 'OWNER',
        status: 'open',
        dod: 'Klar',
        nextStep: 'Nästa',
      },
    ],
    incidents: [
      {
        id: 'inc-1',
        status: 'open',
        severity: 'L3',
        owner: null,
        riskLevel: 3,
        sla: { state: 'at_risk', deadline: '2026-06-01' },
      },
    ],
    incidentSummary: { totals: { openUnresolved: 1, breachedOpen: 0 } },
    auditEvents: [
      {
        ts: new Date().toISOString(),
        action: 'orchestrator.admin_run',
        outcome: 'success',
        actorUserId: 'owner-a',
      },
    ],
    readiness: {
      score: 82,
      band: 'limited_beta',
      goAllowed: false,
      blockers: [{ id: 'admin_tasks_incomplete_metadata', severity: 'medium', label: 'Tasks incomplete' }],
      source: 'shared_operational_core',
      monitorEndpoint: '/api/v1/monitor/readiness',
      disclaimer: CAO_LIGHT_READINESS_DISCLAIMER,
    },
    tenantConfig: {
      tenantId: 'tenant-a',
      riskSensitivityModifier: 0,
      policyProfile: 'default',
    },
    documentationIndex: [{ path: 'docs/ops/developer-handover.md', title: 'Handover' }],
  };
  return { ...base, ...overrides };
}

module.exports = {
  buildCaoCapabilitySnapshot,
};
