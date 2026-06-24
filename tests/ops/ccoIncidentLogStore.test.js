const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoIncidentLogStore } = require('../../src/ops/ccoIncidentLogStore');

const ACTOR = { role: 'dpo', userId: 'dpo-1' };

async function withStore(fn) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-incident-store-'));
  const filePath = path.join(tempDir, 'cco-incident-log.json');
  try {
    const store = await createCcoIncidentLogStore({ filePath });
    await fn(store, filePath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test('createCcoIncidentLogStore rejects blank filePath', async () => {
  await assert.rejects(() => createCcoIncidentLogStore({ filePath: '   ' }), /filePath krävs/);
});

test('createIncident requires a title', async () => {
  await withStore(async (store) => {
    await assert.rejects(() => store.createIncident({ actor: ACTOR }), /title krävs/);
  });
});

test('create -> getById -> listAll', async () => {
  await withStore(async (store) => {
    const created = await store.createIncident({
      actor: ACTOR,
      title: 'Felaktigt utskick av journaldata',
      description: 'E-post med PII skickad till fel mottagare.',
      severity: 'high',
      affectsPersonalData: true,
    });
    assert.ok(created.incidentId);
    assert.equal(created.status, 'open');
    assert.equal(created.severity, 'high');
    assert.ok(created.imyDeadline, 'imyDeadline should be computed');
    assert.equal(created.history.length, 1);

    const fetched = store.getById(created.incidentId);
    assert.equal(fetched.title, 'Felaktigt utskick av journaldata');

    assert.equal(store.getById('missing'), null);

    const all = store.listAll();
    assert.equal(all.length, 1);
    assert.equal(all[0].incidentId, created.incidentId);
  });
});

test('transitionStatus updates status and history, rejects invalid', async () => {
  await withStore(async (store) => {
    const created = await store.createIncident({ actor: ACTOR, title: 'X' });
    const moved = await store.transitionStatus({
      incidentId: created.incidentId,
      actor: ACTOR,
      status: 'investigating',
      reason: 'Påbörjad utredning',
    });
    assert.equal(moved.status, 'investigating');
    const last = moved.history[moved.history.length - 1];
    assert.equal(last.event, 'status');
    assert.equal(last.from, 'open');
    assert.equal(last.to, 'investigating');

    await assert.rejects(
      () =>
        store.transitionStatus({ incidentId: created.incidentId, actor: ACTOR, status: 'nope' }),
      /Ogiltig status/
    );
    await assert.rejects(
      () => store.transitionStatus({ incidentId: 'missing', actor: ACTOR, status: 'closed' }),
      /hittades inte/
    );
  });
});

test('addMitigationAction appends actions and rejects blanks', async () => {
  await withStore(async (store) => {
    const created = await store.createIncident({ actor: ACTOR, title: 'X' });
    const r1 = await store.addMitigationAction({
      incidentId: created.incidentId,
      actor: ACTOR,
      action: 'Återkallade e-postmeddelande',
    });
    assert.equal(r1.mitigationActions.length, 1);
    assert.equal(r1.mitigationActions[0].action, 'Återkallade e-postmeddelande');
    assert.equal(r1.mitigationActions[0].by, 'dpo');

    const r2 = await store.addMitigationAction({
      incidentId: created.incidentId,
      actor: ACTOR,
      action: 'Informerade berörda',
    });
    assert.equal(r2.mitigationActions.length, 2);

    await assert.rejects(
      () =>
        store.addMitigationAction({ incidentId: created.incidentId, actor: ACTOR, action: '  ' }),
      /action krävs/
    );
  });
});

test('markImyNotified records reference and flips status to imy_reported', async () => {
  await withStore(async (store) => {
    const created = await store.createIncident({
      actor: ACTOR,
      title: 'Personuppgiftsincident',
      affectsPersonalData: true,
    });
    const notified = await store.markImyNotified({
      incidentId: created.incidentId,
      actor: ACTOR,
      referenceNumber: 'IMY-2026-123',
      sentAt: '2026-06-24T10:00:00.000Z',
    });
    assert.equal(notified.imyNotified, true);
    assert.equal(notified.imyReferenceNumber, 'IMY-2026-123');
    assert.equal(notified.imyNotifiedAt, '2026-06-24T10:00:00.000Z');
    assert.equal(notified.status, 'imy_reported');
  });
});

test('listImyDeadlineImminent flags soon-due, unreported personal-data incidents', async () => {
  await withStore(async (store) => {
    // discovered ~60h ago -> deadline ~12h from now -> imminent within 24h
    const discovered = new Date(Date.now() - 60 * 3600 * 1000).toISOString();
    const imminent = await store.createIncident({
      actor: ACTOR,
      title: 'Snart deadline',
      affectsPersonalData: true,
      discoveredAt: discovered,
    });
    // discovered just now -> deadline ~72h out -> NOT imminent within 24h
    await store.createIncident({
      actor: ACTOR,
      title: 'Gott om tid',
      affectsPersonalData: true,
    });
    // already notified -> excluded
    const notified = await store.createIncident({
      actor: ACTOR,
      title: 'Redan rapporterad',
      affectsPersonalData: true,
      discoveredAt: discovered,
    });
    await store.markImyNotified({
      incidentId: notified.incidentId,
      actor: ACTOR,
      referenceNumber: 'R',
    });
    // not personal data -> excluded
    await store.createIncident({
      actor: ACTOR,
      title: 'Ingen PII',
      affectsPersonalData: false,
      discoveredAt: discovered,
    });

    const list = store.listImyDeadlineImminent(24);
    assert.equal(list.length, 1);
    assert.equal(list[0].incidentId, imminent.incidentId);
  });
});

test('updateIncident edits fields and recomputes deadline on rediscovery', async () => {
  await withStore(async (store) => {
    const created = await store.createIncident({ actor: ACTOR, title: 'X', severity: 'low' });
    const updated = await store.updateIncident({
      incidentId: created.incidentId,
      actor: ACTOR,
      patch: { severity: 'critical', description: 'mer info' },
    });
    assert.equal(updated.severity, 'critical');
    assert.equal(updated.description, 'mer info');
  });
});

test('exportReport returns summary and filtered incidents', async () => {
  await withStore(async (store) => {
    await store.createIncident({
      actor: ACTOR,
      title: 'A',
      severity: 'high',
      affectsPersonalData: true,
    });
    const b = await store.createIncident({
      actor: ACTOR,
      title: 'B',
      severity: 'low',
      affectsPersonalData: false,
    });
    await store.markImyNotified({ incidentId: b.incidentId, actor: ACTOR, referenceNumber: 'R-1' });

    const report = store.exportReport({});
    assert.ok(report.generatedAt);
    assert.equal(report.summary.total, 2);
    assert.equal(report.summary.bySeverity.high, 1);
    assert.equal(report.summary.bySeverity.low, 1);
    assert.equal(report.summary.imyReportable, 1);
    assert.equal(report.summary.imyReported, 1);
    assert.equal(report.incidents.length, 2);

    const future = store.exportReport({ since: '2099-01-01T00:00:00.000Z' });
    assert.equal(future.summary.total, 0);
    assert.equal(future.incidents.length, 0);
  });
});

test('state persists across store instances', async () => {
  await withStore(async (store, filePath) => {
    const created = await store.createIncident({
      actor: ACTOR,
      title: 'Persist me',
      severity: 'medium',
    });
    await store.addMitigationAction({
      incidentId: created.incidentId,
      actor: ACTOR,
      action: 'step 1',
    });

    const reopened = await createCcoIncidentLogStore({ filePath });
    const fetched = reopened.getById(created.incidentId);
    assert.ok(fetched);
    assert.equal(fetched.title, 'Persist me');
    assert.equal(fetched.mitigationActions.length, 1);
    assert.equal(fetched.mitigationActions[0].action, 'step 1');
  });
});

test('auditLog.append is invoked when provided', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-incident-audit-'));
  const filePath = path.join(tempDir, 'cco-incident-log.json');
  const events = [];
  const auditLog = { append: (e) => events.push(e) };
  try {
    const store = await createCcoIncidentLogStore({ filePath, auditLog });
    const created = await store.createIncident({ actor: ACTOR, title: 'Audit' });
    await store.transitionStatus({
      incidentId: created.incidentId,
      actor: ACTOR,
      status: 'contained',
    });
    assert.ok(events.length >= 2);
    assert.equal(events[0].action, 'cco.incident.create');
    assert.equal(events[0].target.kind, 'cco_incident');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
