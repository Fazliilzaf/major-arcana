const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { createRiskRouter } = require('../../src/routes/risk');

async function withServer(app, run) {
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

function createRequireAuth() {
  return (req, _res, next) => {
    req.auth = {
      tenantId: 'tenant-a',
      userId: 'owner-a',
      role: 'OWNER',
    };
    next();
  };
}

function createRequireRole(...roles) {
  const allowed = new Set(roles.map((item) => String(item || '').toUpperCase()));
  return (req, res, next) => {
    const role = String(req.auth?.role || '').toUpperCase();
    if (!allowed.has(role)) {
      return res.status(403).json({ error: 'Du saknar behörighet för detta.' });
    }
    return next();
  };
}

function createTenantConfigStoreStub() {
  const state = {
    tenantId: 'tenant-a',
    riskSensitivityModifier: 0,
    riskThresholdVersion: 1,
    riskThresholdHistory: [],
    templateVariableAllowlistByCategory: {},
    templateRequiredVariablesByCategory: {},
    templateSignaturesByChannel: {},
  };

  return {
    async getTenantConfig() {
      return { ...state };
    },
    async updateTenantConfig({ patch = {} } = {}) {
      if (patch.riskSensitivityModifier !== undefined) {
        state.riskSensitivityModifier = Number(patch.riskSensitivityModifier);
      }
      state.riskThresholdVersion += 1;
      state.riskThresholdHistory = [
        ...state.riskThresholdHistory,
        {
          version: state.riskThresholdVersion,
          riskSensitivityModifier: state.riskSensitivityModifier,
          ts: new Date().toISOString(),
        },
      ];
      return { ...state };
    },
    async listRiskThresholdVersions() {
      return [...state.riskThresholdHistory];
    },
    async getRiskThresholdVersion({ version }) {
      return (
        state.riskThresholdHistory.find((entry) => Number(entry?.version) === Number(version)) || null
      );
    },
  };
}

function createAuthStoreStub(auditEvents) {
  return {
    async addAuditEvent(event) {
      auditEvents.push(event);
      return event;
    },
    async listTenantMembers() {
      return [
        {
          user: { id: 'owner-a', email: 'owner@example.com' },
          membership: { id: 'm-owner-a', role: 'OWNER', status: 'active' },
        },
        {
          user: { id: 'risk-approver', email: 'risk@example.com' },
          membership: { id: 'm-risk-approver', role: 'STAFF', status: 'active' },
        },
      ];
    },
  };
}

function createRiskApp({ dualSignoffRequired }) {
  const auditEvents = [];
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createRiskRouter({
      tenantConfigStore: createTenantConfigStoreStub(),
      templateStore: null,
      authStore: createAuthStoreStub(auditEvents),
      config: {
        riskDualSignoffRequired: Boolean(dualSignoffRequired),
      },
      requireAuth: createRequireAuth(),
      requireRole: createRequireRole,
    })
  );
  return { app, auditEvents };
}

test('risk settings update requires dual sign-off when enabled', async () => {
  const { app } = createRiskApp({ dualSignoffRequired: true });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/risk/settings`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        riskSensitivityModifier: 0.5,
      }),
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(String(payload.error || '').includes('Dual sign-off'), true);
  });
});

test('risk settings update rejects same actor as sign-off approver', async () => {
  const { app } = createRiskApp({ dualSignoffRequired: true });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/risk/settings`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        riskSensitivityModifier: 0.5,
        signOff: {
          approverUserId: 'owner-a',
          note: 'Self approval should fail',
        },
      }),
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(String(payload.error || '').includes('annan approver'), true);
  });
});

test('risk settings update accepts valid dual sign-off and logs it in audit', async () => {
  const { app, auditEvents } = createRiskApp({ dualSignoffRequired: true });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/risk/settings`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        riskSensitivityModifier: 0.5,
        note: 'Apply calibrated modifier',
        signOff: {
          approverUserId: 'risk-approver',
          note: 'Risk owner approved',
        },
      }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(Number(payload?.settings?.riskSensitivityModifier || 0), 0.5);
  });

  const riskUpdateAudit =
    auditEvents.find((entry) => entry?.action === 'risk.settings.update') || null;
  assert.ok(riskUpdateAudit);
  assert.equal(riskUpdateAudit.metadata?.dualSignOffRequired, true);
  assert.equal(riskUpdateAudit.metadata?.signOff?.approverUserId, 'risk-approver');
  assert.equal(riskUpdateAudit.metadata?.signOff?.approverRole, 'STAFF');
});
