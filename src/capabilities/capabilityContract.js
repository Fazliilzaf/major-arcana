const { isBaseCapabilityClass } = require('./baseCapability');

const ALLOWED_PERSIST_STRATEGIES = new Set(['none', 'analysis']);
const ALLOWED_AUDIT_STRATEGIES = new Set(['always']);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function validateCapabilityClass(definition) {
  const errors = [];
  const capability = definition;

  if (!isBaseCapabilityClass(definition)) {
    errors.push('definition must extend BaseCapability');
    return {
      ok: false,
      errors,
    };
  }

  const requiredFields = [
    'name',
    'version',
    'allowedRoles',
    'allowedChannels',
    'inputSchema',
    'outputSchema',
    'requiresInputRisk',
    'requiresOutputRisk',
    'requiresPolicyFloor',
    'persistStrategy',
    'auditStrategy',
  ];

  requiredFields.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(capability, field)) {
      errors.push(`missing field "${field}"`);
    }
  });

  if (!normalizeText(capability.name)) errors.push('name must be a non-empty string');
  if (!normalizeText(capability.version)) errors.push('version must be a non-empty string');

  if (!asArray(capability.allowedRoles).length) {
    errors.push('allowedRoles must contain at least one role');
  }
  if (!asArray(capability.allowedChannels).length) {
    errors.push('allowedChannels must contain at least one channel');
  }

  if (!capability.inputSchema || typeof capability.inputSchema !== 'object') {
    errors.push('inputSchema must be an object');
  }
  if (!capability.outputSchema || typeof capability.outputSchema !== 'object') {
    errors.push('outputSchema must be an object');
  }

  if (typeof capability.requiresInputRisk !== 'boolean') {
    errors.push('requiresInputRisk must be boolean');
  }
  if (typeof capability.requiresOutputRisk !== 'boolean') {
    errors.push('requiresOutputRisk must be boolean');
  }
  if (typeof capability.requiresPolicyFloor !== 'boolean') {
    errors.push('requiresPolicyFloor must be boolean');
  }

  const persistStrategy = normalizeText(capability.persistStrategy).toLowerCase();
  if (!ALLOWED_PERSIST_STRATEGIES.has(persistStrategy)) {
    errors.push(`persistStrategy must be one of: ${Array.from(ALLOWED_PERSIST_STRATEGIES).join(', ')}`);
  }

  const auditStrategy = normalizeText(capability.auditStrategy).toLowerCase();
  if (!ALLOWED_AUDIT_STRATEGIES.has(auditStrategy)) {
    errors.push(`auditStrategy must be one of: ${Array.from(ALLOWED_AUDIT_STRATEGIES).join(', ')}`);
  }

  if (typeof capability.prototype?.execute !== 'function') {
    errors.push('execute must be a function');
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

function assertCapabilityClass(definition) {
  const validation = validateCapabilityClass(definition);
  if (validation.ok) return definition;
  const capabilityName = normalizeText(definition?.name) || '<unknown>';
  throw new Error(
    `Invalid capability definition "${capabilityName}": ${validation.errors.join('; ')}`
  );
}

module.exports = {
  ALLOWED_PERSIST_STRATEGIES,
  ALLOWED_AUDIT_STRATEGIES,
  validateCapabilityClass,
  assertCapabilityClass,
  validateCapabilityDefinition: validateCapabilityClass,
  assertCapabilityDefinition: assertCapabilityClass,
};
