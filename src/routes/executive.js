const express = require('express');

// Executive decision feed endpoints. Mounted at /api/v1 by server.js.
// Extracted from server.js (legacy monolit) — se ORGANISATION.md §4.
//
// `getFeed` är en getter, inte ett värde: server.js startar med en synkron feed
// och *omtilldelar* `executiveDecisionFeed` när den persistenta feeden laddats
// från disk. Routern måste därför läsa aktuell instans vid varje request.
function createExecutiveRouter({ getFeed }) {
  const router = express.Router();

  router.get('/executive/feed', (req, res) => {
    const feed = getFeed();
    const entries = feed.list({
      severity: req.query?.severity || undefined,
      requiredOwnerAction: req.query?.ownerAction === 'true' ? true : undefined,
      limit: Math.min(50, Math.max(1, Number(req.query?.limit) || 20)),
    });
    const summary = feed.getSummary();
    return res.json({ ok: true, entries, summary });
  });

  router.get('/executive/feed/summary', (req, res) => {
    return res.json({ ok: true, ...getFeed().getSummary() });
  });

  router.post('/executive/feed/:entryId/resolve', (req, res) => {
    const result = getFeed().resolve({
      entryId: req.params?.entryId,
      resolvedBy: req.body?.resolvedBy || 'owner',
      resolution: req.body?.resolution || 'acknowledged',
    });
    if (!result) return res.status(404).json({ error: 'Entry hittades inte.' });
    return res.json({ ok: true, entry: result });
  });

  router.get('/executive/agents/status', (req, res) => {
    const feedSummary = getFeed().getSummary();
    const agents = ['COO', 'CAO', 'CFO', 'CMO', 'CCO', 'Patient'].map((name) => ({
      name,
      lastRun: feedSummary.lastEntryByAgent?.[name] || null,
      pendingActions: feedSummary.byAgent?.[name] || 0,
      status: feedSummary.byAgent?.[name] > 0 ? 'action_required' : 'idle',
    }));
    return res.json({ ok: true, agents, feedSummary });
  });

  return router;
}

module.exports = { createExecutiveRouter };
