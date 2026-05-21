class BaseCapability {
  static name = 'CapabilityName';
  static version = '1.0.0';

  static allowedRoles = [];
  static allowedChannels = [];

  static requiresInputRisk = true;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;

  static persistStrategy = 'none';
  static auditStrategy = 'always';
  static autoExecute = false;

  static inputSchema = {};
  static outputSchema = {};

  async execute(_context) {
    throw new Error('Not implemented');
  }
}

function isBaseCapabilityClass(value) {
  if (typeof value !== 'function') return false;
  if (value === BaseCapability) return false;
  return value.prototype instanceof BaseCapability;
}

module.exports = {
  BaseCapability,
  isBaseCapabilityClass,
};
