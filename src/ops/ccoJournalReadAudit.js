'use strict';

/**
 * ccoJournalReadAudit.js — P0.8 audit-wrapper för journal-läsningar.
 *
 * IMY-krav (PDL 2008:355 §6 + GDPR art 5.1f integritet): alla åtkomster
 * till patient-journal MÅSTE loggas — inte bara skrivningar.
 *
 * Användning:
 *   const { readJournalWithAudit, withReadAuditFactory } =
 *     require('./src/ops/ccoJournalReadAudit');
 *
 *   const entries = await readJournalWithAudit(
 *     { auditLog, actor, patientId, tenantId, endpoint: 'GET /entries' },
 *     async () => journalStore.listEntries({ tenantId, patientId })
 *   );
 *
 * Garantier:
 *   1. Audit-event 'journal.read' emittas INNAN callback körs (så event finns
 *      även om callback kastar).
 *   2. Andra audit-event emittas EFTER callback med result='ok'|'error' +
 *      duration_ms + (för ok) entriesCount.
 *   3. result från callback returneras oförändrat.
 *   4. Felaktigheter i audit-skrivningen får INTE blockera läsningen.
 *
 * Compliance:
 *   - Loggar actor (role/userId), target (patientId+tenantId), endpoint,
 *     traceId, ts. INGA fält-värden eller personnummer loggas — bara
 *     metadata om åtkomsten.
 */

const crypto = require('node:crypto');

function safeAppend(auditLog, event) {
  if (!auditLog || typeof auditLog.append !== 'function') return null;
  try {
    return auditLog.append(event);
  } catch {
    return null;
  }
}

/**
 * @param {object} ctx
 * @param {object} ctx.auditLog
 * @param {object} ctx.actor               { role, userId, ip? }
 * @param {string} ctx.patientId
 * @param {string} ctx.tenantId
 * @param {string} [ctx.endpoint]          e.g. 'GET /api/v1/cco-journal-quick/entries'
 * @param {string} [ctx.scope]             e.g. 'list_entries' / 'get_entry' / 'pdf_export'
 * @param {object} [ctx.extra]             extra detail-fields (no PII)
 * @param {function} fn                    async () => data
 * @returns {Promise<any>}                 returns whatever fn returns
 */
async function readJournalWithAudit(ctx = {}, fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('readJournalWithAudit: fn (callback) krävs');
  }
  const traceId = crypto.randomUUID();
  const startTs = Date.now();
  const baseEvent = {
    action: 'journal.read',
    actor: {
      role: ctx.actor?.role || 'unknown',
      userId: ctx.actor?.userId || null,
      ip: ctx.actor?.ip || null,
    },
    target: {
      kind: 'patient_journal',
      id: ctx.patientId || null,
      tenantId: ctx.tenantId || null,
    },
    traceId,
    detail: {
      scope: ctx.scope || 'unspecified',
      endpoint: ctx.endpoint || null,
      ...(ctx.extra || {}),
    },
  };

  // Emit BEFORE callback runs — even crashes get logged
  safeAppend(ctx.auditLog, { ...baseEvent, result: 'started' });

  try {
    const result = await fn();
    const duration = Date.now() - startTs;
    const countHint = (() => {
      if (Array.isArray(result)) return result.length;
      if (result && typeof result === 'object' && Array.isArray(result.entries)) {
        return result.entries.length;
      }
      if (result && typeof result === 'object' && Array.isArray(result.items)) {
        return result.items.length;
      }
      return result ? 1 : 0;
    })();
    safeAppend(ctx.auditLog, {
      ...baseEvent,
      result: 'ok',
      detail: { ...baseEvent.detail, duration_ms: duration, entriesCount: countHint },
    });
    return result;
  } catch (err) {
    const duration = Date.now() - startTs;
    safeAppend(ctx.auditLog, {
      ...baseEvent,
      result: 'error',
      detail: { ...baseEvent.detail, duration_ms: duration, error: err.message },
    });
    throw err;
  }
}

/**
 * Convenience-factory: ger en `withReadAudit(scope, fn)`-funktion bundlad
 * med ett auditLog + actor + endpoint så endpoints slipper passa det
 * varje gång:
 *
 *   const withRead = withReadAuditFactory({ auditLog, actor, tenantId,
 *     patientId, endpoint: req.originalUrl });
 *   const entries = await withRead('list_entries',
 *     () => journalStore.listEntries({ tenantId, patientId }));
 */
function withReadAuditFactory(baseCtx = {}) {
  return function withRead(scope, fn, extra = {}) {
    return readJournalWithAudit({ ...baseCtx, scope, extra }, fn);
  };
}

module.exports = {
  readJournalWithAudit,
  withReadAuditFactory,
};
