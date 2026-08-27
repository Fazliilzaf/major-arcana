'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createCcoAftercareSchedulerStore,
  resolveFollowUpFormVariant,
} = require('../../src/ops/ccoAftercareSchedulerStore');

const TREATMENT_REQUIREMENTS = {
  treatments: {
    fue: {
      label: 'FUE',
      aftercareTemplate: 'aftercare_fue',
      aftercareTouchpoints: ['1h', '1d'],
      followupCadence: ['8m', '12m'],
    },
  },
};

async function tempStoreFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-aftercare-scheduler-'));
  return { dir, filePath: path.join(dir, 'cco-aftercare-scheduler.json') };
}

function mockJournalStore() {
  const calls = [];
  return {
    calls,
    async upsertEntry(input) {
      calls.push(input);
      return { entryId: input.entryId, status: input.status, journalType: input.journalType };
    },
  };
}

describe('resolveFollowUpFormVariant', () => {
  it('mappar 4/6/8/12-månaderskadens till follow_up-formvariant', () => {
    assert.equal(resolveFollowUpFormVariant('4m'), '4_manader');
    assert.equal(resolveFollowUpFormVariant('6m'), '6_manader');
    assert.equal(resolveFollowUpFormVariant('8m'), '8_manader');
    assert.equal(resolveFollowUpFormVariant('12m'), '12_manader');
  });

  it('returnerar null för kadenser utan egen follow_up-variant', () => {
    assert.equal(resolveFollowUpFormVariant('2w_after_each_session'), null);
    assert.equal(resolveFollowUpFormVariant('7d_suture_removal'), null);
    assert.equal(resolveFollowUpFormVariant('3m'), null);
    assert.equal(resolveFollowUpFormVariant(''), null);
  });
});

describe('ccoAftercareSchedulerStore — eftervården börjar som journal-utkast', () => {
  it('skapar follow_up-utkast för varje follow-up-jobb (inte för aftercare-touchpoints)', async () => {
    const { dir, filePath } = await tempStoreFile();
    const journal = mockJournalStore();
    try {
      const store = await createCcoAftercareSchedulerStore({
        filePath,
        treatmentRequirements: TREATMENT_REQUIREMENTS,
        journalStore: journal,
      });

      const result = await store.scheduleForCompletedEncounter({
        customerId: 'patient-1',
        encounterId: 'enc-1',
        treatmentKey: 'fue',
        tenantId: 'tenant-a',
        completedAt: '2026-06-01T10:00:00.000Z',
      });

      assert.equal(result.scheduled, 4); // 1h, 1d aftercare + 8m, 12m followup
      assert.equal(result.skippedExisting, 0);

      const followups = result.jobs.filter((job) => job.kind === 'followup');
      const aftercare = result.jobs.filter((job) => job.kind === 'aftercare');
      assert.equal(followups.length, 2);
      assert.equal(aftercare.length, 2);

      // Only follow-ups get a journal draft.
      for (const job of followups) {
        assert.ok(job.journalDraftEntryId, 'followup-jobb ska ha journalDraftEntryId');
        assert.equal(job.journalDraftEntryId, `followup_${job.id}`);
      }
      for (const job of aftercare) {
        assert.equal(job.journalDraftEntryId, null);
      }

      // Journal store received exactly the follow-up drafts.
      assert.equal(journal.calls.length, 2);
      const byCadence = new Map(journal.calls.map((c) => [c.fields.cadence, c]));
      const eight = byCadence.get('8m');
      const twelve = byCadence.get('12m');
      assert.ok(eight);
      assert.ok(twelve);
      assert.equal(eight.journalType, 'follow_up');
      assert.equal(eight.status, 'draft');
      assert.equal(eight.tenantId, 'tenant-a');
      assert.equal(eight.patientId, 'patient-1');
      assert.equal(eight.treatmentEncounterId, 'enc-1');
      assert.equal(eight.formVariant, '8_manader');
      assert.equal(eight.fields.scheduledForIso, eight.fields.scheduledForIso); // dueAt satt
      assert.equal(twelve.formVariant, '12_manader');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('är idempotent — samma encounter skapar inte dubbla utkast', async () => {
    const { dir, filePath } = await tempStoreFile();
    const journal = mockJournalStore();
    try {
      const store = await createCcoAftercareSchedulerStore({
        filePath,
        treatmentRequirements: TREATMENT_REQUIREMENTS,
        journalStore: journal,
      });
      const input = {
        customerId: 'patient-2',
        encounterId: 'enc-2',
        treatmentKey: 'fue',
        tenantId: 'tenant-a',
        completedAt: '2026-06-01T10:00:00.000Z',
      };
      const first = await store.scheduleForCompletedEncounter(input);
      const second = await store.scheduleForCompletedEncounter(input);
      assert.equal(first.scheduled, 4);
      assert.equal(second.scheduled, 0);
      assert.equal(second.skippedExisting, 4);
      assert.equal(journal.calls.length, 2); // inga nya utkast vid repris
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('fail-safe utan journalStore — schemalägger ändå jobb utan utkast', async () => {
    const { dir, filePath } = await tempStoreFile();
    try {
      const store = await createCcoAftercareSchedulerStore({
        filePath,
        treatmentRequirements: TREATMENT_REQUIREMENTS,
      });
      const result = await store.scheduleForCompletedEncounter({
        customerId: 'patient-3',
        encounterId: 'enc-3',
        treatmentKey: 'fue',
        tenantId: 'tenant-a',
        completedAt: '2026-06-01T10:00:00.000Z',
      });
      assert.equal(result.scheduled, 4);
      const followups = result.jobs.filter((job) => job.kind === 'followup');
      assert.equal(followups.length, 2);
      for (const job of followups) assert.equal(job.journalDraftEntryId, null);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
