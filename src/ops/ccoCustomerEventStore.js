'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_EVENTS = 20_000;
const RETENTION_DAYS = 365;

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function readJsonl(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const events = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        events.push(JSON.parse(trimmed));
      } catch {
        /* skip corrupt line */
      }
    }
    return events;
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

function normalizeEvent(input = {}) {
  const kind = normalizeText(input.kind);
  const customerId = normalizeText(input.customerId);
  const ts = normalizeText(input.ts) || nowIso();
  if (!kind) return null;
  return {
    id: normalizeText(input.id) || crypto.randomUUID(),
    kind,
    ts,
    customerId: customerId || null,
    surface: normalizeText(input.surface) || null,
    offerId: normalizeText(input.offerId) || null,
    assetId: normalizeText(input.assetId) || null,
    linkId: normalizeText(input.linkId) || null,
    packageId: normalizeText(input.packageId) || null,
    docKind: normalizeText(input.docKind) || null,
    docStatus: normalizeText(input.docStatus) || null,
    metadata:
      input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
        ? input.metadata
        : {},
  };
}

function pruneEvents(events) {
  const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return asArray(events)
    .filter((event) => {
      const ts = Date.parse(normalizeText(event?.ts));
      return Number.isFinite(ts) && ts >= cutoffMs;
    })
    .slice(-MAX_EVENTS);
}

async function createCcoCustomerEventStore({ filePath } = {}) {
  const resolvedPath = normalizeText(filePath);
  if (!resolvedPath) {
    throw new Error('filePath krävs för ccoCustomerEventStore.');
  }
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  let events = pruneEvents(await readJsonl(resolvedPath));

  async function persistAll() {
    const payload = events.map((event) => JSON.stringify(event)).join('\n');
    const tmpPath = `${resolvedPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tmpPath, payload ? `${payload}\n` : '', 'utf8');
    await fs.rename(tmpPath, resolvedPath);
  }

  async function appendEvent(input = {}) {
    const normalized = normalizeEvent(input);
    if (!normalized) return null;
    events.push(normalized);
    events = pruneEvents(events);
    await fs.appendFile(resolvedPath, `${JSON.stringify(normalized)}\n`, 'utf8');
    return normalized;
  }

  function listStaffAttentionByCustomer({ sinceMs = 24 * 60 * 60 * 1000 } = {}) {
    const safeSinceMs = Math.max(60_000, Number(sinceMs) || 24 * 60 * 60 * 1000);
    const cutoff = Date.now() - safeSinceMs;
    const grouped = new Map();
    for (const event of events) {
      const customerId = normalizeText(event.customerId);
      if (!customerId) continue;
      const tsMs = Date.parse(normalizeText(event.ts));
      if (!Number.isFinite(tsMs) || tsMs < cutoff) continue;
      if (!grouped.has(customerId)) {
        grouped.set(customerId, {
          customerId,
          latestTs: event.ts,
          latestKind: event.kind,
          counts: {},
          events: [],
        });
      }
      const bucket = grouped.get(customerId);
      bucket.events.push(event);
      const kind = normalizeText(event.kind) || 'unknown';
      bucket.counts[kind] = (bucket.counts[kind] || 0) + 1;
      if (tsMs >= Date.parse(bucket.latestTs || 0)) {
        bucket.latestTs = event.ts;
        bucket.latestKind = kind;
      }
    }
    return Array.from(grouped.values()).sort(
      (a, b) => Date.parse(b.latestTs || 0) - Date.parse(a.latestTs || 0)
    );
  }

  async function rebuildFromMemory() {
    await persistAll();
  }

  return {
    appendEvent,
    listStaffAttentionByCustomer,
    rebuildFromMemory,
    _state: () => events.slice(),
  };
}

module.exports = {
  createCcoCustomerEventStore,
  normalizeEvent,
};
