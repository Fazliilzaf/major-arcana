#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const { config } = require('../src/config');

const AUDIT_CHAIN_VERSION = 1;

function nowIso() {
  return new Date().toISOString();
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeJsonValue(value) {
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = normalizeJsonValue(item);
      return normalized === undefined ? null : normalized;
    });
  }
  if (typeof value === 'object') {
    const source = safeObject(value);
    const out = {};
    for (const key of Object.keys(source).sort()) {
      const normalized = normalizeJsonValue(source[key]);
      if (normalized !== undefined) out[key] = normalized;
    }
    return out;
  }
  if (['string', 'number', 'boolean'].includes(typeof value)) return value;
  return undefined;
}

function stableJson(value) {
  const normalized = normalizeJsonValue(value);
  if (normalized === undefined) return 'null';
  return JSON.stringify(normalized);
}

function toAuditEventPayload(event) {
  return {
    id: String(event?.id || ''),
    ts: String(event?.ts || ''),
    tenantId: event?.tenantId || null,
    actorUserId: event?.actorUserId || null,
    action: String(event?.action || 'unknown'),
    outcome: String(event?.outcome || 'unknown'),
    targetType: String(event?.targetType || ''),
    targetId: String(event?.targetId || ''),
    metadata: safeObject(event?.metadata),
  };
}

function computeAuditEventHash({ seq, prevHash = null, event }) {
  const payload = {
    v: AUDIT_CHAIN_VERSION,
    seq: Number(seq),
    prevHash: prevHash || null,
    event: toAuditEventPayload(event),
  };
  return crypto.createHash('sha256').update(stableJson(payload)).digest('hex');
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function getArgValue(name, fallback = '') {
  const index = process.argv.findIndex((arg) => arg === name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return typeof value === 'string' ? value : fallback;
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

function inspectAndRepair(events = []) {
  const repaired = [];
  const issues = [];
  let prevHash = null;

  for (let index = 0; index < events.length; index += 1) {
    const original = events[index];
    const seq = index + 1;
    const event = safeObject(original);
    const nextEvent = {
      ...event,
      seq,
      prevHash,
      chainVersion: AUDIT_CHAIN_VERSION,
    };
    nextEvent.hash = computeAuditEventHash({
      seq,
      prevHash,
      event: nextEvent,
    });

    const changed =
      Number(event.seq) !== seq ||
      (event.prevHash || null) !== (prevHash || null) ||
      event.chainVersion !== AUDIT_CHAIN_VERSION ||
      event.hash !== nextEvent.hash;

    if (changed) {
      issues.push({
        index,
        eventId: event.id || null,
      });
    }

    repaired.push(nextEvent);
    prevHash = nextEvent.hash;
  }

  return {
    repaired,
    issues,
  };
}

async function main() {
  const apply = hasFlag('--apply');
  const fileArg = getArgValue('--file', '').trim();
  const filePath = path.resolve(fileArg || config.authStorePath);
  const state = await readJson(filePath, null);

  if (!state || typeof state !== 'object') {
    throw new Error(`Kunde inte läsa auth-store: ${filePath}`);
  }

  const events = Array.isArray(state.auditEvents) ? state.auditEvents : [];
  const { repaired, issues } = inspectAndRepair(events);

  const report = {
    filePath,
    apply,
    totalEvents: events.length,
    changedEvents: issues.length,
    changed: issues.length > 0,
    generatedAt: nowIso(),
  };

  if (!apply) {
    console.log(JSON.stringify(report, null, 2));
    console.log('Dry run. Kör med --apply för att skriva reparationen.');
    return;
  }

  if (issues.length === 0) {
    console.log(JSON.stringify(report, null, 2));
    console.log('Ingen förändring behövdes.');
    return;
  }

  state.auditEvents = repaired;
  await writeJsonAtomic(filePath, state);

  console.log(JSON.stringify(report, null, 2));
  console.log(`Audit-reparation skriven till ${filePath}`);
}

main().catch((error) => {
  console.error('[audit-repair] fel:', error?.message || error);
  process.exitCode = 1;
});
