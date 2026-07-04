'use strict';

/* PR 40 (punch-list E) — dölj operatörens dev-chrome (RAPPORTERA/feedback,
 * tema-toggle, ångra, stage-badge) när en CCO-vy körs inbäddad i admin#cco-
 * modalens iframe. Den hör hemma i den fristående dev-previewen, inte i
 * produktions-popupflödet. Funktionell polish (a11y, skip-link, tema-applicering,
 * print-datum, virtuella listor) körs fortfarande i båda lägena. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const polish = fs.readFileSync(path.join(repoRoot, 'public', 'cco-polish.js'), 'utf8');

test('PR40: isEmbedded upptäcker iframe-inbäddning', () => {
  assert.match(polish, /function isEmbedded\(\)/, 'saknar isEmbedded-hjälpare');
  assert.match(polish, /window\.self !== window\.top/, 'isEmbedded kollar inte self!==top');
});

test('PR40: dev-chrome gate:as bakom !isEmbedded()', () => {
  // Injektionerna av dev-chrome ligger innanför ett if (!isEmbedded())-block.
  const guard = polish.match(/if \(!isEmbedded\(\)\) \{([\s\S]*?)\n\s*\}/);
  assert.ok(guard, 'hittar inget if (!isEmbedded())-block');
  const body = guard[1];
  for (const fn of [
    'injectThemeToggle',
    'injectStageBadge',
    'injectFeedbackButton',
    'injectUndoButton',
  ]) {
    assert.match(body, new RegExp(fn + '\\(\\)'), `${fn} gate:as inte av embed-vakten`);
  }
});

test('PR40: funktionell polish körs alltid (inte gate:ad)', () => {
  // Dessa ska ligga i init men UTANFÖR embed-vakten.
  const initBody = polish.match(/function init\(\) \{([\s\S]*?)\n\s{2}\}/);
  assert.ok(initBody, 'hittar inte init()');
  const beforeGuard = initBody[1].split('if (!isEmbedded())')[0];
  for (const fn of ['injectSkipLink', 'augmentA11y', 'stampPrintDate', 'activateVirtualScrolls']) {
    assert.match(beforeGuard, new RegExp(fn + '\\(\\)'), `${fn} ska köras oavsett läge`);
  }
});

test('PR40: undo-API null-guardar när knappen inte injicerats', () => {
  // updateUndoBadge måste tåla att .undo-btn saknas (embedded-läge).
  assert.match(
    polish,
    /const btn = document\.querySelector\('\.undo-btn'\);\s*\n\s*if \(!btn\) return;/,
    'updateUndoBadge null-guardar inte .undo-btn'
  );
});
