require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const { config } = require('./src/config');
const { resolveBrandForHost, resolveBrandFromMap } = require('./src/brand/resolveBrand');
const { resolveCcoNextCanonicalUrl } = require('./src/brand/resolveCcoNextCanonicalUrl');
const {
  getClientoConfigForBrand,
  getKnowledgeDirForBrand,
} = require('./src/brand/runtimeConfig');
const { createCorsPolicy } = require('./src/security/corsPolicy');
const { requestContextMiddleware } = require('./src/observability/requestContext');

const app = express();
if (config.trustProxy) app.set('trust proxy', 1);
app.use(cors(createCorsPolicy(config)));
app.use(express.json({ limit: '10mb' }));

const ADMIN_HTML_PATH = path.join(__dirname, 'public', 'admin.html');
const CCO_NEXT_RELEASE_DIST_DIR = path.join(__dirname, 'public', 'cco-next-release');
const CCO_NEXT_RELEASE_HTML_PATH = path.join(CCO_NEXT_RELEASE_DIST_DIR, 'index.html');
const CCO_NEXT_UPSTREAM_DIST_DIR = path.join(__dirname, 'vendor', 'cconext-upstream', 'dist');
const CCO_NEXT_UPSTREAM_HTML_PATH = path.join(CCO_NEXT_UPSTREAM_DIST_DIR, 'index.html');
const rawAdminHtmlTemplate = fs.readFileSync(ADMIN_HTML_PATH, 'utf8');
const uiBuildId = String(
  process.env.ARCANA_UI_BUILD_ID ||
    process.env.RENDER_GIT_COMMIT ||
    process.env.npm_package_version ||
    Date.now()
).trim();

function renderAdminHtml() {
  return rawAdminHtmlTemplate.replace(/__ARCANA_UI_BUILD__/g, uiBuildId);
}

function sendAdminHtml(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('X-Arcana-UI-Build', uiBuildId);
  res.type('html').send(renderAdminHtml());
}

function getCcoNextBuild() {
  if (fs.existsSync(CCO_NEXT_RELEASE_HTML_PATH)) {
    return {
      dir: CCO_NEXT_RELEASE_DIST_DIR,
      htmlPath: CCO_NEXT_RELEASE_HTML_PATH,
      source: 'release-snapshot',
    };
  }
  if (fs.existsSync(CCO_NEXT_UPSTREAM_HTML_PATH)) {
    return {
      dir: CCO_NEXT_UPSTREAM_DIST_DIR,
      htmlPath: CCO_NEXT_UPSTREAM_HTML_PATH,
      source: 'upstream-vendor',
    };
  }
  return null;
}

function hasCcoNextBuild() {
  return Boolean(getCcoNextBuild());
}

function sendCcoNextUpstreamHtml(res) {
  const ccoNextBuild = getCcoNextBuild();
  if (!ccoNextBuild) {
    return sendAdminHtml(res);
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('X-Arcana-Cco-Next-Source', ccoNextBuild.source);
  res.type('html').send(fs.readFileSync(ccoNextBuild.htmlPath, 'utf8'));
}

async function sendStaticPagePdf(
  req,
  res,
  {
    pagePath,
    fileName,
    injectCss = '',
    media = 'print',
    viewport = { width: 1280, height: 1800 },
    pageOptions = {},
    bodyClass = '',
    pdfOptions = {},
    pageSizeFromDocument = false,
    rasterizePage = false,
  }
) {
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport, ...pageOptions });
    const origin = `${req.protocol}://${req.get('host')}`;
    const targetUrl = new URL(pagePath, origin);

    await page.goto(targetUrl.toString(), { waitUntil: 'networkidle' });
    await page.emulateMedia({ media });

    if (bodyClass) {
      await page.evaluate((className) => {
        document.body.classList.add(className);
      }, bodyClass);
    }

    if (injectCss) {
      await page.addStyleTag({ content: injectCss });
    }

    await page.evaluate(async () => {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
    });

    let pageSize = null;
    if (pageSizeFromDocument || rasterizePage) {
      pageSize = await page.evaluate(() => ({
        width: Math.ceil(document.documentElement.scrollWidth),
        height: Math.ceil(
          Math.max(
            document.documentElement.scrollHeight,
            document.body.scrollHeight,
            document.documentElement.offsetHeight,
            document.body.offsetHeight
          )
        ),
      }));
    }

    if (rasterizePage) {
      const screenshotBuffer = await page.screenshot({
        fullPage: true,
        type: 'png',
      });
      const screenshotData = screenshotBuffer.toString('base64');
      const pdfPage = await browser.newPage({
        viewport: {
          width: pageSize.width,
          height: Math.min(pageSize.height, 2000),
        },
      });

      await pdfPage.setContent(
        `<!doctype html>
        <html lang="sv">
          <head>
            <meta charset="utf-8">
            <style>
              html, body {
                margin: 0;
                padding: 0;
                background: #ffffff;
              }

              img {
                display: block;
                width: ${pageSize.width}px;
                height: ${pageSize.height}px;
              }
            </style>
          </head>
          <body>
            <img src="data:image/png;base64,${screenshotData}" alt="Static page PDF export">
          </body>
        </html>`,
        { waitUntil: 'load' }
      );

      const pdfBuffer = await pdfPage.pdf({
        printBackground: true,
        displayHeaderFooter: false,
        width: `${pageSize.width}px`,
        height: `${pageSize.height}px`,
        margin: {
          top: '0',
          right: '0',
          bottom: '0',
          left: '0',
        },
        ...pdfOptions,
      });

      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.send(pdfBuffer);
    }

    let resolvedPdfOptions = {
      printBackground: true,
      displayHeaderFooter: false,
      margin: {
        top: '14mm',
        right: '14mm',
        bottom: '14mm',
        left: '14mm',
      },
      ...pdfOptions,
    };

    if (pageSizeFromDocument) {
      resolvedPdfOptions = {
        ...resolvedPdfOptions,
        width: `${pageSize.width}px`,
        height: `${pageSize.height}px`,
        margin: {
          top: '0',
          right: '0',
          bottom: '0',
          left: '0',
        },
      };
    }

    const pdfBuffer = await page.pdf(resolvedPdfOptions);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF generation failed', error);
    return res.status(500).json({
      ok: false,
      error: 'pdf_generation_failed',
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Avoid stale admin/CCO UI assets between local/staging/prod deployments.
app.use((req, res, next) => {
  const canonicalCcoNextUrl = resolveCcoNextCanonicalUrl({
    requestHost: req.get('host') || req.hostname,
    requestPath: req.path,
    requestSearch: req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '',
    canonicalOrigin: config.ccoNextCanonicalOrigin,
    redirectHosts: config.ccoNextRedirectHosts,
  });
  if (canonicalCcoNextUrl) {
    return res.redirect(302, canonicalCcoNextUrl);
  }
  return next();
});

// S4: Säkerhets-headers (CSP, X-Content-Type-Options, X-Frame-Options,
// Referrer-Policy, Permissions-Policy, HSTS för HTTPS).
// Strikt CSP eftersom 0 inline-scripts finns i major-arcana-preview/index.html.
app.use((req, res, next) => {
  const path = String(req.path || '').trim().toLowerCase();
  const isApi = path.startsWith('/api/');
  const isStream = path.endsWith('/runtime/stream');

  // CSP — endast för HTML-svar, inte för JSON-API eller SSE-streams
  if (!isApi && !isStream) {
    const cspDirectives = [
      "default-src 'self'",
      // 'unsafe-inline' för style behövs för existing CSS-injection från modulerna
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "script-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self' https:",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "media-src 'self'",
      "manifest-src 'self'",
      "worker-src 'self' blob:",
    ].join('; ');
    res.setHeader('Content-Security-Policy', cspDirectives);
  }

  // Generella säkerhets-headers (alla svar)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );
  // HSTS — endast för HTTPS-anslutningar (Render serverar HTTPS i prod)
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }
  next();
});

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
  const isCcoNextHtmlPath =
    path === '/cco-next' ||
    (path.startsWith('/cco-next/') && !path.startsWith('/cco-next/assets/'));
  if (disableCachePaths.has(path) || isCcoNextHtmlPath) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
  return next();
});

app.get('/admin.html', (_req, res) => sendAdminHtml(res));
app.use(
  express.static("public", {
    setHeaders: (res, filePath) => {
      // P4: cache-strategi för major-arcana-preview/-assets.
      // - Aggressiv cache med stale-while-revalidate så browser kan visa
      //   cached version medan en ny laddas i bakgrunden vid nästa besök.
      // - HTML har kort cache så ny deploy syns snabbt.
      const safe = String(filePath || '').toLowerCase();
      if (/\/major-arcana-preview\/.+\.(js|css)$/i.test(safe)) {
        res.setHeader(
          'Cache-Control',
          'public, max-age=300, stale-while-revalidate=86400'
        );
      } else if (/\.(woff2?|ttf|otf|eot|ico|png|jpe?g|svg|webp|gif)$/i.test(safe)) {
        res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      } else if (/\.(js|css)$/i.test(safe)) {
        res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=3600');
      } else if (/\.html?$/i.test(safe)) {
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      }
    },
  })
);
const activeCcoNextBuild = getCcoNextBuild();
if (activeCcoNextBuild) {
  app.use(
    '/cco-next',
    express.static(activeCcoNextBuild.dir, {
      index: false,
      fallthrough: true,
      redirect: false,
    })
  );
}
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
const { createCcoRuntimeStreamRouter } = require('./src/routes/ccoRuntimeStream');
const { createCcoConversationRouter } = require('./src/routes/ccoConversation');
const { createRiskRouter } = require('./src/routes/risk');
const { createIncidentsRouter } = require('./src/routes/incidents');
const { createOrchestratorRouter } = require('./src/routes/orchestrator');
const { createReportsRouter } = require('./src/routes/reports');
const { createMonitorRouter } = require('./src/routes/monitor');
const { createOpsRouter } = require('./src/routes/ops');
const { createMailInsightsRouter } = require('./src/routes/mailInsights');
const { createCapabilitiesRouter } = require('./src/routes/capabilities');
const { createPublicClinicRouter } = require('./src/routes/publicClinic');
const { createMicrosoftGraphReadConnector } = require('./src/infra/microsoftGraphReadConnector');
const { createMicrosoftGraphSendConnector } = require('./src/infra/microsoftGraphSendConnector');
const { createScheduler } = require('./src/ops/scheduler');
const { createAlertNotifier } = require('./src/ops/alertNotifier');
const { runStartupDiskGuard } = require('./src/ops/startupDiskGuard');
const { createSecretRotationStore } = require('./src/ops/secretRotationStore');
const { createRuntimeMetricsStore } = require('./src/ops/runtimeMetrics');
const { createPatientConversionStore } = require('./src/ops/patientConversionStore');
const { createCcoHistoryStore } = require('./src/ops/ccoHistoryStore');
const { createCcoMailboxTruthStore } = require('./src/ops/ccoMailboxTruthStore');
const { createMessageIntelligenceStore } = require('./src/ops/messageIntelligenceStore');
const { createCustomerPreferenceStore } = require('./src/ops/customerPreferenceStore');
const { createClientoBookingStore } = require('./src/ops/clientoBookingStore');
const {
  scheduleBootstrap: scheduleMailboxBootstrap,
  isEnabled: isMailboxBootstrapEnabled,
} = require('./src/ops/bootstrapRunner');
const { createCcoConversationStateStore } = require('./src/ops/ccoConversationStateStore');
const { createCcoConversationNotesStore } = require('./src/ops/ccoConversationNotesStore');
const { createCcoMailTemplateStore } = require('./src/ops/ccoMailTemplateStore');
const { createCcoNoteStore } = require('./src/ops/ccoNoteStore');
const { createCcoFollowUpStore } = require('./src/ops/ccoFollowUpStore');
const { createCcoWorkspacePrefsStore } = require('./src/ops/ccoWorkspacePrefsStore');
const { createCcoIntegrationStore } = require('./src/ops/ccoIntegrationStore');
const { createCcoSettingsStore } = require('./src/ops/ccoSettingsStore');
const { createCcoMacroStore } = require('./src/ops/ccoMacroStore');
const { createCcoCustomerStore } = require('./src/ops/ccoCustomerStore');
const { createCapabilityAnalysisStore } = require('./src/capabilities/analysisStore');
const { createSloTicketStore } = require('./src/ops/sloTicketStore');
const { createReleaseGovernanceStore } = require('./src/ops/releaseGovernanceStore');
const { createCcoWorkspaceRouter } = require('./src/routes/ccoWorkspace');
const { createCcoIntegrationsRouter } = require('./src/routes/ccoIntegrations');
const { createCcoSettingsRouter } = require('./src/routes/ccoSettings');
const { createCcoMacrosRouter } = require('./src/routes/ccoMacros');
const { createCcoCustomersRouter } = require('./src/routes/ccoCustomers');
const { createExecutionGateway } = require('./src/gateway/executionGateway');
const { createRedisExecutionRuntimeBackend } = require('./src/gateway/redisRuntimeBackend');

const runtimeState = {
  startedAt: new Date().toISOString(),
  ready: false,
  lastError: null,
  startupPhase: 'booting',
};
const runtimeMetricsStore = createRuntimeMetricsStore({
  maxSamples: config.metricsMaxSamples,
  slowRequestMs: config.metricsSlowRequestMs,
});

let server = null;
let scheduler = null;
let redisConnection = null;
let isShuttingDown = false;

function setStartupPhase(phase) {
  const normalizedPhase = typeof phase === 'string' ? phase.trim() : '';
  runtimeState.startupPhase = normalizedPhase || 'booting';
}

function createRuntimeGraphReadConnector() {
  const graphReadEnabled = String(process.env.ARCANA_GRAPH_READ_ENABLED || '')
    .trim()
    .toLowerCase();
  if (!['1', 'true', 'yes', 'y', 'on'].includes(graphReadEnabled)) return null;

  return createMicrosoftGraphReadConnector({
    tenantId: String(process.env.ARCANA_GRAPH_TENANT_ID || '').trim(),
    clientId: String(process.env.ARCANA_GRAPH_CLIENT_ID || '').trim(),
    clientSecret: String(process.env.ARCANA_GRAPH_CLIENT_SECRET || '').trim(),
    userId: String(process.env.ARCANA_GRAPH_USER_ID || '').trim(),
    fullTenant: true,
    userScope: 'all',
    authorityHost: String(process.env.ARCANA_GRAPH_AUTHORITY_HOST || '').trim() || undefined,
    graphBaseUrl: String(process.env.ARCANA_GRAPH_BASE_URL || '').trim() || undefined,
    scope: String(process.env.ARCANA_GRAPH_SCOPE || '').trim() || undefined,
  });
}

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: __dirname + "/public" });
});

app.get('/patientinformation/hartransplantation-dhi-prp', (_req, res) => {
  res.sendFile('patientinformation-hartransplantation-dhi-prp.html', {
    root: __dirname + '/public',
  });
});

app.get('/patientinformation/hartransplantation-dhi-prp-minimal', (_req, res) => {
  res.sendFile('patientinformation-hartransplantation-dhi-prp-minimal.html', {
    root: __dirname + '/public',
  });
});

app.get('/patientinformation/hartransplantation-dhi-prp-minimal.pdf', (req, res) =>
  sendStaticPagePdf(req, res, {
    pagePath: '/patientinformation/hartransplantation-dhi-prp-minimal',
    fileName: 'Patientinformation-Hartransplantation-DHI-och-PRP-Hair-TP-Clinic-Minimal.pdf',
    media: 'screen',
    viewport: { width: 1100, height: 1600 },
    bodyClass: 'pdf-server-export',
    pdfOptions: {
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: false,
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '12mm',
        left: '10mm',
      },
    },
  })
);

app.get('/patientinformation/hartransplantation-dhi-prp.pdf', (req, res) =>
  sendStaticPagePdf(req, res, {
    pagePath: '/patientinformation/hartransplantation-dhi-prp?export=pdf',
    fileName: 'Patientinformation-Hartransplantation-DHI-och-PRP-Hair-TP-Clinic.pdf',
    media: 'screen',
    viewport: { width: 430, height: 932 },
    pageOptions: { deviceScaleFactor: 2 },
    bodyClass: 'pdf-server-export',
    rasterizePage: true,
  })
);

app.get('/patientinformation/ogonlocksplastik-curatiio.pdf', (req, res) =>
  sendStaticPagePdf(req, res, {
    pagePath: '/patientinformation-ogonlocksplastik-curatiio.html?v=20260309b',
    fileName: 'Patientinformation-Ogonlocksplastik-Curatiio.pdf',
    media: 'screen',
    viewport: { width: 430, height: 932 },
    pageOptions: { deviceScaleFactor: 2 },
    bodyClass: 'pdf-server-export',
    rasterizePage: true,
  })
);

app.get("/admin", (req, res) => {
  sendAdminHtml(res);
});

app.get('/cco', (req, res) => {
  // Legacy /cco-vyn (admin.html-baserad) ersatt av /major-arcana-preview/
  // som har full feature-paritet plus Cmd+K, sökning, AI-summary, follow-up filters,
  // soft-break och density-toggle. Behåller redirect för bookmarks.
  res.redirect(302, '/major-arcana-preview/');
});

app.get(/^\/cco-next(?:\/.*)?$/, (_req, res) => {
  sendCcoNextUpstreamHtml(res);
});

app.get('/unanswered', (req, res) => {
  sendAdminHtml(res);
});

app.get(['/ccp', '/admin/cco'], (req, res) => {
  res.redirect(302, '/major-arcana-preview/');
});

app.get('/admin/unanswered', (req, res) => {
  res.redirect(302, '/unanswered');
});

// FIX2: publik diag-endpoint — visar vilka ARCANA_*-env är satta + bootstrap-status
app.get('/api/v1/_diag/env', (req, res) => {
  const flags = [
    'ARCANA_STATE_ROOT',
    'ARCANA_BOOTSTRAP_MAILBOX_BACKFILL',
    'ARCANA_BOOTSTRAP_TENANT_ID',
    'ARCANA_BOOTSTRAP_PREFERRED_MAILBOX',
    'ARCANA_BOOTSTRAP_MAILBOX_LOOKBACK_DAYS',
    'ARCANA_BOOTSTRAP_DELAY_MS',
    'ARCANA_GRAPH_READ_ENABLED',
    'ARCANA_GRAPH_SEND_ENABLED',
    'ARCANA_DEFAULT_TENANT',
  ];
  const env = {};
  for (const k of flags) {
    const v = process.env[k];
    env[k] = v === undefined ? null : v.length > 80 ? v.slice(0, 30) + '...' : v;
  }
  return res.json({
    ok: true,
    env,
    cwd: process.cwd(),
    nodeVersion: process.version,
  });
});

// Commit-sha endpoint — så vi kan verifiera vilken version som är deployad
app.get('/api/v1/_diag/version', (req, res) => {
  return res.json({
    ok: true,
    commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'unknown',
    branch: process.env.RENDER_GIT_BRANCH || 'unknown',
    deployedAt: process.env.RENDER_DEPLOY_AT || null,
    serverStartedAt: runtimeState.startedAt,
    fixes: ['FIX3', 'FIX4', 'FIX5', 'FIX6', 'FIX7', 'FIX8'],
  });
});

app.get('/healthz', (req, res) => {
  return res.json({
    ok: true,
    ready: runtimeState.ready,
    startedAt: runtimeState.startedAt,
    startupPhase: runtimeState.startupPhase,
    uptimeSec: Number(process.uptime().toFixed(1)),
  });
});

app.get('/readyz', (req, res) => {
  if (!runtimeState.ready) {
    return res.status(503).json({
      ok: false,
      ready: false,
      reason: runtimeState.lastError || `booting:${runtimeState.startupPhase}`,
    });
  }
  return res.json({
    ok: true,
    ready: true,
  });
});

app.use((req, res, next) => runtimeMetricsStore.middleware(req, res, next));

app.use('/api', (req, res, next) => {
  if (runtimeState.ready === true) return next();
  return res.status(503).json({
    ok: false,
    ready: false,
    reason: runtimeState.lastError || `booting:${runtimeState.startupPhase}`,
  });
});

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  runtimeState.ready = false;
  runtimeState.lastError = `shutdown:${signal}`;
  setStartupPhase('shutdown');
  try {
    if (scheduler) {
      await scheduler.stop();
    }
  } catch (error) {
    console.error('[scheduler] stop failed', error?.message || error);
  }
  try {
    if (redisConnection) {
      await redisConnection.close();
    }
  } catch (error) {
    console.error('[redis] close failed', error?.message || error);
  }
  if (server) {
    await new Promise((resolve) => {
      server.close(() => resolve());
    });
  }
  process.exit(0);
}

server = app.listen(config.port, () => {
  console.log(`Arcana kör på ${config.publicBaseUrl}`);
});

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

(async () => {
  setStartupPhase('startup_disk_guard');
  const diskGuardSummary = await runStartupDiskGuard({ config, logger: console });
  runtimeState.startupDiskGuard = {
    reclaimedBytes: Number(diskGuardSummary?.reclaimedBytes || 0),
    backupDeletedCount: Number(diskGuardSummary?.backupPrune?.deletedCount || 0),
    reportDeletedCount: Number(diskGuardSummary?.reportPrune?.deletedCount || 0),
    tempDeletedCount: Number(diskGuardSummary?.tempFiles?.deletedCount || 0),
    errors: Array.isArray(diskGuardSummary?.errors) ? diskGuardSummary.errors : [],
  };

  setStartupPhase('auth_store');
  const authStore = await createAuthStore({
    filePath: config.authStorePath,
    sessionTtlMs: config.authSessionTtlHours * 60 * 60 * 1000,
    sessionIdleTtlMs: config.authSessionIdleMinutes * 60 * 1000,
    loginTicketTtlMs: config.authLoginTicketTtlMinutes * 60 * 1000,
    auditMaxEntries: config.authAuditMaxEntries,
    auditAppendOnly: config.authAuditAppendOnly,
  });

  setStartupPhase('auth_bootstrap');
  let previewAuthContext = null;
  if (config.bootstrapOwnerEmail && config.bootstrapOwnerPassword) {
    const bootstrap = await authStore.bootstrapOwner({
      tenantId: config.defaultTenantId,
      email: config.bootstrapOwnerEmail,
      password: config.bootstrapOwnerPassword,
      forcePasswordReset: config.bootstrapOwnerResetPassword,
      forceMfaReset: config.bootstrapOwnerResetMfa,
    });
    if (bootstrap.bootstrapped) {
      previewAuthContext = bootstrap;
      const resetMarker = bootstrap.passwordReset ? ' password synced' : '';
      const mfaResetMarker = bootstrap.mfaReset ? ' mfa reset' : '';
      console.log(
        `Auth bootstrap klart för tenant "${config.defaultTenantId}" (${config.bootstrapOwnerEmail})${resetMarker}${mfaResetMarker}`
      );
    }
  } else {
    console.log('Auth bootstrap hoppades över (ARCANA_OWNER_EMAIL / ARCANA_OWNER_PASSWORD saknas).');
  }

  const auth = createAuthMiddleware({ authStore, config, previewAuthContext });
  setStartupPhase('redis_connect');
  redisConnection = createRedisConnection({
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

  setStartupPhase('stores');
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

  // SF3: Multi-layer rate-limit på sensitive endpoints (GDPR + 2FA + Tenant-mgmt)
  const { createMultiLayerRateLimit } = require('./src/security/multiLayerRateLimit');
  const sensitiveLimiter = createMultiLayerRateLimit({
    store: rateLimitStore,
    name: 'sensitive',
    layers: {
      ip: { points: 50, durationSec: 60 },
      user: { points: 30, durationSec: 60 },
      tenant: { points: 200, durationSec: 60 },
    },
  });
  app.use('/api/v1/capabilities/GdprExportCustomer', sensitiveLimiter);
  app.use('/api/v1/capabilities/GdprAnonymizeCustomer', sensitiveLimiter);
  app.use('/api/v1/capabilities/TenantCreate', sensitiveLimiter);
  app.use('/api/v1/capabilities/TenantDisable', sensitiveLimiter);
  app.use('/api/v1/auth/2fa', sensitiveLimiter);

  const templateStore = await createTemplateStore({
    filePath: config.templateStorePath,
    maxEvaluations: config.templateEvalMaxEntries,
  });
  const capabilityAnalysisStore = await createCapabilityAnalysisStore({
    filePath: config.capabilityAnalysisStorePath,
    maxEntries: config.capabilityAnalysisMaxEntries,
  });
  const ccoHistoryStore = await createCcoHistoryStore({
    filePath: config.ccoHistoryStorePath,
  });
  const ccoMailboxTruthStore = await createCcoMailboxTruthStore({
    filePath: config.ccoMailboxTruthStorePath,
  });
  const messageIntelligenceStore = await createMessageIntelligenceStore({
    filePath:
      config.messageIntelligenceStorePath ||
      (config.dataDir ? `${config.dataDir}/cco/message-intelligence.json` : './data/cco/message-intelligence.json'),
  });
  const customerPreferenceStore = await createCustomerPreferenceStore({
    filePath:
      config.customerPreferenceStorePath ||
      (config.dataDir ? `${config.dataDir}/cco/customer-preferences.json` : './data/cco/customer-preferences.json'),
  });
  const clientoBookingStore = await createClientoBookingStore({
    filePath:
      config.clientoBookingStorePath ||
      (config.dataDir ? `${config.dataDir}/cco/cliento-bookings.json` : './data/cco/cliento-bookings.json'),
  });
  const ccoConversationStateStore = await createCcoConversationStateStore({
    filePath: config.ccoConversationStateStorePath,
  });
  const ccoConversationNotesStore = await createCcoConversationNotesStore({
    filePath: config.ccoConversationNotesStorePath,
  });
  const ccoMailTemplateStore = await createCcoMailTemplateStore({
    filePath: config.ccoMailTemplateStorePath,
  });
  const ccoNoteStore = await createCcoNoteStore({
    filePath: config.ccoNoteStorePath,
  });
  const ccoFollowUpStore = await createCcoFollowUpStore({
    filePath: config.ccoFollowUpStorePath,
  });
  const ccoWorkspacePrefsStore = await createCcoWorkspacePrefsStore({
    filePath: config.ccoWorkspacePrefsStorePath,
  });
  const ccoIntegrationStore = await createCcoIntegrationStore({
    filePath: config.ccoIntegrationStorePath,
  });
  const ccoSettingsStore = await createCcoSettingsStore({
    filePath: config.ccoSettingsStorePath,
  });
  const ccoMacroStore = await createCcoMacroStore({
    filePath: config.ccoMacroStorePath,
  });
  const ccoCustomerStore = await createCcoCustomerStore({
    filePath: config.ccoCustomerStorePath,
    historyStore: ccoHistoryStore,
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
  const graphReadConnector = createRuntimeGraphReadConnector();

  // DD1: shared graphSendConnector så scheduler (daily-digest) och
  // routes/capabilities (send-mail) använder samma instans.
  const graphSendConnector = (() => {
    const enabled = String(process.env.ARCANA_GRAPH_SEND_ENABLED || '').toLowerCase() === 'true';
    if (!enabled) return null;
    const tenantId = String(process.env.ARCANA_GRAPH_TENANT_ID || '').trim();
    const clientId = String(process.env.ARCANA_GRAPH_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.ARCANA_GRAPH_CLIENT_SECRET || '').trim();
    if (!tenantId || !clientId || !clientSecret) return null;
    try {
      return createMicrosoftGraphSendConnector({
        tenantId,
        clientId,
        clientSecret,
        authorityHost: String(process.env.ARCANA_GRAPH_AUTHORITY_HOST || '').trim() || undefined,
        graphBaseUrl: String(process.env.ARCANA_GRAPH_BASE_URL || '').trim() || undefined,
        scope: String(process.env.ARCANA_GRAPH_SCOPE || '').trim() || undefined,
      });
    } catch (err) {
      console.warn('[server] kunde inte skapa graphSendConnector', err?.message);
      return null;
    }
  })();

  const scheduler = createScheduler({
    config,
    authStore,
    templateStore,
    capabilityAnalysisStore,
    runtimeMetricsStore,
    ccoHistoryStore,
    ccoCustomerStore,
    graphReadConnector,
    graphSendConnector,
    tenantConfigStore,
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

  setStartupPhase('routes');
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
      ownerMfaRequired: config.authOwnerMfaRequired,
      ownerMfaBypassHosts: config.authOwnerMfaBypassHosts,
      bootstrapOwnerEmail: config.bootstrapOwnerEmail,
      bootstrapOwnerPassword: config.bootstrapOwnerPassword,
      bootstrapOwnerTenantId: config.defaultTenantId,
      bootstrapOwnerResetPassword: config.bootstrapOwnerResetPassword,
      ownerCredentialSelfHeal: config.authOwnerCredentialSelfHeal,
      loginSessionRotationScope: config.authLoginSessionRotationScope,
      majorArcanaPreviewAutoAuth: config.majorArcanaPreviewAutoAuth,
      majorArcanaPreviewAutoAuthHosts: config.majorArcanaPreviewAutoAuthHosts,
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

  // P7: Real-time stream för CCO frontend (heartbeat + poll-trigger)
  const ccoRuntimeStreamRouter = createCcoRuntimeStreamRouter({
    pollIntervalMs: 10000,
    heartbeatIntervalMs: 30000,
  });
  app.use('/api/v1', ccoRuntimeStreamRouter);

  // Default mailboxar för manuell sync — använd MAILBOX_ALLOWLIST om satt,
  // annars HairTP-defaults (alla 6 mailboxar). Behåller fallback i sync med
  // bootstrapRunner.resolveMailboxIds() så vi alltid täcker hela kontot.
  const allowlistSyncMailboxIds = String(process.env.ARCANA_MAILBOX_ALLOWLIST || '')
    .split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const hairTpFallbackMailboxIds = [
    'contact@hairtpclinic.com',
    'info@hairtpclinic.com',
    'kons@hairtpclinic.com',
    'egzona@hairtpclinic.com',
    'fazli@hairtpclinic.com',
    'marknad@hairtpclinic.com',
  ];
  const schedulerCcoHistoryMailboxIds = Array.isArray(config.schedulerCcoHistoryMailboxIds)
    ? config.schedulerCcoHistoryMailboxIds
        .map((s) => String(s || '').trim().toLowerCase())
        .filter(Boolean)
    : [];
  const defaultSyncMailboxIds =
    allowlistSyncMailboxIds.length > 0
      ? allowlistSyncMailboxIds
      : schedulerCcoHistoryMailboxIds.length > 0
        ? schedulerCcoHistoryMailboxIds
        : hairTpFallbackMailboxIds;
  console.log('[server] defaultSyncMailboxIds for /cco/runtime/sync:', defaultSyncMailboxIds);

  // CCO Conversation messages — full tråd-historik + AI-summary + reply + Klar/Senare + notes + sync
  app.use(
    '/api/v1',
    createCcoConversationRouter({
      ccoMailboxTruthStore,
      requireAuth: auth.requireAuth,
      openai,
      openaiModel: config.openaiModel,
      graphSendConnector,
      graphReadConnector,
      runtimeStreamRouter: ccoRuntimeStreamRouter,
      mailboxIdsForSync: defaultSyncMailboxIds,
      syncLookbackDays: Number(process.env.ARCANA_CCO_SYNC_LOOKBACK_DAYS) || 14,
      ccoConversationStateStore,
      ccoConversationNotesStore,
      ccoMailTemplateStore,
      clientoBookingStore,
      defaultTenantId: 'cco',
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
    createCcoWorkspaceRouter({
      noteStore: ccoNoteStore,
      followUpStore: ccoFollowUpStore,
      workspacePrefsStore: ccoWorkspacePrefsStore,
      authStore,
      config,
    })
  );

  app.use(
    '/api/v1',
    createCcoIntegrationsRouter({
      integrationStore: ccoIntegrationStore,
      authStore,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      runtimeState,
    })
  );

  app.use(
    '/api/v1',
    createCcoSettingsRouter({
      settingsStore: ccoSettingsStore,
      authStore,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  app.use(
    '/api/v1',
    createCcoMacrosRouter({
      macroStore: ccoMacroStore,
      authStore,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  app.use(
    '/api/v1',
    createCcoCustomersRouter({
      customerStore: ccoCustomerStore,
      authStore,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  app.use(
    '/api/v1',
    createCapabilitiesRouter({
      authStore,
      tenantConfigStore,
      ccoSettingsStore,
      ccoConversationStateStore,
      templateStore,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      executionGateway,
      capabilityAnalysisStore,
      ccoHistoryStore,
      ccoMailboxTruthStore,
      ccoCustomerStore,
      runtimeMetricsStore,
      clientoBookingStore,
      scheduler,
      graphReadConnector,
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
      ccoMailboxTruthStore,
      messageIntelligenceStore,
      customerPreferenceStore,
      ccoHistoryStore,
      graphSendConnector,
      runtimeMetricsStore,
      clientoBookingStore,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  setStartupPhase('scheduler');
  runtimeState.ready = true;
  runtimeState.lastError = null;
  setStartupPhase('ready');

  const schedulerStatus = await scheduler.start();
  if (schedulerStatus?.enabled) {
    console.log(
      `[scheduler] aktiv (${schedulerStatus.jobs.filter((job) => job.enabled).length} jobb)`
    );
  } else {
    console.log('[scheduler] inaktiv (ARCANA_SCHEDULER_ENABLED=false)');
  }

  // DI9 + FIX2: auto-bootstrap mailbox-backfill ALLTID (om hair-tp-clinic).
  // Tidigare berodde på ARCANA_BOOTSTRAP_MAILBOX_BACKFILL=true men Render
  // env-vars syncas inte alltid till container. Hårdcodar nu för Hair TP
  // så data garanterat fylls vid varje server-start.
  process.env.ARCANA_BOOTSTRAP_MAILBOX_BACKFILL = 'true';
  console.log('[bootstrap] FIX2: hårdcodar bootstrap-aktivering, schemalägger…');
  scheduleMailboxBootstrap({
    tenantId:
      process.env.ARCANA_BOOTSTRAP_TENANT_ID ||
      process.env.ARCANA_DEFAULT_TENANT ||
      'hair-tp-clinic',
    graphReadConnector,
    ccoMailboxTruthStore,
    messageIntelligenceStore,
    customerPreferenceStore,
  });
})().catch((error) => {
  runtimeState.ready = false;
  runtimeState.lastError = error?.message || 'startup_failed';
  setStartupPhase('startup_failed');
  console.error(error);
  if (server) {
    server.close(() => process.exit(1));
    return;
  }
  process.exit(1);
});
