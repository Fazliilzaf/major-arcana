'use strict';

/**
 * ccoAuditLog.js — Append-only audit-event store för CCO.
 *
 * Compliance-krav: Sverige tillåter journallag 10 år retention.
 * Append-only på disk (JSONL) + in-memory cache av de senaste 5000.
 * Replikera externt till S3/Drive längre fram för redundans.
 *
 * Event-format:
 *   {
 *     ts: ISO-string,
 *     actor: { role, userId?, ip? },
 *     action: 'customers.merge' (matchar permission-namn),
 *     target: { kind, id, tenantId? },
 *     result: 'ok' | 'error',
 *     detail: { ... fritt },
 *     traceId: 'uuid'
 *   }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_CACHE_SIZE = 5000;
const MAX_ENTRY_SIZE = 8192; // 8 KB per entry

/**
 * P0.8 — Canonical action-vocabulary for the journal/photo modules.
 * Use these constants instead of free strings so we can grep for coverage.
 * Note: legacy variants (journal.entry.sign, journal.entry.write,
 * journal.entry.correction.create, journal.entry.unlock.HIGH_SEVERITY,
 * journal.pdf.export, journal.pdf_generated_at_signing) remain valid
 * for backward compatibility — they are aliases for the same compliance
 * event and queryable via /api/v1/cco-audit?action=journal.
 */
const ACTIONS = Object.freeze({
  // Journal lifecycle
  JOURNAL_READ: 'journal.read',
  JOURNAL_WRITE: 'journal.write',
  JOURNAL_SIGN: 'journal.sign',
  JOURNAL_LOCK: 'journal.lock',
  JOURNAL_UNLOCK: 'journal.unlock',
  JOURNAL_CORRECTION: 'journal.correction',
  JOURNAL_PDF_GENERATED: 'journal.pdf_generated',
  JOURNAL_PDF_GENERATED_AT_SIGNING: 'journal.pdf_generated_at_signing',
  JOURNAL_EXPORT: 'journal.export',

  // Photo lifecycle
  PHOTO_READ: 'photo.read',
  PHOTO_WRITE: 'photo.write',
  PHOTO_DELETE: 'photo.delete',

  // P0.B — Asset import pipeline (ccoPatientAssetStore +
  // ccoAssetImportRunStore + ccoAssetReviewQueueStore).
  // Per `.cursor/rules/cco-no-drive-links-import-only.mdc`. Inga
  // patientnamn/pnr/email i payload — bara IDs.
  ASSET_IMPORTED: 'asset.imported',
  ASSET_STATUS_CHANGED: 'asset.status_changed',
  ASSET_READ: 'asset.read',
  ASSET_REVIEW_ENQUEUED: 'asset.review_enqueued',
  ASSET_REVIEW_RESOLVED: 'asset.review_resolved',
  ASSET_IMPORT_RUN_STARTED: 'asset.import_run_started',
  ASSET_IMPORT_RUN_FINISHED: 'asset.import_run_finished',
  ASSET_LINKED_TO_PATIENT: 'asset.linked_to_patient',
  ASSET_LINKED_TO_ENCOUNTER: 'asset.linked_to_encounter',
  ASSET_CHECKSUM_VERIFIED: 'asset.checksum_verified',
  ASSET_LINK_ONLY_BLOCKER_FLAGGED: 'asset.link_only_blocker_flagged',
  // OWNER-SKÄRPNING #2 — explicita delete + reassign + visible-guard-fail
  ASSET_SOFT_DELETED: 'asset.soft_deleted',
  ASSET_HARD_DELETED: 'asset.hard_deleted',
  ASSET_REASSIGNED_TO_PATIENT: 'asset.reassigned_to_patient',
  ASSET_VISIBLE_GUARD_FAILED: 'asset.visible_guard_failed',
});

const HIGH_SEVERITY_ACTIONS = new Set([
  'journal.unlock',
  'journal.entry.unlock.HIGH_SEVERITY',
  'photo.delete',
  'customers.delete',
]);

function isHighSeverity(action) {
  return HIGH_SEVERITY_ACTIONS.has(action);
}

function createCcoAuditLog({ filePath, maxCacheSize = MAX_CACHE_SIZE } = {}) {
  if (!filePath) {
    throw new Error('filePath krävs för ccoAuditLog');
  }
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '');

  // In-memory ring-buffer för snabb GET
  let cache = [];

  function loadFromDisk() {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const lines = raw.split('\n').filter(Boolean);
      cache = lines.slice(-maxCacheSize).map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);
    } catch {
      cache = [];
    }
  }
  loadFromDisk();

  function append(event = {}) {
    const entry = {
      ts: event.ts || new Date().toISOString(),
      actor: {
        role: event.actor?.role || 'system',
        userId: event.actor?.userId || null,
        ip: event.actor?.ip || null,
      },
      action: String(event.action || 'unknown').slice(0, 80),
      target: event.target || null,
      result: event.result || 'ok',
      detail: event.detail || null,
      traceId: event.traceId || crypto.randomUUID(),
    };
    const line = JSON.stringify(entry);
    if (line.length > MAX_ENTRY_SIZE) {
      entry.detail = { _truncated: true, originalLength: line.length };
    }
    try {
      fs.appendFileSync(filePath, JSON.stringify(entry) + '\n');
      cache.push(entry);
      if (cache.length > maxCacheSize) cache = cache.slice(-maxCacheSize);
    } catch (err) {
      console.error('[cco-audit] write failed:', err.message);
    }
    return entry;
  }

  function query({ limit = 100, since = null, action = null, role = null, targetId = null } = {}) {
    let items = cache;
    if (since) {
      items = items.filter((e) => e.ts >= since);
    }
    if (action) {
      const a = String(action).toLowerCase();
      items = items.filter((e) => (e.action || '').toLowerCase().includes(a));
    }
    if (role) {
      items = items.filter((e) => e.actor?.role === role);
    }
    if (targetId) {
      items = items.filter((e) => e.target?.id === targetId);
    }
    return items.slice(-Math.max(1, Math.min(1000, limit))).reverse();
  }

  function stats() {
    const byAction = {};
    const byRole = {};
    cache.forEach((e) => {
      byAction[e.action] = (byAction[e.action] || 0) + 1;
      byRole[e.actor?.role || 'unknown'] = (byRole[e.actor?.role || 'unknown'] || 0) + 1;
    });
    return {
      total: cache.length,
      byAction,
      byRole,
      oldest: cache[0]?.ts,
      newest: cache[cache.length - 1]?.ts,
    };
  }

  return { append, query, stats, _reload: loadFromDisk };
}

/**
 * Express helper: skapa middleware som auto-loggar varje hit till en route.
 *   app.post('/cco-customers/merge', auditMiddleware(log, 'customers.merge'), handler)
 */
function auditMiddleware(log, action) {
  return function ccoAudit(req, res, next) {
    const traceId = crypto.randomUUID();
    req.auditTraceId = traceId;
    res.on('finish', () => {
      log.append({
        action,
        actor: {
          role: req.cco?.role || req.auth?.role || 'unknown',
          userId: req.auth?.userId || null,
          ip: (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim(),
        },
        target: {
          kind: req.params?.id ? 'entity' : 'collection',
          id: req.params?.id || null,
          tenantId: req.auth?.tenantId || null,
        },
        result: res.statusCode < 400 ? 'ok' : 'error',
        detail: {
          method: req.method,
          path: req.path,
          status: res.statusCode,
        },
        traceId,
      });
    });
    next();
  };
}

module.exports = {
  createCcoAuditLog,
  auditMiddleware,
  ACTIONS,
  HIGH_SEVERITY_ACTIONS,
  isHighSeverity,
};
