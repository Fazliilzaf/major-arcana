require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { config } = require('./src/config');
const { resolveBrandForHost, resolveBrandFromMap } = require('./src/brand/resolveBrand');
const {
  getClientoConfigForBrand,
  getKnowledgeDirForBrand,
} = require('./src/brand/runtimeConfig');
const { createCorsPolicy } = require('./src/security/corsPolicy');
const { requestContextMiddleware } = require('./src/observability/requestContext');

const app = express();
if (config.trustProxy) app.set('trust proxy', 1);
app.use(cors(createCorsPolicy(config)));
app.use(express.json());

// Avoid stale admin/CCO UI assets between local/staging/prod deployments.
app.use((req, res, next) => {
  const path = String(req.path || '').trim().toLowerCase();
  const disableCachePaths = new Set([
    '/admin',
    '/admin.html',
    '/admin.js',
    '/cco',
    '/unanswered',
    '/ccp',
    '/admin/cco',
    '/admin/unanswered',
  ]);
  if (disableCachePaths.has(path)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
  return next();
});
app.use(express.static("public"));
app.use(requestContextMiddleware({ headerName: 'x-correlation-id' }));

const { openai } = require('./src/openai/client');
const { createMemoryStore } = require('./src/memory/store');
const { createKnowledgeRetriever } = require('./src/knowledge/retriever');
const { createChatHandler } = require('./src/routes/chat');
const { createAuthStore } = require('./src/security/authStore');
const { createAuthMiddleware } = require('./src/security/authMiddleware');
const { createRateLimiter } = require('./src/security/rateLimit');
const {
  createInMemoryRateLimitStore,
  createRedisRateLimitStore,
} = require('./src/security/rateLimitStores');
const { createRedisConnection } = require('./src/infra/redisClient');
const { createAuthRouter } = require('./src/routes/auth');
const { createTemplateStore } = require('./src/templates/store');
const { createTemplateRouter } = require('./src/routes/templates');
const { createTenantConfigStore } = require('./src/tenant/configStore');
const { createTenantConfigRouter } = require('./src/routes/tenantConfig');
const { createTenantsRouter } = require('./src/routes/tenants');
const { createDashboardRouter } = require('./src/routes/dashboard');
const { createRiskRouter } = require('./src/routes/risk');
const { createIncidentsRouter } = require('./src/routes/incidents');
const { createOrchestratorRouter } = require('./src/routes/orchestrator');
const { createReportsRouter } = require('./src/routes/reports');
const { createMonitorRouter } = require('./src/routes/monitor');
const { createOpsRouter } = require('./src/routes/ops');
const { createMailInsightsRouter } = require('./src/routes/mailInsights');
const { createCapabilitiesRouter } = require('./src/routes/capabilities');
const { createPublicClinicRouter } = require('./src/routes/publicClinic');
const { createScheduler } = require('./src/ops/scheduler');
const { createAlertNotifier } = require('./src/ops/alertNotifier');
const { createSecretRotationStore } = require('./src/ops/secretRotationStore');
const { createRuntimeMetricsStore } = require('./src/ops/runtimeMetrics');
const { createPatientConversionStore } = require('./src/ops/patientConversionStore');
const { createCapabilityAnalysisStore } = require('./src/capabilities/analysisStore');
const { createSloTicketStore } = require('./src/ops/sloTicketStore');
const { createReleaseGovernanceStore } = require('./src/ops/releaseGovernanceStore');
const { createExecutionGateway } = require('./src/gateway/executionGateway');
const { createRedisExecutionRuntimeBackend } = require('./src/gateway/redisRuntimeBackend');

const runtimeState = {
  startedAt: new Date().toISOString(),
  ready: false,
  lastError: null,
};
const runtimeMetricsStore = createRuntimeMetricsStore({
  maxSamples: config.metricsMaxSamples,
  slowRequestMs: config.metricsSlowRequestMs,
});

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: __dirname + "/public" });
});

app.get("/admin", (req, res) => {
  res.sendFile("admin.html", { root: __dirname + "/public" });
});

app.get('/cco', (req, res) => {
  res.sendFile("admin.html", { root: __dirname + "/public" });
});

app.get('/unanswered', (req, res) => {
  res.sendFile("admin.html", { root: __dirname + "/public" });
});

app.get(['/ccp', '/admin/cco'], (req, res) => {
  res.redirect(302, '/cco');
});

app.get('/admin/unanswered', (req, res) => {
  res.redirect(302, '/unanswered');
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

app.use((req, res, next) => runtimeMetricsStore.middleware(req, res, next));

(async () => {
  const authStore = await createAuthStore({
    filePath: config.authStorePath,
    sessionTtlMs: config.authSessionTtlHours * 60 * 60 * 1000,
    sessionIdleTtlMs: config.authSessionIdleMinutes * 60 * 1000,
    loginTicketTtlMs: config.authLoginTicketTtlMinutes * 60 * 1000,
    auditMaxEntries: config.authAuditMaxEntries,
    auditAppendOnly: config.authAuditAppendOnly,
  });

  if (config.bootstrapOwnerEmail && config.bootstrapOwnerPassword) {
    const bootstrap = await authStore.bootstrapOwner({
      tenantId: config.defaultTenantId,
      email: config.bootstrapOwnerEmail,
      password: config.bootstrapOwnerPassword,
      forcePasswordReset: config.bootstrapOwnerResetPassword,
      forceMfaReset: config.bootstrapOwnerResetMfa,
    });
    if (bootstrap.bootstrapped) {
      const resetMarker = bootstrap.passwordReset ? ' password synced' : '';
      const mfaResetMarker = bootstrap.mfaReset ? ' mfa reset' : '';
      console.log(
        `Auth bootstrap klart för tenant "${config.defaultTenantId}" (${config.bootstrapOwnerEmail})${resetMarker}${mfaResetMarker}`
      );
    }
  } else {
    console.log('Auth bootstrap hoppades över (ARCANA_OWNER_EMAIL / ARCANA_OWNER_PASSWORD saknas).');
  }

  const auth = createAuthMiddleware({ authStore });
  const redisConnection = createRedisConnection({
    url: config.redisUrl,
    required:
      config.distributedBackend === 'redis' &&
      (Boolean(config.redisRequired) || Boolean(config.isProduction)),
    connectTimeoutMs: config.redisConnectTimeoutMs,
    logger: console,
  });
  const redisStatus = await redisConnection.connect();
  const redisClient = redisConnection.isConnected() ? redisConnection.getClient() : null;
  const distributedRedisReady = Boolean(config.distributedBackend === 'redis' && redisClient);
  if (config.distributedBackend === 'redis' && !distributedRedisReady) {
    if (config.isProduction) {
      throw new Error(
        'ARCANA_DISTRIBUTED_BACKEND=redis kräver aktiv Redis i production (memory fallback är blockerad).'
      );
    }
    console.warn(
      '[distributed] redis backend requested but unavailable; falling back to in-memory runtime.'
    );
  }

  const rateLimitStore = distributedRedisReady
    ? createRedisRateLimitStore({
        redisClient,
        keyPrefix: `${config.redisKeyPrefix}:ratelimit`,
        logger: console,
      })
    : createInMemoryRateLimitStore();

  const gatewayRuntimeBackend = distributedRedisReady
    ? createRedisExecutionRuntimeBackend({
        redisClient,
        keyPrefix: `${config.redisKeyPrefix}:gateway`,
        logger: console,
        queueLockTtlMs: config.gatewayQueueLockTtlMs,
        queueAcquireTimeoutMs: config.gatewayQueueAcquireTimeoutMs,
        queuePollIntervalMs: config.gatewayQueuePollIntervalMs,
      })
    : null;

  runtimeState.distributed = {
    backend: config.distributedBackend,
    redisStatus,
    active: distributedRedisReady,
  };

  const loginRateLimiter = createRateLimiter({
    windowMs: config.authLoginRateLimitWindowSec * 1000,
    max: config.authLoginRateLimitMax,
    keyGenerator: (req) => {
      const email =
        typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      return `${String(req.ip || 'unknown-ip')}|${email || 'no-email'}`;
    },
    message: 'För många inloggningsförsök. Vänta en stund och prova igen.',
    store: rateLimitStore,
    scope: 'auth_login',
  });
  const selectTenantRateLimiter = createRateLimiter({
    windowMs: config.authLoginRateLimitWindowSec * 1000,
    max: config.authSelectTenantRateLimitMax,
    keyGenerator: (req) => String(req.ip || 'unknown-ip'),
    message: 'För många tenant-val. Vänta en stund och prova igen.',
    store: rateLimitStore,
    scope: 'auth_select_tenant',
  });
  const apiReadRateLimiter = createRateLimiter({
    windowMs: config.apiRateLimitWindowSec * 1000,
    max: config.apiRateLimitReadMax,
    keyGenerator: (req) => String(req.ip || 'unknown-ip'),
    message: 'För många läs-anrop. Vänta en stund och försök igen.',
    store: rateLimitStore,
    scope: 'api_read',
  });
  const apiWriteRateLimiter = createRateLimiter({
    windowMs: config.apiRateLimitWindowSec * 1000,
    max: config.apiRateLimitWriteMax,
    keyGenerator: (req) => String(req.ip || 'unknown-ip'),
    message: 'För många skriv-anrop. Vänta en stund och försök igen.',
    store: rateLimitStore,
    scope: 'api_write',
  });
  const riskRateLimiter = createRateLimiter({
    windowMs: config.apiRateLimitWindowSec * 1000,
    max: config.riskRateLimitMax,
    keyGenerator: (req) => String(req.ip || 'unknown-ip'),
    message: 'För många risk-anrop. Vänta en stund och försök igen.',
    store: rateLimitStore,
    scope: 'risk',
  });
  const orchestratorRateLimiter = createRateLimiter({
    windowMs: config.apiRateLimitWindowSec * 1000,
    max: config.orchestratorRateLimitMax,
    keyGenerator: (req) => String(req.ip || 'unknown-ip'),
    message: 'För många orchestrator-anrop. Vänta en stund och försök igen.',
    store: rateLimitStore,
    scope: 'orchestrator',
  });
  const publicClinicRateLimiter = createRateLimiter({
    windowMs: config.publicRateLimitWindowSec * 1000,
    max: config.publicClinicRateLimitMax,
    keyGenerator: (req) => String(req.ip || 'unknown-ip'),
    message: 'För många publika klinikanrop. Vänta en stund och försök igen.',
    store: rateLimitStore,
    scope: 'public_clinic',
  });
  const publicChatRateLimiter = createRateLimiter({
    windowMs: config.publicRateLimitWindowSec * 1000,
    max: config.publicChatRateLimitMax,
    keyGenerator: (req) => String(req.ip || 'unknown-ip'),
    message: 'För många chat-anrop. Vänta en stund och försök igen.',
    store: rateLimitStore,
    scope: 'public_chat',
  });

  app.use('/api/v1', (req, res, next) => {
    const endpoint = String(req.path || '');
    if (endpoint.startsWith('/auth/login') || endpoint.startsWith('/auth/select-tenant')) {
      return next();
    }
    const method = String(req.method || 'GET').toUpperCase();
    const isReadMethod = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
    if (isReadMethod) {
      return apiReadRateLimiter(req, res, next);
    }
    return apiWriteRateLimiter(req, res, next);
  });
  app.use('/api/v1/risk', riskRateLimiter);
  app.use('/api/v1/orchestrator', orchestratorRateLimiter);
  app.use('/api/public', publicClinicRateLimiter);

  const templateStore = await createTemplateStore({
    filePath: config.templateStorePath,
    maxEvaluations: config.templateEvalMaxEntries,
  });

  const tenantConfigStore = await createTenantConfigStore({
    filePath: config.tenantConfigStorePath,
    defaultBrand: config.brand,
  });
  const secretRotationStore = await createSecretRotationStore({
    filePath: config.secretRotationStorePath,
    config,
  });
  const sloTicketStore = await createSloTicketStore({
    filePath: config.sloTicketStorePath,
    maxTickets: config.schedulerSloTicketStoreMaxEntries,
  });
  const releaseGovernanceStore = await createReleaseGovernanceStore({
    filePath: config.releaseGovernanceStorePath,
    maxCycles: config.releaseGovernanceMaxCycles,
  });

  const scheduler = createScheduler({
    config,
    authStore,
    templateStore,
    runtimeMetricsStore,
    secretRotationStore,
    sloTicketStore,
    releaseGovernanceStore,
    alertNotifier: createAlertNotifier({
      webhookUrl: config.alertWebhookUrl,
      webhookSecret: config.alertWebhookSecret,
      webhookTimeoutMs: config.alertWebhookTimeoutMs,
      logger: console,
    }),
    logger: console,
  });

  const memoryStore = await createMemoryStore({
    filePath: config.memoryStorePath,
    ttlMs: config.memoryTtlDays * 24 * 60 * 60 * 1000,
  });
  const patientConversionStore = await createPatientConversionStore({
    filePath: config.patientSignalStorePath,
    maxEvents: config.patientSignalMaxEvents,
    retentionDays: config.patientSignalRetentionDays,
  });
  const capabilityAnalysisStore = await createCapabilityAnalysisStore({
    filePath: config.capabilityAnalysisStorePath,
    maxEntries: config.capabilityAnalysisMaxEntries,
  });
  const executionGateway = createExecutionGateway({
    buildVersion: process.env.npm_package_version || 'dev',
    runtimeBackend: gatewayRuntimeBackend,
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

  app.use(
    '/api',
    createPublicClinicRouter({
      tenantConfigStore,
      config,
    })
  );

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
    publicChatRateLimiter,
    createChatHandler({
      openai,
      model: config.openaiModel,
      memoryStore,
      resolveBrand,
      getKnowledgeRetriever,
      authStore,
      executionGateway,
      resolveTenantId: (req, sourceUrl, resolvedBrand) => {
        const fromBrand = typeof resolvedBrand === 'string' ? resolvedBrand.trim() : '';
        if (fromBrand) return fromBrand;
        return resolveBrand(req, sourceUrl);
      },
      patientConversionStore,
      betaGate: {
        enabled: config.publicChatBetaEnabled,
        headerName: config.publicChatBetaHeader,
        key: config.publicChatBetaKey,
        allowHosts: config.publicChatBetaAllowHosts,
        allowLocalhost: config.publicChatBetaAllowLocalhost,
        denyMessage: config.publicChatBetaDenyMessage,
        killSwitch: config.publicChatKillSwitch,
        killSwitchMessage: config.publicChatKillSwitchMessage,
        maxTurns: config.publicChatMaxTurns,
        promptInjectionFilterEnabled: config.publicChatPromptInjectionFilterEnabled,
        promptInjectionMessage: config.publicChatPromptInjectionMessage,
      },
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
      ownerMfaBypassHosts: config.authOwnerMfaBypassHosts,
      loginSessionRotationScope: config.authLoginSessionRotationScope,
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
      executionGateway,
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
      runtimeMetricsStore,
      scheduler,
      sloTicketStore,
      releaseGovernanceStore,
      config,
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
      config,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  app.use(
    '/api/v1',
    createIncidentsRouter({
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
      executionGateway,
    })
  );

  app.use(
    '/api/v1',
    createCapabilitiesRouter({
      authStore,
      tenantConfigStore,
      templateStore,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      executionGateway,
      capabilityAnalysisStore,
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
      secretRotationStore,
      patientConversionStore,
      runtimeMetricsStore,
      sloTicketStore,
      executionGateway,
      config,
      scheduler,
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
      executionGateway,
    })
  );

  app.use(
    '/api/v1',
    createOpsRouter({
      config,
      authStore,
      secretRotationStore,
      scheduler,
      templateStore,
      tenantConfigStore,
      sloTicketStore,
      releaseGovernanceStore,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  runtimeState.ready = true;
  runtimeState.lastError = null;

  const server = app.listen(config.port, () => {
    console.log(`Arcana kör på ${config.publicBaseUrl}`);
  });

  const schedulerStatus = await scheduler.start();
  if (schedulerStatus?.enabled) {
    console.log(
      `[scheduler] aktiv (${schedulerStatus.jobs.filter((job) => job.enabled).length} jobb)`
    );
  } else {
    console.log('[scheduler] inaktiv (ARCANA_SCHEDULER_ENABLED=false)');
  }

  let isShuttingDown = false;
  async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    runtimeState.ready = false;
    runtimeState.lastError = `shutdown:${signal}`;
    try {
      await scheduler.stop();
    } catch (error) {
      console.error('[scheduler] stop failed', error?.message || error);
    }
    try {
      await redisConnection.close();
    } catch (error) {
      console.error('[redis] close failed', error?.message || error);
    }
    await new Promise((resolve) => {
      server.close(() => resolve());
    });
    process.exit(0);
  }

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
})().catch((error) => {
  runtimeState.ready = false;
  runtimeState.lastError = error?.message || 'startup_failed';
  console.error(error);
  process.exit(1);
});
