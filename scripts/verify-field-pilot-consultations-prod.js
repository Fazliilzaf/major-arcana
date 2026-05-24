#!/usr/bin/env node
/**
 * Simulerar field pilot Fas 5.6: mobil UI + foto-upload för alla 5 pilotkunder.
 * Ersätter inte riktiga konsultationer på fysisk enhet — validerar att flödet fungerar.
 */
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { chromium, devices } = require('playwright');
const { execSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const pilot = require(path.join(root, 'data/pilot-patients.json'));
const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(/\/+$/, '');

let hardFail = false;
const rows = [];

function record(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) hardFail = true;
}

function getStaffToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  for (let i = 0; i < 8; i += 1) {
    try {
      return execSync(`node "${path.join(root, 'scripts/get-prod-auth-token.js')}"`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    } catch {
      if (i < 7) {
        execSync('sleep 4');
      }
    }
  }
  throw new Error('Kunde inte hämta STAFF-token');
}

function makeTinyPng() {
  const file = path.join(os.tmpdir(), `field-pilot-${Date.now()}.png`);
  const width = 8;
  const height = 8;
  const raw = Buffer.concat(
    Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0)]))
  );
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) {
      c ^= buf[i];
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', Buffer.from([0, 0, 0, 8, 0, 0, 0, 8, 8, 2, 0, 0, 0])),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
  return file;
}

async function uploadPhoto(token, patientId, label) {
  const pngPath = makeTinyPng();
  try {
    const form = new FormData();
    form.append('patientId', patientId);
    form.append('label', label);
    form.append('photo', new Blob([fs.readFileSync(pngPath)], { type: 'image/png' }), 'field-pilot.png');
    const started = Date.now();
    const res = await fetch(`${base}/api/v1/cco-journal/photo`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-arcana-client': 'major_arcana_admin',
      },
      body: form,
    });
    const ms = Date.now() - started;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`${res.status} ${body.error || JSON.stringify(body).slice(0, 120)}`);
    }
    return ms;
  } finally {
    fs.unlinkSync(pngPath);
  }
}

async function injectToken(page, token) {
  await page.evaluate((t) => {
    localStorage.setItem('ARCANA_ADMIN_TOKEN', t);
    sessionStorage.setItem('ARCANA_ADMIN_TOKEN', t);
  }, token);
}

async function waitForMobileShell(page) {
  await page.waitForFunction(
    () => document.documentElement.getAttribute('data-cco-mobile-shell') === 'on',
    undefined,
    { timeout: 30000 }
  );
}

async function verifyPatientUi(page, token, patient) {
  const started = Date.now();
  await page.goto(`${base}/major-arcana-preview/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await injectToken(page, token);
  const url = `${base}/staff?view=customers&patientId=${encodeURIComponent(patient.patientId)}`;
  await page.goto(url, { waitUntil: 'commit', timeout: 90000 });
  await waitForMobileShell(page);

  await page.waitForFunction(
    () => {
      const rt = window.ArcanaPatientMasterUi?.getRuntime?.();
      const camera = document.querySelector(
        '.patient-master-camera-button, [data-patient-photo-camera]'
      );
      return Boolean(rt?.detail?.card) && !rt?.detailLoading && Boolean(camera);
    },
    undefined,
    { timeout: 45000, polling: 16 }
  );
  await page.evaluate(() => {
    window.ArcanaPatientMasterUi?.setPatientTab?.('journal');
  });
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('.patient-master-camera-button, [data-patient-photo-camera]');
      if (!btn) return false;
      const rect = btn.getBoundingClientRect();
      return rect.width >= 40 && rect.height >= 40;
    },
    undefined,
    { timeout: 15000, polling: 16 }
  );
  const uiMs = Date.now() - started;

  const taBild = await page.evaluate(() => {
    const btn = document.querySelector('.patient-master-camera-button, [data-patient-photo-camera]');
    if (!btn) return false;
    const rect = btn.getBoundingClientRect();
    return rect.width >= 40 && rect.height >= 40;
  });
  const journalTab = await page.evaluate(() => {
    const tab = document.querySelector('.patient-master-tab[data-patient-tab="journal"]');
    if (!tab) return false;
    return window.getComputedStyle(tab).display !== 'none';
  });
  const backVisible = await page.evaluate(() => {
    const back = document.querySelector('.cco-mobile-back-button');
    return back ? !back.hidden && window.getComputedStyle(back).display !== 'none' : false;
  });

  return { uiMs, taBild, journalTab, backVisible };
}

async function main() {
  execSync(`node "${path.join(root, 'scripts/lib/wait-for-prod-ready.js')}"`, { stdio: 'inherit' });
  const token = getStaffToken();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'sv-SE' });
  const page = await context.newPage();

  console.log(`Field pilot simulation — ${pilot.patients.length} kunder @ ${base}\n`);

  try {
    for (const patient of pilot.patients) {
      let uiMs = 0;
      let taBild = false;
      let journalTab = false;
      let backVisible = false;
      let uploadMs = 0;
      let uploadOk = false;
      let err = '';

      try {
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            ({ uiMs, taBild, journalTab, backVisible } = await verifyPatientUi(page, token, patient));
            uploadMs = await uploadPhoto(token, patient.patientId, 'Field pilot Front');
            uploadOk = true;
            err = '';
            break;
          } catch (e) {
            err = e.message || String(e);
            if (attempt < 2 && /502|503|504|Timeout|AbortError/i.test(err)) {
              execSync(`node "${path.join(root, 'scripts/lib/wait-for-prod-ready.js')}"`, { stdio: 'inherit' });
              continue;
            }
            throw e;
          }
        }
      } catch (e) {
        err = e.message || String(e);
      }

      const ok = taBild && journalTab && uploadOk;
      record(
        `${patient.displayName}`,
        ok,
        ok ? `UI ${uiMs}ms · upload ${uploadMs}ms` : err || `UI taBild=${taBild} journal=${journalTab}`
      );
      rows.push({
        name: patient.displayName,
        patientId: patient.patientId,
        uiMs,
        uploadMs,
        taBild,
        journalTab,
        backVisible,
        ok,
      });
    }
  } finally {
    await browser.close();
  }

  console.log('\n=== Simulerad konsultations-tabell (automation) ===');
  console.log('| # | Kund | UI (ms) | Upload (ms) | OK? |');
  console.log('|---|------|---------|-------------|-----|');
  rows.forEach((r, i) => {
    console.log(`| ${i + 1} | ${r.name} | ${r.uiMs} | ${r.ok ? r.uploadMs : '—'} | ${r.ok ? '✓' : '✗'} |`);
  });

  if (hardFail) process.exit(1);
  console.log('\n✅ Field pilot simulation klar (5/5)');
  console.log('Manuellt kvar: samma flöde på fysisk iPhone/Android + feedback i checklistan.');
}

main().catch((err) => {
  console.error('❌ Field pilot simulation:', err.message || err);
  process.exit(1);
});
