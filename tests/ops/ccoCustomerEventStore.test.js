'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoCustomerEventStore } = require('../../src/ops/ccoCustomerEventStore');

test('ccoCustomerEventStore appendEvent + listStaffAttentionByCustomer', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'customer-events-'));
  const filePath = path.join(tmp, 'customer-events.jsonl');
  const store = await createCcoCustomerEventStore({ filePath });

  await store.appendEvent({
    kind: 'offer_viewed',
    customerId: 'cust-1',
    ts: new Date().toISOString(),
  });
  await store.appendEvent({
    kind: 'customer_photo_uploaded',
    customerId: 'cust-1',
    ts: new Date().toISOString(),
  });

  const grouped = store.listStaffAttentionByCustomer({ sinceMs: 60_000 });
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].customerId, 'cust-1');
  assert.equal(grouped[0].counts.offer_viewed, 1);
  assert.equal(grouped[0].counts.customer_photo_uploaded, 1);

  const reloaded = await createCcoCustomerEventStore({ filePath });
  const again = reloaded.listStaffAttentionByCustomer({ sinceMs: 60_000 });
  assert.equal(again.length, 1);
  assert.equal(again[0].events.length, 2);

  await fs.rm(tmp, { recursive: true, force: true });
});
