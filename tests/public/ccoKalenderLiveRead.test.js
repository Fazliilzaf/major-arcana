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

test('V6 calendar boot wires the quality panel before the original V6 renderer', () => {
  const initBlock = shell.slice(
    shell.indexOf('function init()'),
    shell.indexOf('global.CcoKalenderShell')
  );
  const bindQualityIndex = initBlock.indexOf('bindQualityPanel();');
  const originalV6Index = initBlock.indexOf('initOriginalV6Calendar();');
  assert.ok(bindQualityIndex >= 0, 'init ska anropa bindQualityPanel');
  assert.ok(
    originalV6Index < 0 || bindQualityIndex < originalV6Index,
    'bindQualityPanel ska köras före V6-rendering när båda finns'
  );
});

test('canonical hydration preserves the original rich morning component hierarchy', () => {
  const storyBlock = shell.slice(
    shell.indexOf('function v6UpdateStory'),
    shell.indexOf('function v6RenderMiniInboxState')
  );
  assert.match(storyBlock, /story-card\[data-kind="idag"\]/);
  assert.match(storyBlock, /story-card\[data-kind="risker"\]/);
  assert.match(storyBlock, /story-card\[data-kind="mojligheter"\]/);
  assert.match(storyBlock, /story-card\[data-kind="klart"\]/);
  assert.match(storyBlock, /\.day-spark-bar/);
  assert.match(storyBlock, /\.story-list/);
  assert.match(storyBlock, /\.ready-meter-fill/);
  assert.match(storyBlock, /God morgon, /);
  assert.doesNotMatch(storyBlock, /\.story-list, \.day-spark, \.ready-meter/);
  assert.doesNotMatch(storyBlock, /Dagens canonical bokningar/);
});

test('facit toolbar geometry and rich read-only rails are not replaced by a reduced shell', () => {
  const canonicalStyle = html.slice(
    html.indexOf("body[data-cco-calendar-source='canonical-v6']"),
    html.indexOf('</style>', html.indexOf("body[data-cco-calendar-source='canonical-v6']"))
  );
  const intelBlock = shell.slice(
    shell.indexOf('function v6RenderIntel'),
    shell.indexOf('function v6BookingCard')
  );
  assert.doesNotMatch(canonicalStyle, /\.calendar-toolbar[^}]*flex-wrap:\s*wrap/s);
  assert.doesNotMatch(canonicalStyle, /\.calendar-toolbar-actions[^}]*flex-wrap:\s*wrap/s);
  assert.match(intelBlock, /\['Besök', 'Historik', 'Filer', 'Anteckningar'\]/);
  assert.match(intelBlock, /Ombokning avstängd/);
  assert.match(intelBlock, /openCanonicalPatient\(slot\.patientId\)/);
  assert.match(shell, /v6State\.selected = selected \|\| v6State\.visits\.find/);
  assert.match(shell, /'God morgon, Fazli'/);
  assert.match(shell, /count >= 5 \? '🔆' : count >= 3 \? '⛅'/);
  assert.match(shell, /\['Dragning avstängd', 'Saknar verifierat boknings-write-kontrakt'/);
});
