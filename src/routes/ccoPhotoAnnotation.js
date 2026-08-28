'use strict';

/**
 * Photo-annotation (ORD-136) — kopplar in `ccoPhotoAnnotationStore`.
 *
 * Storens modell (ritningen) var redan klar: drawingData, planSummary,
 * selectedFor, zone, purpose, tags + källfoto-referenser. Den här routern
 * är "kopplingen" — CRUD över annotationer, med audit + persistent disk.
 *
 * Konsument: konsultationsformulärets steg 3 (fotmärkning/planering).
 */

const express = require('express');

function createCcoPhotoAnnotationRouter({
  config,
  auditLog = null,
  appLocals = null,
  requirePermission = null,
  attachRole = null,
} = {}) {
  const router = express.Router();
  const jsonParser = express.json({ limit: '512kb' });

  let storeRef = null;

  function storePath() {
    return config?.ccoPhotoAnnotationStorePath || `${config?.stateRoot || './data'}/cco-photo-annotation.json`;
  }

  async function ensureStore() {
    if (storeRef) return storeRef;
    if (appLocals?.ccoPhotoAnnotationStore) {
      storeRef = appLocals.ccoPhotoAnnotationStore;
      return storeRef;
    }
    const { createCcoPhotoAnnotationStore } = require('../ops/ccoPhotoAnnotationStore');
    storeRef = await createCcoPhotoAnnotationStore({ filePath: storePath(), auditLog });
    if (appLocals && !appLocals.ccoPhotoAnnotationStore) {
      appLocals.ccoPhotoAnnotationStore = storeRef;
    }
    return storeRef;
  }

  function actorOf(req) {
    return { userId: req.auth?.userId || null, role: req.cco?.role || req.auth?.role || 'unknown' };
  }

  function guard(write) {
    const perm = write ? 'scalp.write' : 'scalp.read';
    if (typeof requirePermission === 'function') return requirePermission(perm);
    return (_req, _res, next) => next();
  }

  async function handle(req, res, run) {
    try {
      const actor = actorOf(req);
      return await run(actor);
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res.status(statusCode).json({ error: error.message });
      }
      console.error('[cco-photo-annotation]', error);
      return res.status(500).json({ error: 'Kunde inte hantera foto-annotationen.' });
    }
  }

  router.get(
    '/cco/photo-annotations/patient/:patientId',
    typeof attachRole === 'function' ? attachRole : (_req, _res, next) => next(),
    guard(false),
    (req, res) =>
      handle(req, res, async () => {
        const store = await ensureStore();
        const annotations = store.getByCustomer(req.params.patientId);
        return res.json({ annotations });
      })
  );

  router.get(
    '/cco/photo-annotations/:id',
    typeof attachRole === 'function' ? attachRole : (_req, _res, next) => next(),
    guard(false),
    (req, res) =>
      handle(req, res, async () => {
        const store = await ensureStore();
        const annotation = store.getById(req.params.id);
        if (!annotation) return res.status(404).json({ error: 'Annotation saknas.' });
        return res.json({ annotation });
      })
  );

  router.post(
    '/cco/photo-annotations',
    typeof attachRole === 'function' ? attachRole : (_req, _res, next) => next(),
    guard(true),
    jsonParser,
    (req, res) =>
      handle(req, res, async (actor) => {
        const store = await ensureStore();
        const annotation = await store.createAnnotationSet({ ...(req.body || {}), actor });
        return res.status(201).json({ annotation });
      })
  );

  router.patch(
    '/cco/photo-annotations/:id',
    typeof attachRole === 'function' ? attachRole : (_req, _res, next) => next(),
    guard(true),
    jsonParser,
    (req, res) =>
      handle(req, res, async (actor) => {
        const store = await ensureStore();
        const annotation = await store.updateAnnotationSet({
          annotationId: req.params.id,
          patch: req.body?.patch || req.body || {},
          actor,
        });
        return res.json({ annotation });
      })
  );

  router.delete(
    '/cco/photo-annotations/:id',
    typeof attachRole === 'function' ? attachRole : (_req, _res, next) => next(),
    guard(true),
    (req, res) =>
      handle(req, res, async (actor) => {
        const store = await ensureStore();
        const deleted = await store.deleteAnnotation(req.params.id, { actor });
        if (!deleted) return res.status(404).json({ error: 'Annotation saknas.' });
        return res.status(204).end();
      })
  );

  return router;
}

module.exports = { createCcoPhotoAnnotationRouter };
