const test = require('node:test');
const assert = require('node:assert/strict');

const { createRateLimiter } = require('../../src/security/rateLimit');
const { createInMemoryRateLimitStore } = require('../../src/security/rateLimitStores');

function createMockRes() {
  const headers = {};
  return {
    headers,
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = String(value);
    },
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('createRateLimiter calls next and sets X-RateLimit headers when allowed', async () => {
  const store = createInMemoryRateLimitStore();
  const limiter = createRateLimiter({
    store,
    max: 5,
    windowMs: 60_000,
    scope: 'unit',
    keyGenerator: () => 'client-a',
  });
  const res = createMockRes();
  let nextCalls = 0;
  await limiter({}, res, () => {
    nextCalls += 1;
  });
  assert.equal(nextCalls, 1);
  assert.equal(res.statusCode, 200);
  assert.ok('x-ratelimit-limit' in res.headers);
  assert.ok('x-ratelimit-remaining' in res.headers);
  assert.ok('x-ratelimit-reset' in res.headers);
});

test('createRateLimiter returns 429 with Retry-After when max exceeded', async () => {
  const store = createInMemoryRateLimitStore();
  const limiter = createRateLimiter({
    store,
    max: 2,
    windowMs: 60_000,
    scope: 'unit429',
    keyGenerator: () => 'same-key',
  });
  const req = { ip: '10.0.0.1' };
  await limiter(req, createMockRes(), () => {});
  await limiter(req, createMockRes(), () => {});
  const res = createMockRes();
  let nextCalls = 0;
  await limiter(req, res, () => {
    nextCalls += 1;
  });
  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 429);
  assert.ok(res.headers['retry-after']);
  assert.ok(res.body?.retryAfterSec >= 1);
});

test('createRateLimiter fail-opens when store consume throws', async () => {
  const store = {
    async consume() {
      throw new Error('redis down');
    },
  };
  const limiter = createRateLimiter({ store, scope: 'failopen' });
  const res = createMockRes();
  let nextCalls = 0;
  await limiter({ ip: '1.1.1.1' }, res, () => {
    nextCalls += 1;
  });
  assert.equal(nextCalls, 1);
});

test('createRateLimiter klämmer max under 1 till 1', async () => {
  const store = createInMemoryRateLimitStore();
  const limiter = createRateLimiter({
    store,
    max: 0,
    windowMs: 60_000,
    scope: 'max-clamp',
    keyGenerator: () => 'single',
  });
  await limiter({}, createMockRes(), () => {});
  const res = createMockRes();
  let nextCalls = 0;
  await limiter({}, res, () => {
    nextCalls += 1;
  });
  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 429);
});

test('createRateLimiter anvander custom message pa 429', async () => {
  const store = createInMemoryRateLimitStore();
  const limiter = createRateLimiter({
    store,
    max: 1,
    windowMs: 60_000,
    scope: 'msg-custom',
    keyGenerator: () => 'k1',
    message: 'Långsamt läge aktivt.',
  });
  await limiter({}, createMockRes(), () => {});
  const res = createMockRes();
  await limiter({}, res, () => {});
  assert.equal(res.body?.error, 'Långsamt läge aktivt.');
});

test('createRateLimiter default key skiljer åt per IP', async () => {
  const store = createInMemoryRateLimitStore();
  const limiter = createRateLimiter({
    store,
    max: 1,
    windowMs: 60_000,
    scope: 'per-ip',
  });
  let calls = 0;
  await limiter({ ip: '10.0.0.2' }, createMockRes(), () => {
    calls += 1;
  });
  await limiter({ ip: '10.0.0.3' }, createMockRes(), () => {
    calls += 1;
  });
  assert.equal(calls, 2);
});

test('createRateLimiter använder fallback-store när store saknar consume()', async () => {
  const limiter = createRateLimiter({
    store: {},
    max: 1,
    windowMs: 60_000,
    scope: 'fallback-store',
    keyGenerator: () => 'same',
  });
  await limiter({}, createMockRes(), () => {});
  const blocked = createMockRes();
  let nextCalls = 0;
  await limiter({}, blocked, () => {
    nextCalls += 1;
  });
  assert.equal(nextCalls, 0);
  assert.equal(blocked.statusCode, 429);
});

test('createRateLimiter blank scope faller tillbaka till default', async () => {
  const store = createInMemoryRateLimitStore();
  const limiter = createRateLimiter({
    store,
    max: 1,
    windowMs: 60_000,
    scope: '   ',
    keyGenerator: () => 'scoped-key',
  });
  await limiter({}, createMockRes(), () => {});
  const blocked = createMockRes();
  await limiter({}, blocked, () => {});
  assert.equal(blocked.statusCode, 429);
});

test('createRateLimiter default nyckel använder unknown-ip när req.ip saknas', async () => {
  const store = createInMemoryRateLimitStore();
  const limiter = createRateLimiter({
    store,
    max: 1,
    windowMs: 60_000,
    scope: 'default-ip-key',
  });
  await limiter({}, createMockRes(), () => {});
  const blocked = createMockRes();
  await limiter({}, blocked, () => {});
  assert.equal(blocked.statusCode, 429);
});

test('createRateLimiter använder anonymous key när keyGenerator returnerar tomt', async () => {
  const store = createInMemoryRateLimitStore();
  const limiter = createRateLimiter({
    store,
    max: 1,
    windowMs: 60_000,
    scope: 'anon-key',
    keyGenerator: () => '',
  });
  await limiter({}, createMockRes(), () => {});
  const blocked = createMockRes();
  await limiter({}, blocked, () => {});
  assert.equal(blocked.statusCode, 429);
});

test('createRateLimiter klämmer windowMs under minimum (5000ms)', async () => {
  const store = createInMemoryRateLimitStore();
  const limiter = createRateLimiter({
    store,
    max: 1,
    windowMs: 1,
    scope: 'window-clamp',
    keyGenerator: () => 'w1',
  });
  const res = createMockRes();
  await limiter({}, res, () => {});
  const reset = Number(res.headers['x-ratelimit-reset']);
  const nowSec = Math.floor(Date.now() / 1000);
  assert.ok(reset >= nowSec + 4);
});

test('createRateLimiter klämmer max över tak 10000', async () => {
  const store = createInMemoryRateLimitStore();
  const limiter = createRateLimiter({
    store,
    max: 999_999,
    windowMs: 60_000,
    scope: 'max-tak',
    keyGenerator: () => 'big-max',
  });
  const res = createMockRes();
  await limiter({}, res, () => {});
  assert.equal(res.headers['x-ratelimit-limit'], '10000');
});

test('createRateLimiter klämmer windowMs över 24h', async () => {
  const store = createInMemoryRateLimitStore();
  const limiter = createRateLimiter({
    store,
    max: 2,
    windowMs: 500 * 60 * 60 * 1000,
    scope: 'window-max-tak',
    keyGenerator: () => 'wide-window',
  });
  const res = createMockRes();
  await limiter({}, res, () => {});
  const reset = Number(res.headers['x-ratelimit-reset']);
  const nowSec = Math.floor(Date.now() / 1000);
  const capSec = 24 * 60 * 60;
  assert.ok(reset <= nowSec + capSec + 5);
});

test('createRateLimiter använder safeMax och 0 remaining när store returnerar NaN-fält', async () => {
  const store = {
    async consume() {
      return { allowed: true, limit: NaN, remaining: NaN, resetAt: NaN };
    },
  };
  const limiter = createRateLimiter({ store, max: 12, windowMs: 60_000, scope: 'nan-headers' });
  const res = createMockRes();
  await limiter({ ip: '8.8.8.8' }, res, () => {});
  assert.equal(res.headers['x-ratelimit-limit'], '12');
  assert.equal(res.headers['x-ratelimit-remaining'], '0');
  assert.ok(Number.isFinite(Number(res.headers['x-ratelimit-reset'])));
});

test('createRateLimiter 429 sätter retryAfter 1 när store utelämnar retryAfterSec', async () => {
  let n = 0;
  const store = {
    async consume() {
      n += 1;
      if (n === 1) {
        return { allowed: true, limit: 1, remaining: 0, resetAt: Date.now() + 60_000 };
      }
      return { allowed: false };
    },
  };
  const limiter = createRateLimiter({ store, max: 1, windowMs: 60_000, scope: 'retry-default', keyGenerator: () => 'r1' });
  await limiter({}, createMockRes(), () => {});
  const res = createMockRes();
  await limiter({}, res, () => {});
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['retry-after'], '1');
  assert.equal(res.body?.retryAfterSec, 1);
});
