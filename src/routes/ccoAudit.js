const express = require('express');

// CCO audit-log endpoints. Mounted at /api/v1 by server.js.
// Extracted from server.js (legacy monolit) — se ORGANISATION.md §4.
// ccoAuditLog + RBAC-middleware (attachRole, requireAnyRole) injiceras.
function createCcoAuditRouter({ ccoAuditLog, requireAuthenticated, attachRole, requireAnyRole }) {
  const router = express.Router();

  const normalizeId = (value) => (typeof value === 'string' ? value.trim().slice(0, 200) : '');
  const bookingAuditReadout = (event) => ({
    action: event.action,
    occurredAt: event.ts,
    result: event.result,
    traceId: event.traceId,
  });

  // The audit router is mounted before auth bootstrap completes in server.js.
  // Use the lazy auth bridge only on /cco-audit so verified token context
  // exists before RBAC resolves req.auth.role. The router itself is mounted at
  // /api/v1, where router-wide auth would also intercept public auth routes.
  router.use(
    '/cco-audit',
    typeof requireAuthenticated === 'function'
      ? requireAuthenticated
      : (_req, res) => res.status(503).json({ error: 'auth_not_ready' })
  );

  // Narrow read-only booking audit for the customer history. Staff receives
  // only the create lifecycle facts for the requested canonical booking, not
  // the general audit log or actor/IP metadata.
  router.get(
    '/cco-audit/booking/:bookingId',
    attachRole,
    requireAnyRole(['owner', 'operator']),
    (req, res) => {
      const bookingId = normalizeId(req.params.bookingId);
      const patientId = normalizeId(req.query.patientId);
      const tenantId = normalizeId(req.auth?.tenantId || req.cco?.tenantId);
      if (!bookingId || !patientId) {
        return res.status(400).json({ error: 'bookingId och canonical patientId krävs.' });
      }

      const belongsToScope = (event) => {
        if (tenantId && normalizeId(event?.target?.tenantId) !== tenantId) return false;
        return normalizeId(event?.detail?.patientId) === patientId;
      };
      const committed = ccoAuditLog
        .query({ limit: 1000, action: 'bookings.create_committed', targetId: bookingId })
        .find(belongsToScope);
      const idempotencyKey = normalizeId(committed?.detail?.idempotencyKey);
      const requested = idempotencyKey
        ? ccoAuditLog
            .query({
              limit: 1000,
              action: 'bookings.create_requested',
              targetId: idempotencyKey,
            })
            .find(belongsToScope)
        : null;
      const items = [requested, committed].filter(Boolean).map(bookingAuditReadout);

      return res.json({
        readOnly: true,
        zeroWrites: true,
        bookingId,
        patientId,
        count: items.length,
        items,
      });
    }
  );

  // GET /api/v1/cco-audit — bara owner+revisor
  router.get('/cco-audit', attachRole, requireAnyRole(['owner', 'revisor']), (req, res) => {
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
  router.post('/cco-audit', attachRole, express.json({ limit: '8kb' }), (req, res) => {
    // F2 (audit-gap): audit-loggen får inte kunna förgiftas av oautentiserade
    // anrop. Kräv en upplöst, icke-anonym roll (autentiserad staff eller det
    // interna systemet). Anonyma writes avvisas — annars kan vem som helst
    // injicera falska audit-poster.
    const role = req.cco?.role || 'anonymous';
    if (!role || role === 'anonymous') {
      return res.status(403).json({
        error: 'forbidden',
        detail: 'Audit-write kräver autentiserad roll.',
      });
    }
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

  return router;
}

module.exports = { createCcoAuditRouter };
