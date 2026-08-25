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

// 2026-08-25: påminnelse-SMS grindas nu av CCO_SMS_REMINDERS_LIVE och är
// avstängt om inget annat sägs. De befintliga testerna nedan testar vad som
// händer NÄR utskick är påslaget, så grinden öppnas för hela filen. Att den
// stänger är ett eget test längst ner — utan det skulle en borttagen grind
// aldrig märkas här.
process.env.CCO_SMS_REMINDERS_LIVE = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildCustomerReminderQueue,
  dispatchPatientVisitReminderEmails,
  dispatchPatientVisitReminderSms,
  smsRemindersLive,
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
    customerEmail: '',
    serviceLabel: 'Konsultation',
    startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    phone: '+46700000000',
    ...overrides,
  };
}

// patients: [{ id, primaryPhone, primaryEmail, emails = [] }]
function mockPatientMasterStore({ patients = [] } = {}) {
  const byId = new Map(patients.map((p) => [p.id, p]));
  return {
    async getPatient({ patientId }) {
      return byId.get(patientId) || null;
    },
    async findPatientsByEmails({ emails = [] }) {
      const matches = {};
      for (const email of emails) {
        const key = String(email || '').toLowerCase();
        matches[key] = patients
          .filter((p) => {
            const all = [p.primaryEmail, ...(p.emails || [])].map((e) =>
              String(e || '').toLowerCase()
            );
            return all.includes(key);
          })
          .map((p) => ({ patientId: p.id, id: p.id }));
      }
      return { matches };
    },
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

test('dispatchPatientVisitReminderSms resolverar telefon via customerEmail när patientId saknas', async () => {
  const connector = mockSmsConnector();
  const patientMasterStore = mockPatientMasterStore({
    patients: [{ id: 'p1', primaryEmail: 'anna@example.com', primaryPhone: '+46701234567' }],
  });
  const result = await dispatchPatientVisitReminderSms({
    queue: {
      visitReminders: [
        reminderQueueItem({ phone: '', patientId: '', customerEmail: 'anna@example.com' }),
      ],
    },
    tenantId: 'hair-tp-clinic',
    patientCareStateStore: mockCareStore(),
    patientMasterStore,
    smsConnector: connector,
  });
  assert.equal(result.sent, 1);
  assert.equal(result.skipped, 0);
  assert.equal(connector.sent.length, 1);
  assert.equal(connector.sent[0].to, '+46701234567');
});

test('dispatchPatientVisitReminderSms skickar inte när e-post matchar flera patienter (tvetydigt)', async () => {
  const connector = mockSmsConnector();
  const patientMasterStore = mockPatientMasterStore({
    patients: [
      { id: 'p1', primaryEmail: 'shared@example.com', primaryPhone: '+46701234567' },
      { id: 'p2', primaryEmail: 'shared@example.com', primaryPhone: '+46709999999' },
    ],
  });
  const result = await dispatchPatientVisitReminderSms({
    queue: {
      visitReminders: [
        reminderQueueItem({ phone: '', patientId: '', customerEmail: 'shared@example.com' }),
      ],
    },
    tenantId: 'hair-tp-clinic',
    patientCareStateStore: mockCareStore(),
    patientMasterStore,
    smsConnector: connector,
  });
  assert.equal(result.sent, 0);
  assert.equal(result.skipped, 1);
  assert.equal(connector.sent.length, 0);
});

test('dispatchPatientVisitReminderSms faller tillbaka på e-post när patientId saknar telefon', async () => {
  const connector = mockSmsConnector();
  const patientMasterStore = mockPatientMasterStore({
    patients: [
      { id: 'p1', primaryEmail: 'other@example.com', primaryPhone: '' },
      { id: 'p2', primaryEmail: 'anna@example.com', primaryPhone: '+46701234567' },
    ],
  });
  // patientId pekar på p1 (ingen telefon); e-posten matchar p2 (har telefon).
  const result = await dispatchPatientVisitReminderSms({
    queue: {
      visitReminders: [
        reminderQueueItem({ phone: '', patientId: 'p1', customerEmail: 'anna@example.com' }),
      ],
    },
    tenantId: 'hair-tp-clinic',
    patientCareStateStore: mockCareStore(),
    patientMasterStore,
    smsConnector: connector,
  });
  assert.equal(result.sent, 1);
  assert.equal(result.skipped, 0);
  assert.equal(connector.sent[0].to, '+46701234567');
});

test('dispatchPatientVisitReminderSms hoppar över när varken id eller e-post ger träff', async () => {
  const connector = mockSmsConnector();
  const patientMasterStore = mockPatientMasterStore({ patients: [] });
  const result = await dispatchPatientVisitReminderSms({
    queue: {
      visitReminders: [
        reminderQueueItem({
          phone: '',
          patientId: 'saknad',
          customerEmail: 'ingen@example.com',
          reminderKey: 'visit:booking:b1',
        }),
        reminderQueueItem({
          phone: '',
          patientId: '',
          customerEmail: 'anna@example.com',
          reminderKey: 'visit:booking:b2',
        }),
      ],
    },
    tenantId: 'hair-tp-clinic',
    patientCareStateStore: mockCareStore(),
    patientMasterStore,
    smsConnector: connector,
  });
  assert.equal(result.sent, 0);
  assert.equal(result.skipped, 2);
  assert.equal(connector.sent.length, 0);
});

test('dispatchPatientVisitReminderSms normaliserar svenskt nationellt nummer till E.164 före sendSms', async () => {
  const connector = mockSmsConnector();
  const patientMasterStore = mockPatientMasterStore({
    patients: [{ id: 'p1', primaryEmail: 'anna@example.com', primaryPhone: '0701234567' }],
  });
  const result = await dispatchPatientVisitReminderSms({
    queue: {
      visitReminders: [
        reminderQueueItem({ phone: '', patientId: '', customerEmail: 'anna@example.com' }),
      ],
    },
    tenantId: 'hair-tp-clinic',
    patientCareStateStore: mockCareStore(),
    patientMasterStore,
    smsConnector: connector,
  });
  assert.equal(result.sent, 1);
  assert.equal(connector.sent[0].to, '+46701234567');
});

// ── Grinden CCO_SMS_REMINDERS_LIVE ────────────────────────────────────────
//
// 2026-08-25. Fram till nu fanns ingen grind alls på påminnelse-SMS:en.
// `isConfigured()` var enda kontrollen, och nycklarna låg redan på Render —
// produktionen svarade `providerConfigured: true`. Det märktes aldrig,
// eftersom telefonnumret ändå inte nådde fram. När ORD-104 löste det skulle
// nästa schemakörning ha skickat skarpa SMS till riktiga patienter utan att
// kedjan provats en enda gång.
//
// Grinden är avstängd om inget annat sägs. En glömd variabel ska betyda
// tystnad, aldrig ett oväntat utskick till en patient.

test('grinden avstängd: inget skickas, men nycklarna syns fortfarande som konfigurerade', async () => {
  const connector = mockSmsConnector();
  const result = await dispatchPatientVisitReminderSms({
    queue: { visitReminders: [reminderQueueItem(), reminderQueueItem({ id: 'b-2' })] },
    tenantId: 'hair-tp-clinic',
    patientCareStateStore: mockCareStore(),
    smsConnector: connector,
    live: false,
  });

  assert.equal(connector.sent.length, 0, 'inget SMS får lämna systemet när grinden är stängd');
  assert.equal(result.sent, 0);
  assert.equal(result.gated, true);
  assert.equal(result.skipped, 2, 'hela kön ska räknas som överhoppad, inte tappas tyst');
  assert.equal(
    result.configured,
    true,
    'configured speglar nycklarna — annars går det inte att skilja avstängd från saknade nycklar'
  );
});

test('grinden påslagen: utskicket går igenom som vanligt', async () => {
  const connector = mockSmsConnector();
  const result = await dispatchPatientVisitReminderSms({
    queue: { visitReminders: [reminderQueueItem()] },
    tenantId: 'hair-tp-clinic',
    patientCareStateStore: mockCareStore(),
    smsConnector: connector,
    live: true,
  });

  assert.equal(result.gated, false);
  assert.equal(result.sent, 1);
  assert.equal(connector.sent.length, 1);
});

test('smsRemindersLive: bara uttryckliga ja-värden öppnar grinden', () => {
  for (const v of ['1', 'true', 'TRUE', 'yes', 'on']) {
    assert.equal(smsRemindersLive({ CCO_SMS_REMINDERS_LIVE: v }), true, `${v} ska öppna`);
  }
  for (const v of ['', '0', 'false', 'no', 'off', 'kanske', undefined]) {
    assert.equal(
      smsRemindersLive({ CCO_SMS_REMINDERS_LIVE: v }),
      false,
      `${JSON.stringify(v)} ska INTE öppna`
    );
  }
});

test('saknad variabel ger tystnad, inte utskick', () => {
  assert.equal(smsRemindersLive({}), false, 'en glömd variabel får aldrig betyda "skicka"');
});
