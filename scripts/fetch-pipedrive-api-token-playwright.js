#!/usr/bin/env node
'use strict';

/**
 * Hämtar Pipedrive personal API-token via inloggad Chrome-session (Playwright).
 * Skriver till .env om token hittas och valideras.
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');

const DOMAIN = process.env.PIPEDRIVE_COMPANY_DOMAIN || 'hairtpclinic2';
const ENV_PATH = path.join(process.cwd(), '.env');
const saveSecondary = process.argv.includes('--secondary');
const CHROME_PROFILE = path.join(os.homedir(), 'Library/Application Support/Google/Chrome/Default');

function upsertEnvLine(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) return content.replace(re, line);
  const trimmed = content.replace(/\s*$/, '');
  return `${trimmed}${trimmed.endsWith('\n') || !trimmed ? '' : '\n'}${line}\n`;
}

async function validateToken(token, domain) {
  const url = new URL(`https://${domain}.pipedrive.com/api/v1/users/me`);
  url.searchParams.set('api_token', token);
  const res = await fetch(url);
  const payload = await res.json().catch(() => ({}));
  return res.ok && payload.success !== false;
}

async function extractTokenFromPage(page) {
  const selectors = [
    'input[data-test="api-token"]',
    'input[name="api_token"]',
    'input[readonly][type="text"]',
    'input[readonly]',
    'code',
    'pre',
  ];
  for (const sel of selectors) {
    const loc = page.locator(sel);
    const count = await loc.count();
    for (let i = 0; i < Math.min(count, 5); i += 1) {
      const value = await loc
        .nth(i)
        .inputValue()
        .catch(() => '');
      const text =
        value ||
        (await loc
          .nth(i)
          .textContent()
          .catch(() => '')) ||
        '';
      const token = String(text).trim();
      if (token.length >= 32 && token.length <= 128 && /^[a-zA-Z0-9]+$/.test(token)) {
        return token;
      }
    }
  }
  const body = await page
    .locator('body')
    .innerText()
    .catch(() => '');
  const match = body.match(/\b([a-f0-9]{40,64})\b/i);
  return match ? match[1] : null;
}

async function tryGoogleSso(page) {
  const googleBtn = page
    .locator('a[href*="google"], button:has-text("Google"), [data-test*="google"]')
    .first();
  if (await googleBtn.count()) {
    console.log('Försöker Google SSO…');
    await googleBtn.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(4000);
  }
  const account = page.locator('[data-email], div[role="link"]').first();
  if (await account.count()) {
    await account.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(5000);
  }
}

async function main() {
  console.log(`Chrome-profil: ${CHROME_PROFILE}`);
  console.log(`Pipedrive: https://${DOMAIN}.pipedrive.com/settings/api`);

  const context = await chromium.launchPersistentContext(CHROME_PROFILE, {
    channel: 'chrome',
    headless: false,
    args: ['--profile-directory=Default'],
  });

  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(`https://${DOMAIN}.pipedrive.com/settings/api`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.waitForTimeout(3000);
    console.log('URL:', page.url());

    if (/login|auth|accounts\.google/i.test(page.url())) {
      await tryGoogleSso(page);
      await page.goto(`https://${DOMAIN}.pipedrive.com/settings/api`, {
        waitUntil: 'domcontentloaded',
        timeout: 120000,
      });
      await page.waitForTimeout(3000);
      console.log('URL efter SSO:', page.url());
    }

    let token = await extractTokenFromPage(page);
    if (!token) {
      const reveal = page
        .locator('button:has-text("Show"), button:has-text("Visa"), [data-test*="show"]')
        .first();
      if (await reveal.count()) {
        await reveal.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1500);
        token = await extractTokenFromPage(page);
      }
    }

    if (!token) {
      throw new Error('Kunde inte hitta API-token på sidan. Är du inloggad på settings/api?');
    }

    const ok = await validateToken(token, DOMAIN);
    if (!ok) {
      throw new Error('Token hittades men validering mot /users/me misslyckades.');
    }

    const meRes = await fetch(
      `https://${DOMAIN}.pipedrive.com/api/v1/users/me?api_token=${encodeURIComponent(token)}`
    );
    const mePayload = await meRes.json().catch(() => ({}));
    const me = mePayload.data || {};

    const envRaw = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
    const key = saveSecondary ? 'PIPEDRIVE_API_TOKEN_SECONDARY' : 'PIPEDRIVE_API_TOKEN';
    let next = upsertEnvLine(envRaw, key, token);
    next = upsertEnvLine(next, 'PIPEDRIVE_COMPANY_DOMAIN', DOMAIN);
    fs.writeFileSync(ENV_PATH, next, 'utf8');
    console.log(`OK — ${key} validerad och sparad i .env`);
    console.log(`Domain: ${DOMAIN}`);
    console.log(`Token user: ${me.name || '?'} <${me.email || '?'}> (id=${me.id || '?'})`);
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
