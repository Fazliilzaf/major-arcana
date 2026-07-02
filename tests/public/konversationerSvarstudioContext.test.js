const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const actionsPath = path.join(repoRoot, 'public', 'konversationer-bottom-actions.js');

function readActions() {
  return fs.readFileSync(actionsPath, 'utf8');
}

test('Svarstudio opens with selected live conversation context when available', () => {
  const source = readActions();

  assert.match(source, /function getLiveConversationContext\(\)/);
  assert.match(source, /window\.CCOLiveConversationContext\?\.getContext/);
  assert.match(source, /context && context\.conversationKey/);
  assert.match(source, /function openSvarstudioForSelectedThread\(presetContext\)/);
  assert.match(source, /openSvarstudio\(presetContext \|\| getLiveConversationContext\(\)\)/);
  assert.match(source, /if \(action === 'svarstudio'\) openSvarstudioForSelectedThread\(\);/);
  assert.match(source, /openSvarstudioForSelectedThread\(\);/);
});

test('Svarstudio modal maps live thread context into recipient, subject and mailbox', () => {
  const source = readActions();

  assert.match(source, /const liveContext = presetContext \|\| getLiveConversationContext\(\);/);
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
