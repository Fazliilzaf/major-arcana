'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { execSync } = require('node:child_process');

const TENANT = 'hairtpclinic';
const DEFAULT_PILOTS = [
  { slot: 1, customerId: 'cco-pilot-20260602-a', label: 'Pilotkund A' },
  { slot: 2, customerId: 'cco-pilot-20260602-b', label: 'Pilotkund B' },
  { slot: 3, customerId: 'cco-readiness-smoke-1780402011', label: 'Pilotkund C' },
];

const JOURNAL_ROUTE_PROBES = [
  { name: 'journal-quick-entry', method: 'PUT', path: '/api/v1/cco-journal-quick/entry', body: {} },
  {
    name: 'journal-quick-sign',
    method: 'POST',
    path: '/api/v1/cco-journal-quick/entry/sign',
    body: {},
  },
  {
    name: 'journal-quick-correction',
    method: 'POST',
    path: '/api/v1/cco-journal-quick/entry/correction',
    body: {},
  },
  {
    name: 'journal-quick-entries',
    method: 'GET',
    path: `/api/v1/cco-journal-quick/entries?tenantId=${TENANT}`,
  },
  {
    name: 'journal-quick-stats',
    method: 'GET',
    path: `/api/v1/cco-journal-quick/stats?tenantId=${TENANT}`,
  },
];

function loadManifestPilots(repo) {
  const manifestPath = path.join(repo, 'public/cco-personal-demo-manifest.json');
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const pilots = manifest.pilotCustomers || [];
    if (pilots.length >= 3) {
      return pilots.map((p, i) => ({
        slot: p.slot || i + 1,
        customerId: p.customerId,
        label: p.redactedLabel || `Pilot ${p.slot || i + 1}`,
      }));
    }
  } catch {
    /* use defaults */
  }
  return DEFAULT_PILOTS;
}

function httpsRequest(base, method, urlPath, { headers = {}, body = null, timeout = 20000 } = {}) {
  return new Promise((resolve) => {
    const url = new URL(urlPath, base);
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      url,
      {
        method,
        headers: {
          Accept: 'application/json',
          'x-cco-tenant': TENANT,
          'x-cco-role': 'owner',
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
        timeout,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode || 0, json, rawLength: data.length });
        });
      }
    );
    req.on('error', (err) => resolve({ status: 0, json: null, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, json: null, error: 'timeout' });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function isJournalAuditAction(action) {
  const a = String(action || '').toLowerCase();
  return a.includes('journal');
}

function isLockedEditAttempt(item) {
  const action = String(item.action || '');
  const detail = JSON.stringify(item.detail || {});
  const err = String(item.detail?.error || item.detail?.message || '');
  return (
    /locked|låst|immutable|409/i.test(detail) ||
    /locked|låst|immutable/i.test(err) ||
    (action.includes('write') && item.result === 'error' && /locked|låst/i.test(detail))
  );
}

function countEntries24h(entries, sinceIso) {
  const since = Date.parse(sinceIso);
  let draftsCreated = 0;
  let signedLocked = 0;
  let corrections = 0;
  let activityTouches = 0;

  for (const e of entries || []) {
    const created = Date.parse(e.createdAt || '');
    const updated = Date.parse(e.updatedAt || e.createdAt || '');
    const inWindow = created >= since || updated >= since;
    if (!inWindow) continue;
    activityTouches += 1;
    if (e.correctionOfEntryId) corrections += 1;
    else if (e.status === 'signed' || e.locked) signedLocked += 1;
    else if (e.status === 'draft') draftsCreated += 1;
  }

  return { draftsCreated, signedLocked, corrections, activityTouches };
}

function summarizeAudit24h(items, sinceIso) {
  const since = Date.parse(sinceIso);
  let auditEventsCount = 0;
  let journalWrites = 0;
  let signedCount = 0;
  let correctionsCount = 0;
  let errorsCount = 0;
  let blockedLockedEditAttempts = 0;
  let lastSuccessTs = null;
  let lastFailTs = null;

  for (const item of items || []) {
    if (!isJournalAuditAction(item.action)) continue;
    const ts = Date.parse(item.ts || '');
    if (Number.isFinite(since) && ts < since) continue;
    auditEventsCount += 1;

    const action = String(item.action || '');
    const ok = item.result !== 'error';

    if (/\.write|journal\.write/i.test(action)) journalWrites += 1;
    if (/\.sign|journal\.sign/i.test(action)) signedCount += 1;
    if (/correction/i.test(action)) correctionsCount += 1;

    if (isLockedEditAttempt(item)) blockedLockedEditAttempts += 1;

    if (/\.write|\.sign|correction/i.test(action)) {
      if (ok) {
        if (!lastSuccessTs || ts > Date.parse(lastSuccessTs)) lastSuccessTs = item.ts;
      } else {
        errorsCount += 1;
        if (!lastFailTs || ts > Date.parse(lastFailTs)) lastFailTs = item.ts;
      }
    }
  }

  return {
    auditEventsCount,
    journalWrites,
    signedCount,
    correctionsCount,
    errorsCount,
    blockedLockedEditAttempts,
    lastSuccessfulJournalWriteAt: lastSuccessTs,
    lastFailedJournalWriteAt: lastFailTs,
  };
}

function routeVerdict(status, expected) {
  if (expected.includes(status)) return 'PASS';
  if (status >= 500) return 'FAIL';
  if (status === 404) return 'FAIL';
  return 'FAIL';
}

async function probeJournalRoutes(base, token) {
  const expected = [200, 400, 401, 403];
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const rows = [];

  for (const probe of JOURNAL_ROUTE_PROBES) {
    const r = await httpsRequest(base, probe.method, probe.path, {
      headers,
      body: probe.body,
    });
    const result = routeVerdict(r.status, expected);
    rows.push({
      name: probe.name,
      status: r.status,
      result,
      is5xx: r.status >= 500,
      is4xx: r.status >= 400 && r.status < 500,
    });
  }

  return rows;
}

async function probePilotHealth(base, token, pilots, sinceIso) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const rows = [];

  for (const pilot of pilots) {
    const id = pilot.customerId;
    const feed = await httpsRequest(
      base,
      'GET',
      `/api/v1/cco-customers/${id}/journal-feed?tenantId=${TENANT}`,
      { headers }
    );
    const timeline = await httpsRequest(
      base,
      'GET',
      `/api/v1/cco-customers/${id}/journal-timeline?tenantId=${TENANT}`,
      { headers }
    );
    const forms = await httpsRequest(
      base,
      'GET',
      `/api/v1/cco-forms/patient/${id}/missing?treatment=fue&tenantId=${TENANT}`,
      { headers }
    );

    let entries24h = null;
    if (token) {
      const ent = await httpsRequest(
        base,
        'GET',
        `/api/v1/cco-journal-quick/entries?tenantId=${TENANT}&patientId=${encodeURIComponent(id)}`,
        { headers }
      );
      if (ent.status === 200 && Array.isArray(ent.json?.entries)) {
        entries24h = countEntries24h(ent.json.entries, sinceIso);
      }
    }

    const feedOk = feed.status === 200;
    const timelineOk = timeline.status === 200;
    const formsOk = forms.status === 200;
    const overall =
      feedOk && timelineOk && formsOk && feed.status < 500 && timeline.status < 500
        ? 'PASS'
        : 'FAIL';

    rows.push({
      slot: pilot.slot,
      label: pilot.label,
      customerId: id,
      feed: feed.status,
      timeline: timeline.status,
      forms: forms.status,
      feedItems: feed.json?.items?.length ?? null,
      timelineEvents: timeline.json?.counters?.totalEvents ?? null,
      overall,
      entries24h,
    });
  }

  return rows;
}

function getOwnerToken(repo) {
  try {
    const out = execSync('node scripts/get-prod-auth-token.js --owner', {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out.trim().split('\n').pop() || null;
  } catch {
    return null;
  }
}

function verifyJournalMounts(repo) {
  try {
    execSync('node scripts/verify-journal-pilot-routes.js', {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return 'PASS';
  } catch {
    return 'FAIL';
  }
}

async function collectJournalPilotLiveMonitor(options = {}) {
  const repo = options.repo || path.join(__dirname, '..');
  const base =
    options.base || process.env.CCO_PERSONAL_DEMO_BASE || 'https://arcana.hairtpclinic.com';
  const sinceIso = options.sinceIso || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const generatedAt = new Date().toISOString();
  const pilots = options.pilots || loadManifestPilots(repo);
  const token = options.token ?? getOwnerToken(repo);
  const authAvailable = Boolean(token);

  const journalMounts = options.journalMounts || verifyJournalMounts(repo);
  const routeHealth = await probeJournalRoutes(base, token);
  const routeHealthPass = routeHealth.every((r) => r.result === 'PASS' && !r.is5xx);
  const route5xxCount = routeHealth.filter((r) => r.is5xx).length;
  const route4xxCount = routeHealth.filter((r) => r.is4xx).length;

  let stats = null;
  let auditSummary = {
    auditEventsCount: 0,
    journalWrites: 0,
    signedCount: 0,
    correctionsCount: 0,
    errorsCount: 0,
    blockedLockedEditAttempts: 0,
    lastSuccessfulJournalWriteAt: null,
    lastFailedJournalWriteAt: null,
    source: 'unavailable',
  };

  if (token) {
    const statsRes = await httpsRequest(
      base,
      'GET',
      `/api/v1/cco-journal-quick/stats?tenantId=${TENANT}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (statsRes.status === 200 && statsRes.json) {
      stats = {
        total: statsRes.json.total ?? 0,
        lockedCount: statsRes.json.lockedCount ?? 0,
        byStatus: statsRes.json.byStatus || {},
        byKind: statsRes.json.byKind || {},
      };
    }

    const auditRes = await httpsRequest(
      base,
      'GET',
      `/api/v1/cco-audit?limit=800&since=${encodeURIComponent(sinceIso)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (auditRes.status === 200 && Array.isArray(auditRes.json?.items)) {
      auditSummary = {
        ...summarizeAudit24h(auditRes.json.items, sinceIso),
        source: 'prod_audit_api',
      };
    }
  }

  const pilotsHealth = await probePilotHealth(base, token, pilots, sinceIso);

  const entries24hAggregate = {
    draftsCreated: 0,
    signedLocked: 0,
    corrections: 0,
    activityTouches: 0,
  };
  for (const p of pilotsHealth) {
    if (p.entries24h) {
      entries24hAggregate.draftsCreated += p.entries24h.draftsCreated;
      entries24hAggregate.signedLocked += p.entries24h.signedLocked;
      entries24hAggregate.corrections += p.entries24h.corrections;
      entries24hAggregate.activityTouches += p.entries24h.activityTouches;
    }
  }

  const journalWrites24h = Math.max(
    auditSummary.journalWrites,
    entries24hAggregate.activityTouches
  );
  const signedCount24h = Math.max(auditSummary.signedCount, entries24hAggregate.signedLocked);
  const correctionsCount24h = Math.max(
    auditSummary.correctionsCount,
    entries24hAggregate.corrections
  );

  const pilotsAllPass = pilotsHealth.every((p) => p.overall === 'PASS');
  const feedTimelineFormsHealth = pilotsAllPass ? 'PASS' : 'FAIL';

  const errors24h = auditSummary.errorsCount;
  const journalErrors24h = errors24h;

  const overall =
    journalMounts === 'PASS' &&
    routeHealthPass &&
    feedTimelineFormsHealth &&
    pilotsAllPass &&
    route5xxCount === 0
      ? 'PASS'
      : 'FAIL';

  const personalCanContinueJournaling =
    journalMounts === 'PASS' &&
    route5xxCount === 0 &&
    pilotsAllPass &&
    feedTimelineFormsHealth === 'PASS' &&
    journalErrors24h === 0
      ? 'JA'
      : 'NEJ';

  return {
    generatedAt,
    windowHours: 24,
    sinceIso,
    base,
    authAvailable,
    overall,
    personalCanContinueJournaling,
    journalMounts,
    routeHealth,
    routeHealthPass: routeHealthPass ? 'PASS' : 'FAIL',
    route5xxCount,
    route4xxCount,
    feedTimelineFormsHealth,
    stats,
    last24h: {
      journalEntriesActivity: journalWrites24h,
      draftsCreated: entries24hAggregate.draftsCreated,
      signedLocked: signedCount24h,
      corrections: correctionsCount24h,
      journalWrites: auditSummary.journalWrites,
      signedCount: signedCount24h,
      correctionsCount: correctionsCount24h,
      errorsCount: journalErrors24h,
      blockedLockedEditAttempts: auditSummary.blockedLockedEditAttempts,
      auditEventsCount: auditSummary.auditEventsCount,
      lastSuccessfulJournalWriteAt: auditSummary.lastSuccessfulJournalWriteAt,
      lastFailedJournalWriteAt: auditSummary.lastFailedJournalWriteAt,
    },
    pilots: pilotsHealth.map((p) => ({
      slot: p.slot,
      label: p.label,
      customerId: p.customerId,
      overall: p.overall,
      feed: p.feed,
      timeline: p.timeline,
      forms: p.forms,
      feedItems: p.feedItems,
      timelineEvents: p.timelineEvents,
      entries24h: p.entries24h,
    })),
    pilot1: pilotsHealth[0]?.overall || 'UNKNOWN',
    pilot2: pilotsHealth[1]?.overall || 'UNKNOWN',
    pilot3: pilotsHealth[2]?.overall || 'UNKNOWN',
    note: 'Read-only monitor — inga journaltexter · inga patientdata i export',
  };
}

function publishJournalPilotLiveMonitor(monitor, repo) {
  const publicPath = path.join(repo, 'public/cco-journal-pilot-live-monitor.json');
  const reportPath = path.join(repo, 'data/reports/cco-journal-pilot-live-monitor.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const json = JSON.stringify(monitor, null, 2);
  fs.writeFileSync(publicPath, json);
  fs.writeFileSync(reportPath, json);
  return { publicPath, reportPath };
}

module.exports = {
  collectJournalPilotLiveMonitor,
  publishJournalPilotLiveMonitor,
  loadManifestPilots,
};
