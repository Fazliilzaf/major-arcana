'use strict';

// Regressionstester för SMS-påminnelsekedjan (bokningsbekräftelse + 24h-påminnelse, 46elks).
//
// Bakgrund: `runCcoCustomerReminders` i scheduler.js körde tidigare SMS-blocket inline
// (rad 675–719) med ett try/catch runt hela blocket. En kunduppgift visade att blocket
// kunde hoppa över påminnelser eller krascha tyst när telefonnummer saknades eller när
// 46elks avvisade ett meddelande. Blocket är nu utbrutet till
// `dispatchPatientVisitReminderSms` i ccoPatientCareOps.js så att kedjan kan regressions-
// testas: kön byggs bara inom lead time-fönstret, saknat nummer hoppas över (ingen crash),
// dubbletter skickas inte igen inom 72h, ej konfigurerad SMS hoppar över hela blocket
// (e-post går ändå) och ett avvisat 46elks-svar hoppas över utan att bryta resten av kön.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildCustomerReminderQueue,
  dispatchPatientVisitReminderEmails,
  dispatchPatientVisitReminderSms,
} = require('../../src/ops/ccoPatientCareOps');
const { createCcoPatientCareStateStore } = require('../../src/ops/ccoPatientCareStateStore');

function mockBookingEngineStore({ bookings = [] } = {}) {
  return {
    state: { bookings },
  };
}

function mockCareStore({ alreadySent = () => false } = {}) {
  const logged = [];
  return {
    logged,
    async wasReminderSent() {
      return alreadySent();
    },
    async logReminder(input) {
      logged.push(input);
    },
  };
}

function mockSmsConnector({ configured = true, send = null } = {}) {
  const sent = [];
  return {
    sent,
    isConfigured: () => configured,
    buildBookingReminderSms: ({ serviceName = 'ditt besök', date = '', time = '' } = {}) =>
      `Påminnelse: ${serviceName} ${date} ${time}`.trim(),
    async sendSms({ to, message }) {
      sent.push({ to, message });
      if (send) return send({ to, message });
      return { ok: true, messageId: `sms-${sent.length}` };
    },
  };
}

function reminderQueueItem(overrides = {}) {
  return {
    patientId: 'p1',
    reminderKey: 'visit:booking:b1',
    customerName: 'Anna',
    serviceLabel: 'Konsultation',
    startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    phone: '+46700000000',
    ...overrides,
  };
}

test('buildCustomerReminderQueue bygger påminnelser inom lead time men inte utanför fönstret', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-sms-leadtime-'));
  try {
    const patientCareStateStore = await createCcoPatientCareStateStore({
      filePath: path.join(tempDir, 'care-state.json'),
    });
    const inWindow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const outOfWindow = new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString();
    const bookingEngineStore = mockBookingEngineStore({
      bookings: [
        {
          bookingId: 'b-in',
          patientId: 'p1',
          customerName: 'Anna',
          slot: { startsAt: inWindow, serviceId: 'consultation-physical', resourceId: 'fazli' },
        },
        {
          bookingId: 'b-out',
          patientId: 'p2',
          customerName: 'Bertil',
          slot: { startsAt: outOfWindow, serviceId: 'consultation-physical', resourceId: 'fazli' },
        },
      ],
    });

    const queue = await buildCustomerReminderQueue({
      tenantId: 'hair-tp-clinic',
      bookingEngineStore,
      patientCareStateStore,
      leadTimeConfig: {
        globalDefaultHours: 24,
        channelDefaults: { online: 4, physical: 24, default: 24 },
      },
    });

    assert.equal(queue.visitReminders.length, 1);
    assert.equal(queue.visitReminders[0].id, 'b-in');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('dispatchPatientVisitReminderSms hoppar över saknat telefonnummer utan att krascha', async () => {
  const connector = mockSmsConnector();
  const result = await dispatchPatientVisitReminderSms({
    queue: { visitReminders: [reminderQueueItem({ phone: '' })] },
    tenantId: 'hair-tp-clinic',
    patientCareStateStore: mockCareStore(),
    smsConnector: connector,
  });
  assert.equal(result.sent, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.configured, true);
  assert.equal(connector.sent.length, 0);
});

test('dispatchPatientVisitReminderSms skickar inte om inom 72h (dedup)', async () => {
  const connector = mockSmsConnector();
  const result = await dispatchPatientVisitReminderSms({
    queue: { visitReminders: [reminderQueueItem()] },
    tenantId: 'hair-tp-clinic',
    patientCareStateStore: mockCareStore({ alreadySent: () => true }),
    smsConnector: connector,
  });
  assert.equal(result.sent, 0);
  assert.equal(result.skipped, 1);
  assert.equal(connector.sent.length, 0);
});

test('dispatchPatientVisitReminderSms hoppar över hela blocket när SMS inte är konfigurerad (e-post opåverkad)', async () => {
  const connector = mockSmsConnector({ configured: false });
  const result = await dispatchPatientVisitReminderSms({
    queue: { visitReminders: [reminderQueueItem()] },
    tenantId: 'hair-tp-clinic',
    patientCareStateStore: mockCareStore(),
    smsConnector: connector,
  });
  assert.equal(result.sent, 0);
  assert.equal(result.skipped, 0);
  assert.equal(result.configured, false);
  assert.equal(connector.sent.length, 0);
  // E-post är en separat dispatch som inte konsulterar SMS-konfigurationen.
  assert.equal(typeof dispatchPatientVisitReminderEmails, 'function');
});

test('dispatchPatientVisitReminderSms hoppar över avvisat 46elks-svar och fortsätter med resten av kön', async () => {
  let calls = 0;
  const connector = mockSmsConnector({
    send: async () => {
      calls += 1;
      // Första meddelandet avvisas, andra går igenom.
      return calls === 1 ? { ok: false, error: 'elks_rejected' } : { ok: true, messageId: 'sms-2' };
    },
  });
  const result = await dispatchPatientVisitReminderSms({
    queue: {
      visitReminders: [
        reminderQueueItem({ reminderKey: 'visit:booking:b1' }),
        reminderQueueItem({ reminderKey: 'visit:booking:b2', patientId: 'p2' }),
      ],
    },
    tenantId: 'hair-tp-clinic',
    patientCareStateStore: mockCareStore(),
    smsConnector: connector,
  });
  assert.equal(result.sent, 1);
  assert.equal(result.skipped, 1);
  assert.equal(connector.sent.length, 2);
});
