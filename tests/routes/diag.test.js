const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createDiagRouter } = require('../../src/routes/diag');

async function withServer({ config, runtimeState }, run) {
  const app = express();
  app.use('/api/v1', createDiagRouter({ config, runtimeState }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET /_diag/env returnerar ok + env + resolved från config', async () => {
  const config = { stateRoot: '/tmp/state', aiProvider: 'fallback', staffJournalOpenAccess: false };
  await withServer({ config, runtimeState: {} }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/_diag/env`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.resolved.stateRoot, '/tmp/state');
    assert.equal(body.resolved.aiProvider, 'fallback');
    assert.ok('ARCANA_DEFAULT_TENANT' in body.env);
    assert.equal(body.nodeVersion, process.version);
  });
});

test('GET /_diag/version speglar runtimeState.startedAt', async () => {
  const runtimeState = { startedAt: '2026-06-24T00:00:00Z' };
  await withServer({ config: {}, runtimeState }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/_diag/version`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.serverStartedAt, '2026-06-24T00:00:00Z');
    assert.ok(Array.isArray(body.fixes));
  });
});

// ORD-86: bada bas-URL-namnen ska synas, och det effektiva vardet ska rapporteras.
// Utan detta gar det inte att se utifran att PUBLIC_BASE_URL och
// ARCANA_PUBLIC_BASE_URL pekar olika — vilket de gjorde tills 2026-08-06.
test('GET /_diag/env exponerar bada bas-URL-namnen och det effektiva vardet', async () => {
  const config = {
    stateRoot: '/tmp/state',
    aiProvider: 'fallback',
    publicBaseUrl: 'https://arcana.hairtpclinic.com',
  };
  const previous = {
    plain: process.env.PUBLIC_BASE_URL,
    prefixed: process.env.ARCANA_PUBLIC_BASE_URL,
  };
  process.env.PUBLIC_BASE_URL = 'https://arcana.hairtpclinic.com';
  process.env.ARCANA_PUBLIC_BASE_URL = 'https://arcana.hairtpclinic.se';
  try {
    await withServer({ config, runtimeState: {} }, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/_diag/env`);
      const body = await res.json();
      assert.equal(body.env.PUBLIC_BASE_URL, 'https://arcana.hairtpclinic.com');
      assert.equal(body.env.ARCANA_PUBLIC_BASE_URL, 'https://arcana.hairtpclinic.se');
      assert.equal(body.resolved.publicBaseUrl, 'https://arcana.hairtpclinic.com');
    });
  } finally {
    if (previous.plain === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = previous.plain;
    if (previous.prefixed === undefined) delete process.env.ARCANA_PUBLIC_BASE_URL;
    else process.env.ARCANA_PUBLIC_BASE_URL = previous.prefixed;
  }
});

// .cursor/rules/website-booking-policy.mdc kräver ARCANA_PUBLIC_WEB_BOOKING_ENABLED=false
// på prod tills CCO-bokning är godkänd, men src/config.js defaultar till true —
// en motsägelse som inte gick att se utifrån. Exponera både den satta env-strängen
// och det effektiva booleska värdet så avvikelsen syns utan SSH.
test('GET /_diag/env exponerar ARCANA_PUBLIC_WEB_BOOKING_ENABLED och dess effektiva varde', async () => {
  const config = {
    stateRoot: '/tmp/state',
    aiProvider: 'fallback',
    publicWebBookingEnabled: true,
  };
  const previous = process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED;
  delete process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED;
  try {
    await withServer({ config, runtimeState: {} }, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/_diag/env`);
      const body = await res.json();
      assert.equal(body.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED, null);
      assert.equal(body.resolved.publicWebBookingEnabled, true);
    });
  } finally {
    if (previous === undefined) delete process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED;
    else process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED = previous;
  }
});

// ORD-153 §6: grindens lage gick inte att lasa utifran, sa verify-scriptet
// kunde bara WARN:a om att nagon borde kolla i Render. Ett gront resultat mot
// en oppen grind bevisar ingenting — darfor maste det EFFEKTIVA vardet ut.
// Ravardet racker inte: ccoSendLiveGate rankar bara 1/true/yes som live.
test('GET /_diag/env exponerar CCO_SEND_LIVE och det effektiva grindlaget', async () => {
  const config = { stateRoot: '/tmp/state', aiProvider: 'fallback' };
  const previous = process.env.CCO_SEND_LIVE;
  try {
    // "off" ar sant for ett manskligt oga men INTE live for gaten.
    process.env.CCO_SEND_LIVE = 'off';
    await withServer({ config, runtimeState: {} }, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/_diag/env`);
      const body = await res.json();
      assert.equal(body.env.CCO_SEND_LIVE, 'off');
      assert.equal(body.resolved.ccoSendLive, false);
    });

    process.env.CCO_SEND_LIVE = 'true';
    await withServer({ config, runtimeState: {} }, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/_diag/env`);
      const body = await res.json();
      assert.equal(body.resolved.ccoSendLive, true);
    });

    delete process.env.CCO_SEND_LIVE;
    await withServer({ config, runtimeState: {} }, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/_diag/env`);
      const body = await res.json();
      assert.equal(body.env.CCO_SEND_LIVE, null);
      assert.equal(body.resolved.ccoSendLive, false);
    });
  } finally {
    if (previous === undefined) delete process.env.CCO_SEND_LIVE;
    else process.env.CCO_SEND_LIVE = previous;
  }
});

// ORD-155 §4: renderDefaultsApplied har alltid funnits, men som en lista man
// maste veta att man ska korslasa mot env. Den kopplingen fick goras for hand
// 2026-08-31 for att forsta varfor webbokningen stod oppen — kallan star nu
// bredvid varje flagga i stallet.
test('GET /_diag/env anger kallan per flagga (render / code-default / unset)', async () => {
  const config = {
    stateRoot: '/tmp/state',
    aiProvider: 'fallback',
    // Sa ser det ut nar appen skrivit in sitt eget varde vid uppstart.
    renderRuntimeDefaults: { applied: ['ARCANA_PUBLIC_WEB_BOOKING_ENABLED'] },
  };
  const previous = {
    booking: process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED,
    tenant: process.env.ARCANA_DEFAULT_TENANT,
    send: process.env.CCO_SEND_LIVE,
  };
  try {
    // Defaultad av appen (staende i applied-listan) → code-default.
    process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED = 'false';
    // Satt i dashboarden, inte defaultad → render.
    process.env.ARCANA_DEFAULT_TENANT = 'hair-tp-clinic';
    // Varken satt eller defaultad → unset.
    delete process.env.CCO_SEND_LIVE;

    await withServer({ config, runtimeState: {} }, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/_diag/env`);
      const body = await res.json();
      assert.equal(body.envSource.ARCANA_PUBLIC_WEB_BOOKING_ENABLED, 'code-default');
      assert.equal(body.envSource.ARCANA_DEFAULT_TENANT, 'render');
      assert.equal(body.envSource.CCO_SEND_LIVE, 'unset');
    });
  } finally {
    for (const [key, value] of [
      ['ARCANA_PUBLIC_WEB_BOOKING_ENABLED', previous.booking],
      ['ARCANA_DEFAULT_TENANT', previous.tenant],
      ['CCO_SEND_LIVE', previous.send],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

/**
 * ORD-221 — grinden som skyddar patienterna gick inte att se utifrån.
 *
 * Ägaren 2026-09-03: "det får inte skickas någon info till någon kund."
 * ARCANA_KUNDUTSKICK_ENABLED är grinden som håller det löftet, och den saknades
 * i /_diag/env sedan den byggdes i ORD-184. Att svara på "är det avstängt?"
 * krävde alltså Render-dashboarden — samma blindhet som CCO_SEND_LIVE hade före
 * ORD-153 §6, fast på den enda grind som skyddar patienterna.
 */
test('ORD-221: kundutskicksgrindens EFFEKTIVA läge syns i /_diag/env', async () => {
  const original = {
    ARCANA_KUNDUTSKICK_ENABLED: process.env.ARCANA_KUNDUTSKICK_ENABLED,
    ARCANA_MAIL_SHADOW_SEND: process.env.ARCANA_MAIL_SHADOW_SEND,
    ARCANA_MAIL_SEND_TEST_RECIPIENT: process.env.ARCANA_MAIL_SEND_TEST_RECIPIENT,
  };
  try {
    delete process.env.ARCANA_KUNDUTSKICK_ENABLED;
    delete process.env.ARCANA_MAIL_SHADOW_SEND;
    delete process.env.ARCANA_MAIL_SEND_TEST_RECIPIENT;

    await withServer({ config: {}, runtimeState: {} }, async (baseUrl) => {
      const body = await (await fetch(`${baseUrl}/_diag/env`)).json();
      assert.ok('ARCANA_KUNDUTSKICK_ENABLED' in body.env, 'grinden syns inte bland flaggorna');
      assert.equal(body.resolved.kundutskickPa, false, 'osatt grind ska läsas som AV');
      // Skarpt läge mot kund är utgångsläget för konversationssvar: shadow
      // defaultar till false och testmottagare är inte satt. Att det syns är
      // hela poängen — det gick inte att läsa utifrån innan.
      assert.equal(body.resolved.mailSvar.skarptTillKund, true);
      assert.equal(body.resolved.mailSvar.shadow, false);
      assert.equal(body.resolved.mailSvar.testmottagareSatt, false);
    });

    // RÅVÄRDET RÄCKER INTE. `arKundutskickPa` godtar bara 1/true/yes, så "on"
    // är en AVSTÄNGD grind som ser påslagen ut för den som bara läser env.
    process.env.ARCANA_KUNDUTSKICK_ENABLED = 'on';
    await withServer({ config: {}, runtimeState: {} }, async (baseUrl) => {
      const body = await (await fetch(`${baseUrl}/_diag/env`)).json();
      assert.equal(body.env.ARCANA_KUNDUTSKICK_ENABLED, 'on');
      assert.equal(body.resolved.kundutskickPa, false, '"on" tolkades som påslagen grind');
    });

    process.env.ARCANA_KUNDUTSKICK_ENABLED = 'true';
    await withServer({ config: {}, runtimeState: {} }, async (baseUrl) => {
      const body = await (await fetch(`${baseUrl}/_diag/env`)).json();
      assert.equal(body.resolved.kundutskickPa, true);
    });
  } finally {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('ORD-221: testmottagarens ADRESS läcker inte ut i den publika diagen', async () => {
  // /_diag/env är öppen. Att skriva ut en mailadress där är en läcka som inte
  // har med grindens läge att göra — frågan diag ska svara på är "styrs svaren
  // om?", inte "vart?".
  const original = process.env.ARCANA_MAIL_SEND_TEST_RECIPIENT;
  try {
    process.env.ARCANA_MAIL_SEND_TEST_RECIPIENT = 'fazli@hairtpclinic.com';
    await withServer({ config: {}, runtimeState: {} }, async (baseUrl) => {
      const rasvar = await (await fetch(`${baseUrl}/_diag/env`)).text();
      assert.ok(
        !rasvar.includes('fazli@hairtpclinic.com'),
        'testmottagarens adress skrivs ut i klartext'
      );
      const body = JSON.parse(rasvar);
      assert.equal(body.resolved.mailSvar.testmottagareSatt, true);
      assert.equal(body.resolved.mailSvar.skarptTillKund, false, 'omstyrning syns inte');
    });
  } finally {
    if (original === undefined) delete process.env.ARCANA_MAIL_SEND_TEST_RECIPIENT;
    else process.env.ARCANA_MAIL_SEND_TEST_RECIPIENT = original;
  }
});
