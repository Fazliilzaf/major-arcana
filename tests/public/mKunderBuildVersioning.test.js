'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(repoRoot, 'public', 'm-kunder.html'), 'utf8');
const server = fs.readFileSync(path.join(repoRoot, 'server.js'), 'utf8');

test('mobile customer page versions every communication dependency with the deploy build', () => {
  for (const asset of [
    'cco-journal-feed.css',
    'cco-komm-panel.css',
    'cco-kunder-staff-owner.js',
    'cco-kunder-actions.js',
    'cco-kunder-smart-next-step.js',
    'cco-journal-feed.js',
    'cco-komm-panel.js',
    'cco-kunder-mobil-real.js',
  ]) {
    assert.match(html, new RegExp(`/${asset.replace('.', '\\.')}` + '\\?v=__ARCANA_UI_BUILD__'));
  }
});

test('mobile customer page is rendered with the current build id instead of static delivery', () => {
  assert.match(server, /function sendMobileCustomersHtml\(res\)/);
  assert.match(server, /rawMobileCustomersHtmlTemplate\.replace\(\/__ARCANA_UI_BUILD__\/g, uiBuildId\)/);
  assert.match(server, /app\.get\('\/m-kunder\.html', \(_req, res\) => sendMobileCustomersHtml\(res\)\)/);
});
