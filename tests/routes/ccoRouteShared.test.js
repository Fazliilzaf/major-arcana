'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveCcoRouteActor } = require('../../src/routes/ccoRouteShared');

test('resolveCcoRouteActor reuses req.auth from open-access middleware', async () => {
  const req = {
    auth: {
      tenantId: 'hair-tp-clinic',
      userId: 'preview-local-user',
      role: 'OWNER',
      authMode: 'preview_local',
    },
    get() {
      return '';
    },
  };
  const actor = await resolveCcoRouteActor(req, {
    authStore: {
      async getSessionContextByToken() {
        throw new Error('should not resolve token when req.auth exists');
      },
      async touchSession() {
        throw new Error('should not touch session when req.auth exists');
      },
    },
    config: { defaultTenantId: 'hair-tp-clinic', staffJournalOpenAccess: true },
  });

  assert.deepEqual(actor, {
    tenantId: 'hair-tp-clinic',
    userId: 'preview-local-user',
    role: 'OWNER',
    authMode: 'preview_local',
  });
});
