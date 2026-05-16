const express = require('express');

const { ROLE_OWNER, ROLE_STAFF, ROLE_PATIENT } = require('../security/roles');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getIncomingCustomerState(body) {
  return body?.customerState && typeof body.customerState === 'object' ? body.customerState : null;
}

function createCcoCustomersRouter({
  customerStore,
  portalStore = null,
  authStore,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  function ensurePortalStore() {
    if (
      !portalStore ||
      typeof portalStore.getTenantCustomerPortal !== 'function' ||
      typeof portalStore.markTenantPortalViewed !== 'function' ||
      typeof portalStore.acknowledgeTenantPortalNotification !== 'function'
    ) {
      const error = new Error('Portallagring saknas.');
      error.statusCode = 503;
      throw error;
    }
  }

  function resolvePortalKey(req) {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const fromRequest =
      normalizeText(req.query?.customerKey) ||
      normalizeText(req.query?.customerEmail) ||
      normalizeText(req.query?.customerId) ||
      normalizeText(body.customerKey) ||
      normalizeText(body.customerEmail) ||
      normalizeText(body.customerId);
    if (fromRequest) return fromRequest;
    if (
      String(req.auth?.role || '')
        .trim()
        .toUpperCase() === ROLE_PATIENT
    ) {
      return normalizeText(req.auth?.userId);
    }
    return '';
  }

  router.get(
    '/cco/customers/state',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const customerState = await customerStore.getTenantCustomerState({
          tenantId: req.auth.tenantId,
        });
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.customers.read',
          outcome: 'success',
          targetType: 'cco_customers',
          targetId: req.auth.tenantId,
        });
        return res.json({ customerState });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa kundläget.' });
      }
    }
  );

  router.put(
    '/cco/customers/state',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const customerState = await customerStore.saveTenantCustomerState({
          tenantId: req.auth.tenantId,
          customerState: req.body?.customerState || req.body || {},
        });
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.customers.update',
          outcome: 'success',
          targetType: 'cco_customers',
          targetId: req.auth.tenantId,
          metadata: {
            directoryCount: Object.keys(customerState.directory || {}).length,
            mergedCount: Object.keys(customerState.mergedInto || {}).length,
          },
        });
        return res.json({ ok: true, customerState });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte spara kundläget.' });
      }
    }
  );

  router.post(
    '/cco/customers/identity/suggestions',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const payload = await customerStore.previewTenantCustomerIdentity({
          tenantId: req.auth.tenantId,
          customerState: getIncomingCustomerState(req.body),
        });
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.customers.identity.suggestions',
          outcome: 'success',
          targetType: 'cco_customer_identity',
          targetId: req.auth.tenantId,
          metadata: {
            duplicateCount: Number(payload.duplicateCount || 0),
          },
        });
        return res.json({ ok: true, ...payload });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte beräkna identitetsförslagen.' });
      }
    }
  );

  router.post(
    '/cco/customers/identity/merge',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const primaryKey = normalizeText(req.body?.primaryKey);
        const secondaryKeys = Array.isArray(req.body?.secondaryKeys) ? req.body.secondaryKeys : [];
        if (!primaryKey || secondaryKeys.length < 1) {
          return res.status(400).json({ error: 'Primär och sekundär kund krävs för merge.' });
        }
        const payload = await customerStore.mergeTenantCustomerProfiles({
          tenantId: req.auth.tenantId,
          customerState: getIncomingCustomerState(req.body),
          primaryKey,
          secondaryKeys,
          suggestionId: normalizeText(req.body?.suggestionId),
          options:
            req.body?.options && typeof req.body.options === 'object' ? req.body.options : {},
        });
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.customers.identity.merge',
          outcome: 'success',
          targetType: 'cco_customer_identity',
          targetId: req.auth.tenantId,
          metadata: {
            primaryKey,
            secondaryCount: secondaryKeys.length,
          },
        });
        return res.json({ ok: true, ...payload });
      } catch (error) {
        console.error(error);
        const message = normalizeText(error?.message) || 'Kunde inte slå ihop kundprofilerna.';
        return res.status(message.includes('krävs') ? 400 : 500).json({ error: message });
      }
    }
  );

  router.post(
    '/cco/customers/identity/split',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const customerKey = normalizeText(req.body?.customerKey);
        const email = normalizeText(req.body?.email);
        if (!customerKey || !email) {
          return res.status(400).json({ error: 'Kund och e-post krävs för split.' });
        }
        const payload = await customerStore.splitTenantCustomerProfile({
          tenantId: req.auth.tenantId,
          customerState: getIncomingCustomerState(req.body),
          customerKey,
          email,
        });
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.customers.identity.split',
          outcome: 'success',
          targetType: 'cco_customer_identity',
          targetId: req.auth.tenantId,
          metadata: {
            customerKey,
            email,
            newKey: payload.newKey,
          },
        });
        return res.json({ ok: true, ...payload });
      } catch (error) {
        console.error(error);
        const message = normalizeText(error?.message) || 'Kunde inte dela upp kundprofilen.';
        return res.status(message.includes('krävs') ? 400 : 500).json({ error: message });
      }
    }
  );

  router.post(
    '/cco/customers/identity/primary-email',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const customerKey = normalizeText(req.body?.customerKey);
        const email = normalizeText(req.body?.email);
        if (!customerKey || !email) {
          return res.status(400).json({ error: 'Kund och e-post krävs för primär adress.' });
        }
        const payload = await customerStore.setTenantCustomerPrimaryEmail({
          tenantId: req.auth.tenantId,
          customerState: getIncomingCustomerState(req.body),
          customerKey,
          email,
        });
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.customers.identity.primary_email',
          outcome: 'success',
          targetType: 'cco_customer_identity',
          targetId: req.auth.tenantId,
          metadata: {
            customerKey,
            email,
          },
        });
        return res.json({ ok: true, ...payload });
      } catch (error) {
        console.error(error);
        const message = normalizeText(error?.message) || 'Kunde inte sätta primär e-post.';
        return res.status(message.includes('krävs') ? 400 : 500).json({ error: message });
      }
    }
  );

  router.post(
    '/cco/customers/identity/dismiss',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const suggestionId = normalizeText(req.body?.suggestionId);
        if (!suggestionId) {
          return res.status(400).json({ error: 'Förslags-id krävs.' });
        }
        const payload = await customerStore.dismissTenantCustomerSuggestion({
          tenantId: req.auth.tenantId,
          customerState: getIncomingCustomerState(req.body),
          suggestionId,
        });
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.customers.identity.dismiss',
          outcome: 'success',
          targetType: 'cco_customer_identity',
          targetId: req.auth.tenantId,
          metadata: {
            suggestionId,
          },
        });
        return res.json({ ok: true, ...payload });
      } catch (error) {
        console.error(error);
        const message = normalizeText(error?.message) || 'Kunde inte markera förslaget.';
        return res.status(message.includes('krävs') ? 400 : 500).json({ error: message });
      }
    }
  );

  router.post(
    '/cco/customers/import/preview',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const importText = normalizeText(req.body?.text || req.body?.importText);
        const fileName = normalizeText(req.body?.fileName);
        const defaultMailboxId = normalizeText(req.body?.defaultMailboxId).toLowerCase();
        const sourceSystem = normalizeText(req.body?.sourceSystem).toLowerCase();
        const binaryBase64 = normalizeText(req.body?.binaryBase64 || req.body?.fileBase64);
        const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
        if (!importText && !binaryBase64 && (!Array.isArray(rows) || !rows.length)) {
          return res.status(400).json({ error: 'Importkällan är tom.' });
        }
        const importSummary = await customerStore.previewTenantCustomerImport({
          tenantId: req.auth.tenantId,
          importText,
          rows,
          binaryBase64,
          fileName,
          defaultMailboxId,
          sourceSystem,
        });
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.customers.import.preview',
          outcome: 'success',
          targetType: 'cco_customers_import',
          targetId: req.auth.tenantId,
          metadata: {
            fileName,
            defaultMailboxId,
            sourceSystem,
            sourceMode: Array.isArray(rows) ? 'rows' : binaryBase64 ? 'binary' : 'text',
            totalRows: importSummary.totalRows,
            validRows: importSummary.validRows,
            created: importSummary.created,
            updated: importSummary.updated,
            merged: importSummary.merged,
            review: importSummary.review,
            invalid: importSummary.invalid,
          },
        });
        return res.json({
          ok: true,
          importSummary,
          coverageReadout: importSummary.coverageReadout,
        });
      } catch (error) {
        console.error(error);
        const message = normalizeText(error?.message);
        const statusCode =
          message === 'Importkällan är tom.' ||
          message.startsWith('CSV-importen måste innehålla') ||
          message.startsWith('Kalkylbladsfilen') ||
          message.includes('Unexpected token')
            ? 400
            : 500;
        return res.status(statusCode).json({
          error:
            statusCode === 400
              ? message || 'Ogiltig importfil.'
              : 'Kunde inte förhandsgranska importen.',
        });
      }
    }
  );

  router.post(
    '/cco/customers/import/commit',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const importText = normalizeText(req.body?.text || req.body?.importText);
        const fileName = normalizeText(req.body?.fileName);
        const defaultMailboxId = normalizeText(req.body?.defaultMailboxId).toLowerCase();
        const sourceSystem = normalizeText(req.body?.sourceSystem).toLowerCase();
        const binaryBase64 = normalizeText(req.body?.binaryBase64 || req.body?.fileBase64);
        const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
        if (!importText && !binaryBase64 && (!Array.isArray(rows) || !rows.length)) {
          return res.status(400).json({ error: 'Importkällan är tom.' });
        }
        const { customerState, importSummary, coverageReadout } =
          await customerStore.commitTenantCustomerImport({
            tenantId: req.auth.tenantId,
            importText,
            rows,
            binaryBase64,
            fileName,
            defaultMailboxId,
            sourceSystem,
          });
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.customers.import.commit',
          outcome: 'success',
          targetType: 'cco_customers_import',
          targetId: req.auth.tenantId,
          metadata: {
            fileName,
            defaultMailboxId,
            sourceSystem,
            sourceMode: Array.isArray(rows) ? 'rows' : binaryBase64 ? 'binary' : 'text',
            totalRows: importSummary.totalRows,
            validRows: importSummary.validRows,
            created: importSummary.created,
            updated: importSummary.updated,
            merged: importSummary.merged,
            review: importSummary.review,
            invalid: importSummary.invalid,
          },
        });
        return res.json({
          ok: true,
          importSummary,
          coverageReadout: coverageReadout || importSummary.coverageReadout,
          customerState,
        });
      } catch (error) {
        console.error(error);
        const message = normalizeText(error?.message);
        const statusCode =
          message === 'Importkällan är tom.' ||
          message.startsWith('CSV-importen måste innehålla') ||
          message.startsWith('Kalkylbladsfilen') ||
          message.includes('Unexpected token')
            ? 400
            : 500;
        return res.status(statusCode).json({
          error:
            statusCode === 400 ? message || 'Ogiltig importfil.' : 'Kunde inte importera kunderna.',
        });
      }
    }
  );

  router.get(
    '/cco/customers/import/status',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const coverageReadout = await customerStore.getTenantCustomerImportCoverageReadout({
          tenantId: req.auth.tenantId,
        });
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.customers.import.status',
          outcome: 'success',
          targetType: 'cco_customers_import',
          targetId: req.auth.tenantId,
          metadata: coverageReadout,
        });
        return res.json({ ok: true, coverageReadout });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa importstatus.' });
      }
    }
  );

  router.get(
    '/cco/customers/portal',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF, ROLE_PATIENT),
    async (req, res) => {
      try {
        ensurePortalStore();
        const customerKey = resolvePortalKey(req);
        if (!customerKey) {
          return res.status(400).json({ error: 'customerKey saknas.' });
        }
        const portal = await portalStore.getTenantCustomerPortal({
          tenantId: req.auth.tenantId,
          customerKey,
          customerEmail:
            normalizeText(req.query?.customerEmail) || normalizeText(req.body?.customerEmail),
          customerId: normalizeText(req.query?.customerId) || normalizeText(req.body?.customerId),
          customerName:
            normalizeText(req.query?.customerName) || normalizeText(req.body?.customerName),
          viewerScope:
            String(req.auth.role || '')
              .trim()
              .toUpperCase() === ROLE_PATIENT
              ? 'customer'
              : 'owner',
        });
        if (!portal) {
          return res.status(404).json({ error: 'Portalen kunde inte hittas.' });
        }
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.portal.read',
          outcome: 'success',
          targetType: 'cco_portal',
          targetId: customerKey,
          metadata: {
            viewerRole: req.auth.role,
          },
        });
        return res.json({ ok: true, portal });
      } catch (error) {
        console.error(error);
        const statusCode = Number(error?.statusCode || 500);
        if (statusCode < 500) {
          return res
            .status(statusCode)
            .json({ error: error.message, metadata: error.metadata || null });
        }
        return res.status(500).json({ error: 'Kunde inte läsa kundportalen.' });
      }
    }
  );

  router.post(
    '/cco/customers/portal/viewed',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF, ROLE_PATIENT),
    async (req, res) => {
      try {
        ensurePortalStore();
        const customerKey = resolvePortalKey(req);
        if (!customerKey) {
          return res.status(400).json({ error: 'customerKey saknas.' });
        }
        const payload = await portalStore.markTenantPortalViewed({
          tenantId: req.auth.tenantId,
          customerKey,
          customerEmail:
            normalizeText(req.query?.customerEmail) || normalizeText(req.body?.customerEmail),
          customerId: normalizeText(req.query?.customerId) || normalizeText(req.body?.customerId),
          customerName:
            normalizeText(req.query?.customerName) || normalizeText(req.body?.customerName),
          actorUserId: req.auth.userId,
          viewerScope:
            String(req.auth.role || '')
              .trim()
              .toUpperCase() === ROLE_PATIENT
              ? 'customer'
              : 'owner',
        });
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.portal.viewed',
          outcome: 'success',
          targetType: 'cco_portal',
          targetId: customerKey,
          metadata: {
            viewerRole: req.auth.role,
          },
        });
        return res.json({ ok: true, ...payload });
      } catch (error) {
        console.error(error);
        const statusCode = Number(error?.statusCode || 500);
        if (statusCode < 500) {
          return res
            .status(statusCode)
            .json({ error: error.message, metadata: error.metadata || null });
        }
        return res.status(500).json({ error: 'Kunde inte markera portalen som öppnad.' });
      }
    }
  );

  router.post(
    '/cco/customers/portal/notifications/:notificationId/ack',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF, ROLE_PATIENT),
    async (req, res) => {
      try {
        ensurePortalStore();
        const customerKey = resolvePortalKey(req);
        const notificationId = normalizeText(req.params?.notificationId);
        if (!customerKey || !notificationId) {
          return res.status(400).json({ error: 'customerKey och notificationId krävs.' });
        }
        const payload = await portalStore.acknowledgeTenantPortalNotification({
          tenantId: req.auth.tenantId,
          customerKey,
          customerEmail:
            normalizeText(req.query?.customerEmail) || normalizeText(req.body?.customerEmail),
          customerId: normalizeText(req.query?.customerId) || normalizeText(req.body?.customerId),
          customerName:
            normalizeText(req.query?.customerName) || normalizeText(req.body?.customerName),
          notificationId,
          actorUserId: req.auth.userId,
        });
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.portal.notification.ack',
          outcome: 'success',
          targetType: 'cco_portal_notification',
          targetId: notificationId,
          metadata: {
            customerKey,
            viewerRole: req.auth.role,
          },
        });
        return res.json({ ok: true, ...payload });
      } catch (error) {
        console.error(error);
        const statusCode = Number(error?.statusCode || 500);
        if (statusCode < 500) {
          return res
            .status(statusCode)
            .json({ error: error.message, metadata: error.metadata || null });
        }
        return res.status(500).json({ error: 'Kunde inte kvittera notifieringen.' });
      }
    }
  );

  return router;
}

module.exports = {
  createCcoCustomersRouter,
};
