const test = require('node:test');
const assert = require('node:assert/strict');

const {
  aggregateByCustomer,
  findCrossMailboxCustomers,
  summarizeAggregation,
  pickCustomerEmail,
  pickCustomerName,
} = require('../../src/ops/crossMailboxAggregator');

const iso1 = '2026-01-10T12:00:00.000Z';
const iso2 = '2026-01-11T12:00:00.000Z';

test('aggregateByCustomer groups mailboxes and conversations per customer', () => {
  const messages = [
    {
      customerEmail: 'Pat@Example.com',
      mailboxId: 'kons@clinic.se',
      conversationId: 'conv-1',
      receivedDateTime: iso1,
    },
    {
      customerEmail: 'pat@example.com',
      mailboxId: 'info@clinic.se',
      conversationId: 'conv-2',
      receivedDateTime: iso2,
    },
  ];
  const map = aggregateByCustomer(messages);
  assert.equal(map.size, 1);
  const row = map.get('pat@example.com');
  assert.ok(row);
  assert.equal(row.totalMessages, 2);
  assert.equal(row.mailboxes.length, 2);
  assert.equal(row.conversationCount, 2);
  const ids = new Set(row.mailboxes.map((m) => m.mailboxId));
  assert.deepEqual(ids, new Set(['kons@clinic.se', 'info@clinic.se']));
  assert.ok(row.firstMessageIso <= row.lastMessageIso);
});

test('aggregateByCustomer skips when customer email equals mailboxId', () => {
  const map = aggregateByCustomer([
    {
      customerEmail: 'loop@internal.se',
      mailboxId: 'loop@internal.se',
      conversationId: 'c',
      receivedDateTime: iso1,
    },
  ]);
  assert.equal(map.size, 0);
});

test('findCrossMailboxCustomers flags preferred consolidation', () => {
  const messages = [
    { customerEmail: 'c@x.com', mailboxId: 'a@clinic.se', receivedDateTime: iso1 },
    { customerEmail: 'c@x.com', mailboxId: 'b@clinic.se', receivedDateTime: iso2 },
  ];
  assert.equal(findCrossMailboxCustomers(messages).length, 1);

  const okPreferred = findCrossMailboxCustomers(messages, { preferredMailboxId: 'a@clinic.se' });
  assert.equal(okPreferred[0].needsConsolidation, false);

  const badPreferred = findCrossMailboxCustomers(messages, { preferredMailboxId: 'z@clinic.se' });
  assert.equal(badPreferred[0].needsConsolidation, true);
});

test('summarizeAggregation counts cross-mailbox customers', () => {
  const messages = [
    { customerEmail: 'one@x.com', mailboxId: 'a@m.com', receivedDateTime: iso1 },
    { customerEmail: 'two@x.com', mailboxId: 'b@m.com', receivedDateTime: iso1 },
    { customerEmail: 'two@x.com', mailboxId: 'c@m.com', receivedDateTime: iso2 },
  ];
  const sum = summarizeAggregation(messages, { preferredMailboxId: 'b@m.com' });
  assert.equal(sum.totalCustomers, 2);
  assert.equal(sum.crossMailboxCustomers, 1);
  assert.equal(sum.needsConsolidation, 0);
});

test('aggregateByCustomer null messages ger tom map', () => {
  assert.equal(aggregateByCustomer(null).size, 0);
});

test('aggregateByCustomer hoppar poster utan mailboxId', () => {
  const map = aggregateByCustomer([
    { customerEmail: 'a@test.com', receivedDateTime: iso1 },
    { customerEmail: 'b@test.com', mailboxId: '', receivedDateTime: iso1 },
  ]);
  assert.equal(map.size, 0);
});

test('aggregateByCustomer slar ihop fromEmail och nested sender till samma kund', () => {
  const map = aggregateByCustomer([
    {
      fromEmail: '  Guest@Y.com ',
      mailboxId: 'desk@clinic.se',
      conversationId: 'c1',
      receivedDateTime: iso1,
    },
    {
      sender: { emailAddress: { address: 'guest@y.com', name: 'Guest Y' } },
      mailboxId: 'info@clinic.se',
      conversationId: 'c2',
      receivedDateTime: iso2,
    },
  ]);
  assert.equal(map.size, 1);
  const row = map.get('guest@y.com');
  assert.equal(row.totalMessages, 2);
  assert.equal(row.mailboxes.length, 2);
});

test('pickCustomerEmail och pickCustomerName anvander nested sender', () => {
  assert.equal(
    pickCustomerEmail({ sender: { emailAddress: { address: 'U@P.COM' } } }),
    'u@p.com'
  );
  assert.equal(
    pickCustomerName({ sender: { emailAddress: { name: '  U Person ' } } }),
    'U Person'
  );
});

test('aggregateByCustomer treats non-array input as empty', () => {
  assert.equal(aggregateByCustomer({ not: 'array' }).size, 0);
  assert.equal(aggregateByCustomer('x').size, 0);
});

test('aggregateByCustomer uses sentDateTime when receivedDateTime is missing', () => {
  const map = aggregateByCustomer([
    {
      customerEmail: 'sent@x.com',
      mailboxId: 'desk@clinic.se',
      sentDateTime: '2026-02-01T08:00:00.000Z',
    },
  ]);
  const row = map.get('sent@x.com');
  assert.equal(row.firstMessageIso, '2026-02-01T08:00:00.000Z');
  assert.equal(row.lastMessageIso, '2026-02-01T08:00:00.000Z');
});

test('aggregateByCustomer falls back to persistedAt for first and last ISO', () => {
  const map = aggregateByCustomer([
    {
      customerEmail: 'persist@x.com',
      mailboxId: 'a@clinic.se',
      persistedAt: '2026-01-01T10:00:00.000Z',
    },
    {
      customerEmail: 'persist@x.com',
      mailboxId: 'b@clinic.se',
      persistedAt: '2026-01-05T10:00:00.000Z',
    },
  ]);
  const row = map.get('persist@x.com');
  assert.equal(row.firstMessageIso, '2026-01-01T10:00:00.000Z');
  assert.equal(row.lastMessageIso, '2026-01-05T10:00:00.000Z');
});

test('summarizeAggregation sets needsConsolidation null without preferred mailbox', () => {
  const sum = summarizeAggregation(
    [
      { customerEmail: 'two@x.com', mailboxId: 'b@m.com', receivedDateTime: iso1 },
      { customerEmail: 'two@x.com', mailboxId: 'c@m.com', receivedDateTime: iso2 },
    ],
    {}
  );
  assert.equal(sum.preferredMailboxId, null);
  assert.equal(sum.needsConsolidation, null);
  assert.equal(sum.crossMailboxCustomers, 1);
});

test('findCrossMailboxCustomers returns empty when each customer uses one mailbox', () => {
  const out = findCrossMailboxCustomers([
    { customerEmail: 'a@x.com', mailboxId: 'm1@clinic.se', receivedDateTime: iso1 },
    { customerEmail: 'b@x.com', mailboxId: 'm2@clinic.se', receivedDateTime: iso1 },
  ]);
  assert.deepEqual(out, []);
});

test('pickCustomerEmail använder from.emailAddress.address', () => {
  assert.equal(
    pickCustomerEmail({
      from: { emailAddress: { address: 'From.Nested@X.org' } },
    }),
    'from.nested@x.org'
  );
});

test('pickCustomerEmail använder senderEmail som fallback', () => {
  assert.equal(pickCustomerEmail({ senderEmail: '  Legacy@Old.com ' }), 'legacy@old.com');
});

test('aggregateByCustomer använder receivedAt när receivedDateTime och sentDateTime saknas', () => {
  const map = aggregateByCustomer([
    {
      customerEmail: 'recv@x.com',
      mailboxId: 'desk@clinic.se',
      receivedAt: '2026-03-01T15:00:00.000Z',
    },
  ]);
  const row = map.get('recv@x.com');
  assert.equal(row.firstMessageIso, '2026-03-01T15:00:00.000Z');
  assert.equal(row.lastMessageIso, '2026-03-01T15:00:00.000Z');
});

test('aggregateByCustomer använder sentAt när tidigare tidsfält saknas', () => {
  const map = aggregateByCustomer([
    {
      customerEmail: 'sat@x.com',
      mailboxId: 'desk@clinic.se',
      sentAt: '2026-03-02T09:00:00.000Z',
    },
  ]);
  const row = map.get('sat@x.com');
  assert.equal(row.firstMessageIso, '2026-03-02T09:00:00.000Z');
  assert.equal(row.lastMessageIso, '2026-03-02T09:00:00.000Z');
});

test('aggregateByCustomer deduplicerar samma conversationId', () => {
  const map = aggregateByCustomer([
    {
      customerEmail: 'dup@x.com',
      mailboxId: 'a@clinic.se',
      conversationId: 'same-conv',
      receivedDateTime: iso1,
    },
    {
      customerEmail: 'dup@x.com',
      mailboxId: 'a@clinic.se',
      conversationId: 'same-conv',
      receivedDateTime: iso2,
    },
  ]);
  const row = map.get('dup@x.com');
  assert.equal(row.totalMessages, 2);
  assert.equal(row.conversationCount, 1);
});
