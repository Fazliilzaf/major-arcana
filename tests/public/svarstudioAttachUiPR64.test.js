'use strict';

/* PR 64 (steg 1c) — bifoga fil/bild i Svarstudion + "så här blir mailet"-förhands-
 * visning. UI:t använder 1b-endpoints (POST/GET/DELETE …/attachments). Ingen live-
 * send. Testet är strukturellt + en syntax-vakt på den inbäddade JS:en.
 * (Återinlagt efter #665: en rebase tappade testfilen även om funktionen mergades.) */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const html = fs.readFileSync(
  path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-svarstudio-v3.html'),
  'utf8'
);

test('PR64: bifoga-kontroll finns (knapp + filinput + lista + CSS)', () => {
  assert.match(html, /id="actAttach"/);
  assert.match(html, /id="attachInput"[\s\S]*?type="file"|type="file"[\s\S]*?id="attachInput"/);
  assert.match(html, /id="attachList"/);
  assert.match(html, /\.attach-chip\s*\{/);
});

test('PR64: laddar upp/ta bort via 1b-endpoints + dra-släpp + klistra in', () => {
  assert.match(html, /\/cco-comm\/drafts\/\$\{encodeURIComponent\([^)]*\)\}\/attachments/);
  assert.match(html, /method:\s*'DELETE'/);
  assert.match(html, /addEventListener\('drop'/);
  assert.match(html, /addEventListener\('paste'/);
  assert.match(html, /new FormData\(\)/);
});

test('PR64: förhandsvisningen visar bilagor ("så här blir mailet")', () => {
  assert.match(html, /Förhandsvisning — Till:/);
  assert.match(html, /bilaga\$\{ready\.length === 1/);
});

test('PR64: bilagor nollställs vid trådbyte (ingen läcka mellan kunder)', () => {
  // Trådbytet i loadThread nollställer bilagorna (via resetAttachments() eller direkt),
  // så en kunds förberedda bilagor aldrig läcker till nästa tråd.
  assert.match(
    html,
    /Nollställ bilagor[\s\S]*?(resetAttachments\(\)|S\.attachments = \[\])/
  );
});

test('PR64: ingen live-send introducerad', () => {
  assert.doesNotMatch(html, /graphSend|messages\/send/);
});

test('PR64: inbäddad JS har giltig syntax (vakt mot brutna script-block)', () => {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  let bad = 0;
  for (const c of scripts) {
    if (!c.trim()) continue;
    try {
      // eslint-disable-next-line no-new-func
      new Function(c);
    } catch {
      bad += 1;
    }
  }
  assert.equal(bad, 0, 'inga syntaxfel i inbäddade script-block');
});
