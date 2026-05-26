'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  promoteApprovedDraftToJournalEntry,
} = require('../../src/ops/ccoPatientCareOps');
const {
  createCcoPatientCareStateStore,
} = require('../../src/ops/ccoPatientCareStateStore');

function mockJournalStore() {
  const created = [];
  return {
    created,
    async listEntries({ patientId }) {
      return { entries: created.filter((entry) => entry.patientId === patientId) };
    },
    async upsertEntry(input) {
      const entry = {
        entryId: `entry-${created.length + 1}`,
        patientId: input.patientId,
        journalType: input.journalType,
        status: input.status || 'draft',
        locked: false,
      };
      created.push(entry);
      return entry;
    },
  };
}

async function createTempStateStore() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-promote-'));
  const filePath = path.join(tempDir, 'care-state.json');
  const store = await createCcoPatientCareStateStore({ filePath });
  return { store, tempDir };
}

test('promoteApprovedDraftToJournalEntry skapar journalpost + markerar proposal promoted + audit-event', async () => {
  const { store, tempDir } = await createTempStateStore();
  try {
    const proposal = await store.upsertDraftProposal({
      tenantId: 'tenant-a',
      patientId: 'pat-1',
      status: 'approved',
      reviewRequired: false,
      source: 'test',
      missing: ['health_declaration'],
      draftFields: {
        healthDeclaration: {
          journalType: 'health_declaration',
          formVariant: 'hair_tp',
          title: 'Hälsodeklaration',
        },
      },
    });
    const journalStore = mockJournalStore();
    const result = await promoteApprovedDraftToJournalEntry({
      proposalId: proposal.proposalId,
      tenantId: 'tenant-a',
      ownerUserId: 'owner-1',
      patientCareStateStore: store,
      journalStore,
    });
    assert.equal(result.promoted, true);
    assert.equal(result.journalEntryIds.length, 1);
    assert.equal(result.journalEntries[0].action, 'created');
    assert.equal(result.proposal.status, 'promoted');
    assert.equal(result.proposal.promotedBy, 'owner-1');
    assert.deepEqual(result.proposal.journalEntryIds, result.journalEntryIds);
    assert.equal(result.auditEvent.action, 'journal_draft_promoted');
    assert.equal(result.auditEvent.targetId, proposal.proposalId);

    const stored = await store.listDraftProposals({
      tenantId: 'tenant-a',
      status: 'promoted',
    });
    assert.equal(stored.length, 1);
    assert.equal(stored[0].status, 'promoted');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('promoteApprovedDraftToJournalEntry returnerar not_approved när status ≠ approved', async () => {
  const { store, tempDir } = await createTempStateStore();
  try {
    const proposal = await store.upsertDraftProposal({
      tenantId: 'tenant-a',
      patientId: 'pat-1',
      status: 'pending',
      draftFields: {
        healthDeclaration: { journalType: 'health_declaration', title: 'H' },
      },
    });
    const journalStore = mockJournalStore();
    const result = await promoteApprovedDraftToJournalEntry({
      proposalId: proposal.proposalId,
      tenantId: 'tenant-a',
      patientCareStateStore: store,
      journalStore,
    });
    assert.equal(result.promoted, false);
    assert.equal(result.reason, 'not_approved');
    assert.equal(journalStore.created.length, 0);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('promoteApprovedDraftToJournalEntry är idempotent — already_promoted vid andra anrop', async () => {
  const { store, tempDir } = await createTempStateStore();
  try {
    const proposal = await store.upsertDraftProposal({
      tenantId: 'tenant-a',
      patientId: 'pat-1',
      status: 'approved',
      draftFields: {
        healthDeclaration: {
          journalType: 'health_declaration',
          formVariant: 'hair_tp',
          title: 'Hälsodeklaration',
        },
      },
    });
    const journalStore = mockJournalStore();
    const first = await promoteApprovedDraftToJournalEntry({
      proposalId: proposal.proposalId,
      tenantId: 'tenant-a',
      ownerUserId: 'owner-1',
      patientCareStateStore: store,
      journalStore,
    });
    assert.equal(first.promoted, true);
    const journalCountAfterFirst = journalStore.created.length;
    const second = await promoteApprovedDraftToJournalEntry({
      proposalId: proposal.proposalId,
      tenantId: 'tenant-a',
      ownerUserId: 'owner-1',
      patientCareStateStore: store,
      journalStore,
    });
    assert.equal(second.promoted, false);
    assert.equal(second.reason, 'already_promoted');
    assert.deepEqual(second.journalEntryIds, first.journalEntryIds);
    assert.equal(journalStore.created.length, journalCountAfterFirst);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('promoteApprovedDraftToJournalEntry returnerar proposal_not_found vid okänt id', async () => {
  const { store, tempDir } = await createTempStateStore();
  try {
    const journalStore = mockJournalStore();
    const result = await promoteApprovedDraftToJournalEntry({
      proposalId: 'does-not-exist',
      tenantId: 'tenant-a',
      patientCareStateStore: store,
      journalStore,
    });
    assert.equal(result.promoted, false);
    assert.equal(result.reason, 'proposal_not_found');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('promoteApprovedDraftToJournalEntry kräver journal store + care state store', async () => {
  const noStore = await promoteApprovedDraftToJournalEntry({});
  assert.equal(noStore.promoted, false);
  assert.equal(noStore.reason, 'patient_care_state_store_missing');
});
