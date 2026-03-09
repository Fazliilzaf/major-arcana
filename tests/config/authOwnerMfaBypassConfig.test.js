const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const configModulePath = path.resolve(__dirname, '../../src/config.js');

function loadConfigWithEnv(envPatch) {
  const previous = { ...process.env };
  Object.assign(process.env, { ARCANA_AI_PROVIDER: 'fallback' }, envPatch);
  delete require.cache[configModulePath];
  const { config } = require(configModulePath);
  process.env = previous;
  delete require.cache[configModulePath];
  return config;
}

test('config ignores public owner MFA bypass hosts', () => {
  const config = loadConfigWithEnv({
    NODE_ENV: 'production',
    ARCANA_AUTH_OWNER_MFA_BYPASS_HOSTS:
      'arcana.hairtpclinic.se,arcana.hairtpclinic.com,ma.hairtpclinic.se,ma.hairtpclinic.com,arcana-staging.onrender.com,custom.internal',
  });

  assert.deepEqual(config.authOwnerMfaBypassHosts, [
    'arcana-staging.onrender.com',
    'custom.internal',
  ]);
});

test('config still keeps non-public owner MFA bypass hosts', () => {
  const config = loadConfigWithEnv({
    NODE_ENV: 'development',
    ARCANA_AUTH_OWNER_MFA_BYPASS_HOSTS: 'arcana.hairtpclinic.se,custom.internal',
  });

  assert.deepEqual(config.authOwnerMfaBypassHosts, [
    'custom.internal',
    'arcana-staging.onrender.com',
  ]);
});
