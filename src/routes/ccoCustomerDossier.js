'use strict';

/**
 * ccoCustomerDossier (router) — RBAC-grindad läs-endpoint som ger Svarstudion
 * "all info om kunden" samlat. Ren läsning bakom mail.read (samma behörighet som
 * övriga Svarstudio/konversations-endpoints). Aggregeringen sker i
 * src/ops/ccoCustomerDossier.js; storarna hämtas från app.locals vid anrop
 * (samma mönster som övriga CCO-runtime-rutter) så ingen ny server-wiring krävs.
 *
 * Journalinnehåll ingår ALDRIG i svaret (aggregeraren tar bara antal + datum).
 */

const express = require('express');
const { attachRole, requirePermission } = require('../security/ccoRbac');
const { buildCustomerDossier } = require('../ops/ccoCustomerDossier');
const { createCcoCustomerJourneyStore } = require('../ops/ccoCustomerJourneyStore');
const { createCcoConversationThreadStore } = require('../ops/ccoConversationThreadStore');

const CCO_CUSTOMER_HISTORY_DEFAULT_MAILBOX_IDS = Object.freeze([
  'kons@hairtpclinic.com',
  'info@hairtpclinic.com',
  'contact@hairtpclinic.com',
  'egzona@hairtpclinic.com',
  'fazli@hairtpclinic.com',
]);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function emailText(value) {
  const v = text(value).toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : '';
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function tenantCandidates(tenantId = '') {
  return unique([text(tenantId), 'hairtpclinic', 'hair-tp-clinic', 'hair_tp', 'cco']);
}

function resolveTenantId(req, config = {}) {
  return (
    text(req.query?.tenantId) ||
    text(req.auth?.tenantId) ||
    text(config.defaultTenantId) ||
    'hairtpclinic'
  );
}

function createPatientMasterAdapter(patientMasterStore = null) {
  if (!patientMasterStore) return null;
  return {
    async getPatient({ tenantId, patientId, customerId, email } = {}) {
      const ids = unique(
        [patientId, customerId]
          .map((item) => text(item))
          .filter((item) => item && !emailText(item))
      );
      const emails = unique([email, patientId, customerId].map((item) => emailText(item)));
      for (const candidateTenantId of tenantCandidates(tenantId)) {
        if (typeof patientMasterStore.getPatient === 'function') {
          for (const id of ids) {
            const found = await patientMasterStore.getPatient({
              tenantId: candidateTenantId,
              patientId: id,
            });
            if (found) return found;
          }
        }
        if (typeof patientMasterStore.findPatientByEmail === 'function') {
          for (const customerEmail of emails) {
            const found = await patientMasterStore.findPatientByEmail({
              tenantId: candidateTenantId,
              email: customerEmail,
            });
            if (found) return found;
          }
        }
      }
      return null;
    },
  };
}

function createCaseStoreAdapter(caseStore = null, bookingStore = null) {
  if (!caseStore && !bookingStore) return null;
  return {
    async listCasesForCustomer({ tenantId, customerId, patientId, email } = {}) {
      if (caseStore && typeof caseStore.listCasesForCustomer === 'function') {
        return caseStore.listCasesForCustomer({ tenantId, customerId, patientId, email });
      }
      const listCasesStore =
        caseStore && typeof caseStore.listCases === 'function'
          ? caseStore
          : bookingStore && typeof bookingStore.listCases === 'function'
            ? bookingStore
            : null;
      if (!listCasesStore) return [];
      return listCasesStore.listCases({
        tenantId,
        customerEmail: emailText(email) || emailText(customerId) || customerId || patientId,
        limit: 8,
      });
    },
  };
}

async function auditDossierRead(authStore, req, dossier = {}) {
  if (!authStore || typeof authStore.addAuditEvent !== 'function') return;
  try {
    await authStore.addAuditEvent({
      tenantId: text(req.auth?.tenantId) || dossier.tenantId || null,
      actorUserId: text(req.auth?.userId) || null,
      action: 'cco.customer_dossier.read',
      outcome: 'success',
      targetType: 'cco_customer_dossier',
      targetId: dossier.customerId || dossier.patientId || null,
      metadata: {
        emailCount: Array.isArray(dossier.contact?.emails) ? dossier.contact.emails.length : 0,
        bookingCount: Number(dossier.bookings?.count || 0),
        caseCount: Array.isArray(dossier.cases) ? dossier.cases.length : 0,
        threadCount: Number(dossier.threads?.count || 0),
        journalCount: Number(dossier.journal?.count || 0),
      },
    });
  } catch {
    /* auditfel får aldrig blockera read-only kundkort */
  }
}

function createCcoCustomerDossierRouter({
  requireAuth,
  authStore = null,
  config = {},
  ccoMailboxTruthStore = null,
  ccoMailIngestionStore = null,
  ccoConversationNotesStore = null,
  clientoBookingStore = null,
  getCommDraftStore = null,
} = {}) {
  const router = express.Router();
  const authMiddleware =
    typeof requireAuth === 'function' ? requireAuth : (_req, _res, next) => next();
  let journeyStorePromise = null;
  let threadStorePromise = null;

  function getJourneyStore(locals = {}) {
    if (locals.ccoCustomerJourneyStore) return locals.ccoCustomerJourneyStore;
    if (!journeyStorePromise) {
      journeyStorePromise = createCcoCustomerJourneyStore({
        filePath:
          config.ccoCustomerJourneyStorePath ||
          `${config.stateRoot || config.dataDir || './data'}/cco-customer-journey.json`,
      });
    }
    return journeyStorePromise;
  }

  async function getThreadStore(locals = {}) {
    if (locals.ccoConversationThreadStore) return locals.ccoConversationThreadStore;
    if (!threadStorePromise) {
      const commDraftStore =
        typeof getCommDraftStore === 'function' ? await getCommDraftStore() : null;
      threadStorePromise = createCcoConversationThreadStore({
        filePath:
          config.ccoConversationThreadStateStorePath ||
          config.ccoConversationStateStorePath ||
          `${config.stateRoot || config.dataDir || './data'}/cco-conversation-thread-state.json`,
        mailboxTruthStore: locals.ccoMailboxTruthStore || ccoMailboxTruthStore || null,
        mailIngestionStore: locals.ccoMailIngestionStore || ccoMailIngestionStore || null,
        conversationNotesStore:
          locals.ccoConversationNotesStore || ccoConversationNotesStore || null,
        commDraftStore,
        historyMailboxIds: CCO_CUSTOMER_HISTORY_DEFAULT_MAILBOX_IDS,
      });
    }
    return threadStorePromise;
  }

  router.get(
    '/cco/runtime/customer/:customerId/dossier',
    authMiddleware,
    attachRole,
    requirePermission('mail.read'),
    async (req, res) => {
      try {
        const customerId = text(req.params.customerId);
        if (!customerId) {
          return res.status(400).json({ ok: false, error: 'missing_customer_id' });
        }
        const locals = req.app?.locals || {};
        // Storarna är valfria — aggregeraren tål saknade/trasiga källor.
        // Storarna är valfria — saknas en källa degraderar dossiern tyst.
        // Journey/trådar lazy-skapas mot lokala stores och mail truth, utan live-fetch.
        const bookingStore =
          locals.clientoBookingStore || clientoBookingStore || locals.ccoBookingStore || null;
        const tenantId = resolveTenantId(req, config);
        const email = emailText(req.query?.email) || emailText(customerId);
        const stores = {
          patientMasterStore: createPatientMasterAdapter(locals.ccoPatientMasterStore || null),
          journeyStore: await getJourneyStore(locals),
          bookingStore,
          caseStore: createCaseStoreAdapter(locals.ccoBookingCaseStore || null, locals.ccoBookingStore || null),
          threadStore: await getThreadStore(locals),
          journalStore: locals.ccoJournalStore || null,
          portalMessageStore: locals.ccoPortalMessageStore || null,
        };
        const dossier = await buildCustomerDossier(
          {
            tenantId,
            customerId,
            patientId: text(req.query?.patientId) || customerId,
            email,
            nowIso: new Date().toISOString(),
          },
          stores
        );
        await auditDossierRead(authStore, req, dossier);
        return res.json({ ok: true, dossier });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ ok: false, error: error.message });
      }
    }
  );

  return router;
}

module.exports = { createCcoCustomerDossierRouter };
