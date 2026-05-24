'use strict';

/**
 * Generic HTTP metrics bridge for CMO connectors (Fas O).
 * Lets MODE=live + LIVE_FETCH exercise the full fetch path before
 * Google/Meta/LinkedIn platform tokens are provisioned.
 *
 * Auth: Bearer ARCANA_MARKETING_BRIDGE_TOKEN (or per-channel accessToken).
 */

const express = require('express');
const { CHANNEL_FIXTURES } = require('../ops/cmoMarketingConnectors');

const ALLOWED_CHANNELS = new Set(['google_ads', 'meta', 'linkedin', 'mail']);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveBridgeToken(config = {}) {
  return (
    normalizeText(config.marketingBridgeToken) ||
    normalizeText(process.env.ARCANA_MARKETING_BRIDGE_TOKEN)
  );
}

function authorizeBridge(req, config = {}) {
  const expected = resolveBridgeToken(config);
  if (!expected) return { ok: false, reason: 'bridge_token_not_configured' };

  const authHeader = normalizeText(req.get('authorization'));
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : normalizeText(req.get('x-marketing-bridge-token'));

  if (!token || token !== expected) return { ok: false, reason: 'unauthorized' };
  return { ok: true };
}

function buildMetricsPayload(channel, window = '7d') {
  const fixture = CHANNEL_FIXTURES[channel];
  if (!fixture) {
    return null;
  }
  return {
    channel,
    window,
    source: 'marketing_connector_bridge',
    fetchedAt: new Date().toISOString(),
    metrics: fixture.metrics,
    spend: fixture.spend,
    impressions: fixture.impressions,
    clicks: fixture.clicks,
  };
}

function createMarketingConnectorBridgeRouter({ config } = {}) {
  const router = express.Router();

  router.get('/internal/marketing-bridge/:channel/metrics', (req, res) => {
    const auth = authorizeBridge(req, config);
    if (!auth.ok) {
      return res.status(auth.reason === 'bridge_token_not_configured' ? 503 : 401).json({
        ok: false,
        error: auth.reason,
      });
    }

    const channel = normalizeText(req.params.channel).toLowerCase();
    if (!ALLOWED_CHANNELS.has(channel)) {
      return res.status(404).json({ ok: false, error: 'unknown_channel' });
    }

    const window = normalizeText(req.query.window) || '7d';
    const payload = buildMetricsPayload(channel, window);
    if (!payload) {
      return res.status(404).json({ ok: false, error: 'fixture_missing' });
    }

    return res.json(payload);
  });

  return router;
}

module.exports = {
  createMarketingConnectorBridgeRouter,
  buildMetricsPayload,
};
