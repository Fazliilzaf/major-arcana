'use strict';

/**
 * FIDELITY-SVARET MÅSTE SÄGA VAD DET MÄTTE.
 *
 * ORD-89 flyttade brödtexten till sidofiler och lämnade shardens fält tomt.
 * Fidelity-instrumenten läser det fältet, så de slutade se HTML:en de finns
 * för att granska: contact@ rapporterade 13 htmlBodies av 10 647 meddelanden.
 * `cidReferencesWithoutAttachmentMetadata` kunde aldrig bli annat än noll —
 * ett larm som inte kan larma.
 *
 * Men en ovillkorlig sidofilsläsning är inte lösningen: efter migreringen är
 * inline tomt för ALLA äldre meddelanden, så det blir EN FIL PER MEDDELANDE.
 * 10 647 disk-I/O per anrop för contact@ — kostnaden ORD-89 tog bort, i
 * motsatt riktning.
 *
 * Därför: shard som standard, `deepScan` för en riktad granskning, och ett
 * fält som säger vilken källa talen bygger på. Ett tal utan sin källa är
 * precis det som gjorde `rssDeltaBytes` och `maxKeyChars` missvisande.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const STORE = fs.readFileSync(path.join(ROOT, 'src', 'ops', 'ccoMailboxTruthStore.js'), 'utf8');

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('sidofilsläsning sker bara vid deepScan', () => {
  const code = stripComments(STORE);
  const start = code.indexOf('async function readBodyHtmlForFidelity(');
  assert.ok(start > -1);
  const fn = code.slice(start, code.indexOf('\n  }\n', start));
  const guardPos = fn.indexOf('if (!deepScan) return');
  const readPos = fn.indexOf('bodyStore.readBody');
  assert.ok(guardPos > -1, 'utan grinden blir det en filläsning per meddelande');
  assert.ok(readPos > guardPos, 'grinden måste ligga FÖRE filläsningen');
});

test('inline-fältet används först — en fältkoll är gratis', () => {
  const code = stripComments(STORE);
  const start = code.indexOf('async function readBodyHtmlForFidelity(');
  const fn = code.slice(start, code.indexOf('\n  }\n', start));
  assert.match(fn, /const inline = normalizeText\(message\.bodyHtml\);\s*\n\s*if \(inline\) return inline;/);
});

test('svaret säger vilken källa talen bygger på', () => {
  // Ett shard-svep efter ORD-89 ser annars ut som "inga inbäddade bilder
  // finns" i stället för "vi tittade inte där de ligger".
  const code = stripComments(STORE);
  const matches = code.match(/bodySource: deepScan \? 'bodies_sidecar' : 'shard_inline_only'/g) || [];
  assert.equal(matches.length, 2, 'både inventory och manifest ska bära källan');
});

test('deepScan går hela vägen genom adaptern', () => {
  // Utan detta tar ändpunkten emot flaggan och tappar den tyst — samma
  // mellanled-som-tappar som tenantMailboxIds gjorde i ORD-95.
  const adapter = stripComments(
    fs.readFileSync(path.join(ROOT, 'src', 'ops', 'ccoMailboxTruthReadAdapter.js'), 'utf8')
  );
  assert.match(adapter, /getFidelityInventory\(\{[^}]*deepScan[^}]*\}\)/);
  assert.match(adapter, /getCidFidelityManifest\(\{[^}]*deepScan[^}]*\}\)/);
  assert.match(adapter, /function getFidelityInventory\(\{[^}]*deepScan = false/);
  assert.match(adapter, /function getCidFidelityManifest\(\{[^}]*deepScan = false/);
});
