'use strict';

const express = require('express');
const path = require('node:path');
const { loadSummary, listQueue } = require('../ops/ccoImportReviewReadService');

function createCcoImportReviewReadRouter({ projectRoot } = {}) {
  const router = express.Router();
  const root = projectRoot || path.join(__dirname, '../..');
  const dataDir = path.join(root, 'data');

  router.get('/cco/import-review/summary', (req, res) => {
    try {
      return res.json(loadSummary(dataDir, root));
    } catch (err) {
      console.error('[cco/import-review/summary]', err);
      return res
        .status(500)
        .json({ error: err.message || 'Kunde inte ladda import-review summary.' });
    }
  });

  router.get('/cco/import-review/queue', (req, res) => {
    try {
      const source = String(req.query.source || 'all');
      const status = String(req.query.status || 'pending');
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      return res.json(listQueue(dataDir, { source, status, limit, offset }));
    } catch (err) {
      console.error('[cco/import-review/queue]', err);
      return res
        .status(500)
        .json({ error: err.message || 'Kunde inte ladda import-review queue.' });
    }
  });

  return router;
}

module.exports = { createCcoImportReviewReadRouter };
