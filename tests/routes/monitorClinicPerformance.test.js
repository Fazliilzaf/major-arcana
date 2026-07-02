const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createMonitorRouter } = require('../../src/routes/monitor');

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function buildApp(overrides = {}) {
  const app = express();
  app.use(express.json());
  const requireAuth = (req, _res, next) => {
    req.auth = { tenantId: 'hair-tp-clinic', userId: 'owner-1', role: 'OWNER' };
    next();
  };
  const requireRole = () => (_req, _res, next) => next();

  app.use(
    '/api/v1',
    createMonitorRouter({
      authStore: {
        async listTenantMembers() {
          return [];
        },
        async listAuditEvents() {
          return [];
        },
        async getLatestAuditEvent() {
          return null;
        },
        async addAuditEvent() {
          return true;
        },
      },
      templateStore: {
        async listTemplates() {
          return [];
        },
        async summarizeRisk() {
          return { highCriticalOpen: [], topReasonCodes: [] };
        },
        async summarizeIncidents() {
          return { totals: { openUnresolved: 0, breachedOpen: 0 } };
        },
      },
      tenantConfigStore: {
        async getTenantConfig() {
          return {};
        },
      },
      config: {
        defaultTenantId: 'hair-tp-clinic',
        authOwnerMfaRequired: false,
      },
      requireAuth,
      requireRole,
      runtimeState: {},
      ...overrides,
    })
  );

  return app;
}

test('monitor clinic-performance använder booking engine när cliento är tom', async () => {
  const app = buildApp({
    clientoBookingStore: {
      listAllBookings() {
        return [];
      },
    },
    bookingEngineStore: {
      listBookingsForEnrichment(tenantId) {
        if (tenantId !== 'hair-tp-clinic') return [];
        return [
          {
            bookingId: 'eng-1',
            customerEmail: 'a@b.se',
            status: 'confirmed',
            slot: {
              startsAt: '2026-07-10T09:00:00Z',
              serviceId: 'followup-transplant',
              serviceLabel: 'Uppföljning hårtransplantation',
              resourceLabel: 'Fazli Krasniqi',
            },
          },
        ];
      },
    },
  });
  app.locals.cfoFortnoxStore = null;
  app.locals.ccoSwishStore = null;
  app.locals.ccoCommercialStore = null;
  app.locals.cfoReceiptStore = null;
  app.locals.cfoExpenseStore = null;
  app.locals.cfoExpenseRuleStore = null;
  app.locals.cfoFinanceVendorStore = null;
  app.locals.cfoRecurringExpenseStore = null;
  app.locals.cfoFinanceReviewStore = null;
  app.locals.cfoFinanceMonthlyCloseStore = null;
  app.locals.cfoFortnoxInvoiceLister = null;

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/monitor/clinic-performance`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.source, 'live');
    assert.equal(payload.bookings.current, 1);
  });
});
