'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

const CFO_AGENT_NAME = 'CFO';

const cfoCostAdvisorInputSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    windowDays: { type: 'integer', minimum: 1, maximum: 90 },
    includeProjections: { type: 'boolean' },
  },
});

const cfoCostAdvisorOutputSchema = Object.freeze({
  type: 'object',
  required: ['data', 'metadata', 'warnings'],
  additionalProperties: false,
  properties: {
    data: {
      type: 'object',
      required: ['financeGovernance', 'executiveSummary', 'generatedAt'],
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

function composeCfoCostAdvisor({
  financeOutput = null,
  channel = 'admin',
  tenantId = '',
  correlationId = '',
} = {}) {
  const financeData = asObject(asObject(financeOutput).data);
  const financeWarnings = asArray(asObject(financeOutput).warnings);
  const costSummary = asObject(financeData.costSummary);
  const alerts = asArray(financeData.alerts);

  const executiveSummary = [
    `CFO Cost Advisor.`,
    normalizeText(financeData.summary) || 'Ingen kostnadsdata tillganglig.',
    alerts.length > 0
      ? `Varningar: ${alerts.map((a) => a.message).join(' | ')}`
      : '',
  ].filter(Boolean).join(' ');

  return {
    data: {
      financeGovernance: financeData,
      costSummary,
      alerts,
      executiveSummary,
      generatedAt: new Date().toISOString(),
    },
    metadata: {
      agent: CFO_AGENT_NAME,
      version: '1.0.0',
      channel: normalizeText(channel) || 'admin',
      tenantId: normalizeText(tenantId) || 'unknown',
      correlationId: normalizeText(correlationId) || '',
      sources: ['FinanceGovernance'],
    },
    warnings: Array.from(
      new Set(financeWarnings.map((w) => normalizeText(w)).filter(Boolean))
    ).slice(0, 20),
  };
}

module.exports = {
  CFO_AGENT_NAME,
  cfoCostAdvisorInputSchema,
  cfoCostAdvisorOutputSchema,
  composeCfoCostAdvisor,
};
