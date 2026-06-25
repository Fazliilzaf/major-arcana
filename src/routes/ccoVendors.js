const express = require('express');

// CCO Vendor Register (PUB-register). Mounted at /api/v1 by server.js.
// Extracted from server.js (legacy monolit) — se ORGANISATION.md §4.
// store + RBAC-middleware + jsonParser injiceras.
const RBAC = ['owner', 'dpo', 'revisor'];

function createCcoVendorsRouter({ store, attachRole, requireAnyRole, jsonParser }) {
  const router = express.Router();
  const guard = [attachRole, requireAnyRole(RBAC)];
  const actorOf = (req) => ({ userId: req.role?.userId, role: req.role?.role });

  router.get('/cco-vendors', ...guard, (req, res) => {
    res.json({
      vendors: store.listAll(),
      needsReview: store.listNeedsReview(),
      legacyExit: store.listLegacyExit(),
    });
  });

  // OBS: /export måste ligga före /:id för att inte fångas av :id-paramet.
  router.get('/cco-vendors/export', ...guard, (req, res) => {
    res.json(store.exportRegister());
  });

  router.get('/cco-vendors/:id', ...guard, (req, res) => {
    const v = store.getById(req.params.id);
    if (!v) return res.status(404).json({ error: 'not found' });
    res.json(v);
  });

  router.post('/cco-vendors', ...guard, jsonParser, async (req, res) => {
    try {
      res.json(await store.createVendor(req.body, actorOf(req)));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.patch('/cco-vendors/:id', ...guard, jsonParser, async (req, res) => {
    try {
      res.json(await store.updateVendor(req.params.id, req.body, actorOf(req)));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/cco-vendors/:id/dpa-reviewed', ...guard, jsonParser, async (req, res) => {
    try {
      res.json(
        await store.markDpaReviewed({ vendorId: req.params.id, actor: actorOf(req), ...req.body })
      );
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/cco-vendors/:id/underbilaga1-completed', ...guard, jsonParser, async (req, res) => {
    try {
      res.json(
        await store.markUnderbilaga1Completed({
          vendorId: req.params.id,
          actor: actorOf(req),
          ...req.body,
        })
      );
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/cco-vendors/:id/subprocessor', ...guard, jsonParser, async (req, res) => {
    try {
      res.json(
        await store.addSubprocessor({
          vendorId: req.params.id,
          actor: actorOf(req),
          subprocessor: req.body,
        })
      );
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post('/cco-vendors/:id/legacy-exit', ...guard, jsonParser, async (req, res) => {
    try {
      res.json(
        await store.markLegacyExit({ vendorId: req.params.id, actor: actorOf(req), ...req.body })
      );
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return router;
}

module.exports = { createCcoVendorsRouter };
