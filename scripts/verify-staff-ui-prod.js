#!/usr/bin/env node
/**
 * STAFF UI verify prod: injicera token, öppna kund, leta efter journal/kamera-UI.
 * Ersätter inte riktig mobil enhetstest men fångar regressions i UI efter go-live.
 */
require('dotenv').config({ quiet: true });
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');
const path = require('node:path');

const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(/\/+$/, '');
const patientId = process.env.ARCANA_SMOKE_PATIENT_ID || '2e8d3535-cd89-418e-8b68-ca239f8836a4';
const root = path.join(__dirname, '..');

function getStaffToken() {
  return execSync(`node "${path.join(root, 'scripts/get-prod-auth-token.js')}"`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function main() {
  const token = getStaffToken();
  if (!token || token.length < 20) {
    throw new Error('Saknar STAFF-token');
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    locale: 'sv-SE',
  });
  const page = await context.newPage();

  await page.goto(`${base}/staff`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate((t) => {
    localStorage.setItem('ARCANA_ADMIN_TOKEN', t);
    sessionStorage.setItem('ARCANA_ADMIN_TOKEN', t);
  }, token);

  const url = `${base}/staff?view=customers&patientId=${encodeURIComponent(patientId)}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });

  const bodyText = await page.locator('body').innerText();
  const hasTaBild = /Ta bild/i.test(bodyText);
  const hasJournal = /Journal/i.test(bodyText);
  const loginLocked = /Inloggningslåst|Logga in/i.test(bodyText) && !hasJournal;

  console.log(`URL: ${page.url()}`);
  console.log(`Journal UI: ${hasJournal ? 'PASS' : 'FAIL'}`);
  console.log(`Ta bild: ${hasTaBild ? 'PASS' : 'FAIL'}`);
  console.log(`Login locked: ${loginLocked ? 'FAIL' : 'PASS'}`);

  if (!hasJournal || loginLocked) {
    await browser.close();
    process.exit(1);
  }

  if (!hasTaBild) {
    console.log('WARN: Journal synlig men "Ta bild" hittades inte — öppna journal-tab manuellt på enhet');
  }

  await browser.close();
  console.log('✅ STAFF UI verify (iPhone 13 viewport) klar');
}

main().catch((err) => {
  console.error('❌ STAFF UI verify:', err.message || err);
  process.exit(1);
});
