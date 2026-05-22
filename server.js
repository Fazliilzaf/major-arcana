require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('node:fs');
const path = require('node:path');

// Lazy-load playwright: require synkront vid top-level kraschade Node-
// processen med SIGABRT (status 134) vid Render-runtime när chromium-
// binärerna saknades eller native deps inte var installerade. Nu laddas
// playwright bara när PDF/screenshot-feature faktiskt anropas, och
// failure där bryter inte hela servern.
let __playwrightChromium = null;
function getChromium() {
  if (__playwrightChromium) return __playwrightChromium;
  try {
    const pw = require('playwright');
    __playwrightChromium = pw.chromium;
    return __playwrightChromium;
  } catch (error) {
    console.error('Playwright kunde inte laddas (chromium-feature otillgänglig):', error.message);
    throw new Error('Playwright/Chromium är inte tillgängligt i denna miljö.');
  }
}

const { config } = require('./src/config');
const { resolveBrandForHost, resolveBrandFromMap } = require('./src/brand/resolveBrand');
const { resolveCcoNextCanonicalUrl } = require('./src/brand/resolveCcoNextCanonicalUrl');
const { getClientoConfigForBrand, getKnowledgeDirForBrand } = require('./src/brand/runtimeConfig');
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
    const chromium = getChromium();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport, ...pageOptions });
    const origin = `${req.protocol}://${req.get('host')}`;
    const targetUrl = new URL(pagePath, origin);

    await page.goto(targetUrl.toString(), { waitUntil: 'networkidle' });
    await page.emulateMedia({ media });

    if (bodyClass) {
      await page.evaluate((className) => {
        globalThis.document.body.classList.add(className);
      }, bodyClass);
    }

    if (injectCss) {
      await page.addStyleTag({ content: injectCss });
    }

    await page.evaluate(async () => {
      const doc = globalThis.document;
      if (doc?.fonts?.ready) {
        await doc.fonts.ready;
      }
    });

    let pageSize = null;
    if (pageSizeFromDocument || rasterizePage) {
      pageSize = await page.evaluate(() => {
        const doc = globalThis.document;
        return {
          width: Math.ceil(doc.documentElement.scrollWidth),
          height: Math.ceil(
            Math.max(
              doc.documentElement.scrollHeight,
              doc.body.scrollHeight,
              doc.documentElement.offsetHeight,
              doc.body.offsetHeight
            )
          ),
        };
      });
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
  const path = String(req.path || '')
    .trim()
    .toLowerCase();
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
  const staffSurfaces =
    path.startsWith('/major-arcana-preview') ||
    path.startsWith('/staff') ||
    path.startsWith('/mobil') ||
    path.startsWith('/api/v1/cco-journal');
  res.setHeader(
    'Permissions-Policy',
    staffSurfaces
      ? 'camera=(self), microphone=(), geolocation=(), payment=()'
      : 'camera=(), microphone=(), geolocation=(), payment=()'
  );
  // HSTS — endast för HTTPS-anslutningar (Render serverar HTTPS i prod)
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use((req, res, next) => {
  const path = String(req.path || '')
    .trim()
    .toLowerCase();
  const disableCachePaths = new Set([
    '/admin',
    '/admin.html',
    '/admin.js',
    '/cco',
    '/unanswered',
    '/ccp',
    '/admin/cco',
    '/admin/unanswered',
    '/major-arcana-preview',
    '/major-arcana-preview/',
    '/staff',
    '/mobil',
  ]);
  const isPreviewAssetPath =
    path.startsWith('/major-arcana-preview/') ||
    path.startsWith('/staff') ||
    path.startsWith('/mobil');
  const isCcoNextHtmlPath =
    path === '/cco-next' ||
    (path.startsWith('/cco-next/') && !path.startsWith('/cco-next/assets/'));
  if (disableCachePaths.has(path) || isCcoNextHtmlPath || isPreviewAssetPath) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
  return next();
});

app.get('/admin.html', (_req, res) => sendAdminHtml(res));

// ════════════════════════════════════════════════════════════════════
// Fas 27E (2026-05-18): server-side asset pipeline för major-arcana-preview
// ════════════════════════════════════════════════════════════════════
// Ersätt manuell cache-busting (?v=build-XXX) med content-hash baserat
// på faktisk fil. Strippa <script>/<link>-taggar som pekar på filer som
// inte finns på disk (förhindrar 502-buggar typ inline-draft-edit).
const PREVIEW_ROOT = path.join(__dirname, 'public', 'major-arcana-preview');
const __assetHashCache = new Map();

function getAssetHash(relPath) {
  const cleanRel = String(relPath).replace(/^\.\//, '').split('?')[0];
  const fullPath = path.join(PREVIEW_ROOT, cleanRel);
  try {
    const stat = fs.statSync(fullPath);
    const cached = __assetHashCache.get(fullPath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return { hash: cached.hash, exists: true };
    }
    const crypto = require('node:crypto');
    const hash = crypto
      .createHash('sha256')
      .update(fs.readFileSync(fullPath))
      .digest('hex')
      .slice(0, 10);
    __assetHashCache.set(fullPath, { hash, mtimeMs: stat.mtimeMs });
    return { hash, exists: true };
  } catch (_e) {
    return { hash: '', exists: false };
  }
}

function transformPreviewHtml(html) {
  let dropped = 0;
  let bumped = 0;
  // <script src="./X"></script>
  html = html.replace(
    /<script\s+([^>]*?)src=["'](\.\/[^"'?]+)(\?[^"']*)?["']([^>]*?)><\/script>/g,
    (_m, before, src, _q, after) => {
      const { hash, exists } = getAssetHash(src);
      if (!exists) {
        dropped++;
        console.warn(`[asset-pipeline] DEAD SCRIPT removed: ${src}`);
        return `<!-- removed dead import: ${src} -->`;
      }
      bumped++;
      return `<script ${before}src="${src}?v=${hash}"${after}></script>`;
    }
  );
  // <link rel="stylesheet" href="./X.css" />
  html = html.replace(
    /<link\s+([^>]*?)href=["'](\.\/[^"'?]+\.css)(\?[^"']*)?["']([^>]*?)\/?>/g,
    (_m, before, href, _q, after) => {
      const { hash, exists } = getAssetHash(href);
      if (!exists) {
        dropped++;
        console.warn(`[asset-pipeline] DEAD STYLESHEET removed: ${href}`);
        return `<!-- removed dead import: ${href} -->`;
      }
      bumped++;
      return `<link ${before}href="${href}?v=${hash}"${after}/>`;
    }
  );
  if (dropped > 0 || bumped > 0) {
    console.log(`[asset-pipeline] HTML transform: bumped=${bumped} dropped=${dropped}`);
  }
  if (config.staffJournalOpenAccess) {
    const inject = '<script>window.__ARCANA_STAFF_JOURNAL_OPEN__=true;</script>';
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${inject}</head>`);
    }
  }
  return html;
}

function servePreviewHtml(req, res, next) {
  try {
    const htmlPath = path.join(PREVIEW_ROOT, 'index.html');
    const rawHtml = fs.readFileSync(htmlPath, 'utf8');
    const transformed = transformPreviewHtml(rawHtml);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(transformed);
  } catch (error) {
    console.error('[asset-pipeline] Transform misslyckades, fallback till static:', error.message);
    return next();
  }
}

app.get('/major-arcana-preview/', servePreviewHtml);
app.get('/major-arcana-preview/index.html', servePreviewHtml);

app.use(
  express.static('public', {
    setHeaders: (res, filePath) => {
      // P4: cache-strategi för major-arcana-preview/-assets.
      // - HASHADE bundle-filer (app.bundle.<hash>.min.js): 1 år immutable
      //   eftersom hash byts vid varje content-ändring. Cloudflare och
      //   browser kan cacha för evigt utan risk för stale content.
      // - Övriga JS/CSS i major-arcana-preview: kort cache + SWR.
      // - HTML: max-age=0 så ny deploy syns omedelbart, vilket triggar
      //   browser att fetcha den nya hashade bundle-versionen.
      const safe = String(filePath || '').toLowerCase();
      if (/\/major-arcana-preview\/app\.bundle\.[a-f0-9]{6,}\.min\.js$/i.test(safe)) {
        // Content-hashed bundle — säkert att cacha aggressivt
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (/\/major-arcana-preview\/.+\.(js|css)$/i.test(safe)) {
        res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
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
const { createAdminTasksStore } = require('./src/ops/adminTasksStore');
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
const { createAdminWorkspaceRouter } = require('./src/routes/adminWorkspace');
const { createMarketingWorkspaceRouter } = require('./src/routes/marketingWorkspace');
const { createMarketingCampaignDraftsStore } = require('./src/ops/marketingCampaignDraftsStore');
const { createMarketingContentAssetsStore } = require('./src/ops/marketingContentAssetsStore');
const { createMarketingClaimsWhitelistStore } = require('./src/ops/marketingClaimsWhitelistStore');
const { createReportsRouter } = require('./src/routes/reports');
const { createMonitorRouter } = require('./src/routes/monitor');
const { createOpsRouter } = require('./src/routes/ops');
const { createMailInsightsRouter } = require('./src/routes/mailInsights');
const { createCapabilitiesRouter } = require('./src/routes/capabilities');
const { createPublicClinicRouter } = require('./src/routes/publicClinic');
const { createPublicBookingEngineRouter } = require('./src/routes/publicBookingEngine');
const { createPostOpReviewStore } = require('./src/ops/postOpReviewStore');
const { createPostOpReviewRouter } = require('./src/routes/postOpReview');
const { createBillingRouter } = require('./src/routes/billing');
const { createKnowledgeRouter } = require('./src/routes/knowledge');
const { createBillingService } = require('./src/billing/billingService');
const { createStripeClient } = require('./src/billing/stripeClient');
const { createStripeWebhookHandler } = require('./src/billing/stripeWebhook');
const { createTenantKnowledgeStore } = require('./src/knowledge/tenantKnowledgeStore');
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
const { createCcoBookingStore } = require('./src/ops/ccoBookingStore');
const { createCcoBookingEngineStore } = require('./src/ops/ccoBookingEngineStore');
const { createCcoWorkspacePrefsStore } = require('./src/ops/ccoWorkspacePrefsStore');
const { createCcoIntegrationStore } = require('./src/ops/ccoIntegrationStore');
const { createCcoSettingsStore } = require('./src/ops/ccoSettingsStore');
const { createCcoMacroStore } = require('./src/ops/ccoMacroStore');
const { createCcoCustomerStore } = require('./src/ops/ccoCustomerStore');
const { createCcoPatientMasterStore } = require('./src/ops/ccoPatientMasterStore');
const { createCcoJournalStore } = require('./src/ops/ccoJournalStore');
const { createCcoJournalPhotoStore } = require('./src/ops/ccoJournalPhotoStore');
const { createCcoCommercialStore } = require('./src/ops/ccoCommercialStore');
const { createCcoOfferDocumentStore } = require('./src/ops/ccoOfferDocumentStore');
const { createCcoMigrationIndexStore } = require('./src/ops/ccoMigrationIndexStore');
const { createCcoPatientSystemStore } = require('./src/ops/ccoPatientSystemStore');
const { createCcoConsultationStore } = require('./src/ops/ccoConsultationStore');
const { createCcoAftercareStore } = require('./src/ops/ccoAftercareStore');
const { createCcoOperationStore } = require('./src/ops/ccoOperationStore');
const { createCapabilityAnalysisStore } = require('./src/capabilities/analysisStore');
const { createCapabilityExecutor } = require('./src/capabilities/executionService');
const { createSloTicketStore } = require('./src/ops/sloTicketStore');
const { createReleaseGovernanceStore } = require('./src/ops/releaseGovernanceStore');
const { createCcoWorkspaceRouter } = require('./src/routes/ccoWorkspace');
const { createCcoBookingsRouter } = require('./src/routes/ccoBookings');
const { createCcoBookingEngineRouter } = require('./src/routes/ccoBookingEngine');
const { createCcoIntegrationsRouter } = require('./src/routes/ccoIntegrations');
const { createCcoSettingsRouter } = require('./src/routes/ccoSettings');
const { createCcoMacrosRouter } = require('./src/routes/ccoMacros');
const { createCcoCustomersRouter } = require('./src/routes/ccoCustomers');
const { createCcoPatientMasterRouter } = require('./src/routes/ccoPatientMaster');
const { createCcoJournalRouter } = require('./src/routes/ccoJournal');
const { createCcoCommercialRouter } = require('./src/routes/ccoCommercial');
const { createCcoMigrationRouter } = require('./src/routes/ccoMigration');
const { createCcoConsultationsRouter } = require('./src/routes/ccoConsultations');
const { createCcoAftercareRouter } = require('./src/routes/ccoAftercare');
const { createCcoOperationsRouter } = require('./src/routes/ccoOperations');
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

const stripeInstance = createStripeClient();
const knowledgeStore = createTenantKnowledgeStore({
  storePath: path.join(config.stateRoot || './data', 'knowledge.json'),
});
knowledgeStore.load().catch((err) => console.warn('[knowledge-store] Load failed:', err?.message));

const { createExecutiveDecisionFeed } = require('./src/ops/executiveDecisionFeed');
const executiveDecisionFeed = createExecutiveDecisionFeed();

let billingService = null;
let stripeWebhookHandler = null;

let server = null;
const scheduler = null;
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

app.get('/', (req, res) => {
  res.sendFile('index.html', { root: __dirname + '/public' });
});

function redirectStaffMobileEntry(req, res) {
  const query = String(req.url || '').includes('?')
    ? String(req.url).slice(String(req.url).indexOf('?'))
    : '';
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  if (!params.get('view')) params.set('view', 'customers');
  const qs = params.toString();
  res.redirect(302, `/major-arcana-preview/?${qs}`);
}

// Kort mobil-länk för personal (Safari/iPhone) → CCO kundregister + journal
app.get(['/staff', '/mobil'], redirectStaffMobileEntry);

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

app.get('/admin', (req, res) => {
  sendAdminHtml(res);
});

app.get('/cco', (req, res) => {
  const query = String(req.url || '').includes('?')
    ? String(req.url).slice(String(req.url).indexOf('?'))
    : '';
  res.redirect(302, `/admin${query}#cco`);
});

app.get(/^\/cco-next(?:\/.*)?$/, (_req, res) => {
  sendCcoNextUpstreamHtml(res);
});

app.get('/unanswered', (req, res) => {
  sendAdminHtml(res);
});

app.get(['/ccp', '/admin/cco'], (req, res) => {
  const query = String(req.url || '').includes('?')
    ? String(req.url).slice(String(req.url).indexOf('?'))
    : '';
  res.redirect(302, `/admin${query}#cco`);
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

app.get('/api/v1/executive/feed', (req, res) => {
  const entries = executiveDecisionFeed.list({
    severity: req.query?.severity || undefined,
    requiredOwnerAction: req.query?.ownerAction === 'true' ? true : undefined,
    limit: Math.min(50, Math.max(1, Number(req.query?.limit) || 20)),
  });
  const summary = executiveDecisionFeed.getSummary();
  return res.json({ ok: true, entries, summary });
});

app.get('/api/v1/executive/feed/summary', (req, res) => {
  return res.json({ ok: true, ...executiveDecisionFeed.getSummary() });
});

app.post('/api/v1/executive/feed/:entryId/resolve', (req, res) => {
  const result = executiveDecisionFeed.resolve({
    entryId: req.params?.entryId,
    resolvedBy: req.body?.resolvedBy || 'owner',
    resolution: req.body?.resolution || 'acknowledged',
  });
  if (!result) return res.status(404).json({ error: 'Entry hittades inte.' });
  return res.json({ ok: true, entry: result });
});

app.get('/api/public/status', (req, res) => {
  const uptimeSec = runtimeState.startedAt
    ? Math.round((Date.now() - new Date(runtimeState.startedAt).getTime()) / 1000)
    : 0;
  const metrics = runtimeMetricsStore?.getSnapshot?.() || null;
  const errorRate = Number(metrics?.totals?.statusBuckets?.['5xx'] || 0);
  const totalRequests = Number(metrics?.totals?.sampledRequests || 0);
  const hasErrors = errorRate > 0 && totalRequests > 0 && errorRate / totalRequests > 0.05;

  const overallStatus = !runtimeState.ready ? 'degraded' : hasErrors ? 'degraded' : 'operational';

  return res.json({
    status: overallStatus,
    services: {
      api: runtimeState.ready ? 'operational' : 'degraded',
      cco: runtimeState.ready ? 'operational' : 'degraded',
      patientChat: runtimeState.ready ? 'operational' : 'degraded',
    },
    uptime: {
      startedAt: runtimeState.startedAt || null,
      uptimeSeconds: uptimeSec,
    },
    lastCheckedAt: new Date().toISOString(),
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
    console.log(
      'Auth bootstrap hoppades över (ARCANA_OWNER_EMAIL / ARCANA_OWNER_PASSWORD saknas).'
    );
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
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
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
  const adminTasksStore = await createAdminTasksStore({
    filePath: config.adminTasksStorePath,
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
      (config.dataDir
        ? `${config.dataDir}/cco/message-intelligence.json`
        : './data/cco/message-intelligence.json'),
  });
  const customerPreferenceStore = await createCustomerPreferenceStore({
    filePath:
      config.customerPreferenceStorePath ||
      (config.dataDir
        ? `${config.dataDir}/cco/customer-preferences.json`
        : './data/cco/customer-preferences.json'),
  });
  const clientoBookingStore = await createClientoBookingStore({
    filePath:
      config.clientoBookingStorePath ||
      (config.dataDir
        ? `${config.dataDir}/cco/cliento-bookings.json`
        : './data/cco/cliento-bookings.json'),
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
  const ccoBookingStore = await createCcoBookingStore({
    filePath: config.ccoBookingStorePath,
  });
  const ccoBookingEngineStore = await createCcoBookingEngineStore({
    filePath: config.ccoBookingEngineStorePath,
  });
  const postOpReviewStore = await createPostOpReviewStore({
    filePath: config.postOpReviewStorePath,
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
  const ccoPatientMasterStore = await createCcoPatientMasterStore({
    filePath: config.ccoPatientMasterStorePath,
  });
  const ccoJournalStore = await createCcoJournalStore({
    filePath: config.ccoJournalStorePath,
  });
  const ccoJournalPhotoStore = await createCcoJournalPhotoStore({
    baseDir: config.journalPhotosDir,
  });
  const ccoCommercialStore = await createCcoCommercialStore({
    filePath: config.ccoCommercialStorePath,
  });
  const ccoOfferDocumentStore = await createCcoOfferDocumentStore({
    baseDir: config.offerDocumentsDir,
  });
  const ccoMigrationIndexStore = await createCcoMigrationIndexStore({
    filePath: config.ccoMigrationIndexStorePath,
  });
  const ccoPatientSystemStore = await createCcoPatientSystemStore({
    filePath: config.ccoPatientSystemStorePath,
  });
  const ccoConsultationStore = await createCcoConsultationStore({
    filePath: config.ccoConsultationStorePath,
  });
  const ccoAftercareStore = await createCcoAftercareStore({
    filePath: config.ccoAftercareStorePath,
  });
  const ccoOperationStore = await createCcoOperationStore({
    filePath: config.ccoOperationStorePath,
  });

  const tenantConfigStore = await createTenantConfigStore({
    filePath: config.tenantConfigStorePath,
    defaultBrand: config.brand,
  });
  const marketingCampaignDraftsStore = await createMarketingCampaignDraftsStore({
    filePath: config.marketingCampaignDraftsPath,
  });
  const marketingContentAssetsStore = await createMarketingContentAssetsStore({
    filePath: config.marketingContentAssetsPath,
  });
  const marketingClaimsWhitelistStore = await createMarketingClaimsWhitelistStore({
    filePath: config.marketingClaimsWhitelistPath,
  });

  billingService = createBillingService({
    stripe: stripeInstance,
    tenantConfigStore,
    authStore,
  });
  stripeWebhookHandler = createStripeWebhookHandler({
    stripe: stripeInstance,
    tenantConfigStore,
    authStore,
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
    postOpReviewStore,
    adminTasksStore,
    executiveDecisionFeed,
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
  const postOpReviewCapabilityExecutor = createCapabilityExecutor({
    executionGateway,
    authStore,
    tenantConfigStore,
    capabilityAnalysisStore,
    postOpReviewStore,
    buildVersion: process.env.npm_package_version || 'dev',
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
    const resolvedBrand = typeof brand === 'string' && brand.trim() ? brand.trim() : config.brand;
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

  // Web-to-Arcana bridge Fas B: hairtpclinic.com pollar dessa endpoints
  // istället för /public/cliento/* när ARCANA_PROVIDER=booking-engine.
  // Se docs/strategy/web-to-arcana-bridge.md.
  app.use(
    '/api',
    createPublicBookingEngineRouter({
      bookingEngineStore: ccoBookingEngineStore,
      bookingStore: ccoBookingStore,
      config,
    })
  );

  // Post-op review routes — operator-trigger + token-skyddade patient-endpoints.
  // Patient-UI (vanilla HTML på /uppfoljning/:token) på public/uppfoljning/.
  app.use(
    createPostOpReviewRouter({
      postOpReviewStore,
      capabilityExecutor: postOpReviewCapabilityExecutor,
      bookingStore: ccoBookingStore,
      authStore,
      config,
      // M365 Graph send-integration: emailDraft skickas automatiskt om
      // patientEmail finns i request body. Operator slipper copy-paste
      // till Outlook. Faller tillbaka till copy-paste-flow om Graph
      // inte är wired (env-vars saknas) eller om patientEmail saknas.
      graphSendConnector,
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
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
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
        .map((s) =>
          String(s || '')
            .trim()
            .toLowerCase()
        )
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

  const adminCapabilityExecutor = createCapabilityExecutor({
    executionGateway,
    authStore,
    tenantConfigStore,
    capabilityAnalysisStore,
    buildVersion: process.env.npm_package_version || 'dev',
  });
  if (typeof scheduler.setCapabilityExecutor === 'function') {
    scheduler.setCapabilityExecutor(adminCapabilityExecutor);
  }

  app.use(
    '/api/v1',
    createAdminWorkspaceRouter({
      authStore,
      templateStore,
      adminTasksStore,
      scheduler,
      config,
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
      capabilityExecutor: adminCapabilityExecutor,
      templateStore,
      adminTasksStore,
      scheduler,
      appConfig: config,
    })
  );

  app.use(
    '/api/v1',
    createCcoWorkspaceRouter({
      noteStore: ccoNoteStore,
      followUpStore: ccoFollowUpStore,
      bookingStore: ccoBookingStore,
      consultationStore: ccoConsultationStore,
      aftercareStore: ccoAftercareStore,
      operationStore: ccoOperationStore,
      patientSystemStore: ccoPatientSystemStore,
      patientMasterStore: ccoPatientMasterStore,
      journalStore: ccoJournalStore,
      workspacePrefsStore: ccoWorkspacePrefsStore,
      authStore,
      config,
    })
  );

  app.use(
    '/api/v1',
    createMarketingWorkspaceRouter({
      authStore,
      marketingCampaignDraftsStore,
      marketingContentAssetsStore,
      marketingClaimsWhitelistStore,
      config,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  app.use(
    '/api/v1',
    createCcoBookingsRouter({
      bookingStore: ccoBookingStore,
      bookingEngineStore: ccoBookingEngineStore,
      authStore,
      config,
    })
  );

  app.use(
    '/api/v1',
    createCcoBookingEngineRouter({
      bookingEngineStore: ccoBookingEngineStore,
      bookingStore: ccoBookingStore,
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
    createCcoPatientMasterRouter({
      patientMasterStore: ccoPatientMasterStore,
      journalStore: ccoJournalStore,
      migrationIndexStore: ccoMigrationIndexStore,
      patientSystemStore: ccoPatientSystemStore,
      authStore,
      config,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  app.use(
    '/api/v1',
    createCcoJournalRouter({
      journalStore: ccoJournalStore,
      journalPhotoStore: ccoJournalPhotoStore,
      patientMasterStore: ccoPatientMasterStore,
      migrationIndexStore: ccoMigrationIndexStore,
      patientSystemStore: ccoPatientSystemStore,
      authStore,
      config,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  app.use(
    '/api/v1',
    createCcoCommercialRouter({
      commercialStore: ccoCommercialStore,
      journalStore: ccoJournalStore,
      journalPhotoStore: ccoJournalPhotoStore,
      patientMasterStore: ccoPatientMasterStore,
      offerDocumentStore: ccoOfferDocumentStore,
      patientSystemStore: ccoPatientSystemStore,
      authStore,
      config,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  app.use(
    '/api/v1',
    createCcoMigrationRouter({
      patientMasterStore: ccoPatientMasterStore,
      migrationIndexStore: ccoMigrationIndexStore,
      journalStore: ccoJournalStore,
      authStore,
      config,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  app.use(
    '/api/v1',
    createCcoConsultationsRouter({
      consultationStore: ccoConsultationStore,
      patientSystemStore: ccoPatientSystemStore,
      authStore,
      config,
    })
  );

  app.use(
    '/api/v1',
    createCcoAftercareRouter({
      aftercareStore: ccoAftercareStore,
      patientSystemStore: ccoPatientSystemStore,
      authStore,
      config,
    })
  );

  app.use(
    '/api/v1',
    createCcoOperationsRouter({
      operationStore: ccoOperationStore,
      patientSystemStore: ccoPatientSystemStore,
      authStore,
      config,
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
      adminTasksStore,
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
      executiveDecisionFeed,
      marketingCampaignDraftsStore,
      marketingContentAssetsStore,
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
    createBillingRouter({
      billingService,
      stripeWebhookHandler: stripeWebhookHandler.isAvailable() ? stripeWebhookHandler : null,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  app.use(
    '/api/v1',
    createKnowledgeRouter({
      knowledgeStore,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
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
      capabilityAnalysisStore,
      ccoCustomerStore,
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
