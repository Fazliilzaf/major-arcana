'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');
const { validateMarketingTracking } = require('../ops/cmoTrackingValidator');
const { normalizeText, asObject, capabilityMeta } = require('./cmoCapabilityHelpers');

class ValidateMarketingTrackingCapability extends BaseCapability {
  static name = 'ValidateMarketingTracking';
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
      requireUtmOnAllLinks: { type: 'boolean' },
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

    const review = validateMarketingTracking({
      snapshot,
      utmPack: snapshot.utmPack || snapshot.generateUtmPack,
      requireUtmOnAllLinks: input.requireUtmOnAllLinks === true,
    });

    if (review.status === 'needs_owner') {
      warnings.push('Tracking-validering kräver OWNER-granskning innan schemaläggning.');
    }
    if (review.status === 'blocked') {
      warnings.push('Tracking-validering blockerad — åtgärda brutna länkar och UTM.');
    }

    return {
      data: review,
      metadata: capabilityMeta(ValidateMarketingTrackingCapability, safeContext),
      warnings,
    };
  }
}

module.exports = {
  ValidateMarketingTrackingCapability,
};
