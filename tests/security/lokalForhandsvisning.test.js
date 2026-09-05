'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  isTrustedLocalPeer,
  isLocalPreviewRequest,
  isLocalPreviewAllowed,
} = require('../../src/security/lokalForhandsvisning');
const { createAuthMiddleware } = require('../../src/security/authMiddleware');

const REPO_ROOT = path.join(__dirname, '..', '..');
const SRC_DIR = path.join(REPO_ROOT, 'src');
const CANONICAL = path.join(SRC_DIR, 'security', 'lokalForhandsvisning.js');

// Modellerar Express med `trust proxy`: req.ip/hostname reflekterar
// X-Forwarded-For / X-Forwarded-Host, medan req.socket.remoteAddress är den
// verkliga TCP-peern.
function createReq({
  socketRemoteAddress = '203.0.113.10',
  ip = '127.0.0.1',
  hostname = 'localhost',
  headers = {},
  authorization = '',
  xAuthToken = '',
  path = '/',
} = {}) {
  const h = {
    host: hostname,
    'x-forwarded-for': ip,
    'x-forwarded-host': hostname,
    authorization,
    'x-auth-token': xAuthToken,
    ...headers,
  };
  return {
    socket: { remoteAddress: socketRemoteAddress },
    ip,
    hostname,
    path,
    originalUrl: path,
    headers: h,
    get(name) {
      return h[String(name).toLowerCase()] || '';
    },
  };
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

// ---------- FUNKTIONELLA INVARIANTER ----------

test('T-001: spoofed X-Forwarded-For does not grant local preview', () => {
  const req = createReq({ socketRemoteAddress: '203.0.113.10', ip: '127.0.0.1' });
  assert.equal(isLocalPreviewAllowed(req, {}), false);
  assert.equal(isLocalPreviewRequest(req), false);
  assert.equal(isTrustedLocalPeer(req), false);
});

test('T-002: spoofed Host does not grant local preview', () => {
  const req = createReq({ socketRemoteAddress: '203.0.113.10', hostname: 'localhost' });
  assert.equal(isLocalPreviewAllowed(req, {}), false);
  assert.equal(isLocalPreviewRequest(req), false);
});

test('T-003: spoofed X-Forwarded-Host does not grant local preview', () => {
  const req = createReq({
    socketRemoteAddress: '203.0.113.10',
    headers: { 'x-forwarded-host': 'localhost' },
  });
  assert.equal(isLocalPreviewAllowed(req, {}), false);
  assert.equal(isLocalPreviewRequest(req), false);
});

test('T-004: combined spoof (XFF + Host + X-Forwarded-Host) does not grant local preview', () => {
  const req = createReq({
    socketRemoteAddress: '203.0.113.10',
    ip: '127.0.0.1',
    hostname: 'localhost',
    headers: {
      'x-forwarded-for': '127.0.0.1',
      'x-forwarded-host': 'localhost',
      host: 'localhost',
    },
  });
  assert.equal(isLocalPreviewAllowed(req, {}), false);
  assert.equal(isLocalPreviewRequest(req), false);
});

test('T-005: production __preview_local__ token never elevates (even from loopback)', async () => {
  const authStore = {
    async getSessionContextByToken() {
      return null;
    },
    async touchSession() {
      throw new Error('touchSession should not be called');
    },
  };
  const middleware = createAuthMiddleware({
    authStore,
    config: { defaultTenantId: 'hair-tp-clinic', isProduction: true },
  });
  const req = createReq({
    socketRemoteAddress: '127.0.0.1',
    ip: '127.0.0.1',
    hostname: 'localhost',
    authorization: 'Bearer __preview_local__',
    path: '/api/v1/cco-workspace/bootstrap',
  });
  const res = createRes();
  let nextCalled = false;
  await middleware.requireAuth(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(req.auth, undefined);
});

test('T-006: genuine development loopback is allowed', () => {
  for (const peer of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    const req = createReq({ socketRemoteAddress: peer, ip: peer, hostname: 'localhost' });
    assert.equal(isLocalPreviewAllowed(req, { isProduction: false }), true, `peer=${peer}`);
    assert.equal(isLocalPreviewRequest(req), true, `peer=${peer}`);
  }
});

test('T-007: production genuine loopback is denied', () => {
  const req = createReq({
    socketRemoteAddress: '127.0.0.1',
    ip: '127.0.0.1',
    hostname: 'localhost',
  });
  assert.equal(isLocalPreviewAllowed(req, { isProduction: true }), false);
});

test('T-008: missing trustworthy peer fails closed', () => {
  const req = {
    socket: undefined,
    ip: '127.0.0.1',
    hostname: 'localhost',
    get() {
      return '';
    },
  };
  assert.equal(isLocalPreviewAllowed(req, {}), false);
  assert.equal(isLocalPreviewRequest(req), false);
  assert.equal(isTrustedLocalPeer(req), false);
});

test('T-009: legitimate authenticated flow remains functional', async () => {
  const authStore = {
    async getSessionContextByToken(token) {
      if (token === 'good-token') {
        return {
          session: { id: 's1' },
          user: { id: 'u1', email: 'a@b.com' },
          membership: { id: 'm1', tenantId: 't1', role: 'OWNER' },
        };
      }
      return null;
    },
    async touchSession() {},
  };
  const middleware = createAuthMiddleware({ authStore, config: {} });
  const req = createReq({
    socketRemoteAddress: '203.0.113.10',
    ip: '203.0.113.10',
    hostname: 'app.example.com',
    authorization: 'Bearer good-token',
    path: '/api/v1/some-path',
  });
  const res = createRes();
  await middleware.requireAuth(req, res, () => {});
  assert.equal(res.statusCode, 200);
  assert.equal(req.auth.userId, 'u1');
  assert.equal(req.auth.authMode, undefined);
});

// ---------- STRUKTURELLA INVARIANTER ----------

const EXPECTED_CALLERS = [
  'src/security/authMiddleware.js',
  'src/routes/ccoRouteShared.js',
  'src/routes/ccoBookings.js',
  'src/routes/ccoBookingEngine.js',
  'src/routes/postOpReview.js',
];

function readRepoFile(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

function walkJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...walkJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

test('T-010: all known callers delegate to the canonical implementation', () => {
  for (const rel of EXPECTED_CALLERS) {
    const content = readRepoFile(rel);
    assert.ok(content.includes('lokalForhandsvisning'), `${rel} does not require the canonical module`);
    assert.ok(
      !/function isLocalPreviewRequest\b/.test(content),
      `${rel} still defines its own isLocalPreviewRequest`
    );
  }
});

test('T-011: no parallel loopback-peer locality truth remains outside the canonical module', () => {
  const matches = [];
  for (const file of walkJsFiles(SRC_DIR)) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('::ffff:127.0.0.1')) matches.push(file);
  }
  assert.deepEqual(
    matches,
    [CANONICAL],
    `loopback-peer literal outside canonical module: ${matches.join(', ')}`
  );
});

test('T-012: repository search finds no additional duplicate isLocalPreviewRequest', () => {
  const matches = [];
  for (const file of walkJsFiles(SRC_DIR)) {
    const content = fs.readFileSync(file, 'utf8');
    if (/function isLocalPreviewRequest\b/.test(content)) matches.push(file);
  }
  assert.deepEqual(
    matches,
    [CANONICAL],
    `duplicate isLocalPreviewRequest in: ${matches.join(', ')}`
  );
});

test('T-013: call-site inventory is non-empty and complete', () => {
  assert.ok(EXPECTED_CALLERS.length > 0, 'call-site inventory is empty — structural guard tripped');
  for (const rel of EXPECTED_CALLERS) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, rel)), `missing caller file: ${rel}`);
  }
});
