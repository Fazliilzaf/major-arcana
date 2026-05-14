const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');

const { createAlertNotifier } = require('../../src/ops/alertNotifier');

test('createAlertNotifier is disabled without webhookUrl', async () => {
  const notifier = createAlertNotifier({});
  assert.equal(notifier.enabled, false);
  const out = await notifier.send({ eventType: 'test.event', tenantId: 't1', severity: 'warn', payload: { a: 1 } });
  assert.equal(out.skipped, true);
  assert.equal(out.reason, 'disabled');
});

test('createAlertNotifier POSTs JSON envelope and optional HMAC signature', async () => {
  const secret = 'test-secret';
  let receivedBody = '';
  let receivedSig = '';

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end();
      return;
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      receivedBody = Buffer.concat(chunks).toString('utf8');
      receivedSig = String(req.headers['x-arcana-signature'] || '');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });

  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', resolve);
    server.on('error', reject);
  });

  const { port } = server.address();
  const notifier = createAlertNotifier({
    webhookUrl: `http://127.0.0.1:${port}/hook`,
    webhookSecret: secret,
    webhookTimeoutMs: 8000,
  });

  const payload = { incidentId: 'inc-1', reason: 'breach' };
  const result = await notifier.send({
    eventType: 'sla.breach',
    tenantId: 'tenant-a',
    severity: 'critical',
    payload,
  });

  assert.equal(result.skipped, false);
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);

  const parsed = JSON.parse(receivedBody);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.eventType, 'sla.breach');
  assert.equal(parsed.tenantId, 'tenant-a');
  assert.equal(parsed.severity, 'critical');
  assert.deepEqual(parsed.payload, payload);
  assert.ok(typeof parsed.sentAt === 'string' && parsed.sentAt.length > 10);

  const expectedDigest = crypto.createHmac('sha256', secret).update(receivedBody).digest('hex');
  assert.equal(receivedSig, `sha256=${expectedDigest}`);

  await new Promise((resolve) => server.close(resolve));
});

test('createAlertNotifier reports failure on non-2xx response', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(503, { 'content-type': 'text/plain' });
    res.end('unavailable');
  });

  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', resolve);
    server.on('error', reject);
  });

  const { port } = server.address();
  const notifier = createAlertNotifier({
    webhookUrl: `http://127.0.0.1:${port}/hook`,
  });

  const result = await notifier.send({ eventType: 'ping', severity: 'info', payload: {} });
  assert.equal(result.skipped, false);
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);

  await new Promise((resolve) => server.close(resolve));
});

test('createAlertNotifier surfaces fetch errors', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('network_down');
  };

  try {
    const notifier = createAlertNotifier({
      webhookUrl: 'http://127.0.0.1:9/nope',
      logger: { error: () => {} },
    });
    const result = await notifier.send({ eventType: 'ping' });
    assert.equal(result.ok, false);
    assert.equal(result.skipped, false);
    assert.match(String(result.error || ''), /network_down/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('createAlertNotifier clamps webhookTimeoutMs to 500–15000', () => {
  const low = createAlertNotifier({ webhookUrl: 'http://example.com/h', webhookTimeoutMs: 100 });
  assert.equal(low.timeoutMs, 500);
  const high = createAlertNotifier({ webhookUrl: 'http://example.com/h', webhookTimeoutMs: 999999 });
  assert.equal(high.timeoutMs, 15000);
});

test('createAlertNotifier skips when global fetch is not a function', async () => {
  const originalFetch = global.fetch;
  global.fetch = null;
  try {
    const notifier = createAlertNotifier({ webhookUrl: 'http://127.0.0.1:1/hook' });
    const out = await notifier.send({ eventType: 'ping' });
    assert.equal(out.skipped, true);
    assert.equal(out.reason, 'fetch_unavailable');
  } finally {
    global.fetch = originalFetch;
  }
});

test('createAlertNotifier omits signature when secret empty and normalizes envelope', async () => {
  let receivedBody = '';
  let sigHeader = null;

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      receivedBody = Buffer.concat(chunks).toString('utf8');
      sigHeader = req.headers['x-arcana-signature'];
      res.writeHead(204);
      res.end();
    });
  });

  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', resolve);
    server.on('error', reject);
  });

  const { port } = server.address();
  const notifier = createAlertNotifier({
    webhookUrl: `http://127.0.0.1:${port}/hook`,
    webhookSecret: '   ',
  });

  await notifier.send({
    eventType: '  ',
    tenantId: '  ',
    severity: '  ',
    payload: 'not-an-object',
  });

  assert.equal(sigHeader, undefined);
  const parsed = JSON.parse(receivedBody);
  assert.equal(parsed.eventType, 'unknown');
  assert.equal(parsed.tenantId, null);
  assert.equal(parsed.severity, 'info');
  assert.deepEqual(parsed.payload, {});

  await new Promise((resolve) => server.close(resolve));
});

test('createAlertNotifier treats NaN webhookTimeoutMs as default 4000', () => {
  const n = createAlertNotifier({
    webhookUrl: 'http://example.com/h',
    webhookTimeoutMs: Number.NaN,
  });
  assert.equal(n.timeoutMs, 4000);
});

test('createAlertNotifier disables whitespace-only webhookUrl', () => {
  const n = createAlertNotifier({ webhookUrl: '  \t  ' });
  assert.equal(n.enabled, false);
  assert.equal(n.webhookUrl, null);
});

test('createAlertNotifier logs fetch failures through injected logger', async () => {
  const originalFetch = global.fetch;
  const errors = [];
  global.fetch = async () => {
    throw new Error('boom');
  };
  try {
    const notifier = createAlertNotifier({
      webhookUrl: 'http://127.0.0.1:9/x',
      logger: { error: (tag, msg) => errors.push(String(tag), String(msg)) },
    });
    await notifier.send({ eventType: 'ping' });
    assert.ok(errors.some((line) => line.includes('boom')));
    assert.ok(errors.some((line) => line.includes('send_failed')));
  } finally {
    global.fetch = originalFetch;
  }
});

test('createAlertNotifier treats 204 as successful delivery', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(204);
    res.end();
  });
  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', resolve);
    server.on('error', reject);
  });
  const { port } = server.address();
  const notifier = createAlertNotifier({ webhookUrl: `http://127.0.0.1:${port}/hook` });
  const result = await notifier.send({ eventType: 'noop', severity: 'info', payload: {} });
  assert.equal(result.skipped, false);
  assert.equal(result.ok, true);
  assert.equal(result.status, 204);
  await new Promise((resolve) => server.close(resolve));
});

test('createAlertNotifier trimmar webhookUrl', () => {
  const n = createAlertNotifier({ webhookUrl: '  http://example.com/hook  ' });
  assert.equal(n.enabled, true);
  assert.equal(n.webhookUrl, 'http://example.com/hook');
});

test('createAlertNotifier klampar negativ webhookTimeoutMs uppåt till 500', () => {
  const n = createAlertNotifier({
    webhookUrl: 'http://example.com/h',
    webhookTimeoutMs: -100,
  });
  assert.equal(n.timeoutMs, 500);
});

test('createAlertNotifier sanitizeError för icke-Error throw', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw { code: 'EPIPE' };
  };
  try {
    const notifier = createAlertNotifier({
      webhookUrl: 'http://127.0.0.1:9/x',
      logger: { error: () => {} },
    });
    const result = await notifier.send({ eventType: 'ping' });
    assert.equal(result.ok, false);
    assert.equal(result.error, '[object Object]');
  } finally {
    global.fetch = originalFetch;
  }
});
