'use strict';

const express = require('express');
const path = require('node:path');
const { loadSummary, listQueue } = require('../ops/ccoDriveImportReviewReadService');

function createCcoDriveImportReviewReadRouter({
  projectRoot,
  requireCcoAuthenticated,
  attachRole,
  requirePermission,
} = {}) {
  if (typeof requireCcoAuthenticated !== 'function') {
    throw new Error('requireCcoAuthenticated krävs för ccoDriveImportReviewReadRouter');
  }
  if (typeof attachRole !== 'function') {
    throw new Error('attachRole krävs för ccoDriveImportReviewReadRouter');
  }
  if (typeof requirePermission !== 'function') {
    throw new Error('requirePermission krävs för ccoDriveImportReviewReadRouter');
  }

  const router = express.Router();
  const root = projectRoot || path.join(__dirname, '../..');
  const dataDir = path.join(root, 'data');

  router.use(requireCcoAuthenticated, attachRole, requirePermission('asset.review'));

  router.get('/cco/drive-import-review/summary', (req, res) => {
    try {
      const summary = loadSummary(dataDir);
      return res.json(summary);
    } catch (err) {
      console.error('[cco/drive-import-review/summary]', err);
      return res
        .status(500)
        .json({ error: err.message || 'Kunde inte ladda drive-import-review summary.' });
    }
  });

  router.get('/cco/drive-import-review/queue', (req, res) => {
    try {
      const body = listQueue(dataDir, {
        year: String(req.query.year || 'all'),
        mediaKind: String(req.query.mediaKind || 'all'),
        fileType: String(req.query.fileType || 'all'),
        confidence: String(req.query.confidence || 'all'),
        matchGround: String(req.query.matchGround || 'all'),
        patientId: String(req.query.patientId || '').trim(),
        q: String(req.query.q || '').trim(),
        limit: Number(req.query.limit) || 50,
        offset: Number(req.query.offset) || 0,
      });
      return res.json(body);
    } catch (err) {
      console.error('[cco/drive-import-review/queue]', err);
      return res
        .status(500)
        .json({ error: err.message || 'Kunde inte ladda drive-import-review queue.' });
    }
  });

  return router;
}

module.exports = { createCcoDriveImportReviewReadRouter };
