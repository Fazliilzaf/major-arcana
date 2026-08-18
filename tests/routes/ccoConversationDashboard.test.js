'use strict';

/* CCO Conversation Dashboard — Fas 5.2
 * Verifierar att /cco/runtime/dashboard returnerar sentimentfördelning
 * och SLA-breach-trend utöver bas-KPI:erna. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoConversationRouter } = require('../../src/routes/ccoConversation');
const { createCcoConversationStateStore } = require('../../src/ops/ccoConversationStateStore');

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const TENANT_ID = 'hair-tp-clinic';

function requireAuth(req, res, next) {
  req.auth = { tenantId: TENANT_ID, role: 'owner', userId: 'owner-1' };
  req.tenantId = TENANT_ID;
  next();
}

async function createFixture({ messages = [], states = [] } = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-dashboard-'));
  const conversationStateStore = await createCcoConversationStateStore({
    filePath: path.join(tempDir, 'conv-state.json'),
  });
  for (const s of states) {
    await conversationStateStore.writeConversationState({
      tenantId: TENANT_ID,
      actionState: 'handled',
      needsReplyStatusOverride: 'handled',
      actionByUserId: 'owner-1',
      ...s,
    });
  }
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createCcoConversationRouter({
      ccoMailboxTruthStore: {
        listMessages({ mailboxIds = [] } = {}) {
          const normalized = new Set(
            mailboxIds.map((id) =>
              String(id || '')
                .trim()
                .toLowerCase()
            )
          );
          if (normalized.size === 0) return messages;
          return messages.filter((m) =>
            normalized.has(
              String(m.mailboxId || '')
                .trim()
                .toLowerCase()
            )
          );
        },
      },
      requireAuth,
      ccoConversationStateStore: conversationStateStore,
      defaultTenantId: TENANT_ID,
      authStore: {
        async addAuditEvent() {
          return true;
        },
      },
    })
  );
  return { app, tempDir, conversationStateStore };
}

test('dashboard returnerar sentimentfördelning från conversation state store', async () => {
  const now = new Date().toISOString();
  const fixture = await createFixture({
    messages: [],
    states: [
      {
        canonicalConversationKey: 'conv-1',
        aiSummary: { sentiment: { tone: 'positive', label: 'Positiv' } },
      },
      {
        canonicalConversationKey: 'conv-2',
        aiSummary: { sentiment: { tone: 'frustrated', label: 'Frustrerad' } },
      },
      {
        canonicalConversationKey: 'conv-3',
        aiSummary: { sentiment: { tone: 'positive', label: 'Positiv' } },
      },
    ],
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/cco/runtime/dashboard?days=7`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.ok);
      assert.deepEqual(body.sentimentDistribution, {
        positive: 2,
        frustrated: 1,
      });
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('dashboard returnerar SLA-breach-trend för obesvarade trådar', async () => {
  const dayMs = 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const oldInbound = new Date(nowMs - 2 * dayMs).toISOString();
  const recentInbound = new Date(nowMs - 12 * 60 * 60 * 1000).toISOString(); // 12h
  const fixture = await createFixture({
    messages: [
      {
        mailboxConversationId: 'conv-old',
        mailboxId: 'kons@hairtpclinic.com',
        folderType: 'inbox',
        sentAt: oldInbound,
      },
      {
        mailboxConversationId: 'conv-recent',
        mailboxId: 'kons@hairtpclinic.com',
        folderType: 'inbox',
        sentAt: recentInbound,
      },
    ],
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/cco/runtime/dashboard?days=7`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.ok);
      assert.ok(Array.isArray(body.slaTrendChart));
      const oldDay = body.slaTrendChart.find((d) => d.date === oldInbound.slice(0, 10));
      assert.ok(oldDay);
      assert.equal(oldDay.total, 1);
      assert.equal(oldDay.breach, 1);
      const recentDay = body.slaTrendChart.find((d) => d.date === recentInbound.slice(0, 10));
      assert.ok(recentDay);
      assert.equal(recentDay.total, 1);
      assert.equal(recentDay.breach, 0);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
