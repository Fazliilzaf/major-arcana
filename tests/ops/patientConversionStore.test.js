const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createPatientConversionStore } = require('../../src/ops/patientConversionStore');

test('createPatientConversionStore rejects empty or whitespace filePath', async () => {
  await assert.rejects(() => createPatientConversionStore({ filePath: '' }), /filePath/i);
  await assert.rejects(() => createPatientConversionStore({ filePath: '  \n' }), /filePath/i);
});

test('recordEvent persists allowed chat_response and getSummary counts window', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-patient-conv-'));
  const filePath = path.join(dir, 'patient-conversion.json');

  const store = await createPatientConversionStore({
    filePath,
    maxEvents: 5000,
    retentionDays: 180,
  });

  const ts = new Date().toISOString();
  const ev = await store.recordEvent({
    eventType: 'chat_response',
    tenantId: 'tenant-p',
    allowed: true,
    conversationId: 'conv-99',
    intents: ['booking', 'contact'],
    ts,
    responseMs: 120.456,
  });

  assert.equal(ev.eventType, 'chat_response');
  assert.equal(ev.tenantId, 'tenant-p');
  assert.ok(Array.isArray(ev.intents));
  assert.ok(ev.intents.includes('booking'));

  const summary = await store.getSummary({ tenantId: 'tenant-p', windowDays: 14 });
  assert.equal(summary.totalTenantEvents, 1);
  assert.equal(summary.window.totalRequests, 1);
  assert.equal(summary.window.allowedRequests, 1);
  assert.equal(summary.window.responses, 1);
  assert.equal(summary.window.bookingIntentRequests, 1);
  assert.equal(summary.window.contactIntentRequests, 1);

  await fs.rm(dir, { recursive: true, force: true });
});

test('recordEvent rejects unknown event types', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-patient-bad-'));
  const filePath = path.join(dir, 'patient-conversion.json');
  const store = await createPatientConversionStore({ filePath });

  await assert.rejects(
    () =>
      store.recordEvent({
        eventType: 'unknown_event',
        tenantId: 't',
        allowed: true,
      }),
    /Ogiltig patient conversion-event/
  );

  await fs.rm(dir, { recursive: true, force: true });
});

test('getSummary matches events by brand when tenantId is empty on event', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-patient-brand-'));
  const filePath = path.join(dir, 'patient-conversion.json');
  const store = await createPatientConversionStore({ filePath });

  await store.recordEvent({
    eventType: 'beta_denied',
    brand: 'tenant-brand',
    allowed: false,
    sourceHost: 'evil.example.com',
    ts: new Date().toISOString(),
  });

  const byBrand = await store.getSummary({ tenantId: 'tenant-brand', windowDays: 14 });
  assert.equal(byBrand.totalTenantEvents, 1);
  assert.equal(byBrand.window.deniedRequests, 1);

  const otherTenant = await store.getSummary({ tenantId: 'other', windowDays: 14 });
  assert.equal(otherTenant.totalTenantEvents, 0);

  await fs.rm(dir, { recursive: true, force: true });
});

test('getSummary counts chat_error in window.errors', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-patient-err-'));
  const filePath = path.join(dir, 'patient-conversion.json');
  const store = await createPatientConversionStore({ filePath });

  await store.recordEvent({
    eventType: 'chat_error',
    tenantId: 'tenant-err',
    allowed: true,
    ts: new Date().toISOString(),
  });

  const summary = await store.getSummary({ tenantId: 'tenant-err', windowDays: 14 });
  assert.equal(summary.window.totalRequests, 1);
  assert.equal(summary.window.errors, 1);
  assert.equal(summary.window.responses, 0);

  await fs.rm(dir, { recursive: true, force: true });
});

test('recordEvent clamps intentScore to 0..20', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-patient-score-'));
  const filePath = path.join(dir, 'patient-conversion.json');
  const store = await createPatientConversionStore({ filePath });

  const high = await store.recordEvent({
    eventType: 'chat_response',
    tenantId: 't',
    allowed: true,
    ts: new Date().toISOString(),
    intentScore: 999,
  });
  assert.equal(high.intentScore, 20);

  const low = await store.recordEvent({
    eventType: 'chat_response',
    tenantId: 't',
    allowed: true,
    ts: new Date().toISOString(),
    intentScore: -5,
  });
  assert.equal(low.intentScore, 0);

  await fs.rm(dir, { recursive: true, force: true });
});

test('getSummary clamps windowDays to 1..365', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-patient-window-'));
  const filePath = path.join(dir, 'patient-conversion.json');
  const store = await createPatientConversionStore({ filePath });

  await store.recordEvent({
    eventType: 'chat_response',
    tenantId: 't-w',
    allowed: true,
    ts: new Date().toISOString(),
  });

  const sZero = await store.getSummary({ tenantId: 't-w', windowDays: 0 });
  assert.equal(sZero.windowDays, 14);

  const sHuge = await store.getSummary({ tenantId: 't-w', windowDays: 9999 });
  assert.equal(sHuge.windowDays, 365);

  await fs.rm(dir, { recursive: true, force: true });
});

test('events persist across store instances', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-patient-reload-'));
  const filePath = path.join(dir, 'patient-conversion.json');

  const a = await createPatientConversionStore({ filePath });
  await a.recordEvent({
    eventType: 'beta_denied',
    tenantId: 't-reload',
    allowed: false,
    ts: new Date().toISOString(),
  });

  const b = await createPatientConversionStore({ filePath });
  const summary = await b.getSummary({ tenantId: 't-reload', windowDays: 14 });
  assert.equal(summary.totalTenantEvents, 1);
  assert.equal(summary.window.deniedRequests, 1);

  await fs.rm(dir, { recursive: true, force: true });
});

test('getSummary räknar nekad chat_response som denied men fortfarande som response', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-patient-chat-denied-'));
  const filePath = path.join(dir, 'patient-conversion.json');
  const store = await createPatientConversionStore({ filePath });

  await store.recordEvent({
    eventType: 'chat_response',
    tenantId: 't-deny',
    allowed: false,
    ts: new Date().toISOString(),
  });

  const summary = await store.getSummary({ tenantId: 't-deny', windowDays: 14 });
  assert.equal(summary.window.totalRequests, 1);
  assert.equal(summary.window.deniedRequests, 1);
  assert.equal(summary.window.allowedRequests, 0);
  assert.equal(summary.window.responses, 1);
  assert.equal(summary.window.responseRatePct, 0);

  await fs.rm(dir, { recursive: true, force: true });
});

test('recordEvent sätter responseMs till null vid negativt värde', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-patient-respms-'));
  const filePath = path.join(dir, 'patient-conversion.json');
  const store = await createPatientConversionStore({ filePath });

  const ev = await store.recordEvent({
    eventType: 'chat_response',
    tenantId: 't',
    allowed: true,
    ts: new Date().toISOString(),
    responseMs: -10,
  });
  assert.equal(ev.responseMs, null);

  await fs.rm(dir, { recursive: true, force: true });
});
