const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCalendarSignalsIndex,
  buildEmailIcsReminderKey,
  deriveCalendarSignalsForVisit,
  indexReminderLog,
} = require('../../src/ops/bookingCalendarSignals');

test('deriveCalendarSignalsForVisit flags missing health declaration', () => {
  const signals = deriveCalendarSignalsForVisit({
    bookingCase: {
      bookingCaseId: 'case-1',
      customerEmail: 'patient@example.com',
      events: [],
    },
    slot: {
      startsAt: '2030-06-01T10:00:00.000Z',
      serviceId: 'consultation_physical',
    },
    missingByEmail: new Map([
      [
        'patient@example.com',
        {
          patientId: 'p-1',
          missing: ['health_declaration'],
        },
      ],
    ]),
    leadTimeConfig: { physicalHours: 24, onlineHours: 12 },
  });

  assert.equal(signals.needsHealthDeclaration, true);
  assert.equal(signals.missingForms, true);
  assert.match(signals.missingFormLabels.join(' '), /Hälsodeklaration/);
  assert.equal(signals.patientPortalHint, 'patientportal_form_missing');
});

test('deriveCalendarSignalsForVisit detects email ICS from reminder log', () => {
  const bookingCase = {
    bookingCaseId: 'case-ics',
    customerEmail: 'patient@example.com',
    events: [],
  };
  const emailIcsKey = buildEmailIcsReminderKey({ kind: 'booking', id: 'case-ics' });
  const reminderIndex = indexReminderLog([
    {
      reminderKey: emailIcsKey,
      channel: 'patient_email_ics',
      metadata: {
        customerEmail: 'patient@example.com',
        startsAt: '2030-06-01T10:00:00.000Z',
      },
    },
  ]);

  const signals = deriveCalendarSignalsForVisit({
    bookingCase,
    slot: { startsAt: '2030-06-01T10:00:00.000Z' },
    reminderIndex,
  });

  assert.equal(signals.emailIcsSent, true);
});

test('deriveCalendarSignalsForVisit marks sms due inside lead-time window', () => {
  const startsAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const signals = deriveCalendarSignalsForVisit({
    bookingCase: {
      bookingCaseId: 'case-sms',
      customerEmail: 'patient@example.com',
      events: [],
    },
    slot: {
      startsAt,
      serviceId: 'consultation_physical',
      meetingMode: 'physical',
    },
    leadTimeConfig: { physicalHours: 24, onlineHours: 12 },
  });

  assert.equal(signals.smsReminderSent, false);
  assert.equal(signals.smsReminderDue, true);
  assert.equal(signals.smsLeadTimeHours, 24);
});

test('buildCalendarSignalsIndex scopes by date range and case id', () => {
  const index = buildCalendarSignalsIndex({
    bookingCases: [
      {
        bookingCaseId: 'in-range',
        customerEmail: 'a@example.com',
        selectedSlots: [{ startsAt: '2030-06-02T09:00:00.000Z' }],
        events: [],
      },
      {
        bookingCaseId: 'out-range',
        customerEmail: 'b@example.com',
        selectedSlots: [{ startsAt: '2030-07-02T09:00:00.000Z' }],
        events: [],
      },
    ],
    fromDate: '2030-06-01',
    toDate: '2030-06-30',
    leadTimeConfig: { physicalHours: 24, onlineHours: 12 },
  });

  assert.ok(index.byCaseId['in-range']);
  assert.equal(index.byCaseId['out-range'], undefined);
});
