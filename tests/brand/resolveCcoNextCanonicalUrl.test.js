const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveCcoNextCanonicalUrl } = require('../../src/brand/resolveCcoNextCanonicalUrl');

test('resolveCcoNextCanonicalUrl returns null when path not under /cco-next', () => {
  assert.equal(resolveCcoNextCanonicalUrl({ requestPath: '/other' }), null);
});

test('resolveCcoNextCanonicalUrl returnerar null utan argument eller tomt path', () => {
  assert.equal(resolveCcoNextCanonicalUrl(), null);
  assert.equal(resolveCcoNextCanonicalUrl({}), null);
});

test('resolveCcoNextCanonicalUrl utelämnar query när requestSearch bara är whitespace', () => {
  const url = resolveCcoNextCanonicalUrl({
    requestHost: 'legacy.example.com',
    requestPath: '/cco-next/inbox',
    requestSearch: '   \t',
    canonicalOrigin: 'https://app.example.com',
    redirectHosts: ['legacy.example.com'],
  });
  assert.equal(url, 'https://app.example.com/cco-next/inbox');
});

test('resolveCcoNextCanonicalUrl returns null when normalized hosts match', () => {
  assert.equal(
    resolveCcoNextCanonicalUrl({
      requestHost: 'APP.EXAMPLE.COM.',
      requestPath: '/cco-next/inbox',
      canonicalOrigin: 'app.example.com',
      redirectHosts: ['app.example.com'],
    }),
    null
  );
});

test('resolveCcoNextCanonicalUrl returns null when redirect allowlist misses', () => {
  assert.equal(
    resolveCcoNextCanonicalUrl({
      requestHost: 'legacy.example.com',
      requestPath: '/cco-next/inbox',
      canonicalOrigin: 'https://app.example.com',
      redirectHosts: ['other.example.com'],
    }),
    null
  );
});

test('resolveCcoNextCanonicalUrl returns null nar canonicalOrigin eller host saknas', () => {
  assert.equal(
    resolveCcoNextCanonicalUrl({
      requestHost: '',
      requestPath: '/cco-next/inbox',
      canonicalOrigin: 'https://app.example.com',
      redirectHosts: ['legacy.example.com'],
    }),
    null
  );
  assert.equal(
    resolveCcoNextCanonicalUrl({
      requestHost: 'legacy.example.com',
      requestPath: '/cco-next/inbox',
      canonicalOrigin: '',
      redirectHosts: ['legacy.example.com'],
    }),
    null
  );
});

test('resolveCcoNextCanonicalUrl returns null nar redirectHosts ar tom', () => {
  assert.equal(
    resolveCcoNextCanonicalUrl({
      requestHost: 'legacy.example.com',
      requestPath: '/cco-next/inbox',
      canonicalOrigin: 'https://app.example.com',
      redirectHosts: [],
    }),
    null
  );
});

test('resolveCcoNextCanonicalUrl handles minimalt /cco-next path', () => {
  const url = resolveCcoNextCanonicalUrl({
    requestHost: 'legacy.example.com',
    requestPath: '/cco-next',
    canonicalOrigin: 'https://app.example.com',
    redirectHosts: ['legacy.example.com'],
  });
  assert.equal(url, 'https://app.example.com/cco-next');
});

test('resolveCcoNextCanonicalUrl builds absolute URL for allowed redirect host', () => {
  const url = resolveCcoNextCanonicalUrl({
    requestHost: 'legacy.example.com',
    requestPath: '/cco-next/inbox',
    requestSearch: 'tab=queue',
    canonicalOrigin: 'https://app.example.com',
    redirectHosts: ['legacy.example.com'],
  });
  assert.equal(url, 'https://app.example.com/cco-next/inbox?tab=queue');
});

test('resolveCcoNextCanonicalUrl normalizes search without leading question mark', () => {
  const url = resolveCcoNextCanonicalUrl({
    requestHost: 'legacy.example.com',
    requestPath: '/cco-next/',
    requestSearch: '?x=1',
    canonicalOrigin: 'https://app.example.com',
    redirectHosts: ['legacy.example.com'],
  });
  assert.equal(url, 'https://app.example.com/cco-next/?x=1');
});

test('resolveCcoNextCanonicalUrl accepterar requestHost med blandad casing och punkt', () => {
  const url = resolveCcoNextCanonicalUrl({
    requestHost: 'LEGACY.EXAMPLE.COM.',
    requestPath: '/cco-next/inbox',
    canonicalOrigin: 'https://app.example.com',
    redirectHosts: ['legacy.example.com'],
  });
  assert.equal(url, 'https://app.example.com/cco-next/inbox');
});

test('resolveCcoNextCanonicalUrl filtrerar tomma redirectHosts men fungerar med giltig post', () => {
  const url = resolveCcoNextCanonicalUrl({
    requestHost: 'legacy.example.com',
    requestPath: '/cco-next/inbox',
    canonicalOrigin: 'https://app.example.com',
    redirectHosts: ['   ', null, 'legacy.example.com'],
  });
  assert.equal(url, 'https://app.example.com/cco-next/inbox');
});

test('resolveCcoNextCanonicalUrl returnerar null för /cco-nextish som inte matchar prefixet', () => {
  const url = resolveCcoNextCanonicalUrl({
    requestHost: 'legacy.example.com',
    requestPath: '/cco-nex',
    canonicalOrigin: 'https://app.example.com',
    redirectHosts: ['legacy.example.com'],
  });
  assert.equal(url, null);
});

test('resolveCcoNextCanonicalUrl trimmar requestPath innan prefix-check', () => {
  const url = resolveCcoNextCanonicalUrl({
    requestHost: 'legacy.example.com',
    requestPath: '   /cco-next/queue   ',
    canonicalOrigin: 'https://app.example.com',
    redirectHosts: ['legacy.example.com'],
  });
  assert.equal(url, 'https://app.example.com/cco-next/queue');
});

test('resolveCcoNextCanonicalUrl throws when canonicalOrigin saknar schema efter allowlist-match', () => {
  assert.throws(
    () =>
      resolveCcoNextCanonicalUrl({
        requestHost: 'legacy.example.com',
        requestPath: '/cco-next/inbox',
        canonicalOrigin: 'app.example.com',
        redirectHosts: ['legacy.example.com'],
      }),
    /Invalid URL/
  );
});
