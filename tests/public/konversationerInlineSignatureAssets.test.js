const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../../public/konversationer.html'),
  'utf8'
);

test('inline signaturresurser stannar i mailkroppen och visas inte som bilagor', () => {
  assert.match(source, /function attachmentIsInlineMailAsset\(attachment, message\)/);
  assert.match(source, /item\.isInline === true/);
  assert.match(source, /item\.inline === true/);
  assert.match(source, /disposition === 'inline'/);
  assert.match(source, /contentId && html\.toLowerCase\(\)\.includes\(`cid:\$\{contentId\.toLowerCase\(\)\}`\)/);
  assert.match(source, /function attachmentUrlAppearsInlineInMailHtml\(attachment, html\)/);
  assert.match(source, /if \(!attachmentIsImage\(attachment\)\) return false;/);
  assert.match(source, /querySelectorAll\('img\[src\], source\[src\]'\)/);
  assert.match(
    source,
    /message\.attachments\.filter\([\s\S]*!attachmentIsInlineMailAsset\(attachment, message\)/
  );
});

test('bilagevyn fortsätter räkna och rendera endast det filtrerade urvalet', () => {
  const renderStart = source.indexOf('      function renderMessageAttachments(message)');
  const renderEnd = source.indexOf('\n      function ', renderStart + 20);
  const renderSource = source.slice(renderStart, renderEnd);

  assert.match(renderSource, /const total = attachments\.length/);
  assert.match(renderSource, /attachments\.filter\(attachmentIsImage\)\.length/);
  assert.match(renderSource, /attachments\.slice\(0, 24\)/);
});
