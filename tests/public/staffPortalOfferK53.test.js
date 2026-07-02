const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const staffPortalPath = path.join(__dirname, '..', '..', 'public', 'staff-portal.html');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('K53 staff portal renders owner offer list from K52 overview', () => {
  const source = read(staffPortalPath);

  assert.match(source, /liveOwnerOfferDashboard/);
  assert.match(source, /owner-offers/);
  assert.match(source, /owner-offer-overview/);
  assert.match(source, /loadOwnerOfferDashboard/);
  assert.match(source, /renderOwnerOfferRow/);
  assert.match(source, /Väntar kund/);
  assert.match(source, /Redo att signera/);
  assert.match(source, /Signerad/);
  assert.match(source, /Fastnat/);
  assert.match(source, /Öppna kundkort/);
});
