'use strict';

/* PR 49 (B) — Bilage-/bild-indikator + robust vy i CCO-läsytan:
 *  - En tydlig "📎 N bilagor · 🖼 M bilder"-etikett ovanför bilage-chipsen.
 *  - Bilagor utan namn tappas inte längre (attachmentDisplayName härleder namn ur
 *    URL:en, annars "Bild"/"Bilaga") — man ska alltid se att en bilaga finns.
 *  - Bilagor utan öppningsbar URL visas som icke-klickbar chip i stället för att
 *    försvinna. Ren klient-rendering, ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../..');
const konv = fs.readFileSync(path.join(repoRoot, 'public', 'konversationer.html'), 'utf8');

function renderAttachmentsForTest(message) {
  const start = konv.indexOf('      function attachmentUrl(attachment)');
  const end = konv.indexOf('      function renderThreadMessages(thread, messages)', start);
  assert.notEqual(start, -1, 'attachmentUrl ska finnas');
  assert.ok(end > start, 'renderMessageAttachments-blocket ska kunna extraheras');

  const sandbox = {
    normalizeText(value) {
      if (value === null || value === undefined) return '';
      return String(value).trim();
    },
    firstMailText(...values) {
      for (const value of values) {
        const text =
          value && typeof value === 'object'
            ? sandbox.normalizeText(value.content || value.text || value.value || value.html || '')
            : sandbox.normalizeText(value);
        if (text) return text;
      }
      return '';
    },
    formatAttachmentSize() {
      return '';
    },
    isAllowedMailUrl(value, { image = false } = {}) {
      const url = sandbox.normalizeText(value);
      if (!url) return false;
      if (image && /^data:image\//i.test(url)) return true;
      try {
        const parsed = new URL(url, 'https://arcana.hairtpclinic.com/admin');
        return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    },
    escapeHtml(value) {
      return sandbox.normalizeText(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },
    URL,
  };

  vm.runInNewContext(
    `${konv.slice(start, end)}\nthis.renderMessageAttachments = renderMessageAttachments;`,
    sandbox
  );
  return sandbox.renderMessageAttachments(message);
}

test('PR49: bilage-sektionen har en indikator-etikett (bilagor + bilder)', () => {
  const fn = konv.match(/function renderMessageAttachments\(message\)\s*\{[\s\S]*?\n {6}\}/);
  assert.ok(fn, 'renderMessageAttachments ska finnas');
  assert.match(fn[0], /msg-attachments-head/);
  assert.match(fn[0], /bilaga|bilagor/);
  assert.match(fn[0], /bild|bilder/);
  assert.match(konv, /\.msg-attachments-head\s*\{/);
});

test('PR49: bilagor utan namn tappas inte (fallback-namn)', () => {
  assert.match(konv, /function attachmentDisplayName\(attachment\)/);
  // Gamla beteendet: filtrera bort namnlösa bilagor — får inte finnas kvar.
  assert.doesNotMatch(
    konv,
    /const visible = attachments\.filter\(\(attachment\) => normalizeText\(attachment\?\.name\)\)/
  );
});

test('PR49: namnlös bildbilaga känns igen via URL och får preview', () => {
  const html = renderAttachmentsForTest({
    attachments: [{ url: 'https://cdn.example.test/uploads/foto%20foere.png' }],
  });
  assert.match(html, /🖼 1 bild/);
  assert.match(html, /msg-attachment-preview/);
  assert.match(html, /foto foere\.png/);
});

test('PR49: bilaga utan öppningsbar URL visas ändå (icke-klickbar chip)', () => {
  assert.match(konv, /msg-attachment--unavailable/);
  assert.match(konv, /\.msg-attachment--unavailable\s*\{/);
});

test('PR49: ingen live-send introducerad', () => {
  assert.doesNotMatch(konv, /graphSend|messages\/send/);
});
