#!/usr/bin/env node
'use strict';

/**
 * Sätt ARCANA_PUBLIC_WEB_BOOKING_ENABLED på Render prod (default: false).
 * Se .cursor/rules/website-booking-policy.mdc
 */
require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');

const serviceId = process.env.RENDER_SERVICE_ID || 'srv-d6b11o0boq4c73chm7f0';
const enabled = String(process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED || 'false').trim();

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

const cliPath = path.join(process.env.HOME, '.render/cli.yaml');
if (!fs.existsSync(cliPath)) fail('Saknar ~/.render/cli.yaml — logga in med render CLI');
const apiKey = (fs.readFileSync(cliPath, 'utf8').match(/key: (rnd_\S+)/) || [])[1];
if (!apiKey) fail('Saknar Render API key i ~/.render/cli.yaml');

async function main() {
  const existingRes = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars?limit=100`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!existingRes.ok) fail(`Render GET env failed: ${existingRes.status}`);
  const existing = await existingRes.json();
  const map = new Map(
    existing.map((row) => {
      const ev = row.envVar || row;
      return [ev.key, ev.value ?? ''];
    })
  );

  map.set('ARCANA_PUBLIC_WEB_BOOKING_ENABLED', enabled);
  map.set('ARCANA_CLIENTO_INTEGRATION_ENABLED', 'false');

  const payload = JSON.stringify([...map.entries()].map(([key, value]) => ({ key, value })));
  const putRes = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: payload,
  });
  if (!putRes.ok) {
    const text = await putRes.text();
    fail(`Render env PUT failed: ${putRes.status} ${text.slice(0, 200)}`);
  }

  console.log(`✅ Render env: ARCANA_PUBLIC_WEB_BOOKING_ENABLED=${enabled}`);

  const deployRes = await fetch(`https://api.render.com/v1/services/${serviceId}/deploys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  if (!deployRes.ok && deployRes.status !== 202) {
    const text = await deployRes.text();
    fail(`Render deploy failed: ${deployRes.status} ${text.slice(0, 200)}`);
  }
  console.log('✅ Deploy startad — väntar på readyz…');

  const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(/\/+$/, '');
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const readyRes = await fetch(`${base}/readyz`).catch(() => null);
    if (readyRes?.ok) {
      const catalogRes = await fetch(
        `${base}/api/public/booking-engine/catalog?host=hairtpclinic.com`
      ).catch(() => null);
      const catalog = catalogRes ? await catalogRes.json().catch(() => ({})) : {};
      if (catalogRes?.status === 503 && catalog?.error === 'public_web_booking_disabled') {
        console.log('✅ Publik webbbokning av — public_web_booking_disabled (förväntat)');
        return;
      }
      if (catalogRes?.status === 200 && Array.isArray(catalog.services)) {
        console.log(`✅ Publik catalog live — ${catalog.services.length} tjänster`);
        return;
      }
      if (catalog?.error === 'public_web_booking_disabled') {
        console.log(`… försök ${attempt}/30 — väntar deploy`);
      } else if (catalogRes?.status === 200) {
        console.log(`… försök ${attempt}/30 — catalog svarade 200`);
      }
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
  fail('Timeout — catalog svarade inte 200 efter deploy');
}

main().catch((err) => fail(err.message || String(err)));
