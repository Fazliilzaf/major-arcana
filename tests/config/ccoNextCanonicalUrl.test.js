const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveCcoNextCanonicalUrl } = require('../../src/brand/resolveCcoNextCanonicalUrl');

test('redirects qsiu cco-next requests to canonical cco origin', () => {
  const url = resolveCcoNextCanonicalUrl({
    requestHost: 'arcana-qsiu.onrender.com',
    requestPath: '/cco-next',
    canonicalOrigin: 'https://arcana-cco.onrender.com',
    redirectHosts: ['arcana-qsiu.onrender.com'],
  });

  assert.equal(url, 'https://arcana-cco.onrender.com/cco-next');
});

test('preserves nested path and query when redirecting cco-next assets', () => {
  const url = resolveCcoNextCanonicalUrl({
    requestHost: 'arcana-qsiu.onrender.com',
    requestPath: '/cco-next/assets/js/index.js',
    requestSearch: '?v=123',
    canonicalOrigin: 'https://arcana-cco.onrender.com',
    redirectHosts: ['arcana-qsiu.onrender.com'],
  });

  assert.equal(
    url,
    'https://arcana-cco.onrender.com/cco-next/assets/js/index.js?v=123'
  );
});

test('does not redirect when already on canonical cco host', () => {
  const url = resolveCcoNextCanonicalUrl({
    requestHost: 'arcana-cco.onrender.com',
    requestPath: '/cco-next',
    canonicalOrigin: 'https://arcana-cco.onrender.com',
    redirectHosts: ['arcana-qsiu.onrender.com'],
  });

  assert.equal(url, null);
});

test('does not redirect unrelated routes', () => {
  const url = resolveCcoNextCanonicalUrl({
    requestHost: 'arcana-qsiu.onrender.com',
    requestPath: '/api/v1/auth/login',
    canonicalOrigin: 'https://arcana-cco.onrender.com',
    redirectHosts: ['arcana-qsiu.onrender.com'],
  });

  assert.equal(url, null);
});
