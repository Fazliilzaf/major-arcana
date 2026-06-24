const express = require('express');

// CCO audit-log endpoints. Mounted at /api/v1 by server.js.
// Extracted from server.js (legacy monolit) — se ORGANISATION.md §4.
// ccoAuditLog + RBAC-middleware (attachRole, requireAnyRole) injiceras.
function createCcoAuditRouter({ ccoAuditLog, attachRole, requireAnyRole }) {
  const router = express.Router();

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
