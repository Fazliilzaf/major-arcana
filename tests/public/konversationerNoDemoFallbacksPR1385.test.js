'use strict';

/* PR 1385 — ta bort demo-fallbacks i konversationer-bottom-actions.js:
 * hårdkodad ROLE='owner', TENANT='hair_tp' och CUST-DEMO-002 i activeCustomerId().
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(repoRoot, 'public', 'konversationer-bottom-actions.js'),
  'utf8'
);

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

test('PR1385: ROLE är inte längre en hårdkodad konstant', () => {
  assert.doesNotMatch(source, /^\s*const\s+ROLE\s*=\s*['"]owner['"];/m);
  assert.match(source, /function currentRole\(\)/);
  assert.match(compact(source), /function currentRole\(\)\s*\{/);
});

test('PR1385: TENANT är inte längre en hårdkodad konstant', () => {
  assert.doesNotMatch(source, /^\s*const\s+TENANT\s*=\s*['"]hair_tp['"];/m);
  assert.match(source, /function currentTenant\(\)/);
  assert.match(compact(source), /function currentTenant\(\)\s*\{/);
});

test('PR1385: alla audit/anrop går via currentRole() och currentTenant()', () => {
  // Efter ersättningen ska det inte finnas några kvarvarande raka ROLE/TENANT-
  // identifierare (förutom i kommentarer, som vi kontrollerar separat).
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(codeOnly, /(?<!\w)ROLE(?!\w)/);
  assert.doesNotMatch(codeOnly, /(?<!\w)TENANT(?!\w)/);
  assert.match(source, /['"]x-cco-role['"]\s*:\s*currentRole\(\)/);
  assert.match(source, /['"]x-cco-tenant['"]\s*:\s*currentTenant\(\)/);
});

test('PR1385: activeCustomerId har ingen CUST-DEMO-002-fallback', () => {
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // Demo-fallbacken får inte längre returneras när inget id finns; att filtrera
  // bort det gamla värdet om det dyker upp är ok.
  assert.doesNotMatch(codeOnly, /\|\|\s*['"]CUST-DEMO-002['"]/);
  assert.match(compact(source), /function activeCustomerId\(\)\s*\{/);
  assert.match(compact(source), /return null;/);
});

test('PR1385: currentTenant faller tillbaka på hostname för prod, aldrig okänd tenant', () => {
  assert.match(source, /window\.location\?\.hostname/);
  assert.match(source, /['"]hair_tp['"]/);
  assert.doesNotMatch(source, /return\s+['"]hair_tp['"];\s*\/\/\s*default/);
});
