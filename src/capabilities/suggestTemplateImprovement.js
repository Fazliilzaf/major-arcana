'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');

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

function scoreStaleness(updatedAt) {
  if (!updatedAt) return 100;
  const ageMs = Date.now() - Date.parse(updatedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0) return 0;
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  if (ageDays > 90) return 100;
  if (ageDays > 30) return 70;
  if (ageDays > 14) return 40;
  return 10;
}

function scoreRiskGap(template) {
  const riskLevel = toNumber(template?.riskLevel, 0);
  const decision = normalizeText(template?.riskDecision).toLowerCase();
  if (decision === 'blocked') return 90;
  if (decision === 'review_required') return 60;
  if (riskLevel >= 4) return 50;
  if (riskLevel >= 3) return 25;
  return 0;
}

function scoreVariableUsage(template) {
  const used = asArray(template?.variablesUsed).length;
  const allowed = asArray(template?.variablesAllowed).length;
  if (allowed === 0) return 0;
  const ratio = used / allowed;
  if (ratio < 0.3) return 60;
  if (ratio < 0.5) return 30;
  return 0;
}

function buildSuggestion({ template, score, reasons, recommendedAction }) {
  return {
    templateId: normalizeText(template?.templateId || template?.id),
    templateName: normalizeText(template?.name),
    category: normalizeText(template?.category),
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons: asArray(reasons)
      .map((r) => normalizeText(r))
      .filter(Boolean),
    recommendedAction: normalizeText(recommendedAction),
  };
}

class SuggestTemplateImprovementCapability extends BaseCapability {
  static name = 'SuggestTemplateImprovement';
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
    properties: {
      maxSuggestions: { type: 'integer', minimum: 1, maximum: 10 },
      minScore: { type: 'number', minimum: 0, maximum: 100 },
    },
  };

  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: {
      data: {
        type: 'object',
        required: ['suggestions', 'summary', 'generatedAt'],
        additionalProperties: true,
        properties: {
          suggestions: { type: 'array', maxItems: 10 },
          summary: { type: 'string', maxLength: 500 },
          generatedAt: { type: 'string', maxLength: 50 },
        },
      },
      metadata: { type: 'object', additionalProperties: true },
      warnings: { type: 'array', maxItems: 20 },
    },
  };

  async execute(context = {}) {
    const safeContext = context && typeof context === 'object' ? context : {};
    const input =
      safeContext.input && typeof safeContext.input === 'object' ? safeContext.input : {};
    const snapshot =
      safeContext.systemStateSnapshot && typeof safeContext.systemStateSnapshot === 'object'
        ? safeContext.systemStateSnapshot
        : {};

    const templates = asArray(snapshot.templates || snapshot.latestTemplateChanges);
    const maxSuggestions = Math.max(1, Math.min(10, toNumber(input.maxSuggestions, 5)));
    const minScore = Math.max(0, toNumber(input.minScore, 20));
    const warnings = [];

    if (templates.length === 0) {
      warnings.push('Inga mallar hittades i snapshot.');
    }

    const candidates = templates.map((template) => {
      const reasons = [];
      let score = 0;

      const staleness = scoreStaleness(template?.updatedAt);
      if (staleness >= 40) {
        reasons.push(
          `Mall har inte uppdaterats pa ${staleness >= 70 ? 'over 30' : 'over 14'} dagar.`
        );
        score += staleness * 0.3;
      }

      const riskGap = scoreRiskGap(template);
      if (riskGap > 0) {
        reasons.push(
          `Risknivaindikation: ${normalizeText(template?.riskDecision) || 'forhojd risk'}.`
        );
        score += riskGap * 0.4;
      }

      const variableGap = scoreVariableUsage(template);
      if (variableGap > 0) {
        reasons.push('Mallen underutnyttjar tillgangliga variabler.');
        score += variableGap * 0.3;
      }

      const bodyLength = normalizeText(template?.content || template?.bodyText).length;
      if (bodyLength > 0 && bodyLength < 80) {
        reasons.push('Mallinnehallet ar kort — kan behova mer substans.');
        score += 15;
      }

      return buildSuggestion({
        template,
        score,
        reasons,
        recommendedAction:
          reasons.length > 0
            ? 'Granska mallen och overvaeg uppdatering baserat pa identifierade forbaettringspunkter.'
            : 'Mallen ser aktuell ut — inga aatgaerder kravs.',
      });
    });

    const suggestions = candidates
      .filter((s) => s.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSuggestions);

    const summary =
      suggestions.length > 0
        ? `${suggestions.length} mallar identifierade for forbaettring. Hogst prioriterad: ${suggestions[0].templateName || suggestions[0].templateId}.`
        : 'Inga mallar med tillraeckligt hog forbaettringsscore hittades.';

    return {
      data: {
        suggestions,
        summary,
        analyzedCount: templates.length,
        generatedAt: new Date().toISOString(),
      },
      metadata: {
        capability: SuggestTemplateImprovementCapability.name,
        version: SuggestTemplateImprovementCapability.version,
        channel: normalizeText(safeContext.channel) || 'admin',
        tenantId: normalizeText(safeContext.tenantId) || 'unknown',
      },
      warnings,
    };
  }
}

module.exports = {
  SuggestTemplateImprovementCapability,
};
