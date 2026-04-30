'use strict';

/**
 * Tenant Usage Metrics — capability för att aggregera användning per tenant (MT6).
 *
 * Returnerar:
 *   • capabilityRunsTotal — totalt antal capability-anrop
 *   • capabilityRunsByName — per capability-namn
 *   • mailboxReadsApprox — approximation av mailbox-fetcher
 *   • storageBytesApprox — approximation av lagringsstorlek
 *
 * Foundation för MT8 billing — kvota mot plan-tier.
 *
 * Stub-implementation som returnerar 0:or där metrics-pipelinen ännu inte
 * exponerar tenant-specifika räkningar. Framtida iteration läser från
 * runtimeMetricsStore som finns i src/observability/.
 */

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');

function normalizeText(value) { return typeof value === 'string' ? value.trim() : ''; }
function asObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }

class TenantUsageMetricsCapability extends BaseCapability {
  static name = 'TenantUsageMetrics';
  static version = '1.0.0';
  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];
  static requiresInputRisk = false;
  static requiresOutputRisk = false;
  static requiresPolicyFloor = false;
  static persistStrategy = 'none';
  static auditStrategy = 'always';

  static inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      tenantId: { type: 'string', minLength: 0, maxLength: 80 },
      windowDays: { type: 'integer', minimum: 1, maximum: 365 },
    },
  };

  static outputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['data', 'metadata', 'warnings'],
    properties: {
      data: {
        type: 'object',
        additionalProperties: false,
        required: ['tenantId', 'windowDays', 'totals', 'collectedAt'],
        properties: {
          tenantId: { type: 'string', maxLength: 80 },
          windowDays: { type: 'integer', minimum: 1, maximum: 365 },
          collectedAt: { type: 'string', maxLength: 64 },
          totals: {
            type: 'object',
            additionalProperties: false,
            properties: {
              capabilityRunsTotal: { type: 'integer', minimum: 0, maximum: 10000000 },
              capabilityRunsByName: {
                type: 'object',
                additionalProperties: { type: 'integer', minimum: 0, maximum: 1000000 },
              },
              mailboxReadsApprox: { type: 'integer', minimum: 0, maximum: 10000000 },
              storageBytesApprox: { type: 'integer', minimum: 0, maximum: 1000000000000 },
            },
          },
        },
      },
      metadata: {
        type: 'object',
        additionalProperties: false,
        required: ['capability', 'version', 'channel', 'tenantId'],
        properties: {
          capability: { type: 'string', minLength: 1, maxLength: 120 },
          version: { type: 'string', minLength: 1, maxLength: 40 },
          channel: { type: 'string', minLength: 1, maxLength: 40 },
          tenantId: { type: 'string', minLength: 1, maxLength: 120 },
          requestId: { type: 'string', maxLength: 120 },
          correlationId: { type: 'string', maxLength: 120 },
        },
      },
      warnings: {
        type: 'array',
        maxItems: 8,
        items: { type: 'string', minLength: 1, maxLength: 200 },
      },
    },
  };

  async execute(context = {}) {
    const safeContext = asObject(context);
    const input = asObject(safeContext.input);
    const tenantId = normalizeText(input.tenantId) || normalizeText(safeContext.tenantId) || 'okand';
    const windowDays = Math.max(1, Math.min(365, Number(input.windowDays) || 30));
    const runtimeMetricsStore = safeContext.runtimeMetricsStore;
    const warnings = [];
    const totals = {
      capabilityRunsTotal: 0,
      capabilityRunsByName: {},
      mailboxReadsApprox: 0,
      storageBytesApprox: 0,
    };

    if (runtimeMetricsStore && typeof runtimeMetricsStore.getTenantUsage === 'function') {
      try {
        const usage = await runtimeMetricsStore.getTenantUsage(tenantId, { windowDays });
        if (usage) {
          totals.capabilityRunsTotal = Math.min(10000000, Number(usage.capabilityRunsTotal) || 0);
          totals.capabilityRunsByName = asObject(usage.capabilityRunsByName);
          totals.mailboxReadsApprox = Math.min(10000000, Number(usage.mailboxReadsApprox) || 0);
          totals.storageBytesApprox = Math.min(1000000000000, Number(usage.storageBytesApprox) || 0);
        }
      } catch (error) {
        warnings.push(`Kunde inte hämta usage-metrics: ${error.message || 'okänt'}`);
      }
    } else {
      warnings.push('runtimeMetricsStore.getTenantUsage saknas — returnerar 0:or (stub).');
    }

    return {
      data: {
        tenantId,
        windowDays,
        collectedAt: new Date().toISOString(),
        totals,
      },
      metadata: {
        capability: TenantUsageMetricsCapability.name,
        version: TenantUsageMetricsCapability.version,
        channel: normalizeText(safeContext.channel) || 'admin',
        tenantId: normalizeText(safeContext.tenantId) || 'okand',
        requestId: normalizeText(safeContext.requestId) || '',
        correlationId: normalizeText(safeContext.correlationId) || '',
      },
      warnings,
    };
  }
}

module.exports = {
  TenantUsageMetricsCapability,
  tenantUsageMetricsCapability: TenantUsageMetricsCapability,
};
