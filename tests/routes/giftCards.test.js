'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createGiftCardRouter } = require('../../src/routes/giftCards');
const { createGiftCardStore } = require('../../src/pos/giftCardStore');

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}/api/v1`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function createFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-giftcard-route-'));
  const giftCardStore = createGiftCardStore({ filePath: path.join(tempDir, 'gift-cards.json') });
  await giftCardStore.load();

  const app = express();
  app.use(express.json());
  // Auth mock: tenant + user from headers (default tenant-a / OWNER).
  const authStore = {
    requireAuth: (req, _res, next) => {
      req.auth = {
        tenantId: req.headers['x-tenant'] || 'tenant-a',
        userId: req.headers['x-user'] || 'user-1',
        role: req.headers['x-role'] || 'OWNER',
      };
      next();
    },
    requireRole:
      (...roles) =>
      (req, res, next) => {
        if (roles.length && !roles.includes(req.auth?.role)) {
          return res.status(403).json({ ok: false, error: 'forbidden' });
        }
        next();
      },
  };
  app.use('/api/v1', createGiftCardRouter({ authStore, giftCardStore }));
  return { app, tempDir };
}

function h(tenant, role) {
  const headers = { 'content-type': 'application/json' };
  if (tenant) headers['x-tenant'] = tenant;
  if (role) headers['x-role'] = role;
  return headers;
}

test('gift card: issue → list → lookup → redeem → stats', async () => {
  const { app } = await createFixture();
  await withServer(app, async (base) => {
    const issue = await fetch(`${base}/pos/gift-cards`, {
      method: 'POST',
      headers: h('tenant-a', 'OWNER'),
      body: JSON.stringify({ amount: 1000, recipientName: 'Anna' }),
    });
    assert.equal(issue.status, 201);
    const { giftCard } = await issue.json();
    assert.equal(giftCard.originalAmount, 1000);
    assert.equal(giftCard.status, 'active');

    const list = await (await fetch(`${base}/pos/gift-cards`, { headers: h('tenant-a') })).json();
    assert.equal(list.giftCards.length, 1);

    const lookup = await (
      await fetch(`${base}/pos/gift-cards/lookup`, {
        method: 'POST',
        headers: h('tenant-a'),
        body: JSON.stringify({ code: giftCard.code }),
      })
    ).json();
    assert.equal(lookup.giftCard.cardId, giftCard.cardId);

    const redeem = await fetch(`${base}/pos/gift-cards/redeem`, {
      method: 'POST',
      headers: h('tenant-a'),
      body: JSON.stringify({ code: giftCard.code, amount: 400, orderId: 'o1' }),
    });
    assert.equal(redeem.status, 200);
    const redeemBody = await redeem.json();
    assert.equal(redeemBody.redeemed, 400);
    assert.equal(redeemBody.remaining, 600);
    assert.equal(redeemBody.status, 'partially_used');

    const stats = await (
      await fetch(`${base}/pos/gift-cards/stats`, { headers: h('tenant-a') })
    ).json();
    assert.equal(stats.stats.totalIssued, 1);
    assert.equal(stats.stats.totalOutstanding, 600);
    assert.equal(stats.stats.totalRedeemed, 400);
  });
});

test('gift card: invalid amount → 400', async () => {
  const { app } = await createFixture();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/pos/gift-cards`, {
      method: 'POST',
      headers: h('tenant-a', 'OWNER'),
      body: JSON.stringify({ amount: 0 }),
    });
    assert.equal(res.status, 400);
  });
});

test('gift card: STAFF får inte utfärda (endast OWNER)', async () => {
  const { app } = await createFixture();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/pos/gift-cards`, {
      method: 'POST',
      headers: h('tenant-a', 'STAFF'),
      body: JSON.stringify({ amount: 500 }),
    });
    assert.equal(res.status, 403);
  });
});

test('gift card: tenant-isolering — annan tenant ser/når inte kortet', async () => {
  const { app } = await createFixture();
  await withServer(app, async (base) => {
    const issue = await (
      await fetch(`${base}/pos/gift-cards`, {
        method: 'POST',
        headers: h('tenant-a', 'OWNER'),
        body: JSON.stringify({ amount: 1000 }),
      })
    ).json();
    const code = issue.giftCard.code;

    // tenant-b list is empty
    const list = await (await fetch(`${base}/pos/gift-cards`, { headers: h('tenant-b') })).json();
    assert.equal(list.giftCards.length, 0);

    // tenant-b lookup → 404
    const lookup = await fetch(`${base}/pos/gift-cards/lookup`, {
      method: 'POST',
      headers: h('tenant-b'),
      body: JSON.stringify({ code }),
    });
    assert.equal(lookup.status, 404);

    // tenant-b redeem → 404 (cannot drain another tenant's card)
    const redeem = await fetch(`${base}/pos/gift-cards/redeem`, {
      method: 'POST',
      headers: h('tenant-b'),
      body: JSON.stringify({ code, amount: 100 }),
    });
    assert.equal(redeem.status, 404);
  });
});

test('gift card: cancel sätter status cancelled', async () => {
  const { app } = await createFixture();
  await withServer(app, async (base) => {
    const issue = await (
      await fetch(`${base}/pos/gift-cards`, {
        method: 'POST',
        headers: h('tenant-a', 'OWNER'),
        body: JSON.stringify({ amount: 500 }),
      })
    ).json();
    const cancel = await fetch(`${base}/pos/gift-cards/${issue.giftCard.cardId}/cancel`, {
      method: 'POST',
      headers: h('tenant-a', 'OWNER'),
    });
    assert.equal(cancel.status, 200);
    const body = await cancel.json();
    assert.equal(body.giftCard.status, 'cancelled');
  });
});
