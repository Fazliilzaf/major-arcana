'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

const CAO_AGENT_NAME = 'CAO';

const caoTemplateAdvisorInputSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    maxSuggestions: { type: 'integer', minimum: 1, maximum: 10 },
    strictDisclaimers: { type: 'boolean' },
  },
});

const caoTemplateAdvisorOutputSchema = Object.freeze({
  type: 'object',
  required: ['data', 'metadata', 'warnings'],
  additionalProperties: false,
  properties: {
    data: {
      type: 'object',
      required: [
        'templateSuggestions',
        'disclaimerResults',
        'variableOptimization',
        'executiveSummary',
        'generatedAt',
      ],
      additionalProperties: true,
    },
    metadata: {
      type: 'object',
      required: ['agent', 'version', 'channel'],
      additionalProperties: true,
    },
    warnings: {
      type: 'array',
      maxItems: 20,
      items: { type: 'string', maxLength: 240 },
    },
  },
});

function composeCaoTemplateAdvisor({
  suggestOutput = null,
  disclaimerOutput = null,
  variableOutput = null,
  channel = 'admin',
  tenantId = '',
  correlationId = '',
} = {}) {
  const suggestData = asObject(asObject(suggestOutput).data);
  const disclaimerData = asObject(asObject(disclaimerOutput).data);
  const variableData = asObject(asObject(variableOutput).data);
  const suggestWarnings = asArray(asObject(suggestOutput).warnings);
  const disclaimerWarnings = asArray(asObject(disclaimerOutput).warnings);
  const variableWarnings = asArray(asObject(variableOutput).warnings);

  const templateSuggestions = asArray(suggestData.suggestions).slice(0, 10);
  const disclaimerResults = {
    compliantCount: Number(disclaimerData.compliantCount) || 0,
    totalCount: Number(disclaimerData.totalCount) || 0,
    violationCount: Number(disclaimerData.violationCount) || 0,
    nonCompliantTemplates: asArray(disclaimerData.results)
      .filter((r) => !r.compliant)
      .slice(0, 5)
      .map((r) => ({
        templateId: normalizeText(r.templateId),
        templateName: normalizeText(r.templateName),
        missing: asArray(r.disclaimersMissing),
        violations: asArray(r.violations),
      })),
  };
  const variableOptimization = {
    improvableCount: Number(variableData.improvableCount) || 0,
    totalAnalyzed: Number(variableData.totalAnalyzed) || 0,
    averageScore: Number(variableData.averageOptimizationScore) || 100,
    topImprovable: asArray(variableData.results)
      .slice(0, 3)
      .map((r) => ({
        templateId: normalizeText(r.templateId),
        templateName: normalizeText(r.templateName),
        suggestions: asArray(r.suggestions).slice(0, 2),
      })),
  };

  const segments = [
    `CAO Template Advisor.`,
    `${templateSuggestions.length} mallar foreslagna for forbaettring.`,
    `Disclaimers: ${disclaimerResults.compliantCount}/${disclaimerResults.totalCount} godkaenda, ${disclaimerResults.violationCount} regelbrott.`,
    `Variabeloptimering: ${variableOptimization.improvableCount} mallar kan forbattras (snitt ${variableOptimization.averageScore}%).`,
  ];
  const executiveSummary = segments.join(' ');

  const warnings = Array.from(
    new Set(
      [...suggestWarnings, ...disclaimerWarnings, ...variableWarnings]
        .map((item) => normalizeText(item))
        .filter(Boolean)
    )
  ).slice(0, 20);

  return {
    data: {
      templateSuggestions,
      disclaimerResults,
      variableOptimization,
      executiveSummary,
      generatedAt: new Date().toISOString(),
    },
    metadata: {
      agent: CAO_AGENT_NAME,
      version: '1.0.0',
      channel: normalizeText(channel) || 'admin',
      tenantId: normalizeText(tenantId) || 'unknown',
      correlationId: normalizeText(correlationId) || '',
      sources: ['SuggestTemplateImprovement', 'ValidateDisclaimers', 'OptimizeVariables'],
    },
    warnings,
  };
}

module.exports = {
  CAO_AGENT_NAME,
  caoTemplateAdvisorInputSchema,
  caoTemplateAdvisorOutputSchema,
  composeCaoTemplateAdvisor,
};
