'use strict';

const { ROLE_OWNER } = require('../security/roles');
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

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function estimateLlmCostSek(tokenCount, pricePerMillionTokens = 3) {
  return Math.round(((toNumber(tokenCount, 0) / 1_000_000) * pricePerMillionTokens) * 100) / 100;
}

class FinanceGovernanceCapability extends BaseCapability {
  static name = 'FinanceGovernance';
  static version = '1.0.0';

  static allowedRoles = [ROLE_OWNER];
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
      windowDays: { type: 'integer', minimum: 1, maximum: 90 },
      includeProjections: { type: 'boolean' },
    },
  };

  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: {
      data: {
        type: 'object',
        required: ['costSummary', 'usageBreakdown', 'projections', 'alerts', 'summary', 'generatedAt'],
        additionalProperties: true,
      },
      metadata: { type: 'object', additionalProperties: true },
      warnings: { type: 'array', maxItems: 20 },
    },
  };

  async execute(context = {}) {
    const safeContext = context && typeof context === 'object' ? context : {};
    const input = safeContext.input && typeof safeContext.input === 'object' ? safeContext.input : {};
    const snapshot = asObject(safeContext.systemStateSnapshot);
    const windowDays = Math.max(1, Math.min(90, toNumber(input.windowDays, 30)));
    const includeProjections = input.includeProjections !== false;
    const warnings = [];

    const usage = asObject(snapshot.usage);
    const billing = asObject(snapshot.billing);
    const metrics = asObject(snapshot.metrics);

    const totalTokens = toNumber(usage.totalTokens || metrics.totalTokens, 0);
    const totalRequests = toNumber(usage.totalRequests || metrics.totalRequests, 0);
    const totalStorageBytes = toNumber(usage.totalStorageBytes || metrics.totalStorageBytes, 0);
    const storageMb = Math.round(totalStorageBytes / (1024 * 1024) * 100) / 100;
    const llmCostSek = estimateLlmCostSek(totalTokens);
    const hostingCostSek = toNumber(billing.hostingMonthlySek, 490);
    const totalMonthlySek = llmCostSek + hostingCostSek;

    const tenantCount = toNumber(snapshot.tenantCount, 1);
    const costPerTenant = tenantCount > 0 ? Math.round((totalMonthlySek / tenantCount) * 100) / 100 : totalMonthlySek;

    const usageBreakdown = {
      llm: {
        tokens: totalTokens,
        estimatedCostSek: llmCostSek,
        provider: normalizeText(usage.provider || snapshot.aiProvider) || 'fallback',
      },
      hosting: {
        monthlyCostSek: hostingCostSek,
        plan: normalizeText(billing.plan) || 'standard',
      },
      storage: {
        totalMb: storageMb,
        estimatedCostSek: 0,
      },
      requests: {
        total: totalRequests,
        windowDays,
      },
    };

    const alerts = [];
    if (llmCostSek > 500) {
      alerts.push({
        severity: 'high',
        message: `LLM-kostnad over 500 SEK (${llmCostSek} SEK). Kontrollera token-forbrukning.`,
      });
    }
    if (storageMb > 500) {
      alerts.push({
        severity: 'medium',
        message: `Lagring over 500 MB (${storageMb} MB). Overvaeg prune/arkivering.`,
      });
    }
    if (totalMonthlySek > 2000) {
      alerts.push({
        severity: 'high',
        message: `Total manadskostnad over 2000 SEK (${totalMonthlySek} SEK).`,
      });
    }

    const projections = includeProjections ? {
      next30Days: {
        estimatedCostSek: Math.round(totalMonthlySek * 1.05 * 100) / 100,
        basis: 'current_usage_plus_5pct',
      },
      next90Days: {
        estimatedCostSek: Math.round(totalMonthlySek * 3.15 * 100) / 100,
        basis: 'current_usage_plus_5pct_quarterly',
      },
      breakEvenTenants: hostingCostSek > 0
        ? Math.ceil(totalMonthlySek / Math.max(1, toNumber(billing.revenuePerTenantSek, 500)))
        : 1,
    } : null;

    if (!totalTokens && !totalRequests) {
      warnings.push('Ingen usage-data hittades i snapshot. Kostnaderna ar uppskattningar baserat pa hosting.');
    }
    if (!billing.hostingMonthlySek) {
      warnings.push('Hosting-kostnad saknas — anvander default 490 SEK/manad (Render standard).');
    }

    const summary = [
      `Manadskostnad: ${totalMonthlySek} SEK (LLM: ${llmCostSek}, hosting: ${hostingCostSek}).`,
      `${totalRequests} requests, ${totalTokens} tokens senaste ${windowDays} dagarna.`,
      `Kostnad per tenant: ${costPerTenant} SEK/manad (${tenantCount} tenant(s)).`,
      alerts.length > 0 ? `${alerts.length} kostnadsvarning(ar).` : 'Inga kostnadsvarningar.',
    ].join(' ');

    return {
      data: {
        costSummary: {
          totalMonthlySek,
          llmCostSek,
          hostingCostSek,
          costPerTenantSek: costPerTenant,
          tenantCount,
          windowDays,
        },
        usageBreakdown,
        projections,
        alerts,
        summary,
        generatedAt: new Date().toISOString(),
      },
      metadata: {
        capability: FinanceGovernanceCapability.name,
        version: FinanceGovernanceCapability.version,
        channel: normalizeText(safeContext.channel) || 'admin',
        tenantId: normalizeText(safeContext.tenantId) || 'unknown',
      },
      warnings,
    };
  }
}

module.exports = {
  FinanceGovernanceCapability,
};
