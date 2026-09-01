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

/**
 * Hämta alla Blueprints (paginering via cursor). Varje sida är en lista av
 * `{ blueprint: {...}, cursor: "..." }` — platta ut till blueprint-objekt.
 *
 * ORD-162: en Blueprint med `autoSync: true` styr prod-miljön, och att den
 * fanns utan att någon visste var själva felet. Den här hjälparen gör den
 * läsbar — den SKRIVER ingenting.
 *
 * @param {string} [apiKey]
 * @returns {Promise<Array<{ id: string, name: string, repo: string, branch: string, path: string, autoSync: boolean, status: string, lastSync: string }>>}
 */
async function fetchBlueprints(apiKey) {
  const key = resolveRenderApiKey(apiKey);
  if (!key) throw new Error('fetchBlueprints: saknar Render API-nyckel');

  const bps = [];
  let cursor = null;
  for (;;) {
    const url = new URL('https://api.render.com/v1/blueprints');
    if (cursor) url.searchParams.set('cursor', cursor);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Render GET blueprints failed: ${res.status} ${text.slice(0, 240)}`);
    }

    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;
    for (const item of page) if (item && item.blueprint) bps.push(item.blueprint);

    const lastCursor = page[page.length - 1]?.cursor;
    if (!lastCursor) break;
    cursor = lastCursor;
  }
  return bps;
}

/**
 * Sätt/uppdatera env-nycklar utan att tappa de övriga.
 *
 * Render PUT /env-vars ERSÄTTER hela listan. Varje anropare måste därför läsa
 * ALLA befintliga nycklar först och skicka tillbaka dem tillsammans med sina
 * egna. Det gick fel i praktiken 2026-08-31: sju apply-skript hämtade med
 * `?limit=100` utan cursor, och med 122 deklarerade nycklar i render.yaml
 * betyder det att en merge-PUT tyst raderade allt bortom den första sidan.
 *
 * Den här funktionen finns för att ingen ska skriva den koden en åttonde gång.
 * Använd den i stället för egen GET+PUT.
 *
 * Säkerhetsspärrar, medvetet stränga — ett fel här raderar produktionskonfig:
 *   - paginerad GET via fetchAllRenderEnvRows (fail-hard vid API-fel)
 *   - vägrar PUT:a en lista som är MINDRE än den vi läste
 *   - vägrar PUT:a en tom lista över huvud taget
 *
 * @param {string} serviceId
 * @param {Record<string,string>} updates  nycklar att sätta/ändra
 * @param {{ apiKey?: string, dryRun?: boolean }} [options]
 * @returns {Promise<{ before: number, after: number, changed: string[], dryRun: boolean }>}
 */
async function putRenderEnvMerged(serviceId, updates = {}, options = {}) {
  const apiKey = resolveRenderApiKey(options.apiKey);
  if (!apiKey) throw new Error('putRenderEnvMerged: saknar Render API-nyckel');
  if (!serviceId) throw new Error('putRenderEnvMerged: saknar serviceId');

  const entries = Object.entries(updates || {});
  if (entries.length === 0) throw new Error('putRenderEnvMerged: inga nycklar att sätta');

  const map = await fetchAllRenderEnvMap(serviceId, apiKey);
  const before = map.size;
  if (before === 0) {
    // En tom läsning är nästan alltid ett API-fel eller fel serviceId — inte en
    // tom miljö. PUT:ar vi på den skriver vi över allt med bara våra egna.
    throw new Error(
      `putRenderEnvMerged: GET gav noll nycklar för ${serviceId} — vägrar skriva över en miljö vi inte kunde läsa`
    );
  }

  const changed = [];
  for (const [key, value] of entries) {
    if (map.get(key) !== String(value)) changed.push(key);
    map.set(key, String(value));
  }

  const after = map.size;
  if (after < before) {
    throw new Error(
      `putRenderEnvMerged: skulle skicka ${after} nycklar men läste ${before} — avbryter hellre än raderar`
    );
  }

  if (options.dryRun) {
    return { before, after, changed, dryRun: true };
  }

  const res = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([...map.entries()].map(([key, value]) => ({ key, value }))),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Render PUT env-vars failed: ${res.status} ${text.slice(0, 240)}`);
  }

  return { before, after, changed, dryRun: false };
}

module.exports = {
  resolveRenderApiKey,
  envRowsToMap,
  fetchAllRenderEnvRows,
  fetchAllRenderEnvMap,
  fetchBlueprints,
  putRenderEnvMerged,
};
