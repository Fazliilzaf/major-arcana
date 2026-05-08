'use strict';

/**
 * messageEnrichmentRunner (DI4) — kör enrichment över alla messages i
 * mailboxTruthStore för en tenant. Idempotent — hoppar över messages som
 * redan har up-to-date enrichment (samma engineVersion).
 *
 * Två lägen:
 *   - 'backfill' — kör på allt (default mode)
 *   - 'delta'    — kör bara på messages som saknar enrichment eller har
 *                  äldre engineVersion
 *
 * Performance: yieldar tillbaka till event-loopen var 50:e message så vi
 * inte blockerar requests.
 */

const { enrichMessage, ENGINE_VERSION } = require('../intelligence/messageEnrichment');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function shouldEnrich(existing, mode) {
  if (mode === 'force') return true;
  if (!existing) return true;
  if (existing.engineVersion !== ENGINE_VERSION) return true;
  if (mode === 'delta') return false;
  return false; // backfill men redan up-to-date → skip
}

async function runEnrichment({
  tenantId,
  mailboxIds = [],
  ccoMailboxTruthStore,
  messageIntelligenceStore,
  mode = 'backfill', // 'backfill' | 'delta' | 'force'
  yieldEvery = 50,
  logger = null,
} = {}) {
  const safeTenantId = normalizeText(tenantId);
  if (!safeTenantId) throw new Error('runEnrichment kräver tenantId.');
  if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.listMessages !== 'function') {
    throw new Error('runEnrichment kräver ccoMailboxTruthStore med listMessages.');
  }
  if (
    !messageIntelligenceStore ||
    typeof messageIntelligenceStore.upsertEnrichment !== 'function'
  ) {
    throw new Error('runEnrichment kräver messageIntelligenceStore.');
  }

  const startedAt = Date.now();
  const result = {
    tenantId: safeTenantId,
    mode,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: null,
    durationMs: 0,
    examined: 0,
    skipped: 0,
    enriched: 0,
    failed: 0,
    sampleErrors: [],
    perMailbox: {},
  };

  const messages = ccoMailboxTruthStore.listMessages({
    mailboxIds: Array.isArray(mailboxIds) ? mailboxIds : [],
  });

  for (let i = 0; i < messages.length; i += 1) {
    const msg = asObject(messages[i]);
    const mailboxId = normalizeText(msg.mailboxId);
    const graphMessageId = normalizeText(msg.graphMessageId);
    if (!mailboxId || !graphMessageId) {
      result.skipped += 1;
      continue;
    }
    result.examined += 1;
    if (!result.perMailbox[mailboxId]) {
      result.perMailbox[mailboxId] = { examined: 0, skipped: 0, enriched: 0, failed: 0 };
    }
    result.perMailbox[mailboxId].examined += 1;

    const existing = messageIntelligenceStore.getEnrichment({
      tenantId: safeTenantId,
      mailboxId,
      graphMessageId,
    });

    if (!shouldEnrich(existing, mode)) {
      result.skipped += 1;
      result.perMailbox[mailboxId].skipped += 1;
      continue;
    }

    try {
      const enrichment = enrichMessage(msg, {
        // Optional context — kan utökas i framtiden med customer/SLA-data
        slaStatus: msg.slaStatus || 'within',
        isVip: Boolean(msg.isVip),
      });
      await messageIntelligenceStore.upsertEnrichment({
        tenantId: safeTenantId,
        mailboxId,
        graphMessageId,
        enrichment,
        source: mode === 'delta' ? 'delta' : 'backfill',
      });
      result.enriched += 1;
      result.perMailbox[mailboxId].enriched += 1;
    } catch (err) {
      result.failed += 1;
      result.perMailbox[mailboxId].failed += 1;
      if (result.sampleErrors.length < 5) {
        result.sampleErrors.push({
          mailboxId,
          graphMessageId,
          error: String(err?.message || err).slice(0, 200),
        });
      }
      if (logger) {
        try {
          logger.warn('[messageEnrichmentRunner] enrich failed', {
            mailboxId,
            graphMessageId,
            error: err?.message,
          });
        } catch (_e) {}
      }
    }

    // Yield till event-loopen periodiskt så vi inte blockar requests
    if ((i + 1) % yieldEvery === 0) {
      await new Promise((r) => setImmediate(r));
    }
  }

  // Flush pending writes
  if (typeof messageIntelligenceStore.flush === 'function') {
    try {
      await messageIntelligenceStore.flush();
    } catch (_e) {}
  }
  if (typeof messageIntelligenceStore.recordRun === 'function') {
    try {
      await messageIntelligenceStore.recordRun({
        tenantId: safeTenantId,
        runType: mode === 'delta' ? 'delta' : 'backfill',
        processed: result.enriched,
      });
    } catch (_e) {}
  }

  result.finishedAt = new Date().toISOString();
  result.durationMs = Date.now() - startedAt;
  return result;
}

module.exports = {
  runEnrichment,
};
