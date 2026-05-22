const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { requestContextMiddleware } = require('../../src/observability/requestContext');
const { createAuthStore } = require('../../src/security/authStore');

function createReq(headers = {}) {
  return {
    headers: { ...headers },
    get(name) {
      const want = String(name).toLowerCase();
      for (const [key, value] of Object.entries(this.headers)) {
        if (String(key).toLowerCase() === want) return value;
      }
      return undefined;
    },
  };
}

function createRes() {
  const headers = {};
  return {
    setHeader(n, v) {
      headers[String(n).toLowerCase()] = String(v);
    },
  };
}

test('addAuditEvent injects correlationId from AsyncLocalStorage context', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-audit-corr-'));
  const filePath = path.join(tempDir, 'auth.json');

  const mw = requestContextMiddleware({ headerName: 'x-correlation-id' });
  const req = createReq({ 'x-correlation-id': 'req-trace-7.z1' });
  const res = createRes();

  await new Promise((resolve, reject) => {
    mw(req, res, async () => {
      try {
        const store = await createAuthStore({
          filePath,
          sessionTtlMs: 3600000,
          sessionIdleTtlMs: 0,
          loginTicketTtlMs: 600000,
          auditAppendOnly: true,
          auditMaxEntries: 5000,
        });
        const ev = await store.addAuditEvent({
          action: 'observability.correlation.test',
          outcome: 'success',
          metadata: { source: 'test' },
        });
        assert.equal(ev.metadata.correlationId, 'req-trace-7.z1');
        assert.equal(ev.metadata.source, 'test');
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('addAuditEvent does not overwrite explicit metadata.correlationId', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-audit-corr2-'));
  const filePath = path.join(tempDir, 'auth.json');

  const mw = requestContextMiddleware({ headerName: 'x-correlation-id' });
  const req = createReq({ 'x-correlation-id': 'header-trace' });
  const res = createRes();

  await new Promise((resolve, reject) => {
    mw(req, res, async () => {
      try {
        const store = await createAuthStore({
          filePath,
          sessionTtlMs: 3600000,
          sessionIdleTtlMs: 0,
          loginTicketTtlMs: 600000,
          auditAppendOnly: true,
          auditMaxEntries: 5000,
        });
        const ev = await store.addAuditEvent({
          action: 'observability.correlation.override',
          outcome: 'success',
          metadata: { correlationId: 'client-supplied-id' },
        });
        assert.equal(ev.metadata.correlationId, 'client-supplied-id');
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('addAuditEvent omits correlationId when outside request context', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-audit-noctx-'));
  const filePath = path.join(tempDir, 'auth.json');
  try {
    const store = await createAuthStore({
      filePath,
      sessionTtlMs: 3600000,
      sessionIdleTtlMs: 0,
      loginTicketTtlMs: 600000,
      auditAppendOnly: true,
      auditMaxEntries: 5000,
    });
    const ev = await store.addAuditEvent({
      action: 'observability.no_context',
      outcome: 'success',
      metadata: { source: 'bare' },
    });
    assert.equal(ev.metadata.source, 'bare');
    assert.ok(!ev.metadata.correlationId);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('addAuditEvent inherits generated correlationId when middleware has no header', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-audit-gen-corr-'));
  const filePath = path.join(tempDir, 'auth.json');
  const mw = requestContextMiddleware({ headerName: 'x-correlation-id' });
  const req = createReq({});
  const res = createRes();
  await new Promise((resolve, reject) => {
    mw(req, res, async () => {
      try {
        const store = await createAuthStore({
          filePath,
          sessionTtlMs: 3600000,
          sessionIdleTtlMs: 0,
          loginTicketTtlMs: 600000,
          auditAppendOnly: true,
          auditMaxEntries: 5000,
        });
        const ev = await store.addAuditEvent({
          action: 'observability.generated_correlation',
          outcome: 'success',
          metadata: {},
        });
        assert.ok(typeof ev.metadata.correlationId === 'string');
        assert.equal(ev.metadata.correlationId, req.correlationId);
        assert.match(ev.metadata.correlationId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('addAuditEvent uses generated correlation when header fails validation', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-audit-invalid-corr-'));
  const filePath = path.join(tempDir, 'auth.json');
  const mw = requestContextMiddleware({ headerName: 'x-correlation-id' });
  const req = createReq({ 'x-correlation-id': 'bad!!!' });
  const res = createRes();
  await new Promise((resolve, reject) => {
    mw(req, res, async () => {
      try {
        const store = await createAuthStore({
          filePath,
          sessionTtlMs: 3600000,
          sessionIdleTtlMs: 0,
          loginTicketTtlMs: 600000,
          auditAppendOnly: true,
          auditMaxEntries: 5000,
        });
        const ev = await store.addAuditEvent({
          action: 'observability.invalid_header_correlation',
          outcome: 'success',
          metadata: {},
        });
        assert.equal(ev.metadata.correlationId, req.correlationId);
        assert.notEqual(ev.metadata.correlationId, 'bad!!!');
        assert.match(ev.metadata.correlationId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
  await fs.rm(tempDir, { recursive: true, force: true });
});
