const express = require('express');

const { buildDayView, buildWeekView } = require('../ops/clinicCalendarView');
const { buildIcalFeed, getBookingsForResource } = require('../ops/icalExport');

// Calendar/iCal endpoints. Mounted at /api/v1 by server.js.
// Extracted from server.js (legacy monolit) — se ORGANISATION.md §4.
function createCalendarRouter() {
  const router = express.Router();

  router.get('/calendar/day', (req, res) => {
    const view = buildDayView({
      date: req.query?.date,
      bookingEngineStore: null,
      encounterStore: null,
      tenantId: req.query?.tenantId || '',
    });
    return res.json({ ok: true, ...view });
  });

  router.get('/calendar/week', (req, res) => {
    const view = buildWeekView({
      startDate: req.query?.startDate,
      bookingEngineStore: null,
      encounterStore: null,
      tenantId: req.query?.tenantId || '',
    });
    return res.json({ ok: true, ...view });
  });

  router.get('/calendar/ical/:resourceId.ics', (req, res) => {
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

  return router;
}

module.exports = { createCalendarRouter };
