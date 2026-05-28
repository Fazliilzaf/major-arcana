'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');
const {
  summarizeMarketingPerformance,
  buildMarketingBrief,
} = require('../ops/cmoMarketingMetrics');
const { normalizeText, toNumber, asObject, capabilityMeta } = require('./cmoCapabilityHelpers');
const { groundingReferences } = require('../ops/knowledgeGrounding');

class GenerateMarketingBriefCapability extends BaseCapability {
  static name = 'GenerateMarketingBrief';
  static version = '1.0.0';

  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];

  static requiresInputRisk = false;
  static requiresOutputRisk = false;
  static requiresPolicyFloor = false;

  static persistStrategy = 'analysis';
  static auditStrategy = 'always';

  static inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      period: { type: 'string', enum: ['weekly', 'monthly'] },
      windowDays: { type: 'integer', minimum: 1, maximum: 90 },
    },
  };

  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: {
      data: { type: 'object', additionalProperties: true },
      metadata: { type: 'object', additionalProperties: true },
      warnings: { type: 'array', maxItems: 20 },
    },
  };

  async execute(context = {}) {
    const safeContext = asObject(context);
    const input = asObject(safeContext.input);
    const snapshot = asObject(safeContext.systemStateSnapshot);
    const warnings = [];
    const period = normalizeText(input.period).toLowerCase() || 'weekly';
    const windowDays = Math.max(
      1,
      Math.min(90, toNumber(input.windowDays, period === 'monthly' ? 30 : 7))
    );

    const performanceSummary =
      asObject(snapshot.marketingPerformanceSummary).outputType === 'MarketingPerformanceSummary'
        ? asObject(snapshot.marketingPerformanceSummary)
        : summarizeMarketingPerformance(snapshot, { windowDays });

    const brief = buildMarketingBrief(performanceSummary, { period });
    if (brief.status === 'insufficient_data') {
      warnings.push(brief.recommendation);
    }

    const references = await groundingReferences('marketing rollout connectors kampanj strategi runbook');

    return {
      data: { ...brief, references },
      metadata: {
        ...capabilityMeta(GenerateMarketingBriefCapability, safeContext),
        readOnly: true,
        period,
      },
      warnings,
    };
  }
}

module.exports = {
  GenerateMarketingBriefCapability,
};
