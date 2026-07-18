const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'konversationer.html'),
  'utf8'
);

test('Office-filer tolkas lokalt från auktoriserad asset-blob', () => {
  assert.match(html, /mammoth\.browser\.min\.js/);
  assert.match(html, /xlsx\.full\.min\.js/);
  assert.match(html, /jszip\.min\.js/);
  assert.match(html, /mammoth\.convertToHtml\(\{ arrayBuffer: await blob\.arrayBuffer\(\) \}\)/);
  assert.match(html, /XLSX\.read\(await blob\.arrayBuffer\(\)/);
  assert.match(html, /JSZip\.loadAsync\(await blob\.arrayBuffer\(\)\)/);
  assert.doesNotMatch(html, /view\.officeapps\.live\.com|docs\.google\.com\/viewer/);
});

test('video och ljud spelas i samma modal med browserkontroller', () => {
  assert.match(html, /<video class="mail-preview-media"[^>]*controls playsinline/);
  assert.match(html, /<audio class="mail-preview-media"[^>]*controls/);
  assert.match(html, /kind === 'video'/);
  assert.match(html, /kind === 'audio'/);
});

test('preview visar laddning, återförsök och ärliga storleksfel', () => {
  assert.match(html, /MAIL_PREVIEW_MAX_BYTES = 25 \* 1024 \* 1024/);
  assert.match(html, /class="mail-preview-loading" role="status"/);
  assert.match(html, /class="mail-preview-spinner"/);
  assert.match(html, /class="mail-preview-retry"/);
  assert.match(html, /Förhandsvisning stöder upp till 25 MB/);
  assert.match(html, /Originalfilen kan alltid hämtas med Ladda ner/);
});

test('mejl med många bilagor begränsar initial DOM men bevarar alla filer', () => {
  assert.match(html, /attachments\.slice\(0, 24\)/);
  assert.match(html, /attachments\.slice\(24\)/);
  assert.match(html, /Visa resterande \$\{remaining\.length\} bilagor/);
  assert.match(html, /<details class="msg-attachments-more">/);
});

test('inkommande och utgående bilagor stöds för samtliga aktiva CCO-mailboxar', () => {
  for (const mailbox of [
    'kons@hairtpclinic.com',
    'info@hairtpclinic.com',
    'contact@hairtpclinic.com',
    'egzona@hairtpclinic.com',
    'fazli@hairtpclinic.com',
    'marknad@hairtpclinic.com',
    'kvitto@hairtpclinic.com',
    'halso@hairtpclinic.com',
  ]) assert.match(html, new RegExp("'" + mailbox + "'"));
  assert.match(html, /rawDir === 'outgoing' \|\| rawDir === 'outbound' \|\| rawDir === 'sent'/);
  assert.match(html, /<div class="msg is-\$\{dir\}">/);
  assert.match(html, /renderMessageAttachments\(message\)/);
  assert.match(html, /authorizedMailAssetBlob\(sourceUrl\)/);
});

test('modalens mobilkontrakt behåller kontroller och stabil höjd', () => {
  assert.match(html, /@media \(max-width: 720px\)/);
  assert.match(html, /\.mail-preview-dialog \{ width: 100%; height: 94vh;/);
  assert.match(html, /\.mail-preview-office \{ padding: 16px; \}/);
  assert.match(html, /\.mail-preview-slide \{ min-height: 190px; \}/);
});
