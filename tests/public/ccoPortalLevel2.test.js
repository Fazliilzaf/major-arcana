'use strict';

/* Kundportalens nivå-2-klient (render-funktioner). Rena, DOM-fria: bygger HTML
 * ur /me-svaret. Testar utloggat vs inloggat, offert-status, journal-referens,
 * bokningar, token-härledning och att dynamiska värden escape:as (XSS-skydd). */

const test = require('node:test');
const assert = require('node:assert/strict');
const l2 = require('../../public/major-arcana-preview/app/cco-portal-level2.js');

test('utloggat → BankID-login-knapp med rätt URL', () => {
  const html = l2.renderFromMe(
    { authenticated: false },
    { loginUrl: '/api/v1/cco-portal/bankid/login?token=tok' }
  );
  assert.match(html, /Logga in med BankID/);
  assert.match(html, /href="\/api\/v1\/cco-portal\/bankid\/login\?token=tok"/);
});

test('utloggat utan loginUrl → uppmanar öppna via personlig länk (ingen knapp)', () => {
  const html = l2.renderFromMe({ authenticated: false }, {});
  assert.match(html, /personliga länk/);
  assert.doesNotMatch(html, /<a class="l2-btn"/);
});

test('inloggad med signeringsbar offert → titel, status och signera-knapp', () => {
  const html = l2.renderFromMe(
    {
      authenticated: true,
      offer: {
        hasOffer: true,
        offerPlan: { treatmentLabel: 'DHI — Hårlinje', price: { quotedAmount: '75 000 kr' } },
        signing: { status: 'ready_to_sign', canAccept: true },
        journal: { count: 0 },
        bookings: { upcoming: [] },
      },
    },
    {}
  );
  assert.match(html, /DHI — Hårlinje/);
  assert.match(html, /75 000 kr/);
  assert.match(html, /Redo att signera/);
  assert.match(html, /data-l2-accept/);
});

test('betänketid → visar från-datum och ingen signera-knapp', () => {
  const html = l2.renderOffer({
    hasOffer: true,
    offerPlan: { method: 'DHI' },
    signing: {
      status: 'cooling_off',
      canAccept: false,
      coolingOff: { endsAt: '2026-07-20T00:00:00Z' },
    },
  });
  assert.match(html, /Betänketid pågår/);
  assert.match(html, /Kan signeras från 2026-07-20/);
  assert.doesNotMatch(html, /data-l2-accept/);
});

test('ingen offert → vänlig placeholder', () => {
  assert.match(l2.renderOffer({ hasOffer: false }), /inte klar ännu/);
});

test('journal-referens visar antal/signerade/senaste, aldrig innehåll', () => {
  const html = l2.renderJournal({
    count: 3,
    signedCount: 2,
    latestAt: '2026-02-01T00:00:00Z',
    types: ['x'],
  });
  assert.match(html, /3<\/strong> journalposter/);
  assert.match(html, /2 signerade/);
  assert.match(html, /senast 2026-02-01/);
  assert.match(html, /hanteras av kliniken/);
});

test('journal tom → "Inga journalposter ännu"', () => {
  assert.match(l2.renderJournal({ count: 0 }), /Inga journalposter ännu/);
});

test('bokningar renderas med datum + tjänst, sorterade som givna', () => {
  const html = l2.renderBookings({
    upcoming: [
      { startsAt: '2026-07-10T09:00:00Z', serviceLabel: 'Konsultation' },
      { startsAt: '2026-08-01T09:00:00Z', encounterType: 'Kontroll' },
    ],
  });
  assert.match(html, /2026-07-10/);
  assert.match(html, /Konsultation/);
  assert.match(html, /2026-08-01/);
  assert.match(html, /Kontroll/);
});

test('bokningar tomma → "Inga kommande bokningar"', () => {
  assert.match(l2.renderBookings({ upcoming: [] }), /Inga kommande bokningar/);
});

test('XSS: dynamiska värden escape:as', () => {
  const html = l2.renderOffer({
    hasOffer: true,
    offerPlan: { treatmentLabel: '<img src=x onerror=alert(1)>' },
    signing: { status: 'preparing' },
  });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

test('tokenFromLocation läser /portal-chat/<token> och ?token=', () => {
  assert.equal(l2.tokenFromLocation({ pathname: '/portal-chat/abc123', search: '' }), 'abc123');
  assert.equal(l2.tokenFromLocation({ pathname: '/nope', search: '?token=xyz' }), 'xyz');
  assert.equal(l2.tokenFromLocation({ pathname: '/x', search: '' }), '');
});

test('loginUrlFor bygger login-URL, tomt utan token', () => {
  assert.equal(l2.loginUrlFor('t o'), '/api/v1/cco-portal/bankid/login?token=t%20o');
  assert.equal(l2.loginUrlFor(''), '');
});
