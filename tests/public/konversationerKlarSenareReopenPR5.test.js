'use strict';

/* PR 5 — Klar/Senare/Reopen-UI i admin#cco → Konversationer.
 *
 * Knapparna påverkar vald LIVE-tråd via befintlig backend-action
 * (POST /cco/runtime/conversation/:key/action, mail.write). UI uppdateras efter
 * lyckad action (handled/reply_later/reopen). #540/#543/#544-regler behålls:
 * Till blir aldrig klinikmail, Skicka låst om mottagare saknas, makron använder
 * vald tråd, Smart anteckning v3 (inte gamla modalen).
 *
 * Tester: wiring/guard (källkod) + kontrakt mot backend-endpointen. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const actionsPath = path.join(repoRoot, 'public', 'konversationer-bottom-actions.js');
const htmlPath = path.join(repoRoot, 'public', 'konversationer.html');
const backendPath = path.join(repoRoot, 'src', 'routes', 'ccoConversation.js');

const source = fs.readFileSync(actionsPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const backend = fs.readFileSync(backendPath, 'utf8');

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

// ── Knappar i Konversationer-ytan ────────────────────────────────────────────

test('PR5: Klar/Senare/Återöppna-knappar finns i bottom action bar', () => {
  assert.match(html, /data-action="klar"/);
  assert.match(html, /data-action="senare"/);
  assert.match(html, /data-action="reopen"/);
  assert.match(html, /<span class="action-label">Klar<\/span>/);
  // PR 8 — copy: "Senare" → "Lägg senare" (särskilj action från vänsterpanelens filter).
  assert.match(html, /<span class="action-label">Lägg senare<\/span>/);
  assert.match(html, /<span class="action-label">Återöppna<\/span>/);
});

test('PR5: knapparna wire:as till rätt backend-action', () => {
  assert.match(source, /action === 'klar'\) runConversationAction\('handled'\)/);
  assert.match(source, /action === 'senare'\) openSenarePanel\(\)/);
  assert.match(source, /action === 'reopen'\) runConversationAction\('reopen'\)/);
});

// ── runConversationAction — kontrakt + guards ────────────────────────────────

test('PR5: action POSTar till rätt endpoint med action + customerId', () => {
  assert.match(source, /async function runConversationAction\(action\)/);
  assert.match(
    compact(source),
    /'\/cco\/runtime\/conversation\/' \+ encodeURIComponent\(ctx\.conversationKey\) \+ '\/action'/
  );
  assert.match(source, /method: 'POST'/);
  assert.match(source, /credentials: 'include'/);
  assert.match(source, /body: JSON\.stringify\(\{ action, customerId \}\)/);
});

test('PR5: åtgärd sker BARA på riktig live-tråd (inte demo/visible-fallback)', () => {
  assert.match(source, /const ctx = getLiveConversationContext\(\);/);
  assert.match(
    compact(source),
    /if \(!ctx \|\| !ctx\.conversationKey \|\| ctx\.conversationKey === 'visible-thread'\)/
  );
  assert.match(source, /Ingen live-tråd vald/);
});

test('PR5: customerId härleds som kundens e-post, aldrig klinikmail (#540)', () => {
  // resolveThreadCustomerEmail scannar trådens inkommande icke-klinikmail (PR 6).
  assert.match(source, /const customerId = resolveThreadCustomerEmail\(ctx\)/);
  assert.match(source, /Kundadress saknas i tråden/);
});

test('PR5: ingen action på file:// (ingen fejk mot lokal fil)', () => {
  assert.match(source, /window\.location\.protocol === 'file:'/);
});

test('PR5: giltiga actions är exakt handled/reply_later/reopen', () => {
  assert.match(source, /const CONVERSATION_ACTION_LABEL = \{/);
  assert.match(source, /handled:/);
  assert.match(source, /reply_later:/);
  assert.match(source, /reopen:/);
});

// ── UI-uppdatering efter action ──────────────────────────────────────────────

test('PR5: UI uppdateras efter lyckad action (applyThreadAction)', () => {
  assert.match(source, /window\.CCOConversationActions\?\.applyThreadAction\?\.\(action\)/);
  assert.match(html, /window\.CCOConversationActions = \{/);
  assert.match(html, /applyThreadAction\(action\)/);
});

test('PR5: Klar markerar tråd klar, Senare snoozar, Reopen återöppnar', () => {
  const c = compact(html);
  assert.match(
    c,
    /if \(action === 'handled'\) \{ target\.threadStatus = 'handled'; target\.unread = false;/
  );
  assert.match(
    c,
    /else if \(action === 'reply_later'\) \{ target\.threadStatus = 'snoozed'; target\.unread = false;/
  );
  assert.match(
    c,
    /else if \(action === 'reopen'\) \{ target\.threadStatus = 'needs_reply'; target\.unread = true;/
  );
  assert.match(html, /renderInboxThreads\(currentThreads/);
});

test('PR5: statusbar speglar Klar/Senare via befintliga status-pill-varianter', () => {
  assert.match(html, /thread\.threadStatus === 'handled'/);
  assert.match(html, /status-pill--success"><span class="dot"><\/span>Klar/);
  assert.match(html, /thread\.threadStatus === 'snoozed'/);
  assert.match(html, /status-pill--warning"><span class="dot"><\/span>Senare/);
});

// ── Backend-kontrakt (befintlig endpoint, inte ny) ───────────────────────────

test('PR5: backend-endpoint finns och gäller mail.write med rätt actions', () => {
  assert.match(backend, /'\/cco\/runtime\/conversation\/:key\/action'/);
  assert.match(backend, /requirePermission\('mail\.write'\)/);
  assert.match(backend, /\['handled', 'reply_later', 'reopen'\]\.includes\(action\)/);
});

// ── #540/#543/#544-regler oförändrade ────────────────────────────────────────

test('PR5: send-låset (recipientMissing) kvar (#540/#543)', () => {
  assert.match(source, /const recipientMissing = !recipientEmail/);
  assert.ok(source.includes('if (recipientBlockedReason) {'));
});

test('PR5: makron använder fortfarande vald tråd (#543)', () => {
  assert.match(source, /function buildMacroText\(/);
  assert.match(source, /buildMacroText\(sm\.id, ctx\)/);
});

test('PR5: Smart anteckning v3 används, inte gamla modalen (#544)', () => {
  assert.match(
    source,
    /const SMART_ANTECKNING_V3_SRC = '\/major-arcana-preview\/cco-smart-anteckning-v3\.html'/
  );
  assert.doesNotMatch(source, /Smart anteckning · Välj läge/);
});

// ── Cache-bust ───────────────────────────────────────────────────────────────

test('PR5: konversationer.html cache-bustar efter Klar/Senare/Reopen-koppling', () => {
  assert.match(html, /konversationer-bottom-actions\.js\?v=20260703s-tabs/);
});
