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

describe('cancelFollowUpsForEncounter — stänger jobb + utkast (ORD-140)', () => {
  function mockJournalStoreWithClose() {
    const entries = new Map();
    return {
      entries,
      async upsertEntry(input) {
        const prev = entries.get(input.entryId) || {};
        const merged = { ...prev, ...input };
        entries.set(input.entryId, merged);
        return { ...merged };
      },
      async closeEntry({ entryId, reason, eventId }) {
        const entry = entries.get(entryId);
        if (!entry) throw new Error('not found');
        if (entry.closedAt) return { ...entry };
        const merged = { ...entry, closedAt: new Date().toISOString(), closedReason: reason, closedByEventId: eventId };
        entries.set(entryId, merged);
        return { ...merged };
      },
    };
  }

  it('avbryter queued jobb och stänger follow-up-utkast utan att radera', async () => {
    const { dir, filePath } = await tempStoreFile();
    const journal = mockJournalStoreWithClose();
    try {
      const store = await createCcoAftercareSchedulerStore({
        filePath,
        treatmentRequirements: TREATMENT_REQUIREMENTS,
        journalStore: journal,
      });
      await store.scheduleForCompletedEncounter({
        customerId: 'p-cancel',
        encounterId: 'enc-cancel',
        treatmentKey: 'fue',
        tenantId: 'tenant-a',
        completedAt: '2026-06-01T10:00:00.000Z',
      });
      const before = (await store.listJobs()).length;
      const outcome = await store.cancelFollowUpsForEncounter({
        tenantId: 'tenant-a',
        encounterId: 'enc-cancel',
        reason: 'Vårdepisod avslutad',
        eventId: 'evt-1',
        actor: { role: 'staff' },
      });
      assert.equal(outcome.cancelled, 4); // 1h + 1d aftercare + 8m + 12m followup
      assert.equal(outcome.closedDrafts, 2); // 8m + 12m followup-utkast
      const after = (await store.listJobs()).length;
      assert.equal(before, after, 'ingenting raderas — samma antal jobb före och efter');
      const followupDrafts = [...journal.entries.values()].filter((e) => e.journalType === 'follow_up');
      assert.equal(followupDrafts.length, 2);
      for (const d of followupDrafts) {
        assert.ok(d.closedAt, 'utkastet ska vara stängt');
        assert.ok(!d.status || d.status === 'draft', 'status förblir draft (väg B)');
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('ett redan skickat jobb fäller inte avbokningen (skip, inte kast)', async () => {
    const { dir, filePath } = await tempStoreFile();
    const journal = mockJournalStoreWithClose();
    try {
      const store = await createCcoAftercareSchedulerStore({
        filePath,
        treatmentRequirements: TREATMENT_REQUIREMENTS,
        journalStore: journal,
      });
      await store.scheduleForCompletedEncounter({
        customerId: 'p-sent',
        encounterId: 'enc-sent',
        treatmentKey: 'fue',
        tenantId: 'tenant-a',
        completedAt: '2026-06-01T10:00:00.000Z',
      });
      // Markera ett jobb som skickat via filen (storet läser filen vid start).
      const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
      const [sentId] = Object.keys(raw.jobs);
      raw.jobs[sentId].status = 'sent';
      await fs.writeFile(filePath, JSON.stringify(raw, null, 2));

      const reloaded = await createCcoAftercareSchedulerStore({
        filePath,
        treatmentRequirements: TREATMENT_REQUIREMENTS,
        journalStore: journal,
      });
      const outcome = await reloaded.cancelFollowUpsForEncounter({
        tenantId: 'tenant-a',
        encounterId: 'enc-sent',
        reason: 'avbokad',
        actor: { role: 'staff' },
      });
      assert.equal(outcome.skipped, 1, 'det skickade jobbet hoppas över');
      assert.equal(outcome.cancelled, 3, 'resterande queued jobb avbryts');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
