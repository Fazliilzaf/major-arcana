const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

const { createCcoPolicyStore, createCcoMailSnoozeStore } = require('../../src/ops/ccoPolicyStore');

async function tmpFile(prefix) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return path.join(dir, 'data.json');
}

test('policy store: get/update/reset', async () => {
  const filePath = await tmpFile('cco-policy-');
  const audited = [];
  const store = await createCcoPolicyStore({
    filePath,
    auditLog: { append: (e) => audited.push(e) },
  });

  // get hela paketet
  const all = store.get();
  assert.ok(all.officeHours);
  assert.ok(all.booking);
  assert.equal(all.booking.minLeadHours, 24);

  // get sektion
  const booking = store.get('booking');
  assert.equal(booking.minLeadHours, 24);

  // okänd sektion → badRequest
  assert.throws(
    () => store.get('nope'),
    (err) => err.statusCode === 400
  );

  // update
  const updated = await store.update('booking', { minLeadHours: 48 }, { role: 'owner' });
  assert.equal(updated.minLeadHours, 48);
  assert.equal(store.get('booking').minLeadHours, 48);
  assert.equal(audited.filter((e) => e.action === 'cco.policy.update').length, 1);

  // reset sektion
  const reset = await store.reset('booking', { role: 'owner' });
  assert.equal(reset.minLeadHours, 24);

  // reset all
  await store.update('booking', { minLeadHours: 99 }, { role: 'owner' });
  const all2 = await store.reset(null, { role: 'owner' });
  assert.equal(all2.booking.minLeadHours, 24);
});

test('policy store: evaluateBooking accept + reject', async () => {
  const filePath = await tmpFile('cco-policy-eval-');
  const store = await createCcoPolicyStore({ filePath });

  const now = new Date('2026-06-24T10:00:00.000Z');

  // för tidigt (under 24h)
  const tooSoon = store.evaluateBooking('2026-06-24T20:00:00.000Z', { now });
  assert.equal(tooSoon.allowed, false);
  assert.equal(tooSoon.code, 'too_soon');

  // ok (mer än 24h, mindre än 180 dagar)
  const ok = store.evaluateBooking('2026-06-30T10:00:00.000Z', { now });
  assert.equal(ok.allowed, true);
  assert.equal(ok.code, 'ok');

  // i det förflutna
  const past = store.evaluateBooking('2026-06-01T10:00:00.000Z', { now });
  assert.equal(past.allowed, false);
  assert.equal(past.code, 'in_past');

  // för långt fram
  const tooFar = store.evaluateBooking('2027-06-30T10:00:00.000Z', { now });
  assert.equal(tooFar.allowed, false);
  assert.equal(tooFar.code, 'too_far');

  // ogiltigt datum
  const bad = store.evaluateBooking('not-a-date', { now });
  assert.equal(bad.allowed, false);
  assert.equal(bad.code, 'invalid_date');
});

test('policy store: evaluateCancellation', async () => {
  const filePath = await tmpFile('cco-policy-cancel-');
  const store = await createCcoPolicyStore({ filePath });
  const now = new Date('2026-06-24T10:00:00.000Z');

  const late = store.evaluateCancellation('2026-06-24T20:00:00.000Z', { now });
  assert.equal(late.allowed, true);
  assert.equal(late.fee, true);
  assert.equal(late.code, 'late');

  const free = store.evaluateCancellation('2026-06-30T10:00:00.000Z', { now });
  assert.equal(free.allowed, true);
  assert.equal(free.fee, false);
  assert.equal(free.code, 'free');
});

test('policy store: isOpenNow + shouldAutoReply', async () => {
  const filePath = await tmpFile('cco-policy-hours-');
  const store = await createCcoPolicyStore({ filePath });

  // Onsdag 2026-06-24 12:00 UTC → öppet (09-17)
  const openTime = new Date('2026-06-24T12:00:00.000Z');
  assert.equal(store.isOpenNow({ now: openTime }), true);
  assert.equal(store.shouldAutoReply({ now: openTime }), false);

  // Onsdag 2026-06-24 22:00 UTC → stängt
  const closedTime = new Date('2026-06-24T22:00:00.000Z');
  assert.equal(store.isOpenNow({ now: closedTime }), false);
  assert.equal(store.shouldAutoReply({ now: closedTime }), true);

  // Söndag 2026-06-28 12:00 UTC → stängt (null slot)
  const sunday = new Date('2026-06-28T12:00:00.000Z');
  assert.equal(store.isOpenNow({ now: sunday }), false);
});

test('policy store: upsert/delete auto-assign rule + assignMail', async () => {
  const filePath = await tmpFile('cco-policy-assign-');
  const store = await createCcoPolicyStore({ filePath });

  // ingen regel → default (null)
  const before = store.assignMail({ subject: 'Faktura mars' });
  assert.equal(before.matched, false);
  assert.equal(before.assignee, null);

  const rule = await store.upsertAutoAssignRule(
    {
      match: { field: 'subject', contains: 'faktura' },
      assignee: 'ekonomi@klinik.se',
      priority: 10,
    },
    { role: 'owner' }
  );
  assert.ok(rule.id);
  assert.equal(rule.assignee, 'ekonomi@klinik.se');

  const assigned = store.assignMail({ subject: 'Faktura mars' });
  assert.equal(assigned.matched, true);
  assert.equal(assigned.assignee, 'ekonomi@klinik.se');
  assert.equal(assigned.ruleId, rule.id);

  // ingen match
  const noMatch = store.assignMail({ subject: 'Tack för senast' });
  assert.equal(noMatch.matched, false);

  // upsert (uppdatera befintlig)
  const updatedRule = await store.upsertAutoAssignRule(
    { id: rule.id, match: { field: 'subject', contains: 'faktura' }, assignee: 'annan@klinik.se' },
    { role: 'owner' }
  );
  assert.equal(updatedRule.assignee, 'annan@klinik.se');
  assert.equal(store.get('autoAssign').rules.length, 1);

  // delete
  const del = await store.deleteAutoAssignRule(rule.id, { role: 'owner' });
  assert.equal(del.ok, true);
  assert.equal(store.get('autoAssign').rules.length, 0);

  // delete saknad → badRequest
  await assert.rejects(
    () => store.deleteAutoAssignRule('does-not-exist'),
    (err) => err.statusCode === 400
  );
});

test('policy store: persistens över ladda om', async () => {
  const filePath = await tmpFile('cco-policy-persist-');
  const store1 = await createCcoPolicyStore({ filePath });
  await store1.update('booking', { minLeadHours: 72 }, { role: 'owner' });
  await store1.upsertAutoAssignRule(
    { match: { field: 'from', contains: 'vip' }, assignee: 'owner@klinik.se' },
    { role: 'owner' }
  );

  const store2 = await createCcoPolicyStore({ filePath });
  assert.equal(store2.get('booking').minLeadHours, 72);
  assert.equal(store2.get('autoAssign').rules.length, 1);
  assert.equal(store2.assignMail({ from: 'VIP Kund' }).assignee, 'owner@klinik.se');
});

test('mail snooze store: snooze → active → ready → unsnooze + persistens', async () => {
  const filePath = await tmpFile('cco-snooze-');
  const audited = [];
  const store = await createCcoMailSnoozeStore({
    filePath,
    auditLog: { append: (e) => audited.push(e) },
  });

  const now = new Date('2026-06-24T10:00:00.000Z');
  const future = new Date('2026-06-25T10:00:00.000Z').toISOString();

  const snoozed = await store.snooze('thread-1', future, { role: 'staff', userId: 'u1' });
  assert.equal(snoozed.mailId, 'thread-1');
  assert.equal(snoozed.untilIso, future);

  // active (innan tiden passerat)
  const active = store.active({ now });
  assert.equal(active.length, 1);
  assert.equal(active[0].mailId, 'thread-1');

  // ready (innan tiden passerat) → tom
  assert.equal(store.ready({ now }).length, 0);

  // ready efter att tiden passerat
  const later = new Date('2026-06-26T10:00:00.000Z');
  const ready = store.ready({ now: later });
  assert.equal(ready.length, 1);
  assert.equal(store.active({ now: later }).length, 0);

  // list
  assert.equal(store.list().length, 1);

  // audit för snooze
  assert.equal(audited.filter((e) => e.action === 'cco.mail_snooze.set').length, 1);

  // unsnooze
  const cleared = await store.unsnooze('thread-1', { role: 'staff' });
  assert.equal(cleared.ok, true);
  assert.equal(store.list().length, 0);

  // unsnooze saknad → badRequest
  await assert.rejects(
    () => store.unsnooze('nope'),
    (err) => err.statusCode === 400
  );

  // ogiltig snooze → badRequest
  await assert.rejects(
    () => store.snooze('', future),
    (err) => err.statusCode === 400
  );

  // persistens
  await store.snooze('thread-2', future, { role: 'staff' });
  const store2 = await createCcoMailSnoozeStore({ filePath });
  assert.equal(store2.list().length, 1);
  assert.equal(store2.list()[0].mailId, 'thread-2');
});
