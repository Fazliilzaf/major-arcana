'use strict';

const express = require('express');
const { attachRole, requirePermission } = require('../security/ccoRbac');
const { buildUnifiedTimeline } = require('../ops/ccoUnifiedTimelineBuilder');
const { createCcoCustomerJourneyStore } = require('../ops/ccoCustomerJourneyStore');
const { createCcoConversationThreadStore } = require('../ops/ccoConversationThreadStore');
const { createCcoConversationContextService } = require('../ops/ccoConversationContextService');
const ccoAiThreadSummary = require('../ops/ccoAiThreadSummary');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createCcoCustomerCommRouter({
  config,
  requireAuth,
  journalStore = null,
  mailboxTruthStore = null,
  mailIngestionStore = null,
  commDraftStore = null,
  sendActionStore = null,
  resolvePatientAssetStore = null,
  patientMasterStore = null, // ORD-96
  historyMailboxIds = [], // ORD-96: utan denna söks bara de 2 som råkar ligga i LRU:n
  auditLog = null,
  openai = null,
  openaiModel = '',
}) {
  const router = express.Router();
  let journeyStorePromise = null;
  let threadStorePromise = null;
  let contextServicePromise = null;
  const contextCache = new Map();
  const CACHE_TTL_MS = 30 * 1000;
  const MAX_CACHE_ENTRIES = 1000;

  function evictExpiredAndOldestIfNeeded() {
    const now = Date.now();
    for (const [key, entry] of contextCache) {
      if (entry.expiresAt < now) {
        contextCache.delete(key);
      }
    }
    while (contextCache.size > MAX_CACHE_ENTRIES) {
      const first = contextCache.keys().next().value;
      contextCache.delete(first);
    }
  }

  function getCachedContext(key) {
    const entry = contextCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      contextCache.delete(key);
      return null;
    }
    // LRU: move to end on access
    contextCache.delete(key);
    contextCache.set(key, entry);
    return entry.value;
  }

  function setCachedContext(key, value) {
    evictExpiredAndOldestIfNeeded();
    contextCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  function journeyStorePath() {
    return (
      config?.ccoCustomerJourneyStorePath ||
      `${config?.stateRoot || './data'}/cco-customer-journey.json`
    );
  }

  function threadStorePath() {
    return (
      config?.ccoConversationThreadStateStorePath ||
      config?.ccoConversationStateStorePath ||
      `${config?.stateRoot || './data'}/cco-conversation-thread-state.json`
    );
  }

  async function getJourneyStore() {
    if (!journeyStorePromise) {
      journeyStorePromise = createCcoCustomerJourneyStore({
        filePath: journeyStorePath(),
        auditLog,
      });
    }
    return journeyStorePromise;
  }

  async function getThreadStore() {
    if (!threadStorePromise) {
      threadStorePromise = createCcoConversationThreadStore({
        filePath: threadStorePath(),
        mailboxTruthStore,
        // ORD-96: trådvyn härleder kundens adresser ur patient-mastern
        patientMasterStore,
        // Utan denna blir searchMailboxes = listLoadedMailboxes(), alltså de
        // två som råkar ligga i LRU:n. Diagnostiken visade det som
        // `historyMailboxIds: 0, loadedMailboxes: 2` — åtta av tio brevlådor
        // söktes aldrig igenom.
        historyMailboxIds,
        mailIngestionStore,
        commDraftStore,
        sendActionsList: sendActionStore?.listSends
          ? (customerId) => sendActionStore.listSends({ customerId, limit: 100 })
          : null,
        auditLog,
      });
    }
    return threadStorePromise;
  }

  async function getContextService() {
    if (!contextServicePromise) {
      const threadStore = await getThreadStore();
      const aiSummaryResolver =
        mailboxTruthStore && openai
          ? (conversationKey, _tenantId) =>
              ccoAiThreadSummary.summarizeThread({
                mailboxTruthStore,
                openai,
                openaiModel,
                conversationKey,
                tenantId: _tenantId || config?.defaultTenantId || 'cco',
              })
          : null;
      contextServicePromise = createCcoConversationContextService({
        threadStore,
        slaMonitor: require('../intelligence/slaMonitor'),
        riskStackEngine: require('../intelligence/riskStackEngine'),
        customerTemperatureEngine: require('../intelligence/customerTemperatureEngine'),
        aiSummaryResolver,
        tenantConfig: config?.tenantConfig || null,
      });
    }
    return contextServicePromise;
  }

  function contextCacheKey(userId, tenantId, customerId, conversationKey, includeAiSummary) {
    return `${userId}:${tenantId}:${customerId}:${conversationKey || ''}:${Boolean(includeAiSummary)}`;
  }

  router.get(
    '/cco-customers/:id/conversation-threads',
    requireAuth,
    attachRole,
    requirePermission('customers.read'),
    async (req, res) => {
      try {
        const customerId = normalizeText(req.params.id);
        // Tenanten är `hair-tp-clinic` (bekräftat ur auth/me). Den hårdkodade
        // strängen `hairtpclinic` pekade på en TOM bucket — tenantBucket skapar
        // den på begäran, så inget kastade och getPatient svarade null.
        // Diagnostiken visade det som `customerEmails: null`.
        const tenantId =
          normalizeText(req.query.tenantId) ||
          normalizeText(req.auth?.tenantId) ||
          normalizeText(config?.defaultTenantId) ||
          'hair-tp-clinic';
        const filter = normalizeText(req.query.filter) || 'all';
        const store = await getThreadStore();
        const built = await store.buildThreadsForCustomer(customerId, { tenantId });
        const threads = store.filterThreads(built.threads || [], filter);
        return res.json({
          customerId,
          tenantId,
          filter,
          threads,
          counts: built.counts || {},
          summary: built.summary || {},
          mailboxes: built.mailboxes || [],
          // ORD-96-diagnostik: skiljer "ingen kundadress" från "inga
          // brevlådor lästa" från "inga träffar". Utan den gav svaret
          //  och tre lika rimliga förklaringar.
          diagnostics: built.diagnostics || null,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa konversationer.' });
      }
    }
  );

  router.get(
    '/cco-customers/:id/unified-timeline',
    requireAuth,
    attachRole,
    requirePermission('customers.read'),
    async (req, res) => {
      try {
        const customerId = normalizeText(req.params.id);
        // Tenanten är `hair-tp-clinic` (bekräftat ur auth/me). Den hårdkodade
        // strängen `hairtpclinic` pekade på en TOM bucket — tenantBucket skapar
        // den på begäran, så inget kastade och getPatient svarade null.
        // Diagnostiken visade det som `customerEmails: null`.
        const tenantId =
          normalizeText(req.query.tenantId) ||
          normalizeText(req.auth?.tenantId) ||
          normalizeText(config?.defaultTenantId) ||
          'hair-tp-clinic';
        const filter = normalizeText(req.query.filter) || 'all';
        const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 80));
        const journeyStore = await getJourneyStore();
        const threadStore = await getThreadStore();
        let assetStore = null;
        if (typeof resolvePatientAssetStore === 'function') {
          try {
            assetStore = await resolvePatientAssetStore();
          } catch {
            assetStore = null;
          }
        }
        const payload = await buildUnifiedTimeline({
          customerId,
          tenantId,
          filter,
          limit,
          journalStore,
          journeyStore,
          threadStore,
          assetStore,
        });
        return res.json(payload);
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa unified timeline.' });
      }
    }
  );

  router.get(
    '/cco-customers/:id/journey',
    requireAuth,
    attachRole,
    requirePermission('customers.read'),
    async (req, res) => {
      try {
        const customerId = normalizeText(req.params.id);
        // Tenanten är `hair-tp-clinic` (bekräftat ur auth/me). Den hårdkodade
        // strängen `hairtpclinic` pekade på en TOM bucket — tenantBucket skapar
        // den på begäran, så inget kastade och getPatient svarade null.
        // Diagnostiken visade det som `customerEmails: null`.
        const tenantId =
          normalizeText(req.query.tenantId) ||
          normalizeText(req.auth?.tenantId) ||
          normalizeText(config?.defaultTenantId) ||
          'hair-tp-clinic';
        const store = await getJourneyStore();
        const journey = store.getJourney(customerId, { tenantId });
        return res.json({ customerId, tenantId, journey });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa kundresa.' });
      }
    }
  );

  router.post(
    '/cco-customers/:id/journey/advance',
    requireAuth,
    attachRole,
    requirePermission('customers.write'),
    async (req, res) => {
      try {
        const customerId = normalizeText(req.params.id);
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const tenantId =
          normalizeText(body.tenantId || req.query.tenantId) ||
          normalizeText(req.auth?.tenantId) ||
          normalizeText(config?.defaultTenantId) ||
          'hair-tp-clinic';
        const targetStep = normalizeText(body.targetStep);
        const reason = normalizeText(body.reason);
        const triggerSource = normalizeText(body.triggerSource) || 'manual';
        if (!targetStep) {
          return res.status(400).json({ ok: false, error: 'targetStep saknas.' });
        }
        const store = await getJourneyStore();
        const journey = store.advanceTo({
          customerId,
          tenantId,
          targetStep,
          reason,
          triggerSource,
          actor: req.auth?.userId || 'staff',
        });
        return res.json({ ok: true, customerId, tenantId, journey });
      } catch (error) {
        const status = Number(error?.statusCode || 400);
        return res
          .status(status)
          .json({ ok: false, error: error.message || 'advance misslyckades.' });
      }
    }
  );

  router.post(
    '/cco-customers/:id/journey/rollback',
    requireAuth,
    attachRole,
    requirePermission('customers.write'),
    async (req, res) => {
      try {
        const customerId = normalizeText(req.params.id);
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const tenantId =
          normalizeText(body.tenantId || req.query.tenantId) ||
          normalizeText(req.auth?.tenantId) ||
          normalizeText(config?.defaultTenantId) ||
          'hair-tp-clinic';
        const reason = normalizeText(body.reason);
        const store = await getJourneyStore();
        const journey = store.rollback({
          customerId,
          tenantId,
          reason,
          actor: req.auth?.userId || 'staff',
        });
        return res.json({ ok: true, customerId, tenantId, journey });
      } catch (error) {
        const status = Number(error?.statusCode || 400);
        return res
          .status(status)
          .json({ ok: false, error: error.message || 'rollback misslyckades.' });
      }
    }
  );

  router.get(
    '/cco-customers/:id/conversation-context',
    requireAuth,
    attachRole,
    requirePermission('customers.read'),
    async (req, res) => {
      try {
        const customerId = normalizeText(req.params.id);
        const tenantId =
          normalizeText(req.query.tenantId) ||
          normalizeText(req.auth?.tenantId) ||
          normalizeText(config?.defaultTenantId) ||
          'hair-tp-clinic';
        const conversationKey = normalizeText(req.query.conversationKey);
        const includeAiSummary = String(req.query.includeAiSummary).toLowerCase() === 'true';
        const userId = normalizeText(req.auth?.userId) || 'anonymous';
        const cacheKey = contextCacheKey(
          userId,
          tenantId,
          customerId,
          conversationKey,
          includeAiSummary
        );
        const cached = getCachedContext(cacheKey);
        if (cached) {
          return res.json({ ok: true, context: cached });
        }
        const service = await getContextService();
        const context = await service.buildContextForCustomer(customerId, {
          tenantId,
          conversationKey,
          nowMs: Date.now(),
          includeAiSummary,
        });
        setCachedContext(cacheKey, context);
        return res.json({ ok: true, context });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ ok: false, error: 'Kunde inte läsa konversationskontext.' });
      }
    }
  );

  return router;
}

module.exports = {
  createCcoCustomerCommRouter,
};
