const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const actionsPath = path.join(repoRoot, 'public', 'konversationer-bottom-actions.js');
const htmlPath = path.join(repoRoot, 'public', 'konversationer.html');

function readActions() {
  return fs.readFileSync(actionsPath, 'utf8');
}

function readHtml() {
  return fs.readFileSync(htmlPath, 'utf8');
}

test('Svarstudio opens with selected live conversation context when available', () => {
  const source = readActions();

  assert.match(source, /function getLiveConversationContext\(\)/);
  assert.match(source, /window\.CCOLiveConversationContext\?\.getContext/);
  assert.match(source, /context && context\.conversationKey/);
  assert.match(source, /function openSvarstudioForSelectedThread\(presetContext\)/);
  assert.match(
    source,
    /openSvarstudio\(presetContext \|\| getLiveConversationContext\(\) \|\| getVisibleConversationContext\(\)\)/
  );
  assert.match(source, /if \(action === 'svarstudio'\) openSvarstudioForSelectedThread\(\);/);
  assert.match(source, /openSvarstudioForSelectedThread\(\);/);
});

test('Svarstudio falls back to visible CCO thread instead of old GetAccept demo', () => {
  const source = readActions();

  assert.match(source, /function getVisibleConversationContext\(\)/);
  assert.match(source, /selectedThreadText\('\.ctx-name'\)/);
  assert.match(source, /visibleThreadMessages\(\)/);
  assert.doesNotMatch(source, /GetAccept/);
  assert.doesNotMatch(source, /reply_to_sender@getaccept\.com/);
});

test('Svarstudio modal maps live thread context into recipient, subject and mailbox', () => {
  const source = readActions();

  assert.match(
    source,
    /const liveContext = presetContext \|\| getLiveConversationContext\(\) \|\| getVisibleConversationContext\(\);/
  );
  assert.match(source, /conversationKey: liveContext\?\.conversationKey/);
  assert.match(source, /source: liveContext\?\.source/);
  assert.match(source, /mailboxId: ctx\.mailboxId \|\| mailboxes\[0\]\?\.id \|\| 'contact'/);
  assert.match(
    source,
    /subject: ctx\.subject \|\| 'Re: ' \+ \(ctx\.customerName \|\| 'konversation'\)/
  );
  assert.match(
    source,
    /const recipientInput = el\('input', \{ type: 'text', value: ctx\.email \|\| '' \}\)/
  );
  assert.match(source, /Array\.isArray\(ctx\.latestMessages\)/);
});

test('konversationer.html cache-busts bottom actions after Svarstudio context fix', () => {
  const html = readHtml();

  assert.match(html, /konversationer-bottom-actions\.js\?v=20260703b/);
});
