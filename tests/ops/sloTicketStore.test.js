const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createSloTicketStore } = require('../../src/ops/sloTicketStore');

test('slo ticket store upserts, lists and resolves tickets per tenant', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-slo-ticket-store-'));
  const filePath = path.join(tmpDir, 'slo-tickets.json');

  try {
    const store = await createSloTicketStore({
      filePath,
      maxTickets: 200,
    });

    const first = await store.upsertBreach({
      tenantId: 'tenant-a',
      signature: 'availability_http_breach',
      severity: 'critical',
      summary: 'HTTP availability breach',
      details: '5xx över tröskel',
      metadata: { sampledRequests: 120, serverErrors: 12 },
    });
    assert.equal(first.created, true);
    assert.equal(first.ticket.status, 'open');

    const second = await store.upsertBreach({
      tenantId: 'tenant-a',
      signature: 'availability_http_breach',
      severity: 'critical',
      summary: 'HTTP availability breach',
      details: 'fortfarande över tröskel',
      metadata: { sampledRequests: 150, serverErrors: 15 },
    });
    assert.equal(second.created, false);
    assert.equal(second.ticket.occurrences, 2);

    const listOpen = await store.listTickets({
      tenantId: 'tenant-a',
      status: 'open',
      limit: 20,
    });
    assert.equal(listOpen.count, 1);

    const summaryBefore = await store.summarize({ tenantId: 'tenant-a' });
    assert.equal(summaryBefore.totals.open, 1);
    assert.equal(summaryBefore.totals.openBreaches, 1);

    const resolved = await store.resolveTicket({
      tenantId: 'tenant-a',
      ticketId: second.ticket.id,
      resolvedBy: 'owner-1',
      note: 'mitigated',
    });
    assert.equal(resolved.status, 'resolved');

    const summaryAfter = await store.summarize({ tenantId: 'tenant-a' });
    assert.equal(summaryAfter.totals.open, 0);
    assert.equal(summaryAfter.totals.resolved, 1);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('createSloTicketStore rejects missing or empty filePath', async () => {
  await assert.rejects(() => createSloTicketStore({}), /filePath saknas/);
  await assert.rejects(() => createSloTicketStore({ filePath: '' }), /filePath saknas/);
});

test('upsertBreach rejects blank tenantId or signature', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-slo-ticket-upsert-guard-'));
  const filePath = path.join(tmpDir, 'slo-tickets.json');
  try {
    const store = await createSloTicketStore({ filePath, maxTickets: 50 });
    await assert.rejects(
      () => store.upsertBreach({ tenantId: '   ', signature: 'sig_x' }),
      /tenantId saknas/
    );
    await assert.rejects(() => store.upsertBreach({ tenantId: 'tenant-a', signature: '  ' }), /signature saknas/);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('resolveTicket returns null when ticket is missing or tenant mismatches', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-slo-ticket-resolve-null-'));
  const filePath = path.join(tmpDir, 'slo-tickets.json');
  try {
    const store = await createSloTicketStore({ filePath, maxTickets: 50 });
    const created = await store.upsertBreach({
      tenantId: 'tenant-a',
      signature: 'latency_breach',
      summary: 'Latency',
    });
    assert.equal(await store.resolveTicket({ tenantId: 'tenant-b', ticketId: created.ticket.id }), null);
    assert.equal(await store.resolveTicket({ tenantId: 'tenant-a', ticketId: 'slo_does-not-exist' }), null);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('resolveTicket rejects blank tenantId or ticketId', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-slo-ticket-resolve-reject-'));
  const filePath = path.join(tmpDir, 'slo-tickets.json');
  try {
    const store = await createSloTicketStore({ filePath, maxTickets: 50 });
    await assert.rejects(
      () => store.resolveTicket({ tenantId: '   ', ticketId: 'slo_x' }),
      /tenantId\/ticketId/
    );
    await assert.rejects(
      () => store.resolveTicket({ tenantId: 'tenant-a', ticketId: '' }),
      /tenantId\/ticketId/
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('unknown severity normalizes to high on upsert', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-slo-ticket-severity-'));
  const filePath = path.join(tmpDir, 'slo-tickets.json');
  try {
    const store = await createSloTicketStore({ filePath, maxTickets: 50 });
    const created = await store.upsertBreach({
      tenantId: 'tenant-a',
      signature: 'custom_unknown_sev',
      severity: 'not-a-real-level',
      summary: 'Sev test',
    });
    assert.equal(created.ticket.severity, 'high');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('after resolve, upsert with same signature creates a new open ticket', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-slo-ticket-reopen-'));
  const filePath = path.join(tmpDir, 'slo-tickets.json');
  try {
    const store = await createSloTicketStore({ filePath, maxTickets: 50 });
    const first = await store.upsertBreach({
      tenantId: 'tenant-a',
      signature: 'availability_http_breach',
      severity: 'critical',
      summary: 'First',
    });
    await store.resolveTicket({
      tenantId: 'tenant-a',
      ticketId: first.ticket.id,
      resolvedBy: 'owner-1',
      note: 'cleared',
    });
    const second = await store.upsertBreach({
      tenantId: 'tenant-a',
      signature: 'availability_http_breach',
      severity: 'medium',
      summary: 'Second wave',
    });
    assert.equal(second.created, true);
    assert.equal(second.ticket.status, 'open');
    assert.equal(second.ticket.occurrences, 1);
    assert.notEqual(second.ticket.id, first.ticket.id);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('listTickets clamps limit to 500 and filters by status', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-slo-ticket-list-limit-'));
  const filePath = path.join(tmpDir, 'slo-tickets.json');
  try {
    const store = await createSloTicketStore({ filePath, maxTickets: 500 });
    for (let i = 0; i < 5; i += 1) {
      await store.upsertBreach({
        tenantId: 'tenant-a',
        signature: `sig_${i}`,
        summary: `Breach ${i}`,
      });
    }
    const limited = await store.listTickets({
      tenantId: 'tenant-a',
      status: 'open',
      limit: 9999,
    });
    assert.equal(limited.count, 5);
    assert.equal(limited.tickets.length, 5);
    const slice = await store.listTickets({ tenantId: 'tenant-a', status: 'open', limit: 2 });
    assert.equal(slice.count, 2);
    assert.equal(slice.tickets.length, 2);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('upsertBreach normaliserar MEDIUM severity case-insensitive', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-slo-ticket-sev-medium-'));
  const filePath = path.join(tmpDir, 'slo-tickets.json');
  try {
    const store = await createSloTicketStore({ filePath, maxTickets: 50 });
    const created = await store.upsertBreach({
      tenantId: 'tenant-a',
      signature: 'sev_medium_case',
      severity: 'MEDIUM',
      summary: 'Mid',
    });
    assert.equal(created.ticket.severity, 'medium');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('listTickets utan status filter returnerar både open och resolved', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-slo-ticket-list-all-'));
  const filePath = path.join(tmpDir, 'slo-tickets.json');
  try {
    const store = await createSloTicketStore({ filePath, maxTickets: 50 });
    const first = await store.upsertBreach({
      tenantId: 'tenant-a',
      signature: 'sig_resolve_me',
      summary: 'First',
    });
    await store.upsertBreach({
      tenantId: 'tenant-a',
      signature: 'sig_stays_open',
      summary: 'Second',
    });
    await store.resolveTicket({
      tenantId: 'tenant-a',
      ticketId: first.ticket.id,
      resolvedBy: 'owner-1',
      note: 'done',
    });
    const all = await store.listTickets({ tenantId: 'tenant-a', limit: 20 });
    assert.equal(all.count, 2);
    const statuses = new Set(all.tickets.map((t) => t.status));
    assert.ok(statuses.has('open'));
    assert.ok(statuses.has('resolved'));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('upsertBreach behåller befintlig metadata vid icke-object uppdatering', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-slo-ticket-meta-'));
  const filePath = path.join(tmpDir, 'slo-tickets.json');
  try {
    const store = await createSloTicketStore({ filePath, maxTickets: 50 });
    const first = await store.upsertBreach({
      tenantId: 'tenant-a',
      signature: 'meta_sig',
      summary: 'S',
      metadata: { k: 1 },
    });
    await store.upsertBreach({
      tenantId: 'tenant-a',
      signature: 'meta_sig',
      summary: 'S2',
      metadata: 'not-an-object',
    });
    const list = await store.listTickets({ tenantId: 'tenant-a', status: 'open', limit: 5 });
    const t = list.tickets.find((row) => row.id === first.ticket.id);
    assert.ok(t);
    assert.deepEqual(t.metadata, { k: 1 });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
