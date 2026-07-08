'use strict';

/* PR 4 — Smart anteckning-knappen i admin#cco → Konversationer ska öppna
 * Smart anteckning v3 (ny/rätt CCO-vy) med vald live-tråds kontext — INTE det
 * gamla "Smart anteckning · Välj läge"-modalflödet (legacy).
 *
 * Tester: beteende (kör den rena buildSmartAnteckningContext) + wiring/guard
 * (källkod), samt att v3 tar emot kontexten och att send-låset (#540/#543)
 * är oförändrat. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const actionsPath = path.join(repoRoot, 'public', 'konversationer-bottom-actions.js');
const htmlPath = path.join(repoRoot, 'public', 'konversationer.html');
const v3Path = path.join(
  repoRoot,
  'public',
  'major-arcana-preview',
  'cco-smart-anteckning-v3.html'
);

const source = fs.readFileSync(actionsPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const v3 = fs.readFileSync(v3Path, 'utf8');

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

// Extrahera en namngiven funktion med balanserade klamrar (ingen DOM-eval).
function extractFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('function not found: ' + name);
  let depth = 0;
  let i = src.indexOf('{', start);
  for (; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        i += 1;
        break;
      }
    }
  }
  return src.slice(start, i);
}

// Kör buildSmartAnteckningContext med stubbad live-/visible-kontext.
function loadBuilder(liveContext) {
  const bundle = [
    'cleanText',
    'canonicalHairTpMailbox',
    'looksLikeEmail',
    'firstEmailValue',
    'isHairTpMailboxEmail',
    'firstCustomerEmailValue',
    'buildSmartAnteckningContext',
  ]
    .map((name) => extractFunction(source, name))
    .join('\n');
  const factory = new Function(
    'getLiveConversationContext',
    'getVisibleConversationContext',
    bundle + '\nreturn buildSmartAnteckningContext;'
  );
  return factory(
    () => liveContext,
    () => null
  );
}

// ── Beteende: kontext-payloaden ──────────────────────────────────────────────

test('PR4: payload bär kund, tråd, ämne, mailbox och senaste meddelanden', () => {
  const build = loadBuilder({
    conversationKey: 'CONV-123',
    customerName: 'Anna Andersson',
    subject: 'Re: Fråga om PRP-pris',
    mailboxId: 'kons@hairtpclinic.com',
    status: 'Behöver granskas',
    sla: 'Följ upp idag',
    email: 'anna@example.com',
    latestMessages: [
      { dir: 'incoming', from: 'Anna', time: '14:02', body: 'Vad kostar PRP?' },
      { dir: 'outgoing', from: 'Klinik', time: '14:20', body: 'Vi återkommer' },
    ],
  });
  const ctx = build();
  assert.equal(ctx.conversationKey, 'CONV-123');
  assert.equal(ctx.customerName, 'Anna Andersson');
  assert.equal(ctx.subject, 'Fråga om PRP-pris'); // Re: strippas
  assert.equal(ctx.mailboxId, 'kons@hairtpclinic.com');
  assert.equal(ctx.status, 'Behöver granskas');
  assert.equal(ctx.sla, 'Följ upp idag');
  assert.equal(ctx.email, 'anna@example.com');
  assert.equal(ctx.latestMessages.length, 2);
  assert.equal(ctx.latestMessages[0].dir, 'incoming');
  assert.equal(ctx.latestMessages[1].dir, 'outgoing');
  assert.equal(ctx.avatar, 'A');
});

test('PR4: klinik-mailbox filtreras bort som mottagare (behåller #540-regeln)', () => {
  const build = loadBuilder({
    conversationKey: 'CONV-9',
    customerName: 'Vald kund',
    email: 'kons@hairtpclinic.com',
  });
  const ctx = build();
  assert.equal(ctx.email, '', 'klinikadress ska inte bli mottagare');
});

test('PR4: tom kontext ger säkra defaults utan krasch', () => {
  const build = loadBuilder(null);
  const ctx = build();
  assert.equal(ctx.customerName, 'Vald kund');
  assert.equal(ctx.conversationKey, '');
  assert.deepEqual(ctx.latestMessages, []);
});

test('PR4: senaste meddelanden begränsas och trimmas', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    dir: 'incoming',
    body: 'meddelande ' + i,
  }));
  const build = loadBuilder({ conversationKey: 'K', customerName: 'X', latestMessages: many });
  const ctx = build();
  assert.equal(ctx.latestMessages.length, 8, 'max 8 senaste meddelanden');
});

// ── Wiring: knappen öppnar v3, inte legacy ───────────────────────────────────

test('PR4: Smart anteckning-knappen öppnar v3 via same-origin (ingen file://)', () => {
  assert.match(
    source,
    /const SMART_ANTECKNING_V3_SRC = '\/major-arcana-preview\/cco-smart-anteckning-v3\.html'/
  );
  assert.doesNotMatch(source, /file:\/\//, 'ingen file:// som mål');
  assert.match(source, /function openSmartAnteckning\(\)/);
  assert.match(source, /function buildSmartAnteckningContext\(\)/);
  assert.match(compact(source), /const src = SMART_ANTECKNING_V3_SRC \+/);
  assert.match(source, /el\(\s*'iframe'/);
  assert.match(source, /action === 'smart-anteckning'\) openSmartAnteckning\(\)/);
});

test('PR4: legacy "Välj läge"-flödet är borttaget (inte standardflöde)', () => {
  assert.doesNotMatch(source, /Smart anteckning · Välj läge/);
  assert.doesNotMatch(source, /function openSmartAnteckningEditor/);
});

test('PR4: kontexten skickas till v3 via postMessage från same origin', () => {
  assert.match(source, /frame\.addEventListener\('load'/);
  assert.match(
    compact(source),
    /postMessage\( \{ type: 'cco:smart-anteckning:context', context \}, window\.location\.origin \)/
  );
});

test('PR4: kontexten byggs från vald live-/visible-tråd', () => {
  assert.match(
    compact(source),
    /getLiveConversationContext\(\) \|\| getVisibleConversationContext\(\) \|\| \{\}/
  );
});

// ── Send-lås (#540/#543) oförändrat ──────────────────────────────────────────

test('PR4: send-låset (recipientMissing) är kvar och oförändrat', () => {
  assert.match(source, /const recipientMissing = !recipientEmail/);
  assert.ok(
    source.includes('if (recipientBlockedReason) {'),
    'send-handlern blockerar fortfarande'
  );
  assert.ok(source.includes('recipientMissingMessage'), 'varningstext finns kvar');
});

// ── v3 tar emot kontexten ────────────────────────────────────────────────────

test('PR4: v3 lyssnar på kontext-postMessage och validerar origin', () => {
  assert.match(v3, /cco:smart-anteckning:context/);
  assert.match(v3, /event\.origin !== window\.location\.origin/);
  assert.match(v3, /window\.CCO_SMART_ANTECKNING_CONTEXT = context/);
});

test('PR4: v3 fyller befintlig ctx-bar (kund, sub, avatar) — ingen ny design', () => {
  assert.match(v3, /\.ctx-bar \.ctx-name/);
  assert.match(v3, /\.ctx-bar \.ctx-sub/);
  assert.match(v3, /\.ctx-bar \.ctx-av/);
  assert.match(v3, /function applyContext\(context\)/);
});

// ── Cache-bust ───────────────────────────────────────────────────────────────

test('PR4: konversationer.html cache-bustar efter Smart anteckning v3-koppling', () => {
  assert.match(html, /konversationer-bottom-actions\.js\?v=20260708a-svarstudio-cache/);
});
