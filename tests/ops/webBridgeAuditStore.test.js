const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createWebBridgeAuditStore } = require('../../src/ops/webBridgeAuditStore');

test('webBridgeAuditStore sparar gateway-auditerade web-events', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-web-bridge-audit-'));
  try {
    const store = await createWebBridgeAuditStore({
      filePath: path.join(tempDir, 'audit.json'),
    });

    await store.recordAudit({
      action: 'gateway.run.start',
      outcome: 'success',
      tenantId: 'hair-tp-clinic',
      correlationId: 'corr-1',
      gatewayRunId: 'run-1',
    });

    const event = await store.recordEvent({
      eventType: 'form_submit',
      tenantId: 'hair-tp-clinic',
      channel: 'web',
      intent: 'web_lead',
      correlationId: 'corr-1',
      gatewayRunId: 'run-1',
      decision: 'allow',
      contactEmail: 'patient@example.com',
      metadata: { page: '/boka' },
    });

    assert.equal(event.eventType, 'form_submit');
    const recent = await store.listRecentEvents({ tenantId: 'hair-tp-clinic', limit: 5 });
    assert.equal(recent.length, 1);
    assert.equal(recent[0].contactEmail, 'patient@example.com');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
