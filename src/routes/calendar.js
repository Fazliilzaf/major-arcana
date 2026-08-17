const express = require('express');

const { buildDayView, buildWeekView } = require('../ops/clinicCalendarView');
const { buildIcalFeed, getBookingsForResource } = require('../ops/icalExport');
const { attachRole, requirePermission } = require('../security/ccoRbac');

// Calendar/iCal endpoints. Mounted at /api/v1 by server.js.
// Extracted from server.js (legacy monolit) — se ORGANISATION.md §4.
function createCalendarRouter({
  requireAuth,
  getBookingEngineStore,
  getClientoBookingStore,
  getEncounterStore,
  getMailboxTruthStore,
} = {}) {
  const router = express.Router();
  const authenticate =
    typeof requireAuth === 'function'
      ? requireAuth
      : (_req, res) => res.status(503).json({ ok: false, error: 'auth_not_ready' });
  const readGuard = [authenticate, attachRole, requirePermission('bookings.read')];

  function resolveStores(req) {
    const bookingEngineStore =
      (typeof getBookingEngineStore === 'function' && getBookingEngineStore(req)) ||
      req.app?.locals?.ccoBookingEngineStore ||
      null;
    const clientoBookingStore =
      (typeof getClientoBookingStore === 'function' && getClientoBookingStore(req)) ||
      req.app?.locals?.clientoBookingStore ||
      null;
    const encounterStore =
      (typeof getEncounterStore === 'function' && getEncounterStore(req)) ||
      req.app?.locals?.ccoTreatmentEncounterStore ||
      null;
    const mailboxTruthStore =
      (typeof getMailboxTruthStore === 'function' && getMailboxTruthStore(req)) ||
      req.app?.locals?.ccoMailboxTruthStore ||
      null;
    return { bookingEngineStore, clientoBookingStore, encounterStore, mailboxTruthStore };
  }

  function createConversationResolver(mailboxTruthStore) {
    if (!mailboxTruthStore || typeof mailboxTruthStore.listMessages !== 'function') {
      return null;
    }
    return function resolveConversationId({ patientEmail } = {}) {
      const email = String(patientEmail || '').trim().toLowerCase();
      if (!email || !email.includes('@')) return null;
      const mailboxes =
        typeof mailboxTruthStore.listLoadedMailboxes === 'function'
          ? mailboxTruthStore.listLoadedMailboxes()
          : [];
      let best = null;
      let bestAt = '';
      const sources = mailboxes.length
        ? mailboxes.map((id) => ({ mailboxIds: [id] }))
        : [{}];
      for (const query of sources) {
        const messages = mailboxTruthStore.listMessages({ ...query, folderTypes: ['inbox'], limit: 200 });
        for (const m of messages || []) {
          const counterpart = String(
            m.fromEmail || m.from?.address || m.toEmail || m.to?.[0]?.address || ''
          )
            .trim()
            .toLowerCase();
          if (counterpart !== email) continue;
          const convId = m.mailboxConversationId || m.conversationId;
          if (!convId) continue;
          const at = String(m.receivedAt || m.sentAt || m.lastModifiedAt || '');
          if (!best || at > bestAt) {
            best = convId;
            bestAt = at;
          }
        }
      }
      return best;
    };
  }

  function readContext(req, res) {
    const tenantId = String(req.auth?.tenantId || '').trim();
    if (!tenantId) {
      res.status(403).json({ ok: false, error: 'tenant_context_required' });
      return null;
    }
    const stores = resolveStores(req);
    if (!stores.bookingEngineStore && !stores.clientoBookingStore) {
      res.status(503).json({ ok: false, error: 'calendar_store_not_ready' });
      return null;
    }
    const resolveConversationId = createConversationResolver(stores.mailboxTruthStore);
    return { tenantId, ...stores, resolveConversationId };
  }

  router.get('/calendar/day', ...readGuard, (req, res) => {
    const context = readContext(req, res);
    if (!context) return;
    const view = buildDayView({
      date: req.query?.date,
      ...context,
    });
    return res.json({ ok: true, ...view });
  });

  router.get('/calendar/week', ...readGuard, (req, res) => {
    const context = readContext(req, res);
    if (!context) return;
    const view = buildWeekView({
      startDate: req.query?.startDate,
      ...context,
    });
    return res.json({ ok: true, ...view });
  });

  router.get('/calendar/ical/:resourceId.ics', ...readGuard, (req, res) => {
    const context = readContext(req, res);
    if (!context) return;
    const resourceId = req.params.resourceId || 'all';
    const bookings = getBookingsForResource(context.bookingEngineStore, resourceId, {
      days: Number(req.query?.days) || 30,
      tenantId: context.tenantId,
      clientoBookingStore: context.clientoBookingStore,
    });
    const resourceLabel = resourceId === 'all' ? 'Alla behandlare' : resourceId;
    const ical = buildIcalFeed({ resourceLabel, bookings });
    const safeResourceId = resourceId.replace(/[^a-z0-9._-]+/gi, '-').slice(0, 120) || 'all';
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeResourceId}-schema.ics"`);
    return res.send(ical);
  });

  return router;
}

module.exports = { createCalendarRouter };
