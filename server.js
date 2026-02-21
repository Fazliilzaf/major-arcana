require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { config } = require('./src/config');
const { resolveBrandForHost, resolveBrandFromMap } = require('./src/brand/resolveBrand');
const {
  getClientoConfigForBrand,
  getKnowledgeDirForBrand,
} = require('./src/brand/runtimeConfig');

const app = express();
if (config.trustProxy) app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const { openai } = require('./src/openai/client');
const { createMemoryStore } = require('./src/memory/store');
const { createKnowledgeRetriever } = require('./src/knowledge/retriever');
const { createChatHandler } = require('./src/routes/chat');
const { createAuthStore } = require('./src/security/authStore');
const { createAuthMiddleware } = require('./src/security/authMiddleware');
const { createRateLimiter } = require('./src/security/rateLimit');
const { createAuthRouter } = require('./src/routes/auth');
const { createTemplateStore } = require('./src/templates/store');
const { createTemplateRouter } = require('./src/routes/templates');
const { createTenantConfigStore } = require('./src/tenant/configStore');
const { createTenantConfigRouter } = require('./src/routes/tenantConfig');
const { createTenantsRouter } = require('./src/routes/tenants');
const { createDashboardRouter } = require('./src/routes/dashboard');
const { createRiskRouter } = require('./src/routes/risk');
const { createOrchestratorRouter } = require('./src/routes/orchestrator');
const { createReportsRouter } = require('./src/routes/reports');
const { createMonitorRouter } = require('./src/routes/monitor');
const { createOpsRouter } = require('./src/routes/ops');
const { createMailInsightsRouter } = require('./src/routes/mailInsights');

const runtimeState = {
  startedAt: new Date().toISOString(),
  ready: false,
  lastError: null,
};

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: __dirname + "/public" });
});

app.get("/admin", (req, res) => {
  res.sendFile("admin.html", { root: __dirname + "/public" });
});

app.get('/healthz', (req, res) => {
  return res.json({
    ok: true,
    ready: runtimeState.ready,
    startedAt: runtimeState.startedAt,
    uptimeSec: Number(process.uptime().toFixed(1)),
  });
});

app.get('/readyz', (req, res) => {
  if (!runtimeState.ready) {
    return res.status(503).json({
      ok: false,
      ready: false,
      reason: runtimeState.lastError || 'booting',
    });
  }
  return res.json({
    ok: true,
    ready: true,
  });
});

(async () => {
  const authStore = await createAuthStore({
    filePath: config.authStorePath,
    sessionTtlMs: config.authSessionTtlHours * 60 * 60 * 1000,
    loginTicketTtlMs: config.authLoginTicketTtlMinutes * 60 * 1000,
    auditMaxEntries: config.authAuditMaxEntries,
  });

  if (config.bootstrapOwnerEmail && config.bootstrapOwnerPassword) {
    const bootstrap = await authStore.bootstrapOwner({
      tenantId: config.defaultTenantId,
      email: config.bootstrapOwnerEmail,
      password: config.bootstrapOwnerPassword,
    });
    if (bootstrap.bootstrapped) {
      console.log(
        `Auth bootstrap klart för tenant "${config.defaultTenantId}" (${config.bootstrapOwnerEmail})`
      );
    }
  } else {
    console.log('Auth bootstrap hoppades över (ARCANA_OWNER_EMAIL / ARCANA_OWNER_PASSWORD saknas).');
  }

  const auth = createAuthMiddleware({ authStore });
  const loginRateLimiter = createRateLimiter({
    windowMs: config.authLoginRateLimitWindowSec * 1000,
    max: config.authLoginRateLimitMax,
    keyGenerator: (req) => {
      const email =
        typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      return `${String(req.ip || 'unknown-ip')}|${email || 'no-email'}`;
    },
    message: 'För många inloggningsförsök. Vänta en stund och prova igen.',
  });
  const selectTenantRateLimiter = createRateLimiter({
    windowMs: config.authLoginRateLimitWindowSec * 1000,
    max: config.authSelectTenantRateLimitMax,
    keyGenerator: (req) => String(req.ip || 'unknown-ip'),
    message: 'För många tenant-val. Vänta en stund och prova igen.',
  });

  const templateStore = await createTemplateStore({
    filePath: config.templateStorePath,
    maxEvaluations: config.templateEvalMaxEntries,
  });

  const tenantConfigStore = await createTenantConfigStore({
    filePath: config.tenantConfigStorePath,
    defaultBrand: config.brand,
  });

  const memoryStore = await createMemoryStore({
    filePath: config.memoryStorePath,
    ttlMs: config.memoryTtlDays * 24 * 60 * 60 * 1000,
  });

  const knowledgeRetrieverByBrand = new Map();

  function extractHostname(urlValue) {
    if (!urlValue || typeof urlValue !== 'string') return '';
    try {
      return new URL(urlValue).hostname;
    } catch {
      return '';
    }
  }

  function resolveBrand(req, sourceUrl) {
    const sourceHost = extractHostname(sourceUrl);
    const originHost = extractHostname(req.get('origin'));
    const refererHost = extractHostname(req.get('referer'));

    const candidates = config.brandByHost
      ? [sourceHost, originHost, refererHost, req.hostname]
      : [sourceHost, req.hostname, originHost, refererHost];

    if (config.brandByHost) {
      for (const host of candidates) {
        const mapped = resolveBrandFromMap(host, config.brandByHost);
        if (mapped) return mapped;
      }
    }

    for (const host of candidates) {
      const resolved = resolveBrandForHost(host, { defaultBrand: config.brand });
      if (resolved) return resolved;
    }

    return config.brand;
  }

  async function getKnowledgeRetriever(brand) {
    const resolvedBrand =
      typeof brand === 'string' && brand.trim() ? brand.trim() : config.brand;
    const existing = knowledgeRetrieverByBrand.get(resolvedBrand);
    if (existing) return existing;

    const knowledgeDir = getKnowledgeDirForBrand(resolvedBrand);
    const created = createKnowledgeRetriever({ knowledgeDir });
    knowledgeRetrieverByBrand.set(resolvedBrand, created);
    return created;
  }

  app.get('/config', (req, res) => {
    const sourceUrl = typeof req.query.sourceUrl === 'string' ? req.query.sourceUrl : '';
    const brand = resolveBrand(req, sourceUrl);
    const cliento = getClientoConfigForBrand(brand, config);
    return res.json({
      brand,
      cliento,
    });
  });

  app.get('/conversation/:id', async (req, res) => {
    try {
      const conversation = await memoryStore.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ error: 'Hittade ingen konversation.' });
      }
      const sourceUrl = typeof req.query.sourceUrl === 'string' ? req.query.sourceUrl : '';
      const brand = resolveBrand(req, sourceUrl);
      if (conversation.brand && brand && conversation.brand !== brand) {
        return res.status(404).json({ error: 'Hittade ingen konversation.' });
      }
      if (!conversation.brand && brand) {
        await memoryStore.ensureConversation(conversation.id, brand);
      }
      return res.json({
        conversationId: conversation.id,
        summary: conversation.summary || '',
        messages: conversation.messages || [],
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Något gick fel.' });
    }
  });

  app.delete('/conversation/:id', async (req, res) => {
    try {
      const conversation = await memoryStore.getConversation(req.params.id);
      if (!conversation) return res.json({ ok: false });
      const sourceUrl = typeof req.query.sourceUrl === 'string' ? req.query.sourceUrl : '';
      const brand = resolveBrand(req, sourceUrl);
      if (conversation.brand && brand && conversation.brand !== brand) {
        return res.json({ ok: false });
      }
      const ok = await memoryStore.deleteConversation(req.params.id);
      return res.json({ ok });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Något gick fel.' });
    }
  });

  app.post(
    '/chat',
    createChatHandler({
      openai,
      model: config.openaiModel,
      memoryStore,
      resolveBrand,
      getKnowledgeRetriever,
      publicBaseUrl: config.publicBaseUrl,
    })
  );

  app.use(
    '/api/v1',
    createAuthRouter({
      authStore,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      requireTenantScope: auth.requireTenantScope,
      loginRateLimiter,
      selectTenantRateLimiter,
    })
  );

  app.use(
    '/api/v1',
    createTemplateRouter({
      templateStore,
      authStore,
      tenantConfigStore,
      openai,
      model: config.openaiModel,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  app.use(
    '/api/v1',
    createTenantsRouter({
      tenantConfigStore,
      authStore,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  app.use(
    '/api/v1',
    createTenantConfigRouter({
      tenantConfigStore,
      authStore,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  app.use(
    '/api/v1',
    createDashboardRouter({
      templateStore,
      tenantConfigStore,
      authStore,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  app.use(
    '/api/v1',
    createRiskRouter({
      tenantConfigStore,
      templateStore,
      authStore,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  app.use(
    '/api/v1',
    createOrchestratorRouter({
      tenantConfigStore,
      authStore,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  app.use(
    '/api/v1',
    createReportsRouter({
      templateStore,
      authStore,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  app.use(
    '/api/v1',
    createMonitorRouter({
      templateStore,
      tenantConfigStore,
      authStore,
      config,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      runtimeState,
    })
  );

  app.use(
    '/api/v1',
    createMailInsightsRouter({
      authStore,
      templateStore,
      tenantConfigStore,
      config,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  app.use(
    '/api/v1',
    createOpsRouter({
      config,
      authStore,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  runtimeState.ready = true;
  runtimeState.lastError = null;

  app.listen(config.port, () => {
    console.log(`Arcana kör på ${config.publicBaseUrl}`);
  });
})().catch((error) => {
  runtimeState.ready = false;
  runtimeState.lastError = error?.message || 'startup_failed';
  console.error(error);
  process.exit(1);
});
