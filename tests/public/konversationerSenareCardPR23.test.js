'use strict';

/* PR 23 — Senare får Konversationers fulla kundkontext-kort (namespaced .kk-*)
 * i högerpanelen: ÅTERUPPTAG behålls överst, KUND + AI-SIGNAL ersätts med kortet
 * (dynamiskt från trådens data). Kortets .kk-pill-actions postar data-action via
 * en document-wide handler (samma som bottom-baren). Ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const senarePath = path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-senare-v3.html');
const senare = fs.readFileSync(senarePath, 'utf8');

test('PR23: Senare renderar kundkontext-kortet, ÅTERUPPTAG kvar', () => {
  // ÅTERUPPTAG-kortet finns kvar.
  assert.match(senare, /class="ctx-sec">Återupptag</);
  // Kortet ersätter KUND + AI-SIGNAL.
  assert.match(senare, /class="kk-card"/);
  assert.match(senare, /class="kk-kicker">Kundkontext/);
  assert.match(senare, /class="kk-title">Operatörsstöd/);
  assert.doesNotMatch(senare, /class="ctx-sec">Kund</);
  assert.doesNotMatch(senare, /class="ctx-sec">AI-signal</);
});

test('PR23: kortet fylls dynamiskt från trådens data', () => {
  assert.match(
    senare,
    /class="kk-avatar" style="background:\$\{esc\(t\.avatarBg\)\}">\$\{esc\(t\.init\)\}/
  );
  assert.match(senare, /class="kk-name">\$\{esc\(t\.name\)\}/);
  assert.match(senare, /class="kk-grid">\$\{Object\.entries\(c\)/);
  assert.match(senare, /class="kk-ai">.*\$\{esc\(t\.ai\)\}/s);
});

test('PR23: kortets actions postar data-action; handler är document-wide', () => {
  assert.match(senare, /class="kk-pill kk-pill--ai" type="button" data-action="svarstudio"/);
  assert.match(senare, /data-action="bokningsyta"/);
  assert.match(senare, /data-action="patienthub"/);
  assert.match(senare, /class="kk-pill kk-pill--success" type="button" data-action="klar"/);
  // document-wide click-handler (så .kk-pill utanför baren också fångas).
  assert.match(senare, /document\.addEventListener\('click', function \(e\) \{/);
  assert.doesNotMatch(senare, /var bar = document\.querySelector\('\.thread-bottom-actions'\)/);
});

test('PR23: ingen live-send', () => {
  assert.doesNotMatch(senare, /sendMail\(|graphSend|messages\/send/);
});
