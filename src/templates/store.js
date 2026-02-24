const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const { isValidCategory, normalizeCategory } = require('./constants');
const {
  buildIncidentFromEvaluation,
  compareIncidents,
  isIncidentOpenStatus,
  normalizeIncidentSeverity,
  normalizeIncidentStatus,
} = require('../incidents/fromEvaluation');

function nowIso() {
  return new Date().toISOString();
}

function normalizeTenantId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function emptyState() {
  return {
    templates: {},
    evaluations: [],
  };
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

function toSafeVersion(version) {
  if (!version) return null;
  return {
    id: version.id,
    templateId: version.templateId,
    tenantId: version.tenantId,
    versionNo: version.versionNo,
    state: version.state,
    source: version.source,
    title: version.title,
    content: version.content,
    variablesUsed: Array.isArray(version.variablesUsed) ? [...version.variablesUsed] : [],
    risk: version.risk || null,
    createdBy: version.createdBy || null,
    updatedBy: version.updatedBy || null,
    activatedBy: version.activatedBy || null,
    archivedBy: version.archivedBy || null,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
    activatedAt: version.activatedAt || null,
    archivedAt: version.archivedAt || null,
  };
}

function toSafeEvaluation(evaluation) {
  if (!evaluation) return null;
  return {
    id: evaluation.id,
    templateId: evaluation.templateId,
    templateVersionId: evaluation.templateVersionId,
    tenantId: evaluation.tenantId,
    category: evaluation.category,
    riskLevel: evaluation.riskLevel,
    riskScore: evaluation.riskScore,
    semanticScore: evaluation.semanticScore,
    ruleScore: evaluation.ruleScore,
    decision: evaluation.decision,
    reasonCodes: Array.isArray(evaluation.reasonCodes) ? [...evaluation.reasonCodes] : [],
    policyAdjustments: Array.isArray(evaluation.policyAdjustments)
      ? [...evaluation.policyAdjustments]
      : [],
    ownerDecision: evaluation.ownerDecision || 'pending',
    ownerActions: Array.isArray(evaluation.ownerActions)
      ? evaluation.ownerActions.map((item) => ({
          id: item.id,
          action: item.action,
          note: item.note || '',
          actorUserId: item.actorUserId || null,
          createdAt: item.createdAt,
        }))
      : [],
    evaluatedAt: evaluation.evaluatedAt,
    updatedAt: evaluation.updatedAt || evaluation.evaluatedAt,
  };
}

function toSafeIncident(incident) {
  if (!incident) return null;
  return {
    id: incident.id,
    sourceEvaluationId: incident.sourceEvaluationId,
    tenantId: incident.tenantId,
    templateId: incident.templateId,
    templateVersionId: incident.templateVersionId,
    category: incident.category,
    riskLevel: incident.riskLevel,
    decision: incident.decision,
    reasonCodes: Array.isArray(incident.reasonCodes) ? [...incident.reasonCodes] : [],
    severity: incident.severity,
    status: incident.status,
    ownerDecision: incident.ownerDecision,
    owner: incident.owner
      ? {
          userId: incident.owner.userId || null,
        }
      : null,
    ownerActionsCount: Number(incident.ownerActionsCount || 0),
    openedAt: incident.openedAt || null,
    updatedAt: incident.updatedAt || null,
    resolutionTs: incident.resolutionTs || null,
    sla: incident.sla
      ? {
          targetMs: Number(incident.sla.targetMs || 0),
          targetMinutes: Number(incident.sla.targetMinutes || 0),
          deadline: incident.sla.deadline || null,
          remainingMs: Number(incident.sla.remainingMs || 0),
          elapsedMs: Number(incident.sla.elapsedMs || 0),
          state: incident.sla.state || 'ok',
          breached: Boolean(incident.sla.breached),
        }
      : null,
  };
}

function toSafeTemplate(template, { includeVersions = false } = {}) {
  if (!template) return null;
  return {
    id: template.id,
    tenantId: template.tenantId,
    category: template.category,
    name: template.name,
    channel: template.channel,
    locale: template.locale,
    status: template.status,
    currentActiveVersionId: template.currentActiveVersionId || null,
    latestVersionNo: template.versionCounter || 0,
    createdBy: template.createdBy || null,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    versions: includeVersions
      ? Object.values(template.versions || {})
          .sort((a, b) => b.versionNo - a.versionNo)
          .map((version) => toSafeVersion(version))
      : undefined,
  };
}

function combineEvaluations({ inputEvaluation, outputEvaluation }) {
  const input = inputEvaluation || null;
  const output = outputEvaluation || null;
  const levels = [input?.riskLevel || 1, output?.riskLevel || 1];
  const riskLevel = Math.max(...levels);

  const reasonCodes = Array.from(
    new Set([
      ...(Array.isArray(input?.reasonCodes) ? input.reasonCodes : []),
      ...(Array.isArray(output?.reasonCodes) ? output.reasonCodes : []),
    ])
  );

  const policyAdjustments = [
    ...(Array.isArray(input?.policyAdjustments) ? input.policyAdjustments : []),
    ...(Array.isArray(output?.policyAdjustments) ? output.policyAdjustments : []),
  ];

  const riskScore = Math.max(input?.riskScore || 0, output?.riskScore || 0);
  const semanticScore = Math.max(input?.semanticScore || 0, output?.semanticScore || 0);
  const ruleScore = Math.max(input?.ruleScore || 0, output?.ruleScore || 0);

  let decision = 'allow';
  if (riskLevel >= 4) decision = 'blocked';
  else if (riskLevel === 3) decision = 'review_required';

  return {
    input,
    output,
    riskLevel,
    riskScore,
    semanticScore,
    ruleScore,
    decision,
    reasonCodes,
    policyAdjustments,
    evaluatedAt: nowIso(),
  };
}

const OWNER_ACTIONS = Object.freeze({
  APPROVE_EXCEPTION: 'approve_exception',
  MARK_FALSE_POSITIVE: 'mark_false_positive',
  REQUEST_REVISION: 'request_revision',
  ESCALATE: 'escalate',
});

const OWNER_DECISIONS_ALLOW_ACTIVATION = new Set(['approved_exception', 'false_positive']);
const INCIDENT_OPEN_OWNER_DECISIONS = new Set(['pending', 'revision_requested']);
const AUTO_ESCALATION_NOTE = 'Auto-eskalerad av scheduler: SLA överskriden.';
const AUTO_ASSIGN_OWNER_NOTE = 'Auto-assigned owner av scheduler för incidenthantering.';

function normalizeOwnerAction(action) {
  if (typeof action !== 'string') return '';
  return action.trim().toLowerCase();
}

function mapOwnerActionToDecision(action) {
  switch (normalizeOwnerAction(action)) {
    case OWNER_ACTIONS.APPROVE_EXCEPTION:
      return 'approved_exception';
    case OWNER_ACTIONS.MARK_FALSE_POSITIVE:
      return 'false_positive';
    case OWNER_ACTIONS.REQUEST_REVISION:
      return 'revision_requested';
    case OWNER_ACTIONS.ESCALATE:
      return 'escalated';
    default:
      return 'pending';
  }
}

function getLatestEvaluationForVersionInternal(state, templateId, templateVersionId) {
  const templateIdValue = normalizeText(templateId);
  const templateVersionIdValue = normalizeText(templateVersionId);
  if (!templateIdValue || !templateVersionIdValue) return null;

  const evaluations = Array.isArray(state.evaluations) ? state.evaluations : [];
  const candidates = evaluations
    .filter(
      (item) =>
        item.templateId === templateIdValue && item.templateVersionId === templateVersionIdValue
    )
    .sort((a, b) => {
      const aTs = Date.parse(a.updatedAt || a.evaluatedAt || 0);
      const bTs = Date.parse(b.updatedAt || b.evaluatedAt || 0);
      return bTs - aTs;
    });

  return candidates[0] || null;
}

async function createTemplateStore({
  filePath,
  maxEvaluations = 10000,
}) {
  const rawState = await readJson(filePath, emptyState());
  const state = {
    templates:
      rawState &&
      rawState.templates &&
      typeof rawState.templates === 'object' &&
      !Array.isArray(rawState.templates)
        ? rawState.templates
        : {},
    evaluations: Array.isArray(rawState?.evaluations) ? rawState.evaluations : [],
  };

  function prune() {
    if (!Array.isArray(state.evaluations)) {
      state.evaluations = [];
    }
    if (state.evaluations.length > maxEvaluations) {
      state.evaluations = state.evaluations.slice(-maxEvaluations);
    }
  }

  async function save() {
    prune();
    await writeJsonAtomic(filePath, state);
  }

  function getRawTemplate(templateId) {
    return state.templates[templateId] || null;
  }

  function getRawVersion(template, versionId) {
    if (!template || !template.versions) return null;
    return template.versions[versionId] || null;
  }

  async function createTemplate({
    tenantId,
    category,
    name,
    channel = 'internal',
    locale = 'sv-SE',
    createdBy = null,
  }) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const normalizedCategory = normalizeCategory(category);
    const normalizedName = normalizeText(name);
    if (!normalizedTenantId) throw new Error('tenantId saknas.');
    if (!isValidCategory(normalizedCategory)) {
      throw new Error('Ogiltig kategori.');
    }
    if (!normalizedName) throw new Error('Mallnamn saknas.');

    const createdAt = nowIso();
    const template = {
      id: crypto.randomUUID(),
      tenantId: normalizedTenantId,
      category: normalizedCategory,
      name: normalizedName,
      channel: normalizeText(channel) || 'internal',
      locale: normalizeText(locale) || 'sv-SE',
      status: 'active',
      currentActiveVersionId: null,
      versionCounter: 0,
      createdBy,
      createdAt,
      updatedAt: createdAt,
      versions: {},
    };
    state.templates[template.id] = template;
    await save();
    return toSafeTemplate(template);
  }

  async function listTemplates({
    tenantId,
    category = '',
    includeVersions = false,
  }) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const normalizedCategory = normalizeCategory(category);
    const items = Object.values(state.templates).filter((template) => {
      if (normalizedTenantId && template.tenantId !== normalizedTenantId) return false;
      if (normalizedCategory && template.category !== normalizedCategory) return false;
      return true;
    });
    items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return items.map((template) => toSafeTemplate(template, { includeVersions }));
  }

  async function getTemplate(templateId, { includeVersions = false } = {}) {
    const template = getRawTemplate(templateId);
    return toSafeTemplate(template, { includeVersions });
  }

  async function listActiveVersionSnapshots({
    tenantId,
  } = {}) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const items = [];

    for (const template of Object.values(state.templates)) {
      if (normalizedTenantId && template.tenantId !== normalizedTenantId) continue;

      const versionsMap =
        template && template.versions && typeof template.versions === 'object'
          ? template.versions
          : {};
      const activeVersionId = normalizeText(template.currentActiveVersionId);
      let activeVersion = activeVersionId ? versionsMap[activeVersionId] || null : null;

      if (!activeVersion) {
        activeVersion =
          Object.values(versionsMap).find(
            (version) => normalizeText(version?.state).toLowerCase() === 'active'
          ) || null;
      }
      if (!activeVersion) continue;

      items.push({
        templateId: template.id,
        templateName: template.name || null,
        category: template.category || null,
        versionId: activeVersion.id,
        versionNo: Number(activeVersion.versionNo || 0),
        risk: activeVersion.risk || null,
        activatedAt: activeVersion.activatedAt || null,
        updatedAt: activeVersion.updatedAt || null,
      });
    }

    items.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return items;
  }

  async function listTemplateVersions(templateId) {
    const template = getRawTemplate(templateId);
    if (!template) return null;
    const versions = Object.values(template.versions || {}).sort((a, b) => b.versionNo - a.versionNo);
    return versions.map((version) => toSafeVersion(version));
  }

  async function getTemplateVersion(templateId, versionId) {
    const template = getRawTemplate(templateId);
    if (!template) return null;
    const version = getRawVersion(template, versionId);
    return toSafeVersion(version);
  }

  async function createDraftVersion({
    templateId,
    content,
    title = '',
    source = 'manual',
    variablesUsed = [],
    createdBy = null,
    risk = null,
  }) {
    const template = getRawTemplate(templateId);
    if (!template) throw new Error('Mallen hittades inte.');

    const createdAt = nowIso();
    template.versionCounter += 1;
    const version = {
      id: crypto.randomUUID(),
      templateId: template.id,
      tenantId: template.tenantId,
      versionNo: template.versionCounter,
      state: 'draft',
      source: normalizeText(source) || 'manual',
      title: normalizeText(title) || template.name,
      content: String(content ?? ''),
      variablesUsed: Array.isArray(variablesUsed) ? [...variablesUsed] : [],
      risk: risk || null,
      createdBy,
      updatedBy: createdBy,
      activatedBy: null,
      archivedBy: null,
      createdAt,
      updatedAt: createdAt,
      activatedAt: null,
      archivedAt: null,
    };

    template.versions[version.id] = version;
    template.updatedAt = nowIso();
    await save();
    return toSafeVersion(version);
  }

  async function updateDraftVersion({
    templateId,
    versionId,
    content,
    title,
    variablesUsed,
    updatedBy = null,
    risk = undefined,
  }) {
    const template = getRawTemplate(templateId);
    if (!template) throw new Error('Mallen hittades inte.');
    const version = getRawVersion(template, versionId);
    if (!version) throw new Error('Versionen hittades inte.');
    if (version.state !== 'draft') throw new Error('Bara draft-versioner kan ändras.');

    if (content !== undefined) version.content = String(content ?? '');
    if (title !== undefined) version.title = normalizeText(title) || version.title;
    if (variablesUsed !== undefined) {
      version.variablesUsed = Array.isArray(variablesUsed) ? [...variablesUsed] : [];
    }
    if (risk !== undefined) version.risk = risk;
    version.updatedBy = updatedBy;
    version.updatedAt = nowIso();
    template.updatedAt = nowIso();
    await save();
    return toSafeVersion(version);
  }

  async function evaluateVersion({
    templateId,
    versionId,
    inputEvaluation = null,
    outputEvaluation = null,
  }) {
    const template = getRawTemplate(templateId);
    if (!template) throw new Error('Mallen hittades inte.');
    const version = getRawVersion(template, versionId);
    if (!version) throw new Error('Versionen hittades inte.');

    const combined = combineEvaluations({
      inputEvaluation,
      outputEvaluation,
    });

    version.risk = combined;
    version.updatedAt = nowIso();
    template.updatedAt = nowIso();

    if (!Array.isArray(state.evaluations)) {
      state.evaluations = [];
    }
    state.evaluations.push({
      id: crypto.randomUUID(),
      templateId,
      templateVersionId: versionId,
      tenantId: template.tenantId,
      category: template.category,
      riskLevel: combined.riskLevel,
      riskScore: combined.riskScore,
      semanticScore: combined.semanticScore,
      ruleScore: combined.ruleScore,
      decision: combined.decision,
      reasonCodes: combined.reasonCodes,
      policyAdjustments: combined.policyAdjustments,
      ownerDecision: 'pending',
      ownerActions: [],
      evaluatedAt: combined.evaluatedAt,
      updatedAt: combined.evaluatedAt,
    });

    await save();
    return toSafeVersion(version);
  }

  async function activateVersion({
    templateId,
    versionId,
    activatedBy = null,
  }) {
    const template = getRawTemplate(templateId);
    if (!template) throw new Error('Mallen hittades inte.');
    const version = getRawVersion(template, versionId);
    if (!version) throw new Error('Versionen hittades inte.');

    if (version.state === 'archived') {
      throw new Error('Arkiverad version kan inte aktiveras.');
    }

    if (!version.risk) {
      throw new Error('Versionen måste riskutvärderas innan aktivering.');
    }

    const latestEvaluation = getLatestEvaluationForVersionInternal(state, templateId, versionId);
    const ownerDecision = String(latestEvaluation?.ownerDecision || 'pending').toLowerCase();
    const hasOwnerOverride = OWNER_DECISIONS_ALLOW_ACTIVATION.has(ownerDecision);

    if (version.risk.decision === 'blocked' && !hasOwnerOverride) {
      throw new Error(
        'Versionen är blockerad av risk/policy. Owner måste först sätta owner action (approve_exception eller mark_false_positive).'
      );
    }

    if (version.risk.decision === 'review_required' && !hasOwnerOverride) {
      throw new Error(
        'Versionen kräver owner-beslut innan aktivering (approve_exception eller mark_false_positive).'
      );
    }

    if (template.currentActiveVersionId && template.currentActiveVersionId !== version.id) {
      const previous = getRawVersion(template, template.currentActiveVersionId);
      if (previous && previous.state === 'active') {
        previous.state = 'archived';
        previous.archivedAt = nowIso();
        previous.archivedBy = activatedBy;
        previous.updatedAt = nowIso();
      }
    }

    version.state = 'active';
    version.activatedBy = activatedBy;
    version.activatedAt = nowIso();
    version.updatedAt = nowIso();
    version.risk = {
      ...(version.risk || {}),
      ownerDecision,
    };
    template.currentActiveVersionId = version.id;
    template.updatedAt = nowIso();
    await save();
    return toSafeVersion(version);
  }

  async function archiveVersion({
    templateId,
    versionId,
    archivedBy = null,
  }) {
    const template = getRawTemplate(templateId);
    if (!template) throw new Error('Mallen hittades inte.');
    const version = getRawVersion(template, versionId);
    if (!version) throw new Error('Versionen hittades inte.');
    if (version.state === 'archived') return toSafeVersion(version);

    version.state = 'archived';
    version.archivedAt = nowIso();
    version.archivedBy = archivedBy;
    version.updatedAt = nowIso();

    if (template.currentActiveVersionId === version.id) {
      template.currentActiveVersionId = null;
    }

    template.updatedAt = nowIso();
    await save();
    return toSafeVersion(version);
  }

  async function cloneVersion({
    templateId,
    versionId,
    createdBy = null,
  }) {
    const template = getRawTemplate(templateId);
    if (!template) throw new Error('Mallen hittades inte.');
    const sourceVersion = getRawVersion(template, versionId);
    if (!sourceVersion) throw new Error('Versionen hittades inte.');

    return createDraftVersion({
      templateId,
      content: sourceVersion.content,
      title: `${sourceVersion.title} (kopia)`,
      source: 'clone',
      variablesUsed: sourceVersion.variablesUsed || [],
      createdBy,
      risk: null,
    });
  }

  async function listEvaluations({
    tenantId,
    minRiskLevel = 0,
    maxRiskLevel = 5,
    limit = 100,
    ownerDecision = '',
    decision = '',
    category = '',
    reasonCode = '',
    state: reviewState = '',
    sinceDays = 0,
    search = '',
    templateId = '',
    templateVersionId = '',
  }) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const minimum = Math.max(0, Number(minRiskLevel) || 0);
    const maximum = Math.max(minimum, Math.min(5, Number(maxRiskLevel) || 5));
    const max = Math.max(1, Math.min(500, Number(limit) || 100));
    const normalizedOwnerDecision = normalizeText(ownerDecision).toLowerCase();
    const normalizedDecision = normalizeText(decision).toLowerCase();
    const normalizedCategory = normalizeCategory(category);
    const normalizedReasonCode = normalizeText(reasonCode).toLowerCase();
    const normalizedState = normalizeText(reviewState).toLowerCase();
    const normalizedSearch = normalizeText(search).toLowerCase();
    const normalizedTemplateId = normalizeText(templateId);
    const normalizedTemplateVersionId = normalizeText(templateVersionId);
    const sinceWindowDays = Math.max(0, Math.min(365, Number(sinceDays) || 0));
    const sinceWindowMs = sinceWindowDays > 0 ? Date.now() - sinceWindowDays * 24 * 60 * 60 * 1000 : null;

    const evaluations = Array.isArray(state.evaluations) ? state.evaluations : [];
    const items = evaluations
      .filter((evaluation) => {
        if (normalizedTenantId && evaluation.tenantId !== normalizedTenantId) return false;
        if (normalizedTemplateId && evaluation.templateId !== normalizedTemplateId) return false;
        if (
          normalizedTemplateVersionId &&
          evaluation.templateVersionId !== normalizedTemplateVersionId
          ) {
          return false;
        }
        const riskLevel = Number(evaluation.riskLevel || 0);
        if (riskLevel < minimum || riskLevel > maximum) return false;
        if (normalizedDecision && String(evaluation.decision || '').toLowerCase() !== normalizedDecision) {
          return false;
        }
        if (normalizedCategory && normalizeCategory(evaluation.category) !== normalizedCategory) {
          return false;
        }
        if (
          normalizedOwnerDecision &&
          String(evaluation.ownerDecision || 'pending').toLowerCase() !== normalizedOwnerDecision
        ) {
          return false;
        }
        const ownerDecisionValue = String(evaluation.ownerDecision || 'pending').toLowerCase();
        if (normalizedState === 'open' && !INCIDENT_OPEN_OWNER_DECISIONS.has(ownerDecisionValue)) {
          return false;
        }
        if (normalizedState === 'closed' && INCIDENT_OPEN_OWNER_DECISIONS.has(ownerDecisionValue)) {
          return false;
        }
        if (sinceWindowMs !== null) {
          const ts = Date.parse(
            String(evaluation.updatedAt || evaluation.evaluatedAt || evaluation.createdAt || '')
          );
          if (!Number.isFinite(ts) || ts < sinceWindowMs) return false;
        }
        if (normalizedReasonCode) {
          const matchesReason = (Array.isArray(evaluation.reasonCodes) ? evaluation.reasonCodes : []).some(
            (code) => String(code || '').toLowerCase().includes(normalizedReasonCode)
          );
          if (!matchesReason) return false;
        }
        if (normalizedSearch) {
          const haystack = [
            evaluation.id,
            evaluation.templateId,
            evaluation.templateVersionId,
            evaluation.category,
            evaluation.decision,
            evaluation.ownerDecision,
            ...(Array.isArray(evaluation.reasonCodes) ? evaluation.reasonCodes : []),
          ]
            .map((part) => String(part || '').toLowerCase())
            .join(' ');
          if (!haystack.includes(normalizedSearch)) return false;
        }
        return true;
      })
      .sort((a, b) => String(b.evaluatedAt).localeCompare(String(a.evaluatedAt)))
      .slice(0, max);

    return items.map((item) => toSafeEvaluation(item));
  }

  async function getEvaluation({
    evaluationId,
    tenantId,
  }) {
    const normalizedEvaluationId = normalizeText(evaluationId);
    if (!normalizedEvaluationId) return null;
    const normalizedTenantId = normalizeTenantId(tenantId);

    const evaluations = Array.isArray(state.evaluations) ? state.evaluations : [];
    const evaluation = evaluations.find((item) => item.id === normalizedEvaluationId) || null;
    if (!evaluation) return null;
    if (normalizedTenantId && evaluation.tenantId !== normalizedTenantId) return null;
    return toSafeEvaluation(evaluation);
  }

  async function addOwnerAction({
    evaluationId,
    tenantId,
    action,
    note = '',
    actorUserId = null,
  }) {
    const normalizedEvaluationId = normalizeText(evaluationId);
    const normalizedTenantId = normalizeTenantId(tenantId);
    const normalizedAction = normalizeOwnerAction(action);
    if (!normalizedEvaluationId) throw new Error('evaluationId saknas.');
    if (!normalizedTenantId) throw new Error('tenantId saknas.');
    if (!Object.values(OWNER_ACTIONS).includes(normalizedAction)) {
      throw new Error('Ogiltig owner action.');
    }

    if (!Array.isArray(state.evaluations)) {
      state.evaluations = [];
    }
    const evaluation =
      state.evaluations.find((item) => item.id === normalizedEvaluationId) || null;
    if (!evaluation) throw new Error('Riskutvärderingen hittades inte.');
    if (evaluation.tenantId !== normalizedTenantId) {
      throw new Error('Du har inte åtkomst till denna riskutvärdering.');
    }

    const actionItem = {
      id: crypto.randomUUID(),
      action: normalizedAction,
      note: normalizeText(note),
      actorUserId,
      createdAt: nowIso(),
    };

    if (!Array.isArray(evaluation.ownerActions)) evaluation.ownerActions = [];
    evaluation.ownerActions.push(actionItem);
    evaluation.ownerDecision = mapOwnerActionToDecision(normalizedAction);
    evaluation.updatedAt = actionItem.createdAt;

    await save();
    return toSafeEvaluation(evaluation);
  }

  async function autoEscalateBreachedIncidents({
    tenantId,
    actorUserId = 'scheduler',
    note = AUTO_ESCALATION_NOTE,
    limit = 50,
  } = {}) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const normalizedActorUserId = normalizeText(actorUserId);
    const normalizedNote = normalizeText(note) || AUTO_ESCALATION_NOTE;
    const maxEscalations = Math.max(1, Math.min(500, Number(limit) || 50));

    if (!Array.isArray(state.evaluations)) state.evaluations = [];

    const candidates = [];
    let scanned = 0;

    for (const evaluation of state.evaluations) {
      if (normalizedTenantId && evaluation.tenantId !== normalizedTenantId) continue;
      scanned += 1;

      const incident = buildIncidentFromEvaluation(evaluation);
      if (!incident) continue;

      const ownerDecision = String(evaluation.ownerDecision || 'pending').toLowerCase();
      if (!INCIDENT_OPEN_OWNER_DECISIONS.has(ownerDecision)) continue;

      const slaState = String(incident?.sla?.state || '').toLowerCase();
      if (slaState !== 'breached') continue;

      candidates.push({
        evaluation,
        incident,
        ownerDecision,
      });
    }

    candidates.sort((a, b) => compareIncidents(a.incident, b.incident));
    const selected = candidates.slice(0, maxEscalations);
    const escalated = [];

    for (const candidate of selected) {
      const { evaluation, incident, ownerDecision } = candidate;
      const createdAt = nowIso();
      const actionItem = {
        id: crypto.randomUUID(),
        action: OWNER_ACTIONS.ESCALATE,
        note: normalizedNote,
        actorUserId: normalizedActorUserId || null,
        createdAt,
      };

      if (!Array.isArray(evaluation.ownerActions)) evaluation.ownerActions = [];
      evaluation.ownerActions.push(actionItem);
      evaluation.ownerDecision = mapOwnerActionToDecision(OWNER_ACTIONS.ESCALATE);
      evaluation.updatedAt = createdAt;

      escalated.push({
        incidentId: String(incident.id || ''),
        evaluationId: String(evaluation.id || ''),
        severity: String(incident.severity || ''),
        previousOwnerDecision: ownerDecision,
        slaDeadline: incident?.sla?.deadline || null,
        breachedByMs: Math.max(0, -Number(incident?.sla?.remainingMs || 0)),
      });
    }

    if (escalated.length > 0) {
      await save();
    }

    return {
      tenantId: normalizedTenantId || null,
      scanned,
      eligibleBreachedOpen: candidates.length,
      escalatedCount: escalated.length,
      limit: maxEscalations,
      truncated: candidates.length > selected.length,
      escalated,
      generatedAt: nowIso(),
    };
  }

  async function autoAssignOpenIncidentOwners({
    tenantId,
    ownerUserId,
    actorUserId = 'scheduler',
    note = AUTO_ASSIGN_OWNER_NOTE,
    limit = 100,
  } = {}) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const normalizedOwnerUserId = normalizeText(ownerUserId);
    const normalizedActorUserId = normalizeText(actorUserId);
    const normalizedNote = normalizeText(note) || AUTO_ASSIGN_OWNER_NOTE;
    const maxAssignments = Math.max(1, Math.min(500, Number(limit) || 100));

    if (!normalizedOwnerUserId) {
      return {
        tenantId: normalizedTenantId || null,
        scanned: 0,
        eligibleOpenUnowned: 0,
        assignedCount: 0,
        limit: maxAssignments,
        truncated: false,
        skipped: true,
        reason: 'owner_user_id_missing',
        assigned: [],
        generatedAt: nowIso(),
      };
    }

    if (!Array.isArray(state.evaluations)) state.evaluations = [];

    const candidates = [];
    let scanned = 0;

    for (const evaluation of state.evaluations) {
      if (normalizedTenantId && evaluation.tenantId !== normalizedTenantId) continue;
      scanned += 1;

      const incident = buildIncidentFromEvaluation(evaluation);
      if (!incident) continue;
      if (!isIncidentOpenStatus(incident.status)) continue;
      if (normalizeText(incident?.owner?.userId)) continue;

      candidates.push({
        evaluation,
        incident,
      });
    }

    candidates.sort((a, b) => compareIncidents(a.incident, b.incident));
    const selected = candidates.slice(0, maxAssignments);
    const assigned = [];

    for (const candidate of selected) {
      const { evaluation, incident } = candidate;
      const createdAt = nowIso();
      const actionItem = {
        id: crypto.randomUUID(),
        action: 'assign_owner',
        note: normalizedNote,
        actorUserId: normalizedOwnerUserId,
        createdAt,
        metadata: {
          assignedBy: normalizedActorUserId || 'scheduler',
        },
      };

      if (!Array.isArray(evaluation.ownerActions)) evaluation.ownerActions = [];
      evaluation.ownerActions.push(actionItem);
      evaluation.updatedAt = createdAt;

      assigned.push({
        incidentId: String(incident.id || ''),
        evaluationId: String(evaluation.id || ''),
        severity: String(incident.severity || ''),
        assignedOwnerUserId: normalizedOwnerUserId,
      });
    }

    if (assigned.length > 0) {
      await save();
    }

    return {
      tenantId: normalizedTenantId || null,
      scanned,
      eligibleOpenUnowned: candidates.length,
      assignedCount: assigned.length,
      limit: maxAssignments,
      truncated: candidates.length > selected.length,
      assigned,
      generatedAt: nowIso(),
    };
  }

  async function summarizeRisk({
    tenantId,
    minRiskLevel = 1,
  }) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const minimum = Math.max(1, Math.min(5, Number(minRiskLevel) || 1));
    const evaluations = Array.isArray(state.evaluations) ? state.evaluations : [];
    const filtered = evaluations.filter((evaluation) => {
      if (normalizedTenantId && evaluation.tenantId !== normalizedTenantId) return false;
      return Number(evaluation.riskLevel || 0) >= minimum;
    });

    const byLevel = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const byDecision = {
      allow: 0,
      review_required: 0,
      blocked: 0,
    };
    const byOwnerDecision = {};
    const reasonCounts = new Map();

    for (const evaluation of filtered) {
      const level = String(Math.max(1, Math.min(5, Number(evaluation.riskLevel) || 1)));
      byLevel[level] = (byLevel[level] || 0) + 1;

      const decision = String(evaluation.decision || 'allow');
      byDecision[decision] = (byDecision[decision] || 0) + 1;

      const ownerDecision = String(evaluation.ownerDecision || 'pending');
      byOwnerDecision[ownerDecision] = (byOwnerDecision[ownerDecision] || 0) + 1;

      for (const reasonCode of Array.isArray(evaluation.reasonCodes) ? evaluation.reasonCodes : []) {
        reasonCounts.set(reasonCode, (reasonCounts.get(reasonCode) || 0) + 1);
      }
    }

    const topReasonCodes = Array.from(reasonCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([reasonCode, count]) => ({ reasonCode, count }));

    const highCriticalOpen = filtered
      .filter((evaluation) => Number(evaluation.riskLevel || 0) >= 4)
      .filter((evaluation) => {
        const ownerDecision = String(evaluation.ownerDecision || 'pending').toLowerCase();
        return INCIDENT_OPEN_OWNER_DECISIONS.has(ownerDecision);
      })
      .sort((a, b) => String(b.evaluatedAt).localeCompare(String(a.evaluatedAt)))
      .slice(0, 20)
      .map((evaluation) => toSafeEvaluation(evaluation));

    return {
      tenantId: normalizedTenantId || null,
      minRiskLevel: minimum,
      totals: {
        evaluations: filtered.length,
        highCriticalOpen: highCriticalOpen.length,
      },
      byLevel,
      byDecision,
      byOwnerDecision,
      topReasonCodes,
      highCriticalOpen,
      generatedAt: nowIso(),
    };
  }

  async function listIncidents({
    tenantId,
    status = 'open',
    severity = '',
    limit = 100,
    sinceDays = 0,
    search = '',
    ownerUserId = '',
  } = {}) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const normalizedStatus = normalizeIncidentStatus(status) || 'open';
    const normalizedSeverity = normalizeIncidentSeverity(severity);
    const normalizedSearch = normalizeText(search).toLowerCase();
    const normalizedOwnerUserId = normalizeText(ownerUserId);
    const max = Math.max(1, Math.min(500, Number(limit) || 100));
    const sinceWindowDays = Math.max(0, Math.min(365, Number(sinceDays) || 0));
    const sinceWindowMs =
      sinceWindowDays > 0 ? Date.now() - sinceWindowDays * 24 * 60 * 60 * 1000 : null;

    const evaluations = Array.isArray(state.evaluations) ? state.evaluations : [];
    const incidents = [];

    for (const evaluation of evaluations) {
      if (normalizedTenantId && evaluation.tenantId !== normalizedTenantId) continue;
      const incident = buildIncidentFromEvaluation(evaluation);
      if (!incident) continue;

      if (normalizedStatus !== 'all' && incident.status !== normalizedStatus) continue;
      if (normalizedSeverity && incident.severity !== normalizedSeverity) continue;
      if (normalizedOwnerUserId && String(incident?.owner?.userId || '') !== normalizedOwnerUserId) {
        continue;
      }
      if (sinceWindowMs !== null) {
        const ts = Date.parse(String(incident.updatedAt || incident.openedAt || ''));
        if (!Number.isFinite(ts) || ts < sinceWindowMs) continue;
      }
      if (normalizedSearch) {
        const haystack = [
          incident.id,
          incident.sourceEvaluationId,
          incident.templateId,
          incident.templateVersionId,
          incident.category,
          incident.status,
          incident.severity,
          incident.ownerDecision,
          incident.owner?.userId,
          ...(Array.isArray(incident.reasonCodes) ? incident.reasonCodes : []),
        ]
          .map((item) => String(item || '').toLowerCase())
          .join(' ');
        if (!haystack.includes(normalizedSearch)) continue;
      }

      incidents.push(incident);
    }

    incidents.sort(compareIncidents);
    return incidents.slice(0, max).map((incident) => toSafeIncident(incident));
  }

  async function getIncident({
    tenantId,
    incidentId,
  }) {
    const normalizedIncidentId = normalizeText(incidentId);
    if (!normalizedIncidentId) return null;
    const incidents = await listIncidents({
      tenantId,
      status: 'all',
      limit: 1000,
    });
    return incidents.find((incident) => incident.id === normalizedIncidentId) || null;
  }

  async function summarizeIncidents({
    tenantId,
  } = {}) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const evaluations = Array.isArray(state.evaluations) ? state.evaluations : [];
    const incidents = [];

    for (const evaluation of evaluations) {
      if (normalizedTenantId && evaluation.tenantId !== normalizedTenantId) continue;
      const incident = buildIncidentFromEvaluation(evaluation);
      if (!incident) continue;
      incidents.push(incident);
    }

    incidents.sort(compareIncidents);

    const bySeverity = {
      L4: 0,
      L5: 0,
    };
    const byStatus = {
      open: 0,
      escalated: 0,
      resolved: 0,
    };
    const bySlaState = {
      ok: 0,
      warn: 0,
      critical: 0,
      breached: 0,
      resolved: 0,
    };

    let openUnresolved = 0;
    let breachedOpen = 0;

    for (const incident of incidents) {
      if (Object.prototype.hasOwnProperty.call(bySeverity, incident.severity)) {
        bySeverity[incident.severity] += 1;
      }
      if (Object.prototype.hasOwnProperty.call(byStatus, incident.status)) {
        byStatus[incident.status] += 1;
      }

      const slaState = String(incident?.sla?.state || '').toLowerCase();
      if (Object.prototype.hasOwnProperty.call(bySlaState, slaState)) {
        bySlaState[slaState] += 1;
      }

      if (isIncidentOpenStatus(incident.status)) {
        openUnresolved += 1;
        if (slaState === 'breached') breachedOpen += 1;
      }
    }

    const nextSlaDeadline = incidents
      .filter((incident) => isIncidentOpenStatus(incident.status))
      .map((incident) => incident?.sla?.deadline || null)
      .filter((value) => Boolean(value))
      .sort((a, b) => String(a).localeCompare(String(b)))[0] || null;

    return {
      tenantId: normalizedTenantId || null,
      totals: {
        incidents: incidents.length,
        openUnresolved,
        breachedOpen,
      },
      bySeverity,
      byStatus,
      bySlaState,
      nextSlaDeadline,
      openTop: incidents
        .filter((incident) => isIncidentOpenStatus(incident.status))
        .slice(0, 20)
        .map((incident) => toSafeIncident(incident)),
      generatedAt: nowIso(),
    };
  }

  async function ensureTemplateTenant(templateId, tenantId) {
    const template = getRawTemplate(templateId);
    if (!template) return { exists: false, allowed: false, template: null };
    const normalizedTenantId = normalizeTenantId(tenantId);
    return {
      exists: true,
      allowed: template.tenantId === normalizedTenantId,
      template: toSafeTemplate(template),
    };
  }

  await save();

  return {
    filePath,
    createTemplate,
    listTemplates,
    getTemplate,
    listActiveVersionSnapshots,
    listTemplateVersions,
    getTemplateVersion,
    createDraftVersion,
    updateDraftVersion,
    evaluateVersion,
    activateVersion,
    archiveVersion,
    cloneVersion,
    listEvaluations,
    getEvaluation,
    addOwnerAction,
    autoEscalateBreachedIncidents,
    autoAssignOpenIncidentOwners,
    summarizeRisk,
    listIncidents,
    getIncident,
    summarizeIncidents,
    ensureTemplateTenant,
  };
}

module.exports = {
  createTemplateStore,
  OWNER_ACTIONS,
};
