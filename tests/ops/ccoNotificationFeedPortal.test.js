'use strict';

/* Staff-notis vid inbound (följdsteg). Notification-feeden ska ytan olästa
 * inkommande portal-meddelanden som en notis per kund (typ 'portal_message'),
 * länkad till kundkortet. Ren läs-aggregering. */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createCcoNotificationFeedStore,
  NOTIFICATION_TYPES,
} = require('../../src/ops/ccoNotificationFeedStore');

test('portal_message finns som notis-typ', () => {
  assert.ok(NOTIFICATION_TYPES.includes('portal_message'));
});

test('feeden ytar oläst inbound portal-meddelande som notis per kund', async () => {
  const portalMessageStore = {
    listUnreadInboundSummaries: () => [
      {
        tenantId: 'hairtpclinic',
        customerId: 'CUST-9',
        unread: 2,
        latestInboundAt: new Date().toISOString(),
        latestBody: 'Går det bra att flytta min tid?',
      },
    ],
  };
  const feed = createCcoNotificationFeedStore({ portalMessageStore });
  const res = await feed.getFeed({ role: 'operator', sinceHours: 72 });
  const portalNotifs = res.items.filter((i) => i.type === 'portal_message');
  assert.equal(portalNotifs.length, 1);
  assert.match(portalNotifs[0].title, /2 nya portal-meddelanden/);
  assert.equal(portalNotifs[0].customerId, 'CUST-9');
  // Länkar till kundkortet (inte en generisk task-vy).
  assert.match(portalNotifs[0].actionUrl, /CUST-9/);
  assert.equal(res.byType.portal_message, 1);
});

test('utan portal-store degraderar feeden tyst (inga portal-notiser)', async () => {
  const feed = createCcoNotificationFeedStore({});
  const res = await feed.getFeed({ role: 'operator' });
  assert.equal(res.items.filter((i) => i.type === 'portal_message').length, 0);
});

test('lästa/utgångna inbound ger ingen notis (bygger på store-summeringen)', async () => {
  // Storen returnerar tom lista när allt är läst → inga notiser.
  const feed = createCcoNotificationFeedStore({
    portalMessageStore: { listUnreadInboundSummaries: () => [] },
  });
  const res = await feed.getFeed({ role: 'operator' });
  assert.equal(res.items.filter((i) => i.type === 'portal_message').length, 0);
});
