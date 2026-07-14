const test = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs } = require('../../scripts/run-cco-full-enrichment-backfill');

test('parseArgs supports a bounded mailbox enrichment batch', () => {
  const args = parseArgs([
    '--base-url',
    'https://arcana.hairtpclinic.com/',
    '--bounded-limit',
    '30',
    '--mailbox',
    'KONS@hairtpclinic.com',
  ]);

  assert.equal(args.baseUrl, 'https://arcana.hairtpclinic.com');
  assert.equal(args.boundedLimit, 30);
  assert.equal(args.mailboxId, 'kons@hairtpclinic.com');
});
