const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const { isValidCategory, normalizeCategory } = require('./constants');

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

  const candidates = state.evaluations
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
    limit = 100,
    ownerDecision = '',
    templateId = '',
    templateVersionId = '',
  }) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const minimum = Math.max(0, Number(minRiskLevel) || 0);
    const max = Math.max(1, Math.min(500, Number(limit) || 100));
    const normalizedOwnerDecision = normalizeText(ownerDecision).toLowerCase();
    const normalizedTemplateId = normalizeText(templateId);
    const normalizedTemplateVersionId = normalizeText(templateVersionId);

    const items = state.evaluations
      .filter((evaluation) => {
        if (normalizedTenantId && evaluation.tenantId !== normalizedTenantId) return false;
        if (normalizedTemplateId && evaluation.templateId !== normalizedTemplateId) return false;
        if (
          normalizedTemplateVersionId &&
          evaluation.templateVersionId !== normalizedTemplateVersionId
        ) {
          return false;
        }
        if (Number(evaluation.riskLevel || 0) < minimum) return false;
        if (
          normalizedOwnerDecision &&
          String(evaluation.ownerDecision || 'pending').toLowerCase() !== normalizedOwnerDecision
        ) {
          return false;
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

    const evaluation =
      state.evaluations.find((item) => item.id === normalizedEvaluationId) || null;
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

  async function summarizeRisk({
    tenantId,
    minRiskLevel = 1,
  }) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const minimum = Math.max(1, Math.min(5, Number(minRiskLevel) || 1));
    const filtered = state.evaluations.filter((evaluation) => {
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
        const ownerDecision = String(evaluation.ownerDecision || 'pending');
        return ['pending', 'revision_requested'].includes(ownerDecision);
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
    summarizeRisk,
    ensureTemplateTenant,
  };
}

module.exports = {
  createTemplateStore,
  OWNER_ACTIONS,
};
