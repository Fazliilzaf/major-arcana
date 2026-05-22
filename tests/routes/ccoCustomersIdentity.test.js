const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoCustomersRouter } = require('../../src/routes/ccoCustomers');
const { createCcoCustomerStore } = require('../../src/ops/ccoCustomerStore');
const { createCcoHistoryStore } = require('../../src/ops/ccoHistoryStore');

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

async function createFixture({ withHistory = false } = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-customers-identity-'));
  const historyStore = withHistory
    ? await createCcoHistoryStore({
        filePath: path.join(tempDir, 'history.json'),
      })
    : null;
  const customerStore = await createCcoCustomerStore({
    filePath: path.join(tempDir, 'customers.json'),
    historyStore,
  });
  const auditEvents = [];

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = {
      tenantId: 'tenant-a',
      userId: 'owner-1',
      role: 'owner',
    };
    next();
  });
  app.use(
    '/api/v1',
    createCcoCustomersRouter({
      customerStore,
      authStore: {
        async addAuditEvent(event) {
          auditEvents.push(event);
          return true;
        },
      },
      requireAuth(_req, _res, next) {
        next();
      },
      requireRole() {
        return (_req, _res, next) => next();
      },
    })
  );

  return {
    app,
    tempDir,
    customerStore,
    historyStore,
    auditEvents,
  };
}

async function seedCrossMailboxState(customerStore) {
  await customerStore.saveTenantCustomerState({
    tenantId: 'tenant-a',
    customerState: {
      directory: {
        anna_main: {
          name: 'Anna Karlsson',
          vip: false,
          emailCoverage: 1,
          duplicateCandidate: false,
          profileCount: 1,
          customerValue: 0,
          totalConversations: 3,
          totalMessages: 8,
        },
        anna_alt: {
          name: 'Anna Karlsson',
          vip: true,
          emailCoverage: 1,
          duplicateCandidate: false,
          profileCount: 1,
          customerValue: 0,
          totalConversations: 2,
          totalMessages: 4,
        },
      },
      details: {
        anna_main: {
          emails: ['anna.one@example.com'],
          phone: '0701234567',
          mailboxes: ['kons', 'shared'],
        },
        anna_alt: {
          emails: ['anna.one+vip@gmail.com'],
          phone: '0701234567',
          mailboxes: ['contact', 'shared'],
        },
      },
      identityByKey: {
        anna_main: {
          customerKey: 'anna_main',
          customerName: 'Anna Karlsson',
          identitySource: 'history',
          identityConfidence: 'derived',
          provenance: {
            source: 'history',
            mailboxIds: ['kons', 'shared'],
            conversationIds: ['shared-thread'],
            sourceRecordIds: ['anna_main'],
          },
        },
        anna_alt: {
          customerKey: 'anna_alt',
          customerName: 'Anna Karlsson',
          identitySource: 'history',
          identityConfidence: 'derived',
          provenance: {
            source: 'history',
            mailboxIds: ['contact', 'shared'],
            conversationIds: ['shared-thread'],
            sourceRecordIds: ['anna_alt'],
          },
        },
      },
      profileCounts: {
        anna_main: 1,
        anna_alt: 1,
      },
      primaryEmailByKey: {
        anna_main: 'anna.one@example.com',
        anna_alt: 'anna.one+vip@gmail.com',
      },
    },
  });
}

test('cco customer identity suggestions hittar samma kund over flera inboxar och mejladresser', async () => {
  const fixture = await createFixture();

  try {
    await seedCrossMailboxState(fixture.customerStore);

    await withServer(fixture.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/cco/customers/identity/suggestions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.duplicateCount, 1);
      assert.equal(Array.isArray(payload.suggestionGroups.anna_main), true);
      assert.equal(payload.suggestionGroups.anna_main.length, 1);
      assert.equal(payload.suggestionGroups.anna_main[0].decision, 'SUGGEST_FOR_REVIEW');
      assert.equal(typeof payload.suggestionGroups.anna_main[0].pairId, 'string');
      assert.equal(payload.suggestionGroups.anna_main[0].pairId.length > 0, true);
      assert.equal(
        payload.suggestionGroups.anna_main[0].reasons.some((reason) =>
          /telefonnummer|inboxar|kundnamn/i.test(reason)
        ),
        true
      );
    });

    assert.equal(
      fixture.auditEvents.some((event) => event.action === 'cco.customers.identity.suggestions'),
      true
    );
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco customer identity bevarar bara backend-canonical och nollar derived canonical', async () => {
  const fixture = await createFixture();

  try {
    await fixture.customerStore.saveTenantCustomerState({
      tenantId: 'tenant-a',
      customerState: {
        directory: {
          derived_demo: {
            name: 'Deriverad Kund',
            vip: false,
            emailCoverage: 1,
            duplicateCandidate: false,
            profileCount: 1,
            customerValue: 0,
            totalConversations: 1,
            totalMessages: 1,
          },
          backend_demo: {
            name: 'Backend Kund',
            vip: false,
            emailCoverage: 1,
            duplicateCandidate: false,
            profileCount: 1,
            customerValue: 0,
            totalConversations: 1,
            totalMessages: 1,
          },
        },
        details: {
          derived_demo: {
            emails: ['derived.demo@example.com'],
            phone: '0700000001',
            mailboxes: ['kons'],
          },
          backend_demo: {
            emails: ['backend.demo@example.com'],
            phone: '0700000002',
            mailboxes: ['contact'],
          },
        },
        identityByKey: {
          derived_demo: {
            customerKey: 'derived_demo',
            customerName: 'Deriverad Kund',
            customerEmail: 'derived.demo@example.com',
            canonicalCustomerId: 'cust-derived',
            canonicalContactId: 'contact-derived',
            explicitMergeGroupId: 'merge-derived',
            verifiedPersonalEmailNormalized: 'verified.derived@example.com',
            verifiedPhoneE164: '+46700000001',
            identitySource: 'derived',
            identityConfidence: 'derived',
            provenance: {
              source: 'derived',
              mailboxIds: ['kons'],
              sourceRecordIds: ['derived_demo'],
            },
          },
          backend_demo: {
            customerKey: 'backend_demo',
            customerName: 'Backend Kund',
            customerEmail: 'backend.demo@example.com',
            canonicalCustomerId: 'cust-backend',
            canonicalContactId: 'contact-backend',
            explicitMergeGroupId: 'merge-backend',
            verifiedPersonalEmailNormalized: 'verified.backend@example.com',
            verifiedPhoneE164: '+46700000002',
            identitySource: 'backend',
            identityConfidence: 'strong',
            provenance: {
              source: 'backend',
              mailboxIds: ['contact'],
              sourceRecordIds: ['backend_demo'],
            },
          },
        },
        primaryEmailByKey: {
          derived_demo: 'derived.demo@example.com',
          backend_demo: 'backend.demo@example.com',
        },
      },
    });

    const customerState = await fixture.customerStore.getTenantCustomerState({
      tenantId: 'tenant-a',
    });

    assert.equal(customerState.identityByKey.derived_demo.canonicalCustomerId, null);
    assert.equal(customerState.identityByKey.derived_demo.canonicalContactId, null);
    assert.equal(customerState.identityByKey.derived_demo.explicitMergeGroupId, null);
    assert.equal(customerState.identityByKey.backend_demo.canonicalCustomerId, 'cust-backend');
    assert.equal(customerState.identityByKey.backend_demo.canonicalContactId, 'contact-backend');
    assert.equal(customerState.identityByKey.backend_demo.explicitMergeGroupId, 'merge-backend');
    assert.equal(
      customerState.identityByKey.backend_demo.verifiedPersonalEmailNormalized,
      'verified.backend@example.com'
    );
    assert.equal(customerState.identityByKey.backend_demo.verifiedPhoneE164, '+46700000002');
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco customer identity merge sparar canonical pair id och slar ihop mailboxhistorik', async () => {
  const fixture = await createFixture();

  try {
    await seedCrossMailboxState(fixture.customerStore);

    await withServer(fixture.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/cco/customers/identity/merge`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          primaryKey: 'anna_main',
          secondaryKeys: ['anna_alt'],
          suggestionId: 'anna_alt::anna_main',
        }),
      });

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.customerState.mergedInto.anna_alt, 'anna_main');
      assert.equal(
        Object.values(payload.customerState.mergeReviewDecisionsByPairId || {}).some(
          (entry) => entry.decision === 'approved'
        ),
        true
      );
      assert.deepEqual(payload.customerState.details.anna_main.emails.sort(), [
        'anna.one+vip@gmail.com',
        'anna.one@example.com',
      ]);
      assert.deepEqual(payload.customerState.details.anna_main.mailboxes.sort(), [
        'contact',
        'kons',
        'shared',
      ]);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco customer identity split och primary email kan persisteras via backend', async () => {
  const fixture = await createFixture();

  try {
    await fixture.customerStore.saveTenantCustomerState({
      tenantId: 'tenant-a',
      customerState: {
        directory: {
          anna_main: {
            name: 'Anna Karlsson',
            vip: false,
            emailCoverage: 2,
            duplicateCandidate: true,
            profileCount: 2,
            customerValue: 0,
            totalConversations: 4,
            totalMessages: 9,
          },
        },
        details: {
          anna_main: {
            emails: ['anna.one@example.com', 'anna.one+vip@gmail.com'],
            phone: '0701234567',
            mailboxes: ['kons', 'contact'],
          },
        },
        profileCounts: {
          anna_main: 2,
        },
        primaryEmailByKey: {
          anna_main: 'anna.one@example.com',
        },
      },
    });

    await withServer(fixture.app, async (baseUrl) => {
      const primaryResponse = await fetch(`${baseUrl}/cco/customers/identity/primary-email`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          customerKey: 'anna_main',
          email: 'anna.one+vip@gmail.com',
        }),
      });

      assert.equal(primaryResponse.status, 200);
      const primaryPayload = await primaryResponse.json();
      assert.equal(primaryPayload.customerState.primaryEmailByKey.anna_main, 'anna.one+vip@gmail.com');

      const splitResponse = await fetch(`${baseUrl}/cco/customers/identity/split`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          customerKey: 'anna_main',
          email: 'anna.one@example.com',
        }),
      });

      assert.equal(splitResponse.status, 200);
      const splitPayload = await splitResponse.json();
      assert.ok(splitPayload.newKey);
      assert.deepEqual(splitPayload.customerState.details.anna_main.emails, ['anna.one+vip@gmail.com']);
      assert.deepEqual(splitPayload.customerState.details[splitPayload.newKey].emails, ['anna.one@example.com']);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco customer identity review threshold är deterministisk runt under / på / över', async () => {
  const fixture = await createFixture();

  try {
    await fixture.customerStore.saveTenantCustomerState({
      tenantId: 'tenant-a',
      customerState: {
        directory: {
          under_a: {
            name: 'Maja Andersson',
            vip: false,
            emailCoverage: 1,
            duplicateCandidate: false,
            profileCount: 1,
            customerValue: 0,
            totalConversations: 1,
            totalMessages: 2,
          },
          under_b: {
            name: 'Maja Andersson',
            vip: false,
            emailCoverage: 1,
            duplicateCandidate: false,
            profileCount: 1,
            customerValue: 0,
            totalConversations: 1,
            totalMessages: 2,
          },
          exact_a: {
            name: 'Sara Lind',
            vip: false,
            emailCoverage: 1,
            duplicateCandidate: false,
            profileCount: 1,
            customerValue: 0,
            totalConversations: 1,
            totalMessages: 2,
          },
          exact_b: {
            name: 'Elsa Berg',
            vip: false,
            emailCoverage: 1,
            duplicateCandidate: false,
            profileCount: 1,
            customerValue: 0,
            totalConversations: 1,
            totalMessages: 2,
          },
          over_a: {
            name: 'Nora Dahl',
            vip: false,
            emailCoverage: 1,
            duplicateCandidate: false,
            profileCount: 1,
            customerValue: 0,
            totalConversations: 1,
            totalMessages: 2,
          },
          over_b: {
            name: 'Nora Dahl',
            vip: false,
            emailCoverage: 1,
            duplicateCandidate: false,
            profileCount: 1,
            customerValue: 0,
            totalConversations: 1,
            totalMessages: 2,
          },
        },
        details: {
          under_a: {
            emails: ['under.a@example.com'],
            phone: '0701111111',
            mailboxes: ['kons'],
          },
          under_b: {
            emails: ['under.b@example.com'],
            phone: '0701111111',
            mailboxes: ['contact'],
          },
          exact_a: {
            emails: ['exact@example.com'],
            phone: '0702222222',
            mailboxes: ['kons', 'shared'],
          },
          exact_b: {
            emails: ['exact+alt@example.com'],
            phone: '0702222222',
            mailboxes: ['contact', 'shared'],
          },
          over_a: {
            emails: ['over@example.com'],
            phone: '0703333333',
            mailboxes: ['kons', 'shared'],
          },
          over_b: {
            emails: ['over+alt@example.com'],
            phone: '0703333333',
            mailboxes: ['contact', 'shared'],
          },
        },
        identityByKey: {
          exact_a: {
            customerKey: 'exact_a',
            customerName: 'Sara Lind',
            identitySource: 'history',
            identityConfidence: 'derived',
            provenance: {
              source: 'history',
              mailboxIds: ['kons', 'shared'],
              conversationIds: ['shared-thread-exact'],
              sourceRecordIds: ['exact_a'],
            },
          },
          exact_b: {
            customerKey: 'exact_b',
            customerName: 'Elsa Berg',
            identitySource: 'history',
            identityConfidence: 'derived',
            provenance: {
              source: 'history',
              mailboxIds: ['contact', 'shared'],
              conversationIds: ['shared-thread-exact'],
              sourceRecordIds: ['exact_b'],
            },
          },
          over_a: {
            customerKey: 'over_a',
            customerName: 'Nora Dahl',
            identitySource: 'history',
            identityConfidence: 'derived',
            provenance: {
              source: 'history',
              mailboxIds: ['kons', 'shared'],
              conversationIds: ['shared-thread-over'],
              sourceRecordIds: ['over_a'],
            },
          },
          over_b: {
            customerKey: 'over_b',
            customerName: 'Nora Dahl',
            identitySource: 'history',
            identityConfidence: 'derived',
            provenance: {
              source: 'history',
              mailboxIds: ['contact', 'shared'],
              conversationIds: ['shared-thread-over'],
              sourceRecordIds: ['over_b'],
            },
          },
        },
        profileCounts: {
          under_a: 1,
          under_b: 1,
          exact_a: 1,
          exact_b: 1,
          over_a: 1,
          over_b: 1,
        },
        primaryEmailByKey: {
          under_a: 'under.a@example.com',
          under_b: 'under.b@example.com',
          exact_a: 'exact@example.com',
          exact_b: 'exact+alt@example.com',
          over_a: 'over@example.com',
          over_b: 'over+alt@example.com',
        },
      },
    });

    await withServer(fixture.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/cco/customers/identity/suggestions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      assert.equal(response.status, 200);
      const payload = await response.json();

      assert.equal(payload.suggestionGroups.under_a.length, 0);

      const exactSuggestion = payload.suggestionGroups.exact_a[0];
      assert.equal(exactSuggestion.decision, 'SUGGEST_FOR_REVIEW');
      assert.equal(exactSuggestion.score, 30);

      const overSuggestion = payload.suggestionGroups.over_a[0];
      assert.equal(overSuggestion.decision, 'SUGGEST_FOR_REVIEW');
      assert.equal(overSuggestion.score > 30, true);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco customer identity auto merge och hard conflict följer stark identitet', async () => {
  const fixture = await createFixture();

  try {
    await fixture.customerStore.saveTenantCustomerState({
      tenantId: 'tenant-a',
      customerState: {
        directory: {
          strong_a: {
            name: 'Stark Kund',
            vip: false,
            emailCoverage: 1,
            duplicateCandidate: false,
            profileCount: 1,
            customerValue: 0,
            totalConversations: 1,
            totalMessages: 1,
          },
          strong_b: {
            name: 'Stark Kund',
            vip: false,
            emailCoverage: 1,
            duplicateCandidate: false,
            profileCount: 1,
            customerValue: 0,
            totalConversations: 1,
            totalMessages: 1,
          },
          conflict_a: {
            name: 'Konflikt Kund',
            vip: false,
            emailCoverage: 1,
            duplicateCandidate: false,
            profileCount: 1,
            customerValue: 0,
            totalConversations: 1,
            totalMessages: 1,
          },
          conflict_b: {
            name: 'Konflikt Kund',
            vip: false,
            emailCoverage: 1,
            duplicateCandidate: false,
            profileCount: 1,
            customerValue: 0,
            totalConversations: 1,
            totalMessages: 1,
          },
        },
        details: {
          strong_a: {
            emails: ['strong.a@example.com'],
            phone: '0704444444',
            mailboxes: ['kons'],
          },
          strong_b: {
            emails: ['strong.b@example.com'],
            phone: '0705555555',
            mailboxes: ['contact'],
          },
          conflict_a: {
            emails: ['conflict@example.com'],
            phone: '0706666666',
            mailboxes: ['kons'],
          },
          conflict_b: {
            emails: ['conflict@example.com'],
            phone: '0706666666',
            mailboxes: ['contact'],
          },
        },
        identityByKey: {
          strong_a: {
            customerKey: 'strong_a',
            customerName: 'Stark Kund',
            canonicalCustomerId: 'cust-1',
            identitySource: 'backend',
            identityConfidence: 'strong',
            provenance: {
              source: 'backend',
              mailboxIds: ['kons'],
              sourceRecordIds: ['strong_a'],
            },
          },
          strong_b: {
            customerKey: 'strong_b',
            customerName: 'Stark Kund',
            canonicalCustomerId: 'cust-1',
            identitySource: 'backend',
            identityConfidence: 'strong',
            provenance: {
              source: 'backend',
              mailboxIds: ['contact'],
              sourceRecordIds: ['strong_b'],
            },
          },
          conflict_a: {
            customerKey: 'conflict_a',
            customerName: 'Konflikt Kund',
            canonicalCustomerId: 'cust-a',
            verifiedPersonalEmailNormalized: 'conflict@example.com',
            identitySource: 'backend',
            identityConfidence: 'strong',
            provenance: {
              source: 'backend',
              mailboxIds: ['kons'],
              sourceRecordIds: ['conflict_a'],
            },
          },
          conflict_b: {
            customerKey: 'conflict_b',
            customerName: 'Konflikt Kund',
            canonicalCustomerId: 'cust-b',
            verifiedPersonalEmailNormalized: 'conflict@example.com',
            identitySource: 'backend',
            identityConfidence: 'strong',
            provenance: {
              source: 'backend',
              mailboxIds: ['contact'],
              sourceRecordIds: ['conflict_b'],
            },
          },
        },
        profileCounts: {
          strong_a: 1,
          strong_b: 1,
          conflict_a: 1,
          conflict_b: 1,
        },
        primaryEmailByKey: {
          strong_a: 'strong.a@example.com',
          strong_b: 'strong.b@example.com',
          conflict_a: 'conflict@example.com',
          conflict_b: 'conflict@example.com',
        },
      },
    });

    await withServer(fixture.app, async (baseUrl) => {
      const autoResponse = await fetch(`${baseUrl}/cco/customers/identity/suggestions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      assert.equal(autoResponse.status, 200);
      const autoPayload = await autoResponse.json();
      assert.equal(autoPayload.suggestionGroups.strong_a[0].decision, 'AUTO_MERGE');
      assert.equal(autoPayload.suggestionGroups.strong_a[0].pairId.length > 0, true);

      const conflictPayload = autoPayload.suggestionGroups.conflict_a || [];
      assert.equal(conflictPayload.length, 0);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco customer identity dismiss blockerar samma pairId och öppnas igen när strong id ändras', async () => {
  const fixture = await createFixture();

  try {
    await seedCrossMailboxState(fixture.customerStore);

    await withServer(fixture.app, async (baseUrl) => {
      const previewResponse = await fetch(`${baseUrl}/cco/customers/identity/suggestions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      assert.equal(previewResponse.status, 200);
      const previewPayload = await previewResponse.json();
      const suggestion = previewPayload.suggestionGroups.anna_main[0];
      assert.ok(suggestion);

      const dismissResponse = await fetch(`${baseUrl}/cco/customers/identity/dismiss`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          suggestionId: suggestion.pairId,
        }),
      });
      assert.equal(dismissResponse.status, 200);
      const dismissPayload = await dismissResponse.json();
      assert.equal(dismissPayload.customerState.mergeReviewDecisionsByPairId[suggestion.pairId].decision, 'dismissed');

      const secondPreviewResponse = await fetch(`${baseUrl}/cco/customers/identity/suggestions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      assert.equal(secondPreviewResponse.status, 200);
      const secondPreviewPayload = await secondPreviewResponse.json();
      assert.equal(secondPreviewPayload.duplicateCount, 0);

      const updatedStateResponse = await fetch(`${baseUrl}/cco/customers/state`);
      const updatedStatePayload = await updatedStateResponse.json();
      updatedStatePayload.customerState.identityByKey.anna_main.canonicalCustomerId = 'cust-new';
      updatedStatePayload.customerState.identityByKey.anna_main.identitySource = 'backend';
      updatedStatePayload.customerState.identityByKey.anna_alt.canonicalCustomerId = 'cust-new';
      updatedStatePayload.customerState.identityByKey.anna_alt.identitySource = 'backend';

      const updateResponse = await fetch(`${baseUrl}/cco/customers/state`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ customerState: updatedStatePayload.customerState }),
      });
      assert.equal(updateResponse.status, 200);

      const rePreviewResponse = await fetch(`${baseUrl}/cco/customers/identity/suggestions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      assert.equal(rePreviewResponse.status, 200);
      const rePreviewPayload = await rePreviewResponse.json();
      const reSuggestion = rePreviewPayload.suggestionGroups.anna_main[0];
      assert.ok(reSuggestion);
      assert.equal(reSuggestion.decision, 'AUTO_MERGE');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco customer state materialiserar backfillad historik och kan mergea live-profiler', async () => {
  const fixture = await createFixture({ withHistory: true });

  try {
    await fixture.historyStore.upsertMailboxWindow({
      tenantId: 'tenant-a',
      mailboxId: 'kons@hairtpclinic.com',
      windowStartIso: '2026-03-20T00:00:00.000Z',
      windowEndIso: '2026-03-21T00:00:00.000Z',
      messages: [
        {
          messageId: 'msg-1',
          conversationId: 'conv-1',
          customerEmail: 'anna.one@example.com',
          senderEmail: 'anna.one@example.com',
          senderName: 'Anna Karlsson',
          sentAt: '2026-03-20T09:00:00.000Z',
          subject: 'Hej från Anna',
          bodyPreview: 'Första mejlet.',
          direction: 'inbound',
          mailboxAddress: 'kons@hairtpclinic.com',
        },
      ],
    });

    await fixture.historyStore.upsertMailboxWindow({
      tenantId: 'tenant-a',
      mailboxId: 'contact@hairtpclinic.com',
      windowStartIso: '2026-03-20T00:00:00.000Z',
      windowEndIso: '2026-03-21T00:00:00.000Z',
      messages: [
        {
          messageId: 'msg-2',
          conversationId: 'conv-2',
          customerEmail: 'anna.one+vip@gmail.com',
          senderEmail: 'anna.one+vip@gmail.com',
          senderName: 'Anna Karlsson',
          sentAt: '2026-03-20T10:00:00.000Z',
          subject: 'Hej igen',
          bodyPreview: 'Andra mejlet.',
          direction: 'inbound',
          mailboxAddress: 'contact@hairtpclinic.com',
        },
      ],
    });

    await withServer(fixture.app, async (baseUrl) => {
      const stateResponse = await fetch(`${baseUrl}/cco/customers/state`);
      assert.equal(stateResponse.status, 200);
      const statePayload = await stateResponse.json();

      const detailEntries = Object.entries(statePayload.customerState.details);
      const annaMainEntry = detailEntries.find(([, value]) =>
        Array.isArray(value.emails) ? value.emails.includes('anna.one@example.com') : false
      );
      const annaAltEntry = detailEntries.find(([, value]) =>
        Array.isArray(value.emails) ? value.emails.includes('anna.one+vip@gmail.com') : false
      );

      assert.ok(annaMainEntry);
      assert.ok(annaAltEntry);
      assert.notEqual(annaMainEntry[0], annaAltEntry[0]);

      const primaryKey = annaMainEntry[0];
      const secondaryKey = annaAltEntry[0];

      const mergeResponse = await fetch(`${baseUrl}/cco/customers/identity/merge`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          primaryKey,
          secondaryKeys: [secondaryKey],
          suggestionId: `${primaryKey}::${secondaryKey}`,
        }),
      });
      assert.equal(mergeResponse.status, 500);
      const mergePayload = await mergeResponse.json();
      assert.match(mergePayload.error, /identitetskonflikt/i);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
