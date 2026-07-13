function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function shouldBypassOwnerLoginRateLimit({ loginEmail = '', configuredOwnerEmail = '' } = {}) {
  const ownerEmail = normalizeEmail(configuredOwnerEmail);
  return Boolean(ownerEmail) && normalizeEmail(loginEmail) === ownerEmail;
}

module.exports = {
  shouldBypassOwnerLoginRateLimit,
};
