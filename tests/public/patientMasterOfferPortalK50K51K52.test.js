const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const sourcePath = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'app',
  'patient-master-ui.js'
);
const routePath = path.join(__dirname, '..', '..', 'src', 'routes', 'ccoCommercial.js');
const storePath = path.join(__dirname, '..', '..', 'src', 'ops', 'ccoCommercialStore.js');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('K50 shows opened-but-unsigned signal for staff/conversations follow-up', () => {
  const source = read(sourcePath);

  assert.match(source, /data-customer-portal-opened-unsigned-signal/);
  assert.match(source, /data-customer-portal-action-state/);
  assert.match(source, /opened_unsigned/);
  assert.match(source, /Kunden har öppnat portalen men inte signerat/);
  assert.match(source, /Följ upp via konversation eller staff-vy/);
});

test('K51 records portal share audit with checklist snapshot', () => {
  const source = read(sourcePath);
  const route = read(routePath);
  const store = read(storePath);

  assert.match(source, /recordCustomerPortalShareEvent\(/);
  assert.match(source, /customer-portal\/share-event/);
  assert.match(source, /currentCustomerPortalShareChecklistValues/);
  assert.match(source, /data-customer-portal-share-audit/);
  assert.match(route, /customer-portal\/share-event/);
  assert.match(route, /cco\.commercial\.customer_portal_share_event/);
  assert.match(store, /recordPortalShareEvent/);
  assert.match(store, /lastPortalShareChecklist/);
});

test('K52 exposes owner offer overview buckets', () => {
  const route = read(routePath);
  const store = read(storePath);

  assert.match(route, /owner-offer-overview/);
  assert.match(route, /buildCommercialOwnerOfferOverview/);
  assert.match(store, /function buildCommercialOwnerOfferOverview/);
  assert.match(store, /waitingCustomer/);
  assert.match(store, /readyToSign/);
  assert.match(store, /signed/);
  assert.match(store, /stuck/);
});
