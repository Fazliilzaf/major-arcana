'use strict';

/* Portal-loopens självtest (mint → notis → domänkoll). Dry-run som default
 * (inget mejl). Skarpt bara när live=true + adress. Återanvänder samma op:ar/
 * stores som den riktiga loopen. Ren funktion, inget nätverk. */

const test = require('node:test');
const assert = require('node:assert/strict');
const { runPortalLoopSelfTest, maskUrl } = require('../../src/ops/ccoPortalSelfTest');

const LIVE_ENV = {
  CCO_PORTAL_NOTIFY_LIVE: '1',
  RESEND_API_KEY: 're_x',
  RESEND_DOMAIN: 'hairtpclinic.com',
  PUBLIC_BASE_URL: 'https://arcana.hairtpclinic.com',
};

function fakeAccessStore(tokens = []) {
  return {
    issueToken: async ({ customerId }) => {
      tokens.push(customerId);
      return { token: 'tok-' + tokens.length };
    },
  };
}

function fakeSendStore(sends = []) {
  return {
    performSend: async (input) => {
      sends.push(input);
      // Speglar dry-run/live utifrån dryRunOverride (som notis-op:en sätter).
      return { ok: true, mode: input.dryRunOverride === false ? 'live' : 'dry-run' };
    },
  };
}

function verifiedFetch() {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: [{ name: 'hairtpclinic.com', status: 'verified' }] }),
  });
}

test('dry-run som default: alla steg gröna, INGET mejl skickat', async () => {
  const sends = [];
  const res = await runPortalLoopSelfTest(
    { email: 'info@fazli.se' },
    {
      accessStore: fakeAccessStore(),
      sendStore: fakeSendStore(sends),
      env: LIVE_ENV,
      fetchImpl: verifiedFetch(),
    }
  );
  assert.equal(res.ok, true);
  assert.equal(res.live, false);
  const byKey = Object.fromEntries(res.steps.map((s) => [s.key, s]));
  assert.equal(byKey.config.ok, true);
  assert.equal(byKey.domain.ok, true);
  assert.equal(byKey.mint.ok, true);
  assert.equal(byKey.notify.ok, true);
  // Notis kördes som dry-run (dryRunOverride null → inte false).
  assert.equal(sends.length, 1);
  assert.notEqual(sends[0].dryRunOverride, false);
});

test('live=true + adress: skarpt utskick, notis-steget kräver riktig sändning', async () => {
  const sends = [];
  const res = await runPortalLoopSelfTest(
    { email: 'info@fazli.se', live: true },
    {
      accessStore: fakeAccessStore(),
      sendStore: fakeSendStore(sends),
      env: LIVE_ENV,
      fetchImpl: verifiedFetch(),
    }
  );
  assert.equal(res.live, true);
  assert.equal(res.ok, true);
  const notify = res.steps.find((s) => s.key === 'notify');
  assert.equal(notify.ok, true);
  assert.match(notify.label, /skarpt/i);
  // Skickades skarpt (dryRunOverride false).
  assert.equal(sends[0].dryRunOverride, false);
  assert.equal(sends[0].payload.to, 'info@fazli.se');
});

test('live utan adress → faller tillbaka på dry-run (inget skarpt utskick)', async () => {
  const sends = [];
  const res = await runPortalLoopSelfTest(
    { live: true }, // ingen email
    {
      accessStore: fakeAccessStore(),
      sendStore: fakeSendStore(sends),
      env: LIVE_ENV,
      fetchImpl: verifiedFetch(),
    }
  );
  assert.equal(res.live, false);
  assert.notEqual(sends[0].dryRunOverride, false);
});

test('overifierad domän → domän-steget rött', async () => {
  const pendingFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: [{ name: 'hairtpclinic.com', status: 'pending' }] }),
  });
  const res = await runPortalLoopSelfTest(
    { email: 'info@fazli.se' },
    {
      accessStore: fakeAccessStore(),
      sendStore: fakeSendStore(),
      env: LIVE_ENV,
      fetchImpl: pendingFetch,
    }
  );
  const domain = res.steps.find((s) => s.key === 'domain');
  assert.equal(domain.ok, false);
  assert.match(domain.detail, /INTE verifierad/);
  assert.equal(res.ok, false);
});

test('grind av (dry-run-config) → config-steget rött, men kraschar inte', async () => {
  const res = await runPortalLoopSelfTest(
    { email: 'info@fazli.se' },
    {
      accessStore: fakeAccessStore(),
      sendStore: fakeSendStore(),
      env: { RESEND_API_KEY: 're_x' }, // ingen notify-grind
      fetchImpl: verifiedFetch(),
    }
  );
  const config = res.steps.find((s) => s.key === 'config');
  assert.equal(config.ok, false);
  assert.match(config.detail, /grinden/i);
});

test('mint misslyckas → mint-steget rött och notis hoppas över', async () => {
  const brokenAccess = {
    issueToken: async () => {
      throw new Error('boom');
    },
  };
  const sends = [];
  const res = await runPortalLoopSelfTest(
    { email: 'info@fazli.se' },
    {
      accessStore: brokenAccess,
      sendStore: fakeSendStore(sends),
      env: LIVE_ENV,
      fetchImpl: verifiedFetch(),
    }
  );
  const mint = res.steps.find((s) => s.key === 'mint');
  const notify = res.steps.find((s) => s.key === 'notify');
  assert.equal(mint.ok, false);
  assert.equal(notify.ok, false);
  assert.equal(sends.length, 0); // ingen notis utan lyckad mint
});

test('maskUrl döljer token-svansen men behåller basen', () => {
  assert.equal(
    maskUrl('https://arcana.hairtpclinic.com/portal-chat/abcdef1234567890'),
    'https://arcana.hairtpclinic.com/portal-chat/abcdef…'
  );
});
