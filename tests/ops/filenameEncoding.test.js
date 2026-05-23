const test = require('node:test');
const assert = require('node:assert/strict');
const { repairMojibakeFilename } = require('../../src/ops/filenameEncoding');

test('repairMojibakeFilename lämnar normala namn orörda', () => {
  assert.equal(repairMojibakeFilename('Axel Meijer journal.pdf'), 'Axel Meijer journal.pdf');
});

test('repairMojibakeFilename reparerar latin1→utf8 mojibake', () => {
  const broken = Buffer.from('Hälsodeklaration.pdf', 'utf8').toString('latin1');
  assert.match(repairMojibakeFilename(broken), /H.*lsodeklaration\.pdf/i);
});
