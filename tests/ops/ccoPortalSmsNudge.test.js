'use strict';

/* SMS-nudge (sista utväg, följdsteg). Engångs-SMS med portal-djuplänk, hårt
 * grindat (CCO_SMS_LIVE) och idempotent. Dry-run som default: skickar inget och
 * markerar inte kunden (så det kan skickas skarpt senare). */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { sendPortalSmsNudge, isSmsLive } = require('../../src/ops/ccoPortalSmsNudge');
const { createCcoPortalAccessStore } = require('../../src/ops/ccoPortalAccessStore');
const { createCcoPortalNudgeStore } = require('../../src/ops/ccoPortalNudgeStore');

function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-nudge-'));
  return path.join(dir, 'x.json');
}

function fakeSms() {
  const sent = [];
  return {
    sent,
    async sendSms(input) {
      sent.push(input);
      return { ok: true, messageId: 'sms-1' };
    },
  };
}

async function build() {
  return {
    accessStore: await createCcoPortalAccessStore({ filePath: tmp() }),
    nudgeStore: await createCcoPortalNudgeStore({ filePath: tmp() }),
  };
}

test('grind AV (default) → dry-run: inget SMS, kunden ej markerad', async () => {
  const { accessStore, nudgeStore } = await build();
  const smsSender = fakeSms();
  const res = await sendPortalSmsNudge(
    { customerId: 'C1', phone: '+46700000000', baseUrl: 'https://p.ex' },
    { accessStore, smsSender, nudgeStore }
  );
  assert.equal(res.status, 'skipped');
  assert.equal(res.reason, 'sms_gate_off');
  assert.equal(res.dryRun, true);
  assert.equal(smsSender.sent.length, 0);
  assert.equal(nudgeStore.wasSmsNudged({ tenantId: 'hairtpclinic', customerId: 'C1' }), false); // kan skickas senare
});

test('forceLive → skickar SMS med djuplänk + markerar (idempotent)', async () => {
  const { accessStore, nudgeStore } = await build();
  const smsSender = fakeSms();
  const res = await sendPortalSmsNudge(
    { customerId: 'C1', phone: '+46700000000', baseUrl: 'https://p.ex', forceLive: true },
    { accessStore, smsSender, nudgeStore }
  );
  assert.equal(res.status, 'sent');
  assert.equal(smsSender.sent.length, 1);
  assert.match(smsSender.sent[0].message, /portal-chat\//);
  assert.equal(smsSender.sent[0].to, '+46700000000');
  assert.equal(nudgeStore.wasSmsNudged({ tenantId: 'hairtpclinic', customerId: 'C1' }), true);
  // Andra anropet → idempotent skip, inget nytt SMS.
  const again = await sendPortalSmsNudge(
    { customerId: 'C1', phone: '+46700000000', forceLive: true },
    { accessStore, smsSender, nudgeStore }
  );
  assert.equal(again.status, 'skipped');
  assert.equal(again.reason, 'already_sms_nudged');
  assert.equal(smsSender.sent.length, 1);
});

test('samtidiga forceLive-anrop skickar exakt ett SMS', async () => {
  const { accessStore, nudgeStore } = await build();
  const smsSender = {
    sent: [],
    async sendSms(input) {
      await new Promise((resolve) => setTimeout(resolve, 15));
      this.sent.push(input);
      return { ok: true, messageId: `sms-${this.sent.length}` };
    },
  };
  const ref = {
    customerId: 'C-RACE',
    phone: '+46700000000',
    baseUrl: 'https://p.ex',
    forceLive: true,
  };
  const results = await Promise.all([
    sendPortalSmsNudge(ref, { accessStore, smsSender, nudgeStore }),
    sendPortalSmsNudge(ref, { accessStore, smsSender, nudgeStore }),
  ]);
  assert.deepEqual(
    results.map((r) => r.status).sort(),
    ['sent', 'skipped']
  );
  assert.equal(results.find((r) => r.status === 'skipped')?.reason, 'already_sms_nudged');
  assert.equal(smsSender.sent.length, 1);
  assert.equal(
    nudgeStore.wasSmsNudged({ tenantId: 'hairtpclinic', customerId: 'C-RACE' }),
    true
  );
});

test('utan telefonnummer → skipped no_phone', async () => {
  const { accessStore, nudgeStore } = await build();
  const smsSender = fakeSms();
  const res = await sendPortalSmsNudge(
    { customerId: 'C2', forceLive: true },
    { accessStore, smsSender, nudgeStore }
  );
  assert.equal(res.status, 'skipped');
  assert.equal(res.reason, 'no_phone');
});

test('SMS-fel → failed, kunden markeras INTE (kan försökas igen)', async () => {
  const { accessStore, nudgeStore } = await build();
  const smsSender = {
    async sendSms() {
      return { ok: false, error: 'elks_api_error' };
    },
  };
  const res = await sendPortalSmsNudge(
    { customerId: 'C3', phone: '+46700000000', forceLive: true },
    { accessStore, smsSender, nudgeStore }
  );
  assert.equal(res.status, 'failed');
  assert.equal(nudgeStore.wasSmsNudged({ tenantId: 'hairtpclinic', customerId: 'C3' }), false);
});

test('isSmsLive tolkar env-flaggan', () => {
  const prev = process.env.CCO_SMS_LIVE;
  try {
    process.env.CCO_SMS_LIVE = '1';
    assert.equal(isSmsLive(), true);
    process.env.CCO_SMS_LIVE = '0';
    assert.equal(isSmsLive(), false);
    delete process.env.CCO_SMS_LIVE;
    assert.equal(isSmsLive(), false);
  } finally {
    if (prev === undefined) delete process.env.CCO_SMS_LIVE;
    else process.env.CCO_SMS_LIVE = prev;
  }
});
