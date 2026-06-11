const test = require('node:test');
const assert = require('node:assert/strict');

const { createAuthMiddleware } = require('../../src/security/authMiddleware');

function createReq({
  authorization = '',
  xAuthToken = '',
  host = 'localhost:3000',
  ip = '127.0.0.1',
  path = '/',
  originalUrl = '',
} = {}) {
  const headers = {
    authorization,
    'x-auth-token': xAuthToken,
    host,
  };
  return {
    hostname: host.split(':')[0],
    ip,
    path,
    originalUrl: originalUrl || path,
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

test('machine token authenticates scoped orchestrator requests without session lookup', async () => {
  let sessionLookupCalled = false;
  const authStore = {
    async getSessionContextByToken() {
      sessionLookupCalled = true;
      return null;
    },
    async touchSession() {
      throw new Error('touchSession should not be called for machine tokens');
    },
  };
  const token = 'mach_12345678901234567890123456789012';
  const middleware = createAuthMiddleware({
    authStore,
    config: {
      machineTokensJson: JSON.stringify([
        {
          token,
          tenantId: 'hair-tp-clinic',
          role: 'STAFF',
          label: 'ceo-agent',
          userId: 'machine:ceo-agent',
          allowPaths: ['/api/v1/orchestrator'],
        },
      ]),
    },
  });

  const req = createReq({
    authorization: `Bearer ${token}`,
    host: 'arcana.hairtpclinic.com',
    ip: '198.51.100.10',
    path: '/orchestrator/admin-run',
    originalUrl: '/api/v1/orchestrator/admin-run',
  });
  const res = createRes();
  let nextCalled = false;
  await middleware.requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(sessionLookupCalled, false);
  assert.equal(res.statusCode, 200);
  assert.equal(req.auth.authMode, 'machine_token');
  assert.equal(req.auth.tenantId, 'hair-tp-clinic');
  assert.equal(req.auth.role, 'STAFF');
  assert.equal(req.currentUser.isMachine, true);
  assert.equal(req.currentSession.isMachine, true);
});

test('machine token is denied outside its allowPaths', async () => {
  let sessionLookupToken = '';
  const authStore = {
    async getSessionContextByToken(token) {
      sessionLookupToken = token;
      return null;
    },
    async touchSession() {},
  };
  const token = 'mach_abcdefghijklmnopqrstuvwxyz123456';
  const middleware = createAuthMiddleware({
    authStore,
    config: {
      machineTokensJson: JSON.stringify([{ token, tenantId: 'hair-tp-clinic', role: 'STAFF' }]),
    },
  });

  const req = createReq({
    authorization: `Bearer ${token}`,
    host: 'arcana.hairtpclinic.com',
    ip: '198.51.100.10',
    path: '/cco-patient-master/patients',
    originalUrl: '/api/v1/cco-patient-master/patients',
  });
  const res = createRes();
  let nextCalled = false;
  await middleware.requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(sessionLookupToken, token);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Sessionen är ogiltig eller har gått ut.' });
});

test('non-local x-auth-token authenticates when bearer header absent', async () => {
  let seenToken = '';
  const authStore = {
    async getSessionContextByToken(token) {
      seenToken = token;
      if (token === 'header-token') {
        return {
          session: { id: 's2' },
          user: { id: 'u2', email: 'a@b.com' },
          membership: { id: 'm2', tenantId: 'tenant-x', role: 'STAFF' },
        };
      }
      return null;
    },
    async touchSession() {},
  };
  const middleware = createAuthMiddleware({ authStore, config: {} });
  const req = createReq({
    host: 'app.example.com',
    ip: '198.51.100.2',
    authorization: '',
    xAuthToken: '  header-token  ',
  });
  const res = createRes();
  let nextCalled = false;
  await middleware.requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(seenToken, 'header-token');
  assert.equal(req.auth.tenantId, 'tenant-x');
  assert.equal(req.auth.role, 'STAFF');
});

test('bearer prefix is case-insensitive for token extraction', async () => {
  const authStore = {
    async getSessionContextByToken(token) {
      if (token === 'tok') {
        return {
          session: { id: 's3' },
          user: { id: 'u3', email: 'c@d.com' },
          membership: { id: 'm3', tenantId: 't3', role: 'OWNER' },
        };
      }
      return null;
    },
    async touchSession() {},
  };
  const middleware = createAuthMiddleware({ authStore, config: {} });
  const req = createReq({
    authorization: 'BeArEr tok',
    host: 'remote.example',
    ip: '198.51.100.3',
  });
  const res = createRes();
  await middleware.requireAuth(req, res, () => {});
  assert.equal(req.auth.userId, 'u3');
});

test('requireRole returns 403 when membership role not allowed', () => {
  const authStore = {
    async getSessionContextByToken() {
      return null;
    },
    async touchSession() {},
  };
  const middleware = createAuthMiddleware({ authStore, config: {} });
  const guard = middleware.requireRole('OWNER');
  const req = { auth: { role: 'STAFF' } };
  const res = createRes();
  let nextCalled = false;
  guard(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'Du saknar behörighet för detta.' });
});

test('requireTenantScope optional skips when tenant param missing', async () => {
  const authStore = {
    async getSessionContextByToken() {
      return null;
    },
    async touchSession() {},
  };
  const middleware = createAuthMiddleware({ authStore, config: {} });
  const guard = middleware.requireTenantScope({ optional: true });
  const req = { auth: { tenantId: 'alpha' }, params: {}, query: {}, body: {} };
  const res = createRes();
  let nextCalled = false;
  await guard(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test('requireTenantScope denies cross-tenant access', async () => {
  const audit = [];
  const authStore = {
    async getSessionContextByToken() {
      return null;
    },
    async touchSession() {},
    async addAuditEvent(entry) {
      audit.push(entry);
    },
  };
  const middleware = createAuthMiddleware({ authStore, config: {} });
  const guard = middleware.requireTenantScope({ optional: false });
  const req = {
    auth: { tenantId: 'alpha', userId: 'u1' },
    params: { tenantId: 'beta' },
    path: '/v1/x',
  };
  const res = createRes();
  let nextCalled = false;
  await guard(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, 'tenant.scope.denied');
});

test('staff journal open access accepts mounted router paths without token', async () => {
  const authStore = {
    async getSessionContextByToken() {
      return null;
    },
    async touchSession() {
      throw new Error('touchSession should not be called for open access');
    },
  };
  const middleware = createAuthMiddleware({
    authStore,
    config: {
      defaultTenantId: 'hair-tp-clinic',
      staffJournalOpenAccess: true,
    },
  });

  const req = createReq({
    host: 'arcana.hairtpclinic.se',
    ip: '203.0.113.10',
    path: '/cco-patient-master/patients',
    originalUrl: '/api/v1/cco-patient-master/patients?limit=1',
  });
  const res = createRes();
  let nextCalled = false;
  await middleware.requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(req.auth.authMode, 'preview_local');
  assert.equal(req.auth.tenantId, 'hair-tp-clinic');
});
