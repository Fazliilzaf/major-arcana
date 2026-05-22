const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoMailboxTruthStore } = require('../../src/ops/ccoMailboxTruthStore');
const {
  parseClientoCsvRows,
  runClientoBackfill,
} = require('../../scripts/run-cliento-backfill');

async function createFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cliento-backfill-'));
  const csvPath = path.join(tempDir, 'hair-tp-clinic-customers.csv');
  const truthStorePath = path.join(tempDir, 'cco-mailbox-truth.json');
  const customerStorePath = path.join(tempDir, 'cco-customers.json');

  await fs.writeFile(
    csvPath,
    [
      'Namn,Telefon (mobil),Telefon (annat),Epost,Personnummer',
      'Alice Test,0701234567,,alice@example.com,198001019876',
      'Bob Irrelevant,0709999999,,bob@example.com,197501019876',
    ].join('\n'),
    'utf8'
  );

  await fs.writeFile(truthStorePath, JSON.stringify({}, null, 2), 'utf8');

  const truthStore = await createCcoMailboxTruthStore({ filePath: truthStorePath });
  const run = await truthStore.startBackfillRun({
    mailboxIds: ['egzona@hairtpclinic.com'],
    folderTypes: ['inbox'],
  });
  await truthStore.recordFolderPage({
    runId: run.runId,
    account: {
      mailboxId: 'egzona@hairtpclinic.com',
      mailboxAddress: 'egzona@hairtpclinic.com',
      userPrincipalName: 'egzona@hairtpclinic.com',
    },
    folder: {
      folderId: 'inbox',
      folderName: 'Inbox',
      folderType: 'inbox',
      wellKnownName: 'inbox',
      totalItemCount: 1,
      unreadItemCount: 1,
      messageCollectionCount: 1,
    },
    messages: [
      {
        graphMessageId: 'msg-1',
        conversationId: 'conv-1',
        subject: 'Hej Alice',
        bodyPreview: 'Vi hörs gärna angående din bokning.',
        direction: 'inbound',
        folderType: 'inbox',
        isRead: false,
        from: {
          address: 'alice@example.com',
          name: 'Alice Test',
        },
        receivedAt: '2026-04-01T08:00:00.000Z',
        lastModifiedAt: '2026-04-01T08:00:00.000Z',
      },
    ],
    complete: true,
  });
  await truthStore.finishBackfillRun(run.runId, { status: 'completed', error: null });

  return {
    tempDir,
    csvPath,
    truthStorePath,
    customerStorePath,
  };
}

test('cliento backfill kan köras flera gånger med stabil canonical identity och coverage', async () => {
  const fixture = await createFixture();

  try {
    const parsedRows = parseClientoCsvRows(
      await fs.readFile(fixture.csvPath, 'utf8')
    );
    assert.equal(parsedRows.length, 2);
    assert.equal(parsedRows[0].Epost, 'alice@example.com');

    const firstReport = await runClientoBackfill({
      csvPath: fixture.csvPath,
      tenantId: 'hair-tp-clinic',
      customerStorePath: fixture.customerStorePath,
      truthStorePath: fixture.truthStorePath,
    });

    assert.equal(firstReport.selectedRowCount, 1);
    assert.equal(firstReport.before.identityCount, 0);
    assert.equal(firstReport.after.identityCount, 1);
    assert.equal(firstReport.after.canonicalCount, 1);
    assert.equal(firstReport.after.sourceCounts.cliento, 1);
    assert.equal(firstReport.truth.identityCount, 1);
    assert.equal(firstReport.consumer.identityCount, 1);
    assert.equal(firstReport.shadow.shadowIdentityCount, 1);
    assert.equal(firstReport.importSummary.created, 1);
    assert.equal(firstReport.importSummary.updated, 0);

    const secondReport = await runClientoBackfill({
      csvPath: fixture.csvPath,
      tenantId: 'hair-tp-clinic',
      customerStorePath: fixture.customerStorePath,
      truthStorePath: fixture.truthStorePath,
    });

    assert.equal(secondReport.selectedRowCount, 1);
    assert.equal(secondReport.after.identityCount, 1);
    assert.equal(secondReport.after.canonicalCount, 1);
    assert.equal(secondReport.after.sourceCounts.cliento, 1);
    assert.equal(secondReport.truth.identityCount, 1);
    assert.equal(secondReport.consumer.identityCount, 1);
    assert.equal(secondReport.shadow.shadowIdentityCount, 1);
    assert.equal(secondReport.importSummary.created, 0);
    assert.equal(secondReport.importSummary.updated, 1);
    assert.equal(
      secondReport.after.reviewDecisionCount,
      firstReport.after.reviewDecisionCount
    );
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
