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
    return { bookingEngineStore, clientoBookingStore, encounterStore };
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
    return { tenantId, ...stores };
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
