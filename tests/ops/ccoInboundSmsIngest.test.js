'use strict';

/* Inbound-SMS-ingest (tvåvägs-SMS, följdsteg). Ett inkommande SMS läggs i kundens
 * tråd som inbound med channel:'sms' → samma feed/Svarstudio som portal. Matchar
 * avsändaren mot kund; okänt nummer tappas aldrig (telefon-nyckel). */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { ingestInboundSms, normalizePhone } = require('../../src/ops/ccoInboundSmsIngest');
const { createCcoPortalMessageStore } = require('../../src/ops/ccoPortalMessageStore');

function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-in-'));
  return path.join(dir, 'm.json');
}

test('matchat nummer → inbound i kundens tråd med channel:sms', async () => {
  const messageStore = await createCcoPortalMessageStore({ filePath: tmp() });
  const patientMasterStore = {
    findPatientByPhone: async ({ phone }) => (phone === '+46701234567' ? { id: 'PAT-9' } : null),
  };
  const res = await ingestInboundSms(
    { from: '+46701234567', message: 'Hej, kan jag flytta min tid?', providerId: 'sms1' },
    { messageStore, patientMasterStore }
  );
  assert.equal(res.status, 'stored');
  assert.equal(res.matched, true);
  assert.equal(res.customerId, 'PAT-9');
  const list = messageStore.listMessagesForCustomer({
    tenantId: 'hairtpclinic',
    customerId: 'PAT-9',
  });
  assert.equal(list.length, 1);
  assert.equal(list[0].direction, 'inbound');
  assert.equal(list[0].channel, 'sms');
  assert.equal(list[0].body, 'Hej, kan jag flytta min tid?');
});

test('okänt nummer tappas aldrig → lagras under telefon-nyckel', async () => {
  const messageStore = await createCcoPortalMessageStore({ filePath: tmp() });
  const res = await ingestInboundSms(
    { from: '+46709999999', message: 'Hallå?' },
    { messageStore, patientMasterStore: { findPatientByPhone: async () => null } }
  );
  assert.equal(res.status, 'stored');
  assert.equal(res.matched, false);
  assert.equal(res.customerId, 'sms:+46709999999');
  // Dyker upp som oläst inbound → notis-feeden ser det.
  const summaries = messageStore.listUnreadInboundSummaries();
  assert.equal(
    summaries.some((s) => s.customerId === 'sms:+46709999999'),
    true
  );
});

test('tomt meddelande / saknad avsändare → skipped, inget lagras', async () => {
  const messageStore = await createCcoPortalMessageStore({ filePath: tmp() });
  assert.equal(
    (await ingestInboundSms({ from: '+4670', message: '  ' }, { messageStore })).reason,
    'empty_message'
  );
  assert.equal(
    (await ingestInboundSms({ message: 'hej' }, { messageStore })).reason,
    'missing_sender'
  );
});

test('normalizePhone behåller + och siffror', () => {
  assert.equal(normalizePhone('070-123 45 67'), '0701234567');
  assert.equal(normalizePhone('+46 70 123 45 67'), '+46701234567');
  assert.equal(normalizePhone(''), '');
});
