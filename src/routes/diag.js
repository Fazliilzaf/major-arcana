const express = require('express');

// Diagnostik-endpoints (env-flaggor + deployad version). Mounted at /api/v1 by server.js.
// Extracted from server.js (legacy monolit) — se ORGANISATION.md §4.
// config + runtimeState injiceras (stabila referenser i server.js).
function createDiagRouter({ config, runtimeState }) {
  const router = express.Router();

  // Publik diag-endpoint — visar vilka ARCANA_*-env är satta + bootstrap-status.
  router.get('/_diag/env', (req, res) => {
    const flags = [
      'ARCANA_STATE_ROOT',
      'ARCANA_BOOTSTRAP_MAILBOX_BACKFILL',
      'ARCANA_BOOTSTRAP_TENANT_ID',
      'ARCANA_BOOTSTRAP_PREFERRED_MAILBOX',
      'ARCANA_BOOTSTRAP_MAILBOX_LOOKBACK_DAYS',
      'ARCANA_BOOTSTRAP_DELAY_MS',
      'ARCANA_GRAPH_READ_ENABLED',
      'ARCANA_GRAPH_SEND_ENABLED',
      'ARCANA_DEFAULT_TENANT',
    ];
    const env = {};
    for (const k of flags) {
      const v = process.env[k];
      env[k] = v === undefined ? null : v.length > 80 ? v.slice(0, 30) + '...' : v;
    }
    return res.json({
      ok: true,
      env,
      resolved: {
        stateRoot: config.stateRoot,
        aiProvider: config.aiProvider,
        staffJournalOpenAccess: Boolean(config.staffJournalOpenAccess),
        renderDefaultsApplied: Array.isArray(config.renderRuntimeDefaults?.applied)
          ? config.renderRuntimeDefaults.applied
          : [],
      },
      cwd: process.cwd(),
      nodeVersion: process.version,
    });
  });

  // Commit-sha endpoint — så vi kan verifiera vilken version som är deployad.
  router.get('/_diag/version', (req, res) => {
    return res.json({
      ok: true,
      commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'unknown',
      branch: process.env.RENDER_GIT_BRANCH || 'unknown',
      deployedAt: process.env.RENDER_DEPLOY_AT || null,
      serverStartedAt: runtimeState.startedAt,
      fixes: ['FIX3', 'FIX4', 'FIX5', 'FIX6', 'FIX7', 'FIX8'],
    });
  });

  return router;
}

module.exports = { createDiagRouter };
