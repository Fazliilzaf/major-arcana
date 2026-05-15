const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoFollowUpStore } = require('../../src/ops/ccoFollowUpStore');

test('cco follow-up store skapar, listar och hittar konflikter', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-followup-store-'));
  const filePath = path.join(tempDir, 'cco-followups.json');

  try {
    const store = await createCcoFollowUpStore({ filePath });

    const created = await store.createFollowUp({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-1',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      date: '2026-03-27',
      time: '10:30',
      doctorName: 'Dr. Eriksson',
      category: 'Ombokning',
      reminderLeadMinutes: 120,
      notes: 'PRP 2/3 - Ombokning.',
      actorUserId: 'owner-a',
    });

    assert.equal(created.category, 'Ombokning');
    assert.equal(created.reminderLeadMinutes, 120);
    assert.equal(created.scheduledForIso, '2026-03-27T10:30:00.000Z');

    const items = await store.listFollowUps({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-1',
    });

    assert.equal(items.length, 1);
    assert.equal(items[0].followUpId, created.followUpId);

    const conflict = await store.findConflict({
      tenantId: 'tenant-a',
      doctorName: 'Dr. Eriksson',
      scheduledForIso: '2026-03-27T10:30:00.000Z',
    });

    assert.equal(conflict.followUpId, created.followUpId);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('createCcoFollowUpStore rejects blank filePath', async () => {
  await assert.rejects(() => createCcoFollowUpStore({ filePath: '   ' }), /filePath krävs/);
});

test('createFollowUp rejects when schedule cannot be built', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-followup-invalid-'));
  const filePath = path.join(tempDir, 'cco-followups.json');
  try {
    const store = await createCcoFollowUpStore({ filePath });
    await assert.rejects(
      () =>
        store.createFollowUp({
          tenantId: 'tenant-a',
          workspaceId: 'major-arcana-preview',
          conversationId: 'conv-1',
          customerId: 'anna@example.com',
          date: '2026-03-27',
          time: '99:99',
        }),
      /obligatoriska/
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('createFollowUp defaults reminderLeadMinutes to 120 when non-positive', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-followup-reminder-'));
  const filePath = path.join(tempDir, 'cco-followups.json');
  try {
    const store = await createCcoFollowUpStore({ filePath });
    const created = await store.createFollowUp({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-1',
      customerId: 'anna@example.com',
      date: '2026-03-27',
      time: '11:00',
      reminderLeadMinutes: 0,
    });
    assert.equal(created.reminderLeadMinutes, 120);
    const createdNaN = await store.createFollowUp({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-2',
      customerId: 'bert@example.com',
      date: '2026-03-28',
      time: '09:00',
      reminderLeadMinutes: Number.NaN,
    });
    assert.equal(createdNaN.reminderLeadMinutes, 120);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('findConflict returns null when tenant, doctor or scheduled is blank', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-followup-conflict-'));
  const filePath = path.join(tempDir, 'cco-followups.json');
  try {
    const store = await createCcoFollowUpStore({ filePath });
    await store.createFollowUp({
      tenantId: 'tenant-a',
      workspaceId: 'w',
      conversationId: 'c1',
      customerId: 'u@e.com',
      date: '2026-04-01',
      time: '10:00',
      doctorName: 'Dr. X',
    });
    assert.equal(
      await store.findConflict({
        tenantId: '',
        doctorName: 'Dr. X',
        scheduledForIso: '2026-04-01T10:00:00.000Z',
      }),
      null
    );
    assert.equal(
      await store.findConflict({
        tenantId: 'tenant-a',
        doctorName: '   ',
        scheduledForIso: '2026-04-01T10:00:00.000Z',
      }),
      null
    );
    assert.equal(
      await store.findConflict({
        tenantId: 'tenant-a',
        doctorName: 'Dr. X',
        scheduledForIso: '',
      }),
      null
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('listFollowUps sorts by scheduledForIso descending and returns shallow copies', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-followup-sort-'));
  const filePath = path.join(tempDir, 'cco-followups.json');
  try {
    const store = await createCcoFollowUpStore({ filePath });
    await store.createFollowUp({
      tenantId: 't',
      workspaceId: 'w',
      conversationId: 'c',
      customerId: 'a@e.com',
      date: '2026-05-01',
      time: '09:00',
    });
    await store.createFollowUp({
      tenantId: 't',
      workspaceId: 'w',
      conversationId: 'c',
      customerId: 'b@e.com',
      date: '2026-05-02',
      time: '15:00',
    });
    const items = await store.listFollowUps({ tenantId: 't', workspaceId: 'w', conversationId: 'c' });
    assert.equal(items.length, 2);
    assert.ok(items[0].scheduledForIso > items[1].scheduledForIso);
    items[0].notes = 'mutated';
    const again = await store.listFollowUps({ tenantId: 't', workspaceId: 'w', conversationId: 'c' });
    assert.notEqual(again[0].notes, 'mutated');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('findConflict ignores excluded followUpId', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-followup-exclude-'));
  const filePath = path.join(tempDir, 'cco-followups.json');
  try {
    const store = await createCcoFollowUpStore({ filePath });
    const a = await store.createFollowUp({
      tenantId: 't',
      workspaceId: 'w',
      conversationId: 'c1',
      customerId: 'a@e.com',
      date: '2026-06-01',
      time: '10:00',
      doctorName: 'Dr. Same',
    });
    const conflict = await store.findConflict({
      tenantId: 't',
      doctorName: 'Dr. Same',
      scheduledForIso: a.scheduledForIso,
      excludeFollowUpId: a.followUpId,
    });
    assert.equal(conflict, null);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('createFollowUp rejects when date or time is blank', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-followup-blank-sched-'));
  const filePath = path.join(tempDir, 'cco-followups.json');
  try {
    const store = await createCcoFollowUpStore({ filePath });
    await assert.rejects(
      () =>
        store.createFollowUp({
          tenantId: 't',
          workspaceId: 'w',
          conversationId: 'c',
          customerId: 'a@e.com',
          date: '   ',
          time: '10:00',
        }),
      /obligatoriska/
    );
    await assert.rejects(
      () =>
        store.createFollowUp({
          tenantId: 't',
          workspaceId: 'w',
          conversationId: 'c',
          customerId: 'a@e.com',
          date: '2026-03-27',
          time: '',
        }),
      /obligatoriska/
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('createFollowUp stores empty notes and lowercases customerId', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-followup-notes-id-'));
  const filePath = path.join(tempDir, 'cco-followups.json');
  try {
    const store = await createCcoFollowUpStore({ filePath });
    const created = await store.createFollowUp({
      tenantId: 't',
      workspaceId: 'w',
      conversationId: 'c',
      customerId: 'User@Example.COM',
      date: '2026-07-01',
      time: '14:00',
      notes: '',
    });
    assert.equal(created.customerId, 'user@example.com');
    assert.equal(created.notes, '');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('createFollowUp treats blank status as scheduled', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-followup-status-default-'));
  const filePath = path.join(tempDir, 'cco-followups.json');
  try {
    const store = await createCcoFollowUpStore({ filePath });
    const created = await store.createFollowUp({
      tenantId: 't',
      workspaceId: 'w',
      conversationId: 'c',
      customerId: 'a@e.com',
      date: '2026-08-01',
      time: '09:30',
      status: '   ',
    });
    assert.equal(created.status, 'scheduled');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
