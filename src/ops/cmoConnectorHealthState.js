'use strict';

/**
 * Tracks sustained connector errors for D4 alerting (>15 min).
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_ALERT_AFTER_MS = 15 * 60 * 1000;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stateKey(tenantId, channel) {
  return `${normalizeText(tenantId) || 'default'}::${normalizeText(channel).toLowerCase()}`;
}

async function readState(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    if (error && error.code === 'ENOENT') return {};
    throw error;
  }
}

async function writeState(filePath, state) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function createCmoConnectorHealthStateStore({ filePath, alertAfterMs = DEFAULT_ALERT_AFTER_MS } = {}) {
  if (!filePath) {
    throw new Error('cmoConnectorHealthStateStore requires filePath');
  }

  const alertThresholdMs =
    Number.isFinite(Number(alertAfterMs)) && Number(alertAfterMs) >= 0
      ? Number(alertAfterMs)
      : DEFAULT_ALERT_AFTER_MS;

  async function recordStatuses({ tenantId = 'default', items = [], checkedAt = new Date().toISOString() } = {}) {
    const state = await readState(filePath);
    const now = Date.parse(checkedAt) || Date.now();
    const updated = { ...state };

    for (const item of items) {
      const key = stateKey(tenantId, item.channel);
      if (item.status === 'error') {
        const existing = updated[key];
        updated[key] = {
          channel: item.channel,
          tenantId: normalizeText(tenantId) || 'default',
          firstErrorAt: existing?.firstErrorAt || checkedAt,
          lastErrorAt: checkedAt,
          message: item.message || existing?.message || '',
          consecutiveErrors: Number(existing?.consecutiveErrors || 0) + 1,
        };
      } else {
        delete updated[key];
      }
    }

    await writeState(filePath, updated);
    return summarize(updated, now);
  }

  function summarize(state, nowMs = Date.now()) {
    const entries = Object.values(state);
    const alerting = entries.filter((entry) => {
      const firstMs = Date.parse(entry.firstErrorAt);
      return Number.isFinite(firstMs) && nowMs - firstMs >= alertThresholdMs;
    });
    return {
      alertAfterMs: alertThresholdMs,
      errorCount: entries.length,
      alertingCount: alerting.length,
      alertingChannels: alerting.map((entry) => entry.channel),
      entries,
    };
  }

  async function getSummary() {
    const state = await readState(filePath);
    return summarize(state);
  }

  async function shouldAlert({ tenantId = 'default', channel = '' } = {}) {
    const state = await readState(filePath);
    const entry = state[stateKey(tenantId, channel)];
    if (!entry) return false;
    const firstMs = Date.parse(entry.firstErrorAt);
    return Number.isFinite(firstMs) && Date.now() - firstMs >= alertThresholdMs;
  }

  return {
    filePath,
    alertAfterMs: alertThresholdMs,
    recordStatuses,
    getSummary,
    shouldAlert,
    summarize,
  };
}

module.exports = {
  DEFAULT_ALERT_AFTER_MS,
  createCmoConnectorHealthStateStore,
};
