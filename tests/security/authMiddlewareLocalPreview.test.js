const test = require('node:test');
const assert = require('node:assert/strict');

const { createAuthMiddleware } = require('../../src/security/authMiddleware');

function createReq({
  authorization = '',
  xAuthToken = '',
  cookie = '',
  host = 'localhost:3000',
  ip = '127.0.0.1',
} = {}) {
  const headers = {
    authorization,
    'x-auth-token': xAuthToken,
    cookie,
    host,
  };
  return {
    hostname: host.split(':')[0],
    ip,
    socket: { remoteAddress: ip },
    get(name) {
      return headers[String(name || '').toLowerCase()] || '';
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

test('localhost preview without token gets a synthetic auth context', async () => {
  const authStore = {
    async getSessionContextByToken() {
      return null;
    },
    async touchSession() {
      throw new Error('touchSession should not be called for preview auth');
    },
  };
  const middleware = createAuthMiddleware({
    authStore,
    config: {
      defaultTenantId: 'hair-tp-clinic',
      bootstrapOwnerEmail: 'fazli@hairtpclinic.com',
    },
    previewAuthContext: {
      user: { id: 'user-bootstrap', email: 'fazli@hairtpclinic.com', displayName: 'Fazli' },
      membership: {
        id: 'membership-bootstrap',
        tenantId: 'hair-tp-clinic',
        userId: 'user-bootstrap',
        role: 'OWNER',
      },
    },
  });

  const req = createReq();
  const res = createRes();
  let nextCalled = false;
  await middleware.requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(req.auth.authMode, 'preview_local');
  assert.equal(req.auth.tenantId, 'hair-tp-clinic');
  assert.equal(req.auth.role, 'OWNER');
  assert.equal(req.currentUser.id, 'user-bootstrap');
  assert.equal(req.currentMembership.id, 'membership-bootstrap');
  assert.equal(req.currentSession.isPreview, true);
});

test('localhost preview falls back to synthetic auth when token is invalid', async () => {
  const authStore = {
    async getSessionContextByToken() {
      return null;
    },
    async touchSession() {
      throw new Error('touchSession should not be called for preview auth');
    },
  };
  const middleware = createAuthMiddleware({
    authStore,
    config: { defaultTenantId: 'hair-tp-clinic' },
    previewAuthContext: {
      user: { id: 'user-bootstrap', email: 'fazli@hairtpclinic.com', displayName: 'Fazli' },
      membership: {
        id: 'membership-bootstrap',
        tenantId: 'hair-tp-clinic',
        userId: 'user-bootstrap',
        role: 'OWNER',
      },
    },
  });

  const req = createReq({ authorization: 'Bearer expired-token' });
  const res = createRes();
  let nextCalled = false;
  await middleware.requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(req.auth.authMode, 'preview_local');
});

test('non-local requests without a token still require login', async () => {
  const authStore = {
    async getSessionContextByToken() {
      return null;
    },
    async touchSession() {
      throw new Error('touchSession should not be called for missing token');
    },
  };
  const middleware = createAuthMiddleware({
    authStore,
    config: { defaultTenantId: 'hair-tp-clinic' },
  });

  const req = createReq({ host: 'example.com', ip: '203.0.113.10' });
  const res = createRes();
  let nextCalled = false;
  await middleware.requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Inloggning krävs.' });
});

test('valid token still uses the real session context', async () => {
  let touchedSessionId = '';
  const authStore = {
    async getSessionContextByToken(token) {
      if (token === 'good-token') {
        return {
          session: { id: 'session-1' },
          user: { id: 'user-1', email: 'fazli@hairtpclinic.com' },
          membership: { id: 'membership-1', tenantId: 'hair-tp-clinic', role: 'OWNER' },
        };
      }
      return null;
    },
    async touchSession(sessionId) {
      touchedSessionId = sessionId;
    },
  };
  const middleware = createAuthMiddleware({
    authStore,
    config: { defaultTenantId: 'hair-tp-clinic' },
  });

  const req = createReq({ authorization: 'Bearer good-token', host: 'localhost:3000' });
  const res = createRes();
  let nextCalled = false;
  await middleware.requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(touchedSessionId, 'session-1');
  assert.equal(req.auth.sessionId, 'session-1');
  assert.equal(req.auth.authMode, undefined);
  assert.equal(req.currentUser.id, 'user-1');
});

test('cookie token can restore a real session context for non-local requests', async () => {
  let touchedSessionId = '';
  const authStore = {
    async getSessionContextByToken(token) {
      if (token === 'cookie-token') {
        return {
          session: { id: 'session-cookie' },
          user: { id: 'user-cookie', email: 'fazli@hairtpclinic.com' },
          membership: { id: 'membership-cookie', tenantId: 'hair-tp-clinic', role: 'OWNER' },
        };
      }
      return null;
    },
    async touchSession(sessionId) {
      touchedSessionId = sessionId;
    },
  };
  const middleware = createAuthMiddleware({
    authStore,
    config: { defaultTenantId: 'hair-tp-clinic' },
  });

  const req = createReq({
    cookie: 'other=1; ARCANA_ADMIN_TOKEN=cookie-token; theme=light',
    host: 'arcana-staging.onrender.com',
    ip: '203.0.113.10',
  });
  const res = createRes();
  let nextCalled = false;
  await middleware.requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(touchedSessionId, 'session-cookie');
  assert.equal(req.auth.sessionId, 'session-cookie');
  assert.equal(req.currentUser.id, 'user-cookie');
});
