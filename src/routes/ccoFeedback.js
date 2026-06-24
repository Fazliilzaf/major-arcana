const express = require('express');
const fs = require('node:fs');

// CCO Feedback (från stage-badge "Rapportera"-knapp). Mounted at /api/v1 by server.js.
// Extracted from server.js (legacy monolit) — se ORGANISATION.md §4.
// feedbackFile-sökväg + requireCcoAuthenticated injiceras.
function createCcoFeedbackRouter({ feedbackFile, requireCcoAuthenticated }) {
  const router = express.Router();

  // Egen body-parser för att inte kollidera med ev. global express.json() limit.
  router.post('/cco-feedback', express.json({ limit: '50kb' }), (req, res) => {
    try {
      const entry = req.body && typeof req.body === 'object' ? req.body : null;
      if (!entry || !entry.text) {
        return res.status(400).json({ error: 'text required' });
      }
      entry.receivedAt = new Date().toISOString();
      entry.ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
        .toString()
        .split(',')[0]
        .trim();
      fs.appendFileSync(feedbackFile, JSON.stringify(entry) + '\n');
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: 'invalid json: ' + err.message });
    }
  });

  router.get('/cco-feedback', requireCcoAuthenticated, (req, res) => {
    try {
      const raw = fs.existsSync(feedbackFile) ? fs.readFileSync(feedbackFile, 'utf8') : '';
      const items = raw
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      res.json({ count: items.length, items: items.slice(-200) });
    } catch {
      res.json({ count: 0, items: [] });
    }
  });

  return router;
}

module.exports = { createCcoFeedbackRouter };
