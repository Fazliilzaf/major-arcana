'use strict';

function isClientoIntegrationEnabled() {
  const normalized = String(process.env.ARCANA_CLIENTO_INTEGRATION_ENABLED || 'false')
    .trim()
    .toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

module.exports = {
  isClientoIntegrationEnabled,
};
