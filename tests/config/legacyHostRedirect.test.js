const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveLegacyHostRedirectUrl,
  DEFAULT_LEGACY_HOST_REDIRECTS,
} = require('../../src/brand/resolveLegacyHostRedirectUrl');

test('redirects arcana.hairtpclinic.se root to .com with 301 target path', () => {
  const url = resolveLegacyHostRedirectUrl({
    requestHost: 'arcana.hairtpclinic.se',
    requestPath: '/',
    redirectMap: DEFAULT_LEGACY_HOST_REDIRECTS,
    enabled: true,
  });
  assert.equal(url, 'https://arcana.hairtpclinic.com/');
});

test('redirects arcana.hairtpclinic.se/admin preserving query', () => {
  const url = resolveLegacyHostRedirectUrl({
    requestHost: 'arcana.hairtpclinic.se',
    requestPath: '/admin',
    requestSearch: '?view=cco',
    redirectMap: DEFAULT_LEGACY_HOST_REDIRECTS,
    enabled: true,
  });
  assert.equal(url, 'https://arcana.hairtpclinic.com/admin?view=cco');
});

test('redirects ma.hairtpclinic.se to arcana.hairtpclinic.com', () => {
  const url = resolveLegacyHostRedirectUrl({
    requestHost: 'ma.hairtpclinic.se',
    requestPath: '/staff',
    redirectMap: DEFAULT_LEGACY_HOST_REDIRECTS,
    enabled: true,
  });
  assert.equal(url, 'https://arcana.hairtpclinic.com/staff');
});

test('does not redirect when already on canonical .com host', () => {
  const url = resolveLegacyHostRedirectUrl({
    requestHost: 'arcana.hairtpclinic.com',
    requestPath: '/admin',
    redirectMap: DEFAULT_LEGACY_HOST_REDIRECTS,
    enabled: true,
  });
  assert.equal(url, null);
});

test('does not redirect when disabled', () => {
  const url = resolveLegacyHostRedirectUrl({
    requestHost: 'arcana.hairtpclinic.se',
    requestPath: '/',
    redirectMap: DEFAULT_LEGACY_HOST_REDIRECTS,
    enabled: false,
  });
  assert.equal(url, null);
});
