require('dotenv').config();
/* global ensureAssetStores, gatherStores */
const express = require('express');
const cors = require('cors');
const fs = require('node:fs');
const path = require('node:path');

// Lazy-load playwright: require synkront vid top-level kraschade Node-
// processen med SIGABRT (status 134) vid Render-runtime nÃ¤r chromium-
// binÃ¤rerna saknades eller native deps inte var installerade. Nu laddas
// playwright bara nÃ¤r PDF/screenshot-feature faktiskt anropas, och
// failure dÃ¤r bryter inte hela servern.
let __playwrightChromium = null;
function getChromium() {
  if (__playwrightChromium) return __playwrightChromium;
  try {
    const pw = require('playwright');
    __playwrightChromium = pw.chromium;
    return __playwrightChromium;
  } catch (error) {
    console.error('Playwright kunde inte laddas (chromium-feature otillgÃ¤nglig):', error.message);
    throw new Error('Playwright/Chromium Ã¤r inte tillgÃ¤ngligt i denna miljÃ¶.');
  }
}

const { config } = require('./src/config');
const { resolveBrandForHost, resolveBrandFromMap } = require('./src/brand/resolveBrand');
const { resolveCcoNextCanonicalUrl } = require('./src/brand/resolveCcoNextCanonicalUrl');
const { resolveLegacyHostRedirectUrl } = require('./src/brand/resolveLegacyHostRedirectUrl');
const { assetToPatientFile, resolvePatientAssetIds } = require('./src/ops/ccoPatientAssetIdentity');
const {
  createCcoPatientAssetStore: createSharedCcoPatientAssetStore,
} = require('./src/ops/ccoPatientAssetStore');
const {
  createCcoAssetImportRunStore: createSharedCcoAssetImportRunStore,
} = require('./src/ops/ccoAssetImportRunStore');
const {
  createCcoAssetReviewQueueStore: createSharedCcoAssetReviewQueueStore,
} = require('./src/ops/ccoAssetReviewQueueStore');
const {
  createSecureStorageProvider: createSharedSecureStorageProvider,
} = require('./src/ops/ccoSecureStorageProvider');
const {
  createDriveIngestRuntimeControl,
  evaluateDriveIngestHardGate,
} = require('./src/ops/ccoDriveIngestRuntimeControl');

const { getClientoConfigForBrand, getKnowledgeDirForBrand } = require('./src/brand/runtimeConfig');
const { createCorsPolicy } = require('./src/security/corsPolicy');
const { requestContextMiddleware } = require('./src/observability/requestContext');

const app = express();
let runtimeMailAssetCache = null;
if (config.trustProxy) app.set('trust proxy', 1);
app.use(cors(createCorsPolicy(config)));
app.use(express.json({ limit: '10mb' }));

let ccoRequireAuthMiddleware = null;
let sharedPatientAssetStorePromise = null;
// ORD-69: CM-storen monteras efter schedulern â€” deps sÃ¤tts vid CM-mount och
// hÃ¤mtas lazy av cm_mail_sync-jobbet (samma mÃ¶nster som ccoRequireAuthMiddleware).
let cmMailSyncSchedulerDeps = null;
let sharedAssetImportRunStorePromise = null;
let sharedAssetReviewQueueStorePromise = null;
let sharedSecureStoragePromise = null;
async function resolveSharedPatientAssetStore() {
  if (app.locals.ccoPatientAssetStore) return app.locals.ccoPatientAssetStore;
  if (!sharedPatientAssetStorePromise) {
    sharedPatientAssetStorePromise = createSharedCcoPatientAssetStore({
      filePath: config.ccoPatientAssetsPath,
      auditLog: ccoAuditLog,
    }).then((store) => {
      app.locals.ccoPatientAssetStore = store;
      return store;
    });
  }
  return sharedPatientAssetStorePromise;
}
async function resolveSharedAssetImportRunStore() {
  if (app.locals.ccoAssetImportRunStore) return app.locals.ccoAssetImportRunStore;
  if (!sharedAssetImportRunStorePromise) {
    sharedAssetImportRunStorePromise = createSharedCcoAssetImportRunStore({
      filePath: config.ccoAssetImportRunsPath,
      auditLog: ccoAuditLog,
    }).then((store) => {
      app.locals.ccoAssetImportRunStore = store;
      return store;
    });
  }
  return sharedAssetImportRunStorePromise;
}
async function resolveSharedAssetReviewQueueStore() {
  if (app.locals.ccoAssetReviewQueueStore) return app.locals.ccoAssetReviewQueueStore;
  if (!sharedAssetReviewQueueStorePromise) {
    sharedAssetReviewQueueStorePromise = createSharedCcoAssetReviewQueueStore({
      filePath: config.ccoAssetReviewQueuePath,
      auditLog: ccoAuditLog,
    }).then((store) => {
      app.locals.ccoAssetReviewQueueStore = store;
      return store;
    });
  }
  return sharedAssetReviewQueueStorePromise;
}
async function resolveSharedSecureStorage() {
  if (app.locals.ccoSecureStorage) return app.locals.ccoSecureStorage;
  if (!sharedSecureStoragePromise) {
    sharedSecureStoragePromise = Promise.resolve(
      createSharedSecureStorageProvider({ provider: 'local' })
    ).then((store) => {
      app.locals.ccoSecureStorage = store;
      return store;
    });
  }
  return sharedSecureStoragePromise;
}
async function resolveSharedAssetStores() {
  const [assetStore, importRunStore, reviewQueueStore, secureStorage] = await Promise.all([
    resolveSharedPatientAssetStore(),
    resolveSharedAssetImportRunStore(),
    resolveSharedAssetReviewQueueStore(),
    resolveSharedSecureStorage(),
  ]);
  return { assetStore, importRunStore, reviewQueueStore, secureStorage };
}

function encodeHeaderFilenamePart(value = '') {
  return encodeURIComponent(String(value || '')).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function buildSafeContentDisposition(disposition = 'attachment', fileName = 'download') {
  const mode = disposition === 'inline' ? 'inline' : 'attachment';
  const rawName =
    String(fileName || 'download')
      .replace(/[\r\n]/g, '')
      .trim() || 'download';
  const fallback =
    rawName
      .normalize('NFKD')
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/["\\;]+/g, '')
      .trim()
      .slice(0, 180) || 'download';
  return `${mode}; filename="${fallback}"; filename*=UTF-8''${encodeHeaderFilenamePart(rawName)}`;
}

function decodeImageDataUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const match = raw.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!buffer.length) return null;
  return { mimeType: match[1], buffer };
}
function requireCcoAuthenticated(req, res, next) {
  if (typeof ccoRequireAuthMiddleware !== 'function') {
    return res.status(503).json({ error: 'auth_not_ready' });
  }
  return ccoRequireAuthMiddleware(req, res, next);
}

// â”€â”€â”€ CCO Kunder-modul: lista, dossiÃ©r, foto-storage + iCal â”€â”€â”€â”€â”€â”€â”€â”€â”€
try {
  const customersPatch = require('./public/major-arcana-preview/customers/server-patch');
  customersPatch(app, {
    dataDir: path.join(__dirname, 'data'),
    uploadDir: path.join(__dirname, 'data', 'photos'),
  });
  const icalPatch = require('./public/major-arcana-preview/customers/ical-patch');
  icalPatch(app, {});
} catch (err) {
  console.warn('[cco-customers] kunde inte montera modul:', err.message);
}

// â”€â”€ CCO RBAC + Audit-log (Sprint 1.1 + 1.2) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let ccoAuditLog = null;
try {
  const { createCcoAuditLog } = require('./src/security/ccoAuditLog');
  const { requireAnyRole, attachRole } = require('./src/security/ccoRbac');
  const { createCcoAuditRouter } = require('./src/routes/ccoAudit');
  ccoAuditLog = createCcoAuditLog({
    filePath: path.join(__dirname, 'data', 'cco-audit.jsonl'),
  });

  // Routes flyttade till src/routes/ccoAudit.js (se ORGANISATION.md Â§4).
  app.use('/api/v1', createCcoAuditRouter({ ccoAuditLog, attachRole, requireAnyRole }));

  // Expose to other handlers via app.locals
  app.locals.ccoAuditLog = ccoAuditLog;
  console.log('[cco-audit] monterad: GET /api/v1/cco-audit (owner/revisor only) + POST');
} catch (err) {
  console.warn('[cco-audit] kunde inte montera:', err.message);
}

// â”€â”€ CCO Booking-Case Flow (Sprint 1.3) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let ccoBookingCaseStore = null;
(async () => {
  try {
    const { createCcoBookingCaseStore } = require('./src/ops/ccoBookingCaseStore');
    const { attachRole, requirePermission } = require('./src/security/ccoRbac');
    ccoBookingCaseStore = await createCcoBookingCaseStore({
      filePath: path.join(__dirname, 'data', 'cco-booking-cases.json'),
      auditLog: ccoAuditLog,
    });
    const express = require('express');
    const jsonParser = express.json({ limit: '32kb' });

    app.get(
      '/api/v1/cco-booking-cases',
      attachRole,
      requirePermission('bookings.read'),
      async (req, res) => {
        try {
          const list = await ccoBookingCaseStore.listCases({
            tenantId: req.query.tenantId || 'hairtp-clinic',
            state: req.query.state || null,
            assignedTo: req.query.assignedTo || null,
            limit: Number(req.query.limit) || 200,
          });
          res.json({ count: list.length, items: list, stats: ccoBookingCaseStore.stats() });
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.get(
      '/api/v1/cco-booking-cases/:id',
      attachRole,
      requirePermission('bookings.read'),
      async (req, res) => {
        const c = await ccoBookingCaseStore.getCase(req.params.id);
        if (!c) return res.status(404).json({ error: 'not_found' });
        res.json(c);
      }
    );

    app.post(
      '/api/v1/cco-booking-cases',
      attachRole,
      requirePermission('bookings.write'),
      jsonParser,
      async (req, res) => {
        try {
          const c = await ccoBookingCaseStore.createCase(req.body || {}, { role: req.cco?.role });
          res.json(c);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.post(
      '/api/v1/cco-booking-cases/:id/candidates',
      attachRole,
      requirePermission('bookings.write'),
      jsonParser,
      async (req, res) => {
        try {
          const c = await ccoBookingCaseStore.proposeCandidate(req.params.id, req.body || {}, {
            role: req.cco?.role,
          });
          res.json(c);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.post(
      '/api/v1/cco-booking-cases/:id/transition',
      attachRole,
      requirePermission('bookings.case_decide'),
      jsonParser,
      async (req, res) => {
        try {
          const { toState, ...payload } = req.body || {};
          if (!toState) return res.status(400).json({ error: 'toState required' });
          const c = await ccoBookingCaseStore.transitionState(
            req.params.id,
            toState,
            { role: req.cco?.role },
            payload
          );
          // 19F.5 Fix #6 â€” Booking â†’ Encounter auto-bridge
          // NÃ¤r en booking-case gÃ¥r till 'confirmed' (eller motsvarande), skapa
          // encounter-skal sÃ¥ journal+foton+plan kan lÃ¤nkas under rÃ¤tt besÃ¶k.
          try {
            const enc = app.locals.ccoTreatmentEncounterStore;
            const confirmedStates = ['confirmed', 'scheduled', 'in_progress'];
            if (enc && confirmedStates.includes(String(toState).toLowerCase()) && c?.patientId) {
              const tenantId = c.tenantId || req.cco?.role?.tenantId || 'hair-tp';
              await enc.upsertEncounter({
                tenantId,
                patientId: c.patientId,
                bookingId: c.bookingId || c.id,
                conversationId: c.conversationId || null,
                serviceId: c.serviceId || null,
                serviceLabel: c.serviceLabel || null,
                encounterType:
                  c.encounterType ||
                  (c.serviceId && /fue|dhi|prp|botox|bleph/i.test(c.serviceId)
                    ? c.serviceId.toLowerCase().match(/fue|dhi|prp|botox|bleph/)[0]
                    : 'other'),
                resourceId: c.resourceId || null,
                resourceLabel: c.resourceLabel || null,
                startsAt: c.startsAt || c.scheduledAt || null,
                endsAt: c.endsAt || null,
                status: toState === 'confirmed' ? 'confirmed' : 'reserved',
                channel: 'cco_booking_bridge',
                customerEmail: c.customerEmail || null,
                customerName: c.customerName || null,
              });
              ccoAuditLog?.append?.({
                kind: 'encounter.auto_created_from_booking',
                surface: 'cco.encounter',
                ts: new Date().toISOString(),
                actor: { userId: req.role?.userId, role: req.role?.role },
                detail: {
                  bookingCaseId: c.id,
                  patientId: c.patientId,
                  toState,
                  encounterType: c.encounterType,
                },
              });
            }
          } catch (bridgeErr) {
            // tyst â€” bridge Ã¤r best-effort, blockera inte transition
            console.warn('[bookingâ†’encounter bridge]', bridgeErr.message);
          }
          res.json(c);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.post(
      '/api/v1/cco-booking-cases/:id/handoff',
      attachRole,
      requirePermission('bookings.handoff'),
      jsonParser,
      async (req, res) => {
        try {
          const c = await ccoBookingCaseStore.updateHandoffChecklist(
            req.params.id,
            req.body || {},
            { role: req.cco?.role }
          );
          res.json(c);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.post(
      '/api/v1/cco-booking-cases/:id/handoff/complete',
      attachRole,
      requirePermission('bookings.handoff'),
      async (req, res) => {
        try {
          const c = await ccoBookingCaseStore.attemptHandoffComplete(req.params.id, {
            role: req.cco?.role,
          });
          res.json(c);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.locals.ccoBookingCaseStore = ccoBookingCaseStore;
    console.log(
      '[cco-booking-cases] monterad: GET/POST /api/v1/cco-booking-cases/* (RBAC-skyddat)'
    );
  } catch (err) {
    console.warn('[cco-booking-cases] kunde inte montera:', err.message);
  }
})();

// â”€â”€ CCO Customer Identity routes (Sprint 2.1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
(async () => {
  try {
    const { createCcoCustomerStore } = require('./src/ops/ccoCustomerStore');
    const { attachRole, requirePermission } = require('./src/security/ccoRbac');
    const identityStore = await createCcoCustomerStore({
      filePath: path.join(__dirname, 'data', 'cco-customers.json'),
    });
    const express = require('express');
    const jsonParser = express.json({ limit: '256kb' });
    const DEFAULT_TENANT = process.env.ARCANA_DEFAULT_TENANT_ID || 'hairtp-clinic';

    function withAudit(action, fn) {
      return async (req, res) => {
        try {
          const result = await fn(req);
          if (ccoAuditLog)
            ccoAuditLog.append({
              action: `customers.${action}`,
              actor: {
                role: req.cco?.role || 'unknown',
                ip: (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
                  .toString()
                  .split(',')[0]
                  .trim(),
              },
              target: {
                kind: 'customer',
                id: req.body?.primaryKey || req.body?.sourceKey || null,
                tenantId: req.body?.tenantId || DEFAULT_TENANT,
              },
              detail: { method: req.method, path: req.path },
            });
          res.json(result);
        } catch (err) {
          if (ccoAuditLog)
            ccoAuditLog.append({
              action: `customers.${action}`,
              actor: { role: req.cco?.role || 'unknown' },
              result: 'error',
              detail: { error: err.message, status: err.statusCode || 500 },
            });
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      };
    }

    // GET state (med suggestions)
    app.get(
      '/api/v1/cco-customer-identity/suggestions',
      requireCcoAuthenticated,
      attachRole,
      requirePermission('customers.read'),
      withAudit('suggestions.list', async (req) => {
        const tenantId = req.query.tenantId || DEFAULT_TENANT;
        const data = await identityStore.previewTenantCustomerIdentity({ tenantId });
        return {
          suggestions: data.customerIdentitySuggestions || [],
          count: (data.customerIdentitySuggestions || []).length,
          tenantId,
        };
      })
    );

    // Merge
    app.post(
      '/api/v1/cco-customer-identity/merge',
      attachRole,
      requirePermission('customers.merge'),
      jsonParser,
      withAudit('merge', async (req) => {
        const {
          tenantId = DEFAULT_TENANT,
          primaryKey,
          secondaryKeys,
          keepEmails = true,
          keepPhones = true,
          combineNotes = true,
        } = req.body || {};
        if (!primaryKey || !Array.isArray(secondaryKeys) || !secondaryKeys.length) {
          const err = new Error('primaryKey + secondaryKeys[] krÃ¤vs');
          err.statusCode = 400;
          throw err;
        }
        return identityStore.mergeTenantCustomerProfiles({
          tenantId,
          primaryKey,
          secondaryKeys,
          options: { keepEmails, keepPhones, combineNotes },
        });
      })
    );

    // Split
    app.post(
      '/api/v1/cco-customer-identity/split',
      attachRole,
      requirePermission('customers.split'),
      jsonParser,
      withAudit('split', async (req) => {
        const { tenantId = DEFAULT_TENANT, sourceKey, aliasesToSplit } = req.body || {};
        if (!sourceKey || !Array.isArray(aliasesToSplit) || !aliasesToSplit.length) {
          const err = new Error('sourceKey + aliasesToSplit[] krÃ¤vs');
          err.statusCode = 400;
          throw err;
        }
        return identityStore.splitTenantCustomerProfile({ tenantId, sourceKey, aliasesToSplit });
      })
    );

    // Import â€” preview + commit
    app.post(
      '/api/v1/cco-customer-identity/import/preview',
      attachRole,
      requirePermission('customers.import'),
      jsonParser,
      withAudit('import.preview', async (req) => {
        const {
          tenantId = DEFAULT_TENANT,
          importText = '',
          rows = null,
          binaryBase64 = '',
          fileName = '',
          defaultMailboxId = '',
          sourceSystem = '',
        } = req.body || {};
        return identityStore.previewTenantCustomerImport({
          tenantId,
          importText,
          rows,
          binaryBase64,
          fileName,
          defaultMailboxId,
          sourceSystem,
        });
      })
    );

    app.post(
      '/api/v1/cco-customer-identity/import/commit',
      attachRole,
      requirePermission('customers.import'),
      jsonParser,
      withAudit('import.commit', async (req) => {
        const { tenantId = DEFAULT_TENANT, planId, ...rest } = req.body || {};
        return identityStore.commitTenantCustomerImport({ tenantId, planId, ...rest });
      })
    );

    // Dismiss / accept suggestion
    app.post(
      '/api/v1/cco-customer-identity/suggestion/dismiss',
      attachRole,
      requirePermission('customers.merge'),
      jsonParser,
      withAudit('suggestion.dismiss', async (req) => {
        const { tenantId = DEFAULT_TENANT, suggestionId, reasonCode } = req.body || {};
        if (!suggestionId) {
          const err = new Error('suggestionId krÃ¤vs');
          err.statusCode = 400;
          throw err;
        }
        return identityStore.dismissTenantCustomerSuggestion({
          tenantId,
          suggestionId,
          reasonCode,
        });
      })
    );

    // Primary email
    app.post(
      '/api/v1/cco-customer-identity/primary-email',
      attachRole,
      requirePermission('customers.merge'),
      jsonParser,
      withAudit('primary_email.set', async (req) => {
        const { tenantId = DEFAULT_TENANT, customerKey, email } = req.body || {};
        if (!customerKey || !email) {
          const err = new Error('customerKey + email krÃ¤vs');
          err.statusCode = 400;
          throw err;
        }
        return identityStore.setTenantCustomerPrimaryEmail({ tenantId, customerKey, email });
      })
    );

    console.log(
      '[cco-customer-identity] monterad: 6 routes (merge/split/import/suggestions) med RBAC + audit'
    );
  } catch (err) {
    console.warn('[cco-customer-identity] kunde inte montera:', err.message);
  }
})();

// â”€â”€ CCO Mailbox-admin (Sprint 2.2) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
(async () => {
  try {
    const { attachRole, requirePermission } = require('./src/security/ccoRbac');
    const express = require('express');
    const jsonParser = express.json({ limit: '16kb' });
    const mailboxFile = path.join(__dirname, 'data', 'cco-mailboxes.json');
    const fsp = require('fs').promises;

    async function loadMailboxes() {
      try {
        return JSON.parse(await fsp.readFile(mailboxFile, 'utf8'));
      } catch {
        return { mailboxes: [], updatedAt: new Date().toISOString() };
      }
    }
    async function saveMailboxes(data) {
      data.updatedAt = new Date().toISOString();
      await fsp.writeFile(mailboxFile, JSON.stringify(data, null, 2));
    }

    app.get(
      '/api/v1/cco-mailboxes',
      requireCcoAuthenticated,
      attachRole,
      requirePermission('mailbox.admin'),
      async (req, res) => {
        const data = await loadMailboxes();
        res.json(data);
      }
    );

    app.post(
      '/api/v1/cco-mailboxes',
      requireCcoAuthenticated,
      attachRole,
      requirePermission('mailbox.admin'),
      jsonParser,
      async (req, res) => {
        try {
          const {
            id,
            name,
            email,
            owner,
            signature = '',
            tenantId = 'hairtp-clinic',
          } = req.body || {};
          if (!id || !name || !email)
            return res.status(400).json({ error: 'id, name, email krÃ¤vs' });
          const data = await loadMailboxes();
          const existing = data.mailboxes.find((m) => m.id === id);
          const entry = {
            id,
            name,
            email,
            owner,
            signature,
            tenantId,
            updatedAt: new Date().toISOString(),
          };
          if (existing) Object.assign(existing, entry);
          else {
            entry.createdAt = entry.updatedAt;
            data.mailboxes.push(entry);
          }
          await saveMailboxes(data);
          if (ccoAuditLog)
            ccoAuditLog.append({
              action: existing ? 'mailbox.updated' : 'mailbox.created',
              actor: { role: req.cco?.role },
              target: { kind: 'mailbox', id },
            });
          res.json(entry);
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      }
    );

    app.delete(
      '/api/v1/cco-mailboxes/:id',
      requireCcoAuthenticated,
      attachRole,
      requirePermission('mailbox.admin'),
      async (req, res) => {
        try {
          const data = await loadMailboxes();
          const before = data.mailboxes.length;
          data.mailboxes = data.mailboxes.filter((m) => m.id !== req.params.id);
          if (data.mailboxes.length === before) return res.status(404).json({ error: 'not_found' });
          await saveMailboxes(data);
          if (ccoAuditLog)
            ccoAuditLog.append({
              action: 'mailbox.deleted',
              actor: { role: req.cco?.role },
              target: { kind: 'mailbox', id: req.params.id },
            });
          res.json({ ok: true });
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      }
    );

    // Seed med default mailboxes om filen Ã¤r tom
    const initial = await loadMailboxes();
    if (!initial.mailboxes.length) {
      initial.mailboxes = [
        {
          id: 'contact',
          name: 'Kontakt',
          email: 'contact@hairtpclinic.com',
          owner: 'team',
          signature: 'Hair TP Clinic â€” SveavÃ¤gen 42, 113 50 Stockholm Â· 08-555 123 45',
          tenantId: 'hairtp-clinic',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'info',
          name: 'Info & prisfÃ¶rfrÃ¥gningar',
          email: 'info@hairtpclinic.com',
          owner: 'fazli',
          signature: 'Fazli Â· Hair TP Clinic\n08-555 123 45',
          tenantId: 'hairtp-clinic',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'egzona',
          name: 'Egzona (patientansvarig)',
          email: 'egzona@hairtpclinic.com',
          owner: 'egzona',
          signature: 'Egzona M. Â· Customer Lead\nHair TP Clinic Â· 08-555 123 45',
          tenantId: 'hairtp-clinic',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'fazli',
          name: 'Fazli (medicinskt ansvarig)',
          email: 'fazli@hairtpclinic.com',
          owner: 'fazli',
          signature: 'Dr. Fazli Â· Medical Director\nHair TP Clinic Â· 08-555 123 45',
          tenantId: 'hairtp-clinic',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'marknad',
          name: 'Marknad',
          email: 'marknad@hairtpclinic.com',
          owner: 'marknad',
          signature: 'Hair TP Clinic Â· marknad',
          tenantId: 'hairtp-clinic',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'receipt',
          name: 'Receipts & system',
          email: 'kvitto@hairtpclinic.com',
          owner: 'system',
          signature: '',
          tenantId: 'hairtp-clinic',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'kons',
          name: 'Konsultationer',
          email: 'kons@hairtpclinic.com',
          owner: 'fazli',
          signature: 'Hair TP Clinic Â· konsultation',
          tenantId: 'hairtp-clinic',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      await saveMailboxes(initial);
    }
    console.log(
      '[cco-mailboxes] monterad: GET/POST/DELETE /api/v1/cco-mailboxes (RBAC: mailbox.admin)'
    );
  } catch (err) {
    console.warn('[cco-mailboxes] kunde inte montera:', err.message);
  }
})();

// â”€â”€ CCO Photo Annotation + Treatment Plan Canvas stores (Sprint 19B) â”€â”€
// Instansiera vid startup och lÃ¤gg i app.locals sÃ¥ patient-card-endpoint kan lÃ¤sa.
(async () => {
  try {
    const { createCcoPhotoAnnotationStore } = require('./src/ops/ccoPhotoAnnotationStore');
    const { createCcoTreatmentPlanCanvasStore } = require('./src/ops/ccoTreatmentPlanCanvasStore');
    const { createCcoSecurePortalLinkStore } = require('./src/ops/ccoSecurePortalLinkStore');

    const annotationStore = await createCcoPhotoAnnotationStore({
      filePath: path.join(__dirname, 'data', 'cco-photo-annotations.json'),
      auditLog: ccoAuditLog,
    });
    const planStore = await createCcoTreatmentPlanCanvasStore({
      filePath: path.join(__dirname, 'data', 'cco-treatment-plans.json'),
      auditLog: ccoAuditLog,
      timelineStore: app.locals.ccoHistoryStore || null,
    });
    const portalLinkStore = await createCcoSecurePortalLinkStore({
      filePath: path.join(__dirname, 'data', 'cco-portal-links.json'),
      auditLog: ccoAuditLog,
    });

    app.locals.ccoPhotoAnnotationStore = annotationStore;
    app.locals.ccoTreatmentPlanCanvasStore = planStore;
    app.locals.ccoSecurePortalLinkStore = portalLinkStore;

    // Minimala REST-routes (RBAC: staff+doctor)
    const { attachRole, requireAnyRole } = require('./src/security/ccoRbac');
    const express = require('express');
    const jsonParser = express.json({ limit: '12mb' });

    async function saveAnnotatedPreviewAsset({ annotation, previewDataUrl, actor }) {
      const decoded = decodeImageDataUrl(previewDataUrl);
      if (!decoded) return null;
      const patientId = annotation.patientId || annotation.customerId;
      if (!patientId) return null;
      const nowIso = new Date().toISOString();
      const sourceCaptureDateTime =
        typeof annotation.captureDateTime === 'string' ? annotation.captureDateTime : '';
      const sourceCaptureDate =
        typeof annotation.captureDate === 'string' ? annotation.captureDate.slice(0, 10) : '';
      const documentDate = annotation.documentDate || sourceCaptureDate || nowIso.slice(0, 10);
      const secureStorage = await resolveSharedSecureStorage();
      const assetStore = await resolveSharedPatientAssetStore();
      const sourceAsset =
        annotation.sourceAssetId && assetStore?.getAsset
          ? assetStore.getAsset(annotation.sourceAssetId)
          : null;
      const encounterId = annotation.encounterId || sourceAsset?.encounterId || null;
      const originalName = `Markerad bild ${documentDate}.png`;
      const stored = await secureStorage.putObject({
        body: decoded.buffer,
        contentType: decoded.mimeType,
        metadata: {
          patientId,
          originalFileName: originalName,
          documentDate,
          captureDate: sourceCaptureDate || documentDate,
          captureDateTime: sourceCaptureDateTime || null,
          importedAt: nowIso,
        },
      });
      const thumbnailKey = await secureStorage.generateThumbnailIfImage(
        stored.storageKey,
        decoded.mimeType
      );
      const asset = await assetStore.addAsset(
        {
          patientId,
          encounterId,
          sourceSystem: 'upload',
          sourceRecordId: annotation.id,
          storageProvider: 'local',
          storageKey: stored.storageKey,
          thumbnailKey: thumbnailKey || null,
          checksum: stored.checksum,
          fileSize: stored.size,
          mimeType: decoded.mimeType,
          category: 'photo_during',
          documentDate,
          captureDate: sourceCaptureDate || documentDate,
          captureDateTime: sourceCaptureDateTime || null,
          captureDateSource: sourceCaptureDateTime
            ? 'source_asset_captureDateTime'
            : sourceCaptureDate
              ? 'source_asset_captureDate'
              : annotation.documentDate
                ? 'source_asset_documentDate'
                : 'annotation_created_at',
          captureDateConfidence:
            sourceCaptureDateTime || sourceCaptureDate || annotation.documentDate
              ? 'medium'
              : 'low',
          importedAt: nowIso,
          importedBy: actor.userId || 'cco',
          confidence: 'high',
          status: 'VISIBLE_ON_PATIENT_CARD',
          isJournalRelevant: true,
          isPatientVisible: true,
          displayName: originalName,
          documentTitle: originalName,
          patientCardSection: 'photo',
          imageStage: 'annotated',
          imageType: 'annotated_offer',
          bodyArea: annotation.zone || null,
          version: 'annotated-v1',
          technicalInfo: {
            sourceAnnotationId: annotation.id,
            sourceAssetId: annotation.sourceAssetId || null,
            sourceJournalPhotoId: annotation.sourceJournalPhotoId || null,
            selectedFor: annotation.selectedFor || [],
          },
          selectedFor: Array.isArray(annotation.selectedFor) ? annotation.selectedFor : [],
        },
        { actor }
      );
      return asset;
    }

    // Photo annotations
    app.post(
      '/api/v1/cco-photo-annotations',
      requireCcoAuthenticated,
      attachRole,
      requireAnyRole(['doctor', 'staff', 'owner']),
      jsonParser,
      async (req, res) => {
        try {
          const actor = { userId: req.role?.userId || 'unknown', role: req.role?.role || 'staff' };
          const body = req.body && typeof req.body === 'object' ? { ...req.body } : {};
          const previewDataUrl = body.previewDataUrl || body.annotatedImageDataUrl || '';
          delete body.previewDataUrl;
          delete body.annotatedImageDataUrl;
          let annotation = await annotationStore.createAnnotationSet({ ...body, actor });
          let asset = null;
          if (previewDataUrl) {
            asset = await saveAnnotatedPreviewAsset({ annotation, previewDataUrl, actor });
            if (asset?.id) {
              annotation = await annotationStore.updateAnnotationSet({
                annotationId: annotation.id,
                actor,
                patch: {
                  derivedAssetId: asset.id,
                  previewUrl: `/api/v1/cco/assets/${encodeURIComponent(asset.id)}/thumbnail`,
                  status: 'saved',
                },
              });
            }
          }
          res.json({ annotation, asset });
        } catch (e) {
          res.status(e.statusCode || 400).json({ error: e.message });
        }
      }
    );
    app.patch(
      '/api/v1/cco-photo-annotations/:id',
      attachRole,
      requireAnyRole(['doctor', 'staff', 'owner']),
      jsonParser,
      async (req, res) => {
        try {
          const actor = { userId: req.role?.userId || 'unknown', role: req.role?.role || 'staff' };
          const r = await annotationStore.updateAnnotationSet({
            annotationId: req.params.id,
            actor,
            ...req.body,
          });
          res.json(r);
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );
    app.get(
      '/api/v1/cco-photo-annotations/customer/:cid',
      requireCcoAuthenticated,
      attachRole,
      requireAnyRole(['doctor', 'staff', 'owner', 'revisor']),
      (req, res) => {
        res.json({ annotations: annotationStore.getByCustomer(req.params.cid) });
      }
    );

    // Treatment plans
    app.post(
      '/api/v1/cco-treatment-plans',
      requireCcoAuthenticated,
      attachRole,
      requireAnyRole(['doctor', 'staff', 'owner']),
      jsonParser,
      async (req, res) => {
        try {
          const actor = { userId: req.role?.userId || 'unknown', role: req.role?.role || 'staff' };
          const r = await planStore.createPlan({ ...req.body, actor });
          res.json(r);
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );
    app.patch(
      '/api/v1/cco-treatment-plans/:id',
      attachRole,
      requireAnyRole(['doctor', 'staff', 'owner']),
      jsonParser,
      async (req, res) => {
        try {
          const actor = { userId: req.role?.userId || 'unknown', role: req.role?.role || 'staff' };
          const r = await planStore.updatePlan({ planId: req.params.id, actor, patch: req.body });
          res.json(r);
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );
    app.post(
      '/api/v1/cco-treatment-plans/:id/status',
      attachRole,
      requireAnyRole(['doctor', 'staff', 'owner']),
      jsonParser,
      async (req, res) => {
        try {
          const actor = { userId: req.role?.userId || 'unknown', role: req.role?.role || 'staff' };
          const r = await planStore.setStatus({
            planId: req.params.id,
            actor,
            status: req.body.status,
            reason: req.body.reason,
          });
          res.json(r);
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );
    app.get(
      '/api/v1/cco-treatment-plans/customer/:cid',
      requireCcoAuthenticated,
      attachRole,
      requireAnyRole(['doctor', 'staff', 'owner', 'revisor']),
      (req, res) => {
        res.json({ plans: planStore.getByCustomer(req.params.cid) });
      }
    );
    app.get(
      '/api/v1/cco-treatment-plans/:id',
      attachRole,
      requireAnyRole(['doctor', 'staff', 'owner', 'revisor']),
      (req, res) => {
        const p = planStore.getById(req.params.id);
        if (!p) return res.status(404).json({ error: 'not found' });
        res.json(p);
      }
    );

    console.log('[cco-photo-annot] monterad: POST/PATCH/GET /api/v1/cco-photo-annotations');
    console.log('[cco-treatment-plans] monterad: POST/PATCH/GET /api/v1/cco-treatment-plans');

    // POST /api/v1/cco-offers/from-plan â€” Sprint 19B.3 bridge (plan â†’ offert-draft)
    // Body: { planId, priceTotal, currency?, items?, notes?, customerName?, customerEmail?, validityDays? }
    app.post(
      '/api/v1/cco-offers/from-plan',
      attachRole,
      requireAnyRole(['doctor', 'staff', 'owner']),
      jsonParser,
      async (req, res) => {
        try {
          const offerStore = app.locals.ccoOfferQuickStore;
          if (!offerStore) return res.status(503).json({ error: 'offer_store_not_initialized' });
          const {
            planId,
            priceTotal,
            currency = 'SEK',
            items,
            notes,
            customerName,
            customerEmail,
            validityDays = 14,
          } = req.body || {};
          if (!planId) return res.status(400).json({ error: 'planId krÃ¤vs' });
          const plan = planStore.getById(planId);
          if (!plan) return res.status(404).json({ error: 'plan saknas' });
          if (plan.status === 'converted_to_offer') {
            return res
              .status(409)
              .json({ error: 'plan redan kopplad till offert', existingOfferId: plan.offerId });
          }

          // Bygg auto-items frÃ¥n plan om inte explicit angivet
          const areaItems = (plan.areaSpecs || []).map((s) => ({
            label: `${s.area} (${s.technique || plan.technique || 'fue'})`,
            estimatedGrafts: s.estimatedGrafts || null,
            sessionCount: s.sessionCount || 1,
            note: s.note || '',
          }));
          const imageItems = (plan.selectedImages || []).map((img) => ({
            label: img.label || img.zone || 'Markerad bild',
            assetId: img.assetId || img.id || null,
            annotationId: img.annotationId || null,
            note: [img.date, img.zone].filter(Boolean).join(' Â· ') || 'Offertklar bild',
          }));
          const autoItems =
            items && items.length
              ? items
              : areaItems.length
                ? areaItems.concat(imageItems)
                : imageItems.length
                  ? imageItems
                  : areaItems;
          const treatmentLabel = plan.technique
            ? `Behandlingsplan ${plan.technique.toUpperCase()}${plan.totalGraftEstimate ? ` Â· ~${plan.totalGraftEstimate} grafts` : ''}`
            : 'Behandlingsplan';

          const offerInput = {
            customerId: plan.customerId,
            customerName: customerName || null,
            customerEmail: customerEmail || null,
            treatmentLabel,
            priceTotal: Number(priceTotal) || 0,
            currency,
            items: autoItems,
            notes: notes || plan.providerComment || '',
            validityDays,
            authorId: req.role?.userId || null,
            authorName: req.role?.userId || null,
          };
          const offer = await offerStore.createOffer(offerInput, {
            role: req.cco?.role || req.role?.role,
          });

          // Koppla plan â†’ offert (snapshot av plan-version vid skapandet)
          const updated = await planStore
            .updatePlan({
              planId,
              actor: { userId: req.role?.userId || 'system', role: req.role?.role || 'staff' },
              patch: { providerComment: plan.providerComment }, // no-op patch fÃ¶r att tvinga ny revision om vi vill
            })
            .catch(() => null);
          // Manuell koppling utan version-bump:
          plan.offerId = offer.id;
          plan.offerCreatedAt = new Date().toISOString();
          await planStore.setStatus({
            planId,
            actor: { userId: req.role?.userId || 'system', role: req.role?.role || 'staff' },
            status: 'sent_to_offer',
            reason: `Offert ${offer.id} skapad`,
          });

          // Audit
          try {
            ccoAuditLog?.append?.({
              kind: 'offer.created_from_plan',
              surface: 'cco.offer_from_plan',
              ts: new Date().toISOString(),
              detail: {
                planId,
                offerId: offer.id,
                customerId: plan.customerId,
                technique: plan.technique,
                totalGraftEstimate: plan.totalGraftEstimate,
                priceTotal: offerInput.priceTotal,
                validityDays,
                annotationId: plan.annotationId,
                assetId: plan.assetId,
                actor: req.role?.userId || 'unknown',
              },
            });
          } catch {}

          res.json({
            offerId: offer.id,
            state: offer.state,
            priceTotal: offer.priceTotal,
            planId,
            annotationId: plan.annotationId,
            assetId: plan.assetId,
          });
        } catch (err) {
          console.error('[cco-offers/from-plan]', err);
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );
    console.log('[cco-offers/from-plan] monterad: POST /api/v1/cco-offers/from-plan');

    // Sprint 19B.3.2 â€” Offer PDF Preview + Generate
    const { buildOfferHtml } = require('./src/ops/ccoOfferPdfFromPlan');
    const { renderHtmlToPdfBuffer } = require('./src/ops/ccoOfferPdf');

    function gatherOfferContext(offerId) {
      const offerStore = app.locals.ccoOfferQuickStore;
      if (!offerStore) throw new Error('offer_store_not_initialized');
      const offer =
        offerStore.getById?.(offerId) ||
        (offerStore.listAll?.() || []).find((o) => o.id === offerId);
      if (!offer) {
        const e = new Error('offer saknas');
        e.statusCode = 404;
        throw e;
      }
      // Hitta plan kopplad till offert (via offerStore-state eller scan)
      let plan = null;
      const plans = planStore.getByCustomer(offer.customerId) || [];
      plan = plans.find((p) => p.offerId === offerId) || null;
      // Bygg customer-context (best effort)
      const c = app.locals.ccoCustomerStore?.getByKey?.(offer.customerId);
      const customer = c
        ? { fullName: c.fullName || c.displayName, email: c.email, phone: c.phone, brand: c.brand }
        : { fullName: offer.customerName };
      return { offer, plan, customer };
    }

    // GET /api/v1/cco-offers/:id/preview.html â€” HTML-preview fÃ¶r iframe-render
    app.get(
      '/api/v1/cco-offers/:id/preview.html',
      attachRole,
      requireAnyRole(['doctor', 'staff', 'owner', 'revisor']),
      (req, res) => {
        try {
          const { offer, plan, customer } = gatherOfferContext(req.params.id);
          const html = buildOfferHtml({ offer, plan, customer, legalCopyAvailable: false });
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'private, no-store');
          try {
            ccoAuditLog?.append?.({
              kind: 'offer.preview_opened',
              surface: 'cco.offer_pdf',
              ts: new Date().toISOString(),
              detail: {
                offerId: req.params.id,
                customerId: offer.customerId,
                planId: plan?.planId,
                actor: req.role?.userId || 'unknown',
              },
            });
          } catch {}
          res.send(html);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-offers/:id/pdf â€” generera PDF + spara i secure storage + skapa patient_asset
    app.post(
      '/api/v1/cco-offers/:id/pdf',
      attachRole,
      requireAnyRole(['doctor', 'staff', 'owner']),
      async (req, res) => {
        try {
          const { offer, plan, customer } = gatherOfferContext(req.params.id);
          const html = buildOfferHtml({ offer, plan, customer, legalCopyAvailable: false });
          let pdfBuffer;
          try {
            pdfBuffer = await renderHtmlToPdfBuffer(html);
          } catch (err) {
            // Fallback: returnera HTML som "pdf" om puppeteer/wkhtml saknas
            console.warn('[cco-offers/pdf] PDF-render fallback (HTML):', err.message);
            pdfBuffer = Buffer.from(html, 'utf-8');
          }
          // Spara i secure storage om asset-pipeline finns
          let asset = null;
          try {
            const sa = await (async () => {
              const stores = await (typeof ensureAssetStores === 'function'
                ? ensureAssetStores()
                : null);
              if (!stores) return null;
              const storageKey = `offers/${new Date().toISOString().slice(0, 7)}/${offer.id}.pdf`;
              const sha = require('crypto').createHash('sha256').update(pdfBuffer).digest('hex');
              await stores.secureStorage.putObject(storageKey, pdfBuffer, {
                mimeType: 'application/pdf',
              });
              // Skapa patient_asset (best-effort â€” om assetStore har createAsset/upsert)
              if (typeof stores.assetStore.createAsset === 'function') {
                return await stores.assetStore.createAsset({
                  patientId: offer.customerId,
                  category: 'offer',
                  storageKey,
                  checksum: sha,
                  fileSize: pdfBuffer.length,
                  mimeType: 'application/pdf',
                  originalFileName: `offer-${offer.id}.pdf`,
                  meta: {
                    offerId: offer.id,
                    planId: plan?.planId,
                    annotationId: plan?.annotationId,
                    assetId: plan?.assetId,
                    version: plan?.version || 1,
                  },
                });
              }
              return { storageKey, sha256: sha, fileSize: pdfBuffer.length };
            })();
            asset = sa;
          } catch (err) {
            console.warn('[cco-offers/pdf] secure-storage fallback:', err.message);
          }

          // Timeline-event
          try {
            app.locals.ccoHistoryStore?.appendEvent?.({
              kind: 'offer_pdf_generated',
              surface: 'cco.offer_pdf',
              ts: new Date().toISOString(),
              customerId: offer.customerId,
              offerId: offer.id,
              planId: plan?.planId,
              assetStorageKey: asset?.storageKey || null,
            });
          } catch {}

          // Audit
          try {
            ccoAuditLog?.append?.({
              kind: 'offer.pdf_generated',
              surface: 'cco.offer_pdf',
              ts: new Date().toISOString(),
              detail: {
                offerId: offer.id,
                customerId: offer.customerId,
                planId: plan?.planId,
                annotationId: plan?.annotationId,
                sizeBytes: pdfBuffer.length,
                storageKey: asset?.storageKey || null,
                sha256: asset?.checksum || asset?.sha256 || null,
                actor: req.role?.userId || 'unknown',
              },
            });
          } catch {}

          res.json({
            offerId: offer.id,
            planId: plan?.planId,
            customerId: offer.customerId,
            sizeBytes: pdfBuffer.length,
            storageKey: asset?.storageKey || null,
            sha256: asset?.checksum || asset?.sha256 || null,
            patientAssetId: asset?.id || null,
            legalReviewRequired: true,
            previewUrl: `/api/v1/cco-offers/${offer.id}/preview.html`,
          });
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    console.log('[cco-offers/pdf] monterad: GET preview.html + POST pdf');

    // Sprint 19B.3.3 â€” Secure Customer Link fÃ¶r plan/offert
    // POST /api/v1/cco-portal-links â€” riskbaserad token via ccoSecurePortalLinkStore
    app.post(
      '/api/v1/cco-portal-links',
      attachRole,
      requireAnyRole(['doctor', 'staff', 'owner']),
      jsonParser,
      async (req, res) => {
        try {
          const { customerId, resourceKind, resourceId, contextNote } = req.body || {};
          if (!customerId || !resourceKind)
            return res.status(400).json({ error: 'customerId + resourceKind krÃ¤vs' });
          const actor = { userId: req.role?.userId || 'unknown', role: req.role?.role || 'staff' };
          const r = await portalLinkStore.createLink({
            customerId,
            resourceKind,
            resourceId,
            actor,
            contextNote,
          });
          try {
            app.locals.ccoHistoryStore?.appendEvent?.({
              kind: 'portal_link_created',
              surface: 'cco.portal_link',
              ts: new Date().toISOString(),
              customerId,
              resourceKind,
              resourceId,
              riskClass: r.riskClass,
              linkId: r.linkId,
            });
          } catch {}
          // 19E.2 Fix #8A â€” audit-event pÃ¥ portal_link.created
          try {
            ccoAuditLog?.append?.({
              kind: 'portal_link.created',
              surface: 'cco.portal_link',
              ts: new Date().toISOString(),
              actor,
              target: { kind: 'portal_link', id: r.linkId || 'unknown' },
              detail: {
                resourceKind,
                resourceId,
                customerId,
                riskClass: r.riskClass,
                ttlMs: r.ttlMs,
                singleUse: !!r.singleUse,
              },
            });
          } catch {}
          res.json(r);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // 19E.2 Portal Hardening (P0/P1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // H1: Rate-limit pÃ¥ /portal/* â€” 30 req/min/IP, audit pÃ¥ 429
    // H2: Strict security headers (CSP/XCTO/Referrer-Policy) pÃ¥ all portal-HTML
    // H4: Origin-check pÃ¥ POST /portal/upload/:token
    let _portalRateLimiter = null;
    try {
      const { createRateLimiter: _createRateLimiter } = require('./src/security/rateLimit');
      _portalRateLimiter = _createRateLimiter({
        windowMs: 60_000,
        max: 30,
        scope: 'cco.portal',
        message: 'FÃ¶r mÃ¥nga fÃ¶rsÃ¶k mot kundlÃ¤nk. FÃ¶rsÃ¶k igen om en stund.',
      });
    } catch (e) {
      console.warn('[cco-portal] kunde inte skapa rate-limiter:', e.message);
    }
    const portalRateLimit = async (req, res, next) => {
      if (!_portalRateLimiter) return next();
      const wrappedJson = res.json.bind(res);
      res.json = (payload) => {
        if (res.statusCode === 429) {
          try {
            ccoAuditLog?.append?.({
              kind: 'portal.rate_limited',
              surface: 'cco.portal',
              ts: new Date().toISOString(),
              detail: {
                ip: req.ip || req.socket?.remoteAddress,
                path: req.path,
                tokenSuffix: String(req.params?.token || '').slice(-6),
              },
            });
          } catch {}
        }
        return wrappedJson(payload);
      };
      return _portalRateLimiter(req, res, next);
    };
    const setPortalHtmlHeaders = (res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      // CSP: ingen JS kÃ¶rs i portal-HTML (allt Ã¤r server-renderat), bilder via secure storage + data:
      res.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data:",
          "script-src 'none'",
          "object-src 'none'",
          "frame-ancestors 'none'",
          "base-uri 'none'",
          "form-action 'self'",
        ].join('; ')
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    };
    app.locals.setPortalHtmlHeaders = setPortalHtmlHeaders;

    // GET /portal/r/:token â€” patient-facing route (riskklass-validerad)
    function esc(s) {
      return String(s == null ? '' : s).replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
      );
    }
    app.get('/portal/r/:token', portalRateLimit, async (req, res) => {
      try {
        setPortalHtmlHeaders(res);
        const ip =
          req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
        const ua = req.headers['user-agent'] || '';
        const c = await portalLinkStore.consume({ token: req.params.token, ip, userAgent: ua });
        if (!c.ok) {
          res
            .status(c.error === 'expired' ? 410 : c.error === 'revoked' ? 410 : 404)
            .send(
              `<!doctype html><meta charset="utf-8"><title>LÃ¤nk ${c.error}</title><body style="font-family:system-ui;padding:48px;text-align:center;color:#84756b;background:#faf6f2"><h1>LÃ¤nken Ã¤r ${c.error}</h1><p>Kontakta kliniken om du behÃ¶ver en ny lÃ¤nk.</p></body>`
            );
          return;
        }
        // Bygg minimal patient-facing-vy baserat pÃ¥ resourceKind
        let html = '';
        if (c.resourceKind === 'offer_view') {
          try {
            const { offer, plan, customer } = gatherOfferContext(c.resourceId);
            // Hitta dokumentpaket om finns
            let pkg = null;
            try {
              const pkgs =
                app.locals.ccoOfferDocumentPackageStore?.listByOffer?.(c.resourceId) || [];
              pkg = pkgs[pkgs.length - 1] || null;
            } catch {}
            // Bygg snygg kundvÃ¤nlig patient-portal-vy
            const greetings = `Hej ${(customer?.fullName || offer.customerName || '').split(' ')[0] || 'dÃ¤r'}`;
            const techLabel = (plan?.technique || '').toUpperCase();
            const grafts = plan?.totalGraftEstimate ? `${plan.totalGraftEstimate} grafts` : '';
            const price = new Intl.NumberFormat('sv-SE', {
              style: 'currency',
              currency: offer.currency || 'SEK',
            }).format(offer.priceTotal || 0);
            const validUntil = (
              offer.expiresAt ||
              new Date(Date.now() + (offer.validityDays || 14) * 86400000).toISOString()
            ).slice(0, 10);
            const nextStepsHtml = pkg?.nextSteps?.length
              ? pkg.nextSteps
                  .map((s) => `<li class="step step-${s.kind}">${esc(s.message)}</li>`)
                  .join('')
              : '<li class="step">Vi fÃ¶rbereder nÃ¤sta steg. Du hÃ¶r frÃ¥n oss snart.</li>';
            const docRowsHtml = pkg?.documents?.length
              ? pkg.documents
                  .filter((d) => d.required)
                  .map((d) => {
                    const label =
                      {
                        agreement: 'Behandlingsavtal',
                        consent_treatment: 'Behandlingssamtycke',
                        consent_photo_internal: 'Foto-samtycke (internt)',
                        consent_photo_publish: 'Foto-samtycke (publikt)',
                        patient_info: 'Patientinformation',
                        aftercare_letter: 'EftervÃ¥rdsinfo',
                        health_declaration: 'HÃ¤lsodeklaration',
                        fitness_certificate: 'FriskfÃ¶rsÃ¤kran',
                      }[d.kind] || d.kind;
                    const stateLabel =
                      {
                        missing: 'vÃ¤ntar',
                        drafted: 'snart redo',
                        sent: 'vÃ¤ntar din signering',
                        viewed: 'lÃ¤st',
                        signed: 'signerad',
                        needs_legal_review: 'vÃ¤ntar juridisk granskning',
                      }[d.status] || d.status;
                    const stateClass =
                      d.status === 'signed'
                        ? 'ok'
                        : d.status === 'needs_legal_review'
                          ? 'review'
                          : 'pending';
                    return `<li class="doc doc-${stateClass}"><span class="doc-label">${esc(label)}</span><span class="doc-status">${esc(stateLabel)}</span></li>`;
                  })
                  .join('')
              : '';
            // 19F.1 P1d â€” tydligt NEEDS_LEGAL_REVIEW-banner nÃ¤r templates saknas
            const reviewDocs = (pkg?.documents || []).filter(
              (d) => d.status === 'needs_legal_review'
            );
            const legalBlocker = reviewDocs.length
              ? `<div class="legal-blocker"><span class="legal-badge">âš ï¸ NEEDS LEGAL REVIEW</span><div class="legal-text"><strong>${reviewDocs.length} dokument vÃ¤ntar pÃ¥ juridisk granskning</strong> innan du kan signera dem digitalt. Vi hÃ¶r av oss nÃ¤r templates Ã¤r klara.</div></div>`
              : '';
            const docsBlock = docRowsHtml
              ? `<section class="card"><h3>Dokument</h3>${legalBlocker}<ul class="docs">${docRowsHtml}</ul></section>`
              : '';
            const ribbon =
              offer.state === 'draft' ? '<div class="ribbon">UTKAST Â· ej bindande</div>' : '';
            const helpLine =
              pkg?.summary?.needsLegalReview && !reviewDocs.length
                ? '<p class="muted">Vissa juridiska dokument Ã¤r under slutgranskning. Vi hÃ¶r av oss innan du behÃ¶ver agera pÃ¥ dem.</p>'
                : '';

            html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Din behandling â€” Hair TP Clinic</title>
<style>
  :root{--bg:#faf6f2;--ink:#2b251f;--muted:#84756b;--gold:#c2aa9c;--accent:#bb4779;--ok:#4a8268;--warn:#c8821e;--blue:#4a7ba8}
  *{box-sizing:border-box}html,body{margin:0;padding:0}
  body{background:radial-gradient(ellipse at 14% 0%,rgba(255,228,200,.36),transparent 42%),var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;min-height:100vh;padding:28px 18px;line-height:1.55}
  .wrap{max-width:600px;margin:0 auto}
  .ribbon{display:inline-block;padding:4px 12px;border-radius:999px;background:rgba(200,130,30,.16);color:#8a5a18;font-size:11px;font-weight:800;letter-spacing:.1em;margin-bottom:18px}
  h1{font-size:28px;font-weight:800;letter-spacing:-.02em;margin:0 0 6px;color:#1a1612}
  .lead{color:var(--muted);font-size:15px;margin:0 0 26px}
  .card{background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(248,241,232,.85));border-radius:18px;padding:22px;margin-bottom:14px;box-shadow:0 12px 28px rgba(56,40,28,.08),inset 0 1px 0 rgba(255,255,255,.9)}
  .card h3{margin:0 0 12px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
  .summary{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .summary .row{padding:8px 0}.summary .label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-weight:700}.summary .value{font-size:16px;font-weight:700;color:var(--ink);margin-top:2px;font-variant-numeric:tabular-nums}
  .summary .value.price{font-size:24px;color:var(--accent)}
  ul.steps{list-style:none;padding:0;margin:0}
  ul.steps .step{padding:11px 14px;margin-bottom:6px;border-radius:10px;background:rgba(132,117,107,.06);font-size:13.5px}
  ul.steps .step-ready_for_treatment{background:rgba(74,130,104,.14);color:#2c5443;font-weight:700}
  ul.steps .step-legal_blocker{background:rgba(200,130,30,.14);color:#7a4f12;font-weight:600}
  ul.docs{list-style:none;padding:0;margin:0}
  ul.docs .doc{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(132,117,107,.18);font-size:13.5px}
  ul.docs .doc:last-child{border-bottom:0}
  ul.docs .doc-status{font-size:11px;font-weight:800;padding:3px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:.06em}
  .doc-ok .doc-status{background:rgba(74,130,104,.14);color:var(--ok)}
  .doc-pending .doc-status{background:rgba(74,123,168,.14);color:var(--blue)}
  .doc-review .doc-status{background:rgba(200,130,30,.14);color:var(--warn)}
  .legal-blocker{display:flex;gap:12px;align-items:flex-start;background:linear-gradient(180deg,#fff5e6,#ffe3b8);border:1px solid rgba(200,130,30,.32);border-radius:12px;padding:14px 16px;margin-bottom:14px;color:#7a4f12}
  .legal-badge{flex-shrink:0;background:#c8821e;color:#fff;font-size:10px;font-weight:800;letter-spacing:.08em;padding:5px 9px;border-radius:6px;text-transform:uppercase;white-space:nowrap}
  .legal-text{font-size:13px;line-height:1.5}.legal-text strong{display:block;margin-bottom:2px;color:#7a4f12}
  .footer{text-align:center;color:var(--muted);font-size:11.5px;margin-top:30px;padding-top:18px;border-top:1px solid rgba(132,117,107,.18)}
  .muted{color:var(--muted);font-size:13px}
  .safety{margin-top:14px;padding:10px 12px;background:rgba(74,123,168,.08);color:#1f3854;font-size:11.5px;border-radius:8px;line-height:1.5}
</style></head><body>
<div class="wrap">
  ${ribbon}
  <h1>${esc(greetings)}!</h1>
  <p class="lead">HÃ¤r Ã¤r din behandlingsplan frÃ¥n Hair TP Clinic.</p>

  <section class="card">
    <h3>Din behandling</h3>
    <div class="summary">
      <div class="row"><div class="label">Behandling</div><div class="value">${esc(techLabel || 'Behandling')}</div></div>
      <div class="row"><div class="label">Uppskattat antal</div><div class="value">${esc(grafts || 'â€”')}</div></div>
      <div class="row"><div class="label">Pris totalt</div><div class="value price">${esc(price)}</div></div>
      <div class="row"><div class="label">Giltig till</div><div class="value">${esc(validUntil)}</div></div>
    </div>
  </section>

  ${plan?.providerComment ? `<section class="card"><h3>Behandlarens kommentar</h3><p style="margin:0;font-size:14px">${esc(plan.providerComment)}</p></section>` : ''}

  ${docsBlock}

  <section class="card">
    <h3>NÃ¤sta steg</h3>
    <ul class="steps">${nextStepsHtml}</ul>
    ${helpLine}
  </section>

  <div class="safety">
    ğŸ”’ Den hÃ¤r lÃ¤nken Ã¤r personlig och kopplad till din behandling. Du kan stÃ¤nga sidan och Ã¶ppna lÃ¤nken igen senare â€” vi sparar inte ditt personnummer i lÃ¤nken. Vid frÃ¥gor: <a href="mailto:contact@hairtpclinic.com" style="color:var(--accent);font-weight:700">contact@hairtpclinic.com</a>.
  </div>

  <div class="footer">
    Hair TP Clinic Â· Vasaplatsen 2, 411 34 GÃ¶teborg Â· 031-88 11 66
  </div>
</div>
</body></html>`;
            try {
              ccoAuditLog?.append?.({
                kind: 'offer.viewed_by_customer',
                surface: 'cco.portal_link',
                ts: new Date().toISOString(),
                detail: {
                  offerId: c.resourceId,
                  linkId: c.linkId,
                  customerId: c.customerId,
                  hasPackage: !!pkg,
                },
              });
            } catch {}
            try {
              app.locals.ccoHistoryStore?.appendEvent?.({
                kind: 'offer_viewed',
                surface: 'cco.portal_link',
                ts: new Date().toISOString(),
                customerId: c.customerId,
                offerId: c.resourceId,
                linkId: c.linkId,
              });
            } catch {}
            // 19F.1 P1c â€” document_viewed per dokument som visas fÃ¶r kunden
            if (pkg?.documents?.length) {
              const nowTs = new Date().toISOString();
              for (const d of pkg.documents.filter((x) => x.required)) {
                try {
                  ccoAuditLog?.append?.({
                    kind: 'document_viewed',
                    surface: 'cco.portal_link',
                    ts: nowTs,
                    detail: {
                      customerId: c.customerId,
                      offerId: c.resourceId,
                      packageId: pkg.id,
                      docKind: d.kind,
                      docStatus: d.status,
                      needsLegalReview: d.status === 'needs_legal_review',
                    },
                  });
                } catch {}
                try {
                  app.locals.ccoHistoryStore?.appendEvent?.({
                    kind: 'document_viewed',
                    surface: 'cco.portal_link',
                    ts: nowTs,
                    customerId: c.customerId,
                    offerId: c.resourceId,
                    packageId: pkg.id,
                    docKind: d.kind,
                    docStatus: d.status,
                  });
                } catch {}
              }
            }
          } catch (err) {
            html = `<!doctype html><body style="padding:48px;font-family:system-ui">Kunde inte ladda offert: ${err.message}</body>`;
          }
        } else if (c.resourceKind === 'treatment_plan_view') {
          const plan = planStore.getById(c.resourceId);
          if (!plan) {
            html = `<!doctype html><body>Plan saknas.</body>`;
          } else {
            html = `<!doctype html><html lang="sv"><meta charset="utf-8"><title>Behandlingsplan</title><body style="font-family:system-ui;max-width:680px;margin:40px auto;padding:24px;background:#faf6f2;color:#2b251f">
              <h1 style="font-weight:800;letter-spacing:-.02em">Din behandlingsplan</h1>
              <p>Teknik: <strong>${plan.technique?.toUpperCase() || 'â€”'}</strong></p>
              <p>Antal grafts: <strong>${plan.totalGraftEstimate || 'â€”'}</strong></p>
              ${(plan.areaSpecs || []).length ? `<h3>OmrÃ¥den</h3><ul>${(plan.areaSpecs || []).map((s) => `<li>${s.area} â€” ${s.estimatedGrafts || 'â€”'} grafts</li>`).join('')}</ul>` : ''}
              ${plan.providerComment ? `<blockquote style="border-left:3px solid #c8821e;padding:8px 14px;background:#fff5e6">${plan.providerComment}</blockquote>` : ''}
              <p style="color:#84756b;font-size:13px;margin-top:24px">Detta Ã¤r en preview. Inga signeringar Ã¤r aktiverade Ã¤nnu (NEEDS_LEGAL_REVIEW).</p>
              </body></html>`;
          }
        } else {
          html = `<!doctype html><body>Resurstyp ${c.resourceKind} stÃ¶ds inte i preview-portalen Ã¤nnu.</body>`;
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'private, no-store');
        res.send(html);
      } catch (err) {
        res.status(500).send(`<body>${err.message}</body>`);
      }
    });

    console.log(
      '[cco-portal-links] monterad: POST /api/v1/cco-portal-links + GET /portal/r/:token'
    );

    // Sprint 19D.1 â€” Customer Portal Dashboard
    const { buildCustomerOverview } = require('./src/ops/ccoCustomerJourneyOverview');
    const {
      buildPatientCardSections: _buildPC,
    } = require('./src/ops/ccoPatientCardSectionBuilder');
    const multer = require('multer');
    const customerUpload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    });

    // GET /portal/dashboard/:token â€” kundens personliga "Min behandling"-sida
    // 19E.2 Fix #4A: peek() istÃ¤llet fÃ¶r consume() â€” dashboard ska tÃ¥la flera besÃ¶k
    app.get('/portal/dashboard/:token', portalRateLimit, async (req, res) => {
      try {
        setPortalHtmlHeaders(res);
        const ip =
          req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
        const c = portalLinkStore.peek({ token: req.params.token, ip });
        if (!c.ok) {
          return res
            .status(410)
            .send(
              `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:48px;text-align:center;color:#84756b;background:#faf6f2"><h1>LÃ¤nken Ã¤r ${esc(c.error || 'ogiltig')}</h1><p>Kontakta kliniken fÃ¶r en ny lÃ¤nk.</p></body>`
            );
        }
        // HÃ¤mta patient-card-data via stores (bygg en stub om saknad)
        const customerId = c.customerId;
        const customer = app.locals.ccoCustomerStore?.getByKey?.(customerId) || {
          fullName: '',
          brand: 'hair_tp',
        };
        let patientCard = { sections: [] };
        try {
          const stores = typeof gatherStores === 'function' ? gatherStores() : null;
          if (stores) patientCard = await _buildPC({ customerId, stores });
        } catch {}
        const overview = buildCustomerOverview({ customer, patientCard });

        try {
          ccoAuditLog?.append?.({
            kind: 'portal.dashboard_viewed',
            surface: 'cco.portal',
            ts: new Date().toISOString(),
            detail: { customerId, linkId: c.linkId },
          });
        } catch {}
        try {
          app.locals.ccoHistoryStore?.appendEvent?.({
            kind: 'portal_dashboard_viewed',
            customerId,
            ts: new Date().toISOString(),
          });
        } catch {}

        const stepEmoji = {
          done: 'âœ“',
          waiting_clinic: 'â³',
          needs_customer: '!',
          blocked: 'âœ•',
          not_relevant: 'Â·',
        };
        const stepTone = {
          done: 'ok',
          waiting_clinic: 'wait',
          needs_customer: 'todo',
          blocked: 'block',
          not_relevant: 'na',
        };
        const stepsHtml = overview.steps
          .map(
            (s) => `
          <li class="step step-${stepTone[s.status]}">
            <span class="step-ico">${stepEmoji[s.status]}</span>
            <span class="step-label">${esc(s.label)}</span>
            ${s.customerActionLabel ? `<span class="step-action">${esc(s.customerActionLabel)} â†’</span>` : ''}
            ${s.note ? `<span class="step-note">${esc(s.note)}</span>` : ''}
          </li>`
          )
          .join('');

        const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="120"><title>Min behandling â€” Hair TP Clinic</title>
<style>
  :root{--bg:#faf6f2;--ink:#2b251f;--muted:#84756b;--gold:#c2aa9c;--accent:#bb4779;--ok:#4a8268;--wait:#4a7ba8;--todo:#c8821e;--block:#b94a4a}
  *{box-sizing:border-box}html,body{margin:0;padding:0}
  body{background:radial-gradient(ellipse at 14% 0%,rgba(255,228,200,.36),transparent 42%),var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;min-height:100vh;padding:28px 18px;line-height:1.55}
  .wrap{max-width:640px;margin:0 auto}
  h1{font-size:30px;font-weight:800;letter-spacing:-.02em;margin:0 0 6px}
  .lead{color:var(--muted);font-size:15px;margin:0 0 26px}
  .progress{background:linear-gradient(180deg,#fff,#fbf6ef);border-radius:16px;padding:16px 18px;margin-bottom:18px;box-shadow:0 8px 22px rgba(56,40,28,.10),inset 0 1px 0 rgba(255,255,255,.9)}
  .progress-bar{height:10px;background:rgba(132,117,107,.18);border-radius:999px;overflow:hidden;margin-top:10px}
  .progress-fill{height:100%;background:linear-gradient(90deg,#6fb595,#4a8268);border-radius:999px;transition:width .6s ease}
  .progress-stats{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);font-weight:700;margin-top:8px}
  .next-step{background:linear-gradient(180deg,#fff5e6,#ffe3b8);border-radius:14px;padding:14px 18px;margin-bottom:18px;color:#7a4f12;font-weight:700;font-size:14px;box-shadow:0 6px 16px rgba(200,130,30,.18)}
  .next-step-kicker{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#a36a16;margin-bottom:4px}
  .card{background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(248,241,232,.85));border-radius:14px;padding:16px;margin-bottom:14px;box-shadow:0 8px 22px rgba(56,40,28,.08),inset 0 1px 0 rgba(255,255,255,.9)}
  .card h3{margin:0 0 12px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
  ul.steps{list-style:none;padding:0;margin:0}
  .step{display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid rgba(132,117,107,.10);font-size:13.5px}
  .step:last-child{border-bottom:0}
  .step-ico{width:24px;height:24px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex-shrink:0}
  .step-ok    .step-ico{background:rgba(74,130,104,.18);color:var(--ok)}
  .step-ok    .step-label{color:var(--ok);font-weight:700}
  .step-wait  .step-ico{background:rgba(74,123,168,.16);color:var(--wait)}
  .step-todo  .step-ico{background:rgba(200,130,30,.18);color:var(--todo)}
  .step-todo  .step-label{color:#7a4f12;font-weight:800}
  .step-todo  .step-action{margin-left:auto;color:var(--todo);font-weight:800;font-size:12px}
  .step-block .step-ico{background:rgba(185,74,74,.16);color:var(--block)}
  .step-na    .step-ico{background:rgba(132,117,107,.10);color:var(--muted);opacity:.6}
  .step-na    .step-label{color:var(--muted);opacity:.6}
  .step-label{flex:1}
  .step-note{margin-left:auto;font-size:11px;color:var(--muted);font-weight:600}
  .upload-card{background:linear-gradient(180deg,#fce8f0,#f8c5d8);color:#6e1f44;text-align:center;padding:18px;border-radius:14px;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 8px 22px rgba(187,71,121,.18);margin-bottom:14px}
  .upload-card a{color:inherit;text-decoration:none}
  .footer{text-align:center;color:var(--muted);font-size:11.5px;margin-top:26px;padding-top:18px;border-top:1px solid rgba(132,117,107,.18)}
  .safety{margin-top:14px;padding:10px 12px;font-size:11.5px;color:#1f3854;background:rgba(74,123,168,.08);border-radius:8px;line-height:1.5}
</style></head><body><div class="wrap">
  <h1>${esc(overview.greeting)}!</h1>
  <p class="lead">HÃ¤r ser du var i din behandlingsresa hos Hair TP Clinic du stÃ¥r just nu.</p>

  <div class="progress">
    <div style="display:flex;justify-content:space-between;align-items:baseline"><strong style="font-size:14px">Din resa</strong><span style="font-size:24px;font-weight:800;color:#4a8268">${overview.progress.percent}%</span></div>
    <div class="progress-bar"><div class="progress-fill" style="width:${overview.progress.percent}%"></div></div>
    <div class="progress-stats"><span>${overview.progress.done} klart</span><span>${overview.progress.total - overview.progress.notRelevant - overview.progress.done} kvar</span></div>
  </div>

  ${
    overview.nextStep && overview.nextStep.status === 'needs_customer'
      ? `<div class="next-step"><div class="next-step-kicker">Du behÃ¶ver gÃ¶ra detta</div>${esc(overview.nextStep.label)}${overview.nextStep.customerActionLabel ? ` â€” ${esc(overview.nextStep.customerActionLabel)}` : ''}</div>`
      : overview.nextStep
        ? `<div class="next-step" style="background:linear-gradient(180deg,#eef7f2,#d8e8de);color:#2c5443"><div class="next-step-kicker" style="color:#366e4e">Vi vÃ¤ntar pÃ¥</div>${esc(overview.nextStep.label)} (klinik)</div>`
        : ''
  }

  <section class="card">
    <h3>Resans steg</h3>
    <ul class="steps">${stepsHtml}</ul>
  </section>

  ${
    overview.uploadInvitation
      ? `<div class="upload-card"><div style="font-size:24px;margin-bottom:4px">ğŸ“·</div>${esc(overview.uploadInvitation.label)} â€” <a href="/portal/upload/${esc(req.params.token)}">Ã¶ppna kamera</a></div>`
      : ''
  }

  <div class="safety">ğŸ”’ Den hÃ¤r sidan Ã¤r personlig och kopplad till just din behandling. Vi sparar inte ditt personnummer i lÃ¤nken. Sidan uppdateras automatiskt varannan minut. FrÃ¥gor? Mejla <a href="mailto:contact@hairtpclinic.com" style="color:var(--accent);font-weight:700">contact@hairtpclinic.com</a>.</div>

  <div class="footer">Hair TP Clinic Â· Vasaplatsen 2, 411 34 GÃ¶teborg Â· 031-88 11 66</div>
</div></body></html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'private, no-store');
        res.send(html);
      } catch (err) {
        console.error('[portal/dashboard]', err);
        res.status(500).send(`<body>${esc(err.message)}</body>`);
      }
    });

    // POST /portal/upload/:token â€” kund laddar upp egen bild via portal
    // 19E.2 Fix #9D + #9E: Origin-check + no-store + rate-limit
    app.post(
      '/portal/upload/:token',
      portalRateLimit,
      customerUpload.single('file'),
      async (req, res) => {
        try {
          res.setHeader('Cache-Control', 'private, no-store, no-cache');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Referrer-Policy', 'no-referrer');
          // Origin-check: skydda mot CSRF frÃ¥n externa sites
          const origin = req.headers['origin'] || '';
          const host = req.headers['host'] || '';
          if (origin) {
            let originHost = '';
            try {
              originHost = new URL(origin).host;
            } catch {}
            if (originHost && originHost !== host) {
              try {
                ccoAuditLog?.append?.({
                  kind: 'portal.upload_origin_mismatch',
                  surface: 'cco.portal',
                  ts: new Date().toISOString(),
                  detail: { origin, host, ip: req.ip || req.socket?.remoteAddress },
                });
              } catch {}
              return res.status(403).json({ error: 'origin mismatch' });
            }
          }
          const c = await portalLinkStore.consume({
            token: req.params.token,
            ip: req.socket.remoteAddress,
            userAgent: req.headers['user-agent'] || '',
          });
          if (!c.ok) return res.status(410).json({ error: c.error });
          if (!req.file) return res.status(400).json({ error: 'file krÃ¤vs' });
          // Endast asset_upload + low/medium risk fÃ¥r ladda upp
          if (!['low', 'medium'].includes(c.riskClass)) {
            return res.status(403).json({ error: 'token saknar upload-rÃ¤ttighet' });
          }
          const stores = {
            assetStore: app.locals.ccoPatientAssetStore,
            secureStorage: app.locals.ccoSecureStorage,
          };
          if (!stores.assetStore || !stores.secureStorage)
            return res.status(503).json({ error: 'asset stores not ready' });
          const crypto = require('crypto');
          const sha = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
          const ym = new Date().toISOString().slice(0, 7);
          const storageKey = `patient-photos/${ym}/${c.customerId}/customer-upload-${Date.now()}-${sha.slice(0, 8)}.jpg`;
          await stores.secureStorage.putObject(storageKey, req.file.buffer, {
            mimeType: req.file.mimetype,
          });
          const asset = await stores.assetStore.addAsset(
            {
              patientId: c.customerId,
              category: 'photo',
              sourceSystem: 'customer_portal_upload',
              storageKey,
              checksum: sha,
              fileSize: req.file.buffer.length,
              mimeType: req.file.mimetype,
              originalFileName: req.file.originalname || 'customer-upload.jpg',
              takenAt: new Date().toISOString(),
              meta: {
                uploadedViaPortalLinkId: c.linkId,
                subject: null,
                phase: 'customer_self_upload',
              },
              needsReview: true,
            },
            { actor: { userId: 'customer:' + c.customerId, role: 'patient' } }
          );
          try {
            ccoAuditLog?.append?.({
              kind: 'portal.customer_uploaded_photo',
              surface: 'cco.portal',
              ts: new Date().toISOString(),
              detail: {
                customerId: c.customerId,
                assetId: asset?.id,
                sizeBytes: req.file.buffer.length,
                sha256: sha,
              },
            });
          } catch {}
          try {
            app.locals.ccoHistoryStore?.appendEvent?.({
              kind: 'customer_photo_uploaded',
              customerId: c.customerId,
              assetId: asset?.id,
              ts: new Date().toISOString(),
            });
          } catch {}
          res.json({ ok: true, assetId: asset?.id, needsReview: true });
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      }
    );

    console.log(
      '[cco-portal-dashboard] monterad: GET /portal/dashboard/:token + POST /portal/upload/:token'
    );

    // 19F.4 Fix #3 â€” Access restriction (spÃ¤rrad kund)
    const {
      createAccessRestrictionMiddleware,
      setAccessRestriction,
    } = require('./src/security/ccoAccessRestriction');
    const enforceAccessRestriction = createAccessRestrictionMiddleware({
      getCustomerById: async (id) => {
        const store = app.locals.ccoCustomerStore || app.locals.ccoPatientMasterStore;
        if (!store) return null;
        const getFn =
          store.getById || store.getByKey || store.getCustomerById || store.getPatientById;
        if (typeof getFn !== 'function') return null;
        try {
          return await getFn.call(store, id);
        } catch {
          return null;
        }
      },
      auditLog: ccoAuditLog,
    });
    app.locals.enforceAccessRestriction = enforceAccessRestriction;

    // PATCH /api/v1/cco-customers/:id/access-restriction { restricted, reason }
    app.patch(
      '/api/v1/cco-customers/:id/access-restriction',
      attachRole,
      requireAnyRole(['owner', 'dpo']),
      jsonParser,
      async (req, res) => {
        try {
          const { restricted, reason } = req.body || {};
          if (typeof restricted !== 'boolean')
            return res.status(400).json({ error: 'restricted (boolean) krÃ¤vs' });
          const r = await setAccessRestriction({
            customerStore: app.locals.ccoCustomerStore || app.locals.ccoPatientMasterStore,
            customerId: req.params.id,
            restricted,
            reason,
            actor: { userId: req.role?.userId || 'unknown', role: req.role?.role || 'staff' },
            auditLog: ccoAuditLog,
          });
          res.json(r);
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      }
    );
    console.log(
      '[cco-access-restriction] monterad: PATCH /api/v1/cco-customers/:id/access-restriction + middleware exposed'
    );

    // 19F.4 Fix #1 â€” Encounter composite (per-besÃ¶k-grupperade rader)
    // GET /api/v1/cco-encounters/customer/:cid/composite
    app.get(
      '/api/v1/cco-encounters/customer/:cid/composite',
      requireCcoAuthenticated,
      attachRole,
      requireAnyRole(['owner', 'doctor', 'staff', 'staff_assistant', 'revisor']),
      enforceAccessRestriction,
      async (req, res) => {
        try {
          const { buildEncounterComposite } = require('./src/ops/ccoEncounterCompositeBuilder');
          const tenantId = req.role?.tenantId || req.headers['x-cco-tenant'] || 'hair-tp';
          const result = await buildEncounterComposite({
            tenantId,
            patientId: req.params.cid,
            stores: {
              encounterStore: app.locals.ccoTreatmentEncounterStore,
              journalStore: app.locals.ccoJournalStore,
              assetStore: app.locals.ccoPatientAssetStore,
              planStore: app.locals.ccoTreatmentPlanCanvasStore,
              offerStore: app.locals.ccoOfferQuickStore,
              agreementStore: app.locals.ccoAgreementQuickStore,
            },
          });
          try {
            ccoAuditLog?.append?.({
              kind: 'encounter.composite_viewed',
              surface: 'cco.encounter',
              ts: new Date().toISOString(),
              actor: { userId: req.role?.userId || 'unknown', role: req.role?.role || 'staff' },
              detail: {
                customerId: req.params.cid,
                encounterCount: result.stats.encounterCount,
                orphanCount: result.stats.orphanCount,
              },
            });
          } catch {}
          res.json({ ok: true, customerId: req.params.cid, ...result });
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      }
    );
    console.log(
      '[cco-encounters/composite] monterad: GET /api/v1/cco-encounters/customer/:cid/composite'
    );

    // 19F.1 P1b â€” Operator dashboard: kund-events att granska
    // GET /api/v1/cco-operator-dashboard/customer-actions?sinceHours=24
    app.get(
      '/api/v1/cco-operator-dashboard/customer-actions',
      requireCcoAuthenticated,
      attachRole,
      requireAnyRole(['owner', 'doctor', 'staff', 'staff_assistant', 'revisor']),
      async (req, res) => {
        try {
          const sinceHours = Math.max(1, Math.min(168, parseInt(req.query.sinceHours, 10) || 24));
          const sinceMs = sinceHours * 60 * 60 * 1000;
          const store = app.locals.ccoCustomerEventStore;
          if (!store) {
            return res.json({
              ok: true,
              sinceHours,
              customers: [],
              stats: { totalEvents: 0, distinctCustomers: 0 },
              note: 'ccoCustomerEventStore ej mountat â€” wire i nÃ¤sta sprint',
            });
          }
          const grouped = store.listStaffAttentionByCustomer({ sinceMs });
          // Berika med kund-displayName om mÃ¶jligt (ingen fail om saknas)
          const customerStore = app.locals.ccoCustomerStore;
          const enriched = grouped.map((g) => {
            const cust =
              customerStore?.getByKey?.(g.customerId) ||
              customerStore?.getByCustomerId?.(g.customerId) ||
              null;
            return {
              customerId: g.customerId,
              customerName: cust?.fullName || null,
              latestTs: g.latestTs,
              latestKind: g.latestKind,
              counts: g.counts,
              hasUploadedPhoto: !!g.counts.customer_photo_uploaded,
              hasViewedOffer: !!g.counts.offer_viewed,
              hasViewedDocument: !!g.counts.document_viewed,
              eventCount: g.events.length,
              recentEvents: g.events.slice(0, 5),
            };
          });
          try {
            ccoAuditLog?.append?.({
              kind: 'operator_dashboard.customer_actions_viewed',
              surface: 'cco.operator_dashboard',
              ts: new Date().toISOString(),
              actor: { userId: req.role?.userId || 'unknown', role: req.role?.role || 'staff' },
              detail: { sinceHours, distinctCustomers: enriched.length },
            });
          } catch {}
          res.json({
            ok: true,
            sinceHours,
            customers: enriched,
            stats: {
              totalEvents: enriched.reduce((sum, c) => sum + c.eventCount, 0),
              distinctCustomers: enriched.length,
            },
          });
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      }
    );
    console.log(
      '[cco-operator-dashboard] monterad: GET /api/v1/cco-operator-dashboard/customer-actions'
    );

    // â”€â”€ CF.2 (MVP 1) â€” Chief of Finance routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // RBAC: owner / finance / revisor. Audit pÃ¥ alla mutationer.
    // ORD-67b (2026-07-13): CF-routes registreras FÃ–RE auth-bootstrap och hade
    // dÃ¤rfÃ¶r aldrig nÃ¥gon token-parser i prod â†’ attachRole sÃ¥g alltid
    // 'anonymous' â†’ 403 fÃ¶r ALLA (Ã¤ven owner). Bryggan nedan delegerar till
    // auth.requireAuth vid request-tid (samma mÃ¶nster som requireCcoAuthenticated)
    // sÃ¥ Bearer/x-auth-token parsas och req.auth.role sÃ¤tts innan attachRole.
    app.use('/api/v1/cco-cf', requireCcoAuthenticated);
    const cfRBAC = ['owner', 'finance', 'revisor'];
    const cfMutateRBAC = ['owner', 'finance']; // revisor Ã¤r read-only
    // CF.2-fix 2026-06-01 (BUG-2): anvÃ¤nd getActor-helper istÃ¤llet fÃ¶r det
    // gamla pattern som lÃ¤ste actor.userId frÃ¥n req-objekt som attachRole
    // inte sÃ¤tter. Se CHIEF-OF-FINANCE-MVP1-UAT-2026-06-01.md.
    const { getActor: cfGetActor } = require('./src/security/ccoRbac');

    // GET /api/v1/cco-cf/dashboard â€” KPI:er + status
    app.get('/api/v1/cco-cf/dashboard', attachRole, requireAnyRole(cfRBAC), async (req, res) => {
      try {
        const actor = cfGetActor(req);
        const { buildFinanceDashboard } = require('./src/cfo/cfoFinanceDashboardBuilder');
        const dashboard = await buildFinanceDashboard({
          stores: {
            fortnoxStore: app.locals.cfoFortnoxStore,
            swishStore: app.locals.ccoSwishStore,
            commercialStore: app.locals.ccoCommercialStore,
            receiptStore: app.locals.cfoReceiptStore,
            expenseStore: app.locals.cfoExpenseStore, // CF.3
            ruleStore: app.locals.cfoExpenseRuleStore, // CF.4
            vendorStore: app.locals.cfoFinanceVendorStore, // CF.5
            recurringStore: app.locals.cfoRecurringExpenseStore, // CF.7
            reviewStore: app.locals.cfoFinanceReviewStore, // CF.8
            monthlyCloseStore: app.locals.cfoFinanceMonthlyCloseStore, // CF.9
            fortnoxInvoiceLister: app.locals.cfoFortnoxInvoiceLister,
          },
          tenantId: actor.tenantId || 'hair_tp',
        });
        try {
          ccoAuditLog?.append?.({
            action: 'cf.dashboard.viewed',
            kind: 'cf.dashboard.viewed',
            surface: 'cco.cf',
            ts: new Date().toISOString(),
            actor: { userId: actor.userId, role: actor.role },
            detail: { partial: dashboard.partial, anomalies: dashboard.anomalies.length },
          });
        } catch {}
        res.json(dashboard);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /api/v1/cco-cf/receipts?status=&limit=
    app.get('/api/v1/cco-cf/receipts', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const store = app.locals.cfoReceiptStore;
        if (!store) return res.status(503).json({ error: 'receipt store not ready' });
        const status = req.query.status || null;
        const sourceSystem = req.query.sourceSystem || null;
        const customerId = req.query.customerId || null;
        const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit, 10) || 200));
        const list = store.listReceipts({ status, sourceSystem, customerId, limit });
        const summary = store.summary();
        res.json({ ok: true, receipts: list, summary });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /api/v1/cco-cf/receipts/:id
    app.get('/api/v1/cco-cf/receipts/:id', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const store = app.locals.cfoReceiptStore;
        if (!store) return res.status(503).json({ error: 'receipt store not ready' });
        const r = store.getById(req.params.id);
        if (!r) return res.status(404).json({ error: 'not found' });
        res.json(r);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST /api/v1/cco-cf/receipts/upload â€” multer 20MB-cap
    const cfMulter = require('multer');
    const cfReceiptUpload = cfMulter({
      storage: cfMulter.memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    });
    app.post(
      '/api/v1/cco-cf/receipts/upload',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      cfReceiptUpload.single('file'),
      async (req, res) => {
        try {
          const store = app.locals.cfoReceiptStore;
          if (!store) return res.status(503).json({ error: 'receipt store not ready' });
          if (!req.file)
            return res.status(400).json({ error: 'file krÃ¤vs (multipart/form-data field: file)' });
          const actor = cfGetActor(req); // CF.2-fix BUG-2
          const sourceSystem = req.body?.sourceSystem || 'manual_upload';
          const metadata = {
            supplier: req.body?.supplier || null,
            amountSek: req.body?.amountSek ? Number(req.body.amountSek) : null,
            vatSek: req.body?.vatSek ? Number(req.body.vatSek) : null,
            date: req.body?.date || null,
            category: req.body?.category || null,
            notes: req.body?.notes || null,
            customerId: req.body?.customerId || null,
            encounterId: req.body?.encounterId || null,
            treatmentId: req.body?.treatmentId || null,
            offerId: req.body?.offerId || null,
          };
          const r = await store.uploadReceipt({
            buffer: req.file.buffer,
            mimeType: req.file.mimetype,
            originalFileName: req.file.originalname,
            actor,
            sourceSystem,
            metadata,
          });
          res.json({ ok: true, receipt: r });
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      }
    );

    // PATCH /api/v1/cco-cf/receipts/:id â€” kategorisera/uppdatera metadata
    app.patch(
      '/api/v1/cco-cf/receipts/:id',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const store = app.locals.cfoReceiptStore;
          if (!store) return res.status(503).json({ error: 'receipt store not ready' });
          const actor = cfGetActor(req); // CF.2-fix BUG-2
          const r = await store.updateReceipt({ id: req.params.id, patch: req.body || {}, actor });
          res.json({ ok: true, receipt: r });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/receipts/:id/status â€” transition (reject/exported/etc)
    app.post(
      '/api/v1/cco-cf/receipts/:id/status',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const store = app.locals.cfoReceiptStore;
          if (!store) return res.status(503).json({ error: 'receipt store not ready' });
          const actor = cfGetActor(req); // CF.2-fix BUG-2
          const r = await store.transitionStatus({
            id: req.params.id,
            newStatus: req.body?.status,
            reason: req.body?.reason,
            actor,
          });
          res.json({ ok: true, receipt: r });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // GET /api/v1/cco-cf/receipts/:id/download â€” secure-storage proxy
    app.get(
      '/api/v1/cco-cf/receipts/:id/download',
      attachRole,
      requireAnyRole(cfRBAC),
      async (req, res) => {
        try {
          const store = app.locals.cfoReceiptStore;
          if (!store) return res.status(503).json({ error: 'receipt store not ready' });
          const r = store.getById(req.params.id);
          if (!r) return res.status(404).json({ error: 'not found' });
          const secure = app.locals.ccoSecureStorage;
          if (!secure?.getObject)
            return res.status(503).json({ error: 'secure storage not ready' });
          // CF.3-fix 2026-06-02: getObject returnerar {stream, buffer, mimeType, size, checksum}
          // â€” extrahera .buffer. ENOENT om fil saknas pÃ¥ disk â†’ 404.
          let obj;
          try {
            obj = await secure.getObject(r.storageKey);
          } catch (e) {
            return res.status(404).json({ error: 'secure-storage-fil saknas', detail: e?.message });
          }
          try {
            const dlActor = cfGetActor(req); // CF.2-fix BUG-2
            ccoAuditLog?.append?.({
              action: 'cf.receipt.downloaded',
              kind: 'cf.receipt.downloaded',
              surface: 'cco.cf',
              ts: new Date().toISOString(),
              actor: { userId: dlActor.userId, role: dlActor.role },
              target: { kind: 'receipt', id: r.id },
              detail: { storageKey: r.storageKey, sizeBytes: r.sizeBytes },
            });
          } catch {}
          res.setHeader('Content-Type', r.mimeType || obj.mimeType || 'application/octet-stream');
          res.setHeader('Cache-Control', 'private, no-store');
          res.send(obj.buffer || obj);
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      }
    );

    // â”€â”€ CF.3 (MVP 2) â€” Expense routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Manual expense workflow utan Fortnox-write. Audit pÃ¥ alla mutationer.
    const cfMulterExpense = require('multer');
    const cfExpenseUpload = cfMulterExpense({
      storage: cfMulterExpense.memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    });

    // GET /api/v1/cco-cf/expenses â€” lista + filter
    app.get('/api/v1/cco-cf/expenses', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const store = app.locals.cfoExpenseStore;
        if (!store) return res.status(503).json({ error: 'expense store not ready' });
        const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit, 10) || 200));
        const list = store.listExpenses({
          status: req.query.status || null,
          category: req.query.category || null,
          supplier: req.query.supplier || null,
          customerId: req.query.customerId || null,
          receiptId: req.query.receiptId || null,
          batchId: req.query.batchId || null,
          fortnoxSyncStatus: req.query.fortnoxSyncStatus || null,
          fromDate: req.query.fromDate || null,
          toDate: req.query.toDate || null,
          limit,
        });
        const summary = store.summary();
        res.json({ ok: true, expenses: list, summary });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /api/v1/cco-cf/expenses/:id
    app.get('/api/v1/cco-cf/expenses/:id', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const store = app.locals.cfoExpenseStore;
        if (!store) return res.status(503).json({ error: 'expense store not ready' });
        const e = store.getById(req.params.id);
        if (!e) return res.status(404).json({ error: 'not found' });
        res.json(e);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST /api/v1/cco-cf/expenses â€” skapa (frÃ¥n receipt eller fristÃ¥ende)
    app.post(
      '/api/v1/cco-cf/expenses',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const store = app.locals.cfoExpenseStore;
          if (!store) return res.status(503).json({ error: 'expense store not ready' });
          const actor = cfGetActor(req);
          const body = req.body && typeof req.body === 'object' ? req.body : {};
          let expense = await store.createExpense({
            actor,
            receiptId: body.receiptId || null,
            fields: {
              supplier: body.supplier,
              amountSek: body.amountSek,
              vatSek: body.vatSek,
              vatRatePercent: body.vatRatePercent,
              date: body.date,
              category: body.category,
              paymentMethod: body.paymentMethod,
              notes: body.notes,
              customerId: body.customerId,
              encounterId: body.encounterId,
              treatmentId: body.treatmentId,
              offerId: body.offerId,
            },
          });

          // CF.5: vendor-match fÃ¶rst â€” lÃ¤nka supplierId + recordMatched
          const vendorStore = app.locals.cfoFinanceVendorStore;
          let matchedVendor = null;
          if (vendorStore && expense.supplier && !expense.supplierId) {
            try {
              const match = vendorStore.findBySupplierName(expense.supplier);
              if (match && match.matched && match.confidence >= 0.55) {
                matchedVendor = match;
                expense = await store.linkSupplier({
                  id: expense.id,
                  supplierId: match.vendor.id,
                  matchType: match.matchType,
                  confidence: match.confidence,
                  actor,
                });
                await vendorStore.recordMatched({
                  id: match.vendor.id,
                  expenseId: expense.id,
                  amount: Number(expense.amountSek) || 0,
                  actor,
                });
              }
            } catch (err) {
              console.warn('[cco-cf] vendor-match error:', err.message);
            }
          }

          // CF.4: kÃ¶r rule engine om expense saknar category â€” fÃ¶reslÃ¥ utan att applicera.
          const ruleStore = app.locals.cfoExpenseRuleStore;
          if (ruleStore && !expense.category) {
            try {
              const rules = ruleStore.listRules({ enabled: true, limit: 500 });
              const historyExpenses = store
                .listExpenses({ limit: 200 })
                .filter((h) => h.id !== expense.id);
              const ruleSuggestion = ruleStore.evaluateAllRules({
                expense,
                rules,
                historyExpenses,
              });

              // CF.5: om ingen rule-bestMatch men en vendor Ã¤r lÃ¤nkad med defaults,
              // bygg en vendor-baserad suggestion. Confidence frÃ¥n vendor-match.
              let finalSuggestion = ruleSuggestion;
              if (
                (!ruleSuggestion.bestMatch || ruleSuggestion.bestMatch.confidence < 0.3) &&
                matchedVendor &&
                matchedVendor.vendor
              ) {
                const v = matchedVendor.vendor;
                const vendorFields = {};
                if (v.defaultCategory && !expense.category)
                  vendorFields.category = v.defaultCategory;
                if (
                  v.defaultVatRatePercent !== null &&
                  v.defaultVatRatePercent !== undefined &&
                  (expense.vatRatePercent === null || expense.vatRatePercent === undefined)
                ) {
                  vendorFields.vatRatePercent = v.defaultVatRatePercent;
                }
                if (v.defaultPaymentMethod && !expense.paymentMethod)
                  vendorFields.paymentMethod = v.defaultPaymentMethod;
                if (v.defaultNote) {
                  const existing = String(expense.notes || '').trim();
                  vendorFields.notes = existing ? `${existing} Â· ${v.defaultNote}` : v.defaultNote;
                }
                if (Object.keys(vendorFields).length > 0) {
                  finalSuggestion = {
                    ...ruleSuggestion,
                    bestMatch: {
                      ruleId: null,
                      ruleName: `LeverantÃ¶rs-default: ${v.name}`,
                      source: 'vendor_defaults',
                      vendorId: v.id,
                      confidence: matchedVendor.confidence,
                      suggestedFields: vendorFields,
                    },
                  };
                }
              }

              const hasBest = finalSuggestion?.bestMatch;
              const hasRecurring = finalSuggestion?.recurring;
              if (hasBest || hasRecurring) {
                expense = await store.setSuggestion({
                  id: expense.id,
                  suggestion: finalSuggestion,
                  actor,
                });
              }
            } catch (err) {
              console.warn('[cco-cf] suggestion engine error:', err.message);
            }
          }

          // CF.7: match mot active recurring-mallar â†’ lÃ¤nka + audit + anomalies
          const recStore = app.locals.cfoRecurringExpenseStore;
          if (recStore && expense.supplier) {
            try {
              const match = recStore.findMatchingRecurring(expense);
              if (match && match.matched) {
                // Detektera anomalies BEFORE recording match (sÃ¥ amount-deviation upptÃ¤cks)
                const recentExpenses = store
                  .listExpenses({ limit: 200 })
                  .filter((h) => h.id !== expense.id);
                const anomalies = recStore.detectAnomalies({
                  recurring: match.recurring,
                  matchedExpense: expense,
                  recentExpenses,
                });
                expense = await store.linkRecurring({
                  id: expense.id,
                  recurringExpenseId: match.recurring.id,
                  confidence: match.confidence,
                  anomalies,
                  actor,
                });
                await recStore.recordExpenseMatch({ id: match.recurring.id, expense, actor });
                for (const a of anomalies) {
                  try {
                    await recStore.recordAnomaly({ id: match.recurring.id, anomaly: a, actor });
                  } catch {}
                }
              }
            } catch (err) {
              console.warn('[cco-cf] recurring-match error:', err.message);
            }
          }

          // CF.6: VAT-suggestion baserat pÃ¥ category + supplierId-defaults + vatRatePercent
          if (!expense.vatMode) {
            try {
              const { suggestVatMode } = require('./src/cfo/cfoExpenseVatRules');
              const sug = suggestVatMode({
                category: expense.category,
                vatRatePercent: expense.vatRatePercent,
                supplierCountry: 'SE', // framtida: hÃ¤mta frÃ¥n vendor.country
                reverseChargeHint: false,
              });
              if (sug) {
                expense = await store.setVatSuggestion({ id: expense.id, suggestion: sug, actor });
              }
            } catch (err) {
              console.warn('[cco-cf] vat-suggestion error:', err.message);
            }
          }

          res.json({
            ok: true,
            expense,
            newSupplierDetected: !!(expense.supplier && !expense.supplierId),
          });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // PATCH /api/v1/cco-cf/expenses/:id â€” uppdatera metadata/kategori
    app.patch(
      '/api/v1/cco-cf/expenses/:id',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const store = app.locals.cfoExpenseStore;
          if (!store) return res.status(503).json({ error: 'expense store not ready' });
          // CF.9: blockera mutation om expense.date faller i en stÃ¤ngd period
          const closeStore = app.locals.cfoFinanceMonthlyCloseStore;
          const existing = store.getById?.(req.params.id);
          if (closeStore && existing?.date && closeStore.isDateInLockedPeriod(existing.date)) {
            return res.status(423).json({
              error: `Perioden ${String(existing.date).slice(0, 7)} Ã¤r lÃ¥st (closed). Owner mÃ¥ste reopen perioden fÃ¶r att Ã¤ndra.`,
              periodLocked: true,
            });
          }
          const actor = cfGetActor(req);
          const expense = await store.updateExpense({
            id: req.params.id,
            patch: req.body || {},
            actor,
          });
          res.json({ ok: true, expense });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/expenses/:id/status â€” transition
    app.post(
      '/api/v1/cco-cf/expenses/:id/status',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const store = app.locals.cfoExpenseStore;
          if (!store) return res.status(503).json({ error: 'expense store not ready' });
          const actor = cfGetActor(req);
          const expense = await store.transitionStatus({
            id: req.params.id,
            newStatus: req.body?.status,
            reason: req.body?.reason,
            actor,
          });
          res.json({ ok: true, expense });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/expenses/:id/attachment â€” extra bilaga
    app.post(
      '/api/v1/cco-cf/expenses/:id/attachment',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      cfExpenseUpload.single('file'),
      async (req, res) => {
        try {
          const store = app.locals.cfoExpenseStore;
          if (!store) return res.status(503).json({ error: 'expense store not ready' });
          if (!req.file) return res.status(400).json({ error: 'file krÃ¤vs' });
          const actor = cfGetActor(req);
          const result = await store.attachFile({
            id: req.params.id,
            buffer: req.file.buffer,
            mimeType: req.file.mimetype,
            originalFileName: req.file.originalname,
            actor,
          });
          res.json({ ok: true, attachment: result });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/expenses/export â€” bygg export-paket (CSV+JSON) utan Fortnox
    app.post(
      '/api/v1/cco-cf/expenses/export',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const store = app.locals.cfoExpenseStore;
          const secure = app.locals.ccoSecureStorage;
          if (!store) return res.status(503).json({ error: 'expense store not ready' });
          if (!secure?.putObject)
            return res.status(503).json({ error: 'secure storage not ready' });
          const actor = cfGetActor(req);
          const { buildExpenseExportPackage } = require('./src/cfo/cfoExpenseExporter');
          const result = await buildExpenseExportPackage({
            expenseStore: store,
            secureStorage: secure,
            actor,
            auditLog: ccoAuditLog,
            statusFilter: req.body?.statusFilter || 'ready_for_export',
            expenseIds: Array.isArray(req.body?.expenseIds) ? req.body.expenseIds : null,
            fromDate: req.body?.fromDate || null,
            toDate: req.body?.toDate || null,
          });
          if (!result.ok) return res.status(400).json(result);
          res.json(result);
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      }
    );

    // GET /api/v1/cco-cf/expenses/export/:batchId/:fileType â€” ladda ner export-fil
    app.get(
      '/api/v1/cco-cf/expenses/export/:batchId/:fileType',
      attachRole,
      requireAnyRole(cfRBAC),
      async (req, res) => {
        try {
          const secure = app.locals.ccoSecureStorage;
          if (!secure?.getObject)
            return res.status(503).json({ error: 'secure storage not ready' });
          const { batchId, fileType } = req.params;
          if (!/^expbatch_[a-f0-9]+$/.test(batchId))
            return res.status(400).json({ error: 'ogiltig batchId' });
          if (!['csv', 'json'].includes(fileType))
            return res.status(400).json({ error: 'fileType mÃ¥ste vara csv eller json' });
          // CF.3-fix 2026-06-02: getObject returnerar {stream, buffer, mimeType, ...}
          // VIKTIG: anvÃ¤nd UTC-mÃ¥nader. Exporterns ym=new Date().toISOString().slice(0,7)
          // Ã¤r UTC. Local Date-konstruktor + toISOString shiftar mÃ¥naden bakÃ¥t i positiva
          // tidszoner (t.ex. Stockholm) fÃ¶rsta dagen i mÃ¥naden.
          const now = new Date();
          const utcYear = now.getUTCFullYear();
          const utcMonth = now.getUTCMonth();
          let obj = null;
          let foundKey = null;
          for (let i = 0; i < 12 && !obj; i += 1) {
            const probe = new Date(Date.UTC(utcYear, utcMonth - i, 1));
            const ym = probe.toISOString().slice(0, 7);
            const key = `exports/expenses/${ym}/${batchId}.${fileType}`;
            try {
              obj = await secure.getObject(key);
              foundKey = key;
            } catch {}
          }
          if (!obj) return res.status(404).json({ error: 'export-fil hittas ej' });
          const buf = obj.buffer || obj;
          try {
            const actor = cfGetActor(req);
            ccoAuditLog?.append?.({
              kind: 'cf.export.downloaded',
              surface: 'cco.cf.expense',
              ts: new Date().toISOString(),
              actor: { userId: actor.userId, role: actor.role },
              target: { kind: 'expense_batch', id: batchId },
              detail: { fileType, storageKey: foundKey, sizeBytes: buf.length },
            });
          } catch {}
          res.setHeader('Content-Type', fileType === 'csv' ? 'text/csv' : 'application/json');
          res.setHeader('Content-Disposition', `attachment; filename="${batchId}.${fileType}"`);
          res.setHeader('Cache-Control', 'private, no-store');
          res.send(buf);
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      }
    );

    // â”€â”€ CF.4 (MVP 3) â€” Expense Rule Engine routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Auto-categorization utan AI. Human approval krÃ¤vs alltid â€” engine
    // sÃ¤tter aldrig fÃ¤lt direkt pÃ¥ expense.

    // GET /api/v1/cco-cf/rules â€” lista
    app.get('/api/v1/cco-cf/rules', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const rs = app.locals.cfoExpenseRuleStore;
        if (!rs) return res.status(503).json({ error: 'rule store not ready' });
        const enabled =
          req.query.enabled === 'true' ? true : req.query.enabled === 'false' ? false : undefined;
        const rules = rs.listRules({
          enabled,
          supplier: req.query.supplier || null,
          category: req.query.category || null,
          limit: Math.max(1, Math.min(1000, parseInt(req.query.limit, 10) || 200)),
        });
        const summary = rs.summary();
        res.json({ ok: true, rules, summary });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /api/v1/cco-cf/rules/:id
    app.get('/api/v1/cco-cf/rules/:id', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const rs = app.locals.cfoExpenseRuleStore;
        if (!rs) return res.status(503).json({ error: 'rule store not ready' });
        const r = rs.getById(req.params.id);
        if (!r) return res.status(404).json({ error: 'not found' });
        res.json(r);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST /api/v1/cco-cf/rules â€” skapa
    app.post(
      '/api/v1/cco-cf/rules',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const rs = app.locals.cfoExpenseRuleStore;
          if (!rs) return res.status(503).json({ error: 'rule store not ready' });
          const rule = await rs.createRule({ actor: cfGetActor(req), input: req.body || {} });
          res.json({ ok: true, rule });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // PATCH /api/v1/cco-cf/rules/:id â€” uppdatera
    app.patch(
      '/api/v1/cco-cf/rules/:id',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const rs = app.locals.cfoExpenseRuleStore;
          if (!rs) return res.status(503).json({ error: 'rule store not ready' });
          const rule = await rs.updateRule({
            id: req.params.id,
            patch: req.body || {},
            actor: cfGetActor(req),
          });
          res.json({ ok: true, rule });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // DELETE /api/v1/cco-cf/rules/:id â€” radera
    app.delete(
      '/api/v1/cco-cf/rules/:id',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      async (req, res) => {
        try {
          const rs = app.locals.cfoExpenseRuleStore;
          if (!rs) return res.status(503).json({ error: 'rule store not ready' });
          const out = await rs.deleteRule({ id: req.params.id, actor: cfGetActor(req) });
          res.json(out);
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/rules/test â€” dry-run: kÃ¶r regler mot ett expense-objekt eller mot existerande
    app.post(
      '/api/v1/cco-cf/rules/test',
      attachRole,
      requireAnyRole(cfRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const rs = app.locals.cfoExpenseRuleStore;
          const exStore = app.locals.cfoExpenseStore;
          if (!rs) return res.status(503).json({ error: 'rule store not ready' });
          const body = req.body && typeof req.body === 'object' ? req.body : {};
          const rules = rs.listRules({ enabled: true, limit: 500 });
          let target;
          if (body.expenseId && exStore) {
            target = exStore.getById(body.expenseId);
            if (!target) return res.status(404).json({ error: 'expense finns ej' });
          } else if (body.expense) {
            target = body.expense;
          } else {
            return res.status(400).json({ error: 'expense eller expenseId krÃ¤vs' });
          }
          const historyExpenses = exStore
            ? exStore.listExpenses({ limit: 200 }).filter((h) => h.id !== target.id)
            : [];
          const result = rs.evaluateAllRules({ expense: target, rules, historyExpenses });
          res.json({ ok: true, ...result });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/expenses/:id/suggestion/approve
    app.post(
      '/api/v1/cco-cf/expenses/:id/suggestion/approve',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const exStore = app.locals.cfoExpenseStore;
          const ruleStore = app.locals.cfoExpenseRuleStore;
          const vendorStore = app.locals.cfoFinanceVendorStore;
          if (!exStore) return res.status(503).json({ error: 'expense store not ready' });
          const actor = cfGetActor(req);
          // Snappa upp suggestion innan approve, fÃ¶r att veta vendor-koppling
          const pre = exStore.getById(req.params.id);
          const expense = await exStore.approveSuggestion({
            id: req.params.id,
            actor,
            onApplied: async ({ ruleId, confidence }) => {
              if (ruleStore && ruleId) {
                await ruleStore.recordApplied({
                  id: ruleId,
                  expenseId: req.params.id,
                  actor,
                  suggestionConfidence: confidence,
                });
              }
            },
          });
          // CF.5: om suggestion var vendor-baserad eller expense har supplierId,
          // rÃ¤kna upp vendor.timesUsed
          if (vendorStore && pre?.suggestion?.bestMatch?.vendorId) {
            await vendorStore.recordUsed({
              id: pre.suggestion.bestMatch.vendorId,
              expenseId: expense.id,
              amount: Number(expense.amountSek) || 0,
              actor,
            });
          } else if (vendorStore && expense.supplierId) {
            await vendorStore.recordUsed({
              id: expense.supplierId,
              expenseId: expense.id,
              amount: Number(expense.amountSek) || 0,
              actor,
            });
          }
          res.json({ ok: true, expense });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/expenses/:id/suggestion/reject
    app.post(
      '/api/v1/cco-cf/expenses/:id/suggestion/reject',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const exStore = app.locals.cfoExpenseStore;
          const ruleStore = app.locals.cfoExpenseRuleStore;
          if (!exStore) return res.status(503).json({ error: 'expense store not ready' });
          const actor = cfGetActor(req);
          const expense = await exStore.rejectSuggestion({
            id: req.params.id,
            reason: req.body?.reason || null,
            actor,
            onRejected: async ({ ruleId, reason }) => {
              if (ruleStore && ruleId) {
                await ruleStore.recordRejected({
                  id: ruleId,
                  expenseId: req.params.id,
                  reason,
                  actor,
                });
              }
            },
          });
          res.json({ ok: true, expense });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/expenses/:id/save-as-rule â€” skapa ny rule frÃ¥n expense-fÃ¤lt
    app.post(
      '/api/v1/cco-cf/expenses/:id/save-as-rule',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const exStore = app.locals.cfoExpenseStore;
          const ruleStore = app.locals.cfoExpenseRuleStore;
          if (!exStore || !ruleStore) return res.status(503).json({ error: 'stores not ready' });
          const e = exStore.getById(req.params.id);
          if (!e) return res.status(404).json({ error: 'expense finns ej' });
          const body = req.body && typeof req.body === 'object' ? req.body : {};
          const supplier = body.supplier || e.supplier;
          if (!supplier)
            return res.status(400).json({ error: 'supplier krÃ¤vs (pÃ¥ expense eller body)' });
          const ruleInput = {
            name: body.name || `Regel: ${supplier}${e.category ? ' â†’ ' + e.category : ''}`,
            description: body.description || `Skapad frÃ¥n expense ${e.id}`,
            priority: Number(body.priority) || 10,
            enabled: body.enabled !== false,
            matchType: body.matchType || 'any',
            conditions: body.conditions || [{ type: 'supplier_contains', value: supplier }],
            setCategory: body.setCategory || e.category || null,
            setVatRatePercent: body.setVatRatePercent ?? e.vatRatePercent ?? null,
            setPaymentMethod: body.setPaymentMethod || e.paymentMethod || null,
            setSupplier: body.setSupplier || null,
            setNotes: body.setNotes || null,
          };
          const rule = await ruleStore.createRule({ actor: cfGetActor(req), input: ruleInput });
          res.json({ ok: true, rule, sourceExpenseId: e.id });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // â”€â”€ CF.5 (MVP 4) â€” Finance Vendor Register routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // LeverantÃ¶rsregister fÃ¶r ekonomi. Inte att fÃ¶rvÃ¤xla med ccoVendorRegister
    // (PUB-avtal/databehandlare fÃ¶r GDPR Art.28/30).

    // GET /api/v1/cco-cf/suppliers â€” lista med filter
    app.get('/api/v1/cco-cf/suppliers', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const vs = app.locals.cfoFinanceVendorStore;
        if (!vs) return res.status(503).json({ error: 'vendor store not ready' });
        const active =
          req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;
        const needsReview = req.query.needsReview === 'true';
        const vendors = vs.listVendors({
          active,
          needsReview,
          source: req.query.source || null,
          query: req.query.q || null,
          limit: Math.max(1, Math.min(1000, parseInt(req.query.limit, 10) || 200)),
        });
        res.json({ ok: true, vendors, summary: vs.summary() });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /api/v1/cco-cf/suppliers/:id
    app.get('/api/v1/cco-cf/suppliers/:id', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const vs = app.locals.cfoFinanceVendorStore;
        if (!vs) return res.status(503).json({ error: 'vendor store not ready' });
        const v = vs.getById(req.params.id);
        if (!v) return res.status(404).json({ error: 'not found' });
        res.json(v);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST /api/v1/cco-cf/suppliers â€” skapa
    app.post(
      '/api/v1/cco-cf/suppliers',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const vs = app.locals.cfoFinanceVendorStore;
          if (!vs) return res.status(503).json({ error: 'vendor store not ready' });
          const vendor = await vs.createVendor({ actor: cfGetActor(req), input: req.body || {} });
          res.json({ ok: true, vendor });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // PATCH /api/v1/cco-cf/suppliers/:id â€” uppdatera
    app.patch(
      '/api/v1/cco-cf/suppliers/:id',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const vs = app.locals.cfoFinanceVendorStore;
          if (!vs) return res.status(503).json({ error: 'vendor store not ready' });
          const vendor = await vs.updateVendor({
            id: req.params.id,
            patch: req.body || {},
            actor: cfGetActor(req),
          });
          res.json({ ok: true, vendor });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/suppliers/:id/deactivate
    app.post(
      '/api/v1/cco-cf/suppliers/:id/deactivate',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const vs = app.locals.cfoFinanceVendorStore;
          if (!vs) return res.status(503).json({ error: 'vendor store not ready' });
          const vendor = await vs.deactivateVendor({
            id: req.params.id,
            reason: req.body?.reason || null,
            actor: cfGetActor(req),
          });
          res.json({ ok: true, vendor });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/suppliers/:id/activate
    app.post(
      '/api/v1/cco-cf/suppliers/:id/activate',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      async (req, res) => {
        try {
          const vs = app.locals.cfoFinanceVendorStore;
          if (!vs) return res.status(503).json({ error: 'vendor store not ready' });
          const vendor = await vs.activateVendor({ id: req.params.id, actor: cfGetActor(req) });
          res.json({ ok: true, vendor });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/suppliers/match â€” testa vendor-match mot supplier-string
    app.post(
      '/api/v1/cco-cf/suppliers/match',
      attachRole,
      requireAnyRole(cfRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const vs = app.locals.cfoFinanceVendorStore;
          if (!vs) return res.status(503).json({ error: 'vendor store not ready' });
          const sup = req.body?.supplier;
          if (!sup) return res.status(400).json({ error: 'supplier krÃ¤vs' });
          const match = vs.findBySupplierName(sup);
          res.json({ ok: true, match });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/expenses/:id/link-supplier â€” manuell lÃ¤nk
    app.post(
      '/api/v1/cco-cf/expenses/:id/link-supplier',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const exStore = app.locals.cfoExpenseStore;
          const vendorStore = app.locals.cfoFinanceVendorStore;
          if (!exStore) return res.status(503).json({ error: 'expense store not ready' });
          const supplierId = req.body?.supplierId;
          if (!supplierId) return res.status(400).json({ error: 'supplierId krÃ¤vs' });
          if (vendorStore && !vendorStore.getById(supplierId)) {
            return res.status(404).json({ error: 'vendor finns ej' });
          }
          const actor = cfGetActor(req);
          const expense = await exStore.linkSupplier({
            id: req.params.id,
            supplierId,
            matchType: 'manual',
            confidence: 1.0,
            actor,
          });
          if (vendorStore) {
            await vendorStore.recordMatched({
              id: supplierId,
              expenseId: expense.id,
              amount: Number(expense.amountSek) || 0,
              actor,
            });
          }
          res.json({ ok: true, expense });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/suppliers/:id/link-rule â€” koppla en regel till en vendor
    app.post(
      '/api/v1/cco-cf/suppliers/:id/link-rule',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const vs = app.locals.cfoFinanceVendorStore;
          const ruleStore = app.locals.cfoExpenseRuleStore;
          if (!vs) return res.status(503).json({ error: 'vendor store not ready' });
          const ruleId = req.body?.ruleId;
          if (!ruleId) return res.status(400).json({ error: 'ruleId krÃ¤vs' });
          if (ruleStore && !ruleStore.getById(ruleId))
            return res.status(404).json({ error: 'rule finns ej' });
          const vendor = await vs.linkRule({ id: req.params.id, ruleId, actor: cfGetActor(req) });
          res.json({ ok: true, vendor });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // â”€â”€ CF.6 (MVP 5) â€” VAT-rules routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Manuell vat-mode-set + suggestion approve

    // GET /api/v1/cco-cf/vat-modes â€” enum-list fÃ¶r UI
    app.get('/api/v1/cco-cf/vat-modes', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const {
          VALID_VAT_MODES,
          VAT_MODE_LABELS,
          CATEGORY_DEFAULT_VAT_MODE,
        } = require('./src/cfo/cfoExpenseVatRules');
        res.json({
          ok: true,
          modes: VALID_VAT_MODES,
          labels: VAT_MODE_LABELS,
          categoryDefaults: CATEGORY_DEFAULT_VAT_MODE,
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST /api/v1/cco-cf/expenses/:id/vat â€” sÃ¤tt vatMode (godkÃ¤nner samtidigt)
    app.post(
      '/api/v1/cco-cf/expenses/:id/vat',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const exStore = app.locals.cfoExpenseStore;
          if (!exStore) return res.status(503).json({ error: 'expense store not ready' });
          const actor = cfGetActor(req);
          const expense = await exStore.setVatMode({
            id: req.params.id,
            vatMode: req.body?.vatMode,
            vatRatePercent: req.body?.vatRatePercent,
            markedReview: !!req.body?.markedReview,
            actor,
          });
          res.json({ ok: true, expense });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/expenses/:id/vat/suggest â€” kÃ¶r suggestVatMode + spara
    app.post(
      '/api/v1/cco-cf/expenses/:id/vat/suggest',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      async (req, res) => {
        try {
          const exStore = app.locals.cfoExpenseStore;
          if (!exStore) return res.status(503).json({ error: 'expense store not ready' });
          const e = exStore.getById(req.params.id);
          if (!e) return res.status(404).json({ error: 'expense finns ej' });
          const { suggestVatMode } = require('./src/cfo/cfoExpenseVatRules');
          const sug = suggestVatMode({
            category: e.category,
            vatRatePercent: e.vatRatePercent,
            supplierCountry: 'SE',
          });
          if (!sug) return res.json({ ok: false, reason: 'no_suggestion' });
          const actor = cfGetActor(req);
          const expense = await exStore.setVatSuggestion({
            id: req.params.id,
            suggestion: sug,
            actor,
          });
          res.json({ ok: true, expense });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // â”€â”€ CF.7 (MVP 6) â€” Recurring Expense routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // GET /api/v1/cco-cf/recurring â€” lista
    app.get('/api/v1/cco-cf/recurring', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const rs = app.locals.cfoRecurringExpenseStore;
        if (!rs) return res.status(503).json({ error: 'recurring store not ready' });
        const list = rs.listRecurrings({
          status: req.query.status || null,
          supplierId: req.query.supplierId || null,
          frequency: req.query.frequency || null,
          source: req.query.source || null,
          dueBefore: req.query.dueBefore || null,
          limit: Math.max(1, Math.min(1000, parseInt(req.query.limit, 10) || 200)),
        });
        res.json({ ok: true, recurrings: list, summary: rs.summary() });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /api/v1/cco-cf/recurring/:id
    app.get('/api/v1/cco-cf/recurring/:id', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const rs = app.locals.cfoRecurringExpenseStore;
        if (!rs) return res.status(503).json({ error: 'recurring store not ready' });
        const r = rs.getById(req.params.id);
        if (!r) return res.status(404).json({ error: 'not found' });
        res.json(r);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST /api/v1/cco-cf/recurring â€” skapa manuell
    app.post(
      '/api/v1/cco-cf/recurring',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const rs = app.locals.cfoRecurringExpenseStore;
          if (!rs) return res.status(503).json({ error: 'recurring store not ready' });
          const r = await rs.createRecurring({ actor: cfGetActor(req), input: req.body || {} });
          res.json({ ok: true, recurring: r });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // PATCH /api/v1/cco-cf/recurring/:id
    app.patch(
      '/api/v1/cco-cf/recurring/:id',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const rs = app.locals.cfoRecurringExpenseStore;
          if (!rs) return res.status(503).json({ error: 'recurring store not ready' });
          const r = await rs.updateRecurring({
            id: req.params.id,
            patch: req.body || {},
            actor: cfGetActor(req),
          });
          res.json({ ok: true, recurring: r });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/recurring/:id/status â€” transition
    app.post(
      '/api/v1/cco-cf/recurring/:id/status',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const rs = app.locals.cfoRecurringExpenseStore;
          if (!rs) return res.status(503).json({ error: 'recurring store not ready' });
          const r = await rs.transitionStatus({
            id: req.params.id,
            newStatus: req.body?.status,
            reason: req.body?.reason || null,
            actor: cfGetActor(req),
          });
          res.json({ ok: true, recurring: r });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/recurring/detect â€” kÃ¶r auto-detection mot historiska expenses
    app.post(
      '/api/v1/cco-cf/recurring/detect',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const rs = app.locals.cfoRecurringExpenseStore;
          const exStore = app.locals.cfoExpenseStore;
          if (!rs || !exStore) return res.status(503).json({ error: 'stores not ready' });
          const expenses = exStore.listExpenses({ limit: 1000 });
          const existing = rs.listRecurrings({ limit: 1000 });
          const proposals = rs.detectRecurringFromHistory({
            expenses,
            existingRecurrings: existing,
          });
          // Spara fÃ¶rslag som proposed (om body.save=true)
          const actor = cfGetActor(req);
          const saved = [];
          if (req.body?.save === true) {
            for (const p of proposals) {
              const r = await rs.createRecurring({
                actor,
                input: { ...p, source: 'detected_from_expenses', status: 'proposed' },
              });
              saved.push(r);
            }
          }
          res.json({ ok: true, proposalCount: proposals.length, proposals, saved });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/expenses/:id/link-recurring â€” manuell lÃ¤nk
    app.post(
      '/api/v1/cco-cf/expenses/:id/link-recurring',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const exStore = app.locals.cfoExpenseStore;
          const recStore = app.locals.cfoRecurringExpenseStore;
          if (!exStore) return res.status(503).json({ error: 'expense store not ready' });
          const recurringId = req.body?.recurringExpenseId;
          if (!recurringId) return res.status(400).json({ error: 'recurringExpenseId krÃ¤vs' });
          if (recStore && !recStore.getById(recurringId))
            return res.status(404).json({ error: 'recurring finns ej' });
          const actor = cfGetActor(req);
          const expense = await exStore.linkRecurring({
            id: req.params.id,
            recurringExpenseId: recurringId,
            confidence: 1.0,
            actor,
          });
          if (recStore) {
            await recStore.recordExpenseMatch({ id: recurringId, expense, actor });
          }
          res.json({ ok: true, expense });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // â”€â”€ CF.8 (MVP 7) â€” Accountant Review Portal routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Revisor fÃ¥r lÃ¤sa allt + skriva pÃ¥ review-objekt (men aldrig original-expense).

    // GET /api/v1/cco-cf/review/exports â€” lista alla export-batches m. review-status
    app.get('/api/v1/cco-cf/review/exports', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const exStore = app.locals.cfoExpenseStore;
        const revStore = app.locals.cfoFinanceReviewStore;
        if (!exStore || !revStore) return res.status(503).json({ error: 'stores not ready' });
        const batches = exStore.listExportBatches({ limit: 500 });
        const enriched = batches.map((b) => {
          const review = revStore.getByBatchId(b.batchId);
          return {
            ...b,
            review: review
              ? {
                  id: review.id,
                  status: review.status,
                  reviewer: review.reviewer,
                  reviewedAt: review.reviewedAt,
                  decidedAt: review.decidedAt,
                  noteCount: (review.notes || []).length,
                  hasManifest: !!review.manifestKey,
                }
              : { status: 'pending', noteCount: 0, hasManifest: false },
            expenseCount: (b.expenseIds || []).length,
          };
        });
        res.json({ ok: true, batches: enriched, summary: revStore.summary() });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /api/v1/cco-cf/review/exports/:batchId â€” full detalj
    app.get(
      '/api/v1/cco-cf/review/exports/:batchId',
      attachRole,
      requireAnyRole(cfRBAC),
      async (req, res) => {
        try {
          const exStore = app.locals.cfoExpenseStore;
          const revStore = app.locals.cfoFinanceReviewStore;
          const receiptStore = app.locals.cfoReceiptStore;
          if (!exStore || !revStore) return res.status(503).json({ error: 'stores not ready' });
          const batchId = req.params.batchId;
          const batch = exStore
            .listExportBatches({ limit: 500 })
            .find((b) => b.batchId === batchId);
          if (!batch) return res.status(404).json({ error: 'batch finns ej' });
          const expenses = exStore.listExpenses({ batchId, limit: 5000 });
          const review = await revStore.getOrCreateForBatch({ batchId, actor: cfGetActor(req) });
          const linkedReceiptIds = [...new Set(expenses.map((e) => e.receiptId).filter(Boolean))];
          const receipts = receiptStore?.getById
            ? linkedReceiptIds.map((id) => receiptStore.getById(id)).filter(Boolean)
            : [];
          res.json({ ok: true, batch, expenses, receipts, review });
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/review/exports/:batchId/status
    app.post(
      '/api/v1/cco-cf/review/exports/:batchId/status',
      attachRole,
      requireAnyRole(cfRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const revStore = app.locals.cfoFinanceReviewStore;
          if (!revStore) return res.status(503).json({ error: 'review store not ready' });
          const review = await revStore.setStatus({
            batchId: req.params.batchId,
            newStatus: req.body?.status,
            reason: req.body?.reason || null,
            actor: cfGetActor(req),
          });
          res.json({ ok: true, review });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/review/exports/:batchId/note
    app.post(
      '/api/v1/cco-cf/review/exports/:batchId/note',
      attachRole,
      requireAnyRole(cfRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const revStore = app.locals.cfoFinanceReviewStore;
          if (!revStore) return res.status(503).json({ error: 'review store not ready' });
          const review = await revStore.addNote({
            batchId: req.params.batchId,
            text: req.body?.text,
            actor: cfGetActor(req),
          });
          res.json({ ok: true, review });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/review/exports/:batchId/build-package
    app.post(
      '/api/v1/cco-cf/review/exports/:batchId/build-package',
      attachRole,
      requireAnyRole(cfRBAC),
      async (req, res) => {
        try {
          const exStore = app.locals.cfoExpenseStore;
          const receiptStore = app.locals.cfoReceiptStore;
          const revStore = app.locals.cfoFinanceReviewStore;
          const secure = app.locals.ccoSecureStorage;
          if (!exStore || !revStore || !secure)
            return res.status(503).json({ error: 'stores not ready' });
          const { buildReviewPackage } = require('./src/cfo/cfoFinanceReviewPackager');
          const result = await buildReviewPackage({
            expenseStore: exStore,
            receiptStore,
            secureStorage: secure,
            batchId: req.params.batchId,
            actor: cfGetActor(req),
            reviewStore: revStore,
            auditLog: ccoAuditLog,
          });
          if (!result.ok) return res.status(400).json(result);
          res.json(result);
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      }
    );

    // GET /api/v1/cco-cf/review/exports/:batchId/manifest
    app.get(
      '/api/v1/cco-cf/review/exports/:batchId/manifest',
      attachRole,
      requireAnyRole(cfRBAC),
      async (req, res) => {
        try {
          const revStore = app.locals.cfoFinanceReviewStore;
          const secure = app.locals.ccoSecureStorage;
          if (!revStore || !secure?.getObject)
            return res.status(503).json({ error: 'stores not ready' });
          const review = revStore.getByBatchId(req.params.batchId);
          if (!review || !review.manifestKey)
            return res.status(404).json({ error: 'manifest finns ej (kÃ¶r build-package fÃ¶rst)' });
          let obj;
          try {
            obj = await secure.getObject(review.manifestKey);
          } catch (e) {
            return res.status(404).json({ error: 'manifest-fil saknas', detail: e?.message });
          }
          const actor = cfGetActor(req);
          try {
            await revStore.recordDownload({
              batchId: req.params.batchId,
              fileType: 'manifest',
              sizeBytes: (obj.buffer || obj).length,
              actor,
            });
          } catch {}
          res.setHeader('Content-Type', 'application/json');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${req.params.batchId}-manifest.json"`
          );
          res.setHeader('Cache-Control', 'private, no-store');
          res.send(obj.buffer || obj);
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      }
    );

    // GET /api/v1/cco-cf/review/exports/:batchId/attachment/:receiptId â€” secure download
    app.get(
      '/api/v1/cco-cf/review/exports/:batchId/attachment/:receiptId',
      attachRole,
      requireAnyRole(cfRBAC),
      async (req, res) => {
        try {
          const exStore = app.locals.cfoExpenseStore;
          const receiptStore = app.locals.cfoReceiptStore;
          const revStore = app.locals.cfoFinanceReviewStore;
          const secure = app.locals.ccoSecureStorage;
          if (!exStore || !receiptStore || !revStore || !secure?.getObject)
            return res.status(503).json({ error: 'stores not ready' });
          // Verifiera att receipt Ã¤r lÃ¤nkad till en expense i batchen
          const expenses = exStore.listExpenses({ batchId: req.params.batchId, limit: 5000 });
          if (!expenses.some((e) => e.receiptId === req.params.receiptId)) {
            return res.status(403).json({ error: 'receipt ej kopplad till denna batch' });
          }
          const r = receiptStore.getById(req.params.receiptId);
          if (!r) return res.status(404).json({ error: 'receipt finns ej' });
          let obj;
          try {
            obj = await secure.getObject(r.storageKey);
          } catch (e) {
            return res.status(404).json({ error: 'secure-storage-fil saknas', detail: e?.message });
          }
          const actor = cfGetActor(req);
          try {
            await revStore.recordDownload({
              batchId: req.params.batchId,
              fileType: 'attachment',
              sizeBytes: (obj.buffer || obj).length,
              actor,
            });
          } catch {}
          res.setHeader('Content-Type', r.mimeType || obj.mimeType || 'application/octet-stream');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${r.originalFileName || r.id}"`
          );
          res.setHeader('Cache-Control', 'private, no-store');
          res.send(obj.buffer || obj);
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      }
    );

    // GET /finance-review.html mappas via static (public/)

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // CF.9 (MVP 8) â€” Finance Reports + Monthly Close
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const cfReviewerRBAC = ['owner', 'revisor']; // approve/correct/close/begin-review
    const cfOwnerOnlyRBAC = ['owner']; // reopen

    function cfBuildReportData() {
      const expStore = app.locals.cfoExpenseStore;
      const receiptStore = app.locals.cfoReceiptStore;
      const vendorStore = app.locals.cfoFinanceVendorStore;
      const recurringStore = app.locals.cfoRecurringExpenseStore;
      const reviewStore = app.locals.cfoFinanceReviewStore;
      return {
        expenses: expStore?.listExpenses?.({ limit: 5000 }) || [],
        receipts: receiptStore?.listReceipts?.({ limit: 5000 }) || [],
        vendors: vendorStore?.listVendors?.({ limit: 2000 }) || [],
        recurrings: recurringStore?.listRecurrings?.({ limit: 2000 }) || [],
        reviews: reviewStore?.listReviews?.({ limit: 2000 }) || [],
        exportBatches: expStore?.listExportBatches?.({ limit: 500 }) || [],
      };
    }

    // GET /api/v1/cco-cf/reports â€” lista tillgÃ¤ngliga rapport-typer + meta
    app.get('/api/v1/cco-cf/reports', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const { VALID_REPORT_KINDS } = require('./src/cfo/cfoFinanceReportEngine');
        return res.json({
          ok: true,
          availableKinds: VALID_REPORT_KINDS,
          fortnoxStatus: 'BLOCKED_INTEGRATION',
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST /api/v1/cco-cf/reports/generate â€” generera rapport (no persistence)
    app.post(
      '/api/v1/cco-cf/reports/generate',
      attachRole,
      requireAnyRole(cfRBAC),
      jsonParser,
      (req, res) => {
        try {
          const { generateReport } = require('./src/cfo/cfoFinanceReportEngine');
          const { kind, period } = req.body || {};
          const actor = cfGetActor(req);
          const data = cfBuildReportData();
          const report = generateReport({ kind, period, data, generatedBy: actor });
          try {
            ccoAuditLog.append({
              action: 'cf.report.generated',
              kind: 'cf.report.generated',
              surface: 'cco.cf.reports',
              ts: new Date().toISOString(),
              actor,
              detail: { reportKind: kind, period, anomalyCount: report.anomalies?.length || 0 },
            });
          } catch {}
          return res.json({ ok: true, report });
        } catch (err) {
          const code =
            err.message?.startsWith('OkÃ¤nd') || err.message?.startsWith('Ogiltig') ? 400 : 500;
          res.status(code).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/reports/package â€” generera + spara till secure storage
    app.post(
      '/api/v1/cco-cf/reports/package',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const { buildReportPackage } = require('./src/cfo/cfoFinanceReportPackager');
          const secure = app.locals.ccoSecureStorage;
          if (!secure) return res.status(503).json({ error: 'secure storage saknas' });
          const { kind, period } = req.body || {};
          const actor = cfGetActor(req);
          const data = cfBuildReportData();
          const result = await buildReportPackage({
            kind,
            period,
            data,
            secureStorage: secure,
            actor,
            auditLog: ccoAuditLog,
          });
          return res.json({
            ok: true,
            packageId: result.packageId,
            manifest: result.manifest,
            report: result.report,
          });
        } catch (err) {
          const code =
            err.message?.startsWith('OkÃ¤nd') || err.message?.startsWith('Ogiltig') ? 400 : 500;
          res.status(code).json({ error: err.message });
        }
      }
    );

    // GET /api/v1/cco-cf/reports/package/:period/:kind/:packageId/download/:fileKind
    app.get(
      '/api/v1/cco-cf/reports/package/:period/:kind/:packageId/download/:fileKind',
      attachRole,
      requireAnyRole(cfRBAC),
      async (req, res) => {
        try {
          const { downloadFromPackage } = require('./src/cfo/cfoFinanceReportPackager');
          const secure = app.locals.ccoSecureStorage;
          if (!secure) return res.status(503).json({ error: 'secure storage saknas' });
          const { period, kind, packageId, fileKind } = req.params;
          const actor = cfGetActor(req);
          const { buffer, mimeType, sizeBytes } = await downloadFromPackage({
            packageId,
            fileKind,
            reportKind: kind,
            period,
            secureStorage: secure,
            actor,
            auditLog: ccoAuditLog,
          });
          const ext = fileKind === 'report_csv' ? 'csv' : 'json';
          res.setHeader('Content-Type', mimeType);
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${packageId}-${fileKind}.${ext}"`
          );
          res.setHeader('Cache-Control', 'private, no-store');
          res.setHeader('Content-Length', sizeBytes);
          res.send(buffer);
        } catch (err) {
          const code = err.message?.includes('finns inte') ? 404 : 500;
          res.status(code).json({ error: err.message });
        }
      }
    );

    // â”€â”€ Periods (monthly close) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // GET /api/v1/cco-cf/periods â€” lista perioder
    app.get('/api/v1/cco-cf/periods', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const store = app.locals.cfoFinanceMonthlyCloseStore;
        if (!store) return res.status(503).json({ error: 'monthly close store not ready' });
        const periods = store.listPeriods({ limit: 100 });
        return res.json({ ok: true, periods, summary: store.summary() });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /api/v1/cco-cf/periods/:periodId â€” detail + checklist
    app.get('/api/v1/cco-cf/periods/:periodId', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const store = app.locals.cfoFinanceMonthlyCloseStore;
        if (!store) return res.status(503).json({ error: 'monthly close store not ready' });
        const periodId = req.params.periodId;
        const period = store.getPeriod(periodId) || store.getOrInitPeriod(periodId);
        const checklist = store.evaluateChecklist({
          periodId,
          stores: {
            expenseStore: app.locals.cfoExpenseStore,
            receiptStore: app.locals.cfoReceiptStore,
            recurringStore: app.locals.cfoRecurringExpenseStore,
            reviewStore: app.locals.cfoFinanceReviewStore,
          },
        });
        return res.json({ ok: true, period, checklist });
      } catch (err) {
        const code = err.message?.startsWith('Ogiltig') ? 400 : 500;
        res.status(code).json({ error: err.message });
      }
    });

    // POST /api/v1/cco-cf/periods/:periodId/start-close â€” finance/owner
    app.post(
      '/api/v1/cco-cf/periods/:periodId/start-close',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const store = app.locals.cfoFinanceMonthlyCloseStore;
          if (!store) return res.status(503).json({ error: 'monthly close store not ready' });
          const actor = cfGetActor(req);
          const period = await store.startClose({ periodId: req.params.periodId, actor });
          return res.json({ ok: true, period });
        } catch (err) {
  YªçŠx-®éÜj×¢ëiºÚ+Š§j[h‘éÜ¢éíï5N‹Z–‹­¦ëeŠw¬Ô€€€€€€€É•Ì¹ÍÑ…ÑÕÌ¡•ÉÈ¹ÍÑ…ÑÕÍ½‘”ñğ€ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè•ÉÈ¹µ•ÍÍ…”ô¤ì(€€€€€€€ô(€€€€€ô(€€€€¤ì((€€€€¼¼A=MP€½…Á¤½ØÄ½¼µ˜½Á•É¥½‘Ì¼éÁ•É¥½‘%½É•…‘äµ™½ÈµÉ•Ù¥•ÜƒŠP™¥¹…¹”½½İ¹•È(€€€…ÁÀ¹Á½ÍĞ (€€€€€€œ½…Á¤½ØÄ½¼µ˜½Á•É¥½‘Ì¼éÁ•É¥½‘%½É•…‘äµ™½ÈµÉ•Ù¥•Üœ°(€€€€€…ÑÑ…¡I½±”°(€€€€€É•ÅÕ¥É•¹åI½±”¡™5ÕÑ…Ñ•I	¤°(€€€€€©Í½¹A…ÉÍ•È°(€€€€€…Íå¹Œ€¡É•Ä°É•Ì¤€ôøì(€€€€€€€ÑÉäì(€€€€€€€€€½¹ÍĞÍÑ½É”€ô…ÁÀ¹±½…±Ì¹™½¥¹…¹•5½¹Ñ¡±å±½Í•MÑ½É”ì(€€€€€€€€€¥˜€ …ÍÑ½É”¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ÔÀÌ¤¹©Í½¸¡ì•ÉÉ½Èè€µ½¹Ñ¡±ä±½Í”ÍÑ½É”¹½ĞÉ•…‘äœô¤ì(€€€€€€€€€½¹ÍĞ…Ñ½È€ô™•ÑÑ½È¡É•Ä¤ì(€€€€€€€€€½¹ÍĞÁ•É¥½€ô…İ…¥ĞÍÑ½É”¹µ…É­I•…‘å½ÉI•Ù¥•Ü¡ìÁ•É¥½‘%èÉ•Ä¹Á…É…µÌ¹Á•É¥½‘%°…Ñ½Èô¤ì(€€€€€€€€€É•ÑÕÉ¸É•Ì¹©Í½¸¡ì½¬èÑÉÕ”°Á•É¥½ô¤ì(€€€€€€€ô…Ñ €¡•ÉÈ¤ì(€€€€€€€€€É•Ì¹ÍÑ…ÑÕÌ¡•ÉÈ¹ÍÑ…ÑÕÍ½‘”ñğ€ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè•ÉÈ¹µ•ÍÍ…”ô¤ì(€€€€€€€ô(€€€€€ô(€€€€¤ì((€€€€¼¼A=MP€½…Á¤½ØÄ½¼µ˜½Á•É¥½‘Ì¼éÁ•É¥½‘%½É•ÅÕ•ÍĞµ½ÉÉ•Ñ¥½¸ƒŠP½İ¹•È½É•Ù¥Í½È(€€€…ÁÀ¹Á½ÍĞ (€€€€€€œ½…Á¤½ØÄ½¼µ˜½Á•É¥½‘Ì¼éÁ•É¥½‘%½É•ÅÕ•ÍĞµ½ÉÉ•Ñ¥½¸œ°(€€€€€…ÑÑ…¡I½±”°(€€€€€É•ÅÕ¥É•¹åI½±”¡™I•Ù¥•İ•ÉI	¤°(€€€€€©Í½¹A…ÉÍ•È°(€€€€€…Íå¹Œ€¡É•Ä°É•Ì¤€ôøì(€€€€€€€ÑÉäì(€€€€€€€€€½¹ÍĞÍÑ½É”€ô…ÁÀ¹±½…±Ì¹™½¥¹…¹•5½¹Ñ¡±å±½Í•MÑ½É”ì(€€€€€€€€€¥˜€ …ÍÑ½É”¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ÔÀÌ¤¹©Í½¸¡ì•ÉÉ½Èè€µ½¹Ñ¡±ä±½Í”ÍÑ½É”¹½ĞÉ•…‘äœô¤ì(€€€€€€€€€½¹ÍĞ…Ñ½È€ô™•ÑÑ½È¡É•Ä¤ì(€€€€€€€€€½¹ÍĞÉ•…Í½¸€ôMÑÉ¥¹œ¡É•Ä¹‰½‘äü¹É•…Í½¸ñğ€œœ¤¹ÑÉ¥´ ¤ì(€€€€€€€€€¥˜€ …É•…Í½¸¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€É•…Í½¸­Ë‘ÙÌœô¤ì(€€€€€€€€€½¹ÍĞÁ•É¥½€ô…İ…¥ĞÍÑ½É”¹É•ÅÕ•ÍÑ½ÉÉ•Ñ¥½¸¡ì(€€€€€€€€€€€Á•É¥½‘%èÉ•Ä¹Á…É…µÌ¹Á•É¥½‘%°(€€€€€€€€€€€…Ñ½È°(€€€€€€€€€€€É•…Í½¸°(€€€€€€€€€ô¤ì(€€€€€€€€€É•ÑÕÉ¸É•Ì¹©Í½¸¡ì½¬èÑÉÕ”°Á•É¥½ô¤ì(€€€€€€€ô…Ñ €¡•ÉÈ¤ì(€€€€€€€€€É•Ì¹ÍÑ…ÑÕÌ¡•ÉÈ¹ÍÑ…ÑÕÍ½‘”ñğ€ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè•ÉÈ¹µ•ÍÍ…”ô¤ì(€€€€€€€ô(€€€€€ô(€€€€¤ì((€€€€¼¼A=MP€½…Á¤½ØÄ½¼µ˜½Á•É¥½‘Ì¼éÁ•É¥½‘%½…ÁÁÉ½Ù”ƒŠP½İ¹•È½É•Ù¥Í½È(€€€…ÁÀ¹Á½ÍĞ (€€€€€€œ½…Á¤½ØÄ½¼µ˜½Á•É¥½‘Ì¼éÁ•É¥½‘%½…ÁÁÉ½Ù”œ°(€€€€€…ÑÑ…¡I½±”°(€€€€€É•ÅÕ¥É•¹åI½±”¡™I•Ù¥•İ•ÉI	¤°(€€€€€©Í½¹A…ÉÍ•È°(€€€€€…Íå¹Œ€¡É•Ä°É•Ì¤€ôøì(€€€€€€€ÑÉäì(€€€€€€€€€½¹ÍĞÍÑ½É”€ô…ÁÀ¹±½…±Ì¹™½¥¹…¹•5½¹Ñ¡±å±½Í•MÑ½É”ì(€€€€€€€€€¥˜€ …ÍÑ½É”¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ÔÀÌ¤¹©Í½¸¡ì•ÉÉ½Èè€µ½¹Ñ¡±ä±½Í”ÍÑ½É”¹½ĞÉ•…‘äœô¤ì(€€€€€€€€€½¹ÍĞ…Ñ½È€ô™•ÑÑ½È¡É•Ä¤ì(€€€€€€€€€½¹ÍĞÁ•É¥½€ô…İ…¥ĞÍÑ½É”¹…ÁÁÉ½Ù”¡ìÁ•É¥½‘%èÉ•Ä¹Á…É…µÌ¹Á•É¥½‘%°…Ñ½Èô¤ì(€€€€€€€€€É•ÑÕÉ¸É•Ì¹©Í½¸¡ì½¬èÑÉÕ”°Á•É¥½ô¤ì(€€€€€€€ô…Ñ €¡•ÉÈ¤ì(€€€€€€€€€É•Ì¹ÍÑ…ÑÕÌ¡•ÉÈ¹ÍÑ…ÑÕÍ½‘”ñğ€ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè•ÉÈ¹µ•ÍÍ…”ô¤ì(€€€€€€€ô(€€€€€ô(€€€€¤ì((€€€€¼¼A=MP€½…Á¤½ØÄ½¼µ˜½Á•É¥½‘Ì¼éÁ•É¥½‘%½±½Í”ƒŠP½İ¹•È½É•Ù¥Í½È(€€€…ÁÀ¹Á½ÍĞ (€€€€€€œ½…Á¤½ØÄ½¼µ˜½Á•É¥½‘Ì¼éÁ•É¥½‘%½±½Í”œ°(€€€€€…ÑÑ…¡I½±”°(€€€€€É•ÅÕ¥É•¹åI½±”¡™I•Ù¥•İ•ÉI	¤°(€€€€€©Í½¹A…ÉÍ•È°(€€€€€…Íå¹Œ€¡É•Ä°É•Ì¤€ôøì(€€€€€€€ÑÉäì(€€€€€€€€€½¹ÍĞÍÑ½É”€ô…ÁÀ¹±½…±Ì¹™½¥¹…¹•5½¹Ñ¡±å±½Í•MÑ½É”ì(€€€€€€€€€¥˜€ …ÍÑ½É”¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ÔÀÌ¤¹©Í½¸¡ì•ÉÉ½Èè€µ½¹Ñ¡±ä±½Í”ÍÑ½É”¹½ĞÉ•…‘äœô¤ì(€€€€€€€€€½¹ÍĞ…Ñ½È€ô™•ÑÑ½È¡É•Ä¤ì(€€€€€€€€€½¹ÍĞÁ•É¥½€ô…İ…¥ĞÍÑ½É”¹±½Í”¡ìÁ•É¥½‘%èÉ•Ä¹Á…É…µÌ¹Á•É¥½‘%°…Ñ½Èô¤ì(€€€€€€€€€É•ÑÕÉ¸É•Ì¹©Í½¸¡ì½¬èÑÉÕ”°Á•É¥½ô¤ì(€€€€€€€ô…Ñ €¡•ÉÈ¤ì(€€€€€€€€€É•Ì¹ÍÑ…ÑÕÌ¡•ÉÈ¹ÍÑ…ÑÕÍ½‘”ñğ€ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè•ÉÈ¹µ•ÍÍ…”ô¤ì(€€€€€€€ô(€€€€€ô(€€€€¤ì((€€€€¼¼A=MP€½…Á¤½ØÄ½¼µ˜½Á•É¥½‘Ì¼éÁ•É¥½‘%½É•½Á•¸ƒŠP=]9H=91d€¡­Ë‘Ù•ÈÉ•…Í½¸¤(€€€…ÁÀ¹Á½ÍĞ (€€€€€€œ½…Á¤½ØÄ½¼µ˜½Á•É¥½‘Ì¼éÁ•É¥½‘%½É•½Á•¸œ°(€€€€€…ÑÑ…¡I½±”°(€€€€€É•ÅÕ¥É•¹åI½±”¡™=İ¹•É=¹±åI	¤°(€€€€€©Í½¹A…ÉÍ•È°(€€€€€…Íå¹Œ€¡É•Ä°É•Ì¤€ôøì(€€€€€€€ÑÉäì(€€€€€€€€€½¹ÍĞÍÑ½É”€ô…ÁÀ¹±½…±Ì¹™½¥¹…¹•5½¹Ñ¡±å±½Í•MÑ½É”ì(€€€€€€€€€¥˜€ …ÍÑ½É”¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ÔÀÌ¤¹©Í½¸¡ì•ÉÉ½Èè€µ½¹Ñ¡±ä±½Í”ÍÑ½É”¹½ĞÉ•…‘äœô¤ì(€€€€€€€€€½¹ÍĞ…Ñ½È€ô™•ÑÑ½È¡É•Ä¤ì(€€€€€€€€€½¹ÍĞÉ•…Í½¸€ôMÑÉ¥¹œ¡É•Ä¹‰½‘äü¹É•…Í½¸ñğ€œœ¤¹ÑÉ¥´ ¤ì(€€€€€€€€€¥˜€ …É•…Í½¸¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€É•…Í½¸­Ë‘ÙÌÙ¥É•½Á•¸œô¤ì(€€€€€€€€€½¹ÍĞÁ•É¥½€ô…İ…¥ĞÍÑ½É”¹É•½Á•¸¡ìÁ•É¥½‘%èÉ•Ä¹Á…É…µÌ¹Á•É¥½‘%°…Ñ½È°É•…Í½¸ô¤ì(€€€€€€€€€É•ÑÕÉ¸É•Ì¹©Í½¸¡ì½¬èÑÉÕ”°Á•É¥½ô¤ì(€€€€€€€ô…Ñ €¡•ÉÈ¤ì(€€€€€€€€€É•Ì¹ÍÑ…ÑÕÌ¡•ÉÈ¹ÍÑ…ÑÕÍ½‘”ñğ€ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè•ÉÈ¹µ•ÍÍ…”ô¤ì(€€€€€€€ô(€€€€€ô(€€€€¤ì((€€€½¹Í½±”¹±½œ (€€€€€€m¼µ™tµ½¹Ñ•É…è‘…Í¡‰½…É€¬É••¥ÁÑÌ€¬•áÁ•¹Í•Ì€¬¸ĞÉÕ±•Ì€¬¸ÔÙ•¹‘½ÉÌ€¬¸ØÙ…Ğ€¬¸ÜÉ•ÕÉÉ¥¹œ€¬¸àÉ•Ù¥•Ü€¬¸äÉ•Á½ÉÑÌ½µ½¹Ñ¡±äµ±½Í”€¡I	è½İ¹•È½™¥¹…¹”½É•Ù¥Í½È¤œ(€€€€¤ì(€ô…Ñ €¡•ÉÈ¤ì(€€€½¹Í½±”¹İ…É¸ m¼µÁ¡½Ñ¼µ…¹¹½Ğ­Á±…¹Ít­Õ¹‘”¥¹Ñ”µ½¹Ñ•É„èœ°•ÉÈ¹µ•ÍÍ…”¤ì(€ô)ô¤ ¤ì((¼¼ƒŠRŠR <%¹¥‘•¹Ğ1½œMÑ½É”€¡MÁÉ¥¹Ğ€Äå¸Ä€ŒĞĞ¤ƒŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠStÖÚ$z{-®éÜj×™\ËšœÛÛŠˆ]ØZ]İÜ™K˜Y›İÊÂˆ‹‹œ™\K˜›ÙKˆXİÜˆÈ\Ù\’Yˆ™\Kœ›ÛOË\Ù\’Y›ÛNˆ™\Kœ›ÛOËœ›ÛHKˆJBˆ
NÂˆHØ]Ú
JHÂˆ™\Ëœİ]\Ê
KšœÛÛŠÈ\œ›ÜˆK›Y\ÜØYÙHJNÂˆBˆBˆ
NÂˆ\œÜİ
ˆ	ËØ\KİŒKØØÛËY]Y›İËÜ™]šY]ÙY	Ëˆ]XÚ›ÛKˆ™\]Z\™P[T›ÛJPÊKˆœÛÛ”\œÙ\‹ˆ\Ş[˜È
™\K™\ÊHOˆÂˆHÂˆ™\ËšœÛÛŠˆ]ØZ]İÜ™K›X\šÔ™]šY]ÙY
ÂˆXİÜˆÈ\Ù\’Yˆ™\Kœ›ÛOË\Ù\’Y›ÛNˆ™\Kœ›ÛOËœ›ÛHKˆ‹‹œ™\K˜›ÙKˆJBˆ
NÂˆHØ]Ú
JHÂˆ™\Ëœİ]\Ê
KšœÛÛŠÈ\œ›ÜˆK›Y\ÜØYÙHJNÂˆBˆBˆ
NÂˆÛÛœÛÛK›ÙÊ	ÖØØÛËY]Y›İ×H[Û\˜YˆÑUØ\KİŒKØØÛËY]Y›İÈ
ÈÙ^ÜØ\Ì	ÊNÂˆHØ]Ú
\œŠHÂˆÛÛœÛÛKØ\›Š	ÖØØÛËY]Y›İ×Hİ[™H[H[Û\˜N‰Ë\œ‹›Y\ÜØYÙJNÂˆBŸJJ
NÂ‚‹ËÈ8¥ 8¥ ĞÓÈZÙHİÈ
Üš[NPËŒÊH8 %]Y[X\ÜÙ]\ØYšXHÛ[šZÈ8¥ 8¥ Š\Ş[˜È

HOˆÂˆHÂˆÛÛœİÈ]XÚ›ÛK™\]Z\™P[T›ÛHHH™\]Z\™J	Ë‹ÜÜ˜ËÜÙXİ\š]KØØÛÔ˜˜XÉÊNÂˆÛÛœİ][\ˆH™\]Z\™J	Û][\‰ÊNÂˆÛÛœİ\ØYH][\ŠÂˆİÜ˜YÙNˆ][\‹›Y[[ÜTİÜ˜YÙJ
Kˆ[Z]ÎˆÈš[TÚ^™NˆŒ
ˆL
ˆLKˆJNÂˆÛÛœİÜ\ÈH™\]Z\™J	ØÜ\ÉÊNÂ‚ˆÛÛœİPÈHÉÛİÛ™\‰Ë	ÙØİÜ‰Ë	ÜİY™‰Ë	ÜİY™—Ø\ÜÚ\İ[	×NÂ‚ˆËÈÔÕØ\KİŒKØØÛËÜ]Y[Îœ]Y[YİZÙK\İÂˆËÈ][\\Ù›Ü›KY]Nˆš[K[˜Ûİ[\’YË\ÙOËİXš™XİË™X]Y[Ù^OË›İOËZÙ[]ËÙ\ÜÚ[Û“[X™\Ë™YYÔ™]šY]ÏÂˆ\œÜİ
ˆ	ËØ\KİŒKØØÛËÜ]Y[Îœ]Y[YİZÙK\İÉËˆ]XÚ›ÛKˆ™\]Z\™P[T›ÛJPÊKˆ\ØYœÚ[™ÛJ	Ùš[IÊKˆ\Ş[˜È
™\K™\ÊHOˆÂˆHÂˆÛÛœİ]Y[YH™\Kœ\˜[\Ëœ]Y[YÂˆYˆ
\]Y[Y
H™]\›ˆ™\Ëœİ]\Ê
KšœÛÛŠÈ\œ›Üˆ	Ü]Y[YÜ°éœÉÈJNÂˆYˆ
\™\K™š[JH™]\›ˆ™\Ëœİ]\Ê
KšœÛÛŠÈ\œ›Üˆ	Ùš[HÜ°éœÈ
][\\
IÈJNÂ‚ˆËÈ0é]HİÜ™\ÈšXH\›ØØ[È
^H8 %[ˆ[™˜HRQ‘N›ˆğé\ˆ[JBˆÛÛœİİÜ™\ÈHÂˆ\ÜÙ]İÜ™Nˆ\›ØØ[Ë˜ØÛÔ]Y[\ÜÙ]İÜ™KˆÙXİ\™TİÜ˜YÙNˆ\›ØØ[Ë˜ØÛÔÙXİ\™TİÜ˜YÙKˆNÂˆYˆ
\İÜ™\ËœÙXİ\™TİÜ˜YÙH\İÜ™\Ë˜\ÜÙ]İÜ™JHÂˆ™]\›ˆ™\Ëœİ]\ÊLÊKšœÛÛŠÂˆ\œ›Ü‚ˆ	Ø\ÜÙ]ÜİÜ™\×Û›İÚ[š]X[^™Y8 %Ù\™\‹\İ\\[\ˆYÙÈØ\KİŒKØØÛËX\ÜÙ]ÈšXH[œİ\™P\ÜÙ]İÜ™\È°íœœİ	ËˆJNÂˆB‚ˆÛÛœİYˆH™\K™š[K˜Y™™\ÂˆÛÛœİÚLMˆHÜ\Ë˜Ü™X]R\Ú
	ÜÚLM‰ÊK\]JYŠK™YÙ\İ
	Ú^	ÊNÂˆÛÛœİZÙ[]H™\K˜›ÙKZÙ[]™]È]J
KÒTÓÔİš[™Ê
NÂˆÛÛœİ\ÙHH™\K˜›ÙKœ\ÙH	İ™X]Y[	ÎÂˆÛÛœİİXš™XİH
™\K˜›ÙKœİXš™Xİ	‰ˆİš[™Ê™\K˜›ÙKœİXš™Xİ
Kš[J
JH[ÂˆÛÛœİ™X]Y[Ù^HH™\K˜›ÙK™X]Y[Ù^H[ÂˆÛÛœİÙ\ÜÚ[Û“[X™\ˆH™\K˜›ÙKœÙ\ÜÚ[Û“[X™\‚ˆÈ\œÙR[
™\K˜›ÙKœÙ\ÜÚ[Û“[X™\‹L
Bˆˆ[ÂˆÛÛœİ›İHH™\K˜›ÙK››İH	ÉÎÂˆÛÛœİ[˜Ûİ[\’YH™\K˜›ÙK™[˜Ûİ[\’Y[ÂˆÛÛœİ™YYÔ™]šY]ÈHİš[™Ê™\K˜›ÙK›™YYÔ™]šY]È	ÉÊHOOH	İYIÈ\İXš™XİÂˆÛÛœİZÙ[HHÂˆ\Ù\’Yˆ™\Kœ›ÛOË\Ù\’Y™\KšXY\œÖÉŞXØÛË]\Ù\‰×H	İ[šÛ›İÛ‰Ëˆ›ÛNˆ™\Kœ›ÛOËœ›ÛH	ÜİY™‰ËˆNÂ‚ˆËÈYÜ˜HHÙXİ\™HİÜ˜YÙBˆÛÛœİ[HHZÙ[]œÛXÙJÊNÈËÈVVVKSSBˆÛÛœİİÜ˜YÙRÙ^HH]Y[\İÜËÉŞ[_KÉÜ]Y[YKÉÑ]K››İÊ
_KIÜÚLM‹œÛXÙJ
_KšœØÂˆ]ØZ]İÜ™\ËœÙXİ\™TİÜ˜YÙKœ]Øš™Xİ
İÜ˜YÙRÙ^KY‹ÂˆZ[YU\Nˆ™\K™š[K›Z[Y]\H	Ú[XYÙKÚœYÉËˆJNÂ‚ˆËÈÚØ\H]Y[Ø\ÜÙ]šXHY\ÜÙ]
[\ˆÜ™X]P\ÜÙ]ÛHš[›œÊBˆÛÛœİ\ÜÙ][œ]HÂˆ]Y[Yˆ[˜Ûİ[\’YˆØ]YÛÜNˆ	ÜİÉËˆÛİ\˜ÙTŞ\İ[Nˆ	ØØÛ×İZÙWÜİÉËˆİÜ˜YÙRÙ^KˆÚXÚÜİ[NˆÚLM‹ˆš[TÚ^™NˆY‹›[™İˆZ[YU\Nˆ™\K™š[K›Z[Y]\H	Ú[XYÙKÚœYÉËˆÜšYÚ[˜[š[S˜[YNˆ™\K™š[K›ÜšYÚ[˜[˜[YHİËIÑ]K››İÊ
_KšœØˆZÙ[]ˆY]NˆÂˆZÙ[]ˆZÙ[Kˆ\ÙKˆİXš™Xİˆ™X]Y[Ù^KˆÙ\ÜÚ[Û“[X™\‹ˆ›İKˆ\Ü^R[ÎˆÈ\ÙKİXš™Xİ™X]Y[Ù^KÙ\ÜÚ[Û“[X™\ˆKˆKˆ™YYÔ™]šY]Ëˆ‹‹Š™YYÔ™]šY]È	‰ˆÂˆ