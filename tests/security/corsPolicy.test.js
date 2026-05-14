const test = require('node:test');
const assert = require('node:assert/strict');

const { createCorsPolicy, collectAllowedCorsOrigins } = require('../../src/security/corsPolicy');

function invokeOriginCallback(policy, origin) {
  return new Promise((resolve, reject) => {
    policy.origin(origin, (err, allowed) => {
      if (err) reject(err);
      else resolve(allowed);
    });
  });
}

test('collectAllowedCorsOrigins ignores wildcard * entries', () => {
  const origins = collectAllowedCorsOrigins({
    corsAllowedOrigins: ['https://app.example.com', '*', '  '],
    publicBaseUrl: '',
    brandByHost: {},
  });
  assert.deepEqual(origins, ['https://app.example.com']);
});

test('collectAllowedCorsOrigins tom eller undefined config ger tom lista', () => {
  assert.deepEqual(collectAllowedCorsOrigins(), []);
  assert.deepEqual(collectAllowedCorsOrigins(undefined), []);
});

test('collectAllowedCorsOrigins merges env, publicBaseUrl and brandByHost', () => {
  const origins = collectAllowedCorsOrigins({
    corsAllowedOrigins: ['https://a.example.com'],
    publicBaseUrl: 'https://b.example.com/path',
    brandByHost: {
      'c.example.com': {},
    },
  });
  assert.ok(origins.includes('https://a.example.com'));
  assert.ok(origins.includes('https://b.example.com'));
  assert.ok(origins.includes('https://c.example.com'));
});

test('collectAllowedCorsOrigins deduplicerar och normaliserar casing/trailing slash', () => {
  const origins = collectAllowedCorsOrigins({
    corsAllowedOrigins: ['HTTPS://dup.example/', 'https://dup.example'],
    publicBaseUrl: 'https://dup.example///',
    brandByHost: {},
  });
  assert.deepEqual(origins, ['https://dup.example']);
});

test('collectAllowedCorsOrigins lägger till både http och https för localhost', () => {
  const origins = collectAllowedCorsOrigins({
    corsAllowedOrigins: [],
    publicBaseUrl: '',
    brandByHost: { 'localhost:3000': {} },
  });
  assert.ok(origins.includes('https://localhost:3000'));
  assert.ok(origins.includes('http://localhost:3000'));
});

test('collectAllowedCorsOrigins lägger till både http och https för 127.0.0.1', () => {
  const origins = collectAllowedCorsOrigins({
    corsAllowedOrigins: [],
    publicBaseUrl: '',
    brandByHost: { '127.0.0.1:8787': {} },
  });
  assert.ok(origins.includes('https://127.0.0.1:8787'));
  assert.ok(origins.includes('http://127.0.0.1:8787'));
});

test('collectAllowedCorsOrigins 127.0.0.1 utan port får både http och https', () => {
  const origins = collectAllowedCorsOrigins({
    corsAllowedOrigins: [],
    publicBaseUrl: '',
    brandByHost: { '127.0.0.1': {} },
  });
  assert.ok(origins.includes('https://127.0.0.1'));
  assert.ok(origins.includes('http://127.0.0.1'));
});

test('collectAllowedCorsOrigins normaliserar brandByHost med schema och slash', () => {
  const origins = collectAllowedCorsOrigins({
    corsAllowedOrigins: [],
    publicBaseUrl: '',
    brandByHost: { 'https://api.example.com/': {} },
  });
  assert.deepEqual(origins, ['https://api.example.com']);
});

test('collectAllowedCorsOrigins ignorerar ogiltig publicBaseUrl', () => {
  const origins = collectAllowedCorsOrigins({
    corsAllowedOrigins: ['https://only.example'],
    publicBaseUrl: 'not-a-valid-url',
    brandByHost: {},
  });
  assert.deepEqual(origins, ['https://only.example']);
});

test('strict CORS allows only listed origins', async () => {
  const policy = createCorsPolicy({
    corsStrict: true,
    corsAllowedOrigins: ['https://allowed.example'],
    corsAllowCredentials: false,
    corsAllowNoOrigin: false,
    publicBaseUrl: '',
    brandByHost: {},
  });

  assert.equal(await invokeOriginCallback(policy, 'https://allowed.example'), true);
  assert.equal(await invokeOriginCallback(policy, 'https://evil.example'), false);
  assert.equal(await invokeOriginCallback(policy, 'https://ALLOWED.example'), true);
});

test('strict CORS nekar alla origins när allowlist och bas-URL saknas', async () => {
  const policy = createCorsPolicy({
    corsStrict: true,
    corsAllowedOrigins: [],
    corsAllowNoOrigin: false,
    publicBaseUrl: '',
    brandByHost: {},
  });
  assert.equal(await invokeOriginCallback(policy, 'https://any.example'), false);
});

test('strict CORS normaliserar trailing slash på inkommande Origin', async () => {
  const policy = createCorsPolicy({
    corsStrict: true,
    corsAllowedOrigins: ['https://allowed.example'],
    corsAllowCredentials: false,
    corsAllowNoOrigin: false,
    publicBaseUrl: '',
    brandByHost: {},
  });
  assert.equal(await invokeOriginCallback(policy, 'https://allowed.example///'), true);
});

test('strict CORS tillåter origin från publicBaseUrl även utan corsAllowedOrigins', async () => {
  const policy = createCorsPolicy({
    corsStrict: true,
    corsAllowedOrigins: [],
    corsAllowNoOrigin: false,
    publicBaseUrl: 'https://public.example/app',
    brandByHost: {},
  });
  assert.equal(await invokeOriginCallback(policy, 'https://public.example'), true);
  assert.equal(await invokeOriginCallback(policy, 'https://not-public.example'), false);
});

test('strict CORS with allowNoOrigin permits missing Origin header', async () => {
  const deny = createCorsPolicy({
    corsStrict: true,
    corsAllowedOrigins: ['https://app.example'],
    corsAllowNoOrigin: false,
    publicBaseUrl: '',
    brandByHost: {},
  });
  assert.equal(await invokeOriginCallback(deny, undefined), false);
  assert.equal(await invokeOriginCallback(deny, ''), false);

  const allow = createCorsPolicy({
    corsStrict: true,
    corsAllowedOrigins: ['https://app.example'],
    corsAllowNoOrigin: true,
    publicBaseUrl: '',
    brandByHost: {},
  });
  assert.equal(await invokeOriginCallback(allow, undefined), true);
  assert.equal(await invokeOriginCallback(allow, ''), true);
});

test('non-strict CORS mirrors permissive origin: true', async () => {
  const policy = createCorsPolicy({
    corsStrict: false,
    corsAllowCredentials: true,
  });
  assert.equal(policy.origin, true);
  assert.equal(policy.credentials, true);
});

test('non-strict CORS sätter credentials false som standard', () => {
  const policy = createCorsPolicy({ corsStrict: false });
  assert.equal(policy.origin, true);
  assert.equal(policy.credentials, false);
});

test('collectAllowedCorsOrigins ignorerar corsAllowedOrigins som inte ar array', () => {
  const origins = collectAllowedCorsOrigins({
    corsAllowedOrigins: 'https://ignored.example',
    publicBaseUrl: 'https://from-base.example/path',
    brandByHost: {},
  });
  assert.deepEqual(origins, ['https://from-base.example']);
});

test('collectAllowedCorsOrigins hoppar brandByHost som inte ar objekt', () => {
  const origins = collectAllowedCorsOrigins({
    corsAllowedOrigins: ['https://only.example'],
    brandByHost: null,
    publicBaseUrl: '',
  });
  assert.deepEqual(origins, ['https://only.example']);
});

test('collectAllowedCorsOrigins hoppar ogiltiga poster i corsAllowedOrigins', () => {
  const origins = collectAllowedCorsOrigins({
    corsAllowedOrigins: [null, 123, '', 'https://valid.example'],
    publicBaseUrl: '',
    brandByHost: {},
  });
  assert.deepEqual(origins, ['https://valid.example']);
});

test('collectAllowedCorsOrigins localhost utan port far bade http och https', () => {
  const origins = collectAllowedCorsOrigins({
    corsAllowedOrigins: [],
    publicBaseUrl: '',
    brandByHost: { localhost: {} },
  });
  assert.ok(origins.includes('http://localhost'));
  assert.ok(origins.includes('https://localhost'));
});

test('collectAllowedCorsOrigins brandByHost utan localhost ger bara https', () => {
  const origins = collectAllowedCorsOrigins({
    corsAllowedOrigins: [],
    publicBaseUrl: '',
    brandByHost: { 'api.prod.example': {} },
  });
  assert.deepEqual(origins, ['https://api.prod.example']);
});

test('strict CORS tillåter origin från http publicBaseUrl på localhost', async () => {
  const policy = createCorsPolicy({
    corsStrict: true,
    corsAllowedOrigins: [],
    corsAllowNoOrigin: false,
    publicBaseUrl: 'http://localhost:5173/app',
    brandByHost: {},
  });
  assert.equal(await invokeOriginCallback(policy, 'http://localhost:5173'), true);
  assert.equal(await invokeOriginCallback(policy, 'https://localhost:5173'), false);
});
