const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { createRateLimiter } = require('../../src/security/rateLimit');

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

test('rate limiter uses provided store + scope and returns 429 on block', async () => {
  const consumeCalls = [];
  const perKeyCounter = new Map();

  const store = {
    async consume({ scope, key, max, windowMs, nowMs }) {
      consumeCalls.push({ scope, key, max, windowMs, nowMs });
      const count = (perKeyCounter.get(`${scope}:${key}`) || 0) + 1;
      perKeyCounter.set(`${scope}:${key}`, count);
      if (count > 1) {
        return {
          allowed: false,
          limit: max,
          remaining: 0,
          resetAt: nowMs + windowMs,
          retryAfterSec: 9,
        };
      }
      return {
        allowed: true,
        limit: max,
        remaining: max - 1,
        resetAt: nowMs + windowMs,
        retryAfterSec: 0,
      };
    },
  };

  const limiter = createRateLimiter({
    windowMs: 30000,
    max: 2,
    scope: 'test_scope',
    store,
    keyGenerator: (req) => req.get('x-test-key') || 'anon',
    message: 'rate blocked',
  });

  const app = express();
  app.get('/limited', limiter, (_req, res) => {
    res.json({ ok: true });
  });

  await withServer(app, async (baseUrl) => {
    const first = await fetch(`${baseUrl}/limited`, {
      headers: {
        'x-test-key': 'same-key',
      },
    });
    assert.equal(first.status, 200);

    const second = await fetch(`${baseUrl}/limited`, {
      headers: {
        'x-test-key': 'same-key',
      },
    });
    assert.equal(second.status, 429);
    const payload = await second.json();
    assert.equal(payload.error, 'rate blocked');
    assert.equal(payload.retryAfterSec, 9);
    assert.equal(second.headers.get('retry-after'), '9');
  });

  assert.equal(consumeCalls.length, 2);
  assert.equal(consumeCalls[0].scope, 'test_scope');
  assert.equal(consumeCalls[0].key, 'same-key');
});
