const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { createInMemoryRateLimitStore } = require('../../src/security/rateLimitStores');
const {
  createMultiLayerRateLimit,
  makeIpKey,
  makeUserKey,
  makeTenantKey,
} = require('../../src/security/multiLayerRateLimit');

test('makeIpKey prefers first x-forwarded-for hop', () => {
  assert.equal(
    makeIpKey({
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.2' },
      ip: '127.0.0.1',
    }),
    'ip:203.0.113.5'
  );
  assert.equal(
    makeIpKey({
      headers: {},
      ip: '10.0.0.1',
      connection: { remoteAddress: '::1' },
    }),
    'ip:10.0.0.1'
  );
});

test('makeIpKey anvander remoteAddress nar forwarded ar blank', () => {
  assert.equal(
    makeIpKey({
      headers: { 'x-forwarded-for': '   , 198.51.100.1' },
      connection: { remoteAddress: '172.16.0.5' },
    }),
    'ip:172.16.0.5'
  );
});

test('makeUserKey and makeTenantKey read req.auth', () => {
  assert.equal(makeUserKey({ auth: { user: { id: 'u1' } } }), 'user:u1');
  assert.equal(makeUserKey({ auth: { userId: 'u2' } }), 'user:u2');
  assert.equal(makeUserKey({ auth: {} }), null);
  assert.equal(makeTenantKey({ auth: { tenantId: 't9' } }), 'tenant:t9');
  assert.equal(makeTenantKey({ auth: {} }), null);
});

test('makeIpKey använder unknown när varken ip eller connection finns', () => {
  assert.equal(makeIpKey({ headers: {} }), 'ip:unknown');
});

test('makeIpKey ignorerar x-forwarded-for som inte är sträng', () => {
  assert.equal(
    makeIpKey({
      headers: { 'x-forwarded-for': ['203.0.113.9', '10.0.0.1'] },
      ip: '5.5.5.5',
    }),
    'ip:5.5.5.5'
  );
});

test('makeUserKey föredrar user.id framför userId när båda finns', () => {
  assert.equal(
    makeUserKey({ auth: { user: { id: 'from-user' }, userId: 'from-auth-root' } }),
    'user:from-user'
  );
});

async function withServer(app, run) {
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

test('createMultiLayerRateLimit applies configured max per layer (IP)', async () => {
  const store = createInMemoryRateLimitStore();
  const limiter = createMultiLayerRateLimit({
    store,
    name: 'ml-test',
    layers: {
      ip: { points: 2, durationSec: 60 },
    },
  });

  const app = express();
  app.set('trust proxy', true);
  app.get('/x', limiter, (_req, res) => res.json({ ok: true }));

  await withServer(app, async (baseUrl) => {
    const h = { 'x-forwarded-for': '198.51.100.10' };
    const a = await fetch(`${baseUrl}/x`, { headers: h });
    const b = await fetch(`${baseUrl}/x`, { headers: h });
    const c = await fetch(`${baseUrl}/x`, { headers: h });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(c.status, 429);
  });
});

test('createMultiLayerRateLimit stacks IP then user counters', async () => {
  const store = createInMemoryRateLimitStore();
  const limiter = createMultiLayerRateLimit({
    store,
    name: 'ml-stack',
    layers: {
      ip: { points: 5, durationSec: 60 },
      user: { points: 1, durationSec: 60 },
    },
  });

  const app = express();
  app.set('trust proxy', true);
  app.get('/y', limiter, (_req, res) => res.json({ ok: true }));

  await withServer(app, async (baseUrl) => {
    const headers = {
      'x-forwarded-for': '198.51.100.20',
    };
    const ok = await fetch(`${baseUrl}/y`, { headers });
    assert.equal(ok.status, 200);

    const blocked = await fetch(`${baseUrl}/y`, { headers });
    assert.equal(blocked.status, 429);
  });
});

test('createMultiLayerRateLimit tenant-lager aggregerar olika IP med samma tenantId', async () => {
  const store = createInMemoryRateLimitStore();
  const limiter = createMultiLayerRateLimit({
    store,
    name: 'ml-tenant-only',
    layers: {
      tenant: { points: 1, durationSec: 60 },
    },
  });

  const app = express();
  app.set('trust proxy', true);
  app.use((req, _res, next) => {
    req.auth = { tenantId: 'tenant-shared' };
    next();
  });
  app.get('/z', limiter, (_req, res) => res.json({ ok: true }));

  await withServer(app, async (baseUrl) => {
    const a = await fetch(`${baseUrl}/z`, { headers: { 'x-forwarded-for': '198.51.100.30' } });
    const b = await fetch(`${baseUrl}/z`, { headers: { 'x-forwarded-for': '198.51.100.31' } });
    assert.equal(a.status, 200);
    assert.equal(b.status, 429);
  });
});

test('createMultiLayerRateLimit with no layers acts as pass-through', async () => {
  const limiter = createMultiLayerRateLimit({
    store: createInMemoryRateLimitStore(),
    name: 'ml-none',
    layers: {},
  });

  const app = express();
  app.get('/none', limiter, (_req, res) => res.json({ ok: true }));

  await withServer(app, async (baseUrl) => {
    const a = await fetch(`${baseUrl}/none`);
    const b = await fetch(`${baseUrl}/none`);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
  });
});

test('user layer falls back to ip key when auth user is missing', async () => {
  const store = createInMemoryRateLimitStore();
  const limiter = createMultiLayerRateLimit({
    store,
    name: 'ml-user-fallback',
    layers: {
      user: { points: 1, durationSec: 60 },
    },
  });

  const app = express();
  app.set('trust proxy', true);
  app.get('/uf', limiter, (_req, res) => res.json({ ok: true }));

  await withServer(app, async (baseUrl) => {
    const headers = { 'x-forwarded-for': '198.51.100.44' };
    const first = await fetch(`${baseUrl}/uf`, { headers });
    const second = await fetch(`${baseUrl}/uf`, { headers });
    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
  });
});
