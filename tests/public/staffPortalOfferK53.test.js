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

test('K54 staff portal filters owner offer list by status and search', () => {
  const source = read(staffPortalPath);

  assert.match(source, /_ownerOfferFilter = 'active'/);
  assert.match(source, /renderOwnerOfferFilters/);
  assert.match(source, /filterOwnerOfferRows/);
  assert.match(source, /data-owner-offer-filter/);
  assert.match(source, /\['active', 'Aktiva'/);
  assert.match(source, /\['stuck', 'Fastnade'/);
  assert.match(source, /\['readyToSign', 'Redo'/);
  assert.match(source, /\['waitingCustomer', 'Väntar kund'/);
  assert.match(source, /\['signed', 'Signerade'/);
  assert.match(source, /data-owner-offer-search/);
  assert.match(source, /Inga offerter matchar filtret just nu/);
});

test('K55 staff portal exposes a stuck-offer work mode', () => {
  const source = read(staffPortalPath);

  assert.match(source, /ownerOfferStuckReason/);
  assert.match(source, /renderOwnerOfferStuckWorkmode/);
  assert.match(source, /data-owner-offer-stuck-workmode/);
  assert.match(source, /Fastnade offerter · arbetsläge/);
  assert.match(source, /Kontrollera pris, zoner och bilder/);
  assert.match(source, /Följ upp i konversation/);
  assert.match(source, /Notera beslut innan ny delning/);
  assert.match(source, /data-owner-offer-stuck-context/);
  assert.match(source, /Öppnad för/);
  assert.match(source, /Skickad för/);
});
