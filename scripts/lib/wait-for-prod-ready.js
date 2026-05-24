#!/usr/bin/env node
/**
 * Vänta tills /readyz svarar ready:true (Render cold start / deploy).
 */
require('dotenv').config({ quiet: true });

const base = (process.env.ARCANA_PROD_URL || process.env.BASE_URL || 'https://arcana.hairtpclinic.se').replace(
  /\/+$/,
  ''
);
const maxAttempts = Number(process.env.ARCANA_PROD_READY_ATTEMPTS || 24);
const delayMs = Number(process.env.ARCANA_PROD_READY_DELAY_MS || 5000);

async function isReady() {
  try {
    const res = await fetch(`${base}/readyz`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return false;
    const body = await res.json().catch(() => ({}));
    return body.ready === true || body.ok === true;
  } catch {
    return false;
  }
}

async function main() {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (await isReady()) {
      console.log(`Prod ready @ ${base} (försök ${attempt}/${maxAttempts})`);
      return;
    }
    if (attempt === maxAttempts) break;
    console.log(`Väntar på prod ready… (${attempt}/${maxAttempts})`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  console.error(`Prod ej ready efter ${maxAttempts} försök @ ${base}`);
  process.exit(1);
}

main();
