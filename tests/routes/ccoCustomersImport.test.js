const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const XLSX = require('@e965/xlsx');

const { createCcoCustomersRouter } = require('../../src/routes/ccoCustomers');
const { createCcoCustomerStore } = require('../../src/ops/ccoCustomerStore');

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

async function createFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-customers-import-'));
  const customerStore = await createCcoCustomerStore({
    filePath: path.join(tempDir, 'customers.json'),
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
      requireAuth(req, _res, next) {
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
    auditEvents,
  };
}

test('cco customers import preview and commit skapar ny kund från JSON', async () => {
  const fixture = await createFixture();

  try {
    await withServer(fixture.app, async (baseUrl) => {
      const importText = JSON.stringify([
        {
          name: 'Import Kund',
          email: 'import@example.com',
          mailbox: 'Kons',
          vip: true,
          totalMessages: 4,
        },
      ]);

      const previewResponse = await fetch(`${baseUrl}/cco/customers/import/preview`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: importText,
          fileName: 'customers.json',
        }),
      });

      assert.equal(previewResponse.status, 200);
      const previewPayload = await previewResponse.json();
      assert.equal(previewPayload.importSummary.format, 'json');
      assert.equal(previewPayload.importSummary.created, 1);
      assert.equal(previewPayload.importSummary.validRows, 1);

      const commitResponse = await fetch(`${baseUrl}/cco/customers/import/commit`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: importText,
          fileName: 'customers.json',
        }),
      });

      assert.equal(commitResponse.status, 200);
      const commitPayload = await commitResponse.json();
      assert.equal(commitPayload.importSummary.created, 1);

      const stateResponse = await fetch(`${baseUrl}/cco/customers/state`);
      assert.equal(stateResponse.status, 200);
      const statePayload = await stateResponse.json();

      const directoryEntry = Object.values(statePayload.customerState.directory).find(
        (item) => item.name === 'Import Kund'
      );
      assert.ok(directoryEntry);

      const detailEntry = Object.values(statePayload.customerState.details).find((item) =>
        Array.isArray(item.emails) ? item.emails.includes('import@example.com') : false
      );
      assert.ok(detailEntry);
    });

    assert.equal(
      fixture.auditEvents.some((event) => event.action === 'cco.customers.import.preview'),
      true
    );
    assert.equal(
      fixture.auditEvents.some((event) => event.action === 'cco.customers.import.commit'),
      true
    );
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco customers import preview and commit använder samma regler för CSV-uppdatering', async () => {
  const fixture = await createFixture();

  try {
    await fixture.customerStore.saveTenantCustomerState({
      tenantId: 'tenant-a',
      customerState: {
        directory: {
          anna: {
            name: 'Anna Äldre',
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
          anna: {
            emails: ['anna@example.com'],
            phone: '',
            mailboxes: ['kons'],
          },
        },
        profileCounts: {
          anna: 1,
        },
        primaryEmailByKey: {
          anna: 'anna@example.com',
        },
      },
    });

    await withServer(fixture.app, async (baseUrl) => {
      const csvText = [
        'name,email,mailbox,total_messages',
        'Anna Karlsson,anna@example.com,Kons,9',
      ].join('\n');

      const previewResponse = await fetch(`${baseUrl}/cco/customers/import/preview`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: csvText,
          fileName: 'customers.csv',
        }),
      });

      assert.equal(previewResponse.status, 200);
      const previewPayload = await previewResponse.json();
      assert.equal(previewPayload.importSummary.format, 'csv');
      assert.equal(previewPayload.importSummary.updated, 1);
      assert.equal(previewPayload.importSummary.created, 0);

      const commitResponse = await fetch(`${baseUrl}/cco/customers/import/commit`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: csvText,
          fileName: 'customers.csv',
        }),
      });

      assert.equal(commitResponse.status, 200);
      const commitPayload = await commitResponse.json();
      assert.equal(commitPayload.importSummary.updated, 1);
      assert.equal(commitPayload.importSummary.created, 0);

      const stateResponse = await fetch(`${baseUrl}/cco/customers/state`);
      assert.equal(stateResponse.status, 200);
      const statePayload = await stateResponse.json();
      assert.equal(statePayload.customerState.directory.anna.name, 'Anna Karlsson');
      assert.equal(statePayload.customerState.directory.anna.totalMessages, 9);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco customers import kan defaulta mailbox till kons nar raden saknar mailboxfalt', async () => {
  const fixture = await createFixture();

  try {
    await withServer(fixture.app, async (baseUrl) => {
      const importText = JSON.stringify([
        {
          name: 'Kons Import',
          email: 'kons.import@example.com',
          vip: false,
        },
      ]);

      const previewResponse = await fetch(`${baseUrl}/cco/customers/import/preview`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: importText,
          fileName: 'customers.json',
          defaultMailboxId: 'kons@hairtpclinic.com',
        }),
      });

      assert.equal(previewResponse.status, 200);
      const previewPayload = await previewResponse.json();
      assert.equal(previewPayload.importSummary.validRows, 1);
      assert.deepEqual(previewPayload.importSummary.rows[0].record.mailboxes, ['Kons']);

      const commitResponse = await fetch(`${baseUrl}/cco/customers/import/commit`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: importText,
          fileName: 'customers.json',
          defaultMailboxId: 'kons@hairtpclinic.com',
        }),
      });

      assert.equal(commitResponse.status, 200);
      const commitPayload = await commitResponse.json();
      assert.deepEqual(commitPayload.importSummary.rows[0].record.mailboxes, ['Kons']);

      const stateResponse = await fetch(`${baseUrl}/cco/customers/state`);
      assert.equal(stateResponse.status, 200);
      const statePayload = await stateResponse.json();
      const detailEntry = Object.values(statePayload.customerState.details).find((item) =>
        Array.isArray(item.emails) ? item.emails.includes('kons.import@example.com') : false
      );
      assert.ok(detailEntry);
      assert.deepEqual(detailEntry.mailboxes, ['Kons']);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco customers import preview and commit kan lasa xlsx-filer', async () => {
  const fixture = await createFixture();

  try {
    await withServer(fixture.app, async (baseUrl) => {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet([
        {
          name: 'Xlsx Kund',
          email: 'xlsx@example.com',
          mailbox: 'Kons',
          total_messages: 7,
        },
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Customers');
      const binaryBase64 = XLSX.write(workbook, {
        bookType: 'xlsx',
        type: 'base64',
      });

      const previewResponse = await fetch(`${baseUrl}/cco/customers/import/preview`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          binaryBase64,
          fileName: 'customers.xlsx',
        }),
      });

      assert.equal(previewResponse.status, 200);
      const previewPayload = await previewResponse.json();
      assert.equal(previewPayload.importSummary.format, 'xlsx');
      assert.equal(previewPayload.importSummary.created, 1);
      assert.equal(previewPayload.importSummary.validRows, 1);

      const commitResponse = await fetch(`${baseUrl}/cco/customers/import/commit`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          binaryBase64,
          fileName: 'customers.xlsx',
        }),
      });

      assert.equal(commitResponse.status, 200);
      const commitPayload = await commitResponse.json();
      assert.equal(commitPayload.importSummary.created, 1);

      const stateResponse = await fetch(`${baseUrl}/cco/customers/state`);
      assert.equal(stateResponse.status, 200);
      const statePayload = await stateResponse.json();

      const detailEntry = Object.values(statePayload.customerState.details).find((item) =>
        Array.isArray(item.emails) ? item.emails.includes('xlsx@example.com') : false
      );
      assert.ok(detailEntry);
      assert.deepEqual(detailEntry.mailboxes, ['Kons']);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco customers import preview and commit kan använda redigerade preview-rader', async () => {
  const fixture = await createFixture();

  try {
    await withServer(fixture.app, async (baseUrl) => {
      const previewResponse = await fetch(`${baseUrl}/cco/customers/import/preview`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          rows: [
            {
              rowNumber: 4,
              name: 'Redigerad Kund',
              emails: ['edited@example.com'],
              mailboxes: ['Kons'],
              vip: true,
              totalMessages: 5,
            },
          ],
          fileName: 'edited-preview.json',
        }),
      });

      assert.equal(previewResponse.status, 200);
      const previewPayload = await previewResponse.json();
      assert.equal(previewPayload.importSummary.validRows, 1);
      assert.equal(previewPayload.importSummary.rows[0].input.name, 'Redigerad Kund');

      const commitResponse = await fetch(`${baseUrl}/cco/customers/import/commit`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          rows: [
            {
              rowNumber: 4,
              name: 'Redigerad Kund',
              emails: ['edited@example.com'],
              mailboxes: ['Kons'],
              vip: true,
              totalMessages: 5,
            },
          ],
          fileName: 'edited-preview.json',
        }),
      });

      assert.equal(commitResponse.status, 200);
      const stateResponse = await fetch(`${baseUrl}/cco/customers/state`);
      const statePayload = await stateResponse.json();
      const directoryEntry = Object.values(statePayload.customerState.directory).find(
        (item) => item.name === 'Redigerad Kund'
      );
      assert.ok(directoryEntry);
      assert.equal(directoryEntry.totalMessages, 5);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco customers import med sourceSystem=cliento skapar stabil canonical identity och läcker inte personnummer', async () => {
  const fixture = await createFixture();

  try {
    await withServer(fixture.app, async (baseUrl) => {
      const importText = [
        'Namn,Telefon (mobil),Telefon (annat),Epost,Personnummer',
        'Cliento Person,0701234567,,cliento.person@example.com,198001019876',
      ].join('\n');

      const firstCommitResponse = await fetch(`${baseUrl}/cco/customers/import/commit`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: importText,
          fileName: 'hair-tp-clinic-customers.csv',
          sourceSystem: 'cliento',
        }),
      });

      assert.equal(firstCommitResponse.status, 200);
      const firstCommitPayload = await firstCommitResponse.json();
      const firstCoverageReadout =
        firstCommitPayload.coverageReadout || firstCommitPayload.importSummary?.coverageReadout;
      assert.equal(firstCommitPayload.importSummary.created, 1);
      assert.equal(firstCommitPayload.importSummary.review, 0);
      assert.equal(firstCommitPayload.importSummary.validRows, 1);
      assert.ok(firstCoverageReadout);
      assert.equal(firstCoverageReadout.identityCount, 1);
      assert.equal(firstCoverageReadout.canonicalCount, 1);

      const firstStateResponse = await fetch(`${baseUrl}/cco/customers/state`);
      assert.equal(firstStateResponse.status, 200);
      const firstStatePayload = await firstStateResponse.json();
      const firstKeys = Object.keys(firstStatePayload.customerState.identityByKey);
      assert.equal(firstKeys.length, 1);
      const firstIdentity = firstStatePayload.customerState.identityByKey[firstKeys[0]];
      assert.equal(firstIdentity.identitySource, 'cliento');
      assert.equal(firstIdentity.provenance.source, 'cliento');
      assert.ok(firstIdentity.canonicalCustomerId.startsWith('cliento_'));
      assert.equal(firstIdentity.verifiedPersonalEmailNormalized, 'cliento.person@example.com');
      assert.equal(firstIdentity.verifiedPhoneE164, '0701234567');
      assert.equal(JSON.stringify(firstStatePayload.customerState).includes('198001019876'), false);

      const secondCommitResponse = await fetch(`${baseUrl}/cco/customers/import/commit`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: importText,
          fileName: 'hair-tp-clinic-customers.csv',
          sourceSystem: 'cliento',
        }),
      });

      assert.equal(secondCommitResponse.status, 200);
      const secondCommitPayload = await secondCommitResponse.json();
      const secondCoverageReadout =
        secondCommitPayload.coverageReadout || secondCommitPayload.importSummary?.coverageReadout;
      assert.equal(secondCommitPayload.importSummary.updated, 1);
      assert.equal(secondCommitPayload.importSummary.validRows, 1);
      assert.ok(secondCoverageReadout);
      assert.equal(secondCoverageReadout.identityCount, 1);
      assert.equal(secondCoverageReadout.canonicalCount, 1);

      const secondStateResponse = await fetch(`${baseUrl}/cco/customers/state`);
      assert.equal(secondStateResponse.status, 200);
      const secondStatePayload = await secondStateResponse.json();
      const secondKeys = Object.keys(secondStatePayload.customerState.identityByKey);
      assert.deepEqual(secondKeys, firstKeys);
      const secondIdentity = secondStatePayload.customerState.identityByKey[secondKeys[0]];
      assert.equal(secondIdentity.canonicalCustomerId, firstIdentity.canonicalCustomerId);
      assert.equal(secondIdentity.identitySource, 'cliento');
      assert.equal(
        JSON.stringify(secondStatePayload.customerState).includes('198001019876'),
        false
      );

      const statusResponse = await fetch(`${baseUrl}/cco/customers/import/status`);
      assert.equal(statusResponse.status, 200);
      const statusPayload = await statusResponse.json();
      assert.ok(statusPayload.coverageReadout);
      assert.equal(statusPayload.coverageReadout.identityCount, 1);
      assert.equal(statusPayload.coverageReadout.canonicalCount, 1);
      assert.equal(statusPayload.coverageReadout.reviewDecisionCount, 0);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco customers import med flera kandidater går till review och sparar beslut', async () => {
  const fixture = await createFixture();

  try {
    await fixture.customerStore.saveTenantCustomerState({
      tenantId: 'tenant-a',
      customerState: {
        directory: {
          candidate_a: {
            name: 'Kandidat A',
            vip: false,
            emailCoverage: 1,
            duplicateCandidate: false,
            profileCount: 1,
            customerValue: 0,
            totalConversations: 1,
            totalMessages: 1,
          },
          candidate_b: {
            name: 'Kandidat B',
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
          candidate_a: {
            emails: ['shared.cliento@example.com'],
            phone: '0701111111',
            mailboxes: ['Kons'],
          },
          candidate_b: {
            emails: ['shared.cliento@example.com'],
            phone: '0702222222',
            mailboxes: ['Contact'],
          },
        },
        identityByKey: {
          candidate_a: {
            customerKey: 'candidate_a',
            customerName: 'Kandidat A',
            identitySource: 'cliento',
            identityConfidence: 'strong',
            canonicalCustomerId: 'cliento_candidate_a',
            provenance: {
              source: 'cliento',
              mailboxIds: ['Kons'],
              sourceRecordIds: ['candidate_a'],
            },
          },
          candidate_b: {
            customerKey: 'candidate_b',
            customerName: 'Kandidat B',
            identitySource: 'cliento',
            identityConfidence: 'strong',
            canonicalCustomerId: 'cliento_candidate_b',
            provenance: {
              source: 'cliento',
              mailboxIds: ['Contact'],
              sourceRecordIds: ['candidate_b'],
            },
          },
        },
        primaryEmailByKey: {
          candidate_a: 'shared.cliento@example.com',
          candidate_b: 'shared.cliento@example.com',
        },
      },
    });

    await withServer(fixture.app, async (baseUrl) => {
      const importText = [
        'Namn,Telefon (mobil),Epost,Personnummer',
        'Ny Cliento,0703333333,shared.cliento@example.com,198501019999',
      ].join('\n');

      const commitResponse = await fetch(`${baseUrl}/cco/customers/import/commit`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: importText,
          fileName: 'hair-tp-clinic-customers.csv',
          sourceSystem: 'cliento',
        }),
      });

      assert.equal(commitResponse.status, 200);
      const commitPayload = await commitResponse.json();
      const commitCoverageReadout =
        commitPayload.coverageReadout || commitPayload.importSummary?.coverageReadout;
      assert.equal(commitPayload.importSummary.review, 1);
      assert.equal(commitPayload.importSummary.validRows, 1);
      assert.ok(commitCoverageReadout);
      assert.equal(commitCoverageReadout.reviewRequiredCount, 1);

      const stateResponse = await fetch(`${baseUrl}/cco/customers/state`);
      assert.equal(stateResponse.status, 200);
      const statePayload = await stateResponse.json();
      const reviewDecisionEntries = Object.values(
        statePayload.customerState.mergeReviewDecisionsByPairId || {}
      );
      assert.ok(reviewDecisionEntries.length >= 1);
      assert.equal(
        reviewDecisionEntries.some((entry) => entry.decision === 'review_required'),
        true
      );
      assert.equal(JSON.stringify(statePayload.customerState).includes('198501019999'), false);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
