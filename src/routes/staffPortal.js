'use strict';

/**
 * staffPortal.js — Personalportal för Hair TP Clinic
 *
 * Serverar prototypvyn och API för:
 *   - Rollbaserade dashboards (sjuksköterska, läkare, admin/owner)
 *   - Ordinationsgranskningskö (human-in-the-loop, aldrig AI-beslut)
 *   - Konversationer/kundärenden (read-only, filterade per personal)
 *   - Kundfiler/bilder (read-only, RBAC photo.read)
 *   - Delegeringsdokument och QMS-handbok (statisk dokumentkatalog)
 *   - Audit-trail (read-only för owner/revisor)
 *
 * Säkerhetsregler (inbyggda, oföränderliga):
 *   - Systemet skapar ALDRIG ordination.approved automatiskt
 *   - All klinisk granskning kräver explicit POST + RBAC-permission
 *   - Varje statusändring → audit-logg med actor + signatur + tidsstämpel
 *   - Bilder/konversationer visas bara för behörig personal (RBAC)
 *   - Inga medicinska beslut, inga dokumentändringar via detta API
 */

const express = require('express');
const path = require('node:path');
const fs = require('node:fs/promises');
const { requirePermission, requireAnyRole } = require('../security/ccoRbac');

/**
 * createStaffPortalRouter — Factory med store-injektion.
 *
 * @param {object} opts
 * @param {object}   opts.config               - Appkonfiguration (stateRoot, journalPhotosDir, m.m.)
 * @param {function} opts.requireAuth           - Auth-middleware (valfri)
 * @param {object}   opts.ccoAuditLog           - ccoAuditLog-instans (valfri)
 * @param {object}   opts.bookingCaseStore      - ccoBookingCaseStore (valfri)
 * @param {object}   opts.journalPhotoStore     - ccoJournalPhotoStore (valfri)
 * @param {object}   opts.mailIngestionStore    - ccoMailIngestionStore (valfri)
 * @param {function} opts.getCommDraftStore     - Lazy-getter: () => commDraftStore | null
 * @param {function} opts.getSendActionStore    - Lazy-getter: () => sendActionStore | null
 */
function createStaffPortalRouter({
  config = {},
  requireAuth = null,
  ccoAuditLog = null,
  bookingCaseStore = null,
  journalPhotoStore: _journalPhotoStore = null,
  mailIngestionStore = null,
  getCommDraftStore = null,
  getSendActionStore = null,
} = {}) {
  const router = express.Router();

  // Conversation thread store — lazy-initieras vid första anrop
  let _threadStorePromise = null;

  async function getThreadStore() {
    if (!_threadStorePromise) {
      const { createCcoConversationThreadStore } = require('../ops/ccoConversationThreadStore');
      const commDraftStore = getCommDraftStore?.() ?? null;
      const sendActionStore = getSendActionStore?.() ?? null;
      const filePath =
        config.ccoConversationThreadStateStorePath ||
        config.ccoConversationStateStorePath ||
        `${config.stateRoot || './data'}/cco-conversation-thread-state.json`;

      _threadStorePromise = createCcoConversationThreadStore({
        filePath,
        mailIngestionStore: mailIngestionStore || null,
        commDraftStore: commDraftStore || null,
        sendActionsList: sendActionStore?.listSends
          ? (customerId) => sendActionStore.listSends({ customerId, limit: 100 })
          : null,
        auditLog: ccoAuditLog,
      });
    }
    return _threadStorePromise;
  }

  function getActor(req) {
    return {
      role: req.cco?.role ?? req.auth?.role ?? null,
      userId: req.auth?.userId ?? req.session?.userId ?? null,
    };
  }

  function handleWriteError(res, err) {
    const status = Number(err?.statusCode) || 500;
    return res.status(status).json({ ok: false, error: err?.message || 'Kunde inte spara.' });
  }

  // Lägg till requireAuth som global pre-filter för /api/v1/staff/*
  // (HTML-routen /staff-portal är öppen)
  if (requireAuth) {
    router.use('/api/v1/staff', requireAuth);
  }

  /* ── Prototype view (HTML) ────────────────────────────────────── */
  router.get('/staff-portal', (_req, res) => {
    res.sendFile(path.join(__dirname, '../../public/staff-portal.html'));
  });

  /* ── GET /api/v1/staff/me ─────────────────────────────────────
     Returnerar inloggad personals roll och profil.
  ─────────────────────────────────────────────────────────────── */
  router.get(
    '/api/v1/staff/me',
    requireAnyRole(['owner', 'operator', 'konsult', 'personal']),
    (req, res) => {
      const role = req.cco?.role ?? null;
      const auth = req.auth ?? {};
      res.json({
        ok: true,
        staffId: auth.userId ?? req.session?.userId ?? null,
        role,
        tenantId: auth.tenantId ?? null,
        name: auth.name ?? auth.displayName ?? auth.staffName ?? null,
      });
    }
  );

  /* ── GET /api/v1/staff/tasks ──────────────────────────────────
     Hämtar bokningsärenden tilldelade inloggad personal.
     Filtreras på assignedTo = userId (sjuksköterska/konsult ser egna).
     Admin/owner kan ange ?assignedTo=all för alla.
  ─────────────────────────────────────────────────────────────── */
  router.get('/api/v1/staff/tasks', requirePermission('customers.read'), async (req, res) => {
    try {
      const role = req.cco?.role ?? null;
      const userId = req.auth?.userId ?? null;
      const tenantId = req.auth?.tenantId ?? null;
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const all = req.query.assignedTo === 'all' && (role === 'owner' || role === 'operator');

      let tasks = [];
      if (bookingCaseStore) {
        tasks = await bookingCaseStore.listCases({
          tenantId: tenantId || undefined,
          assignedTo: all ? null : userId || undefined,
          limit,
        });
      }
      res.json({ ok: true, tasks, count: tasks.length });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  /* ── GET /api/v1/staff/review-queue ───────────────────────────
     Manuell granskningskö — ärenden i pågående handläggning.
     Returnerar qualifying + proposed + confirmed, sorterade per updatedAt.
     Read-only statusvy — inga åtgärder exponeras härifrån.
  ─────────────────────────────────────────────────────────────── */
  router.get(
    '/api/v1/staff/review-queue',
    requirePermission('customers.read'),
    async (req, res) => {
      try {
        const tenantId = req.auth?.tenantId ?? null;
        const limit = Math.min(Number(req.query.limit) || 30, 100);

        let queue = [];
        if (bookingCaseStore) {
          const [a, b, c] = await Promise.all([
            bookingCaseStore
              .listCases({ tenantId: tenantId || undefined, state: 'qualifying', limit })
              .catch(() => []),
            bookingCaseStore
              .listCases({ tenantId: tenantId || undefined, state: 'proposed', limit })
              .catch(() => []),
            bookingCaseStore
              .listCases({ tenantId: tenantId || undefined, state: 'confirmed', limit })
              .catch(() => []),
          ]);
          queue = [...a, ...b, ...c]
            .sort((x, y) => String(y.updatedAt).localeCompare(String(x.updatedAt)))
            .slice(0, limit);
        }
        res.json({ ok: true, queue, count: queue.length });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  /* ── GET /api/v1/staff/ordination-reviews ─────────────────────
     Granskningskö för ordinationsunderlag (doctor view).
     Returnerar alla öppna bokningsärenden (ej completed/cancelled)
     för manuell läkargranskning. Fas 3 lägger till
     handoffChecklist-filtrering när fältet finns i bookingCaseStore.
     Kräver ordination.view-permission (owner, operator, konsult).
  ─────────────────────────────────────────────────────────────── */
  router.get(
    '/api/v1/staff/ordination-reviews',
    requirePermission('ordination.view'),
    async (req, res) => {
      try {
        const tenantId = req.auth?.tenantId ?? null;
        const limit = Math.min(Number(req.query.limit) || 20, 100);

        let reviews = [];
        if (bookingCaseStore) {
          const allOpen = await bookingCaseStore.listCases({
            tenantId: tenantId || undefined,
            limit: limit * 4,
          });
          reviews = allOpen
            .filter((c) => !['completed', 'cancelled'].includes(c.state))
            .slice(0, limit);
        }
        res.json({ ok: true, reviews, count: reviews.length });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  /* ── GET /api/v1/staff/audit ──────────────────────────────────
     Audit-logg — senaste händelser. Owner/revisor-only.
     Skrivskyddad och oföränderlig. Kan filtreras per action.
  ─────────────────────────────────────────────────────────────── */
  router.get('/api/v1/staff/audit', requirePermission('audit.read'), (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const since = req.query.since || null;
      const action = req.query.action || null;

      const entries = ccoAuditLog ? ccoAuditLog.query({ limit, since, action }) : [];

      res.json({ ok: true, entries, count: entries.length });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  /* ── GET /api/v1/staff/customer-threads/:customerId ──────────
     Konversationstrådar för en specifik kund.
     Kräver mail.read-permission. Tenantid från session.
  ─────────────────────────────────────────────────────────────── */
  router.get(
    '/api/v1/staff/customer-threads/:customerId',
    requirePermission('mail.read'),
    async (req, res) => {
      try {
        const customerId = String(req.params.customerId || '').trim();
        const tenantId = req.auth?.tenantId || req.query.tenantId || 'hairtpclinic';
        const filter = String(req.query.filter || 'all').trim();

        if (!customerId) {
          return res.status(400).json({ ok: false, error: 'customerId krävs.' });
        }

        const store = await getThreadStore();
        const built = await store.buildThreadsForCustomer(customerId, { tenantId });
        const threads = store.filterThreads(built.threads || [], filter);

        res.json({
          ok: true,
          customerId,
          threads,
          counts: built.counts,
          summary: built.summary,
        });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  /* ── GET /api/v1/staff/customer-photos/:patientId ─────────────
     Lista journalfoton för en patient (metadata, ej råfiler).
     Kräver photo.read-permission. Audit-loggas.
  ─────────────────────────────────────────────────────────────── */
  router.get(
    '/api/v1/staff/customer-photos/:patientId',
    requirePermission('photo.read'),
    async (req, res) => {
      try {
        const patientId = String(req.params.patientId || '').trim();
        const tenantId = req.auth?.tenantId || 'hairtpclinic';

        if (!patientId) {
          return res.status(400).json({ ok: false, error: 'patientId krävs.' });
        }

        const baseDir =
          config.journalPhotosDir || path.join(__dirname, '../../data/journal-photos');
        const patientDir = path.join(baseDir, tenantId, patientId);

        let photos = [];
        try {
          const files = await fs.readdir(patientDir);
          photos = files
            .filter((f) => /\.(jpg|jpeg|png)$/i.test(f) && !f.endsWith('.annotated.png'))
            .map((f) => {
              const ext = path.extname(f).slice(1).toLowerCase();
              const photoId = path.basename(f, path.extname(f));
              return {
                photoId,
                ext,
                mimeType: ext === 'png' ? 'image/png' : 'image/jpeg',
                fileName: f,
              };
            });
        } catch (dirErr) {
          if (dirErr.code !== 'ENOENT') throw dirErr;
        }

        if (ccoAuditLog) {
          ccoAuditLog.append({
            action: 'photo.read',
            actor: { role: req.cco?.role ?? null, userId: req.auth?.userId ?? null, ip: null },
            target: { kind: 'collection', id: patientId, tenantId },
            result: 'ok',
            detail: { count: photos.length },
          });
        }

        res.json({ ok: true, patientId, photos, count: photos.length });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  /* ── GET /api/v1/staff/documents ─────────────────────────────
     Statisk dokumentkatalog (OLS/checklistor/handbok/delegering).
     Filtrerbar via ?category= och ?filler= (se hairtp-document-types.catalog.json).
     Kräver delegation.read-permission (all personal).
  ─────────────────────────────────────────────────────────────── */
  router.get('/api/v1/staff/documents', requirePermission('delegation.read'), (req, res) => {
    try {
      const catalog = require('../ops/hairtp-document-types.catalog.json');
      const category = req.query.category || null;
      const filler = req.query.filler || null;

      let docs = Array.isArray(catalog) ? catalog : catalog.types || [];
      if (category) docs = docs.filter((d) => d.category === category);
      if (filler) docs = docs.filter((d) => d.filler === filler);

      res.json({ ok: true, documents: docs, count: docs.length });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  /* ── POST /api/v1/staff/ordination-reviews/:id/approve ────────
     Legitimerad läkare godkänner ordinationsunderlag manuellt.
     Kräver ordination.approve-permission. Audit-loggas med signatur.
     SÄKERHET: Systemet ändrar ALDRIG status utan explicit läkarhandling.
  ─────────────────────────────────────────────────────────────── */
  router.post(
    '/api/v1/staff/ordination-reviews/:id/approve',
    requirePermission('ordination.approve'),
    async (req, res) => {
      const { id } = req.params;
      const { comment = '', signature = '' } = req.body ?? {};
      const trimmedSignature = String(signature || '').trim();
      const trimmedComment = String(comment || '').trim();

      if (!trimmedSignature || trimmedSignature.length < 2) {
        return res.status(400).json({ ok: false, error: 'Signatur krävs för godkännande.' });
      }

      let caseRecord = null;
      try {
        if (bookingCaseStore?.updateOrdinationReview) {
          caseRecord = await bookingCaseStore.updateOrdinationReview(
            id,
            { status: 'approved', signature: trimmedSignature, comment: trimmedComment },
            getActor(req)
          );
        }
      } catch (err) {
        return handleWriteError(res, err);
      }

      if (ccoAuditLog) {
        ccoAuditLog.append({
          action: 'ordination.approved',
          actor: { role: req.cco?.role ?? null, userId: req.auth?.userId ?? null, ip: null },
          target: { kind: 'entity', id, tenantId: req.auth?.tenantId ?? null },
          result: 'ok',
          detail: { signature: trimmedSignature, comment: trimmedComment },
        });
      }

      res.json({
        ok: true,
        reviewId: id,
        status: 'approved',
        approvedBy: req.auth?.userId ?? req.session?.userId ?? 'unknown',
        approvedAt: new Date().toISOString(),
        signature: trimmedSignature,
        case: caseRecord,
      });
    }
  );

  /* ── POST /api/v1/staff/ordination-reviews/:id/reject ─────────
     Legitimerad läkare avvisar ordinationsunderlag.
     Kräver alltid motivering. Audit-loggas.
  ─────────────────────────────────────────────────────────────── */
  router.post(
    '/api/v1/staff/ordination-reviews/:id/reject',
    requirePermission('ordination.approve'),
    async (req, res) => {
      const { id } = req.params;
      const { comment = '', signature = '' } = req.body ?? {};
      const trimmedComment = String(comment || '').trim();
      const trimmedSignature = String(signature || '').trim();

      if (!trimmedComment || trimmedComment.length < 5) {
        return res.status(400).json({ ok: false, error: 'Motivering krävs vid avvisning.' });
      }

      if (!trimmedSignature || trimmedSignature.length < 2) {
        return res.status(400).json({ ok: false, error: 'Signatur krävs vid avvisning.' });
      }

      let caseRecord = null;
      try {
        if (bookingCaseStore?.updateOrdinationReview) {
          caseRecord = await bookingCaseStore.updateOrdinationReview(
            id,
            { status: 'rejected', signature: trimmedSignature, comment: trimmedComment },
            getActor(req)
          );
        }
      } catch (err) {
        return handleWriteError(res, err);
      }

      if (ccoAuditLog) {
        ccoAuditLog.append({
          action: 'ordination.rejected',
          actor: { role: req.cco?.role ?? null, userId: req.auth?.userId ?? null, ip: null },
          target: { kind: 'entity', id, tenantId: req.auth?.tenantId ?? null },
          result: 'ok',
          detail: { signature: trimmedSignature, comment: trimmedComment },
        });
      }

      res.json({
        ok: true,
        reviewId: id,
        status: 'rejected',
        rejectedBy: req.auth?.userId ?? req.session?.userId ?? 'unknown',
        rejectedAt: new Date().toISOString(),
        case: caseRecord,
      });
    }
  );

  /* ── POST /api/v1/staff/qms/checklists/:id/complete-item ──────
     Markerar ett checklisteobjekt som klart. Immutable — audit.
  ─────────────────────────────────────────────────────────────── */
  router.post(
    '/api/v1/staff/qms/checklists/:id/complete-item',
    requireAnyRole(['owner', 'operator', 'konsult', 'personal']),
    (req, res) => {
      const { id } = req.params;
      const { itemKey } = req.body ?? {};

      if (!itemKey) {
        return res.status(400).json({ ok: false, error: 'itemKey krävs.' });
      }

      const completedBy = req.auth?.userId ?? req.session?.userId ?? 'unknown';
      const completedAt = new Date().toISOString();

      if (ccoAuditLog) {
        ccoAuditLog.append({
          action: 'qms.checklist.item_completed',
          actor: { role: req.cco?.role ?? null, userId: completedBy, ip: null },
          target: { kind: 'entity', id, tenantId: req.auth?.tenantId ?? null },
          result: 'ok',
          detail: { itemKey },
        });
      }

      res.json({ ok: true, checklistId: id, itemKey, completedBy, completedAt });
    }
  );

  /* ── POST /api/v1/staff/qms/deviations ───────────────────────
     Rapporterar en ny avvikelse (OLS-3). All personal.
  ─────────────────────────────────────────────────────────────── */
  router.post(
    '/api/v1/staff/qms/deviations',
    requireAnyRole(['owner', 'operator', 'konsult', 'personal']),
    (req, res) => {
      const { kind, description } = req.body ?? {};

      if (!kind || !description || description.trim().length < 10) {
        return res
          .status(400)
          .json({ ok: false, error: 'kind och description (min 10 tecken) krävs.' });
      }

      const reportedBy = req.auth?.userId ?? req.session?.userId ?? 'unknown';
      const reportedAt = new Date().toISOString();
      const deviationId = `AVV-${Date.now()}`;

      if (ccoAuditLog) {
        ccoAuditLog.append({
          action: 'qms.deviation.reported',
          actor: { role: req.cco?.role ?? null, userId: reportedBy, ip: null },
          target: { kind: 'entity', id: deviationId, tenantId: req.auth?.tenantId ?? null },
          result: 'ok',
          detail: { kind, description },
        });
      }

      res.json({ ok: true, deviationId, kind, status: 'open', reportedBy, reportedAt });
    }
  );

  return router;
}

module.exports = { createStaffPortalRouter };
