'use strict';

/* PR 3 — Svarsmallar/makron kopplade till vald live-tråd (admin#cco →
 * Konversationer). Makron ska använda trådens kund (namn), ämne och senaste
 * meddelanden, fylla svarsfältet, och INTE röra send-låset (recipientMissing).
 * Tester: beteende (kör den rena buildMacroText) + wiring/guard (källkod). */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const actionsPath = path.resolve(__dirname, '../..', 'public', 'konversationer-bottom-actions.js');
const source = fs.readFileSync(actionsPath, 'utf8');

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

const bundle = ['cleanText', 'macroFirstName', 'macroTopic', 'buildMacroText']
  .map((name) => extractFunction(source, name))
  .join('\n');
const buildMacroText = new Function(bundle + '\nreturn buildMacroText;')();

// ── Beteende ─────────────────────────────────────────────────────────────────

test('PR3: makro använder trådens kund (förnamn) och ämne', () => {
  const out = buildMacroText('confirm_booking', {
    customerName: 'Anna Andersson',
    subject: 'Re: Fråga om pris och tid',
  });
  assert.match(out, /Hej Anna!/);
  assert.match(out, /Fråga om pris och tid/);
  assert.match(out, /bekräftar din bokning/i);
});

test('PR3: ämne faller tillbaka på senaste meddelande när subject saknas', () => {
  const out = buildMacroText('ask_more_info', {
    customerName: 'Björn',
    subject: '',
    latestMessages: [{ body: 'Hej, jag undrar om PRP' }],
  });
  assert.match(out, /Hej Björn!/);
  assert.match(out, /jag undrar om PRP/);
});

test('PR3: generiskt/placeholder-kundnamn ger neutral hälsning', () => {
  const out = buildMacroText('send_pricing', { customerName: 'Vald konversation' });
  assert.match(out, /^Hej!/);
  assert.doesNotMatch(out, /Hej Vald/);
});

test('PR3: alla fyra makron ger unik, relevant text', () => {
  const ctx = { customerName: 'Anna', subject: 'bokning' };
  const bodies = ['confirm_booking', 'suggest_times', 'send_pricing', 'ask_more_info'].map((id) =>
    buildMacroText(id, ctx)
  );
  assert.equal(new Set(bodies).size, 4, 'alla fyra makron ska ge unik text');
  assert.match(bodies[1], /tider lediga/i);
  assert.match(bodies[2], /prisinformation/i);
});

test('PR3: okänt makro faller tillbaka på neutral text (ingen krasch)', () => {
  const out = buildMacroText('does_not_exist', { customerName: 'Anna' });
  assert.match(out, /Hej Anna!/);
  assert.match(out, /återkommer inom kort/i);
});

// ── Wiring + guard (källkod) ─────────────────────────────────────────────────

test('PR3: makro-klick fyller svarsfältet från vald tråd (ctx)', () => {
  const compact = source.replace(/\s+/g, ' ');
  assert.match(compact, /const macroText = buildMacroText\(sm\.id, ctx\)/);
  assert.match(compact, /bodyArea\.value = nextBody/);
  assert.match(source, /state\.body = nextBody/);
});

test('PR3: send-låset (recipientMissing) är oförändrat och gäller fortfarande', () => {
  assert.match(source, /const recipientMissing = !recipientEmail/);
  assert.ok(source.includes('if (recipientMissing) {'), 'send-handlern ska fortfarande blockera');
  assert.ok(source.includes('recipientMissingMessage'), 'varningstext finns kvar');
});
