const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const { createCapabilitiesRouter } = require('../../src/routes/capabilities');
const { createCcoSettingsStore } = require('../../src/ops/ccoSettingsStore');
const { createAuthStore } = require('../../src/security/authStore');

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

function createMockAuth(role = 'OWNER') {
  function requireAuth(req, _res, next) {
    req.auth = {
      tenantId: 'tenant-a',
      userId: 'owner-a',
      role,
    };
    next();
  }
  function requireRole(...roles) {
    const allowed = new Set(roles.map((item) => String(item || '').toUpperCase()));
    return (req, res, next) => {
      if (!allowed.has(String(req.auth?.role || '').toUpperCase())) {
        return res.status(403).json({ error: 'Du saknar behörighet för detta.' });
      }
      return next();
    };
  }
  return { requireAuth, requireRole };
}

test('runtime status exponerar offline_history och full kons-paritet', async () => {
  const previousEnv = {
    ARCANA_GRAPH_READ_ENABLED: process.env.ARCANA_GRAPH_READ_ENABLED,
    ARCANA_GRAPH_SEND_ENABLED: process.env.ARCANA_GRAPH_SEND_ENABLED,
    ARCANA_CCO_DELETE_ENABLED: process.env.ARCANA_CCO_DELETE_ENABLED,
    ARCANA_MAILBOX_ALLOWLIST: process.env.ARCANA_MAILBOX_ALLOWLIST,
    ARCANA_GRAPH_SEND_ALLOWLIST: process.env.ARCANA_GRAPH_SEND_ALLOWLIST,
    ARCANA_CCO_DELETE_ALLOWLIST: process.env.ARCANA_CCO_DELETE_ALLOWLIST,
    ARCANA_CCO_DEFAULT_SENDER_MAILBOX: process.env.ARCANA_CCO_DEFAULT_SENDER_MAILBOX,
  };

  process.env.ARCANA_GRAPH_READ_ENABLED = 'false';
  process.env.ARCANA_GRAPH_SEND_ENABLED = 'true';
  process.env.ARCANA_CCO_DELETE_ENABLED = 'true';
  process.env.ARCANA_MAILBOX_ALLOWLIST =
    'contact@hairtpclinic.com,kons@hairtpclinic.com,egzona@hairtpclinic.com,fazli@hairtpclinic.com';
  process.env.ARCANA_GRAPH_SEND_ALLOWLIST =
    'contact@hairtpclinic.com,kons@hairtpclinic.com,egzona@hairtpclinic.com,fazli@hairtpclinic.com';
  process.env.ARCANA_CCO_DELETE_ALLOWLIST =
    'contact@hairtpclinic.com,kons@hairtpclinic.com,egzona@hairtpclinic.com,fazli@hairtpclinic.com';
  process.env.ARCANA_CCO_DEFAULT_SENDER_MAILBOX = 'kons@hairtpclinic.com';

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-runtime-status-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });

  try {
    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
        graphSendConnector: {
          async sendReply() {
            return { ok: true };
          },
          async sendNewMessage() {
            return { ok: true };
          },
        },
      })
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/cco/runtime/status`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.graph.runtimeMode, 'offline_history');
      assert.equal(payload.graph.defaultSenderMailbox, 'kons@hairtpclinic.com');
      assert.equal(payload.graph.defaultSignatureProfile, 'fazli');
      assert.ok(
        payload.graph.signatureProfiles.some((profile) => profile.key === 'fazli'),
        'runtime status ska exponera Fazli som signaturprofil.'
      );
      assert.equal(
        payload.graph.signatureProfiles.some((profile) => profile.key === 'kons'),
        false
      );
      assert.ok(
        payload.graph.senderMailboxOptions.includes('kons@hairtpclinic.com'),
        'runtime status ska exponera kons i senderMailboxOptions.'
      );
      const konsCapability = payload.graph.mailboxCapabilities.find(
        (capability) => capability.id === 'kons@hairtpclinic.com'
      );
      assert.ok(konsCapability, 'runtime status ska exponera capability-rad för kons.');
      assert.equal(konsCapability.sendAvailable, true);
      assert.equal(konsCapability.deleteAvailable, true);
      assert.equal(konsCapability.senderAvailable, true);
      assert.equal(konsCapability.signatureProfileId, 'fazli');
      assert.equal(konsCapability.signatureProfileAvailable, true);
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
});

test('runtime status använder serverbackade mailbox defaults och custom signatures', async () => {
  const previousEnv = {
    ARCANA_GRAPH_READ_ENABLED: process.env.ARCANA_GRAPH_READ_ENABLED,
    ARCANA_GRAPH_SEND_ENABLED: process.env.ARCANA_GRAPH_SEND_ENABLED,
    ARCANA_CCO_DELETE_ENABLED: process.env.ARCANA_CCO_DELETE_ENABLED,
    ARCANA_MAILBOX_ALLOWLIST: process.env.ARCANA_MAILBOX_ALLOWLIST,
    ARCANA_GRAPH_SEND_ALLOWLIST: process.env.ARCANA_GRAPH_SEND_ALLOWLIST,
    ARCANA_CCO_DELETE_ALLOWLIST: process.env.ARCANA_CCO_DELETE_ALLOWLIST,
    ARCANA_CCO_DEFAULT_SENDER_MAILBOX: process.env.ARCANA_CCO_DEFAULT_SENDER_MAILBOX,
  };

  process.env.ARCANA_GRAPH_READ_ENABLED = 'false';
  process.env.ARCANA_GRAPH_SEND_ENABLED = 'true';
  process.env.ARCANA_CCO_DELETE_ENABLED = 'false';
  process.env.ARCANA_MAILBOX_ALLOWLIST = 'contact@hairtpclinic.com,support@hairtpclinic.com';
  process.env.ARCANA_GRAPH_SEND_ALLOWLIST =
    'contact@hairtpclinic.com,support@hairtpclinic.com';
  process.env.ARCANA_CCO_DELETE_ALLOWLIST = 'contact@hairtpclinic.com,support@hairtpclinic.com';
  process.env.ARCANA_CCO_DEFAULT_SENDER_MAILBOX = 'contact@hairtpclinic.com';

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-runtime-status-settings-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const settingsStore = await createCcoSettingsStore({
    filePath: path.join(tempDir, 'cco-settings.json'),
  });
  await settingsStore.saveTenantSettings({
    tenantId: 'tenant-a',
    settings: {
      mailFoundation: {
        defaults: {
          senderMailboxId: 'support@hairtpclinic.com',
        },
        customMailboxes: [
          {
            id: 'support@hairtpclinic.com',
            email: 'support@hairtpclinic.com',
            label: 'Support',
            signature: {
              label: 'Support signatur',
              fullName: 'Hair TP Support',
              title: 'Supportteam',
            },
          },
        ],
      },
    },
  });

  try {
    const app = express();
    app.use(express.json());
    const auth = createMockAuth('OWNER');
    app.use(
      '/api/v1',
      createCapabilitiesRouter({
        authStore,
        tenantConfigStore: {
          async getTenantConfig() {
            return {};
          },
        },
        ccoSettingsStore: settingsStore,
        requireAuth: auth.requireAuth,
        requireRole: auth.requireRole,
        graphSendConnector: {
          async sendReply() {
            return { ok: true };
          },
          async sendComposeDocument() {
            return { ok: true };
          },
        },
      })
    );

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/cco/runtime/status`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.graph.defaultSenderMailbox, 'support@hairtpclinic.com');
      assert.equal(payload.graph.defaultSignatureProfile, 'fazli');
      assert.equal(
        payload.graph.signatureProfiles.some(
          (profile) => profile.key === 'mailbox-signature:support@hairtpclinic.com'
        ),
        false
      );
      assert.ok(
        payload.graph.signatureProfiles.some((profile) => profile.key === 'fazli'),
        'runtime status ska exponera Fazli som godkänd defaultsignatur.'
      );
      const supportCapability = payload.graph.mailboxCapabilities.find(
        (capability) => capability.id === 'support@hairtpclinic.com'
      );
      assert.ok(supportCapability);
      assert.equal(supportCapability.label, 'Support');
      assert.equal(supportCapability.signatureProfileId, 'fazli');
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
});
