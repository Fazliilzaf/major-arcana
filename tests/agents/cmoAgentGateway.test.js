const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const { createCapabilitiesRouter } = require('../../src/routes/capabilities');
const { createExecutionGateway } = require('../../src/gateway/executionGateway');
const { createAuthStore } = require('../../src/security/authStore');
const { createCapabilityAnalysisStore } = require('../../src/capabilities/analysisStore');

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

function createMockAuth(role = 'OWNER') {
  function requireAuth(req, _res, next) {
    req.auth = {
      tenantId: 'tenant-a',
      userId: 'owner-a',
      role,
    };
    next();
  }
  function requireRole(...roles) {
    const allowed = new Set(roles.map((item) => String(item || '').toUpperCase()));
    return (req, res, next) => {
      if (!allowed.has(String(req.auth?.role || '').toUpperCase())) {
        return res.status(403).json({ error: 'Du saknar behörighet för detta.' });
      }
      return next();
    };
  }
  return { requireAuth, requireRole };
}

async function createCmoGatewayHarness() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cmo-agent-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const analysisStore = await createCapabilityAnalysisStore({
    filePath: path.join(tempDir, 'capability-analysis.json'),
    maxEntries: 2000,
  });
  const auth = createMockAuth('OWNER');
  const templateStore = {
    async listTemplates() {
      return [
        {
          id: 'tpl-lead',
          name: 'Lead mall',
          category: 'LEAD',
          state: 'active',
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'tpl-consult',
          name: 'Konsult mall',
          category: 'CONSULTATION',
          state: 'active',
          updatedAt: new Date().toISOString(),
        },
      ];
    },
  };

  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createCapabilitiesRouter({
      authStore,
      tenantConfigStore: {
        async getTenantConfig() {
          return {
            brand: { displayName: 'Arcana Test' },
            riskSensitivityModifier: 0,
          };
        },
      },
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      executionGateway: createExecutionGateway({ buildVersion: 'test-build' }),
      capabilityAnalysisStore: analysisStore,
      templateStore,
    })
  );

  return { app, authStore, analysisStore };
}

async function postCmoRun(baseUrl, body, headers = {}) {
  return fetch(`${baseUrl}/api/v1/agents/CMO/run`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test('CMO agent run aggregates marketing copilot production capabilities', async () => {
  const { app, analysisStore } = await createCmoGatewayHarness();

  await withServer(app, async (baseUrl) => {
    const response = await postCmoRun(
      baseUrl,
      {
        channel: 'admin',
        input: {
          maxTopics: 3,
          targetAudience: 'klinikledning',
          tone: 'educational',
          emailType: 'newsletter',
        },
      },
      {
        'x-correlation-id': 'corr-cmo-1',
        'x-idempotency-key': 'idem-cmo-1',
      }
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.agent.name, 'CMO');
    assert.equal(payload.decision, 'allow');

    const data = payload.output?.data || {};
    assert.equal(data.outputType, 'MarketingCopilot');
    assert.equal(typeof data.executiveSummary, 'string');
    assert.ok(Array.isArray(data.topics));
    assert.ok(data.productionCounts.socialPosts >= 1);
    assert.ok(data.productionCounts.seoBriefs >= 1);
    assert.ok(data.productionCounts.adCopies >= 1);
    assert.ok(data.productionCounts.emailDrafts >= 1);
    assert.equal(data.requiresOwnerApproval, true);
    assert.equal(data.autoPublish, false);
    assert.ok(data.complianceReview);
    assert.equal(typeof data.complianceReview.status, 'string');
    assert.ok(Array.isArray(data.campaigns));
    assert.ok(Array.isArray(data.scheduleItems));
    assert.ok(data.utmPack);
    assert.ok(data.trackingReview);
  });

  const socialEntries = await analysisStore.list({
    tenantId: 'tenant-a',
    capabilityName: 'GenerateSocialPostPack',
    limit: 5,
  });
  const seoEntries = await analysisStore.list({
    tenantId: 'tenant-a',
    capabilityName: 'GenerateSeoBrief',
    limit: 5,
  });
  assert.equal(socialEntries.length, 1);
  assert.equal(seoEntries.length, 1);
});

test('CMO agent run analytics mode returns read-only marketing analytics report', async () => {
  const { app, analysisStore } = await createCmoGatewayHarness();

  await withServer(app, async (baseUrl) => {
    const response = await postCmoRun(
      baseUrl,
      {
        channel: 'admin',
        input: {
          mode: 'analytics',
          period: 'monthly',
          windowDays: 30,
        },
      },
      {
        'x-correlation-id': 'corr-cmo-analytics',
        'x-idempotency-key': 'idem-cmo-analytics',
      }
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.agent.name, 'CMO');
    assert.equal(payload.decision, 'allow');

    const data = payload.output?.data || {};
    assert.equal(data.outputType, 'MarketingAnalytics');
    assert.equal(data.mode, 'analytics');
    assert.equal(data.period, 'monthly');
    assert.equal(data.windowDays, 30);
    assert.equal(data.readOnly, true);
    assert.equal(data.autoPublish, false);
    assert.ok(data.performanceSummary);
    assert.ok(data.marketingBrief);
    assert.equal(typeof data.executiveSummary, 'string');
    assert.ok(Array.isArray(data.underperformingAds));
    assert.ok(data.dataQuality);
  });

  const performanceEntries = await analysisStore.list({
    tenantId: 'tenant-a',
    capabilityName: 'SummarizeMarketingPerformance',
    limit: 5,
  });
  const briefEntries = await analysisStore.list({
    tenantId: 'tenant-a',
    capabilityName: 'GenerateMarketingBrief',
    limit: 5,
  });
  assert.equal(performanceEntries.length, 1);
  assert.equal(briefEntries.length, 1);
});

test('CMO agent run strategy_intel mode returns v2 strategy report', async () => {
  const { app, analysisStore } = await createCmoGatewayHarness();

  await withServer(app, async (baseUrl) => {
    const response = await postCmoRun(
      baseUrl,
      {
        channel: 'admin',
        input: {
          mode: 'strategy_intel',
          maxTopics: 4,
          targetAudience: 'klinikledning',
          targetSegment: 'enterprise',
        },
      },
      {
        'x-correlation-id': 'corr-cmo-intel',
        'x-idempotency-key': 'idem-cmo-intel',
      }
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.agent.name, 'CMO');
    assert.equal(payload.decision, 'allow');

    const data = payload.output?.data || {};
    assert.equal(data.outputType, 'MarketingStrategyIntel');
    assert.equal(data.mode, 'strategy_intel');
    assert.equal(data.readOnly, true);
    assert.equal(data.autoPublish, false);
    assert.equal(data.autoSend, false);
    assert.equal(data.requiresOwnerApproval, true);
    assert.ok(data.competitorLandscape);
    assert.ok(data.nurtureSequence);
    assert.ok(data.winbackCampaign);
    assert.ok(Array.isArray(data.audienceSegments));
    assert.ok(Array.isArray(data.marketingConnectors));
    assert.match(data.executiveSummary, /strategy intel \(v2\)/i);
  });

  const competitorEntries = await analysisStore.list({
    tenantId: 'tenant-a',
    capabilityName: 'AnalyzeCompetitorLandscape',
    limit: 5,
  });
  const nurtureEntries = await analysisStore.list({
    tenantId: 'tenant-a',
    capabilityName: 'GenerateNurtureSequence',
    limit: 5,
  });
  assert.equal(competitorEntries.length, 1);
  assert.equal(nurtureEntries.length, 1);
});
