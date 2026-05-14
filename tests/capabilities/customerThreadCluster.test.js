const test = require('node:test');
const assert = require('node:assert/strict');
const {
  annotateCustomerThreadClusters,
  resolveThreadClusterSeed,
} = require('../../src/capabilities/customerThreadCluster');

test('resolveThreadClusterSeed prioriterar customerKey', () => {
  const row = {
    customerKey: 'anna_example',
    customerEmail: 'other@example.com',
  };
  assert.equal(resolveThreadClusterSeed(row).seedKind, 'customer_key');
  assert.match(resolveThreadClusterSeed(row).seed, /^ck:/);
});

test('annotateCustomerThreadClusters sätter samma groupId och primary först i listordning', () => {
  const rows = [
    { conversationId: 'c1', customerKey: 'same', customerSummary: { customerKey: 'same' } },
    { conversationId: 'c2', customerKey: 'other', customerSummary: { customerKey: 'other' } },
    { conversationId: 'c3', customerKey: 'same', customerSummary: { customerKey: 'same' } },
  ];
  annotateCustomerThreadClusters(rows, { tenantId: 't1' });
  assert.equal(rows[0].customerCluster.role, 'primary');
  assert.equal(rows[1].customerCluster, undefined);
  assert.equal(rows[2].customerCluster.role, 'member');
  assert.equal(rows[0].customerCluster.groupId, rows[2].customerCluster.groupId);
  assert.equal(rows[0].customerCluster.groupSize, 2);
});

test('annotateCustomerThreadClusters hoppar okända kundnycklar och klusttrar på e-post', () => {
  const rows = [
    { conversationId: 'a', customerKey: 'unknown-customer', customerEmail: 'x@y.com' },
    { conversationId: 'b', customerKey: 'unknown-customer', customerEmail: 'x@y.com' },
  ];
  annotateCustomerThreadClusters(rows, { tenantId: '' });
  assert.equal(rows[0].customerCluster.role, 'primary');
  assert.equal(rows[1].customerCluster.role, 'member');
  assert.equal(resolveThreadClusterSeed(rows[0]).seedKind, 'customer_email');
});
