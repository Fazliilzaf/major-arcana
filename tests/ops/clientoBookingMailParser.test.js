'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isClientoBookingMail,
  parseClientoWebBookingMail,
  parseNameFromSubject,
  parseSwedishDateTime,
} = require('../../src/ops/clientoBookingMailParser');
const { buildActiveVisitPayload } = require('../../src/ops/ccoActiveVisit');
const {
  buildBookingSignalsIndex,
  getBookingSignals,
  applyBookingToReadout,
} = require('../../src/ops/ccoKunderBookingEnrichment');

describe('clientoBookingMailParser', () => {
  it('detects Cliento web booking mail', () => {
    assert.equal(
      isClientoBookingMail({
        fromEmail: 'no-reply@cliento.com',
        subject: 'Ny bokning (web): Carl-Marcus Ahlengren, onsdag 17 juni 2026 15:15',
      }),
      true
    );
  });

  it('parses Carl-Marcus Cliento web booking fixture', () => {
    const parsed = parseClientoWebBookingMail({
      id: 'raw-carl-marcus',
      internetMessageId: '<carl-marcus-web-booking@cliento.test>',
      fromEmail: 'no-reply@cliento.com',
      subject: 'Ny bokning (web): Carl-Marcus Ahlengren, onsdag 17 juni 2026 15:15',
      bodyText: `
Ny bokning: Carl-Marcus Ahlengren
onsdag 17 juni 2026 15:15

Bokningsinformation
Namn: Carl-Marcus Ahlengren
Telefon: 0709203971
E-post: carlmarcus@gmail.com
Tidpunkt: onsdag 17 juni 2026 15:15
Tjänst: Fysisk konsultation
Resurs: Fysisk konsultation
      `.trim(),
    });

    assert.equal(parsed.ok, true);
    assert.equal(parsed.customerName, 'Carl-Marcus Ahlengren');
    assert.equal(parsed.customerEmail, 'carlmarcus@gmail.com');
    assert.equal(parsed.serviceLabel, 'Fysisk konsultation');
    assert.equal(parsed.staffName, 'Fysisk konsultation');
    assert.equal(parsed.startsAt, '2026-06-17T15:15:00.000Z');
    assert.equal(parsed.status, 'completed');
    assert.match(parsed.bookingId, /^cliento-web:/);
  });

  it('parses Swedish datetime from subject/body', () => {
    assert.equal(parseSwedishDateTime('onsdag 17 juni 2026 15:15'), '2026-06-17T15:15:00.000Z');
  });

  it('parses classic Ny bokning subject names without trailing time', () => {
    assert.equal(parseNameFromSubject('Ny bokning: Anna Karlsson - 15 maj 14:00'), 'Anna Karlsson');
    assert.equal(
      parseNameFromSubject('Ny bokning (web): Carl-Marcus Ahlengren, onsdag 17 juni 2026 15:15'),
      'Carl-Marcus Ahlengren'
    );
  });
});

describe('cliento web booking enrichment chain', () => {
  it('sets todayVisit and activeVisit.visible for same-day Cliento booking', () => {
    const startsAt = '2026-06-17T15:15:00.000Z';
    const patients = [
      {
        id: 'p-carl',
        primaryEmail: 'carlmarcus@gmail.com',
        emails: [],
        flags: [],
        fileSummary: {},
      },
    ];

    const originalDate = Date;
    global.Date = class extends Date {
      constructor(...args) {
        if (args.length === 0) {
          super('2026-06-17T12:00:00.000Z');
          return;
        }
        super(...args);
      }
      static now() {
        return new Date('2026-06-17T12:00:00.000Z').getTime();
      }
    };

    try {
      const { index } = buildBookingSignalsIndex({
        patients,
        engineBookings: [],
        bookingCases: [],
        encounters: [],
        clientoBookings: [
          {
            bookingId: 'cliento-web:test',
            customerEmail: 'carlmarcus@gmail.com',
            customerName: 'Carl-Marcus Ahlengren',
            startsAt,
            status: 'upcoming',
            serviceLabel: 'Fysisk konsultation',
            staffName: 'Fysisk konsultation',
            source: 'cliento_web_mail',
          },
        ],
      });

      const signals = getBookingSignals(index, 'p-carl');
      const card = applyBookingToReadout({ patientId: 'p-carl', todayVisit: false }, signals);

      assert.equal(card.todayVisit, true);
      const activeVisit = buildActiveVisitPayload({
        card,
        bookingContext: {
          upcomingBookings: signals.upcomingBookings,
          historyBookings: signals.historyBookings,
        },
        journalEntries: [],
        encounter: null,
      });
      assert.equal(activeVisit.visible, true);
      assert.equal(activeVisit.state, 'scheduled_today');
      assert.equal(activeVisit.serviceLabel, 'Fysisk konsultation');
    } finally {
      global.Date = originalDate;
    }
  });
});
