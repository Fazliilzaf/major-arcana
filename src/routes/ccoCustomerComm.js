'use strict';

const express = require('express');
const { attachRole, requirePermission } = require('../security/ccoRbac');
const { buildUnifiedTimeline } = require('../ops/ccoUnifiedTimelineBuilder');
const { createCcoCustomerJourneyStore } = require('../ops/ccoCustomerJourneyStore');
const { createCcoConversationThreadStore } = require('../ops/ccoConversationThreadStore');

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
  auditLog = null,
}) {
  const router = express.Router();
  let journeyStorePromise = null;
  let threadStorePromise = null;

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

  router.get(
    '/cco-customers/:id/conversation-threads',
    requireAuth,
    attachRole,
    requirePermission('customers.read'),
    async (req, res) => {
      try {
        const customerId = normalizeText(req.params.id);
        const tenantId = normalizeText(req.query.tenantId) || 'hairtpclinic';
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
        const tenantId = normalizeText(req.query.tenantId) || 'hairtpclinic';
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
        const tenantId = normalizeText(req.query.tenantId) || 'hairtpclinic';
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
        const tenantId = normalizeText(body.tenantId || req.query.tenantId) || 'hairtpclinic';
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
        const tenantId = normalizeText(body.tenantId || req.query.tenantId) || 'hairtpclinic';
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

  return router;
}

module.exports = {
  createCcoCustomerCommRouter,
};
