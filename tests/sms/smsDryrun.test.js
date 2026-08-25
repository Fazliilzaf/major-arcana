'use strict';

/**
 * Dryrun-flaggan måste nå 46elks som `dryrun=yes` — annars skickar dryrun:et
 * ett riktigt SMS och debiterar. Testet mockar fetch och låser att flaggan
 * finns i form-body när dryrun är på, och att den saknas när dryrun är av.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { sendSms } = require('../../src/sms/smsConnector');

process.env.SMS_PROVIDER = '46elks';
process.env.ELKS_API_USERNAME = 'dryrun-testuser';
process.env.ELKS_API_PASSWORD = 'dryrun-testpass';

async function withFetchMock(run) {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, opts) => {
    requests.push(opts);
    return { ok: true, json: async () => ({ id: 'dryrun-abc123' }) };
  };
  try {
    return await run(requests);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('dryrun=yes skickas till 46elks när dryrun är på', async () => {
  await withFetchMock(async (requests) => {
    const result = await sendSms({
      to: '+4631881146',
      from: 'HairTP',
      message: 'Dryrun-test (skickas inte).',
      dryrun: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.dryrun, true);
    assert.equal(requests.length, 1);
    assert.ok(
      requests[0].body.includes('dryrun=yes'),
      `dryrun-flaggan saknas i body: ${requests[0].body}`
    );
  });
});

test('dryrun=yes skickas INTE när dryrun är av', async () => {
  await withFetchMock(async (requests) => {
    const result = await sendSms({
      to: '+4631881146',
      from: 'HairTP',
      message: 'Riktigt utskick.',
    });
    assert.equal(result.ok, true);
    assert.equal(result.dryrun, false);
    assert.equal(requests.length, 1);
    assert.ok(
      !requests[0].body.includes('dryrun=yes'),
      `dryrun-flaggan får inte finnas i body vid riktigt utskick: ${requests[0].body}`
    );
  });
});
