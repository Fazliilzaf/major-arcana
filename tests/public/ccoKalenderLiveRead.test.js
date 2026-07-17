'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'public/kalender.html'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'public/cco-kalender-shell.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'public/cco-kalender-bridge.js'), 'utf8');

test('canonical calendar activates the original V6 renderer in read-only mode', () => {
  const modeIndex = html.indexOf('window.CCO_CALENDAR_READ_ONLY = true');
  const originalIndex = html.indexOf('window.CCO_CALENDAR_ORIGINAL_V6 = true');
  const shellMatch = html.match(/\/cco-kalender-shell\.js\?v=[^"']+/);
  const shellIndex = shellMatch ? shellMatch.index : -1;
  assert.ok(modeIndex >= 0);
  assert.ok(originalIndex > modeIndex);
  assert.ok(shellIndex > modeIndex);
  assert.doesNotMatch(html, /cco-kalender-shell\.css\?v=[^"']+/);
  assert.match(html, /class="calendar-week" id="calWeek"/);
  assert.match(html, /src="\/cco-kalender-bridge\.js\?v=/);
});

test('live renderer uses the admin bearer token and recognizes /kalender.html', () => {
  assert.match(shell, /ARCANA_ADMIN_TOKEN/);
  assert.match(shell, /headers\.Authorization = 'Bearer ' \+ token/);
  assert.match(shell, /\/\\\/kalender\\\.html\$\/i\.test\(window\.location\.pathname\)/);
  assert.match(shell, /calendar\/day\?' \+ query\.toString\(\)/);
  assert.match(shell, /calendar\/week\?' \+ query\.toString\(\)/);
});

test('read-only V6 mode disables writes and replaces fixture surfaces with canonical data', () => {
  assert.match(bridge, /CCO_CALENDAR_READ_ONLY === true/);
  assert.match(bridge, /write bridge disabled/);
  assert.match(shell, /function initOriginalV6Calendar\(\)/);
  assert.match(shell, /loadCanonicalVisits\(v6State\.weekStart, end/);
  assert.match(shell, /slots\.innerHTML = ''/);
  assert.match(shell, /v6RenderIntel\(slot\)/);
  assert.match(shell, /READ-ONLY · 0 WRITES/);
  assert.match(shell, /openCanonicalPatient\(slot\.patientId\)/);
  assert.match(html, /data-cco-calendar-source='canonical-v6'/);
  assert.doesNotMatch(
    shell.slice(shell.indexOf('// ─── Original V6'), shell.indexOf('// ─── Init: kollar URL-view')),
    /method\s*:\s*['"]POST|\/cco-booking-engine\/(confirm|cancel|rebook)/
  );
});

test('canonical V6 cards keep notes accessible without rendering the yellow note badge', () => {
  const cardBlock = shell.slice(
    shell.indexOf('function v6BookingCard'),
    shell.indexOf('function v6UpdateSidebars')
  );
  assert.match(cardBlock, /const noteCount = bookingNoteCount\(slot\)/);
  assert.match(cardBlock, /noteCount \? noteCount \+ ' anteckning\(ar\)' : null/);
  assert.doesNotMatch(cardBlock, /booking-ai-badge/);
  assert.match(cardBlock, /--rail-color:/);
});

test('original V6 home surfaces stay present and are canonical or honestly read-only', () => {
  assert.match(html, /class="mini-inbox" id="miniInbox"/);
  assert.match(html, /class="calendar-busy"/);
  assert.match(html, /class="vibe-strip" id="vibeStrip"/);
  assert.match(html, /class="watch-widget" id="watchWidget"/);
  assert.match(html, /class="mic-btn"/);
  assert.match(html, /class="timemachine"/);
  assert.match(
    html,
    /const CUSTOMERS = window\.CCO_CALENDAR_READ_ONLY \? \[\] : LEGACY_PREVIEW_CUSTOMERS/
  );
  assert.match(shell, /function v6RenderMiniInboxState\(\)/);
  assert.match(shell, /function v6UpdateBusy\(visits\)/);
  assert.match(shell, /function v6UpdateVibe\(visits\)/);
  assert.match(shell, /function v6UpdateWatch\(visits\)/);
  assert.match(shell, /v6State\.mode = 'morgon'/);
  assert.match(shell, /mic\.disabled = true/);
  assert.match(shell, /slider\.disabled = true/);
  assert.match(shell, /resourceTab\.disabled = true/);
  assert.match(shell, /Ankomstskrivning avstängd/);
  assert.doesNotMatch(shell, /querySelectorAll\('\.mini-inbox,[^\n]+\.story-cta-row'\)/);
});
