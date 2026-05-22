const express = require('express');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');

const INTEGRATION_CATALOG = Object.freeze({
  calendly: {
    id: 'calendly',
    category: 'calendar',
    labelSv: 'Calendly',
    labelEn: 'Calendly',
    connectedSummarySv: 'Kalenderflödet är redo för bokningsförslag och uppföljning.',
    connectedSummaryEn: 'Calendar flows are ready for booking suggestions and follow-up.',
    disconnectedSummarySv: 'Kalendersynk är inte aktiverad ännu.',
    disconnectedSummaryEn: 'Calendar sync is not active yet.',
    watchSv: 'Verifiera fallback-slotar och läkarkoppling efter anslutning.',
    watchEn: 'Verify fallback slots and clinician mapping after connect.',
  },
  stripe: {
    id: 'stripe',
    category: 'payment',
    labelSv: 'Stripe',
    labelEn: 'Stripe',
    connectedSummarySv: 'Betalningslänkar och påminnelser kan användas i operativt flöde.',
    connectedSummaryEn: 'Payment links and reminders can be used in the operational flow.',
    disconnectedSummarySv: 'Kortbetalningar är inte anslutna ännu.',
    disconnectedSummaryEn: 'Card payments are not connected yet.',
    watchSv: 'Följ upp retry-logik och timeout-hantering efter aktivering.',
    watchEn: 'Track retry logic and timeout handling after activation.',
  },
  twilio: {
    id: 'twilio',
    category: 'communication',
    labelSv: 'Twilio',
    labelEn: 'Twilio',
    connectedSummarySv: 'SMS och röstsamtal kan nu användas från samma operatörsyta.',
    connectedSummaryEn: 'SMS and voice calls can now be used from the same operator surface.',
    disconnectedSummarySv: 'SMS-kanalen är ännu inte aktiverad.',
    disconnectedSummaryEn: 'The SMS channel is not active yet.',
    watchSv: 'Sätt primär kanal och ägandeskap innan utrullning till teamet.',
    watchEn: 'Set the primary channel and ownership before team rollout.',
  },
  slack: {
    id: 'slack',
    category: 'communication',
    labelSv: 'Slack',
    labelEn: 'Slack',
    connectedSummarySv: 'Teamaviseringar och handoff-signaler är redo i Slack.',
    connectedSummaryEn: 'Team alerts and handoff signals are ready in Slack.',
    disconnectedSummarySv: 'Slack-aviseringar är inte anslutna ännu.',
    disconnectedSummaryEn: 'Slack alerts are not connected yet.',
    watchSv: 'Kontrollera att teamet använder rätt kanal för eskaleringar.',
    watchEn: 'Check that the team uses the correct channel for escalations.',
  },
  looker: {
    id: 'looker',
    category: 'analytics',
    labelSv: 'Looker',
    labelEn: 'Looker',
    connectedSummarySv: 'Analytics-export och dashboards kan nu delas externt.',
    connectedSummaryEn: 'Analytics exports and dashboards can now be shared externally.',
    disconnectedSummarySv: 'Extern dashboardkoppling är inte aktiverad ännu.',
    disconnectedSummaryEn: 'External dashboard connectivity is not active yet.',
    watchSv: 'Bestäm vilka mätpunkter som ska speglas utanför CCO innan aktivering.',
    watchEn: 'Decide which metrics should leave CCO before activation.',
  },
  zapier: {
    id: 'zapier',
    category: 'automation',
    labelSv: 'Zapier',
    labelEn: 'Zapier',
    connectedSummarySv: 'Externa arbetsflöden kan triggas från CCO med guardrails.',
    connectedSummaryEn: 'External workflows can be triggered from CCO with guardrails.',
    disconnectedSummarySv: 'Extern automationskoppling är inte aktiverad ännu.',
    disconnectedSummaryEn: 'External automation connectivity is not active yet.',
    watchSv: 'Sätt godkännanden och felhantering innan fler steg körs automatiskt.',
    watchEn: 'Set approvals and failure handling before more steps run automatically.',
  },
});

function asNonEmptyString(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed || '';
}

function normalizeEmail(value) {
  return asNonEmptyString(value).toLowerCase();
}

function pickLocalized(req, sv, en) {
  const acceptLanguage = asNonEmptyString(req.get('accept-language')).toLowerCase();
  if (acceptLanguage.startsWith('en')) return en;
  return sv;
}

function mapIntegrationStatus({ record, runtimeReady, observabilityStatus, req }) {
  const catalogEntry = INTEGRATION_CATALOG[record.integrationId];
  const isConnected = record.isConnected !== false;
  const statusTone = isConnected
    ? runtimeReady && observabilityStatus === 'green'
      ? 'healthy'
      : 'attention'
    : 'idle';
  return {
    id: record.integrationId,
    category: catalogEntry?.category || 'automation',
    isConnected,
    statusTone,
    statusSummary: isConnected
      ? pickLocalized(
          req,
          catalogEntry?.connectedSummarySv || 'Ansluten och redo att användas.',
          catalogEntry?.connectedSummaryEn || 'Connected and ready to use.',
        )
      : pickLocalized(
          req,
          catalogEntry?.disconnectedSummarySv || 'Inte ansluten ännu.',
          catalogEntry?.disconnectedSummaryEn || 'Not connected yet.',
        ),
    watchLabel: pickLocalized(
      req,
      catalogEntry?.watchSv || 'Följ upp operativ användning efter aktivering.',
      catalogEntry?.watchEn || 'Monitor operational use after activation.',
    ),
    configuredAt: asNonEmptyString(record.configuredAt) || null,
    updatedAt: asNonEmptyString(record.updatedAt) || null,
    configurable: true,
    docsAvailable: true,
  };
}

function buildDocsPayload() {
  return {
    updatedAt: new Date().toISOString(),
    sections: [
      {
        title: 'Operativ status',
        items: [
          {
            method: 'GET',
            path: '/api/v1/cco/integrations/status',
            description: 'Hämtar integrationsstatus, readiness och tenantens aktuella connect-state.',
          },
          {
            method: 'POST',
            path: '/api/v1/cco/integrations/:id/connect',
            description: 'Aktiverar en integration för tenantens operativa yta.',
          },
          {
            method: 'POST',
            path: '/api/v1/cco/integrations/:id/disconnect',
            description: 'Kopplar från en integration utan att radera dess metadata.',
          },
        ],
      },
      {
        title: 'Arbetsyta och uppföljning',
        items: [
          {
            method: 'GET',
            path: '/api/v1/cco/workspace/bootstrap',
            description: 'Bootstrappar notes, follow-up och panelinställningar för CCO-ytan.',
          },
          {
            method: 'POST',
            path: '/api/v1/cco/workspace/note',
            description: 'Sparar anteckningar med kund- och konversationskontext.',
          },
          {
            method: 'POST',
            path: '/api/v1/cco/workspace/follow-up',
            description: 'Schemalägger uppföljning med konfliktkontroll och reminder-stöd.',
          },
        ],
      },
      {
        title: 'Operativ telemetry',
        items: [
          {
            method: 'GET',
            path: '/api/v1/monitor/status',
            description: 'Visar övergripande runtime-, observability- och schedulerstatus.',
          },
          {
            method: 'GET',
            path: '/api/v1/monitor/readiness',
            description: 'Ger readiness-score och kontrollband för den nuvarande installationen.',
          },
          {
            method: 'GET',
            path: '/api/v1/dashboard/owner',
            description: 'Levererar owner-readout för live-lägesbild och operativa dashboards.',
          },
        ],
      },
    ],
  };
}

function createCcoIntegrationsRouter({
  integrationStore,
  authStore,
  requireAuth,
  requireRole,
  runtimeState,
}) {
  const router = express.Router();

  router.get(
    '/cco/integrations/status',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const tenantId = req.auth.tenantId;
        const records = await integrationStore.getTenantIntegrations({ tenantId });
        const observabilityStatus =
          runtimeState && runtimeState.ready === true ? 'green' : 'attention';
        const integrations = records.map((record) =>
          mapIntegrationStatus({
            record,
            runtimeReady: runtimeState?.ready === true,
            observabilityStatus,
            req,
          }),
        );

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.integrations.status.read',
          outcome: 'success',
          targetType: 'cco_integrations',
          targetId: tenantId,
          metadata: {
            connectedCount: integrations.filter((item) => item.isConnected).length,
            totalCount: integrations.length,
          },
        });

        return res.json({
          generatedAt: new Date().toISOString(),
          runtimeReady: runtimeState?.ready === true,
          integrations,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa integrationsstatus.' });
      }
    },
  );

  router.post(
    '/cco/integrations/:integrationId/connect',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const integrationId = asNonEmptyString(req.params.integrationId).toLowerCase();
        if (!INTEGRATION_CATALOG[integrationId]) {
          return res.status(404).json({ error: 'Okänd integration.' });
        }
        const tenantId = req.auth.tenantId;
        const record = await integrationStore.setIntegrationConnection({
          tenantId,
          integrationId,
          isConnected: true,
          actorUserId: req.auth.userId,
        });
        const integration = mapIntegrationStatus({
          record,
          runtimeReady: runtimeState?.ready === true,
          observabilityStatus: runtimeState?.ready === true ? 'green' : 'attention',
          req,
        });

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.integrations.connect',
          outcome: 'success',
          targetType: 'cco_integration',
          targetId: integrationId,
        });

        return res.json({ ok: true, integration });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte ansluta integrationen.' });
      }
    },
  );

  router.post(
    '/cco/integrations/:integrationId/disconnect',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const integrationId = asNonEmptyString(req.params.integrationId).toLowerCase();
        if (!INTEGRATION_CATALOG[integrationId]) {
          return res.status(404).json({ error: 'Okänd integration.' });
        }
        const tenantId = req.auth.tenantId;
        const record = await integrationStore.setIntegrationConnection({
          tenantId,
          integrationId,
          isConnected: false,
          actorUserId: req.auth.userId,
        });
        const integration = mapIntegrationStatus({
          record,
          runtimeReady: runtimeState?.ready === true,
          observabilityStatus: runtimeState?.ready === true ? 'green' : 'attention',
          req,
        });

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.integrations.disconnect',
          outcome: 'success',
          targetType: 'cco_integration',
          targetId: integrationId,
        });

        return res.json({ ok: true, integration });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte koppla från integrationen.' });
      }
    },
  );

  router.get(
    '/cco/integrations/docs',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.integrations.docs.read',
          outcome: 'success',
          targetType: 'cco_integration_docs',
          targetId: req.auth.tenantId,
        });
        return res.json(buildDocsPayload());
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa integrationsdokumentationen.' });
      }
    },
  );

  router.post(
    '/cco/integrations/contact-sales',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const name = asNonEmptyString(req.body?.name);
        const email = normalizeEmail(req.body?.email);
        const message = asNonEmptyString(req.body?.message);
        if (!name || !email) {
          return res.status(400).json({ error: 'Namn och e-post krävs.' });
        }

        const lead = await integrationStore.addSalesLead({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          name,
          email,
          message,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.integrations.contact_sales',
          outcome: 'success',
          targetType: 'cco_integration_sales_lead',
          targetId: lead.leadId,
          metadata: {
            email,
            hasMessage: Boolean(message),
          },
        });

        return res.status(201).json({
          ok: true,
          leadId: lead.leadId,
          createdAt: lead.createdAt,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte skicka förfrågan.' });
      }
    },
  );

  return router;
}

module.exports = {
  createCcoIntegrationsRouter,
};
