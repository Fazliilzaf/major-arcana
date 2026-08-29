'use strict';

const express = require('express');
const { ROLE_OWNER } = require('../security/roles');
const { resolveCcoRouteActor } = require('./ccoRouteShared');
const {
  buildFortnoxAuthUrl,
  createFortnoxClient,
  exchangeAuthorizationCode,
} = require('../cfo/cfoFortnoxClient');
const {
  linkPatientFortnoxCustomer,
  syncPatientToFortnox,
} = require('../cfo/cfoFortnoxPatientSync');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function fortnoxConfigured(config = {}) {
  return Boolean(
    config.fortnoxEnabled &&
    normalizeText(config.fortnoxClientId) &&
    normalizeText(config.fortnoxClientSecret) &&
    normalizeText(config.fortnoxRedirectUri)
  );
}

function createFortnoxClientForTenant({ fortnoxStore, config, tenantId }) {
  return createFortnoxClient({
    clientId: config.fortnoxClientId,
    clientSecret: config.fortnoxClientSecret,
    tenantId,
    getConnection: (input) => fortnoxStore.getConnection(input),
    saveConnection: (input) => fortnoxStore.saveConnection(input),
  });
}

function createCcoFortnoxRouter({
  fortnoxStore,
  patientMasterStore,
  integrationStore = null,
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
        return res.status(statusCode).json({
          error: error.message,
          metadata: error.metadata || null,
        });
      }
      console.error('[cco-fortnox]', error);
      return res.status(500).json({ error: 'Kunde inte hantera Fortnox-integrationen.' });
    }
  }

  router.get('/cco-fortnox/status', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async (actor) => {
      const status = await fortnoxStore.getPublicStatus({ tenantId: actor.tenantId });
      // CF.3: Fortnox OAuth blockerad av leverantören (utvecklarportalen ger fel). Single source via env-toggle.
      // Sätt FORTNOX_BLOCKED_INTEGRATION=false när Fortnox-felen är lösta för att släcka blocker-läget.
      const blockedIntegration =
        !status?.connected && process.env.FORTNOX_BLOCKED_INTEGRATION !== 'false';
      return res.json({
        configured: fortnoxConfigured(config),
        ...status,
        blockedIntegration,
        blockerReason: blockedIntegration
          ? 'Fortnox Utvecklarportal returnerar fel sedan 2026-06-01 — OAuth kan inte slutföras. Åtgärdas när Fortnox-felen är lösta.'
          : null,
        redirectUri: config.fortnoxRedirectUri,
        scope: config.fortnoxScope,
      });
    })
  );

  // ORD-B · Diagnostik: finns det underlag (bilagor / leverantörsfakturor)
  // hos revisorn i Fortnox som vi kan återhämta till CFO-kvittotycket?
  // Read-only — skriver ingenting.
  router.get('/cco-fortnox/attachments', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async (actor) => {
      const client = createFortnoxClientForTenant({
        fortnoxStore,
        config,
        tenantId: actor.tenantId,
      });
      const page = Number(req.query.page || 1);
      const result = {
        attachments: null,
        attachmentsError: null,
        supplierInvoices: null,
        supplierInvoicesError: null,
      };
      try {
        const res1 = await client.listAttachments({ page, limit: 100 });
        const list = Array.isArray(res1?.Attachments) ? res1.Attachments : [];
        result.attachments = {
          count: list.length,
          totalCount: res1?.MetaInformation?.['@TotalResources'] ?? null,
          sample: list.slice(0, 25).map((a) => ({
            id: a?.Id || a?.AttachmentId || null,
            name: a?.Name || null,
            type: a?.Type || null,
            comments: a?.Comments || null,
          })),
        };
      } catch (err) {
        result.attachmentsError = `${err.statusCode || ''} ${err.message}`.trim();
      }
      try {
        const res2 = await client.listSupplierInvoices({ page, limit: 100 });
        const list = Array.isArray(res2?.SupplierInvoices) ? res2.SupplierInvoices : [];
        result.supplierInvoices = {
          count: list.length,
          totalCount: res2?.MetaInformation?.['@TotalResources'] ?? null,
          sample: list.slice(0, 25).map((s) => ({
            invoiceNumber: s?.InvoiceNumber || null,
            supplierName: s?.SupplierName || null,
            total: s?.Total ?? null,
            invoiceDate: s?.InvoiceDate || null,
            dueDate: s?.DueDate || null,
            booked: s?.Booked ?? null,
          })),
        };
      } catch (err) {
        result.supplierInvoicesError = `${err.statusCode || ''} ${err.message}`.trim();
      }
      return res.json({ ok: true, ...result });
    })
  );

  router.get('/cco-fortnox/connect', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async (actor) => {
      if (!fortnoxConfigured(config)) {
        return res.status(503).json({
          error:
            'Fortnox är inte konfigurerat. Sätt FORTNOX_CLIENT_ID, FORTNOX_CLIENT_SECRET och redirect URI.',
        });
      }
      const state = await fortnoxStore.createOAuthState({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
      });
      const url = buildFortnoxAuthUrl({
        clientId: config.fortnoxClientId,
        redirectUri: config.fortnoxRedirectUri,
        scope: config.fortnoxScope,
        state,
        accountType: config.fortnoxAccountType, // 'service' om Service Account är aktiverat i Dev Portal
      });
      return res.json({
        ok: true,
        authorizeUrl: url,
        accountType: config.fortnoxAccountType || 'user',
      });
    })
  );

  router.get('/cco-fortnox/oauth/callback', async (req, res) => {
    try {
      const code = normalizeText(req.query.code);
      const state = normalizeText(req.query.state);
      const oauthError = normalizeText(req.query.error);
      if (oauthError) {
        return res.status(400).send(`Fortnox OAuth avbröts: ${oauthError}`);
      }
      if (!code || !state) {
        return res.status(400).send('Fortnox OAuth saknar code eller state.');
      }
      const pending = await fortnoxStore.consumeOAuthState(state);
      if (!pending?.tenantId) {
        return res.status(400).send('Fortnox OAuth state är ogiltig eller har gått ut.');
      }
      if (!fortnoxConfigured(config)) {
        return res.status(503).send('Fortnox är inte konfigurerat på servern.');
      }
      const tokens = await exchangeAuthorizationCode({
        clientId: config.fortnoxClientId,
        clientSecret: config.fortnoxClientSecret,
        redirectUri: config.fortnoxRedirectUri,
        code,
      });
      await fortnoxStore.saveConnection({
        tenantId: pending.tenantId,
        actorUserId: pending.actorUserId,
        connection: {
          ...tokens,
          connected: true,
          lastError: '',
        },
      });
      if (integrationStore?.setIntegrationConnection) {
        await integrationStore.setIntegrationConnection({
          tenantId: pending.tenantId,
          integrationId: 'fortnox',
          isConnected: true,
          actorUserId: pending.actorUserId,
        });
      }
      await authStore.addAuditEvent({
        tenantId: pending.tenantId,
        actorUserId: pending.actorUserId || 'system',
        action: 'cco.fortnox.connected',
        outcome: 'success',
        targetType: 'fortnox_integration',
        targetId: pending.tenantId,
      });
      return res
        .status(200)
        .send('Fortnox är nu anslutet. Du kan stänga detta fönster och gå tillbaka till Arcana.');
    } catch (error) {
      console.error('[cco-fortnox/oauth/callback]', error);
      return res.status(500).send('Kunde inte slutföra Fortnox-anslutningen.');
    }
  });

  router.post('/cco-fortnox/disconnect', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async (actor) => {
      await fortnoxStore.clearConnection({ tenantId: actor.tenantId });
      if (integrationStore?.setIntegrationConnection) {
        await integrationStore.setIntegrationConnection({
          tenantId: actor.tenantId,
          integrationId: 'fortnox',
          isConnected: false,
          actorUserId: actor.userId,
        });
      }
      await authStore.addAuditEvent({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: 'cco.fortnox.disconnected',
        outcome: 'success',
        targetType: 'fortnox_integration',
        targetId: actor.tenantId,
      });
      return res.json({ ok: true });
    })
  );

  router.post('/cco-fortnox/test', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async (actor) => {
      const client = createFortnoxClientForTenant({
        fortnoxStore,
        config,
        tenantId: actor.tenantId,
      });
      // Använd InvoicePayments eftersom den ingår i vårt OAuth-scope
      // (customer invoice payment bookkeeping). /companyinformation kräver
      // ett separat scope som vi inte begär.
      const result = await client.listInvoicePayments({ page: 1 });
      return res.json({
        ok: true,
        invoicePaymentCount: result?.InvoicePayments?.length ?? 0,
      });
    })
  );

  router.get('/cco-fortnox/vouchers', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async (actor) => {
      const client = createFortnoxClientForTenant({
        fortnoxStore,
        config,
        tenantId: actor.tenantId,
      });
      const financialYearDate = normalizeText(req.query.financialYearDate);
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
      const result = await client.listVouchers({ financialYearDate, page, limit });
      return res.json({
        ok: true,
        financialYearDate: financialYearDate || null,
        page,
        limit,
        vouchers: result?.Vouchers || [],
        meta: result?.MetaInformation || null,
      });
    })
  );

  router.get(
    '/cco-fortnox/vouchers/:series/:number',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const client = createFortnoxClientForTenant({
          fortnoxStore,
          config,
          tenantId: actor.tenantId,
        });
        const series = normalizeText(req.params.series) || 'A';
        const number = String(req.params.number).trim();
        if (!number || !/^\d+$/.test(number)) {
          return res.status(400).json({ error: 'Voucher number måste vara ett positivt heltal.' });
        }
        const financialYearDate = normalizeText(req.query.financialYearDate);
        const result = await client.getVoucher(series, number, financialYearDate);
        return res.json({
          ok: true,
          series,
          number,
          financialYearDate: financialYearDate || null,
          voucher: result?.Voucher || result,
        });
      })
  );

  router.post('/cco-fortnox/sync-patient', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async (actor) => {
      if (!patientMasterStore) {
        return res.status(503).json({ error: 'Patientmaster saknas.' });
      }
      const patientId = normalizeText(req.body?.patientId);
      if (!patientId) {
        return res.status(400).json({ error: 'patientId krävs.' });
      }
      const patient = await patientMasterStore.getPatient({
        tenantId: actor.tenantId,
        patientId,
      });
      if (!patient) {
        return res.status(404).json({ error: 'Patient hittades inte.' });
      }
      const client = createFortnoxClientForTenant({
        fortnoxStore,
        config,
        tenantId: actor.tenantId,
      });
      const result = await syncPatientToFortnox({
        patient,
        patientMasterStore,
        fortnoxClient: client,
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
      });
      await authStore.addAuditEvent({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: 'cco.fortnox.sync_patient',
        outcome: 'success',
        targetType: 'cco_patient_master',
        targetId: patientId,
        metadata: {
          customerNumber: result.customerNumber,
          action: result.action,
        },
      });
      return res.json({
        ok: true,
        customerNumber: result.customerNumber,
        action: result.action,
        patient: patientMasterStore.buildPatientCardReadout(result.patient),
      });
    })
  );

  router.patch(
    '/cco-fortnox/patient-link',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        if (!patientMasterStore) {
          return res.status(503).json({ error: 'Patientmaster saknas.' });
        }
        const patientId = normalizeText(req.body?.patientId);
        const customerNumber = normalizeText(
          req.body?.customerNumber || req.body?.fortnoxCustomerId
        );
        if (!patientId || !customerNumber) {
          return res.status(400).json({ error: 'patientId och customerNumber krävs.' });
        }
        const patient = await linkPatientFortnoxCustomer({
          patientMasterStore,
          tenantId: actor.tenantId,
          patientId,
          customerNumber,
        });
        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'cco.fortnox.link_patient',
          outcome: 'success',
          targetType: 'cco_patient_master',
          targetId: patientId,
          metadata: { customerNumber },
        });
        return res.json({
          ok: true,
          patient: patientMasterStore.buildPatientCardReadout(patient),
        });
      })
  );

  // CF.9 — Lista räkenskapsår (för att veta vilket år en utgift ska bokföras i).
  router.get(
    '/cco-fortnox/financial-years',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const client = createFortnoxClientForTenant({
          fortnoxStore,
          config,
          tenantId: actor.tenantId,
        });
        const result = await client.listFinancialYears();
        return res.json({
          ok: true,
          financialYears: result?.FinancialYears || [],
        });
      })
  );

  // CF.9 — Aktivera ett inaktivt BAS-konto i Fortnox (t.ex. 6990 Tull och spedition).
  // ?financialYear=<YYYY-MM-DD|år-id> för att aktivera i ett specifikt räkenskapsår.
  router.post(
    '/cco-fortnox/accounts/:number/activate',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const accountNumber = normalizeText(req.params.number);
        if (!accountNumber || !/^\d+$/.test(accountNumber)) {
          return res.status(400).json({ error: 'Kontonummer måste vara siffror.' });
        }
        const financialYear = normalizeText(req.query.financialYear || req.query.financialyear);
        const client = createFortnoxClientForTenant({
          fortnoxStore,
          config,
          tenantId: actor.tenantId,
        });
        const before = await client.getAccount(accountNumber, { financialYear });
        const after = await client.activateAccount(accountNumber, { financialYear });
        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'cco.fortnox.account_activated',
          outcome: 'success',
          targetType: 'fortnox_account',
          targetId: accountNumber,
          metadata: {
            financialYear: financialYear || null,
            wasActive: before?.Account?.Active || false,
            isActive: after?.Account?.Active || true,
          },
        });
        return res.json({
          ok: true,
          accountNumber,
          financialYear: financialYear || null,
          before: before?.Account || null,
          after: after?.Account || null,
        });
      })
  );

  return router;
}

module.exports = {
  createCcoFortnoxRouter,
  fortnoxConfigured,
};
