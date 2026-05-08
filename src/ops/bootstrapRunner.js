'use strict';

/**
 * bootstrapRunner (DI9) — auto-kör Graph mailbox-backfill + intelligence
 * enrichment + cross-mailbox consolidate vid server-start, så data finns
 * tillgänglig direkt även på Render free-tier (ephemeral disk).
 *
 * Aktiveras med env-var ARCANA_BOOTSTRAP_MAILBOX_BACKFILL=true.
 *
 * Fire-and-forget: returnerar genast så server.listen inte blockas.
 * Stadier rapporteras via getBootstrapStatus() som kan exponeras via
 * /api/v1/ops/bootstrap/status.
 *
 * Config via env:
 *   - ARCANA_BOOTSTRAP_MAILBOX_BACKFILL=true     — aktivera
 *   - ARCANA_BOOTSTRAP_MAILBOX_LOOKBACK_DAYS=90  — hur långt bakåt
 *   - ARCANA_BOOTSTRAP_PREFERRED_MAILBOX=contact@hairtpclinic.com
 *   - ARCANA_BOOTSTRAP_TENANT_ID=hair-tp-clinic  — fallback om tenant
 *     inte kan utläsas. Använder ARCANA_DEFAULT_TENANT om ej satt.
 *   - ARCANA_BOOTSTRAP_DELAY_MS=5000             — vänta innan körning
 *     så CSV-/scheduler/etc hinner upp.
 */

const { runEnrichment } = require('./messageEnrichmentRunner');
const { findCrossMailboxCustomers } = require('./crossMailboxAggregator');

const STATUS = {
  pending: 'pending',
  running: 'running',
  completed: 'completed',
  failed: 'failed',
  skipped: 'skipped',
};

const internal = {
  status: STATUS.pending,
  enabled: false,
  startedAt: null,
  finishedAt: null,
  durationMs: 0,
  stages: [],
  result: null,
  error: null,
};

function nowIso() {
  return new Date().toISOString();
}

function pushStage(name, payload = {}) {
  internal.stages.push({
    name,
    at: nowIso(),
    ...payload,
  });
}

function getBootstrapStatus() {
  return JSON.parse(JSON.stringify(internal));
}

function isEnabled() {
  return String(process.env.ARCANA_BOOTSTRAP_MAILBOX_BACKFILL || '').toLowerCase() === 'true';
}

function resolveMailboxIds(customMailboxes) {
  if (Array.isArray(customMailboxes) && customMailboxes.length > 0) {
    return customMailboxes
      .map((m) => String(m || '').trim().toLowerCase())
      .filter(Boolean);
  }
  // Fall tillbaka på CCO_GRAPH_READ_DEFAULT_ALLOWLIST (lista i kod) eller env
  const envList = String(process.env.ARCANA_GRAPH_READ_ALLOWLIST || '')
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (envList.length > 0) return envList;
  // Sista fallback — Hair TP-mailboxarna
  return [
    'contact@hairtpclinic.com',
    'info@hairtpclinic.com',
    'kons@hairtpclinic.com',
    'egzona@hairtpclinic.com',
    'fazli@hairtpclinic.com',
    'marknad@hairtpclinic.com',
  ];
}

async function runGraphBackfill({
  graphReadConnector,
  ccoMailboxTruthStore,
  mailboxIds,
  lookbackDays,
  logger,
}) {
  // Lazy-load för att undvika circular deps
  const {
    createMicrosoftGraphMailboxTruthBackfill,
  } = require('../infra/microsoftGraphMailboxTruthBackfill');
  const backfill = createMicrosoftGraphMailboxTruthBackfill({
    connectorFactory: () => graphReadConnector,
    store: ccoMailboxTruthStore,
  });
  const result = await backfill.runBackfill({
    mailboxIds,
    folderTypes: ['inbox', 'sent', 'drafts', 'deleted'],
    resume: true,
    maxLookbackDays: lookbackDays,
  });
  const folderReports = (result?.perMailbox || []).flatMap((mb) =>
    (mb?.folderReports || []).map((fr) => ({
      mailbox: mb.mailboxId,
      folder: fr.folderType,
      pages: fr.pagesFetched,
      messages: fr.messageCount || fr.messagesPersisted,
      status: fr.status,
    }))
  );
  return {
    folderCount: folderReports.length,
    folderReports: folderReports.slice(0, 30), // begränsa output
    runId: result?.runId,
  };
}

/**
 * runBootstrap — ej awaitad i normalfallet. Stoppar inte om en del
 * misslyckas; loggar bara och går vidare till nästa.
 */
async function runBootstrap({
  tenantId,
  graphReadConnector,
  ccoMailboxTruthStore,
  messageIntelligenceStore,
  customerPreferenceStore,
  mailboxIds: providedMailboxIds = [],
  lookbackDays = null,
  preferredMailbox = null,
  logger = null,
} = {}) {
  if (!isEnabled()) {
    internal.status = STATUS.skipped;
    internal.enabled = false;
    pushStage('skipped', { reason: 'ARCANA_BOOTSTRAP_MAILBOX_BACKFILL ej satt till true' });
    return getBootstrapStatus();
  }

  internal.enabled = true;
  internal.status = STATUS.running;
  internal.startedAt = nowIso();
  internal.stages = [];
  internal.error = null;

  const mailboxIds = resolveMailboxIds(providedMailboxIds);
  const safeLookback = Number.isFinite(Number(lookbackDays))
    ? Number(lookbackDays)
    : Number(process.env.ARCANA_BOOTSTRAP_MAILBOX_LOOKBACK_DAYS) || 90;
  const safePreferred = String(
    preferredMailbox ||
      process.env.ARCANA_BOOTSTRAP_PREFERRED_MAILBOX ||
      'contact@hairtpclinic.com'
  ).toLowerCase();
  const safeTenantId =
    String(tenantId || '').trim() ||
    String(process.env.ARCANA_BOOTSTRAP_TENANT_ID || '').trim() ||
    String(process.env.ARCANA_DEFAULT_TENANT || '').trim() ||
    'hair-tp-clinic';

  const log = (level, msg, extra = {}) => {
    const line = '[bootstrap] ' + msg;
    try {
      if (logger && typeof logger[level] === 'function') {
        logger[level](line, extra);
      } else {
        console.log(line, JSON.stringify(extra));
      }
    } catch (_e) {
      // ignore logger errors
    }
  };

  pushStage('start', { mailboxIds, tenantId: safeTenantId, preferredMailbox: safePreferred });
  log('info', 'startar bootstrap', { mailboxIds, tenantId: safeTenantId });

  const startedAtMs = Date.now();
  const result = {
    tenantId: safeTenantId,
    mailboxIds,
    graphBackfill: null,
    intelligence: null,
    consolidate: null,
  };

  // Stage 1 — Graph backfill (krävs först, annars är truth-store tom)
  if (graphReadConnector && ccoMailboxTruthStore) {
    pushStage('graph_backfill_start');
    try {
      const r = await runGraphBackfill({
        graphReadConnector,
        ccoMailboxTruthStore,
        mailboxIds,
        lookbackDays: safeLookback,
        logger,
      });
      result.graphBackfill = r;
      pushStage('graph_backfill_done', {
        folderCount: r.folderCount,
        runId: r.runId,
      });
      log('info', 'graph-backfill klar', { folderCount: r.folderCount });
    } catch (err) {
      pushStage('graph_backfill_failed', { error: String(err?.message || err) });
      log('warn', 'graph-backfill misslyckades', { error: String(err) });
      result.graphBackfill = { error: String(err?.message || err) };
    }
  } else {
    pushStage('graph_backfill_skipped', { reason: 'connector eller truth-store saknas' });
    log('warn', 'graph-backfill hoppas över', {
      hasConnector: !!graphReadConnector,
      hasStore: !!ccoMailboxTruthStore,
    });
  }

  // Stage 2 — Intelligence enrichment
  if (ccoMailboxTruthStore && messageIntelligenceStore) {
    pushStage('intelligence_start');
    try {
      const r = await runEnrichment({
        tenantId: safeTenantId,
        mailboxIds,
        ccoMailboxTruthStore,
        messageIntelligenceStore,
        mode: 'backfill',
      });
      result.intelligence = {
        examined: r.examined,
        enriched: r.enriched,
        skipped: r.skipped,
        failed: r.failed,
        durationMs: r.durationMs,
      };
      pushStage('intelligence_done', result.intelligence);
      log('info', 'intelligence klart', result.intelligence);
    } catch (err) {
      pushStage('intelligence_failed', { error: String(err?.message || err) });
      log('warn', 'intelligence misslyckades', { error: String(err) });
      result.intelligence = { error: String(err?.message || err) };
    }
  }

  // Stage 3 — Cross-mailbox consolidate
  if (ccoMailboxTruthStore && customerPreferenceStore) {
    pushStage('consolidate_start');
    try {
      const messages = ccoMailboxTruthStore.listMessages({}) || [];
      const candidates = findCrossMailboxCustomers(messages, {
        preferredMailboxId: safePreferred,
      });
      let updated = 0;
      for (const c of candidates) {
        await customerPreferenceStore.setPreferredMailbox({
          tenantId: safeTenantId,
          customerEmail: c.customerEmail,
          preferredMailboxId: safePreferred,
          reason: c.wroteToPreferred
            ? 'consolidated_existing_preferred'
            : 'consolidated_new_preferred',
        });
        updated += 1;
      }
      if (typeof customerPreferenceStore.flush === 'function') {
        await customerPreferenceStore.flush();
      }
      result.consolidate = {
        candidatesFound: candidates.length,
        updated,
        preferredMailboxId: safePreferred,
      };
      pushStage('consolidate_done', result.consolidate);
      log('info', 'consolidate klart', result.consolidate);
    } catch (err) {
      pushStage('consolidate_failed', { error: String(err?.message || err) });
      log('warn', 'consolidate misslyckades', { error: String(err) });
      result.consolidate = { error: String(err?.message || err) };
    }
  }

  internal.finishedAt = nowIso();
  internal.durationMs = Date.now() - startedAtMs;
  internal.result = result;
  internal.status = STATUS.completed;
  pushStage('done', { durationMs: internal.durationMs });
  log('info', 'bootstrap färdig', { durationMs: internal.durationMs });

  return getBootstrapStatus();
}

/**
 * scheduleBootstrap — fire-and-forget. Använd från server.js efter
 * runtimeState.ready = true så Render-health-check svarar OK direkt.
 */
function scheduleBootstrap(opts = {}) {
  if (!isEnabled()) {
    internal.status = STATUS.skipped;
    internal.enabled = false;
    pushStage('skipped', { reason: 'ARCANA_BOOTSTRAP_MAILBOX_BACKFILL ej satt till true' });
    return;
  }
  const delayMs = Number(process.env.ARCANA_BOOTSTRAP_DELAY_MS) || 5000;
  setTimeout(() => {
    runBootstrap(opts).catch((err) => {
      internal.status = STATUS.failed;
      internal.error = String(err?.message || err);
      internal.finishedAt = nowIso();
      try {
        console.error('[bootstrap] failed', err);
      } catch (_e) {}
    });
  }, delayMs);
}

module.exports = {
  runBootstrap,
  runGraphBackfill,
  scheduleBootstrap,
  getBootstrapStatus,
  isEnabled,
  STATUS,
};
