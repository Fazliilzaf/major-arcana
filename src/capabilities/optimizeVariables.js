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

function extractVariablesFromContent(content = '') {
  const text = normalizeText(content);
  if (!text) return [];
  const matches = text.match(/\{\{([^}]+)\}\}/g);
  if (!matches) return [];
  return Array.from(
    new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, '').trim()).filter(Boolean))
  );
}

class OptimizeVariablesCapability extends BaseCapability {
  static name = 'OptimizeVariables';
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
      maxResults: { type: 'integer', minimum: 1, maximum: 20 },
    },
  };

  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: {
      data: {
        type: 'object',
        required: ['results', 'summary', 'generatedAt'],
        additionalProperties: true,
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
    const variableWhitelist =
      snapshot.variableWhitelist && typeof snapshot.variableWhitelist === 'object'
        ? snapshot.variableWhitelist
        : {};
    const maxResults = Math.max(1, Math.min(20, toNumber(input.maxResults, 10)));
    const warnings = [];

    if (templates.length === 0) {
      warnings.push('Inga mallar hittades i snapshot.');
    }

    const results = templates.map((template) => {
      const category = normalizeText(template?.category).toUpperCase();
      const content = normalizeText(template?.content || template?.bodyText);
      const usedVariables = extractVariablesFromContent(content);
      const declaredUsed = asArray(template?.variablesUsed);
      const allUsed = Array.from(new Set([...usedVariables, ...declaredUsed]));
      const allowedForCategory = asArray(variableWhitelist[category]);
      const unused = allowedForCategory.filter((v) => !allUsed.includes(v));
      const unknown = allUsed.filter(
        (v) => allowedForCategory.length > 0 && !allowedForCategory.includes(v)
      );

      const suggestions = [];

      if (unused.length > 0) {
        suggestions.push({
          type: 'add_variable',
          description: `Mallen anvander inte ${unused.length} tillgangliga variabler: ${unused.slice(0, 5).join(', ')}.`,
          variables: unused.slice(0, 5),
          impact: unused.length >= 3 ? 'high' : 'medium',
        });
      }

      if (unknown.length > 0) {
        suggestions.push({
          type: 'remove_unknown',
          description: `Mallen refererar ${unknown.length} okanda variabler: ${unknown.slice(0, 5).join(', ')}.`,
          variables: unknown.slice(0, 5),
          impact: 'high',
        });
      }

      if (allUsed.length === 0 && content.length > 0) {
        suggestions.push({
          type: 'no_personalization',
          description:
            'Mallen innehaller ingen personalisering — overvaeg att lagga till variabler.',
          variables: allowedForCategory.slice(0, 3),
          impact: 'medium',
        });
      }

      return {
        templateId: normalizeText(template?.templateId || template?.id),
        templateName: normalizeText(template?.name),
        category,
        usedCount: allUsed.length,
        allowedCount: allowedForCategory.length,
        unusedCount: unused.length,
        unknownCount: unknown.length,
        suggestions,
        optimizationScore:
          suggestions.length === 0
            ? 100
            : Math.max(
                0,
                100 - suggestions.reduce((sum, s) => sum + (s.impact === 'high' ? 30 : 15), 0)
              ),
      };
    });

    const improvable = results
      .filter((r) => r.suggestions.length > 0)
      .sort((a, b) => a.optimizationScore - b.optimizationScore)
      .slice(0, maxResults);

    const avgScore =
      results.length > 0
        ? Math.round(results.reduce((sum, r) => sum + r.optimizationScore, 0) / results.length)
        : 100;

    const summary =
      improvable.length > 0
        ? `${improvable.length}/${results.length} mallar har forbaettringspotential. Genomsnittlig variabeloptimering: ${avgScore}%.`
        : `Alla ${results.length} mallar har optimal variabelanvandning.`;

    return {
      data: {
        results: improvable,
        totalAnalyzed: results.length,
        improvableCount: improvable.length,
        averageOptimizationScore: avgScore,
        summary,
        generatedAt: new Date().toISOString(),
      },
      metadata: {
        capability: OptimizeVariablesCapability.name,
        version: OptimizeVariablesCapability.version,
        channel: normalizeText(safeContext.channel) || 'admin',
        tenantId: normalizeText(safeContext.tenantId) || 'unknown',
      },
      warnings,
    };
  }
}

module.exports = {
  OptimizeVariablesCapability,
};
