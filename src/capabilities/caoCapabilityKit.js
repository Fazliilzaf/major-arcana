'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');
const { isAdminSeedTemplate } = require('../ops/adminTemplateSeeds');
const { parseSimpleFrontmatter } = require('../ops/docFrontmatter');
const { buildKnowledgeIndex } = require('../ops/knowledgeAccessor');
const { groundingReferences } = require('../ops/knowledgeGrounding');
const { buildAdminIncidentAdminView } = require('../ops/adminIncidentReadModel');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function capabilityResult(data, metadata = {}, warnings = []) {
  return {
    data,
    metadata: { ...metadata, generatedAt: new Date().toISOString() },
    warnings: asArray(warnings).slice(0, 20),
  };
}

function readSnapshot(context) {
  return asObject(context?.systemStateSnapshot);
}

class GenerateAdminTemplateDraftCapability extends BaseCapability {
  static name = 'GenerateAdminTemplateDraft';
  static version = '1.0.0';
  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];
  static requiresInputRisk = false;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;
  static persistStrategy = 'analysis';
  static auditStrategy = 'always';
  static inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: { category: { type: 'string', maxLength: 64 } },
  };
  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: { data: { type: 'object' }, metadata: { type: 'object' }, warnings: { type: 'array' } },
  };

  async execute(context = {}) {
    const snapshot = readSnapshot(context);
    const input = asObject(context.input);
    const category = normalizeText(input.category) || 'INTERNAL';
    const templates = asArray(snapshot.templates);
    const adminSeeds = templates.filter((template) => isAdminSeedTemplate(template));
    const drafts = adminSeeds.map((template) => {
      const versions = template.versions && typeof template.versions === 'object' ? template.versions : {};
      const draftVersion =
        Object.values(versions).find((version) => normalizeText(version?.state).toLowerCase() === 'draft') ||
        null;
      return {
        templateId: normalizeText(template.id),
        templateName: normalizeText(template.name) || 'Admin-mall',
        draftVersionId: normalizeText(draftVersion?.id) || null,
        suggestedDraft: {
          category: normalizeText(template.category) || category,
          state: 'draft',
          requiresOwnerApproval: true,
          source: 'admin_seed',
        },
      };
    });

    if (drafts.length === 0) {
      drafts.push({
        templateId: '',
        templateName: `Ny ${category}-adminmall`,
        draftVersionId: null,
        suggestedDraft: {
          category,
          state: 'draft',
          requiresOwnerApproval: true,
          sections: ['disclaimer', 'variables', 'risk_review'],
          hint: 'Kör scripts/seed-admin-template-drafts.js för CAO admin-mallar.',
        },
      });
    }

    return capabilityResult(
      {
        draftCount: drafts.length,
        drafts,
        summary: `${drafts.length} admin-mallutkast (INTERNAL, draft-only).`,
      },
      { capability: GenerateAdminTemplateDraftCapability.name }
    );
  }
}

async function loadDocumentationIndex(repoRoot) {
  const indexPath = path.join(repoRoot, 'docs', 'major-arcana-index.md');
  try {
    const raw = await fs.readFile(indexPath, 'utf8');
    const links = [];
    for (const line of raw.split('\n')) {
      const match = line.match(/\]\(\.\/([^)]+)\)/);
      if (match) links.push(match[1]);
    }
    return { indexPath, links, rawLength: raw.length };
  } catch {
    return { indexPath, links: [], rawLength: 0 };
  }
}

class AuditDocumentationMetadataCapability extends BaseCapability {
  static name = 'AuditDocumentationMetadata';
  static version = '1.0.0';
  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];
  static requiresInputRisk = false;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;
  static persistStrategy = 'analysis';
  static auditStrategy = 'always';
  static inputSchema = { type: 'object', additionalProperties: false, properties: {} };
  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: { data: { type: 'object' }, metadata: { type: 'object' }, warnings: { type: 'array' } },
  };

  async execute(context = {}) {
    const snapshot = readSnapshot(context);
    const repoRoot = normalizeText(snapshot.repoRoot) || path.join(process.cwd());

    // Source of truth: the unified knowledge index (ALL docs). Honor an explicit
    // snapshot.documentationIndex.links override for back-compat / tests.
    const overrideLinks = asArray(snapshot.documentationIndex?.links)
      .map((l) => normalizeText(l))
      .filter(Boolean)
      .map((l) => (l.startsWith('docs/') ? l : `docs/${l}`));

    let docPaths = overrideLinks;
    if (!docPaths.length) {
      const index = await buildKnowledgeIndex(repoRoot);
      // Audit owned operational docs; skip repo-root readmes and archives.
      docPaths = index.documents
        .filter((d) => d.segment !== 'rot' && d.segment !== 'archives')
        .map((d) => d.path);
    }

    const documents = [];
    const gaps = [];
    let withOwner = 0;
    let withNextStep = 0;

    for (const relPath of docPaths) {
      const fullPath = path.join(repoRoot, relPath);
      let owner = null;
      let status = 'indexed';
      let lastUpdated = null;
      let nextStep = null;
      const issues = [];

      try {
        const stat = await fs.stat(fullPath);
        lastUpdated = stat.mtime?.toISOString?.() || null;
      } catch {
        status = 'missing';
        issues.push('file_missing');
      }

      if (!issues.includes('file_missing')) {
        try {
          const raw = await fs.readFile(fullPath, 'utf8');
          const parsed = parseSimpleFrontmatter(raw);
          owner = normalizeText(parsed.attributes.owner) || null;
          status = normalizeText(parsed.attributes.status).toLowerCase() || status;
          nextStep =
            normalizeText(parsed.attributes.next_step) ||
            normalizeText(parsed.attributes.nextstep) ||
            null;
        } catch {
          issues.push('unreadable');
        }
      }

      if (owner) withOwner += 1;
      else {
        issues.push('missing_owner');
        gaps.push({ issue: 'missing_owner', label: relPath });
      }
      if (nextStep) withNextStep += 1;
      else issues.push('missing_next_step');

      documents.push({ path: relPath, owner, status, lastUpdated, nextStep, issues });
    }

    const total = docPaths.length;
    const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
    return capabilityResult(
      {
        indexedDocuments: total,
        ownerCoverage: pct(withOwner),
        nextStepCoverage: pct(withNextStep),
        documentsWithGaps: documents.filter((d) => d.issues.length).slice(0, 40),
        gaps: gaps.slice(0, 40),
        summary: `Granskade ${total} dokument — ${withOwner} har owner (${pct(withOwner)}%), ${withNextStep} har next_step (${pct(withNextStep)}%), ${gaps.length} saknar owner.`,
      },
      { capability: AuditDocumentationMetadataCapability.name }
    );
  }
}

class ProposeDocumentStructureCapability extends BaseCapability {
  static name = 'ProposeDocumentStructure';
  static version = '1.0.0';
  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];
  static requiresInputRisk = false;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;
  static persistStrategy = 'analysis';
  static auditStrategy = 'always';
  static inputSchema = { type: 'object', additionalProperties: false, properties: {} };
  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: { data: { type: 'object' }, metadata: { type: 'object' }, warnings: { type: 'array' } },
  };

  async execute(context = {}) {
    const snapshot = readSnapshot(context);
    const repoRoot = normalizeText(snapshot.repoRoot) || path.join(process.cwd());
    const index = await buildKnowledgeIndex(repoRoot);

    // Reflect the ACTUAL structure (live segments + counts), not a static list.
    const proposals = index.segments.map((segment) => ({
      path: segment.id === 'rot' ? '(repo root)' : `docs/${segment.id}/`,
      segment: segment.title,
      count: segment.count,
      purpose: segment.title,
    }));
    const uncurated = index.documents.filter((d) => d.roles.length === 0);

    return capabilityResult(
      {
        proposals,
        totalDocuments: index.totalDocuments,
        totalSegments: index.segments.length,
        uncuratedDocuments: uncurated.length,
        uncuratedSample: uncurated.slice(0, 15).map((d) => d.path),
        summary: `${index.totalDocuments} dokument i ${index.segments.length} segment; ${uncurated.length} saknar roll-koppling (syns bara via segment). Inga filer flyttas automatiskt.`,
      },
      { capability: ProposeDocumentStructureCapability.name }
    );
  }
}

class SummarizeIncidentAdminCapability extends BaseCapability {
  static name = 'SummarizeIncidentAdmin';
  static version = '1.0.0';
  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];
  static requiresInputRisk = false;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;
  static persistStrategy = 'analysis';
  static auditStrategy = 'always';
  static inputSchema = { type: 'object', additionalProperties: false, properties: {} };
  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: { data: { type: 'object' }, metadata: { type: 'object' }, warnings: { type: 'array' } },
  };

  async execute(context = {}) {
    const incidents = asArray(readSnapshot(context).incidents);
    const incidentSummary = readSnapshot(context).incidentSummary || null;
    const view = buildAdminIncidentAdminView({ incidents, incidentSummary });
    return capabilityResult(
      {
        total: incidents.length,
        openCount: view.openCount,
        criticalOpen: view.criticalOpen,
        unownedCount: view.unownedCount,
        topOpen: view.items
          .filter((item) => {
            const status = normalizeText(item.status).toLowerCase();
            return status !== 'closed' && status !== 'resolved';
          })
          .slice(0, 5),
        summary: `${view.openCount} öppna incidenter, ${view.criticalOpen} kritiska, ${view.unownedCount} utan ägare.`,
        cooAligned: view.summary.cooAligned,
      },
      { capability: SummarizeIncidentAdminCapability.name }
    );
  }
}

class FlagUnownedIncidentsCapability extends BaseCapability {
  static name = 'FlagUnownedIncidents';
  static version = '1.0.0';
  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];
  static requiresInputRisk = false;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;
  static persistStrategy = 'analysis';
  static auditStrategy = 'always';
  static inputSchema = { type: 'object', additionalProperties: false, properties: {} };
  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: { data: { type: 'object' }, metadata: { type: 'object' }, warnings: { type: 'array' } },
  };

  async execute(context = {}) {
    const incidents = asArray(readSnapshot(context).incidents);
    const unowned = incidents.filter((i) => {
      const status = normalizeText(i.status).toLowerCase();
      if (status === 'closed' || status === 'resolved') return false;
      return !normalizeText(i.owner);
    });
    return capabilityResult(
      {
        unownedCount: unowned.length,
        incidents: unowned.slice(0, 15).map((i) => ({
          id: normalizeText(i.id),
          severity: normalizeText(i.severity),
          category: normalizeText(i.category),
        })),
        summary:
          unowned.length > 0
            ? `${unowned.length} incidenter saknar ägare.`
            : 'Alla öppna incidenter har ägare.',
      },
      { capability: FlagUnownedIncidentsCapability.name }
    );
  }
}

class BuildAuditSummaryCapability extends BaseCapability {
  static name = 'BuildAuditSummary';
  static version = '1.0.0';
  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];
  static requiresInputRisk = false;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;
  static persistStrategy = 'analysis';
  static auditStrategy = 'always';
  static inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: { limit: { type: 'integer', minimum: 10, maximum: 500 } },
  };
  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: { data: { type: 'object' }, metadata: { type: 'object' }, warnings: { type: 'array' } },
  };

  async execute(context = {}) {
    const input = asObject(context.input);
    const limit = Math.max(10, Math.min(500, Number(input.limit) || 100));
    const events = asArray(readSnapshot(context).auditEvents).slice(0, limit);
    const byAction = {};
    for (const event of events) {
      const action = normalizeText(event.action) || 'unknown';
      byAction[action] = (byAction[action] || 0) + 1;
    }
    return capabilityResult(
      {
        eventCount: events.length,
        topActions: Object.entries(byAction)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([action, count]) => ({ action, count })),
        summary: `Audit: ${events.length} senaste händelser analyserade.`,
      },
      { capability: BuildAuditSummaryCapability.name }
    );
  }
}

class VerifyDecisionTraceabilityCapability extends BaseCapability {
  static name = 'VerifyDecisionTraceability';
  static version = '1.0.0';
  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];
  static requiresInputRisk = false;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;
  static persistStrategy = 'analysis';
  static auditStrategy = 'always';
  static inputSchema = { type: 'object', additionalProperties: false, properties: {} };
  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: { data: { type: 'object' }, metadata: { type: 'object' }, warnings: { type: 'array' } },
  };

  async execute(context = {}) {
    const events = asArray(readSnapshot(context).auditEvents);
    const sensitiveActions = new Set([
      'template.activate',
      'template.version.publish',
      'risk.owner_action',
      'tenant.config.update',
    ]);
    const gaps = [];
    for (const event of events) {
      const action = normalizeText(event.action);
      if (!sensitiveActions.has(action)) continue;
      const meta = asObject(event.metadata);
      if (!normalizeText(meta.reason) && !normalizeText(meta.ownerDecision)) {
        gaps.push({
          eventId: normalizeText(event.id),
          action,
          issue: 'missing_rationale',
        });
      }
    }
    return capabilityResult(
      {
        gapCount: gaps.length,
        gaps: gaps.slice(0, 20),
        summary:
          gaps.length > 0
            ? `${gaps.length} känsliga händelser saknar motivering i metadata.`
            : 'Spårbarhet OK för granskade händelser.',
      },
      { capability: VerifyDecisionTraceabilityCapability.name }
    );
  }
}

class TenantAdminHealthSummaryCapability extends BaseCapability {
  static name = 'TenantAdminHealthSummary';
  static version = '1.0.0';
  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];
  static requiresInputRisk = false;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;
  static persistStrategy = 'analysis';
  static auditStrategy = 'always';
  static inputSchema = { type: 'object', additionalProperties: false, properties: {} };
  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: { data: { type: 'object' }, metadata: { type: 'object' }, warnings: { type: 'array' } },
  };

  async execute(context = {}) {
    const tenant = asObject(readSnapshot(context).tenantConfig);
    const checks = [
      { id: 'assistant', ok: Boolean(normalizeText(tenant.assistantName)) },
      { id: 'brand', ok: Boolean(normalizeText(tenant.brandProfile)) },
      { id: 'risk_version', ok: Number(tenant.riskThresholdVersion) >= 1 },
    ];
    const failed = checks.filter((c) => !c.ok);
    return capabilityResult(
      {
        checks,
        healthy: failed.length === 0,
        summary:
          failed.length === 0
            ? 'Tenant admin-hälsa: godkänd.'
            : `${failed.length} tenant-kontroll(er) behöver åtgärd.`,
      },
      { capability: TenantAdminHealthSummaryCapability.name }
    );
  }
}

class GenerateAdminDailyBriefCapability extends BaseCapability {
  static name = 'GenerateAdminDailyBrief';
  static version = '1.0.0';
  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];
  static requiresInputRisk = false;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;
  static persistStrategy = 'analysis';
  static auditStrategy = 'always';
  static inputSchema = { type: 'object', additionalProperties: false, properties: {} };
  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: { data: { type: 'object' }, metadata: { type: 'object' }, warnings: { type: 'array' } },
  };

  async execute(context = {}) {
    const snapshot = readSnapshot(context);
    const tasks = asArray(snapshot.adminTasks);
    const incidents = asArray(snapshot.incidents);
    const openTasks = tasks.filter((t) => {
      const s = normalizeText(t.status).toLowerCase();
      return s !== 'done' && s !== 'completed';
    });
    const openIncidents = incidents.filter((i) => {
      const s = normalizeText(i.status).toLowerCase();
      return s !== 'closed' && s !== 'resolved';
    });
    const priorities = [
      openIncidents.length ? `Granska ${openIncidents.length} öppna incidenter` : null,
      openTasks.filter((t) => !normalizeText(t.owner)).length
        ? 'Tilldela ägare till adminuppgifter utan owner'
        : null,
      'Kör Arcana Admin Operator quality gate',
    ].filter(Boolean);
    const references = await groundingReferences('admin operatör incident prioritet quality gate runbook');
    return capabilityResult(
      {
        outputType: 'AdminBrief',
        priorities: priorities.slice(0, 5),
        openTasks: openTasks.length,
        openIncidents: openIncidents.length,
        references,
        summary: `Admin brief: ${priorities.length} prioriterade punkter.`,
      },
      { capability: GenerateAdminDailyBriefCapability.name }
    );
  }
}

class GenerateAdminWeeklyBriefCapability extends BaseCapability {
  static name = 'GenerateAdminWeeklyBrief';
  static version = '1.0.0';
  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];
  static requiresInputRisk = false;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;
  static persistStrategy = 'analysis';
  static auditStrategy = 'always';
  static inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: { windowDays: { type: 'integer', minimum: 1, maximum: 14 } },
  };
  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: { data: { type: 'object' }, metadata: { type: 'object' }, warnings: { type: 'array' } },
  };

  async execute(context = {}) {
    const snapshot = readSnapshot(context);
    const input = asObject(context.input);
    const windowDays = Math.max(1, Math.min(14, Number(input.windowDays) || 7));
    const tasks = asArray(snapshot.adminTasks);
    const incidents = asArray(snapshot.incidents);
    const auditEvents = asArray(snapshot.auditEvents);
    const readiness = asObject(snapshot.readiness);
    const cutoffMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;

    const openTasks = tasks.filter((task) => {
      const status = normalizeText(task.status).toLowerCase();
      return status !== 'done' && status !== 'completed';
    });
    const overdueTasks = openTasks.filter((task) => {
      const deadline = normalizeText(task.deadline);
      if (!deadline) return false;
      const ts = Date.parse(deadline);
      return Number.isFinite(ts) && ts < Date.now();
    });
    const openIncidents = incidents.filter((incident) => {
      const status = normalizeText(incident.status).toLowerCase();
      return status !== 'closed' && status !== 'resolved';
    });
    const recentAudit = auditEvents.filter((event) => {
      const ts = Date.parse(normalizeText(event?.ts || event?.createdAt));
      return Number.isFinite(ts) && ts >= cutoffMs;
    });

    const trends = {
      openTasks: openTasks.length,
      overdueTasks: overdueTasks.length,
      openIncidents: openIncidents.length,
      auditEventsInWindow: recentAudit.length,
      readinessScore: Number.isFinite(Number(readiness.score)) ? Number(readiness.score) : null,
      readinessBand: normalizeText(readiness.band) || null,
    };

    const recommendations = [
      overdueTasks.length ? `Åtgärda ${overdueTasks.length} försenade adminuppgift(er)` : null,
      openIncidents.length ? `Granska ${openIncidents.length} öppna incidenter (7d-vy)` : null,
      Number(readiness.score) < 85 ? 'Förbättra readiness-blockers innan Go/No-Go' : null,
      'Kör veckovis CAO quality gate och dokumentera owner-beslut',
    ].filter(Boolean);

    const references = await groundingReferences('readiness incidenter veckobrief admin owner runbook');
    return capabilityResult(
      {
        outputType: 'AdminWeeklyBrief',
        windowDays,
        weekSummary: `Vecka (${windowDays}d): ${openTasks.length} öppna tasks, ${openIncidents.length} incidenter, readiness ${trends.readinessScore ?? 'n/a'}.`,
        trends,
        references,
        overdueTasks: overdueTasks.slice(0, 10).map((task) => ({
          id: normalizeText(task.id),
          title: normalizeText(task.title),
          owner: normalizeText(task.owner) || 'saknas',
          deadline: normalizeText(task.deadline),
        })),
        recommendations: recommendations.slice(0, 6),
        summary: recommendations[0] || 'Ingen kritisk veckoprioritet identifierad.',
      },
      { capability: GenerateAdminWeeklyBriefCapability.name }
    );
  }
}

class ExplainReadinessScoreCapability extends BaseCapability {
  static name = 'ExplainReadinessScore';
  static version = '1.0.0';
  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];
  static requiresInputRisk = false;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;
  static persistStrategy = 'analysis';
  static auditStrategy = 'always';
  static inputSchema = { type: 'object', additionalProperties: false, properties: {} };
  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: { data: { type: 'object' }, metadata: { type: 'object' }, warnings: { type: 'array' } },
  };

  async execute(context = {}) {
    const readiness = asObject(readSnapshot(context).readiness);
    const score = Number(readiness.score);
    const blockers = asArray(readiness.blockers);
    const explanation = Number.isFinite(score)
      ? `Readiness ${score}/100. ${blockers.length} blocker(s) listade — beslut kvarstår hos OWNER.`
      : 'Readiness-data saknas i snapshot — hämta från /api/v1/monitor/readiness.';
    return capabilityResult(
      {
        outputType: 'ReadinessExplanation',
        score: Number.isFinite(score) ? score : null,
        band: normalizeText(readiness.band) || null,
        blockers: blockers.slice(0, 10),
        ownerDecisionRequired: true,
        summary: explanation,
        source: normalizeText(readiness.source) || 'shared_operational_core',
        authoritativeEndpoint: normalizeText(readiness.monitorEndpoint) || '/api/v1/monitor/readiness',
      },
      { capability: ExplainReadinessScoreCapability.name }
    );
  }
}

class GenerateGoNoGoBriefCapability extends BaseCapability {
  static name = 'GenerateGoNoGoBrief';
  static version = '1.0.0';
  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];
  static requiresInputRisk = false;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;
  static persistStrategy = 'analysis';
  static auditStrategy = 'always';
  static inputSchema = { type: 'object', additionalProperties: false, properties: {} };
  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: { data: { type: 'object' }, metadata: { type: 'object' }, warnings: { type: 'array' } },
  };

  async execute(context = {}) {
    const snapshot = readSnapshot(context);
    const readiness = asObject(snapshot.readiness);
    const tasks = asArray(snapshot.adminTasks);
    const incidents = asArray(snapshot.incidents);
    const score = Number(readiness.score);
    const band = normalizeText(readiness.band);
    const blockers = asArray(readiness.blockers);
    const highBlockers = blockers.filter((item) => normalizeText(item.severity).toLowerCase() === 'high');
    const openIncidents = incidents.filter((incident) => {
      const status = normalizeText(incident.status).toLowerCase();
      return status !== 'closed' && status !== 'resolved';
    });
    const flaggedTasks = tasks.filter((task) => {
      const status = normalizeText(task.status).toLowerCase();
      if (status === 'done' || status === 'completed') return false;
      return !normalizeText(task.owner) || !normalizeText(task.dod) || !normalizeText(task.nextStep);
    });
    const goAllowed = readiness.goAllowed === true && highBlockers.length === 0;
    const goRecommendation = goAllowed ? 'conditional_go' : 'no_go_pending_owner';
    const highlights = [
      Number.isFinite(score) ? `Readiness ${score}/100 (${band || 'unknown'})` : 'Readiness score saknas',
      `${highBlockers.length} high-severity blocker(s)`,
      `${openIncidents.length} öppna incidenter`,
      `${flaggedTasks.length} admin tasks med ofullständig metadata`,
    ];
    const recommendations = [
      highBlockers.length ? 'Åtgärda high-severity blockers före Go' : null,
      openIncidents.length ? 'Granska öppna incidenter och SLA' : null,
      flaggedTasks.length ? 'Tilldela owner/DoD på admin tasks' : null,
      'Bekräfta slutligt beslut mot /api/v1/monitor/readiness',
    ].filter(Boolean);

    const references = await groundingReferences('go-live go no-go readiness checklista blockers runbook');
    return capabilityResult(
      {
        outputType: 'GoNoGoBrief',
        score: Number.isFinite(score) ? score : null,
        band: band || null,
        goRecommendation,
        goAllowed,
        ownerDecisionRequired: true,
        blockers: blockers.slice(0, 12),
        highlights,
        recommendations: recommendations.slice(0, 6),
        references,
        summary: `Go/No-Go: ${goRecommendation.replace(/_/g, ' ')} — ${Number.isFinite(score) ? score + '/100' : 'score saknas'}. Beslut kvarstår hos OWNER.`,
        source: normalizeText(readiness.source) || 'shared_operational_core',
        authoritativeEndpoint: normalizeText(readiness.monitorEndpoint) || '/api/v1/monitor/readiness',
        disclaimer: normalizeText(readiness.disclaimer) || 'CAO light snapshot — monitor är auktoritativ källa.',
      },
      { capability: GenerateGoNoGoBriefCapability.name }
    );
  }
}

module.exports = {
  GenerateAdminTemplateDraftCapability,
  AuditDocumentationMetadataCapability,
  ProposeDocumentStructureCapability,
  SummarizeIncidentAdminCapability,
  FlagUnownedIncidentsCapability,
  BuildAuditSummaryCapability,
  VerifyDecisionTraceabilityCapability,
  TenantAdminHealthSummaryCapability,
  GenerateAdminDailyBriefCapability,
  GenerateAdminWeeklyBriefCapability,
  ExplainReadinessScoreCapability,
  GenerateGoNoGoBriefCapability,
  loadDocumentationIndex,
};
