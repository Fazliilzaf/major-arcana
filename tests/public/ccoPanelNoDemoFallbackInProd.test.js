'use strict';

/* Live-verifiering fångade att Skickat-panelen visade hårdkodade demo-mejl
 * (Anna Karlsson/Johan Andersson/Emma Svensson/Marcus Lund) i en RIKTIG inkorg.
 * Rotorsak: list-panelerna föll tillbaka på sina demo-arrayer när riktig data
 * var tom ELLER servern felade — även i produktion (DEMO=false). En färsk/tom
 * mailbox → demo-kunder läcker in. Fix: i produktion får demo-arrayen ALDRIG
 * renderas; tom/fel → ärlig tomstatus. De här testerna låser att fallbacken är
 * gated på DEMO i de list-paneler som bär demo-kunddata. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PREVIEW = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview');

test('Skickat: demo-listan (SENT) renderas aldrig i produktion (DEMO av)', () => {
  const src = fs.readFileSync(path.join(PREVIEW, 'cco-skickat-v3.html'), 'utf8');
  // DEMO är av i produktion.
  assert.match(src, /const DEMO = false/);
  // Tom riktig data får INTE falla tillbaka på SENT utan DEMO-grind.
  assert.doesNotMatch(
    src,
    /renderList\(mapped\.length \? mapped : SENT\)/,
    'tom riktig data ska inte rendera demo-listan SENT'
  );
  assert.match(src, /mapped\.length \? mapped : DEMO \? SENT : \[\]/);
  // Fel-/tom-vägarna gated på DEMO.
  assert.match(src, /renderList\(DEMO \? SENT : \[\]\)/);
  assert.match(src, /if \(!items\) items = DEMO \? SENT : \[\]/);
  // Ingen bar catch → SENT kvar.
  assert.doesNotMatch(src, /catch\s*\{[^}]*renderList\(SENT\)/);
});

test('Notiser: demo-notiserna (DEMO_ITEMS) renderas aldrig i produktion (DEMO av)', () => {
  const src = fs.readFileSync(path.join(PREVIEW, 'cco-notiser-v3.html'), 'utf8');
  assert.match(src, /const DEMO = false/);
  // Fel-vägen får inte sätta NOTI = DEMO_ITEMS utan DEMO-grind.
  assert.doesNotMatch(
    src,
    /catch[^}]*NOTI = DEMO_ITEMS\.slice\(\);/,
    'fel-vägen ska inte falla tillbaka på demo-notiser i produktion'
  );
  assert.match(src, /NOTI = DEMO \? DEMO_ITEMS\.slice\(\) : \[\]/);
});
