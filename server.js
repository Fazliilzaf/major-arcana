require('dotenv').config();
/* global ensureAssetStores, gatherStores */
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
const { resolveLegacyHostRedirectUrl } = require('./src/brand/resolveLegacyHostRedirectUrl');
const { assetToPatientFile, resolvePatientAssetIds } = require('./src/ops/ccoPatientAssetIdentity');
const {
  createCcoPatientAssetStore: createSharedCcoPatientAssetStore,
} = require('./src/ops/ccoPatientAssetStore');
const {
  createSecureStorageProvider: createSharedSecureStorageProvider,
} = require('./src/ops/ccoSecureStorageProvider');

const { getClientoConfigForBrand, getKnowledgeDirForBrand } = require('./src/brand/runtimeConfig');
const { createCorsPolicy } = require('./src/security/corsPolicy');
const { requestContextMiddleware } = require('./src/observability/requestContext');

const app = express();
if (config.trustProxy) app.set('trust proxy', 1);
app.use(cors(createCorsPolicy(config)));
app.use(express.json({ limit: '10mb' }));

let ccoRequireAuthMiddleware = null;
let sharedPatientAssetStorePromise = null;
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

// ─── CCO Kunder-modul: lista, dossiér, foto-storage + iCal ─────────
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

// ── CCO RBAC + Audit-log (Sprint 1.1 + 1.2) ─────────────────────
let ccoAuditLog = null;
try {
  const { createCcoAuditLog } = require('./src/security/ccoAuditLog');
  const { requireAnyRole, attachRole } = require('./src/security/ccoRbac');
  ccoAuditLog = createCcoAuditLog({
    filePath: path.join(__dirname, 'data', 'cco-audit.jsonl'),
  });

  // GET /api/v1/cco-audit — bara owner+revisor
  app.get('/api/v1/cco-audit', attachRole, requireAnyRole(['owner', 'revisor']), (req, res) => {
    const items = ccoAuditLog.query({
      limit: Number(req.query.limit) || 100,
      since: req.query.since || null,
      action: req.query.action || null,
      role: req.query.role || null,
      targetId: req.query.targetId || null,
    });
    res.json({ count: items.length, items, stats: ccoAuditLog.stats() });
  });

  // POST /api/v1/cco-audit — interna systemet kan logga
  const express = require('express');
  app.post('/api/v1/cco-audit', attachRole, express.json({ limit: '8kb' }), (req, res) => {
    const entry = ccoAuditLog.append({
      ...req.body,
      actor: {
        role: req.cco?.role || 'system',
        ip: (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
          .toString()
          .split(',')[0]
          .trim(),
        ...(req.body?.actor || {}),
      },
    });
    res.json({ ok: true, traceId: entry.traceId });
  });

  // Expose to other handlers via app.locals
  app.locals.ccoAuditLog = ccoAuditLog;
  console.log('[cco-audit] monterad: GET /api/v1/cco-audit (owner/revisor only) + POST');
} catch (err) {
  console.warn('[cco-audit] kunde inte montera:', err.message);
}

// ── CCO Booking-Case Flow (Sprint 1.3) ──────────────────────────
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
          // 19F.5 Fix #6 — Booking → Encounter auto-bridge
          // När en booking-case går till 'confirmed' (eller motsvarande), skapa
          // encounter-skal så journal+foton+plan kan länkas under rätt besök.
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
            // tyst — bridge är best-effort, blockera inte transition
            console.warn('[booking→encounter bridge]', bridgeErr.message);
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

// ── CCO Customer Identity routes (Sprint 2.1) ───────────────────
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
          const err = new Error('primaryKey + secondaryKeys[] krävs');
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
          const err = new Error('sourceKey + aliasesToSplit[] krävs');
          err.statusCode = 400;
          throw err;
        }
        return identityStore.splitTenantCustomerProfile({ tenantId, sourceKey, aliasesToSplit });
      })
    );

    // Import — preview + commit
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
          const err = new Error('suggestionId krävs');
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
          const err = new Error('customerKey + email krävs');
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

// ── CCO Mailbox-admin (Sprint 2.2) ──────────────────────────────
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
            return res.status(400).json({ error: 'id, name, email krävs' });
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

    // Seed med default mailboxes om filen är tom
    const initial = await loadMailboxes();
    if (!initial.mailboxes.length) {
      initial.mailboxes = [
        {
          id: 'contact',
          name: 'Kontakt',
          email: 'contact@hairtpclinic.com',
          owner: 'team',
          signature: 'Hair TP Clinic — Sveavägen 42, 113 50 Stockholm · 08-555 123 45',
          tenantId: 'hairtp-clinic',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'info',
          name: 'Info & prisförfrågningar',
          email: 'info@hairtpclinic.com',
          owner: 'fazli',
          signature: 'Fazli · Hair TP Clinic\n08-555 123 45',
          tenantId: 'hairtp-clinic',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'egzona',
          name: 'Egzona (patientansvarig)',
          email: 'egzona@hairtpclinic.com',
          owner: 'egzona',
          signature: 'Egzona M. · Customer Lead\nHair TP Clinic · 08-555 123 45',
          tenantId: 'hairtp-clinic',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'fazli',
          name: 'Fazli (medicinskt ansvarig)',
          email: 'fazli@hairtpclinic.com',
          owner: 'fazli',
          signature: 'Dr. Fazli · Medical Director\nHair TP Clinic · 08-555 123 45',
          tenantId: 'hairtp-clinic',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'marknad',
          name: 'Marknad',
          email: 'marknad@hairtpclinic.com',
          owner: 'marknad',
          signature: 'Hair TP Clinic · marknad',
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
          signature: 'Hair TP Clinic · konsultation',
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

// ── CCO Photo Annotation + Treatment Plan Canvas stores (Sprint 19B) ──
// Instansiera vid startup och lägg i app.locals så patient-card-endpoint kan läsa.
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
          encounterId: annotation.encounterId || null,
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

    // POST /api/v1/cco-offers/from-plan — Sprint 19B.3 bridge (plan → offert-draft)
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
          if (!planId) return res.status(400).json({ error: 'planId krävs' });
          const plan = planStore.getById(planId);
          if (!plan) return res.status(404).json({ error: 'plan saknas' });
          if (plan.status === 'converted_to_offer') {
            return res
              .status(409)
              .json({ error: 'plan redan kopplad till offert', existingOfferId: plan.offerId });
          }

          // Bygg auto-items från plan om inte explicit angivet
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
            note: [img.date, img.zone].filter(Boolean).join(' · ') || 'Offertklar bild',
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
            ? `Behandlingsplan ${plan.technique.toUpperCase()}${plan.totalGraftEstimate ? ` · ~${plan.totalGraftEstimate} grafts` : ''}`
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

          // Koppla plan → offert (snapshot av plan-version vid skapandet)
          const updated = await planStore
            .updatePlan({
              planId,
              actor: { userId: req.role?.userId || 'system', role: req.role?.role || 'staff' },
              patch: { providerComment: plan.providerComment }, // no-op patch för att tvinga ny revision om vi vill
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

    // Sprint 19B.3.2 — Offer PDF Preview + Generate
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

    // GET /api/v1/cco-offers/:id/preview.html — HTML-preview för iframe-render
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

    // POST /api/v1/cco-offers/:id/pdf — generera PDF + spara i secure storage + skapa patient_asset
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
              // Skapa patient_asset (best-effort — om assetStore har createAsset/upsert)
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

    // Sprint 19B.3.3 — Secure Customer Link för plan/offert
    // POST /api/v1/cco-portal-links — riskbaserad token via ccoSecurePortalLinkStore
    app.post(
      '/api/v1/cco-portal-links',
      attachRole,
      requireAnyRole(['doctor', 'staff', 'owner']),
      jsonParser,
      async (req, res) => {
        try {
          const { customerId, resourceKind, resourceId, contextNote } = req.body || {};
          if (!customerId || !resourceKind)
            return res.status(400).json({ error: 'customerId + resourceKind krävs' });
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
          // 19E.2 Fix #8A — audit-event på portal_link.created
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

    // 19E.2 Portal Hardening (P0/P1) ───────────────────────────────
    // H1: Rate-limit på /portal/* — 30 req/min/IP, audit på 429
    // H2: Strict security headers (CSP/XCTO/Referrer-Policy) på all portal-HTML
    // H4: Origin-check på POST /portal/upload/:token
    let _portalRateLimiter = null;
    try {
      const { createRateLimiter: _createRateLimiter } = require('./src/security/rateLimit');
      _portalRateLimiter = _createRateLimiter({
        windowMs: 60_000,
        max: 30,
        scope: 'cco.portal',
        message: 'För många försök mot kundlänk. Försök igen om en stund.',
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
      // CSP: ingen JS körs i portal-HTML (allt är server-renderat), bilder via secure storage + data:
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

    // GET /portal/r/:token — patient-facing route (riskklass-validerad)
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
              `<!doctype html><meta charset="utf-8"><title>Länk ${c.error}</title><body style="font-family:system-ui;padding:48px;text-align:center;color:#84756b;background:#faf6f2"><h1>Länken är ${c.error}</h1><p>Kontakta kliniken om du behöver en ny länk.</p></body>`
            );
          return;
        }
        // Bygg minimal patient-facing-vy baserat på resourceKind
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
            // Bygg snygg kundvänlig patient-portal-vy
            const greetings = `Hej ${(customer?.fullName || offer.customerName || '').split(' ')[0] || 'där'}`;
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
              : '<li class="step">Vi förbereder nästa steg. Du hör från oss snart.</li>';
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
                        aftercare_letter: 'Eftervårdsinfo',
                        health_declaration: 'Hälsodeklaration',
                        fitness_certificate: 'Friskförsäkran',
                      }[d.kind] || d.kind;
                    const stateLabel =
                      {
                        missing: 'väntar',
                        drafted: 'snart redo',
                        sent: 'väntar din signering',
                        viewed: 'läst',
                        signed: 'signerad',
                        needs_legal_review: 'väntar juridisk granskning',
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
            // 19F.1 P1d — tydligt NEEDS_LEGAL_REVIEW-banner när templates saknas
            const reviewDocs = (pkg?.documents || []).filter(
              (d) => d.status === 'needs_legal_review'
            );
            const legalBlocker = reviewDocs.length
              ? `<div class="legal-blocker"><span class="legal-badge">⚠️ NEEDS LEGAL REVIEW</span><div class="legal-text"><strong>${reviewDocs.length} dokument väntar på juridisk granskning</strong> innan du kan signera dem digitalt. Vi hör av oss när templates är klara.</div></div>`
              : '';
            const docsBlock = docRowsHtml
              ? `<section class="card"><h3>Dokument</h3>${legalBlocker}<ul class="docs">${docRowsHtml}</ul></section>`
              : '';
            const ribbon =
              offer.state === 'draft' ? '<div class="ribbon">UTKAST · ej bindande</div>' : '';
            const helpLine =
              pkg?.summary?.needsLegalReview && !reviewDocs.length
                ? '<p class="muted">Vissa juridiska dokument är under slutgranskning. Vi hör av oss innan du behöver agera på dem.</p>'
                : '';

            html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Din behandling — Hair TP Clinic</title>
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
  <p class="lead">Här är din behandlingsplan från Hair TP Clinic.</p>

  <section class="card">
    <h3>Din behandling</h3>
    <div class="summary">
      <div class="row"><div class="label">Behandling</div><div class="value">${esc(techLabel || 'Behandling')}</div></div>
      <div class="row"><div class="label">Uppskattat antal</div><div class="value">${esc(grafts || '—')}</div></div>
      <div class="row"><div class="label">Pris totalt</div><div class="value price">${esc(price)}</div></div>
      <div class="row"><div class="label">Giltig till</div><div class="value">${esc(validUntil)}</div></div>
    </div>
  </section>

  ${plan?.providerComment ? `<section class="card"><h3>Behandlarens kommentar</h3><p style="margin:0;font-size:14px">${esc(plan.providerComment)}</p></section>` : ''}

  ${docsBlock}

  <section class="card">
    <h3>Nästa steg</h3>
    <ul class="steps">${nextStepsHtml}</ul>
    ${helpLine}
  </section>

  <div class="safety">
    🔒 Den här länken är personlig och kopplad till din behandling. Du kan stänga sidan och öppna länken igen senare — vi sparar inte ditt personnummer i länken. Vid frågor: <a href="mailto:contact@hairtpclinic.com" style="color:var(--accent);font-weight:700">contact@hairtpclinic.com</a>.
  </div>

  <div class="footer">
    Hair TP Clinic · Vasaplatsen 2, 411 34 Göteborg · 031-88 11 66
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
            // 19F.1 P1c — document_viewed per dokument som visas för kunden
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
              <p>Teknik: <strong>${plan.technique?.toUpperCase() || '—'}</strong></p>
              <p>Antal grafts: <strong>${plan.totalGraftEstimate || '—'}</strong></p>
              ${(plan.areaSpecs || []).length ? `<h3>Områden</h3><ul>${(plan.areaSpecs || []).map((s) => `<li>${s.area} — ${s.estimatedGrafts || '—'} grafts</li>`).join('')}</ul>` : ''}
              ${plan.providerComment ? `<blockquote style="border-left:3px solid #c8821e;padding:8px 14px;background:#fff5e6">${plan.providerComment}</blockquote>` : ''}
              <p style="color:#84756b;font-size:13px;margin-top:24px">Detta är en preview. Inga signeringar är aktiverade ännu (NEEDS_LEGAL_REVIEW).</p>
              </body></html>`;
          }
        } else {
          html = `<!doctype html><body>Resurstyp ${c.resourceKind} stöds inte i preview-portalen ännu.</body>`;
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

    // Sprint 19D.1 — Customer Portal Dashboard
    const { buildCustomerOverview } = require('./src/ops/ccoCustomerJourneyOverview');
    const {
      buildPatientCardSections: _buildPC,
    } = require('./src/ops/ccoPatientCardSectionBuilder');
    const multer = require('multer');
    const customerUpload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    });

    // GET /portal/dashboard/:token — kundens personliga "Min behandling"-sida
    // 19E.2 Fix #4A: peek() istället för consume() — dashboard ska tåla flera besök
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
              `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:48px;text-align:center;color:#84756b;background:#faf6f2"><h1>Länken är ${esc(c.error || 'ogiltig')}</h1><p>Kontakta kliniken för en ny länk.</p></body>`
            );
        }
        // Hämta patient-card-data via stores (bygg en stub om saknad)
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
          done: '✓',
          waiting_clinic: '⏳',
          needs_customer: '!',
          blocked: '✕',
          not_relevant: '·',
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
            ${s.customerActionLabel ? `<span class="step-action">${esc(s.customerActionLabel)} →</span>` : ''}
            ${s.note ? `<span class="step-note">${esc(s.note)}</span>` : ''}
          </li>`
          )
          .join('');

        const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="120"><title>Min behandling — Hair TP Clinic</title>
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
  <p class="lead">Här ser du var i din behandlingsresa hos Hair TP Clinic du står just nu.</p>

  <div class="progress">
    <div style="display:flex;justify-content:space-between;align-items:baseline"><strong style="font-size:14px">Din resa</strong><span style="font-size:24px;font-weight:800;color:#4a8268">${overview.progress.percent}%</span></div>
    <div class="progress-bar"><div class="progress-fill" style="width:${overview.progress.percent}%"></div></div>
    <div class="progress-stats"><span>${overview.progress.done} klart</span><span>${overview.progress.total - overview.progress.notRelevant - overview.progress.done} kvar</span></div>
  </div>

  ${
    overview.nextStep && overview.nextStep.status === 'needs_customer'
      ? `<div class="next-step"><div class="next-step-kicker">Du behöver göra detta</div>${esc(overview.nextStep.label)}${overview.nextStep.customerActionLabel ? ` — ${esc(overview.nextStep.customerActionLabel)}` : ''}</div>`
      : overview.nextStep
        ? `<div class="next-step" style="background:linear-gradient(180deg,#eef7f2,#d8e8de);color:#2c5443"><div class="next-step-kicker" style="color:#366e4e">Vi väntar på</div>${esc(overview.nextStep.label)} (klinik)</div>`
        : ''
  }

  <section class="card">
    <h3>Resans steg</h3>
    <ul class="steps">${stepsHtml}</ul>
  </section>

  ${
    overview.uploadInvitation
      ? `<div class="upload-card"><div style="font-size:24px;margin-bottom:4px">📷</div>${esc(overview.uploadInvitation.label)} — <a href="/portal/upload/${esc(req.params.token)}">öppna kamera</a></div>`
      : ''
  }

  <div class="safety">🔒 Den här sidan är personlig och kopplad till just din behandling. Vi sparar inte ditt personnummer i länken. Sidan uppdateras automatiskt varannan minut. Frågor? Mejla <a href="mailto:contact@hairtpclinic.com" style="color:var(--accent);font-weight:700">contact@hairtpclinic.com</a>.</div>

  <div class="footer">Hair TP Clinic · Vasaplatsen 2, 411 34 Göteborg · 031-88 11 66</div>
</div></body></html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'private, no-store');
        res.send(html);
      } catch (err) {
        console.error('[portal/dashboard]', err);
        res.status(500).send(`<body>${esc(err.message)}</body>`);
      }
    });

    // POST /portal/upload/:token — kund laddar upp egen bild via portal
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
          // Origin-check: skydda mot CSRF från externa sites
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
          if (!req.file) return res.status(400).json({ error: 'file krävs' });
          // Endast asset_upload + low/medium risk får ladda upp
          if (!['low', 'medium'].includes(c.riskClass)) {
            return res.status(403).json({ error: 'token saknar upload-rättighet' });
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

    // 19F.4 Fix #3 — Access restriction (spärrad kund)
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
            return res.status(400).json({ error: 'restricted (boolean) krävs' });
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

    // 19F.4 Fix #1 — Encounter composite (per-besök-grupperade rader)
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

    // 19F.1 P1b — Operator dashboard: kund-events att granska
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
              note: 'ccoCustomerEventStore ej mountat — wire i nästa sprint',
            });
          }
          const grouped = store.listStaffAttentionByCustomer({ sinceMs });
          // Berika med kund-displayName om möjligt (ingen fail om saknas)
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

    // ── CF.2 (MVP 1) — Chief of Finance routes ────────────────────
    // RBAC: owner / finance / revisor. Audit på alla mutationer.
    const cfRBAC = ['owner', 'finance', 'revisor'];
    const cfMutateRBAC = ['owner', 'finance']; // revisor är read-only
    // CF.2-fix 2026-06-01 (BUG-2): använd getActor-helper istället för det
    // gamla pattern som läste actor.userId från req-objekt som attachRole
    // inte sätter. Se CHIEF-OF-FINANCE-MVP1-UAT-2026-06-01.md.
    const { getActor: cfGetActor } = require('./src/security/ccoRbac');

    // GET /api/v1/cco-cf/dashboard — KPI:er + status
    app.get('/api/v1/cco-cf/dashboard', attachRole, requireAnyRole(cfRBAC), async (req, res) => {
      try {
        const actor = cfGetActor(req);
        const { buildFinanceDashboard } = require('./src/ops/ccoFinanceDashboardBuilder');
        const dashboard = await buildFinanceDashboard({
          stores: {
            fortnoxStore: app.locals.ccoFortnoxStore,
            swishStore: app.locals.ccoSwishStore,
            commercialStore: app.locals.ccoCommercialStore,
            receiptStore: app.locals.ccoReceiptStore,
            expenseStore: app.locals.ccoExpenseStore, // CF.3
            ruleStore: app.locals.ccoExpenseRuleStore, // CF.4
            vendorStore: app.locals.ccoFinanceVendorStore, // CF.5
            recurringStore: app.locals.ccoRecurringExpenseStore, // CF.7
            reviewStore: app.locals.ccoFinanceReviewStore, // CF.8
            monthlyCloseStore: app.locals.ccoFinanceMonthlyCloseStore, // CF.9
            fortnoxInvoiceLister: app.locals.ccoFortnoxInvoiceLister,
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
        const store = app.locals.ccoReceiptStore;
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
        const store = app.locals.ccoReceiptStore;
        if (!store) return res.status(503).json({ error: 'receipt store not ready' });
        const r = store.getById(req.params.id);
        if (!r) return res.status(404).json({ error: 'not found' });
        res.json(r);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST /api/v1/cco-cf/receipts/upload — multer 20MB-cap
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
          const store = app.locals.ccoReceiptStore;
          if (!store) return res.status(503).json({ error: 'receipt store not ready' });
          if (!req.file)
            return res.status(400).json({ error: 'file krävs (multipart/form-data field: file)' });
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

    // PATCH /api/v1/cco-cf/receipts/:id — kategorisera/uppdatera metadata
    app.patch(
      '/api/v1/cco-cf/receipts/:id',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const store = app.locals.ccoReceiptStore;
          if (!store) return res.status(503).json({ error: 'receipt store not ready' });
          const actor = cfGetActor(req); // CF.2-fix BUG-2
          const r = await store.updateReceipt({ id: req.params.id, patch: req.body || {}, actor });
          res.json({ ok: true, receipt: r });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/receipts/:id/status — transition (reject/exported/etc)
    app.post(
      '/api/v1/cco-cf/receipts/:id/status',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const store = app.locals.ccoReceiptStore;
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

    // GET /api/v1/cco-cf/receipts/:id/download — secure-storage proxy
    app.get(
      '/api/v1/cco-cf/receipts/:id/download',
      attachRole,
      requireAnyRole(cfRBAC),
      async (req, res) => {
        try {
          const store = app.locals.ccoReceiptStore;
          if (!store) return res.status(503).json({ error: 'receipt store not ready' });
          const r = store.getById(req.params.id);
          if (!r) return res.status(404).json({ error: 'not found' });
          const secure = app.locals.ccoSecureStorage;
          if (!secure?.getObject)
            return res.status(503).json({ error: 'secure storage not ready' });
          // CF.3-fix 2026-06-02: getObject returnerar {stream, buffer, mimeType, size, checksum}
          // — extrahera .buffer. ENOENT om fil saknas på disk → 404.
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

    // ── CF.3 (MVP 2) — Expense routes ─────────────────────────────
    // Manual expense workflow utan Fortnox-write. Audit på alla mutationer.
    const cfMulterExpense = require('multer');
    const cfExpenseUpload = cfMulterExpense({
      storage: cfMulterExpense.memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    });

    // GET /api/v1/cco-cf/expenses — lista + filter
    app.get('/api/v1/cco-cf/expenses', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const store = app.locals.ccoExpenseStore;
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
        const store = app.locals.ccoExpenseStore;
        if (!store) return res.status(503).json({ error: 'expense store not ready' });
        const e = store.getById(req.params.id);
        if (!e) return res.status(404).json({ error: 'not found' });
        res.json(e);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST /api/v1/cco-cf/expenses — skapa (från receipt eller fristående)
    app.post(
      '/api/v1/cco-cf/expenses',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const store = app.locals.ccoExpenseStore;
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

          // CF.5: vendor-match först — länka supplierId + recordMatched
          const vendorStore = app.locals.ccoFinanceVendorStore;
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

          // CF.4: kör rule engine om expense saknar category — föreslå utan att applicera.
          const ruleStore = app.locals.ccoExpenseRuleStore;
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

              // CF.5: om ingen rule-bestMatch men en vendor är länkad med defaults,
              // bygg en vendor-baserad suggestion. Confidence från vendor-match.
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
                  vendorFields.notes = existing ? `${existing} · ${v.defaultNote}` : v.defaultNote;
                }
                if (Object.keys(vendorFields).length > 0) {
                  finalSuggestion = {
                    ...ruleSuggestion,
                    bestMatch: {
                      ruleId: null,
                      ruleName: `Leverantörs-default: ${v.name}`,
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

          // CF.7: match mot active recurring-mallar → länka + audit + anomalies
          const recStore = app.locals.ccoRecurringExpenseStore;
          if (recStore && expense.supplier) {
            try {
              const match = recStore.findMatchingRecurring(expense);
              if (match && match.matched) {
                // Detektera anomalies BEFORE recording match (så amount-deviation upptäcks)
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

          // CF.6: VAT-suggestion baserat på category + supplierId-defaults + vatRatePercent
          if (!expense.vatMode) {
            try {
              const { suggestVatMode } = require('./src/ops/ccoExpenseVatRules');
              const sug = suggestVatMode({
                category: expense.category,
                vatRatePercent: expense.vatRatePercent,
                supplierCountry: 'SE', // framtida: hämta från vendor.country
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

    // PATCH /api/v1/cco-cf/expenses/:id — uppdatera metadata/kategori
    app.patch(
      '/api/v1/cco-cf/expenses/:id',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const store = app.locals.ccoExpenseStore;
          if (!store) return res.status(503).json({ error: 'expense store not ready' });
          // CF.9: blockera mutation om expense.date faller i en stängd period
          const closeStore = app.locals.ccoFinanceMonthlyCloseStore;
          const existing = store.getById?.(req.params.id);
          if (closeStore && existing?.date && closeStore.isDateInLockedPeriod(existing.date)) {
            return res.status(423).json({
              error: `Perioden ${String(existing.date).slice(0, 7)} är låst (closed). Owner måste reopen perioden för att ändra.`,
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

    // POST /api/v1/cco-cf/expenses/:id/status — transition
    app.post(
      '/api/v1/cco-cf/expenses/:id/status',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const store = app.locals.ccoExpenseStore;
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

    // POST /api/v1/cco-cf/expenses/:id/attachment — extra bilaga
    app.post(
      '/api/v1/cco-cf/expenses/:id/attachment',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      cfExpenseUpload.single('file'),
      async (req, res) => {
        try {
          const store = app.locals.ccoExpenseStore;
          if (!store) return res.status(503).json({ error: 'expense store not ready' });
          if (!req.file) return res.status(400).json({ error: 'file krävs' });
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

    // POST /api/v1/cco-cf/expenses/export — bygg export-paket (CSV+JSON) utan Fortnox
    app.post(
      '/api/v1/cco-cf/expenses/export',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const store = app.locals.ccoExpenseStore;
          const secure = app.locals.ccoSecureStorage;
          if (!store) return res.status(503).json({ error: 'expense store not ready' });
          if (!secure?.putObject)
            return res.status(503).json({ error: 'secure storage not ready' });
          const actor = cfGetActor(req);
          const { buildExpenseExportPackage } = require('./src/ops/ccoExpenseExporter');
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

    // GET /api/v1/cco-cf/expenses/export/:batchId/:fileType — ladda ner export-fil
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
            return res.status(400).json({ error: 'fileType måste vara csv eller json' });
          // CF.3-fix 2026-06-02: getObject returnerar {stream, buffer, mimeType, ...}
          // VIKTIG: använd UTC-månader. Exporterns ym=new Date().toISOString().slice(0,7)
          // är UTC. Local Date-konstruktor + toISOString shiftar månaden bakåt i positiva
          // tidszoner (t.ex. Stockholm) första dagen i månaden.
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

    // ── CF.4 (MVP 3) — Expense Rule Engine routes ────────────────
    // Auto-categorization utan AI. Human approval krävs alltid — engine
    // sätter aldrig fält direkt på expense.

    // GET /api/v1/cco-cf/rules — lista
    app.get('/api/v1/cco-cf/rules', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const rs = app.locals.ccoExpenseRuleStore;
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
        const rs = app.locals.ccoExpenseRuleStore;
        if (!rs) return res.status(503).json({ error: 'rule store not ready' });
        const r = rs.getById(req.params.id);
        if (!r) return res.status(404).json({ error: 'not found' });
        res.json(r);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST /api/v1/cco-cf/rules — skapa
    app.post(
      '/api/v1/cco-cf/rules',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const rs = app.locals.ccoExpenseRuleStore;
          if (!rs) return res.status(503).json({ error: 'rule store not ready' });
          const rule = await rs.createRule({ actor: cfGetActor(req), input: req.body || {} });
          res.json({ ok: true, rule });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // PATCH /api/v1/cco-cf/rules/:id — uppdatera
    app.patch(
      '/api/v1/cco-cf/rules/:id',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const rs = app.locals.ccoExpenseRuleStore;
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

    // DELETE /api/v1/cco-cf/rules/:id — radera
    app.delete(
      '/api/v1/cco-cf/rules/:id',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      async (req, res) => {
        try {
          const rs = app.locals.ccoExpenseRuleStore;
          if (!rs) return res.status(503).json({ error: 'rule store not ready' });
          const out = await rs.deleteRule({ id: req.params.id, actor: cfGetActor(req) });
          res.json(out);
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/rules/test — dry-run: kör regler mot ett expense-objekt eller mot existerande
    app.post(
      '/api/v1/cco-cf/rules/test',
      attachRole,
      requireAnyRole(cfRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const rs = app.locals.ccoExpenseRuleStore;
          const exStore = app.locals.ccoExpenseStore;
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
            return res.status(400).json({ error: 'expense eller expenseId krävs' });
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
          const exStore = app.locals.ccoExpenseStore;
          const ruleStore = app.locals.ccoExpenseRuleStore;
          const vendorStore = app.locals.ccoFinanceVendorStore;
          if (!exStore) return res.status(503).json({ error: 'expense store not ready' });
          const actor = cfGetActor(req);
          // Snappa upp suggestion innan approve, för att veta vendor-koppling
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
          // räkna upp vendor.timesUsed
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
          const exStore = app.locals.ccoExpenseStore;
          const ruleStore = app.locals.ccoExpenseRuleStore;
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

    // POST /api/v1/cco-cf/expenses/:id/save-as-rule — skapa ny rule från expense-fält
    app.post(
      '/api/v1/cco-cf/expenses/:id/save-as-rule',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const exStore = app.locals.ccoExpenseStore;
          const ruleStore = app.locals.ccoExpenseRuleStore;
          if (!exStore || !ruleStore) return res.status(503).json({ error: 'stores not ready' });
          const e = exStore.getById(req.params.id);
          if (!e) return res.status(404).json({ error: 'expense finns ej' });
          const body = req.body && typeof req.body === 'object' ? req.body : {};
          const supplier = body.supplier || e.supplier;
          if (!supplier)
            return res.status(400).json({ error: 'supplier krävs (på expense eller body)' });
          const ruleInput = {
            name: body.name || `Regel: ${supplier}${e.category ? ' → ' + e.category : ''}`,
            description: body.description || `Skapad från expense ${e.id}`,
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

    // ── CF.5 (MVP 4) — Finance Vendor Register routes ────────────
    // Leverantörsregister för ekonomi. Inte att förväxla med ccoVendorRegister
    // (PUB-avtal/databehandlare för GDPR Art.28/30).

    // GET /api/v1/cco-cf/suppliers — lista med filter
    app.get('/api/v1/cco-cf/suppliers', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const vs = app.locals.ccoFinanceVendorStore;
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
        const vs = app.locals.ccoFinanceVendorStore;
        if (!vs) return res.status(503).json({ error: 'vendor store not ready' });
        const v = vs.getById(req.params.id);
        if (!v) return res.status(404).json({ error: 'not found' });
        res.json(v);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST /api/v1/cco-cf/suppliers — skapa
    app.post(
      '/api/v1/cco-cf/suppliers',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const vs = app.locals.ccoFinanceVendorStore;
          if (!vs) return res.status(503).json({ error: 'vendor store not ready' });
          const vendor = await vs.createVendor({ actor: cfGetActor(req), input: req.body || {} });
          res.json({ ok: true, vendor });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // PATCH /api/v1/cco-cf/suppliers/:id — uppdatera
    app.patch(
      '/api/v1/cco-cf/suppliers/:id',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const vs = app.locals.ccoFinanceVendorStore;
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
          const vs = app.locals.ccoFinanceVendorStore;
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
          const vs = app.locals.ccoFinanceVendorStore;
          if (!vs) return res.status(503).json({ error: 'vendor store not ready' });
          const vendor = await vs.activateVendor({ id: req.params.id, actor: cfGetActor(req) });
          res.json({ ok: true, vendor });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/suppliers/match — testa vendor-match mot supplier-string
    app.post(
      '/api/v1/cco-cf/suppliers/match',
      attachRole,
      requireAnyRole(cfRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const vs = app.locals.ccoFinanceVendorStore;
          if (!vs) return res.status(503).json({ error: 'vendor store not ready' });
          const sup = req.body?.supplier;
          if (!sup) return res.status(400).json({ error: 'supplier krävs' });
          const match = vs.findBySupplierName(sup);
          res.json({ ok: true, match });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/expenses/:id/link-supplier — manuell länk
    app.post(
      '/api/v1/cco-cf/expenses/:id/link-supplier',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const exStore = app.locals.ccoExpenseStore;
          const vendorStore = app.locals.ccoFinanceVendorStore;
          if (!exStore) return res.status(503).json({ error: 'expense store not ready' });
          const supplierId = req.body?.supplierId;
          if (!supplierId) return res.status(400).json({ error: 'supplierId krävs' });
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

    // POST /api/v1/cco-cf/suppliers/:id/link-rule — koppla en regel till en vendor
    app.post(
      '/api/v1/cco-cf/suppliers/:id/link-rule',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const vs = app.locals.ccoFinanceVendorStore;
          const ruleStore = app.locals.ccoExpenseRuleStore;
          if (!vs) return res.status(503).json({ error: 'vendor store not ready' });
          const ruleId = req.body?.ruleId;
          if (!ruleId) return res.status(400).json({ error: 'ruleId krävs' });
          if (ruleStore && !ruleStore.getById(ruleId))
            return res.status(404).json({ error: 'rule finns ej' });
          const vendor = await vs.linkRule({ id: req.params.id, ruleId, actor: cfGetActor(req) });
          res.json({ ok: true, vendor });
        } catch (err) {
          res.status(400).json({ error: err.message });
        }
      }
    );

    // ── CF.6 (MVP 5) — VAT-rules routes ──────────────────────────
    // Manuell vat-mode-set + suggestion approve

    // GET /api/v1/cco-cf/vat-modes — enum-list för UI
    app.get('/api/v1/cco-cf/vat-modes', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const {
          VALID_VAT_MODES,
          VAT_MODE_LABELS,
          CATEGORY_DEFAULT_VAT_MODE,
        } = require('./src/ops/ccoExpenseVatRules');
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

    // POST /api/v1/cco-cf/expenses/:id/vat — sätt vatMode (godkänner samtidigt)
    app.post(
      '/api/v1/cco-cf/expenses/:id/vat',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const exStore = app.locals.ccoExpenseStore;
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

    // POST /api/v1/cco-cf/expenses/:id/vat/suggest — kör suggestVatMode + spara
    app.post(
      '/api/v1/cco-cf/expenses/:id/vat/suggest',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      async (req, res) => {
        try {
          const exStore = app.locals.ccoExpenseStore;
          if (!exStore) return res.status(503).json({ error: 'expense store not ready' });
          const e = exStore.getById(req.params.id);
          if (!e) return res.status(404).json({ error: 'expense finns ej' });
          const { suggestVatMode } = require('./src/ops/ccoExpenseVatRules');
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

    // ── CF.7 (MVP 6) — Recurring Expense routes ──────────────────
    // GET /api/v1/cco-cf/recurring — lista
    app.get('/api/v1/cco-cf/recurring', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const rs = app.locals.ccoRecurringExpenseStore;
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
        const rs = app.locals.ccoRecurringExpenseStore;
        if (!rs) return res.status(503).json({ error: 'recurring store not ready' });
        const r = rs.getById(req.params.id);
        if (!r) return res.status(404).json({ error: 'not found' });
        res.json(r);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST /api/v1/cco-cf/recurring — skapa manuell
    app.post(
      '/api/v1/cco-cf/recurring',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const rs = app.locals.ccoRecurringExpenseStore;
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
          const rs = app.locals.ccoRecurringExpenseStore;
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

    // POST /api/v1/cco-cf/recurring/:id/status — transition
    app.post(
      '/api/v1/cco-cf/recurring/:id/status',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const rs = app.locals.ccoRecurringExpenseStore;
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

    // POST /api/v1/cco-cf/recurring/detect — kör auto-detection mot historiska expenses
    app.post(
      '/api/v1/cco-cf/recurring/detect',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const rs = app.locals.ccoRecurringExpenseStore;
          const exStore = app.locals.ccoExpenseStore;
          if (!rs || !exStore) return res.status(503).json({ error: 'stores not ready' });
          const expenses = exStore.listExpenses({ limit: 1000 });
          const existing = rs.listRecurrings({ limit: 1000 });
          const proposals = rs.detectRecurringFromHistory({
            expenses,
            existingRecurrings: existing,
          });
          // Spara förslag som proposed (om body.save=true)
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

    // POST /api/v1/cco-cf/expenses/:id/link-recurring — manuell länk
    app.post(
      '/api/v1/cco-cf/expenses/:id/link-recurring',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const exStore = app.locals.ccoExpenseStore;
          const recStore = app.locals.ccoRecurringExpenseStore;
          if (!exStore) return res.status(503).json({ error: 'expense store not ready' });
          const recurringId = req.body?.recurringExpenseId;
          if (!recurringId) return res.status(400).json({ error: 'recurringExpenseId krävs' });
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

    // ── CF.8 (MVP 7) — Accountant Review Portal routes ───────────
    // Revisor får läsa allt + skriva på review-objekt (men aldrig original-expense).

    // GET /api/v1/cco-cf/review/exports — lista alla export-batches m. review-status
    app.get('/api/v1/cco-cf/review/exports', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const exStore = app.locals.ccoExpenseStore;
        const revStore = app.locals.ccoFinanceReviewStore;
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

    // GET /api/v1/cco-cf/review/exports/:batchId — full detalj
    app.get(
      '/api/v1/cco-cf/review/exports/:batchId',
      attachRole,
      requireAnyRole(cfRBAC),
      async (req, res) => {
        try {
          const exStore = app.locals.ccoExpenseStore;
          const revStore = app.locals.ccoFinanceReviewStore;
          const receiptStore = app.locals.ccoReceiptStore;
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
          const revStore = app.locals.ccoFinanceReviewStore;
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
          const revStore = app.locals.ccoFinanceReviewStore;
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
          const exStore = app.locals.ccoExpenseStore;
          const receiptStore = app.locals.ccoReceiptStore;
          const revStore = app.locals.ccoFinanceReviewStore;
          const secure = app.locals.ccoSecureStorage;
          if (!exStore || !revStore || !secure)
            return res.status(503).json({ error: 'stores not ready' });
          const { buildReviewPackage } = require('./src/ops/ccoFinanceReviewPackager');
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
          const revStore = app.locals.ccoFinanceReviewStore;
          const secure = app.locals.ccoSecureStorage;
          if (!revStore || !secure?.getObject)
            return res.status(503).json({ error: 'stores not ready' });
          const review = revStore.getByBatchId(req.params.batchId);
          if (!review || !review.manifestKey)
            return res.status(404).json({ error: 'manifest finns ej (kör build-package först)' });
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

    // GET /api/v1/cco-cf/review/exports/:batchId/attachment/:receiptId — secure download
    app.get(
      '/api/v1/cco-cf/review/exports/:batchId/attachment/:receiptId',
      attachRole,
      requireAnyRole(cfRBAC),
      async (req, res) => {
        try {
          const exStore = app.locals.ccoExpenseStore;
          const receiptStore = app.locals.ccoReceiptStore;
          const revStore = app.locals.ccoFinanceReviewStore;
          const secure = app.locals.ccoSecureStorage;
          if (!exStore || !receiptStore || !revStore || !secure?.getObject)
            return res.status(503).json({ error: 'stores not ready' });
          // Verifiera att receipt är länkad till en expense i batchen
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

    // ─────────────────────────────────────────────────────────────
    // CF.9 (MVP 8) — Finance Reports + Monthly Close
    // ─────────────────────────────────────────────────────────────
    const cfReviewerRBAC = ['owner', 'revisor']; // approve/correct/close/begin-review
    const cfOwnerOnlyRBAC = ['owner']; // reopen

    function cfBuildReportData() {
      const expStore = app.locals.ccoExpenseStore;
      const receiptStore = app.locals.ccoReceiptStore;
      const vendorStore = app.locals.ccoFinanceVendorStore;
      const recurringStore = app.locals.ccoRecurringExpenseStore;
      const reviewStore = app.locals.ccoFinanceReviewStore;
      return {
        expenses: expStore?.listExpenses?.({ limit: 5000 }) || [],
        receipts: receiptStore?.listReceipts?.({ limit: 5000 }) || [],
        vendors: vendorStore?.listVendors?.({ limit: 2000 }) || [],
        recurrings: recurringStore?.listRecurrings?.({ limit: 2000 }) || [],
        reviews: reviewStore?.listReviews?.({ limit: 2000 }) || [],
        exportBatches: expStore?.listExportBatches?.({ limit: 500 }) || [],
      };
    }

    // GET /api/v1/cco-cf/reports — lista tillgängliga rapport-typer + meta
    app.get('/api/v1/cco-cf/reports', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const { VALID_REPORT_KINDS } = require('./src/ops/ccoFinanceReportEngine');
        return res.json({
          ok: true,
          availableKinds: VALID_REPORT_KINDS,
          fortnoxStatus: 'BLOCKED_INTEGRATION',
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST /api/v1/cco-cf/reports/generate — generera rapport (no persistence)
    app.post(
      '/api/v1/cco-cf/reports/generate',
      attachRole,
      requireAnyRole(cfRBAC),
      jsonParser,
      (req, res) => {
        try {
          const { generateReport } = require('./src/ops/ccoFinanceReportEngine');
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
            err.message?.startsWith('Okänd') || err.message?.startsWith('Ogiltig') ? 400 : 500;
          res.status(code).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/reports/package — generera + spara till secure storage
    app.post(
      '/api/v1/cco-cf/reports/package',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const { buildReportPackage } = require('./src/ops/ccoFinanceReportPackager');
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
            err.message?.startsWith('Okänd') || err.message?.startsWith('Ogiltig') ? 400 : 500;
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
          const { downloadFromPackage } = require('./src/ops/ccoFinanceReportPackager');
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

    // ── Periods (monthly close) ──────────────────────────────────

    // GET /api/v1/cco-cf/periods — lista perioder
    app.get('/api/v1/cco-cf/periods', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const store = app.locals.ccoFinanceMonthlyCloseStore;
        if (!store) return res.status(503).json({ error: 'monthly close store not ready' });
        const periods = store.listPeriods({ limit: 100 });
        return res.json({ ok: true, periods, summary: store.summary() });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /api/v1/cco-cf/periods/:periodId — detail + checklist
    app.get('/api/v1/cco-cf/periods/:periodId', attachRole, requireAnyRole(cfRBAC), (req, res) => {
      try {
        const store = app.locals.ccoFinanceMonthlyCloseStore;
        if (!store) return res.status(503).json({ error: 'monthly close store not ready' });
        const periodId = req.params.periodId;
        const period = store.getPeriod(periodId) || store.getOrInitPeriod(periodId);
        const checklist = store.evaluateChecklist({
          periodId,
          stores: {
            expenseStore: app.locals.ccoExpenseStore,
            receiptStore: app.locals.ccoReceiptStore,
            recurringStore: app.locals.ccoRecurringExpenseStore,
            reviewStore: app.locals.ccoFinanceReviewStore,
          },
        });
        return res.json({ ok: true, period, checklist });
      } catch (err) {
        const code = err.message?.startsWith('Ogiltig') ? 400 : 500;
        res.status(code).json({ error: err.message });
      }
    });

    // POST /api/v1/cco-cf/periods/:periodId/start-close — finance/owner
    app.post(
      '/api/v1/cco-cf/periods/:periodId/start-close',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const store = app.locals.ccoFinanceMonthlyCloseStore;
          if (!store) return res.status(503).json({ error: 'monthly close store not ready' });
          const actor = cfGetActor(req);
          const period = await store.startClose({ periodId: req.params.periodId, actor });
          return res.json({ ok: true, period });
        } catch (err) {
          res.status(err.statusCode || 400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/periods/:periodId/ready-for-review — finance/owner
    app.post(
      '/api/v1/cco-cf/periods/:periodId/ready-for-review',
      attachRole,
      requireAnyRole(cfMutateRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const store = app.locals.ccoFinanceMonthlyCloseStore;
          if (!store) return res.status(503).json({ error: 'monthly close store not ready' });
          const actor = cfGetActor(req);
          const period = await store.markReadyForReview({ periodId: req.params.periodId, actor });
          return res.json({ ok: true, period });
        } catch (err) {
          res.status(err.statusCode || 400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/periods/:periodId/request-correction — owner/revisor
    app.post(
      '/api/v1/cco-cf/periods/:periodId/request-correction',
      attachRole,
      requireAnyRole(cfReviewerRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const store = app.locals.ccoFinanceMonthlyCloseStore;
          if (!store) return res.status(503).json({ error: 'monthly close store not ready' });
          const actor = cfGetActor(req);
          const reason = String(req.body?.reason || '').trim();
          if (!reason) return res.status(400).json({ error: 'reason krävs' });
          const period = await store.requestCorrection({
            periodId: req.params.periodId,
            actor,
            reason,
          });
          return res.json({ ok: true, period });
        } catch (err) {
          res.status(err.statusCode || 400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/periods/:periodId/approve — owner/revisor
    app.post(
      '/api/v1/cco-cf/periods/:periodId/approve',
      attachRole,
      requireAnyRole(cfReviewerRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const store = app.locals.ccoFinanceMonthlyCloseStore;
          if (!store) return res.status(503).json({ error: 'monthly close store not ready' });
          const actor = cfGetActor(req);
          const period = await store.approve({ periodId: req.params.periodId, actor });
          return res.json({ ok: true, period });
        } catch (err) {
          res.status(err.statusCode || 400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/periods/:periodId/close — owner/revisor
    app.post(
      '/api/v1/cco-cf/periods/:periodId/close',
      attachRole,
      requireAnyRole(cfReviewerRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const store = app.locals.ccoFinanceMonthlyCloseStore;
          if (!store) return res.status(503).json({ error: 'monthly close store not ready' });
          const actor = cfGetActor(req);
          const period = await store.close({ periodId: req.params.periodId, actor });
          return res.json({ ok: true, period });
        } catch (err) {
          res.status(err.statusCode || 400).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-cf/periods/:periodId/reopen — OWNER ONLY (kräver reason)
    app.post(
      '/api/v1/cco-cf/periods/:periodId/reopen',
      attachRole,
      requireAnyRole(cfOwnerOnlyRBAC),
      jsonParser,
      async (req, res) => {
        try {
          const store = app.locals.ccoFinanceMonthlyCloseStore;
          if (!store) return res.status(503).json({ error: 'monthly close store not ready' });
          const actor = cfGetActor(req);
          const reason = String(req.body?.reason || '').trim();
          if (!reason) return res.status(400).json({ error: 'reason krävs vid reopen' });
          const period = await store.reopen({ periodId: req.params.periodId, actor, reason });
          return res.json({ ok: true, period });
        } catch (err) {
          res.status(err.statusCode || 400).json({ error: err.message });
        }
      }
    );

    console.log(
      '[cco-cf] monterad: dashboard + receipts + expenses + CF.4 rules + CF.5 vendors + CF.6 vat + CF.7 recurring + CF.8 review + CF.9 reports/monthly-close (RBAC: owner/finance/revisor)'
    );
  } catch (err) {
    console.warn('[cco-photo-annot+plans] kunde inte montera:', err.message);
  }
})();

// ── CCO Incident Log Store (Sprint 19A.1 #44) ────────────────────
// GDPR Art. 33-34 + Insatts XLSX-mall (16 kolumner).
(async () => {
  try {
    const { createCcoIncidentLogStore } = require('./src/ops/ccoIncidentLogStore');
    const { attachRole, requireAnyRole } = require('./src/security/ccoRbac');
    const express = require('express');
    const jsonParser = express.json({ limit: '32kb' });

    const store = await createCcoIncidentLogStore({
      filePath: path.join(__dirname, 'data', 'cco-incident-log.json'),
      auditLog: ccoAuditLog,
      secureStorage: app.locals.ccoSecureStorage || null,
    });
    app.locals.ccoIncidentLogStore = store;

    // RBAC: bara DPO + owner + revisor
    const RBAC = ['owner', 'dpo', 'revisor'];

    app.post(
      '/api/v1/cco-incidents',
      attachRole,
      requireAnyRole(RBAC),
      jsonParser,
      async (req, res) => {
        try {
          const actor = { userId: req.role?.userId || 'unknown', role: req.role?.role || 'staff' };
          const r = await store.createIncident({ ...req.body, actor });
          res.json(r);
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );
    app.patch(
      '/api/v1/cco-incidents/:id',
      attachRole,
      requireAnyRole(RBAC),
      jsonParser,
      async (req, res) => {
        try {
          const actor = { userId: req.role?.userId || 'unknown', role: req.role?.role || 'staff' };
          const r = await store.updateIncident({
            incidentId: req.params.id,
            actor,
            patch: req.body,
          });
          res.json(r);
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );
    app.post(
      '/api/v1/cco-incidents/:id/status',
      attachRole,
      requireAnyRole(RBAC),
      jsonParser,
      async (req, res) => {
        try {
          const actor = { userId: req.role?.userId || 'unknown', role: req.role?.role || 'staff' };
          const r = await store.transitionStatus({
            incidentId: req.params.id,
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
    app.post(
      '/api/v1/cco-incidents/:id/mitigation',
      attachRole,
      requireAnyRole(RBAC),
      jsonParser,
      async (req, res) => {
        try {
          const actor = { userId: req.role?.userId || 'unknown', role: req.role?.role || 'staff' };
          const r = await store.addMitigationAction({
            incidentId: req.params.id,
            actor,
            action: req.body.action,
          });
          res.json(r);
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );
    app.post(
      '/api/v1/cco-incidents/:id/imy-notified',
      attachRole,
      requireAnyRole(RBAC),
      jsonParser,
      async (req, res) => {
        try {
          const actor = { userId: req.role?.userId || 'unknown', role: req.role?.role || 'staff' };
          const r = await store.markImyNotified({
            incidentId: req.params.id,
            actor,
            referenceNumber: req.body.referenceNumber,
            sentAt: req.body.sentAt,
          });
          res.json(r);
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );
    app.get('/api/v1/cco-incidents', attachRole, requireAnyRole(RBAC), (req, res) => {
      res.json({ incidents: store.listAll(), imyImminent: store.listImyDeadlineImminent(24) });
    });
    app.get('/api/v1/cco-incidents/:id', attachRole, requireAnyRole(RBAC), (req, res) => {
      const i = store.getById(req.params.id);
      if (!i) return res.status(404).json({ error: 'not found' });
      res.json(i);
    });
    app.get(
      '/api/v1/cco-incidents/export/report',
      attachRole,
      requireAnyRole(['owner', 'revisor']),
      (req, res) => {
        res.json(store.exportReport({ since: req.query.since, until: req.query.until }));
      }
    );
    console.log('[cco-incidents] monterad: POST/PATCH/GET /api/v1/cco-incidents');
  } catch (err) {
    console.warn('[cco-incidents] kunde inte montera:', err.message);
  }
})();

// ── CCO DSR Store (Sprint 19A.2 #45) — GDPR Subject Data Request ──
(async () => {
  try {
    const { createCcoDsrStore } = require('./src/ops/ccoDsrStore');
    const { attachRole, requireAnyRole } = require('./src/security/ccoRbac');
    const express = require('express');
    const jsonParser = express.json({ limit: '32kb' });

    const store = await createCcoDsrStore({
      filePath: path.join(__dirname, 'data', 'cco-dsr.json'),
      auditLog: ccoAuditLog,
      secureStorage: app.locals.ccoSecureStorage || null,
    });
    app.locals.ccoDsrStore = store;
    const RBAC = ['owner', 'dpo', 'staff'];

    app.post('/api/v1/cco-dsr', attachRole, requireAnyRole(RBAC), jsonParser, async (req, res) => {
      try {
        const actor = { userId: req.role?.userId || 'unknown', role: req.role?.role || 'staff' };
        res.json(await store.createRequest({ ...req.body, actor }));
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    });
    app.post(
      '/api/v1/cco-dsr/:id/verify-identity',
      attachRole,
      requireAnyRole(RBAC),
      jsonParser,
      async (req, res) => {
        try {
          res.json(
            await store.verifyIdentity({
              dsrId: req.params.id,
              actor: { userId: req.role?.userId, role: req.role?.role },
              ...req.body,
            })
          );
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );
    app.post(
      '/api/v1/cco-dsr/:id/extend-deadline',
      attachRole,
      requireAnyRole(RBAC),
      jsonParser,
      async (req, res) => {
        try {
          res.json(
            await store.extendDeadline({
              dsrId: req.params.id,
              actor: { userId: req.role?.userId, role: req.role?.role },
              ...req.body,
            })
          );
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );
    app.post(
      '/api/v1/cco-dsr/:id/pdl-block',
      attachRole,
      requireAnyRole(RBAC),
      jsonParser,
      async (req, res) => {
        try {
          res.json(
            await store.recordPdlBlock({
              dsrId: req.params.id,
              actor: { userId: req.role?.userId, role: req.role?.role },
              ...req.body,
            })
          );
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );
    app.post(
      '/api/v1/cco-dsr/:id/status',
      attachRole,
      requireAnyRole(RBAC),
      jsonParser,
      async (req, res) => {
        try {
          res.json(
            await store.transitionStatus({
              dsrId: req.params.id,
              actor: { userId: req.role?.userId, role: req.role?.role },
              status: req.body.status,
              reason: req.body.reason,
            })
          );
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );
    // 19F.4 Fix #4 — Bygg GDPR-export-bundle och attacha till DSR
    app.post(
      '/api/v1/cco-dsr/:id/build-export-zip',
      attachRole,
      requireAnyRole(['owner', 'dpo']),
      jsonParser,
      async (req, res) => {
        try {
          const dsr = store.getById(req.params.id);
          if (!dsr) return res.status(404).json({ error: 'dsr not found' });
          const includePhotoBytes = !!req.body?.includePhotoBytes;
          const { buildDsrExport } = require('./src/ops/ccoDsrExportBuilder');
          const actor = { userId: req.role?.userId || 'unknown', role: req.role?.role || 'dpo' };
          const bundleResult = await buildDsrExport({
            customerId: dsr.customerId,
            dsrId: dsr.dsrId || req.params.id,
            actor,
            includePhotoBytes,
            stores: {
              customerStore: app.locals.ccoCustomerStore || app.locals.ccoPatientMasterStore,
              journalStore: app.locals.ccoJournalStore,
              assetStore: app.locals.ccoPatientAssetStore,
              agreementStore: app.locals.ccoAgreementQuickStore,
              offerStore: app.locals.ccoOfferQuickStore,
              consentStore: app.locals.ccoPhotoConsentStore,
              eventStore: app.locals.ccoCustomerEventStore,
              secureStorage: app.locals.ccoSecureStorage,
            },
          });
          // Attacha bundle som response-paket på DSR (skapar inte ny secure-storage-skrivning)
          try {
            await store.attachResponsePackage({
              dsrId: req.params.id,
              actor,
              buffer: Buffer.from(
                JSON.stringify({
                  bundlePath: bundleResult.bundlePath,
                  sha256: bundleResult.bundleSha256,
                  sizeBytes: bundleResult.sizeBytes,
                  counts: bundleResult.counts,
                }),
                'utf8'
              ),
              filename: `dsr-export-${req.params.id}.manifest.json`,
              mimeType: 'application/json',
              delivery: 'portal_download',
            });
          } catch (err) {
            /* attach är best-effort */
          }
          // Skapa portal-link för 7 dagar med risk=high (kund-läs)
          let portalLink = null;
          try {
            const portalLinkStore = app.locals.ccoSecurePortalLinkStore;
            if (portalLinkStore) {
              portalLink = await portalLinkStore.createLink({
                customerId: dsr.customerId,
                resourceKind: 'dsr_export', // 19F.5: dedicerat högt-risk resourceKind
                resourceId: bundleResult.bundlePath,
                actor,
                contextNote: `DSR-export ${req.params.id}`,
              });
            }
          } catch (err) {
            /* portal-link är best-effort */
          }
          try {
            ccoAuditLog?.append?.({
              kind: 'dsr.export_built',
              surface: 'cco.dsr',
              ts: new Date().toISOString(),
              actor,
              target: { kind: 'dsr', id: req.params.id },
              detail: {
                customerId: dsr.customerId,
                bundlePath: bundleResult.bundlePath,
                sha256: bundleResult.bundleSha256,
                sizeBytes: bundleResult.sizeBytes,
                counts: bundleResult.counts,
                includePhotoBytes,
              },
            });
          } catch {}
          res.json({
            ok: true,
            ...bundleResult,
            portalLink: portalLink
              ? {
                  linkId: portalLink.linkId,
                  urlPathHint: portalLink.urlPathHint,
                  expiresAt: portalLink.expiresAt,
                }
              : null,
          });
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      }
    );
    console.log('[cco-dsr/build-export-zip] monterad: POST /api/v1/cco-dsr/:id/build-export-zip');
    app.get('/api/v1/cco-dsr', attachRole, requireAnyRole(RBAC), (req, res) => {
      res.json({
        requests: store.listAll(),
        overdue: store.listOverdue(),
        imminent: store.listImminent(72),
      });
    });
    app.get('/api/v1/cco-dsr/:id', attachRole, requireAnyRole(RBAC), (req, res) => {
      const r = store.getById(req.params.id);
      if (!r) return res.status(404).json({ error: 'not found' });
      res.json(r);
    });
    console.log('[cco-dsr] monterad: POST/GET /api/v1/cco-dsr');
  } catch (err) {
    console.warn('[cco-dsr] kunde inte montera:', err.message);
  }
})();

// ── CCO DataFlow Map Store (Sprint 19A.3 #46) — Art. 30-register ──
(async () => {
  try {
    const { createCcoDataFlowMapStore } = require('./src/ops/ccoDataFlowMapStore');
    const { attachRole, requireAnyRole } = require('./src/security/ccoRbac');
    const express = require('express');
    const jsonParser = express.json({ limit: '64kb' });

    const store = await createCcoDataFlowMapStore({
      filePath: path.join(__dirname, 'data', 'cco-dataflow-map.json'),
      auditLog: ccoAuditLog,
    });
    app.locals.ccoDataFlowMapStore = store;
    const RBAC = ['owner', 'dpo', 'revisor'];

    app.get('/api/v1/cco-dataflow', attachRole, requireAnyRole(RBAC), (req, res) => {
      res.json({
        systems: store.listSystems(),
        flows: store.listFlows(),
        needsLegalReview: store.listNeedsLegalReview(),
      });
    });
    app.get('/api/v1/cco-dataflow/export/art30', attachRole, requireAnyRole(RBAC), (req, res) => {
      res.json(store.exportArt30Register());
    });
    app.post(
      '/api/v1/cco-dataflow/systems/:id',
      attachRole,
      requireAnyRole(RBAC),
      jsonParser,
      async (req, res) => {
        try {
          res.json(
            await store.upsertSystem(req.params.id, req.body, {
              userId: req.role?.userId,
              role: req.role?.role,
            })
          );
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );
    app.post(
      '/api/v1/cco-dataflow/flows',
      attachRole,
      requireAnyRole(RBAC),
      jsonParser,
      async (req, res) => {
        try {
          res.json(
            await store.addFlow({
              ...req.body,
              actor: { userId: req.role?.userId, role: req.role?.role },
            })
          );
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );
    app.post(
      '/api/v1/cco-dataflow/reviewed',
      attachRole,
      requireAnyRole(RBAC),
      jsonParser,
      async (req, res) => {
        try {
          res.json(
            await store.markReviewed({
              actor: { userId: req.role?.userId, role: req.role?.role },
              ...req.body,
            })
          );
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );
    console.log('[cco-dataflow] monterad: GET /api/v1/cco-dataflow + /export/art30');
  } catch (err) {
    console.warn('[cco-dataflow] kunde inte montera:', err.message);
  }
})();

// ── CCO Take Photo (Sprint 19C.3) — patient-asset upload via klinik ──
(async () => {
  try {
    const { attachRole, requireAnyRole } = require('./src/security/ccoRbac');
    const multer = require('multer');
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    });
    const crypto = require('crypto');

    const RBAC = ['owner', 'doctor', 'staff', 'staff_assistant'];

    // POST /api/v1/cco/patient/:patientId/take-photo
    // multipart/form-data: file, encounterId?, phase?, subject?, treatmentKey?, note?, takenAt?, sessionNumber?, needsReview?
    app.post(
      '/api/v1/cco/patient/:patientId/take-photo',
      attachRole,
      requireAnyRole(RBAC),
      upload.single('file'),
      async (req, res) => {
        try {
          const patientId = req.params.patientId;
          if (!patientId) return res.status(400).json({ error: 'patientId krävs' });
          if (!req.file) return res.status(400).json({ error: 'file krävs (multipart)' });

          // Hämta stores via app.locals (lazy — den andra IIFE:n sätter dem)
          const stores = {
            assetStore: app.locals.ccoPatientAssetStore,
            secureStorage: app.locals.ccoSecureStorage,
          };
          if (!stores.secureStorage || !stores.assetStore) {
            return res.status(503).json({
              error:
                'asset_stores_not_initialized — server-startup eller bygg /api/v1/cco-assets via ensureAssetStores först',
            });
          }

          const buf = req.file.buffer;
          const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
          const takenAt = req.body.takenAt || new Date().toISOString();
          const phase = req.body.phase || 'treatment';
          const subject = (req.body.subject && String(req.body.subject).trim()) || null;
          const treatmentKey = req.body.treatmentKey || null;
          const sessionNumber = req.body.sessionNumber
            ? parseInt(req.body.sessionNumber, 10)
            : null;
          const note = req.body.note || '';
          const encounterId = req.body.encounterId || null;
          const needsReview = String(req.body.needsReview || '') === 'true' || !subject;
          const takenBy = {
            userId: req.role?.userId || req.headers['x-cco-user'] || 'unknown',
            role: req.role?.role || 'staff',
          };

          // Lagra i secure storage
          const ym = takenAt.slice(0, 7); // YYYY-MM
          const storageKey = `patient-photos/${ym}/${patientId}/${Date.now()}-${sha256.slice(0, 8)}.jpg`;
          await stores.secureStorage.putObject(storageKey, buf, {
            mimeType: req.file.mimetype || 'image/jpeg',
          });

          // Skapa patient_asset via addAsset (eller createAsset om finns)
          const assetInput = {
            patientId,
            encounterId,
            category: 'photo',
            sourceSystem: 'cco_take_photo',
            storageKey,
            checksum: sha256,
            fileSize: buf.length,
            mimeType: req.file.mimetype || 'image/jpeg',
            originalFileName: req.file.originalname || `photo-${Date.now()}.jpg`,
            takenAt,
            meta: {
              takenAt,
              takenBy,
              phase,
              subject,
              treatmentKey,
              sessionNumber,
              note,
              displayHints: { phase, subject, treatmentKey, sessionNumber },
            },
            needsReview,
            ...(needsReview && {
              reviewReason: subject
                ? 'metadata granskning'
                : 'saknad bildtyp/subject — markera innan visning på patientportal',
            }),
          };

          let asset = null;
          const addFn = stores.assetStore.addAsset || stores.assetStore.createAsset;
          if (typeof addFn === 'function') {
            try {
              asset = await addFn.call(stores.assetStore, assetInput, { actor: takenBy });
            } catch (err) {
              return res
                .status(err.statusCode || 500)
                .json({ error: 'asset_store_rejected: ' + err.message, storageKey });
            }
          } else {
            return res.status(503).json({ error: 'asset_store_missing_addAsset_or_createAsset' });
          }

          // Audit
          try {
            ccoAuditLog?.append?.({
              kind: 'patient_photo.captured',
              surface: 'cco.take_photo',
              ts: new Date().toISOString(),
              detail: {
                patientId,
                encounterId,
                assetId: asset?.id || asset?.assetId,
                takenAt,
                phase,
                subject,
                treatmentKey,
                sessionNumber,
                sizeBytes: buf.length,
                sha256,
                storageKey,
                needsReview,
                actor: takenBy,
              },
            });
          } catch {}

          // Timeline-event
          try {
            app.locals.ccoHistoryStore?.appendEvent?.({
              kind: 'patient_photo_taken',
              surface: 'cco.take_photo',
              ts: new Date().toISOString(),
              customerId: patientId,
              encounterId,
              assetId: asset?.id || asset?.assetId,
              phase,
              subject,
              treatmentKey,
              needsReview,
              actor: takenBy,
            });
          } catch {}

          res.json({
            ok: true,
            assetId: asset?.id || asset?.assetId,
            storageKey,
            sha256,
            sizeBytes: buf.length,
            takenAt,
            takenBy,
            phase,
            subject,
            treatmentKey,
            sessionNumber,
            needsReview,
            displayName: asset?.displayName || (needsReview ? '(behöver namnges)' : null),
          });
        } catch (err) {
          console.error('[take-photo]', err);
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco/assets/:assetId/soft-delete — markera bild som dold (PDL-retention behåller fysisk fil 10 år)
    app.post(
      '/api/v1/cco/assets/:assetId/soft-delete',
      attachRole,
      requireAnyRole(RBAC),
      express.json({ limit: '8kb' }),
      async (req, res) => {
        try {
          const assetId = req.params.assetId;
          const store = app.locals.ccoPatientAssetStore;
          if (!store) return res.status(503).json({ error: 'asset_store_not_initialized' });
          const asset = store.getAsset?.(assetId);
          if (!asset) return res.status(404).json({ error: 'asset saknas' });
          const actor = { userId: req.role?.userId || 'unknown', role: req.role?.role || 'staff' };
          const reason = String(req.body?.reason || 'staff_manual_delete_from_patient_card').slice(
            0,
            500
          );
          // Soft-delete via befintliga markAsLinkOnlyBlocker eller egen flagga
          if (typeof store.markAsHidden === 'function') {
            await store.markAsHidden(assetId, reason, { actor });
          } else {
            // Fallback: använd transition om finns, annars sätt flag direkt på state
            if (typeof store.markAsLinkOnlyBlocker === 'function') {
              await store.markAsLinkOnlyBlocker(assetId, reason, { actor });
            }
          }
          try {
            ccoAuditLog?.append?.({
              kind: 'patient_asset.soft_deleted',
              surface: 'cco.take_photo',
              ts: new Date().toISOString(),
              detail: { assetId, patientId: asset.patientId, reason, actor },
            });
          } catch {}
          try {
            app.locals.ccoHistoryStore?.appendEvent?.({
              kind: 'patient_asset_soft_deleted',
              surface: 'cco.patient_card',
              ts: new Date().toISOString(),
              customerId: asset.patientId,
              assetId,
              reason,
              actor,
            });
          } catch {}
          res.json({
            ok: true,
            assetId,
            status: 'hidden',
            pdlRetentionUntil: '10 år från senaste journalpost',
          });
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // Compat-alias för Ta bild-modulen (som POSTar till /api/v1/cco/assets)
    app.post(
      '/api/v1/cco/assets',
      attachRole,
      requireAnyRole(RBAC),
      upload.single('file'),
      async (req, res) => {
        // Re-dispatch via take-photo
        req.params.patientId = req.body.patientId;
        if (!req.params.patientId) return res.status(400).json({ error: 'patientId krävs' });
        // Manuell route-call
        const handler = app._router.stack.find(
          (l) =>
            l.route?.path === '/api/v1/cco/patient/:patientId/take-photo' && l.route.methods?.post
        );
        if (handler && handler.route?.stack?.length) {
          // sista layer = den nya handlern; kör den
          return handler.route.stack[handler.route.stack.length - 1].handle(req, res, () => {});
        }
        return res.status(500).json({ error: 'route_dispatch_failed' });
      }
    );

    console.log(
      '[cco-take-photo] monterad: POST /api/v1/cco/patient/:patientId/take-photo (+ compat /cco/assets)'
    );
  } catch (err) {
    console.warn('[cco-take-photo] kunde inte montera:', err.message);
  }
})();

// ── CCO Offer Document Package Store (Sprint 19C.1) ──────────────
(async () => {
  try {
    const {
      createCcoOfferDocumentPackageStore,
    } = require('./src/ops/ccoOfferDocumentPackageStore');
    const { attachRole, requireAnyRole } = require('./src/security/ccoRbac');
    const express = require('express');
    const jsonParser = express.json({ limit: '32kb' });

    const store = await createCcoOfferDocumentPackageStore({
      filePath: path.join(__dirname, 'data', 'cco-offer-document-packages.json'),
      auditLog: ccoAuditLog,
      timelineStore: app.locals.ccoHistoryStore || null,
    });
    app.locals.ccoOfferDocumentPackageStore = store;
    const RBAC = ['owner', 'doctor', 'staff'];

    function lookupOffer(offerId) {
      const ofs = app.locals.ccoOfferQuickStore;
      if (!ofs) return null;
      return (
        ofs.getById?.(offerId) || (ofs.listAll?.() || []).find((o) => o.id === offerId) || null
      );
    }

    // POST /api/v1/cco-offers/:id/prepare-package — bygger dokumentpaket från offert
    app.post(
      '/api/v1/cco-offers/:id/prepare-package',
      attachRole,
      requireAnyRole(RBAC),
      jsonParser,
      async (req, res) => {
        try {
          const offer = lookupOffer(req.params.id);
          if (!offer) return res.status(404).json({ error: 'offer saknas' });
          const planStore = app.locals.ccoTreatmentPlanCanvasStore;
          const plan =
            (planStore?.getByCustomer?.(offer.customerId) || []).find(
              (p) => p.offerId === req.params.id
            ) || null;
          const actor = { userId: req.role?.userId || 'unknown', role: req.role?.role || 'staff' };
          const pkg = await store.preparePackage({
            offer,
            plan,
            actor,
            existingDocsState: req.body?.existingDocsState || {},
          });
          res.json(pkg);
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );

    app.get('/api/v1/cco-offer-packages/:id', attachRole, requireAnyRole(RBAC), (req, res) => {
      const p = store.getById(req.params.id);
      if (!p) return res.status(404).json({ error: 'not found' });
      res.json(p);
    });
    app.get(
      '/api/v1/cco-offer-packages/customer/:cid',
      attachRole,
      requireAnyRole(RBAC),
      (req, res) => {
        res.json({ packages: store.listByCustomer(req.params.cid) });
      }
    );
    app.post(
      '/api/v1/cco-offer-packages/:id/document-status',
      attachRole,
      requireAnyRole(RBAC),
      jsonParser,
      async (req, res) => {
        try {
          const actor = { userId: req.role?.userId || 'unknown', role: req.role?.role || 'staff' };
          res.json(await store.updateDocStatus({ packageId: req.params.id, actor, ...req.body }));
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );
    console.log(
      '[cco-offer-packages] monterad: POST /cco-offers/:id/prepare-package + GET/POST /cco-offer-packages/*'
    );
  } catch (err) {
    console.warn('[cco-offer-packages] kunde inte montera:', err.message);
  }
})();

// ── CCO Vendor Register (Sprint 19A.4 #47) — PUB-register ─────────
(async () => {
  try {
    const { createCcoVendorRegisterStore } = require('./src/ops/ccoVendorRegisterStore');
    const { attachRole, requireAnyRole } = require('./src/security/ccoRbac');
    const express = require('express');
    const jsonParser = express.json({ limit: '64kb' });

    const store = await createCcoVendorRegisterStore({
      filePath: path.join(__dirname, 'data', 'cco-vendor-register.json'),
      auditLog: ccoAuditLog,
    });
    app.locals.ccoVendorRegisterStore = store;
    const RBAC = ['owner', 'dpo', 'revisor'];

    app.get('/api/v1/cco-vendors', attachRole, requireAnyRole(RBAC), (req, res) => {
      res.json({
        vendors: store.listAll(),
        needsReview: store.listNeedsReview(),
        legacyExit: store.listLegacyExit(),
      });
    });
    app.get('/api/v1/cco-vendors/export', attachRole, requireAnyRole(RBAC), (req, res) => {
      res.json(store.exportRegister());
    });
    app.get('/api/v1/cco-vendors/:id', attachRole, requireAnyRole(RBAC), (req, res) => {
      const v = store.getById(req.params.id);
      if (!v) return res.status(404).json({ error: 'not found' });
      res.json(v);
    });
    app.post(
      '/api/v1/cco-vendors',
      attachRole,
      requireAnyRole(RBAC),
      jsonParser,
      async (req, res) => {
        try {
          res.json(
            await store.createVendor(req.body, { userId: req.role?.userId, role: req.role?.role })
          );
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );
    app.patch(
      '/api/v1/cco-vendors/:id',
      attachRole,
      requireAnyRole(RBAC),
      jsonParser,
      async (req, res) => {
        try {
          res.json(
            await store.updateVendor(req.params.id, req.body, {
              userId: req.role?.userId,
              role: req.role?.role,
            })
          );
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );
    app.post(
      '/api/v1/cco-vendors/:id/dpa-reviewed',
      attachRole,
      requireAnyRole(RBAC),
      jsonParser,
      async (req, res) => {
        try {
          res.json(
            await store.markDpaReviewed({
              vendorId: req.params.id,
              actor: { userId: req.role?.userId, role: req.role?.role },
              ...req.body,
            })
          );
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );
    app.post(
      '/api/v1/cco-vendors/:id/underbilaga1-completed',
      attachRole,
      requireAnyRole(RBAC),
      jsonParser,
      async (req, res) => {
        try {
          res.json(
            await store.markUnderbilaga1Completed({
              vendorId: req.params.id,
              actor: { userId: req.role?.userId, role: req.role?.role },
              ...req.body,
            })
          );
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );
    app.post(
      '/api/v1/cco-vendors/:id/subprocessor',
      attachRole,
      requireAnyRole(RBAC),
      jsonParser,
      async (req, res) => {
        try {
          res.json(
            await store.addSubprocessor({
              vendorId: req.params.id,
              actor: { userId: req.role?.userId, role: req.role?.role },
              subprocessor: req.body,
            })
          );
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );
    app.post(
      '/api/v1/cco-vendors/:id/legacy-exit',
      attachRole,
      requireAnyRole(RBAC),
      jsonParser,
      async (req, res) => {
        try {
          res.json(
            await store.markLegacyExit({
              vendorId: req.params.id,
              actor: { userId: req.role?.userId, role: req.role?.role },
              ...req.body,
            })
          );
        } catch (e) {
          res.status(400).json({ error: e.message });
        }
      }
    );
    console.log('[cco-vendors] monterad: GET/POST /api/v1/cco-vendors + /export');
  } catch (err) {
    console.warn('[cco-vendors] kunde inte montera:', err.message);
  }
})();

// ── CCO Patient Card Sections (Sprint 19B.5) ─────────────────────
// GET /api/v1/cco-patient-card/:customerId — returnerar 15 strukturerade
// sektioner med MÄNSKLIGA displayName via ccoAssetDisplayNameBuilder.
// Graceful fallback: stores som inte är inkopplade returnerar tomma sektioner.
(async () => {
  try {
    const { attachRole, requireAnyRole } = require('./src/security/ccoRbac');
    const { buildPatientCardSections } = require('./src/ops/ccoPatientCardSectionBuilder');

    // Wireup-helper: hitta alla redan-monterade stores i app.locals (fallback för noll-fel).
    // Vissa stores exporterar olika method-namn — vi normaliserar till listByCustomer / getByCustomer.
    function gatherStores() {
      const l = app.locals || {};
      const adapt = (store, methodCandidates) => {
        if (!store) return null;
        for (const m of methodCandidates) {
          if (typeof store[m] === 'function') {
            return {
              ...store,
              listByCustomer: store[m].bind(store),
              getByCustomer: store[m].bind(store),
            };
          }
        }
        return { listByCustomer: () => [], getByCustomer: () => [] };
      };
      return {
        customerStore: l.ccoCustomerStore || null,
        consultationStore: adapt(l.ccoConsultationStore, [
          'listByCustomer',
          'findByCustomer',
          'getByCustomer',
        ]),
        photoStore: adapt(l.ccoJournalPhotoStore || l.ccoPatientAssetStore, [
          'listByCustomer',
          'listAssetsByCustomer',
          'getByCustomer',
        ]),
        annotationStore: l.ccoPhotoAnnotationStore || null,
        planStore: l.ccoTreatmentPlanCanvasStore || null,
        offerStore: adapt(l.ccoOfferQuickStore, [
          'listByCustomer',
          'listForCustomer',
          'getOffersByCustomer',
          'getByCustomer',
        ]),
        agreementStore: adapt(l.ccoTreatmentAgreementStore, ['listByCustomer', 'getByCustomer']),
        consentStore: adapt(l.ccoTemplateRegistry, ['listByCustomer', 'getByCustomer']),
        journalStore: adapt(l.ccoJournalStore, [
          'listByCustomer',
          'listEntriesByCustomer',
          'getByCustomer',
        ]),
        formStore: null,
        aftercareStore: adapt(l.ccoAftercareStore, [
          'listByCustomer',
          'listJobsByCustomer',
          'getByCustomer',
        ]),
        followUpStore: adapt(l.ccoFollowUpStore, ['listByCustomer', 'getByCustomer']),
        conversationStore: adapt(l.ccoConversationThreadStore, [
          'listByCustomer',
          'listThreadsByCustomer',
          'getByCustomer',
        ]),
        historyStore: adapt(l.ccoHistoryStore, [
          'listByCustomer',
          'listEventsByCustomer',
          'getByCustomer',
        ]),
        taskStore: adapt(l.ccoNotificationFeedStore, ['listByCustomer', 'getByCustomer']),
        readinessAggregator: l.readyForTreatmentAggregator || null,
        documentPackageStore: l.ccoOfferDocumentPackageStore || null,
        portalLinkStore: l.ccoSecurePortalLinkStore || null,
        // Sprint 19C.5 — payment-adapter
        fortnoxStore: l.ccoFortnoxStore || null,
        swishStore: l.ccoSwishStore || null,
        commercialStore: l.ccoCommercialStore || null,
        // 19F.5 Fix #2 — Fortnox invoice/payment-lister (cached 60s)
        fortnoxInvoiceLister: l.ccoFortnoxInvoiceLister || null,
        patientMasterStore: l.ccoPatientMasterStore || null,
        // 19F.4 Fix #1 — encounter-store för 'besok'-sektion
        treatmentEncounterStore: l.ccoTreatmentEncounterStore || null,
        patientAssetStore: l.ccoPatientAssetStore || null,
        treatmentPlanStore: l.ccoTreatmentPlanCanvasStore || null,
        // 19F.7 Fix A+B — bokningar-sektion + audit-events i tidslinjen
        bookingStore: l.ccoBookingStore || null,
        bookingCaseStore: l.ccoBookingCaseStore || null,
        auditLog: l.ccoAuditLog || null,
      };
    }

    app.get(
      '/api/v1/cco-patient-card/:customerId',
      requireCcoAuthenticated,
      attachRole,
      requireAnyRole(['owner', 'staff', 'staff_assistant', 'doctor', 'revisor']),
      // 19F.5 Fix #3 — middleware spärrkontroll på patientkort-read
      (req, res, next) =>
        app.locals.enforceAccessRestriction
          ? app.locals.enforceAccessRestriction(req, res, next)
          : next(),
      async (req, res) => {
        try {
          const customerId = req.params.customerId;
          const stores = gatherStores();
          const out = await buildPatientCardSections({ customerId, stores });
          // 19F.5 — bädda in accessRestriction-flagga så UI kan rendera 🔒-stripe
          try {
            const customerStore = app.locals.ccoCustomerStore || app.locals.ccoPatientMasterStore;
            const getFn = customerStore?.getById || customerStore?.getByKey;
            const customer = getFn ? await getFn.call(customerStore, customerId) : null;
            if (customer?.accessRestricted) {
              out.accessRestriction = {
                restricted: true,
                restrictedAt: customer.restrictedAt,
                restrictedBy: customer.restrictedBy,
                restrictedReason: customer.restrictedReason,
              };
            }
          } catch {}
          // Audit för känsliga öppningar
          try {
            ccoAuditLog?.append?.({
              kind: 'patient_card.viewed',
              surface: 'cco.patient_card',
              ts: new Date().toISOString(),
              detail: {
                customerId,
                sectionCount: out.sections.length,
                actor: req.role?.userId || 'anonymous',
              },
            });
          } catch {}
          res.json(out);
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      }
    );
    console.log('[cco-patient-card] monterad: GET /api/v1/cco-patient-card/:customerId');
  } catch (err) {
    console.warn('[cco-patient-card] kunde inte montera:', err.message);
  }
})();

// ── CCO Signaturregister (Sprint 18C.7) ─────────────────────────
// Levererar låsbara signaturer + mailbox-koppling till Svarstudio.
// Source-of-truth: config/cco-signatures.json. Read-only via API.
(async () => {
  try {
    const { attachRole } = require('./src/security/ccoRbac');
    const fsp = require('fs').promises;
    const sigFile = path.join(__dirname, 'config', 'cco-signatures.json');

    async function loadSignatures() {
      try {
        const raw = await fsp.readFile(sigFile, 'utf8');
        const data = JSON.parse(raw);
        const signatures = Array.isArray(data.signatures) ? data.signatures : [];
        return {
          version: data.version || '1.0.0',
          updatedAt: data.updatedAt || null,
          signatures: signatures.filter((s) => s && s.active !== false),
        };
      } catch (err) {
        return { version: '1.0.0', updatedAt: null, signatures: [], error: err.message };
      }
    }

    // GET /api/v1/cco-signatures — alla i CCO kan läsa
    app.get('/api/v1/cco-signatures', requireCcoAuthenticated, attachRole, async (req, res) => {
      const data = await loadSignatures();
      res.setHeader('Cache-Control', 'private, max-age=30');
      res.json(data);
    });

    // GET /api/v1/cco-signatures/by-mailbox/:mailboxId — auto-pick för Svarstudio
    app.get(
      '/api/v1/cco-signatures/by-mailbox/:mailboxId',
      requireCcoAuthenticated,
      attachRole,
      async (req, res) => {
        const data = await loadSignatures();
        const mailboxId = String(req.params.mailboxId || '').toLowerCase();
        const match =
          data.signatures.find((s) => String(s.primaryMailbox || '').toLowerCase() === mailboxId) ||
          data.signatures.find(
            (s) =>
              Array.isArray(s.mailboxAliases) &&
              s.mailboxAliases.some((a) => String(a).toLowerCase() === mailboxId)
          ) ||
          null;
        if (!match) return res.status(404).json({ error: 'no signature for mailbox', mailboxId });
        res.json({ version: data.version, signature: match });
      }
    );

    console.log('[cco-signatures] monterad: GET /api/v1/cco-signatures + /by-mailbox/:id');
  } catch (err) {
    console.warn('[cco-signatures] kunde inte montera:', err.message);
  }
})();

// ── CCO Policy Store + Snooze (Sprint 3.1-3.4) ──────────────────
(async () => {
  try {
    const { createCcoPolicyStore, createCcoMailSnoozeStore } = require('./src/ops/ccoPolicyStore');
    const { attachRole, requirePermission, requireAnyRole } = require('./src/security/ccoRbac');
    const policyStore = await createCcoPolicyStore({
      filePath: path.join(__dirname, 'data', 'cco-policies.json'),
      auditLog: ccoAuditLog,
    });
    const snoozeStore = await createCcoMailSnoozeStore({
      filePath: path.join(__dirname, 'data', 'cco-mail-snoozes.json'),
      auditLog: ccoAuditLog,
    });
    const express = require('express');
    const jsonParser = express.json({ limit: '16kb' });

    // GET hela paketet eller bara en sektion
    app.get('/api/v1/cco-policies', attachRole, requirePermission('settings.read'), (req, res) => {
      res.json({ policies: policyStore.get(), updatedAt: new Date().toISOString() });
    });

    app.get(
      '/api/v1/cco-policies/:section',
      attachRole,
      requirePermission('settings.read'),
      (req, res) => {
        res.json(policyStore.get(req.params.section));
      }
    );

    // PATCH section (bara owner — settings.write)
    app.patch(
      '/api/v1/cco-policies/:section',
      attachRole,
      requirePermission('settings.write'),
      jsonParser,
      async (req, res) => {
        try {
          const updated = await policyStore.update(req.params.section, req.body || {}, {
            role: req.cco?.role,
          });
          res.json(updated);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // Reset (bara owner)
    app.post(
      '/api/v1/cco-policies/:section/reset',
      attachRole,
      requireAnyRole(['owner']),
      async (req, res) => {
        try {
          const reset = await policyStore.reset(
            req.params.section === 'all' ? null : req.params.section,
            { role: req.cco?.role }
          );
          res.json(reset);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // Booking-evaluering — kan kallas innan en bok skapas
    app.post(
      '/api/v1/cco-policies/booking/evaluate',
      attachRole,
      requirePermission('bookings.read'),
      jsonParser,
      (req, res) => {
        const { startsAt } = req.body || {};
        if (!startsAt) return res.status(400).json({ error: 'startsAt krävs' });
        res.json(policyStore.evaluateBooking(startsAt));
      }
    );

    app.post(
      '/api/v1/cco-policies/cancellation/evaluate',
      attachRole,
      requirePermission('bookings.read'),
      jsonParser,
      (req, res) => {
        const { startsAt } = req.body || {};
        if (!startsAt) return res.status(400).json({ error: 'startsAt krävs' });
        res.json(policyStore.evaluateCancellation(startsAt));
      }
    );

    // Office hours status (alla roller får läsa)
    app.get('/api/v1/cco-office-hours/status', attachRole, (req, res) => {
      res.json({
        isOpenNow: policyStore.isOpenNow(),
        shouldAutoReply: policyStore.shouldAutoReply(),
        config: policyStore.get('officeHours'),
        now: new Date().toISOString(),
      });
    });

    // Auto-assign — körs av mejl-pipeline
    app.post(
      '/api/v1/cco-policies/autoassign/evaluate',
      attachRole,
      requirePermission('mail.read'),
      jsonParser,
      (req, res) => {
        const mail = req.body || {};
        res.json(policyStore.assignMail(mail));
      }
    );

    // Auto-assign-regler CRUD
    app.post(
      '/api/v1/cco-policies/autoassign/rules',
      attachRole,
      requirePermission('settings.write'),
      jsonParser,
      async (req, res) => {
        try {
          const r = await policyStore.upsertAutoAssignRule(req.body || {}, { role: req.cco?.role });
          res.json(r);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.delete(
      '/api/v1/cco-policies/autoassign/rules/:id',
      attachRole,
      requirePermission('settings.write'),
      async (req, res) => {
        try {
          const r = await policyStore.deleteAutoAssignRule(req.params.id, { role: req.cco?.role });
          res.json(r);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // ─ Mail snooze ──────────────────────────────────────
    app.post(
      '/api/v1/cco-mail-snooze/:threadId',
      attachRole,
      requirePermission('mail.read'),
      jsonParser,
      async (req, res) => {
        try {
          const { untilIso, snoozeDays } = req.body || {};
          let until = untilIso;
          if (!until && snoozeDays) {
            until = new Date(Date.now() + Number(snoozeDays) * 86400000).toISOString();
          }
          const result = await snoozeStore.snooze(req.params.threadId, until, {
            role: req.cco?.role,
          });
          res.json(result);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.delete(
      '/api/v1/cco-mail-snooze/:threadId',
      attachRole,
      requirePermission('mail.read'),
      async (req, res) => {
        try {
          await snoozeStore.unsnooze(req.params.threadId, { role: req.cco?.role });
          res.json({ ok: true });
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.get('/api/v1/cco-mail-snooze', attachRole, requirePermission('mail.read'), (req, res) => {
      res.json({
        all: snoozeStore.list(),
        active: snoozeStore.active(),
        ready: snoozeStore.ready(),
      });
    });

    app.locals.ccoPolicyStore = policyStore;
    app.locals.ccoMailSnoozeStore = snoozeStore;
    console.log('[cco-policies] monterad: GET/PATCH /api/v1/cco-policies/* (Sprint 3.1-3.4)');
    console.log(
      '[cco-mail-snooze] monterad: POST/DELETE/GET /api/v1/cco-mail-snooze/* (Sprint 3.3)'
    );
  } catch (err) {
    console.warn('[cco-policies] kunde inte montera:', err.message);
  }
})();

// ── CCO Telemetry + Collaboration (Sprint 4.1-4.2) ──────────────
let ccoTelemetryStore = null;
let ccoCollabStore = null;
(async () => {
  try {
    const {
      createCcoTelemetryStore,
      createCcoCollaborationStore,
    } = require('./src/ops/ccoTelemetryStore');
    const { attachRole, requirePermission } = require('./src/security/ccoRbac');
    ccoTelemetryStore = await createCcoTelemetryStore({
      filePath: path.join(__dirname, 'data', 'cco-telemetry.json'),
      auditLog: ccoAuditLog,
      bookingCaseStore: app.locals.ccoBookingCaseStore,
    });
    ccoCollabStore = await createCcoCollaborationStore({
      filePath: path.join(__dirname, 'data', 'cco-collaboration.json'),
      auditLog: ccoAuditLog,
    });
    const express = require('express');
    const jsonParser = express.json({ limit: '8kb' });

    // ─ Telemetry — RBAC: GET = settings.read, write = settings.write ─
    app.get(
      '/api/v1/cco-telemetry/live',
      attachRole,
      requirePermission('settings.read'),
      async (req, res) => {
        try {
          res.json(await ccoTelemetryStore.liveMetrics());
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      }
    );

    app.get(
      '/api/v1/cco-telemetry/team',
      attachRole,
      requirePermission('settings.read'),
      (req, res) => {
        res.json(ccoTelemetryStore.teamStats(req.query.period || 'week'));
      }
    );

    app.get(
      '/api/v1/cco-telemetry/user/:userId',
      attachRole,
      requirePermission('settings.read'),
      (req, res) => {
        const u = ccoTelemetryStore.userStats(req.params.userId);
        if (!u) return res.status(404).json({ error: 'user_not_found' });
        res.json(u);
      }
    );

    app.get(
      '/api/v1/cco-telemetry/leaderboard',
      attachRole,
      requirePermission('settings.read'),
      (req, res) => {
        res.json({ leaderboard: ccoTelemetryStore.leaderboard() });
      }
    );

    app.get(
      '/api/v1/cco-telemetry/top-templates',
      attachRole,
      requirePermission('settings.read'),
      (req, res) => {
        res.json({ templates: ccoTelemetryStore.topTemplates() });
      }
    );

    app.get(
      '/api/v1/cco-telemetry/coaching',
      attachRole,
      requirePermission('settings.read'),
      (req, res) => {
        res.json({ tips: ccoTelemetryStore.coachingInsights(req.query.userId || null) });
      }
    );

    // Write — owner only
    app.post(
      '/api/v1/cco-telemetry/daily',
      attachRole,
      requirePermission('settings.write'),
      jsonParser,
      async (req, res) => {
        try {
          const result = await ccoTelemetryStore.recordDaily(req.body || {}, {
            role: req.cco?.role,
          });
          res.json(result);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.post(
      '/api/v1/cco-telemetry/user/:userId',
      attachRole,
      requirePermission('settings.write'),
      jsonParser,
      async (req, res) => {
        try {
          const result = await ccoTelemetryStore.updateUserStats(
            req.params.userId,
            req.body || {},
            { role: req.cco?.role }
          );
          res.json(result);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // ─ Collaboration — GET = mail.read; write/heartbeat = automation.edit ─
    app.post(
      '/api/v1/cco-collaboration/:resourceId/heartbeat',
      attachRole,
      requirePermission('automation.edit'),
      jsonParser,
      async (req, res) => {
        try {
          const userId = req.body?.userId || req.cco?.role || 'unknown';
          const result = await ccoCollabStore.heartbeat(
            req.params.resourceId,
            userId,
            req.cco?.role
          );
          res.json(result);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.get(
      '/api/v1/cco-collaboration/:resourceId/presence',
      attachRole,
      requirePermission('automation.read'),
      (req, res) => {
        res.json({ active: ccoCollabStore.activePresence(req.params.resourceId) });
      }
    );

    app.post(
      '/api/v1/cco-collaboration/:resourceId/lock',
      attachRole,
      requirePermission('automation.edit'),
      jsonParser,
      async (req, res) => {
        try {
          const { nodeId } = req.body || {};
          const userId = req.body?.userId || req.cco?.role || 'unknown';
          const lock = await ccoCollabStore.acquireLock(
            req.params.resourceId,
            nodeId,
            userId,
            req.cco?.role
          );
          res.json(lock);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message, lockedBy: err.lockedBy });
        }
      }
    );

    app.delete(
      '/api/v1/cco-collaboration/:resourceId/lock',
      attachRole,
      requirePermission('automation.edit'),
      jsonParser,
      async (req, res) => {
        try {
          const userId = req.body?.userId || req.cco?.role || 'unknown';
          await ccoCollabStore.releaseLock(req.params.resourceId, req.body?.nodeId, userId);
          res.json({ ok: true });
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.get(
      '/api/v1/cco-collaboration/:resourceId/locks',
      attachRole,
      requirePermission('automation.read'),
      (req, res) => {
        res.json({ locks: ccoCollabStore.activeLocks(req.params.resourceId) });
      }
    );

    app.post(
      '/api/v1/cco-collaboration/:resourceId/comments',
      attachRole,
      requirePermission('automation.edit'),
      jsonParser,
      async (req, res) => {
        try {
          const { body, nodeId } = req.body || {};
          const userId = req.body?.userId || req.cco?.role || 'unknown';
          const c = await ccoCollabStore.postComment(
            req.params.resourceId,
            body,
            userId,
            req.cco?.role,
            nodeId
          );
          res.json(c);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.get(
      '/api/v1/cco-collaboration/:resourceId/comments',
      attachRole,
      requirePermission('automation.read'),
      (req, res) => {
        res.json({ comments: ccoCollabStore.listComments(req.params.resourceId) });
      }
    );

    app.post(
      '/api/v1/cco-collaboration/:resourceId/comments/:commentId/resolve',
      attachRole,
      requirePermission('automation.edit'),
      jsonParser,
      async (req, res) => {
        try {
          const userId = req.body?.userId || req.cco?.role || 'unknown';
          const c = await ccoCollabStore.resolveComment(
            req.params.resourceId,
            req.params.commentId,
            userId
          );
          res.json(c);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.locals.ccoTelemetryStore = ccoTelemetryStore;
    app.locals.ccoCollabStore = ccoCollabStore;
    console.log(
      '[cco-telemetry] monterad: 7 routes /api/v1/cco-telemetry/* (RBAC: settings.read/write)'
    );
    console.log(
      '[cco-collaboration] monterad: 7 routes /api/v1/cco-collaboration/* (RBAC: automation.read/edit)'
    );
  } catch (err) {
    console.warn('[cco-telemetry/collaboration] kunde inte montera:', err.message);
  }
})();

// ── CCO Brand + User + Notifications + Cron (Sprint 5.1-5.4) ───
(async () => {
  try {
    const {
      createCcoBrandStore,
      createCcoUserStore,
      createCcoNotificationStore,
      createCronScheduler,
    } = require('./src/ops/ccoBrandUserStore');
    const { attachRole, requirePermission } = require('./src/security/ccoRbac');

    const brandStore = await createCcoBrandStore({
      filePath: path.join(__dirname, 'data', 'cco-brands.json'),
      auditLog: ccoAuditLog,
    });
    const userStore = await createCcoUserStore({
      filePath: path.join(__dirname, 'data', 'cco-users.json'),
      auditLog: ccoAuditLog,
    });
    const notificationStore = await createCcoNotificationStore({
      filePath: path.join(__dirname, 'data', 'cco-notifications.json'),
      auditLog: ccoAuditLog,
    });
    const cronScheduler = createCronScheduler({
      notificationStore,
      telemetryStore: app.locals.ccoTelemetryStore,
      intervalMs: 60000,
    });

    const express = require('express');
    const jsonParser = express.json({ limit: '32kb' });

    // ─ BRAND — RBAC: read=settings.read, write=settings.write ─
    app.get('/api/v1/cco-brands', attachRole, requirePermission('settings.read'), (req, res) => {
      res.json({ brands: brandStore.list() });
    });
    app.get(
      '/api/v1/cco-brands/:tenantId',
      attachRole,
      requirePermission('settings.read'),
      (req, res) => {
        const b = brandStore.get(req.params.tenantId);
        if (!b) return res.status(404).json({ error: 'not_found' });
        res.json(b);
      }
    );
    app.patch(
      '/api/v1/cco-brands/:tenantId',
      attachRole,
      requirePermission('settings.write'),
      jsonParser,
      async (req, res) => {
        try {
          res.json(
            await brandStore.upsert(req.params.tenantId, req.body || {}, { role: req.cco?.role })
          );
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );
    app.delete(
      '/api/v1/cco-brands/:tenantId',
      attachRole,
      requirePermission('settings.write'),
      async (req, res) => {
        try {
          res.json(await brandStore.remove(req.params.tenantId, { role: req.cco?.role }));
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // ─ USER — RBAC: read=settings.read, write=settings.write (eller egen user) ─
    app.get('/api/v1/cco-users', attachRole, requirePermission('settings.read'), (req, res) => {
      res.json({
        users: userStore
          .list()
          .map((u) => ({ ...u, prefs: u.prefs, signature: u.signature ? '[SET]' : '' })),
      });
    });
    app.get(
      '/api/v1/cco-users/:userId',
      attachRole,
      requirePermission('settings.read'),
      (req, res) => {
        const u = userStore.get(req.params.userId);
        if (!u) return res.status(404).json({ error: 'not_found' });
        res.json(u);
      }
    );
    app.patch(
      '/api/v1/cco-users/:userId',
      attachRole,
      requirePermission('settings.write'),
      jsonParser,
      async (req, res) => {
        try {
          res.json(
            await userStore.upsert(req.params.userId, req.body || {}, { role: req.cco?.role })
          );
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // ─ NOTIFICATIONS (push subs + SMS-config + cron-jobs) ─
    app.get(
      '/api/v1/cco-notifications/push-subscriptions',
      attachRole,
      requirePermission('settings.read'),
      (req, res) => {
        res.json({
          subscriptions: notificationStore.listPushSubscriptions(req.query.userId || null),
        });
      }
    );
    app.post(
      '/api/v1/cco-notifications/push-subscriptions',
      attachRole,
      requirePermission('settings.write'),
      jsonParser,
      async (req, res) => {
        try {
          const { subscription, userId } = req.body || {};
          res.json(
            await notificationStore.subscribePush(subscription, userId, { role: req.cco?.role })
          );
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );
    app.delete(
      '/api/v1/cco-notifications/push-subscriptions',
      attachRole,
      requirePermission('settings.write'),
      jsonParser,
      async (req, res) => {
        try {
          res.json(
            await notificationStore.unsubscribePush(req.body?.endpoint, { role: req.cco?.role })
          );
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.get(
      '/api/v1/cco-notifications/sms-config',
      attachRole,
      requirePermission('settings.read'),
      (req, res) => {
        res.json(notificationStore.smsConfig());
      }
    );
    app.patch(
      '/api/v1/cco-notifications/sms-config',
      attachRole,
      requirePermission('settings.write'),
      jsonParser,
      async (req, res) => {
        try {
          res.json(
            await notificationStore.updateSmsConfig(req.body || {}, { role: req.cco?.role })
          );
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.get(
      '/api/v1/cco-notifications/cron-jobs',
      attachRole,
      requirePermission('settings.read'),
      (req, res) => {
        res.json({ jobs: notificationStore.listCronJobs() });
      }
    );
    app.post(
      '/api/v1/cco-notifications/cron-jobs',
      attachRole,
      requirePermission('settings.write'),
      jsonParser,
      async (req, res) => {
        try {
          res.json(await notificationStore.upsertCronJob(req.body || {}, { role: req.cco?.role }));
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.get(
      '/api/v1/cco-notifications/sent-log',
      attachRole,
      requirePermission('settings.read'),
      (req, res) => {
        res.json({ entries: notificationStore.sentLog(Number(req.query.limit) || 100) });
      }
    );

    // Manuell trigger för cron-jobb (owner only) — användbar för test
    app.post(
      '/api/v1/cco-notifications/cron-jobs/:id/run',
      attachRole,
      requirePermission('settings.write'),
      async (req, res) => {
        try {
          const job = notificationStore.listCronJobs().find((j) => j.id === req.params.id);
          if (!job) return res.status(404).json({ error: 'job_not_found' });
          const result = await cronScheduler.runJob(job);
          await notificationStore.markCronRan(job.id, { ok: true, manual: true, ...result });
          res.json({ ok: true, result });
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      }
    );

    cronScheduler.start();
    app.locals.ccoBrandStore = brandStore;
    app.locals.ccoUserStore = userStore;
    app.locals.ccoNotificationStore = notificationStore;
    app.locals.ccoCronScheduler = cronScheduler;
    console.log('[cco-brands] monterad: 4 routes /api/v1/cco-brands/* (RBAC: settings.read/write)');
    console.log('[cco-users] monterad: 3 routes /api/v1/cco-users/* (RBAC: settings.read/write)');
    console.log(
      '[cco-notifications] monterad: 9 routes /api/v1/cco-notifications/* (RBAC: settings.read/write)'
    );
    console.log(
      '[cco-cron-scheduler] startad — tickar var 60s · ' +
        notificationStore.listCronJobs().filter((j) => j.enabled).length +
        ' aktiva jobs'
    );
  } catch (err) {
    console.warn('[sprint5] kunde inte montera:', err.message);
  }
})();

// ── CCO Photo Consent + Retention Policy (Sprint 1.4) ──────────
let ccoPhotoConsentStore = null;
(async () => {
  try {
    const { createCcoPhotoConsentStore } = require('./src/ops/ccoPhotoConsentStore');
    const retention = require('./src/ops/ccoRetentionPolicy');
    const { attachRole, requirePermission } = require('./src/security/ccoRbac');
    ccoPhotoConsentStore = await createCcoPhotoConsentStore({
      filePath: path.join(__dirname, 'data', 'cco-photo-consents.json'),
      auditLog: ccoAuditLog,
    });
    const express = require('express');
    const jsonParser = express.json({ limit: '4kb' });

    app.get(
      '/api/v1/cco-photo-consents',
      attachRole,
      requirePermission('customers.read'),
      (req, res) => {
        const list = ccoPhotoConsentStore.listGranted({ customerId: req.query.customerId || null });
        res.json({ count: list.length, items: list, stats: ccoPhotoConsentStore.stats() });
      }
    );

    app.get(
      '/api/v1/cco-photo-consents/:customerId/:photoId',
      attachRole,
      requirePermission('customers.read'),
      (req, res) => {
        res.json(ccoPhotoConsentStore.getConsent(req.params.customerId, req.params.photoId));
      }
    );

    app.post(
      '/api/v1/cco-photo-consents/:customerId/:photoId',
      attachRole,
      requirePermission('customers.photo_consent_set'),
      jsonParser,
      async (req, res) => {
        try {
          const { status, note } = req.body || {};
          const c = await ccoPhotoConsentStore.setStatus(
            req.params.customerId,
            req.params.photoId,
            status,
            { role: req.cco?.role },
            { note }
          );
          res.json(c);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.get(
      '/api/v1/cco-retention/:customerId',
      attachRole,
      requirePermission('customers.read'),
      (req, res) => {
        const lastActivityAt = req.query.lastActivityAt || null;
        const readout = retention.readoutForCustomer({
          lastActivityAt,
          isLocked: req.query.locked === 'true',
          hasOpenCase: req.query.openCase === 'true',
        });
        res.json({
          customerId: req.params.customerId,
          ...readout,
          retentionYears: retention.RETENTION_YEARS,
        });
      }
    );

    app.locals.ccoPhotoConsentStore = ccoPhotoConsentStore;
    app.locals.ccoRetention = retention;
    console.log('[cco-photo-consent] monterad: GET/POST /api/v1/cco-photo-consents/*');
    console.log('[cco-retention] monterad: GET /api/v1/cco-retention/:customerId (10-års-policy)');
  } catch (err) {
    console.warn('[cco-photo-consent/retention] kunde inte montera:', err.message);
  }
})();

// ── NEEDS_DECISION-implementations: Retention hard-block + Analytics export ──
(async () => {
  try {
    const { attachRole, requirePermission, requireAnyRole } = require('./src/security/ccoRbac');
    const retention = require('./src/ops/ccoRetentionPolicy');

    // BESLUT #6: Hard-block customer-delete om retention < 10 år
    app.delete(
      '/api/v1/cco-customers/:id/with-retention-check',
      attachRole,
      requirePermission('customers.delete'),
      retention.enforceRetention,
      (req, res) => {
        // Om vi når hit har retention passerat
        if (ccoAuditLog)
          ccoAuditLog.append({
            action: 'customers.delete.attempt',
            actor: { role: req.cco?.role },
            target: { kind: 'customer', id: req.params.id },
            detail: { retentionCleared: true },
          });
        res.json({
          ok: true,
          note: 'Retention 10 år passerad — radering genomförd. Audit-loggat.',
        });
      }
    );

    // BESLUT #7: Analytics-export (PDF + Excel)
    app.get(
      '/api/v1/cco-analytics/export',
      attachRole,
      requireAnyRole(['owner', 'revisor']),
      async (req, res) => {
        const format = String(req.query.format || 'pdf').toLowerCase();
        const period = String(req.query.period || 'week');
        const tele = app.locals.ccoTelemetryStore;
        if (!tele) return res.status(500).json({ error: 'telemetry not ready' });
        const team = tele.teamStats(period);
        const lb = tele.leaderboard();
        const live = await tele.liveMetrics();

        if (format === 'excel' || format === 'csv') {
          const rows = [
            'Period,Conversations,AvgResponseMin,SLA%,CSAT',
            `${period},${team.conversations},${team.avgResponseMin},${team.slaPct},${team.csatAvg}`,
            '',
            'User,Score,Conversations,ResponseMin,UpsellSEK',
            ...lb.map(
              (u) => `${u.name},${u.score},${u.conversations},${u.responseMin},${u.upsellSek}`
            ),
          ].join('\n');
          if (ccoAuditLog)
            ccoAuditLog.append({
              action: 'analytics.export.csv',
              actor: { role: req.cco?.role },
              detail: { period, rows: rows.split('\n').length },
            });
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="cco-analytics-${period}-${new Date().toISOString().slice(0, 10)}.csv"`
          );
          return res.send(rows);
        }

        // PDF-format → returnera HTML som browsern print:ar till PDF (enklare än PDF-lib)
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>CCO Analytics ${period} ${new Date().toISOString().slice(0, 10)}</title>
<style>body{font-family:-apple-system,Inter,sans-serif;padding:30mm 20mm;color:#2b251f}
h1{font-size:24pt;margin:0 0 8pt;letter-spacing:-.02em}
h2{font-size:11pt;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#84756b;margin:24pt 0 10pt;border-bottom:1px solid #ccc;padding-bottom:4pt}
table{width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:14pt}
th,td{text-align:left;padding:6pt 8pt;border-bottom:1px solid #eee}
th{font-weight:800;font-size:9pt;text-transform:uppercase;letter-spacing:.06em;color:#84756b}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8pt;margin:14pt 0}
.kpi{padding:10pt 12pt;border:1px solid #ddd;border-radius:6pt}
.kpi-lbl{font-size:8pt;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#84756b}
.kpi-num{font-size:18pt;font-weight:800;margin-top:4pt}
footer{margin-top:32pt;padding-top:12pt;border-top:1px solid #ccc;font-size:8pt;color:#84756b;text-align:center}
@media print{body{padding:14mm}}</style></head><body>
<h1>CCO Analytics · ${period === 'week' ? 'Veckorapport' : period === 'month' ? 'Månadsrapport' : 'Dagsrapport'}</h1>
<p style="color:#84756b;font-size:10pt">Genererad ${new Date().toLocaleString('sv-SE')} av ${req.cco?.role || 'unknown'}</p>
<h2>Operativ Telemetri (nu)</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-lbl">Beredskap</div><div class="kpi-num">${live.readiness}</div></div>
  <div class="kpi"><div class="kpi-lbl">Latency p95</div><div class="kpi-num">${live.latencyP95Ms} ms</div></div>
  <div class="kpi"><div class="kpi-lbl">Öppna incidenter</div><div class="kpi-num">${live.openIncidents}</div></div>
  <div class="kpi"><div class="kpi-lbl">Risk-läge</div><div class="kpi-num">${live.riskLäge}</div></div>
</div>
<h2>Team-prestanda · ${period}</h2>
<table><tr><th>Period</th><th>Konversationer</th><th>Snitt-svarstid</th><th>SLA%</th><th>CSAT</th></tr>
<tr><td>${period}</td><td>${team.conversations}</td><td>${team.avgResponseMin} min</td><td>${team.slaPct}%</td><td>${team.csatAvg} / 5</td></tr></table>
<h2>Leaderboard</h2>
<table><tr><th>#</th><th>Namn</th><th>Score</th><th>Konv.</th><th>Svarstid</th><th>Upsell (kr)</th></tr>
${lb.map((u, i) => `<tr><td>${i + 1}</td><td><strong>${u.name}</strong></td><td>${u.score}</td><td>${u.conversations}</td><td>${u.responseMin} min</td><td>${u.upsellSek.toLocaleString('sv-SE')}</td></tr>`).join('')}
</table>
<footer>Hair TP Clinic · CCO Analytics-export · Sveavägen 42, 113 50 Stockholm · 08-555 123 45<br/>Audit-loggad. Sparas 10 år enligt journallagen.</footer>
<script>setTimeout(()=>window.print(),200)</script>
</body></html>`;

        if (ccoAuditLog)
          ccoAuditLog.append({
            action: 'analytics.export.pdf',
            actor: { role: req.cco?.role },
            detail: { period },
          });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="cco-analytics-${period}.html"`);
        res.send(html);
      }
    );

    console.log('[needs-decision] retention-hard-block + analytics-export monterade');
  } catch (err) {
    console.warn('[needs-decision] kunde inte montera:', err.message);
  }
})();

// ── CCO Customer Timeline + Agreements aggregator (Sprint E: dossier-deep) ──
try {
  const { attachRole, requirePermission } = require('./src/security/ccoRbac');

  // GET /api/v1/cco-customers/:id/timeline
  // Aggregera kronologisk lista: journal-poster + offerter + avtal + send-actions
  app.get(
    '/api/v1/cco-customers/:id/timeline',
    requireCcoAuthenticated,
    attachRole,
    requirePermission('customers.read'),
    async (req, res) => {
      try {
        const customerId = req.params.id;
        const tenantId = req.query.tenantId || req.headers['x-cco-tenant'] || 'hairtpclinic';
        const events = [];

        // Journal-poster
        const journalStore = app.locals.ccoJournalStore;
        if (journalStore?.listEntries) {
          try {
            const entries = await journalStore.listEntries({ tenantId, patientId: customerId });
            const { isPatientPortalJournalVisible } = require('./src/ops/ccoJournalStore');
            for (const e of entries || []) {
              if (!isPatientPortalJournalVisible(e)) continue;
              events.push({
                kind: 'journal',
                subkind: e.journalType || 'general',
                ts: e.signedAt || e.updatedAt || e.createdAt,
                title: e.title || e.journalType || 'Journal-post',
                status: e.locked ? 'signed' : e.status,
                icon: e.locked ? '🔒' : '📝',
                actor: e.signedByName || e.authorName,
                entityId: e.entryId,
                link: `/smart-anteckning.html?entryId=${encodeURIComponent(e.entryId)}`,
                detail: { locked: !!e.locked, correctionOfEntryId: e.correctionOfEntryId || null },
              });
            }
          } catch (err) {
            /* tyst */
          }
        }

        // Offerter
        const offerStore = app.locals.ccoOfferQuickStore;
        if (offerStore?.listForCustomer) {
          try {
            const offers = offerStore.listForCustomer(customerId);
            for (const o of offers) {
              events.push({
                kind: 'offer',
                subkind: o.state,
                ts: o.createdAt,
                title: `Offert: ${o.treatmentLabel || o.id}`,
                status: o.state,
                icon:
                  o.state === 'accepted'
                    ? '✓'
                    : o.state === 'sent'
                      ? '📧'
                      : o.state === 'rejected'
                        ? '✕'
                        : '📋',
                actor: o.authorName,
                entityId: o.id,
                link: `/offerter.html#${o.id}`,
                detail: {
                  priceTotal: o.priceTotal,
                  currency: o.currency,
                  sentAt: o.sentAt,
                  acceptedAt: o.acceptedAt,
                },
              });
              // Lägg även send-events som separata items
              if (o.sentAt) {
                events.push({
                  kind: 'send',
                  subkind: 'offer',
                  ts: o.sentAt,
                  title: `Offert skickad till patient (${o.sentCount}×)`,
                  icon: '📧',
                  entityId: o.id,
                  link: `/offerter.html#${o.id}`,
                  detail: { offerId: o.id, sentCount: o.sentCount },
                });
              }
              if (o.acceptedAt) {
                events.push({
                  kind: 'event',
                  subkind: 'offer_accepted',
                  ts: o.acceptedAt,
                  title: `Patient accepterade offerten`,
                  icon: '✓',
                  entityId: o.id,
                  link: `/offerter.html#${o.id}`,
                  detail: { acceptedVia: o.acceptedVia },
                });
              }
            }
          } catch (err) {
            /* tyst */
          }
        }

        // Avtal
        const agreementStore = app.locals.ccoAgreementQuickStore;
        if (agreementStore?.listForCustomer) {
          try {
            const agreements = agreementStore.listForCustomer(customerId);
            for (const a of agreements) {
              events.push({
                kind: 'agreement',
                subkind: a.state,
                ts: a.createdAt,
                title: a.title,
                status: a.state,
                icon:
                  a.state === 'signed'
                    ? '✍'
                    : a.state === 'sent'
                      ? '📨'
                      : a.state === 'cancelled'
                        ? '✕'
                        : '📄',
                entityId: a.id,
                link: `/offerter.html#${a.id}`,
                detail: {
                  priceTotal: a.priceTotal,
                  signedAt: a.signedAt,
                  signMethod: a.signMethod,
                  signedByName: a.signedByName,
                  promotedFromOfferId: a.promotedFromOfferId,
                },
              });
              if (a.signedAt) {
                events.push({
                  kind: 'event',
                  subkind: 'agreement_signed',
                  ts: a.signedAt,
                  title: `Avtal signerat av ${a.signedByName} (${a.signMethod})`,
                  icon: '🔏',
                  entityId: a.id,
                  link: `/offerter.html#${a.id}`,
                  detail: { signatureHash: a.signatureHash, signMethod: a.signMethod },
                });
              }
            }
          } catch (err) {
            /* tyst */
          }
        }

        // Send-actions (form/consent/file/encounter)
        const sendStore = app.locals.ccoSendActionStore;
        if (sendStore?.listSends) {
          try {
            const sends = sendStore.listSends({ customerId, limit: 100 });
            for (const s of sends) {
              events.push({
                kind: 'send',
                subkind: s.kind,
                ts: s.ts,
                title: `${s.kind === 'form' ? '📋' : s.kind === 'consent' ? '✍' : s.kind === 'file' ? '📎' : '📅'} ${s.kind} skickad${s.dryRun ? ' (dry-run)' : ''}`,
                icon: s.dryRun ? '🟡' : '📧',
                status: s.mode,
                entityId: s.sendId,
                detail: {
                  recipientMasked: s.recipientMasked,
                  subject: s.subject,
                  dryRun: s.dryRun,
                  mode: s.mode,
                },
              });
            }
          } catch (err) {
            /* tyst */
          }
        }

        // Sortera DESC på ts, sortera stabilt på entityId fallback
        events.sort((a, b) => {
          const ta = (a.ts || '').toString();
          const tb = (b.ts || '').toString();
          if (ta === tb) return (a.kind || '').localeCompare(b.kind || '');
          return tb.localeCompare(ta);
        });

        // Aggregate stats
        const byKind = {};
        events.forEach((e) => {
          byKind[e.kind] = (byKind[e.kind] || 0) + 1;
        });

        res.json({
          customerId,
          tenantId,
          count: events.length,
          byKind,
          events: events.slice(0, Number(req.query.limit) || 200),
          evaluatedAt: new Date().toISOString(),
        });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  // GET /api/v1/cco-customers/:id/agreements — kombinerar offers + agreements för flik
  app.get(
    '/api/v1/cco-customers/:id/agreements',
    requireCcoAuthenticated,
    attachRole,
    requirePermission('customers.read'),
    async (req, res) => {
      try {
        const customerId = req.params.id;
        const offers = app.locals.ccoOfferQuickStore?.listForCustomer?.(customerId) || [];
        const agreements = app.locals.ccoAgreementQuickStore?.listForCustomer?.(customerId) || [];
        // Cross-link: för varje agreement med promotedFromOfferId, hitta offer-info
        const offerMap = new Map(offers.map((o) => [o.id, o]));
        const linkedAgreements = agreements.map((a) => ({
          ...a,
          sourceOffer: a.promotedFromOfferId ? offerMap.get(a.promotedFromOfferId) || null : null,
        }));
        // Aggregate stats
        const summary = {
          offerCount: offers.length,
          agreementCount: agreements.length,
          pendingOffers: offers.filter((o) => o.state === 'sent').length,
          acceptedOffers: offers.filter((o) => o.state === 'accepted').length,
          signedAgreements: agreements.filter((a) => a.state === 'signed').length,
          pendingAgreements: agreements.filter((a) => a.state === 'sent').length,
          totalSignedValue: agreements
            .filter((a) => a.state === 'signed')
            .reduce((s, a) => s + (Number(a.priceTotal) || 0), 0),
        };
        res.json({
          customerId,
          summary,
          offers,
          agreements: linkedAgreements,
        });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  // GET /api/v1/cco-customers/:id/journal-feed — unified journal-view
  // Aggregera: ccoJournalStore-entries + patient_assets (journal/photo_*/consent/agreement/form/aisia_report)
  // Inga Drive-länkar. Endast CCO-source. Owner-mandat: cco-no-drive-links-import-only.mdc.
  // RBAC: customers.read (samma som timeline) — strängare per-asset-RBAC görs i download-endpoint.
  app.get(
    '/api/v1/cco-customers/:id/journal-feed',
    requireCcoAuthenticated,
    attachRole,
    requirePermission('customers.read'),
    async (req, res) => {
      try {
        const customerId = req.params.id;
        const tenantId = req.query.tenantId || req.headers['x-cco-tenant'] || 'hairtpclinic';
        const items = [];

        // 1. CCO-journal-entries (nyskrivna)
        const journalStore = app.locals.ccoJournalStore;
        if (journalStore?.listEntries) {
          try {
            const entries = await journalStore.listEntries({ tenantId, patientId: customerId });
            const { isPatientPortalJournalVisible } = require('./src/ops/ccoJournalStore');
            for (const e of entries || []) {
              if (!isPatientPortalJournalVisible(e)) continue;
              items.push({
                source: 'cco_journal',
                category: 'journal',
                subcategory: e.journalType || 'general',
                ts: e.signedAt || e.updatedAt || e.createdAt,
                title: e.title || e.journalType || 'Journal-post',
                icon: e.correctionOfEntryId ? '✏' : e.locked ? '🔒' : '📝',
                author: e.signedByName || e.authorName,
                entityId: e.entryId,
                tenantId: e.tenantId,
                patientId: e.patientId,
                isSigned: !!e.locked,
                isCorrection: !!e.correctionOfEntryId,
                correctionOfEntryId: e.correctionOfEntryId || null,
                correctionReason: e.correctionReason || null,
                correctionCreatedBy: e.correctionCreatedBy || null,
                correctionCreatedAt: e.correctionCreatedAt || null,
                hasPdf: !!(e.pdfArtifactKey || e.pdfStorageKey || e.pdfPath),
                link: `/smart-anteckning.html?entryId=${encodeURIComponent(e.entryId)}`,
                ccoSourceOnly: true,
              });
            }
          } catch (err) {
            /* tyst */
          }
        }

        // 2. patient_assets — CCO asset-store
        // 6 statusar enligt owner-spec:
        //   VISIBLE_ON_PATIENT_CARD + VERIFIED_IN_CCO → renderable (öppningsbara från CCO)
        //   IMPORTED_TO_CCO                          → attention (importerad, ej verifierad)
        //   NEEDS_REVIEW                             → attention (kräver granskning)
        //   LINK_ONLY_BLOCKER                        → attention (ej importerad än, ingen Drive-länk)
        //   FAILED_IMPORT                            → attention (tekniskt fel)
        //   DUPLICATE                                → attention (info — annan asset har samma checksum)
        const assetStore = app.locals.ccoPatientAssetStore;
        const needsAttention = [];
        if (assetStore?.listAssetsForPatient) {
          try {
            const RENDERABLE = new Set(['VERIFIED_IN_CCO', 'VISIBLE_ON_PATIENT_CARD']);
            const ATTENTION = new Set([
              'NEEDS_REVIEW',
              'LINK_ONLY_BLOCKER',
              'IMPORTED_TO_CCO',
              'FAILED_IMPORT',
              'DUPLICATE',
            ]);
            const ICON = {
              journal: '📄',
              photo_before: '📸',
              photo_during: '📸',
              photo_after: '📸',
              consent: '✍',
              agreement: '📑',
              form: '📋',
              aisia_report: '🔬',
              other: '📎',
            };
            const STATUS_LABEL = {
              VISIBLE_ON_PATIENT_CARD: 'Synlig',
              VERIFIED_IN_CCO: 'Verifierad',
              IMPORTED_TO_CCO: 'Importerad (ej verifierad)',
              NEEDS_REVIEW: 'Behöver granskning',
              LINK_ONLY_BLOCKER: 'Ej importerad — endast referens',
              FAILED_IMPORT: 'Import misslyckades',
              DUPLICATE: 'Dubblett (samma fil)',
            };
            const STATUS_TONE = {
              VISIBLE_ON_PATIENT_CARD: 'ok',
              VERIFIED_IN_CCO: 'ok',
              IMPORTED_TO_CCO: 'warn',
              NEEDS_REVIEW: 'warn',
              LINK_ONLY_BLOCKER: 'blocker',
              FAILED_IMPORT: 'blocker',
              DUPLICATE: 'info',
            };
            const STATUS_HINT = {
              VISIBLE_ON_PATIENT_CARD: 'Filen kan öppnas direkt i CCO.',
              VERIFIED_IN_CCO: 'Filen är verifierad och kan öppnas i CCO.',
              IMPORTED_TO_CCO: 'Filen är importerad men ännu inte verifierad.',
              NEEDS_REVIEW:
                'Filen kräver manuell granskning innan den blir synlig på patientkortet.',
              LINK_ONLY_BLOCKER:
                'Filen är inte importerad ännu — endast referens till källan. Ingen Drive-länk visas.',
              FAILED_IMPORT: 'Tekniskt fel vid import — kontakta migrationsteamet.',
              DUPLICATE: 'Filen har samma checksum som en annan asset. Visas inte separat.',
            };
            const { assetDisplayLabel } = require('./src/ops/ccoAssetNaming/assetDisplayLabel');
            const assets =
              assetStore.listAssetsForPatient(customerId, {}, { actor: { role: 'system' } }) || [];
            for (const a of assets) {
              const isRenderable = RENDERABLE.has(a.status);
              const isAttention = ATTENTION.has(a.status);
              if (!isRenderable && !isAttention) continue;

              const cat = a.category || 'other';
              const baseTitle = assetDisplayLabel(a, {
                fallback:
                  cat === 'journal'
                    ? 'Historisk journal (PDF)'
                    : cat === 'photo_before'
                      ? 'Foto: före behandling'
                      : cat === 'photo_during'
                        ? 'Foto: under behandling'
                        : cat === 'photo_after'
                          ? 'Foto: efter behandling'
                          : cat === 'consent'
                            ? 'Signerat samtycke'
                            : cat === 'agreement'
                              ? 'Signerat avtal'
                              : cat === 'form'
                                ? 'Formulär (signerat)'
                                : cat === 'aisia_report'
                                  ? 'Aisia-rapport'
                                  : a.originalFileName || 'Bilaga',
              });

              // Owner-skärpning: aldrig Drive-URL ut i UI. Om binär saknas → null-link.
              const downloadLink = isRenderable ? `/api/v1/cco/assets/${a.id}/download` : null;

              const item = {
                source: 'patient_asset',
                category: cat,
                subcategory: a.sourceSystem || null,
                ts: a.documentDate || a.importedAt || a.createdAt,
                captureDate: a.captureDate || null,
                captureDateTime: a.captureDateTime || null,
                captureDateSource: a.captureDateSource || null,
                captureDateConfidence: a.captureDateConfidence || null,
                captureDateMismatch: !!a.captureDateMismatch,
                title: baseTitle,
                icon: ICON[cat] || '📎',
                encounterId: a.encounterId || null,
                entityId: a.id,
                mimeType: a.mimeType,
                fileSize: a.fileSize || null,
                link: downloadLink,
                thumbnailLink:
                  isRenderable && cat.startsWith('photo_')
                    ? `/api/v1/cco/assets/${a.id}/thumbnail`
                    : null,
                hasPdf: a.mimeType === 'application/pdf',
                ccoSourceOnly: true,
                assetStatus: a.status,
                assetStatusLabel: STATUS_LABEL[a.status] || a.status,
                assetStatusTone: STATUS_TONE[a.status] || 'info',
                assetStatusHint: STATUS_HINT[a.status] || null,
                isRenderable,
                needsAttention: isAttention,
                displayName: a.displayName || null,
                patientCardSection: a.patientCardSection || null,
                imageStage: a.imageStage || null,
                bodyArea: a.bodyArea || null,
                selectedFor: Array.isArray(a.technicalInfo?.selectedFor)
                  ? a.technicalInfo.selectedFor
                  : [],
                sourceAnnotationId: a.technicalInfo?.sourceAnnotationId || null,
                sourceAssetId: a.technicalInfo?.sourceAssetId || null,
                uiStatus: a.uiStatus || null,
                sourceSystem: a.sourceSystem || null,
                legalStatus: a.technicalInfo?.legalStatus || null,
                needsClassification:
                  a.uiStatus === 'needs_classification' ||
                  a.technicalInfo?.needsClassification === true,
                importBadge: a.technicalInfo?.importBadge || (a.sourceSystem ? 'imported' : null),
                attachmentPending: a.technicalInfo?.attachmentPending === true,
                pdfPending: a.technicalInfo?.pdfPending === true,
                binaryStatus: a.technicalInfo?.binaryStatus || null,
                sourceAvailability: a.technicalInfo?.sourceAvailability || null,
                metadataBadge: a.technicalInfo?.badge || null,
                pdfStatus: a.technicalInfo?.pdfStatus || null,
              };

              if (
                a.uiStatus === 'imported_metadata_only' ||
                a.technicalInfo?.binaryStatus === 'missing_from_getaccept'
              ) {
                item.title = 'Avtal · signerad · PDF saknas';
                item.hasPdf = false;
                item.metadataOnly = true;
                item.link = null;
                item.badge = a.technicalInfo?.badge || 'PDF SAKNAS / NEEDS OWNER SOURCE';
                item.assetStatusLabel = 'Metadata · PDF saknas';
                item.assetStatusTone = 'warn';
                item.assetStatusHint =
                  'Signerat avtal i CCO som metadata. PDF saknas i GetAccept — NEEDS_OWNER_SOURCE.';
              }
              if (a.sourceSystem === 'getaccept_import') {
                item.subcategory = 'GETACCEPT';
              }
              if (a.technicalInfo?.legalStatus === 'LEGAL_CONFIRMED') {
                item.legalStatusLabel = 'LEGAL_CONFIRMED';
              }
              if (a.technicalInfo?.sourceAvailability === 'needs_owner_source') {
                item.needsOwnerSource = true;
              }

              if (isRenderable) items.push(item);
              if (isAttention) needsAttention.push(item);
            }
          } catch (err) {
            /* tyst */
          }
        }

        // Sortera DESC på ts
        items.sort((a, b) => {
          const ta = (a.ts || '').toString();
          const tb = (b.ts || '').toString();
          return tb.localeCompare(ta);
        });

        // Counters
        const counters = {
          total: items.length,
          byCategory: {},
          bySource: { cco_journal: 0, patient_asset: 0 },
          signed: 0,
          corrections: 0,
          hasPdf: 0,
          needsAttention: needsAttention.length,
          needsAttentionByStatus: {},
        };
        for (const i of items) {
          counters.byCategory[i.category] = (counters.byCategory[i.category] || 0) + 1;
          counters.bySource[i.source] = (counters.bySource[i.source] || 0) + 1;
          if (i.isSigned) counters.signed += 1;
          if (i.isCorrection) counters.corrections += 1;
          if (i.hasPdf) counters.hasPdf += 1;
        }
        for (const a of needsAttention) {
          counters.needsAttentionByStatus[a.assetStatus] =
            (counters.needsAttentionByStatus[a.assetStatus] || 0) + 1;
        }

        // Group by encounter (for photo-stacks)
        const photoGroups = {};
        for (const i of items) {
          if (i.encounterId && i.category.startsWith('photo_')) {
            if (!photoGroups[i.encounterId]) photoGroups[i.encounterId] = [];
            photoGroups[i.encounterId].push(i.entityId);
          }
        }

        // Sektioner per owner-spec — 7 st separata:
        //   journals, photos, documents, consents, agreements, forms, aisia
        const sections = {
          journals: items.filter((i) => i.category === 'journal'),
          photos: items.filter((i) => i.category && i.category.startsWith('photo_')),
          documents: items.filter((i) => i.category === 'other'),
          consents: items.filter((i) => i.category === 'consent'),
          agreements: items.filter((i) => i.category === 'agreement'),
          forms: items.filter((i) => i.category === 'form'),
          aisia: items.filter((i) => i.category === 'aisia_report'),
        };
        const sectionCounts = Object.fromEntries(
          Object.entries(sections).map(([k, v]) => [k, v.length])
        );

        res.json({
          customerId,
          tenantId,
          evaluatedAt: new Date().toISOString(),
          counters,
          sectionCounts,
          photoGroups,
          items: items.slice(0, Number(req.query.limit) || 500),
          sections,
          needsAttention,
          ownerMandate: 'no_drive_links_in_ui',
        });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  // GET /api/v1/cco-customers/:id/journal-timeline — journalflöde kronologiskt
  // Aggregera event-typer:
  //   journal_draft_created, journal_signed, pdf_archived,
  //   correction_created, correction_signed,
  //   asset_imported, asset_verified, asset_visible_on_card,
  //   asset_needs_review, asset_link_only, asset_failed, asset_duplicate,
  //   photo_uploaded, document_imported
  // Plus thread-grupp: original-entry + dess rättelser bundlade.
  // Ingen Drive-länk. Endast CCO-source.
  app.get(
    '/api/v1/cco-customers/:id/journal-timeline',
    requireCcoAuthenticated,
    attachRole,
    requirePermission('customers.read'),
    async (req, res) => {
      try {
        const customerId = req.params.id;
        const tenantId = req.query.tenantId || req.headers['x-cco-tenant'] || 'hairtpclinic';
        const events = [];

        const STATUS_TONE = {
          VISIBLE_ON_PATIENT_CARD: 'ok',
          VERIFIED_IN_CCO: 'ok',
          IMPORTED_TO_CCO: 'warn',
          NEEDS_REVIEW: 'warn',
          LINK_ONLY_BLOCKER: 'blocker',
          FAILED_IMPORT: 'blocker',
          DUPLICATE: 'info',
        };

        // 1. Journal-events — flera per entry (draft → signed → pdf)
        const journalStore = app.locals.ccoJournalStore;
        const journalEntries = [];
        if (journalStore?.listEntries) {
          try {
            const entries =
              (await journalStore.listEntries({ tenantId, patientId: customerId })) || [];
            const { isPatientPortalJournalVisible } = require('./src/ops/ccoJournalStore');
            for (const e of entries) {
              if (!isPatientPortalJournalVisible(e)) continue;
              journalEntries.push(e);
              const isCorrection = !!e.correctionOfEntryId;

              // Är detta ett formulär (hälsodeklaration/friskförsäkran etc)?
              const FORM_JOURNAL_TYPES = new Set(['health_declaration', 'fitness_certificate']);
              const isForm =
                FORM_JOURNAL_TYPES.has(e.journalType) || e.source === 'cco_form_submission';

              // a) Draft created — annan label för formulär vs journal vs rättelse
              const createdType = isCorrection
                ? 'correction_created'
                : isForm
                  ? 'form_submitted'
                  : 'journal_draft_created';
              const createdTitle = isCorrection
                ? 'Rättelse skapad'
                : isForm
                  ? e.journalType === 'health_declaration'
                    ? 'Hälsodeklaration ifylld'
                    : e.journalType === 'fitness_certificate'
                      ? 'Friskförsäkran ifylld'
                      : 'Formulär ifyllt'
                  : 'Journal skapad';
              const createdIcon = isCorrection ? '✏' : isForm ? '📋' : '📝';
              events.push({
                type: createdType,
                ts: e.createdAt || e.updatedAt,
                title: createdTitle,
                icon: createdIcon,
                tone: 'info',
                actor: e.authorName || e.signedByName,
                entityId: e.entryId,
                relatedEntryId: e.correctionOfEntryId || null,
                detail: {
                  journalType: e.journalType,
                  title: e.title,
                  isForm,
                  isCorrection,
                  reason: e.correctionReason || null,
                },
              });

              // b) Signed (om signerad)
              if (e.locked && e.signedAt) {
                const signedType = isCorrection
                  ? 'correction_signed'
                  : isForm
                    ? 'form_signed'
                    : 'journal_signed';
                const signedTitle = isCorrection
                  ? 'Rättelse signerad'
                  : isForm
                    ? e.journalType === 'health_declaration'
                      ? 'Hälsodeklaration signerad'
                      : e.journalType === 'fitness_certificate'
                        ? 'Friskförsäkran signerad'
                        : 'Formulär signerat'
                    : 'Journal signerad';
                events.push({
                  type: signedType,
                  ts: e.signedAt,
                  title: signedTitle,
                  icon: '🔒',
                  tone: 'ok',
                  actor: e.signedByName,
                  entityId: e.entryId,
                  relatedEntryId: e.correctionOfEntryId || null,
                  detail: {
                    journalType: e.journalType,
                    isForm,
                    pdfArchived: !!(e.pdfPath || e.pdfStorageKey),
                    tamperHash: e.pdfTamperHash || null,
                  },
                });
              }

              // c) PDF archived (om PDF finns)
              if (e.pdfGeneratedAt) {
                events.push({
                  type: 'pdf_archived',
                  ts: e.pdfGeneratedAt,
                  title: 'PDF arkiverad i CCO secure storage',
                  icon: '📄',
                  tone: 'ok',
                  entityId: e.entryId,
                  relatedEntryId: e.correctionOfEntryId || null,
                  detail: {
                    sizeBytes: e.pdfSizeBytes || null,
                    tamperHash: e.pdfTamperHash || null,
                    ccoSourceOnly: true,
                  },
                });
              }
            }
          } catch (err) {
            /* tyst */
          }
        }

        // 2. Asset-events — alla statusar, inte bara visible
        const assetStore = app.locals.ccoPatientAssetStore;
        const { assetDisplayLabel } = require('./src/ops/ccoAssetNaming/assetDisplayLabel');
        const allAssets = [];
        if (assetStore?.listAssetsForPatient) {
          try {
            const assets =
              assetStore.listAssetsForPatient(customerId, {}, { actor: { role: 'system' } }) || [];
            for (const a of assets) {
              allAssets.push(a);
              const cat = a.category || 'other';

              // a) Asset imported (basevent)
              const typeByCat = cat.startsWith('photo_')
                ? 'photo_uploaded'
                : cat === 'journal'
                  ? 'journal_pdf_asset_imported'
                  : cat === 'consent'
                    ? 'consent_imported'
                    : cat === 'agreement'
                      ? 'agreement_imported'
                      : cat === 'form'
                        ? 'form_imported'
                        : cat === 'aisia_report'
                          ? 'aisia_imported'
                          : 'document_imported';
              const titleByCat = cat.startsWith('photo_')
                ? assetDisplayLabel(a, { fallback: 'Bild importerad' })
                : cat === 'journal'
                  ? assetDisplayLabel(a, { fallback: 'Journal-PDF i CCO storage' })
                  : cat === 'consent'
                    ? assetDisplayLabel(a, { fallback: 'Samtycke importerat' })
                    : cat === 'agreement'
                      ? assetDisplayLabel(a, { fallback: 'Avtal importerat' })
                      : cat === 'form'
                        ? assetDisplayLabel(a, { fallback: 'Formulär importerat' })
                        : cat === 'aisia_report'
                          ? assetDisplayLabel(a, { fallback: 'Aisia-rapport' })
                          : assetDisplayLabel(a, { fallback: 'Dokument importerat' });
              const iconByCat = cat.startsWith('photo_')
                ? '📸'
                : cat === 'journal'
                  ? '📄'
                  : cat === 'consent'
                    ? '✍'
                    : cat === 'agreement'
                      ? '📑'
                      : cat === 'form'
                        ? '📋'
                        : cat === 'aisia_report'
                          ? '🔬'
                          : '📎';

              events.push({
                type: typeByCat,
                subtype: 'asset_created',
                ts: a.importedAt || a.createdAt,
                title: titleByCat,
                icon: iconByCat,
                tone: STATUS_TONE[a.status] || 'info',
                entityId: a.id,
                relatedEntryId: a.sourceRecordId || null,
                detail: {
                  category: cat,
                  sourceSystem: a.sourceSystem,
                  assetStatus: a.status,
                  mimeType: a.mimeType,
                  fileSize: a.fileSize || null,
                  encounterId: a.encounterId || null,
                  visitLabel: a.visitLabel || null,
                  patientCardSection: a.patientCardSection || null,
                  displayName: a.displayName || null,
                  hasStorageKey: !!a.storageKey,
                  hasChecksum: !!a.checksum,
                  ccoSourceOnly: true,
                },
              });

              if (a.encounterId && a.visitLabel) {
                events.push({
                  type: 'encounter_asset_linked',
                  ts: a.importedAt || a.createdAt,
                  title: `Kopplad till ${a.visitLabel}`,
                  icon: '🔗',
                  tone: 'ok',
                  entityId: a.id,
                  detail: {
                    encounterId: a.encounterId,
                    visitLabel: a.visitLabel,
                    category: cat,
                    ccoSourceOnly: true,
                  },
                });
              }

              if (
                a.namingStatus === 'manual_resolved' &&
                a.status === 'VISIBLE_ON_PATIENT_CARD' &&
                cat.startsWith('photo_')
              ) {
                events.push({
                  type: 'photo_approved',
                  ts: a.reviewedAt || a.importedAt || a.createdAt,
                  title: assetDisplayLabel(a, { fallback: 'Bild godkänd' }),
                  icon: '✓',
                  tone: 'ok',
                  entityId: a.id,
                  detail: {
                    imageStage: a.imageStage || null,
                    bodyArea: a.bodyArea || null,
                    approvedCategory: a.approvedCategory || cat,
                    displayName: a.displayName || null,
                    encounterId: a.encounterId || null,
                    visitLabel: a.visitLabel || null,
                    ccoSourceOnly: true,
                  },
                });
              }

              // b) Status-history events (varje transition i statusHistory)
              const history = Array.isArray(a.statusHistory) ? a.statusHistory : [];
              for (const h of history) {
                if (!h.to || !h.ts) continue;
                const tone = STATUS_TONE[h.to] || 'info';
                const labelMap = {
                  IMPORTED_TO_CCO: 'Asset importerad',
                  VERIFIED_IN_CCO: 'Asset verifierad',
                  VISIBLE_ON_PATIENT_CARD: 'Asset synlig på patientkort',
                  NEEDS_REVIEW: 'Asset behöver granskning',
                  LINK_ONLY_BLOCKER: 'Asset blockerad (ej importerad)',
                  FAILED_IMPORT: 'Asset-import misslyckades',
                  DUPLICATE: 'Asset markerad som dubblett',
                  REJECTED: 'Asset avvisad',
                };
                const label = labelMap[h.to] || 'Status: ' + h.to;
                events.push({
                  type: 'asset_status_transition',
                  ts: h.ts,
                  title: label,
                  icon:
                    tone === 'ok' ? '✓' : tone === 'warn' ? '⚠' : tone === 'blocker' ? '⛔' : 'ℹ',
                  tone,
                  entityId: a.id,
                  relatedEntryId: a.sourceRecordId || null,
                  detail: {
                    from: h.from,
                    to: h.to,
                    reason: h.reason || null,
                    category: cat,
                    assetStatus: h.to,
                  },
                });
              }
            }
          } catch (err) {
            /* tyst */
          }
        }

        // 3. Scalp analysis timeline (Aisia DS-3 MVP — gated)
        const scalpStore = config.enableAisiaScalpAnalysis
          ? app.locals.ccoScalpAnalysisStore
          : null;
        if (scalpStore?.listTimelineForPatient) {
          try {
            const scalpEvents = scalpStore.listTimelineForPatient(customerId) || [];
            const scalpTitleMap = {
              scalp_analysis_imported: 'Hår-/scalpanalys importerad',
              scalp_image_added: 'Scalp-bild tillagd',
              scalp_metrics_added: 'Scalp-mätvärden tillagda',
              scalp_analysis_verified: 'Scalp-analys verifierad',
              scalp_comparison_created: 'Scalp-jämförelse skapad',
            };
            for (const se of scalpEvents) {
              events.push({
                type: se.type,
                subtype: 'scalp_analysis',
                ts: se.ts,
                title: scalpTitleMap[se.type] || se.type,
                icon: '🔬',
                tone: se.type === 'scalp_analysis_verified' ? 'ok' : 'info',
                entityId: se.sessionId || se.comparisonId || null,
                detail: {
                  sessionId: se.sessionId || null,
                  comparisonId: se.comparisonId || null,
                  zone: se.zone || null,
                  count: se.count || null,
                  ccoSourceOnly: true,
                },
              });
            }
          } catch (err) {
            /* tyst */
          }
        }

        // 4. Offerter (legacy GetAccept/CCO quick index — metadata only)
        try {
          const offersPath = require('node:path').join(__dirname, 'data/cco-offers-quick.json');
          const offersRaw = require('node:fs').readFileSync(offersPath, 'utf8');
          const offers = JSON.parse(offersRaw).offers || [];
          for (const o of offers) {
            if (o.customerId !== customerId) continue;
            events.push({
              type: o.sentAt ? 'offer_sent' : 'offer_created',
              ts: o.sentAt || o.createdAt || o.updatedAt,
              title: o.title || 'Offert',
              icon: '💼',
              tone: 'info',
              entityId: o.offerId || o.id || null,
              detail: { status: o.status || null, ccoSourceOnly: true },
            });
          }
        } catch {
          /* optional */
        }

        // 5. Commercial-store quote opens — kundöppningar av offert.
        try {
          const commercialStore = app.locals.ccoCommercialStore;
          let commercialCase = null;
          if (commercialStore?.getPatientRegisterCase) {
            commercialCase =
              (await commercialStore.getPatientRegisterCase({ tenantId, patientId: customerId })) ||
              (tenantId !== 'hair-tp-clinic'
                ? await commercialStore.getPatientRegisterCase({
                    tenantId: 'hair-tp-clinic',
                    patientId: customerId,
                  })
                : null);
          }
          for (const event of buildQuoteOpenTimelineEvents(commercialCase || {})) {
            events.push(event);
          }
        } catch {
          /* optional */
        }

        // 6. Behandlingsplan (journal consultation_plan)
        for (const entry of journalEntries) {
          if (entry.journalType !== 'consultation_plan') continue;
          events.push({
            type: 'treatment_plan_created',
            ts: entry.signedAt || entry.createdAt,
            title: entry.title || 'Behandlingsplan skapad',
            icon: '📋',
            tone: entry.locked ? 'ok' : 'info',
            entityId: entry.entryId,
            detail: { journalType: entry.journalType, ccoSourceOnly: true },
          });
        }

        // Sortera kronologiskt DESC (nyast först)
        events.sort((a, b) => {
          const ta = (a.ts || '').toString();
          const tb = (b.ts || '').toString();
          return tb.localeCompare(ta);
        });

        // Thread-grupper: original + dess rättelser
        const threads = {};
        for (const entry of journalEntries) {
          if (entry.correctionOfEntryId) {
            const root = entry.correctionOfEntryId;
            if (!threads[root]) threads[root] = { rootEntryId: root, corrections: [] };
            threads[root].corrections.push({
              correctionEntryId: entry.entryId,
              correctionReason: entry.correctionReason || null,
              correctionCreatedBy: entry.correctionCreatedBy || null,
              correctionCreatedAt: entry.correctionCreatedAt || entry.createdAt,
              signedAt: entry.signedAt || null,
              locked: !!entry.locked,
              hasPdf: !!(entry.pdfPath || entry.pdfStorageKey),
            });
          }
        }
        // Inkludera root-metadata
        for (const root of Object.keys(threads)) {
          const rootEntry = journalEntries.find((e) => e.entryId === root);
          if (rootEntry) {
            threads[root].rootTitle = rootEntry.title || null;
            threads[root].rootSignedAt = rootEntry.signedAt || null;
            threads[root].rootLocked = !!rootEntry.locked;
          }
        }

        // Counters per event-typ + status
        const counters = {
          totalEvents: events.length,
          byType: {},
          byTone: { ok: 0, warn: 0, blocker: 0, info: 0 },
          journalEntries: journalEntries.length,
          signedEntries: journalEntries.filter((e) => e.locked).length,
          corrections: journalEntries.filter((e) => e.correctionOfEntryId).length,
          assets: allAssets.length,
          assetsByStatus: {},
          threads: Object.keys(threads).length,
        };
        for (const ev of events) {
          counters.byType[ev.type] = (counters.byType[ev.type] || 0) + 1;
          counters.byTone[ev.tone] = (counters.byTone[ev.tone] || 0) + 1;
        }
        for (const a of allAssets) {
          counters.assetsByStatus[a.status] = (counters.assetsByStatus[a.status] || 0) + 1;
        }

        res.json({
          customerId,
          tenantId,
          evaluatedAt: new Date().toISOString(),
          counters,
          threads,
          events: events.slice(0, Number(req.query.limit) || 500),
          ownerMandate: 'no_drive_links_in_ui',
        });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  console.log(
    '[cco-customer-deep] monterad: GET /api/v1/cco-customers/:id/{timeline|agreements|journal-feed|journal-timeline} (customers.read · journal.read_any)'
  );

  // ── CCO Forms — P0 Journalformulär (Hälsodeklaration + Friskförsäkran) ──
  // POST /api/v1/cco-forms/submit
  //   Body: { tenantId, patientId, encounterId?, formType, fields, signedByName?, autoSign? }
  //   formType: 'health_declaration' | 'fitness_certificate' | 'consultation_plan' | ...
  //   autoSign: true → signEntry direkt (utlöser #222-hook = PDF + asset)
  //
  // Inga Drive-länkar. Ingen extern AI. Allt går genom befintlig journal-pipeline.
  app.post(
    '/api/v1/cco-forms/submit',
    express.json({ limit: '256kb' }),
    attachRole,
    requirePermission('journal.write'),
    async (req, res) => {
      try {
        const journalStore = app.locals.ccoJournalStore;
        if (!journalStore?.upsertEntry)
          return res.status(503).json({ error: 'journal_store_unavailable' });

        const {
          tenantId,
          patientId,
          encounterId,
          formType,
          fields,
          signedByName,
          autoSign,
          formVariant,
          title,
        } = req.body || {};
        if (!tenantId || !patientId || !formType) {
          return res.status(400).json({ error: 'tenantId, patientId, formType krävs' });
        }
        // Endast tillåtna form-typer (motsvarar journal-types)
        const ALLOWED_FORM_TYPES = new Set([
          'health_declaration',
          'fitness_certificate',
          'consultation_plan',
          'follow_up',
        ]);
        if (!ALLOWED_FORM_TYPES.has(formType)) {
          return res.status(400).json({
            error: 'invalid_form_type',
            allowed: [...ALLOWED_FORM_TYPES],
          });
        }

        const actor = {
          userId: req.headers['x-cco-user'] || signedByName || 'cco-form-submit',
          displayName: signedByName || req.headers['x-cco-user'] || req.cco?.role || 'staff',
          role: req.cco?.role || 'staff',
        };

        // 1. Skapa journal-entry från formulär-submission
        const titleByType = {
          health_declaration: 'Hälsodeklaration',
          fitness_certificate: 'Friskförsäkran',
          consultation_plan: 'Konsultationsplan',
          follow_up: 'Uppföljning',
        };
        const draft = await journalStore.upsertEntry({
          tenantId,
          patientId,
          treatmentEncounterId: encounterId || null,
          journalType: formType,
          formVariant: formVariant || (tenantId === 'curatiio' ? null : 'hair_tp'),
          title: title || titleByType[formType] || 'Formulär',
          source: 'cco_form_submission',
          fields: fields || {},
          actor,
        });

        if (ccoAuditLog) {
          ccoAuditLog.append({
            action: 'journal.form_submitted',
            actor,
            target: { kind: 'journal_entry', id: draft.entryId, tenantId },
            result: 'ok',
            detail: {
              patientId,
              encounterId: encounterId || null,
              formType,
              fieldCount: Object.keys(fields || {}).length,
              autoSign: !!autoSign,
              ccoSourceOnly: true,
            },
          });
        }

        // 2. Auto-sign om begärt — triggar #222-hooken = PDF + asset
        let signed = null;
        if (autoSign) {
          signed = await journalStore.signEntry({
            tenantId,
            patientId,
            entryId: draft.entryId,
            actor,
          });
        }

        res.json({
          ok: true,
          entry: signed || draft,
          autoSigned: !!signed,
          willGeneratePdf: !!signed,
          willCreateAsset: !!signed,
          ccoSourceOnly: true,
        });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-forms/:entryId/sign — signera ett tidigare submittat formulär
  app.post(
    '/api/v1/cco-forms/:entryId/sign',
    express.json({ limit: '8kb' }),
    attachRole,
    requirePermission('journal.write'),
    async (req, res) => {
      try {
        const journalStore = app.locals.ccoJournalStore;
        if (!journalStore?.signEntry)
          return res.status(503).json({ error: 'journal_store_unavailable' });
        const { tenantId, patientId } = req.body || {};
        if (!tenantId || !patientId)
          return res.status(400).json({ error: 'tenantId + patientId krävs' });
        const actor = {
          userId: req.headers['x-cco-user'] || 'cco-form-sign',
          displayName: req.headers['x-cco-user'] || req.cco?.role,
          role: req.cco?.role || 'staff',
        };
        const signed = await journalStore.signEntry({
          tenantId,
          patientId,
          entryId: req.params.entryId,
          actor,
        });
        if (ccoAuditLog) {
          ccoAuditLog.append({
            action: 'journal.form_signed',
            actor,
            target: { kind: 'journal_entry', id: signed.entryId, tenantId },
            result: 'ok',
            detail: { patientId, journalType: signed.journalType, ccoSourceOnly: true },
          });
        }
        res.json({ ok: true, entry: signed });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  // GET /api/v1/cco-forms/patient/:patientId/missing?treatment=fue&encounterId=...
  // Returnerar blocker-status: vilka formulär krävs för behandlingen,
  // vilka finns signerade i CCO-journalen, vilka saknas.
  app.get(
    '/api/v1/cco-forms/patient/:patientId/missing',
    attachRole,
    requirePermission('customers.read'),
    async (req, res) => {
      try {
        const journalStore = app.locals.ccoJournalStore;
        const tenantId = req.query.tenantId || req.headers['x-cco-tenant'] || 'hair_tp';
        const treatment = String(req.query.treatment || '').toLowerCase();
        const encounterId = req.query.encounterId || null;
        if (!treatment) return res.status(400).json({ error: 'treatment query-param krävs' });

        // Läs treatment-requirements
        let requirements = {};
        try {
          const reqFile = JSON.parse(
            require('fs').readFileSync(
              path.join(__dirname, 'config/cco-treatment-document-requirements.json'),
              'utf8'
            )
          );
          requirements = reqFile.treatments?.[treatment]?.requiredDocuments || {};
        } catch (_) {
          /* tyst */
        }

        // Form-typer som matchar journal-store-types
        const FORM_TO_JOURNAL_TYPE = {
          healthDeclaration: 'health_declaration',
          fitnessCertificate: 'fitness_certificate',
        };

        // Hämta patient-journal-entries
        const entries =
          (await journalStore.listEntries({ tenantId, patientId: req.params.patientId })) || [];

        const missing = [];
        const fulfilled = [];
        for (const [docKey, docReq] of Object.entries(requirements)) {
          if (!docReq.required) continue;
          const journalType = FORM_TO_JOURNAL_TYPE[docKey];
          if (!journalType) continue; // Inte ett formulär — kanske avtal/samtycke (annan flow)

          const match = entries.find(
            (e) =>
              e.journalType === journalType &&
              e.locked === true &&
              (!encounterId || e.treatmentEncounterId === encounterId)
          );
          const item = {
            docKey,
            journalType,
            required: !!docReq.required,
            blocking: !!docReq.blocking,
            templateRef: docReq.templateRef || null,
            deadlineHoursBefore: docReq.deadlineHoursBefore || null,
            fulfilled: !!match,
            fulfillingEntryId: match?.entryId || null,
            signedAt: match?.signedAt || null,
            encounterId: match?.treatmentEncounterId || null,
          };
          if (item.fulfilled) fulfilled.push(item);
          else missing.push(item);
        }

        const blockingMissing = missing.filter((m) => m.blocking);
        res.json({
          patientId: req.params.patientId,
          tenantId,
          treatment,
          encounterId,
          readyForTreatment: blockingMissing.length === 0,
          counts: {
            required: missing.length + fulfilled.length,
            fulfilled: fulfilled.length,
            missing: missing.length,
            blockingMissing: blockingMissing.length,
          },
          missing,
          fulfilled,
          evaluatedAt: new Date().toISOString(),
        });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  console.log(
    '[cco-forms] monterad: POST /api/v1/cco-forms/submit + /:entryId/sign · GET /patient/:id/missing'
  );
} catch (err) {
  console.warn('[cco-customer-deep] kunde inte montera:', err.message);
}

// ── CCO ID Verification Store (Steg 3.2 av Communication & Compliance audit) ──
(async () => {
  try {
    const { createCcoIdVerificationStore } = require('./src/ops/ccoIdVerificationStore');
    const { attachRole, requirePermission } = require('./src/security/ccoRbac');
    const expressId = require('express');
    const jsonParserId = expressId.json({ limit: '8kb' });

    const idStore = await createCcoIdVerificationStore({
      filePath: path.join(__dirname, 'data', 'cco-id-verifications.json'),
      auditLog: ccoAuditLog,
    });
    app.locals.ccoIdVerificationStore = idStore;

    app.get(
      '/api/v1/cco-id-verify/customer/:id',
      attachRole,
      requirePermission('id_verify.read'),
      async (req, res) => {
        try {
          res.json(await idStore.getStatus(req.params.id));
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.post(
      '/api/v1/cco-id-verify/customer/:id',
      attachRole,
      requirePermission('id_verify.write'),
      jsonParserId,
      async (req, res) => {
        try {
          const { state, last4, docType, verifiedBy, note } = req.body || {};
          const result = await idStore.setStatus(req.params.id, state, {
            role: req.cco?.role,
            last4,
            docType,
            verifiedBy,
            note,
          });
          res.json(result);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.get(
      '/api/v1/cco-id-verify/stats',
      attachRole,
      requirePermission('id_verify.read'),
      (req, res) => {
        res.json(idStore.stats());
      }
    );

    console.log(
      '[cco-id-verify] monterad: GET/POST /api/v1/cco-id-verify/customer/:id + /stats (id_verify.read/write)'
    );
  } catch (err) {
    console.warn('[cco-id-verify] kunde inte montera:', err.message);
  }
})();

// ── CCO Notification Feed (Steg 4 av Communication & Compliance audit) ──
(async () => {
  try {
    const {
      createCcoNotificationFeedStore,
      NOTIFICATION_TYPES,
    } = require('./src/ops/ccoNotificationFeedStore');
    const { createCcoNotificationReadStore } = require('./src/ops/ccoNotificationReadStore');
    const { attachRole, requirePermission } = require('./src/security/ccoRbac');
    const expressN = require('express');
    const jsonParserN = expressN.json({ limit: '8kb' });

    const readStore = await createCcoNotificationReadStore({
      filePath: path.join(__dirname, 'data', 'cco-notification-reads.json'),
    });

    const feedStore = createCcoNotificationFeedStore({
      auditLog: ccoAuditLog,
      bookingCaseStore: { list: () => app.locals.ccoBookingCaseStore?.list?.() || [] },
      complianceScanStore: {
        getActiveFlags: () =>
          app.locals.ccoComplianceScanStore?.getActiveFlags?.() || { flags: [] },
      },
      idVerificationStore: {
        getStatus: (cid) => app.locals.ccoIdVerificationStore?.getStatus?.(cid),
      },
      agreementStore: {
        listForCustomer: (cid) => app.locals.ccoAgreementQuickStore?.listForCustomer?.(cid) || [],
      },
      journalStore: {
        listAllEntries: async (args) => app.locals.ccoJournalStore?.listAllEntries?.(args) || [],
      },
      readStore,
    });
    app.locals.ccoNotificationFeedStore = feedStore;
    app.locals.ccoNotificationReadStore = readStore;

    // GET /api/v1/cco-notifications/feed — unified feed per role
    app.get(
      '/api/v1/cco-notifications/feed',
      attachRole,
      requirePermission('notifications.read'),
      async (req, res) => {
        try {
          const role = req.query.role || req.cco?.role;
          const userId = req.headers['x-cco-user'] || role;
          const sinceHours = Number(req.query.sinceHours) || 72;
          const limit = Number(req.query.limit) || 100;

          // Optional: kör blocking-evaluator över ett urval kunder
          // (för att hålla feed snabb, evalueras endast om query.includeBlocking=true)
          let customerEvalResults = null;
          if (req.query.includeBlocking === 'true' && req.query.customerIds) {
            const cids = String(req.query.customerIds)
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            const blockingEvaluator = app.locals.ccoBlockingEvaluator || null;
            if (blockingEvaluator?.evaluateDashboard) {
              const opts = {};
              cids.forEach((c) => {
                opts[c] = { hasUpcomingBooking: true };
              });
              const dash = await blockingEvaluator.evaluateDashboard({ customerIds: cids, opts });
              customerEvalResults = dash.customers || [];
            }
          }

          const result = await feedStore.getFeed({
            role,
            sinceHours,
            customerEvalResults,
            limit,
            userId,
          });
          res.json(result);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-notifications/mark-read — markera notifications lästa
    app.post(
      '/api/v1/cco-notifications/mark-read',
      attachRole,
      requirePermission('notifications.mark_read'),
      jsonParserN,
      async (req, res) => {
        try {
          const userId = req.headers['x-cco-user'] || req.cco?.role;
          const { notificationIds, all = false } = req.body || {};
          if (!Array.isArray(notificationIds) && !all) {
            return res.status(400).json({ error: 'notificationIds[] krävs eller {"all":true}' });
          }
          let result;
          if (all && Array.isArray(notificationIds)) {
            result = await readStore.markAllRead(userId, notificationIds);
          } else {
            result = await readStore.markRead(userId, notificationIds);
          }
          res.json(result);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // GET /api/v1/cco-notifications/types — lista alla notif-typer (för UI-filter)
    app.get(
      '/api/v1/cco-notifications/types',
      attachRole,
      requirePermission('notifications.read'),
      (req, res) => {
        res.json({ types: NOTIFICATION_TYPES, readStoreStats: readStore.stats() });
      }
    );

    console.log(
      '[cco-notifications-feed] monterad: GET /feed + POST /mark-read + GET /types (notifications.read/mark_read)'
    );
  } catch (err) {
    console.warn('[cco-notifications-feed] kunde inte montera:', err.message);
  }
})();

// ── CCO Marketing Consent (Steg 8 av Communication & Compliance audit) ──
let ccoMarketingConsentStore = null;
(async () => {
  try {
    const {
      createCcoMarketingConsentStore,
      VALID_CHANNELS,
    } = require('./src/ops/ccoMarketingConsentStore');
    const { attachRole, requirePermission } = require('./src/security/ccoRbac');
    const expressM = require('express');
    const jsonParserM = expressM.json({ limit: '8kb' });

    ccoMarketingConsentStore = await createCcoMarketingConsentStore({
      filePath: path.join(__dirname, 'data', 'cco-marketing-consent.json'),
      auditLog: ccoAuditLog,
    });
    app.locals.ccoMarketingConsentStore = ccoMarketingConsentStore;

    // GET /api/v1/cco-marketing/consent/:customerId — status
    app.get(
      '/api/v1/cco-marketing/consent/:customerId',
      attachRole,
      requirePermission('marketing.read'),
      (req, res) => {
        res.json(ccoMarketingConsentStore.getStatus(req.params.customerId));
      }
    );

    // POST /api/v1/cco-marketing/consent/:customerId/opt-in
    app.post(
      '/api/v1/cco-marketing/consent/:customerId/opt-in',
      attachRole,
      requirePermission('marketing.write'),
      jsonParserM,
      async (req, res) => {
        try {
          const { channel, templateVersion, source, note } = req.body || {};
          const ipAddress = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
            .toString()
            .split(',')[0]
            .trim();
          const result = await ccoMarketingConsentStore.setOptIn(req.params.customerId, channel, {
            actorRole: req.cco?.role || 'staff',
            ipAddress,
            templateVersion,
            source,
            note,
          });
          res.json(result);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-marketing/consent/:customerId/opt-out
    app.post(
      '/api/v1/cco-marketing/consent/:customerId/opt-out',
      attachRole,
      requirePermission('marketing.write'),
      jsonParserM,
      async (req, res) => {
        try {
          const { channel, reason, source } = req.body || {};
          const result = await ccoMarketingConsentStore.setOptOut(req.params.customerId, channel, {
            actorRole: req.cco?.role || 'staff',
            reason,
            source: source || 'staff_admin',
          });
          res.json(result);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // GET /api/v1/cco-marketing/stats
    app.get(
      '/api/v1/cco-marketing/stats',
      attachRole,
      requirePermission('marketing.read'),
      (req, res) => {
        res.json(ccoMarketingConsentStore.stats());
      }
    );

    // POST /api/v1/cco-marketing/send-token — generera unsubscribe-token (för send-flow)
    app.post(
      '/api/v1/cco-marketing/send-token',
      attachRole,
      requirePermission('marketing.send'),
      jsonParserM,
      async (req, res) => {
        try {
          const { customerId, channel, sendId } = req.body || {};
          // Pre-check: får vi skicka?
          const canSend = ccoMarketingConsentStore.canSendMarketing(customerId, channel);
          if (!canSend.canSend) {
            if (ccoAuditLog) {
              ccoAuditLog.append({
                action: 'marketing.send.blocked',
                actor: { role: req.cco?.role },
                target: { kind: 'marketing_consent', id: customerId },
                detail: { channel, reason: canSend.reason, currentState: canSend.currentState },
              });
            }
            return res.status(409).json({
              error: 'gdpr_consent_missing',
              detail: canSend.reason,
              currentState: canSend.currentState,
              blockedBy: 'ccoMarketingConsentStore',
            });
          }
          const token = await ccoMarketingConsentStore.createUnsubscribeToken(customerId, channel, {
            sendId,
          });
          const baseUrl = process.env.PUBLIC_BASE_URL || 'https://hairtpclinic.com';
          res.json({
            ok: true,
            token,
            unsubscribeUrl: `${baseUrl}/unsubscribe/${token}`,
            customerId,
            channel,
            consentSnapshot: ccoMarketingConsentStore.getStatus(customerId),
          });
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    console.log(
      '[cco-marketing] monterad: 5 routes /api/v1/cco-marketing/* (marketing.read/write/send)'
    );
  } catch (err) {
    console.warn('[cco-marketing] kunde inte montera:', err.message);
  }
})();

// ── PUBLIC unsubscribe-route (Steg 8: GDPR 1-klicks opt-out) ──
// Ingen auth — patient klickar länk från sitt mail. Idempotent.
// HTML-respons så patient ser bekräftelse direkt.
try {
  app.get('/unsubscribe/:token', async (req, res) => {
    const store = app.locals.ccoMarketingConsentStore;
    if (!store) return res.status(503).send('Unsubscribe-tjänsten är inte tillgänglig.');
    try {
      const ipAddress = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
        .toString()
        .split(',')[0]
        .trim();
      const result = await store.processUnsubscribeToken(req.params.token, { ipAddress });
      const channelLabel =
        { email_marketing: 'e-post', sms_marketing: 'SMS', profiling_segmentation: 'profilering' }[
          result.channel
        ] || result.channel;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Avregistrering klar · Hair TP Clinic</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#faf6f2;color:#2b251f;padding:40px 20px;line-height:1.6}.wrap{max-width:540px;margin:0 auto;background:linear-gradient(180deg,#faf6f2f0,#f4eee9d8);padding:28px 32px;border-radius:24px;box-shadow:0 18px 38px rgba(93,74,60,.08);border:1px solid #fff7}.ico{font-size:48px;text-align:center;margin-bottom:12px}h1{font-size:22px;margin:0 0 12px;text-align:center}p{color:rgba(70,60,50,.7);font-size:14px;text-align:center}.brand{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#84756b;text-align:center;margin-top:18px}</style>
</head><body><div class="wrap"><div class="ico">✓</div><h1>Avregistrering klar</h1>
<p>Du är nu avregistrerad från marknadskommunikation via <strong>${channelLabel}</strong>.</p>
<p>Det kan ta upp till 24 timmar innan ev. redan schemalagda utskick stoppas — sen kommer inget mer.</p>
<p style="font-size:12px;color:#aaa">${result.alreadyProcessed ? 'Du hade redan avregistrerat dig från denna kanal.' : 'Bekräftat ' + new Date(result.processedAt).toLocaleString('sv-SE')}</p>
<div class="brand">Hair TP Clinic · GDPR Art. 13/21</div></div></body></html>`);
    } catch (err) {
      res
        .status(err.statusCode || 500)
        .setHeader('Content-Type', 'text/html; charset=utf-8')
        .send(
          `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>Fel</title></head><body style="font-family:sans-serif;padding:40px;text-align:center"><h1>⚠ Länken är inte giltig</h1><p>Den här unsubscribe-länken finns inte, är utgången, eller har redan använts. Hör av dig till <a href="mailto:contact@hairtpclinic.com">contact@hairtpclinic.com</a> om du vill avregistrera dig.</p></body></html>`
        );
    }
  });
  console.log('[unsubscribe-public] monterad: GET /unsubscribe/:token (GDPR 1-klicks opt-out)');
} catch (err) {
  console.warn('[unsubscribe-public] kunde inte montera:', err.message);
}

// ── CCO Aftercare Scheduler (Steg 5 av Communication & Compliance audit) ──
(async () => {
  try {
    const { createCcoAftercareSchedulerStore } = require('./src/ops/ccoAftercareSchedulerStore');
    const { attachRole, requirePermission } = require('./src/security/ccoRbac');
    const expressA5 = require('express');
    const jsonParserA5 = expressA5.json({ limit: '16kb' });

    // Läs treatment-requirements
    let treatmentRequirements = null;
    try {
      treatmentRequirements = JSON.parse(
        fs.readFileSync(
          path.join(__dirname, 'config', 'cco-treatment-document-requirements.json'),
          'utf8'
        )
      );
    } catch (err) {
      console.warn('[cco-aftercare] treatment-requirements ej laddad:', err.message);
    }

    const scheduler = await createCcoAftercareSchedulerStore({
      filePath: path.join(__dirname, 'data', 'cco-aftercare-jobs.json'),
      treatmentRequirements,
      auditLog: ccoAuditLog,
      sendStore: {
        performSend: (...args) => app.locals.ccoSendActionStore?.performSend?.(...args),
      },
      templateRegistry: {
        get: (id) => app.locals.ccoTemplateRegistry?.get?.(id),
      },
    });
    app.locals.ccoAftercareScheduler = scheduler;

    // POST /api/v1/cco-aftercare/schedule — manuell schedule (per encounter)
    app.post(
      '/api/v1/cco-aftercare/schedule',
      attachRole,
      requirePermission('aftercare.write'),
      jsonParserA5,
      async (req, res) => {
        try {
          const result = await scheduler.scheduleForCompletedEncounter(req.body || {});
          res.json(result);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // GET /api/v1/cco-aftercare/jobs — lista pipeline
    app.get(
      '/api/v1/cco-aftercare/jobs',
      requireCcoAuthenticated,
      attachRole,
      requirePermission('aftercare.read'),
      (req, res) => {
        const items = scheduler.listJobs({
          status: req.query.status || null,
          customerId: req.query.customerId || null,
          treatmentKey: req.query.treatmentKey || null,
          limit: Number(req.query.limit) || 200,
        });
        res.json({ count: items.length, jobs: items, stats: scheduler.stats() });
      }
    );

    // GET /api/v1/cco-aftercare/jobs/:id
    app.get(
      '/api/v1/cco-aftercare/jobs/:id',
      requireCcoAuthenticated,
      attachRole,
      requirePermission('aftercare.read'),
      (req, res) => {
        const j = scheduler.getJob(req.params.id);
        if (!j) return res.status(404).json({ error: 'not_found' });
        res.json(j);
      }
    );

    // POST /api/v1/cco-aftercare/jobs/:id/cancel
    app.post(
      '/api/v1/cco-aftercare/jobs/:id/cancel',
      attachRole,
      requirePermission('aftercare.write'),
      jsonParserA5,
      async (req, res) => {
        try {
          const j = await scheduler.cancelJob(req.params.id, {
            reason: req.body?.reason,
            role: req.cco?.role,
          });
          res.json(j);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-aftercare/jobs/:id/trigger
    app.post(
      '/api/v1/cco-aftercare/jobs/:id/trigger',
      attachRole,
      requirePermission('aftercare.write'),
      async (req, res) => {
        try {
          const j = await scheduler.triggerNow(req.params.id, { role: req.cco?.role });
          res.json(j);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-aftercare/cron-tick — manuell trigga (owner) eller cron-internal
    app.post(
      '/api/v1/cco-aftercare/cron-tick',
      attachRole,
      requirePermission('aftercare.cron_trigger'),
      jsonParserA5,
      async (req, res) => {
        try {
          const result = await scheduler.runDueJobs({
            maxPerTick: Number(req.body?.maxPerTick) || 50,
            dryRun: req.body?.dryRun === true,
          });
          res.json(result);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // Cron-tick var 5e minut
    const aftercareInterval = setInterval(
      () => {
        scheduler
          .runDueJobs({ maxPerTick: 50 })
          .then((r) => {
            if (r.processed > 0)
              console.log(
                `[cco-aftercare] cron-tick processed=${r.processed} success=${r.success} failed=${r.failed}`
              );
          })
          .catch((err) => console.warn('[cco-aftercare] cron-tick failed:', err.message));
      },
      5 * 60 * 1000
    );

    // Hook till booking-case state-transitions
    // Lyssna efter completion-events via audit-log direkt? Nej — använd direct hook
    // app.locals.ccoBookingCaseStore tillåter on-transition-callback om implementerat,
    // annars måste klient-koden anropa /schedule manuellt.
    if (app.locals.ccoBookingCaseStore?.onTransition) {
      app.locals.ccoBookingCaseStore.onTransition(async (caseObj, fromState, toState) => {
        if (toState !== 'completed') return;
        try {
          await scheduler.scheduleForCompletedEncounter({
            customerId: caseObj.customerId,
            customerEmail: caseObj.customerEmail,
            customerName: caseObj.customerName,
            treatmentKey: caseObj.treatmentKey,
            encounterId: caseObj.id,
            completedAt: caseObj.completedAt || new Date().toISOString(),
          });
        } catch (err) {
          console.warn('[cco-aftercare] auto-schedule fail vid completion:', err.message);
        }
      });
    }

    console.log(
      '[cco-aftercare] monterad: POST /schedule, GET /jobs, POST /jobs/:id/{cancel,trigger}, POST /cron-tick · cron 5 min'
    );
  } catch (err) {
    console.warn('[cco-aftercare] kunde inte montera:', err.message);
  }
})();

// ── CCO Blocking Evaluator (Sprint D + Steg 3: gates förstärkning) ──
try {
  const { createCcoBlockingStore } = require('./src/ops/ccoBlockingStore');
  const { attachRole, requirePermission } = require('./src/security/ccoRbac');

  // Steg 3: ladda treatment-requirements från GitHub-trackad config
  let treatmentRequirements = null;
  try {
    treatmentRequirements = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, 'config', 'cco-treatment-document-requirements.json'),
        'utf8'
      )
    );
  } catch (err) {
    console.warn('[cco-blocking] treatment-requirements ej laddad:', err.message);
  }

  // Lazy lookup på alla underliggande stores via app.locals.
  const blockingEvaluator = createCcoBlockingStore({
    journalStore: {
      listEntries: async (args) => app.locals.ccoJournalStore?.listEntries?.(args) || [],
    },
    offerStore: {
      listForCustomer: (cid) => app.locals.ccoOfferQuickStore?.listForCustomer?.(cid) || [],
    },
    agreementStore: {
      listForCustomer: (cid) => app.locals.ccoAgreementQuickStore?.listForCustomer?.(cid) || [],
    },
    photoConsentStore: {
      listGranted: (args) => app.locals.ccoPhotoConsentStore?.listGranted?.(args) || [],
    },
    treatmentRequirements,
    idVerificationStore: {
      getStatus: async (cid) =>
        app.locals.ccoIdVerificationStore?.getStatus?.(cid) || { state: 'none' },
    },
  });

  // GET /api/v1/cco-blocking/customer/:id
  // Query-params: hasUpcomingBooking=true|false, hasPhotos=true, photoCount=N, plannedForShowcase=true, plannedTreatment=fue|prp_hair|...
  app.get(
    '/api/v1/cco-blocking/customer/:id',
    attachRole,
    requirePermission('workspace.read'),
    async (req, res) => {
      try {
        const opts = {
          customerName: req.query.customerName || null,
          hasUpcomingBooking: req.query.hasUpcomingBooking === 'true',
          hasPhotos: req.query.hasPhotos === 'true',
          photoCount: Number(req.query.photoCount) || 0,
          plannedForShowcase: req.query.plannedForShowcase === 'true',
          plannedTreatment: req.query.plannedTreatment || null, // Steg 3
          tenantId: req.query.tenantId || req.headers['x-cco-tenant'] || 'hairtpclinic',
        };
        const result = await blockingEvaluator.evaluateCustomer(req.params.id, opts);
        res.json(result);
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-blocking/batch — evaluera flera kunder
  // body: { customerIds: [...], opts: { customerId: {...} } }
  app.post(
    '/api/v1/cco-blocking/batch',
    attachRole,
    requirePermission('workspace.read'),
    express.json({ limit: '32kb' }),
    async (req, res) => {
      try {
        const { customerIds, opts = {} } = req.body || {};
        if (!Array.isArray(customerIds))
          return res.status(400).json({ error: 'customerIds[] krävs' });
        const result = await blockingEvaluator.evaluateDashboard({ customerIds, opts });
        res.json(result);
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  // GET /api/v1/cco-blocking/dashboard — top issues aggregated
  // Query: customerIds=cid1,cid2,cid3 (comma-separated) eller all=true
  app.get(
    '/api/v1/cco-blocking/dashboard',
    attachRole,
    requirePermission('workspace.read'),
    async (req, res) => {
      try {
        let customerIds = [];
        if (req.query.customerIds) {
          customerIds = String(req.query.customerIds)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        } else if (req.query.all === 'true') {
          // Försök ladda från customers-store
          const cs = app.locals.ccoCustomersStore;
          if (cs && typeof cs.list === 'function') {
            const all = await cs.list();
            customerIds = (all || [])
              .map((c) => c.id || c.customerId)
              .filter(Boolean)
              .slice(0, 200);
          }
        }
        // Default opts: anta hasUpcomingBooking=true för dashboard (där det är blocking-cases vi vill se)
        const opts = {};
        customerIds.forEach((cid) => {
          opts[cid] = { hasUpcomingBooking: true };
        });
        const result = await blockingEvaluator.evaluateDashboard({ customerIds, opts });
        res.json(result);
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  console.log(
    '[cco-blocking] monterad: GET /api/v1/cco-blocking/{customer/:id|dashboard} + POST /batch (workspace.read)'
  );
} catch (err) {
  console.warn('[cco-blocking] kunde inte montera:', err.message);
}

// ── CCO Offers + Agreements Quick (Sprint B: state machine + dry-run sends) ──
let ccoOfferQuickStore = null;
let ccoAgreementQuickStore = null;
(async () => {
  try {
    const { createCcoOfferQuickStore } = require('./src/ops/ccoOfferQuickStore');
    const { createCcoAgreementQuickStore } = require('./src/ops/ccoAgreementQuickStore');
    const { attachRole, requirePermission } = require('./src/security/ccoRbac');

    // Vänta lite på att sendStore mountas (race-condition skydd via app.locals lookup vid request-tid)
    function getSendStore() {
      return app.locals.ccoSendActionStore;
    }

    ccoOfferQuickStore = await createCcoOfferQuickStore({
      filePath: path.join(__dirname, 'data', 'cco-offers-quick.json'),
      auditLog: ccoAuditLog,
      sendStore: {
        // proxy som hämtar lazy vid varje call
        buildFilePayload: (...args) => getSendStore()?.buildFilePayload(...args),
        performSend: (...args) => getSendStore()?.performSend(...args),
      },
    });
    ccoAgreementQuickStore = await createCcoAgreementQuickStore({
      filePath: path.join(__dirname, 'data', 'cco-agreements-quick.json'),
      auditLog: ccoAuditLog,
      sendStore: {
        buildFilePayload: (...args) => getSendStore()?.buildFilePayload(...args),
        performSend: (...args) => getSendStore()?.performSend(...args),
      },
      offerStore: ccoOfferQuickStore,
    });
    app.locals.ccoOfferQuickStore = ccoOfferQuickStore;
    app.locals.ccoAgreementQuickStore = ccoAgreementQuickStore;

    const expressB = require('express');
    const jsonParserB = expressB.json({ limit: '64kb' });

    // ─── OFFERS ───────────────────────────────────────────
    // POST /api/v1/cco-offers — create
    app.post(
      '/api/v1/cco-offers',
      attachRole,
      requirePermission('offer.write'),
      jsonParserB,
      async (req, res) => {
        try {
          const offer = await ccoOfferQuickStore.createOffer(req.body || {}, {
            role: req.cco?.role,
          });
          res.json(offer);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // PATCH /api/v1/cco-offers/:id — update draft
    app.patch(
      '/api/v1/cco-offers/:id',
      attachRole,
      requirePermission('offer.write'),
      jsonParserB,
      async (req, res) => {
        try {
          const offer = await ccoOfferQuickStore.updateDraft(req.params.id, req.body || {}, {
            role: req.cco?.role,
          });
          res.json(offer);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-offers/:id/send
    app.post(
      '/api/v1/cco-offers/:id/send',
      attachRole,
      requirePermission('offer.write'),
      jsonParserB,
      async (req, res) => {
        try {
          const result = await ccoOfferQuickStore.sendOffer(
            req.params.id,
            {
              dryRunOverride: typeof req.body?.dryRun === 'boolean' ? req.body.dryRun : null,
            },
            { role: req.cco?.role }
          );
          res.json(result);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-offers/:id/accept
    app.post(
      '/api/v1/cco-offers/:id/accept',
      attachRole,
      requirePermission('offer.write'),
      jsonParserB,
      async (req, res) => {
        try {
          const offer = await ccoOfferQuickStore.acceptOffer(
            req.params.id,
            {
              acceptedVia: req.body?.acceptedVia || 'manual',
              acceptedBy: req.body?.acceptedBy || null,
            },
            { role: req.cco?.role }
          );
          res.json(offer);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-offers/:id/reject
    app.post(
      '/api/v1/cco-offers/:id/reject',
      attachRole,
      requirePermission('offer.write'),
      jsonParserB,
      async (req, res) => {
        try {
          const offer = await ccoOfferQuickStore.rejectOffer(
            req.params.id,
            { reason: req.body?.reason },
            { role: req.cco?.role }
          );
          res.json(offer);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // DELETE /api/v1/cco-offers/:id — bara draft
    app.delete(
      '/api/v1/cco-offers/:id',
      attachRole,
      requirePermission('offer.delete'),
      async (req, res) => {
        try {
          res.json(await ccoOfferQuickStore.deleteDraft(req.params.id, { role: req.cco?.role }));
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // GET /api/v1/cco-offers/:id
    app.get('/api/v1/cco-offers/:id', attachRole, requirePermission('offer.read'), (req, res) => {
      const o = ccoOfferQuickStore.getById(req.params.id);
      if (!o) return res.status(404).json({ error: 'not_found' });
      res.json(o);
    });

    // GET /api/v1/cco-offers/customer/:cid
    // 19F.5 Fix #3 — middleware spärrkontroll på offers
    app.get(
      '/api/v1/cco-offers/customer/:cid',
      attachRole,
      requirePermission('offer.read'),
      (req, res, next) =>
        app.locals.enforceAccessRestriction
          ? app.locals.enforceAccessRestriction(req, res, next)
          : next(),
      (req, res) => {
        res.json({ offers: ccoOfferQuickStore.listForCustomer(req.params.cid) });
      }
    );

    // GET /api/v1/cco-offers (all / by state)
    app.get('/api/v1/cco-offers', attachRole, requirePermission('offer.read'), (req, res) => {
      res.json({
        offers: ccoOfferQuickStore.listAll({
          state: req.query.state || null,
          limit: Number(req.query.limit) || 200,
        }),
        stats: ccoOfferQuickStore.stats(),
      });
    });

    // ─── AGREEMENTS ───────────────────────────────────────
    app.post(
      '/api/v1/cco-agreements',
      attachRole,
      requirePermission('agreement.write'),
      jsonParserB,
      async (req, res) => {
        try {
          const agreement = await ccoAgreementQuickStore.createAgreement(req.body || {}, {
            role: req.cco?.role,
          });
          res.json(agreement);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.patch(
      '/api/v1/cco-agreements/:id',
      attachRole,
      requirePermission('agreement.write'),
      jsonParserB,
      async (req, res) => {
        try {
          const ag = await ccoAgreementQuickStore.updateDraft(req.params.id, req.body || {}, {
            role: req.cco?.role,
          });
          res.json(ag);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.post(
      '/api/v1/cco-agreements/:id/send',
      attachRole,
      requirePermission('agreement.write'),
      jsonParserB,
      async (req, res) => {
        try {
          const result = await ccoAgreementQuickStore.sendAgreement(
            req.params.id,
            {
              dryRunOverride: typeof req.body?.dryRun === 'boolean' ? req.body.dryRun : null,
            },
            { role: req.cco?.role }
          );
          res.json(result);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-agreements/:id/sign — patient (bankid_stub) eller staff_override (kräver agreement.staff_sign)
    app.post('/api/v1/cco-agreements/:id/sign', attachRole, jsonParserB, async (req, res) => {
      const method = req.body?.signMethod || 'bankid_stub';
      const role = req.cco?.role;
      const { roleHasPermission } = require('./src/security/ccoRbac');
      // staff_override KRÄVER agreement.staff_sign (owner only)
      if (method === 'staff_override') {
        if (!roleHasPermission(role, 'agreement.staff_sign')) {
          return res.status(403).json({
            error: 'forbidden',
            detail: `staff_override-signering kräver permission agreement.staff_sign. Role "${role}" saknar det.`,
            requiredPermission: 'agreement.staff_sign',
          });
        }
      } else {
        // bankid_stub / paper_signed_scanned räcker med agreement.write
        if (!roleHasPermission(role, 'agreement.write')) {
          return res.status(403).json({
            error: 'forbidden',
            detail: `signera kräver agreement.write. Role "${role}" saknar det.`,
          });
        }
      }
      try {
        const ag = await ccoAgreementQuickStore.signAgreement(
          req.params.id,
          {
            signedByName: req.body?.signedByName,
            signMethod: method,
            signatureToken: req.body?.signatureToken,
          },
          { role }
        );
        res.json(ag);
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    });

    app.post(
      '/api/v1/cco-agreements/:id/cancel',
      attachRole,
      requirePermission('agreement.write'),
      jsonParserB,
      async (req, res) => {
        try {
          const ag = await ccoAgreementQuickStore.cancelAgreement(
            req.params.id,
            { reason: req.body?.reason },
            { role: req.cco?.role }
          );
          res.json(ag);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    app.get(
      '/api/v1/cco-agreements/:id',
      attachRole,
      requirePermission('agreement.read'),
      (req, res) => {
        const a = ccoAgreementQuickStore.getById(req.params.id);
        if (!a) return res.status(404).json({ error: 'not_found' });
        res.json(a);
      }
    );

    app.get(
      '/api/v1/cco-agreements/customer/:cid',
      attachRole,
      requirePermission('agreement.read'),
      (req, res) => {
        res.json({ agreements: ccoAgreementQuickStore.listForCustomer(req.params.cid) });
      }
    );

    app.get(
      '/api/v1/cco-agreements',
      attachRole,
      requirePermission('agreement.read'),
      (req, res) => {
        res.json({
          agreements: ccoAgreementQuickStore.listAll({
            state: req.query.state || null,
            limit: Number(req.query.limit) || 200,
          }),
          stats: ccoAgreementQuickStore.stats(),
        });
      }
    );

    console.log(
      '[cco-offers-quick] monterad: 8 routes /api/v1/cco-offers/* (RBAC: offer.read/write/delete)'
    );
    console.log(
      '[cco-agreements-quick] monterad: 7 routes /api/v1/cco-agreements/* (RBAC: agreement.read/write + staff_sign för override)'
    );
  } catch (err) {
    console.warn('[cco-offers+agreements-quick] kunde inte montera:', err.message);
  }
})();

// ── CCO Template Registry (Steg 1 av Communication & Compliance audit) ──
let ccoTemplateRegistry = null;
(async () => {
  try {
    const { createCcoTemplateRegistry } = require('./src/ops/ccoTemplateRegistry');
    const { attachRole, requirePermission } = require('./src/security/ccoRbac');
    ccoTemplateRegistry = await createCcoTemplateRegistry({
      filePath: path.join(__dirname, 'data', 'cco-templates.json'),
      auditLog: ccoAuditLog,
    });
    app.locals.ccoTemplateRegistry = ccoTemplateRegistry;

    const expressT = require('express');
    const jsonParserT = expressT.json({ limit: '64kb' });

    // GET /api/v1/cco-templates — lista (med filter)
    app.get(
      '/api/v1/cco-templates',
      attachRole,
      requirePermission('templates.read'),
      (req, res) => {
        const items = ccoTemplateRegistry.list({
          brand: req.query.brand || null,
          type: req.query.type || null,
          journeyStep: req.query.journeyStep || null,
          legalReviewStatus: req.query.legalReviewStatus || null,
        });
        res.json({ count: items.length, templates: items, stats: ccoTemplateRegistry.stats() });
      }
    );

    // GET /api/v1/cco-templates/:id
    app.get(
      '/api/v1/cco-templates/:id',
      attachRole,
      requirePermission('templates.read'),
      (req, res) => {
        const t = ccoTemplateRegistry.get(req.params.id);
        if (!t) return res.status(404).json({ error: 'not_found' });
        res.json(t);
      }
    );

    // GET /api/v1/cco-templates/:id/revisions — historik
    app.get(
      '/api/v1/cco-templates/:id/revisions',
      attachRole,
      requirePermission('templates.read'),
      (req, res) => {
        res.json({ revisions: ccoTemplateRegistry.getRevisions(req.params.id) });
      }
    );

    // POST /api/v1/cco-templates — create/upsert (owner only)
    app.post(
      '/api/v1/cco-templates',
      attachRole,
      requirePermission('templates.write'),
      jsonParserT,
      async (req, res) => {
        try {
          const t = await ccoTemplateRegistry.upsert(req.body || {}, { role: req.cco?.role });
          res.json(t);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-templates/:id/legal-review — uppdatera legal-status
    app.post(
      '/api/v1/cco-templates/:id/legal-review',
      attachRole,
      requirePermission('templates.legal_review'),
      jsonParserT,
      async (req, res) => {
        try {
          const t = await ccoTemplateRegistry.setLegalReviewStatus(
            req.params.id,
            req.body?.status,
            {
              role: req.cco?.role,
              reviewer: req.body?.reviewer,
              externalRef: req.body?.externalRef,
            }
          );
          res.json(t);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-templates/:id/snapshot — preview snapshot för send
    app.post(
      '/api/v1/cco-templates/:id/snapshot',
      attachRole,
      requirePermission('templates.read'),
      jsonParserT,
      (req, res) => {
        try {
          const snap = ccoTemplateRegistry.snapshotForSend(req.params.id, req.body?.lang || 'sv');
          res.json(snap);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    console.log(
      '[cco-templates] monterad: 6 routes /api/v1/cco-templates/* (templates.read/write + legal_review)'
    );
  } catch (err) {
    console.warn('[cco-templates] kunde inte montera:', err.message);
  }
})();

// ── CCO Compliance Scan (Steg 2: version-conflict + missing-audit detector) ──
let ccoComplianceScanStore = null;
(async () => {
  try {
    const { createCcoComplianceScanStore } = require('./src/ops/ccoComplianceScanStore');
    const { attachRole, requirePermission } = require('./src/security/ccoRbac');

    // Vänta på att template-registry initieras (race-condition skydd)
    function getTemplateRegistry() {
      return app.locals.ccoTemplateRegistry;
    }

    ccoComplianceScanStore = await createCcoComplianceScanStore({
      filePath: path.join(__dirname, 'data', 'cco-compliance-scans.json'),
      externalVersionsPath: path.join(__dirname, 'config', 'external-template-versions.json'),
      meridiqSchemaPath: path.join(
        __dirname,
        'migration',
        'meridiq',
        'journal-schema-catalog.json'
      ),
      templateRegistry: {
        list: (...args) => getTemplateRegistry()?.list(...args) || [],
      },
      auditLog: ccoAuditLog,
    });
    app.locals.ccoComplianceScanStore = ccoComplianceScanStore;

    const expressS = require('express');
    const jsonParserS = expressS.json({ limit: '16kb' });

    // GET /api/v1/cco-compliance-scan/latest — senaste scan
    app.get(
      '/api/v1/cco-compliance-scan/latest',
      attachRole,
      requirePermission('compliance.read'),
      (req, res) => {
        const latest = ccoComplianceScanStore.getLatestScan();
        if (!latest)
          return res.status(404).json({
            error: 'no_scans_yet',
            detail: 'Kör POST /api/v1/cco-compliance-scan/run för att trigga första scan',
          });
        res.json(latest);
      }
    );

    // GET /api/v1/cco-compliance-scan/flags — aktiva flaggor från senaste scan
    app.get(
      '/api/v1/cco-compliance-scan/flags',
      attachRole,
      requirePermission('compliance.read'),
      (req, res) => {
        res.json(ccoComplianceScanStore.getActiveFlags());
      }
    );

    // GET /api/v1/cco-compliance-scan/history — scan-historik
    app.get(
      '/api/v1/cco-compliance-scan/history',
      attachRole,
      requirePermission('compliance.read'),
      (req, res) => {
        res.json({
          scans: ccoComplianceScanStore.listScans({ limit: Number(req.query.limit) || 20 }),
        });
      }
    );

    // POST /api/v1/cco-compliance-scan/run — trigga manuell scan (owner only)
    app.post(
      '/api/v1/cco-compliance-scan/run',
      attachRole,
      requirePermission('compliance.scan'),
      jsonParserS,
      async (req, res) => {
        try {
          const result = await ccoComplianceScanStore.runFullScan({
            triggeredBy: 'manual:' + (req.cco?.role || 'owner'),
            sinceHours: Number(req.body?.sinceHours) || 24,
          });
          res.json(result);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // Auto-scan: cron-job tickar dagligen 06:00 (om cron-scheduler är aktivt)
    // Vi använder enkel setInterval här eftersom befintlig cronScheduler är knuten till notifications
    // Schemalägg första körning 30s efter boot för warm-up
    let scanInterval = null;
    setTimeout(() => {
      // Initial scan vid boot
      ccoComplianceScanStore
        .runFullScan({ triggeredBy: 'boot' })
        .then((r) =>
          console.log(`[cco-compliance-scan] initial scan klart — ${r.totalFlags} flaggor`)
        )
        .catch((err) => console.warn('[cco-compliance-scan] initial scan failed:', err.message));

      // Daglig återkommande scan
      scanInterval = setInterval(
        () => {
          ccoComplianceScanStore
            .runFullScan({ triggeredBy: 'cron_daily' })
            .then((r) => console.log(`[cco-compliance-scan] daily scan — ${r.totalFlags} flaggor`))
            .catch((err) => console.warn('[cco-compliance-scan] daily scan failed:', err.message));
        },
        24 * 3600 * 1000
      );
    }, 30000);

    console.log(
      '[cco-compliance-scan] monterad: GET /latest, /flags, /history, POST /run (compliance.read/scan) — cron dagligen + initial 30s efter boot'
    );
  } catch (err) {
    console.warn('[cco-compliance-scan] kunde inte montera:', err.message);
  }
})();

// ── CCO Send Actions (Sprint C: form/consent/file/encounter med dry-run + audit) ──
let ccoSendActionStore = null;
(async () => {
  try {
    const { createCcoSendActionStore, isDryRunDefault } = require('./src/ops/ccoSendActionStore');
    const { assertLegacyConsentSendAllowed } = require('./src/ops/ccoLegacyConsentSendGuard');
    const { attachRole, requirePermission } = require('./src/security/ccoRbac');
    let mailer = null;
    try {
      mailer = require('./src/infra/resendMailer');
    } catch (e) {
      /* mailer optional */
    }

    // Vänta lite på template-registry init (race-condition skydd)
    function getTemplateRegistry() {
      return app.locals.ccoTemplateRegistry;
    }

    ccoSendActionStore = await createCcoSendActionStore({
      filePath: path.join(__dirname, 'data', 'cco-send-actions.json'),
      auditLog: ccoAuditLog,
      mailer,
      baseUrl: process.env.PUBLIC_BASE_URL || 'https://hairtpclinic.com',
      templateRegistry: {
        snapshotForSend: (...args) => getTemplateRegistry()?.snapshotForSend(...args),
      },
    });
    app.locals.ccoSendActionStore = ccoSendActionStore;

    const expressC = require('express');
    const jsonParserC = expressC.json({ limit: '32kb' });

    function commonCustomerCtx(req) {
      return {
        customerId: req.params.customerId || req.body?.customerId,
        customerName: req.body?.customerName || req.body?.name || 'kund',
        customerEmail: req.body?.customerEmail || req.body?.email,
        urlToken: req.body?.urlToken,
      };
    }

    // POST /api/v1/cco-send/form/:customerId
    app.post(
      '/api/v1/cco-send/form/:customerId',
      attachRole,
      requirePermission('mail.send'),
      jsonParserC,
      async (req, res) => {
        try {
          const ctx = commonCustomerCtx(req);
          if (!ctx.customerEmail) return res.status(400).json({ error: 'customerEmail krävs' });
          const payload = ccoSendActionStore.buildFormPayload({
            ...ctx,
            formKind: req.body?.formKind || 'health_declaration',
          });
          const result = await ccoSendActionStore.performSend({
            kind: 'form',
            payload,
            customerId: ctx.customerId,
            role: req.cco?.role,
            dryRunOverride: typeof req.body?.dryRun === 'boolean' ? req.body.dryRun : null,
            templateRef: req.body?.templateRef || null,
            templateLang: req.body?.templateLang || 'sv',
          });
          res.json(result);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-send/consent/:customerId
    app.post(
      '/api/v1/cco-send/consent/:customerId',
      attachRole,
      requirePermission('mail.send'),
      jsonParserC,
      async (req, res) => {
        try {
          const ctx = commonCustomerCtx(req);
          if (!ctx.customerEmail) return res.status(400).json({ error: 'customerEmail krävs' });
          assertLegacyConsentSendAllowed(req.body || {});
          const payload = ccoSendActionStore.buildConsentPayload({
            ...ctx,
            consentKind: req.body?.consentKind || 'photo_publish',
          });
          const result = await ccoSendActionStore.performSend({
            kind: 'consent',
            payload,
            customerId: ctx.customerId,
            role: req.cco?.role,
            dryRunOverride: typeof req.body?.dryRun === 'boolean' ? req.body.dryRun : null,
            templateRef: req.body?.templateRef || null,
            templateLang: req.body?.templateLang || 'sv',
          });
          res.json(result);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-send/file/:customerId
    app.post(
      '/api/v1/cco-send/file/:customerId',
      attachRole,
      requirePermission('mail.send'),
      jsonParserC,
      async (req, res) => {
        try {
          const ctx = commonCustomerCtx(req);
          if (!ctx.customerEmail) return res.status(400).json({ error: 'customerEmail krävs' });
          if (!req.body?.fileName || !req.body?.fileMime)
            return res.status(400).json({ error: 'fileName + fileMime krävs' });
          const payload = ccoSendActionStore.buildFilePayload({
            ...ctx,
            fileName: req.body.fileName,
            fileMime: req.body.fileMime,
            fileNote: req.body.fileNote || '',
          });
          const result = await ccoSendActionStore.performSend({
            kind: 'file',
            payload,
            customerId: ctx.customerId,
            role: req.cco?.role,
            dryRunOverride: typeof req.body?.dryRun === 'boolean' ? req.body.dryRun : null,
            templateRef: req.body?.templateRef || null,
            templateLang: req.body?.templateLang || 'sv',
          });
          res.json(result);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // POST /api/v1/cco-send/encounter/:customerId (kort: send booking → encounter-länk)
    app.post(
      '/api/v1/cco-send/encounter/:customerId',
      attachRole,
      requirePermission('mail.send'),
      jsonParserC,
      async (req, res) => {
        try {
          const ctx = commonCustomerCtx(req);
          if (!ctx.customerEmail) return res.status(400).json({ error: 'customerEmail krävs' });
          const payload = ccoSendActionStore.buildEncounterPayload({
            ...ctx,
            encounterDate: req.body?.encounterDate,
            encounterTime: req.body?.encounterTime,
            treatmentLabel: req.body?.treatmentLabel || 'behandling',
            staffName: req.body?.staffName || 'Hair TP Clinic',
            encounterId: req.body?.encounterId,
          });
          const result = await ccoSendActionStore.performSend({
            kind: 'encounter',
            payload,
            customerId: ctx.customerId,
            role: req.cco?.role,
            dryRunOverride: typeof req.body?.dryRun === 'boolean' ? req.body.dryRun : null,
            templateRef: req.body?.templateRef || null,
            templateLang: req.body?.templateLang || 'sv',
          });
          res.json(result);
        } catch (err) {
          res.status(err.statusCode || 500).json({ error: err.message });
        }
      }
    );

    // GET /api/v1/cco-send/history
    app.get('/api/v1/cco-send/history', attachRole, requirePermission('mail.read'), (req, res) => {
      const items = ccoSendActionStore.listSends({
        kind: req.query.kind || null,
        customerId: req.query.customerId || null,
        limit: Number(req.query.limit) || 100,
      });
      res.json({ count: items.length, items });
    });

    // GET /api/v1/cco-send/stats — för UI dry-run-banner + telemetri
    app.get('/api/v1/cco-send/stats', attachRole, requirePermission('mail.read'), (req, res) => {
      res.json(ccoSendActionStore.stats());
    });

    // GET /api/v1/cco-send/templates — för UI dropdown
    app.get(
      '/api/v1/cco-send/templates',
      attachRole,
      requirePermission('mail.read'),
      (req, res) => {
        const {
          FORM_TEMPLATES,
          CONSENT_TEMPLATES,
          ALLOWED_MIME_BY_KIND,
        } = require('./src/ops/ccoSendActionStore');
        res.json({
          form: Object.keys(FORM_TEMPLATES).map((k) => ({ id: k, ...FORM_TEMPLATES[k] })),
          consent: Object.keys(CONSENT_TEMPLATES).map((k) => ({ id: k, ...CONSENT_TEMPLATES[k] })),
          allowedFileTypes: ALLOWED_MIME_BY_KIND.file,
        });
      }
    );

    console.log(
      '[cco-send] monterad: 4 POST /api/v1/cco-send/{form|consent|file|encounter}/:customerId + history/stats/templates (mail.send) — dryRunDefault=' +
        isDryRunDefault()
    );
  } catch (err) {
    console.warn('[cco-send] kunde inte montera:', err.message);
  }
})();

// ── CCO Journal Quick (Sprint A: RBAC-wrapper för befintlig ccoJournalStore) ──
// Befintlig /api/v1/cco-journal/* använder auth.requireAuth + requireRole.
// Sprint A behöver consistent RBAC-pattern (attachRole + requirePermission) + audit-log
// så UI kan kalla från smart-anteckning/dossier utan login-flöde (under demo/utveckling).
// Compliance bevarad: vi delegerar till samma store (samma file), så signering/lock/correction
// går genom samma path och ger samma immutability.
try {
  const { attachRole, requirePermission } = require('./src/security/ccoRbac');
  const expressA = require('express');
  const jsonParserA = expressA.json({ limit: '128kb' });

  function getJournalStore() {
    return app.locals.ccoJournalStore;
  }

  function auditA(action, role, target, detail) {
    if (!ccoAuditLog) return;
    try {
      ccoAuditLog.append({
        action,
        actor: { role: role || 'unknown' },
        target,
        detail,
      });
    } catch (err) {
      console.error('[cco-journal-quick] audit failed:', err.message);
    }
  }

  // POST /api/v1/cco-journal-quick/entry — skapa/spara draft (PUT-semantik)
  app.put(
    '/api/v1/cco-journal-quick/entry',
    attachRole,
    requirePermission('journal.write'),
    jsonParserA,
    async (req, res) => {
      const store = getJournalStore();
      if (!store) return res.status(503).json({ error: 'journal_store_unavailable' });
      try {
        const body = req.body || {};
        if (!body.patientId) return res.status(400).json({ error: 'patientId krävs' });
        const tenantId = body.tenantId || req.headers['x-cco-tenant'] || 'hairtpclinic';
        const entry = await store.upsertEntry(
          { ...body, tenantId },
          {
            actor: {
              userId: req.headers['x-cco-user'] || 'demo-user',
              role: req.cco?.role,
              displayName: req.headers['x-cco-user'] || req.cco?.role,
            },
          }
        );
        auditA(
          'journal.entry.write',
          req.cco?.role,
          { kind: 'journal_entry', id: entry.entryId },
          { patientId: body.patientId, journalType: entry.journalType, status: entry.status }
        );
        res.json({ entry, readout: store.buildJournalReadout?.(entry) || null });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-journal-quick/entry/sign — signera (auto-lockar)
  app.post(
    '/api/v1/cco-journal-quick/entry/sign',
    attachRole,
    requirePermission('journal.write'),
    jsonParserA,
    async (req, res) => {
      const store = getJournalStore();
      if (!store) return res.status(503).json({ error: 'journal_store_unavailable' });
      try {
        const { patientId, entryId } = req.body || {};
        if (!patientId || !entryId)
          return res.status(400).json({ error: 'patientId + entryId krävs' });
        const tenantId = req.body.tenantId || req.headers['x-cco-tenant'] || 'hairtpclinic';
        const signed = await store.signEntry({
          tenantId,
          patientId,
          entryId,
          actor: {
            userId: req.headers['x-cco-user'] || 'demo-user',
            role: req.cco?.role,
            displayName: req.headers['x-cco-user'] || req.cco?.role,
          },
        });
        auditA(
          'journal.entry.sign',
          req.cco?.role,
          { kind: 'journal_entry', id: entryId },
          { patientId, journalType: signed.journalType, locked: !!signed.locked }
        );
        res.json({ entry: signed });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-journal-quick/entry/correction — skapa rättelse (NY route, finns ej i legacy)
  app.post(
    '/api/v1/cco-journal-quick/entry/correction',
    attachRole,
    requirePermission('journal.write'),
    jsonParserA,
    async (req, res) => {
      const store = getJournalStore();
      if (!store) return res.status(503).json({ error: 'journal_store_unavailable' });
      if (typeof store.addCorrection !== 'function')
        return res.status(501).json({ error: 'addCorrection_not_implemented' });
      try {
        const { patientId, entryId, fields, reason } = req.body || {};
        if (!patientId || !entryId)
          return res.status(400).json({ error: 'patientId + entryId krävs' });
        if (!reason || String(reason).trim().length < 10)
          return res
            .status(400)
            .json({ error: 'reason måste vara minst 10 tecken (PDL-krav på spårbarhet)' });
        const tenantId = req.body.tenantId || req.headers['x-cco-tenant'] || 'hairtpclinic';
        const correction = await store.addCorrection({
          tenantId,
          patientId,
          entryId,
          fields: fields || {},
          actor: {
            userId: req.headers['x-cco-user'] || 'demo-user',
            role: req.cco?.role,
            displayName: req.headers['x-cco-user'] || req.cco?.role,
          },
        });
        auditA(
          'journal.entry.correction.create',
          req.cco?.role,
          { kind: 'journal_entry', id: correction.entryId },
          { patientId, originalEntryId: entryId, reason }
        );
        res.json({ correction, originalEntryId: entryId, reason });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  // GET /api/v1/cco-journal-quick/entries — lista per kund
  // P0.8: journal.read audit-event via readJournalWithAudit-wrapper
  app.get(
    '/api/v1/cco-journal-quick/entries',
    attachRole,
    requirePermission('journal.read_any'),
    async (req, res) => {
      const store = getJournalStore();
      if (!store) return res.status(503).json({ error: 'journal_store_unavailable' });
      try {
        const tenantId = req.query.tenantId || req.headers['x-cco-tenant'] || 'hairtpclinic';
        const patientId = req.query.patientId;
        if (!patientId) return res.status(400).json({ error: 'patientId krävs' });
        const { readJournalWithAudit } = require('./src/ops/ccoJournalReadAudit');
        const entries = await readJournalWithAudit(
          {
            auditLog: ccoAuditLog,
            actor: { role: req.cco?.role, userId: req.headers['x-cco-user'] || null },
            tenantId,
            patientId,
            endpoint: 'GET /api/v1/cco-journal-quick/entries',
            scope: 'list_entries',
            extra: { journalType: req.query.journalType || null },
          },
          () =>
            store.listEntries({ tenantId, patientId, journalType: req.query.journalType || null })
        );
        res.json({ count: entries.length, entries });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  // GET /api/v1/cco-journal-quick/stats — sammanställning
  // P0.8: aggregate-read loggas också (PDL: åtkomst-räkning)
  app.get(
    '/api/v1/cco-journal-quick/stats',
    requireCcoAuthenticated,
    attachRole,
    requirePermission('journal.read_any'),
    async (req, res) => {
      const store = getJournalStore();
      if (!store) return res.status(503).json({ error: 'journal_store_unavailable' });
      try {
        const tenantId = req.query.tenantId || req.headers['x-cco-tenant'] || 'hairtpclinic';
        const { readJournalWithAudit } = require('./src/ops/ccoJournalReadAudit');
        const all = await readJournalWithAudit(
          {
            auditLog: ccoAuditLog,
            actor: { role: req.cco?.role, userId: req.headers['x-cco-user'] || null },
            tenantId,
            patientId: null,
            endpoint: 'GET /api/v1/cco-journal-quick/stats',
            scope: 'stats_aggregate',
          },
          () => store.listAllEntries({ tenantId })
        );
        const byStatus = {};
        const byKind = {};
        for (const e of all) {
          byStatus[e.status || 'unknown'] = (byStatus[e.status || 'unknown'] || 0) + 1;
          byKind[e.journalType || 'unknown'] = (byKind[e.journalType || 'unknown'] || 0) + 1;
        }
        res.json({
          total: all.length,
          byStatus,
          byKind,
          lockedCount: all.filter((e) => e.locked).length,
        });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-journal-quick/entry/unlock — Beslut #3: OWNER ONLY + reason min 20 chars
  // PDL-compliance: unlock loggas som HIGH-severity audit-event
  app.post(
    '/api/v1/cco-journal-quick/entry/unlock',
    attachRole,
    requirePermission('journal.unlock'),
    jsonParserA,
    async (req, res) => {
      const store = getJournalStore();
      if (!store) return res.status(503).json({ error: 'journal_store_unavailable' });
      try {
        const { patientId, entryId, reason } = req.body || {};
        if (!patientId || !entryId)
          return res.status(400).json({ error: 'patientId + entryId krävs' });
        if (!reason || String(reason).trim().length < 20) {
          return res.status(400).json({
            error: 'unlock_reason_required',
            detail:
              'Owner-unlock kräver reason ≥ 20 tecken med tydlig anledning (för PDL-spårbarhet). Använd correction-flow först om möjligt — unlock är extrem-åtgärd.',
          });
        }
        const tenantId = req.body.tenantId || req.headers['x-cco-tenant'] || 'hairtpclinic';
        const updated = await store.unlockEntry({
          tenantId,
          patientId,
          entryId,
          reason: reason.trim(),
          actor: {
            userId: req.headers['x-cco-user'] || 'owner',
            displayName: req.headers['x-cco-user'] || 'owner',
            role: req.cco?.role,
          },
        });

        auditA(
          'journal.entry.unlock.HIGH_SEVERITY',
          req.cco?.role,
          { kind: 'journal_entry', id: entryId },
          {
            patientId,
            reason: reason.trim(),
            previouslySignedAt: updated.unlockSnapshot?.previouslySignedAt,
            previouslySignedBy: updated.unlockSnapshot?.previouslySignedByName,
            WARNING: 'Owner-unlock — PDL compliance-händelse. Granska vid nästa audit.',
          }
        );

        res.json({
          entry: updated,
          snapshot: updated.unlockSnapshot,
          complianceNote:
            'Unlock loggad som HIGH_SEVERITY. Originalets signed-state bevarad i unlockSnapshot. Skapa ny signering eller correction.',
        });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  // GET /api/v1/cco-journal-quick/entry/:entryId/pdf — Steg 7: PDF-export av signerad journal
  app.get(
    '/api/v1/cco-journal-quick/entry/:entryId/pdf',
    attachRole,
    requirePermission('journal.read_own'),
    async (req, res) => {
      const store = getJournalStore();
      if (!store) return res.status(503).json({ error: 'journal_store_unavailable' });
      try {
        const tenantId = req.query.tenantId || req.headers['x-cco-tenant'] || 'hairtpclinic';
        const patientId = req.query.patientId;
        if (!patientId) return res.status(400).json({ error: 'patientId krävs i query' });
        const { readJournalWithAudit } = require('./src/ops/ccoJournalReadAudit');
        const entry = await readJournalWithAudit(
          {
            auditLog: ccoAuditLog,
            actor: { role: req.cco?.role, userId: req.headers['x-cco-user'] || null },
            tenantId,
            patientId,
            endpoint: 'GET /api/v1/cco-journal-quick/entry/:entryId/pdf',
            scope: 'pdf_export_read',
            extra: { entryId: req.params.entryId },
          },
          () => store.getEntry({ tenantId, patientId, entryId: req.params.entryId })
        );
        if (!entry) return res.status(404).json({ error: 'not_found' });

        const { exportJournalEntryToPdf } = require('./src/ops/ccoJournalPdfExport');
        const result = await exportJournalEntryToPdf({
          entry,
          getChromium,
          templateVersion: req.query.templateVersion || null,
        });

        auditA(
          'journal.pdf.export',
          req.cco?.role,
          { kind: 'journal_entry', id: entry.entryId || entry.id },
          {
            patientId,
            journalType: entry.journalType,
            tamperHash: result.tamperHash,
            sizeBytes: result.sizeBytes,
            signedAt: entry.signedAt,
            signedByName: entry.signedByName,
          }
        );
        // P0.8 — canonical 'journal.export' alias
        auditA(
          'journal.export',
          req.cco?.role,
          { kind: 'journal_entry', id: entry.entryId || entry.id },
          {
            patientId,
            journalType: entry.journalType,
            format: 'pdf',
            tamperHash: result.tamperHash,
          }
        );

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `inline; filename="journal-${entry.entryId || entry.id}-${(entry.signedAt || '').substring(0, 10)}.pdf"`
        );
        res.setHeader('X-Journal-Tamper-Hash', result.tamperHash);
        res.setHeader('X-Journal-Entry-Id', entry.entryId || entry.id);
        res.setHeader('X-Journal-Signed-At', entry.signedAt || '');
        res.send(result.buffer);
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  console.log(
    '[cco-journal-quick] monterad: PUT /entry, POST /sign+/correction+/unlock, GET /entries+/stats+/pdf (RBAC: journal.read_any/write + unlock=owner)'
  );
} catch (err) {
  console.warn('[cco-journal-quick] kunde inte montera:', err.message);
}

// ── P0.9: Journal QA Dashboard endpoint ──
// GET /api/v1/cco/journal-qa/snapshot?tenantId=hair_tp → 5 statusblock per cursor-regeln.
// Hämtar counts från ccoCustomerStore + ccoJournalStore + ccoTemplateRegistry.
// Counts only — INGA patientnamn/pnr/email i payload. Cache 60s i store.
// Audit: 'journal.qa.read' per anrop (PDL: åtkomst-räkning).
try {
  const { attachRole, requirePermission } = require('./src/security/ccoRbac');
  const { createJournalQaDashboardStore } = require('./src/ops/ccoJournalQaDashboardStore');

  // Lazy-init: store byggs först vid första anrop när all locals är ready.
  let qaDashboardStore = null;
  function getQaDashboardStore() {
    if (qaDashboardStore) return qaDashboardStore;
    if (!app.locals.ccoCustomerStore || !app.locals.ccoJournalStore) return null;
    qaDashboardStore = createJournalQaDashboardStore({
      customerStore: app.locals.ccoCustomerStore,
      journalStore: app.locals.ccoJournalStore,
      photoStore: app.locals.ccoPhotoStore || null,
      templateRegistry: app.locals.ccoTemplateRegistry || null,
      masterCardStore: app.locals.ccoMasterPatientCardLookup || null,
    });
    return qaDashboardStore;
  }

  app.get(
    '/api/v1/cco/journal-qa/snapshot',
    requireCcoAuthenticated,
    attachRole,
    requirePermission('journal.read_any'),
    async (req, res) => {
      const store = getQaDashboardStore();
      if (!store) return res.status(503).json({ error: 'qa_dashboard_unavailable' });
      try {
        const tenantId = req.query.tenantId || req.headers['x-cco-tenant'] || 'hair_tp';
        const snapshot = await store.getSnapshot({ tenantId });
        if (ccoAuditLog) {
          ccoAuditLog.append({
            action: 'journal.qa.read',
            actor: { role: req.cco?.role || 'unknown', userId: req.headers['x-cco-user'] || null },
            target: { kind: 'qa_dashboard', id: tenantId },
            result: 'ok',
            detail: {
              blocks: 5,
              okCount: snapshot.block5?.okCount,
              readiness: snapshot.block5?.status,
            },
          });
        }
        res.json(snapshot);
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  app.post(
    '/api/v1/cco/journal-qa/invalidate',
    requireCcoAuthenticated,
    attachRole,
    requirePermission('journal.read_any'),
    (req, res) => {
      const store = getQaDashboardStore();
      if (!store) return res.status(503).json({ error: 'qa_dashboard_unavailable' });
      const tenantId = req.query.tenantId || req.headers['x-cco-tenant'] || null;
      store.invalidate(tenantId);
      res.json({ invalidated: tenantId || 'all' });
    }
  );

  console.log(
    '[cco-journal-qa] monterad: GET /api/v1/cco/journal-qa/snapshot + POST /invalidate (RBAC: journal.read_any)'
  );
} catch (err) {
  console.warn('[cco-journal-qa] kunde inte montera:', err.message);
}

// ── P0.E: CCO Asset-QA Dashboard v2 + Asset-CRUD per patient (P0.G) ──
// Per `.cursor/rules/cco-no-drive-links-import-only.mdc`:
//   - 11 QA-metrics med link_only_files som PRIMARY metric (mål: 0)
//   - Senaste import-runs + review-queue-stats
//   - Per-patient asset-listning + thumbnail/download via secure storage
// COUNTS ONLY i snapshot — INGA patientnamn/pnr/email/filinnehåll i payload.
// Audit: 'asset.qa.read' + 'asset.read' + 'asset.exported' per anrop.
try {
  const { attachRole, requirePermission } = require('./src/security/ccoRbac');
  const { createCcoPatientAssetStore } = require('./src/ops/ccoPatientAssetStore');
  const { createCcoAssetImportRunStore } = require('./src/ops/ccoAssetImportRunStore');
  const { createCcoAssetReviewQueueStore } = require('./src/ops/ccoAssetReviewQueueStore');
  const { createSecureStorageProvider } = require('./src/ops/ccoSecureStorageProvider');

  // Lazy-init: stores skapas first-call så att data/-filer skapas on-demand
  // (per cursor-regeln: gitignored, on-write only).
  let assetStore = null;
  let importRunStore = null;
  let reviewQueueStore = null;
  let secureStorage = null;
  let assetQaCache = null;
  let assetQaCacheTs = 0;
  const ASSET_QA_CACHE_TTL_MS = 60 * 1000;

  async function ensureAssetStores() {
    if (!assetStore) {
      assetStore = await createCcoPatientAssetStore({
        filePath: config.ccoPatientAssetsPath,
        auditLog: ccoAuditLog,
      });
      app.locals.ccoPatientAssetStore = assetStore;
    }
    if (!importRunStore) {
      importRunStore = await createCcoAssetImportRunStore({
        filePath: config.ccoAssetImportRunsPath,
        auditLog: ccoAuditLog,
      });
      app.locals.ccoAssetImportRunStore = importRunStore;
    }
    if (!reviewQueueStore) {
      reviewQueueStore = await createCcoAssetReviewQueueStore({
        filePath: config.ccoAssetReviewQueuePath,
        auditLog: ccoAuditLog,
      });
      app.locals.ccoAssetReviewQueueStore = reviewQueueStore;
    }
    if (!secureStorage) {
      secureStorage = createSecureStorageProvider({ provider: 'local' });
      app.locals.ccoSecureStorage = secureStorage;
    }
    return { assetStore, importRunStore, reviewQueueStore, secureStorage };
  }

  function invalidateAssetQaCache() {
    assetQaCache = null;
    assetQaCacheTs = 0;
  }

  function maskTail(value, keep = 6) {
    const text = String(value || '');
    if (!text) return null;
    return `...${text.slice(-keep)}`;
  }

  function isDrivePhotoAsset(asset) {
    if (!asset) return false;
    const source = String(asset.sourceSystem || '').toLowerCase();
    const category = String(asset.category || '');
    return (
      (source === 'drive_import' || source === 'drive') &&
      (category.startsWith('photo_') || String(asset.mimeType || '').startsWith('image/'))
    );
  }

  async function assetHasInternalObject(secureStorageProvider, asset) {
    if (!secureStorageProvider || !asset) return false;
    const keys = [asset.thumbnailKey, asset.storageKey].filter(Boolean);
    for (const key of keys) {
      try {
        if (
          typeof secureStorageProvider.exists === 'function' &&
          (await secureStorageProvider.exists(key))
        ) {
          return true;
        }
      } catch {
        /* missing object is handled as not promotable */
      }
    }
    return false;
  }

  function drivePhotoPromotionBlockers(asset) {
    const missing = [];
    if (!asset.patientId || asset.patientId === 'unknown') missing.push('patientId');
    if (!asset.storageKey || asset.storageKey === 'pending-no-binary') missing.push('storageKey');
    if (!asset.checksum) missing.push('checksum');
    if (!(Number(asset.fileSize) > 0)) missing.push('fileSize');
    if (!asset.mimeType) missing.push('mimeType');
    if (asset.status !== 'NEEDS_REVIEW') missing.push(`status=${asset.status || 'unknown'}`);
    return missing;
  }

  async function buildAssetQaSnapshot({ tenantId = 'hair_tp' } = {}) {
    const now = Date.now();
    if (assetQaCache && now - assetQaCacheTs < ASSET_QA_CACHE_TTL_MS) {
      return assetQaCache;
    }
    const stores = await ensureAssetStores();
    const aStats = stores.assetStore.stats(tenantId) || {};
    const recentRuns = stores.importRunStore.listRecentRuns(5) || [];
    const rStats = stores.reviewQueueStore.stats() || {};

    // 11 metrics enligt `.cursor/rules/cco-no-drive-links-import-only.mdc#QA-dashboard ska visa`
    const byStatus = aStats.byStatus || {};
    const discovered = aStats.total || 0;
    const importedToCco =
      (byStatus.IMPORTED_TO_CCO || 0) +
      (byStatus.VERIFIED_IN_CCO || 0) +
      (byStatus.VISIBLE_ON_PATIENT_CARD || 0);
    const verified = (byStatus.VERIFIED_IN_CCO || 0) + (byStatus.VISIBLE_ON_PATIENT_CARD || 0);
    const linkOnly = aStats.linkOnlyCount || 0;
    const needsReview = aStats.needsReviewCount || byStatus.NEEDS_REVIEW || 0;
    const failed = byStatus.FAILED_IMPORT || 0;
    const duplicate = aStats.duplicateCount || byStatus.DUPLICATE || 0;

    // Patient-coverage: räkna unika patienter + de utan journal/foto.
    // Vi använder customerStore (om finns) för total-population.
    const cs = app.locals.ccoCustomerStore || app.locals.ccoCustomersStore;
    let totalPatients = 0;
    try {
      if (cs && typeof cs.getStateForTenant === 'function') {
        const tenantState = await cs.getStateForTenant(tenantId);
        totalPatients = Array.isArray(tenantState?.directory) ? tenantState.directory.length : 0;
      } else if (cs && typeof cs.listCustomers === 'function') {
        const list = await cs.listCustomers({ tenantId });
        totalPatients = Array.isArray(list) ? list.length : 0;
      }
    } catch {
      /* customer-store kanske inte ready — fortsätt med 0 */
    }

    // Räkna unika patient-IDs i asset-store + per kategori.
    const allAssets = Object.values(stores.assetStore._state().items || {});
    const patientsWithAssets = new Set();
    const patientsWithJournal = new Set();
    const patientsWithImage = new Set();
    const patientIdsSeen = new Set();
    let orphans = 0;
    for (const a of allAssets) {
      if (!a.patientId) {
        orphans += 1;
        continue;
      }
      patientIdsSeen.add(a.patientId);
      patientsWithAssets.add(a.patientId);
      if (a.category === 'journal') patientsWithJournal.add(a.patientId);
      if (
        a.category === 'photo_before' ||
        a.category === 'photo_during' ||
        a.category === 'photo_after'
      ) {
        patientsWithImage.add(a.patientId);
      }
    }
    const totalPatientsRef = totalPatients || patientIdsSeen.size;
    const patientsCompleteHistory = (() => {
      let n = 0;
      for (const pId of patientIdsSeen) {
        if (patientsWithJournal.has(pId) && patientsWithImage.has(pId)) n += 1;
      }
      return n;
    })();
    const patientsMissingJournal = Math.max(0, totalPatientsRef - patientsWithJournal.size);
    const patientsMissingImages = Math.max(0, totalPatientsRef - patientsWithImage.size);

    const snapshot = {
      tenantId,
      generatedAt: new Date().toISOString(),
      cacheTtlMs: ASSET_QA_CACHE_TTL_MS,
      // PRIMARY metric — cutover-readiness gate.
      linkOnlyBlockers: linkOnly,
      cutoverReady: linkOnly === 0 && failed === 0,
      // 11 metrics per cursor-regeln
      metrics: {
        totalFilesDiscovered: discovered,
        totalFilesImportedToCco: importedToCco,
        totalFilesVerified: verified,
        totalLinkOnlyFiles: linkOnly,
        totalFilesNeedingReview: needsReview,
        totalFilesFailedImport: failed,
        totalPatientsWithCompleteHistory: patientsCompleteHistory,
        totalPatientsWithMissingJournalPdfs: patientsMissingJournal,
        totalPatientsWithMissingImages: patientsMissingImages,
        totalOrphanFiles: orphans,
        totalDuplicateFiles: duplicate,
      },
      assetStats: aStats,
      recentRuns,
      reviewStats: rStats,
      population: {
        totalPatientsInTenant: totalPatients,
        patientsWithAnyAsset: patientsWithAssets.size,
        patientsWithJournalPdf: patientsWithJournal.size,
        patientsWithImage: patientsWithImage.size,
      },
    };
    assetQaCache = snapshot;
    assetQaCacheTs = now;
    return snapshot;
  }

  app.get(
    '/api/v1/cco/asset-qa/snapshot',
    requireCcoAuthenticated,
    attachRole,
    requirePermission('journal.read_any'),
    async (req, res) => {
      try {
        const tenantId = req.query.tenantId || req.headers['x-cco-tenant'] || 'hair_tp';
        const snapshot = await buildAssetQaSnapshot({ tenantId });
        if (ccoAuditLog) {
          ccoAuditLog.append({
            action: 'journal.qa.read',
            actor: { role: req.cco?.role || 'unknown', userId: req.headers['x-cco-user'] || null },
            target: { kind: 'asset_qa_dashboard', id: tenantId },
            result: 'ok',
            detail: {
              view: 'asset-qa',
              linkOnlyBlockers: snapshot.linkOnlyBlockers,
              metricsCount: 11,
            },
          });
        }
        res.json(snapshot);
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  app.post(
    '/api/v1/cco/asset-qa/invalidate',
    requireCcoAuthenticated,
    attachRole,
    requirePermission('journal.read_any'),
    (req, res) => {
      invalidateAssetQaCache();
      res.json({ invalidated: 'asset-qa' });
    }
  );

  app.post(
    '/api/v1/cco/asset-qa/promote-drive-photos',
    requireCcoAuthenticated,
    attachRole,
    requirePermission('asset.write'),
    async (req, res) => {
      try {
        const stores = await ensureAssetStores();
        const body = req.body || {};
        const commit = body.commit === true || String(req.query.commit || '') === '1';
        const confirmText = body.confirmText || req.query.confirmText || '';
        if (commit && confirmText !== 'PROMOTE DRIVE PHOTOS') {
          return res
            .status(400)
            .json({ error: 'confirmText_required', expected: 'PROMOTE DRIVE PHOTOS' });
        }
        const limit = Math.min(
          1000,
          Math.max(0, Number(body.limit ?? req.query.limit ?? 100) || 0)
        );
        const offset = Math.max(0, Number(body.offset ?? req.query.offset ?? 0) || 0);
        const allAssets = stores.assetStore.listItemsForEnrichment();
        const drivePhotos = allAssets.filter(isDrivePhotoAsset);
        const needsReview = drivePhotos.filter((asset) => asset.status === 'NEEDS_REVIEW');
        const ready = [];
        const blocked = {};
        let scanComplete = true;
        for (const asset of needsReview) {
          const missing = drivePhotoPromotionBlockers(asset);
          if (missing.length) {
            for (const key of missing) blocked[key] = (blocked[key] || 0) + 1;
            continue;
          }
          const hasObject = await assetHasInternalObject(stores.secureStorage, asset);
          if (!hasObject) {
            blocked.object_not_in_storage = (blocked.object_not_in_storage || 0) + 1;
            continue;
          }
          ready.push(asset);
          if (commit && ready.length >= offset + limit) {
            scanComplete = false;
            break;
          }
        }
        const batch = ready.slice(offset, offset + limit);
        const actor = {
          role: req.cco?.role || 'unknown',
          userId: req.headers['x-cco-user'] || 'asset-qa-promote-drive-photos',
          tenantId: req.headers['x-cco-tenant'] || null,
        };
        const promoted = [];
        const failed = [];
        if (commit) {
          for (const asset of batch) {
            try {
              await stores.assetStore.transitionStatus(asset.id, 'VERIFIED_IN_CCO', {
                actor,
                reason: 'drive_photo_internal_object_verified',
              });
              const visible = await stores.assetStore.markAsVisibleOnPatientCard(asset.id, {
                actor,
              });
              promoted.push(visible);
            } catch (err) {
              failed.push({
                id: maskTail(asset.id),
                patientId: maskTail(asset.patientId),
                error: err.message,
              });
            }
          }
          invalidateAssetQaCache();
        }
        const sampleSource = commit ? promoted : batch;
        res.json({
          dryRun: !commit,
          totalDrivePhotos: drivePhotos.length,
          totalNeedsReviewDrivePhotos: needsReview.length,
          promotable: ready.length,
          scanComplete,
          offset,
          limit,
          batchSize: batch.length,
          promoted: promoted.length,
          failed: failed.length,
          blocked,
          samples: sampleSource.slice(0, 5).map((asset) => ({
            assetId: maskTail(asset.id),
            patientId: maskTail(asset.patientId),
            category: asset.category || null,
            mimeType: asset.mimeType || null,
            documentDate: asset.documentDate || null,
            hasThumbnail: !!asset.thumbnailKey,
            status: asset.status || null,
          })),
          errors: failed.slice(0, 10),
        });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  // ── ORD-43: thumbnail-backfill via appens egna stores (observerbart svar) ──
  // dry-run default; commit kräver confirmText. Kör mot app.locals-stores =
  // samma sökväg/secure-storage som webb-appen → inga path-gissningar.
  app.post(
    '/api/v1/cco/asset-qa/backfill-thumbnails',
    requireCcoAuthenticated,
    attachRole,
    requirePermission('asset.write'),
    async (req, res) => {
      try {
        const { backfillAssetThumbnails } = require('./src/ops/ccoAssetThumbnailBackfill');
        // Läs en rapport-JSON skriven av CLI-job till /var/data (observerbarhet)
        if (req.query.readReport) {
          const fsR = require('node:fs');
          const pathR = require('node:path');
          const base = pathR.basename(String(req.query.readReport));
          const fp = pathR.join(process.env.ARCANA_STATE_ROOT || '/var/data', base);
          try {
            const raw = fsR.readFileSync(fp, 'utf8');
            try {
              return res.json({ readReport: base, content: JSON.parse(raw) });
            } catch {
              return res.json({ readReport: base, raw: raw.slice(-6000) });
            }
          } catch (e) {
            return res.status(404).json({ error: 'report_not_found', path: fp, detail: e.message });
          }
        }
        const stores = await ensureAssetStores();
        const body = req.body || {};
        // Diagnos-läge: visa varför kandidater failar (mime/fil/sharp)
        if (String(req.query.diagnose || '') === '1') {
          const IMG = new Set([
            'image/jpeg',
            'image/png',
            'image/heic',
            'image/heif',
            'image/webp',
            'image/gif',
          ]);
          let sharpInfo = null;
          try {
            const sharp = require('sharp');
            sharpInfo = { loaded: true, formats: Object.keys(sharp.format || {}) };
          } catch (e) {
            sharpInfo = { loaded: false, error: e.message };
          }
          const all = stores.assetStore.listItemsForEnrichment();
          const cand = all.filter(
            (a) =>
              (IMG.has(String(a.mimeType || '').toLowerCase()) ||
                String(a.category || '').startsWith('photo_')) &&
              a.storageKey &&
              !a.thumbnailKey
          );
          const dlimit = Math.max(1, Number(req.query.limit || 8));
          const rows = [];
          for (const a of cand.slice(0, dlimit)) {
            let exists = null;
            try {
              exists =
                typeof stores.secureStorage.exists === 'function'
                  ? await stores.secureStorage.exists(a.storageKey)
                  : null;
            } catch (e) {
              exists = 'err:' + e.message;
            }
            rows.push({
              id: a.id,
              mimeType: a.mimeType || null,
              category: a.category || null,
              mimeRecognized: IMG.has(String(a.mimeType || '').toLowerCase()),
              storageKey: a.storageKey,
              exists,
            });
          }
          // Full-scan: hur många bild-kandidater har FAKTISK blob på disk?
          if (String(req.query.scan || '') === '1') {
            const fsMod2 = require('node:fs');
            const pathMod2 = require('node:path');
            const root2 =
              (typeof stores.secureStorage.stats === 'function'
                ? (await stores.secureStorage.stats()).rootPath
                : null) || process.env.ARCANA_CCO_SECURE_STORAGE_ROOT;
            let hasBlob = 0;
            let noBlob = 0;
            const sampleHas = [];
            for (const a of cand) {
              let ok = false;
              try {
                ok = fsMod2.existsSync(pathMod2.join(root2, a.storageKey));
              } catch (e) {
                ok = false;
              }
              if (ok) {
                hasBlob += 1;
                if (sampleHas.length < 5)
                  sampleHas.push({ id: a.id, mimeType: a.mimeType, storageKey: a.storageKey });
              } else noBlob += 1;
            }
            return res.json({
              scan: true,
              root: root2,
              imageCandidates: cand.length,
              hasBlobOnDisk: hasBlob,
              missingBlob: noBlob,
              sampleHasBlob: sampleHas,
            });
          }
          // Sharp-probe: försök faktiskt dekoda en HEIC-blob, fånga felet
          if (String(req.query.sharpProbe || '') === '1') {
            const fsP = require('node:fs');
            const pathP = require('node:path');
            const rootP =
              (typeof stores.secureStorage.stats === 'function'
                ? (await stores.secureStorage.stats()).rootPath
                : null) || process.env.ARCANA_CCO_SECURE_STORAGE_ROOT;
            const probe = [];
            let sharp;
            try {
              sharp = require('sharp');
            } catch (e) {
              return res.json({ sharpProbe: true, sharpLoad: 'fail:' + e.message });
            }
            for (const a of cand) {
              const abs = pathP.join(rootP, a.storageKey);
              if (!fsP.existsSync(abs)) continue;
              const out = { id: a.id, mime: a.mimeType, ext: a.storageKey.split('.').pop() };
              try {
                const meta = await sharp(abs).metadata();
                out.metaFormat = meta.format;
                await sharp(abs)
                  .resize({ width: 320, height: 320, fit: 'inside' })
                  .jpeg()
                  .toBuffer();
                out.thumbOk = true;
              } catch (e) {
                out.thumbOk = false;
                out.error = e.message;
              }
              probe.push(out);
              if (probe.length >= 4) break;
            }
            return res.json({
              sharpProbe: true,
              sharpFormats: Object.keys(sharp.format || {}),
              probe,
            });
          }
          let providerStats = null;
          try {
            providerStats =
              typeof stores.secureStorage.stats === 'function'
                ? await stores.secureStorage.stats()
                : null;
          } catch (e) {
            providerStats = { error: e.message };
          }
          // Sök var blobben faktiskt ligger (rotorsak: storage-root)
          const fsMod = require('node:fs');
          const pathMod = require('node:path');
          const probeKey = rows[0] && rows[0].storageKey;
          const rootProbe = {};
          if (probeKey) {
            for (const base of [
              '/var/data',
              '/var/data/cco-patient-assets',
              '/var/data/secure-storage',
              '/var/data/cco-secure-storage',
              '/var/data/arcana',
              '/var/data/assets',
            ]) {
              try {
                rootProbe[base] = fsMod.existsSync(pathMod.join(base, probeKey));
              } catch (e) {
                rootProbe[base] = 'err';
              }
            }
            // lista /var/data toppnivå
            try {
              rootProbe['__vardata_ls'] = fsMod.readdirSync('/var/data').slice(0, 40);
            } catch (e) {
              rootProbe['__vardata_ls'] = 'err:' + e.message;
            }
          }
          return res.json({
            diagnose: true,
            sharp: sharpInfo,
            candidates: cand.length,
            providerStats,
            envSecureRoot: process.env.ARCANA_CCO_SECURE_STORAGE_ROOT || null,
            rootProbe,
            rows,
          });
        }
        const commit = body.commit === true || String(req.query.commit || '') === '1';
        const confirmText = body.confirmText || req.query.confirmText || '';
        if (commit && confirmText !== 'BACKFILL THUMBNAILS') {
          return res
            .status(400)
            .json({ error: 'confirmText_required', expected: 'BACKFILL THUMBNAILS' });
        }
        const limit = Math.max(0, Number(body.limit ?? req.query.limit ?? 100) || 0);
        const offset = Math.max(0, Number(body.offset ?? req.query.offset ?? 0) || 0);
        const force =
          body.force === true ||
          body.regenerate === true ||
          String(req.query.force || '') === '1' ||
          String(req.query.regenerate || '') === '1';
        const patientId = String(body.patientId ?? req.query.patientId ?? '').trim();
        const report = await backfillAssetThumbnails({
          assetStore: stores.assetStore,
          storage: stores.secureStorage,
          limit,
          offset,
          dryRun: !commit,
          force,
          patientId,
          actor: { role: req.cco?.role || 'unknown', userId: 'ord-43-backfill-endpoint' },
        });
        invalidateAssetQaCache();
        res.json(report);
      } catch (err) {
        res.status(err.statusCode || 500).json({
          error: err.message,
          stack: String(err.stack || '')
            .split('\n')
            .slice(0, 3),
        });
      }
    }
  );

  // ── ORD-41: Drive-internalisering via app.locals (observerbart svar) ──
  // dryRun default; commit=1 hämtar binärer. Kör i webb-processen → fel syns i svaret.
  app.post(
    '/api/v1/cco/asset-qa/internalize-drive',
    requireCcoAuthenticated,
    attachRole,
    requirePermission('asset.import'),
    async (req, res) => {
      try {
        const {
          internalizeDriveAssets,
          collectDriveRowsForInternalization,
        } = require('./src/ops/ccoDriveAssetInternalization');
        const { createCcoAssetImportPipeline } = require('./src/ops/ccoAssetImportPipeline');
        const {
          getDriveFileMetadata,
          loadServiceAccountFromEnv,
        } = require('./src/lib/googleDriveClient');
        const {
          getAccessToken,
          openDriveFileReadStream,
        } = require('./scripts/migration/lib/googleDriveApi');
        const fsI = require('node:fs');
        const pathI = require('node:path');
        const cfg = loadServiceAccountFromEnv();
        if (!cfg.ok) return res.status(503).json({ error: 'drive_sa_missing' });
        let tok = '';
        let tokAt = 0;
        const accessToken = async () => {
          if (tok && Date.now() - tokAt < 50 * 60 * 1000) return tok;
          tok = await getAccessToken(cfg.serviceAccount);
          tokAt = Date.now();
          return tok;
        };
        const respToBuf = async (r) => {
          if (typeof r.arrayBuffer === 'function') return Buffer.from(await r.arrayBuffer());
          const chunks = [];
          for await (const ch of r.body) chunks.push(ch);
          return Buffer.concat(chunks);
        };
        const driveClient = {
          serviceAccountEmail: cfg.serviceAccountEmail,
          async getFileMetadata(id) {
            const r = await getDriveFileMetadata({
              driveFileId: id,
              fields: 'id,name,mimeType,size,modifiedTime,createdTime',
              accessToken: await accessToken(),
            });
            if (!r.ok) throw new Error(r.error || 'drive_metadata_failed');
            return r.metadata;
          },
          async downloadBuffer(id) {
            const r = await openDriveFileReadStream({
              accessToken: await accessToken(),
              driveFileId: id,
            });
            return respToBuf(r);
          },
        };
        const pmPath = pathI.join(
          process.env.ARCANA_STATE_ROOT || '/var/data',
          'cco-patient-master.json'
        );
        const pmState = JSON.parse(fsI.readFileSync(pmPath, 'utf8'));
        const tenantId = 'hair-tp-clinic';
        const stores = await ensureAssetStores();
        const { rows, rowSources } = await collectDriveRowsForInternalization({
          patientMasterState: pmState,
          assetStore: stores.assetStore,
          storage: stores.secureStorage,
          tenantId,
        });
        const pipeline = createCcoAssetImportPipeline({
          assetStore: stores.assetStore,
          importRunStore: stores.importRunStore,
          reviewQueueStore: stores.reviewQueueStore,
          storage: stores.secureStorage,
        });
        const body = req.body || {};
        const commit = String(req.query.commit || '') === '1' || body.commit === true;
        const limit = Math.max(1, Number(body.limit ?? req.query.limit ?? 5));
        const offset = Math.max(0, Number(body.offset ?? req.query.offset ?? 0));
        const report = await internalizeDriveAssets({
          rows,
          assetStore: stores.assetStore,
          importRunStore: stores.importRunStore,
          reviewQueueStore: stores.reviewQueueStore,
          pipeline,
          storage: stores.secureStorage,
          driveClient,
          dryRun: !commit,
          go: commit,
          limit,
          offset,
          sampleSize: 5,
          driveThrottleMs: 75,
          tenantId,
        });
        invalidateAssetQaCache();
        if (report) delete report.remainingRows;
        res.json({
          rowsCollected: rows.length,
          rowSources: { ...rowSources, mergedUnique: rows.length },
          driveSa: cfg.serviceAccountEmail,
          report,
        });
      } catch (err) {
        res.status(500).json({
          error: err.message,
          stack: String(err.stack || '')
            .split('\n')
            .slice(0, 5),
        });
      }
    }
  );

  // ── ORD-41: Async bakgrunds-runner för full Drive-ingest ──
  // Kör i webb-processen (delar app.locals-store = inga skriv-krockar),
  // chunkat, idempotent, throttlat. start/status/stop. Progress i state-fil.
  let __ingestState = {
    running: false,
    startedAt: null,
    finishedAt: null,
    totalRows: 0,
    processedChunks: 0,
    attempted: 0,
    imported: 0,
    needsReview: 0,
    duplicate: 0,
    failed: 0,
    remaining: null,
    lastError: null,
    stopRequested: false,
  };
  async function __runDriveIngestLoop({ chunk, concurrency }) {
    try {
      const {
        internalizeDriveAssets,
        collectDriveRowsForInternalization,
      } = require('./src/ops/ccoDriveAssetInternalization');
      const { createCcoAssetImportPipeline } = require('./src/ops/ccoAssetImportPipeline');
      const {
        getDriveFileMetadata,
        loadServiceAccountFromEnv,
      } = require('./src/lib/googleDriveClient');
      const {
        getAccessToken,
        openDriveFileReadStream,
      } = require('./scripts/migration/lib/googleDriveApi');
      const fsI = require('node:fs');
      const pathI = require('node:path');
      const cfg = loadServiceAccountFromEnv();
      if (!cfg.ok) throw new Error('drive_sa_missing');
      let tok = '';
      let tokAt = 0;
      const accessToken = async () => {
        if (tok && Date.now() - tokAt < 50 * 60 * 1000) return tok;
        tok = await getAccessToken(cfg.serviceAccount);
        tokAt = Date.now();
        return tok;
      };
      const respToBuf = async (r) => {
        if (typeof r.arrayBuffer === 'function') return Buffer.from(await r.arrayBuffer());
        const chunks = [];
        for await (const ch of r.body) chunks.push(ch);
        return Buffer.concat(chunks);
      };
      const driveClient = {
        serviceAccountEmail: cfg.serviceAccountEmail,
        async getFileMetadata(id) {
          const r = await getDriveFileMetadata({
            driveFileId: id,
            fields: 'id,name,mimeType,size,modifiedTime,createdTime',
            accessToken: await accessToken(),
          });
          if (!r.ok) throw new Error(r.error || 'drive_metadata_failed');
          return r.metadata;
        },
        async downloadBuffer(id) {
          const r = await openDriveFileReadStream({
            accessToken: await accessToken(),
            driveFileId: id,
          });
          return respToBuf(r);
        },
      };
      const pmPath = pathI.join(
        process.env.ARCANA_STATE_ROOT || '/var/data',
        'cco-patient-master.json'
      );
      const pmState = JSON.parse(fsI.readFileSync(pmPath, 'utf8'));
      const tenantId = 'hair-tp-clinic';
      const stores = await ensureAssetStores();
      const { rows } = await collectDriveRowsForInternalization({
        patientMasterState: pmState,
        assetStore: stores.assetStore,
        storage: stores.secureStorage,
        tenantId,
      });
      __ingestState.totalRows = rows.length;
      const pipeline = createCcoAssetImportPipeline({
        assetStore: stores.assetStore,
        importRunStore: stores.importRunStore,
        reviewQueueStore: stores.reviewQueueStore,
        storage: stores.secureStorage,
      });
      const progressPath = pathI.join(
        process.env.ARCANA_STATE_ROOT || '/var/data',
        'ingest-progress.json'
      );
      while (!__ingestState.stopRequested) {
        const report = await internalizeDriveAssets({
          rows,
          assetStore: stores.assetStore,
          importRunStore: stores.importRunStore,
          reviewQueueStore: stores.reviewQueueStore,
          pipeline,
          storage: stores.secureStorage,
          driveClient,
          dryRun: false,
          go: true,
          limit: chunk,
          sampleSize: 0,
          driveThrottleMs: 40,
          concurrency: concurrency || 1,
          tenantId,
        });
        const st = (report && report.stats) || {};
        __ingestState.processedChunks += 1;
        __ingestState.attempted += st.attempted || 0;
        __ingestState.imported += st.imported || 0;
        __ingestState.needsReview += st.needsReview || 0;
        __ingestState.duplicate += st.duplicate || 0;
        __ingestState.failed += st.failed || 0;
        __ingestState.remaining =
          (st.scanned || 0) - (st.alreadyInternal || 0) - (st.batchSize || 0);
        try {
          fsI.writeFileSync(progressPath, JSON.stringify(__ingestState));
        } catch {
          /* best-effort */
        }
        invalidateAssetQaCache();
        if (!st.batchSize) break;
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (err) {
      __ingestState.lastError = err.message;
    } finally {
      __ingestState.running = false;
      __ingestState.finishedAt = new Date().toISOString();
    }
  }
  app.post(
    '/api/v1/cco/asset-qa/run-ingest',
    requireCcoAuthenticated,
    attachRole,
    requirePermission('asset.import'),
    (req, res) => {
      const action = String(req.query.action || 'status');
      if (action === 'backup') {
        try {
          const fsB = require('node:fs');
          const pathB = require('node:path');
          const root = process.env.ARCANA_STATE_ROOT || '/var/data';
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          const dir = pathB.join(root, 'backups', 'pre-ingest-' + stamp);
          fsB.mkdirSync(dir, { recursive: true });
          const files = [
            'cco-patient-assets.json',
            'cco-asset-import-runs.json',
            'cco-asset-review-queue.json',
          ];
          const copied = [];
          for (const f of files) {
            const src = pathB.join(root, f);
            if (fsB.existsSync(src)) {
              fsB.copyFileSync(src, pathB.join(dir, f));
              copied.push({ file: f, bytes: fsB.statSync(src).size });
            }
          }
          return res.json({ ok: true, backupDir: dir, copied });
        } catch (e) {
          return res.status(500).json({ error: e.message });
        }
      }
      if (action === 'stop') {
        __ingestState.stopRequested = true;
        return res.json({ ok: true, stopRequested: true, state: __ingestState });
      }
      if (action === 'start') {
        if (__ingestState.running) {
          return res.json({ ok: true, already: true, state: __ingestState });
        }
        const chunk = Math.max(1, Math.min(200, Number(req.query.chunk || 40)));
        const concurrency = Math.max(1, Math.min(8, Number(req.query.concurrency || 4)));
        __ingestState = {
          running: true,
          startedAt: new Date().toISOString(),
          finishedAt: null,
          totalRows: 0,
          processedChunks: 0,
          attempted: 0,
          imported: 0,
          needsReview: 0,
          duplicate: 0,
          failed: 0,
          remaining: null,
          lastError: null,
          stopRequested: false,
          chunk,
          concurrency,
        };
        __runDriveIngestLoop({ chunk, concurrency });
        return res.json({ ok: true, started: true, chunk, concurrency, state: __ingestState });
      }
      return res.json({ ok: true, state: __ingestState });
    }
  );

  // ── P0.G: Per-patient asset-listning för patientkort ──
  app.get(
    '/api/v1/cco/patients/:patientId/assets',
    requireCcoAuthenticated,
    attachRole,
    requirePermission('asset.read'),
    async (req, res) => {
      try {
        const stores = await ensureAssetStores();
        const patientId = String(req.params.patientId || '').trim();
        if (!patientId) return res.status(400).json({ error: 'patientId required' });
        const tenantId =
          req.cco?.tenantId ||
          req.headers['x-cco-tenant'] ||
          config.defaultTenantId ||
          'hair-tp-clinic';
        const actor = {
          role: req.cco?.role || 'unknown',
          userId: req.headers['x-cco-user'] || null,
          tenantId,
        };
        const patient =
          app.locals.ccoPatientMasterStore?.getPatient && tenantId
            ? await app.locals.ccoPatientMasterStore.getPatient({ tenantId, patientId })
            : null;
        const patientIds = await resolvePatientAssetIds({
          patientId,
          patient,
          tenantId,
          customerStore: app.locals.ccoCustomerStore,
          assetStore: stores.assetStore,
        });
        const seen = new Set();
        const all = [];
        for (const id of patientIds) {
          const rows =
            stores.assetStore.listAssetsForPatient(
              id,
              {},
              {
                actor,
              }
            ) || [];
          for (const row of rows) {
            if (!row?.id || seen.has(row.id)) continue;
            seen.add(row.id);
            all.push(row);
          }
        }

        // Synlighet: dölj REJECTED + DUPLICATE från default-listning;
        // visa via ?includeAll=1 om operatör behöver.
        const includeAll = String(req.query.includeAll || '') === '1';
        const visible = all.filter((a) => {
          if (includeAll) return true;
          return a.status !== 'REJECTED' && a.status !== 'DUPLICATE';
        });

        // Gruppera per kategori (default: groupByCategory=1)
        const groupByCategory = String(req.query.groupByCategory || '1') === '1';
        const counts = {};
        let linkOnlyCount = 0;
        let inReviewCount = 0;
        for (const a of visible) {
          counts[a.category || 'other'] = (counts[a.category || 'other'] || 0) + 1;
          if (a.status === 'LINK_ONLY_BLOCKER') linkOnlyCount += 1;
          if (a.status === 'NEEDS_REVIEW') inReviewCount += 1;
        }

        // Sortera: nyaste first per kategori (documentDate desc, importedAt desc fallback)
        const sortFn = (a, b) => {
          const da = a.documentDate || a.importedAt || '';
          const db = b.documentDate || b.importedAt || '';
          return db.localeCompare(da);
        };
        visible.sort(sortFn);

        // PII-säkring: server returnerar originalFileName för staff-UI; client
        // får visa "displayName" där möjligt. INGA PII i payload utöver det.
        const out = visible.map((a) => ({
          id: a.id,
          patientId: a.patientId,
          encounterId: a.encounterId,
          category: a.category,
          status: a.status,
          documentDate: a.documentDate,
          captureDate: a.captureDate || null,
          captureDateTime: a.captureDateTime || null,
          captureDateSource: a.captureDateSource || null,
          captureDateConfidence: a.captureDateConfidence || null,
          captureDateMismatch: !!a.captureDateMismatch,
          captureCameraMake: a.captureCameraMake || null,
          captureCameraModel: a.captureCameraModel || null,
          importedAt: a.importedAt,
          importRunId: a.importRunId,
          sourceSystem: a.sourceSystem,
          confidence: a.confidence,
          mimeType: a.mimeType,
          fileSize: a.fileSize,
          originalFileName: a.originalFileName,
          hasThumbnail: !!a.thumbnailKey,
          ...assetToPatientFile(a),
        }));

        const response = {
          patientId,
          total: visible.length,
          counts,
          linkOnlyCount,
          inReviewCount,
          items: out,
        };
        if (groupByCategory) {
          const byCategory = {};
          for (const a of out) {
            const key = a.category || 'other';
            if (!byCategory[key]) byCategory[key] = [];
            byCategory[key].push(a);
          }
          response.byCategory = byCategory;
        }
        res.json(response);
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  app.get(
    '/api/v1/cco/assets/:assetId/download',
    requireCcoAuthenticated,
    attachRole,
    requirePermission('asset.read'),
    async (req, res) => {
      try {
        const stores = await ensureAssetStores();
        const assetId = String(req.params.assetId || '').trim();
        const asset = stores.assetStore.getAsset(assetId);
        if (!asset) return res.status(404).json({ error: 'asset_not_found' });
        if (!asset.storageKey) return res.status(409).json({ error: 'asset_has_no_storage_key' });

        const obj = stores.secureStorage.getObjectStream
          ? await stores.secureStorage.getObjectStream(asset.storageKey)
          : await stores.secureStorage.getObject(asset.storageKey);
        const mime = asset.mimeType || obj.mimeType || 'application/octet-stream';
        const fname = (asset.originalFileName || `asset-${assetId}`).replace(/["\\\r\n]/g, '');
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Length', obj.size);
        // attachment = browser laddar ner; client kan välja `?inline=1` för iframe-preview
        const disposition = String(req.query.inline || '') === '1' ? 'inline' : 'attachment';
        res.setHeader('Content-Disposition', `${disposition}; filename="${fname}"`);
        res.setHeader('Cache-Control', 'private, max-age=60');
        if (ccoAuditLog) {
          ccoAuditLog.append({
            action: 'asset.exported',
            actor: { role: req.cco?.role || 'unknown', userId: req.headers['x-cco-user'] || null },
            target: {
              kind: 'patient_asset',
              id: assetId,
              tenantId: req.headers['x-cco-tenant'] || null,
            },
            result: 'ok',
            detail: {
              patientId: asset.patientId,
              category: asset.category,
              mimeType: mime,
              disposition,
            },
          });
        }
        if (obj.stream && !obj.buffer) {
          obj.stream.on('error', () => {
            if (!res.headersSent) res.status(500).end();
            else res.destroy();
          });
          obj.stream.pipe(res);
        } else {
          res.send(obj.buffer);
        }
      } catch (err) {
        if (err && err.code === 'ENOENT')
          return res.status(404).json({ error: 'object_not_in_storage' });
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  app.get(
    '/api/v1/cco/assets/:assetId/thumbnail',
    requireCcoAuthenticated,
    attachRole,
    requirePermission('asset.read'),
    async (req, res) => {
      try {
        const stores = await ensureAssetStores();
        const assetId = String(req.params.assetId || '').trim();
        const asset = stores.assetStore.getAsset(assetId);
        if (!asset) return res.status(404).json({ error: 'asset_not_found' });
        const key = asset.thumbnailKey || null;
        if (!key) return res.status(404).json({ error: 'no_thumbnail' });
        const obj = stores.secureStorage.getObjectStream
          ? await stores.secureStorage.getObjectStream(key)
          : await stores.secureStorage.getObject(key);
        res.setHeader('Content-Type', obj.mimeType || 'image/jpeg');
        res.setHeader('Content-Length', obj.size);
        res.setHeader('Cache-Control', 'private, max-age=300');
        if (obj.stream && !obj.buffer) {
          obj.stream.on('error', () => {
            if (!res.headersSent) res.status(500).end();
            else res.destroy();
          });
          obj.stream.pipe(res);
        } else {
          res.send(obj.buffer);
        }
      } catch (err) {
        if (err && err.code === 'ENOENT')
          return res.status(404).json({ error: 'object_not_in_storage' });
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  console.log(
    '[cco-asset-qa] monterad: GET /api/v1/cco/asset-qa/snapshot + invalidate · /patients/:id/assets · /assets/:id/{download,thumbnail}'
  );

  const photoWriteEnabled = config.enablePhotoReviewWrite === true;
  const photoPilotConfig = photoWriteEnabled
    ? {
        canaryMode: config.enableCcoOperatorCanary,
        maxDecisions: config.photoReviewCanaryMax,
        fullCohort: config.photoReviewFullCohort,
        maxPatients: Number(process.env.PHOTO_REVIEW_PILOT_MAX_PATIENTS) || 5,
      }
    : null;
  const { createCcoPhotoReviewRouter } = require('./src/routes/ccoPhotoReview');
  app.use(
    '/api/v1/cco',
    createCcoPhotoReviewRouter({
      resolveStores: ensureAssetStores,
      requireCcoAuthenticated,
      attachRole,
      requirePermission,
      auditLog: ccoAuditLog,
      writeEnabled: photoWriteEnabled,
      pilotConfig: photoPilotConfig,
    })
  );
  console.log(
    `[cco-photo-review] monterad write=${photoWriteEnabled ? 'CANARY' : 'READ-ONLY'}: GET/POST photo-review/*`
  );

  const { createCcoImportReviewReadRouter } = require('./src/routes/ccoImportReviewRead');
  app.use(
    '/api/v1/ops',
    createCcoImportReviewReadRouter({
      projectRoot: __dirname,
      config,
      auditLog: ccoAuditLog,
      requireCcoAuthenticated,
      attachRole,
      requirePermission,
    })
  );
  console.log(
    `[cco-import-review] import write=${config.enableImportReviewWrite ? 'CANARY' : 'READ-ONLY'}`
  );
} catch (err) {
  console.warn('[cco-asset-qa] kunde inte montera:', err.message);
}

// ── Steg 6: Clean URL för patient-portal — /portal/:token → patient-portal.html
// Detta gör att email-länkar blir cleaner (https://...com/portal/AbC123) istället för full ?token=xxx
// HTML:en själv hanterar token-extrahering från path eller query
app.get('/portal/:token', (req, res, next) => {
  const token = req.params.token;
  if (!token || token.length < 8) return next(); // låt 404 hantera
  // Servera patient-portal.html direkt
  res.sendFile(path.join(__dirname, 'public', 'patient-portal.html'));
});

// ── CCO Patient Portal Staff API (Beslut #2: wrap legacy createInvite med RBAC) ──
try {
  const { attachRole, requirePermission } = require('./src/security/ccoRbac');
  const expressP = require('express');
  const jsonParserP = expressP.json({ limit: '16kb' });

  function getPortalStore() {
    return app.locals.patientPortalStore;
  }

  // POST /api/v1/cco-portal/invites — staff skapar invite för patient
  app.post(
    '/api/v1/cco-portal/invites',
    requireCcoAuthenticated,
    attachRole,
    requirePermission('portal.write'),
    jsonParserP,
    async (req, res) => {
      const store = getPortalStore();
      if (!store) return res.status(503).json({ error: 'portal_store_unavailable' });
      try {
        const {
          tenantId = 'hairtpclinic',
          patientId,
          patientName,
          patientEmail,
          serviceLabel = 'Förbehandling',
          appointmentDate = null,
          encounterId = null,
          forms = [
            {
              formId: 'health_declaration',
              journalType: 'health_declaration',
              formVariant: 'hair_tp',
              label: 'Hälsodeklaration',
            },
          ],
          expiresInDays = 7,
        } = req.body || {};
        if (!patientId) return res.status(400).json({ error: 'patientId krävs' });
        if (!patientName) return res.status(400).json({ error: 'patientName krävs' });

        const invite = await store.createInvite({
          tenantId,
          patientId,
          patientName,
          serviceLabel,
          appointmentDate,
          encounterId,
          forms,
          expiresInDays,
        });
        if (ccoAuditLog) {
          ccoAuditLog.append({
            action: 'portal.invite.create',
            actor: { role: req.cco?.role },
            target: { kind: 'portal_invite', id: invite.token.substring(0, 12) + '…' },
            detail: { patientId, patientName, forms: forms.map((f) => f.formId), expiresInDays },
          });
        }

        const baseUrl = process.env.PUBLIC_BASE_URL || 'https://hairtpclinic.com';
        // Steg 6: använd cleaner /portal/:token-URL för patient (HTML), behåll API-URL för referens
        const inviteUrl = `${baseUrl}/portal/${encodeURIComponent(invite.token)}`;
        const apiInviteUrl = `${baseUrl}/api/patient-portal/${encodeURIComponent(invite.token)}`;

        // Om patientEmail finns och sendStore är konfigurerad → skicka via dry-run-flow
        let sendResult = null;
        const sendStore = app.locals.ccoSendActionStore;
        if (patientEmail && sendStore) {
          try {
            const payload = sendStore.buildFormPayload({
              customerName: patientName,
              customerEmail: patientEmail,
              customerId: patientId,
              formKind:
                forms[0].journalType === 'fitness_certificate'
                  ? 'fitness_certificate'
                  : 'health_declaration',
              urlToken: invite.token,
            });
            // Override URL till patient-portal-link
            payload.html = `<p>Hej ${patientName},</p><p>Inför ditt besök behöver vi din ${forms.map((f) => f.label).join(', ')}.</p><p><a href="${inviteUrl}">Öppna formulär</a> (giltig i ${expiresInDays} dagar)</p><p>Hair TP Clinic</p>`;
            payload.text = `Hej ${patientName},\n\nInför ditt besök behöver vi din ${forms.map((f) => f.label).join(', ')}.\n\n${inviteUrl}\n\n(giltig i ${expiresInDays} dagar)\n\nHair TP Clinic`;
            payload.meta = {
              ...payload.meta,
              inviteToken: invite.token,
              forms: forms.map((f) => f.formId),
            };
            sendResult = await sendStore.performSend({
              kind: 'form',
              payload,
              customerId: patientId,
              role: req.cco?.role,
              dryRunOverride: typeof req.body?.dryRun === 'boolean' ? req.body.dryRun : null,
            });
          } catch (err) {
            sendResult = { ok: false, error: err.message };
          }
        }

        res.json({
          ok: true,
          invite: {
            token: invite.token,
            patientId: invite.patientId,
            patientName: invite.patientName,
            forms: invite.forms,
            expiresAt: invite.expiresAt,
            inviteUrl, // patient-facing HTML-URL
            apiInviteUrl, // staff-facing API-URL för debugging
          },
          send: sendResult,
          complianceNote: sendResult?.dryRun
            ? 'Invite skapad. Email INTE skickad (dry-run). Du kan kopiera inviteUrl manuellt.'
            : 'Invite skapad och skickad till patient.',
        });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  // GET /api/v1/cco-portal/invites — staff listar pending invites
  app.get(
    '/api/v1/cco-portal/invites',
    requireCcoAuthenticated,
    attachRole,
    requirePermission('portal.read'),
    async (req, res) => {
      const store = getPortalStore();
      if (!store) return res.status(503).json({ error: 'portal_store_unavailable' });
      try {
        const tenantId = req.query.tenantId || 'hairtpclinic';
        const pending = store.listPending(tenantId) || [];
        res.json({
          count: pending.length,
          invites: pending.map((i) => ({
            token: i.token.substring(0, 12) + '…', // partial — bara visa första bitar i lista
            patientId: i.patientId,
            patientName: i.patientName,
            serviceLabel: i.serviceLabel,
            appointmentDate: i.appointmentDate,
            forms: i.forms?.map((f) => f.formId),
            createdAt: i.createdAt,
            expiresAt: i.expiresAt,
            status: i.completedAt ? 'completed' : 'pending',
          })),
        });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  console.log(
    '[cco-portal-staff] monterad: POST /api/v1/cco-portal/invites + GET /invites (portal.write/read)'
  );
} catch (err) {
  console.warn('[cco-portal-staff] kunde inte montera:', err.message);
}

// ── CCO AI Service (Sprint F: tone-selector + journal extract) ──
try {
  const { draftReply, extractFields, VALID_TONES } = require('./src/ops/ccoAiService');
  const { attachRole, requirePermission } = require('./src/security/ccoRbac');
  const expressF = require('express');
  const jsonParserF = expressF.json({ limit: '32kb' });

  // POST /api/v1/cco-ai/draft — RBAC: mail.send (genererar utkast för svar)
  app.post(
    '/api/v1/cco-ai/draft',
    attachRole,
    requirePermission('mail.send'),
    jsonParserF,
    (req, res) => {
      try {
        const result = draftReply(req.body || {});
        if (ccoAuditLog) {
          ccoAuditLog.append({
            action: 'ai.draft.generate',
            actor: {
              role: req.cco?.role,
              ip: (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
                .toString()
                .split(',')[0]
                .trim(),
            },
            target: { kind: 'ai_draft', id: result.metadata.intent },
            detail: { tone: result.tone, wordCount: result.metadata.wordCount },
          });
        }
        res.json(result);
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message, validTones: VALID_TONES });
      }
    }
  );

  // POST /api/v1/cco-ai/extract — RBAC: journal.write (förbereder journal-fält)
  app.post(
    '/api/v1/cco-ai/extract',
    attachRole,
    requirePermission('journal.write'),
    jsonParserF,
    (req, res) => {
      try {
        const result = extractFields(req.body || {});
        if (ccoAuditLog) {
          ccoAuditLog.append({
            action: 'ai.extract.fields',
            actor: {
              role: req.cco?.role,
              ip: (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
                .toString()
                .split(',')[0]
                .trim(),
            },
            target: { kind: 'ai_extract', id: null },
            detail: {
              fieldCount: Object.keys(result.fields || {}).length,
              confidence: result.confidence,
              textLength: result.metadata?.textLength || 0,
            },
          });
        }
        res.json(result);
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  // GET /api/v1/cco-ai/tones — lista giltiga toner (för UI-dropdown)
  app.get('/api/v1/cco-ai/tones', attachRole, requirePermission('mail.read'), (req, res) => {
    res.json({ tones: VALID_TONES });
  });

  console.log(
    '[cco-ai] monterad: POST /api/v1/cco-ai/draft (mail.send), /extract (journal.write), GET /tones'
  );
} catch (err) {
  console.warn('[cco-ai] kunde inte montera:', err.message);
}

// ── CCO Feedback endpoint (från stage-badge "Rapportera"-knapp) ──
try {
  const feedbackDir = path.join(__dirname, 'data');
  const feedbackFile = path.join(feedbackDir, 'cco-feedback.jsonl');
  if (!fs.existsSync(feedbackDir)) fs.mkdirSync(feedbackDir, { recursive: true });
  // Egen body-parser för att inte kollidera med ev. global express.json() limit
  const express = require('express');
  app.post('/api/v1/cco-feedback', express.json({ limit: '50kb' }), (req, res) => {
    try {
      const entry = req.body && typeof req.body === 'object' ? req.body : null;
      if (!entry || !entry.text) {
        return res.status(400).json({ error: 'text required' });
      }
      entry.receivedAt = new Date().toISOString();
      entry.ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
        .toString()
        .split(',')[0]
        .trim();
      fs.appendFileSync(feedbackFile, JSON.stringify(entry) + '\n');
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: 'invalid json: ' + err.message });
    }
  });
  app.get('/api/v1/cco-feedback', requireCcoAuthenticated, (req, res) => {
    try {
      const raw = fs.existsSync(feedbackFile) ? fs.readFileSync(feedbackFile, 'utf8') : '';
      const items = raw
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      res.json({ count: items.length, items: items.slice(-200) });
    } catch (err) {
      res.json({ count: 0, items: [] });
    }
  });
  console.log('[cco-feedback] monterad: POST/GET /api/v1/cco-feedback');
} catch (err) {
  console.warn('[cco-feedback] kunde inte montera:', err.message);
}

const ADMIN_HTML_PATH = path.join(__dirname, 'public', 'admin.html');
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

// Frankfurt-cutover: legacy .se-alias → canonical .com (301).
app.use((req, res, next) => {
  const legacyRedirectUrl = resolveLegacyHostRedirectUrl({
    requestHost: req.get('host') || req.hostname,
    requestPath: req.path,
    requestSearch: req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '',
    redirectMap: config.legacyHostRedirects,
    enabled: config.legacySeHostRedirectEnabled,
  });
  if (legacyRedirectUrl) {
    return res.redirect(301, legacyRedirectUrl);
  }
  return next();
});

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
      "img-src 'self' data: blob: https:",
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
  if (disableCachePaths.has(path) || isPreviewAssetPath) {
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
    const inject =
      '<script>window.__ARCANA_STAFF_JOURNAL_OPEN__=true;</script>' +
      "<script>if('serviceWorker'in navigator){navigator.serviceWorker.getRegistrations().then(function(r){return Promise.all(r.map(function(x){return x.unregister();}));}).catch(function(){});}</script>";
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${inject}</head>`);
    }
  }
  if (Array.isArray(config.pilotPatientIds) && config.pilotPatientIds.length) {
    const idsJson = JSON.stringify(config.pilotPatientIds);
    const inject = `<script>window.__ARCANA_PILOT_PATIENT_IDS__=${idsJson};</script>`;
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${inject}</head>`);
    }
  }
  // Mobil /staff URL (history.replaceState) får inte bryta relativa asset-sökvägar.
  if (!/<base\s/i.test(html)) {
    html = html.replace('<head>', '<head>\n    <base href="/major-arcana-preview/">');
  }
  const desktopPatientDeepLinkShim =
    "<script>(function(){try{var p=new URLSearchParams(location.search);var id=(p.get('patientId')||'').trim();if(!id||(p.get('view')||'customers')!=='customers')return;if(window.matchMedia&&window.matchMedia('(max-width:767px)').matches)return;var n=0;(function a(){n+=1;var u=window.ArcanaPatientMasterUi;if(u&&typeof u.openPatient==='function'){var r=typeof u.getRuntime==='function'?u.getRuntime():null;if(r&&r.selectedPatientId===id&&r.detail&&r.detail.card){try{document.querySelector('[data-patient-master-rail]')?.scrollIntoView({block:'nearest'});}catch(_s){}return}void u.openPatient(id).then(function(){try{u.refreshV10KundkortFacit?.();document.querySelector('.customers-layout')?.setAttribute('data-v9-dossier-open','on');document.querySelector('[data-patient-master-rail]')?.scrollIntoView({block:'nearest'});}catch(_e){}});return}if(n<120)window.setTimeout(a,250)})()}catch(_e){}})();</script>";
  if (html.includes('</body>')) {
    html = html.replace('</body>', `${desktopPatientDeepLinkShim}</body>`);
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

// ORD-19: /kunder.html avveckling — 301 redirect till SPA-customers-view.
// MÅSTE ligga FÖRE express.static så filen aldrig serveras direkt.
app.get('/kunder.html', (req, res) => {
  const v9Param = String(req.query.v9 || 'on');
  res.redirect(301, `/major-arcana-preview/?view=customers&v9=${encodeURIComponent(v9Param)}`);
});

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
      } else if (/\/major-arcana-preview\/app\/patient-master-ui\.js$/i.test(safe)) {
        // Early deep-link UI ändras ofta under CCO UAT; håll cachen kort så visuella fixar syns.
        res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
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
const { createDocsRouter } = require('./src/routes/docs');
const { createPublicClinicRouter } = require('./src/routes/publicClinic');
const { createPublicBookingEngineRouter } = require('./src/routes/publicBookingEngine');
const { createBookingPublicActionsRouter } = require('./src/routes/bookingPublicActions');
const { createPublicWebEventsRouter } = require('./src/routes/publicWebEvents');
const { createMarketingConnectorBridgeRouter } = require('./src/routes/marketingConnectorBridge');
const { createCmoConnectorHealthStateStore } = require('./src/ops/cmoConnectorHealthState');
const { createPostOpReviewStore } = require('./src/ops/postOpReviewStore');
const { createPostOpReviewRouter } = require('./src/routes/postOpReview');
const { createBillingRouter } = require('./src/routes/billing');
const { createKnowledgeRouter } = require('./src/routes/knowledge');
const { createPosRouter } = require('./src/routes/pos');
const { createPosStore } = require('./src/pos/posStore');
const {
  createPatientPortalRouter,
  createPatientPortalStore,
} = require('./src/routes/patientPortal');
const { createPatientIdentityRouter } = require('./src/routes/patientIdentity');
const { createPatientIdentityStore } = require('./src/ops/patientIdentityVerification');
const { createVideoRouter } = require('./src/routes/video');
const { createSignalingService } = require('./src/video/signalingServer');
const { createMeetingTranscriptionService } = require('./src/video/meetingTranscription');
const { createQmsRouter } = require('./src/routes/qms');
const { createQmsStore } = require('./src/qms/qmsStore');
const { createCmRouter } = require('./src/routes/cm');
const { createCmStore } = require('./src/cm/cmStore');
const { createReconciliationRouter } = require('./src/routes/reconciliation');
const { createComplianceRouter } = require('./src/routes/compliance');
const { createSafeMergeService } = require('./src/migration/safeMergeService');
const { createBillingService } = require('./src/billing/billingService');
const { createStripeClient } = require('./src/billing/stripeClient');
const { createStripeWebhookHandler } = require('./src/billing/stripeWebhook');
const { createTenantKnowledgeStore } = require('./src/knowledge/tenantKnowledgeStore');
const { createMicrosoftGraphReadConnector } = require('./src/infra/microsoftGraphReadConnector');
const { createMicrosoftGraphSendConnector } = require('./src/infra/microsoftGraphSendConnector');
const { createScheduler } = require('./src/ops/scheduler');
const { createAlertNotifier } = require('./src/ops/alertNotifier');
const { runStartupDiskGuard } = require('./src/ops/startupDiskGuard');
const { waitForPersistentRoot } = require('./src/ops/persistentDir');
const { createSecretRotationStore } = require('./src/ops/secretRotationStore');
const { createRuntimeMetricsStore } = require('./src/ops/runtimeMetrics');
const { createPatientConversionStore } = require('./src/ops/patientConversionStore');
const { createWebBridgeAuditStore } = require('./src/ops/webBridgeAuditStore');
const { createCcoHistoryStore } = require('./src/ops/ccoHistoryStore');
const { createCcoMailboxTruthStore } = require('./src/ops/ccoMailboxTruthStore');
const { createConfiguredCcoMailboxTruthStore } = require('./src/ops/ccoMailboxTruthStoreFactory');
const { createCcoMailIngestionStore } = require('./src/ops/ccoMailIngestion/store');
const { createCcoMailIngestionSyncService } = require('./src/ops/ccoMailIngestion/syncService');
const { createCcoMailIngestionWorker } = require('./src/ops/ccoMailIngestion/worker');
const {
  createMicrosoftGraphChangeNotifications,
} = require('./src/infra/microsoftGraphChangeNotifications');
const { createCcoMailIngestionRouter } = require('./src/routes/ccoMailIngestion');
const {
  createCcoHalsoHealthDeclarationIngest,
} = require('./src/ops/ccoHalsoHealthDeclarationIngest');
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
const { createCcoFortnoxStore } = require('./src/ops/ccoFortnoxStore');
const { createCcoSwishStore } = require('./src/ops/ccoSwishStore');
const { createCcoSettingsStore } = require('./src/ops/ccoSettingsStore');
const { createCcoMacroStore } = require('./src/ops/ccoMacroStore');
const { createCcoCustomerStore } = require('./src/ops/ccoCustomerStore');
const { createCcoPatientMasterStore } = require('./src/ops/ccoPatientMasterStore');
const { createCcoDocumentInstanceStore } = require('./src/ops/ccoDocumentInstanceStore');
const { buildPatientDocumentBundle } = require('./src/ops/ccoPatientDocumentAggregator');
const { createCcoJournalStore } = require('./src/ops/ccoJournalStore');
const { createCcoTreatmentEncounterStore } = require('./src/ops/ccoTreatmentEncounterStore');
const { createCcoJournalPhotoStore } = require('./src/ops/ccoJournalPhotoStore');
const {
  buildQuoteOpenTimelineEvents,
  createCcoCommercialStore,
} = require('./src/ops/ccoCommercialStore');
const { createCcoTreatmentAgreementStore } = require('./src/ops/ccoTreatmentAgreementStore');
const {
  createCcoTemplateVersionApprovalStore,
} = require('./src/ops/ccoTemplateVersionApprovalStore');
const { createCcoOfferDocumentStore } = require('./src/ops/ccoOfferDocumentStore');
const { createCcoMigrationIndexStore } = require('./src/ops/ccoMigrationIndexStore');
const { createCcoPatientSystemStore } = require('./src/ops/ccoPatientSystemStore');
const { createCcoConsultationStore } = require('./src/ops/ccoConsultationStore');
const { createCcoAftercareStore } = require('./src/ops/ccoAftercareStore');
const { createCcoOperationStore } = require('./src/ops/ccoOperationStore');
const { createCcoPatientCareStateStore } = require('./src/ops/ccoPatientCareStateStore');
const { createCapabilityAnalysisStore } = require('./src/capabilities/analysisStore');
const { createCapabilityExecutor } = require('./src/capabilities/executionService');
const { createSloTicketStore } = require('./src/ops/sloTicketStore');
const { createReleaseGovernanceStore } = require('./src/ops/releaseGovernanceStore');
const { createCcoWorkspaceRouter } = require('./src/routes/ccoWorkspace');
const { createCcoBookingsRouter } = require('./src/routes/ccoBookings');
const { createCcoBookingEngineRouter } = require('./src/routes/ccoBookingEngine');
const { createCcoIntegrationsRouter } = require('./src/routes/ccoIntegrations');
const { createCcoFortnoxRouter } = require('./src/routes/ccoFortnox');
const { createCcoSwishRouter } = require('./src/routes/ccoSwish');
const { createCcoSettingsRouter } = require('./src/routes/ccoSettings');
const { createCcoMacrosRouter } = require('./src/routes/ccoMacros');
const { createCcoCustomersRouter } = require('./src/routes/ccoCustomers');
const { createCcoCustomerCommRouter } = require('./src/routes/ccoCustomerComm');
const { createCcoStaffRouter } = require('./src/routes/ccoStaff');
const { createCcoPatientMasterRouter } = require('./src/routes/ccoPatientMaster');
const { createCcoPatientPaymentsRouter } = require('./src/routes/ccoPatientPayments');
const { createCcoReadCache } = require('./src/infra/ccoReadCache');
const {
  createCcoStaffDashboardSnapshot,
  createCcoWorklistSnapshot,
} = require('./src/ops/ccoStaffDashboardSnapshot');
const { createCcoJournalRouter } = require('./src/routes/ccoJournal');
const { createCcoCommercialRouter } = require('./src/routes/ccoCommercial');
const { createCcoTreatmentAgreementRouter } = require('./src/routes/ccoTreatmentAgreement');
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

const {
  createExecutiveDecisionFeed,
  createPersistentExecutiveDecisionFeed,
} = require('./src/ops/executiveDecisionFeed');
// createPersistentExecutiveDecisionFeed är async (returnerar ett Promise). Tidigare
// tilldelades Promiset direkt → executiveDecisionFeed.list() = undefined → /executive/feed
// gav 500. Starta därför med en synkron feed (routes funkar direkt) och uppgradera till den
// persistenta feeden när den laddats från disk.
let executiveDecisionFeed = createExecutiveDecisionFeed();
if (typeof createPersistentExecutiveDecisionFeed === 'function') {
  createPersistentExecutiveDecisionFeed({ filePath: './data/executive-decision-feed.json' })
    .then((feed) => {
      if (feed && typeof feed.list === 'function') executiveDecisionFeed = feed;
    })
    .catch((err) => console.warn('[executive-feed] persistent init misslyckades:', err?.message));
}

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

function formatMegabytes(bytes) {
  return `${Math.round(Number(bytes || 0) / 1024 / 1024)}MB`;
}

async function startupStep(label, fn) {
  const safeLabel = typeof label === 'string' && label.trim() ? label.trim() : 'unknown';
  setStartupPhase(`stores:${safeLabel}`);
  const before = process.memoryUsage();
  console.log(
    `[startup] ${safeLabel} start rss=${formatMegabytes(before.rss)} heap=${formatMegabytes(before.heapUsed)}`
  );
  const result = await fn();
  const after = process.memoryUsage();
  console.log(
    `[startup] ${safeLabel} klar rss=${formatMegabytes(after.rss)} heap=${formatMegabytes(after.heapUsed)}`
  );
  return result;
}

function createDisabledCcoMailIngestionStore(reason = 'prod_safe_mode') {
  const disabledState = {
    modelVersion: 'cco.mail.ingestion.disabled.v1',
    updatedAt: new Date().toISOString(),
    disabled: true,
    reason,
    mailAccounts: {},
    mailFolders: {},
    mailImportRuns: {},
    mailRawMessages: {},
    mailProcessingLedger: {},
    mailPatientMatches: {},
    processingQueue: [],
  };
  const skipped = async () => ({ skipped: true, reason });
  const emptyDashboard = () => ({
    disabled: true,
    reason,
    counts: {
      rawMessages: 0,
      processed: 0,
      duplicates: 0,
      needsReview: 0,
      unmatched: 0,
      failed: 0,
    },
    queueLength: 0,
    latestRun: null,
    mailboxes: [],
  });
  return {
    disabled: true,
    reason,
    filePath: null,
    save: skipped,
    ensureMailAccount: ({ email = '', tenantId = '' } = {}) => ({
      id: `disabled:${String(email || 'unknown').toLowerCase()}`,
      email,
      tenantId,
      disabled: true,
    }),
    upsertMailFolder: () => null,
    startImportRun: skipped,
    finishImportRun: skipped,
    saveRawMessageFromTruth: skipped,
    updateLedger: skipped,
    getLedgerByRawMessageId: () => null,
    getRawMessage: () => null,
    shouldSkipProcessing: () => ({ skip: true, reason }),
    appendAudit: skipped,
    resetMailboxLocalState: skipped,
    buildDashboardSummary: emptyDashboard,
    compactProcessingQueue: () => ({ removed: 0, requeued: 0, disabled: true, reason }),
    getQueueLength: () => 0,
    listReviewQueue: () => [],
    getConversationIngestionMap: () => ({}),
    linkPatientToMessage: skipped,
    requestReprocessUnmatched: skipped,
    isQueued: () => false,
    enqueueRawMessageId: skipped,
    reconcileProcessingQueue: () => ({ removed: 0, requeued: 0, disabled: true, reason }),
    listNeedsReview: () => [],
    dequeueNextRawMessageId: () => null,
    completeQueuedMessage: skipped,
    completeQueuedMessages: skipped,
    saveGraphSubscription: skipped,
    getAccountByEmail: () => null,
    savePatientMatch: skipped,
    listPatientMessages: () => [],
    listPatientMessagesByCustomerId: () => [],
    listUnmatchedMessages: () => [],
    listAmbiguousMatches: () => [],
    listMailboxStats: () => [],
    getState: () => ({ ...disabledState }),
  };
}

function createRuntimeGraphReadConnector() {
  const graphReadEnabled = String(process.env.ARCANA_GRAPH_READ_ENABLED || '')
    .trim()
    .toLowerCase();
  if (!['1', 'true', 'yes', 'y', 'on'].includes(graphReadEnabled)) return null;

  const tenantId = String(process.env.ARCANA_GRAPH_TENANT_ID || '').trim();
  const clientId = String(process.env.ARCANA_GRAPH_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.ARCANA_GRAPH_CLIENT_SECRET || '').trim();
  const userId = String(process.env.ARCANA_GRAPH_USER_ID || '').trim();
  const fullTenant = true;
  const userScope = 'all';
  if (!tenantId || !clientId || !clientSecret) {
    console.warn(
      '[server] ARCANA_GRAPH_READ_ENABLED=true men saknar tenantId/clientId/clientSecret — graphReadConnector inaktiv'
    );
    return null;
  }
  if (!(fullTenant && userScope === 'all') && !userId) {
    console.warn(
      '[server] ARCANA_GRAPH_READ_ENABLED=true men saknar userId — graphReadConnector inaktiv'
    );
    return null;
  }

  try {
    return createMicrosoftGraphReadConnector({
      tenantId,
      clientId,
      clientSecret,
      userId,
      fullTenant,
      userScope,
      authorityHost: String(process.env.ARCANA_GRAPH_AUTHORITY_HOST || '').trim() || undefined,
      graphBaseUrl: String(process.env.ARCANA_GRAPH_BASE_URL || '').trim() || undefined,
      scope: String(process.env.ARCANA_GRAPH_SCOPE || '').trim() || undefined,
    });
  } catch (err) {
    console.warn('[server] kunde inte skapa graphReadConnector', err?.message);
    return null;
  }
}

app.get('/', (req, res) => {
  res.sendFile('index.html', { root: __dirname + '/public' });
});

function serveStaffMobileEntry(req, res, next) {
  const query = String(req.url || '').includes('?')
    ? String(req.url).slice(String(req.url).indexOf('?'))
    : '';
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  if (!params.get('view')) params.set('view', 'customers');
  const qs = params.toString();
  if (qs && !String(req.url || '').includes('?')) {
    return res.redirect(302, `/staff?${qs}`);
  }
  return servePreviewHtml(req, res, next);
}

// Kort mobil-länk för personal (Safari/iPhone) → CCO kundregister + journal
app.get(['/staff', '/mobil'], serveStaffMobileEntry);

app.get('/patient', (_req, res) => {
  res.sendFile('patient-hub.html', { root: __dirname + '/public' });
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

app.get('/admin', (req, res) => {
  sendAdminHtml(res);
});

app.get('/admin/cmo/connectors', (_req, res) => {
  res.redirect(302, '/admin#cmo-connectors');
});

app.get('/admin/cmo', (_req, res) => {
  res.redirect(302, '/admin#cmo');
});

app.get('/cco', (req, res) => {
  const query = String(req.url || '').includes('?')
    ? String(req.url).slice(String(req.url).indexOf('?'))
    : '';
  res.redirect(302, `/admin${query}#cco`);
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
    resolved: {
      stateRoot: config.stateRoot,
      aiProvider: config.aiProvider,
      staffJournalOpenAccess: Boolean(config.staffJournalOpenAccess),
      renderDefaultsApplied: Array.isArray(config.renderRuntimeDefaults?.applied)
        ? config.renderRuntimeDefaults.applied
        : [],
    },
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

app.get('/api/v1/health/journal-photos', requireCcoAuthenticated, async (_req, res) => {
  const dir = String(config.journalPhotosDir || '').trim();
  if (!dir) {
    return res.status(503).json({ ok: false, error: 'journalPhotosDir saknas.' });
  }
  const fsPromises = require('node:fs/promises');
  const pathMod = require('node:path');
  let fileCount = 0;
  let totalBytes = 0;
  async function walk(current) {
    const entries = await fsPromises.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = pathMod.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      fileCount += 1;
      const stat = await fsPromises.stat(fullPath);
      totalBytes += Number(stat.size || 0);
    }
  }
  try {
    await walk(dir);
    const warnBytes = Number(process.env.ARCANA_JOURNAL_PHOTOS_WARN_BYTES || 5_000_000_000);
    return res.json({
      ok: true,
      path: dir,
      fileCount,
      totalBytes,
      warnBytes,
      warn: totalBytes >= warnBytes,
      staffJournalOpenAccess: Boolean(config.staffJournalOpenAccess),
    });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return res.json({
        ok: true,
        path: dir,
        fileCount: 0,
        totalBytes: 0,
        exists: false,
        staffJournalOpenAccess: Boolean(config.staffJournalOpenAccess),
      });
    }
    return res
      .status(500)
      .json({ ok: false, error: error.message || 'journal_photos_health_failed' });
  }
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

app.get('/api/v1/executive/agents/status', (req, res) => {
  const feedSummary = executiveDecisionFeed.getSummary();
  const agents = ['COO', 'CAO', 'CFO', 'CMO', 'CCO', 'Patient'].map((name) => ({
    name,
    lastRun: feedSummary.lastEntryByAgent?.[name] || null,
    pendingActions: feedSummary.byAgent?.[name] || 0,
    status: feedSummary.byAgent?.[name] > 0 ? 'action_required' : 'idle',
  }));
  return res.json({ ok: true, agents, feedSummary });
});

const { computeQaDashboard } = require('./src/ops/qaDashboard');
const { buildDayView, buildWeekView } = require('./src/ops/clinicCalendarView');
const {
  runBackup,
  listBackups,
  verifyBackup,
  restoreFromLocal,
  resolveConfig: resolveBackupConfig,
} = require('./src/ops/backupService');
const {
  getStatus: getUptimeStatus,
  startMonitoring,
  runCheck: runUptimeCheck,
} = require('./src/ops/uptimeMonitor');
const { createOnboardingStore } = require('./src/ops/staffOnboarding');

// ─── DOCS / KNOWLEDGE LIBRARY ───
// Routes flyttade till src/routes/docs.js (se ORGANISATION.md §4).
// Monteras top-level (bevarar registreringsordning före rate-limit i startup).
app.use('/api/v1', createDocsRouter());

// Knowledge layer (Fas 1) — ett enat index som admin OCH agenter läser från.
const {
  buildKnowledgeIndex,
  docsForRole,
  availableRoles,
  searchKnowledge,
} = require('./src/ops/knowledgeAccessor');

app.get('/api/v1/knowledge/index', async (req, res) => {
  try {
    const index = await buildKnowledgeIndex();
    return res.json({ ok: true, ...index });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'index_failed' });
  }
});

app.get('/api/v1/knowledge/roles', (req, res) => {
  return res.json({ ok: true, roles: availableRoles() });
});

app.get('/api/v1/knowledge/role/:role', async (req, res) => {
  try {
    const documents = await docsForRole(req.params.role);
    return res.json({ ok: true, role: req.params.role, documents });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'role_failed' });
  }
});

app.get('/api/v1/knowledge/embeddings/status', async (req, res) => {
  try {
    const embeddings = require('./src/ops/knowledgeEmbeddings');
    const store = await embeddings.loadEmbeddingStore(
      path.join(process.cwd(), 'data', 'knowledge-embeddings.json')
    );
    return res.json({
      ok: true,
      configured: embeddings.isEmbeddingsConfigured(config),
      mode: store ? 'hybrid' : 'keyword',
      store: store
        ? {
            model: store.model,
            dim: store.dim,
            chunkCount: store.chunkCount,
            generatedAt: store.generatedAt,
          }
        : null,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'status_failed' });
  }
});

app.get('/api/v1/knowledge/search', async (req, res) => {
  const query = (req.query?.q || req.query?.query || '').trim();
  if (!query) return res.status(400).json({ ok: false, error: 'missing_query' });
  try {
    const results = await searchKnowledge(query, {
      role: (req.query?.role || '').trim(),
      limit: Math.min(20, Math.max(1, Number(req.query?.limit) || 6)),
    });
    return res.json({ ok: true, query, results });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || 'search_failed' });
  }
});

app.get('/api/v1/qa/dashboard', (req, res) => {
  const dashboard = computeQaDashboard({
    journalStore: null,
    patientMasterStore: null,
    encounterStore: null,
    identityStore: null,
    tenantId: req.query?.tenantId || '',
  });
  return res.json({ ok: true, ...dashboard });
});

app.get('/api/v1/calendar/day', (req, res) => {
  const view = buildDayView({
    date: req.query?.date,
    bookingEngineStore: null,
    encounterStore: null,
    tenantId: req.query?.tenantId || '',
  });
  return res.json({ ok: true, ...view });
});

app.get('/api/v1/calendar/week', (req, res) => {
  const view = buildWeekView({
    startDate: req.query?.startDate,
    bookingEngineStore: null,
    encounterStore: null,
    tenantId: req.query?.tenantId || '',
  });
  return res.json({ ok: true, ...view });
});

// ─── iCAL EXPORT ───
const { buildIcalFeed, getBookingsForResource } = require('./src/ops/icalExport');
const {
  createRecurringSeries,
  getSeriesProgress,
  SERIES_TEMPLATES,
} = require('./src/ops/recurringBookings');

app.get('/api/v1/calendar/ical/:resourceId.ics', (req, res) => {
  const resourceId = req.params.resourceId || 'all';
  const bookings = getBookingsForResource(null, resourceId, {
    days: Number(req.query?.days) || 30,
  });
  const resourceLabel = resourceId === 'all' ? 'Alla behandlare' : resourceId;
  const ical = buildIcalFeed({ resourceLabel, bookings });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${resourceId}-schema.ics"`);
  return res.send(ical);
});

// ─── RECURRING BOOKINGS ───
app.get('/api/v1/booking/series/templates', requireCcoAuthenticated, (req, res) => {
  return res.json({ ok: true, templates: SERIES_TEMPLATES });
});

app.post('/api/v1/booking/series', (req, res) => {
  const series = createRecurringSeries(req.body || {});
  return res.json({ ok: true, series, progress: getSeriesProgress(series) });
});

// ─── BACKUP ───
app.post('/api/v1/ops/backup/run', async (req, res) => {
  const result = await runBackup();
  return res.json({ ok: true, ...result });
});
app.get('/api/v1/ops/backup/list', async (req, res) => {
  const result = await listBackups();
  return res.json(result);
});
app.get('/api/v1/ops/backup/verify/:date', async (req, res) => {
  const result = await verifyBackup(req.params.date, resolveBackupConfig());
  return res.json(result);
});
app.post('/api/v1/ops/backup/restore/:date', async (req, res) => {
  const result = await restoreFromLocal(req.params.date, resolveBackupConfig());
  return res.json(result);
});

// ─── UPTIME MONITOR ───
app.get('/api/v1/ops/uptime', (req, res) => {
  return res.json({ ok: true, ...getUptimeStatus() });
});
app.post('/api/v1/ops/uptime/check', async (req, res) => {
  const result = await runUptimeCheck();
  return res.json({ ok: true, ...result });
});

// ─── ONBOARDING ───
const onboardingStorePath = './data/cco-onboarding.json';
const onboardingStore = createOnboardingStore({ filePath: onboardingStorePath });
onboardingStore.load().catch((err) => console.warn('[onboarding] Load failed:', err?.message));

app.get('/api/v1/onboarding/:userId', (req, res) => {
  const status = onboardingStore.getStatus(req.params.userId);
  return res.json({ ok: true, ...status });
});
app.post('/api/v1/onboarding/:userId/step/:stepId', async (req, res) => {
  const result = await onboardingStore.completeStep(
    req.params.userId,
    req.params.stepId,
    req.body?.verification
  );
  return res.json(result);
});
app.post('/api/v1/onboarding/:userId/reset', async (req, res) => {
  const result = await onboardingStore.resetProgress(req.params.userId);
  return res.json(result);
});
app.get('/api/v1/onboarding/admin/incomplete', (req, res) => {
  return res.json({ ok: true, users: onboardingStore.listIncomplete() });
});

// Start uptime monitoring
startMonitoring();

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
    return res.status(200).json({
      ok: true,
      ready: false,
      booting: true,
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

// --- Memory observability ---------------------------------------------
// Periodisk minnes-telemetri + SIGUSR2 heap-snapshot för att fånga nästa
// OOM-läcka tidigt (se project_arcana_oom_134). No-op om
// ARCANA_MEMORY_TELEMETRY_ENABLED=false.
try {
  const {
    startMemoryTelemetry,
    startMemoryWatchdog,
    installHeapSnapshotHandler,
  } = require('./src/ops/memoryTelemetry');
  startMemoryTelemetry({ logger: console });
  startMemoryWatchdog({ logger: console });
  installHeapSnapshotHandler({ logger: console });
} catch (err) {
  console.error('[memory-telemetry] init failed:', err && err.message);
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

(async () => {
  const prodSafeMode = config.isProduction && process.env.ARCANA_PROD_SAFE_MODE !== 'false';
  if (prodSafeMode) {
    config.ccoMailIngestionEnabled = false;
  }

  setStartupPhase('persistent_root');
  if (config.stateRoot) {
    await waitForPersistentRoot(config.stateRoot, { logger: console });
  }

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
  ccoRequireAuthMiddleware = auth.requireAuth;
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
        executionTimeoutMs: config.gatewayExecutionTimeoutMs,
      })
    : null;

  runtimeState.distributed = {
    backend: config.distributedBackend,
    redisStatus,
    active: distributedRedisReady,
  };

  const ccoReadCache = createCcoReadCache({
    redisClient,
    keyPrefix: `${config.redisKeyPrefix}:cco-read`,
    defaultTtlMs: 30_000,
  });

  const loginRateLimiter = createRateLimiter({
    windowMs: config.authLoginRateLimitWindowSec * 1000,
    max: config.authLoginRateLimitMax,
    keyGenerator: (req) => {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      return `${String(req.ip || 'unknown-ip')}|${email || 'no-email'}`;
    },
    message: 'För många inloggningsförsök. Vänta 15 minuter och prova igen.',
    store: rateLimitStore,
    scope: 'auth_login',
  });

  // Log brute-force attempts to audit
  const originalLoginRateLimiter = loginRateLimiter;
  const loginRateLimiterWithAudit = async (req, res, next) => {
    const origJson = res.json.bind(res);
    res.json = function (body) {
      if (res.statusCode === 429) {
        const email =
          typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        console.warn(`[auth-rate-limit] BLOCKED login brute-force: ip=${req.ip} email=${email}`);
        if (authStore && typeof authStore.addAuditEvent === 'function') {
          authStore
            .addAuditEvent({
              action: 'auth.login.rate_limited',
              outcome: 'blocked',
              actorIp: req.ip,
              metadata: { email, ip: req.ip, userAgent: req.get('user-agent') },
            })
            .catch(() => {});
        }
      }
      return origJson(body);
    };
    return originalLoginRateLimiter(req, res, next);
  };
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

  const templateStore = await startupStep('templateStore', () =>
    createTemplateStore({
      filePath: config.templateStorePath,
      maxEvaluations: config.templateEvalMaxEntries,
    })
  );
  const adminTasksStore = await startupStep('adminTasksStore', () =>
    createAdminTasksStore({
      filePath: config.adminTasksStorePath,
    })
  );
  const capabilityAnalysisStore = await startupStep('capabilityAnalysisStore', () =>
    createCapabilityAnalysisStore({
      filePath: config.capabilityAnalysisStorePath,
      maxEntries: config.capabilityAnalysisMaxEntries,
    })
  );
  const ccoHistoryStore = await startupStep('ccoHistoryStore', () =>
    createCcoHistoryStore({
      filePath: config.ccoHistoryStorePath,
    })
  );
  // 19F.1 — fixar P0 bug: tidigare appendEvent?.() var no-op eftersom funktionen
  // inte fanns. Mountar ccoCustomerEventStore + patchar shim på ccoHistoryStore.
  let ccoCustomerEventStore = null;
  try {
    const { createCcoCustomerEventStore } = require('./src/ops/ccoCustomerEventStore');
    const customerEventsPath = config.dataDir
      ? `${config.dataDir}/cco/customer-events.jsonl`
      : './data/cco/customer-events.jsonl';
    ccoCustomerEventStore = await startupStep('ccoCustomerEventStore', () =>
      createCcoCustomerEventStore({ filePath: customerEventsPath })
    );
    if (ccoCustomerEventStore && typeof ccoCustomerEventStore.appendEvent === 'function') {
      // Shim: legacy-anrop `ccoHistoryStore.appendEvent(...)` ska nu faktiskt loggas
      ccoHistoryStore.appendEvent = (e) => ccoCustomerEventStore.appendEvent(e);
    }
    // Mounta båda till app.locals så routes kan läsa events
    app.locals.ccoHistoryStore = ccoHistoryStore;
    app.locals.ccoCustomerEventStore = ccoCustomerEventStore;
    console.log('[ccoCustomerEventStore] monterad:', customerEventsPath);
  } catch (err) {
    console.warn('[ccoCustomerEventStore] kunde inte montera:', err.message);
  }
  const ccoMailboxTruthStore = await startupStep('ccoMailboxTruthStore', () =>
    createConfiguredCcoMailboxTruthStore(config)
  );
  const ccoMailIngestionStore = await startupStep('ccoMailIngestionStore', () =>
    prodSafeMode
      ? createDisabledCcoMailIngestionStore('prod_safe_mode')
      : createCcoMailIngestionStore({
          filePath: config.ccoMailIngestionStorePath,
        })
  );
  const messageIntelligenceStore = await startupStep('messageIntelligenceStore', () =>
    createMessageIntelligenceStore({
      filePath:
        config.messageIntelligenceStorePath ||
        (config.dataDir
          ? `${config.dataDir}/cco/message-intelligence.json`
          : './data/cco/message-intelligence.json'),
    })
  );
  const customerPreferenceStore = await startupStep('customerPreferenceStore', () =>
    createCustomerPreferenceStore({
      filePath:
        config.customerPreferenceStorePath ||
        (config.dataDir
          ? `${config.dataDir}/cco/customer-preferences.json`
          : './data/cco/customer-preferences.json'),
    })
  );
  const clientoBookingStore = await startupStep('clientoBookingStore', () =>
    createClientoBookingStore({
      filePath:
        config.clientoBookingStorePath ||
        (config.dataDir
          ? `${config.dataDir}/cco/cliento-bookings.json`
          : './data/cco/cliento-bookings.json'),
    })
  );
  const { createCcoClientoBookingIngest } = require('./src/ops/ccoClientoBookingIngest');
  const ccoClientoBookingIngest =
    config.ccoClientoBookingIngestEnabled === false
      ? null
      : createCcoClientoBookingIngest({
          config,
          clientoBookingStore,
          logger: console,
        });
  const ccoConversationStateStore = await startupStep('ccoConversationStateStore', () =>
    createCcoConversationStateStore({
      filePath: config.ccoConversationStateStorePath,
    })
  );
  const ccoConversationNotesStore = await startupStep('ccoConversationNotesStore', () =>
    createCcoConversationNotesStore({
      filePath: config.ccoConversationNotesStorePath,
    })
  );
  const ccoMailTemplateStore = await startupStep('ccoMailTemplateStore', () =>
    createCcoMailTemplateStore({
      filePath: config.ccoMailTemplateStorePath,
    })
  );
  const ccoNoteStore = await startupStep('ccoNoteStore', () =>
    createCcoNoteStore({
      filePath: config.ccoNoteStorePath,
    })
  );
  const ccoFollowUpStore = await startupStep('ccoFollowUpStore', () =>
    createCcoFollowUpStore({
      filePath: config.ccoFollowUpStorePath,
    })
  );
  const ccoBookingStore = await startupStep('ccoBookingStore', () =>
    createCcoBookingStore({
      filePath: config.ccoBookingStorePath,
    })
  );
  // 19F.7 Fix A — exponera booking-store till patientkort-aggregator
  app.locals.ccoBookingStore = ccoBookingStore;
  const ccoBookingEngineStore = await startupStep('ccoBookingEngineStore', () =>
    createCcoBookingEngineStore({
      filePath: config.ccoBookingEngineStorePath,
    })
  );
  const postOpReviewStore = await startupStep('postOpReviewStore', () =>
    createPostOpReviewStore({
      filePath: config.postOpReviewStorePath,
      photosDir: config.postOpPhotosDir,
    })
  );
  const ccoWorkspacePrefsStore = await startupStep('ccoWorkspacePrefsStore', () =>
    createCcoWorkspacePrefsStore({
      filePath: config.ccoWorkspacePrefsStorePath,
    })
  );
  const ccoIntegrationStore = await startupStep('ccoIntegrationStore', () =>
    createCcoIntegrationStore({
      filePath: config.ccoIntegrationStorePath,
    })
  );
  const ccoFortnoxStore = await startupStep('ccoFortnoxStore', () =>
    createCcoFortnoxStore({
      filePath: config.ccoFortnoxStorePath,
    })
  );
  // 19F.5 Fix #2 — Fortnox invoice/payment-lister wireat så ccoPaymentStatusAdapter
  // kan hämta riktig invoice-data per kund. Cachas 60s per (tenant, customerNumber).
  try {
    const { createFortnoxClient } = require('./src/infra/fortnoxClient');
    const { createFortnoxInvoiceLister } = require('./src/ops/ccoFortnoxInvoiceLister');
    const fortnoxClientCache = new Map();
    const createClientFor = async (tenantId) => {
      const key = tenantId || 'default';
      if (fortnoxClientCache.has(key)) return fortnoxClientCache.get(key);
      const client = createFortnoxClient({
        clientId: config.fortnoxClientId,
        clientSecret: config.fortnoxClientSecret,
        getConnection: ccoFortnoxStore.getConnection,
        saveConnection: ccoFortnoxStore.saveConnection,
        tenantId,
      });
      fortnoxClientCache.set(key, client);
      return client;
    };
    const ccoFortnoxInvoiceLister = createFortnoxInvoiceLister({
      createClientFor,
      patientSyncStore: null, // wireas vid behov till ccoFortnoxPatientSync
    });
    app.locals.ccoFortnoxStore = ccoFortnoxStore;
    app.locals.ccoFortnoxInvoiceLister = ccoFortnoxInvoiceLister;
    console.log(
      '[ccoFortnoxInvoiceLister] monterad: wireat till ccoPaymentStatusAdapter via gatherStores'
    );
  } catch (err) {
    console.warn('[ccoFortnoxInvoiceLister] kunde inte montera:', err.message);
  }
  const ccoSwishStore = await createCcoSwishStore({
    filePath: config.ccoSwishStorePath,
  });
  app.locals.ccoSwishStore = ccoSwishStore;
  // CF.2-fix 2026-06-02: ccoSecureStorage skapas annars först via asset-routen (lazy).
  // Receipt-upload + expense-export behöver den redan vid första HTTP-anrop.
  // Eager-init här blockerar inget annat — samma provider, samma rot.
  if (!app.locals.ccoSecureStorage) {
    try {
      const { createSecureStorageProvider } = require('./src/ops/ccoSecureStorageProvider');
      app.locals.ccoSecureStorage = createSecureStorageProvider({ provider: 'local' });
      console.log('[ccoSecureStorage] eager-mount för CF');
    } catch (err) {
      console.warn('[ccoSecureStorage] eager-mount misslyckades:', err.message);
    }
  }

  // CF.2 (MVP 1) — Receipt store + Finance Dashboard
  try {
    const { createCcoReceiptStore } = require('./src/ops/ccoReceiptStore');
    const receiptStorePath = config.dataDir
      ? `${config.dataDir}/cco/receipts.json`
      : './data/cco/receipts.json';
    const ccoReceiptStore = await createCcoReceiptStore({
      filePath: receiptStorePath,
      auditLog: ccoAuditLog,
      secureStorage: app.locals.ccoSecureStorage,
    });
    app.locals.ccoReceiptStore = ccoReceiptStore;
    console.log('[ccoReceiptStore] monterad:', receiptStorePath);
  } catch (err) {
    console.warn('[ccoReceiptStore] kunde inte montera:', err.message);
  }
  // CF.3 (MVP 2) — Expense store + Manual Finance Workflow
  // Fortnox OAuth är blockerad av Fortnox backend — vi kör manuell
  // expense-export tills blocker är löst. Ingen Fortnox-write.
  try {
    const { createCcoExpenseStore } = require('./src/ops/ccoExpenseStore');
    const expenseStorePath = config.dataDir
      ? `${config.dataDir}/cco/expenses.json`
      : './data/cco/expenses.json';
    const ccoExpenseStore = await createCcoExpenseStore({
      filePath: expenseStorePath,
      auditLog: ccoAuditLog,
      secureStorage: app.locals.ccoSecureStorage,
    });
    app.locals.ccoExpenseStore = ccoExpenseStore;
    console.log('[ccoExpenseStore] monterad:', expenseStorePath);
  } catch (err) {
    console.warn('[ccoExpenseStore] kunde inte montera:', err.message);
  }
  // CF.4 (MVP 3) — Expense Rule Engine (auto-categorization utan AI)
  try {
    const { createCcoExpenseRuleStore } = require('./src/ops/ccoExpenseRuleStore');
    const ruleStorePath = config.dataDir
      ? `${config.dataDir}/cco/expense-rules.json`
      : './data/cco/expense-rules.json';
    const ccoExpenseRuleStore = await createCcoExpenseRuleStore({
      filePath: ruleStorePath,
      auditLog: ccoAuditLog,
    });
    app.locals.ccoExpenseRuleStore = ccoExpenseRuleStore;
    console.log('[ccoExpenseRuleStore] monterad:', ruleStorePath);
  } catch (err) {
    console.warn('[ccoExpenseRuleStore] kunde inte montera:', err.message);
  }
  // CF.5 (MVP 4) — Finance Vendor Register (leverantörsregister för ekonomi)
  try {
    const { createCcoFinanceVendorStore } = require('./src/ops/ccoFinanceVendorStore');
    const vendorStorePath = config.dataDir
      ? `${config.dataDir}/cco/finance-vendors.json`
      : './data/cco/finance-vendors.json';
    const ccoFinanceVendorStore = await createCcoFinanceVendorStore({
      filePath: vendorStorePath,
      auditLog: ccoAuditLog,
    });
    app.locals.ccoFinanceVendorStore = ccoFinanceVendorStore;
    console.log('[ccoFinanceVendorStore] monterad:', vendorStorePath);
  } catch (err) {
    console.warn('[ccoFinanceVendorStore] kunde inte montera:', err.message);
  }
  // CF.7 (MVP 6) — Recurring Expense Store
  try {
    const { createCcoRecurringExpenseStore } = require('./src/ops/ccoRecurringExpenseStore');
    const recStorePath = config.dataDir
      ? `${config.dataDir}/cco/recurring-expenses.json`
      : './data/cco/recurring-expenses.json';
    const ccoRecurringExpenseStore = await createCcoRecurringExpenseStore({
      filePath: recStorePath,
      auditLog: ccoAuditLog,
    });
    app.locals.ccoRecurringExpenseStore = ccoRecurringExpenseStore;
    console.log('[ccoRecurringExpenseStore] monterad:', recStorePath);
  } catch (err) {
    console.warn('[ccoRecurringExpenseStore] kunde inte montera:', err.message);
  }
  // CF.8 (MVP 7) — Finance Review Store
  try {
    const { createCcoFinanceReviewStore } = require('./src/ops/ccoFinanceReviewStore');
    const revStorePath = config.dataDir
      ? `${config.dataDir}/cco/finance-reviews.json`
      : './data/cco/finance-reviews.json';
    const ccoFinanceReviewStore = await createCcoFinanceReviewStore({
      filePath: revStorePath,
      auditLog: ccoAuditLog,
    });
    app.locals.ccoFinanceReviewStore = ccoFinanceReviewStore;
    console.log('[ccoFinanceReviewStore] monterad:', revStorePath);
  } catch (err) {
    console.warn('[ccoFinanceReviewStore] kunde inte montera:', err.message);
  }
  // CF.9 (MVP 8) — Finance Monthly Close Store
  try {
    const { createCcoFinanceMonthlyCloseStore } = require('./src/ops/ccoFinanceMonthlyCloseStore');
    const closeStorePath = config.dataDir
      ? `${config.dataDir}/cco/finance-monthly-close.json`
      : './data/cco/finance-monthly-close.json';
    const ccoFinanceMonthlyCloseStore = await createCcoFinanceMonthlyCloseStore({
      filePath: closeStorePath,
      auditLog: ccoAuditLog,
    });
    app.locals.ccoFinanceMonthlyCloseStore = ccoFinanceMonthlyCloseStore;
    console.log('[ccoFinanceMonthlyCloseStore] monterad:', closeStorePath);
  } catch (err) {
    console.warn('[ccoFinanceMonthlyCloseStore] kunde inte montera:', err.message);
  }
  const ccoSettingsStore = await createCcoSettingsStore({
    filePath: config.ccoSettingsStorePath,
  });
  if (typeof ccoBookingEngineStore.setBookingPolicySettings === 'function') {
    try {
      const bootstrapSettings = await ccoSettingsStore.getTenantSettings({
        tenantId: config.defaultTenantId,
      });
      if (bootstrapSettings?.bookingPolicy) {
        ccoBookingEngineStore.setBookingPolicySettings(bootstrapSettings.bookingPolicy);
      }
    } catch (error) {
      console.warn(
        '[booking-engine] kunde inte ladda bookingPolicy från settings:',
        error?.message || error
      );
    }
  }
  const ccoMacroStore = await createCcoMacroStore({
    filePath: config.ccoMacroStorePath,
  });
  const ccoCustomerStore = await createCcoCustomerStore({
    filePath: config.ccoCustomerStorePath,
    historyStore: ccoHistoryStore,
  });
  app.locals.ccoCustomerStore = ccoCustomerStore; // P0.9: exponera för QA-dashboard + master-patient-card-lookup

  // ── Drive-proxy: tjäna bilder via egen domän (cache + auth-hidden) ─────
  try {
    const drive = require('./src/lib/googleDriveClient');
    if (drive.isGoogleDriveConfigured(process.env)) {
      const { attachRole, requirePermission } = require('./src/security/ccoRbac');
      app.get(
        '/api/drive/files/:id',
        requireCcoAuthenticated,
        attachRole,
        requirePermission('asset.read'),
        async (req, res) => {
          try {
            await drive.streamDriveFileToResponse({
              driveFileId: req.params.id,
              res,
            });
          } catch (err) {
            res.status(404).json({ error: 'file not found', detail: err.message });
          }
        }
      );
      console.log('[drive] proxy aktiverad: GET /api/drive/files/:id');
    }
  } catch (_) {
    /* drive ej konfigurerad — skippa */
  }

  // ── CCO Customers UI: real-data adapter (opt-in via env) ───────────────
  if (process.env.ARCANA_CCO_USE_REAL_DATA === 'true') {
    try {
      const {
        createCcoRealDataAdapter,
        mountRealDataRoutes,
      } = require('./public/major-arcana-preview/customers/real-data-adapter');
      const { isGoogleDriveConfigured } = require('./src/lib/googleDriveClient');
      const realAdapter = createCcoRealDataAdapter({
        customerStore: ccoCustomerStore,
        bookingStore: ccoBookingStore,
        tenantId: process.env.ARCANA_DEFAULT_TENANT_ID || 'hairtp-clinic',
        driveClient: isGoogleDriveConfigured(process.env)
          ? require('./src/lib/googleDriveClient')
          : null,
      });
      mountRealDataRoutes(app, realAdapter);
      console.log('[cco-customers] kör med RIKTIG Cliento + Drive data');
    } catch (err) {
      console.warn('[cco-customers] kunde inte aktivera real-data:', err.message);
    }
  }

  const ccoPatientMasterStore = await createCcoPatientMasterStore({
    filePath: config.ccoPatientMasterStorePath,
  });
  app.locals.ccoPatientMasterStore = ccoPatientMasterStore;
  const ccoHalsoHealthDeclarationIngest = config.ccoHalsoHealthDeclarationIngestEnabled
    ? createCcoHalsoHealthDeclarationIngest({
        config,
        patientMasterStore: ccoPatientMasterStore,
        dedupStorePath: config.ccoHalsoHealthDeclarationDedupStorePath,
        logger: console,
      })
    : null;
  const ccoDocumentInstanceStore = await createCcoDocumentInstanceStore({
    filePath: config.ccoDocumentInstanceStorePath,
  });
  const { createCcoDocumentTriageEngine } = require('./src/ops/ccoDocumentTriageEngine');
  const ccoDocumentTriageEngine = createCcoDocumentTriageEngine({
    documentInstanceStore: ccoDocumentInstanceStore,
  });
  const ccoDashboardSnapshot = createCcoStaffDashboardSnapshot({
    filePath: path.join(config.stateRoot || './data', 'cco-dashboard-snapshot.json'),
    readCache: ccoReadCache,
  });
  const ccoWorklistSnapshot = createCcoWorklistSnapshot({
    filePath: path.join(config.stateRoot || './data', 'cco-worklist-snapshot.json'),
    readCache: ccoReadCache,
  });
  // P0.5 — auto-PDF on sign. Hooken kör post-sign och skapar låst PDF-artefakt.
  // Fel där blockerar INTE signering (juridisk akt redan utförd). Hook använder
  // applyPdfArtifact() för att spara pdfPath/pdfTamperHash/pdfGeneratedAt utan att
  // gå genom locked-checken.
  const ccoJournalPdfDir = path.join(config.stateRoot || './data', 'cco-journal-pdfs');
  fs.mkdirSync(ccoJournalPdfDir, { recursive: true });
  const ccoJournalStore = await createCcoJournalStore({
    filePath: config.ccoJournalStorePath,
    onAfterSign: async (signedEntry, { actor } = {}) => {
      try {
        const { exportJournalEntryToPdf } = require('./src/ops/ccoJournalPdfExport');
        const result = await exportJournalEntryToPdf({
          entry: signedEntry,
          getChromium,
        });
        const targetPath = path.join(ccoJournalPdfDir, `${signedEntry.entryId}.pdf`);
        fs.writeFileSync(targetPath, result.buffer);
        await app.locals.ccoJournalStore.applyPdfArtifact({
          tenantId: signedEntry.tenantId,
          patientId: signedEntry.patientId,
          entryId: signedEntry.entryId,
          pdfPath: targetPath,
          pdfTamperHash: result.tamperHash,
          pdfSizeBytes: result.sizeBytes,
        });
        if (ccoAuditLog) {
          ccoAuditLog.append({
            action: 'journal.pdf_generated_at_signing',
            actor: { role: actor?.role || 'unknown', userId: actor?.userId || null },
            target: {
              kind: 'journal_entry',
              id: signedEntry.entryId,
              tenantId: signedEntry.tenantId,
            },
            result: 'ok',
            detail: {
              patientId: signedEntry.patientId,
              journalType: signedEntry.journalType,
              tamperHash: result.tamperHash,
              sizeBytes: result.sizeBytes,
              signedAt: signedEntry.signedAt,
            },
          });
        }
      } catch (pdfErr) {
        console.error('[journal-auto-pdf] sign-hook fel:', pdfErr.message);
        if (ccoAuditLog) {
          ccoAuditLog.append({
            action: 'journal.pdf_generated_at_signing',
            actor: { role: actor?.role || 'unknown' },
            target: {
              kind: 'journal_entry',
              id: signedEntry.entryId,
              tenantId: signedEntry.tenantId,
            },
            result: 'error',
            detail: { error: pdfErr.message, patientId: signedEntry.patientId },
          });
        }
      }
    },
  });
  app.locals.ccoJournalStore = ccoJournalStore; // Sprint A: exponera till /api/v1/cco-journal-quick
  const ccoTreatmentEncounterStore = await createCcoTreatmentEncounterStore({
    filePath: config.ccoTreatmentEncounterStorePath,
  });
  // 19F.4 Fix #1 — exponera encounter-store till routes och patient-card-aggregator
  app.locals.ccoTreatmentEncounterStore = ccoTreatmentEncounterStore;
  const ccoJournalPhotoStore = await createCcoJournalPhotoStore({
    baseDir: config.journalPhotosDir,
  });
  const ccoCommercialStore = await createCcoCommercialStore({
    filePath: config.ccoCommercialStorePath,
  });
  app.locals.ccoCommercialStore = ccoCommercialStore;
  const ccoTreatmentAgreementStore = await createCcoTreatmentAgreementStore({
    filePath: config.ccoTreatmentAgreementStorePath,
  });
  const ccoTemplateVersionApprovalStore = await createCcoTemplateVersionApprovalStore({
    filePath: config.ccoTemplateVersionApprovalStorePath,
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
  const patientCareStateStore = await createCcoPatientCareStateStore({
    filePath: config.ccoPatientCareStateStorePath,
  });

  const ccoMailOpenStore = await require('./src/ops/ccoMailOpenStore').createCcoMailOpenStore({
    filePath: (process.env.ARCANA_STATE_ROOT || '/var/data') + '/cco-mail-opens.json',
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
  const connectorHealthStateStore = createCmoConnectorHealthStateStore({
    filePath: config.marketingConnectorHealthStatePath,
    alertAfterMs: config.marketingConnectorAlertAfterMs,
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

  const ccoMailIngestionSyncService = createCcoMailIngestionSyncService({
    config,
    graphReadConnector,
    ingestionStore: ccoMailIngestionStore,
    truthStore: ccoMailboxTruthStore,
    documentTriage: ccoDocumentTriageEngine,
    healthDeclarationIngest: ccoHalsoHealthDeclarationIngest,
    clientoBookingIngest: ccoClientoBookingIngest,
    patientDirectoryProvider: async () => {
      const tenantId = config.defaultTenantId || 'hair-tp-clinic';
      const listed = await ccoPatientMasterStore.listPatients({ tenantId, limit: 20000 });
      return (listed.patients || []).map((patient) => ({
        id: patient.id,
        patientId: patient.id,
        personnummer: patient.personnummer,
        primaryEmail: patient.primaryEmail,
        personalEmail: patient.primaryEmail,
        verifiedPersonalEmailNormalized: String(patient.primaryEmail || '')
          .trim()
          .toLowerCase(),
        emails: patient.emails,
        phones: patient.phones,
        primaryPhone: patient.primaryPhone,
      }));
    },
    logger: console,
  });
  const ccoMailIngestionWorker = createCcoMailIngestionWorker({
    config,
    ingestionStore: ccoMailIngestionStore,
    syncService: ccoMailIngestionSyncService,
    logger: console,
  });
  const ccoGraphChangeNotifications = createMicrosoftGraphChangeNotifications({
    config: {
      ...config,
      graphBaseUrl: graphReadConnector?.graphBaseUrl || config.graphBaseUrl,
    },
    graphReadConnector,
    ingestionStore: ccoMailIngestionStore,
    syncService: ccoMailIngestionSyncService,
    logger: console,
  });

  const postOpAutoTriggerDeps = {
    bookingStore: ccoBookingStore,
    capabilityExecutor: null,
    graphSendConnector: null,
  };

  const schedulerConfig = { ...config };
  if (prodSafeMode && process.env.ARCANA_SCHEDULER_PROD_SAFE_MODE !== 'false') {
    schedulerConfig.schedulerEnabled = false;
    schedulerConfig.schedulerRunOnStartup = false;
    schedulerConfig.schedulerJobsAllowlist = [];
    console.warn('[scheduler] prod safe-mode pausade alla automatiska scheduler-jobb');
  }

  const scheduler = createScheduler({
    config: schedulerConfig,
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
    bookingStore: ccoBookingStore,
    postOpAutoTriggerDeps: postOpAutoTriggerDeps,
    marketingCampaignDraftsStore,
    marketingContentAssetsStore,
    connectorHealthStateStore,
    executiveDecisionFeed,
    adminTasksStore,
    alertNotifier: createAlertNotifier({
      webhookUrl: config.alertWebhookUrl,
      webhookSecret: config.alertWebhookSecret,
      webhookTimeoutMs: config.alertWebhookTimeoutMs,
      logger: console,
    }),
    journalStore: ccoJournalStore,
    patientMasterStore: ccoPatientMasterStore,
    bookingEngineStore: ccoBookingEngineStore,
    treatmentAgreementStore: ccoTreatmentAgreementStore,
    patientCareStateStore,
    ccoSettingsStore,
    dashboardSnapshot: ccoDashboardSnapshot,
    worklistSnapshot: ccoWorklistSnapshot,
    readCache: ccoReadCache,
    mailIngestionSyncService: ccoMailIngestionSyncService,
    graphChangeNotifications: ccoGraphChangeNotifications,
    ccoMailIngestionStore,
    mailIngestionWorker: ccoMailIngestionWorker,
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
  const webBridgeAuditStore = await createWebBridgeAuditStore({
    filePath: config.webBridgeAuditStorePath,
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
  postOpAutoTriggerDeps.capabilityExecutor = postOpReviewCapabilityExecutor;
  postOpAutoTriggerDeps.graphSendConnector = graphSendConnector;

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

  // Mail-öppningspixel (1x1) — PUBLIK (hits av mottagarens mailklient). Ingen PII i URL (opakt token).
  app.get('/api/v1/cco/mail-pixel/:token', async (req, res) => {
    try {
      await ccoMailOpenStore.recordOpen(String(req.params.token || '').replace(/\.gif$/i, ''));
    } catch (e) {
      /* tracking-fel får aldrig påverka svaret */
    }
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.set('Content-Type', 'image/gif');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.end(gif);
  });

  // AUTO send-aggregator: "senast skickad" per journey-automation (läser befintliga källor)
  const __rbacAuto = require('./src/security/ccoRbac');
  app.get(
    '/api/v1/cco/patients/:patientId/automation-sends',
    requireCcoAuthenticated,
    __rbacAuto.attachRole,
    __rbacAuto.requirePermission('customers.read'),
    async (req, res) => {
      try {
        const { aggregateAutomationSends } = require('./src/ops/ccoAutomationSends');
        const patientId = String(req.params.patientId || '').trim();
        const tenantId = req.query.tenantId || req.headers['x-cco-tenant'] || 'hair-tp-clinic';
        const bookingCaseIds = String(req.query.bookingCaseIds || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const patientName = String(req.query.patientName || '').trim();
        const email = String(req.query.email || '').trim();
        const sends = await aggregateAutomationSends({
          patientId,
          patientName,
          email,
          tenantId,
          bookingCaseIds,
          careStateStore: patientCareStateStore,
          postOpReviewStore,
        });
        res.json({ patientId, sends });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

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
      patientMasterStore: ccoPatientMasterStore,
      customerStore: ccoCustomerStore,
      journalStore: ccoJournalStore,
      treatmentEncounterStore: ccoTreatmentEncounterStore,
      config,
      graphSendConnector,
    })
  );

  app.use(
    createBookingPublicActionsRouter({
      bookingEngineStore: ccoBookingEngineStore,
    })
  );

  app.use(
    '/api',
    createPublicWebEventsRouter({
      executionGateway,
      webBridgeAuditStore,
      config,
    })
  );

  app.use('/api', createMarketingConnectorBridgeRouter({ config }));

  // Post-op review routes — operator-trigger + token-skyddade patient-endpoints.
  // Patient-UI (vanilla HTML på /uppfoljning/:token) på public/uppfoljning/.
  app.use(
    createPostOpReviewRouter({
      postOpReviewStore,
      capabilityExecutor: postOpReviewCapabilityExecutor,
      bookingStore: ccoBookingStore,
      patientMasterStore: ccoPatientMasterStore,
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
      loginRateLimiter: loginRateLimiterWithAudit,
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
  const defaultSyncMailboxSource =
    allowlistSyncMailboxIds.length > 0
      ? 'ARCANA_MAILBOX_ALLOWLIST'
      : schedulerCcoHistoryMailboxIds.length > 0
        ? 'ARCANA_SCHEDULER_CCO_HISTORY_MAILBOX_IDS'
        : 'hardcoded_hairTpFallbackMailboxIds';
  console.log(
    '[server] defaultSyncMailboxIds for /cco/runtime/sync:',
    defaultSyncMailboxIds,
    `(source=${defaultSyncMailboxSource}, count=${defaultSyncMailboxIds.length})`
  );

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
      tenantConfigStore,
      connectorHealthStateStore,
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
      treatmentAgreementStore: ccoTreatmentAgreementStore,
      patientMasterStore: ccoPatientMasterStore,
      patientCareStateStore,
      journalStore: ccoJournalStore,
      settingsStore: ccoSettingsStore,
      readCache: ccoReadCache,
      authStore,
      config,
    })
  );

  app.use(
    '/api/v1',
    createCcoStaffRouter({
      patientMasterStore: ccoPatientMasterStore,
      treatmentEncounterStore: ccoTreatmentEncounterStore,
      documentInstanceStore: ccoDocumentInstanceStore,
      readCache: ccoReadCache,
      dashboardSnapshot: ccoDashboardSnapshot,
      worklistSnapshot: ccoWorklistSnapshot,
      authStore,
      config,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  app.use(
    '/api/v1',
    createCcoBookingEngineRouter({
      bookingEngineStore: ccoBookingEngineStore,
      bookingStore: ccoBookingStore,
      treatmentAgreementStore: ccoTreatmentAgreementStore,
      templateVersionApprovalStore: ccoTemplateVersionApprovalStore,
      patientMasterStore: ccoPatientMasterStore,
      journalStore: ccoJournalStore,
      treatmentEncounterStore: ccoTreatmentEncounterStore,
      patientCareStateStore,
      authStore,
      config,
      graphSendConnector,
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
    createCcoFortnoxRouter({
      fortnoxStore: ccoFortnoxStore,
      patientMasterStore: ccoPatientMasterStore,
      integrationStore: ccoIntegrationStore,
      authStore,
      config,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  app.use(
    '/api/v1',
    createCcoSwishRouter({
      swishStore: ccoSwishStore,
      integrationStore: ccoIntegrationStore,
      authStore,
      config,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  app.use(
    '/api/v1',
    createCcoSettingsRouter({
      settingsStore: ccoSettingsStore,
      bookingEngineStore: ccoBookingEngineStore,
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
    createCcoCustomerCommRouter({
      config,
      requireAuth: auth.requireAuth,
      journalStore: ccoJournalStore,
      mailIngestionStore: ccoMailIngestionStore,
      commDraftStore: app.locals?.ccoCommDraftStore || null,
      sendActionStore: ccoSendActionStore,
      auditLog: ccoAuditLog,
    })
  );

  app.use(
    '/api/v1',
    createCcoPatientMasterRouter({
      patientMasterStore: ccoPatientMasterStore,
      customerStore: ccoCustomerStore,
      journalStore: ccoJournalStore,
      treatmentEncounterStore: ccoTreatmentEncounterStore,
      migrationIndexStore: ccoMigrationIndexStore,
      patientSystemStore: ccoPatientSystemStore,
      documentInstanceStore: ccoDocumentInstanceStore,
      buildPatientDocumentBundle,
      readCache: ccoReadCache,
      resolvePatientAssetStore: resolveSharedPatientAssetStore,
      swishStore: ccoSwishStore,
      commercialStore: ccoCommercialStore,
      fortnoxInvoiceLister: app.locals.ccoFortnoxInvoiceLister || null,
      fortnoxStore: ccoFortnoxStore,
      authStore,
      config,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
    })
  );

  app.use(
    '/api/v1',
    createCcoPatientPaymentsRouter({
      patientMasterStore: ccoPatientMasterStore,
      swishStore: ccoSwishStore,
      commercialStore: ccoCommercialStore,
      integrationStore: ccoIntegrationStore,
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
      treatmentEncounterStore: ccoTreatmentEncounterStore,
      migrationIndexStore: ccoMigrationIndexStore,
      patientSystemStore: ccoPatientSystemStore,
      bookingStore: ccoBookingStore,
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
    createCcoTreatmentAgreementRouter({
      treatmentAgreementStore: ccoTreatmentAgreementStore,
      templateVersionApprovalStore: ccoTemplateVersionApprovalStore,
      commercialStore: ccoCommercialStore,
      patientMasterStore: ccoPatientMasterStore,
      offerDocumentStore: ccoOfferDocumentStore,
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
      ccoMailIngestionStore,
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
      postOpReviewStore,
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
      executiveDecisionFeed,
      releaseGovernanceStore,
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

  const posStorePath = config.stateRoot
    ? `${config.stateRoot}/cco-pos.json`
    : './data/cco-pos.json';
  const posStore = createPosStore({ filePath: posStorePath });
  posStore.load().catch((err) => console.warn('[pos-store] Load failed:', err?.message));

  app.use(
    '/api/v1',
    createPosRouter({
      authStore: auth,
      posStore,
    })
  );

  const patientPortalStorePath = config.stateRoot
    ? `${config.stateRoot}/cco-patient-portal.json`
    : './data/cco-patient-portal.json';
  const patientPortalStore = createPatientPortalStore({ filePath: patientPortalStorePath });
  patientPortalStore
    .load()
    .catch((err) => console.warn('[patient-portal] Load failed:', err?.message));

  app.use(
    '/api',
    createPatientPortalRouter({
      patientPortalStore,
      journalStore: ccoJournalStore || null,
    })
  );
  app.locals.patientPortalStore = patientPortalStore; // Beslut #2: exponera för staff-API

  const identityStorePath = config.stateRoot
    ? `${config.stateRoot}/cco-patient-identity.json`
    : './data/cco-patient-identity.json';
  const identityStore = createPatientIdentityStore({ filePath: identityStorePath });
  identityStore.load().catch((err) => console.warn('[identity-store] Load failed:', err?.message));

  app.use(
    '/api/v1',
    createPatientIdentityRouter({
      authStore: auth,
      identityStore,
    })
  );

  const signalingService = createSignalingService();
  const transcriptionService = createMeetingTranscriptionService();

  const qmsStorePath = config.stateRoot
    ? `${config.stateRoot}/cco-qms.json`
    : './data/cco-qms.json';
  const qmsStore = createQmsStore({ filePath: qmsStorePath });
  qmsStore.load().catch((err) => console.warn('[qms-store] Load failed:', err?.message));

  app.use(
    '/api/v1',
    createQmsRouter({
      authStore: auth,
      qmsStore,
    })
  );

  const cmStorePath = config.stateRoot
    ? `${config.stateRoot}/cm-expense.json`
    : './data/cm-expense.json';
  const cmStore = createCmStore({ filePath: cmStorePath });
  cmStore.load().catch((err) => console.warn('[cm-store] Load failed:', err?.message));

  app.use(
    '/api/v1',
    createCmRouter({
      authStore: auth,
      cmStore,
      graphReadConnector: graphReadConnector || null,
    })
  );

  const mergeServicePath = config.stateRoot
    ? `${config.stateRoot}/cco-merge-service.json`
    : './data/cco-merge-service.json';
  const mergeService = createSafeMergeService({ filePath: mergeServicePath });
  mergeService.load().catch((err) => console.warn('[merge-service] Load failed:', err?.message));

  app.use(
    '/api/v1',
    createReconciliationRouter({
      authStore: auth,
      patientMasterStore: ccoPatientMasterStore || null,
      migrationIndexStore: ccoMigrationIndexStore || null,
      journalStore: ccoJournalStore || null,
      mergeService,
    })
  );

  app.use('/api/v1', createComplianceRouter({ authStore: auth, config }));

  app.use(
    '/api/v1',
    createVideoRouter({
      authStore: auth,
      signalingService,
      transcriptionService,
    })
  );

  app.use(
    '/api/v1',
    createCcoMailIngestionRouter({
      config,
      authStore,
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      ingestionStore: ccoMailIngestionStore,
      syncService: ccoMailIngestionSyncService,
      ingestionWorker: ccoMailIngestionWorker,
      graphNotifications: ccoGraphChangeNotifications,
      patientMasterStore: ccoPatientMasterStore,
      logger: console,
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
      journalStore: ccoJournalStore,
      patientMasterStore: ccoPatientMasterStore,
      bookingEngineStore: ccoBookingEngineStore,
      treatmentAgreementStore: ccoTreatmentAgreementStore,
      patientCareStateStore,
      ccoSettingsStore,
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

  // Mailbox-backfill endast när ARCANA_BOOTSTRAP_MAILBOX_BACKFILL=true (se render.yaml).
  // Tvinga inte på vid varje start — full backfill har gett OOM/SIGABRT → 502 på Render.
  if (prodSafeMode && process.env.ARCANA_BOOTSTRAP_PROD_SAFE_MODE !== 'false') {
    console.log('[bootstrap] mailbox-backfill pausad av prod safe-mode');
  } else if (isMailboxBootstrapEnabled()) {
    console.log('[bootstrap] schemalägger mailbox-backfill…');
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
  } else {
    console.log(
      '[bootstrap] mailbox-backfill inaktiv (sätt ARCANA_BOOTSTRAP_MAILBOX_BACKFILL=true för att aktivera)'
    );
  }

  if (config.ccoMailIngestionEnabled === true) {
    ccoMailIngestionWorker
      .reconcileStuckImportRuns()
      .then(async () => {
        const mailboxEmail = config.ccoMailIngestionDefaultMailbox;
        if (!mailboxEmail) return;
        await ccoMailIngestionWorker.ensureQueueIntegrity({ mailboxEmail });
        const summary = ccoMailIngestionStore.buildDashboardSummary({ mailboxEmail });
        const queueLength = Number(summary.queueLength || 0);
        if (queueLength > 0) {
          const resumeDelayMs = Number(config.ccoMailIngestionStartupResumeDelayMs || 120000);
          console.log(
            `[mail-ingestion] schemalägger kö-processing för ${mailboxEmail} (${queueLength} i kö) om ${resumeDelayMs}ms`
          );
          setTimeout(() => {
            ccoMailIngestionWorker.enqueueProcessDrain({
              mailboxEmail,
              mode: config.ccoMailIngestionMode || 'read_only',
            });
          }, resumeDelayMs);
        }
      })
      .catch((error) => {
        console.error('[mail-ingestion] startup heal failed', error?.message || error);
      });
  }
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
