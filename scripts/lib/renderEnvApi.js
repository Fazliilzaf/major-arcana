'use strict';

/**
 * Render env-vars API helpers (paginated GET, fail-hard).
 */
const fs = require('fs');
const path = require('path');

function resolveRenderApiKey(explicitKey) {
  const fromEnv = (explicitKey || process.env.RENDER_API_KEY || '').trim();
  if (fromEnv) return fromEnv;

  const cliPath = path.join(process.env.HOME || '', '.render/cli.yaml');
  if (!fs.existsSync(cliPath)) return '';
  const cliYaml = fs.readFileSync(cliPath, 'utf8');
  return (cliYaml.match(/key: (rnd_\S+)/) || [])[1] || '';
}

/**
 * @param {unknown[]} rows
 * @returns {Map<string, string>}
 */
function envRowsToMap(rows) {
  const map = new Map();
  for (const row of rows) {
    const ev = row?.envVar || row;
    if (ev?.key) map.set(ev.key, ev.value ?? '');
  }
  return map;
}

/**
 * Fetch all env-var rows for a service (cursor pagination, limit=100).
 * @param {string} serviceId
 * @param {string} apiKey
 * @returns {Promise<unknown[]>}
 */
async function fetchAllRenderEnvRows(serviceId, apiKey) {
  if (!serviceId) throw new Error('fetchAllRenderEnvRows: serviceId required');
  if (!apiKey) throw new Error('fetchAllRenderEnvRows: apiKey required');

  const rows = [];
  let cursor = null;

  for (;;) {
    const url = new URL(`https://api.render.com/v1/services/${serviceId}/env-vars`);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Render GET env-vars failed: ${res.status} ${text.slice(0, 240)}`);
    }

    const page = await res.json();
    if (!Array.isArray(page)) {
      throw new Error('Render GET env-vars: expected JSON array');
    }
    if (page.length === 0) break;

    rows.push(...page);
    const lastCursor = page[page.length - 1]?.cursor;
    if (!lastCursor) break;
    cursor = lastCursor;
  }

  return rows;
}

/**
 * @param {string} serviceId
 * @param {string} [apiKey]
 * @returns {Promise<Map<string, string>>}
 */
async function fetchAllRenderEnvMap(serviceId, apiKey) {
  const key = resolveRenderApiKey(apiKey);
  const rows = await fetchAllRenderEnvRows(serviceId, key);
  return envRowsToMap(rows);
}

module.exports = {
  resolveRenderApiKey,
  envRowsToMap,
  fetchAllRenderEnvRows,
  fetchAllRenderEnvMap,
};
