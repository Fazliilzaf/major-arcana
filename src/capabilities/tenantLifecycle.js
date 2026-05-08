'use strict';

/**
 * Tenant Lifecycle — capabilities för multi-tenant SaaS-mognad (MT2).
 *
 * Tre operationer:
 *   • TenantList         — lista alla tenants (super-admin)
 *   • TenantCreate       — registrera ny tenant
 *   • TenantDisable      — deaktivera tenant (soft-disable, reversibel)
 *
 * Bygger ovanpå existing tenantConfigStore. Tenant-config blir den "kanoniska"
 * registry-källan där feature flags, theming och plan-tier lagras.
 *
 * Designprinciper:
 *   • OWNER-only för create/disable (kritiskt för SaaS-säkerhet)
 *   • Audit-trail på alla mutations
 *   • Pseudonymiserade tenant-ids där möjligt (säkerhet vid läckor)
 */

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeTenantId(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

class TenantListCapability extends BaseCapability {
  static name = 'TenantList';
  static version = '1.0.0';

  // OWNER-only — ger insyn över alla kunder, känsligt
  static allowedRoles = [ROLE_OWNER];
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
      includeDisabled: { type: 'boolean' },
      limit: { type: 'integer', minimum: 1, maximum: 500 },
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
        required: ['tenants', 'count'],
        properties: {
          tenants: {
            type: 'array',
            maxItems: 500,
            items: {
              type: 'object',
              additionalProperties: true,
            },
          },
          count: { type: 'integer', minimum: 0, maximum: 100000 },
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
    const tenantConfigStore = safeContext.tenantConfigStore;
    const includeDisabled = input.includeDisabled === true;
    const limit = Math.max(1, Math.min(500, Number(input.limit) || 50));

    const warnings = [];
    let tenants = [];

    if (tenantConfigStore && typeof tenantConfigStore.listTenants === 'function') {
      try {
        const list = await tenantConfigStore.listTenants();
        tenants = (list || [])
          .filter((t) => includeDisabled || !t.disabled)
          .slice(0, limit)
          .map((t) => ({
            tenantId: t.tenantId,
            brand: t.brand,
            disabled: !!t.disabled,
            planTier: t.planTier || 'free',
            createdAt: t.createdAt,
            lastSeenAt: t.lastSeenAt,
            featureFlags: Object.keys(t.featureFlags || {}).filter(
              (key) => t.featureFlags[key] === true
            ),
          }));
      } catch (error) {
        warnings.push(`Kunde inte lista tenants: ${error.message || 'okänt fel'}`);
      }
    } else {
      warnings.push('tenantConfigStore.listTenants saknas — returnerar tom lista. (Stub-läge)');
    }

    return {
      data: {
        tenants,
        count: tenants.length,
      },
      metadata: {
        capability: TenantListCapability.name,
        version: TenantListCapability.version,
        channel: normalizeText(safeContext.channel) || 'admin',
        tenantId: normalizeText(safeContext.tenantId) || 'okand',
        requestId: normalizeText(safeContext.requestId) || '',
        correlationId: normalizeText(safeContext.correlationId) || '',
      },
      warnings,
    };
  }
}

class TenantCreateCapability extends BaseCapability {
  static name = 'TenantCreate';
  static version = '1.0.0';

  static allowedRoles = [ROLE_OWNER];
  static allowedChannels = ['admin'];

  static requiresInputRisk = false;
  static requiresOutputRisk = false;
  static requiresPolicyFloor = false;

  static persistStrategy = 'analysis';
  static auditStrategy = 'always';

  static inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['tenantId', 'brand'],
    properties: {
      tenantId: { type: 'string', minLength: 2, maxLength: 80 },
      brand: { type: 'string', minLength: 1, maxLength: 120 },
      defaultMailbox: { type: 'string', minLength: 0, maxLength: 200 },
      planTier: { type: 'string', enum: ['free', 'starter', 'pro', 'enterprise'] },
      ownerEmail: { type: 'string', minLength: 0, maxLength: 200 },
      featureFlags: {
        type: 'object',
        additionalProperties: { type: 'boolean' },
      },
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
        required: ['tenantId', 'brand', 'planTier', 'createdAt'],
        properties: {
          tenantId: { type: 'string', maxLength: 80 },
          brand: { type: 'string', maxLength: 120 },
          planTier: { type: 'string', maxLength: 40 },
          createdAt: { type: 'string', maxLength: 64 },
          alreadyExists: { type: 'boolean' },
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
    const tenantConfigStore = safeContext.tenantConfigStore;
    const newTenantId = normalizeTenantId(input.tenantId);
    const brand = normalizeText(input.brand);
    const planTier = normalizeText(input.planTier) || 'free';

    const warnings = [];
    let alreadyExists = false;

    if (!newTenantId) {
      warnings.push('Ogiltigt tenantId efter normalisering.');
    }

    if (tenantConfigStore && typeof tenantConfigStore.findTenantConfig === 'function') {
      try {
        const existing = await tenantConfigStore.findTenantConfig(newTenantId);
        if (existing) {
          alreadyExists = true;
          warnings.push(`Tenant "${newTenantId}" finns redan.`);
        } else if (typeof tenantConfigStore.updateTenantConfig === 'function') {
          await tenantConfigStore.updateTenantConfig({
            tenantId: newTenantId,
            patch: {
              brand,
              planTier,
              ownerEmail: normalizeText(input.ownerEmail),
              defaultMailbox: normalizeText(input.defaultMailbox),
              featureFlags: asObject(input.featureFlags),
              createdAt: new Date().toISOString(),
            },
            actorUserId: safeContext.actor?.id || null,
          });
        }
      } catch (error) {
        warnings.push(`Kunde inte skapa tenant: ${error.message || 'okänt fel'}`);
      }
    } else {
      warnings.push('tenantConfigStore saknas — tenant ej persisterad.');
    }

    return {
      data: {
        tenantId: newTenantId,
        brand,
        planTier,
        createdAt: new Date().toISOString(),
        alreadyExists,
      },
      metadata: {
        capability: TenantCreateCapability.name,
        version: TenantCreateCapability.version,
        channel: normalizeText(safeContext.channel) || 'admin',
        tenantId: normalizeText(safeContext.tenantId) || 'okand',
        requestId: normalizeText(safeContext.requestId) || '',
        correlationId: normalizeText(safeContext.correlationId) || '',
      },
      warnings,
    };
  }
}

class TenantDisableCapability extends BaseCapability {
  static name = 'TenantDisable';
  static version = '1.0.0';

  static allowedRoles = [ROLE_OWNER];
  static allowedChannels = ['admin'];

  static requiresInputRisk = false;
  static requiresOutputRisk = false;
  static requiresPolicyFloor = false;

  static persistStrategy = 'analysis';
  static auditStrategy = 'always';

  static inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['tenantId', 'reason'],
    properties: {
      tenantId: { type: 'string', minLength: 2, maxLength: 80 },
      reason: { type: 'string', minLength: 5, maxLength: 500 },
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
        required: ['tenantId', 'disabled', 'disabledAt'],
        properties: {
          tenantId: { type: 'string', maxLength: 80 },
          disabled: { type: 'boolean' },
          disabledAt: { type: 'string', maxLength: 64 },
          reason: { type: 'string', maxLength: 500 },
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
    const tenantConfigStore = safeContext.tenantConfigStore;
    const targetTenantId = normalizeTenantId(input.tenantId);
    const reason = normalizeText(input.reason);

    const warnings = [];

    if (tenantConfigStore && typeof tenantConfigStore.updateTenantConfig === 'function') {
      try {
        await tenantConfigStore.updateTenantConfig({
          tenantId: targetTenantId,
          patch: {
            disabled: true,
            disabledAt: new Date().toISOString(),
            disabledReason: reason,
          },
          actorUserId: safeContext.actor?.id || null,
        });
      } catch (error) {
        warnings.push(`Kunde inte deaktivera: ${error.message || 'okänt fel'}`);
      }
    } else {
      warnings.push('tenantConfigStore saknas — ej persisterad.');
    }

    return {
      data: {
        tenantId: targetTenantId,
        disabled: true,
        disabledAt: new Date().toISOString(),
        reason,
      },
      metadata: {
        capability: TenantDisableCapability.name,
        version: TenantDisableCapability.version,
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
  TenantListCapability,
  TenantCreateCapability,
  TenantDisableCapability,
  tenantListCapability: TenantListCapability,
  tenantCreateCapability: TenantCreateCapability,
  tenantDisableCapability: TenantDisableCapability,
  normalizeTenantId,
};
