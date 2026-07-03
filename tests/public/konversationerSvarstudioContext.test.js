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

function compactSource(source) {
  return source.replace(/\s+/g, ' ');
}

test('Svarstudio opens with selected live conversation context when available', () => {
  const source = readActions();

  assert.match(source, /function getLiveConversationContext\(\)/);
  assert.match(source, /window\.CCOLiveConversationContext\?\.getContext/);
  assert.match(source, /context && context\.conversationKey/);
  assert.match(source, /function openSvarstudioForSelectedThread\(presetContext\)/);
  assert.match(
    compactSource(source),
    /openSvarstudio\( presetContext \|\| getLiveConversationContext\(\) \|\| getVisibleConversationContext\(\) \)/
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
    compactSource(source),
    /const liveContext = presetContext \|\| getLiveConversationContext\(\) \|\| getVisibleConversationContext\(\);/
  );
  assert.match(source, /conversationKey: liveContext\?\.conversationKey/);
  assert.match(source, /source: liveContext\?\.source/);
  assert.match(source, /const preferredMailbox =/);
  assert.match(source, /findMailboxOption\(/);
  assert.match(source, /mailboxId: preferredMailbox\?\.id \|\| 'contact@hairtpclinic\.com'/);
  assert.match(
    source,
    /subject: ctx\.subject \|\| 'Re: ' \+ \(ctx\.customerName \|\| 'konversation'\)/
  );
  assert.match(source, /const recipientEmail = firstCustomerEmailValue\(/);
  assert.match(source, /const recipientMissing = !recipientEmail/);
  assert.match(source, /placeholder: recipientEmail \? '' : 'Mottagare saknas i tråddatan'/);
  assert.match(source, /Mottagare saknas i vald tråd/);
  assert.match(source, /disabled: recipientMissing \? 'disabled' : null/);
  assert.match(source, /if \(recipientMissing\) \{/);
  assert.match(source, /const contextMailboxes = Array\.isArray\(ctx\.mailboxOptions\)/);
  assert.match(source, /\.\.\.contextMailboxes, \.\.\.storedMailboxes/);
  assert.match(source, /Array\.isArray\(ctx\.latestMessages\)/);
});

test('Svarstudio keeps form fields populated when mailbox id is partial or missing', () => {
  const source = readActions();

  assert.match(source, /function canonicalHairTpMailbox\(value\)/);
  assert.match(source, /const full = text\.match/);
  assert.match(source, /const partial = text\.match/);
  assert.match(source, /function looksLikeEmail\(value\)/);
  assert.match(source, /function formatMailboxOptionLabel\(mailbox\)/);
  assert.match(source, /email\.endsWith\('@hairtpclinic\.com'\)/);
  assert.match(source, /formatMailboxOptionLabel\(mb\)/);
  assert.match(source, /function firstEmailValue\(\.\.\.values\)/);
  assert.match(source, /function isHairTpMailboxEmail\(value\)/);
  assert.match(source, /function firstCustomerEmailValue\(\.\.\.values\)/);
  assert.match(source, /!isHairTpMailboxEmail\(email\)/);
  assert.match(source, /const embedded = text\.match/);
  assert.match(source, /threadNode\?\.dataset\?\.customerEmail/);
  assert.match(source, /latestIncoming\?\.email/);
  assert.match(source, /if \(mailboxSelect\.value !== state\.mailboxId && mailboxes\[0\]\)/);
});

test('konversationer live context derives recipient and sender mailbox for Svarstudio', () => {
  const html = readHtml();

  assert.match(html, /function firstEmailValue\(\.\.\.values\)/);
  assert.match(html, /function isHairTpMailboxEmail\(value\)/);
  assert.match(html, /function firstCustomerEmailValue\(\.\.\.values\)/);
  assert.match(html, /!isHairTpMailboxEmail\(email\)/);
  assert.match(html, /const embedded = text\.match/);
  assert.match(html, /function canonicalHairTpMailbox\(value\)/);
  assert.match(html, /const full = text\.match/);
  assert.match(html, /const partial = text\.match/);
  assert.match(html, /function looksLikeEmail\(value\)/);
  assert.match(html, /looksLikeEmail\(text\)/);
  assert.match(html, /message\?\.senderEmail/);
  assert.match(html, /message\?\.fromEmail/);
  assert.match(html, /message\?\.replyToEmail/);
  assert.match(html, /message\?\.sender\?\.emailAddress/);
  assert.match(html, /customer\.emailAddress/);
  assert.match(html, /row\.customerEmail/);
  assert.match(html, /data-customer-email/);
  assert.match(html, /const replyEmail =/);
  assert.match(html, /email: replyEmail/);
  assert.match(html, /canonicalHairTpMailbox\(item\)/);
  assert.match(html, /email: canonicalHairTpMailbox\(mailbox\)/);
  assert.match(html, /mailboxOptions: mailboxTrail\.map/);
  assert.match(html, /const dir = rawDir === 'outgoing' \|\| rawDir === 'outbound'/);
});

test('konversationer.html cache-busts bottom actions after Svarstudio context fix', () => {
  const html = readHtml();

  assert.match(html, /konversationer-bottom-actions\.js\?v=20260703g/);
});
