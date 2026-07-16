'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'public/kalender.html'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'public/cco-kalender-shell.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'public/cco-kalender-bridge.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/cco-kalender-shell.css'), 'utf8');

test('canonical calendar loads the existing live renderer in read-only mode', () => {
  const modeIndex = html.indexOf('window.CCO_CALENDAR_READ_ONLY = true');
  const shellMatch = html.match(/\/cco-kalender-shell\.js\?v=[^"']+/);
  const shellIndex = shellMatch ? shellMatch.index : -1;
  assert.ok(modeIndex >= 0);
  assert.ok(shellIndex > modeIndex);
  assert.match(html, /cco-kalender-shell\.css\?v=[^"']+/);
});

test('live renderer uses the admin bearer token and recognizes /kalender.html', () => {
  assert.match(shell, /ARCANA_ADMIN_TOKEN/);
  assert.match(shell, /headers\.Authorization = 'Bearer ' \+ token/);
  assert.match(shell, /\/\\\/kalender\\\.html\$\/i\.test\(window\.location\.pathname\)/);
  assert.match(shell, /calendar\/day\?' \+ query\.toString\(\)/);
  assert.match(shell, /calendar\/week\?' \+ query\.toString\(\)/);
});

test('read-only mode disables write bridge and hides every fixture-only calendar surface', () => {
  assert.match(bridge, /CCO_CALENDAR_READ_ONLY === true/);
  assert.match(bridge, /write bridge disabled/);
  assert.match(css, /data-cco-calendar-mode="live-read"[^{]*\.morgon-story/);
  assert.match(css, /data-cco-calendar-mode="live-read"[^{]*\.mini-inbox/);
  assert.match(css, /data-cco-calendar-mode="live-read"[^{]*\.calendar-week/);
  assert.match(css, /segment-tab\[data-mode="resurs"\]/);
  assert.match(shell, /Inga bokningar registrerade för dagen\./);
  assert.doesNotMatch(
    shell.slice(shell.indexOf('global.CcoKalenderShell = isReadOnlyMode()')),
    /\? \{[^}]*openCreateBookingModal/
  );
});
