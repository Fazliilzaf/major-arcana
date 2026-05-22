function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatPath(parentPath, key) {
  if (!normalizeText(parentPath)) return String(key);
  if (typeof key === 'number') return `${parentPath}[${key}]`;
  return `${parentPath}.${key}`;
}

function validateType(expectedType, value) {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isObject(value);
    case 'null':
      return value === null;
    default:
      return true;
  }
}

function validateJsonSchemaNode({
  schema,
  value,
  path,
  errors,
}) {
  const node = schema && typeof schema === 'object' ? schema : {};
  const expectedType = normalizeText(node.type);

  if (expectedType && !validateType(expectedType, value)) {
    errors.push({
      path,
      message: `expected type "${expectedType}"`,
    });
    return;
  }

  if (Array.isArray(node.enum) && node.enum.length > 0) {
    if (!node.enum.includes(value)) {
      errors.push({
        path,
        message: `must be one of: ${node.enum.join(', ')}`,
      });
    }
  }

  if (expectedType === 'string') {
    if (Number.isFinite(node.minLength) && String(value).length < Number(node.minLength)) {
      errors.push({
        path,
        message: `minLength is ${Number(node.minLength)}`,
      });
    }
    if (Number.isFinite(node.maxLength) && String(value).length > Number(node.maxLength)) {
      errors.push({
        path,
        message: `maxLength is ${Number(node.maxLength)}`,
      });
    }
    return;
  }

  if (expectedType === 'number' || expectedType === 'integer') {
    if (Number.isFinite(node.minimum) && Number(value) < Number(node.minimum)) {
      errors.push({
        path,
        message: `minimum is ${Number(node.minimum)}`,
      });
    }
    if (Number.isFinite(node.maximum) && Number(value) > Number(node.maximum)) {
      errors.push({
        path,
        message: `maximum is ${Number(node.maximum)}`,
      });
    }
    return;
  }

  if (expectedType === 'array') {
    if (Number.isFinite(node.minItems) && value.length < Number(node.minItems)) {
      errors.push({
        path,
        message: `minItems is ${Number(node.minItems)}`,
      });
    }
    if (Number.isFinite(node.maxItems) && value.length > Number(node.maxItems)) {
      errors.push({
        path,
        message: `maxItems is ${Number(node.maxItems)}`,
      });
    }
    if (node.items && typeof node.items === 'object') {
      value.forEach((item, index) => {
        validateJsonSchemaNode({
          schema: node.items,
          value: item,
          path: formatPath(path, index),
          errors,
        });
      });
    }
    return;
  }

  if (expectedType === 'object') {
    const required = Array.isArray(node.required) ? node.required : [];
    required.forEach((requiredKey) => {
      if (!Object.prototype.hasOwnProperty.call(value, requiredKey)) {
        errors.push({
          path: formatPath(path, requiredKey),
          message: 'is required',
        });
      }
    });

    const properties = isObject(node.properties) ? node.properties : {};
    Object.entries(properties).forEach(([key, propertySchema]) => {
      if (!Object.prototype.hasOwnProperty.call(value, key)) return;
      validateJsonSchemaNode({
        schema: propertySchema,
        value: value[key],
        path: formatPath(path, key),
        errors,
      });
    });

    if (node.additionalProperties === false) {
      const allowedKeys = new Set(Object.keys(properties));
      Object.keys(value).forEach((key) => {
        if (allowedKeys.has(key)) return;
        errors.push({
          path: formatPath(path, key),
          message: 'additional properties are not allowed',
        });
      });
    }
  }
}

function validateJsonSchema({ schema, value, rootPath = 'input' } = {}) {
  const errors = [];
  if (!schema || typeof schema !== 'object') {
    return {
      ok: false,
      errors: [{ path: rootPath, message: 'schema is missing' }],
    };
  }
  validateJsonSchemaNode({
    schema,
    value,
    path: rootPath,
    errors,
  });
  return {
    ok: errors.length === 0,
    errors,
  };
}

module.exports = {
  validateJsonSchema,
};
