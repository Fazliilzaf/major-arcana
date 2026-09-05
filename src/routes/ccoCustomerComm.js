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
  conversationStateStore = null,
  conversationNotesStore = null,
  portalMessageStore = null,
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
          portalMessageStore,
          sendActionStore,
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

  // ─── Fas 6: Communication feed (per kund) ────────────────────────────────
  // Samlar alla kommunikationshändelser för en kund i en kronologisk feed som
  // konsumeras av cco-komm-panel.js. Källor: mail-trådar, utkast, utskick,
  // portal-meddelanden och interna notiser.
  router.get(
    '/cco-customers/:id/communication-feed',
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
        const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 80));

        const events = [];

        // 1. Trådar (mail + drafts)
        if (threadStorePromise || mailboxTruthStore) {
          try {
            const store = await getThreadStore();
            const built = await store.buildThreadsForCustomer(customerId, { tenantId });
            for (const t of built.threads || []) {
              const isDraft = t.kind && t.kind.startsWith('comm_draft');
              events.push({
                ts: t.ts || null,
                kind: t.kind || 'incoming_mail',
                title: t.subject || (isDraft ? 'Utkast' : t.kind || 'Mail'),
                actor: t.from || null,
                status: t.threadStatus || null,
                detail: {
                  channel: t.channel || null,
                  journeyStep: t.journeyStep || null,
                  dryRun: !!t.systemMail,
                  recipientMasked: null,
                },
                threadId: t.threadId || null,
              });
            }
          } catch {
            /* ignore */
          }
        }

        // 2. Portal-meddelanden
        if (portalMessageStore?.listMessagesForCustomer) {
          try {
            const msgs = portalMessageStore.listMessagesForCustomer({ tenantId, customerId });
            for (const m of msgs || []) {
              events.push({
                ts: m.createdAt || null,
                kind: m.channel === 'sms' ? 'portal_sms_inbound' : 'portal_chat',
                title: m.direction === 'inbound' ? 'Patient (portal)' : 'Klinik (portal)',
                actor: m.author || (m.direction === 'inbound' ? 'patient' : 'klinik'),
                status: m.direction === 'inbound' && !m.readAt ? 'unread' : 'read',
                detail: {
                  body: m.body || '',
                  channel: m.channel || 'portal',
                  direction: m.direction,
                },
              });
            }
          } catch {
            /* ignore */
          }
        }

        // 3. Interna notiser (per kund — conversationKey = customerId)
        if (conversationNotesStore?.listNotes) {
          try {
            /**
             * ORD-222 — NYCKELFORMEN VAR FEL HÄR, och felet gjorde funktionen
             * halvt osynlig.
             *
             * Uppmätt 2026-09-05: den här filen skrev och läste under `customerId`
             * medan ccoConversationThreadStore.js:593 läser under
             * `'customer:' + customerId`. Två format, samma store. En notis
             * skriven från komm-panelen syntes alltså i kundflödet men ALDRIG i
             * trådvyn — och båda listorna såg korrekta ut var för sig, vilket är
             * varför det kunde stå så.
             *
             * Datafilens befintliga nycklar (`customer:anon-test-001`,
             * `customer:CUST-DEMO-002`) har prefixet. Trådvyn hade alltså rätt.
             * Prefixet är dessutom det som skiljer kundnotiser från
             * trådnotiser i /cco/runtime/conversation/:key/notes, där :key är
             * ett mailbox-conversationId.
             */
            const notes = conversationNotesStore.listNotes({
              tenantId,
              conversationKey: 'customer:' + customerId,
            });
            for (const n of notes || []) {
              events.push({
                ts: n.createdAt || null,
                kind: 'internal_note',
                title: 'Intern notis',
                actor: n.authorName || n.authorEmail || null,
                status: null,
                detail: { body: n.body || '', noteId: n.noteId || null },
              });
            }
          } catch {
            /* ignore */
          }
        }

        events.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));

        const total = events.length;
        const sends = events.filter((e) =>
          ['form_sent', 'consent_sent', 'file_sent', 'comm_sent'].includes(e.kind)
        ).length;
        const internalNotes = events.filter((e) => e.kind === 'internal_note').length;
        const lastContactTs = events[0]?.ts || null;

        return res.json({
          customerId,
          tenantId,
          events: events.slice(0, limit),
          counts: { total, sends, internal_notes: internalNotes },
          counters: { total, sends, internal_notes: internalNotes },
          lastContactTs,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa communication feed.' });
      }
    }
  );

  // ─── Fas 6: Intern notis per kund ─────────────────────────────────────────
  router.post(
    '/cco-customers/:id/internal-note',
    requireAuth,
    attachRole,
    requirePermission('customers.write'),
    express.json({ limit: '16kb' }),
    async (req, res) => {
      try {
        const customerId = normalizeText(req.params.id);
        if (!customerId) return res.status(400).json({ ok: false, error: 'customerId saknas.' });
        const body = normalizeText(req.body?.body);
        if (!body) return res.status(400).json({ ok: false, error: 'body saknas.' });
        if (!conversationNotesStore?.addNote) {
          return res.status(503).json({ ok: false, error: 'notes_store_unavailable' });
        }
        // ORD-222 — tenant och den kanoniska nyckelformen. Se läsvägen ovan för
        // varför prefixet måste vara med. Tenanten fanns redan i handen: raden
        // under skriver `tenantId: normalizeText(req.auth?.tenantId)` till
        // revisionsloggen. Den nådde bara aldrig storen.
        const noteTenantId =
          normalizeText(req.auth?.tenantId) || config?.defaultTenantId || 'hair-tp-clinic';
        const note = await conversationNotesStore.addNote({
          tenantId: noteTenantId,
          conversationKey: 'customer:' + customerId,
          body,
          authorEmail: normalizeText(req.auth?.email) || null,
          authorName: normalizeText(req.auth?.name) || normalizeText(req.auth?.userId) || null,
        });
        auditLog?.append?.({
          action: 'communication.internal_note.created',
          actor: { role: req.cco?.role || req.auth?.role, userId: req.auth?.userId || null },
          target: {
            kind: 'internal_note',
            id: note.noteId,
            tenantId: normalizeText(req.auth?.tenantId),
          },
          result: 'ok',
          detail: { customerId, bodyLength: body.length },
        });
        return res.status(201).json({ ok: true, note });
      } catch (error) {
        console.error(error);
        return res.status(error.statusCode || 400).json({ ok: false, error: error.message });
      }
    }
  );

  // ─── Fas 6: Thread actions (handled / snooze) ─────────────────────────────
  router.post(
    '/cco-conversation-threads/action',
    requireAuth,
    attachRole,
    requirePermission('customers.write'),
    express.json({ limit: '16kb' }),
    async (req, res) => {
      try {
        const customerId = normalizeText(req.body?.customerId);
        const threadId = normalizeText(req.body?.threadId);
        const action = normalizeText(req.body?.action).toLowerCase();
        const tenantId =
          normalizeText(req.body?.tenantId) ||
          normalizeText(req.auth?.tenantId) ||
          normalizeText(config?.defaultTenantId) ||
          'hair-tp-clinic';
        if (!customerId || !threadId) {
          return res.status(400).json({ ok: false, error: 'customerId och threadId krävs.' });
        }
        if (!['mark_handled', 'unmark_handled', 'snooze', 'unsnooze'].includes(action)) {
          return res.status(400).json({ ok: false, error: 'invalid action: ' + action });
        }
        const store = await getThreadStore();
        if (!store?.performAction) {
          return res.status(503).json({ ok: false, error: 'thread_store_unavailable' });
        }
        const result = store.performAction({
          customerId,
          threadId,
          action,
          tenantId,
          actor: normalizeText(req.auth?.userId) || normalizeText(req.cco?.role) || 'staff',
          snoozeUntilIso: normalizeText(req.body?.snoozeUntilIso) || null,
          reason: normalizeText(req.body?.reason) || '',
        });
        return res.json({ ok: true, state: result });
      } catch (error) {
        console.error(error);
        return res.status(error.statusCode || 400).json({ ok: false, error: error.message });
      }
    }
  );

  return router;
}

module.exports = {
  createCcoCustomerCommRouter,
};
