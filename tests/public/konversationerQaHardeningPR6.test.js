'use strict';

/* PR 6 — CCO Konversationer QA-hardening (admin#cco → Konversationer/Svarstudio).
 * Fyra fynd åtgärdas:
 *  1. Klar/Senare/Reopen skickar samma kundidentitet som backend förväntar sig
 *     (trådens inkommande icke-klinikmail) → undviker 409 customer_mismatch.
 *  2. UI efter action: lista + läsruta hålls i takt (öppna nästa synliga tråd
 *     eller töm läsrutan tydligt).
 *  3. Till-fältet: manuellt inskriven klinikadress (eller tom) håller Skicka låst.
 *  4. Från-fältet: begränsat till trådens mailbox-spår, dedupe kvar.
 *
 * Tester: beteende (rena resolveThreadCustomerEmail) + wiring/guard (källkod). */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const actionsPath = path.join(repoRoot, 'public', 'konversationer-bottom-actions.js');
const htmlPath = path.join(repoRoot, 'public', 'konversationer.html');

const source = fs.readFileSync(actionsPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');

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

function loadResolver() {
  const bundle = [
    'cleanText',
    'canonicalHairTpMailbox',
    'looksLikeEmail',
    'firstEmailValue',
    'isHairTpMailboxEmail',
    'firstCustomerEmailValue',
    'resolveThreadCustomerEmail',
  ]
    .map((name) => extractFunction(source, name))
    .join('\n');
  return new Function(bundle + '\nreturn resolveThreadCustomerEmail;')();
}

// ── Fynd 1: kundidentitet från trådens inkommande icke-klinikmail ────────────

test('PR6: customerId = första inkommande icke-klinikmail (matchar backend)', () => {
  const resolve = loadResolver();
  const email = resolve({
    email: 'reply-to@fel.example', // härlett fält som skulle gett 409
    latestMessages: [
      { dir: 'incoming', from: 'Anna', email: 'anna@example.com' },
      { dir: 'outgoing', from: 'Klinik', email: 'kons@hairtpclinic.com' },
    ],
  });
  assert.equal(email, 'anna@example.com');
});

test('PR6: utgående klinikmail hoppas över', () => {
  const resolve = loadResolver();
  const email = resolve({
    latestMessages: [
      { dir: 'outgoing', from: 'Klinik', email: 'kons@hairtpclinic.com' },
      { dir: 'incoming', from: 'Björn', email: 'bjorn@example.com' },
    ],
  });
  assert.equal(email, 'bjorn@example.com');
});

test('PR6: klinikadress på inkommande rad räknas inte som kundmail', () => {
  const resolve = loadResolver();
  const email = resolve({
    latestMessages: [{ dir: 'incoming', from: 'System', email: 'noreply@hairtpclinic.com' }],
    customerEmail: 'kund@example.com',
  });
  assert.equal(email, 'kund@example.com');
});

test('PR6: faller tillbaka på kontext-kundmail när inga meddelanden finns', () => {
  const resolve = loadResolver();
  assert.equal(resolve({ email: 'c@example.com', latestMessages: [] }), 'c@example.com');
  assert.equal(resolve(null), '');
});

test('PR6: runConversationAction använder resolveThreadCustomerEmail', () => {
  assert.match(source, /function resolveThreadCustomerEmail\(context\)/);
  assert.match(source, /const customerId = resolveThreadCustomerEmail\(ctx\)/);
  // skannar inkommande, hoppar utgående
  assert.match(compact(source), /if \(!message \|\| message\.dir === 'outgoing'\) continue;/);
});

// ── Fynd 2: lista + läsruta i takt efter action ──────────────────────────────

test('PR6: efter action öppnas nästa synliga tråd eller läsrutan töms', () => {
  const c = compact(html);
  assert.match(html, /const visibleThreads = currentThreads\.filter\(/);
  assert.match(
    html,
    /threadMatchesTab\(t, currentInboxTab\) && threadMatchesLane\(t, currentLane\)/
  );
  assert.match(html, /const targetStillVisible = visibleThreads\.includes\(target\)/);
  assert.match(
    html,
    /const nextThread = targetStillVisible \? target : visibleThreads\[0\] \|\| null/
  );
  assert.match(c, /if \(!nextThread\) \{ clearThreadReadingPane\(\);/);
  assert.match(c, /\} else \{ openConversationThread\(nextThread\); \}/);
  assert.match(html, /function clearThreadReadingPane\(\)/);
  assert.match(html, /Ingen tråd vald/);
});

// ── Fynd 3: Till-fältet blockerar klinikmail + tom ───────────────────────────

test('PR6: manuellt inskriven klinikadress håller Skicka låst', () => {
  assert.match(source, /const recipientClinicMessage =/);
  assert.match(source, /function currentRecipientBlock\(\)/);
  assert.match(source, /if \(isHairTpMailboxEmail\(value\)\) return recipientClinicMessage/);
  assert.match(source, /if \(!value\) return recipientMissingMessage/);
  assert.match(source, /oninput: \(\) => evaluateRecipient\(\)/);
  assert.match(source, /function evaluateRecipient\(\)/);
  // send-lås är dynamiskt (inte bara initial recipientMissing)
  assert.match(source, /recipientBlockedReason = currentRecipientBlock\(\)/);
  assert.match(source, /sendButton\.setAttribute\('disabled', 'disabled'\)/);
});

test('PR6: alla send-vägar gate:as på recipientBlockedReason', () => {
  const gates = source.match(/if \(recipientBlockedReason\) \{/g) || [];
  assert.ok(gates.length >= 3, 'saveDraft + showPreview + Skicka ska alla gate:a');
});

// ── Fynd 4: Från begränsat till trådens mailbox-spår, dedupe kvar ────────────

test('PR6: Från = trådens mailbox-spår (ingen extern adressbok)', () => {
  assert.match(source, /const mailboxes = \[\.\.\.contextMailboxes\]\.reduce/);
  assert.doesNotMatch(source, /storedMailboxes/);
  assert.doesNotMatch(source, /loadMailboxes/);
  assert.doesNotMatch(source, /\/api\/v1\/cco-mailboxes/);
});

test('PR6: dedupe kvar — en mailbox visas en gång', () => {
  assert.match(source, /list\.some\(\(item\) => item\.id === id \|\| item\.email === email\)/);
});

// ── Behåll: v3, makron, ingen live-send, admin#cco ───────────────────────────

test('PR6: Smart anteckning v3, makron och send-lås behålls', () => {
  assert.match(
    source,
    /const SMART_ANTECKNING_V3_SRC = '\/major-arcana-preview\/cco-smart-anteckning-v3\.html'/
  );
  assert.match(source, /buildMacroText\(sm\.id, ctx\)/);
  assert.match(source, /const recipientMissing = !recipientEmail/);
  assert.doesNotMatch(source, /Smart anteckning · Välj läge/);
});

test('PR6: ingen live-send — bara utkast/godkännande', () => {
  assert.match(source, /Skickat för godkännande/);
  assert.doesNotMatch(source, /sendMail\(|graphSend|messages\/send/);
});

// ── Cache-bust ───────────────────────────────────────────────────────────────

test('PR6: konversationer.html cache-bustar efter QA-hardening', () => {
  assert.match(html, /konversationer-bottom-actions\.js\?v=20260703l-booking/);
});
