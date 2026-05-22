'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');
const { summarizeMarketingPerformance } = require('../ops/cmoMarketingMetrics');
const { mergeMarketingPerformanceFromConnectors, resolveAppConfig } = require('../ops/cmoMarketingConnectors');
const { toNumber, asObject, capabilityMeta, normalizeText } = require('./cmoCapabilityHelpers');

class SummarizeMarketingPerformanceCapability extends BaseCapability {
  static name = 'SummarizeMarketingPerformance';
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
    const windowDays = Math.max(1, Math.min(90, toNumber(input.windowDays, 7)));
    const forceConnectorRefresh = input.forceConnectorRefresh === true;
    const appConfig = resolveAppConfig(snapshot.appConfig || safeContext.config || {});

    const hydration = await mergeMarketingPerformanceFromConnectors(snapshot, {
      config: appConfig,
      tenantId: normalizeText(safeContext.tenantId),
      forceRefresh: forceConnectorRefresh,
      window: `${windowDays}d`,
    });
    if (hydration.merged) {
      warnings.push(`Connector hydration: ${hydration.connectorResults.filter((item) => item.status === 'ok').length} kanaler.`);
    }

    const summary = summarizeMarketingPerformance(hydration.snapshot, { windowDays });
    if (summary.status === 'insufficient_data') {
      warnings.push(summary.recommendation);
    }

    return {
      data: summary,
      metadata: {
        ...capabilityMeta(SummarizeMarketingPerformanceCapability, safeContext),
        readOnly: true,
      },
      warnings,
    };
  }
}

module.exports = {
  SummarizeMarketingPerformanceCapability,
};
