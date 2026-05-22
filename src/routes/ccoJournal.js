const express = require('express');
const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const {
  resolveCcoRouteActor,
  buildCcoRouteContext,
  serializePatient360,
  buildPatient360SyncContext,
} = require('./ccoRouteShared');
const { syncPatient360FromJournalCase } = require('../ops/ccoPatient360Bridge');
const { JOURNAL_TYPES } = require('../ops/ccoJournalStore');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createCcoJournalRouter({
  journalStore,
  patientMasterStore = null,
  patientSystemStore = null,
  authStore,
  config,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  async function handle(req, res, run) {
    try {
      const actor = await resolveCcoRouteActor(req, { authStore, config });
      return await run(actor);
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res.status(statusCode).json({ error: error.message, metadata: error.metadata || null });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte hantera journalmodulen.' });
    }
  }

  async function auditJournal(actor, action, targetId) {
    await authStore.addAuditEvent({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action,
      outcome: 'success',
      targetType: 'cco_journal',
      targetId: targetId || actor.tenantId,
    });
  }

  router.get(
    '/cco-journal/entries',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const patientId = normalizeText(req.query.patientId);
        if (!patientId) {
          return res.status(400).json({ error: 'patientId saknas.' });
        }
        const entries = await journalStore.listEntries({
          tenantId: actor.tenantId,
          patientId,
          journalType: normalizeText(req.query.journalType),
        });
        await auditJournal(actor, 'cco.journal.entries.read', patientId);
        return res.json({
          entries: entries.map((entry) => journalStore.buildJournalReadout(entry)),
          journalTypes: JOURNAL_TYPES,
        });
      })
  );

  router.get(
    '/cco-journal/entry',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const patientId = normalizeText(req.query.patientId);
        const entryId = normalizeText(req.query.entryId);
        if (!patientId || !entryId) {
          return res.status(400).json({ error: 'patientId och entryId krävs.' });
        }
        const entry = await journalStore.getEntry({
          tenantId: actor.tenantId,
          patientId,
          entryId,
        });
        if (!entry) return res.status(404).json({ error: 'Journalposten hittades inte.' });
        await auditJournal(actor, 'cco.journal.entry.read', entryId);
        return res.json({ entry, readout: journalStore.buildJournalReadout(entry) });
      })
  );

  router.put(
    '/cco-journal/entry',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const patientId = normalizeText(body.patientId);
        if (!patientId) return res.status(400).json({ error: 'patientId saknas.' });
        const entry = await journalStore.upsertEntry(
          {
            ...body,
            tenantId: actor.tenantId,
            patientId,
          },
          {
            actor: {
              userId: actor.userId,
              role: actor.role,
              displayName: actor.userId,
            },
          }
        );
        const patientRecord = patientSystemStore
          ? await syncPatient360FromJournalCase({
              patientSystemStore,
              context: buildPatient360SyncContext({
                tenantId: actor.tenantId,
                customerId: patientId,
              }),
              journalEntry: entry,
            })
          : null;
        await auditJournal(actor, 'cco.journal.entry.write', entry.entryId);
        return res.json({
          entry,
          readout: journalStore.buildJournalReadout(entry),
          patient360: serializePatient360(patientRecord),
        });
      })
  );

  router.post(
    '/cco-journal/entry/sign',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const patientId = normalizeText(body.patientId);
        const entryId = normalizeText(body.entryId);
        if (!patientId || !entryId) {
          return res.status(400).json({ error: 'patientId och entryId krävs.' });
        }
        const entry = await journalStore.signEntry({
          tenantId: actor.tenantId,
          patientId,
          entryId,
          actor: {
            userId: actor.userId,
            role: actor.role,
            displayName: actor.userId,
          },
        });
        await auditJournal(actor, 'cco.journal.entry.sign', entryId);
        return res.json({ entry, readout: journalStore.buildJournalReadout(entry) });
      })
  );

  router.post(
    '/cco-journal/import-historical',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const patientId = normalizeText(body.patientId);
        const files = Array.isArray(body.files) ? body.files : [];
        if (!patientId) return res.status(400).json({ error: 'patientId saknas.' });
        let personnummer = normalizeText(body.personnummer);
        if (!personnummer && patientMasterStore) {
          const patient = await patientMasterStore.getPatient({
            tenantId: actor.tenantId,
            patientId,
          });
          personnummer = patient?.personnummer || '';
        }
        const result = await journalStore.importHistoricalEntries({
          tenantId: actor.tenantId,
          patientId,
          personnummer,
          files,
          actor: {
            userId: actor.userId,
            role: actor.role,
            displayName: actor.userId,
          },
        });
        await auditJournal(actor, 'cco.journal.import_historical', patientId);
        return res.json(result);
      })
  );

  return router;
}

module.exports = {
  createCcoJournalRouter,
};
